import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load.mjs';

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

test('un aviso nuevo reemplaza el anterior para que los mensajes no tapen la pantalla', () => {
  const host = new FakeNode('div');
  const document = {
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    getElementById: id => id === 'toasts' ? host : null
  };
  const RF = loadApp(['01-util.js', '30-ui.js'], { document, setTimeout: () => 0 });

  RF.ui.toast('Se guardó un documento.', 'ok');
  RF.ui.toast('No se acepta este tipo de archivo.', 'bad');

  assert.equal(host.children.length, 1);
  assert.equal(host.firstChild.textContent, 'No se acepta este tipo de archivo.');
  assert.match(host.firstChild.className, /bad/);
});

test('los avisos de éxito rutinarios se silencian y los errores se anuncian', () => {
  const host = new FakeNode('div');
  const document = {
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    getElementById: id => id === 'toasts' ? host : null
  };
  const RF = loadApp(['01-util.js', '30-ui.js'], { document, setTimeout: () => 0 });

  RF.ui.toast('Conectado; todo funciona.', 'ok');
  RF.ui.toast('Guardado en el dispositivo, aún no en Drive.', 'info');
  assert.equal(host.children.length, 0, 'no aparece un aviso por una operación normal');

  RF.ui.toast('El archivo sigue pendiente de subir.', 'warn');
  assert.equal(host.children.length, 1, 'sí se muestra un aviso que requiere atención');
  assert.equal(host.firstChild.attributes.role, 'status');

  RF.ui.toast('No se pudo guardar.', 'bad');
  assert.equal(host.children.length, 1);
  assert.equal(host.firstChild.textContent, 'No se pudo guardar.');
  assert.equal(host.firstChild.attributes.role, 'alert');
});

test('los avisos positivos no se muestran y los fallos conservan semántica de alerta', () => {
  const document = {
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; }
  };
  const RF = loadApp(['01-util.js', '30-ui.js'], { document });

  const success = RF.ui.callout('ok', 'Todo en orden.', 'No hay nada que corregir.');
  assert.equal(success.attributes.hidden, '');
  assert.equal(success.attributes['aria-hidden'], 'true');
  assert.equal(success.textContent, '');

  const failure = RF.ui.callout('bad', 'No se pudo guardar.', 'Tus datos siguen en este dispositivo.');
  assert.equal(failure.attributes.role, 'alert');
  assert.match(failure.className, /callout bad/);
  assert.match(failure.textContent, /No se pudo guardar/);
});

test('el progreso de una tarea termina sin anunciar rutinariamente el éxito', () => {
  const body = new FakeNode('body');
  const document = {
    body,
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; }
  };
  const RF = loadApp(['01-util.js', '30-ui.js'], { document, setInterval: () => 1, clearInterval() {}, setTimeout: fn => { fn(); return 0; } });
  const job = RF.ui.busy('Leyendo el comprobante', [{ id: 'read', label: 'Leyendo…', from: 0, to: 90, tau: 1 }]);
  const card = body.firstChild;

  job.done('Listo');

  assert.equal(body.children.length, 0, 'la barra desaparece al terminar y cede el espacio al resultado');
  assert.doesNotMatch(card.textContent, /Listo/, 'no se muestra una confirmación de éxito');
});

test('si una tarea larga falla, el aviso persiste y se anuncia como alerta', () => {
  const body = new FakeNode('body');
  const document = {
    body,
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; }
  };
  const RF = loadApp(['01-util.js', '30-ui.js'], { document, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1 });
  const job = RF.ui.busy('Leyendo el comprobante', [{ id: 'read', label: 'Leyendo…', from: 0, to: 90, tau: 1 }]);
  const card = body.firstChild;

  job.fail('No se pudo leer el comprobante.');

  assert.equal(body.firstChild, card);
  assert.equal(card.attributes.role, 'alert');
  assert.equal(card.attributes['aria-live'], undefined);
  assert.match(card.textContent, /No se pudo leer el comprobante/);
});

test('los avisos y errores de progreso no usan tarjeta teñida ni franja lateral', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const css = fs.readFileSync(path.join(here, '..', 'css', 'app.css'), 'utf8');
  const rule = css.match(/\.callout\s*\{([^}]*)\}/);
  assert.ok(rule, 'existe una regla base para el aviso');
  assert.doesNotMatch(rule[1], /border-left\s*:|background(?:-color)?\s*:/i);
  assert.match(css, /\.callout\.ok\s*\{[^}]*display\s*:\s*none/i);
  const busy = css.match(/\.busy\s*\{([^}]*)\}/);
  const busyBad = css.match(/\.busy\.bad\s*\{([^}]*)\}/);
  assert.ok(busy && busyBad, 'existen reglas de progreso y fallo de progreso');
  assert.doesNotMatch(busy[1], /border-left\s*:/i, 'el progreso no usa franja lateral');
  assert.doesNotMatch(busyBad[1], /background(?:-color)?\s*:/i, 'el fallo no usa fondo teñido');
});
