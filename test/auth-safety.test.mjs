/* Flujos de cuenta: el servicio remoto y la bóveda local no deben divergir en silencio. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const STATE = { v: 2, community: { name: 'Comunidad Cuenta' }, projects: [], cloud: { apiUrl: 'https://script.google.com/macros/s/test/exec' }, ui: {} };
const OLD = 'tres palabras de acceso 2026';
const NEXT = 'otras palabras seguras 2027';

function loadWithTestService(extra = {}) {
  /* El servicio simulado se aprueba por URL exacta; no añade endpoints de producción. */
  return loadApp(undefined, Object.assign({ RF_SERVICE_TRUST: { approvedAppsScriptUrls: [STATE.cloud.apiUrl] } }, extra));
}

async function openedApp() {
  /* El fixture de flujo remoto aprueba solo su URL sintética; nunca habilita un servicio real. */
  const RF = loadWithTestService();
  RF.crypto.ITERATIONS = 2000;
  await RF.vault.create('Comunidad Cuenta', OLD, STATE, { iterations: 2000 });
  RF.store.useVault();
  RF.store.attach(STATE, RF.vault.save);
  RF.auth.setToken({ token: 'a'.repeat(64), exp: Date.now() + 60 * 60 * 1000 });
  return RF;
}

test('serverLogin informa los intentos restantes sin revelar qué dato de acceso falló', async () => {
  const RF = loadWithTestService();
  RF.crypto.ITERATIONS = 2000;
  await RF.vault.create('Comunidad Cuenta', OLD, STATE, { iterations: 2000 });
  RF.store.useVault();
  RF.store.attach(STATE, RF.vault.save);
  RF.cloud.postRaw = async action => {
    if (action === 'challenge') return { ok: true, exists: true, saltP: RF.vault.meta().saltP, it: 2000 };
    if (action === 'login') return { ok: false, error: 'CREDENCIALES_INVALIDAS', attemptsRemaining: 2, attemptsLimit: 3 };
    throw new Error('acción inesperada: ' + action);
  };

  await assert.rejects(RF.auth.serverLogin(), error => {
    assert.equal(error.attemptsRemaining, 2);
    assert.equal(error.attemptsLimit, 3);
    assert.match(error.message, /2 intentos/);
    assert.match(error.message, /nombre o la contraseña/i);
    return true;
  });
});

test('connectDevice muestra intentos restantes cuando el servicio rechaza el acceso', async () => {
  const RF = loadWithTestService();
  RF.crypto.ITERATIONS = 2000;
  RF.cloud.postRawTo = async (url, action) => {
    assert.equal(url, STATE.cloud.apiUrl);
    if (action === 'challenge') return { ok: true, exists: true, saltP: Buffer.alloc(16, 8).toString('base64'), it: 2000 };
    if (action === 'login') return { ok: false, error: 'CREDENCIALES_INVALIDAS', attemptsRemaining: 1, attemptsLimit: 3 };
    throw new Error('acción inesperada: ' + action);
  };

  await assert.rejects(RF.auth.connectDevice(STATE.cloud.apiUrl, 'Comunidad Cuenta', NEXT), error => {
    assert.equal(error.attemptsRemaining, 1);
    assert.equal(error.attemptsLimit, 3);
    assert.match(error.message, /1 intento/);
    return true;
  });
  assert.equal(RF.vault.status(), 'none', 'un rechazo no crea bóveda local');
});

test('si el servicio rechaza el cambio, la contraseña local tampoco cambia', async () => {
  const RF = await openedApp();
  const before = JSON.stringify(RF.vault.meta());
  RF.cloud.postRaw = async action => {
    if (action === 'challenge') return { ok: true, exists: true, saltP: RF.vault.meta().saltP, it: 2000 };
    if (action === 'changePassword') return { ok: false, error: 'CREDENCIALES_INVALIDAS' };
    throw new Error('acción inesperada: ' + action);
  };

  await assert.rejects(RF.auth.changePassword(OLD, NEXT), /servicio no aceptó/i);
  assert.equal(JSON.stringify(RF.vault.meta()), before);
  assert.equal(RF.vault.password(), OLD);
});

test('el cambio de contraseña actualiza primero el servicio y luego la bóveda local', async () => {
  const RF = await openedApp();
  const calls = [];
  const original = RF.vault.changePassword;
  RF.vault.changePassword = function () { calls.push('local'); return original.apply(this, arguments); };
  RF.cloud.postRaw = async action => {
    calls.push(action);
    if (action === 'challenge') return { ok: true, exists: true, saltP: RF.vault.meta().saltP, it: 2000 };
    if (action === 'changePassword') return { ok: true };
    throw new Error('acción inesperada: ' + action);
  };

  const result = await RF.auth.changePassword(OLD, NEXT);
  assert.deepEqual(calls, ['challenge', 'changePassword', 'local']);
  assert.equal(result.remoteChanged, true);
  assert.equal(RF.vault.password(), NEXT);
});

test('si falla el guardado local después del cambio remoto, reintentar no cambia la contraseña remota por segunda vez', async () => {
  const RF = await openedApp();
  const original = RF.vault.changePassword;
  let localCalls = 0, remoteCalls = 0;
  RF.vault.changePassword = function () {
    localCalls++;
    return localCalls === 1 ? Promise.reject(new Error('cuota temporalmente agotada')) : original.apply(this, arguments);
  };
  RF.cloud.postRaw = async action => {
    if (action === 'challenge') return { ok: true, exists: true, saltP: RF.vault.meta().saltP, it: 2000 };
    if (action === 'changePassword') { remoteCalls++; return { ok: true }; }
    throw new Error('acción inesperada: ' + action);
  };

  await assert.rejects(RF.auth.changePassword(OLD, NEXT), /servicio sí cambió/i);
  assert.equal(RF.vault.password(), OLD);
  const result = await RF.auth.changePassword(OLD, NEXT);
  assert.equal(result.remoteChanged, true);
  assert.equal(RF.vault.password(), NEXT);
  assert.equal(remoteCalls, 1, 'el segundo intento solo repara la bóveda local');
});

test('cerrar todas las sesiones no anuncia éxito ni borra el token si el servidor lo rechaza', async () => {
  const RF = await openedApp();
  const token = RF.auth.token();
  RF.cloud.postRaw = async () => ({ ok: false, error: 'ERROR_INTERNO' });

  await assert.rejects(RF.auth.logoutServer(true), /cierre de las sesiones/i);
  assert.equal(RF.auth.token(), token);
});

test('el bloqueo elimina la vista de impresión que contiene datos de la comunidad', async () => {
  const RF = await openedApp();
  let removed = false;
  const overlay = { parentNode: { removeChild(node) { assert.equal(node, overlay); removed = true; } } };
  loadApp.lastCtx.document = {
    querySelectorAll(selector) { return selector === '.print-overlay' ? [overlay] : []; },
    getElementById() { return null; }
  };

  await RF.auth.lock('manual');
  assert.equal(removed, true);
  assert.equal(RF.vault.isOpen(), false);
});

test('si falla el restablecimiento remoto, la recuperación no cambia la bóveda ni invalida el código actual', async () => {
  const RF = loadWithTestService();
  RF.crypto.ITERATIONS = 2000;
  const account = await RF.vault.create('Comunidad Cuenta', OLD, STATE, { iterations: 2000 });
  RF.store.useVault();
  RF.store.attach(STATE, RF.vault.save);
  const before = JSON.stringify(RF.vault.meta());
  RF.cloud.postRawTo = async (url, action) => {
    assert.equal(url, STATE.cloud.apiUrl);
    if (action === 'challenge') return { ok: true, exists: true, saltP: RF.vault.meta().saltP, it: 2000 };
    if (action === 'resetPassword') return { ok: false, error: 'ERROR_INTERNO' };
    throw new Error('acción inesperada: ' + action);
  };
  await RF.auth.lock('manual');
  await assert.rejects(RF.auth.recover(account.recoveryCode, NEXT), /no cambió|restablecer el servicio/i);
  assert.equal(JSON.stringify(RF.vault.meta()), before);
  assert.equal(RF.vault.status(), 'locked');
  const prepared = await RF.vault.prepareRecovery(account.recoveryCode, NEXT);
  assert.equal(JSON.stringify(RF.vault.meta()), before, 'el código antiguo todavía puede preparar la recuperación y no se consumió');
  assert.equal(prepared.result.recoveryCode.length > 0, true);
});

test('la recuperación confirmada por el servicio rota la bóveda local y conserva la nueva sesión', async () => {
  const RF = loadWithTestService();
  RF.crypto.ITERATIONS = 2000;
  const account = await RF.vault.create('Comunidad Cuenta', OLD, STATE, { iterations: 2000 });
  RF.store.useVault();
  RF.store.attach(STATE, RF.vault.save);
  loadApp.lastCtx.setInterval = () => 0;
  await RF.auth.lock('manual');
  RF.cloud.postRawTo = async (url, action, payload) => {
    assert.equal(url, STATE.cloud.apiUrl);
    if (action === 'challenge') return { ok: true, exists: true, saltP: RF.vault.meta().saltP, it: 2000 };
    if (action === 'resetPassword') {
      assert.equal(payload.user, 'comunidad cuenta');
      assert.equal(payload.authKeyR, account.authKeyR);
      return { ok: true, token: 'b'.repeat(64), exp: Date.now() + 60000, device: 'c'.repeat(64) };
    }
    throw new Error('acción inesperada: ' + action);
  };

  const result = await RF.auth.recover(account.recoveryCode, NEXT);
  assert.equal(result.serverReset, true);
  assert.equal(RF.vault.password(), NEXT);
  assert.equal(RF.auth.token(), 'b'.repeat(64));
  RF.vault.lock();
  await assert.rejects(RF.vault.unlock('Comunidad Cuenta', OLD));
  const opened = await RF.vault.unlock('Comunidad Cuenta', NEXT);
  assert.equal(opened.state.projects.length, 0);
});

test('recuperar con la bóveda bloqueada usa la URL descifrada y aprobada para restablecer el servicio', async () => {
  const calls = [];
  const RF = loadWithTestService({ fetch: async (url, init) => {
    const payload = JSON.parse(init.body); calls.push({ url, action: payload.action });
    const result = payload.action === 'challenge'
      ? { ok: true, exists: true, saltP: Buffer.alloc(16, 8).toString('base64'), it: 2000 }
      : payload.action === 'resetPassword'
        ? { ok: true, token: 'd'.repeat(64), exp: Date.now() + 60000, device: 'e'.repeat(64) }
        : { ok: false, error: 'ACCION_DESCONOCIDA' };
    return { ok: true, text: async () => JSON.stringify(result) };
  } });
  RF.crypto.ITERATIONS = 2000;
  loadApp.lastCtx.setInterval = () => 0;
  const account = await RF.vault.create('Comunidad Cuenta', OLD, STATE, { iterations: 2000 });
  RF.store.useVault(); RF.store.attach(STATE, RF.vault.save); await RF.store.flush();
  await RF.auth.lock('manual');

  const result = await RF.auth.recover(account.recoveryCode, NEXT);

  assert.equal(result.serverReset, true);
  assert.deepEqual(calls, [
    { url: STATE.cloud.apiUrl, action: 'challenge' },
    { url: STATE.cloud.apiUrl, action: 'resetPassword' }
  ]);
  assert.equal(RF.auth.token(), 'd'.repeat(64));
  assert.equal(RF.store.get().cloud.apiUrl, STATE.cloud.apiUrl, 'la URL vuelve al estado al abrir la bóveda');
});
