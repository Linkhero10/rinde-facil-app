/* Lectura del PEA por TEXTO (RF.pea.extractFromText) con textos SINTÉTICOS: nombres, RUT y cifras inventados.
 * Cubre las formas que deja el OCR (rótulos partidos, valores mezclados) y las del texto del Word. */
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
for (const file of ['01-util.js', '02-store.js']) vm.runInContext(fs.readFileSync(path.join(jsDir, file), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(jsDir, '23-read-docx.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(jsDir, '24-pea-extract.js'), 'utf8'), ctx);
const P = ctx.RF.pea;
const plain = x => JSON.parse(JSON.stringify(x));
/* antecedentes: líneas que siguen a «Nombre de comunidad»… y cortan en el Plan de Vida */
const ANT = lineas => lineas.join('\n');
const PLAN = '2. Antecedentes del Plan de Vida de la Comunidad o similar (opcional)';

test('texto vacío: modelo vacío con el aviso de calidad (escaneado) y un aviso propio (Word)', () => {
  const m = plain(P.extractFromText('   \n  ', {}));
  assert.deepEqual(m.warnings, ['El OCR no devolvió texto legible: revisa que el PDF sea de buena calidad.']);
  assert.deepEqual(m.projects, []);
  assert.equal(m.community.name, null);
  assert.deepEqual(plain(P.extractFromText('', { origen: 'word' })).warnings, ['El texto del PEA está vacío.']);
});

test('nombre de comunidad sin el RUT pegado; el RUT pasa sin «N°»', () => {
  const m = P.extractFromText(ANT([
    'Nombre de comunidad',
    'Rut de la comunidad',
    'COMUNIDAD DE PRUEBA SINTÉTICA N°11.111.111-1',
    'Comunidad de prueba en minúscula',
    PLAN
  ]));
  assert.equal(m.community.name, 'COMUNIDAD DE PRUEBA SINTÉTICA');
  assert.equal(m.community.rut, '11.111.111-1');
});

test('el RUT que va tras «Rut:» es de una persona: no se toma como RUT de la comunidad', () => {
  const m = P.extractFromText(ANT(['Nombre Encargado Convenio', 'Sra. Ana Prueba Ejemplo', 'Rut: 22.222.222-2', PLAN]));
  assert.equal(m.community.rut, null);
  assert.match(m.warnings.join(' | '), /No se encontró el RUT de la comunidad/);
  assert.deepEqual(plain(m.community.contacto.secretaria), { nombre: 'Ana Prueba Ejemplo', rut: '22.222.222-2' });
});

test('secretaria: su RUT sale de la celda del encargado, con o sin la palabra «Secretaria»', () => {
  const con = P.extractFromText(ANT(['Nombre Encargado Convenio', 'Sra. Ana Prueba Ejemplo', 'Secretaria de la Comunidad', 'Rut: 22.222.222-2', PLAN]));
  assert.deepEqual(plain(con.community.contacto.secretaria), { nombre: 'Ana Prueba Ejemplo', rut: '22.222.222-2' });
  const sin = P.extractFromText(ANT(['Nombre Encargado Convenio', 'Sra. Ana Prueba Ejemplo', 'Rut: 22.222.222-2', PLAN]));
  assert.deepEqual(plain(sin.community.contacto.secretaria), { nombre: 'Ana Prueba Ejemplo', rut: '22.222.222-2' });
  assert.equal(P.extractFromText(ANT(['Nombre Encargado Convenio', 'Sra. Ana Prueba Ejemplo', PLAN])).community.contacto.secretaria, null);
});

test('teléfonos (+56 y 9 dígitos, sin espacios) y correos aunque el OCR los mezcle con las etiquetas', () => {
  const m = P.extractFromText(ANT([
    'Nombre Encargado Convenio',
    'Teléfono de contacto de',
    'Encargado Convenio',
    '+56 9 1111 1111',
    'Correo',
    'electrónico',
    'Encargado Convenio',
    'uno@ejemplo.test',
    '+56922223333',
    'del dos@ejemplo.test',
    PLAN,
    'Teléfono de prueba posterior +56 9 9999 9999'
  ]));
  assert.deepEqual(plain(m.community.contacto.telefonos), ['+56911111111', '+56922223333'], 'lo que sigue al Plan de Vida no cuenta');
  assert.deepEqual(plain(m.community.contacto.correos), ['uno@ejemplo.test', 'dos@ejemplo.test']);
});

test('fecha de entrega con el rótulo partido pasa a ISO; la de la Asamblea sólo si dice «de fecha»', () => {
  const sin = P.extractFromText(ANT(['Fecha de entrega del Proyecto a', 'CORFO', 'Se encuentran validados por la Asamblea de la Comunidad de Prueba.', '25-8-2020', PLAN]));
  assert.equal(sin.community.fechaEntrega, '2020-08-25');
  assert.equal(sin.community.asambleaValidacion, null);
  assert.equal(sin.warnings.some(w => /Asamblea/.test(w)), false, 'sin fecha de Asamblea no hay aviso');
  const con = P.extractFromText(ANT(['Fecha de entrega del Proyecto a CORFO', '20-03-2024', 'Se encuentran validados por la Asamblea de la Comunidad de Prueba de fecha 07-02-2024', PLAN]));
  assert.equal(con.community.fechaEntrega, '2024-03-20');
  assert.equal(con.community.asambleaValidacion, '2024-02-07');
});

test('fecha de entrega imposible (31-02-2024): queda vacía con aviso', () => {
  const m = P.extractFromText(ANT(['Fecha de entrega del Proyecto a CORFO', '31-02-2024', PLAN]));
  assert.equal(m.community.fechaEntrega, null);
  assert.match(m.warnings.join(' | '), /no aparece o no es válida/);
});

test('proyecto con el rótulo partido: nombre en mayúsculas («RESPUESTA» no cuenta) y fechas en texto español', () => {
  const m = P.extractFromText([
    'Proyecto N°1',
    'Fortalecimiento de prueba',
    'INFORMACI',
    'ÓN',
    'SOLICITADA',
    'Nombre del',
    'proyecto',
    'Objetivo',
    'general',
    'RESPUESTA',
    'PROYECTO SINTÉTICO UNO',
    'Plazo estimado para el desarrollo del proyecto.',
    'Fecha de inicio: 1 de julio de 2022',
    'Fecha de término: 28 de febrero 2023'
  ].join('\n'));
  const p = m.projects[0];
  assert.equal(p.name, 'PROYECTO SINTÉTICO UNO');
  assert.equal(p.start, '2022-07-01');
  assert.equal(p.end, '2023-02-28');
  assert.equal(m.projects.length, 2);
});

test('fecha de término inexistente (31 de abril) queda vacía con aviso', () => {
  const m = P.extractFromText(['Proyecto N°1', 'Nombre del proyecto', 'PROYECTO SINTÉTICO DOS', 'Fecha de inicio: 1 de mayo de 2024', 'Fecha de término: 31 de abril de 2025'].join('\n'));
  assert.equal(m.projects[0].start, '2024-05-01');
  assert.equal(m.projects[0].end, null);
  assert.match(m.warnings.join(' | '), /fecha de término no es una fecha válida \("31 de abril de 2025"\)/);
});

test('consolidado: 5 montos en orden; administración al proyecto automático; si no cuadra, aviso con ambos valores', () => {
  const texto = total => [
    'Proyecto N°1', 'Nombre del proyecto', 'PROYECTO SINTÉTICO TRES',
    'Tabla 1', 'CONSOLIDADO DE COSTOS DEL PROYECTO', '(Solo gastos financiables)',
    'a) Cuenta de Recursos Humanos', 'b) Cuenta Gastos de Inversión', 'c) Gastos operacionales', 'd) Gastos administración', 'TOTAL, impuestos incluidos',
    '$1.000.000.-', '$2.000.000.-', '$3.000.000.-', '$500.000.-', total,
    'A continuación, se presentan tres tablas.'
  ].join('\n');
  const ok = P.extractFromText(texto('$6.500.000.-'));
  assert.deepEqual(plain(ok.projects[0].budgetApproved), { rrhh: 1000000, operacion: 3000000, inversion: 2000000, administracion: 0 });
  assert.equal(ok.projects.find(x => x.name === 'Gastos administrativos').budgetApproved.administracion, 500000);
  assert.equal(ok.warnings.some(w => /no cuadra/.test(w)), false);
  const mal = P.extractFromText(texto('$6.000.000.-'));
  assert.match(mal.warnings.join(' | '), /el consolidado no cuadra: la suma de cuentas es \$6\.500\.000 y el total declarado \$6\.000\.000/);
});

test('consolidado con 4 montos: no se asigna nada a ciegas; queda vacío con aviso', () => {
  const m = P.extractFromText(['Proyecto N°1', 'Nombre del proyecto', 'PROYECTO SINTÉTICO CUATRO', 'CONSOLIDADO DE COSTOS DEL PROYECTO', '$1.000.-', '$2.000.-', '$3.000.-', '$6.000.-', 'A continuación, se presentan dos tablas.'].join('\n'));
  assert.equal(m.projects[0].budgetApproved.rrhh, null);
  assert.match(m.warnings.join(' | '), /no trae los 5 montos en orden/);
});

test('fuentes: «con cargo al 30 % / 70 % del AIA = X»; «otras fuentes» con N/A queda vacío', () => {
  const m = P.extractFromText([
    'Proyecto N°1', 'Nombre del proyecto', 'PROYECTO SINTÉTICO FUENTES',
    'Indicar monto ($) correspondiente al saldo del 30% del AIA, destinado a financiar el proyecto.',
    'Proyecto con cargo al 30% del AIA = 1.234.567.-',
    'Indicar monto ($) solicitado en desembolsos futuros, con cargo al 70% del AIA o Aportes Subsecuentes.',
    'Proyecto con cargo al 70% del AIA = $2.000.000.-',
    'Presupuesto ($) del proyecto a financiarse mediante otras fuentes de recursos, impuestos incluidos (si aplica).',
    'N/A'
  ].join('\n'));
  assert.deepEqual(plain(m.projects[0].fuentes), { aia30: 1234567, aia70: 2000000, otras: null });
});

test('fuentes del escaneado: el 30 % va como «Proyecto <nombre> $X» junto a su rótulo; «Saldo = $X» es el saldo del 30 %', () => {
  const m = P.extractFromText([
    'Proyecto N°1', 'Nombre del proyecto', 'PROYECTO SINTÉTICO OCR',
    'Indicar monto ($) correspondiente al saldo del',
    '30% del AIA, Proyecto Sintético OCR $750.000.-',
    'Saldo =$250.000.-',
    'destinado a financiar el proyecto.'
  ].join('\n'));
  assert.equal(m.projects[0].fuentes.aia30, 750000);
  assert.equal(m.community.aia30.saldo, 250000);
});

test('presidente: sugerencia desde «(presidente…)»; «(Ex presidente…)» no cuenta; legalRep no se toca', () => {
  const m = P.extractFromText(ANT(['Nombre Encargado Convenio', 'Sra. Ana Prueba Ejemplo', PLAN, 'Carla Ejemplo Prueba (presidente de la comunidad)']));
  assert.deepEqual(plain(m.community.presidente), { nombre: 'Carla Ejemplo Prueba' });
  assert.equal(m.community.legalRep, null);
  assert.equal(P.extractFromText('Manuel Ejemplo Prueba (Ex presidente de la comunidad principal)').community.presidente, null);
  const varias = P.extractFromText(['Ignacio', 'Ruiz', 'Zamora', '-', '- Presidir la mesa de Trabajo.', 'Hacer seguimiento', '(presidente de la', 'comunidad)'].join('\n'));
  assert.deepEqual(plain(varias.community.presidente), { nombre: 'Ignacio Ruiz Zamora' });
});

test('monto total recibido (30 % del AIA) y saldo del 30 % quedan en community.aia30', () => {
  const m = P.extractFromText(ANT([
    'Indicar el monto total recibido como primera cuota, correspondiente al 30% del AIA.',
    '378.184 USD aportados a la cuenta corriente de prueba, con fecha 1 de abril de 2022 por un total de',
    '$297.211.024.-',
    'Indicar el monto ($) del saldo que queda disponible del 30% del AIA',
    '$179.019.606.- 31.600.000',
    '= 147.419.606',
    PLAN
  ]));
  assert.deepEqual(plain(m.community.aia30), { recibido: 297211024, saldo: 147419606 });
});

test('administración: el total de la tabla de antecedentes se avisa si los consolidados dan otro monto', () => {
  const m = P.extractFromText(['Total de gastos administrativos: $31.600.000.-', 'Proyecto N°1', 'Nombre del proyecto', 'PROYECTO SINTÉTICO SIETE', 'CONSOLIDADO DE COSTOS DEL PROYECTO', '$1.000.000.-', '$0', '$0', '$0', '$1.000.000.-', 'A continuación, se presentan dos tablas.'].join('\n'));
  assert.match(m.warnings.join(' | '), /indica gastos administrativos totales por \$31\.600\.000, pero los consolidados suman \$0/);
  assert.equal(m.projects.find(x => x.name === 'Gastos administrativos').budgetApproved.administracion, 0);
});

test('texto del Word: sin los avisos propios del escaneado (dirección, apoyo, Gantt)', () => {
  const m = P.extractFromText(ANT(['Nombre de comunidad', 'COMUNIDAD DE PRUEBA SINTÉTICA', PLAN]), { origen: 'word' });
  assert.equal(m.community.name, 'COMUNIDAD DE PRUEBA SINTÉTICA');
  assert.equal(m.warnings.some(w => /PEA escaneado|Gantt|dirección/.test(w)), false, m.warnings.join(' | '));
});
