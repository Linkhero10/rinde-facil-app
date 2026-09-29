/* SOLO PARA PRUEBAS: ejecuta el WebApi.gs REAL con los servicios de Google simulados (Drive, propiedades, candado, criptografía).
   Lo usan backend.test.mjs (pruebas del servicio) y stub_api.mjs (servicio local para las pruebas de extremo a extremo). */
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', 'backend', 'WebApi.gs'), 'utf8');
export const b64of = (s) => crypto.createHash('sha256').update(s).digest('base64');
export const ACC = { user: 'Comunidad Atacameña de Prueba', saltP: Buffer.alloc(16, 7).toString('base64'), authKey: b64of('clave-1'), recSalt: Buffer.alloc(16, 9).toString('base64'), authKeyR: b64of('rec-1') };

export function makeEnv(props = {}, visionResult, opts = {}) {
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
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (P.has(k) ? P.get(k) : null), setProperty: (k, v) => P.set(k, String(v)), getKeys: () => Array.from(P.keys()), deleteProperty: k => { P.delete(k); } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() { } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', String(k)).update(String(v)).digest()).map(x => (x > 127 ? x - 256 : x)),
      base64Encode: b => Buffer.from(b.map(x => x & 255)).toString('base64'),
      base64EncodeWebSafe: b => Buffer.from(b.map(x => x & 255)).toString('base64url') + '=',
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
  const env = { ctx, P, rootHolder, t: null, call: (payload, raw) => JSON.parse(ctx.doPost({ postData: { contents: raw !== undefined ? raw : JSON.stringify(payload) } }).content) };
  const code0 = props.RINDE_FACIL_SETUP_CODE || props.RINDE_FACIL_ACCESS_KEY;
  if (code0 && !opts.anon) { const r = env.call(Object.assign({ action: 'setup', setupCode: code0 }, ACC)); if (!r.ok) throw new Error('setup: ' + JSON.stringify(r)); env.t = r.token; }
  return env;
}
