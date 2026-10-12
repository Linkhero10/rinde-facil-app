/* Prueba del adaptador real (backend/CloudOcrAdapter.gs) con respuestas simuladas de Cloud Vision: no llama a Google ni cobra nada. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', 'backend', 'CloudOcrAdapter.gs'), 'utf8');

/* cuadro con sus cuatro esquinas; el borde superior va de v0 a v1 */
function box(x0, y0, x1, y1) {
  return { vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] };
}
/* cuadro girado: el borde superior apunta en la dirección `rot` (0, 90, 180, 270) */
function rotated(x, y, rot) {
  const d = { 0: [300, 0], 90: [0, 300], 180: [-300, 0], 270: [0, -300] }[rot];
  return { vertices: [{ x, y }, { x: x + d[0], y: y + d[1] }, { x: x + d[0], y: y + d[1] + 20 }, { x, y: y + 20 }] };
}
function paragraph(text, x, y, rot) {
  const bb = rot ? rotated(x, y, rot) : box(x, y, x + 300, y + 20);
  return { boundingBox: bb, words: [{ boundingBox: bb, symbols: [...text].map(c => ({ text: c })) }] };
}
/* respuesta de una página: texto y párrafos; `rot` gira todo el texto de la página */
function pageResponse(num, texts, rot = 0) {
  const paragraphs = texts.map((t, i) => paragraph(t, 100, 200 + i * 60, rot));
  return {
    context: { pageNumber: num },
    fullTextAnnotation: { text: texts.join('\n'), pages: [{ width: 1000, height: 1400, blocks: [{ paragraphs }] }] }
  };
}

/* entorno de Apps Script simulado: UrlFetchApp devuelve la siguiente respuesta de la lista */
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

test('PDF de 7 páginas sin número de páginas: descubre el total y lee el resto', () => {
  const first = { responses: [{ totalPages: 7, responses: [1, 2, 3, 4, 5].map(n => pageResponse(n, ['Proyecto ' + n])) }] };
  const rest = { responses: [{ totalPages: 7, responses: [6, 7].map(n => pageResponse(n, ['Pag ' + n], n === 6 ? 90 : 0)) }] };
  const { ctx, calls } = env([{ body: first }, { body: rest }]);
  const out = JSON.parse(JSON.stringify(ctx.callCloudVision_(pdfBlob(), {})));
  assert.equal(out.status, 'SUCCESS');
  assert.equal(out.document_coverage, 'COMPLETE');
  assert.equal(out.total_pages, 7);
  // la primera llamada no envía «pages»: la API lee las primeras cinco páginas y devuelve el total
  assert.deepEqual(JSON.parse(JSON.stringify(calls.map(c => c.requests[0].pages))), [null, [6, 7]]);
  assert.equal(out.pages_layout.length, 7);
  assert.deepEqual(out.pages_layout.map(p => p.number), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(out.pages_layout[5].angle, 90, 'la página 6 está girada');
  assert.equal(out.pages_layout[0].angle, 0);
});

test('cada párrafo trae su caja normalizada y su ángulo', () => {
  const first = { responses: [{ totalPages: 1, responses: [pageResponse(1, ['Monto total $7.500', 'Ítem B'])] }] };
  const { ctx } = env([{ body: first }]);
  const out = JSON.parse(JSON.stringify(ctx.callCloudVision_(pdfBlob(), { page_count: 1 })));
  const par = out.pages_layout[0].paragraphs[0];
  assert.equal(par.text, 'Monto total $7.500');
  assert.equal(par.angle, 0);
  for (const k of ['x0', 'y0', 'x1', 'y1']) assert.ok(par.box[k] >= 0 && par.box[k] <= 1, k);
  assert.equal(Math.round(par.box.x0 * 1000), 100);
  assert.equal(Math.round(par.box.y0 * 1400), 200);
});

test('una página completa volteada sale con su rotación de 180 grados', () => {
  const first = { responses: [{ totalPages: 1, responses: [pageResponse(1, ['texto al revés', 'otra línea'], 180)] }] };
  const { ctx } = env([{ body: first }]);
  const out = ctx.callCloudVision_(pdfBlob(), { page_count: 1 });
  assert.equal(out.pages_layout[0].angle, 180);
  assert.equal(out.pages_layout[0].paragraphs[0].angle, 180);
});

test('error de la API: no devuelve texto ni disposición de páginas', () => {
  const { ctx } = env([{ body: { responses: [{ error: { message: 'billing disabled' } }] } }]);
  const out = ctx.callCloudVision_(pdfBlob(), { page_count: 1 });
  assert.equal(out.status, 'ERROR');
  assert.equal(out.raw_text, '');
});

test('sin proyecto de Google configurado: error controlado sin llamar a la API', () => {
  const { ctx, calls } = env([]);
  ctx.PropertiesService.getScriptProperties = () => ({ getProperty: () => '' });
  const out = ctx.callCloudVision_(pdfBlob(), { page_count: 1 });
  assert.equal(out.status, 'ERROR');
  assert.equal(out.configuration_required, true);
  assert.equal(calls.length, 0);
});
