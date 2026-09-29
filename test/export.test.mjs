import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadApp } from './load.mjs';

const RF = loadApp();
const X = RF.exp;
const PY = 'D:/FARO_GLOBAL/.venvs/faro-runtime/Scripts/python.exe';

const doc = {
  title: 'Memoria de cálculo para gastos de administración', subtitle: 'Proyecto «Prueba» · Comunidad de ejemplo', sheet: 'Anexo 5',
  blocks: [
    { t: 'h', text: 'Por valor de uso' },
    { t: 'table', head: ['Concepto', 'Período', 'N° doc.', 'Monto documento', '% de uso', 'Monto a rendir'], types: ['text', 'text', 'text', 'money', 'pct', 'money'],
      rows: [['Luz', '2026-01', '4521', 100000, 30, 30000], ['Internet ñandú', '2026-02', '77', 45000, 50, 22500]], foot: ['Total', '', '', 'SUM', '', 'SUM'] },
    { t: 'kv', rows: [['Comunidad', 'Comunidad Indígena de Prueba'], ['Nota', 'Línea 1\nLínea 2']] },
    { t: 'sign', labels: ['Firma', 'Representante'] }
  ],
  footer: 'Formato basado en el Anexo 5 del Manual CORFO.'
};

test('xlsx: se puede abrir, conserva textos con tildes, números y fórmulas', () => {
  const bytes = X.buildXlsx(X.docToSheets(doc).concat([{ name: 'Otra: hoja/2', rows: [['a', 1, { v: 3, f: 'B1*3' }]] }]));
  assert.ok(bytes.length > 500);
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); /* PK */
  const tmp = path.join(os.tmpdir(), 'rf-test-' + Date.now() + '.xlsx');
  fs.writeFileSync(tmp, Buffer.from(bytes));
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
out = {'sheets': wb.sheetnames}
ws = wb.worksheets[0]
cells = {}
for row in ws.iter_rows():
    for c in row:
        if c.value is not None:
            cells[c.coordinate] = c.value
out['cells'] = cells
out['fmt'] = {'D5': ws['D5'].number_format, 'E5': ws['E5'].number_format}
out['second'] = {c.coordinate: c.value for row in wb.worksheets[1].iter_rows() for c in row if c.value is not None}
print(json.dumps(out, ensure_ascii=False))
`;
  const r = spawnSync(PY, ['-c', py, tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.equal(o.sheets[0], 'Anexo 5');
  assert.equal(o.sheets[1], 'Otra  hoja 2', 'nombre de hoja saneado (sin : / )');
  assert.equal(o.cells.A1, 'Memoria de cálculo para gastos de administración');
  const vals = Object.values(o.cells);
  assert.ok(vals.includes('Internet ñandú'));
  assert.ok(vals.includes(100000) && vals.includes(22500));
  const f = Object.values(o.cells).filter(v => typeof v === 'string' && v.startsWith('='));
  assert.equal(f.length, 2, 'dos totales con fórmula SUM: ' + JSON.stringify(f));
  assert.ok(f.every(x => /^=SUM\(/.test(x)));
  assert.equal(o.second.C1, '=B1*3');
});

test('texto y HTML del documento', () => {
  const t = X.docToText(doc);
  assert.match(t, /^MEMORIA DE CÁLCULO/);
  assert.match(t, /Luz\t2026-01\t4521\t\$ 100\.000\t30 %\t\$ 30\.000/);
  assert.match(t, /Total\t\t\t\$ 145\.000\t\t\$ 52\.500/);
  assert.match(t, /Nota: Línea 1\nLínea 2/);
  const h = X.docToHtml(doc);
  assert.match(h, /<table class="grid">/);
  assert.match(h, /Internet ñandú/);
  assert.ok(!/<script/i.test(h));
  const evil = X.docToHtml({ title: '<img src=x onerror=alert(1)>', blocks: [{ t: 'p', text: '<script>1</script>' }] });
  assert.ok(!/<img src=x/.test(evil) && !/<script>1/.test(evil), 'el contenido se escapa');
});

test('crc32 conocido', () => {
  const enc = new TextEncoder().encode('123456789');
  assert.equal(X.crc32(enc), 0xCBF43926);
});
