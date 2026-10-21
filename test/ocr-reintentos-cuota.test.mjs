/* SMI-RF-03, revisión manual del reviewer: hallazgos O1 (la cuota no se devuelve), O2 (sin reintento en el servidor para
   Vision 408/429/5xx) y O4 (el error de Document AI se pierde). Escenarios 1 y 2 de repro-ocr-0225.cjs y el escenario 3.
   Vision simulado en el servicio de prueba de ocr-cuota.test.mjs. Ninguna llamada llega a Google. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { makeEnv } from './gas_sim.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const adaptador = fs.readFileSync(path.join(here, '..', 'backend', 'CloudOcrAdapter.gs'), 'utf8');
const PDF = 'application/pdf';
const B64 = Buffer.from('%PDF-falso').toString('base64');
const HOY = '2026-09-29'; /* lo que devuelve la simulación de fechas para yyyy-MM-dd */
const CLAVE = 'RINDE_FACIL_OCR_COUNT_' + HOY;

function pagina(num, texto) {
  const caja = { vertices: [{ x: 100, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 220 }, { x: 100, y: 220 }] };
  const parrafos = texto ? [{ boundingBox: caja, words: [{ boundingBox: caja, symbols: [...texto].map(c => ({ text: c })) }] }] : [];
  return { context: { pageNumber: num }, fullTextAnnotation: { text: texto, pages: [{ width: 1000, height: 1400, blocks: [{ paragraphs: parrafos }] }] } };
}
const respuesta200 = (cuerpo) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(cuerpo) });
const fallo = (codigo, mensaje) => ({ getResponseCode: () => codigo, getContentText: () => JSON.stringify({ error: { code: codigo, message: mensaje } }) });
const descubrimiento = () => respuesta200({ responses: [{ totalPages: 3, responses: [pagina(1, 'primera página')] }] });
const lote23 = () => respuesta200({ responses: [{ totalPages: 3, responses: [pagina(2, 'segunda'), pagina(3, 'tercera')] }] });

/* servicio con el adaptador real. Las esperas de los reintentos se registran; no se duerme de verdad */
function preparar(propiedades = {}) {
  const e = makeEnv(Object.assign({ RINDE_FACIL_ACCESS_KEY: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy' }, propiedades));
  e.ctx.ScriptApp = { getOAuthToken: () => 'token-falso' };
  e.esperas = [];
  e.ctx.Utilities.sleep = (ms) => { e.esperas.push(ms); };
  vm.runInContext(adaptador, e.ctx);
  return e;
}
const pedir = (e, extra = {}) => e.call(Object.assign({ action: 'ocr', t: e.t, mimeType: PDF, base64: B64 }, extra));

/* Vision simulado: la página 1 (descubrimiento) siempre responde bien; cada lote se responde con porLote(paginas, intento).
   Devuelve la lista de llamadas, en orden, como «1», «2,3», «2,3»… */
function vision(e, porLote) {
  const llamadas = [];
  const intentos = {};
  e.ctx.UrlFetchApp = { fetch: (url, opciones) => {
    const paginas = JSON.parse(opciones.payload).requests[0].pages || [];
    const clave = paginas.join(',');
    intentos[clave] = (intentos[clave] || 0) + 1;
    llamadas.push(clave);
    if (clave === '1') return descubrimiento();
    return porLote(paginas, intentos[clave]);
  } };
  return llamadas;
}

test('O1 (escenario 1 de la reproducción): PDF de 3 páginas, lote 2-3 con 429 que no cede: el contador queda en 1, la página leída', () => {
  const e = preparar({ [CLAVE]: '0' });
  vision(e, () => fallo(429, 'Quota exceeded for quota metric'));
  const r = pedir(e);
  assert.equal(r.ok, false);
  assert.equal(e.P.get(CLAVE), '1', 'la página 1 sí la leyó Vision y se cobra; las dos páginas no leídas vuelven al contador');
});

test('O1 (escenario 2 de la reproducción): un segundo intento del mismo PDF suma solo lo que Vision leyó: el contador queda en 2', () => {
  const e = preparar({ [CLAVE]: '0' });
  vision(e, () => fallo(429, 'Quota exceeded for quota metric'));
  pedir(e);
  const segundo = pedir(e);
  assert.equal(segundo.ok, false);
  assert.equal(e.P.get(CLAVE), '2');
});

test('O1: una imagen que Vision rechaza con 429 no deja cuota cobrada', () => {
  const e = preparar({ [CLAVE]: '0' });
  vision(e, () => fallo(429, 'Quota exceeded for quota metric'));
  const r = pedir(e, { mimeType: 'image/jpeg' });
  assert.equal(r.ok, false);
  assert.equal(e.P.get(CLAVE), '0', 'la única página no se leyó: vuelve al contador');
});

test('O1: un PDF que se lee entero sigue cobrando exactamente sus 3 páginas (sin devolver nada)', () => {
  const e = preparar({ [CLAVE]: '0' });
  vision(e, () => lote23());
  const r = pedir(e);
  assert.equal(r.ok, true);
  assert.equal(e.P.get(CLAVE), '3');
});

test('O2: un 429 transitorio del lote 2-3 se reintenta dentro del servidor: el PDF se lee entero y se cobran 3 páginas', () => {
  const e = preparar({ [CLAVE]: '0' });
  const llamadas = vision(e, (paginas, intento) => (intento === 1 ? fallo(429, 'Quota exceeded') : lote23()));
  const r = pedir(e);
  assert.equal(r.ok, true);
  assert.match(r.raw_text, /tercera/);
  assert.deepEqual(llamadas, ['1', '2,3', '2,3'], 'el lote se reintenta una vez');
  assert.deepEqual(e.esperas, [1500], 'espera antes del reintento, como el cliente página a página');
  assert.equal(e.P.get(CLAVE), '3', 'los reintentos no cobran la cuota otra vez');
});

test('O2: un 503 transitorio se reintenta; un 400 no se reintenta', () => {
  const e1 = preparar({ [CLAVE]: '0' });
  vision(e1, (paginas, intento) => (intento === 1 ? fallo(503, 'Service Unavailable') : lote23()));
  assert.equal(pedir(e1).ok, true);

  const e2 = preparar({ [CLAVE]: '0' });
  const llamadas = vision(e2, () => fallo(400, 'Invalid request'));
  assert.equal(pedir(e2).ok, false);
  assert.deepEqual(llamadas, ['1', '2,3'], 'un 400 no es un fallo pasajero: una sola llamada al lote');
  assert.equal(e2.P.get(CLAVE), '1');
});

test('O2: un 429 que no cede se reintenta dos veces (3 intentos en total) y después se rinde', () => {
  const e = preparar({ [CLAVE]: '0' });
  const llamadas = vision(e, () => fallo(429, 'Quota exceeded'));
  assert.equal(pedir(e).ok, false);
  assert.deepEqual(llamadas, ['1', '2,3', '2,3', '2,3']);
  assert.deepEqual(e.esperas, [1500, 3000]);
  assert.equal(e.P.get(CLAVE), '1');
});

test('O4 (escenario 3 de la reproducción): el error de cuota de Document AI llega al usuario, no «no devolvió texto»', () => {
  const e = preparar({ [CLAVE]: '0', RINDE_FACIL_DOCUMENT_AI_PROCESSOR: 'proc-prueba' });
  const r = vm.runInContext('parseDocumentAiPayload_', e.ctx)({ error: { code: 429, message: 'Quota exceeded for Document AI' } }, {});
  assert.equal(r.status, 'ERROR');
  assert.match(r.error, /Quota exceeded for Document AI/);
  assert.doesNotMatch(r.error, /no devolvió texto/);
});

test('O4: una respuesta de error de Document AI con HTTP 429 deja su mensaje en el resultado de callDocumentAi_', () => {
  const e = preparar({ [CLAVE]: '0', RINDE_FACIL_DOCUMENT_AI_PROCESSOR: 'proc-prueba' });
  e.ctx.UrlFetchApp = { fetch: () => fallo(429, 'Quota exceeded for Document AI') };
  const blob = { getBytes: () => [1, 2, 3], getContentType: () => 'application/pdf' };
  const r = vm.runInContext('callDocumentAi_', e.ctx)(blob, {});
  assert.equal(r.status, 'ERROR');
  assert.match(r.error, /Quota exceeded for Document AI/);
  assert.doesNotMatch(r.error, /no devolvió texto/);
});

test('O1 y O2: un lote que agota sus reintentos corta la petición: los lotes siguientes no se piden y su reserva se devuelve', () => {
  const e = preparar({ [CLAVE]: '0' });
  const llamadas = [];
  e.ctx.UrlFetchApp = { fetch: (url, opciones) => {
    const clave = (JSON.parse(opciones.payload).requests[0].pages || []).join(',');
    llamadas.push(clave);
    if (clave === '1') return respuesta200({ responses: [{ totalPages: 7, responses: [pagina(1, 'primera página')] }] });
    return fallo(429, 'Quota exceeded');
  } };
  assert.equal(pedir(e).ok, false);
  assert.deepEqual(llamadas, ['1', '2,3,4,5,6', '2,3,4,5,6', '2,3,4,5,6'], 'el lote 7 no se pide');
  assert.equal(e.P.get(CLAVE), '1', 'solo la página leída queda cobrada');
});

test('O4: un error HTTP de Document AI sin mensaje dice el código HTTP, no «no devolvió texto»', () => {
  const e = preparar({ [CLAVE]: '0', RINDE_FACIL_DOCUMENT_AI_PROCESSOR: 'proc-prueba' });
  e.ctx.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 429, getContentText: () => '{}' }) };
  const blob = { getBytes: () => [1, 2, 3], getContentType: () => 'application/pdf' };
  const r = vm.runInContext('callDocumentAi_', e.ctx)(blob, {});
  assert.equal(r.status, 'ERROR');
  assert.equal(r.error, 'Document AI HTTP 429');
});
