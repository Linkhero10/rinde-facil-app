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
      id: U.uid('p'), name: name || 'Mi proyecto', code: '', convenio: 'corfo-2026-09', tipo: 'inversion',
      start: '', end: '', desembolso1: '', periodoInicio: '', periodoFin: '',
      budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: 0 },
      done: {}, gantt: { stages: [] }, budgetLines: [], expenses: [], forms: {}, pea: { general: {}, proyecto: {} },
      observations: [], cotizaciones: [], reitem: { rows: [], motivo: '' }, notes: '',
      needs: {}, needsSet: false, peaAprobado: false, peaAprobadoAt: '', needsPea: null, needsAdded: [], needsCustom: [], show: {}, createdAt: new Date().toISOString()
    };
  }
  function defaults() {
    return {
      v: 2,
      community: { name: '', rut: '', address: '', legalRep: '', repRut: '', email: '', phone: '', ivaModo: 'no_contribuyente', oc: '' },
      cloud: { apiUrl: '', lastSync: null, rev: 0, autoSave: true, rootUrl: '', saves: [] },
      holidays: [], projects: [], activeProjectId: null, repo: { docs: [], actas: [] },
      ui: { theme: 'system', open: {}, idleMinutes: 15 }
    };
  }
  function migrate(s) {
    var d = defaults();
    if (!s || typeof s !== 'object') return d;
    var out = Object.assign({}, d, s);
    out.community = Object.assign({}, d.community, s.community || {});
    if (/^SMI/i.test(out.community.oc || '')) out.community.oc = ''; /* el organismo se nombra por su rol, no por la institución */
    out.cloud = Object.assign({}, d.cloud, s.cloud || {});
    out.ui = Object.assign({}, d.ui, s.ui || {});
    out.holidays = Array.isArray(s.holidays) ? s.holidays : [];
    out.repo = { docs: Array.isArray(s.repo && s.repo.docs) ? s.repo.docs : [], actas: Array.isArray(s.repo && s.repo.actas) ? s.repo.actas : [] };
    out.projects = (Array.isArray(s.projects) ? s.projects : []).map(function (p) {
      var np = Object.assign(newProject(p && p.name), p);
      np.budgetApproved = Object.assign({ rrhh: 0, operacion: 0, inversion: 0, administracion: 0 }, p.budgetApproved || {});
      np.gantt = p.gantt && Array.isArray(p.gantt.stages) ? p.gantt : { stages: [] };
      ['budgetLines', 'expenses', 'observations', 'cotizaciones'].forEach(function (k) { if (!Array.isArray(np[k])) np[k] = []; });
      np.forms = p.forms && typeof p.forms === 'object' ? p.forms : {};
      np.done = p.done && typeof p.done === 'object' ? p.done : {};
      np.pea = Object.assign({ general: {}, proyecto: {} }, p.pea || {});
      np.reitem = Object.assign({ rows: [], motivo: '' }, p.reitem || {});
      np.needs = p.needs && typeof p.needs === 'object' ? p.needs : {}; np.show = p.show && typeof p.show === 'object' ? p.show : {};
      ['needsAdded', 'needsCustom'].forEach(function (k) { if (!Array.isArray(np[k])) np[k] = []; });
      return np;
    });
    if (!out.projects.some(function (p) { return p.id === out.activeProjectId; })) {
      out.activeProjectId = out.projects.length ? out.projects[0].id : null;
    }
    out.v = 2;
    return out;
  }
  /* con la bóveda de la comunidad, el estado solo existe en memoria mientras la app está abierta con la contraseña */
  var vaultMode = false, persistHook = null, pending = Promise.resolve();
  function useVault() { vaultMode = true; state = null; persistHook = null; dirty = false; }
  function attach(obj, hook) { state = migrate(obj); persistHook = hook || null; dirty = false; listeners.slice().forEach(function (l) { l(state); }); return state; }
  function detach() { state = null; persistHook = null; dirty = false; }
  function flush() { persistNow(); return pending; }
  function load() {
    if (vaultMode) { state = migrate(null); return state; }
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
    if (vaultMode) { if (!persistHook) return true; dirty = false; var st = state, hook = persistHook; pending = pending.then(function () { return hook(st); }).catch(function () { storageOk = false; dirty = true; }); return true; }
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
  /* la clave de acceso al servicio nunca va dentro de una copia: la copia puede compartirse o quedar en un Drive con más gente */
  var OCR_EXTRACT = 2000;
  function exportJSON() {
    var copy = JSON.parse(JSON.stringify(get()));
    copy.cloud = Object.assign({}, copy.cloud, { saves: [] });
    delete copy.cloud.key; /* la clave compartida de las versiones anteriores ya no existe; por si quedara una copia vieja */
    /* del texto que leyó el OCR la copia lleva solo un extracto: pesa mucho y trae datos de terceros (RUT, direcciones); el original queda en el equipo */
    (copy.projects || []).forEach(function (p) { (p.expenses || []).forEach(function (e) { if (e.ocr && typeof e.ocr.raw === 'string' && e.ocr.raw.length > OCR_EXTRACT) { e.ocr.raw = e.ocr.raw.slice(0, OCR_EXTRACT); e.ocr.cortado = true; } }); });
    return JSON.stringify(copy, null, 2);
  }
  function importJSON(text) {
    var parsed = U.safeParse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) throw new Error('El archivo no es una copia de Rinde Fácil.');
    var mine = get().cloud;
    state = migrate(parsed);
    /* la conexión con el servicio es de este dispositivo: una copia no la reemplaza */
    if (mine && mine.apiUrl) state.cloud = Object.assign({}, state.cloud, { apiUrl: mine.apiUrl || state.cloud.apiUrl, saves: mine.saves || [] });
    if (state.cloud) delete state.cloud.key;
    dirty = true; persistNow();
    listeners.slice().forEach(function (l) { l(state); });
    return state;
  }
  function reset() { state = defaults(); dirty = true; persistNow(); listeners.slice().forEach(function (l) { l(state); }); }
  /* si otra pestaña (u otra ventana de la app) guarda cambios, esta se pone al día en vez de pisarlos */
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('storage', function (e) {
      if (vaultMode) { /* otra pestaña guardó en la bóveda: se descifra y se pone al día esta */
        if (root.RF.vault && e.key === root.RF.vault.KEY && persistHook && root.RF.vault.readState) root.RF.vault.readState().then(function (obj) { if (obj) { state = migrate(obj); dirty = false; listeners.slice().forEach(function (l) { l(state); }); } }).catch(function () { /* cambió la contraseña o se bloqueó */ });
        return;
      }
      if (e.key !== KEY || !e.newValue) return;
      try { state = migrate(JSON.parse(e.newValue)); dirty = false; listeners.slice().forEach(function (l) { l(state); }); } catch (err) { /* copia dañada: se ignora */ }
    });
  }
  /* Combina una copia que viene de afuera con lo de este equipo: se unen proyectos, gastos, cotizaciones, observaciones, líneas de presupuesto,
     documentos y actas por su id. Si algo está en las dos, gana lo de este equipo. Los valores sueltos (nombre, fechas, marcas) no se tocan. */
  function unionById(local, remote) {
    var have = {}; (local || []).forEach(function (x) { if (x && x.id) have[x.id] = true; });
    var add = (remote || []).filter(function (x) { return x && x.id && !have[x.id]; });
    return { list: (local || []).concat(add), added: add.length };
  }
  function mergeRemote(remote) {
    var added = 0, r = migrate(remote);
    update(function (s) {
      var haveP = {}; s.projects.forEach(function (p) { haveP[p.id] = p; });
      r.projects.forEach(function (rp) {
        var lp = haveP[rp.id];
        if (!lp) { s.projects.push(rp); added++; return; }
        ['expenses', 'cotizaciones', 'observations', 'budgetLines', 'needsCustom'].forEach(function (k) { var u = unionById(lp[k], rp[k]); lp[k] = u.list; added += u.added; });
        Object.keys(rp.done || {}).forEach(function (k) { if (!lp.done[k]) lp.done[k] = rp.done[k]; });
      });
      var d = unionById(s.repo.docs, r.repo.docs), a = unionById(s.repo.actas, r.repo.actas);
      s.repo.docs = d.list; s.repo.actas = a.list; added += d.added + a.added;
    });
    return added;
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
    isDone: isDone, setDone: setDone, persistNow: persistNow, storageOk: function () { return storageOk; },
    mergeRemote: mergeRemote, useVault: useVault, attach: attach, detach: detach, flush: flush
  };
})(typeof window !== 'undefined' ? window : globalThis);
