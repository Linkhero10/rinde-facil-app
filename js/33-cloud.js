/* Rinde Fácil — fotos en el dispositivo, conexión con el servicio en la nube (Apps Script de la comunidad) y lectura de comprobantes (OCR). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util;

  /* ---------- fotos en el dispositivo (IndexedDB); nunca salen si no las mandas ---------- */
  var DB = 'rinde_facil_fotos', STORE = 'imgs', dbp = null;
  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('sin IndexedDB')); return; }
      var rq = root.indexedDB.open(DB, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore(STORE); };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return openDb().then(function (db) { return new Promise(function (resolve, reject) { var t = db.transaction(STORE, mode), st = t.objectStore(STORE), rq = fn(st); t.oncomplete = function () { resolve(rq && rq.result); }; t.onerror = function () { reject(t.error); }; }); });
  }
  var blobs = {
    put: function (id, blob) { return tx('readwrite', function (s) { return s.put(blob, id); }).catch(function () { return null; }); },
    get: function (id) { return tx('readonly', function (s) { return s.get(id); }).catch(function () { return null; }); },
    del: function (id) { return tx('readwrite', function (s) { return s.delete(id); }).catch(function () { return null; }); }
  };

  /* ---------- reducir la foto antes de mandarla (más rápido en celular y respeta la orientación) ---------- */
  function downscale(file, maxSide, quality) {
    maxSide = maxSide || 2000; quality = quality || 0.85;
    if (!/^image\//.test(file.type)) return Promise.resolve(file);
    var p = (root.createImageBitmap ? root.createImageBitmap(file, { imageOrientation: 'from-image' }) : Promise.reject(new Error('sin createImageBitmap')));
    return p.then(function (bmp) {
      var scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      var w = Math.round(bmp.width * scale), hgt = Math.round(bmp.height * scale);
      var cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
      cv.getContext('2d').drawImage(bmp, 0, 0, w, hgt);
      return new Promise(function (resolve) { cv.toBlob(function (b) { resolve(b || file); }, 'image/jpeg', quality); });
    }).catch(function () { return file; });
  }
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  /* ---------- servicio en la nube ---------- */
  function cfg() { return RF.store.get().cloud; }
  /* solo https (o localhost para pruebas): nunca se mandan datos por una conexión sin cifrar */
  function configured() { var c = cfg(); return !!(c.apiUrl && (/^https:\/\//i.test(c.apiUrl) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(c.apiUrl))); }
  function post(action, payload, timeoutMs) {
    var c = cfg();
    if (!configured()) return Promise.reject(new Error('NO_CONFIGURADO'));
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 90000) : null;
    var body = JSON.stringify(Object.assign({ action: action, key: c.key || '' }, payload || {}));
    return fetch(c.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, signal: ctl ? ctl.signal : undefined, redirect: 'follow' })
      .then(function (r) { if (to) clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function (e) { if (to) clearTimeout(to); if (e && e.name === 'AbortError') throw new Error('TIMEOUT'); throw e; });
  }
  function ping() { return post('ping', {}, 20000); }

  /* Lee un comprobante con Google Cloud Vision a través del servicio de la comunidad. */
  function recognize(file) {
    return downscale(file).then(function (blob) {
      return blobToBase64(blob).then(function (b64) {
        return post('ocr', { fileName: file.name || 'comprobante', mimeType: blob.type || file.type || 'image/jpeg', base64: b64 }, 120000).then(function (res) { res._blob = blob; return res; });
      });
    });
  }

  /* Convierte el texto leído en campos del gasto usando el analizador ya probado del piloto. */
  function toExpenseFields(rawText, engine) {
    if (typeof root.parseReceipt !== 'function') return { fields: {}, note: 'Falta el analizador.' };
    var r = root.parseReceipt(rawText, engine || 'cloud_vision');
    var f = {}, notes = [];
    if (r.rut_emisor && r.rut_emisor.normalized) f.rutProveedor = U.rutFormat(r.rut_emisor.normalized);
    if (r.emisor && r.emisor.nombre_legal) f.proveedor = r.emisor.nombre_legal;
    if (r.folio && r.folio.normalized != null) f.folio = String(r.folio.normalized);
    if (r.fecha_emision && r.fecha_emision.iso_8601) f.fecha = r.fecha_emision.iso_8601;
    var m = r.montos || {};
    if (m.monto_neto && m.monto_neto.normalized != null) f.neto = m.monto_neto.normalized;
    if (m.monto_iva && m.monto_iva.normalized != null) f.iva = m.monto_iva.normalized;
    if (m.monto_total && m.monto_total.normalized != null) f.total = m.monto_total.normalized;
    if (r.rut_emisor && r.rut_emisor.raw && !r.rut_emisor.dv_valid) notes.push('El RUT leído no tiene dígito verificador válido: compáralo con la foto.');
    if (m && m.arithmetic_consistent === false) notes.push('Las cifras leídas no cuadran entre sí.');
    if (!f.total) notes.push('No se pudo leer el total.');
    return { fields: f, parser: r, note: notes.join(' ') };
  }

  RF.blobs = blobs;
  RF.cloud = { configured: configured, post: post, ping: ping, downscale: downscale, blobToBase64: blobToBase64 };
  RF.ocr = { recognize: recognize, toExpenseFields: toExpenseFields };
})(typeof window !== 'undefined' ? window : globalThis);
