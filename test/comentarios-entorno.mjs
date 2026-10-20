/* Entorno de pruebas para js/58-comentarios.js: DOM mínimo, eventos y temporizadores controlados, sin red.
   Lo usan comentarios-hoja.test.mjs y comentarios-cliente.test.mjs. (No es una prueba: no empieza por .test.mjs.) */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const codigo = fs.readFileSync(path.join(here, '..', 'js', '58-comentarios.js'), 'utf8');

/* nodo de DOM de mentira: guarda hijos y escuchas, y sirve para lo que la capa hace al cargarse */
export function nodo() {
  const n = { style: {}, children: [], parent: null, className: '', id: '', textContent: '', title: '', tabIndex: 0, type: '', value: '', disabled: false, listeners: {} };
  n.appendChild = c => { if (c.parent) c.parent.children = c.parent.children.filter(x => x !== c); c.parent = n; n.children.push(c); return c; };
  n.remove = () => { if (n.parent) { n.parent.children = n.parent.children.filter(x => x !== n); n.parent = null; } };
  n.addEventListener = (tipo, fn) => { (n.listeners[tipo] = n.listeners[tipo] || []).push(fn); };
  n.setAttribute = () => {};
  n.focus = () => {};
  n.querySelector = () => null;
  n.closest = () => null;
  n.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  return n;
}

/* carga la capa. Los temporizadores de hasta 3 s se disparan enseguida (reintentos); los demás quedan a la espera y los dispara la prueba */
export function cargarCapaCon(opciones = {}) {
  const eventos = {};
  const temporizadores = [];
  const doc = { readyState: 'complete', head: nodo(), body: nodo(), getElementById: () => null, createElement: () => nodo(), querySelector: () => null, addEventListener: () => {} };
  const ctx = {
    console, JSON, Math, Date, Intl, Promise, Object, Array, String, Number, RegExp, Error, Set, AbortController,
    setTimeout(fn, ms) {
      const t = { fn, ms, activo: true };
      if (ms <= 3000) Promise.resolve().then(() => { if (t.activo) { t.activo = false; fn(); } });
      else temporizadores.push(t);
      return t;
    },
    clearTimeout(t) { if (t) t.activo = false; },
    setInterval: () => 0,
    location: { hash: '#/' }, localStorage: { getItem: () => null, setItem: () => {} },
    addEventListener(tipo, fn) { (eventos[tipo] = eventos[tipo] || []).push(fn); },
    getComputedStyle: () => ({ display: 'block' }),
    fetch: opciones.fetch || (() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, comentarios: [] }) }))
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.document = doc;
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx, { filename: '58-comentarios.js' });
  return {
    rc: ctx.RF_COMENTARIOS, ctx, doc,
    disparar(tipo, evento = {}) { (eventos[tipo] || []).forEach(f => f(evento)); },
    clic(n) { (n.listeners.click || []).forEach(f => f({ stopPropagation() {}, preventDefault() {}, target: n })); },
    temporizador(ms) {
      const t = temporizadores.find(x => x.ms === ms && x.activo);
      if (!t) throw new Error('no hay un temporizador activo de ' + ms + ' ms');
      t.activo = false;
      t.fn();
    }
  };
}

/* la lista de comentarios que se devuelve al cargar (sin DOM); `filas` es lo que devolvería el servicio */
export function cargarCapa(filas) {
  return cargarCapaCon({ fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, comentarios: filas }) }) }).rc;
}

/* deja pasar las promesas pendientes (la capa encadena varias) */
export const esperar = () => new Promise(r => setTimeout(r, 0));

/* primer nodo del árbol que cumple el predicado (en profundidad) */
export function buscar(raiz, predicado) {
  if (!raiz) return null;
  if (predicado(raiz)) return raiz;
  for (const hijo of raiz.children || []) {
    const hallado = buscar(hijo, predicado);
    if (hallado) return hallado;
  }
  return null;
}
export const buscarClase = (raiz, clase) => buscar(raiz, n => String(n.className || '').split(' ').indexOf(clase) >= 0);
export const buscarTexto = (raiz, texto) => buscar(raiz, n => n.textContent === texto);
export const textoDe = raiz => (raiz ? String(raiz.textContent || '') + (raiz.children || []).map(textoDe).join(' ') : '');
