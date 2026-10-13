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

test('el texto para revisar separa cada página con «— página N —» y no cambia raw_text', () => {
  const r = plain(PP.aggregate([pagina(2, 'segunda'), pagina(1, 'primera')], 2));
  assert.equal(r.raw_text, 'primera\n\fsegunda');
  assert.equal(PP.reviewText(r), '— página 1 —\nprimera\n\n— página 2 —\nsegunda');
});

test('una hoja en blanco aparece marcada para revisar, pero fuera de raw_text', () => {
  const blanca = { number: 2, ok: false, raw_text: '', pages: [], error: 'Cloud Vision no devolvió texto.' };
  const r = plain(PP.aggregate([pagina(1, 'uno'), blanca], 2));
  assert.equal(r.ok, true);
  assert.equal(r.raw_text, 'uno');
  assert.equal(r.page_count, 2);
  assert.equal(PP.reviewText(r), '— página 1 —\nuno\n\n— página 2 —\n(sin texto: hoja en blanco)');
});

test('las páginas salen en orden de número aunque lleguen desordenadas', () => {
  const r = plain(PP.aggregate([pagina(3, 'c'), pagina(1, 'a'), pagina(2, 'b')], 3));
  assert.deepEqual(r.pageTexts.map(p => p.number), [1, 2, 3]);
  assert.deepEqual(r.pages.map(p => p.number), [1, 2, 3]);
  assert.equal(r.raw_text, 'a\n\fb\n\fc');
});

test('una página repetida se reporta y el resultado no queda completo', () => {
  const r = plain(PP.aggregate([pagina(1, 'uno'), pagina(2, 'dos'), pagina(2, 'dos otra vez')], 2));
  assert.equal(r.ok, false);
  assert.equal(r.document_coverage, 'PARTIAL_PAGE_SELECTION');
  assert.deepEqual(r.duplicatePages, [2]);
  assert.match(r.error, /páginas repetidas en la lectura: 2/);
});

test('un resultado de una página que no existe en el PDF se reporta', () => {
  const r = plain(PP.aggregate([pagina(1, 'uno'), pagina(4, 'cuatro')], 2));
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingPages, [2]);
  assert.match(r.error, /resultados de páginas fuera del PDF: 4/);
});

test('failedPages lista cada página fallida con su motivo y el resto sigue en el texto', () => {
  const malla = { number: 2, ok: false, raw_text: '', pages: [], error: 'Cloud Vision HTTP 500' };
  const grande = { number: 4, ok: false, raw_text: '', pages: [], error: 'ARCHIVO_MUY_GRANDE' };
  const r = plain(PP.aggregate([pagina(1, 'uno'), malla, pagina(3, 'tres'), grande], 4));
  assert.equal(r.ok, false);
  assert.deepEqual(r.failedPages, [{ number: 2, error: 'Cloud Vision HTTP 500' }, { number: 4, error: 'ARCHIVO_MUY_GRANDE' }]);
  assert.equal(r.error, 'página 2: Cloud Vision HTTP 500; página 4: ARCHIVO_MUY_GRANDE');
  assert.equal(r.page_count, 2);
  assert.deepEqual(r.pageTexts.map(p => p.number), [1, 3]);
});

test('un PDF sin páginas da un error claro', () => {
  const r = plain(PP.aggregate([], 0));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'el PDF no tiene páginas');
  assert.equal(PP.reviewText(r), '');
});
