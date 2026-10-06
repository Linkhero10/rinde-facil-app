/* Pruebas locales de integridad del comprobante y de la cola offline cifrada. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fakeIndexedDB(shouldFail) {
  const data = new Map();
  const db = {
    objectStoreNames: { contains: name => data.has(name) },
    createObjectStore(name) { data.set(name, new Map()); },
    transaction(name) {
      const tx = { oncomplete: null, onerror: null, error: null };
      const rows = data.get(name);
      function request(operation, run) {
        const req = {};
        queueMicrotask(() => {
          try {
            if (shouldFail(name, operation)) throw new Error('fallo IndexedDB: ' + operation);
            req.result = run();
            if (req.onsuccess) req.onsuccess();
            if (tx.oncomplete) tx.oncomplete();
          } catch (error) {
            tx.error = error;
            if (req.onerror) req.onerror();
            if (tx.onerror) tx.onerror();
          }
        });
        return req;
      }
      tx.objectStore = () => ({
        put(value, key) { return request('put', () => { rows.set(key, value); return key; }); },
        get(key) { return request('get', () => rows.get(key)); },
        getAll() { return request('getAll', () => Array.from(rows.values())); },
        getAllKeys() { return request('getAllKeys', () => Array.from(rows.keys())); },
        count() { return request('count', () => rows.size); },
        delete(key) { return request('delete', () => rows.delete(key)); },
        clear() { return request('clear', () => rows.clear()); }
      });
      return tx;
    }
  };
  return {
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = db;
        if (req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    }
  };
}

function fixture() {
  const RF = loadApp();
  const ctx = loadApp.lastCtx;
  let failMode = null;
  let failOccurrence = 1, matched = 0;
  ctx.indexedDB = fakeIndexedDB((store, operation) => {
    if (failMode !== store + ':' + operation) return false;
    matched++;
    return matched === failOccurrence;
  });
  ctx.navigator = { onLine: true };
  RF.vault = {
    isOpen: () => true,
    encryptBlob: blob => Promise.resolve(blob),
    decryptBlob: blob => Promise.resolve(blob)
  };
  const state = {
    community: { name: 'Comunidad de prueba' },
    cloud: { apiUrl: 'https://example.test/exec', rev: 0, saves: [] },
    projects: [{ id: 'p1', name: 'Proyecto de prueba', expenses: [] }]
  };
  RF.store = {
    get: () => state,
    project: () => state.projects[0],
    update(fn) { fn(state); },
    exportJSON: () => JSON.stringify(state)
  };
  RF.auth = { phase: () => 'open' };
  RF.ui = { toast() {} };
  RF.cloud.configured = () => true;
  RF.cloud.blobToBase64 = blob => blob.text().then(text => Buffer.from(text).toString('base64'));

  for (const file of ['34-tools-gastos.js', '36-drive.js', '37-repo.js']) {
    vm.runInContext(fs.readFileSync(path.join(appDir, 'js', file), 'utf8'), ctx, { filename: file });
  }
  return {
    RF, ctx, state,
    fail(store, operation, occurrence = 1) { failMode = store + ':' + operation; failOccurrence = occurrence; matched = 0; },
    clearFailure() { failMode = null; matched = 0; }
  };
}

test('fallar al guardar la foto impide que el gasto se agregue', async () => {
  const f = fixture();
  const project = { expenses: [] };
  f.fail('imgs', 'put');
  await assert.rejects(
    f.RF.rendicion.addExpenseWithReceipt(project, new Blob(['foto'], { type: 'image/jpeg' })),
    /fallo IndexedDB: put/
  );
  assert.deepEqual(project.expenses, [], 'no debe existir un gasto huérfano sin su comprobante local');
});

test('un error al leer el blob no se disfraza de comprobante ausente', async () => {
  const f = fixture();
  f.fail('imgs', 'get');
  await assert.rejects(f.RF.blobs.get('foto'), /fallo IndexedDB: get/);
});

test('el repositorio no sube solo la ficha si el registro declara un archivo original', async () => {
  const f = fixture();
  const calls = [];
  f.RF.cloud.post = action => { calls.push(action); return Promise.resolve({ ok: true, fileId: 'drive-ficha' }); };
  await assert.rejects(
    f.RF.drive.saveExternal({ id: 'doc1', type: 'otro', title: 'Acta', date: '2026-10-04', fileName: 'acta.pdf', blobId: 'blob-perdido' }, null),
    /ARCHIVO_LOCAL_NO_DISPONIBLE/
  );
  assert.deepEqual(calls, [], 'no se debe presentar la ficha como si el archivo original también se hubiera subido');
});

test('el archivo remoto y la ficha en cola se informan como guardado parcial', async () => {
  const f = fixture();
  let saves = 0;
  f.RF.cloud.post = () => {
    if (++saves === 1) return Promise.resolve({ ok: true, fileId: 'drive-file', url: 'https://drive.test/file' });
    return Promise.reject(new Error('Failed to fetch'));
  };
  const result = await f.RF.drive.saveExternal({ id: 'doc1', type: 'otro', title: 'Acta', date: '2026-10-04', fileName: 'acta.pdf' }, new Blob(['original'], { type: 'application/pdf' }));
  assert.equal(result.status, 'partial');
  assert.equal(result.remote, false);
  assert.equal(result.parts.file.remote, true);
  assert.equal(result.parts.ficha.queued, true);
});

test('la ficha remota no convierte un archivo original en cola en un guardado completo', async () => {
  const f = fixture();
  let saves = 0;
  f.RF.cloud.post = () => {
    if (++saves === 1) return Promise.reject(new Error('Failed to fetch'));
    return Promise.resolve({ ok: true, fileId: 'drive-ficha', url: 'https://drive.test/ficha' });
  };
  const result = await f.RF.drive.saveExternal({ id: 'doc2', type: 'otro', title: 'Acta', date: '2026-10-04', fileName: 'acta.pdf' }, new Blob(['original'], { type: 'application/pdf' }));
  assert.equal(result.status, 'partial');
  assert.equal(result.remote, false);
  assert.equal(result.parts.file.queued, true);
  assert.equal(result.parts.ficha.remote, true);
});

test('la cola comunica los fallos de lectura en vez de devolver lista o conteo vacíos', async () => {
  let f = fixture();
  f.fail('outbox', 'getAll');
  await assert.rejects(f.RF.outbox.list(), /fallo IndexedDB: getAll/);

  f = fixture();
  f.fail('outbox', 'count');
  await assert.rejects(f.RF.outbox.count(), /fallo IndexedDB: count/);

  f = fixture();
  f.fail('outbox', 'getAll');
  const flush = await f.RF.drive.flushOutbox();
  assert.equal(flush.ok, false);
  assert.equal(flush.left, null, 'un fallo de consulta nunca debe interpretarse como una cola vacía');

  f = fixture();
  f.fail('outbox', 'getAll', 2);
  const finalReadFail = await f.RF.drive.flushOutbox();
  assert.equal(finalReadFail.ok, false, 'también falla de forma explícita la lectura de reconciliación final');
  f.clearFailure();
  const retryFlush = await f.RF.drive.flushOutbox();
  assert.equal(retryFlush.ok, true, 'el fallo no deja la cola de sincronización atascada');
});

test('dos comprobantes distintos del mismo tamaño ocupan registros distintos de la cola', async () => {
  const f = fixture();
  f.RF.cloud.post = () => Promise.reject(new Error('Failed to fetch'));
  const project = { name: 'Proyecto de prueba' };
  const a = { id: 'g1', imgId: 'a', proveedor: 'Almacén', folio: '123', fecha: '2026-10-04' };
  const b = { ...a, id: 'g2', imgId: 'b' };
  await f.RF.blobs.put('a', new Blob(['AAAA'], { type: 'image/jpeg' }));
  await f.RF.blobs.put('b', new Blob(['BBBB'], { type: 'image/jpeg' }));
  await f.RF.drive.saveReceipt(a, project);
  await f.RF.drive.saveReceipt(b, project);
  assert.equal(await f.RF.outbox.count(), 2);
});

test('un archivo pendiente no se envía a un Apps Script distinto del destino original', async () => {
  const f = fixture();
  f.state.cloud.apiUrl = 'https://script.google.com/macros/s/community-a/exec';
  await f.RF.outbox.add('mismo-documento', 'respaldo', { fileName: 'respaldo.pdf', base64: 'AQID' }, { action: 'saveFile', serviceUrl: f.state.cloud.apiUrl });
  f.state.cloud.apiUrl = 'https://script.google.com/macros/s/community-b/exec';
  const calls = [];
  f.RF.cloud.post = action => { calls.push(action); return Promise.resolve({ ok: true, fileId: 'wrong-drive' }); };

  const result = await f.RF.drive.flushOutbox();
  const [record] = await f.RF.outbox.list();
  assert.deepEqual(calls, [], 'no se debe enviar a la cuenta nueva por una reconfiguración accidental');
  assert.equal(result.needsAttention, 1);
  assert.equal(record.status, 'needs_attention');
  assert.equal(record.errorCode, 'SERVICIO_CAMBIO');
});

test('una entrada heredada sin destino verificable no se envía', async () => {
  const f = fixture();
  await f.RF.outbox.add('documento-antiguo', 'respaldo', { fileName: 'respaldo.pdf', base64: 'AQID' }, { action: 'saveFile' });
  const calls = [];
  f.RF.cloud.post = action => { calls.push(action); return Promise.resolve({ ok: true, fileId: 'unknown-drive' }); };

  const result = await f.RF.drive.flushOutbox();
  const [record] = await f.RF.outbox.list();
  assert.deepEqual(calls, [], 'sin destino histórico no se debe adivinar a qué comunidad enviarlo');
  assert.equal(result.needsAttention, 1);
  assert.equal(record.status, 'needs_attention');
  assert.equal(record.errorCode, 'ORIGEN_NO_VERIFICADO');
});

test('las copias pendientes de dos servicios distintos no se reemplazan entre sí', async () => {
  const f = fixture();
  f.RF.cloud.post = () => Promise.reject(new Error('Failed to fetch'));
  f.state.cloud.apiUrl = 'https://script.google.com/macros/s/community-a/exec';
  await f.RF.drive.backupState();
  f.state.cloud.apiUrl = 'https://script.google.com/macros/s/community-b/exec';
  await f.RF.drive.backupState();
  assert.equal(await f.RF.outbox.count(), 2);
});

test('un rechazo persistente del servicio conserva el documento y queda marcado para revisión', async () => {
  const f = fixture();
  await f.RF.outbox.add('documento', 'respaldo', { fileName: 'respaldo.pdf', base64: 'AQID' }, { action: 'saveFile' });
  let [record] = await f.RF.outbox.list();
  for (let i = 0; i < 5; i++) {
    await f.RF.outbox.bump(record);
    [record] = await f.RF.outbox.list();
  }
  f.RF.cloud.post = () => Promise.resolve({ ok: false, error: 'TIPO_NO_PERMITIDO' });
  const result = await f.RF.drive.flushOutbox();
  const remaining = await f.RF.outbox.list();
  assert.equal(remaining.length, 1, 'el rechazo no debe borrar el archivo');
  assert.equal(remaining[0].status, 'needs_attention');
  assert.equal(result.ok, true, 'la cola se pudo consultar y el resultado es conocido');
  assert.equal(result.needsAttention, 1);
  assert.equal(await f.RF.outbox.retryAll(), 1, 'la acción explícita permite volver a intentar sin descartar el elemento');
  const retried = await f.RF.outbox.list();
  assert.equal(retried[0].status, 'pending');
  assert.equal(retried[0].tries, 0);
});

test('la copia offline entra a la cola y se reconcilia como saveState al volver la conexión', async () => {
  const f = fixture();
  f.RF.cloud.post = () => Promise.reject(new Error('Failed to fetch'));
  const queued = await f.RF.drive.backupState();
  assert.equal(queued.queued, true);
  assert.equal(queued.remote, false);
  assert.equal(await f.RF.outbox.count(), 1);

  f.state.community.name = 'Comunidad actualizada mientras estaba sin conexión';
  await f.RF.drive.backupState();
  assert.equal(await f.RF.outbox.count(), 1, 'la copia pendiente se reemplaza por la versión más reciente, no se apilan snapshots viejos');
  const calls = [];
  f.RF.cloud.post = (action, payload) => {
    calls.push({ action, payload });
    return Promise.resolve({ ok: true, rev: 7 });
  };
  const flushed = await f.RF.drive.flushOutbox();
  assert.equal(calls[0].action, 'saveState');
  assert.match(calls[0].payload.state, /Comunidad actualizada mientras estaba sin conexión/);
  assert.equal(calls[0].payload.baseRev, 0);
  assert.equal(flushed.sent, 1);
  assert.equal(await f.RF.outbox.count(), 0);
  assert.equal(f.state.cloud.rev, 7);
});

test('archivar un gasto espera por foto, ficha y copia; si todo queda offline informa estado pendiente', async () => {
  const f = fixture();
  f.RF.cloud.post = () => Promise.reject(new Error('Failed to fetch'));
  const expense = { id: 'g-offline', imgId: 'foto-offline', docType: 'boleta', fecha: '2026-10-04', proveedor: 'Alvi', folio: '100', total: '5040', montoRendir: '5040', formaPago: 'debito', verified: true, has: {} };
  await f.RF.blobs.put(expense.imgId, new Blob(['comprobante'], { type: 'image/jpeg' }));
  const result = await f.RF.drive.archiveExpense(expense, f.state.projects[0], f.state.community);
  assert.equal(result.status, 'queued');
  assert.equal(result.remote, false);
  assert.equal(result.queued, true);
  assert.equal(result.parts.receipt.queued, true);
  assert.equal(result.parts.ficha.queued, true);
  assert.equal(result.parts.backup.queued, true);
  assert.equal(await f.RF.outbox.count(), 3);
  assert.equal(expense.driveId, undefined, 'un documento pendiente no recibe referencia Drive');
  assert.equal(expense.driveFichaAt, undefined, 'la ficha pendiente no se marca como subida');
});

test('si solo foto queda remota, archiveExpense informa resultado parcial cuando ficha y copia siguen en cola', async () => {
  const f = fixture();
  let fileSaves = 0;
  f.RF.cloud.post = action => {
    if (action === 'saveFile' && ++fileSaves === 1) return Promise.resolve({ ok: true, fileId: 'drive-photo', url: 'https://drive.test/photo' });
    return Promise.reject(new Error('Failed to fetch'));
  };
  const expense = { id: 'g-partial', imgId: 'foto-partial', docType: 'boleta', fecha: '2026-10-04', proveedor: 'Alvi', folio: '101', total: '5040', montoRendir: '5040', formaPago: 'debito', verified: true, has: {} };
  await f.RF.blobs.put(expense.imgId, new Blob(['comprobante'], { type: 'image/jpeg' }));
  const result = await f.RF.drive.archiveExpense(expense, f.state.projects[0], f.state.community);
  assert.equal(result.status, 'partial');
  assert.equal(result.remote, false);
  assert.equal(result.parts.receipt.remote, true);
  assert.equal(result.parts.ficha.queued, true);
  assert.equal(result.parts.backup.queued, true);
  assert.equal(expense.driveId, 'drive-photo');
  assert.equal(expense.driveFichaAt, undefined);
});

test('archivar una foto y ficha no informa que todo quedó guardado si no hubo copia remota', async () => {
  const f = fixture();
  f.RF.cloud.configured = () => Boolean(f.state.cloud.apiUrl);
  await f.RF.blobs.put('foto', new Blob(['imagen'], { type: 'image/jpeg' }));
  let saves = 0;
  f.RF.cloud.post = action => {
    if (action === 'saveFile' && ++saves === 2) f.state.cloud.apiUrl = '';
    return Promise.resolve({ ok: true, fileId: 'drive-' + saves, url: 'https://drive.test/' + saves });
  };

  const result = await f.RF.drive.archiveExpense({ id: 'e1', imgId: 'foto', proveedor: 'Tienda', folio: '1', fecha: '2026-10-04' }, { name: 'Proyecto' });
  assert.equal(result.status, 'partial');
  assert.equal(result.ok, false);
  assert.equal(result.parts.receipt.remote, true);
  assert.equal(result.parts.ficha.remote, true);
  assert.equal(result.parts.backup.remote, false);
});

test('el archivo en cola no se presenta como respaldo remoto en el repositorio', () => {
  const f = fixture();
  const rec = {};
  assert.equal(f.RF.repo.attachDriveResult(rec, { ok: false, queued: true, remote: false }), false);
  assert.equal(rec.drive, undefined);
  assert.equal(f.RF.repo.attachDriveResult(rec, { ok: true, remote: true, fileId: 'drive-1', url: 'https://drive.test/1' }), true);
  assert.equal(rec.drive.fileId, 'drive-1');
});
