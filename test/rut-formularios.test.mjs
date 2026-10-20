/* RUT en la app (SMI-RF-03): el campo no limpia en silencio (A-1); los formularios, la comunidad y el borrador del PEA no dan por listo
   un RUT que no cuadra (A-2); se documenta la regla del analizador heredado del piloto (M-3) y que la posición de los puntos no se valida (B-4). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load.mjs';
import { documentoFalso } from './dom-falso.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const RUT_MALO = '00000-0';
const RUT_BUENO = '12345678-5';
/* copia de los nodos falsos de test/ui.test.mjs: el módulo de interfaz los necesita al cargarse */
class FakeNode {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.className = ''; this.parentNode = null; this._text = ''; this.style = {}; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener() {}
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
  get firstChild() { return this.children[0] || null; }
  get textContent() { return this._text + this.children.map(child => child.textContent || '').join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get classList() { return { add: name => { this.className += ' ' + name; } }; }
}
/* copia a este contexto de prueba: los objetos creados dentro de vm no se comparan con deepEqual */
const plano = x => JSON.parse(JSON.stringify(x));

function cargaUi() {
  const host = new FakeNode('div');
  const document = {
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const n = new FakeNode('#text'); n.textContent = text; return n; },
    getElementById: id => (id === 'toasts' ? host : null)
  };
  return loadApp(['01-util.js', '30-ui.js'], { document, setTimeout: () => 0 });
}
/* la app completa de js/ con los formularios (como test/integrity.test.mjs) */
function cargaApp() {
  const files = fs.readdirSync(path.join(here, '..', 'js')).filter(f => /^(00|0[1-5]|1\d|2\d|33)-.*\.js$/.test(f)).sort();
  return loadApp(files.concat(['31-forms.js']), { RF: { ui: {}, tools: {} } });
}

function contexto(RF) {
  const project = RF.store.newProject('Proyecto de prueba');
  const community = { name: 'Comunidad de prueba', rut: '76123456-0', legalRep: 'Persona de prueba', repRut: RUT_BUENO, address: 'Calle 1', email: '', phone: '', oc: '' };
  return { project, community };
}
/* los errores que da un formulario con un documento dado (repetible o no) */
function errores(RF, ctx, id, data, repetible) {
  ctx.project.forms[id] = repetible ? [{ id: 'f1', data }] : { data };
  return RF.forms.errors([id], ctx);
}
/* los formularios repetibles anteponen el nombre del documento: «Calama: El RUT de … no es válido.» */
const esErrorDeRut = m => /El RUT .* no es válido/.test(m);

/* campo RUT de cada formulario que trae RUT: cambiar(ctx, rut) devuelve los campos del documento con ese RUT */
const FORMULARIOS = [
  { id: 'anexo1', repetible: false, cambiar: (ctx, rut) => ({ repRut: rut }) },
  { id: 'anexo3', repetible: true, cambiar: (ctx, rut) => ({ proveedorNombre: 'Persona de prueba', monto: 1000, proveedorRut: rut }) },
  { id: 'viaje', repetible: true, cambiar: (ctx, rut) => ({ destino: 'Calama', motivo: 'Reunión', asistentes: [{ nombre: 'Persona de prueba', rut, rol: 'Otro', porque: 'Coordina' }] }) },
  { id: 'informe', repetible: false, cambiar: (ctx, rut) => ({ comunidadRut: rut }) },
  { id: 'informeD', repetible: true, cambiar: (ctx, rut) => ({ nombre: 'Persona de prueba', rut }) },
  { id: 'peaGeneral', repetible: false, cambiar: (ctx, rut) => ({ rut }) }
];
function documento(RF, ctx, f, rut) {
  return Object.assign(RF.forms.SCHEMAS[f.id].defaults(ctx), f.cambiar(ctx, rut));
}

/* ---------- A-1: el campo no limpia en silencio ---------- */

test('A-1: un RUT que no cuadra al salir del campo se queda como se escribió; uno que cuadra se da formato', () => {
  const RF = cargaUi();
  const malo = RF.ui.rutAlSalir('12a345678-5');
  assert.equal(malo.valor, '12a345678-5');
  assert.equal(malo.guardar, false);
  const bueno = RF.ui.rutAlSalir('12345678-5');
  assert.equal(bueno.valor, '12.345.678-5');
  assert.equal(bueno.guardar, true);
  const vacio = RF.ui.rutAlSalir('');
  assert.equal(vacio.valor, '');
  assert.equal(vacio.guardar, false);
});

/* ---------- A-2: los formularios no dan por listo un RUT que no cuadra ---------- */

for (const f of FORMULARIOS) {
  test('A-2: con un RUT que no cuadra, «' + f.id + '» no queda listo', () => {
    const RF = cargaApp();
    const ctx = contexto(RF);
    const malos = plano(errores(RF, ctx, f.id, documento(RF, ctx, f, RUT_MALO), f.repetible));
    assert.ok(malos.some(esErrorDeRut), 'hay un error de RUT: ' + JSON.stringify(malos));
  });

  test('A-2: con un RUT que cuadra, o sin RUT, «' + f.id + '» no da error de RUT', () => {
    const RF = cargaApp();
    const ctx = contexto(RF);
    const bueno = plano(errores(RF, ctx, f.id, documento(RF, ctx, f, RUT_BUENO), f.repetible));
    assert.equal(bueno.some(esErrorDeRut), false, JSON.stringify(bueno));
    const vacio = plano(errores(RF, ctx, f.id, documento(RF, ctx, f, ''), f.repetible));
    assert.equal(vacio.some(esErrorDeRut), false, JSON.stringify(vacio));
  });
}

test('A-2: un RUT de la comunidad o una cédula del representante que no cuadra impide dar el proyecto por listo', () => {
  const RF = cargaApp();
  const p = RF.store.newProject('Proyecto de prueba');
  const erroresDelProyecto = com => plano(RF.logic.reconcile(p, com, '2026-10-19', []).groups
    .find(g => g.id === 'proyecto').items.filter(i => i.level === 'error'));
  const malaComunidad = erroresDelProyecto({ rut: RUT_MALO, repRut: RUT_BUENO });
  assert.equal(malaComunidad.length, 1);
  assert.match(malaComunidad[0].msg, /RUT de la comunidad/);
  const malaCedula = erroresDelProyecto({ rut: '76123456-0', repRut: '12a345678-5' });
  assert.equal(malaCedula.length, 1);
  assert.match(malaCedula[0].msg, /cédula del representante/);
  assert.deepEqual(erroresDelProyecto({ rut: '76123456-0', repRut: RUT_BUENO }), []);
});

test('A-2: el borrador del PEA con un RUT que no cuadra no se puede aplicar', () => {
  const RF = cargaApp();
  const malos = plano(RF.pea.rutsInvalidos({ community: { rut: RUT_MALO, contacto: { secretaria: { rut: RUT_BUENO } } } }));
  assert.deepEqual(malos, ['El RUT de la comunidad no es válido.']);
  const encargado = plano(RF.pea.rutsInvalidos({ community: { rut: '76123456-0', contacto: { secretaria: { rut: '1-2' } } } }));
  assert.deepEqual(encargado, ['El RUT del encargado no es válido.']);
  assert.deepEqual(plano(RF.pea.rutsInvalidos({ community: { rut: '', contacto: { secretaria: { rut: '' } } } })), []);
});

/* ---------- B-4: la posición de los puntos no se valida (es formato, no cálculo) ---------- */

test('B-4: rutValid acepta puntos fuera de su sitio: es una laxitud de formato, no de cálculo', () => {
  const RF = cargaApp();
  assert.equal(RF.util.rutValid('1.2345678-5'), true, 'un punto mal puesto');
  assert.equal(RF.util.rutValid('76.123.4560'), true, 'sin guion, con el punto antes del dígito verificador');
  assert.equal(RF.util.rutValid('76.123.456-9'), false, 'pero el dígito verificador sí se calcula');
});

/* ---------- M-3: el analizador heredado del piloto tiene otra regla de RUT ---------- */

test('M-3: el analizador heredado del piloto (vendor/parser.js) tiene otra regla de RUT: se documenta, no se cambia', () => {
  const piloto = { console };
  vm.createContext(piloto);
  vm.runInContext(fs.readFileSync(path.join(here, '..', 'vendor', 'parser.js'), 'utf8'), piloto);
  assert.equal(piloto.validateAndNormalizeRut('0000000-0').dvValid, true, 'el piloto acepta un cuerpo de ceros de 7 dígitos');
  assert.equal(piloto.validateAndNormalizeRut('1234-3').normalized, null, 'el piloto no acepta un cuerpo de 4 dígitos');
  const RF = cargaApp();
  assert.equal(RF.util.rutValid('0000000-0'), false, 'la app rechaza el cero');
  assert.equal(RF.util.rutValid('1234-3'), true, 'la app acepta un cuerpo de 4 dígitos desde 1.000');
});

/* ---------- B-7: cobertura: el RUT de la comunidad en el Anexo 1 y el blur real del campo ---------- */

test('B-7: «anexo1» con un RUT de la comunidad inválido no queda listo (no solo el de quien firma)', () => {
  const RF = cargaApp();
  const ctx = contexto(RF);
  const data = documento(RF, ctx, { id: 'anexo1', cambiar: (c, rut) => ({ comunidadRut: rut }) }, RUT_MALO);
  const malos = plano(errores(RF, ctx, 'anexo1', data, false));
  assert.ok(malos.some(esErrorDeRut), JSON.stringify(malos));
});

test('B-7: el blur real del campo (con su evento, no con la función) deja como se escribió lo que no cuadra y formatea lo que cuadra', () => {
  const RF = loadApp(['00-service-trust.js', '01-util.js', '02-store.js', '30-ui.js'], { document: documentoFalso(), setTimeout: () => 0 });
  RF.store.attach(RF.store.defaults());
  const obj = { rut: '' };
  const campo = RF.ui.bind(obj, 'rut', { type: 'rut' });
  campo.value = '12a345678-5';
  campo.dispatch('input');
  campo.dispatch('blur');
  assert.equal(campo.value, '12a345678-5');
  assert.equal(obj.rut, '12a345678-5');
  campo.value = '12345678-5';
  campo.dispatch('input');
  campo.dispatch('blur');
  assert.equal(campo.value, '12.345.678-5');
  assert.equal(obj.rut, '12.345.678-5');
});
