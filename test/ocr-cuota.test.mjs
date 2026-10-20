/* Hallazgo 2 (tope de OCR): rfOcr_ de backend/WebApi.gs con el adaptador real (backend/CloudOcrAdapter.gs) y Vision simulado.
   Ninguna llamada llega a Google. El contador es el de propiedades del script de la prueba. */
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

test('H1 (hallazgo 2): con el contador en 199, un PDF de 12 páginas se rechaza antes de pedir las páginas siguientes', () => {
  const e = preparar({ [CLAVE]: '199' });
  const llamadas = vision(e, [{ responses: [{ totalPages: 12, responses: [pagina(1, 'primera página')] }] }]);
  const r = pedir(e);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'LIMITE_DIARIO');
  assert.deepEqual(llamadas, [[1]], 'solo la página 1 llegó a Vision');
  assert.equal(e.P.get(CLAVE), '200', 'se cobró la página reservada; no las doce');
});

test('con el contador en 190, un PDF de 12 páginas también se rechaza, y el rechazo cuesta una página', () => {
  const e = preparar({ [CLAVE]: '190' });
  const llamadas = vision(e, [{ responses: [{ totalPages: 12, responses: [pagina(1, 'primera página')] }] }]);
  assert.equal(pedir(e).error, 'LIMITE_DIARIO');
  assert.equal(llamadas.length, 1);
  assert.equal(e.P.get(CLAVE), '191');
});

test('con el contador en 190, un PDF de 3 páginas se lee entero y se cobran exactamente sus tres páginas', () => {
  const e = preparar({ [CLAVE]: '190' });
  const llamadas = vision(e, [
    { responses: [{ totalPages: 3, responses: [pagina(1, 'primera')] }] },
    { responses: [{ totalPages: 3, responses: [pagina(2, 'segunda'), pagina(3, 'tercera')] }] }
  ]);
  const r = pedir(e);
  assert.equal(r.ok, true);
  assert.match(r.raw_text, /tercera/);
  assert.deepEqual(llamadas, [[1], [2, 3]]);
  assert.equal(r.used_today, 193);
  assert.equal(e.P.get(CLAVE), '193');
});

test('un PDF de más de 20 páginas se rechaza tras la primera página, sin leer el resto', () => {
  const e = preparar();
  const llamadas = vision(e, [{ responses: [{ totalPages: 25, responses: [pagina(1, 'primera')] }] }]);
  const r = pedir(e);
  assert.equal(r.ok, false);
  assert.match(r.error, /PDF_DEMASIADAS_PAGINAS/);
  assert.equal(llamadas.length, 1);
  assert.equal(e.P.get(CLAVE), '1');
});

test('maxPages baja el tope: con maxPages 5, un PDF de 6 páginas se rechaza', () => {
  const e = preparar();
  vision(e, [{ responses: [{ totalPages: 6, responses: [pagina(1, 'primera')] }] }]);
  assert.match(pedir(e, { maxPages: 5 }).error, /PDF_DEMASIADAS_PAGINAS/);
});

test('un maxPages que no es un entero positivo se rechaza antes de gastar cuota ni llamar a Vision', () => {
  const e = preparar({ [CLAVE]: '5' });
  const llamadas = vision(e, []);
  for (const maxPages of [0, -3, 2.5, 'abc']) {
    assert.equal(pedir(e, { maxPages }).error, 'MAX_PAGINAS_INVALIDO', String(maxPages));
  }
  assert.equal(llamadas.length, 0);
  assert.equal(e.P.get(CLAVE), '5');
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
