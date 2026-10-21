import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp();
const L = RF.logic;
const plain = value => JSON.parse(JSON.stringify(value));

test('resumen: proyectos independientes, aprobado y monto a rendir, sin filtrar por período', () => {
  const projects = [{
    id: 'p1', name: 'Proyecto de prueba A', desembolso1: '2026-09-01',
    fuentes: { aia30: '250.000', aia70: 750000 },
    budgetApproved: { operacion: '800.000', inversion: 200000 },
    budgetLines: [{ id: 'b1', item: 'Materiales', monto: '400.000' }],
    periodoInicio: '2026-10-01', periodoFin: '2026-10-31',
    expenses: [
      { item: 'Materiales', total: 119000, montoRendir: '100.000', fecha: '2026-09-01' },
      { item: 'Otro', total: 500000, montoRendir: 20000 },
      { item: 'Materiales', total: 100000, montoRendir: '' }
    ]
  }, { id: 'p2', name: 'Proyecto de prueba B', budgetApproved: { rrhh: 400000 }, expenses: [{ montoRendir: 40000 }] }];
  const before = JSON.stringify(projects);
  const [a, b] = L.resumenPresupuesto(projects);
  assert.equal(a.id, 'p1');
  assert.equal(a.name, 'Proyecto de prueba A');
  assert.equal(a.desembolso1, '2026-09-01');
  assert.equal(a.primerDesembolsoMonto, 250000);
  assert.equal(a.asignado, 1000000);
  assert.equal(a.ejecutado, 120000);
  assert.equal(a.pct, 12);
  assert.equal(a.gastos, 3);
  assert.deepEqual(plain(a.lines), [{ id: 'b1', item: 'Materiales', asignado: 400000, ejecutado: 100000, pct: 25 }]);
  assert.equal(b.ejecutado, 40000);
  assert.equal(b.pct, 10);
  assert.equal(JSON.stringify(projects), before, 'no muta datos ni agrega campos');
});

test('resumen: asociación por texto exacto de ítem, sin repartir ni inferir por actividad', () => {
  const [p] = L.resumenPresupuesto([{
    budgetLines: [
      { id: 'b1', item: 'Materiales', monto: 1000, actId: 'a1' },
      { id: 'b2', item: 'Materiales', monto: 2000, actId: 'a2' },
      { id: 'b3', item: '', monto: 100 },
      { id: 'b4', item: '__proto__', monto: 200 }
    ],
    expenses: [
      { item: 'Materiales', montoRendir: 500, actId: 'a3' },
      { item: 'materiales', montoRendir: 400 },
      { item: ' Materiales ', montoRendir: 300 },
      { montoRendir: 100 },
      { item: '__proto__', montoRendir: 50 }
    ]
  }]);
  assert.deepEqual(Array.from(p.lines, line => line.ejecutado), [500, 500, 0, 50]);
  assert.equal(p.ejecutado, 1350, 'cada gasto se suma una sola vez al total');
});

test('resumen: sin proyectos, gastos o líneas y datos parciales', () => {
  assert.deepEqual(plain(L.resumenPresupuesto()), []);
  assert.deepEqual(plain(L.resumenPresupuesto([])), []);
  const [p] = L.resumenPresupuesto([{}]);
  assert.equal(p.asignado, 0);
  assert.equal(p.ejecutado, 0);
  assert.equal(p.pct, null);
  assert.equal(p.gastos, 0);
  assert.equal(p.desembolso1, '');
  assert.equal(p.primerDesembolsoMonto, null);
  assert.deepEqual(plain(p.lines), []);
  const [q] = L.resumenPresupuesto([{ budgetLines: [{ monto: 200 }], fuentes: { aia30: 0 } }]);
  assert.equal(q.primerDesembolsoMonto, 0, 'cero registrado no equivale a faltante');
  assert.equal(q.asignado, 0, 'las líneas no inventan un monto aprobado');
  assert.equal(q.lines[0].ejecutado, 0);
  assert.equal(q.lines[0].pct, 0);
});

test('resumen: porcentaje real sobre 100 y sin división por cero', () => {
  const [p] = L.resumenPresupuesto([{
    budgetApproved: { operacion: 100 },
    budgetLines: [{ item: 'Prueba', monto: 50 }, { item: 'Sin monto', monto: '' }],
    expenses: [{ item: 'Prueba', montoRendir: 150 }, { item: 'Sin monto', montoRendir: 50 }]
  }]);
  assert.equal(p.pct, 200);
  assert.equal(p.lines[0].pct, 300);
  assert.equal(p.lines[1].pct, null);
});

test('trámites: actualización de proyecto y prórroga retirada', () => {
  assert.equal(RF.tramites.byId['TRM-028'].title, 'Actualización de proyecto');
  assert.match(RF.tramites.byId['TRM-028'].why, /tiempo, actividades y presupuesto/);
  const f2 = RF.data.FASES.find(f => f.id === 'F2');
  assert.deepEqual(Array.from(f2.items), ['TRM-027', 'TRM-028']);
  assert.equal(RF.tramites.byId['TRM-030'], undefined);
  assert.equal(RF.search.search('prórroga', 30).some(r => r.item.href === '#/t/TRM-030'), false);
  assert.ok(RF.search.search('actualización de proyecto', 30).some(r => r.item.href === '#/t/TRM-028'));
});

class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.style = {}; this.dataset = {}; this.className = ''; this._text = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, listener) { (this.listeners ||= {})[type] = listener; }
  click() { this.listeners?.click?.(); }
  get firstChild() { return this.children[0]; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); return child; }
  appendChild(child) { this.children.push(child); return child; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
}
function uiApp() {
  const document = {
    createElement: tag => new Node(tag),
    createElementNS: (ns, tag) => new Node(tag),
    createTextNode: text => { const n = new Node('#text'); n.textContent = text; return n; }
  };
  const app = loadApp(['01-util.js', '02-store.js', '10-data.js', '11-tramites.js', '12-needs.js', '13-holidays.js', '20-logic.js', '27-search.js', '30-ui.js', '31-forms.js', '32-tools-plan.js', '37-repo.js', '38-tools-needs.js', '40-views.js'], { document, innerWidth: 400 });
  app.calendar = { collect: () => [] };
  app.flow = { render: () => new Node('div') };
  return app;
}
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }

test('inicio: resumen antes de las fases, todos los proyectos, solo lectura y barras acotadas', () => {
  const app = uiApp();
  const a = app.store.newProject('Proyecto sintético A');
  const b = app.store.newProject('Proyecto sintético B');
  a.budgetApproved.operacion = 100;
  a.budgetLines = [{ item: 'Prueba', monto: 100 }];
  a.expenses = [{ item: 'Prueba', montoRendir: 200 }];
  app.store.update(s => { s.projects = [a, b]; s.activeProjectId = a.id; }, { silent: true });
  const before = JSON.stringify(app.store.get());
  const home = app.views.home();
  const summaryIndex = home.children.findIndex(n => n.textContent.startsWith('Resumen de presupuesto'));
  assert.ok(summaryIndex >= 0);
  assert.ok(summaryIndex < home.children.findIndex(n => descendants(n).some(c => c.className === 'phase-cards')));
  const summary = home.children[summaryIndex];
  assert.match(summary.textContent, /Proyecto sintético A/);
  assert.match(summary.textContent, /Proyecto sintético B/);
  assert.match(summary.textContent, /200 %/);
  assert.match(summary.textContent, /Sin gastos registrados/);
  assert.match(summary.textContent, /Sin líneas de presupuesto/);
  const nodes = descendants(summary);
  assert.ok(!nodes.some(n => ['input', 'select', 'textarea', 'button'].includes(n.tagName)));
  const bars = nodes.filter(n => n.attributes.role === 'progressbar');
  assert.equal(bars.length, 3, 'una barra por proyecto y una por línea');
  assert.ok(bars.every(n => +n.attributes['aria-valuenow'] >= 0 && +n.attributes['aria-valuenow'] <= 100));
  assert.equal(JSON.stringify(app.store.get()), before, 'la pantalla no persiste modificaciones');
});

test('bienvenida sin resumen de presupuesto y sin enlace de prórroga desde plazos', () => {
  const app = uiApp();
  const home = app.views.home();
  assert.match(home.textContent, /Bienvenida y bienvenido/);
  assert.doesNotMatch(home.textContent, /Resumen de presupuesto|Sin proyectos/);
  const plazos = descendants(app.tools.plazos.render());
  assert.equal(plazos.some(n => n.attributes.href === '#/t/TRM-030'), false);
  assert.doesNotMatch(plazos.map(n => n._text).join(''), /solo si todavía no has enviado el PEA a CORFO/);
});

for (const tool of ['documentos', 'necesidades']) {
  test(`${tool}: el botón de actualización incluye el título del paso`, () => {
    const app = uiApp();
    const p = app.store.newProject('Proyecto sintético');
    p.needsAdded = [{ id: 'viaticos' }];
    app.store.update(s => { s.projects = [p]; s.activeProjectId = p.id; }, { silent: true });
    const page = app.tools[tool].render();
    if (tool === 'documentos') descendants(page).find(n => n.tagName === 'button' && n.textContent === 'Agregar un documento').click();
    const buttons = descendants(page).filter(n => n.tagName === 'button' && n.textContent.includes('Actualización de proyecto'));
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].textContent, 'Ver el paso «Actualización de proyecto»');
    buttons[0].click();
    assert.equal(loadApp.lastCtx.location.hash, '#/t/TRM-028');
  });
}
