/* Cuota de OCR: rfOcr_ de backend/WebApi.gs con el adaptador real (backend/CloudOcrAdapter.gs) y Vision simulado.
   Ninguna llamada llega a Google. El contador es el de propiedades del script de la prueba. Límite diario por defecto: 100 páginas;
   no hay tope por archivo: un PDF se lee entero si cabe en el día, y si no cabe se rechaza antes de pedir las páginas que sobran. */
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
/* la respuesta de un lote de Vision: las páginas pedidas, con el total del archivo */
function lote(paginas, total) {
  return { responses: [{ totalPages: total, responses: paginas.map(n => pagina(n, 'página ' + n)) }] };
}
const rango = (desde, hasta) => Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

/* Vision simulado: cada respuesta de la lista sale en orden; la página pedida en cada llamada queda anotada */
function vision(e, respuestas) {
  const llamadas = [];
  e.ctx.UrlFetchApp = { fetch: (url, opciones) => {
    llamadas.push(JSON.parse(opciones.payload).requests[0].pages);
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(respuestas.shift()) };
  } };
  return llamadas;
}

/* servicio con el adaptador real en lugar del simulado de gas_sim */
function preparar(propiedades = {}) {
  const e = makeEnv(Object.assign({ RINDE_FACIL_ACCESS_KEY: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy' }, propiedades));
  e.ctx.ScriptApp = { getOAuthToken: () => 'token-falso' };
  vm.runInContext(adaptador, e.ctx);
  return e;
}
const pedir = (e, extra = {}) => e.call(Object.assign({ action: 'ocr', t: e.t, mimeType: PDF, base64: B64 }, extra));

test('con el contador en 99, un PDF de 12 páginas se rechaza tras el descubrimiento: solo cuesta la página reservada', () => {
  const e = preparar({ [CLAVE]: '99' });
  const llamadas = vision(e, [lote([1], 12)]);
  const r = pedir(e);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'LIMITE_DIARIO');
  assert.deepEqual(llamadas, [[1]], 'solo la página 1 llegó a Vision');
  assert.equal(e.P.get(CLAVE), '100', 'se cobró la página reservada; no las doce');
});

test('con el contador en 90, un PDF de 12 páginas también se rechaza, y el rechazo cuesta una página', () => {
  const e = preparar({ [CLAVE]: '90' });
  const llamadas = vision(e, [lote([1], 12)]);
  assert.equal(pedir(e).error, 'LIMITE_DIARIO');
  assert.equal(llamadas.length, 1);
  assert.equal(e.P.get(CLAVE), '91');
});

test('con el contador en 90, un PDF de 3 páginas se lee entero y se cobran exactamente sus tres páginas', () => {
  const e = preparar({ [CLAVE]: '90' });
  const llamadas = vision(e, [lote([1], 3), lote([2, 3], 3)]);
  const r = pedir(e);
  assert.equal(r.ok, true);
  assert.match(r.raw_text, /página 3/);
  assert.deepEqual(llamadas, [[1], [2, 3]]);
  assert.equal(r.used_today, 93);
  assert.equal(e.P.get(CLAVE), '93');
});

test('un PDF de 25 páginas se lee entero: no hay tope por archivo, solo el diario', () => {
  const e = preparar();
  const llamadas = vision(e, [lote([1], 25), lote(rango(2, 6), 25), lote(rango(7, 11), 25), lote(rango(12, 16), 25), lote(rango(17, 21), 25), lote(rango(22, 25), 25)]);
  const r = pedir(e);
  assert.equal(r.ok, true);
  assert.equal(r.document_coverage, 'COMPLETE');
  assert.equal(llamadas.length, 6);
  assert.equal(e.P.get(CLAVE), '25', 'se cobran las 25 páginas leídas');
});

test('maxPages del cliente no baja el tope: un PDF de 6 páginas se lee entero aunque el cliente pida 5', () => {
  const e = preparar();
  vision(e, [lote([1], 6), lote(rango(2, 6), 6)]);
  const r = pedir(e, { maxPages: 5 });
  assert.equal(r.ok, true);
  assert.equal(e.P.get(CLAVE), '6');
});

test('una imagen cuesta exactamente una página y devuelve su texto', () => {
  const e = preparar();
  vision(e, [{ responses: [pagina(1, 'TOTAL $7.500')] }]);
  const r = pedir(e, { mimeType: 'image/jpeg' });
  assert.equal(r.ok, true);
  assert.equal(r.raw_text, 'TOTAL $7.500');
  assert.equal(e.P.get(CLAVE), '1');
  assert.equal(r.used_today, 1);
});
