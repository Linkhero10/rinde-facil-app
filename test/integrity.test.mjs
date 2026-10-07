import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadApp } from './load.mjs';

function app() {
  const files = fs.readdirSync(new URL('../js/', import.meta.url)).filter(f => /^(00|0[1-5]|1\d|2\d|33)-.*\.js$/.test(f)).sort();
  return loadApp(files.concat(['31-forms.js', '34-tools-gastos.js', '36-drive.js', '44-tools-historial.js']), { RF: { ui: {}, tools: {} } });
}
function state(RF) {
  const s = RF.store.defaults(), p = RF.store.newProject('Proyecto');
  p.id = 'p1'; s.projects = [p]; s.activeProjectId = p.id; RF.store.attach(s);
  return RF.store.get();
}
test('F2 permanece explícito y no produce exceso del aporte CORFO', () => {
  const RF = app(), p = state(RF).projects[0];
  p.budgetApproved.operacion = 100;
  p.budgetLines = [{ id: 'b1', cuenta: 'operacion', fuente: 'corfo', monto: 100 }, { id: 'b2', cuenta: 'operacion', fuente: 'propio', monto: 200 }];
  const t = RF.logic.totalsByCuenta(p).operacion;
  assert.equal(t.presupuestado, 300); assert.equal(t.corfo, 100); assert.equal(t.propio, 200);
  const items = RF.logic.reconcile(p, {}, '2026-10-06', []).groups.flatMap(g => g.items);
  assert.ok(!items.some(i => /supera lo aprobado|presupuestaste/.test(i.msg)));
});
test('rendición septiembre excluye octubre e informa cuántos gastos omitió', () => {
  const RF = app(), p = state(RF).projects[0];
  p.periodoInicio = '2026-09-01'; p.periodoFin = '2026-09-30';
  p.expenses = ['2026-09-15', '2026-10-01'].map((fecha, i) => ({ id: 'e' + i, fecha, cuenta: 'operacion', docType: 'boleta', folio: 'folio-' + i, total: 10, montoRendir: 10, has: {} }));
  const doc = RF.rendicion.rendicionDoc(p, {});
  assert.equal(doc.blocks[0].rows.length, 1);
  assert.equal(doc.blocks[0].rows[0][8], 'folio-0');
  assert.match(doc.footer, /1.*fuera del período/);
  assert.equal(p.expenses.length, 2);
  p.periodoFin = '';
  assert.throws(() => RF.rendicion.rendicionDoc(p, {}), /período.*válido/);
});
test('no elimina actividad ni etapa con gastos o presupuesto asociados', () => {
  const RF = app(), p = state(RF).projects[0];
  p.gantt.stages = [{ id: 's1', acts: [{ id: 'a1' }, { id: 'a2' }] }];
  p.expenses = [{ id: 'e1', actId: 'a1' }]; p.budgetLines = [{ id: 'b1', actId: 'a2' }];
  const before = JSON.stringify(p);
  assert.throws(() => RF.logic.removeActivity(p, 'a1'), /Reasigna/);
  assert.throws(() => RF.logic.removeStage(p, 's1'), /Reasigna/);
  assert.equal(JSON.stringify(p), before);
  p.expenses = []; p.budgetLines = []; RF.logic.removeActivity(p, 'a1');
  assert.equal(p.gantt.stages[0].acts.length, 1);
});
test('validación detecta actId inexistente en gasto y presupuesto', () => {
  const RF = app(), p = state(RF).projects[0];
  p.expenses = [{ id: 'e1', actId: 'missing', docType: 'boleta', has: {} }];
  p.budgetLines = [{ id: 'b1', actId: 'missing' }];
  assert.ok(RF.logic.evaluateExpense(p.expenses[0], p, {}, []).issues.some(i => i.id === 'actividad_invalida'));
  assert.ok(RF.logic.reconcile(p, {}, '2026-10-06', []).groups.flatMap(g => g.items).some(i => /presupuesto.*inexistente/.test(i.msg)));
});
for (const kind of ['gantt', 'expense', 'forms', 'name']) {
  test('conflicto ' + kind + ' no muta estado ni envía copia', async () => {
    const RF = app(), s = state(RF), p = s.projects[0];
    p.expenses = [{ id: 'e1', total: 10 }]; p.forms = { anexo: { data: { texto: 'local' } } };
    const remote = structuredClone(s), rp = remote.projects[0];
    if (kind === 'gantt') rp.gantt.stages = [{ id: 's2', acts: [] }];
    if (kind === 'expense') rp.expenses[0].total = 20;
    if (kind === 'forms') rp.forms.anexo.data.texto = 'remoto';
    if (kind === 'name') rp.name = 'Otro';
    rp.expenses.push({ id: 'e2', total: 30 });
    const before = JSON.stringify(s); let pushes = 0;
    RF.cloud.post = async action => { if (action === 'loadState') return { ok: true, state: JSON.stringify(remote), rev: 2 }; pushes++; return { ok: true }; };
    RF.ui.choiceBox = async () => 'merge';
    const result = await RF.drive.resolveConflict();
    assert.equal(result.ok, false); assert.match(result.text, /copias|Combinar|combinar/);
    assert.equal(pushes, 0); assert.equal(JSON.stringify(s), before);
  });
}
test('merge combina IDs nuevos y formularios por ID sin pisar registros', () => {
  const RF = app(), s = state(RF), p = s.projects[0];
  p.forms = { informeA: [{ id: 'f1', data: { texto: 'local' } }] };
  const remote = structuredClone(s);
  remote.projects[0].forms.informeA.push({ id: 'f2', data: { texto: 'remoto' } });
  remote.projects[0].expenses.push({ id: 'e2' });
  RF.store.mergeRemote(remote);
  assert.equal(RF.store.get().projects[0].forms.informeA.length, 2);
  assert.equal(RF.store.get().projects[0].expenses.length, 1);
});
test('merge rechaza proyectos con identificadores ausentes o duplicados sin mutar', () => {
  const RF = app(), s = state(RF), before = JSON.stringify(s);
  const remote = structuredClone(s);
  remote.projects.push(structuredClone(remote.projects[0]));
  assert.throws(() => RF.store.mergeRemote(remote), /identificadores/);
  assert.equal(JSON.stringify(RF.store.get()), before);
  remote.projects = [{ name: 'Sin identificador' }];
  assert.throws(() => RF.store.mergeRemote(remote), /identificadores/);
  assert.equal(JSON.stringify(RF.store.get()), before);
});
test('merge compara contenido de registros sin depender del orden de claves', () => {
  const RF = app(), s = state(RF);
  s.projects[0].expenses = [{ id: 'e1', total: 10 }];
  const remote = structuredClone(s); remote.projects[0].expenses = [{ total: 10, id: 'e1' }];
  assert.doesNotThrow(() => RF.store.mergeRemote(remote));
});

test('merge completa los datos de la comunidad campo a campo y junta los feriados; solo hay conflicto si ambos tienen un valor distinto', () => {
  const RF = app(), s = state(RF);
  s.community = { name: 'Comunidad A', rut: '', address: 'Calle 1', phone: '' };
  s.holidays = ['2026-09-18'];
  const remote = structuredClone(s);
  remote.community = { name: 'Comunidad A', rut: '76.543.210-3', address: '', phone: '+56 9 1111 2222' };
  remote.holidays = ['2026-09-19'];
  RF.store.mergeRemote(remote);
  const out = RF.store.get();
  assert.equal(out.community.rut, '76.543.210-3'); assert.equal(out.community.address, 'Calle 1'); assert.equal(out.community.phone, '+56 9 1111 2222');
  assert.equal(JSON.stringify(out.holidays), JSON.stringify(['2026-09-18', '2026-09-19']));
  const clash = structuredClone(RF.store.get()); clash.community.address = 'Otra calle';
  assert.throws(() => RF.store.mergeRemote(clash), /community|comunidad|Conflicto|conflict/i);
});

/* ---------- combinación con base (tres vías) y sincronización automática ---------- */
test('con base: lo que cambió solo un equipo se respeta, lo borrado se propaga y lo marcado no se pisa', () => {
  const RF = app(), s = state(RF), p = s.projects[0];
  p.name = 'Original'; p.gantt = { stages: [{ id: 's1', acts: [] }] };
  p.expenses = [{ id: 'e1', total: 10 }, { id: 'e2', total: 20 }, { id: 'e3', total: 30 }];
  p.done = { 'P-01:0': true, 'P-01:1': true };
  const base = RF.store.snapshotBase(RF.store.get());
  /* la nube (otro equipo): cambió el gantt, editó e1, borró e2 y agregó e4; desmarcó un paso */
  const remote = structuredClone(RF.store.get()), rp = remote.projects[0];
  rp.gantt = { stages: [{ id: 's1', acts: [{ id: 'a1' }] }] };
  rp.expenses = [{ id: 'e1', total: 11 }, { id: 'e3', total: 30 }, { id: 'e4', total: 40 }];
  delete rp.done['P-01:1']; rp.done['P-01:2'] = true;
  /* este equipo: cambió el nombre, editó e3 */
  p.name = 'Nuevo nombre'; p.expenses[2].total = 33;
  RF.store.mergeRemote(remote, base);
  const out = RF.store.get().projects[0];
  assert.equal(out.name, 'Nuevo nombre', 'lo que solo cambió aquí se conserva');
  assert.equal(out.gantt.stages[0].acts.length, 1, 'lo que solo cambió allá se trae');
  assert.equal(JSON.stringify(out.expenses.map(e => e.id + ':' + e.total)), JSON.stringify(['e1:11', 'e3:33', 'e4:40']), 'e1 editado allá, e2 borrado allá, e3 editado aquí, e4 nuevo');
  assert.equal(JSON.stringify(Object.keys(out.done).sort()), JSON.stringify(['P-01:0', 'P-01:2']), 'el paso desmarcado allá queda desmarcado y el marcado allá se trae');
});
test('con base: si los dos equipos cambian lo mismo de forma distinta, se detiene sin tocar nada', () => {
  const RF = app(), s = state(RF), p = s.projects[0];
  p.expenses = [{ id: 'e1', total: 10 }];
  const base = RF.store.snapshotBase(RF.store.get());
  const remote = structuredClone(RF.store.get()); remote.projects[0].expenses[0].total = 11;
  p.expenses[0].total = 12;
  const before = JSON.stringify(RF.store.get());
  assert.throws(() => RF.store.mergeRemote(remote, base), /registro e1/);
  assert.equal(JSON.stringify(RF.store.get()), before);
});
test('sincronización automática: trae lo del otro equipo, lo une con lo propio y sube el resultado; no hace nada si no hay diferencias', async () => {
  const RF = app(), s = state(RF), p = s.projects[0];
  s.cloud.apiUrl = 'https://script.google.com/macros/s/AKfycbTEST/exec'; s.cloud.rev = 1;
  RF.cloud.configured = () => true;
  RF.auth = { phase: () => 'open' };
  p.expenses = [{ id: 'e1', total: 10 }];
  RF.drive.markSynced();
  const remote = structuredClone(RF.store.get()); remote.projects[0].expenses.push({ id: 'e2', total: 20 });
  let pushed = null, calls = [];
  RF.cloud.post = async (action, payload) => { calls.push(action); if (action === 'loadState') return { ok: true, state: JSON.stringify(remote), rev: 2 }; pushed = payload; return { ok: true, rev: 3 }; };
  p.expenses.push({ id: 'e3', total: 30 }); /* cambio propio sin enviar */
  const r = await RF.drive.syncNow({ force: true });
  assert.equal(r.ok, true); assert.equal(r.merged, 1);
  assert.equal(JSON.stringify(RF.store.get().projects[0].expenses.map(e => e.id).sort()), JSON.stringify(['e1', 'e2', 'e3']));
  assert.equal(JSON.parse(pushed.state).projects[0].expenses.length, 3, 'subió la unión');
  assert.equal(RF.store.get().cloud.rev, 3);
  calls = [];
  RF.cloud.post = async (action) => { calls.push(action); return { ok: true, state: pushed.state, rev: 3 }; };
  const r2 = await RF.drive.syncNow({ force: true });
  assert.equal(r2.same, true); assert.equal(JSON.stringify(calls), JSON.stringify(['loadState']), 'sin diferencias solo consulta');
});

/* ---------- gastos: avisos automáticos, cotizaciones sin gasto y trámites opcionales ---------- */
test('al anotar un gasto se avisa solo si la fecha cae fuera de su actividad y si podría no financiarse', () => {
  const RF = app(), p = state(RF).projects[0];
  p.gantt.stages = [{ id: 's1', name: 'E1', acts: [{ id: 'a1', name: 'Taller', start: '2026-10-01', end: '2026-10-31' }] }];
  const e = { id: 'e1', docType: 'boleta', fecha: '2026-12-05', actId: 'a1', cuenta: 'operacion', total: 1000, montoRendir: 1000, has: {} };
  let ids = RF.logic.evaluateExpense(e, p, {}, [e]).issues.map(i => i.id);
  assert.ok(ids.includes('fecha_actividad'), 'fuera del plazo de la actividad');
  e.fecha = '2026-10-10'; e.noFin = { k4: true };
  ids = RF.logic.evaluateExpense(e, p, {}, [e]).issues.map(i => i.id);
  assert.ok(!ids.includes('fecha_actividad') && ids.includes('no_financiable'));
});
test('cotizaciones anotadas antes de comprar se vinculan solas a la boleta del proveedor elegido', () => {
  const RF = app(), p = state(RF).projects[0];
  p.cotizaciones = [{ id: 'q1', neto: 12000000, gastoId: '', elegido: 'Ferretería Sur', cots: [{ proveedor: 'Ferretería Sur', monto: 12000000 }, { proveedor: 'Otra Ltda', monto: 13000000 }] }];
  const e = { id: 'e1', docType: 'factura', proveedor: ' ferretería sur ', neto: 12000000, total: 14280000, cuenta: 'operacion', has: {} };
  assert.equal(RF.logic.effectiveHas(e, p).cotizaciones, true);
  e.proveedor = 'Otro';
  assert.ok(!RF.logic.effectiveHas(e, p).cotizaciones);
});
test('un trámite opcional no cuenta en el avance ni frena la fase', () => {
  const RF = app(), p = state(RF).projects[0];
  assert.equal(RF.logic.itemProgress(p, 'TRM-028').optional, true);
  assert.equal(RF.logic.itemProgress(p, 'TRM-030').optional, true);
  const before = RF.logic.progress(p).porFase.F2;
  ['TRM-027:0', 'TRM-027:1', 'TRM-027:2'].forEach(k => { p.done[k] = true; });
  assert.equal(RF.logic.progress(p).porFase.F2.complete, true, 'con el PEA hecho, la fase queda completa aunque no se use lo opcional');
  assert.equal(before.tramTotal, 1, 'solo cuenta el PEA');
});

test('Ficha D: de las fechas y el monto salen los meses, lo mensual (bruto y líquido a honorarios), el período y el avance; todo en orden de arriba hacia abajo', () => {
  const RF = app(), p = state(RF).projects[0];
  p.periodoInicio = '2026-07-01'; p.periodoFin = '2026-12-31';
  const sc = RF.forms.SCHEMAS.informeD, d = sc.defaults({ project: p, community: {} });
  Object.assign(d, { nombre: 'Ana', rut: '12.345.678-5', tipo: 'honorarios', desde: '2026-07-01', hasta: '2027-06-30', presupuestado: 12000000 });
  p.expenses = [{ id: 'g1', cuenta: 'rrhh', rutProveedor: '12345678-5', fecha: '2026-08-10', montoRendir: 1000000 }, { id: 'g2', cuenta: 'rrhh', rutProveedor: '9.999.999-9', fecha: '2026-08-10', montoRendir: 500000 }];
  sc.derive(d, { project: p, community: {} });
  assert.equal(d.meses, 12);
  assert.equal(d.mensualBruto, 1000000);
  assert.equal(d.mensualLiquido, Math.round(1000000 * (1 - 0.1525)), 'retención de honorarios 2026: 15,25 %');
  assert.equal(d.mesesPeriodo, 6); assert.equal(d.periodoBruto, 6000000);
  assert.equal(d.rendidoGastos, 1000000, 'solo los gastos de su RUT en la cuenta de recursos humanos');
  assert.equal(d.rendido, 1000000);
  assert.equal(d.avanceRealAcum, Math.round(1000000 * 100 / 12000000));
  d.tipo = 'contrato'; sc.derive(d, { project: p, community: {} });
  assert.equal(d.mensualLiquido, 0, 'con contrato el líquido depende de AFP, salud e impuesto: no se inventa');
  const order = sc.fields.map(f => f.k);
  assert.ok(order.indexOf('presupuestado') < order.indexOf('mensualBruto') && order.indexOf('desde') < order.indexOf('meses') && order.indexOf('mensualBruto') < order.indexOf('avance'), 'primero lo que se escribe, después lo que se calcula');
});
test('«Guardar todo en Drive»: cuenta los gastos con fecha que no tienen su ficha ni su foto en Drive y los respaldos sin subir', () => {
  const RF = app(), s = state(RF), p = s.projects[0];
  s.cloud.apiUrl = 'https://script.google.com/macros/s/AKfycbTEST/exec';
  RF.cloud.configured = () => true;
  p.expenses = [{ id: 'a', fecha: '2026-10-01', proveedor: 'Uno', total: 10, imgId: 'i1' }, { id: 'b', fecha: '2026-10-01', proveedor: 'Dos', total: 10, driveFichaAt: 'x', attach: { pago: { id: 'blob1' } } }, { id: 'c', fecha: '2026-10-01', proveedor: 'Tres', total: 10, driveFichaAt: 'x', driveId: 'd' }, { id: 'd' }];
  const kinds = RF.drive.pendingItems().map(i => i.kind + ':' + i.e.id);
  assert.equal(JSON.stringify(kinds), JSON.stringify(['gasto:a', 'respaldo:b']));
});

/* ---------- F29 y pasos que se marcan solos ---------- */
test('F29: sin F29 avisa y deja el IVA del mes listo; con F29 compara el crédito con el IVA de las facturas según cómo maneje el IVA la comunidad', () => {
  const RF = app(), p = state(RF).projects[0];
  p.expenses = [{ id: 'f1', docType: 'factura', fecha: '2026-09-10', proveedor: 'A', iva: 190000, neto: 1000000, total: 1190000 }, { id: 'f2', docType: 'factura', fecha: '2026-09-20', proveedor: 'B', iva: 95000, neto: 500000, total: 595000 }, { id: 'b1', docType: 'boleta', fecha: '2026-09-21', total: 5000 }];
  let a = RF.logic.f29Audit(p, { ivaModo: 'recupera' });
  assert.equal(a.items.length, 1); assert.equal(a.items[0].mes, '2026-09'); assert.equal(a.items[0].iva, 285000); assert.equal(a.items[0].level, 'warn');
  assert.ok(/Falta el F29/.test(a.items[0].msg) && /285\.000/.test(a.items[0].msg));
  p.f29 = [{ id: 'm', mes: '2026-09', creditos: '', file: { blobId: 'x' } }];
  assert.equal(RF.logic.f29Audit(p, { ivaModo: 'recupera' }).items[0].level, 'info', 'sin el total de créditos solo pide anotarlo');
  p.f29[0].creditos = 200000;
  assert.equal(RF.logic.f29Audit(p, { ivaModo: 'recupera' }).items[0].level, 'warn', 'declara menos crédito que el IVA de las facturas');
  p.f29[0].creditos = 400000;
  assert.equal(RF.logic.f29Audit(p, { ivaModo: 'recupera' }).items[0].level, 'ok');
  assert.equal(RF.logic.f29Audit(p, { ivaModo: 'no_usa' }).items[0].level, 'warn', 'si dijo que no usa el IVA y el crédito alcanza, pide aclarar (Anexo 2)');
  /* el F29 del mes cubre el requisito de las facturas de ese mes */
  assert.equal(RF.logic.effectiveHas(p.expenses[0], p).f29, true);
  assert.ok(!RF.logic.effectiveHas({ fecha: '2026-10-01' }, p).f29);
});
test('pasos que se marcan solos: el respaldo de cada gasto, las fichas y el desembolso salen de lo que ya hay en la app', () => {
  const RF = app(), s = state(RF), p = s.projects[0];
  const bump = () => RF.store.update(() => {}, { silent: true }); /* en la app todo cambio pasa por el almacén y renueva el cálculo */
  bump(); assert.equal(RF.logic.stepDone(p, 'P-03', 0), false);
  p.desembolso1 = '2026-07-01';
  bump(); assert.equal(RF.logic.stepDone(p, 'P-03', 0), true, 'anotar la fecha del primer pago marca el paso');
  bump(); assert.equal(RF.logic.autoStep(p, 'TRM-008', 0).done, false, 'sin gastos todavía no se puede dar por hecho');
  p.expenses = [{ id: 'e1', docType: 'factura', proveedor: 'Uno', total: 1190, neto: 1000, iva: 190, montoRendir: 1190, fecha: '2026-09-01', glosa: 'x', formaPago: 'transferencia', cuenta: 'operacion', has: {}, verified: false }];
  bump(); assert.equal(RF.logic.autoStep(p, 'TRM-008', 0).done, false, 'faltan la prueba de pago y el F29');
  bump(); assert.equal(RF.logic.autoStep(p, 'TRM-008', 1).done, false, 'falta marcar que lo revisó');
  p.expenses[0].has = { pago: true, f29: true }; p.expenses[0].verified = true;
  bump(); assert.equal(RF.logic.autoStep(p, 'TRM-008', 0).done, true); assert.equal(RF.logic.autoStep(p, 'TRM-008', 1).done, true);
  bump(); const ip = RF.logic.itemProgress(p, 'TRM-008');
  assert.equal(ip.done, 2); assert.equal(ip.complete, true, 'el trámite queda completo sin marcar nada a mano');
  p.expenses.push({ id: 'e2', cuenta: 'rrhh', proveedor: 'Ana', rutProveedor: '12.345.678-5', total: 500, fecha: '2026-09-02' });
  bump(); assert.equal(RF.logic.autoStep(p, 'TRM-007', 1).done, false, 'falta la ficha D de Ana');
  p.forms.informeD = [{ id: 'f', data: { nombre: 'Ana', rut: '12345678-5' } }];
  bump(); assert.equal(RF.logic.autoStep(p, 'TRM-007', 1).done, true);
  p.done['TRM-007:1'] = false; /* un paso manual sin marcar no esconde el automático */
  bump(); assert.equal(RF.logic.stepDone(p, 'TRM-007', 1), true);
});
test('desde un gasto se crea o abre su ficha C (inversión) o D (persona) con sus datos', () => {
  const RF = app(), s = state(RF), p = s.projects[0];
  const x = { id: 'e9', cuenta: 'inversion', proveedor: 'Maquinarias Sur', glosa: 'Compresor', montoRendir: 900000, fecha: '2026-09-05' };
  RF.forms.ficha(p, 'informeC', d => d.gastoId === 'e9', { gastoId: 'e9', nombre: x.glosa, proveedor: x.proveedor, rendido: x.montoRendir, desde: x.fecha });
  RF.forms.ficha(p, 'informeC', d => d.gastoId === 'e9', {});
  assert.equal(p.forms.informeC.length, 1, 'la segunda vez la abre, no la duplica');
  assert.equal(p.forms.informeC[0].data.nombre, 'Compresor'); assert.equal(p.forms.informeC[0].data.rendido, 900000);
});

test('historial: se anota solo, se une entre equipos sin duplicar y no pasa de 400 entradas', () => {
  const RF = app(), s = state(RF);
  RF.activity.log('gasto', 'Revisó el gasto A', 'gastos'); RF.activity.log('drive', 'Guardó 2 archivos en Drive.');
  assert.equal(RF.store.get().activity.length, 2);
  const remote = structuredClone(RF.store.get()); remote.activity.push({ id: 'ac-otro', t: '2026-10-07T10:00:00.000Z', who: 'Otra persona', kind: 'gasto', text: 'Revisó el gasto B', ref: '' });
  RF.store.mergeRemote(remote);
  assert.equal(RF.store.get().activity.length, 3);
  RF.store.mergeRemote(remote);
  assert.equal(RF.store.get().activity.length, 3, 'unir dos veces no duplica');
  for (let i = 0; i < 450; i++) RF.activity.log('gasto', 'x' + i);
  assert.equal(RF.store.get().activity.length, 400);
  assert.ok(s.activity.every(a => a.id && a.t && a.text));
});

test('Anexo 4: días, inicio y término se calculan entre sí en cualquier orden y el certificado parte por el nombre', () => {
  const RF = app(), p = state(RF).projects[0], sc = RF.forms.SCHEMAS.anexo4, ctx = { project: p, community: {} };
  assert.equal(sc.fields[0].k, 'viajero', 'lo primero es el nombre completo');
  const d = sc.defaults(ctx); d.filas = [{ desde: '2026-10-01', dias: 3, montoDia: 50000 }];
  d.filas[0]._last = 'dias'; sc.derive(d, ctx);
  assert.equal(d.filas[0].hasta, '2026-10-03', 'inicio + días → término'); assert.equal(d.total, 150000);
  const r = { desde: '2026-10-10', hasta: '2026-10-12', montoDia: 10000, _last: 'hasta' }; d.filas = [r]; sc.derive(d, ctx);
  assert.equal(r.dias, 3, 'inicio + término → días');
  const q = { hasta: '2026-10-12', dias: 2, _last: 'dias' }; d.filas = [q]; sc.derive(d, ctx);
  assert.equal(q.desde, '2026-10-11', 'término + días → inicio (si falta el inicio)');
});
test('Anexo 5: al elegir el gasto se rellenan documento, monto, mes y concepto; el monto a rendir sale del porcentaje', () => {
  const RF = app(), p = state(RF).projects[0], sc = RF.forms.SCHEMAS.anexo5;
  p.expenses = [{ id: 'g1', cuenta: 'administracion', proveedor: 'Enel', folio: '9981', fecha: '2026-09-12', neto: 84034, total: 100000, glosa: 'Cuenta de luz septiembre', pctUso: 30 }];
  const ctx = { project: p, community: { ivaModo: 'no_contribuyente' } }, d = sc.defaults(ctx), row = { gastoId: 'g1' };
  d.uso = [row]; sc.onCell('uso', 'gastoId', row, d, ctx); sc.derive(d, ctx);
  assert.equal(row.doc, '9981'); assert.equal(row.monto, 100000); assert.equal(row.periodo, '2026-09'); assert.equal(row.concepto, 'Luz'); assert.equal(row.pct, 30);
  assert.equal(row.aRendir, 30000); assert.equal(d.totalUso, 30000);
  ctx.community.ivaModo = 'recupera'; sc.onCell('uso', 'gastoId', row, d, { project: p, community: ctx.community });
  assert.equal(row.monto, 84034, 'si recupera el IVA, el neto');
});

test('la firma dibujada viaja en el Word (imagen incrustada) y en la vista de impresión; sin firma sigue la línea de siempre', () => {
  const RF = app();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const doc = { title: 'Declaración', blocks: [{ t: 'p', text: 'Texto' }, { t: 'sign', labels: ['Ana · Comunidad'], images: [png] }] };
  const zip = Buffer.from(RF.exp.docToDocx(doc)).toString('latin1');
  assert.ok(zip.includes('word/media/firma1.png') && zip.includes('word/_rels/document.xml.rels') && zip.includes('r:embed="rIdImg1"') && zip.includes('Extension="png"'), 'imagen, relación y tipo de contenido');
  const sin = Buffer.from(RF.exp.docToDocx({ title: 'x', blocks: [{ t: 'sign', labels: ['Ana'] }] })).toString('latin1');
  assert.ok(!sin.includes('word/media') && sin.includes('______________________'));
  assert.ok(RF.exp.docToHtml ? RF.exp.docToHtml(doc).includes('data:image/png;base64') : true);
});

test('hojas originales con el extracto marcado: cada recorte existe y corresponde a una hoja completa que se usa en la ruta', () => {
  const RF = app(), dir = new URL('../assets/docs/', import.meta.url);
  assert.ok(RF.tramites.HL.length >= 10);
  RF.tramites.HL.forEach(f => { assert.ok(fs.existsSync(new URL('hl/' + f, dir)), 'falta el recorte ' + f); assert.ok(fs.existsSync(new URL(f, dir)), 'falta la hoja completa ' + f); });
  const usados = new Set(RF.tramites.list.flatMap(t => (t.img || []).map(i => i[0])));
  assert.ok(RF.tramites.HL.some(f => usados.has(f)), 'al menos un recorte se usa en un trámite');
});
