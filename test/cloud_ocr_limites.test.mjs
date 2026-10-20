/* Límites del adaptador OCR (backend/CloudOcrAdapter.gs), hallazgos M-1 y B-1 de SMI-RF-03: el tope por petición vale también
   para las páginas explícitas y para page_count, y una respuesta de Document AI que no es JSON conserva el código HTTP.
   Usa respuestas simuladas: no llama a Google ni cobra nada. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', 'backend', 'CloudOcrAdapter.gs'), 'utf8');

/* una página de Vision con su texto */
function caja(x0, y0, x1, y1) {
  return { vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] };
}
function parrafo(texto, x, y) {
  const bb = caja(x, y, x + 300, y + 20);
  return { boundingBox: bb, words: [{ boundingBox: bb, symbols: [...texto].map(c => ({ text: c })) }] };
}
function pagina(num) {
  return {
    context: { pageNumber: num },
    fullTextAnnotation: { text: 'Página ' + num, pages: [{ width: 1000, height: 1400, blocks: [{ paragraphs: [parrafo('Página ' + num, 100, 200)] }] }] }
  };
}
/* la respuesta de un lote de Vision: sus páginas, con el total del archivo */
function lote(paginas, total) {
  return { body: { responses: [{ totalPages: total, responses: paginas.map(pagina) }] } };
}
const rango = (desde, hasta) => Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

/* entorno de Apps Script simulado: cada UrlFetchApp.fetch consume la siguiente respuesta de la lista */
function env(replies) {
  const calls = [];
  const ctx = {
    console, JSON, Math, Number, Object, Array, String, Date, Error, Set, Buffer,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'RINDE_FACIL_GCP_PROJECT_ID' ? 'proyecto-prueba' : '') }) },
    ScriptApp: { getOAuthToken: () => 'token-falso' },
    Utilities: { base64Encode: b => Buffer.from(b).toString('base64') },
    Logger: { log: () => {} },
    UrlFetchApp: {
      fetch: (url, opts) => {
        calls.push(JSON.parse(opts.payload));
        const r = replies.shift();
        return { getResponseCode: () => r.code || 200, getContentText: () => JSON.stringify(r.body) };
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, calls };
}
function pdfBlob() {
  return { getContentType: () => 'application/pdf', getBytes: () => Buffer.from('%PDF-falso') };
}

test('M-1: páginas explícitas por encima del tope por petición no llaman a Vision', () => {
  const { ctx, calls } = env([]);
  const out = ctx.callCloudVision_(pdfBlob(), { pages: rango(1, 21) });
  assert.equal(out.status, 'ERROR');
  assert.match(out.error, /^PDF_DEMASIADAS_PAGINAS/);
  assert.equal(calls.length, 0, 'no se llama a Vision ni se cobra nada');
});

test('M-1: un page_count por encima del tope no llama a Vision', () => {
  const { ctx, calls } = env([]);
  const out = ctx.callCloudVision_(pdfBlob(), { page_count: 25 });
  assert.equal(out.status, 'ERROR');
  assert.match(out.error, /^PDF_DEMASIADAS_PAGINAS/);
  assert.equal(calls.length, 0);
});

test('M-1: el max_pages del llamador también vale para las páginas explícitas', () => {
  const { ctx, calls } = env([]);
  const out = ctx.callCloudVision_(pdfBlob(), { pages: rango(1, 6), max_pages: 5 });
  assert.equal(out.status, 'ERROR');
  assert.match(out.error, /máximo por petición es 5/);
  assert.equal(calls.length, 0);
});

test('M-1: 20 páginas explícitas (el tope) sí se piden, en lotes de cinco', () => {
  const replies = [rango(1, 5), rango(6, 10), rango(11, 15), rango(16, 20)].map(p => lote(p, 20));
  const { ctx, calls } = env(replies);
  const out = ctx.callCloudVision_(pdfBlob(), { pages: rango(1, 20) });
  assert.doesNotMatch(String(out.error || ''), /PDF_DEMASIADAS_PAGINAS/);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.map(c => c.requests[0].pages))),
    [rango(1, 5), rango(6, 10), rango(11, 15), rango(16, 20)]);
});

test('B-1: una respuesta de Document AI que no es JSON conserva el código HTTP', () => {
  const { ctx } = env([]);
  ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'projects/p/locations/us/processors/x' }) };
  ctx.UrlFetchApp.fetch = () => ({ getResponseCode: () => 502, getContentText: () => '<html>Bad gateway</html>' });
  const out = ctx.callDocumentAi_(pdfBlob(), {});
  assert.equal(out.status, 'ERROR');
  assert.equal(out.error, 'Document AI HTTP 502: la respuesta no es JSON.');
});
