/* D1-D6: backend y adaptador reales, con servicios de Google simulados.
   No prueba un despliegue, ni usa documentos o cuotas reales. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { makeEnv, ACC, b64of } from './gas_sim.mjs';

const adapter = fs.readFileSync(new URL('../backend/CloudOcrAdapter.gs', import.meta.url), 'utf8');
const web = fs.readFileSync(new URL('../backend/WebApi.gs', import.meta.url), 'utf8');
const TODAY = '2026-09-29';
const COUNT = 'RINDE_FACIL_OCR_COUNT_' + TODAY;
const PREFIX = 'RF_OCR_PEND_';
const BYTES = Buffer.from([0, 127, 128, 255, 10]);
const B64 = BYTES.toString('base64');
const HASH = crypto.createHash('sha256').update(BYTES).digest('hex');
const pending = e => [...e.P].filter(([k]) => k.startsWith(PREFIX)).map(([k, v]) => [k, JSON.parse(v)]);
const ocr = (e, extra = {}) => e.call({ action: 'ocr', t: e.t, mimeType: 'application/pdf', base64: B64, ...extra });
const quota = e => e.call({ action: 'cuota', t: e.t });
function env(props = {}, realAdapter = true) {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'p', ...props });
  if (realAdapter) {
    e.ctx.ScriptApp = { getOAuthToken: () => 'oauth simulado' };
    e.ctx.Utilities.sleep = () => {};
    vm.runInContext(adapter, e.ctx);
  }
  return e;
}
const page = n => ({ context: { pageNumber: n }, fullTextAnnotation: { text: 'Página ' + n, pages: [] } });
const batch = (total, pages) => ({ responses: [{ totalPages: total, responses: pages.map(page) }] });
const response = (body, code = 200) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
function seed(e, { age = 0, devolver = 0, reservadas = 1, fecha = TODAY, hash = HASH } = {}) {
  const key = PREFIX + crypto.randomUUID();
  e.P.set(key, JSON.stringify({ fecha, reservadas, t: Date.now() - age, hash, devolver }));
  return key;
}

test('D1: cada reserva queda registrada con fecha, páginas, tiempo y SHA-256 de bytes; al completar se elimina', () => {
  const e = env();
  const ids = new Set();
  let calls = 0;
  e.ctx.UrlFetchApp = { fetch: () => {
    calls++;
    const records = pending(e);
    assert.equal(records.length, calls);
    assert.deepEqual(records.map(([, r]) => r.reservadas).sort(), calls === 1 ? [1] : [1, 2]);
    for (const [k, r] of records) {
      ids.add(k);
      assert.equal(r.fecha, TODAY);
      assert.equal(r.hash, HASH);
      assert.equal(r.devolver, 0);
      assert.ok(Number.isFinite(r.t) && Math.abs(Date.now() - r.t) < 10000);
    }
    return response(batch(3, calls === 1 ? [1] : [2, 3]));
  } };
  assert.equal(ocr(e).ok, true);
  assert.equal(ids.size, 2);
  assert.equal(e.P.get(COUNT), '3');
  assert.deepEqual(pending(e), []);
});

for (const trigger of ['cuota', 'ocr']) {
  test(`D1: devolución con candado ocupado queda pendiente y la siguiente acción ${trigger} la concilia una sola vez`, () => {
    const e = env();
    let occupied = false, calls = 0;
    e.ctx.LockService.getScriptLock = () => ({ tryLock: () => !occupied, releaseLock() {} });
    e.ctx.UrlFetchApp = { fetch: () => {
      calls++;
      if (calls === 1) return response(batch(3, [1]));
      occupied = true;
      return response({ error: { message: 'rechazado' } }, 400);
    } };
    assert.equal(ocr(e).ok, false);
    assert.equal(e.P.get(COUNT), '3');
    const records = pending(e);
    assert.equal(records.length, 1);
    assert.equal(records[0][1].reservadas, 2);
    assert.equal(records[0][1].devolver, 2);
    occupied = false;
    if (trigger === 'cuota') {
      assert.equal(quota(e).diario.usadas, 1);
    } else {
      e.ctx.UrlFetchApp.fetch = () => { calls++; return response(batch(1, [1])); };
      assert.equal(ocr(e).ok, true, 'conciliar permite repetir el mismo archivo terminado');
      assert.equal(e.P.get(COUNT), '2');
    }
    assert.deepEqual(pending(e), []);
    const count = e.P.get(COUNT);
    quota(e); quota(e);
    assert.equal(e.P.get(COUNT), count, 'no hay devolución doble');
  });
}

test('D1: una excepción al devolver conserva la deuda para reintentar', () => {
  const e = env();
  let failRefund = false;
  const props = e.ctx.PropertiesService.getScriptProperties();
  e.ctx.PropertiesService.getScriptProperties = () => ({ ...props, setProperty(k, v) {
    if (k === COUNT && failRefund) throw new Error('no se pudo escribir contador');
    return props.setProperty(k, v);
  } });
  e.ctx.UrlFetchApp = { fetch: () => {
    failRefund = true;
    return response({ error: { message: 'rechazado' } }, 400);
  } };
  assert.equal(ocr(e).ok, false);
  assert.equal(pending(e)[0][1].devolver, 1);
  assert.equal(e.P.get(COUNT), '1');
  failRefund = false;
  assert.equal(quota(e).diario.usadas, 0);
  assert.deepEqual(pending(e), []);
});

test('D1: entradas de más de diez minutos sin devolución se eliminan sin reembolso; las recientes se conservan', () => {
  const e = env({ [COUNT]: '8' });
  const old = seed(e, { age: 600001, reservadas: 5 });
  const recent = seed(e, { age: 9 * 60000, reservadas: 3 });
  assert.equal(quota(e).diario.usadas, 8);
  assert.equal(e.P.has(old), false);
  assert.equal(e.P.has(recent), true);
});

test('D1: una devolución antigua se aplica a su fecha original y no al contador de hoy', () => {
  const previous = 'RINDE_FACIL_OCR_COUNT_2026-09-28';
  const e = env({ [COUNT]: '4', [previous]: '7' });
  seed(e, { age: 700000, fecha: '2026-09-28', reservadas: 3, devolver: 2 });
  assert.equal(quota(e).diario.usadas, 4);
  assert.equal(e.P.get(previous), '5');
  assert.deepEqual(pending(e), []);
});

test('D1: si falla borrar una deuda, el contador no cambia y el siguiente intento devuelve una sola vez', () => {
  const e = env({ [COUNT]: '5' });
  const key = seed(e, { reservadas: 3, devolver: 2 });
  let failDelete = true;
  const props = e.ctx.PropertiesService.getScriptProperties();
  e.ctx.PropertiesService.getScriptProperties = () => ({ ...props, deleteProperty(k) {
    if (k === key && failDelete) throw new Error('no se pudo borrar pendiente');
    return props.deleteProperty(k);
  } });
  assert.equal(quota(e).diario.usadas, 5);
  assert.equal(pending(e)[0][1].devolver, 2);
  failDelete = false;
  assert.equal(quota(e).diario.usadas, 3);
  assert.equal(quota(e).diario.usadas, 3);
  assert.deepEqual(pending(e), []);
});

test('D1: si no se puede persistir el registro de una reserva, no se cobra ni se llama a Vision', () => {
  const e = env();
  const props = e.ctx.PropertiesService.getScriptProperties();
  e.ctx.PropertiesService.getScriptProperties = () => ({ ...props, setProperty(k, v) {
    if (k.startsWith(PREFIX)) throw new Error('registro no disponible');
    return props.setProperty(k, v);
  } });
  let calls = 0;
  e.ctx.UrlFetchApp = { fetch: () => { calls++; return response(batch(1, [1])); } };
  assert.equal(ocr(e).error, 'ERROR_INTERNO');
  assert.equal(e.P.has(COUNT), false);
  assert.equal(calls, 0);
});

test('D2: dos peticiones simultáneas del mismo archivo no reservan ni llaman a Vision dos veces', () => {
  const e = env();
  let calls = 0;
  e.ctx.UrlFetchApp = { fetch: () => {
    calls++;
    const before = e.P.get(COUNT);
    assert.deepEqual(ocr(e, { fileName: 'otro nombre.pdf' }), { ok: false, error: 'OCR_EN_CURSO' });
    assert.equal(e.P.get(COUNT), before);
    return response(batch(1, [1]));
  } };
  assert.equal(ocr(e).ok, true);
  assert.equal(calls, 1);
  assert.equal(e.P.get(COUNT), '1');
});

test('D2: se comprueba el duplicado dentro del candado, incluso si apareció mientras se esperaba', () => {
  const e = env();
  let injected = false;
  e.ctx.LockService.getScriptLock = () => ({ tryLock() {
    if (!injected) { injected = true; seed(e); }
    return true;
  }, releaseLock() {} });
  let calls = 0;
  e.ctx.UrlFetchApp = { fetch: () => { calls++; return response(batch(1, [1])); } };
  assert.equal(ocr(e).error, 'OCR_EN_CURSO');
  assert.equal(calls, 0);
  assert.equal(e.P.has(COUNT), false);
});

test('D2: una entrada de seis minutos ya no bloquea el mismo hash; otro hash reciente tampoco', () => {
  const e = env();
  seed(e, { age: 360001 });
  seed(e, { hash: '0'.repeat(64) });
  e.ctx.UrlFetchApp = { fetch: () => response(batch(1, [1])) };
  assert.equal(ocr(e).ok, true);
  assert.equal(e.P.get(COUNT), '1');
});

test('D2: un fallo del servicio al leer pendientes no permite saltar la protección de duplicados', () => {
  const e = env();
  const key = seed(e);
  const props = e.ctx.PropertiesService.getScriptProperties();
  e.ctx.PropertiesService.getScriptProperties = () => ({ ...props, getProperty(k) {
    if (k === key) throw new Error('lectura de propiedades falló');
    return props.getProperty(k);
  } });
  let calls = 0;
  e.ctx.UrlFetchApp = { fetch: () => { calls++; return response(batch(1, [1])); } };
  assert.equal(ocr(e).error, 'ERROR_INTERNO');
  assert.equal(e.P.has(COUNT), false);
  assert.equal(calls, 0);
});

const NEW = { saltP: Buffer.alloc(16, 5).toString('base64'), authKey: b64of('nueva'), recSalt: Buffer.alloc(16, 6).toString('base64'), authKeyR2: b64of('nuevo rescate') };
const password = (e, action) => e.call({ action, t: e.t, user: ACC.user, authKeyOld: ACC.authKey, authKeyR: ACC.authKeyR, ...NEW });
for (const action of ['changePassword', 'resetPassword']) {
  test(`D3: ${action} no escribe la cuenta si falla la revocación`, () => {
    const e = env();
    const old = e.P.get('RF_ACCOUNT');
    e.call({ action: 'login', user: ACC.user, authKey: ACC.authKey });
    const props = e.ctx.PropertiesService.getScriptProperties();
    let writes = 0;
    e.ctx.PropertiesService.getScriptProperties = () => ({ ...props,
      deleteProperty(k) { if (k.startsWith('RF_SESS_')) throw new Error('revocación falló'); return props.deleteProperty(k); },
      setProperty(k, v) { if (k === 'RF_ACCOUNT') writes++; return props.setProperty(k, v); }
    });
    assert.equal(password(e, action).error, 'ERROR_INTERNO');
    assert.equal(writes, 0);
    assert.equal(e.P.get('RF_ACCOUNT'), old);
    assert.equal(e.call({ action: 'login', user: ACC.user, authKey: ACC.authKey }).ok, true);
  });

  test(`D3: ${action} revoca antes del guardado; si falla, conserva la cuenta y la contraseña anterior`, () => {
    const e = env();
    const other = e.call({ action: 'login', user: ACC.user, authKey: ACC.authKey }).token;
    const old = e.P.get('RF_ACCOUNT');
    const props = e.ctx.PropertiesService.getScriptProperties();
    let writes = 0;
    e.ctx.PropertiesService.getScriptProperties = () => ({ ...props, setProperty(k, v) {
      if (k === 'RF_ACCOUNT') {
        writes++;
        assert.equal(e.ctx.rfSessionValid_(other), false, 'revocación anterior a escribir cuenta');
        if (action === 'resetPassword') assert.equal(e.ctx.rfSessionValid_(e.t), false);
        throw new Error('guardado falló');
      }
      return props.setProperty(k, v);
    } });
    assert.equal(password(e, action).error, 'ERROR_INTERNO');
    assert.equal(writes, 1);
    assert.equal(e.P.get('RF_ACCOUNT'), old);
    assert.equal(e.ctx.rfSessionValid_(other), false);
    assert.equal(e.ctx.rfSessionValid_(e.t), action === 'changePassword', 'la sesión conservada sigue asociada a la cuenta anterior');
    assert.equal(e.call({ action: 'login', user: ACC.user, authKey: ACC.authKey }).ok, true);
    assert.equal(e.call({ action: 'login', user: ACC.user, authKey: NEW.authKey }).error, 'CREDENCIALES_INVALIDAS');
  });
}

test('D2: un registro con devolución pendiente (OCR ya terminado) no bloquea el mismo archivo aunque su devolución no se haya conciliado', () => {
  const e = env({ [COUNT]: '2' });
  seed(e, { reservadas: 1, devolver: 1 });
  let intentos = 0;
  e.ctx.LockService.getScriptLock = () => ({ tryLock() { return ++intentos > 1; }, releaseLock() {} });
  e.ctx.UrlFetchApp = { fetch: () => response(batch(1, [1])) };
  assert.equal(ocr(e).ok, true);
  assert.equal(e.P.get(COUNT), '2');
  assert.deepEqual(pending(e), []);
});

test('D1: una devolución pendiente se aplica al reservar aunque su conciliación inicial no obtuvo el candado', () => {
  const e = env({ [COUNT]: '5', RINDE_FACIL_OCR_DAILY_LIMIT: '5' });
  seed(e, { reservadas: 3, devolver: 2 });
  let intentos = 0;
  e.ctx.LockService.getScriptLock = () => ({ tryLock() { return ++intentos > 1; }, releaseLock() {} });
  e.ctx.UrlFetchApp = { fetch: () => response(batch(1, [1])) };
  assert.equal(ocr(e).ok, true);
  assert.equal(e.P.get(COUNT), '4');
  assert.deepEqual(pending(e), []);
});

test('D1: un registro ilegible se borra sin devolver nada', () => {
  const e = env({ [COUNT]: '4' });
  e.P.set(PREFIX + 'roto', '{no es json');
  assert.equal(quota(e).diario.usadas, 4);
  assert.equal(e.P.has(PREFIX + 'roto'), false);
});

test('D4: OCR admite siete MB y rechaza siete MB más un byte sin reservar cuota ni llamar a Vision', () => {
  const e = env({}, false);
  e.ctx.Utilities.base64Decode = s => Buffer.from(s, 'base64');
  const accepted = Buffer.alloc(7 * 1024 * 1024).toString('base64');
  const rejected = Buffer.alloc(7 * 1024 * 1024 + 1).toString('base64');
  assert.deepEqual(ocr(e, { base64: rejected }), { ok: false, error: 'ARCHIVO_MUY_GRANDE' });
  assert.equal(e.P.has(COUNT), false);
  assert.equal(e.ctx.__vision.length, 0);
  assert.deepEqual(pending(e), []);
  assert.equal(ocr(e, { base64: accepted }).ok, true);
  assert.equal(e.ctx.__vision.length, 1);
  assert.equal(e.ctx.__vision[0].n, 7 * 1024 * 1024);
  assert.equal(e.P.get(COUNT), '1');
  assert.equal(vm.runInContext('RF_WEB.maxBytes', e.ctx), 8 * 1024 * 1024, 'saveFile mantiene ocho MB');
});

test('D5-D6: los encabezados documentan los límites del acceso público y la persistencia de PEA en el cliente', () => {
  const accountHeader = web.slice(web.indexOf('/* ================= cuenta'), web.indexOf('const RF_AUTH'));
  const ocrHeader = web.slice(web.indexOf('/* ---------- OCR'), web.indexOf('function rfOcr_'));
  assert.match(accountHeader, /bloqueo global[\s\S]*30 minutos/);
  assert.match(accountHeader, /equipos conocidos[\s\S]*propio contador/);
  assert.match(accountHeader, /agotamiento masivo[\s\S]*cuotas de Google/);
  assert.match(ocrHeader, /PEA[\s\S]*página por página[\s\S]*guarda cada resultado[\s\S]*reanudación en el servidor/);
});
