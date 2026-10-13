/* Prueba de la unión de páginas leídas (js/28-pdf-pages.js). Usa resultados inventados: no toca archivos ni servicios. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', 'js', '28-pdf-pages.js'), 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const PP = ctx.RF.pdfPages;
const plain = x => JSON.parse(JSON.stringify(x));

const pagina = (n, texto) => ({ number: n, ok: true, raw_text: texto, pages: [{ number: 1, angle: 0, paragraphs: [{ text: texto, angle: 0, box: { x0: 0, y0: 0, x1: 1, y1: 1 } }] }] });

test('todas las páginas leídas: cobertura completa y texto en orden', () => {
  const r = plain(PP.aggregate([pagina(2, 'segunda'), pagina(1, 'primera'), pagina(3, 'tercera')], 3));
  assert.equal(r.ok, true);
  assert.equal(r.document_coverage, 'COMPLETE');
  assert.equal(r.total_pages, 3);
  assert.equal(r.page_count, 3);
  assert.equal(r.raw_text, 'primera\n\fsegunda\n\ftercera');
  assert.deepEqual(r.pages.map(p => p.number), [1, 2, 3]);
});

test('una página con error deja la cobertura incompleta y no aplica nada', () => {
  const malla = { number: 2, ok: false, raw_text: '', pages: [], error: 'VISION_403' };
  const r = plain(PP.aggregate([pagina(1, 'uno'), malla, pagina(3, 'tres')], 3));
  assert.equal(r.ok, false);
  assert.equal(r.document_coverage, 'PARTIAL_PAGE_SELECTION');
  assert.match(r.error, /página 2: VISION_403/);
});

test('una página faltante en la lista se reporta', () => {
  const r = plain(PP.aggregate([pagina(1, 'uno'), pagina(3, 'tres')], 3));
  assert.equal(r.ok, false);
  assert.match(r.error, /no se leyeron las páginas 2/);
});

test('una página en blanco (sin texto) cuenta como leída', () => {
  const blanca = { number: 2, ok: false, raw_text: '', pages: [], error: 'OCR_SIN_TEXTO' };
  const r = plain(PP.aggregate([pagina(1, 'uno'), blanca], 2));
  assert.equal(r.document_coverage, 'COMPLETE');
  assert.equal(r.ok, true);
  assert.equal(r.raw_text, 'uno');
});

test('una hoja en blanco con el mensaje del servicio «no devolvió texto» cuenta como leída', () => {
  const blanca = { number: 2, ok: false, raw_text: '', pages: [], error: 'Cloud Vision no devolvió texto.' };
  const r = plain(PP.aggregate([pagina(1, 'uno'), blanca], 2));
  assert.equal(r.document_coverage, 'COMPLETE');
  assert.equal(r.raw_text, 'uno');
});

test('ningún texto en ninguna página: error claro', () => {
  const vacias = [1, 2].map(n => ({ number: n, ok: false, raw_text: '', pages: [], error: 'OCR_SIN_TEXTO' }));
  const r = plain(PP.aggregate(vacias, 2));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'OCR_SIN_TEXTO');
});
