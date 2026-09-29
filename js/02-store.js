/* Rinde Fácil — estado de la app, guardado local y copias de seguridad. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util;
  var KEY = 'rinde_facil_v2';
  var listeners = [];
  var state = null;
  var storageOk = true;

  function newProject(name) {
    return {
      id: U.uid('p'), name: name || 'Mi proyecto', code: '', tipo: 'inversion',
      start: '', end: '', desembolso1: '', periodoInicio: '', periodoFin: '',
      budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: 0 },
      done: {}, gantt: { stages: [] }, budgetLines: [], expenses: [], forms: {}, pea: { general: {}, proyecto: {} },
      observations: [], cotizaciones: [], reitem: { rows: [], motivo: '' }, notes: '', createdAt: new Date().toISOString()
    };
  }
  function defaults() {
    return {
      v: 2,
      community: { name: '', rut: '', address: '', legalRep: '', repRut: '', email: '', phone: '', ivaModo: 'no_contribuyente', oc: 'SMI-Chile' },
      cloud: { apiUrl: '', key: '', lastSync: null },
      holidays: [], projects: [], activeProjectId: null,
      ui: { theme: 'system', open: {} }
    };
  }
  function migrate(s) {
    var d = defaults();
    if (!s || typeof s !== 'object') return d;
    var out = Object.assign({}, d, s);
    out.community = Object.assign({}, d.community, s.community || {});
    out.cloud = Object.assign({}, d.cloud, s.cloud || {});
    out.ui = Object.assign({}, d.ui, s.ui || {});
    out.holidays = Array.isArray(s.holidays) ? s.holidays : [];
    out.projects = (Array.isArray(s.projects) ? s.projects : []).map(function (p) {
      var np = Object.assign(newProject(p && p.name), p);
      np.budgetApproved = Object.assign({ rrhh: 0, operacion: 0, inversion: 0, administracion: 0 }, p.budgetApproved || {});
      np.gantt = p.gantt && Array.isArray(p.gantt.stages) ? p.gantt : { stages: [] };
      ['budgetLines', 'expenses', 'observations', 'cotizaciones'].forEach(function (k) { if (!Array.isArray(np[k])) np[k] = []; });
      np.forms = p.forms && typeof p.forms === 'object' ? p.forms : {};
      np.done = p.done && typeof p.done === 'object' ? p.done : {};
      np.pea = Object.assign({ general: {}, proyecto: {} }, p.pea || {});
      np.reitem = Object.assign({ rows: [], motivo: '' }, p.reitem || {});
      return np;
    });
    if (!out.projects.some(function (p) { return p.id === out.activeProjectId; })) {
      out.activeProjectId = out.projects.length ? out.projects[0].id : null;
    }
    out.v = 2;
    return out;
  }
  function load() {
    var raw = null;
    try { raw = root.localStorage.getItem(KEY); } catch (e) { storageOk = false; }
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    state = migrate(parsed);
    return state;
  }
  var persistSoon = null, dirty = false;
  /* solo se escribe si hubo cambios: una pestaña vieja y sin tocar nunca pisa lo que guardó otra */
  function persistNow() {
    if (!dirty) return true;
    try { root.localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; dirty = false; return true; }
    catch (e) { storageOk = false; return false; }
  }
  function schedulePersist() {
    if (typeof setTimeout === 'undefined') { persistNow(); return; }
    clearTimeout(persistSoon);
    persistSoon = setTimeout(persistNow, 150);
  }
  /* al cerrar o esconder la pestaña se guarda de inmediato: no se pierde lo último que escribiste */
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('pagehide', function () { if (state) persistNow(); });
    root.addEventListener('beforeunload', function () { if (state) persistNow(); });
    if (root.document && typeof root.document.addEventListener === 'function') root.document.addEventListener('visibilitychange', function () { if (root.document.visibilityState === 'hidden' && state) persistNow(); });
  }
  function get() { if (!state) load(); return state; }
  function project() {
    var s = get();
    for (var i = 0; i < s.projects.length; i++) if (s.projects[i].id === s.activeProjectId) return s.projects[i];
    return null;
  }
  /* muta el estado y avisa a la interfaz; opts.silent evita re-dibujar (para escribir en un campo) */
  function update(fn, opts) {
    var s = get();
    fn(s);
    dirty = true;
    schedulePersist();
    if (!(opts && opts.silent)) listeners.slice().forEach(function (l) { l(s); });
    return s;
  }
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (l) { return l !== fn; }); }; }
  function addProject(name) {
    var p = newProject(name);
    update(function (s) { s.projects.push(p); s.activeProjectId = p.id; });
    return p;
  }
  function removeProject(id) {
    update(function (s) {
      s.projects = s.projects.filter(function (p) { return p.id !== id; });
      if (s.activeProjectId === id) s.activeProjectId = s.projects.length ? s.projects[0].id : null;
    });
  }
  function exportJSON() { return JSON.stringify(get(), null, 2); }
  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) throw new Error('El archivo no es una copia de Rinde Fácil.');
    state = migrate(parsed);
    dirty = true; persistNow();
    listeners.slice().forEach(function (l) { l(state); });
    return state;
  }
  function reset() { state = defaults(); dirty = true; persistNow(); listeners.slice().forEach(function (l) { l(state); }); }
  /* si otra pestaña (u otra ventana de la app) guarda cambios, esta se pone al día en vez de pisarlos */
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('storage', function (e) {
      if (e.key !== KEY || !e.newValue) return;
      try { state = migrate(JSON.parse(e.newValue)); dirty = false; listeners.slice().forEach(function (l) { l(state); }); } catch (err) { /* copia dañada: se ignora */ }
    });
  }
  function isDone(p, tid, i) { return !!(p && p.done[tid + ':' + i]); }
  function setDone(tid, i, val) { /* en silencio: quien llama actualiza la pantalla que corresponde */
    update(function (s) {
      var p = project(); if (!p) return;
      if (val) p.done[tid + ':' + i] = true; else delete p.done[tid + ':' + i];
    }, { silent: true });
  }

  RF.store = {
    KEY: KEY, load: load, get: get, project: project, update: update, subscribe: subscribe,
    addProject: addProject, removeProject: removeProject, newProject: newProject, defaults: defaults,
    exportJSON: exportJSON, importJSON: importJSON, reset: reset, migrate: migrate,
    isDone: isDone, setDone: setDone, persistNow: persistNow, storageOk: function () { return storageOk; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
