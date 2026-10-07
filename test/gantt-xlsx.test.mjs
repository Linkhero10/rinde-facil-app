/* Carta Gantt en Excel: los meses cubiertos van con la celda completa en amarillo, sin símbolo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp();

test('la celda de un mes cubierto lleva relleno amarillo y no el símbolo ■', () => {
  const sheets = RF.exp.docToSheets({ title: 'Carta Gantt', sheet: 'Carta Gantt', blocks: [
    { t: 'table', head: ['Actividad', 'ene', 'feb'], types: ['text', 'text', 'text'], widths: [30, 7, 7], rows: [['Compra de materiales', '■', '']] }
  ] });
  const row = sheets[0].rows.find(r => r[0] && r[0].v === 'Compra de materiales');
  assert.equal(row[1].s, 'mark');
  assert.equal(row[1].v, '');
  assert.notEqual(row[2].s, 'mark');
  assert.equal(sheets[0].cols[1], 7);
});
