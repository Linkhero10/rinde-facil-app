/* Rinde Fácil — la «bóveda»: todo lo que la app guarda en este dispositivo va cifrado con la contraseña de la comunidad.
 *
 * En localStorage queda solo esto (nada legible): { usuario normalizado, sal y vueltas del KDF, la clave de datos envuelta con la
 * contraseña y con el código de recuperación, y el estado cifrado }. Sin la contraseña o el código no hay forma de leer los datos de este equipo:
 * lo que se haya guardado en el Drive de la comunidad es la otra copia. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var C = RF.crypto;
  var KEY = 'rinde_facil_vault_v3', LEGACY = 'rinde_facil_v2', FAILS = 'rinde_facil_vault_fails';
  var mem = { dek: null, user: null, password: null };
  var chain = Promise.resolve();

  function ls() { try { return root.localStorage; } catch (e) { return null; } }
  function readMeta() { try { var raw = ls().getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function writeMeta(m) { ls().setItem(KEY, JSON.stringify(m)); }
  function legacyState() {
    try { var raw = ls().getItem(LEGACY); if (!raw) return null; var o = JSON.parse(raw); if (o && o.cloud) { o.cloud = Object.assign({}, o.cloud); delete o.cloud.key; } return o; } catch (e) { return null; }
  }
  function status() { if (readMeta()) return mem.dek ? 'open' : 'locked'; return legacyState() ? 'legacy' : 'none'; }
  function fail(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  /* freno local contra probar contraseñas a mano en este equipo (el costo del KDF ya hace lento cada intento) */
  function throttle() {
    var f; try { f = JSON.parse(ls().getItem(FAILS) || '{}'); } catch (e) { f = {}; }
    var left = (f.until || 0) - Date.now();
    if (left > 0) throw Object.assign(fail('ESPERA', 'Demasiados intentos. Faltan ' + RF.util.waitText(Math.ceil(left / 1000)) + '.'), { seconds: Math.ceil(left / 1000) });
  }
  function noteFail() {
    var f; try { f = JSON.parse(ls().getItem(FAILS) || '{}'); } catch (e) { f = {}; }
    f.n = (f.n || 0) + 1;
    if (f.n >= 5) f.until = Date.now() + Math.min(30000 * Math.pow(2, Math.floor(f.n / 5) - 1), 3600000);
    ls().setItem(FAILS, JSON.stringify(f));
  }
  function clearFails() { try { ls().removeItem(FAILS); } catch (e) { /* sin almacenamiento */ } }

  function buildMeta(user, password, iterations, opts) {
    var saltP = C.b64(C.rand(16)), saltR = opts && opts.noRecovery ? null : C.b64(C.rand(16)), code = saltR ? C.newRecoveryCode() : null;
    return Promise.all([C.deriveKeys(password, saltP, iterations), saltR ? C.deriveKeys(C.normalizeRecovery(code), saltR, iterations) : Promise.resolve(null), C.newDek()]).then(function (r) {
      var kp = r[0], kr = r[1], dek = r[2];
      return Promise.all([C.wrapDek(dek.raw, kp.wrapKey, 'wrapP'), kr ? C.wrapDek(dek.raw, kr.wrapKey, 'wrapR') : Promise.resolve(null), C.encJson(dek.key, { authKeyR: kr ? kr.authKey : null, recSalt: saltR }, 'secrets')]).then(function (w) {
        return { dek: dek, kp: kp, kr: kr, code: code, meta: { v: 3, user: C.normUser(user), display: String(user).trim().slice(0, 120), it: iterations, saltP: saltP, wrapP: w[0], saltR: saltR, wrapR: w[1], secrets: w[2], state: null, savedAt: null } };
      });
    });
  }
  function put(meta, dek, state) {
    return C.encJson(dek.key || dek, state, 'state').then(function (enc) { meta.state = enc; meta.savedAt = new Date().toISOString(); writeMeta(meta); });
  }

  /* crea la bóveda con el estado inicial (o el que había sin cifrar) y la deja abierta */
  function create(user, password, initialState, opts) {
    var problems = C.passwordProblems(password, user);
    if (problems.length && !(opts && opts.skipPolicy)) return Promise.reject(Object.assign(fail('POLITICA', problems[0]), { problems: problems }));
    var it = (opts && opts.iterations) || C.ITERATIONS;
    return buildMeta(user, password, it, opts).then(function (b) {
      return put(b.meta, b.dek, initialState).then(function () {
        mem.dek = b.dek.key; mem.user = b.meta.user; mem.password = password;
        return { recoveryCode: b.code, state: initialState, authKeyR: b.kr ? b.kr.authKey : null, recSalt: b.meta.saltR, saltP: b.meta.saltP, authKey: b.kp.authKey };
      });
    });
  }
  /* comprueba que lo cifrado se lee de vuelta ANTES de borrar la copia sin cifrar */
  function verifyReadable() { var m = readMeta(); return mem.dek && m ? C.decJson(mem.dek, m.state, 'state').then(function () { return true; }) : Promise.resolve(false); }
  function dropLegacy() { try { ls().removeItem(LEGACY); } catch (e) { /* sin almacenamiento */ } }

  function unlock(user, password) {
    var m = readMeta(); if (!m) return Promise.reject(fail('SIN_BOVEDA'));
    try { throttle(); } catch (e) { return Promise.reject(e); }
    if (C.normUser(user) !== m.user) { noteFail(); return Promise.reject(fail('CREDENCIALES', 'La comunidad o la contraseña no coinciden.')); }
    return C.deriveKeys(password, m.saltP, m.it).then(function (kp) {
      return C.unwrapDek(m.wrapP, kp.wrapKey, 'wrapP').then(function (raw) { return C.importDek(raw); }).then(function (dek) {
        return C.decJson(dek, m.state, 'state').then(function (state) { mem.dek = dek; mem.user = m.user; mem.password = password; clearFails(); return { state: state, authKey: kp.authKey, saltP: m.saltP }; });
      });
    }, function (e) { throw e; }).catch(function (e) {
      if (e && e.code) throw e;
      noteFail(); throw fail('CREDENCIALES', 'La comunidad o la contraseña no coinciden.');
    });
  }
  function save(state) {
    var current = chain.then(function () {
      var m = readMeta();
      if (!m) throw fail('SIN_BOVEDA');
      if (!mem.dek) throw fail('BLOQUEADA');
      return put(m, mem.dek, state);
    });
    /* Propaga la falla al store; recupera solo la cola para que una escritura posterior pueda reintentarse. */
    chain = current.then(function () {}, function () {});
    return current;
  }
  function lock() { mem.dek = null; mem.password = null; }
  function readState() { var m = readMeta(); return m && mem.dek ? C.decJson(mem.dek, m.state, 'state') : Promise.resolve(null); }
  function secrets() { var m = readMeta(); return m && mem.dek ? C.decJson(mem.dek, m.secrets, 'secrets') : Promise.resolve(null); }

  /* cambiar la contraseña: la clave de datos no cambia (solo se vuelve a envolver), así que no hay que recifrar nada */
  function changePassword(oldPw, newPw) {
    var m = readMeta(); if (!m || !mem.dek) return Promise.reject(fail('BLOQUEADA'));
    var problems = C.passwordProblems(newPw, m.user);
    if (problems.length) return Promise.reject(Object.assign(fail('POLITICA', problems[0]), { problems: problems }));
    return C.deriveKeys(oldPw, m.saltP, m.it).then(function (kp) { return C.unwrapDek(m.wrapP, kp.wrapKey, 'wrapP'); }).catch(function () { noteFail(); throw fail('CREDENCIALES', 'La contraseña actual no es correcta.'); }).then(function (raw) {
      var saltP = C.b64(C.rand(16));
      return C.deriveKeys(newPw, saltP, C.ITERATIONS).then(function (kn) { return C.wrapDek(raw, kn.wrapKey, 'wrapP').then(function (w) { m.saltP = saltP; m.it = C.ITERATIONS; m.wrapP = w; writeMeta(m); mem.password = newPw; return { saltP: saltP, authKey: kn.authKey }; }); });
    });
  }
  /* Prepara una recuperación sin escribir ni rotar el código vigente; el servicio remoto puede rechazarse antes del commit local. */
  function prepareRecovery(code, newPw) {
    var m = readMeta(); if (!m || !m.wrapR) return Promise.reject(fail('SIN_RECUPERACION', 'Este equipo no tiene código de recuperación. Restaura desde el Drive de la comunidad.'));
    try { throttle(); } catch (e) { return Promise.reject(e); }
    var problems = C.passwordProblems(newPw, m.user);
    if (problems.length) return Promise.reject(Object.assign(fail('POLITICA', problems[0]), { problems: problems }));
    return C.deriveKeys(C.normalizeRecovery(code), m.saltR, m.it).then(function (kr) {
      return C.unwrapDek(m.wrapR, kr.wrapKey, 'wrapR').then(function (raw) { return { raw: raw, kr: kr }; });
    }).catch(function () { noteFail(); throw fail('CODIGO', 'El código de recuperación no es correcto.'); }).then(function (r) {
      var saltP = C.b64(C.rand(16)), saltR2 = C.b64(C.rand(16)), code2 = C.newRecoveryCode();
      return Promise.all([C.deriveKeys(newPw, saltP, C.ITERATIONS), C.deriveKeys(C.normalizeRecovery(code2), saltR2, C.ITERATIONS), C.importDek(r.raw)]).then(function (k) {
        return Promise.all([C.wrapDek(r.raw, k[0].wrapKey, 'wrapP'), C.wrapDek(r.raw, k[1].wrapKey, 'wrapR'), C.encJson(k[2], { authKeyR: k[1].authKey, recSalt: saltR2 }, 'secrets')]).then(function (w) {
          var nextMeta = Object.assign({}, m, { saltP: saltP, it: C.ITERATIONS, wrapP: w[0], saltR: saltR2, wrapR: w[1], secrets: w[2] });
          return C.decJson(k[2], m.state, 'state').then(function (state) {
            return { meta: nextMeta, dek: k[2], user: m.user, password: newPw,
              result: { state: state, recoveryCode: code2, authKeyR: r.kr.authKey, authKeyR2: k[1].authKey, recSalt2: saltR2, saltP: saltP, authKey: k[0].authKey } };
          });
        });
      });
    });
  }
  function commitRecovery(prepared) {
    if (!prepared || !prepared.meta || !prepared.dek || !prepared.result) return Promise.reject(fail('RECUPERACION_INVALIDA'));
    try { writeMeta(prepared.meta); } catch (e) { return Promise.reject(e); }
    mem.dek = prepared.dek; mem.user = prepared.user; mem.password = prepared.password; clearFails();
    return Promise.resolve(prepared.result);
  }
  /* «Olvidé mi contraseña»: API compatible que prepara y confirma localmente en una sola operación. */
  function recover(code, newPw) { return prepareRecovery(code, newPw).then(commitRecovery); }

  /* fotos y archivos: se cifran antes de entrar a IndexedDB */
  function encryptBlob(blob) {
    if (!mem.dek) return Promise.resolve(blob);
    return blob.arrayBuffer().then(function (buf) { return C.encBytes(mem.dek, buf, 'blob'); }).then(function (e) { return { enc: 1, iv: e.iv, ct: e.ct, type: blob.type || '', size: blob.size }; });
  }
  function decryptBlob(rec) {
    if (!rec || !rec.enc) return Promise.resolve(rec || null);
    if (!mem.dek) return Promise.reject(fail('BLOQUEADA'));
    return C.decBytes(mem.dek, rec.iv, rec.ct, 'blob').then(function (bytes) { return new Blob([bytes], { type: rec.type || '' }); });
  }
  function wipe() { lock(); try { ls().removeItem(KEY); ls().removeItem(FAILS); } catch (e) { /* sin almacenamiento */ } }

  RF.vault = { KEY: KEY, status: status, meta: readMeta, legacyState: legacyState, create: create, verifyReadable: verifyReadable, dropLegacy: dropLegacy, unlock: unlock, save: save, lock: lock, secrets: secrets, readState: readState,
    changePassword: changePassword, prepareRecovery: prepareRecovery, commitRecovery: commitRecovery, recover: recover, encryptBlob: encryptBlob, decryptBlob: decryptBlob, wipe: wipe, isOpen: function () { return !!mem.dek; }, password: function () { return mem.password; }, user: function () { return mem.user; } };
})(typeof window !== 'undefined' ? window : globalThis);
