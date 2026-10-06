import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

class FakeNode {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.className = ''; this.parentNode = null; this._text = ''; this.style = {}; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
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
