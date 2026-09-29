/* Prueba la lógica de backend/WebApi.gs con Apps Script simulado (no llama a Google). */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { makeEnv, ACC, b64of } from './gas_sim.mjs';

const B64 = Buffer.from('imagen-de-prueba').toString('base64');

const login = (e, authKey = ACC.authKey, user = ACC.user) => e.call({ action: 'login', user, authKey });
const setTime = (e, ms) => { e.ctx.rfNow_ = () => ms; };
const T0 = Date.now();

test('sin código de instalación el servicio no crea cuentas ni atiende a nadie', () => {
  const e = makeEnv({}, undefined, { anon: true });
  assert.equal(e.call(Object.assign({ action: 'setup', setupCode: '' }, ACC)).error, 'CODIGO_INVALIDO');
  assert.equal(e.call(Object.assign({ action: 'setup', setupCode: 'cualquiera' }, ACC)).error, 'CODIGO_INVALIDO');
  assert.equal(e.call({ action: 'ocr', mimeType: 'image/jpeg', base64: B64 }).error, 'SESION_INVALIDA');
  assert.equal(e.call({ action: 'ping' }).account, false);
});
test('cuenta: el código sirve una sola vez, no hay segunda cuenta y la clave no se guarda en claro', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'inst-1', RINDE_FACIL_GCP_PROJECT_ID: 'proy' });
  assert.ok(e.t && /^[0-9a-f]{64}$/.test(e.t), 'el alta entrega una sesión de 256 bits');
  assert.equal(e.P.get('RINDE_FACIL_SETUP_CODE'), undefined, 'el código se borra tras usarse');
  assert.equal(e.call(Object.assign({ action: 'setup', setupCode: 'inst-1' }, ACC, { user: 'Otra' })).error, 'CUENTA_EXISTENTE');
  const guardado = JSON.stringify(Array.from(e.P.entries()));
  [ACC.authKey, ACC.authKeyR].forEach(v => assert.ok(!guardado.includes(v), 'ni la clave ni la de recuperación quedan tal cual'));
  const p = e.call({ action: 'ping' }); assert.equal(p.account, true);
  assert.ok(!/hash|pepper|salt|authKey/i.test(JSON.stringify(p)), 'ping no entrega secretos');
  const ch = e.call({ action: 'challenge' }); assert.equal(ch.exists, true); assert.equal(ch.saltP, ACC.saltP); assert.ok(!('hashAuth' in ch));
});
test('setup: datos malformados se rechazan y el código equivocado bloquea tras 5 intentos', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'bueno' }, undefined, { anon: true });
  assert.equal(e.call(Object.assign({ action: 'setup', setupCode: 'bueno' }, ACC, { authKey: 'corto' })).error, 'DATOS_INVALIDOS');
  assert.equal(e.call(Object.assign({ action: 'setup', setupCode: 'bueno' }, ACC, { user: ' ' })).error, 'DATOS_INVALIDOS');
  setTime(e, T0);
  for (let i = 0; i < 5; i++) assert.equal(e.call(Object.assign({ action: 'setup', setupCode: 'malo' + i }, ACC)).error, 'CODIGO_INVALIDO');
  const b = e.call(Object.assign({ action: 'setup', setupCode: 'bueno' }, ACC));
  assert.equal(b.error, 'BLOQUEADO'); assert.ok(b.retryAfter > 3000, 'espera de una hora');
});
test('toda acción con datos exige una sesión válida', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy' });
  const acciones = ['ocr', 'folders', 'saveState', 'loadState', 'saveFile', 'changePassword', 'logout', 'logoutAll', 'audit'];
  const malas = [undefined, '', 'x', 'g'.repeat(64), e.t.toUpperCase(), e.t.slice(1), e.t + '0', 12345, null, { $ne: 1 }, [e.t]];
  acciones.forEach(a => malas.forEach(t => assert.equal(e.call({ action: a, t, mimeType: 'image/jpeg', base64: B64 }).error, 'SESION_INVALIDA', a + ' con ' + JSON.stringify(t))));
  assert.equal(e.ctx.__vision.length, 0, 'sin sesión no se gasta cuota de OCR');
  assert.equal(e.call({ action: 'audit', t: e.t }).ok, true, 'con la sesión buena sí');
});
test('login: usuario o clave equivocados dan el mismo error; el nombre no distingue tildes ni mayúsculas', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  const a = login(e, b64of('otra')), b = login(e, ACC.authKey, 'Otra comunidad'), c = login(e, ACC.authKey, ''), d = login(e, null, null);
  [a, b, c, d].forEach(r => assert.deepEqual(r, { ok: false, error: 'CREDENCIALES_INVALIDAS' }));
  const ok = login(e, ACC.authKey, '  COMUNIDAD atacamena   de PRUEBA ');
  assert.equal(ok.ok, true); assert.equal(ok.saltP, ACC.saltP); assert.match(ok.token, /^[0-9a-f]{64}$/); assert.notEqual(ok.token, e.t);
  assert.ok(!('hashAuth' in ok));
});
test('bloqueo por intentos: 5 fallos bloquean, la clave buena tampoco entra, se duplica y se libera con el tiempo', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  setTime(e, T0);
  for (let i = 0; i < 4; i++) assert.equal(login(e, b64of('x' + i)).error, 'CREDENCIALES_INVALIDAS');
  assert.equal(login(e, b64of('x4')).error, 'CREDENCIALES_INVALIDAS');
  const l = login(e); assert.equal(l.error, 'BLOQUEADO'); assert.ok(l.retryAfter > 800 && l.retryAfter <= 900, '15 minutos');
  setTime(e, T0 + 16 * 60000);
  for (let i = 0; i < 5; i++) login(e, b64of('y' + i)); /* seguidos, sin un acierto en medio: el castigo crece */
  setTime(e, T0 + 17 * 60000);
  assert.equal(login(e, b64of('z')).error, 'BLOQUEADO', 'mientras dura el bloqueo ni siquiera se prueba la clave');
  const l2 = login(e); assert.equal(l2.error, 'BLOQUEADO'); assert.ok(l2.retryAfter > 1500, 'la segunda vez el bloqueo se duplica (30 min)');
});
test('un acierto borra los fallos anteriores', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  for (let round = 0; round < 3; round++) { for (let i = 0; i < 4; i++) login(e, b64of('m' + i)); assert.equal(login(e).ok, true, 'ronda ' + round); }
});
test('la sesión vence a las 12 horas, se cierra con logout y logoutAll', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  setTime(e, T0);
  const s1 = login(e).token, s2 = login(e).token, s3 = login(e).token;
  assert.equal(e.call({ action: 'audit', t: s1 }).ok, true);
  assert.equal(e.call({ action: 'logout', t: s1 }).ok, true);
  assert.equal(e.call({ action: 'audit', t: s1 }).error, 'SESION_INVALIDA', 'cerrada');
  assert.equal(e.call({ action: 'audit', t: s2 }).ok, true, 'las otras siguen');
  e.call({ action: 'logoutAll', t: s2 });
  assert.equal(e.call({ action: 'audit', t: s3 }).error, 'SESION_INVALIDA');
  setTime(e, T0 + 1000); const s4 = login(e).token;
  setTime(e, T0 + 11 * 3600000); assert.equal(e.call({ action: 'audit', t: s4 }).ok, true, 'a las 11 h sigue');
  setTime(e, T0 + 12 * 3600000 + 5000); assert.equal(e.call({ action: 'audit', t: s4 }).error, 'SESION_INVALIDA', 'a las 12 h vence');
});
test('no se acumulan más de 20 sesiones', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  let t = T0; const tokens = [];
  for (let i = 0; i < 25; i++) { setTime(e, t += 1000); tokens.push(login(e).token); }
  assert.equal([...e.P.keys()].filter(k => k.startsWith('RF_SESS_')).length, 20);
  assert.equal(e.call({ action: 'audit', t: tokens[0] }).error, 'SESION_INVALIDA', 'la más antigua se descarta');
  assert.equal(e.call({ action: 'audit', t: tokens[24] }).ok, true);
});
test('cambiar la contraseña: pide la anterior, cierra las demás sesiones y la vieja deja de servir', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  const otra = login(e).token, nueva = { saltP: Buffer.alloc(16, 5).toString('base64'), authKey: b64of('clave-2') };
  assert.equal(e.call(Object.assign({ action: 'changePassword', t: e.t, authKeyOld: b64of('mala') }, nueva)).error, 'CREDENCIALES_INVALIDAS');
  assert.equal(e.call({ action: 'changePassword', t: e.t, authKeyOld: ACC.authKey, saltP: 'x', authKey: 'y' }).error, 'DATOS_INVALIDOS');
  assert.equal(e.call(Object.assign({ action: 'changePassword', t: e.t, authKeyOld: ACC.authKey }, nueva)).ok, true);
  assert.equal(e.call({ action: 'audit', t: e.t }).ok, true, 'la sesión que cambió sigue');
  assert.equal(e.call({ action: 'audit', t: otra }).error, 'SESION_INVALIDA', 'las demás se cerraron');
  assert.equal(login(e).error, 'CREDENCIALES_INVALIDAS', 'la vieja ya no entra');
  assert.equal(login(e, nueva.authKey).ok, true);
  assert.equal(e.call({ action: 'challenge' }).saltP, nueva.saltP);
});
test('recuperación: solo con el código, cierra todas las sesiones y su intento fallido bloquea una hora', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  setTime(e, T0);
  const nuevo = { saltP: Buffer.alloc(16, 3).toString('base64'), authKey: b64of('clave-3'), recSalt: Buffer.alloc(16, 4).toString('base64'), authKeyR2: b64of('rec-2') };
  assert.equal(e.call(Object.assign({ action: 'resetPassword', user: ACC.user, authKeyR: b64of('mal') }, nuevo)).error, 'CREDENCIALES_INVALIDAS');
  assert.equal(e.call(Object.assign({ action: 'resetPassword', user: ACC.user, authKeyR: ACC.authKey }, nuevo)).error, 'CREDENCIALES_INVALIDAS', 'la clave de la contraseña no sirve como código de recuperación');
  const r = e.call(Object.assign({ action: 'resetPassword', user: ACC.user, authKeyR: ACC.authKeyR }, nuevo));
  assert.equal(r.ok, true); assert.equal(e.call({ action: 'audit', t: e.t }).error, 'SESION_INVALIDA', 'las sesiones anteriores se cerraron');
  assert.equal(e.call({ action: 'audit', t: r.token }).ok, true);
  assert.equal(login(e, ACC.authKey).ok, false); assert.equal(login(e, nuevo.authKey).ok, true);
  for (let i = 0; i < 5; i++) e.call(Object.assign({ action: 'resetPassword', user: ACC.user, authKeyR: b64of('m' + i) }, nuevo));
  const b = e.call(Object.assign({ action: 'resetPassword', user: ACC.user, authKeyR: nuevo.authKeyR2 }, nuevo));
  assert.equal(b.error, 'BLOQUEADO'); assert.ok(b.retryAfter > 3000);
});
test('registro de accesos: anota lo que pasó, sin claves, y no crece sin límite', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  login(e, b64of('mal')); login(e);
  const eventos = e.call({ action: 'audit', t: e.t }).log.map(x => x.e);
  assert.ok(eventos.includes('setup') && eventos.includes('login_fail') && eventos.includes('login'));
  assert.ok(!/authKey|token|clave/i.test(JSON.stringify(e.call({ action: 'audit', t: e.t }))), 'el registro no lleva secretos');
  for (let i = 0; i < 120; i++) e.ctx.rfAudit_('x', true);
  assert.ok(JSON.parse(e.P.get('RF_AUDIT')).length <= 80);
});
test('entradas malas no rompen el servicio ni filtran detalles', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  assert.equal(e.call(null, '').error, 'SIN_DATOS');
  assert.equal(e.call(null, '{no es json').error, 'JSON_INVALIDO');
  assert.equal(e.call(null, '"texto"').error, 'JSON_INVALIDO');
  assert.equal(e.call(null, 'null').error, 'JSON_INVALIDO');
  assert.equal(e.call({ action: 'rm -rf', t: e.t }).error, 'ACCION_DESCONOCIDA');
  assert.equal(e.call({ action: '__proto__', t: e.t }).error, 'ACCION_DESCONOCIDA');
  assert.equal(e.call({ action: { toString: 1 }, t: e.t }).error, 'ACCION_DESCONOCIDA');
  assert.equal(e.call({ action: 'toString' }).error, 'SESION_INVALIDA');
  assert.equal(e.call({ action: 'constructor' }).error, 'SESION_INVALIDA');
  const raro = e.call({ action: 'login', user: { a: 1 }, authKey: [1, 2] }); assert.equal(raro.error, 'CREDENCIALES_INVALIDAS');
  const out = JSON.parse(e.ctx.doGet().content); assert.equal(out.ok, true); assert.deepEqual(Object.keys(out).sort(), ['ok', 'service', 'version']);
});
test('control de versiones de la copia: un equipo atrasado no pisa al más nuevo salvo que lo fuerce', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  const s = n => JSON.stringify({ v: 2, projects: [{ name: n }] });
  const a = e.call({ action: 'saveState', t: e.t, state: s('A'), baseRev: 0 }); assert.equal(a.ok, true); assert.equal(a.rev, 1);
  const b = e.call({ action: 'saveState', t: e.t, state: s('B'), baseRev: 1 }); assert.equal(b.rev, 2);
  const c = e.call({ action: 'saveState', t: e.t, state: s('C'), baseRev: 1 });
  assert.equal(c.ok, false); assert.equal(c.error, 'CONFLICTO'); assert.equal(c.rev, 2);
  assert.equal(JSON.parse(e.call({ action: 'loadState', t: e.t }).state).projects[0].name, 'B', 'no se pisó');
  assert.equal(e.call({ action: 'saveState', t: e.t, state: s('C'), baseRev: 1, force: true }).rev, 3);
  const l = e.call({ action: 'loadState', t: e.t }); assert.equal(l.rev, 3);
});

test('ocr: valida tipo y tamaño, lee, cuenta y respeta el límite diario', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy', RINDE_FACIL_OCR_DAILY_LIMIT: '2' });
  assert.equal(e.call({ action: 'ocr', t: e.t, mimeType: 'application/x-msdownload', base64: B64 }).error, 'TIPO_NO_PERMITIDO');
  assert.equal(e.call({ action: 'ocr', t: e.t, mimeType: 'image/jpeg', base64: '***' }).error, 'BASE64_INVALIDO');
  assert.equal(e.ctx.__vision.length, 0, 'las entradas inválidas no llegan a Vision');
  const a = e.call({ action: 'ocr', t: e.t, mimeType: 'image/jpeg', base64: B64, fileName: 'boleta.jpg' });
  assert.equal(a.ok, true); assert.equal(a.raw_text, 'TOTAL $7.500'); assert.equal(a.engine, 'cloud_vision'); assert.equal(a.used_today, 1);
  assert.equal(e.call({ action: 'ocr', t: e.t, mimeType: 'application/pdf', base64: B64 }).ok, true);
  const c = e.call({ action: 'ocr', t: e.t, mimeType: 'image/png', base64: B64 });
  assert.equal(c.error, 'LIMITE_DIARIO'); assert.equal(c.limit, 2);
  assert.equal(e.ctx.__vision.length, 2);
  const big = Buffer.alloc(9 * 1024 * 1024).toString('base64');
  const e2 = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy' });
  assert.equal(e2.call({ action: 'ocr', t: e2.t, mimeType: 'image/jpeg', base64: big }).error, 'ARCHIVO_MUY_GRANDE');
});
test('ocr: si Vision falla devuelve el error sin texto; sin proyecto, avisa', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy' }, { status: 'ERROR', raw_text: '', error: 'PERMISSION_DENIED' });
  const r = e.call({ action: 'ocr', t: e.t, mimeType: 'image/jpeg', base64: B64 });
  assert.equal(r.ok, false); assert.equal(r.raw_text, ''); assert.equal(r.error, 'PERMISSION_DENIED');
  const n = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  assert.equal(n.call({ action: 'ocr', t: n.t, mimeType: 'image/jpeg', base64: B64 }).error, 'OCR_NO_CONFIGURADO');
});
test('copia de datos: guarda, conserva respaldos, trae la última y rechaza basura', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  assert.equal(e.call({ action: 'loadState', t: e.t }).error, 'SIN_COPIA');
  assert.equal(e.call({ action: 'saveState', t: e.t, state: '{"x":1}' }).error, 'ESTADO_INVALIDO');
  assert.equal(e.call({ action: 'saveState', t: e.t, state: 'no json' }).error, 'ESTADO_INVALIDO');
  const s1 = JSON.stringify({ v: 2, projects: [{ name: 'A' }] }), s2 = JSON.stringify({ v: 2, projects: [{ name: 'B' }] });
  assert.equal(e.call({ action: 'saveState', t: e.t, state: s1 }).ok, true);
  assert.equal(e.call({ action: 'saveState', t: e.t, state: s2 }).ok, true);
  assert.equal(JSON.parse(e.call({ action: 'loadState', t: e.t }).state).projects[0].name, 'B');
  const copias = e.rootHolder.folders[0].folders.find(f => f.name === 'Copias de seguridad');
  assert.ok(copias.files.some(f => /^estado-\d{8}-\d{6}\.json$/.test(f.getName())), 'queda un respaldo de la versión anterior');
});
const child = (f, n) => f.folders.find(x => x.name === n);
test('archivar comprobante: carpeta del proyecto y del mes, idempotente', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  const payload = { action: 'saveFile', t: e.t, project: 'Invernadero 2026', mimeType: 'image/jpeg', base64: B64, fileName: 'a/b:c.jpg', issueDate: '2026-08-14' };
  const a = e.call(payload); assert.equal(a.ok, true, JSON.stringify(a)); assert.equal(a.folder, '2026-08'); assert.equal(a.idempotent, false);
  assert.match(a.where, /Invernadero 2026 . 4 Comprobantes . 2026-08/);
  const b = e.call(payload); assert.equal(b.idempotent, true); assert.equal(b.fileId, a.fileId);
  assert.equal(e.call(Object.assign({}, payload, { issueDate: '2026-13-01' })).error, 'FECHA_INVALIDA');
  const root = e.rootHolder.folders[0]; assert.equal(root.name, 'Rinde fácil');
  const dir = child(child(child(child(root, 'Proyectos'), 'Invernadero 2026'), '4 Comprobantes'), '2026-08');
  assert.equal(dir.files.length, 1); assert.ok(!/[\\/:]/.test(dir.files[0].getName()), 'nombre sin caracteres peligrosos');
});
test('archivar documentos generados: cada categoría en su carpeta; una versión nueva no pisa la anterior', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  const XL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const base = { action: 'saveFile', t: e.t, project: 'Invernadero 2026', mimeType: XL, fileName: 'carta-gantt.xlsx' };
  const v1 = e.call(Object.assign({ category: 'planificacion', base64: B64 }, base)); assert.equal(v1.ok, true); assert.equal(v1.folder, '1 Planificación');
  assert.equal(e.call(Object.assign({ category: 'planificacion', base64: B64 }, base)).idempotent, true, 'mismo contenido: no duplica');
  const B2 = Buffer.from('otra version').toString('base64');
  const v2 = e.call(Object.assign({ category: 'planificacion', base64: B2 }, base)); assert.equal(v2.ok, true); assert.match(v2.fileName, /^carta-gantt \(20260929-101500\)\.xlsx$/);
  const plan = child(child(child(e.rootHolder.folders[0], 'Proyectos'), 'Invernadero 2026'), '1 Planificación');
  assert.equal(plan.files.length, 2, 'las dos versiones quedan');
  assert.equal(e.call(Object.assign({ category: 'anexos', base64: B64 }, base, { fileName: 'anexo-1.xlsx' })).folder, '2 Anexos y formularios');
  assert.equal(e.call(Object.assign({ category: 'rendicion', base64: B64 }, base, { fileName: 'rendicion.xlsx' })).folder, '3 Rendición');
  assert.equal(e.call(Object.assign({ category: 'comprobante', base64: B64, issueDate: '2026-08-01' }, base)).error, 'TIPO_NO_PERMITIDO', 'un Excel no es un comprobante');
  const ficha = e.call(Object.assign({}, base, { category: 'comprobante', mimeType: 'text/plain', fileName: 'Proveedor-123.datos.txt', base64: B64, issueDate: '2026-08-01' }));
  assert.equal(ficha.ok, true); assert.equal(ficha.folder, '2026-08', 'la ficha de datos va junto a la foto');
  assert.equal(e.call(Object.assign({ category: 'otra', base64: B64 }, base)).error, 'CATEGORIA_INVALIDA');
  assert.equal(e.call(Object.assign({ category: 'anexos', base64: B64 }, base, { mimeType: 'application/x-msdownload' })).error, 'TIPO_NO_PERMITIDO');
});
test('folders: arma la carpeta Rinde fácil con su orden y el LEEME, sin duplicar', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  const a = e.call({ action: 'folders', t: e.t, project: 'Mi proyecto' }); assert.equal(a.ok, true); assert.ok(a.rootUrl && a.projectUrl);
  e.call({ action: 'folders', t: e.t, project: 'Mi proyecto' });
  assert.equal(e.rootHolder.folders.length, 1, 'una sola carpeta raíz');
  const root = e.rootHolder.folders[0];
  assert.deepEqual(root.folders.map(f => f.name).sort(), ['Actas de mesas de trabajo', 'Copias de seguridad', 'Documentos oficiales', 'Proyectos']);
  assert.equal(root.files.filter(f => f.getName() === 'LEEME.txt').length, 1);
  const pr = child(child(root, 'Proyectos'), 'Mi proyecto');
  assert.deepEqual(pr.folders.map(f => f.name).sort(), ['1 Planificación', '2 Anexos y formularios', '3 Rendición', '4 Comprobantes']);
});

test('documentos oficiales y actas van a la raíz: por tipo y por mes, sin pisar versiones', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  const PDF = 'application/pdf', DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const a = e.call({ action: 'saveFile', t: e.t, category: 'oficial', subfolder: 'Actas de no objeción', fileName: '2026-09-12 · Acta de no objeción.pdf', mimeType: PDF, base64: B64 });
  assert.equal(a.ok, true); assert.equal(a.where, 'Documentos oficiales / Actas de no objeción');
  const B2 = Buffer.from('version corregida').toString('base64');
  const b = e.call({ action: 'saveFile', t: e.t, category: 'oficial', subfolder: 'PEA y sus cambios', fileName: 'PEA corregido.docx', mimeType: DOCX, base64: B64 });
  assert.equal(b.ok, true); assert.equal(b.where, 'Documentos oficiales / PEA y sus cambios');
  const c = e.call({ action: 'saveFile', t: e.t, category: 'oficial', subfolder: 'PEA y sus cambios', fileName: 'PEA corregido.docx', mimeType: DOCX, base64: B2 });
  assert.match(c.fileName, /PEA corregido \(20260929-101500\)\.docx/, 'una versión nueva no pisa la anterior');
  assert.equal(e.call({ action: 'saveFile', t: e.t, category: 'oficial', fileName: 'sin tipo.pdf', mimeType: PDF, base64: B64 }).where, 'Documentos oficiales / Otros');
  const t = e.call({ action: 'saveFile', t: e.t, category: 'acta', fileName: 'Acta mesa.pdf', mimeType: PDF, base64: B64, issueDate: '2026-09-20' });
  assert.equal(t.where, 'Actas de mesas de trabajo / 2026-09');
  assert.equal(e.call({ action: 'saveFile', t: e.t, category: 'acta', fileName: 'x.pdf', mimeType: PDF, base64: B64, issueDate: 'mal' }).error, 'FECHA_INVALIDA');
  assert.equal(e.call({ action: 'saveFile', t: e.t, category: 'oficial', fileName: 'x.exe', mimeType: 'application/x-msdownload', base64: B64 }).error, 'TIPO_NO_PERMITIDO');
  const root = e.rootHolder.folders[0];
  assert.ok(child(child(child(root, 'Documentos oficiales'), 'Actas de no objeción'), 'x') === undefined);
  assert.equal(child(root, 'Documentos oficiales').folders.length, 3);
});
