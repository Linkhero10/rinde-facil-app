import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadApp } from './load.mjs';
import { documentoFalso, buscar, botonPorTexto } from './dom-falso.mjs';

function app(neto = 12000000) {
  const files = fs.readdirSync(new URL('../js/', import.meta.url)).filter(f => /^(00|0[1-5]|1\d|2\d|33)-.*\.js$/.test(f)).sort();
  const RF = loadApp(files.concat(['30-ui.js', '31-forms.js', '32-tools-plan.js', '34-tools-gastos.js', '38-tools-needs.js', '40-views.js', '47-expediente.js']), {
    document: documentoFalso(), setTimeout: () => 0, addEventListener() {}
  });
  RF.store.addProject('Proyecto sintético');
  RF.store.get().community.ivaModo = 'recupera';
  const p = RF.store.project();
  const e = Object.assign(RF.rendicion.newExpense(), { proveedor: 'Proveedor principal', rutProveedor: '76.123.456-0', folio: '001', fecha: '2026-09-01', glosa: 'Materiales del proyecto', neto, total: neto, montoRendir: neto, has: { pago: true } });
  p.expenses.push(e);
  RF.app = { pendingEdit: e.id };
  return { RF, p, e, render: () => { RF.app.pendingEdit = e.id; return RF.tools.gastos.render(); }, evaluate: () => RF.logic.evaluateExpense(e, p, RF.store.get().community, p.expenses) };
}
function input(view, key) { return buscar(view, n => n.dataset.key === key)[0]; }
function change(view, key, value, event = 'input') { const el = input(view, key); assert.ok(el, key); if (event === 'change') el.checked = value; else el.value = value; el.dispatch(event); }
function valid(e) {
  e.segundaCotizacion = { proveedor: 'Alternativo', rut: '12.345.678-5', monto: 13000000, noRelacionados: true };
  e.attach = { segundaCotizacion: { id: 'att-alternativo', name: 'oferta.pdf', type: 'application/pdf' } };
}

test('neto bajo o igual al umbral no muestra el apartado; se abre al superarlo y conserva lo escrito al bajar', () => {
  const a = app(9000000), view = a.render();
  assert.doesNotMatch(view.textContent, /Segunda cotización/);
  change(view, 'neto', '10.000.000');
  assert.doesNotMatch(view.textContent, /Segunda cotización/);
  change(view, 'neto', '10.000.001');
  assert.match(view.textContent, /Segunda cotización/);
  change(view, 'proveedor', 'Principal');
  change(view, 'rut', '12.345.678-5');
  change(view, 'neto', '9.000.000');
  assert.doesNotMatch(view.textContent, /Segunda cotización/);
  assert.equal(a.e.segundaCotizacion.rut, '12.345.678-5');
});

test('sobre el umbral sin segunda oferta queda pendiente, sin casilla manual que permita omitirla', () => {
  const a = app(); a.e.has.cotizaciones = true;
  const view = a.render();
  assert.match(view.textContent, /Segunda cotización/);
  assert.equal(a.evaluate().status, 'error');
  assert.ok(a.evaluate().issues.some(i => i.id === 'falta_cotizaciones'));
  assert.equal(buscar(view, n => n.id === 'rq-cotizaciones').length, 0);
});

test('segunda oferta exige proveedor distinto, RUT válido y distinto, neto positivo, declaración y respaldo', () => {
  const a = app(); valid(a.e);
  assert.equal(a.evaluate().status, 'ok');
  for (const patch of [{ proveedor: a.e.proveedor }, { rut: a.e.rutProveedor }, { rut: '076123456-0' }, { rut: '12.345.678-9' }, { monto: 0 }, { noRelacionados: false }]) {
    valid(a.e); Object.assign(a.e.segundaCotizacion, patch);
    assert.equal(a.evaluate().status, 'error', JSON.stringify(patch));
  }
  valid(a.e); delete a.e.attach.segundaCotizacion;
  assert.equal(a.evaluate().status, 'error');
});

for (const exception of ['servicioTecnico', 'autorizacion']) {
  test('excepción ' + exception + ' se puede marcar dentro del gasto y lo completa', () => {
    const a = app(), view = a.render();
    change(view, exception, true, 'change');
    assert.equal(a.evaluate().status, 'ok');
    assert.match(view.textContent, /Segunda cotización/);
  });
}

test('adjuntar respaldo persiste los datos y actualiza la evaluación sin salir del editor', async () => {
  const a = app(); valid(a.e); delete a.e.attach;
  const stored = [], deleted = [];
  a.RF.blobs.put = async (id, file) => { stored.push([id, file.name]); };
  a.RF.blobs.del = async id => { deleted.push(id); };
  const view = a.render();
  const pick = view.querySelector('input[aria-label="Respaldo de la segunda cotización"]');
  assert.ok(pick);
  pick.files = [{ name: 'oferta.pdf', type: 'application/pdf' }]; pick.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stored.length, 1);
  assert.equal(a.e.attach.segundaCotizacion.name, 'oferta.pdf');
  assert.equal(a.evaluate().status, 'ok');
  const s = JSON.parse(a.RF.store.exportJSON());
  assert.equal(s.projects.find(p => p.id === a.p.id).expenses[0].segundaCotizacion.rut, '12.345.678-5');
  botonPorTexto(view, 'Quitar respaldo alternativo').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(a.evaluate().status, 'error');
  assert.equal(a.e.segundaCotizacion.proveedor, 'Alternativo');
  assert.deepEqual(deleted, [stored[0][0]]);
});

test('cargar, editar y guardar no modifica ni pierde registros históricos y los muestra dentro del gasto', () => {
  const a = app();
  a.p.cotizaciones = [{ id: 'q-antiguo', gastoId: a.e.id, descripcion: 'Compra antigua', neto: 12000000, elegido: a.e.proveedor, justificacion: 'Mejor plazo', cots: [{ proveedor: a.e.proveedor, monto: 12000000, fecha: '2026-08-01' }, { proveedor: 'Alternativo histórico', monto: 13000000, fecha: '2026-08-02' }], datoDesconocido: { conservar: true } }];
  const before = JSON.stringify(a.p.cotizaciones);
  a.RF.store.importJSON(a.RF.store.exportJSON());
  const view = a.render();
  assert.match(view.textContent, /Alternativo histórico/);
  assert.match(view.textContent, /Mejor plazo/);
  const p = a.RF.store.project();
  assert.equal(a.RF.logic.evaluateExpense(p.expenses[0], p, a.RF.store.get().community, p.expenses).status, 'ok');
  change(view, 'glosa', 'Materiales para actividad');
  const saved = JSON.parse(a.RF.store.exportJSON()).projects.find(p => p.id === a.p.id);
  assert.equal(JSON.stringify(saved.cotizaciones), before);
  assert.equal(saved.expenses[0].glosa, 'Materiales para actividad');
});

test('AUTO.cot_ok evalúa gastos actuales con el mismo criterio que el editor', () => {
  const a = app();
  a.RF.tramites.byId['TRM-006'].auto = { 0: 'cot_ok' };
  const check = () => { a.RF.store.update(() => {}, { silent: true }); return a.RF.logic.autoStep(a.p, 'TRM-006', 0); };
  assert.equal(check().done, false);
  valid(a.e);
  assert.equal(check().done, true);
  a.e.segundaCotizacion.noRelacionados = false;
  assert.equal(check().done, false);
});

test('menú, herramientas, trámites, necesidades, búsqueda y formatos no ofrecen la hoja retirada', () => {
  const { RF } = app();
  assert.equal(RF.tools.cotizaciones, undefined);
  assert.ok(RF.views.TOOL_GROUPS.every(g => !g.tools.includes('cotizaciones')));
  assert.equal(RF.needs.TOOL_ROLE.cotizaciones, undefined);
  assert.ok(Object.values(RF.needs.STEP_TOOLS).every(tools => !tools.includes('cotizaciones')));
  assert.ok(RF.tramites.list.every(t => !(t.tools || []).includes('cotizaciones')));
  assert.deepEqual(Array.from(RF.tramites.byId['TRM-006'].stepTools[0]), ['gastos']);
  assert.equal(RF.docs.hasPreview('cotizaciones'), false);
  assert.equal(RF.plan.cotDoc, undefined);
  assert.ok(RF.search.search('cotizaciones proveedores', 20).every(r => r.item.href !== '#/h/cotizaciones'));
});

test('rendición y expediente incluyen la comparación asociada al gasto, sus excepciones y respaldo', () => {
  const a = app(); valid(a.e);
  const model = a.RF.rendicion.rendicionDoc(a.p, {}), doc = JSON.stringify(model);
  assert.match(doc, /Alternativo/); assert.match(doc, /12.345.678-5/); assert.match(doc, /oferta.pdf/);
  for (const output of [a.RF.exp.docToText(model), a.RF.exp.docToHtml(model), JSON.stringify(a.RF.exp.docToSheets(model)), Buffer.from(a.RF.exp.docToDocx(model)).toString('utf8')]) {
    assert.match(output, /Alternativo/); assert.match(output, /oferta.pdf/);
  }
  assert.match(JSON.stringify(a.RF.dossier.build(a.p, a.RF.store.get())), /Alternativo/);
  a.e.servicioTecnico = true;
  assert.match(JSON.stringify(a.RF.rendicion.rendicionDoc(a.p, {})), /Servicio técnico-profesional/);
});

test('históricos, excepciones y compras sin gasto se conservan en documentos y búsqueda por proveedor', () => {
  const a = app();
  a.p.cotizaciones = [{ id: 'old', gastoId: a.e.id, neto: 12000000, servicioTecnico: true, cots: [{ proveedor: 'Alternativo histórico único', monto: 13000000, fecha: '2026-08-02' }], justificacion: 'Comparación anterior' }, { id: 'sin-vinculo', neto: 14000000, descripcion: 'Compra todavía sin gasto', cots: [{ proveedor: 'Proveedor sin compra', monto: 14000000 }] }];
  assert.equal(a.evaluate().status, 'ok', 'excepción técnica histórica');
  const record = a.p.cotizaciones[0]; record.servicioTecnico = false; record.autorizacion = true;
  assert.equal(a.evaluate().status, 'ok', 'autorización histórica');
  const results = a.RF.search.search('Alternativo histórico único', 20);
  assert.ok(results.some(r => r.item.kind === 'Tu gasto' && r.item.href === '#/h/gastos'));
  const doc = JSON.stringify(a.RF.rendicion.rendicionDoc(a.p, {}));
  assert.match(doc, /Comparación anterior/); assert.match(doc, /Compra todavía sin gasto/);
  a.p.periodoInicio = '2026-10-01'; a.p.periodoFin = '2026-10-31';
  assert.doesNotMatch(JSON.stringify(a.RF.rendicion.rendicionDoc(a.p, {})), /Alternativo histórico único/);
});

test('fallo al adjuntar conserva el respaldo anterior y los datos del gasto', async () => {
  const a = app(); valid(a.e);
  a.RF.blobs.put = async () => { throw new Error('Sin espacio'); };
  const view = a.render();
  const pick = view.querySelector('input[aria-label="Respaldo de la segunda cotización"]');
  pick.files = [{ name: 'reemplazo.pdf', type: 'application/pdf' }]; pick.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(a.e.attach.segundaCotizacion.name, 'oferta.pdf');
  assert.equal(a.evaluate().status, 'ok');
});

test('reemplazar limpia el archivo anterior tras guardar, y quitar respeta los usados por otro gasto', async () => {
  const a = app(); valid(a.e);
  const deleted = [];
  a.RF.blobs.put = async () => {};
  a.RF.blobs.del = async id => { deleted.push(id); };
  const view = a.render(), pick = view.querySelector('input[aria-label="Respaldo de la segunda cotización"]');
  pick.files = [{ name: 'reemplazo.pdf', type: 'application/pdf' }]; pick.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(deleted, ['att-alternativo']);
  const copy = JSON.parse(JSON.stringify(a.e)); copy.id = 'copia'; a.p.expenses.push(copy);
  botonPorTexto(view, 'Quitar respaldo alternativo').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(deleted, ['att-alternativo'], 'la copia todavía usa el archivo nuevo');
});
