/* Todo documento que la app arma (acta, registros, anexos, informes) debe poder salir en HTML, Word, texto y Excel sin fallar,
 * y no debe dejar pasar HTML escrito por el usuario. (Encontró un error real: el borrador del acta usaba un bloque de firmas mal escrito.) */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(here, '..', 'js');
const base = fs.readdirSync(jsDir).filter(f => /^(0[1-2]|1\d|2\d)-.*\.js$/.test(f)).sort();
const RF = loadApp(base.concat(['31-forms.js', '37-repo.js']));
const EVIL = '<img src=x onerror=alert(1)>"\'&';

function salidas(doc) {
  const html = RF.exp.docToHtml(doc), word = RF.exp.docToWord(doc), txt = RF.exp.docToText(doc);
  const bytes = RF.exp.buildXlsx(RF.exp.docToSheets(doc));
  return { html, word, txt, bytes };
}

test('el borrador del acta y los registros salen en todos los formatos', () => {
  RF.store.reset();
  const acta = { id: 'a1', date: '2026-09-20', mode: 'presencial', place: 'Sede', asistentes: { corfo: 2, comunidad: 3, oc: 2 }, names: 'A, B', topics: 'Cambio de cronograma', agreements: [{ what: 'Enviar el PEA', who: 'comunidad', due: '2026-10-01', done: false }], state: 'firmada', fileName: 'acta.pdf' };
  RF.store.get().repo.actas.push(acta);
  RF.store.get().repo.docs.push({ id: 'd1', type: 'acta_no_objecion', title: 'Acta', date: '2026-09-12', from: 'corfo', projectId: '', peaChange: 'si', changes: { presupuesto: true }, fileName: 'a.pdf' });
  [RF.repo.actaDoc(acta), RF.repo.actasDoc(), RF.repo.docsDoc()].forEach(d => {
    const o = salidas(d);
    assert.ok(o.html.length > 200 && o.word.length > 200 && o.txt.length > 20);
    assert.equal(String.fromCharCode(o.bytes[0], o.bytes[1]), 'PK', 'un Excel real (ZIP)');
  });
  assert.match(salidas(RF.repo.actaDoc(acta)).html, /Firma · Organismo Colaborador/, 'las tres firmas');
});
test('los formularios (anexos e informes) salen en todos los formatos con datos vacíos y con datos', () => {
  RF.store.reset();
  RF.store.update(s => { const p = RF.store.newProject('Proyecto de prueba'); s.projects.push(p); s.activeProjectId = p.id; });
  const ctx = RF.forms.ctxNow();
  const ids = Object.keys(RF.forms.SCHEMAS);
  assert.ok(ids.length >= 12, 'hay ' + ids.length + ' formularios');
  ids.forEach(id => {
    const sc = RF.forms.SCHEMAS[id];
    const d = sc.defaults(ctx);
    const o = salidas(RF.forms.docOf(id, d, ctx));
    assert.ok(o.html.length > 100, id);
  });
});
test('lo que escribe una persona no se convierte en HTML en los documentos', () => {
  const doc = { title: EVIL, subtitle: EVIL, blocks: [{ t: 'p', text: EVIL }, { t: 'kv', rows: [[EVIL, EVIL]] }, { t: 'table', head: [EVIL], types: ['text'], rows: [[EVIL]] }, { t: 'sign', labels: [EVIL] }], footer: EVIL, sheet: 'x' };
  const o = salidas(doc);
  assert.ok(!/<img/i.test(o.html) && !/<img/i.test(o.word), 'sin etiqueta viva');
  assert.match(o.html, /&lt;img/);
});

test('el Word es un .docx de verdad (zip con word/document.xml) y trae el texto y la tabla', () => {
  const doc = { title: 'Prueba Word', subtitle: 'Sub', blocks: [{ t: 'h', text: 'Detalle' }, { t: 'table', head: ['A', 'Monto ($)'], types: ['text', 'money'], rows: [['Uno', 1500]], foot: ['Total', 'SUM'] }] };
  const bytes = RF.exp.docToDocx(doc);
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); /* PK */
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.includes('word/document.xml') && text.includes('[Content_Types].xml'));
  const xml = Buffer.from(bytes).toString('utf8');
  assert.ok(xml.includes('Prueba Word') && xml.includes('$ 1.500') && xml.includes('<w:tbl>'));
});

test('documento «pro»: portada, índice y gráficos salen en HTML (dibujo), Word (imagen y pie de página), texto y Excel (una hoja por sección con índice)', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const doc = { pro: true, sheetsBy: 'h', title: 'Expediente', subtitle: 'Comunidad', footTitle: 'Expediente · Prueba', blocks: [
    { t: 'cover', title: 'Proyecto', subtitle: 'Comunidad', rows: [['Comunidad', 'Sol'], ['RUT', '']] }, { t: 'toc' },
    { t: 'h', text: '1. Plata por cuenta' },
    { t: 'chart', kind: 'hbar', title: 'Rendido', items: [{ label: 'Operación', value: 50, max: 100, color: '#2a5db0', text: '$ 50 de $ 100' }], png },
    { t: 'chart', kind: 'vbar', title: 'Mes a mes', cats: [{ label: 'ene', year: '2026' }, { label: 'feb' }], series: [{ name: 'Operación', color: '#2a5db0', values: [10, 20] }] },
    { t: 'chart', kind: 'donut', title: 'Estado', center: '3', items: [{ label: 'Listos', value: 2, color: '#2e7d4f' }, { label: 'Pendientes', value: 1, color: '#b3261e' }] },
    { t: 'table', head: ['A', 'B'], types: ['text', 'money'], rows: [['x', 5]] },
    { t: 'h', text: '2. Gastos' }, { t: 'table', head: ['N°'], rows: [[1]] }] };
  const html = RF.exp.docToHtml(doc, { look: 'word' });
  assert.ok(/class="cover"/.test(html) && (html.match(/<figure class="chart">/g) || []).length === 3 && /<svg/.test(html) && /Contenido/.test(html));
  const zip = Buffer.from(RF.exp.docToDocx(doc)).toString('latin1');
  assert.ok(zip.includes('word/footer1.xml') && zip.includes('word/media/firma1.png') && zip.includes('w:br w:type="page"') && zip.includes('PAGE'), 'Word con imagen, salto de página y número de página');
  assert.ok(/Rendido/.test(RF.exp.docToText(doc)) && !/<svg/.test(RF.exp.docToText(doc)));
  const sheets = RF.exp.docToSheets(doc);
  assert.equal(sheets[0].name, 'Índice'); assert.ok(sheets.length >= 3, 'una hoja por sección: ' + sheets.map(s => s.name).join('|'));
  assert.equal(String.fromCharCode(...RF.exp.buildXlsx(sheets).slice(0, 2)), 'PK');
});
