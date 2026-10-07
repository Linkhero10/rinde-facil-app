/* Rinde Fácil — utilidades sin dependencias (corren en navegador y en Node para pruebas). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};

  /* ---------- formato y números ---------- */
  var nf = (typeof Intl !== 'undefined') ? new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }) : null;
  function fmtCLP(n) {
    n = Number(n);
    if (!isFinite(n)) return '';
    var s = nf ? nf.format(Math.round(n)) : String(Math.round(n));
    return '$ ' + s;
  }
  function fmtNum(n) {
    n = Number(n);
    if (!isFinite(n)) return '';
    return nf ? nf.format(Math.round(n)) : String(Math.round(n));
  }
  /* "1.234.567", "$ 1.234", "1234,5" -> número (los puntos son miles; la coma, decimal) */
  function parseCLP(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/[^\d,.\-]/g, '');
    if (!s) return 0;
    var neg = s.charAt(0) === '-';
    s = s.replace(/-/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var n = parseFloat(s);
    if (!isFinite(n)) return 0;
    return neg ? -n : n;
  }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function sum(arr, f) { var t = 0; for (var i = 0; i < arr.length; i++) t += Number(f ? f(arr[i]) : arr[i]) || 0; return t; }

  /* ---------- fechas (todo en UTC para evitar corrimientos por zona horaria) ---------- */
  function isoToDate(iso) {
    if (!iso) return null;
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  function dateToIso(d) {
    if (!d) return '';
    var y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, da = d.getUTCDate();
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
  }
  function todayISO() {
    var d = new Date();
    var y = d.getFullYear(), mo = d.getMonth() + 1, da = d.getDate();
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
  }
  function addDays(iso, n) {
    var d = isoToDate(iso); if (!d) return '';
    d.setUTCDate(d.getUTCDate() + n);
    return dateToIso(d);
  }
  function diffDays(aIso, bIso) { /* b - a */
    var a = isoToDate(aIso), b = isoToDate(bIso);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }
  function isBusinessDay(d, holidaySet) {
    var wd = d.getUTCDay();
    if (wd === 0 || wd === 6) return false;
    return !(holidaySet && holidaySet[dateToIso(d)]);
  }
  /* Suma n días hábiles (lunes a viernes, sin feriados de la lista). El día de partida no cuenta. */
  function addBusinessDays(iso, n, holidays) {
    var d = isoToDate(iso); if (!d) return '';
    var hs = {}; (holidays || []).forEach(function (h) { hs[h] = true; });
    var left = n;
    while (left > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (isBusinessDay(d, hs)) left--;
    }
    return dateToIso(d);
  }
  function businessDaysBetween(aIso, bIso, holidays) { /* días hábiles que faltan desde a (excl.) hasta b (incl.) */
    var a = isoToDate(aIso), b = isoToDate(bIso);
    if (!a || !b) return null;
    var hs = {}; (holidays || []).forEach(function (h) { hs[h] = true; });
    var sign = b >= a ? 1 : -1, n = 0, d = new Date(a.getTime());
    while (sign > 0 ? d < b : d > b) {
      d.setUTCDate(d.getUTCDate() + sign);
      if (isBusinessDay(d, hs)) n += sign;
    }
    return n;
  }
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MESES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fmtDate(iso) {
    var d = isoToDate(iso); if (!d) return '';
    return d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()] + ' de ' + d.getUTCFullYear();
  }
  function fmtDateShort(iso) {
    var d = isoToDate(iso); if (!d) return '';
    var da = d.getUTCDate(), mo = d.getUTCMonth() + 1;
    return (da < 10 ? '0' : '') + da + '-' + (mo < 10 ? '0' : '') + mo + '-' + d.getUTCFullYear();
  }
  function monthKey(iso) { return String(iso || '').slice(0, 7); }
  function monthLabel(key) { var m = String(key).match(/^(\d{4})-(\d{2})$/); return m ? MESES3[+m[2] - 1] + '-' + m[1].slice(2) : key; }
  function monthsRange(startIso, endIso) { /* lista de 'YYYY-MM' inclusiva */
    var a = isoToDate(startIso), b = isoToDate(endIso), out = [];
    if (!a || !b || b < a) return out;
    var y = a.getUTCFullYear(), m = a.getUTCMonth();
    var ey = b.getUTCFullYear(), em = b.getUTCMonth();
    var guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard++ < 600) {
      out.push(y + '-' + (m + 1 < 10 ? '0' : '') + (m + 1));
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }

  /* ---------- RUT chileno ---------- */
  function rutClean(s) { return String(s == null ? '' : s).replace(/[^0-9kK]/g, '').toUpperCase(); }
  function rutDv(body) {
    var sum = 0, mul = 2;
    for (var i = body.length - 1; i >= 0; i--) { sum += (+body.charAt(i)) * mul; mul = mul === 7 ? 2 : mul + 1; }
    var r = 11 - (sum % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }
  function rutValid(s) {
    var c = rutClean(s);
    if (c.length < 2) return false;
    var body = c.slice(0, -1), dv = c.slice(-1);
    if (!/^\d+$/.test(body) || body.length < 5 || body.length > 9) return false;
    return rutDv(body) === dv;
  }
  function rutFormat(s) {
    var c = rutClean(s);
    if (c.length < 2) return c;
    var body = c.slice(0, -1), dv = c.slice(-1);
    return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
  }

  /* ---------- varios ---------- */
  var _uid = 0;
  function uid(prefix) {
    _uid++;
    return (prefix || 'id') + '-' + Date.now().toString(36) + _uid.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function debounce(fn, ms) {
    var t = null;
    var f = function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
    f.flush = function () { /* ejecuta ya si hay algo pendiente */ };
    return f;
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function get(o, path, dflt) {
    var p = String(path).split('.'), cur = o;
    for (var i = 0; i < p.length; i++) { if (cur == null) return dflt; cur = cur[p[i]]; }
    return cur == null ? dflt : cur;
  }
  function set(o, path, val) {
    var p = String(path).split('.'), cur = o;
    for (var i = 0; i < p.length - 1; i++) {
      if (cur[p[i]] == null || typeof cur[p[i]] !== 'object') cur[p[i]] = {};
      cur = cur[p[i]];
    }
    cur[p[p.length - 1]] = val;
  }
  function slug(s) {
    return String(s || '').normalize ? String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : String(s || '');
  }

  /* ---------- DOM ---------- */
  /* el navegador ignora espacios, tabulaciones, saltos y caracteres invisibles dentro del esquema de un enlace (java<tab>script:): se quitan antes de mirar */
  function stripInvisible(v) {
    var t = String(v), o = '';
    for (var n = 0; n < t.length; n++) {
      var c = t.charCodeAt(n);
      if (c <= 32 || (c >= 127 && c <= 159) || c === 173 || (c >= 8203 && c <= 8207) || c === 8232 || c === 8233 || c === 65279) continue;
      o += t.charAt(n);
    }
    return o;
  }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.textContent = v; /* nunca se interpreta como HTML: lo que llega del servicio o de un archivo no puede inyectar nada */
        else if (k === 'style' && typeof v === 'object') { for (var s in v) { if (s.indexOf('-') >= 0) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; } }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'dataset') { for (var d in v) el.dataset[d] = v[d]; }
        else if (v === true) el.setAttribute(k, '');
        else if ((k === 'href' || k === 'src' || k === 'action' || k === 'formaction') && /^(javascript|vbscript|data):/i.test(stripInvisible(v)) && !(k === 'src' && tag === 'img' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(v)))) continue; /* enlaces que ejecutan código: se descartan (salvo una imagen en base64, como la firma) */
        else el.setAttribute(k, v);
      }
    }
    for (var i = 2; i < arguments.length; i++) appendKids(el, arguments[i]);
    return el;
  }
  function appendKids(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { appendKids(el, k); }); return; }
    if (typeof kid === 'string' || typeof kid === 'number') el.appendChild(document.createTextNode(String(kid)));
    else el.appendChild(kid);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* JSON que viene de afuera (respaldos, copia de la nube): se descartan las claves que cambiarían el prototipo del objeto */
  /* tiempo de espera legible: «45 segundos» si falta menos de un minuto; «1 minuto y 30 segundos» si falta más */
  function waitText(total) {
    var s = Math.max(0, Math.ceil(Number(total) || 0)), m = Math.floor(s / 60), r = s % 60;
    function seg(n) { return n + (n === 1 ? ' segundo' : ' segundos'); }
    if (m < 1) return seg(s);
    var mm = m + (m === 1 ? ' minuto' : ' minutos');
    return r ? mm + ' y ' + seg(r) : mm;
  }

  function safeParse(text) {
    return JSON.parse(text, function (k, v) { return (k === '__proto__' || k === 'constructor' || k === 'prototype') ? undefined : v; });
  }

  RF.util = {
    safeParse: safeParse,
    waitText: waitText,
    fmtCLP: fmtCLP, fmtNum: fmtNum, parseCLP: parseCLP, clamp: clamp, sum: sum,
    isoToDate: isoToDate, dateToIso: dateToIso, todayISO: todayISO, addDays: addDays, diffDays: diffDays,
    addBusinessDays: addBusinessDays, businessDaysBetween: businessDaysBetween,
    fmtDate: fmtDate, fmtDateShort: fmtDateShort, monthKey: monthKey, monthLabel: monthLabel, monthsRange: monthsRange,
    MESES: MESES, rutClean: rutClean, rutDv: rutDv, rutValid: rutValid, rutFormat: rutFormat,
    uid: uid, esc: esc, debounce: debounce, deepClone: deepClone, get: get, set: set, slug: slug,
    h: h, clear: clear, $: $, $$: $$, download: download, copyText: copyText
  };
})(typeof window !== 'undefined' ? window : globalThis);
