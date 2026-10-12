/* Prueba del lector de Word (js/23-read-docx.js) con XML de ejemplo: no usa documentos reales de comunidades. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', 'js', '23-read-docx.js'), 'utf8');
const ctx = { TextDecoder, DataView, Uint8Array, console };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const R = ctx.RF.read;
const plain = x => JSON.parse(JSON.stringify(x));

/* envuelve filas y párrafos en el XML mínimo de Word */
function p(text) { return '<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t xml:space="preserve">' + text + '</w:t></w:r></w:p>'; }
function tc(content, opts = {}) {
  const span = opts.span ? '<w:gridSpan w:val="' + opts.span + '"/>' : '';
  const vm = opts.vmerge ? (opts.vmerge === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '';
  return '<w:tc><w:tcPr><w:tcW w:w="100" w:type="dxa"/>' + span + vm + '</w:tcPr>' + content + '</w:tc>';
}
function tr(cells) { return '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>' + cells.join('') + '</w:tr>'; }
function tbl(rows) { return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="1"/></w:tblGrid>' + rows.join('') + '</w:tbl>'; }
function doc(body) { return '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' + body + '</w:body></w:document>'; }

test('párrafos fuera de tablas, en orden, sin los vacíos', () => {
  const s = R.docxStructure(doc(p('Primero') + p('') + p('Segundo &amp; tercero')));
  assert.deepEqual(plain(s.paragraphs), ['Primero', 'Segundo & tercero']);
  assert.equal(s.tables.length, 0);
});

test('tabla simple: filas y columnas tal como están', () => {
  const s = R.docxStructure(doc(tbl([tr([tc(p('Cuenta')), tc(p('Monto'))]), tr([tc(p('RRHH')), tc(p('1.000'))])])));
  assert.deepEqual(plain(s.tables[0].grid), [['Cuenta', 'Monto'], ['RRHH', '1.000']]);
  assert.equal(s.tables[0].rows, 2);
  assert.equal(s.tables[0].cols, 2);
});

test('celda combinada en horizontal: el texto va en la primera columna y la rejilla queda completa', () => {
  const s = R.docxStructure(doc(tbl([
    tr([tc(p('Proyecto Yenapatur'), { span: 2 })]),
    tr([tc(p('Gastos')), tc(p('5.000'))])
  ])));
  assert.deepEqual(plain(s.tables[0].grid), [['Proyecto Yenapatur', ''], ['Gastos', '5.000']]);
});

test('celda combinada en vertical: la fila que sigue repite el texto de arriba', () => {
  const s = R.docxStructure(doc(tbl([
    tr([tc(p('Etapa 1'), { vmerge: 'restart' }), tc(p('Diseño'))]),
    tr([tc(p(''), { vmerge: 'continue' }), tc(p('Permisos'))])
  ])));
  assert.deepEqual(plain(s.tables[0].grid), [['Etapa 1', 'Diseño'], ['Etapa 1', 'Permisos']]);
});

test('varias celdas con varios párrafos se unen con salto de línea y los tabuladores cuentan como espacio', () => {
  const s = R.docxStructure(doc(tbl([tr([tc(p('Línea uno') + p('Línea dos') + '<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p>')])])));
  assert.equal(s.tables[0].grid[0][0], 'Línea uno\nLínea dos\nA B');
});

test('la tabla no contamina el texto de afuera', () => {
  const s = R.docxStructure(doc(p('Antes') + tbl([tr([tc(p('dentro'))])]) + p('Después')));
  assert.deepEqual(plain(s.paragraphs), ['Antes', 'Después']);
  assert.deepEqual(plain(s.tables[0].grid), [['dentro']]);
});
