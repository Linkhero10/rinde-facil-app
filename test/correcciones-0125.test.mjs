/* SMI-RF-03, pedido 0125Z: M-4 (inicio), M-5 (pasos automáticos y «Marcar todos») y B-6 (RUT de los asistentes).
   Las pruebas de interfaz usan un DOM falso que dispara los eventos (test/dom-falso.mjs), no funciones sueltas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load.mjs';
import { documentoFalso, buscar, botonPorTexto } from './dom-falso.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const plano = x => JSON.parse(JSON.stringify(x));

/* la app completa con la interfaz y los formularios; el DOM es el falso de test/dom-falso.mjs */
function cargaVistas() {
  const files = fs.readdirSync(path.join(here, '..', 'js')).filter(f => /^(00|0[1-5]|1\d|2\d|33)-.*\.js$/.test(f)).sort();
  return loadApp(files.concat(['30-ui.js', '31-forms.js', '40-views.js']), {
    RF: { ui: {}, tools: {} }, document: documentoFalso(), setTimeout: () => 0
  });
}

/* ---------- M-4: el inicio no crea el proyecto con un RUT que no cuadra ---------- */

test('M-4: con un RUT de comunidad que no cuadra, «Empezar» no crea el proyecto y deja el error en la pantalla', () => {
  const RF = cargaVistas();
  RF.store.attach(RF.store.defaults());
  const s = RF.store.get();
  s.community.name = 'Comunidad de prueba';
  s.community.rut = '00000-0';
  const vista = RF.views.home();
  botonPorTexto(vista, 'Empezar').dispatch('click');
  assert.equal(RF.store.get().projects.length, 0, 'no se crea el proyecto');
  const aviso = buscar(vista, n => n.getAttribute('role') === 'alert')[0];
  assert.match(aviso.textContent, /El RUT de la comunidad no es válido/);
});

test('M-4: con un RUT que cuadra, o sin RUT, «Empezar» sí crea el proyecto', () => {
  for (const rut of ['12345678-5', '']) {
    const RF = cargaVistas();
    RF.store.attach(RF.store.defaults());
    const s = RF.store.get();
    s.community.name = 'Comunidad de prueba';
    s.community.rut = rut;
    const vista = RF.views.home();
    botonPorTexto(vista, 'Empezar').dispatch('click');
    assert.equal(RF.store.get().projects.length, 1, 'se crea el proyecto con RUT «' + rut + '»');
  }
});

/* ---------- M-5 (a): un paso automático no se marca solo con un RUT inválido ---------- */

test('M-5: el paso «informe» (TRM-016) no se marca solo con un RUT de la comunidad inválido en el formulario', () => {
  const RF = cargaVistas();
  RF.store.attach(RF.store.defaults());
  const malo = RF.store.newProject('Proyecto malo');
  malo.forms.informe = { data: { objetivoGeneral: 'Objetivo', comunidadRut: '00000-0' } };
  const bueno = RF.store.newProject('Proyecto bueno');
  bueno.forms.informe = { data: { objetivoGeneral: 'Objetivo', comunidadRut: '12345678-5' } };
  const r1 = RF.logic.autoStep(malo, 'TRM-016', 0);
  assert.equal(r1.done, false);
  assert.match(r1.why, /RUT/);
  assert.equal(RF.logic.autoStep(bueno, 'TRM-016', 0).done, true);
});

test('M-5: el paso «fichas» (TRM-016) no se marca solo con una ficha de persona que tiene un RUT inválido', () => {
  const RF = cargaVistas();
  RF.store.attach(RF.store.defaults());
  const malo = RF.store.newProject('Proyecto malo');
  malo.forms.informeD = [{ id: 'f1', data: { nombre: 'Ana', rut: '00000-0' } }];
  const bueno = RF.store.newProject('Proyecto bueno');
  bueno.forms.informeD = [{ id: 'f1', data: { nombre: 'Ana', rut: '12345678-5' } }];
  const r1 = RF.logic.autoStep(malo, 'TRM-016', 1);
  assert.equal(r1.done, false);
  assert.match(r1.why, /RUT/);
  assert.equal(RF.logic.autoStep(bueno, 'TRM-016', 1).done, true);
});

test('M-5: el paso «viaje» (TRM-011) no se marca solo con un RUT inválido en la lista de asistentes', () => {
  const RF = cargaVistas();
  RF.store.attach(RF.store.defaults());
  const viaje = (rut) => [{ id: 'v1', data: { destino: 'Calama', motivo: 'Reunión', asistentes: [{ nombre: 'Ana', rut, rol: 'Otro', porque: 'Coordina' }] } }];
  const malo = RF.store.newProject('Proyecto malo');
  malo.forms.viaje = viaje('00000-0');
  const bueno = RF.store.newProject('Proyecto bueno');
  bueno.forms.viaje = viaje('12345678-5');
  const r1 = RF.logic.autoStep(malo, 'TRM-011', 0);
  assert.equal(r1.done, false);
  assert.match(r1.why, /RUT/);
  assert.equal(RF.logic.autoStep(bueno, 'TRM-011', 0).done, true);
});

/* ---------- M-5 (b): «Marcar todos» aplica la compuerta de cada paso ---------- */

test('M-5: «Marcar todos» no marca un paso de la compuerta con un RUT inválido en su formulario, y sí los demás', () => {
  const RF = cargaVistas();
  RF.store.attach(RF.store.defaults());
  RF.store.addProject('Proyecto de prueba');
  RF.store.project().forms.peaGeneral = { data: { resumen: 'Plan', rut: '00000-0' } };
  const t = { steps: ['a', 'b', 'c'], gate: [1], embed: ['peaGeneral'] };
  const r = RF.views.marcarTodos(t, 'TRM-T1');
  const p = RF.store.project();
  assert.deepEqual(plano(r.saltados), [1]);
  assert.equal(RF.store.isDone(p, 'TRM-T1', 0), true, 'un paso sin compuerta sí se marca');
  assert.equal(RF.store.isDone(p, 'TRM-T1', 1), false, 'el paso con RUT inválido no se marca');
  assert.equal(RF.store.isDone(p, 'TRM-T1', 2), true);
  assert.match(r.motivo, /RUT/);
});

test('M-5: «Marcar todos» no marca un paso de la compuerta con otro error bloqueante de su formulario', () => {
  const RF = cargaVistas();
  RF.store.attach(RF.store.defaults());
  RF.store.addProject('Proyecto de prueba');
  RF.store.project().forms.viaje = [{ id: 'v1', data: { destino: 'Calama', motivo: 'Reunión', desde: '2026-10-10', hasta: '2026-10-01', asistentes: [{}], anticipacion: true } }];
  const t = { steps: ['a', 'b'], gate: [0], embed: ['viaje'] };
  const r = RF.views.marcarTodos(t, 'TRM-T2');
  const p = RF.store.project();
  assert.deepEqual(plano(r.saltados), [0]);
  assert.equal(RF.store.isDone(p, 'TRM-T2', 0), false);
  assert.equal(RF.store.isDone(p, 'TRM-T2', 1), true);
  assert.match(r.motivo, /anterior a la salida/);
});

test('M-5: «Marcar todos» marca también la compuerta cuando el formulario no tiene errores', () => {
  const RF = cargaVistas();
  RF.store.attach(RF.store.defaults());
  RF.store.addProject('Proyecto de prueba');
  RF.store.project().forms.peaGeneral = { data: { resumen: 'Plan', rut: '12345678-5' } };
  const t = { steps: ['a', 'b'], gate: [1], embed: ['peaGeneral'] };
  const r = RF.views.marcarTodos(t, 'TRM-T3');
  const p = RF.store.project();
  assert.deepEqual(plano(r.saltados), []);
  assert.equal(RF.store.isDone(p, 'TRM-T3', 0), true);
  assert.equal(RF.store.isDone(p, 'TRM-T3', 1), true);
});

/* ---------- B-6: el RUT de los asistentes del viaje se formatea al salir del campo ---------- */

test('B-6: el RUT de cada asistente del viaje formatea al salir del campo, como en los demás formularios', () => {
  const RF = cargaVistas();
  RF.store.attach(RF.store.defaults());
  RF.store.addProject('Proyecto de prueba');
  const p = RF.store.project();
  p.forms.viaje = [{ id: 'v1', data: RF.forms.SCHEMAS.viaje.defaults({ project: p, community: {} }) }];
  p.forms.viaje[0].data.asistentes = [{ nombre: 'Ana', rut: '', rol: '', porque: '' }];
  const vista = RF.forms.renderRepeat('viaje', RF.forms.ctxNow());
  const campo = buscar(vista, n => n.getAttribute('aria-label') === 'RUT')[0];
  assert.ok(campo, 'hay un campo RUT en la lista de asistentes');
  campo.value = '12345678-5';
  campo.dispatch('input');
  campo.dispatch('blur');
  assert.equal(campo.value, '12.345.678-5');
  assert.equal(RF.store.project().forms.viaje[0].data.asistentes[0].rut, '12.345.678-5');
});
