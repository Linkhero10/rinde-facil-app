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
  assert.equal(p.code, null, 'el título «Proyecto N°1» no es un código');
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

/* ---------- datos completos del PEA (sintéticos) ---------- */

test('antecedentes generales: cada fila pasa a peaDatos; varios párrafos se unen con " | "', () => {
  const gen = T([
    ['Antecedentes Generales del PEA', ''],
    ['Nombre de comunidad', 'COMUNIDAD DE PRUEBA SINTÉTICA'],
    ['Rut de la comunidad', 'N°1.234.567-8'],
    ['Otra fila de prueba', 'primer párrafo\nsegundo párrafo']
  ]);
  const m = P.extractFromStructure(doc([gen]));
  assert.deepEqual(plain(m.community.peaDatos), [
    { k: 'Nombre de comunidad', v: 'COMUNIDAD DE PRUEBA SINTÉTICA' },
    { k: 'Rut de la comunidad', v: 'N°1.234.567-8' },
    { k: 'Otra fila de prueba', v: 'primer párrafo | segundo párrafo' }
  ]);
  assert.equal(m.community.rut, '1.234.567-8', 'el RUT se conserva sin «N°»');
});

test('plan de vida: la respuesta en la tercera columna no se pierde; las filas sin respuesta no cuentan', () => {
  const plan = T([
    ['Antecedentes del Plan de Vida de la Comunidad o similar (opcional)', '', ''],
    ['Sección sin respuesta', '', ''],
    ['Monto de prueba recibido', '', '12.000.000.- en prueba']
  ]);
  const c = P.extractFromStructure(doc([plan])).community;
  assert.deepEqual(plain(c.peaDatos), [{ k: 'Monto de prueba recibido', v: '12.000.000.- en prueba' }]);
});

test('contacto: varios teléfonos y correos quedan en listas; el nombre sale sin cargo ni RUT', () => {
  const gen = T([
    ['Antecedentes Generales del PEA', ''],
    ['Nombre Encargado Convenio', 'Sr. Juan Prueba Ejemplo\nSecretaria de prueba\nRut: 9.999.999-9'],
    ['Teléfono de contacto de Encargado Convenio', '+56 9 1111 1111\n+56 9 2222 2222'],
    ['Correo electrónico del Encargado Convenio', 'uno@ejemplo.test\ndos@ejemplo.test']
  ]);
  const c = P.extractFromStructure(doc([gen])).community;
  assert.deepEqual(plain(c.contacto.telefonos), ['+56 9 1111 1111', '+56 9 2222 2222']);
  assert.deepEqual(plain(c.contacto.correos), ['uno@ejemplo.test', 'dos@ejemplo.test']);
  assert.equal(c.contacto.encargado, 'Juan Prueba Ejemplo');
  assert.deepEqual(plain(c.contacto.secretaria), { nombre: 'Juan Prueba Ejemplo', rut: '9.999.999-9' });
});

test('fechas de entrega a CORFO y de validación por la Asamblea (dd-mm-aaaa) pasan a ISO', () => {
  const gen = T([
    ['Antecedentes Generales del PEA', ''],
    ['Fecha de entrega del Proyecto a CORFO', '20-03-2024'],
    ['Indicar si los proyectos contenidos en el PEA se encuentran validados por la Comunidad en general (por ejemplo, en Asamblea u otra instancia).', 'Se encuentran validados por la Asamblea de la Comunidad de Prueba de fecha 07-02-2024']
  ]);
  const c = P.extractFromStructure(doc([gen])).community;
  assert.equal(c.fechaEntrega, '2024-03-20');
  assert.equal(c.asambleaValidacion, '2024-02-07');
});

test('fuentes: «con cargo al 30% / 70% del AIA = X» y «otras fuentes» pasan a entero', () => {
  const info2 = T([
    ['INFORMACIÓN SOLICITADA', 'RESPUESTA'],
    ['Nombre del proyecto', 'PROYECTO SINTÉTICO DE FUENTES'],
    ['Indicar monto ($) correspondiente al saldo del 30% del AIA, destinado a financiar el proyecto.', 'Proyecto con cargo al 30% del AIA = 147.419.606.-'],
    ['Indicar monto ($) solicitado en desembolsos futuros, con cargo al 70% del AIA o Aportes Subsecuentes.', 'Proyecto con cargo al 70% del AIA = $325.974.462.-'],
    ['Presupuesto ($) del proyecto a financiarse mediante otras fuentes de recursos, impuestos incluidos (si aplica).', '$74.025.538.-serán financiados con aportes de prueba']
  ]);
  const p = P.extractFromStructure(doc([info2])).projects[0];
  assert.deepEqual(plain(p.fuentes), { aia30: 147419606, aia70: 325974462, otras: 74025538 });
  assert.equal(p.peaDatos.length, 4, 'todas las filas salvo el encabezado');
  assert.equal(p.peaDatos[0].v, 'PROYECTO SINTÉTICO DE FUENTES');
});

test('fuentes sin fila quedan null sin advertencia; un monto ilegible queda null con advertencia', () => {
  const sinFila = doc([info('Proyecto sintético sin fuentes', null, null)]);
  const m1 = P.extractFromStructure(sinFila);
  assert.deepEqual(plain(m1.projects[0].fuentes), { aia30: null, aia70: null, otras: null });
  assert.doesNotMatch(m1.warnings.join(' | '), /monto con cargo|otras fuentes/);

  const malo = doc([T([
    ['INFORMACIÓN SOLICITADA', 'RESPUESTA'],
    ['Nombre del proyecto', 'PROYECTO SINTÉTICO CON MONTO RARO'],
    ['Indicar monto ($) correspondiente al saldo del 30% del AIA, destinado a financiar el proyecto.', 'Proyecto con cargo al 30% del AIA = por definir']
  ])]);
  const m2 = P.extractFromStructure(malo);
  assert.equal(m2.projects[0].fuentes.aia30, null);
  assert.match(m2.warnings.join(' | '), /no se pudo leer el monto con cargo al 30% del AIA/);
});

/* ---------- PEA escaneado (OCR): se lee el TEXTO (raw_text); las posiciones de la página no se usan ---------- */

/* texto con la forma que entrega el OCR: rótulos y valores en renglones separados (los datos son inventados) */
const OCR_TEXTO = [
  'Nombre de comunidad', 'Rut de la comunidad', 'Nombre Encargado Convenio',
  'COMUNIDAD SINTÉTICA ALFA', 'N°11.111.111-1', 'Sra. Ana Prueba', 'Rut: 22.222.222-2',
  'Teléfono de contacto de +56 9 1234 5678', 'Correo electrónico del Encargado Convenio', 'ana.prueba@ejemplo.cl',
  'Fecha de entrega del Proyecto a CORFO', '15-02-2024',
  '2. Antecedentes del Plan de Vida de la Comunidad o similar (opcional)',
  'Nombre del proyecto', 'PROYECTO SINTÉTICO UNO',
  'Fecha de inicio: 1 de marzo de 2026', 'Fecha de término: 31 de diciembre de 2026',
  'CONSOLIDADO DE COSTOS DEL PROYECTO',
  '$1.000.000.-', '$0.-', '$2.000.000.-', '$500.000.-', '$3.500.000.-',
  'A continuación, se presentan tres tablas.'
].join('\n');

test('OCR: se lee el texto (raw_text) y las posiciones de la página no cambian el resultado', () => {
  const base = plain(P.extractFromOcr({ ok: true, raw_text: OCR_TEXTO }));
  assert.equal(base.community.name, 'COMUNIDAD SINTÉTICA ALFA');
  assert.equal(base.community.rut, '11.111.111-1');
  assert.equal(base.community.contacto.encargado, 'Ana Prueba');
  assert.deepEqual(base.community.contacto.secretaria, { nombre: 'Ana Prueba', rut: '22.222.222-2' });
  assert.deepEqual(base.community.contacto.telefonos, ['+56912345678']);
  assert.deepEqual(base.community.contacto.correos, ['ana.prueba@ejemplo.cl']);
  assert.equal(base.community.fechaEntrega, '2024-02-15');
  assert.equal(base.projects[0].name, 'PROYECTO SINTÉTICO UNO');
  assert.equal(base.projects[0].start, '2026-03-01');
  assert.equal(base.projects[0].end, '2026-12-31');
  assert.deepEqual(base.projects[0].budgetApproved, { rrhh: 1000000, operacion: 2000000, inversion: 0, administracion: 0 });
  assert.equal(base.projects[1].name, 'Gastos de administración');
  assert.equal(base.projects[1].budgetApproved.administracion, 500000);
  const conPosiciones = { ok: true, raw_text: OCR_TEXTO, pages_layout: [{ number: 1, angle: 90, paragraphs: [{ text: 'otra cosa', box: { x0: 0.9, y0: 0.9, x1: 0.1, y1: 0.1 } }] }] };
  assert.deepEqual(plain(P.extractFromOcr(conPosiciones)), base);
});

test('OCR: la carta Gantt queda vacía y el aviso de presupuesto y Gantt sale por proyecto', () => {
  const m = plain(P.extractFromOcr({ ok: true, raw_text: OCR_TEXTO }));
  assert.deepEqual(m.projects[0].gantt, { stages: [] });
  assert.ok(m.warnings.some(w => w.startsWith('Proyecto 1: El presupuesto y la carta Gantt de este PEA escaneado no se leyeron: cárgalos a mano o sube el Word del PEA.')));
});

test('OCR: texto vacío devuelve un modelo vacío con el aviso de calidad', () => {
  const m = plain(P.extractFromOcr({ ok: true, raw_text: '   ', pages: [] }));
  assert.deepEqual(m.warnings, ['El OCR no devolvió texto legible: revisa que el PDF sea de buena calidad.']);
  assert.deepEqual(m.projects, []);
  assert.equal(m.community.name, null);
  const m2 = plain(P.extractFromOcr({ ok: true, raw_text: '', pages_layout: [] }));
  assert.deepEqual(m2.warnings, m.warnings);
});

test('OCR: una etiqueta sin valor queda vacía; el RUT con «Rut de la comunidad:» en la misma línea se lee', () => {
  const m = plain(P.extractFromOcr({ ok: true, raw_text: 'Nombre de comunidad\nRut de la comunidad: 11.111.111-1' }));
  assert.equal(m.community.name, null);
  assert.equal(m.community.rut, '11.111.111-1');
  assert.match(m.warnings.join(' | '), /No se encontró el nombre de la comunidad/);
});
