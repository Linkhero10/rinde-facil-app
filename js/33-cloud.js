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
      .then(function (r) { if (to) clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { try { return JSON.parse(t); } catch (e) { throw new Error('RESPUESTA_INVALIDA'); } }) /* Google a veces devuelve una página de error en vez de datos */
      .catch(function (e) { if (to) clearTimeout(to); if (e && e.name === 'AbortError') throw new Error('TIMEOUT'); throw e; });
  }
  /* Apps Script falla de vez en cuando (probado: 1 de 9 lecturas devolvió una página de error); leer y consultar se pueden repetir sin riesgo. */
  function postRetry(action, payload, timeoutMs, valid) {
    /* valid: comprueba que la respuesta trae lo esperado (en las pruebas llegó una vez la respuesta de «ping» a una lectura) */
    return post(action, payload, timeoutMs).then(function (r) { if (valid && !valid(r)) throw new Error('RESPUESTA_INVALIDA'); return r; }).catch(function (e) {
      if (e && (e.message === 'NO_CONFIGURADO')) throw e;
      return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return post(action, payload, timeoutMs); });
    });
  }
  function ping() { return post('ping', {}, 20000); }

  /* Lee un comprobante con Google Cloud Vision a través del servicio de la comunidad. */
  function recognize(file) {
    return downscale(file).then(function (blob) {
      return blobToBase64(blob).then(function (b64) {
        return postRetry('ocr', { fileName: file.name || 'comprobante', mimeType: blob.type || file.type || 'image/jpeg', base64: b64 }, 120000, function (r) { return !!(r && (r.ok === false || r.engine)); }).then(function (res) { res._blob = blob; return res; });
      });
    });
  }

  /* Convierte el texto leído en campos del gasto usando el analizador ya probado del piloto. */
  /* Los montos, la fecha, el RUT y el N° salen del extractor propio (26-receipt.js), que cuadra neto + IVA = total.
     Del analizador heredado del piloto solo se aprovecha el nombre del proveedor, y solo si coincide el RUT. */
  function toExpenseFields(rawText, engine, opts) {
    if (!RF.receipt) return { fields: {}, note: 'Falta el analizador.' };
    var x = RF.receipt.extract(rawText, opts), f = x.fields, notes = x.notes.slice(), legacy = null;
    if (typeof root.parseReceipt === 'function') {
      try {
        legacy = root.parseReceipt(rawText, engine || 'cloud_vision');
        var lr = legacy.rut_emisor && legacy.rut_emisor.normalized;
        if (f.rutProveedor && lr && U.rutClean(lr) === U.rutClean(f.rutProveedor) && legacy.emisor && legacy.emisor.nombre_legal) f.proveedor = legacy.emisor.nombre_legal;
      } catch (e) { legacy = null; }
    }
    notes.push('Los números del OCR pueden tener un dígito equivocado aunque la confianza sea alta: compara el N° de documento y los montos con la foto.');
    return { fields: f, level: x.level, checks: x.checks, parser: legacy, note: notes.join(' ') };
  }

  RF.blobs = blobs;
  RF.cloud = { configured: configured, post: post, postRetry: postRetry, ping: ping, downscale: downscale, blobToBase64: blobToBase64 };
  RF.ocr = { recognize: recognize, toExpenseFields: toExpenseFields };
})(typeof window !== 'undefined' ? window : globalThis);
