import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';
import { documentoFalso, buscar, botonPorTexto } from './dom-falso.mjs';

function app() {
  return loadApp(['01-util.js', '02-store.js', '10-data.js', '11-tramites.js', '12-needs.js', '13-holidays.js', '20-logic.js', '23-read-docx.js', '24-pea-extract.js', '25-pea-screen.js', '27-search.js', '30-ui.js', '31-forms.js', '32-tools-plan.js', '37-repo.js', '40-views.js', '42-tools-calendar.js'], {
    document: documentoFalso(), setTimeout: () => 0
  });
}
const admins = s => s.projects.filter(p => p.tipo === 'administracion');

test('D1: primer proyecto y comunidad migrada incluyen una administración transversal', () => {
  const RF = app();
  const p = RF.store.addProject('Proyecto sintético');
  const s = RF.store.get();
  assert.equal(admins(s).length, 1);
  assert.equal(admins(s)[0].name, 'Gastos administrativos');
  assert.equal(admins(s)[0].budgetApproved.administracion, 0);
  assert.equal(s.activeProjectId, p.id);
  assert.equal(admins(RF.store.migrate({ community: { name: 'Comunidad sintética' }, projects: [] })).length, 1);
});

test('D1: ensureAdminProject es idempotente y reconoce nombres antiguos y el tipo', () => {
  const RF = app(), s = RF.store.defaults();
  const old = RF.store.newProject('Gastos de administracion');
  old.expenses.push({ id: 'e-antiguo', total: 1 });
  const duplicate = RF.store.newProject('Gastos administrativos');
  duplicate.budgetLines.push({ id: 'b-antiguo', monto: 2 });
  s.projects.push(old, duplicate); s.activeProjectId = duplicate.id;
  const a = RF.store.ensureAdminProject(s, 450);
  RF.store.ensureAdminProject(s);
  assert.equal(admins(s).length, 1);
  assert.equal(a.id, old.id);
  assert.equal(s.activeProjectId, a.id);
  assert.equal(a.expenses[0].id, 'e-antiguo');
  assert.equal(a.budgetLines[0].id, 'b-antiguo');
  assert.equal(a.budgetApproved.administracion, 450);
  assert.equal(RF.store.esAdmin({ tipo: 'administracion', name: 'Otro nombre' }), true);
});

test('D1: PEA sin monto crea administración en cero y reaplicar no duplica', () => {
  const RF = app();
  const m = RF.pea.extractFromText('Proyecto N°1\nNombre del proyecto\nPROYECTO SINTÉTICO\n');
  assert.equal(admins(m).length, 1);
  const s = RF.pea.applyToState({ community: {}, projects: [] }, m);
  assert.equal(admins(s).length, 1);
  assert.equal(admins(s)[0].budgetApproved.administracion, 0);
  assert.equal(admins(RF.pea.applyToState(s, m)).length, 1);
});

test('D1: migración toma presupuestoAdmin del PEA general, incluido cero', () => {
  const RF = app(), p = RF.store.newProject('Proyecto sintético');
  p.forms.peaGeneral = { data: { presupuestoAdmin: 123 } };
  const s = RF.store.migrate({ projects: [p] });
  assert.equal(admins(s)[0].budgetApproved.administracion, 123);
  p.forms.peaGeneral.data.presupuestoAdmin = 0;
  assert.equal(admins(RF.store.migrate(s))[0].budgetApproved.administracion, 0);
  s.community.forms = { peaGeneral: { data: { presupuestoAdmin: 789 } } };
  assert.equal(admins(RF.store.migrate(s))[0].budgetApproved.administracion, 789);
});

test('D1: carga y alta real de comunidad guardan Administración desde el inicio', async () => {
  const RF = loadApp(undefined, { setTimeout: () => 0, setInterval: () => 0 });
  RF.crypto.ITERATIONS = 1000;
  assert.equal(admins(RF.store.load()).length, 1);
  await RF.auth.init();
  await RF.auth.createAccount('Comunidad sintética', 'frase de pruebas suficiente 2026', { iterations: 1000 });
  assert.equal(admins(RF.store.get()).length, 1);
  assert.equal(admins(await RF.vault.readState()).length, 1);
});

test('D1: aplicar PEA a datos antiguos reutiliza el id administrativo y conserva registros', () => {
  const RF = app(), old = RF.store.newProject('Gastos de administración');
  old.expenses.push({ id: 'g-historico', total: 10 });
  const s = RF.pea.applyToState({ community: {}, projects: [old] }, { projects: [] });
  assert.equal(admins(s).length, 1);
  assert.equal(admins(s)[0].id, old.id);
  assert.equal(admins(s)[0].expenses[0].id, 'g-historico');
});

test('D1: el presupuesto importado no retrocede al migrar un PEA general previo', () => {
  const RF = app(), p = RF.store.newProject('Proyecto sintético');
  p.forms.peaGeneral = { data: { presupuestoAdmin: 10, objetivos: 'Objetivo previo' } };
  for (const community of [{}, { forms: { peaGeneral: { data: { presupuestoAdmin: 15 } } } }]) {
    const s = RF.pea.applyToState({ community, projects: [p] }, {
      projects: [{ name: 'Gastos administrativos', budgetApproved: { administracion: 200 } }]
    });
    assert.equal(admins(RF.store.migrate(s))[0].budgetApproved.administracion, 200);
    assert.equal(s.projects.find(x => x.id === p.id).forms.peaGeneral.data.objetivos, 'Objetivo previo');
  }
});

test('D1: abrir Administración y agregar gasto reutilizan el proyecto existente', () => {
  const RF = app(); RF.store.addProject('Proyecto sintético');
  const s = RF.store.get(), ids = s.projects.map(p => p.id);
  const view = RF.tools.pea.render();
  botonPorTexto(view, 'Administración').dispatch('click');
  botonPorTexto(view, 'Agregar gasto de administración').dispatch('click');
  assert.deepEqual(s.projects.map(p => p.id), ids);
  assert.equal(admins(s)[0].budgetLines.length, 1);
});

test('D2: calculadora y calendario conservan aclaraciones sin plazo del PEA', () => {
  const RF = app(), p = RF.store.addProject('Proyecto sintético');
  p.peaAprobadoAt = '2026-01-01'; p.desembolso1 = '2026-02-01';
  p.observations.push({ id: 'o1', recibida: '2026-09-28' });
  const view = RF.tools.plazos.render();
  assert.doesNotMatch(view.textContent + RF.tools.plazos.desc, /PEA|90|prórroga|30 días/i);
  assert.match(view.textContent, /aclarar observaciones/);
  const field = buscar(view, n => n.tagName === 'INPUT' && n.getAttribute('type') === 'date')[0];
  assert.ok(field);
  field.value = '2026-09-28'; field.dispatch('input');
  assert.match(view.textContent, /13 de octubre de 2026/);
  const events = RF.calendar.collect(RF.store.get(), p);
  assert.ok(events.some(e => /aclarar la observación/.test(e.title)));
  assert.ok(events.some(e => e.date === p.desembolso1 && /Primer pago/.test(e.title)));
  assert.doesNotMatch(JSON.stringify(events), /plazo del PEA|prórroga|90 días/i);
  assert.equal(RF.logic.peaDeadline, undefined);
});

test('D2: prórroga no ofrece plazos ni fechas derivadas y conserva campos guardados', () => {
  const RF = app(), p = RF.store.addProject('Proyecto sintético');
  p.peaAprobadoAt = '2026-01-01';
  p.forms.prorroga = { data: { vencimiento: '2026-04-01', dias: 30, motivo: 'Dato guardado' } };
  const before = JSON.stringify(p.forms.prorroga);
  const schema = RF.forms.SCHEMAS.prorroga;
  assert.equal(schema.defaults(RF.forms.ctxNow()).vencimiento, '');
  assert.doesNotMatch(JSON.stringify(schema.fields) + JSON.stringify(schema.check(p.forms.prorroga.data)) + JSON.stringify(schema.doc(p.forms.prorroga.data, RF.forms.ctxNow())), /plazo del PEA|30 días|prórroga del PEA|prórroga del plazo/i);
  assert.equal(JSON.stringify(RF.store.migrate(RF.store.get()).projects.find(x => x.id === p.id).forms.prorroga), before);
});

test('D3: etiquetas propias dicen Acuerdo y el Word sigue leyendo la etiqueta oficial', () => {
  const RF = app();
  assert.equal(RF.data.ACTORS.find(a => a.id === 'comunidad').full, 'Titular del acuerdo');
  assert.match(RF.data.CONVENIOS['corfo-2026-09'].nombre, /^Acuerdo CORFO/);
  assert.match(RF.data.CONVENIOS['corfo-2026-09'].fuente, /flujograma del acuerdo/);
  assert.equal(RF.repo.TYPE_BY_ID.convenio.name, 'Acuerdo');
  assert.equal(RF.repo.TYPE_BY_ID.convenio.folder, 'Acuerdo');
  const m = RF.pea.extractFromStructure({ tables: [{ grid: [['NOMBRE ENCARGADO CONVENIO', 'Contacto Sintético']], rows: 1, cols: 2 }], paragraphs: [] });
  assert.equal(m.community.contacto.encargado, 'Contacto Sintético');
  const consult = RF.forms.SCHEMAS.consulta;
  assert.match(JSON.stringify(consult.fields), /Manual o del acuerdo/);
  assert.match(JSON.stringify(consult.doc({}, { community: {}, project: {} })), /Manual o del acuerdo/);
  assert.equal(RF.store.newProject('Proyecto sintético').convenio, 'corfo-2026-09');
  assert.equal(typeof RF.data.convenioDe, 'function');
  assert.equal(typeof RF.data.useConvenio, 'function');
  const p = RF.store.addProject('Proyecto sintético');
  assert.doesNotMatch(RF.tools.verificador.render().textContent, /convenio/i);
  assert.doesNotMatch(JSON.stringify(RF.pea.extractFromText('Texto sintético').warnings), /convenio/i);
  assert.match(JSON.stringify(RF.forms.SCHEMAS.anexo1.doc(RF.forms.SCHEMAS.anexo1.defaults({ community: {}, project: p }), { community: {}, project: p })), /Convenio suscrito con Corfo/);
});

test('D1: el proyecto de administración no se borra y conserva sus gastos', () => {
  const RF = app();
  RF.store.addProject('Proyecto sintético');
  const adm = admins(RF.store.get())[0];
  adm.budgetLines.push({ id: 'b-adm-sintetica', cuenta: 'administracion', item: 'Luz sintetica', glosa: '', fuente: 'corfo', monto: 1000, actId: '' });
  RF.store.removeProject(adm.id);
  const s = RF.store.get();
  assert.equal(admins(s).length, 1);
  assert.equal(admins(s)[0].id, adm.id);
  assert.equal(admins(s)[0].budgetLines.length, 1);
});

test('D1: el presupuesto de administración corregido en el PEA general sobrevive a migrar', () => {
  const RF = app();
  RF.store.addProject('Proyecto sintético');
  const adm = admins(RF.store.get())[0];
  const general = RF.forms.getSingle(adm, 'peaGeneral');
  general.presupuestoAdmin = 800;
  RF.store.update(function (st) { RF.store.ensureAdminProject(st, 800); }, { silent: true });
  const migrado = RF.store.migrate(JSON.parse(JSON.stringify(RF.store.get())));
  assert.equal(admins(migrado)[0].budgetApproved.administracion, 800);
});
