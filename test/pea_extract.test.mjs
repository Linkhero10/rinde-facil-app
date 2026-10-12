/* Prueba del extractor del PEA (js/24-pea-extract.js) con estructuras SINTÉTICAS: no usa documentos reales de comunidades. */
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
const P = ctx.RF.pea;
const plain = x => JSON.parse(JSON.stringify(x));

/* arma una tabla rectangular (grid) como la entrega RF.read.docxStructure */
function T(rows) {
  const cols = Math.max(...rows.map(r => r.length));
  const grid = rows.map(r => { const o = r.slice(); while (o.length < cols) o.push(''); return o; });
  return { grid, rows: rows.length, cols };
}
function info(name, plazo, total) {
  const rows = [['INFORMACIÓN SOLICITADA', 'RESPUESTA'], ['Nombre del proyecto', name]];
  if (plazo) rows.push(['Plazo estimado para el desarrollo del proyecto.', plazo]);
  if (total) rows.push(['Presupuesto total del Proyecto ($), impuestos incluidos.', total]);
  return T(rows);
}
function consolidado(rrhh, inv, op, adm, total) {
  const rows = [['Tabla 1\nCONSOLIDADO DE COSTOS DEL PROYECTO\n(Solo gastos financiables)', ''], ['ÍTEM', 'Presupuesto ($)']];
  if (rrhh !== undefined) rows.push(['CUENTA DE RECURSOS HUMANOS', rrhh]);
  if (inv !== undefined) rows.push(['CUENTA GASTOS DE INVERSIÓN', inv]);
  if (op !== undefined) rows.push(['C)    GASTOS OPERACIONALES', op]);
  if (adm !== undefined) rows.push(['D)   GASTOS ADMINISTRACIÓN', adm]);
  if (total !== undefined) rows.push(['TOTAL DE GASTOS (IMPUESTOS INCLUIDOS)', total]);
  return T(rows);
}
const HEAD_RRHH = ['Personal o servicio a contratar (Indicar cargo o rol)', 'Funciones por desarrollar', 'Duración', 'Costo ($) por unidad de tiempo', 'Presupuesto total requerido por persona o servicio, impuestos incluidos.'];
const HEAD_OPER = ['Etapa del Proyecto', 'Obras, actividades, bienes, gastos o cualquier otro ítem a financiar', 'Vinculación con el proyecto de los ítems a financiar', 'Indicar si la ejecución será externalizada', 'Hito o producto entregable', 'Cantidad del ítem', 'Costo asociado ($) por ítem financiado', 'Presupuesto total requerido por ítem, impuestos incluidos.'];
function cuenta(title, head, lines) {
  const rows = [[title].concat(head.slice(1).map(() => '')), head];
  lines.forEach(l => rows.push(l));
  return T(rows);
}
/* carta Gantt con años en la fila 0 y meses en la fila 1 (como en el PEA real) */
function gantt(stageRows) {
  const h0 = ['Etapas', 'Actividades principales', 'Descripción resumida de la actividad', 'Entregables', '2024', '', '', '', '2025', '', '', ''];
  const h1 = ['Etapas', 'Actividades principales', 'Descripción resumida de la actividad', 'Entregables', 'M1', 'M2', 'M3', 'M4', 'M1', 'M\n2', 'M3', 'M4'];
  return T([h0, h1].concat(stageRows));
}
function doc(tables, paragraphs) { return { paragraphs: paragraphs || [], tables: tables }; }

/* ---------- montos y fechas ---------- */

test('montos en distintos formatos pasan a entero; lo ilegible queda null', () => {
  assert.equal(P.parseMonto('$71.511.496.-'), 71511496);
  assert.equal(P.parseMonto('530.000.000'), 530000000);
  assert.equal(P.parseMonto('$0.-'), 0);
  assert.equal(P.parseMonto('$0'), 0);
  assert.equal(P.parseMonto('$ 1.250.000.- '), 1250000);
  assert.equal(P.parseMonto('378.184 USD'), null);
  assert.equal(P.parseMonto('$179.019.606.- 31.600.000\n= 147.419.606'), null);
  assert.equal(P.parseMonto(''), null);
});

test('fechas completas, de sólo mes y de día inexistente', () => {
  assert.deepEqual(plain(P.parseFecha('1 de mayo de 2023')), { iso: '2023-05-01', precision: 'dia' });
  assert.deepEqual(plain(P.parseFecha('15-02-2024')), { iso: '2024-02-15', precision: 'dia' });
  assert.deepEqual(plain(P.parseFecha('Marzo 2024')), { iso: '2024-03-01', precision: 'mes' });
  assert.equal(P.parseFecha('31 de abril de 2025'), null);
});

/* ---------- casos de extracción ---------- */

test('consolidado con montos en distintos formatos y tabla de cuenta con varias líneas', () => {
  const s = doc([
    info('Proyecto de prueba A', 'Fecha de inicio: 1 de mayo de 2023\nFecha de término: 31 de diciembre de 2024', '$200.400.000.-'),
    consolidado('$300.000.-', '$0', '200.000.000', '$100.000.-', '$200.400.000.-'),
    cuenta('Tabla 1\nRECURSOS HUMANOS', HEAD_RRHH, [
      ['Coordinadora\nAna Pérez', 'Gestión del proyecto', '', '', '$200.000.-'],
      ['Asesor técnico', 'Informes', '', '', '100.000'],
      ['TOTAL DE GASTOS CUENTA DE RECURSOS HUMANOS', '', '', '', '$300.000.-']
    ]),
    cuenta('Tabla 3\nCUENTA GASTOS OPERACIONALES', HEAD_OPER, [
      ['Etapa 1', 'Construcción', 'Directa', '', '', '', '', '200.000.000'],
      ['Etapa 2', 'Capacitación', 'Indirecta', '', '', '', '', '$0.-'],
      ['TOTAL (impuestos incluidos)', '', '', '', '', '', '', '200.000.000']
    ])
  ], ['Proyecto N°1']);
  const m = P.extractFromStructure(s);
  const p = m.projects[0];
  assert.equal(m.projects.length, 2, 'proyecto + administración automática');
  assert.equal(p.name, 'Proyecto de prueba A');
  assert.equal(p.code, 'N°1');
  assert.equal(p.start, '2023-05-01');
  assert.equal(p.end, '2024-12-31');
  assert.deepEqual(plain(p.budgetApproved), { rrhh: 300000, operacion: 200000000, inversion: 0, administracion: 0 });
  assert.equal(p.budgetLines.length, 4, 'los TOTAL no cuentan como línea');
  assert.deepEqual(plain(p.budgetLines[0]), { cuenta: 'RECURSOS HUMANOS', item: 'Coordinadora; Ana Pérez', glosa: 'Gestión del proyecto', monto: 200000, fuente: null });
  assert.equal(p.budgetLines[1].monto, 100000);
  assert.equal(p.budgetLines[2].cuenta, 'GASTOS OPERACIONALES');
  assert.equal(p.budgetLines[2].monto, 200000000);
  /* el consolidado cuadra y las líneas suman lo mismo: no hay advertencias de cuadre */
  assert.equal(m.warnings.filter(w => /no cuadra|no coincide|sin tabla/.test(w)).length, 0, m.warnings.join(' | '));
});

test('carta Gantt con dos etapas: inicio y término por meses marcados, con advertencia de día 1', () => {
  const s = doc([
    info('Proyecto de prueba B', null, null),
    consolidado('$0', '$0', '$0', '$0', '$0'),
    gantt([
      ['ETAPA UNO', 'Diseño', 'desc', 'Informe', 'X', 'X', '', '', '', '', '', ''],
      ['', 'Permisos', 'desc', 'Resolución', '', 'x', 'X', '', '', '', '', ''],
      ['ETAPA DOS', 'Obras', 'desc', 'Carpeta', '', '', '', '', 'X', 'X', '', ''],
      ['ETAPA DOS', 'Sin marcas', 'desc', 'Acta', '', '', '', '', '', '', '', '']
    ])
  ]);
  const p = P.extractFromStructure(s).projects[0];
  assert.deepEqual(plain(p.gantt.stages.map(st => st.name)), ['ETAPA UNO', 'ETAPA DOS']);
  assert.deepEqual(plain(p.gantt.stages[0].acts[0]), { name: 'Diseño', start: '2024-01-01', end: '2024-02-01', result: 'Informe' });
  assert.deepEqual(plain(p.gantt.stages[0].acts[1]), { name: 'Permisos', start: '2024-02-01', end: '2024-03-01', result: 'Resolución' });
  assert.deepEqual(plain(p.gantt.stages[1].acts[0]), { name: 'Obras', start: '2025-01-01', end: '2025-02-01', result: 'Carpeta' });
  assert.equal(p.gantt.stages[1].acts[1].start, null, 'sin marcas: fechas vacías, no inventadas');
  const w = P.extractFromStructure(s).warnings.join(' | ');
  assert.match(w, /día 1/);
  assert.match(w, /sin marcas.*Sin marcas/);
});

test('administración separada: se lleva a un proyecto automático y los proyectos quedan sin ella', () => {
  const s = doc([
    info('Proyecto de prueba C', null, null),
    consolidado('$1.000.000.-', '$0', '$2.000.000.-', '$500.000.-', '$3.500.000.-'),
    cuenta('Tabla 1\nRECURSOS HUMANOS', HEAD_RRHH, [['Asesor', 'Apoyo', '', '', '$1.000.000.-']]),
    cuenta('Tabla 3\nCUENTA GASTOS OPERACIONALES', HEAD_OPER, [['Etapa 1', 'Compra', '', '', '', '', '', '2.000.000']])
  ]);
  const m = P.extractFromStructure(s);
  assert.equal(m.projects.length, 2);
  const admin = m.projects[1];
  assert.equal(admin.name, 'Gastos de administración');
  assert.equal(admin.budgetApproved.administracion, 500000);
  assert.equal(m.projects[0].budgetApproved.administracion, 0);
  assert.equal(m.projects[0].budgetApproved.operacion, 2000000);
  assert.match(m.warnings.join(' | '), /no se reparten entre proyectos/);
});

test('si el documento no separa administración: advertencia y sin proyecto automático', () => {
  const s = doc([
    info('Proyecto de prueba D', null, null),
    consolidado('$0', '$0', '$0', undefined, '$0')
  ]);
  const m = P.extractFromStructure(s);
  assert.equal(m.projects.length, 1, 'sólo el proyecto');
  assert.match(m.warnings.join(' | '), /no separa gastos de administración/);
});

test('monto ilegible: queda null con advertencia, nunca un valor inventado', () => {
  const s = doc([
    info('Proyecto de prueba E', null, null),
    consolidado('$179.019.606.- 31.600.000\n= 147.419.606', '$0', '$0', '$0', '$0'),
    cuenta('Tabla 1\nRECURSOS HUMANOS', HEAD_RRHH, [['Asesor', 'Apoyo', '', '', 'monto por definir']])
  ]);
  const m = P.extractFromStructure(s);
  const p = m.projects[0];
  assert.equal(p.budgetApproved.rrhh, null);
  assert.equal(p.budgetLines.length, 0);
  const w = m.warnings.join(' | ');
  assert.match(w, /Recursos humanos en el consolidado no es legible/);
  assert.match(w, /no tiene monto legible/);
});

test('fecha de término inexistente queda vacía con advertencia', () => {
  const s = doc([info('Proyecto de prueba F', 'Fecha de inicio: 1 de mayo de 2024\nFecha de término: 31 de abril de 2025', null)]);
  const p = P.extractFromStructure(s).projects[0];
  assert.equal(p.start, '2024-05-01');
  assert.equal(p.end, null);
  assert.match(P.extractFromStructure(s).warnings.join(' | '), /no es una fecha válida/);
});

test('un docx no válido se rechaza con error claro', async () => {
  await assert.rejects(P.extractFromDocxBytes(new Uint8Array([1, 2, 3, 4])), /zip|Word/);
});
