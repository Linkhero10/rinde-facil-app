import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

class Node {
  constructor(tag, attrs = {}) { this.tag = tag; this.attrs = attrs || {}; this.className = this.attrs.class || ''; this.value = this.attrs.value || ''; this.children = []; this.events = {}; this._text = ''; }
  appendChild(n) { n.parent = this; this.children.push(n); return n; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  focus() { this.focused = true; }
  addEventListener(t, f) { (this.events[t] ||= []).push(f); }
  input(value) { this.value = value; (this.events.input || []).forEach(f => f()); }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
}
function h(tag, attrs, ...kids) {
  const n = new Node(tag, attrs);
  kids.flat(Infinity).filter(k => k != null).forEach(k => {
    if (typeof k !== 'object') { const text = new Node('#text'); text.textContent = k; k = text; }
    n.appendChild(k);
  });
  return n;
}
function all(n, predicate) { return [n, ...n.children.flatMap(c => all(c, () => true))].filter(predicate); }
function app() {
  const stub = { util: { h, clear: n => { n.children = []; } },
    ui: { icon: () => h('i'), section: (t, kids) => h('section', {}, kids), field: () => h('input'), btn: () => h('button'), callout: (k, t, text) => h('p', {}, text) },
    auth: { token: () => null, calls: 0 }, vault: { meta: () => ({ display: 'Comunidad Norte' }) },
    store: { get: () => ({ cloud: {}, ui: {} }) }, cloud: { configured: () => false }, app: { render() {} } };
  for (const name of ['createAccount', 'recover', 'changePassword']) stub.auth[name] = () => { stub.auth.calls++; throw new Error('No debe ejecutar auth con confirmación inválida'); };
  return loadApp(['03-crypto.js', '39-auth-ui.js'], { RF: stub });
}
for (const mode of ['crear', 'recuperar', 'cambiar']) {
  test(mode + ': dos reglas simples y confirmación junto a su campo', () => {
    const RF = app();
    if (mode === 'recuperar') RF.auth.goto('recover');
    const tree = mode === 'cambiar' ? RF.tools.seguridad.render() : RF.authui.screen(mode === 'recuperar' ? 'locked' : 'none');
    const list = all(tree, n => n.className === 'pw-hints')[0];
    assert.equal(list.children.length, 2);
    assert.doesNotMatch(list.textContent, /común|confirmación|Cumple|Falta/);
    const passwords = all(tree, n => n.tag === 'input' && n.attrs.type === 'password');
    const p1 = passwords.at(-2), p2 = passwords.at(-1);
    assert.equal(p2.attrs.required, false, 'confirmación vacía usa feedback propio, sin tooltip nativo duplicado');
    const feedback = all(tree, n => n.attrs.id === p2.attrs['aria-describedby'])[0];
    assert.ok(feedback && feedback !== list, 'confirmación tiene su propia descripción');
    assert.equal(feedback.parent, p2.parent.parent);
    assert.equal(feedback.textContent, 'Vuelve a escribir tu contraseña.');
    p1.input('1234567890'); p2.input('distinta');
    assert.equal(feedback.textContent, 'Las contraseñas todavía no coinciden.');
    assert.equal(p2.attrs['aria-invalid'], 'true', 'mismatch escrito se marca inmediatamente');
    p2.input('1234567890');
    assert.equal(feedback.textContent, 'Las contraseñas coinciden.');
    p1.input('12345678901');
    assert.equal(feedback.textContent, 'Las contraseñas todavía no coinciden.');
    const form = all(tree, n => n.tag === 'form')[0];
    if (mode === 'crear') all(tree, n => n.tag === 'input' && n.attrs.type === 'text')[0].value = 'Comunidad Norte';
    assert.doesNotThrow(() => form.attrs.onsubmit({ preventDefault() {} }), 'contraseñas distintas se rechazan antes de llamar auth');
    assert.equal(RF.auth.calls, 0, 'no se inicia ninguna operación auth');
    assert.doesNotMatch(tree.textContent, /no son iguales/, 'no aparece un error global duplicado');
    assert.equal(p2.attrs['aria-invalid'], 'true');
    assert.equal(p2.focused, true);
    p2.input('12345678901');
    assert.equal(p2.attrs['aria-invalid'], 'false', 'se limpia el error al corregir');
    p2.focused = false;
    p2.input('');
    assert.doesNotThrow(() => form.attrs.onsubmit({ preventDefault() {} }));
    assert.equal(RF.auth.calls, 0, 'confirmación vacía también bloquea');
    assert.equal(p2.attrs['aria-invalid'], 'true');
    assert.equal(p2.focused, true);
    assert.equal(feedback.className, 'pw-match is-missing');
    assert.equal(feedback.textContent, 'Vuelve a escribir tu contraseña.');
  });
}
