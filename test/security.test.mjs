/* Controles de seguridad del cliente: a qué servicio se conecta y qué protección acepta de él. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp();
const PW = 'tres palabras largas 2026';

test('solo se aceptan servicios de Apps Script de Google (o localhost para pruebas)', () => {
  const ok = ['https://script.google.com/macros/s/AKfycbzXYZ_-123/exec', 'https://script.google.com/a/macros/comunidad.cl/s/AKfycbzXYZ/exec', 'http://127.0.0.1:8791/exec', 'http://localhost:3000/exec'];
  const bad = ['', null, undefined, 'http://script.google.com/macros/s/X/exec', 'https://script.google.com.evil.com/macros/s/X/exec', 'https://evil.com/script.google.com/macros/s/X/exec',
    'https://evil.com/exec', 'javascript:alert(1)', 'https://script.google.com/macros/s/X/dev', 'https://script.google.com/macros/s/X/exec?x=1', 'ftp://script.google.com/macros/s/X/exec', 'http://evil.com:80/x', 'http://localhost.evil.com/exec'];
  ok.forEach(u => assert.equal(RF.cloud.validUrl(u), true, u));
  bad.forEach(u => assert.equal(RF.cloud.validUrl(u), false, String(u)));
});

test('un servicio que propone menos vueltas de PBKDF2 no recibe nada: ni la clave derivada', async () => {
  RF.vault.wipe();
  await RF.auth.createAccount('Comunidad de Prueba Larga', PW, { iterations: 2000, skipPolicy: false });
  const sent = [];
  RF.cloud.postRaw = async (action, payload) => {
    sent.push(action);
    if (action === 'challenge') return { ok: true, exists: true, saltP: Buffer.alloc(16, 1).toString('base64'), it: 1000 };
    return { ok: true, token: 'x'.repeat(64) };
  };
  await assert.rejects(RF.auth.serverLogin(), e => e.code === 'SERVICIO_DEBIL');
  assert.deepEqual(sent, ['challenge'], 'solo preguntó; no mandó ninguna clave');
  sent.length = 0;
  RF.cloud.postRaw = async (action) => { sent.push(action); return action === 'challenge' ? { ok: true, exists: true, saltP: 'AAAA', it: 600000 } : { ok: true }; };
  await assert.rejects(RF.auth.serverLogin(), e => e.code === 'SERVICIO_DEBIL', 'una sal demasiado corta tampoco');
  assert.deepEqual(sent, ['challenge']);
  await RF.auth.wipeDevice(); /* detiene el temporizador de inactividad para que la prueba termine */
});

test('un respaldo con claves __proto__ o constructor no cambia el prototipo de nada (hallazgo de la revisión con Strix)', () => {
  RF.store.reset();
  const evil = '{"__proto__":{"polluted":"si"},"constructor":{"prototype":{"polluted2":"si"}},"projects":[{"id":"p1","name":"X","__proto__":{"polluted3":"si"}}],"community":{"name":"C","__proto__":{"polluted5":"si"}}}';
  RF.store.importJSON(evil);
  const s = RF.store.get();
  assert.equal(({}).polluted, undefined); assert.equal(({}).polluted2, undefined);
  assert.equal(s.polluted, undefined, 'el estado no hereda propiedades ajenas');
  assert.equal(s.projects[0].polluted3, undefined);
  assert.equal(s.community.polluted5, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(s, 'constructor'), false);
  assert.equal(s.projects[0].name, 'X', 'lo legítimo se conserva');
});
