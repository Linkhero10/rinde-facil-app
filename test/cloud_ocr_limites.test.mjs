/* Límites del adaptador OCR (backend/CloudOcrAdapter.gs): no hay tope por archivo; las páginas se piden en lotes de cinco y la
   cuota diaria (reservar) decide si un PDF cabe. Una respuesta de Document AI que no es JSON conserva el código HTTP.
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
/* el resto de páginas en lotes de cinco, como hace el adaptador */
function lotesDesde(desde, hasta) {
  const out = [];
  for (let i = desde; i <= hasta; i += 5) out.push(rango(i, Math.min(i + 4, hasta)));
  return out;
}

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
const paginasPedidas = calls => JSON.parse(JSON.stringify(calls.map(c => c.requests[0].pages)));

test('sin tope por archivo: 21 páginas explícitas se piden en lotes de cinco', () => {
  const replies = [rango(1, 5), rango(6, 10), rango(11, 15), rango(16, 20), [21]].map(p => lote(p, 21));
  const { ctx, calls } = env(replies);
  const out = ctx.callCloudVision_(pdfBlob(), { pages: rango(1, 21) });
  assert.doesNotMatch(String(out.error || ''), /DEMASIADAS/, 'ningún tope por archivo');
  assert.deepEqual(paginasPedidas(calls), [rango(1, 5), rango(6, 10), rango(11, 15), rango(16, 20), [21]]);
});

test('sin tope por archivo: un page_count de 25 se lee entero en lotes de cinco', () => {
  const replies = [rango(1, 5), rango(6, 10), rango(11, 15), rango(16, 20), rango(21, 25)].map(p => lote(p, 25));
  const { ctx, calls } = env(replies);
  const out = ctx.callCloudVision_(pdfBlob(), { page_count: 25 });
  assert.equal(out.document_coverage, 'COMPLETE');
  assert.equal(calls.length, 5);
});

test('PDF de 100 páginas: se reserva lo que falta, se lee entero y cobra exactamente 100', () => {
  const replies = [lote([1], 100), ...lotesDesde(2, 100).map(p => lote(p, 100))];
  const { ctx, calls } = env(replies);
  const reservas = [];
  const out = ctx.callCloudVision_(pdfBlob(), { reservar: n => { reservas.push(n); return { ok: true }; } });
  assert.deepEqual(reservas, [99], 'se reservan las 99 páginas que faltan, de una vez');
  assert.equal(out.status, 'SUCCESS');
  assert.equal(out.document_coverage, 'COMPLETE');
  assert.equal(out.pages_returned, 100);
  assert.equal(calls.length, 21, 'una llamada de descubrimiento y veinte de lotes');
});

test('PDF de 101 páginas con el límite diario agotado: se rechaza tras el descubrimiento, sin pedir más páginas', () => {
  const replies = [lote([1], 101)];
  const { ctx, calls } = env(replies);
  const out = ctx.callCloudVision_(pdfBlob(), { reservar: () => ({ ok: false, error: 'LIMITE_DIARIO' }) });
  assert.equal(out.status, 'ERROR');
  assert.equal(out.error, 'LIMITE_DIARIO');
  assert.equal(out.pages_returned, 1, 'solo cuesta la primera página');
  assert.equal(calls.length, 1, 'no se llama a Vision para las páginas que no caben');
});

test('B-1: una respuesta de Document AI que no es JSON conserva el código HTTP', () => {
  const { ctx } = env([]);
  ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'projects/p/locations/us/processors/x' }) };
  ctx.UrlFetchApp.fetch = () => ({ getResponseCode: () => 502, getContentText: () => '<html>Bad gateway</html>' });
  const out = ctx.callDocumentAi_(pdfBlob(), {});
  assert.equal(out.status, 'ERROR');
  assert.equal(out.error, 'Document AI HTTP 502: la respuesta no es JSON.');
});
