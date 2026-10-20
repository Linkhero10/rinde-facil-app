/* Hallazgos 8, 9 y 11 de la línea base del reviewer, sobre backend/WebApi.gs real con Apps Script simulado (no llama a Google). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas_sim.mjs';

const B64 = Buffer.from('imagen-de-prueba').toString('base64');
const PDF = 'application/pdf';

test('H3 (hallazgo 8): «constructor», «toString» y otras propiedades heredadas no son categorías de archivo', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  for (const categoria of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    const r = e.call({ action: 'saveFile', t: e.t, category: categoria, fileName: 'prueba.pdf', mimeType: PDF, base64: B64 });
    assert.equal(r.error, 'CATEGORIA_INVALIDA', categoria);
  }
  assert.equal(e.call({ action: 'saveFile', t: e.t, category: 'oficial', fileName: 'control.pdf', mimeType: PDF, base64: B64 }).ok, true, 'una categoría válida sigue funcionando');
  const raiz = e.rootHolder.folders[0];
  assert.ok(!raiz.folders.some(f => /function|\[native code\]/.test(f.name)), 'no se creó ninguna carpeta con el texto de una función');
});

test('H9 (hallazgo 11): sin un baseRev válido no se guarda si ya hay versión; con el correcto sí; «force» solo salva la igualdad', () => {
  const e = makeEnv({ RINDE_FACIL_SETUP_CODE: 'k' });
  const s = n => JSON.stringify({ v: 2, projects: [{ name: n }] });
  assert.equal(e.call({ action: 'saveState', t: e.t, state: s('A') }).rev, 1, 'la primera vez no hace falta baseRev');
  assert.equal(e.call({ action: 'saveState', t: e.t, state: s('B'), baseRev: 1 }).rev, 2);
  const sinBase = e.call({ action: 'saveState', t: e.t, state: s('C') });
  assert.equal(sinBase.error, 'CONFLICTO'); assert.equal(sinBase.rev, 2);
  for (const baseRev of ['abc', '', 1.5, true]) {
    assert.equal(e.call({ action: 'saveState', t: e.t, state: s('C'), baseRev }).error, 'CONFLICTO', JSON.stringify(baseRev));
  }
  assert.equal(JSON.parse(e.call({ action: 'loadState', t: e.t }).state).projects[0].name, 'B', 'nada se pisó');
  assert.equal(e.call({ action: 'saveState', t: e.t, state: s('C'), baseRev: '2' }).rev, 3, 'un número escrito como texto también vale');
  assert.equal(e.call({ action: 'saveState', t: e.t, state: s('D'), force: true }).error, 'CONFLICTO', 'force no salva la ausencia de baseRev');
  assert.equal(e.call({ action: 'saveState', t: e.t, state: s('D'), baseRev: 2, force: true }).rev, 4, 'force salva la igualdad');
});

test('H4 (hallazgo 9): una lectura parcial de Cloud Vision no sale como válida: el servicio la marca como error, como hace el cliente de PDF', () => {
  const parcial = { status: 'SUCCESS', raw_text: 'texto de la primera página', document_coverage: 'PARTIAL_PAGE_SELECTION', page_count: 11, total_pages: 12, error: 'PDF_COVERAGE_INCOMPLETE: no se procesaron todas las páginas.' };
  const e = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy' }, parcial);
  const r = e.call({ action: 'ocr', t: e.t, mimeType: PDF, base64: B64 });
  assert.equal(r.ok, false);
  assert.match(r.error, /PDF_COVERAGE_INCOMPLETE/);
  assert.equal(r.document_coverage, 'PARTIAL_PAGE_SELECTION');
  const completa = makeEnv({ RINDE_FACIL_ACCESS_KEY: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy' }, Object.assign({}, parcial, { document_coverage: 'COMPLETE', page_count: 12, total_pages: 12, error: null }));
  assert.equal(completa.call({ action: 'ocr', t: completa.t, mimeType: PDF, base64: B64 }).ok, true, 'una cobertura completa sigue siendo válida');
});
