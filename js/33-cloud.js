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
      if (!id || !blob) return Promise.reject(new Error('Falta el identificador o el archivo del comprobante.'));
      var enc = RF.vault && RF.vault.isOpen() ? RF.vault.encryptBlob(blob) : Promise.resolve(blob);
      return enc.then(function (rec) { return tx('readwrite', function (s) { return s.put(rec, id); }); });
    },
    get: function (id) {
      return tx('readonly', function (s) { return s.get(id); }).then(function (rec) { return rec && rec.enc && RF.vault ? RF.vault.decryptBlob(rec) : rec; });
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
      if (!RF.vault || !RF.vault.isOpen()) return Promise.reject(new Error('BOVEDA_CERRADA'));
      /* ni el nombre del proyecto ni el del archivo quedan a la vista: la clave es un hash y el resto va cifrado */
      var blob = new Blob([JSON.stringify({ label: label, payload: payload, meta: meta || null })], { type: 'application/json' });
      var serviceUrl = meta && meta.serviceUrl ? String(meta.serviceUrl).trim().replace(/\/+$/, '') : '';
      var identity = JSON.stringify(meta && meta.coalesce
        ? { key: String(key), serviceUrl: serviceUrl }
        : { key: String(key), serviceUrl: serviceUrl, payload: payload });
      return root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)).then(function (d) {
        var id = 'q' + Array.prototype.map.call(new Uint8Array(d), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        return RF.vault.encryptBlob(blob).then(function (enc) { return tx('readwrite', function (s) { return s.put({ id: id, at: new Date().toISOString(), tries: 0, status: 'pending', errorCode: null, enc: enc }, id); }, OUTBOX); }).then(function () { return id; });
      });
    },
    list: function () { return tx('readonly', function (s) { return s.getAll(); }, OUTBOX).then(function (a) { return (a || []).sort(function (x, y) { return x.at < y.at ? -1 : x.at > y.at ? 1 : 0; }); }); },
    open: function (rec) { return RF.vault.decryptBlob(rec.enc).then(function (b) { return b.text(); }).then(function (t) { return JSON.parse(t); }); },
    del: function (id) { return tx('readwrite', function (s) { return s.delete(id); }, OUTBOX); },
    bump: function (rec, errorCode, needsAttention) {
      rec.tries = (rec.tries || 0) + 1;
      rec.status = needsAttention ? 'needs_attention' : 'pending';
      rec.errorCode = errorCode ? String(errorCode).replace(/[^A-Z0-9_]/g, '').slice(0, 64) || 'ERROR_DE_SERVICIO' : null;
      return tx('readwrite', function (s) { return s.put(rec, rec.id); }, OUTBOX);
    },
    retryAll: function () {
      return this.list().then(function (items) {
        var retried = 0;
        return items.reduce(function (chain, rec) {
          if (rec.status !== 'needs_attention') return chain;
          return chain.then(function () {
            rec.tries = 0; rec.status = 'pending'; rec.errorCode = null;
            return tx('readwrite', function (s) { return s.put(rec, rec.id); }, OUTBOX).then(function () { retried++; });
          });
        }, Promise.resolve()).then(function () { return retried; });
      });
    },
    count: function () { return tx('readonly', function (s) { return s.count(); }, OUTBOX); }
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
  /* La sintaxis de una URL no autentica el servicio. Apps Script requiere pinning exacto por versión distribuida. */
  function validUrl(u) { return !!(typeof u === 'string' && u === u.trim() && (/^https:\/\/script\.google\.com\/(macros|a\/macros\/[A-Za-z0-9.\-]+)\/s\/[A-Za-z0-9_\-]+\/exec\/?$/.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(u))); }
  function canonicalUrl(u) {
    if (!validUrl(u)) return null;
    try {
      var x = new URL(u);
      if (x.username || x.password || x.search || x.hash) return null;
      x.pathname = x.pathname.replace(/\/+$/, '');
      return x.href.replace(/\/+$/, '');
    } catch (e) { return null; }
  }
  function trustedUrl(u) {
    var key = canonicalUrl(u);
    if (!key) return false;
    var x = new URL(u);
    if (x.protocol === 'http:' && (x.hostname === '127.0.0.1' || x.hostname === 'localhost')) {
      var loc = root.location;
      if (!loc || loc.protocol !== 'http:' || !loc.origin) return false;
      try {
        var here = new URL(loc.origin);
        return here.protocol === 'http:' && (here.hostname === '127.0.0.1' || here.hostname === 'localhost') && here.origin === x.origin;
      } catch (e) { return false; }
    }
    var trust = root.RF_SERVICE_TRUST || {}, list = trust.approvedAppsScriptUrls;
    if (!Array.isArray(list)) return false;
    return list.some(function (approved) { return canonicalUrl(approved) === key; });
  }
  /* direcciones de servicio que esta versión de la app aprueba (la lista vive en 00-service-trust.js) */
  function approvedUrls() { var t = root.RF_SERVICE_TRUST || {}; return Array.isArray(t.approvedAppsScriptUrls) ? t.approvedAppsScriptUrls.filter(function (u) { return validUrl(u); }) : []; }
  function trustError() { return Object.assign(new Error('La dirección del servicio no está aprobada en esta versión de Rinde Fácil. No se enviaron datos ni claves.'), { code: 'SERVICIO_NO_APROBADO' }); }
  function connectionError(u) { return u && validUrl(u) && !trustedUrl(u) ? trustError() : Object.assign(new Error('No hay un servicio aprobado configurado.'), { code: 'NO_CONFIGURADO' }); }
  function configured() { return trustedUrl(cfg().apiUrl); }
  /* Apps Script a veces contesta a un POST con la respuesta de «ping» (la de doGet) sin haber ejecutado la acción. Esa respuesta tiene solo ok, service y version;
     como la acción no se ejecutó, repetirla es seguro. Sin esto, la primera llamada de «Conectar este equipo» decía «el servicio no tiene cuenta» aunque la tuviera. */
  function isStrayPing(action, r) { return action !== 'ping' && !!r && r.ok === true && r.service === 'rinde-facil' && !!r.version && Object.keys(r).length === 3; }
  function rawPostTo(url, action, payload, timeoutMs) {
    function attempt(n) {
      return rawPostOnce(url, action, payload, timeoutMs).then(function (r) {
        if (!isStrayPing(action, r)) return r;
        if (n >= 3) throw new Error('RESPUESTA_INVALIDA');
        return new Promise(function (res) { setTimeout(res, 900 * (n + 1)); }).then(function () { return attempt(n + 1); });
      }, function (e) {
        /* un 404 o un 429 no ejecutó nada (por ejemplo, mientras se publica una versión nueva del servicio): se repite */
        if (e && (e.httpStatus === 404 || e.httpStatus === 429) && n < 2) return new Promise(function (res) { setTimeout(res, 1500 * (n + 1)); }).then(function () { return attempt(n + 1); });
        throw e;
      });
    }
    return attempt(0);
  }
  function rawPostOnce(url, action, payload, timeoutMs) {
    if (!trustedUrl(url)) return Promise.reject(trustError());
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 90000) : null;
    var body = JSON.stringify(Object.assign({ action: action }, payload || {}));
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, signal: ctl ? ctl.signal : undefined, redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { if (to) clearTimeout(to); if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { httpStatus: r.status }); return r.text(); })
      .then(function (t) { try { return JSON.parse(t); } catch (e) { throw new Error('RESPUESTA_INVALIDA'); } }) /* Google a veces devuelve una página de error en vez de datos */
      .catch(function (e) { if (to) clearTimeout(to); if (e && e.name === 'AbortError') throw new Error('TIMEOUT'); throw e; });
  }
  function postRaw(action, payload, timeoutMs) {
    var url = cfg().apiUrl;
    if (!configured()) return Promise.reject(connectionError(url));
    return rawPostTo(url, action, payload, timeoutMs);
  }
  function postRawTo(url, action, payload, timeoutMs) {
    if (!trustedUrl(url)) return Promise.reject(validUrl(url) ? trustError() : Object.assign(new Error('Dirección de servicio no válida.'), { code: 'NO_CONFIGURADO' }));
    return rawPostTo(url, action, payload, timeoutMs);
  }
  /* todo lo que toca datos lleva el token de la sesión; si venció, se inicia sesión de nuevo una vez y se repite */
  function post(action, payload, timeoutMs) {
    if (!configured()) return Promise.reject(connectionError(cfg().apiUrl));
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
      if (e && (e.message === 'NO_CONFIGURADO' || (e.code && /^(CLAVE_DISTINTA|SIN_CUENTA|BLOQUEADO|BLOQUEADA|SERVICIO_NO_APROBADO)$/.test(e.code)))) throw e;
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
  /* explica un error de conexión sin tecnicismos («Failed to fetch» no le dice nada a nadie) */
  function humanError(e) {
    var m = String((e && e.message) || e || '');
    if (/Failed to fetch|NetworkError|Load failed|ERR_INTERNET|fetch/i.test(m)) return 'No hay conexión a internet, o el servicio no responde.';
    if (/TIMEOUT|abort/i.test(m)) return 'El servicio tardó demasiado en responder.';
    if (/HTTP 404/.test(m)) return 'No se encontró el servicio (error 404). Si acaban de actualizarlo en Apps Script, espera un minuto y vuelve a intentar.';
    if (/HTTP 429/.test(m)) return 'El servicio está recibiendo muchas solicitudes. Espera un momento y vuelve a intentar.';
    if (/^HTTP \d+/.test(m)) return 'El servicio respondió con un error (' + m + '). Vuelve a intentar en un momento.';
    return m || 'error desconocido';
  }
  RF.cloud = { approvedUrls: approvedUrls, humanError: humanError, configured: configured, validUrl: validUrl, trustedUrl: trustedUrl, post: post, postRaw: postRaw, postRawTo: postRawTo, postRetry: postRetry, ping: ping, downscale: downscale, blobToBase64: blobToBase64 };
  RF.ocr = { recognize: recognize, toExpenseFields: toExpenseFields };
})(typeof window !== 'undefined' ? window : globalThis);
