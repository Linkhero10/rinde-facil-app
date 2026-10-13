/* Corrección del PEA antes de aplicarlo: validación por la Asamblea, aviso del saldo, filas rehechas al corregir,
 * normalización del modelo y reglas de lo que se copia al aplicar. Todo con datos SINTÉTICOS (nombres, RUT y cifras inventados). */
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
const plain = x => JSON.parse(JSON.stringify(x));
const ANT = lineas => lineas.join('\n');
const PLAN = '2. Antecedentes del Plan de Vida de la Comunidad o similar (opcional)';

test('validación por la Asamblea: la frase del PEA se guarda aunque no traiga fecha', () => {
  const m = P.extractFromText(ANT([
    'Indicar si los proyectos contenidos en el PEA se encuentran validados por la Comunidad en general (por ejemplo, en Asamblea).',
    'Se encuentran validados por la Asamblea de la Comunidad de Prueba.',
    PLAN
  ]));
  assert.equal(m.community.asambleaTexto, 'Se encuentran validados por la Asamblea de la Comunidad de Prueba.');
  assert.equal(m.community.asambleaValidacion, null);
  assert.doesNotMatch(m.warnings.join(' | '), /La validación por la Asamblea no aparece/);
});

test('validación partida por el OCR: se toma la respuesta («Se encuentran…»), no la etiqueta de la pregunta', () => {
  const m = P.extractFromText(ANT([
    'encuentran validados por la Asamblea Se encuentran validados por la Asamblea de la Comunidad de',
    'Prueba.',
    PLAN
  ]));
  assert.equal(m.community.asambleaTexto, 'Se encuentran validados por la Asamblea de la Comunidad de Prueba.');
});

test('Word: la frase de la Asamblea también sale de sus tablas (el texto de las celdas)', () => {
  const tabla = { grid: [['Indicar si los proyectos contenidos en el PEA se encuentran validados por la Comunidad en general.', 'Se encuentran validados por la Asamblea de la Comunidad de Prueba.']], rows: 1, cols: 2 };
  const s = P.extractFromStructure({ tables: [tabla] });
  assert.equal(s.community.asambleaTexto, 'Se encuentran validados por la Asamblea de la Comunidad de Prueba.');
});

test('sin validación en el texto ni fecha: se avisa y queda vacía', () => {
  const m = P.extractFromText(ANT(['Nombre de comunidad', 'COMUNIDAD DE PRUEBA SINTÉTICA N°11.111.111-1', PLAN]));
  assert.equal(m.community.asambleaTexto, null);
  assert.match(m.warnings.join(' | '), /La validación por la Asamblea no aparece en el PEA; queda vacía\./);
});

/* texto con un proyecto de 400.000 con cargo al 30 % del AIA; «recibido» es 1.000.000 y el saldo se pasa en cada caso */
const textoSaldo = saldo => [
  'Indicar el monto total recibido como primera cuota, correspondiente al 30% del AIA.',
  'Aporte sintético por un total de $1.000.000.-',
  PLAN,
  'Proyecto N°1', 'Nombre del proyecto', 'PROYECTO SINTÉTICO SALDO',
  'Proyecto con cargo al 30% del AIA = 400.000.-',
  'Saldo = $' + saldo + '.-'
].join('\n');

test('saldo del 30 %: si cuadra con lo recibido menos lo asignado, no hay aviso', () => {
  const m = P.extractFromText(textoSaldo('600000'));
  assert.deepEqual(plain(m.community.aia30), { recibido: 1000000, saldo: 600000 });
  assert.doesNotMatch(m.warnings.join(' | '), /no cuadra/);
});

test('saldo del 30 %: si no cuadra, se avisa con las tres cifras', () => {
  const m = P.extractFromText(textoSaldo('500000'));
  assert.match(m.warnings.join(' | '), /no cuadra.*\$1\.000\.000.*\$400\.000.*\$600\.000.*\$500\.000/);
});

test('al corregir un campo se rehacen las filas «lo que dice el PEA» (solo PEA escaneado)', () => {
  const texto = ANT(['Nombre de comunidad', 'COMUNIDAD DE PRUEBA SINTÉTICA N°11.111.111-1', PLAN]);
  const m = P.extractFromText(texto);
  m.community.name = 'COMUNIDAD CORREGIDA';
  m.community.address = 'Calle Corregida 1';
  P.refrescarDatos(m);
  const fila = (lista, k) => (lista.find(f => f.k === k) || {}).v;
  assert.equal(fila(m.community.peaDatos, 'Nombre de comunidad'), 'COMUNIDAD CORREGIDA');
  assert.equal(fila(m.community.peaDatos, 'Dirección'), 'Calle Corregida 1');

  const w = P.extractFromText(texto, { origen: 'word' });
  w.community.name = 'OTRO NOMBRE';
  P.refrescarDatos(w);
  assert.equal(fila(w.community.peaDatos, 'Nombre de comunidad'), 'COMUNIDAD DE PRUEBA SINTÉTICA', 'el Word conserva las filas de sus tablas');
});

test('normalizar: sin teléfonos ni correos vacíos y con los objetos que la pantalla edita', () => {
  const m = P.normalizarModelo({ community: { contacto: { telefonos: ['+56911111111', '', ' '], correos: [''] } }, projects: [{ name: 'Proyecto Sintético' }] });
  assert.deepEqual(m.community.contacto.telefonos, ['+56911111111']);
  assert.deepEqual(m.community.contacto.correos, []);
  assert.deepEqual(plain(m.community.aia30), { recibido: null, saldo: null });
  assert.deepEqual(plain(m.projects[0].fuentes), { aia30: null, aia70: null, otras: null });
  assert.deepEqual(plain(m.projects[0].budgetApproved), { rrhh: null, operacion: null, inversion: null, administracion: null });
});

/* modelo sintético de la forma que deja la pantalla */
function modeloSintetico() {
  return {
    community: { name: 'Comunidad Sintética Beta', rut: '22.222.222-2', address: null, legalRep: null, oc: null, contacto: { encargado: null, secretaria: null, telefonos: [], correos: [] }, peaDatos: [] },
    projects: [{ name: 'Proyecto Sintético', code: null, start: null, end: null, budgetApproved: { rrhh: 1, operacion: 2, inversion: 3, administracion: 0 }, budgetLines: [], gantt: { stages: [] }, peaDatos: [], fuentes: { aia30: 6, aia70: null, otras: null } }],
    warnings: []
  };
}

test('al aplicar se copian dirección, organismo y validación por la Asamblea; vacíos no borran lo que hay', () => {
  const previo = { community: { name: 'Previa', rut: '', legalRep: null, address: 'Calle previa', oc: 'Organismo previo' }, projects: [], activeProjectId: null };
  const m = modeloSintetico();
  m.community.address = 'Calle Nueva 9';
  m.community.oc = 'Organismo Sintético';
  m.community.asambleaTexto = 'Se encuentran validados por la Asamblea de la Comunidad de Prueba.';
  const s = P.applyToState(previo, m, { rut: '22.222.222-2' });
  assert.equal(s.community.address, 'Calle Nueva 9');
  assert.equal(s.community.oc, 'Organismo Sintético');
  assert.equal(s.community.asambleaTexto, 'Se encuentran validados por la Asamblea de la Comunidad de Prueba.');

  const vacio = modeloSintetico();
  const t = P.applyToState(previo, vacio, { rut: '22.222.222-2' });
  assert.equal(t.community.address, 'Calle previa');
  assert.equal(t.community.oc, 'Organismo previo');
});

test('el proyecto de administración solo se crea si trae monto', () => {
  const m = modeloSintetico();
  m.projects.push({ name: 'Gastos de administración', budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: null }, budgetLines: [], gantt: { stages: [] } });
  const sin = P.applyToState({ community: {}, projects: [] }, m, { rut: '22.222.222-2' });
  assert.equal(sin.projects.some(p => p.name === 'Gastos de administración'), false);

  m.projects[1].budgetApproved.administracion = 7;
  const con = P.applyToState({ community: {}, projects: [] }, m, { rut: '22.222.222-2' });
  assert.equal(con.projects.find(p => p.name === 'Gastos de administración').budgetApproved.administracion, 7);
});

test('un PEA con gastos de administración en $0 no crea el proyecto automático (ninguna comunidad lo recibe por defecto)', () => {
  const m = modeloSintetico();
  m.projects.push({ name: 'Gastos de administración', budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: 0 }, budgetLines: [], gantt: { stages: [] } });
  const s = P.applyToState({ community: {}, projects: [] }, m, { rut: '22.222.222-2' });
  assert.equal(s.projects.some(p => p.name === 'Gastos de administración'), false);
});

test('las líneas que se escriben en la pantalla usan las claves de cuenta de la app (rrhh, operacion, inversion)', () => {
  const m = modeloSintetico();
  m.projects[0].budgetLines = [{ id: 'x', cuenta: 'operacion', item: 'Materiales', glosa: 'Glosa', fuente: 'corfo', monto: 1500, actId: '' }];
  const s = P.applyToState({ community: {}, projects: [] }, m, { rut: '22.222.222-2' });
  const linea = s.projects.find(p => p.name === 'Proyecto Sintético').budgetLines[0];
  assert.equal(linea.cuenta, 'operacion');
  assert.equal(linea.monto, 1500);
});

test('la Carta Gantt de la pantalla llega al proyecto: etapas y actividades con sus fechas', () => {
  const m = modeloSintetico();
  m.projects[0].gantt = { stages: [{ id: 's1', name: 'Etapa uno', acts: [{ id: 'a1', name: 'Taller', start: '2026-03-01', end: '2026-03-10', result: 'Taller hecho' }] }] };
  const s = P.applyToState({ community: {}, projects: [] }, m, { rut: '22.222.222-2' });
  const etapa = s.projects.find(p => p.name === 'Proyecto Sintético').gantt.stages[0];
  assert.equal(etapa.name, 'Etapa uno');
  assert.deepEqual(plain(etapa.acts[0]).name, 'Taller');
  assert.equal(etapa.acts[0].start, '2026-03-01');
  assert.equal(etapa.acts[0].result, 'Taller hecho');
});

test('normalizar: las filas vacías de presupuesto y de la Carta Gantt no se aplican', () => {
  const m = P.normalizarModelo({
    community: {},
    projects: [{ name: 'Proyecto Sintético',
      budgetLines: [{ item: '', monto: 0 }, { item: 'Útil', monto: 0 }, { item: '', monto: 900 }],
      gantt: { stages: [{ name: 'Con actividad', acts: [{ name: '' }, { name: 'Real' }] }, { name: '', acts: [] }, { name: '', acts: [{ name: 'Huérfana' }] }] } }]
  });
  assert.equal(m.projects[0].budgetLines.length, 2);
  assert.deepEqual(m.projects[0].gantt.stages.map(s => s.name), ['Con actividad', '']);
  assert.deepEqual(m.projects[0].gantt.stages[0].acts.map(a => a.name), ['Real']);
});
