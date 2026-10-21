/* Backend y adaptador reales; solo las fronteras de Google están simuladas.
   No usa servicios, cuentas, documentos ni cuotas reales. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { makeEnv, ACC } from './gas_sim.mjs';

const adapter = fs.readFileSync(new URL('../backend/CloudOcrAdapter.gs', import.meta.url), 'utf8');
const COUNT = 'RINDE_FACIL_OCR_COUNT_2026-09-29';
const B64 = Buffer.from('documento ficticio').toString('base64');
const page = n => ({ context: { pageNumber: n }, fullTextAnnotation: { text: 'Página ' + n, pages: [] } });
const batch = (total, pages) => ({ responses: [{ totalPages: total, responses: pages.map(page) }] });
const response = (body, code = 200) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });

function env(props = {}) {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'p', ...props });
  e.ctx.ScriptApp = { getOAuthToken: () => 'oauth ficticio' };
  e.ctx.Utilities.sleep = () => {};
  vm.runInContext(adapter, e.ctx);
  return e;
}
const ocr = (e, mimeType = 'application/pdf') => e.call({ action: 'ocr', t: e.t, base64: B64, mimeType });

function clock(e) {
  let now = Date.now();
  e.ctx.Date = class extends Date { static now() { return now; } };
  return ms => { now += ms; };
}

test('una respuesta HTTP 200 sin responses no se cobra ni se confunde con una hoja en blanco', () => {
  for (const body of [{}, { responses: [] }]) {
    const e = env({ [COUNT]: '0' });
    e.ctx.UrlFetchApp = { fetch: () => response(body) };
    const r = ocr(e, 'image/jpeg');
    assert.equal(r.ok, false);
    assert.doesNotMatch(r.error, /SIN_TEXTO|no devolvió texto/);
    assert.equal(e.P.get(COUNT), '0');
  }
});

test('un lote sin respuestas de páginas no inventa páginas procesadas', () => {
  const e = env({ [COUNT]: '0' });
  let calls = 0;
  e.ctx.UrlFetchApp = { fetch: () => { calls++; return response({ responses: [{ totalPages: 3, responses: [] }] }); } };
  assert.equal(ocr(e).ok, false);
  assert.equal(e.P.get(COUNT), '0');
  assert.equal(calls, 1, 'un lote vacío debe detener el documento en el descubrimiento');
});

test('la cobertura verifica los números recibidos: duplicados, ajenos y ausentes no completan el PDF', () => {
  for (const received of [[2, 2], [1, 3], [2, undefined]]) {
    const e = env();
    let calls = 0;
    e.ctx.UrlFetchApp = { fetch: () => response(++calls === 1 ? batch(3, [1]) : batch(3, received)) };
    const r = ocr(e);
    assert.equal(r.ok, false, JSON.stringify(received));
    assert.notEqual(r.document_coverage, 'COMPLETE');
    assert.equal(r.raw_text, '');
    assert.equal(e.P.get(COUNT), '3', 'se cuentan las tres respuestas procesadas aunque la cobertura sea incorrecta');
  }
});

test('una anotación OCR completa sigue siendo válida aunque la página incluya otro error de Vision', () => {
  const e = env();
  const p = { ...page(1), error: { code: 13, message: 'otra anotación falló' } };
  e.ctx.UrlFetchApp = { fetch: () => response({ responses: [{ totalPages: 1, responses: [p] }] }) };
  const r = ocr(e);
  assert.equal(r.ok, true);
  assert.equal(r.raw_text, 'Página 1');
  assert.equal(e.P.get(COUNT), '1');
});

test('un fallo de página sin anotación OCR devuelve solo su reserva, conservando las páginas leídas', () => {
  const e = env();
  let calls = 0;
  e.ctx.UrlFetchApp = { fetch: () => response(++calls === 1 ? batch(3, [1]) : {
    responses: [{ totalPages: 3, responses: [page(2), { context: { pageNumber: 3 }, error: { message: 'no procesada' } }] }]
  }) };
  assert.equal(ocr(e).ok, false);
  assert.equal(e.P.get(COUNT), '2');
});

test('el presupuesto de tiempo detiene lotes nuevos y devuelve su reserva, sin perder lo ya leído', () => {
  const e = env();
  const advance = clock(e);
  const calls = [];
  e.ctx.UrlFetchApp = { fetch: (url, opts) => {
    const pages = JSON.parse(opts.payload).requests[0].pages;
    calls.push(pages);
    advance(140000);
    return response(batch(7, pages));
  } };
  const r = ocr(e);
  assert.equal(r.ok, false);
  assert.match(r.error, /OCR_TIEMPO_AGOTADO/);
  assert.deepEqual(calls, [[1], [2, 3, 4, 5, 6]]);
  assert.equal(e.P.get(COUNT), '6');
});

test('un reintento no duerme ni llama otra vez si ya agotó el presupuesto de tiempo', () => {
  const e = env({ [COUNT]: '0' });
  const advance = clock(e);
  let calls = 0, sleeps = 0;
  e.ctx.Utilities.sleep = () => { sleeps++; };
  e.ctx.UrlFetchApp = { fetch: () => {
    calls++; advance(280000);
    return response({ error: { message: 'ocupado' } }, 503);
  } };
  const r = ocr(e, 'image/jpeg');
  assert.equal(r.ok, false);
  assert.match(r.error, /OCR_TIEMPO_AGOTADO/);
  assert.equal(calls, 1);
  assert.equal(sleeps, 0);
  assert.equal(e.P.get(COUNT), '0');
});

test('la última respuesta correcta no se descarta si llega después del presupuesto de tiempo', () => {
  const e = env();
  const advance = clock(e);
  e.ctx.UrlFetchApp = { fetch: () => { advance(280000); return response(batch(1, [1])); } };
  assert.equal(ocr(e).ok, true);
  assert.equal(e.P.get(COUNT), '1');
});

test('el rechazo de la reserva restante conserva el límite semanal y el uso que necesita el cliente', () => {
  const e = env({ RINDE_FACIL_OCR_WEEKLY_LIMIT: '2' });
  e.ctx.UrlFetchApp = { fetch: () => response(batch(3, [1])) };
  const r = ocr(e);
  assert.equal(r.error, 'LIMITE_SEMANAL');
  assert.equal(r.limit, 2);
  assert.equal(r.used, 1);
  assert.equal(e.P.get(COUNT), '1');
});

test('un fallo al consultar el uso final no tapa una lectura correcta', () => {
  const e = env();
  const props = e.ctx.PropertiesService.getScriptProperties();
  let readFailed = false;
  e.ctx.PropertiesService.getScriptProperties = () => ({ ...props, getProperty: k => {
    if (k === COUNT && readFailed) throw new Error('propiedades temporalmente indisponibles');
    return props.getProperty(k);
  } });
  e.ctx.UrlFetchApp = { fetch: () => { readFailed = true; return response(batch(1, [1])); } };
  const r = ocr(e);
  assert.equal(r.ok, true);
  assert.equal(r.used_today, null, 'un uso desconocido no se presenta como cero');
  assert.equal(e.P.get(COUNT), '1');
});

test('una sesión revocada mientras espera el candado no puede reservar cuota ni lanzar OCR', () => {
  const e = env();
  e.ctx.LockService.getScriptLock = () => ({
    tryLock: () => { e.P.delete('RF_SESS_' + e.ctx.rfSessHash_(e.t)); return true; }, releaseLock() {}
  });
  let calls = 0;
  e.ctx.UrlFetchApp = { fetch: () => { calls++; return response(batch(1, [1])); } };
  assert.equal(ocr(e).error, 'SESION_INVALIDA');
  assert.equal(calls, 0);
  assert.equal(e.P.has(COUNT), false);
});

test('loadState lee contenido y revisión con el mismo candado que saveState', () => {
  const e = env();
  assert.equal(e.call({ action: 'saveState', t: e.t, state: { projects: [] } }).rev, 1);
  let held = false, reads = 0;
  e.ctx.LockService.getScriptLock = () => ({ tryLock: () => { held = true; return true; }, releaseLock: () => { held = false; } });
  const backup = e.rootHolder.folders[0].folders.find(f => f.name === 'Copias de seguridad');
  const file = backup.files[0], getBlob = file.getBlob;
  file.getBlob = () => { reads++; assert.equal(held, true, 'no se puede mezclar contenido antiguo con una revisión concurrente'); return getBlob(); };
  const r = e.call({ action: 'loadState', t: e.t });
  assert.equal(r.ok, true);
  assert.equal(r.rev, 1);
  assert.equal(reads, 1);
  assert.equal(held, false);
});

test('loadState revalida la sesión bajo el candado y no toca Drive si fue revocada', () => {
  const e = env();
  e.ctx.LockService.getScriptLock = () => ({
    tryLock: () => { e.P.delete('RF_SESS_' + e.ctx.rfSessHash_(e.t)); return true; }, releaseLock() {}
  });
  assert.equal(e.call({ action: 'loadState', t: e.t }).error, 'SESION_INVALIDA');
  assert.equal(e.rootHolder.folders.length, 0);
});

test('un fallo al podar respaldos no tapa el guardado ni deja la revisión antigua', () => {
  const e = env();
  const save = (name, baseRev) => e.call({ action: 'saveState', t: e.t, state: { projects: [{ name }] }, baseRev });
  assert.equal(save('A', 0).rev, 1);
  e.ctx.rfPrune_ = () => { throw new Error('Drive no dejó borrar el respaldo viejo'); };
  const r = save('B', 1);
  assert.equal(r.ok, true);
  assert.equal(r.rev, 2);
  const loaded = e.call({ action: 'loadState', t: e.t });
  assert.equal(JSON.parse(loaded.state).projects[0].name, 'B');
  assert.equal(loaded.rev, 2);
  assert.equal(save('C', 1).error, 'CONFLICTO');
});

test('el registro se acota por tamaño de propiedad y sigue admitiendo accesos con equipos de 60 caracteres', () => {
  const e = env();
  const props = e.ctx.PropertiesService.getScriptProperties();
  e.ctx.PropertiesService.getScriptProperties = () => ({ ...props, setProperty: (k, v) => {
    assert.ok(Buffer.byteLength(String(v)) <= 9 * 1024, 'Apps Script limita cada propiedad a 9 KB');
    return props.setProperty(k, v);
  } });
  for (let i = 0; i < 90; i++) {
    const r = e.call({ action: 'login', user: ACC.user, authKey: ACC.authKey, dev: 'a'.repeat(60) });
    assert.equal(r.ok, true, 'acceso ' + i);
  }
  const log = JSON.parse(e.P.get('RF_AUDIT'));
  assert.ok(log.length <= 80);
  assert.equal(log.at(-1).e, 'login');
});

test('un fallo del registro no oculta una recuperación ya aplicada ni pierde el token nuevo', () => {
  const e = env();
  const props = e.ctx.PropertiesService.getScriptProperties();
  e.ctx.PropertiesService.getScriptProperties = () => ({ ...props, setProperty: (k, v) => {
    if (k === 'RF_AUDIT') throw new Error('registro no disponible');
    return props.setProperty(k, v);
  } });
  const r = e.call({ action: 'resetPassword', user: ACC.user, authKeyR: ACC.authKeyR,
    saltP: ACC.saltP, authKey: ACC.authKey, recSalt: ACC.recSalt, authKeyR2: ACC.authKeyR });
  assert.equal(r.ok, true);
  assert.equal(e.ctx.rfSessionValid_(r.token), true);
  assert.equal(e.ctx.rfSessionValid_(e.t), false);
});

test('una sesión sin vencimiento numérico válido o que vence ahora no autoriza acciones', () => {
  const e = env();
  e.ctx.rfNow_ = () => 1000;
  const key = 'RF_SESS_' + e.ctx.rfSessHash_(e.t);
  for (const record of [{}, { exp: 'mañana' }, { exp: null }, { exp: 1000 }]) {
    e.P.set(key, JSON.stringify(record));
    assert.equal(e.call({ action: 'audit', t: e.t }).error, 'SESION_INVALIDA', JSON.stringify(record));
  }
});

test('la respuesta de archivo sin lista de páginas no se cobra como si fuera una página', () => {
  const e = env({ [COUNT]: '0' });
  e.ctx.UrlFetchApp = { fetch: () => response({ responses: [{ totalPages: 1 }] }) };
  const r = ocr(e);
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.error, /SIN_TEXTO|no devolvió texto/);
  assert.equal(e.P.get(COUNT), '0');
});

test('una imagen en blanco con respuesta válida conserva el cobro de una página', () => {
  const e = env();
  e.ctx.UrlFetchApp = { fetch: () => response({ responses: [{}] }) };
  const r = ocr(e, 'image/jpeg');
  assert.equal(r.ok, false);
  assert.match(r.error, /OCR_SIN_TEXTO/);
  assert.equal(e.P.get(COUNT), '1');
});

test('un error HTTP de Vision no expone texto como resultado OCR', () => {
  const e = env();
  const blob = e.ctx.Utilities.newBlob([1], 'application/pdf', 'falso.pdf');
  e.ctx.UrlFetchApp = { fetch: () => response(batch(1, [1]), 403) };
  const vision = e.ctx.callCloudVisionRequest_(blob, {}, [1]);
  assert.equal(vision.status, 'ERROR');
  assert.equal(vision.raw_text, '');
  assert.match(vision.error, /HTTP 403/);
});

test('un error HTTP de Document AI no expone texto como resultado OCR', () => {
  const e = env({ RINDE_FACIL_DOCUMENT_AI_PROCESSOR: 'projects/p/locations/us/processors/x' });
  const blob = e.ctx.Utilities.newBlob([1], 'application/pdf', 'falso.pdf');
  e.ctx.UrlFetchApp = { fetch: () => response({ document: { text: 'texto sin éxito HTTP', pages: [] } }, 403) };
  const docai = e.ctx.callDocumentAi_(blob);
  assert.equal(docai.status, 'ERROR');
  assert.equal(docai.raw_text, '');
  assert.match(docai.error, /HTTP 403/);
});

test('una entrada nula en un lote no pierde el cobro de las otras páginas confirmadas', () => {
  const e = env();
  let calls = 0;
  e.ctx.UrlFetchApp = { fetch: () => response(++calls === 1 ? batch(3, [1]) : {
    responses: [{ totalPages: 3, responses: [page(2), null] }]
  }) };
  const r = ocr(e);
  assert.equal(r.ok, false);
  assert.equal(e.P.get(COUNT), '2');
  assert.match(r.error, /respuesta.*inválida/);
});

test('force escrito como texto no permite pisar una revisión distinta', () => {
  const e = env();
  const save = extra => e.call({ action: 'saveState', t: e.t, state: { projects: [] }, ...extra });
  assert.equal(save({ baseRev: 0 }).rev, 1);
  for (const force of ['false', 'true', 1]) {
    assert.equal(save({ baseRev: 0, force }).error, 'CONFLICTO', String(force));
  }
  assert.equal(save({ baseRev: 0, force: true }).rev, 2, 'la opción booleana explícita conserva su contrato');
});

test('un límite diario no finito no desactiva el valor predeterminado de 100 páginas', () => {
  const e = env({ RINDE_FACIL_OCR_DAILY_LIMIT: 'Infinity', [COUNT]: '100' });
  let calls = 0;
  e.ctx.UrlFetchApp = { fetch: () => { calls++; return response(batch(1, [1])); } };
  const r = ocr(e);
  assert.equal(r.error, 'LIMITE_DIARIO');
  assert.equal(r.limit, 100);
  assert.equal(calls, 0);
});
