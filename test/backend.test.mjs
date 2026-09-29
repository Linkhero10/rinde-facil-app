/* Prueba la lógica de backend/WebApi.gs con Apps Script simulado (no llama a Google). */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', 'backend', 'WebApi.gs'), 'utf8');

function makeEnv(props = {}, visionResult) {
  const P = new Map(Object.entries(props));
  let idSeq = 0;
  function makeFile(name, content, mime) {
    let data = content, trashed = false, desc = '';
    const f = { id: 'f' + (++idSeq), getName: () => name, getId: () => f.id, getBlob: () => ({ getDataAsString: () => (typeof data === 'string' ? data : Buffer.from(data).toString()) }), setContent: c => { data = c; }, setDescription: d => { desc = d; }, getDescription: () => desc, setTrashed: t => { trashed = t; f._trashed = t; }, _trashed: false };
    return f;
  }
  function makeFolder(name) {
    const files = [], folders = [];
    const it = arr => { let i = 0; return { hasNext: () => { while (i < arr.length && arr[i]._trashed) i++; return i < arr.length; }, next: () => arr[i++] }; };
    const fo = { name, id: 'd' + (++idSeq), files, folders,
      getFoldersByName: n => it(folders.filter(x => x.name === n)), createFolder: n => { const x = makeFolder(n); folders.push(x); return x; },
      getFilesByName: n => it(files.filter(x => x.getName() === n)), getFiles: () => it(files),
      createFile: (a, b, c) => { const f = typeof a === 'string' ? makeFile(a, b, c) : makeFile(a.name, a.bytes, a.mime); files.push(f); return f; } };
    return fo;
  }
  const rootHolder = makeFolder('MyDrive');
  const ctx = {
    console, JSON, Math, Date, Number, String, Array, Buffer,
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (P.has(k) ? P.get(k) : null), setProperty: (k, v) => P.set(k, String(v)) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() { } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      base64Decode: b => Array.from(Buffer.from(b, 'base64')),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name, getBytes: () => bytes, getContentType: () => mime }),
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s).digest()).map(x => (x > 127 ? x - 256 : x)),
      formatDate: (d, tz, pat) => (pat === 'yyyyMMdd-HHmmss' ? '20260929-101500' : '2026-09-29')
    },
    DriveApp: { getFolderById: id => rootHolder.folders.find(f => f.id === id) || makeFolder('byid'), getFoldersByName: n => rootHolder.getFoldersByName(n), createFolder: n => rootHolder.createFolder(n) },
    callCloudVision_: (blob, meta) => { ctx.__vision.push({ mime: blob.mime, name: meta.file_name, n: blob.bytes.length }); return visionResult || { status: 'SUCCESS', raw_text: 'TOTAL $7.500', confidence: 0.98, duration_ms: 12, page_count: 1, document_coverage: 'COMPLETE' }; },
    __vision: []
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, P, rootHolder, call: (payload, raw) => JSON.parse(ctx.doPost({ postData: { contents: raw !== undefined ? raw : JSON.stringify(payload) } }).content) };
}
const B64 = Buffer.from('imagen-de-prueba').toString('base64');

test('sin clave configurada, el servicio no atiende a nadie', () => {
  const e = makeEnv({});
  assert.equal(e.call({ action: 'ping', key: '' }).error, 'CLAVE_INVALIDA');
  assert.equal(e.call({ action: 'ping', key: 'cualquiera' }).error, 'CLAVE_INVALIDA');
});
test('clave incorrecta se rechaza y la correcta funciona', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'secreta', RINDE_FACIL_GCP_PROJECT_ID: 'proy' });
  assert.equal(e.call({ action: 'ping', key: 'secret' }).error, 'CLAVE_INVALIDA');
  assert.equal(e.call({ action: 'ping', key: 'secretaX' }).error, 'CLAVE_INVALIDA');
  const r = e.call({ action: 'ping', key: 'secreta' });
  assert.equal(r.ok, true); assert.equal(r.ocr, true);
});
test('entradas malas no rompen el servicio', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  assert.equal(e.call(null, '').error, 'SIN_DATOS');
  assert.equal(e.call(null, '{no es json').error, 'JSON_INVALIDO');
  assert.equal(e.call(null, '"texto"').error, 'JSON_INVALIDO');
  assert.equal(e.call({ action: 'rm -rf', key: 'k' }).error, 'ACCION_DESCONOCIDA');
  const out = JSON.parse(e.ctx.doGet().content); assert.equal(out.ok, true); assert.ok(!('state' in out));
});
test('ocr: valida tipo y tamaño, lee, cuenta y respeta el límite diario', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy', RINDE_FACIL_OCR_DAILY_LIMIT: '2' });
  assert.equal(e.call({ action: 'ocr', key: 'k', mimeType: 'application/x-msdownload', base64: B64 }).error, 'TIPO_NO_PERMITIDO');
  assert.equal(e.call({ action: 'ocr', key: 'k', mimeType: 'image/jpeg', base64: '***' }).error, 'BASE64_INVALIDO');
  assert.equal(e.ctx.__vision.length, 0, 'las entradas inválidas no llegan a Vision');
  const a = e.call({ action: 'ocr', key: 'k', mimeType: 'image/jpeg', base64: B64, fileName: 'boleta.jpg' });
  assert.equal(a.ok, true); assert.equal(a.raw_text, 'TOTAL $7.500'); assert.equal(a.engine, 'cloud_vision'); assert.equal(a.used_today, 1);
  assert.equal(e.call({ action: 'ocr', key: 'k', mimeType: 'application/pdf', base64: B64 }).ok, true);
  const c = e.call({ action: 'ocr', key: 'k', mimeType: 'image/png', base64: B64 });
  assert.equal(c.error, 'LIMITE_DIARIO'); assert.equal(c.limit, 2);
  assert.equal(e.ctx.__vision.length, 2);
  const big = Buffer.alloc(9 * 1024 * 1024).toString('base64');
  const e2 = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy' });
  assert.equal(e2.call({ action: 'ocr', key: 'k', mimeType: 'image/jpeg', base64: big }).error, 'ARCHIVO_MUY_GRANDE');
});
test('ocr: si Vision falla devuelve el error sin texto; sin proyecto, avisa', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy' }, { status: 'ERROR', raw_text: '', error: 'PERMISSION_DENIED' });
  const r = e.call({ action: 'ocr', key: 'k', mimeType: 'image/jpeg', base64: B64 });
  assert.equal(r.ok, false); assert.equal(r.raw_text, ''); assert.equal(r.error, 'PERMISSION_DENIED');
  const n = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  assert.equal(n.call({ action: 'ocr', key: 'k', mimeType: 'image/jpeg', base64: B64 }).error, 'OCR_NO_CONFIGURADO');
});
test('copia de datos: guarda, conserva respaldos, trae la última y rechaza basura', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  assert.equal(e.call({ action: 'loadState', key: 'k' }).error, 'SIN_COPIA');
  assert.equal(e.call({ action: 'saveState', key: 'k', state: '{"x":1}' }).error, 'ESTADO_INVALIDO');
  assert.equal(e.call({ action: 'saveState', key: 'k', state: 'no json' }).error, 'ESTADO_INVALIDO');
  const s1 = JSON.stringify({ v: 2, projects: [{ name: 'A' }] }), s2 = JSON.stringify({ v: 2, projects: [{ name: 'B' }] });
  assert.equal(e.call({ action: 'saveState', key: 'k', state: s1 }).ok, true);
  assert.equal(e.call({ action: 'saveState', key: 'k', state: s2 }).ok, true);
  assert.equal(JSON.parse(e.call({ action: 'loadState', key: 'k' }).state).projects[0].name, 'B');
  const copias = e.rootHolder.folders[0].folders.find(f => f.name === 'copias');
  assert.ok(copias.files.some(f => /^estado-\d{8}-\d{6}\.json$/.test(f.getName())), 'queda un respaldo de la versión anterior');
});
test('archivar comprobante: carpeta por mes e idempotente', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  const payload = { action: 'saveFile', key: 'k', mimeType: 'image/jpeg', base64: B64, fileName: 'a/b:c.jpg', issueDate: '2026-08-14' };
  const a = e.call(payload); assert.equal(a.ok, true); assert.equal(a.folder, '2026-08'); assert.equal(a.idempotent, false);
  const b = e.call(payload); assert.equal(b.idempotent, true); assert.equal(b.fileId, a.fileId);
  assert.equal(e.call(Object.assign({}, payload, { issueDate: '2026-13-01' })).error, 'FECHA_INVALIDA');
  const dir = e.rootHolder.folders[0].folders.find(f => f.name === 'comprobantes').folders.find(f => f.name === '2026-08');
  assert.equal(dir.files.length, 1); assert.ok(!/[\\/:]/.test(dir.files[0].getName()), 'nombre sin caracteres peligrosos');
});
