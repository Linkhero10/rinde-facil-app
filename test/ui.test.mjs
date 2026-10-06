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

test('el resultado de una acción se avisa, también cuando salió bien', () => {
  const host = new FakeNode('div');
  const document = {
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    getElementById: id => id === 'toasts' ? host : null
  };
  const RF = loadApp(['01-util.js', '30-ui.js'], { document, setTimeout: () => 0 });

  RF.ui.toast('Conectado; todo funciona.', 'ok');
  assert.equal(host.children.length, 1, 'una acción que salió bien se confirma');
  assert.match(host.firstChild.className, /toast ok/);
  assert.equal(host.firstChild.attributes.role, 'status');

  RF.ui.toast('El archivo sigue pendiente de subir.', 'warn');
  assert.equal(host.children.length, 1, 'un aviso que requiere atención también se muestra');

  RF.ui.toast('No se pudo guardar.', 'bad');
  assert.equal(host.children.length, 1);
  assert.equal(host.firstChild.textContent, 'No se pudo guardar.');
  assert.equal(host.firstChild.attributes.role, 'alert');
});

test('el aviso de éxito se ve en verde y los fallos conservan semántica de alerta', () => {
  const document = {
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; }
  };
  const RF = loadApp(['01-util.js', '30-ui.js'], { document });

  const success = RF.ui.callout('ok', 'Todo en orden.', 'No hay nada que corregir.');
  assert.match(success.className, /callout ok/);
  assert.notEqual(success.attributes.hidden, '');
  assert.match(success.textContent, /Todo en orden/);

  const failure = RF.ui.callout('bad', 'No se pudo guardar.', 'Tus datos siguen en este dispositivo.');
  assert.equal(failure.attributes.role, 'alert');
  assert.match(failure.className, /callout bad/);
  assert.match(failure.textContent, /No se pudo guardar/);
});

test('el progreso de una tarea termina confirmando que salió bien', () => {
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

  assert.match(card.textContent, /Listo/, 'se muestra la confirmación de éxito');
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
  assert.ok(css.includes('.callout.ok{color:var(--ok)'), 'el éxito de una acción se ve en verde');
  const busy = css.match(/\.busy\s*\{([^}]*)\}/);
  const busyBad = css.match(/\.busy\.bad\s*\{([^}]*)\}/);
  assert.ok(busy && busyBad, 'existen reglas de progreso y fallo de progreso');
  assert.doesNotMatch(busy[1], /border-left\s*:/i, 'el progreso no usa franja lateral');
  assert.doesNotMatch(busyBad[1], /background(?:-color)?\s*:/i, 'el fallo no usa fondo teñido');
});

test('el aviso de guardado en Drive trae un botón a la carpeta, solo con enlaces de Google Drive', () => {
  const host = new FakeNode('div');
  const document = {
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    getElementById: id => id === 'toasts' ? host : null
  };
  const RF = loadApp(['01-util.js', '30-ui.js'], { document, setTimeout: () => 0 });
  RF.ui.toast('Guardado en el Drive: Proyecto / Comprobantes', 'ok', { href: 'https://drive.google.com/drive/folders/abc123' });
  const link = host.firstChild.children.find(c => c.tagName === 'a');
  assert.ok(link, 'hay botón para ver la carpeta');
  assert.equal(link.attributes.href, 'https://drive.google.com/drive/folders/abc123');
  assert.equal(link.attributes.target, '_blank');
  RF.ui.toast('Guardado', 'ok', { href: 'https://sitio-falso.example/drive.google.com/' });
  assert.equal(host.firstChild.children.find(c => c.tagName === 'a'), undefined, 'un enlace que no es de Drive no se muestra');
});
