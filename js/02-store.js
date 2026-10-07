/* Rinde Fácil — estado de la app, guardado local y copias de seguridad. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util;
  var KEY = 'rinde_facil_v2';
  var listeners = [];
  var storageListeners = [];
  var state = null;
  var storageOk = true;
  var storageError = null;
  var stateVersion = 0;

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
      holidays: [], events: [], projects: [], activeProjectId: null, repo: { docs: [], actas: [] },
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
    out.events = Array.isArray(s.events) ? s.events.filter(function (e) { return e && typeof e === 'object'; }) : [];
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
  var vaultMode = false, persistHook = null, pending = Promise.resolve(), latestSave = Promise.resolve(true);
  function setStorageStatus(ok, error) {
    var changed = storageOk !== ok;
    storageOk = ok;
    storageError = ok ? null : (error || new Error('No se pudieron guardar los cambios.'));
    if (changed) storageListeners.slice().forEach(function (l) { try { l(ok, storageError); } catch (e) { /* un indicador no debe frenar el guardado */ } });
  }
  function useVault() { vaultMode = true; state = null; persistHook = null; dirty = false; stateVersion++; }
  function attach(obj, hook) { state = migrate(obj); persistHook = hook || null; dirty = false; stateVersion++; listeners.slice().forEach(function (l) { l(state); }); return state; }
  function detach() { state = null; persistHook = null; dirty = false; stateVersion++; }
  function flush() {
    var queued = persistNow();
    if (vaultMode) {
      if (!queued && !storageOk) return Promise.reject(storageError || new Error('NO_GUARDADO'));
      return latestSave.then(function (ok) { if (ok === false) throw (storageError || new Error('NO_GUARDADO')); return true; });
    }
    if (!queued && !storageOk) return Promise.reject(storageError || new Error('NO_GUARDADO'));
    return Promise.resolve(queued);
  }
  function load() {
    if (vaultMode) { state = migrate(null); return state; }
    var raw = null;
    try { raw = root.localStorage.getItem(KEY); } catch (e) { setStorageStatus(false, e); }
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    state = migrate(parsed);
    return state;
  }
  var persistSoon = null, dirty = false;
  /* solo se escribe si hubo cambios: una pestaña vieja y sin tocar nunca pisa lo que guardó otra */
  function persistNow() {
    if (!dirty) return true;
    if (vaultMode) {
      if (!persistHook) { setStorageStatus(false, new Error('No hay un mecanismo de guardado conectado.')); return false; }
      dirty = false;
      var st = state, hook = persistHook, version = stateVersion;
      var attempt = pending.then(function () { return hook(st); });
      latestSave = attempt.then(function () { if (stateVersion === version) dirty = false; setStorageStatus(true); return true; }, function (e) { dirty = true; setStorageStatus(false, e); throw e; });
      pending = latestSave.then(function () {}, function () {});
      return true;
    }
    try { root.localStorage.setItem(KEY, JSON.stringify(state)); setStorageStatus(true); dirty = false; return true; }
    catch (e) { setStorageStatus(false, e); return false; }
  }
  function schedulePersist() {
    if (typeof setTimeout === 'undefined') { persistNow(); return; }
    clearTimeout(persistSoon);
    persistSoon = setTimeout(persistNow, 150);
  }
  /* Al cerrar o esconder la pestaña se intenta guardar; el navegador no garantiza esperar el cifrado asíncrono. */
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
    stateVersion++;
    dirty = true;
    schedulePersist();
    if (!(opts && opts.silent)) listeners.slice().forEach(function (l) { l(s); });
    return s;
  }
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (l) { return l !== fn; }); }; }
  function onStorageStatus(fn) { storageListeners.push(fn); return function () { storageListeners = storageListeners.filter(function (l) { return l !== fn; }); }; }
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
    delete copy.cloud.device; /* la credencial de equipo no viaja en copias ni respaldos */
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
    if (mine && mine.apiUrl) state.cloud = Object.assign({}, state.cloud, { apiUrl: mine.apiUrl || state.cloud.apiUrl, saves: mine.saves || [] }); delete state.cloud.device; if (mine.device) state.cloud.device = mine.device;
    if (state.cloud) delete state.cloud.key;
    stateVersion++; dirty = true; persistNow();
    listeners.slice().forEach(function (l) { l(state); });
    return state;
  }
  function reset() { state = defaults(); stateVersion++; dirty = true; persistNow(); listeners.slice().forEach(function (l) { l(state); }); }
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
  /* Sin una base común no se puede decidir qué edición gana. Preparar todo en una copia;
     cualquier divergencia ambigua aborta antes de modificar el estado local. */
  function equalData(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    var ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
    return ak.length === bk.length && ak.every(function (k, i) { return k === bk[i] && equalData(a[k], b[k]); });
  }
  function conflict(path) { throw Object.assign(new Error('No se pueden combinar automáticamente las copias: diferencias en ' + path + '. Guarda ambas copias y revisa los cambios, o elige explícitamente cuál conservar.'), { code: 'MERGE_CONFLICT', path: path }); }
  function unionById(local, remote) {
    var have = new Map(), list = [], added = 0;
    (local || []).forEach(function (x) { if (!x || !x.id || have.has(x.id)) conflict('identificadores locales'); have.set(x.id, x); list.push(x); });
    var seen = new Set();
    (remote || []).forEach(function (x) { if (!x || !x.id || seen.has(x.id)) conflict('identificadores remotos'); seen.add(x.id); if (have.has(x.id)) { if (!equalData(have.get(x.id), x)) conflict('registro ' + x.id); } else { list.push(x); added++; } });
    return { list: list, added: added };
  }
  function mergeRemote(remote) {
    function checkProjects(projects) {
      var ids = new Set();
      (projects || []).forEach(function (p) { if (!p || !p.id || ids.has(p.id)) conflict('identificadores de proyectos'); ids.add(p.id); });
    }
    checkProjects(remote && remote.projects); checkProjects(get().projects);
    var added = 0, r = migrate(U.safeParse(JSON.stringify(remote))), s = migrate(U.safeParse(JSON.stringify(get())));
    var mergeLists = ['expenses', 'cotizaciones', 'observations', 'budgetLines', 'needsCustom'];
    Object.keys(r).concat(Object.keys(s)).forEach(function (k) { if (['projects', 'repo', 'cloud', 'ui', 'activeProjectId', 'events'].indexOf(k) < 0 && !equalData(s[k], r[k])) conflict(k); });
    (function () {
      var haveP = new Map(); s.projects.forEach(function (p) { haveP.set(p.id, p); });
      r.projects.forEach(function (rp) {
        var lp = haveP.get(rp.id);
        if (!lp) { s.projects.push(rp); added++; return; }
        Object.keys(rp).concat(Object.keys(lp)).forEach(function (k) { if (mergeLists.concat(['forms', 'done']).indexOf(k) < 0 && !equalData(lp[k], rp[k])) conflict('proyecto ' + rp.id + '/' + k); });
        mergeLists.forEach(function (k) { var u = unionById(lp[k], rp[k]); lp[k] = u.list; added += u.added; });
        Object.keys(rp.forms || {}).forEach(function (k) {
          if (Array.isArray(rp.forms[k]) && (!lp.forms[k] || Array.isArray(lp.forms[k]))) { var u = unionById(lp.forms[k], rp.forms[k]); lp.forms[k] = u.list; added += u.added; }
          else if (!equalData(lp.forms[k], rp.forms[k])) conflict('formulario ' + k);
        });
        Object.keys(lp.forms || {}).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(rp.forms, k)) conflict('formulario ' + k); });
        Object.keys(rp.done || {}).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(lp.done, k) && !equalData(lp.done[k], rp.done[k])) conflict('marca ' + k); lp.done[k] = rp.done[k]; });
      });
      var d = unionById(s.repo.docs, r.repo.docs), a = unionById(s.repo.actas, r.repo.actas);
      s.repo.docs = d.list; s.repo.actas = a.list; added += d.added + a.added;
      var ev = unionById(s.events, r.events); s.events = ev.list; added += ev.added;
    })();
    update(function (current) { current.projects = s.projects; current.repo = s.repo; current.events = s.events; });
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
    isDone: isDone, setDone: setDone, persistNow: persistNow, storageOk: function () { return storageOk; }, storageError: function () { return storageError; }, onStorageStatus: onStorageStatus,
    mergeRemote: mergeRemote, useVault: useVault, attach: attach, detach: detach, flush: flush
  };
})(typeof window !== 'undefined' ? window : globalThis);
