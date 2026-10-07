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
      done: {}, gantt: { stages: [] }, budgetLines: [], expenses: [], f29: [], obras: [], forms: {}, pea: { general: {}, proyecto: {} },
      observations: [], cotizaciones: [], reitem: { rows: [], motivo: '' }, notes: '',
      needs: {}, needsSet: false, peaAprobado: false, peaAprobadoAt: '', needsPea: null, needsAdded: [], needsCustom: [], show: {}, createdAt: new Date().toISOString()
    };
  }
  function defaults() {
    return {
      v: 2,
      community: { name: '', rut: '', address: '', legalRep: '', repRut: '', email: '', phone: '', ivaModo: 'no_contribuyente', oc: '' },
      cloud: { apiUrl: '', lastSync: null, rev: 0, autoSave: true, rootUrl: '', saves: [] },
      holidays: [], events: [], activity: [], projects: [], activeProjectId: null, repo: { docs: [], actas: [] },
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
    out.activity = Array.isArray(s.activity) ? s.activity.filter(function (e) { return e && typeof e === 'object' && e.id; }) : [];
    out.events = Array.isArray(s.events) ? s.events.filter(function (e) { return e && typeof e === 'object'; }) : [];
    out.repo = { docs: Array.isArray(s.repo && s.repo.docs) ? s.repo.docs : [], actas: Array.isArray(s.repo && s.repo.actas) ? s.repo.actas : [] };
    out.projects = (Array.isArray(s.projects) ? s.projects : []).map(function (p) {
      var np = Object.assign(newProject(p && p.name), p);
      np.budgetApproved = Object.assign({ rrhh: 0, operacion: 0, inversion: 0, administracion: 0 }, p.budgetApproved || {});
      np.gantt = p.gantt && Array.isArray(p.gantt.stages) ? p.gantt : { stages: [] };
      ['budgetLines', 'expenses', 'observations', 'cotizaciones', 'f29', 'obras'].forEach(function (k) { if (!Array.isArray(np[k])) np[k] = []; });
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
    if (!(opts && opts.noSync)) changeListeners.slice().forEach(function (l) { try { l(s); } catch (e) { /* un oyente no debe romper el guardado */ } });
    return s;
  }
  var changeListeners = [];
  /* cualquier cambio de datos, incluso los «silenciosos»; opts.noSync lo excluye (lo usa la propia sincronización) */
  function onChange(fn) { changeListeners.push(fn); }
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
    delete copy.cloud.base; delete copy.cloud.syncFp; /* la foto de sincronización es de cada equipo */
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
  /* Huella de un dato: sirve para saber si cambió desde la última vez que los equipos coincidieron (la «base»). */
  function stable(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  function fp(v) { var str = stable(v), h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
  var LISTS = ['expenses', 'cotizaciones', 'observations', 'budgetLines', 'needsCustom', 'f29', 'obras'];
  /* foto de lo que hay ahora, dato por dato: se guarda tras cada sincronización y permite distinguir «lo cambié yo» de «lo cambió el otro equipo» */
  function snapshotBase(st) {
    var b = {};
    Object.keys(st.community || {}).forEach(function (k) { b['c|' + k] = fp(st.community[k]); });
    (st.events || []).forEach(function (x) { if (x && x.id) b['ev|' + x.id] = fp(x); });
    (st.activity || []).forEach(function (x) { if (x && x.id) b['act|' + x.id] = fp(x); });
    ['docs', 'actas'].forEach(function (k) { ((st.repo || {})[k] || []).forEach(function (x) { if (x && x.id) b['r|' + k + '|' + x.id] = fp(x); }); });
    (st.projects || []).forEach(function (p) {
      b['P|' + p.id] = 1;
      Object.keys(p).forEach(function (k) {
        if (LISTS.indexOf(k) >= 0) (p[k] || []).forEach(function (x) { if (x && x.id) b['l|' + p.id + '|' + k + '|' + x.id] = fp(x); });
        else if (k === 'done') Object.keys(p.done || {}).forEach(function (d) { b['d|' + p.id + '|' + d] = 1; });
        else if (k === 'forms') Object.keys(p.forms || {}).forEach(function (f) {
          if (Array.isArray(p.forms[f])) p.forms[f].forEach(function (x) { if (x && x.id) b['l|' + p.id + '|forms.' + f + '|' + x.id] = fp(x); });
          else b['f|' + p.id + '|' + f] = fp(p.forms[f]);
        });
        else b['p|' + p.id + '|' + k] = fp(p[k]);
      });
    });
    return b;
  }
  /* Une dos listas de registros con identificador. Con base (tres vías) se respetan los cambios de cada lado y los borrados;
     sin base solo se agregan los nuevos y cualquier registro distinto es conflicto. Devuelve { list, added }. */
  function unionById(local, remote, base, prefix) {
    var lm = new Map(), rm = new Map(), order = [], added = 0, out = [];
    (local || []).forEach(function (x) { if (!x || !x.id || lm.has(x.id)) conflict('identificadores locales'); lm.set(x.id, x); order.push(x.id); });
    (remote || []).forEach(function (x) { if (!x || !x.id || rm.has(x.id)) conflict('identificadores remotos'); rm.set(x.id, x); if (!lm.has(x.id)) order.push(x.id); });
    order.forEach(function (id) {
      var l = lm.get(id), r = rm.get(id), b = base ? base[prefix + id] : undefined;
      if (l && r) {
        if (equalData(l, r)) out.push(l);
        else if (b === undefined) conflict('registro ' + id);
        else if (fp(l) === b) out.push(r);
        else if (fp(r) === b) out.push(l);
        else conflict('registro ' + id);
      } else if (l) { /* solo aquí: nuevo, o lo borró el otro equipo */
        if (b !== undefined && fp(l) === b) return; /* lo borraron allá y aquí no se tocó */
        out.push(l);
      } else { /* solo allá: nuevo, o lo borramos aquí */
        if (b !== undefined && fp(r) === b) return;
        out.push(r); added++;
      }
    });
    return { list: out, added: added };
  }
  /* Une los datos de otra copia (la de la nube) con los de este equipo. base: la foto de la última sincronización (opcional). */
  function mergeRemote(remote, base) {
    function checkProjects(projects) {
      var ids = new Set();
      (projects || []).forEach(function (p) { if (!p || !p.id || ids.has(p.id)) conflict('identificadores de proyectos'); ids.add(p.id); });
    }
    checkProjects(remote && remote.projects); checkProjects(get().projects);
    var added = 0, r = migrate(U.safeParse(JSON.stringify(remote))), s = migrate(U.safeParse(JSON.stringify(get())));
    function empty(v) { return v === undefined || v === null || v === ''; }
    /* un valor suelto (con base): si solo cambió un lado, gana ese; si cambiaron los dos distinto, conflicto */
    function pick(l, rv, key, label) {
      if (equalData(l, rv)) return l;
      var b = base ? base[key] : undefined;
      if (b !== undefined) { if (fp(l) === b) return rv; if (fp(rv) === b) return l; }
      conflict(label);
    }
    /* los datos de la comunidad se juntan campo a campo: lo que un equipo dejó vacío se completa con lo del otro */
    (function () {
      var rc = r.community || {}, sc = s.community || {};
      Object.keys(rc).concat(Object.keys(sc)).forEach(function (k) {
        var a = sc[k], b = rc[k];
        if (empty(a) && !empty(b)) sc[k] = b;
        else if (!empty(a) && !empty(b)) sc[k] = pick(a, b, 'c|' + k, 'community');
      });
      s.community = sc;
      /* feriados: se unen (son fechas sueltas, no hay nada que pelear) */
      s.holidays = Array.from(new Set((s.holidays || []).concat(r.holidays || []))).sort();
    })();
    Object.keys(r).concat(Object.keys(s)).forEach(function (k) { if (['projects', 'repo', 'cloud', 'ui', 'activeProjectId', 'events', 'community', 'holidays', 'activity'].indexOf(k) < 0 && !equalData(s[k], r[k])) conflict(k); });
    (function () {
      var haveP = new Map(); s.projects.forEach(function (p) { haveP.set(p.id, p); });
      r.projects.forEach(function (rp) {
        var lp = haveP.get(rp.id);
        if (!lp) { s.projects.push(rp); added++; return; }
        Object.keys(rp).concat(Object.keys(lp)).forEach(function (k) {
          if (LISTS.concat(['forms', 'done']).indexOf(k) >= 0) return;
          lp[k] = pick(lp[k], rp[k], 'p|' + rp.id + '|' + k, 'proyecto ' + rp.id + '/' + k);
          if (lp[k] === undefined) delete lp[k];
        });
        LISTS.forEach(function (k) { var u = unionById(lp[k], rp[k], base, 'l|' + rp.id + '|' + k + '|'); lp[k] = u.list; added += u.added; });
        lp.forms = lp.forms || {};
        Object.keys(rp.forms || {}).concat(Object.keys(lp.forms)).forEach(function (k, i, all) {
          if (all.indexOf(k) !== i) return;
          var lf = lp.forms[k], rf = (rp.forms || {})[k];
          if ((Array.isArray(lf) || lf === undefined) && (Array.isArray(rf) || rf === undefined) && (lf !== undefined || rf !== undefined)) {
            var u = unionById(lf, rf, base, 'l|' + rp.id + '|forms.' + k + '|'); lp.forms[k] = u.list; added += u.added;
          } else if (rf === undefined && !base) conflict('formulario ' + k);
          else if (rf === undefined) { if (base['f|' + rp.id + '|' + k] === undefined) { /* nuevo aquí */ } else if (fp(lf) !== base['f|' + rp.id + '|' + k]) { /* cambiado aquí: se conserva */ } else delete lp.forms[k]; }
          else if (lf === undefined) { if (!base || base['f|' + rp.id + '|' + k] === undefined || fp(rf) !== base['f|' + rp.id + '|' + k]) { lp.forms[k] = rf; added++; } }
          else lp.forms[k] = pick(lf, rf, 'f|' + rp.id + '|' + k, 'formulario ' + k);
        });
        /* pasos marcados: si lo marcó cualquiera, queda marcado; con base, si uno lo desmarcó (y estaba marcado en la base), queda desmarcado */
        lp.done = lp.done || {};
        Object.keys(rp.done || {}).concat(Object.keys(lp.done)).forEach(function (k) {
          var inL = Object.prototype.hasOwnProperty.call(lp.done, k), inR = Object.prototype.hasOwnProperty.call(rp.done || {}, k);
          if (inL && inR) return;
          var was = base && base['d|' + rp.id + '|' + k] !== undefined;
          if (was) delete lp.done[k]; else lp.done[k] = true;
        });
      });
      var d = unionById(s.repo.docs, r.repo.docs, base, 'r|docs|'), a = unionById(s.repo.actas, r.repo.actas, base, 'r|actas|');
      s.repo.docs = d.list; s.repo.actas = a.list; added += d.added + a.added;
      var ev = unionById(s.events, r.events, base, 'ev|'); s.events = ev.list; added += ev.added;
      var ac = unionById(s.activity, r.activity, base, 'act|'); s.activity = ac.list.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; }).slice(-400); /* el historial se une sin contarlo como cambio */
    })();
    update(function (current) { current.projects = s.projects; current.repo = s.repo; current.events = s.events; current.activity = s.activity; current.community = s.community; current.holidays = s.holidays; });
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
    version: function () { return stateVersion; }, isDone: isDone, setDone: setDone, persistNow: persistNow, storageOk: function () { return storageOk; }, storageError: function () { return storageError; }, onStorageStatus: onStorageStatus,
    onChange: onChange, mergeRemote: mergeRemote, snapshotBase: snapshotBase, fingerprint: fp, useVault: useVault, attach: attach, detach: detach, flush: flush
  };
})(typeof window !== 'undefined' ? window : globalThis);
