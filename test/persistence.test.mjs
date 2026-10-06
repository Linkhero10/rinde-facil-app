/* Persistencia: los errores de almacenamiento no deben parecer guardados correctamente. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp();
RF.crypto.ITERATIONS = 2000; /* solo pruebas; producción usa 600.000 */
const LS = loadApp.lastCtx.localStorage;
const STATE = { v: 2, community: { name: 'Comunidad Persistencia' }, projects: [], cloud: {}, ui: {} };
const PW = 'frase larga de prueba 2026';

async function resetVault() {
  RF.store.detach();
  RF.vault.wipe();
  await RF.vault.create('Comunidad Persistencia', PW, STATE, { iterations: 2000 });
}

test('la bóveda propaga los errores al guardar y conserva la última copia válida', async () => {
  await resetVault();
  const original = LS.setItem;
  LS.setItem = function (key, value) {
    if (key === RF.vault.KEY) throw new DOMException('almacenamiento lleno', 'QuotaExceededError');
    return original.call(this, key, value);
  };

  try {
    await assert.rejects(RF.vault.save({ ...STATE, marca: 'no guardada' }), /almacenamiento lleno/);
  } finally {
    LS.setItem = original;
  }
  assert.equal((await RF.vault.readState()).marca, undefined, 'el estado persistido no debe fingir que recibió el cambio');
});

test('flush informa el fallo de la bóveda y una nueva tentativa puede recuperarse', async () => {
  await resetVault();
  RF.store.useVault();
  RF.store.attach(STATE, RF.vault.save);
  const ctx = loadApp.lastCtx;
  const realSetTimeout = ctx.setTimeout;
  ctx.setTimeout = function () { return 0; }; /* controlar el debounce para probar flush de forma determinista */
  const events = [];
  RF.store.onStorageStatus(ok => events.push(ok));
  RF.store.update(s => { s.community.name = 'Comunidad actualizada'; });

  const original = LS.setItem;
  LS.setItem = function (key, value) {
    if (key === RF.vault.KEY) throw new DOMException('almacenamiento lleno', 'QuotaExceededError');
    return original.call(this, key, value);
  };
  await assert.rejects(RF.store.flush(), /almacenamiento lleno/);
  assert.equal(RF.store.storageOk(), false);
  assert.deepEqual(events, [false]);

  LS.setItem = original;
  await RF.store.flush();
  assert.equal(RF.store.storageOk(), true);
  assert.deepEqual(events, [false, true]);
  RF.vault.lock();
  const opened = await RF.vault.unlock('Comunidad Persistencia', PW);
  assert.equal(opened.state.community.name, 'Comunidad actualizada');
  ctx.setTimeout = realSetTimeout;
});

test('un bloqueo manual no cierra la bóveda cuando dejaría cambios sin guardar', async () => {
  await resetVault();
  const ctx = loadApp.lastCtx;
  ctx.setTimeout = function () { return 0; };
  ctx.setInterval = function () { return 0; };
  ctx.clearInterval = function () {};
  RF.store.useVault();
  RF.store.attach(STATE, () => Promise.reject(new Error('disco lleno')));
  RF.store.update(s => { s.community.name = 'Cambio pendiente'; });

  await assert.rejects(RF.auth.lock('manual'), /disco lleno/);
  assert.equal(RF.vault.isOpen(), true, 'la sesión sigue abierta para que la persona pueda recuperar el guardado');
  assert.equal(RF.auth.phase(), 'open');
});
