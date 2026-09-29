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
    const f = { id: 'f' + (++idSeq), getUrl: () => 'https://drive.test/f', getName: () => name, getId: () => f.id, getBlob: () => ({ getDataAsString: () => (typeof data === 'string' ? data : Buffer.from(data).toString()) }), setContent: c => { data = c; }, setDescription: d => { desc = d; }, getDescription: () => desc, setTrashed: t => { trashed = t; f._trashed = t; }, _trashed: false };
    return f;
  }
  function makeFolder(name) {
    const files = [], folders = [];
    const it = arr => { let i = 0; return { hasNext: () => { while (i < arr.length && arr[i]._trashed) i++; return i < arr.length; }, next: () => arr[i++] }; };
    const fo = { name, id: 'd' + (++idSeq), files, folders, getName: () => name, getId: () => fo.id, getUrl: () => 'https://drive.test/' + fo.id,
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
  const copias = e.rootHolder.folders[0].folders.find(f => f.name === 'Copias de seguridad');
  assert.ok(copias.files.some(f => /^estado-\d{8}-\d{6}\.json$/.test(f.getName())), 'queda un respaldo de la versión anterior');
});
const child = (f, n) => f.folders.find(x => x.name === n);
test('archivar comprobante: carpeta del proyecto y del mes, idempotente', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  const payload = { action: 'saveFile', key: 'k', project: 'Invernadero 2026', mimeType: 'image/jpeg', base64: B64, fileName: 'a/b:c.jpg', issueDate: '2026-08-14' };
  const a = e.call(payload); assert.equal(a.ok, true); assert.equal(a.folder, '2026-08'); assert.equal(a.idempotent, false);
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
  const base = { action: 'saveFile', key: 'k', project: 'Invernadero 2026', mimeType: XL, fileName: 'carta-gantt.xlsx' };
  const v1 = e.call(Object.assign({ category: 'planificacion', base64: B64 }, base)); assert.equal(v1.ok, true); assert.equal(v1.folder, '1 Planificación');
  assert.equal(e.call(Object.assign({ category: 'planificacion', base64: B64 }, base)).idempotent, true, 'mismo contenido: no duplica');
  const B2 = Buffer.from('otra version').toString('base64');
  const v2 = e.call(Object.assign({ category: 'planificacion', base64: B2 }, base)); assert.equal(v2.ok, true); assert.match(v2.fileName, /^carta-gantt \(20260929-101500\)\.xlsx$/);
  const plan = child(child(child(e.rootHolder.folders[0], 'Proyectos'), 'Invernadero 2026'), '1 Planificación');
  assert.equal(plan.files.length, 2, 'las dos versiones quedan');
  assert.equal(e.call(Object.assign({ category: 'anexos', base64: B64 }, base, { fileName: 'anexo-1.xlsx' })).folder, '2 Anexos y formularios');
  assert.equal(e.call(Object.assign({ category: 'rendicion', base64: B64 }, base, { fileName: 'rendicion.xlsx' })).folder, '3 Rendición');
  assert.equal(e.call(Object.assign({ category: 'comprobante', base64: B64, issueDate: '2026-08-01' }, base)).error, 'TIPO_NO_PERMITIDO', 'un Excel no es un comprobante');
  assert.equal(e.call(Object.assign({ category: 'otra', base64: B64 }, base)).error, 'CATEGORIA_INVALIDA');
  assert.equal(e.call(Object.assign({ category: 'anexos', base64: B64 }, base, { mimeType: 'application/x-msdownload' })).error, 'TIPO_NO_PERMITIDO');
});
test('setup: arma la carpeta Rinde fácil con su orden y el LEEME, sin duplicar', () => {
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k' });
  const a = e.call({ action: 'setup', key: 'k', project: 'Mi proyecto' }); assert.equal(a.ok, true); assert.ok(a.rootUrl && a.projectUrl);
  e.call({ action: 'setup', key: 'k', project: 'Mi proyecto' });
  assert.equal(e.rootHolder.folders.length, 1, 'una sola carpeta raíz');
  const root = e.rootHolder.folders[0];
  assert.deepEqual(root.folders.map(f => f.name).sort(), ['Copias de seguridad', 'Proyectos']);
  assert.equal(root.files.filter(f => f.getName() === 'LEEME.txt').length, 1);
  const pr = child(child(root, 'Proyectos'), 'Mi proyecto');
  assert.deepEqual(pr.folders.map(f => f.name).sort(), ['1 Planificación', '2 Anexos y formularios', '3 Rendición', '4 Comprobantes']);
});
