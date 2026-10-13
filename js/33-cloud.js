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
  /* «Chrome en Windows»: solo para que el registro de accesos diga desde qué equipo se entró; no identifica a la persona */
  function deviceLabel() {
    try {
      var n = root.navigator || {}, ua = String(n.userAgent || ''), os = '', br = '';
      var ch = n.userAgentData && n.userAgentData.platform;
      if (/Android/i.test(ua)) os = 'Android'; else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iPhone/iPad'; else if (/Windows/i.test(ua) || /^Win/i.test(ch || '')) os = 'Windows'; else if (/Mac/i.test(ua) || /mac/i.test(ch || '')) os = 'Mac'; else if (/Linux|CrOS/i.test(ua)) os = 'Linux';
      if (/Edg\//.test(ua)) br = 'Edge'; else if (/OPR\/|Opera/.test(ua)) br = 'Opera'; else if (/Firefox\//.test(ua)) br = 'Firefox'; else if (/Brave/i.test(ua) || (n.brave && n.brave.isBrave)) br = 'Brave'; else if (/Chrome\/|CriOS/.test(ua)) br = 'Chrome'; else if (/Safari\//.test(ua)) br = 'Safari';
      return br && os ? br + ' en ' + os : (br || os || '');
    } catch (e) { return ''; }
  }
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
    var body = JSON.stringify(Object.assign({ action: action }, deviceLabel() ? { dev: deviceLabel() } : {}, payload || {}));
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

  /* ---- límites de lectura: lo leído hoy, esta semana y este mes, y los límites vigentes (los informa el servicio) ---- */
  var LIMITES = {
    LIMITE_DIARIO: ['se alcanzó el límite diario de lecturas', 'se reinicia a medianoche (hora de Chile)'],
    LIMITE_SEMANAL: ['se alcanzó el límite semanal de lecturas', 'se reinicia el lunes'],
    LIMITE_MENSUAL: ['se alcanzó el límite mensual de lecturas', 'se reinicia el día 1 del mes']
  };
  /* el texto del límite alcanzado con el número permitido; null si el código no es de límite */
  function mensajeLimite(codigo, limite) {
    var t = LIMITES[String(codigo || '')];
    if (!t) return null;
    return t[0] + (limite ? ' (' + Number(limite).toLocaleString('es-CL') + ')' : '') + '; ' + t[1];
  }
  /* pide al servicio la cuota: lo leído y los límites. Si el servicio es una versión anterior, avisa qué hacer */
  function cuota() {
    return post('cuota', {}, 20000).then(function (r) {
      if (r && r.ok === true && r.diario) return r;
      if (r && r.error === 'ACCION_DESCONOCIDA') throw Object.assign(new Error('El servicio todavía no informa sus límites. Pega la versión nueva de backend/WebApi.gs en Apps Script y vuelve a implementar.'), { code: 'SIN_CUOTA' });
      throw new Error(r && r.error ? humanError({ message: String(r.error) }) : 'El servicio no respondió.');
    });
  }
  /* cuántas lecturas quedan y cuándo se reinician: la más restrictiva de los límites que existan */
  function lecturasDisponibles(c) {
    var opciones = [{ n: c.diario.restan, cuando: 'mañana (a medianoche)' }];
    if (c.semanal.limite) opciones.push({ n: c.semanal.restan, cuando: 'el lunes' });
    if (c.mensual.limite) opciones.push({ n: c.mensual.restan, cuando: 'el día 1 del mes' });
    return opciones.reduce(function (a, b) { return b.n < a.n ? b : a; });
  }
  /* las líneas que se muestran: hoy, esta semana, este mes y, si se va a leer un PDF, cuántas páginas faltan */
  function lineasLimites(c, opts) {
    var n = function (x) { return Number(x || 0).toLocaleString('es-CL'); };
    var d = c.diario, s = c.semanal, m = c.mensual, out = [];
    opts = opts || {};
    out.push({ titulo: 'Hoy', texto: n(d.usadas) + ' de ' + n(d.limite) + ' lecturas · quedan ' + n(d.restan) + ' · se reinicia a medianoche (hora de Chile)' });
    out.push({ titulo: 'Esta semana', texto: s.limite ? n(s.usadas) + ' de ' + n(s.limite) + ' · quedan ' + n(s.restan) : n(s.usadas) + ' lecturas · sin límite semanal configurado' });
    out.push({ titulo: 'Este mes', texto: m.limite ? n(m.usadas) + ' de ' + n(m.limite) + ' · quedan ' + n(m.restan) : n(m.usadas) + ' lecturas · sin límite mensual configurado' });
    if (opts.word) out.push({ titulo: 'Este Word', texto: 'no gasta lecturas: el Word se lee sin Google.' });
    if (opts.paginas) {
      var faltan = Math.max(0, opts.paginas - (opts.leidas || 0)), disp = lecturasDisponibles(c);
      if (faltan === 0) out.push({ titulo: 'Este PDF', texto: 'ya está leído completo: no gasta lecturas.' });
      else if (faltan <= disp.n) out.push({ titulo: 'Este PDF', texto: 'faltan ' + n(faltan) + ' de ' + n(opts.paginas) + ' páginas; alcanzan con las lecturas que quedan (' + n(disp.n) + ').' });
      else out.push({ titulo: 'Este PDF', texto: 'faltan ' + n(faltan) + ' páginas y quedan ' + n(disp.n) + ' lecturas: lo que no alcance se leerá ' + disp.cuando + '. Lo ya leído queda guardado.', aviso: true });
    }
    return out;
  }
  /* la tarjeta con los límites dentro de «contenedor». Se vuelve a pedir cada vez que se sube un archivo o termina una lectura */
  function tarjetaLimites(contenedor, opts) {
    var U2 = RF.util, UI2 = RF.ui;
    U2.clear(contenedor);
    if (!RF.cloud.configured()) {
      contenedor.appendChild(UI2.callout('info', 'Lectura automática desactivada.', ' Conecta el servicio en la nube (Ajustes) para leer con Google y ver los límites.'));
      return Promise.resolve(null);
    }
    contenedor.appendChild(U2.h('p', { class: 'hint' }, 'Revisando los límites de lectura…'));
    return cuota().then(function (c) {
      U2.clear(contenedor);
      var filas = lineasLimites(c, opts).map(function (l) {
        return U2.h('div', { class: 'limit-row' + (l.aviso ? ' warn' : '') }, U2.h('strong', null, l.titulo), U2.h('span', null, l.texto));
      });
      contenedor.appendChild(U2.h('section', { class: 'card limit-card', 'aria-label': 'Límites de lectura' },
        U2.h('h3', { class: 'card-title' }, 'Límites de lectura con Google'),
        filas,
        U2.h('p', { class: 'hint' }, 'Cuenta cada página o foto que se envía a leer, también los reintentos y los intentos que fallan. Google Cloud Vision incluye ' +
          Number(c.referenciaGratisMes || 1000).toLocaleString('es-CL') + ' unidades gratis al mes; cada página cuenta como una. ',
          U2.h('a', { href: 'https://cloud.google.com/vision/pricing', target: '_blank', rel: 'noopener' }, 'Ver precios de Google'))));
      return c;
    }).catch(function (e) {
      U2.clear(contenedor);
      contenedor.appendChild(UI2.callout('warn', 'No se pudieron leer los límites.', ' ' + (e && e.message ? e.message : 'Revisa la conexión y vuelve a intentar.')));
      return null;
    });
  }

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

  /* Lee un PDF (p. ej. el PEA escaneado) con el OCR del servicio. No reduce el archivo: se manda tal cual, en base64.
     Rechaza con mensaje claro si pesa más de 20 MB. Devuelve { ok, raw_text, pages, page_count, total_pages, document_coverage, error }. */
  var PDF_MAX_BYTES = 20 * 1024 * 1024; /* límite de Cloud Vision para archivos */
  function recognizeDocument(file, onStage) {
    var say = function (id, label) { if (onStage) onStage(id, label); };
    if (!file) return Promise.reject(new Error('Falta el archivo PDF.'));
    if (file.size > PDF_MAX_BYTES) return Promise.reject(Object.assign(new Error('El PDF pesa más de 20 MB; sepáralo en partes o usa un Word'), { code: 'ARCHIVO_MUY_GRANDE' }));
    say('prep', 'Preparando el PDF…');
    return blobToBase64(file).then(function (b64) {
      say('read', 'Leyendo el PDF con Google… puede tardar varios minutos.');
      return postRetry('ocr', { fileName: file.name || 'documento.pdf', mimeType: 'application/pdf', base64: b64 }, 300000, function (r) { return !!(r && (r.ok === false || r.engine || r.pages || r.pages_layout)); }, function () { say('read', 'Google no respondió bien. Reintentando…'); });
    }).then(function (res) {
      res = res || {};
      var completo = !res.document_coverage || res.document_coverage === 'COMPLETE';
      var ok = res.ok === true && !!res.raw_text && completo;
      return {
        ok: ok,
        raw_text: ok ? String(res.raw_text) : '',
        pages: ok ? (res.pages_layout || res.pages || []) : [],
        page_count: res.page_count || null,
        total_pages: res.total_pages || res.page_count || null,
        document_coverage: res.document_coverage || null,
        error: ok ? null : (!completo ? 'Google no leyó todas las páginas del PDF; no se aplica el PEA. Prueba de nuevo o sube el Word.' : (res.error || 'OCR_SIN_TEXTO'))
      };
    });
  }

  /* Una página ya dibujada derecha (JPEG): así se lee un PDF escaneado aunque la imagen esté girada dentro del archivo.
     Devuelve { number, ok, raw_text, pages, error } y no rechaza por un fallo de la página: queda con ok:false y su motivo
     (RF.pdfPages.aggregate la pone en failedPages). Solo rechaza si el fallo es de todo el servicio (cuota, clave, no configurado).
     Un fallo pasajero (red, HTTP, tiempo, respuesta ilegible, servicio ocupado, Vision 408/429/5xx) se reintenta hasta 2 veces;
     onRetry(intento) avisa cada reintento (intento 2 o 3). Una hoja sin texto cuenta como leída (en blanco).
     No usa postRetry: ese reintenta una sola vez y no vuelve a validar la respuesta, y también lo usa el escaneo de recibos. */
  var PAGINA_REINTENTOS = 2;
  var PAGINA_MAX_BYTES = 20 * 1024 * 1024; /* mismo límite que el servicio (ocrMaxBytes, sobre los bytes ya decodificados) */
  var FALLO_TODO = /^(NO_CONFIGURADO|OCR_NO_CONFIGURADO|SERVICIO_NO_APROBADO|CLAVE_DISTINTA|SIN_CUENTA|BLOQUEADO|BLOQUEADA|SESION_INVALIDA|LIMITE_DIARIO|LIMITE_SEMANAL|LIMITE_MENSUAL|TIPO_NO_PERMITIDO)$/;
  var FALLO_PASAJERO = /^(TIMEOUT|RESPUESTA_INVALIDA|OCUPADO)$|Failed to fetch|NetworkError|Load failed|^Cloud Vision HTTP (408|429|5\d\d)$/;
  var SIN_TEXTO = /SIN_TEXTO|no devolvió texto/;
  /* 'todo' = no tiene sentido seguir con el PDF; 'pasajero' = se puede reintentar; 'pagina' = esta página no se pudo leer */
  function tipoFallo(e) {
    var cod = String((e && (e.code || e.message)) || '');
    if (FALLO_TODO.test(cod)) return 'todo';
    if ((e && (e.httpStatus === 404 || e.httpStatus === 429 || e.httpStatus >= 500)) || FALLO_PASAJERO.test(cod)) return 'pasajero';
    return 'pagina';
  }
  function esperar(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  /* error del servicio con sus datos (límite y lecturas contadas): así se explica por qué se detuvo la lectura */
  function errorDeServicio(r) { return Object.assign(new Error(String(r.error)), { code: String(r.error), limite: r.limit, usadas: r.used }); }
  /* una llamada a la acción 'ocr'. Una respuesta sin el formato esperado (p. ej. la de «ping») cuenta como fallo pasajero */
  function intentarPagina(datos, n, onRetry) {
    return post('ocr', datos, 120000).then(function (r) {
      if (!r || !(r.ok === false || (r.ok === true && typeof r.raw_text === 'string'))) throw new Error('RESPUESTA_INVALIDA');
      if (r.ok === false && r.error && tipoFallo(new Error(String(r.error))) !== 'pagina') throw errorDeServicio(r);
      return r;
    }).catch(function (e) {
      if (tipoFallo(e) !== 'pasajero' || n >= PAGINA_REINTENTOS) throw e;
      if (onRetry) onRetry(n + 2);
      return esperar(1500 * (n + 1)).then(function () { return intentarPagina(datos, n + 1, onRetry); });
    });
  }
  function paginaFallida(number, error) { return { number: number, ok: false, raw_text: '', pages: [], error: error }; }
  function paginaDesde(number, res) {
    var error = String(res.error || '');
    if (res.ok === true && res.raw_text) return { number: number, ok: true, raw_text: String(res.raw_text), pages: res.pages_layout || res.pages || [], error: null };
    /* una hoja sin texto (en blanco) no es un fallo: el servicio responde «no devolvió texto» */
    if (res.ok === true || SIN_TEXTO.test(error)) return { number: number, ok: true, raw_text: '', pages: [], error: null };
    return paginaFallida(number, error || 'el servicio respondió con un error sin detalle');
  }
  function motivoPagina(e) {
    var m = String((e && (e.code || e.message)) || '');
    if (m === 'RESPUESTA_INVALIDA') return 'el servicio respondió algo que no se pudo leer';
    if (m === 'OCUPADO') return 'el servicio estaba ocupado';
    return humanError(e);
  }
  function recognizePage(blob, number, onRetry) {
    if (!blob) return Promise.resolve(paginaFallida(number, 'no se pudo convertir la página en imagen'));
    if (blob.size > PAGINA_MAX_BYTES) return Promise.resolve(paginaFallida(number, 'la imagen pasa de 20 MB'));
    return blobToBase64(blob).then(function (b64) {
      return intentarPagina({ fileName: 'pagina-' + number + '.jpg', mimeType: 'image/jpeg', base64: b64 }, 0, onRetry);
    }).then(function (res) {
      return paginaDesde(number, res);
    }, function (e) {
      if (tipoFallo(e) === 'todo') {
        var textoLimite = mensajeLimite(e.code || e.message, e.limite);
        if (textoLimite) throw Object.assign(new Error(textoLimite), { code: e.code || e.message });
        throw e;
      }
      return paginaFallida(number, motivoPagina(e));
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
    return { fields: f, level: x.level, checks: x.checks, parser: legacy, note: notes.join(' '), document: RF.receipt.classify ? RF.receipt.classify(rawText) : null };
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
  RF.ocr = { recognize: recognize, recognizeDocument: recognizeDocument, recognizePage: recognizePage, toExpenseFields: toExpenseFields,
    cuota: cuota, lineasLimites: lineasLimites, lecturasDisponibles: lecturasDisponibles, tarjetaLimites: tarjetaLimites, mensajeLimite: mensajeLimite };
})(typeof window !== 'undefined' ? window : globalThis);
