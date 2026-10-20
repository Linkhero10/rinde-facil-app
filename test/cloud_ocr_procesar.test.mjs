/* Hallazgos 6 y 7 de la línea base del reviewer: processDocumentWithConfiguredOcr (backend/CloudOcrAdapter.gs) con Apps Script simulado.
   Ninguna llamada llega a Google: Vision, Drive y el analizador de recibos son respuestas preparadas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const codigo = fs.readFileSync(path.join(here, '..', 'backend', 'CloudOcrAdapter.gs'), 'utf8');

const respuesta = (codigoHttp, cuerpo) => ({ getResponseCode: () => codigoHttp, getContentText: () => JSON.stringify(cuerpo) });
function caja(x0, y0, x1, y1) {
  return { vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] };
}
function pagina(num, textos) {
  const parrafos = textos.map((t, i) => ({ boundingBox: caja(100, 200 + i * 60, 400, 220 + i * 60), words: [{ boundingBox: caja(100, 200 + i * 60, 400, 220 + i * 60), symbols: [...t].map(c => ({ text: c })) }] }));
  return { context: { pageNumber: num }, fullTextAnnotation: { text: textos.join('\n'), pages: [{ width: 1000, height: 1400, blocks: [{ paragraphs: parrafos }] }] } };
}

/* entorno con las propiedades de la prueba; Vision, Drive y el analizador son respuestas preparadas */
function entorno(propiedades) {
  const props = new Map(Object.entries(propiedades));
  const h = { parseLlamadas: [], drive: { resultado: null } };
  const blob = { getContentType: () => 'application/pdf', getBytes: () => Buffer.from('%PDF-falso') };
  h.ctx = {
    console, JSON, Math, Date, Number, String, Object, Array, Error, Set, RegExp, Buffer, Promise,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (props.has(k) ? props.get(k) : null) }) },
    ScriptApp: { getOAuthToken: () => 'token-falso' },
    Utilities: { base64Encode: b => Buffer.from(b).toString('base64') },
    Logger: { log: () => {} },
    UrlFetchApp: { fetch: () => { throw new Error('la prueba no preparó la respuesta de Vision'); } },
    DriveApp: { getFileById: () => ({ getBlob: () => blob, getName: () => 'documento-prueba.pdf' }) },
    computeFileSha256: () => 'sha-falso',
    extractTextFromDriveFileId: () => h.drive.resultado || { status: 'ERROR', raw_text: '', error: 'Drive sin resultado de prueba', ocr_engine: 'drive_v3' },
    processDocumentWithDriveOcr: () => ({ status: 'ERROR', raw_text: '', error: 'no usado en esta prueba', ocr_engine: 'drive_v3' }),
    parseReceipt: (texto, motor) => { h.parseLlamadas.push({ texto, motor }); return { parser_status: 'OK', total: 7500 }; }
  };
  vm.createContext(h.ctx);
  vm.runInContext(codigo, h.ctx);
  return h;
}

test('H8 (hallazgo 6): un error de permisos de Cloud Vision se muestra como tal, no como cobertura incompleta', () => {
  const h = entorno({ RINDE_FACIL_OCR_PROVIDER: 'cloud_vision', RINDE_FACIL_GCP_PROJECT_ID: 'proyecto-prueba' });
  h.ctx.UrlFetchApp.fetch = () => respuesta(403, { error: { message: 'PERMISSION_DENIED: API no habilitada (prueba)' } });
  const r = h.ctx.processDocumentWithConfiguredOcr('archivo-1');
  assert.match(r.ocr_error, /PERMISSION_DENIED/);
  assert.doesNotMatch(r.ocr_error, /no confirmó cobertura completa/);
  assert.equal(h.parseLlamadas.length, 0, 'un error no llega a extraer campos');
});

test('H8b (hallazgo 6): sin proyecto de Google, el aviso de configuración se muestra tal cual', () => {
  const h = entorno({ RINDE_FACIL_OCR_PROVIDER: 'cloud_vision' });
  const r = h.ctx.processDocumentWithConfiguredOcr('archivo-2');
  assert.match(r.ocr_error, /RINDE_FACIL_GCP_PROJECT_ID/);
  assert.doesNotMatch(r.ocr_error, /no confirmó cobertura completa/);
});

test('H6 (hallazgo 6): un error HTTP de Cloud Vision (500) sale con su motivo, no con el de cobertura', () => {
  const h = entorno({ RINDE_FACIL_OCR_PROVIDER: 'cloud_vision', RINDE_FACIL_GCP_PROJECT_ID: 'proyecto-prueba' });
  h.ctx.UrlFetchApp.fetch = () => respuesta(500, { error: { message: 'Internal error (prueba)' } });
  const r = h.ctx.processDocumentWithConfiguredOcr('archivo-3');
  assert.match(r.ocr_error, /Internal error/);
  assert.doesNotMatch(r.ocr_error, /no confirmó cobertura completa/);
});

test('H7 (hallazgo 7): en modo hybrid, si Vision falla y Drive lee el documento, se usa el resultado de Drive', () => {
  const h = entorno({ RINDE_FACIL_OCR_PROVIDER: 'hybrid', RINDE_FACIL_GCP_PROJECT_ID: 'proyecto-prueba' });
  h.ctx.UrlFetchApp.fetch = () => respuesta(500, { error: { message: 'servicio no disponible (prueba)' } });
  h.drive.resultado = { status: 'SUCCESS', raw_text: 'texto de Drive de prueba', ocr_engine: 'drive_v3', error: null };
  const r = h.ctx.processDocumentWithConfiguredOcr('archivo-4');
  assert.equal(r.ocr_error, undefined, 'Drive completo no se descarta por la cobertura de Vision');
  assert.equal(h.parseLlamadas.length, 1);
  assert.equal(h.parseLlamadas[0].texto, 'texto de Drive de prueba');
});

test('regresión: una cobertura parcial de Cloud Vision sigue deteniendo el documento antes de extraer campos', () => {
  const h = entorno({ RINDE_FACIL_OCR_PROVIDER: 'cloud_vision', RINDE_FACIL_GCP_PROJECT_ID: 'proyecto-prueba' });
  /* se piden 2 páginas y Cloud Vision devuelve solo la primera */
  h.ctx.UrlFetchApp.fetch = () => respuesta(200, { responses: [{ responses: [pagina(1, ['texto de la primera página'])] }] });
  const r = h.ctx.processDocumentWithConfiguredOcr('archivo-5', { page_count: 2 });
  assert.match(r.ocr_error, /no confirmó cobertura completa/);
  assert.equal(h.parseLlamadas.length, 0);
});
