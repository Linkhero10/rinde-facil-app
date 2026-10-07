/* Rinde Fácil — feriados de Chile, solos: la lista que viene en la app + los años que se descargan al abrirla (se renuevan cada mes).
 * Sirven para contar días hábiles. No aparecen en el calendario: Google Calendar y el teléfono ya los conocen.
 * Solo se pide el año a un servicio público de feriados (Nager.Date): no se envía ningún dato de la comunidad. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var URL_BASE = 'https://date.nager.at/api/v3/PublicHolidays/', COUNTRY = 'CL', MAX_AGE_MS = 30 * 24 * 3600 * 1000, ISO = /^\d{4}-\d{2}-\d{2}$/;
  var running = null;

  function cache() { var s = RF.store.get(); return (s.ui && s.ui.feriados) || { at: null, years: {} }; }
  /* todos los feriados que se usan para contar días hábiles: los de la app, los descargados y los que la comunidad agregó a mano (regionales) */
  function all(s) {
    s = s || RF.store.get();
    var set = {}, c = (s.ui && s.ui.feriados) || { years: {} };
    Object.keys(RF.data.FERIADOS_CL || {}).forEach(function (y) { (RF.data.FERIADOS_CL[y] || []).forEach(function (d) { set[d] = true; }); });
    Object.keys(c.years || {}).forEach(function (y) { (c.years[y] || []).forEach(function (d) { if (ISO.test(d)) set[d] = true; }); });
    (s.holidays || []).forEach(function (d) { if (ISO.test(d)) set[d] = true; });
    return Object.keys(set).sort();
  }
  function parse(json) {
    if (!Array.isArray(json)) return null;
    var out = json.filter(function (x) { return x && ISO.test(String(x.date)) && x.global === true; }).map(function (x) { return x.date; });
    return out.length >= 8 ? out.sort() : null; /* una respuesta con muy pocos feriados es sospechosa: no se usa */
  }
  function fetchYear(y) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
    return fetch(URL_BASE + y + '/' + COUNTRY, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (t) clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }, function (e) { if (t) clearTimeout(t); throw e; }).then(parse);
  }
  /* descarga el año actual y el siguiente si la copia tiene más de un mes (o falta). Si no hay conexión, se sigue con la lista de la app. */
  function refresh(force) {
    if (running) return running;
    if (RF.auth && RF.auth.phase && RF.auth.phase() !== 'open') return Promise.resolve(false);
    if (typeof fetch === 'undefined' || (root.navigator && root.navigator.onLine === false)) return Promise.resolve(false);
    var c = cache(), now = Date.now(), y0 = new Date().getFullYear(), years = [y0, y0 + 1];
    var fresh = c.at && now - Date.parse(c.at) < MAX_AGE_MS && years.every(function (y) { return c.years && c.years[y]; });
    if (fresh && !force) return Promise.resolve(false);
    running = Promise.all(years.map(function (y) { return fetchYear(y).catch(function () { return null; }).then(function (list) { return [y, list]; }); })).then(function (res) {
      var got = res.filter(function (r) { return r[1]; });
      if (!got.length) return false;
      if (RF.auth && RF.auth.phase && RF.auth.phase() !== 'open') return false; /* la sesión se cerró mientras se descargaba: no se escribe con la bóveda cerrada */
      RF.store.update(function (s) {
        s.ui = s.ui || {}; var n = Object.assign({ years: {} }, s.ui.feriados || {}); n.years = Object.assign({}, n.years);
        got.forEach(function (r) { n.years[r[0]] = r[1]; }); n.at = new Date().toISOString(); s.ui.feriados = n;
      }, { silent: true, noSync: true });
      return true;
    }).then(function (v) { running = null; return v; }, function () { running = null; return false; });
    return running;
  }
  RF.holidays = { all: all, refresh: refresh, parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);
