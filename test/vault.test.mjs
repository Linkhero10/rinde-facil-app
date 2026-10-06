/* Prueba la criptografía y la bóveda local: cifrado en reposo, contraseña equivocada, datos alterados, recuperación y cambio de contraseña. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp();
RF.crypto.ITERATIONS = 2000; /* solo en pruebas: en la app son 600.000 */
const STATE = { v: 2, community: { name: 'Comunidad Atacameña de Prueba' }, projects: [{ id: 'p1', name: 'Invernadero', expenses: [{ id: 'e1', proveedor: 'Ferretería Los Cóndores' }] }], cloud: {} };
const PW = 'tres palabras largas 2026';
const LS = loadApp.lastCtx.localStorage;

function reset() { RF.vault.wipe(); }
const dump = () => RF.vault.meta() ? JSON.stringify(RF.vault.meta()) : '';

test('la política permite frases y cualquier tipo de caracteres con 10 o más', () => {
  const P = RF.crypto.passwordProblems;
  assert.ok(P('corta', 'X').length > 0);
  assert.equal(P('1234567890', 'X').length, 0);
  assert.ok(P('Comunidad Atacama', 'Comunidad Atacama').length > 0, 'bloquea usar exactamente el nombre de la comunidad');
  assert.equal(P('9876043215', 'X').length, 0, 'no exige mezclar letras y números');
  assert.equal(P('bcdEFGHijk', 'X').length, 0, 'no exige números ni símbolos');
  assert.equal(P('zzzzzzzzzz', 'X').length, 0, 'no rechaza una frase por una regla de composición');
  assert.equal(P('Una palabra password larga', 'X').length, 0, 'no bloquea una palabra común dentro de una frase distinta');
  assert.equal(P('Mi Comunidad Atacama extendida', 'Comunidad Atacama').length, 0, 'no bloquea el nombre de la comunidad dentro de una frase');
  assert.equal(P(PW, 'Comunidad Atacameña').length, 0);
});
test('el checklist contiene solo longitud y nombre de la comunidad', () => {
  const checks = RF.crypto.passwordChecks('Frase larga sin números', 'Comunidad Norte');
  assert.equal(JSON.stringify(checks.map(x => x.id)), '["length","community"]');
  assert.equal(JSON.stringify(checks.map(x => x.valid)), '[true,true]');
  const invalid = RF.crypto.passwordChecks('Comunidad Norte', 'Comunidad Norte');
  assert.equal(JSON.stringify(invalid.map(x => x.valid)), '[true,false]');
  assert.equal(RF.crypto.passwordProblems('😀'.repeat(9), 'X').length, 1);
  assert.equal(RF.crypto.passwordProblems('😀'.repeat(10), 'X').length, 0);
});
test('crear la bóveda: nada legible en el almacenamiento, y se abre solo con la contraseña correcta', async () => {
  reset();
  const r = await RF.vault.create('Comunidad Atacameña de Prueba', PW, STATE, { iterations: 2000 });
  assert.match(r.recoveryCode, /^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}-[0-9A-Z]$/, 'código de recuperación de 26 caracteres');
  assert.equal(RF.vault.status(), 'open');
  await RF.vault.save({ ...STATE, marca: 'guardado' });
  const texto = dump(); /* el nombre de la comunidad es el usuario: se ve a propósito para precargar la pantalla de acceso */
  ['Ferretería', 'Invernadero', PW, 'guardado'].forEach(s => assert.ok(!texto.includes(s), 'no debe aparecer «' + s + '» en claro'));
  RF.vault.lock(); assert.equal(RF.vault.status(), 'locked');
  await assert.rejects(RF.vault.unlock('Comunidad Atacameña de Prueba', 'otra contraseña larga 1'), /no coinciden/);
  await assert.rejects(RF.vault.unlock('Otra comunidad', PW), /no coinciden/);
  const ok = await RF.vault.unlock('comunidad atacamena  de prueba', PW); /* sin tildes ni mayúsculas ni espacios de más */
  assert.equal(ok.state.marca, 'guardado'); assert.equal(RF.vault.status(), 'open');
  assert.match(ok.authKey, /^[A-Za-z0-9+/]{43}=$/, 'clave de acceso de 256 bits para el servicio');
});
test('un dato alterado se detecta (no se abre)', async () => {
  reset(); await RF.vault.create('Comunidad X larga', PW, STATE, { iterations: 2000 }); RF.vault.lock();
  const m = RF.vault.meta(); const ct = RF.crypto.ub64(m.state.ct); ct[3] ^= 1; m.state.ct = RF.crypto.b64(ct);
  LS.setItem(RF.vault.KEY, JSON.stringify(m));
  await assert.rejects(RF.vault.unlock('Comunidad X larga', PW));
});
test('las fotos se cifran y se leen de vuelta; con la bóveda bloqueada no se leen', async () => {
  reset(); await RF.vault.create('Comunidad Foto larga', PW, STATE, { iterations: 2000 });
  const foto = new Blob([new Uint8Array([1, 2, 3, 4, 5, 250, 251])], { type: 'image/jpeg' });
  const rec = await RF.vault.encryptBlob(foto);
  assert.equal(rec.enc, 1); assert.notDeepEqual(Array.from(rec.ct.slice(0, 5)), [1, 2, 3, 4, 5]);
  const back = await RF.vault.decryptBlob(rec);
  assert.equal(back.type, 'image/jpeg'); assert.deepEqual(Array.from(new Uint8Array(await back.arrayBuffer())), [1, 2, 3, 4, 5, 250, 251]);
  RF.vault.lock(); await assert.rejects(RF.vault.decryptBlob(rec), /BLOQUEADA|bloque/i);
});
test('cambiar la contraseña: la vieja deja de servir y los datos siguen', async () => {
  reset(); await RF.vault.create('Comunidad Cambio larga', PW, STATE, { iterations: 2000 });
  await assert.rejects(RF.vault.changePassword('no es la clave 123', 'nueva frase larga 2027'), /actual no es correcta/);
  await assert.rejects(RF.vault.changePassword(PW, 'corta'), /al menos 10/);
  await RF.vault.changePassword(PW, 'nueva frase larga 2027'); RF.vault.lock();
  await assert.rejects(RF.vault.unlock('Comunidad Cambio larga', PW));
  const ok = await RF.vault.unlock('Comunidad Cambio larga', 'nueva frase larga 2027');
  assert.equal(ok.state.projects[0].name, 'Invernadero');
});
test('olvidé mi contraseña: el código de recuperación abre los datos y pide una contraseña nueva y un código nuevo', async () => {
  reset(); const c = await RF.vault.create('Comunidad Recuperar larga', PW, STATE, { iterations: 2000 }); RF.vault.lock();
  await assert.rejects(RF.vault.recover('AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-A', 'frase nueva larga 2028'), /código de recuperación/);
  const r = await RF.vault.recover(c.recoveryCode.toLowerCase().replace(/-/g, ' '), 'frase nueva larga 2028');
  assert.equal(r.state.projects[0].name, 'Invernadero'); assert.notEqual(r.recoveryCode, c.recoveryCode);
  assert.equal(r.authKeyR, c.authKeyR, 'la clave de recuperación vieja coincide con la que se entregó al servicio');
  RF.vault.lock();
  await RF.vault.unlock('Comunidad Recuperar larga', 'frase nueva larga 2028');
  RF.vault.lock(); await assert.rejects(RF.vault.recover(c.recoveryCode, 'otra frase larga 2029'), /código de recuperación/, 'el código viejo ya no sirve');
});
test('recuperación preparada no modifica la bóveda hasta confirmar el commit local', async () => {
  reset(); const created = await RF.vault.create('Comunidad Recuperación diferida', PW, STATE, { iterations: 2000 });
  RF.vault.lock();
  const before = dump();
  const prepared = await RF.vault.prepareRecovery(created.recoveryCode, 'nueva frase diferida 2028');
  assert.equal(dump(), before, 'preparar no escribe ni rota el código actual');
  assert.equal(RF.vault.status(), 'locked', 'preparar no abre la sesión');
  const r = await RF.vault.commitRecovery(prepared);
  assert.equal(r.state.projects[0].name, 'Invernadero');
  assert.notEqual(r.recoveryCode, created.recoveryCode);
  RF.vault.lock();
  await RF.vault.unlock('Comunidad Recuperación diferida', 'nueva frase diferida 2028');
  assert.equal((await RF.vault.readState()).projects[0].name, 'Invernadero');
});
test('freno local: tras 5 intentos fallidos hay que esperar', async () => {
  reset(); await RF.vault.create('Comunidad Freno larga', PW, STATE, { iterations: 2000 }); RF.vault.lock();
  for (let i = 0; i < 5; i++) await assert.rejects(RF.vault.unlock('Comunidad Freno larga', 'mala contraseña larga ' + i));
  await assert.rejects(RF.vault.unlock('Comunidad Freno larga', PW), /Espera/, 'aunque sea la correcta, primero hay que esperar');
});
test('datos antiguos sin cifrar: se migran, se comprueba que se leen y recién entonces se borra la copia clara (sin la clave del servicio)', async () => {
  reset();
  LS.setItem('rinde_facil_v2', JSON.stringify({ ...STATE, cloud: { apiUrl: 'https://x/exec', key: 'clave-vieja' } }));
  assert.equal(RF.vault.status(), 'legacy');
  const legacy = RF.vault.legacyState();
  assert.equal(legacy.cloud.key, undefined, 'la clave compartida vieja no pasa a la bóveda');
  await RF.vault.create('Comunidad Migrar larga', PW, legacy, { iterations: 2000 });
  assert.equal(await RF.vault.verifyReadable(), true);
  RF.vault.dropLegacy();
  assert.equal(LS.getItem('rinde_facil_v2'), null); assert.equal(RF.vault.status(), 'open');
});
