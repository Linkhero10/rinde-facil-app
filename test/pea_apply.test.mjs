/* Prueba de RF.pea.applyToState (js/25-pea-screen.js) con un modelo SINTÉTICO: no usa datos reales de comunidades. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(here, '..', 'js');
const ctx = { TextDecoder, DataView, Uint8Array, console, Promise };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(jsDir, '23-read-docx.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(jsDir, '24-pea-extract.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(jsDir, '25-pea-screen.js'), 'utf8'), ctx);
const P = ctx.RF.pea;
const clone = x => JSON.parse(JSON.stringify(x));

/* modelo sintético con la forma de RF.pea.extractFromStructure */
function model() {
  return {
    community: { name: 'Comunidad Sintética Alfa', rut: '11.111.111-1', address: 'Calle Falsa 123', legalRep: null, oc: null },
    projects: [
      { name: 'Proyecto Uno', code: 'CODE-1', start: '2026-01-01', end: '2026-12-31', source: 'PEA: Proyecto N°1',
        budgetApproved: { rrhh: 100, operacion: 200, inversion: 300, administracion: 0 },
        budgetLines: [{ cuenta: 'RECURSOS HUMANOS', item: 'Monitor', glosa: 'Glosa 1', monto: 100, fuente: null }],
        gantt: { stages: [{ name: 'Etapa A', acts: [{ name: 'Actividad 1', start: '2026-01-01', end: '2026-02-01', result: 'Resultado 1' }] }] } },
      { name: 'Proyecto Dos', code: '', start: null, end: null, source: 'PEA: proyecto 2',
        budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: 0 }, budgetLines: [], gantt: { stages: [] } },
      { name: 'Gastos de administración', code: null, start: null, end: null, source: 'PEA: consolidados de costos',
        budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: 50 }, budgetLines: [], gantt: { stages: [] } }
    ],
    warnings: ['aviso sintético']
  };
}

/* estado previo: un proyecto ya existente con una línea propia y un proyecto ajeno */
function existing() {
  return {
    community: { name: 'Vieja', rut: '', legalRep: 'Ana Sintética', address: 'x' },
    projects: [
      { id: 'p-old', name: 'proyecto uno', code: 'VIEJO', budgetApproved: { rrhh: 1, operacion: 0, inversion: 0, administracion: 0 },
        budgetLines: [{ id: 'b-old', cuenta: 'operacion', item: 'Otra', glosa: '', fuente: 'corfo', monto: 5, actId: '' }], gantt: { stages: [] }, expenses: [] },
      { id: 'p-other', name: 'Mi proyecto propio', expenses: [], budgetLines: [], gantt: { stages: [] } }
    ],
    activeProjectId: 'p-old'
  };
}

test('no borra proyectos ni líneas existentes', () => {
  const s = P.applyToState(existing(), model(), { rut: '11.111.111-1' });
  const ids = s.projects.map(p => p.id);
  assert.ok(ids.includes('p-old') && ids.includes('p-other'));
  assert.equal(s.projects.find(p => p.id === 'p-old').budgetLines.find(l => l.id === 'b-old').item, 'Otra');
  assert.equal(s.projects.find(p => p.id === 'p-other').name, 'Mi proyecto propio');
});

test('no duplica un proyecto con el mismo nombre (sin distinguir mayúsculas) y no repite líneas ni actividades al reaplicar', () => {
  const once = P.applyToState(existing(), model(), { rut: '11.111.111-1' });
  const twice = P.applyToState(once, model(), { rut: '11.111.111-1' });
  assert.equal(once.projects.filter(p => /^proyecto uno$/i.test(p.name)).length, 1);
  assert.equal(once.projects.length, 4, 'antiguos 2 + Proyecto Dos + administración');
  assert.deepEqual(clone(twice), clone(once), 'aplicar dos veces da lo mismo');
});

test('«Gastos de administración» se crea una sola vez, con auto true y el monto del modelo', () => {
  const s = P.applyToState({ community: {}, projects: [], activeProjectId: null }, model(), { rut: '11.111.111-1' });
  const adm = s.projects.filter(p => p.name === 'Gastos de administración');
  assert.equal(adm.length, 1);
  assert.equal(adm[0].auto, true);
  assert.equal(adm[0].budgetApproved.administracion, 50);
  const again = P.applyToState(s, model(), { rut: '11.111.111-1' });
  assert.equal(again.projects.filter(p => p.name === 'Gastos de administración').length, 1);
});

test('el RUT de opts reemplaza al del modelo; sin opts se usa el del modelo', () => {
  const con = P.applyToState(existing(), model(), { rut: '11.111.111-1' });
  assert.equal(con.community.rut, '11.111.111-1');
  assert.equal(con.community.name, 'Comunidad Sintética Alfa');
  const sin = P.applyToState(existing(), model(), {});
  assert.equal(sin.community.rut, '11.111.111-1');
});

test('el representante legal no se borra si el PEA no lo trae y no llega en opts', () => {
  const s = P.applyToState(existing(), model(), { rut: '11.111.111-1', legalRep: '' });
  assert.equal(s.community.legalRep, 'Ana Sintética');
});

test('campos del modelo: código, fechas, presupuesto, línea nueva con id y fuente, etapa y actividad con id', () => {
  const s = P.applyToState(existing(), model(), { rut: '11.111.111-1' });
  const p = s.projects.find(x => x.id === 'p-old');
  assert.equal(p.code, 'CODE-1');
  assert.equal(p.start, '2026-01-01');
  assert.equal(p.end, '2026-12-31');
  assert.equal(p.budgetApproved.rrhh, 100);
  assert.equal(p.budgetApproved.inversion, 300);
  const nueva = p.budgetLines.find(l => l.item === 'Monitor');
  assert.ok(nueva && nueva.id && nueva.id !== 'b-old');
  assert.equal(nueva.cuenta, 'rrhh');
  assert.equal(nueva.fuente, 'corfo', 'fuente por defecto corfo');
  assert.equal(nueva.monto, 100);
  const etapa = p.gantt.stages.find(x => x.name === 'Etapa A');
  assert.ok(etapa && etapa.id);
  assert.equal(etapa.acts[0].name, 'Actividad 1');
  assert.ok(etapa.acts[0].id);
  assert.equal(etapa.acts[0].start, '2026-01-01');
});

test('un proyecto sin fechas en el PEA queda con fechas vacías, sin inventarlas', () => {
  const s = P.applyToState({ community: {}, projects: [] }, model(), { rut: '11.111.111-1' });
  const dos = s.projects.find(p => p.name === 'Proyecto Dos');
  assert.equal(dos.start, '');
  assert.equal(dos.end, '');
  assert.equal(dos.code, '');
});

test('no modifica el estado de entrada', () => {
  const st = existing();
  const antes = clone(st);
  P.applyToState(st, model(), { rut: '11.111.111-1' });
  assert.deepEqual(st, antes);
});

test('una fuente «Aporte propio» en el PEA queda como propio; una línea sin monto no se incluye', () => {
  const m = model();
  m.projects[0].budgetLines = [
    { cuenta: 'GASTOS DE INVERSIÓN', item: 'Equipo', glosa: '', monto: 40, fuente: 'Aporte propio' },
    { cuenta: 'GASTOS DE INVERSIÓN', item: 'Sin monto', glosa: '', monto: null, fuente: null }
  ];
  const s = P.applyToState({ community: {}, projects: [] }, m, { rut: '11.111.111-1' });
  const lines = s.projects.find(p => p.name === 'Proyecto Uno').budgetLines;
  assert.equal(lines.length, 1, 'solo la línea con monto');
  const eq = lines.find(l => l.item === 'Equipo');
  assert.equal(eq.cuenta, 'inversion');
  assert.equal(eq.fuente, 'propio');
  assert.equal(lines.some(l => l.item === 'Sin monto'), false);
});
