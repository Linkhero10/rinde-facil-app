/* DOM mínimo para probar la interfaz en Node sin navegador: nodos con hijos, atributos, clases, valor y eventos.
   dispatch(tipo) ejecuta los oyentes registrados con addEventListener y también la propiedad onclick/onblur/etc. */
export class NodoFalso {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.parentNode = null;
    this.style = { setProperty: (k, v) => { this.style[k] = v; } };
    this.dataset = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.id = '';
    this.innerHTML = '';
    this._texto = '';
    this._oyentes = {};
    this._clases = new Set();
  }
  get className() { return [...this._clases].join(' '); }
  set className(v) { this._clases = new Set(String(v || '').split(/\s+/).filter(Boolean)); }
  get classList() {
    const self = this;
    return {
      add: (...n) => { n.forEach(x => self._clases.add(x)); },
      remove: (...n) => { n.forEach(x => self._clases.delete(x)); },
      toggle: (n, on) => { const v = on === undefined ? !self._clases.has(n) : !!on; if (v) self._clases.add(n); else self._clases.delete(n); return v; },
      contains: n => self._clases.has(n)
    };
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = v;
    if (k === 'id') this.id = String(v);
  }
  setAttributeNS(ns, k, v) { this.setAttribute(k, v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(hijo) {
    if (hijo.parentNode) hijo.parentNode.removeChild(hijo);
    hijo.parentNode = this;
    this.children.push(hijo);
    return hijo;
  }
  insertBefore(hijo, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) return this.appendChild(hijo);
    if (hijo.parentNode) hijo.parentNode.removeChild(hijo);
    hijo.parentNode = this;
    this.children.splice(i, 0, hijo);
    return hijo;
  }
  removeChild(hijo) {
    const i = this.children.indexOf(hijo);
    if (i >= 0) this.children.splice(i, 1);
    hijo.parentNode = null;
    return hijo;
  }
  get firstChild() { return this.children[0] || null; }
  get textContent() { return this._texto + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._texto = String(v); this.children = []; }
  addEventListener(tipo, fn) { (this._oyentes[tipo] = this._oyentes[tipo] || []).push(fn); }
  removeEventListener(tipo, fn) { this._oyentes[tipo] = (this._oyentes[tipo] || []).filter(f => f !== fn); }
  dispatch(tipo, extra = {}) {
    const ev = Object.assign({ type: tipo, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} }, extra);
    (this._oyentes[tipo] || []).slice().forEach(fn => fn.call(this, ev));
    const propiedad = this['on' + tipo];
    if (typeof propiedad === 'function') propiedad.call(this, ev);
    return ev;
  }
  focus() {}
  contains(n) { return n === this || this.children.some(c => c.contains(n)); }
  /* selectores simples: etiqueta, .clase y [atributo] o [atributo="valor"]; sin combinadores */
  matches(sel) {
    const m = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(String(sel).trim());
    if (!m) return false;
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    for (const c of (m[2] || '').split('.').filter(Boolean)) if (!this._clases.has(c)) return false;
    for (const a of (m[3] || '').match(/\[[^\]]+\]/g) || []) {
      const par = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(a);
      if (!par) return false;
      const v = this.getAttribute(par[1]);
      if (v === null || (par[2] !== undefined && v !== par[2])) return false;
    }
    return true;
  }
  querySelectorAll(sel) {
    const out = [];
    const visita = n => { n.children.forEach(c => { if (c.matches(sel)) out.push(c); visita(c); }); };
    visita(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

/* documento falso con el contenedor de avisos (toasts) que usa la interfaz */
export function documentoFalso() {
  const toasts = new NodoFalso('div');
  toasts.id = 'toasts';
  return {
    body: new NodoFalso('body'),
    activeElement: null,
    createElement: t => new NodoFalso(t),
    createElementNS: (ns, t) => new NodoFalso(t),
    createTextNode: t => { const n = new NodoFalso('#text'); n.textContent = t; return n; },
    getElementById: id => (id === 'toasts' ? toasts : null),
    addEventListener() {},
    removeEventListener() {}
  };
}

/* todos los nodos del árbol que cumplen el criterio, en orden de aparición */
export function buscar(nodo, criterio) {
  const out = [];
  const visita = n => { if (criterio(n)) out.push(n); n.children.forEach(visita); };
  visita(nodo);
  return out;
}

/* el botón cuyo texto es exactamente el indicado */
export function botonPorTexto(nodo, texto) {
  return buscar(nodo, n => n.tagName === 'BUTTON' && n.textContent.trim() === texto)[0] || null;
}
