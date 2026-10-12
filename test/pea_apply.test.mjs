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

/* modelo sintético con los datos nuevos del extractor (contacto, peaDatos, fechas, fuentes); todo inventado */
function modeloConDatos() {
  const m = model();
  m.community.peaDatos = [{ k: 'Dato comunidad 1', v: 'Valor A' }, { k: 'Dato comunidad 2', v: 'Línea 1\nLínea 2' }];
  m.community.contacto = { encargado: 'Persona Sintética', secretaria: { nombre: 'Secretaria Sintética', rut: '22.222.222-2' },
    telefonos: ['+56 9 1111 1111', '+56 9 2222 2222'], correos: ['sintetico1@example.com', 'sintetico2@example.com'] };
  m.community.fechaEntrega = '2026-03-01';
  m.community.asambleaValidacion = '2026-02-15';
  m.community.apoyo = 'Sí';
  m.projects[0].peaDatos = [{ k: 'Fila A', v: 'x' }, { k: 'Fila B', v: '' }];
  m.projects[0].fuentes = { aia30: 147419606, aia70: 343646081, otras: null };
  m.projects[1].peaDatos = [{ k: 'Fila C', v: 'y' }];
  m.projects[1].fuentes = { aia30: 0, aia70: null, otras: 1000 };
  m.projects[2].peaDatos = [];
  m.projects[2].fuentes = { aia30: null, aia70: null, otras: null };
  return m;
}

test('contacto, datos del PEA, fechas y apoyo quedan en la comunidad', () => {
  const s = P.applyToState({ community: {}, projects: [] }, modeloConDatos(), { rut: '11.111.111-1' });
  assert.equal(s.community.contacto.encargado, 'Persona Sintética');
  assert.equal(s.community.contacto.secretaria.rut, '22.222.222-2');
  assert.deepEqual(clone(s.community.contacto.telefonos), ['+56 9 1111 1111', '+56 9 2222 2222']);
  assert.equal(s.community.email, 'sintetico1@example.com');
  assert.equal(s.community.phone, '+56 9 1111 1111');
  assert.equal(s.community.peaDatos.length, 2);
  assert.equal(s.community.peaDatos[1].v, 'Línea 1\nLínea 2');
  assert.equal(s.community.fechaEntrega, '2026-03-01');
  assert.equal(s.community.asambleaValidacion, '2026-02-15');
  assert.equal(s.community.apoyo, 'Sí');
});

test('reaplicar el mismo PEA no duplica datos, contacto ni fuentes', () => {
  const once = P.applyToState({ community: {}, projects: [] }, modeloConDatos(), { rut: '11.111.111-1' });
  const twice = P.applyToState(once, modeloConDatos(), { rut: '11.111.111-1' });
  assert.deepEqual(clone(twice), clone(once));
  assert.equal(twice.community.peaDatos.length, 2);
  assert.equal(twice.projects.find(p => p.name === 'Proyecto Uno').peaDatos.length, 2);
});

test('el correo y el teléfono no pisan los que ya están cargados', () => {
  const st = { community: { email: 'ya@example.com', phone: '+56 9 0000 0000' }, projects: [] };
  const s = P.applyToState(st, modeloConDatos(), { rut: '11.111.111-1' });
  assert.equal(s.community.email, 'ya@example.com');
  assert.equal(s.community.phone, '+56 9 0000 0000');
});

test('opts.contacto reemplaza al contacto del modelo', () => {
  const otro = { encargado: 'Otra Persona', secretaria: null, telefonos: [], correos: [] };
  const s = P.applyToState({ community: {}, projects: [] }, modeloConDatos(), { rut: '11.111.111-1', contacto: otro });
  assert.equal(s.community.contacto.encargado, 'Otra Persona');
});

test('las fuentes y los datos llegan a cada proyecto; el automático no lleva datos del PEA', () => {
  const s = P.applyToState({ community: {}, projects: [] }, modeloConDatos(), { rut: '11.111.111-1' });
  const uno = s.projects.find(p => p.name === 'Proyecto Uno');
  const dos = s.projects.find(p => p.name === 'Proyecto Dos');
  assert.deepEqual(clone(uno.fuentes), { aia30: 147419606, aia70: 343646081, otras: null });
  assert.equal(uno.peaDatos[0].k, 'Fila A');
  assert.deepEqual(clone(dos.fuentes), { aia30: 0, aia70: null, otras: 1000 });
  assert.equal(dos.peaDatos.length, 1);
  const adm = s.projects.find(p => p.name === 'Gastos de administración');
  assert.equal(adm.peaDatos, undefined);
});

test('el RUT del modelo queda prellenado en la pantalla (función pura P.rutInicial)', () => {
  assert.equal(P.rutInicial(modeloConDatos()), '11.111.111-1');
  const sinRut = modeloConDatos();
  sinRut.community.rut = null;
  assert.equal(P.rutInicial(sinRut), '');
  assert.equal(P.rutInicial(null), '');
});

/* PEA escaneado (OCR) sintético: el modelo que sale de RF.pea.extractFromOcr se aplica sin duplicar nada */
test('OCR: el modelo de un PEA escaneado se aplica una sola vez y no duplica proyectos', () => {
  const page = { number: 1, angle: 0, width: 1000, height: 1400, paragraphs: [
    { text: 'Nombre del proyecto', angle: 0, box: { x0: 0.05, y0: 0.19, x1: 0.35, y1: 0.21 } },
    { text: 'Proyecto OCR Sintético', angle: 0, box: { x0: 0.45, y0: 0.19, x1: 0.8, y1: 0.21 } },
    { text: 'Fecha de inicio', angle: 0, box: { x0: 0.05, y0: 0.23, x1: 0.35, y1: 0.25 } },
    { text: '01-03-2026', angle: 0, box: { x0: 0.45, y0: 0.23, x1: 0.6, y1: 0.25 } },
  ] };
  const m = P.extractFromOcr({ ok: true, raw_text: 'x', pages: [page] });
  const once = P.applyToState({ community: {}, projects: [] }, m, { rut: '11.111.111-1', legalRep: null });
  const twice = P.applyToState(once, m, { rut: '11.111.111-1', legalRep: null });
  assert.equal(once.projects.length, 1);
  assert.equal(once.projects[0].name, 'Proyecto OCR Sintético');
  assert.equal(once.projects[0].start, '2026-03-01');
  assert.equal(twice.projects.length, 1, 'aplicar otra vez no duplica el proyecto');
  assert.deepEqual(clone(twice.projects[0].budgetLines), []);
});
