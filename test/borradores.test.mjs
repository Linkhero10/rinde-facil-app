/* Memoria de pantalla (js/59-borradores.js) con un DOM y un almacén FALSOS: no toca datos reales ni el navegador. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

class FakeEvent { constructor(type, opts) { this.type = type; this.bubbles = !!(opts && opts.bubbles); } }

function campo(tag, props) {
  const attrs = (props && props.attrs) || {};
  const el = Object.assign({ tagName: tag.toUpperCase(), type: '', name: '', id: '', value: '', checked: false, disabled: false, readOnly: false, events: [] }, props);
  el.hasAttribute = a => Object.prototype.hasOwnProperty.call(attrs, a);
  el.dispatchEvent = e => { el.events.push(e.type); return true; };
  return el;
}
function pantalla(campos) {
  const oyentes = {};
  return { isConnected: true, querySelectorAll: () => campos, addEventListener(t, f) { (oyentes[t] = oyentes[t] || []).push(f); }, oyentes };
}
function almacen(estado) {
  const llamadas = [];
  return {
    llamadas,
    get: () => estado,
    update(fn, opts) { fn(estado); llamadas.push(opts || {}); }
  };
}
function cargar(estado) {
  const ctx = { Event: FakeEvent, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ctx.RF = { store: almacen(estado) };
  vm.runInContext(fs.readFileSync(path.join(here, '..', 'js', '59-borradores.js'), 'utf8'), ctx);
  return ctx.RF;
}

test('guarda lo que se escribe o se elige, y deja fuera contraseñas, archivos, ocultos y campos calculados', () => {
  const estado = { ui: {} };
  const RF = cargar(estado);
  const root = pantalla([
    campo('input', { type: 'text', name: 'fecha', value: '2026-10-13' }),
    campo('select', { type: 'select-one', name: 'tipo', value: 'otro' }),
    campo('input', { type: 'checkbox', name: 'urgente', checked: true }),
    campo('input', { type: 'password', name: 'clave', value: 'no-se-guarda' }),
    campo('input', { type: 'file', name: 'adjunto' }),
    campo('input', { type: 'hidden', name: 'token', value: 'x' }),
    campo('input', { type: 'text', name: 'total', value: '5', disabled: true }),
    campo('textarea', { type: 'textarea', name: 'obs', value: 'Reunión con la mesa' })
  ]);
  RF.borradores.guardar('calendario', root);
  const guardado = estado.ui.borradores.calendario;
  assert.equal(guardado['fecha|INPUT|text#1'], '2026-10-13');
  assert.equal(guardado['tipo|SELECT|select-one#1'], 'otro');
  assert.equal(guardado['urgente|INPUT|checkbox#1'], true);
  assert.equal(guardado['obs|TEXTAREA|textarea#1'], 'Reunión con la mesa');
  assert.equal(Object.keys(guardado).some(k => /clave|adjunto|token|total/.test(k)), false);
});

test('al volver a dibujar la pantalla, pone los valores guardados y avisa a la herramienta como si el usuario los hubiera escrito', () => {
  const estado = { ui: { borradores: { calendario: { 'fecha|INPUT|text#1': '2026-11-02', 'urgente|INPUT|checkbox#1': true } } } };
  const RF = cargar(estado);
  const nueva = pantalla([
    campo('input', { type: 'text', name: 'fecha', value: '' }),
    campo('input', { type: 'checkbox', name: 'urgente', checked: false })
  ]);
  RF.borradores.restaurar('calendario', nueva);
  assert.equal(nueva.querySelectorAll()[0].value, '2026-11-02');
  assert.equal(nueva.querySelectorAll()[1].checked, true);
  assert.deepEqual(nueva.querySelectorAll()[0].events, ['change']);
  assert.deepEqual(nueva.querySelectorAll()[1].events, ['change']);
});

test('restaurar no avisa de nuevo cuando el valor ya está puesto', () => {
  const estado = { ui: { borradores: { calendario: { 'fecha|INPUT|text#1': 'igual' } } } };
  const RF = cargar(estado);
  const campos = [campo('input', { type: 'text', name: 'fecha', value: 'igual' })];
  RF.borradores.restaurar('calendario', pantalla(campos));
  assert.deepEqual(campos[0].events, []);
});

test('guardar sin cambios no vuelve a escribir el estado', () => {
  const estado = { ui: {} };
  const RF = cargar(estado);
  const root = pantalla([campo('input', { type: 'text', name: 'nombre', value: 'Ana' })]);
  RF.borradores.guardar('cotizaciones', root);
  RF.borradores.guardar('cotizaciones', root);
  assert.equal(RF.store.llamadas ? RF.store.llamadas.length : 1, 1);
});

test('la memoria de datos guarda, recuerda y borra por clave', () => {
  const estado = { ui: {} };
  const RF = cargar(estado);
  RF.borradores.memorizar('pea', { fileName: 'lectura de prueba', model: { community: {} } });
  assert.equal(RF.borradores.recordar('pea').fileName, 'lectura de prueba');
  RF.borradores.memorizar('pea', null);
  assert.equal(RF.borradores.recordar('pea'), null);
});

test('las pantallas con modo de edición (gastos, documentos, actas) no restauran ni guardan campos', () => {
  const estado = { ui: { borradores: { gastos: { 'monto|INPUT|text#1': '999' } } } };
  const RF = cargar(estado);
  const campos = [campo('input', { type: 'text', name: 'monto', value: '' })];
  RF.borradores.despues('gastos', pantalla(campos));
  assert.equal(campos[0].value, '');
  assert.deepEqual(campos[0].events, []);
  RF.borradores.despues('gastos', pantalla([]));
  RF.borradores.antes();
  assert.equal(RF.store.llamadas.length, 0);
});

test('antes y después no fallan sin pantalla de herramienta (rutas que no son herramientas)', () => {
  const estado = { ui: {} };
  const RF = cargar(estado);
  assert.doesNotThrow(() => RF.borradores.antes());
  assert.doesNotThrow(() => RF.borradores.despues(null, pantalla([])));
});
