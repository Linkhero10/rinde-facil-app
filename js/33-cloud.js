/* Rinde Fácil — fotos en el dispositivo, conexión con el servicio en la nube (Apps Script de la comunidad) y lectura de comprobantes (OCR). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util;

  /* ---------- fotos en el dispositivo (IndexedDB); nunca salen si no las mandas ---------- */
  var DB = 'rinde_facil_fotos', STORE = 'imgs', OUTBOX = 'outbox', dbp = null;
  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('sin IndexedDB')); return; }
      var rq = root.indexedDB.open(DB, 2);
      rq.onupgradeneeded = function () { var names = rq.result.objectStoreNames; if (!names.contains(STORE)) rq.result.createObjectStore(STORE); if (!names.contains(OUTBOX)) rq.result.createObjectStore(OUTBOX); };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error); };
    });
    return dbp;
  }
  function tx(mode, fn, storeName) {
    return openDb().then(function (db) { return new Promise(function (resolve, reject) { var name = storeName || STORE, t = db.transaction(name, mode), st = t.objectStore(name), rq = fn(st); t.oncomplete = function () { resolve(rq && rq.result); }; t.onerror = function () { reject(t.error); }; }); });
  }
  /* con la bóveda abierta, las fotos entran cifradas; las que ya estaban sin cifrar se cifran de a poco (encryptAll) */
  function isBlob(x) { return typeof Blob !== 'undefined' && x instanceof Blob; }
  var blobs = {
    put: function (id, blob) {
      var enc = RF.vault && RF.vault.isOpen() ? RF.vault.encryptBlob(blob) : Promise.resolve(blob);
      return enc.then(function (rec) { return tx('readwrite', function (s) { return s.put(rec, id); }); }).catch(function () { return null; });
    },
    get: function (id) {
      return tx('readonly', function (s) { return s.get(id); }).then(function (rec) { return rec && rec.enc && RF.vault ? RF.vault.decryptBlob(rec) : rec; }).catch(function () { return null; });
    },
    del: function (id) { return tx('readwrite', function (s) { return s.delete(id); }).catch(function () { return null; }); },
    encryptAll: function () {
      if (!RF.vault || !RF.vault.isOpen()) return Promise.resolve(0);
      return tx('readonly', function (s) { return s.getAllKeys(); }).then(function (keys) {
        var n = 0, chain = Promise.resolve();
        (keys || []).forEach(function (k) {
          chain = chain.then(function () { return tx('readonly', function (s) { return s.get(k); }); }).then(function (rec) {
            if (!isBlob(rec)) return null;
            return RF.vault.encryptBlob(rec).then(function (e) { n++; return tx('readwrite', function (s) { return s.put(e, k); }); });
          });
        });
        return chain.then(function () { return n; });
      });
    },
    clearAll: function () { return Promise.all([tx('readwrite', function (s) { return s.clear(); }), tx('readwrite', function (s) { return s.clear(); }, OUTBOX)]).catch(function () { return null; }); }
  };

  /* ---------- cola de envíos: lo que no se pudo subir al Drive por falta de conexión espera aquí (cifrado) y se reintenta solo ---------- */
  var outbox = {
    add: function (key, label, payload, meta) {
      if (!RF.vault || !RF.vault.isOpen()) return Promise.resolve(null);
      /* ni el nombre del proyecto ni el del archivo quedan a la vista: la clave es un hash y el resto va cifrado */
      var blob = new Blob([JSON.stringify({ label: label, payload: payload, meta: meta || null })], { type: 'application/json' });
      return root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)).then(function (d) {
        var id = 'q' + Array.prototype.map.call(new Uint8Array(d).subarray(0, 12), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        return RF.vault.encryptBlob(blob).then(function (enc) { return tx('readwrite', function (s) { return s.put({ id: id, at: new Date().toISOString(), tries: 0, enc: enc }, id); }, OUTBOX); }).then(function () { return id; });
      });
    },
    list: function () { return tx('readonly', function (s) { return s.getAll(); }, OUTBOX).then(function (a) { return (a || []).sort(function (x, y) { return x.at < y.at ? -1 : 1; }); }).catch(function () { return []; }); },
    open: function (rec) { return RF.vault.decryptBlob(rec.enc).then(function (b) { return b.text(); }).then(function (t) { return JSON.parse(t); }); },
    del: function (id) { return tx('readwrite', function (s) { return s.delete(id); }, OUTBOX).catch(function () { return null; }); },
    bump: function (rec) { rec.tries = (rec.tries || 0) + 1; return tx('readwrite', function (s) { return s.put(rec, rec.id); }, OUTBOX).catch(function () { return null; }); },
    count: function () { return tx('readonly', function (s) { return s.count(); }, OUTBOX).catch(function () { return 0; }); }
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
  /* solo el servicio de Apps Script de Google (o localhost, para pruebas): así un enlace falso pegado por error no recibe ni siquiera la clave derivada */
  function validUrl(u) { return !!(u && (/^https:\/\/script\.google\.com\/(macros|a\/macros\/[A-Za-z0-9.\-]+)\/s\/[A-Za-z0-9_\-]+\/exec\/?$/.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(u))); }
  function configured() { return validUrl(cfg().apiUrl); }
  function rawPostTo(url, action, payload, timeoutMs) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 90000) : null;
    var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, signal: ctl ? ctl.signal : undefined, redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { if (to) clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { try { return JSON.parse(t); } catch (e) { throw new Error('RESPUESTA_INVALIDA'); } }) /* Google a veces devuelve una página de error en vez de datos */
      .catch(function (e) { if (to) clearTimeout(to); if (e && e.name === 'AbortError') throw new Error('TIMEOUT'); throw e; });
  }
  function postRaw(action, payload, timeoutMs) {
    if (!configured()) return Promise.reject(new Error('NO_CONFIGURADO'));
    return rawPostTo(cfg().apiUrl, action, payload, timeoutMs);
  }
  function postRawTo(url, action, payload, timeoutMs) {
    if (!validUrl(url)) return Promise.reject(new Error('NO_CONFIGURADO'));
    return rawPostTo(url, action, payload, timeoutMs);
  }
  /* todo lo que toca datos lleva el token de la sesión; si venció, se inicia sesión de nuevo una vez y se repite */
  function post(action, payload, timeoutMs) {
    if (!configured()) return Promise.reject(new Error('NO_CONFIGURADO'));
    if (!RF.auth || !RF.auth.needsSession(action)) return postRaw(action, payload, timeoutMs);
    function go(t) { return postRaw(action, Object.assign({ t: t }, payload), timeoutMs); }
    return RF.auth.ensureSession().then(go).then(function (r) {
      if (r && r.error === 'SESION_INVALIDA') { RF.auth.dropToken(); return RF.auth.ensureSession().then(go); }
      return r;
    });
  }
  /* Apps Script falla de vez en cuando (probado: 1 de 9 lecturas devolvió una página de error); leer y consultar se pueden repetir sin riesgo. */
  function postRetry(action, payload, timeoutMs, valid, onRetry) {
    /* valid: comprueba que la respuesta trae lo esperado (en las pruebas llegó una vez la respuesta de «ping» a una lectura) */
    return post(action, payload, timeoutMs).then(function (r) { if (valid && !valid(r)) throw new Error('RESPUESTA_INVALIDA'); return r; }).catch(function (e) {
      if (e && (e.message === 'NO_CONFIGURADO' || (e.code && /^(CLAVE_DISTINTA|SIN_CUENTA|BLOQUEADO|BLOQUEADA)$/.test(e.code)))) throw e;
      if (onRetry) onRetry(e);
      return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return post(action, payload, timeoutMs); });
    });
  }
  function ping() { return post('ping', {}, 20000); }

  /* Lee un comprobante con Google Cloud Vision a través del servicio de la comunidad. */
  function recognize(file, onStage) {
    var say = function (id, label) { if (onStage) onStage(id, label); };
    say('prep', 'Preparando la foto…');
    return downscale(file).then(function (blob) {
      return blobToBase64(blob).then(function (b64) {
        say('read', 'Enviando la foto y leyéndola con Google…');
        return postRetry('ocr', { fileName: file.name || 'comprobante', mimeType: blob.type || file.type || 'image/jpeg', base64: b64 }, 120000, function (r) { return !!(r && (r.ok === false || r.engine)); }, function () { say('read', 'Google no respondió bien. Reintentando…'); }).then(function (res) { res._blob = blob; return res; });
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
        if (!f.proveedor && f.rutProveedor && lr && U.rutClean(lr) === U.rutClean(f.rutProveedor) && legacy.emisor && legacy.emisor.nombre_legal) f.proveedor = legacy.emisor.nombre_legal;
      } catch (e) { legacy = null; }
    }
    notes.push('Los números del OCR pueden tener un dígito equivocado aunque la confianza sea alta: compara el N° de documento y los montos con la foto.');
    return { fields: f, level: x.level, checks: x.checks, parser: legacy, note: notes.join(' ') };
  }

  RF.blobs = blobs;
  RF.outbox = outbox;
  RF.cloud = { configured: configured, validUrl: validUrl, post: post, postRaw: postRaw, postRawTo: postRawTo, postRetry: postRetry, ping: ping, downscale: downscale, blobToBase64: blobToBase64 };
  RF.ocr = { recognize: recognize, toExpenseFields: toExpenseFields };
})(typeof window !== 'undefined' ? window : globalThis);
