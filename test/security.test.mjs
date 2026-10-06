/* Controles de seguridad del cliente: a qué servicio se conecta y qué protección acepta de él. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp();
const PW = 'tres palabras largas 2026';

test('la distribución pública no aprueba ningún servicio comunitario por defecto', () => {
  assert.equal(RF.cloud.trustedUrl('https://script.google.com/macros/s/PERSONAL_DEMO_ENDPOINT/exec'), false);
  assert.equal(RF.cloud.trustedUrl('https://script.google.com/macros/s/OTRO_DEPLOYMENT/exec'), false);
});

test('el filtro de URL valida dominio y formato, pero no autentica la identidad del script', () => {
  /* Cualquier ID de implementación bajo script.google.com pasa el filtro. No equivale a pinning del servicio. */
  const ok = ['https://script.google.com/macros/s/AKfycbzXYZ_-123/exec', 'https://script.google.com/a/macros/comunidad.cl/s/AKfycbzXYZ/exec', 'http://127.0.0.1:8791/exec', 'http://localhost:3000/exec'];
  const bad = ['', null, undefined, 'http://script.google.com/macros/s/X/exec', 'https://script.google.com.evil.com/macros/s/X/exec', 'https://evil.com/script.google.com/macros/s/X/exec',
    'https://evil.com/exec', 'javascript:alert(1)', 'https://script.google.com/macros/s/X/dev', 'https://script.google.com/macros/s/X/exec?x=1', 'ftp://script.google.com/macros/s/X/exec', 'http://evil.com:80/x', 'http://localhost.evil.com/exec'];
  ok.forEach(u => assert.equal(RF.cloud.validUrl(u), true, u));
  bad.forEach(u => assert.equal(RF.cloud.validUrl(u), false, String(u)));
});

test('un Apps Script no aprobado no recibe solicitudes de conexión ni claves derivadas', async () => {
  const requests = [];
  const fake = 'https://script.google.com/macros/s/ATTACKER_DEPLOYMENT/exec';
  const app = loadApp(undefined, {
    RF_SERVICE_TRUST: { approvedAppsScriptUrls: [] },
    fetch: async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return { ok: true, text: async () => JSON.stringify({ ok: true, exists: true, saltP: Buffer.alloc(16, 4).toString('base64'), it: 600000 }) }; }
  });

  assert.equal(app.cloud.validUrl(fake), true, 'la URL tiene forma válida, pero eso no la hace confiable');
  assert.equal(app.cloud.trustedUrl(fake), false);
  await app.auth.createAccount('Comunidad de Prueba', PW);
  app.store.update(s => { s.cloud.apiUrl = fake; });
  assert.equal(app.cloud.configured(), false);
  await assert.rejects(app.auth.connectDevice(fake, 'Comunidad', PW), e => e.code === 'SERVICIO_NO_APROBADO');
  await assert.rejects(app.auth.serverLogin(), e => e.code === 'SERVICIO_NO_APROBADO');
  await assert.rejects(app.cloud.postRaw('setup', { setupCode: 'secreto', authKey: 'derivada' }), e => e.code === 'SERVICIO_NO_APROBADO');
  assert.deepEqual(requests, [], 'ningún código ni clave sale del navegador');
  await app.auth.wipeDevice();
});

test('el endpoint exacto aprobado puede recibir la consulta pública; otro deployment no', async () => {
  const requests = [];
  const approved = 'https://script.google.com/macros/s/COMMUNITY_APPROVED/exec';
  const app = loadApp(undefined, {
    RF_SERVICE_TRUST: { approvedAppsScriptUrls: [approved] },
    fetch: async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return { ok: true, text: async () => JSON.stringify({ ok: true, exists: false }) }; }
  });

  assert.equal(app.cloud.trustedUrl(approved), true);
  await assert.rejects(app.auth.connectDevice(approved, 'Comunidad', PW), e => e.code === 'SIN_CUENTA');
  await assert.rejects(app.cloud.postRawTo('https://script.google.com/macros/s/OTHER_DEPLOYMENT/exec', 'login', { authKey: 'no' }), e => e.code === 'SERVICIO_NO_APROBADO');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, approved);
  assert.deepEqual(requests[0].body, { action: 'challenge' });
});

test('si el servicio guardado no está aprobado, cambiar o recuperar contraseña sigue siendo local y lo informa', async () => {
  const requests = [];
  const app = loadApp(undefined, { RF_SERVICE_TRUST: { approvedAppsScriptUrls: [] }, fetch: async (...args) => { requests.push(args); throw new Error('No debería llamar a la red'); } });
  await app.auth.init();
  const created = await app.auth.createAccount('Comunidad de Recuperación', PW);
  const fake = 'https://script.google.com/macros/s/UNTRUSTED/exec';
  app.store.update(s => { s.cloud.apiUrl = fake; });
  const changed = await app.auth.changePassword(PW, 'otra frase larga y segura 2026');
  assert.equal(changed.remoteTrustBlocked, true);
  assert.equal(requests.length, 0);

  const recovered = await app.auth.recover(created.recoveryCode, 'nueva frase segura de recuperación 2026');
  assert.equal(recovered.serviceTrustBlocked, true);
  assert.equal(requests.length, 0, 'ni la contraseña ni el código de recuperación llegan al servicio no aprobado');
  await app.auth.wipeDevice();
});

test('localhost solo se acepta si coincide exactamente con el origen local de la app', () => {
  const local = 'http://127.0.0.1:4179/exec';
  const sameOrigin = loadApp(undefined, { location: { protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:4179' } });
  const remoteOrigin = loadApp();
  assert.equal(sameOrigin.cloud.trustedUrl(local), true);
  assert.equal(remoteOrigin.cloud.trustedUrl(local), false);
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
