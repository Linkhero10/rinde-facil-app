/* Rinde Fácil — sesión de la comunidad: contraseña al iniciar, bloqueo por inactividad y sesión con el servicio (token que vence).
 *
 * Una sola contraseña abre dos cosas: los datos de este equipo (bóveda cifrada) y, si hay servicio conectado, la sesión con él.
 * El token del servicio vive solo en memoria: al recargar la página se pide la contraseña otra vez. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var C = RF.crypto, V = RF.vault;
  var S = { token: null, exp: 0, inflight: null, timer: null, last: Date.now(), listeners: [], started: false, insecure: false };
  var pendingLocalPasswordChange = null;
  var PUBLIC = { ping: 1, challenge: 1, setup: 1, login: 1, resetPassword: 1 };

  function emit() { S.listeners.slice().forEach(function (f) { try { f(phase()); } catch (e) { /* un aviso que falla no debe frenar a los demás */ } }); }
  /* un servicio falso podría pedir pocas vueltas de PBKDF2 para adivinar la contraseña sin conexión: se exige el mínimo de la app */
  function checkChallenge(ch) {
    if (!ch || !ch.exists) return;
    if (!(Number(ch.it) >= C.ITERATIONS) || typeof ch.saltP !== 'string' || ch.saltP.length < 16) throw Object.assign(new Error('El servicio propone una protección más débil de la permitida. No se envió nada.'), { code: 'SERVICIO_DEBIL' });
  }
  function phase() { if (S.insecure) return 'insecure'; return V.status(); } /* none | legacy | locked | open */
  function onChange(f) { S.listeners.push(f); }
  function cfg() { return RF.store.get().cloud || {}; }
  function idleMs() { var m = Number((RF.store.get().ui || {}).idleMinutes); return (isFinite(m) && m >= 1 ? m : 15) * 60000; }

  function init() {
    RF.store.useVault();
    if (!C.available()) S.insecure = true;
    return Promise.resolve(phase());
  }

  /* ---------- abrir, crear, cerrar ---------- */
  function afterOpen(state, quiet) {
    S.reason = '';
    RF.store.attach(state, V.save);
    touch(); startIdle();
    if (RF.blobs && RF.blobs.encryptAll) RF.blobs.encryptAll().catch(function () { /* las fotos se cifran de a poco */ });
    if (!quiet) emit();
  }
  /* primera vez: crea la cuenta; si había datos sin cifrar de la versión anterior, los protege con la contraseña nueva */
  function createAccount(user, password, opts) {
    var legacy = V.legacyState(), initial = legacy || RF.store.defaults();
    initial.community = Object.assign({}, initial.community || {}, { name: (initial.community && initial.community.name) || user });
    return V.create(user, password, initial, opts).then(function (r) {
      var next = legacy ? V.verifyReadable().then(function (ok) { if (!ok) throw new Error('No se pudo comprobar la copia cifrada; no se borró nada.'); V.dropLegacy(); }) : Promise.resolve();
      return next.then(function () { afterOpen(r.state, true); return { recoveryCode: r.recoveryCode, migrated: !!legacy }; });
    });
  }
  function unlock(user, password) { return V.unlock(user, password).then(function (r) { afterOpen(r.state); return r; }); }
  function recover(code, newPassword) {
    /* No prepares la recuperación desde una instantánea cifrada anterior a los últimos cambios.
       En especial, la URL del servicio debe sobrevivir para volver a comprobar su confianza. */
    var saved = RF.store && RF.store.flush ? RF.store.flush() : Promise.resolve();
    return saved.then(function () { return V.prepareRecovery(code, newPassword); }).then(function (prepared) {
      function commit(serverReset, response, accountMissing, serviceTrustBlocked) {
        return V.commitRecovery(prepared).then(function (r) {
          afterOpen(r.state, true);
          if (response) { setToken(response); keepDevice(response); }
          r.serverReset = serverReset;
          r.serverAccountMissing = !!accountMissing;
          r.serviceTrustBlocked = !!serviceTrustBlocked;
          return r;
        }).catch(function (e) {
          if (response) {
            e.code = 'LOCAL_RECOVERY_COMMIT_FAILED_AFTER_REMOTE';
            e.recoveryCode = prepared.result.recoveryCode;
            e.message = 'El servicio sí cambió la cuenta, pero este equipo no pudo guardar la nueva bóveda. No cierres ni recargues esta sesión. Código nuevo: ' + e.recoveryCode + '. Detalle: ' + (e.message || e);
          }
          throw e;
        });
      }
      /* Al estar bloqueada, store.get() devuelve valores vacíos. La URL del servicio no es secreta:
         obténla del estado que acaba de descifrarse y vuelve a validar su confianza antes de enviar nada. */
      var recoveredState = prepared.result && prepared.result.state || {};
      var remoteUrl = String(recoveredState.cloud && recoveredState.cloud.apiUrl || '').trim();
      var hasRemoteUrl = !!remoteUrl;
      var remoteTrusted = hasRemoteUrl && RF.cloud.trustedUrl(remoteUrl);
      if (!remoteTrusted) return commit(null, null, false, hasRemoteUrl);
      /* No consumas el código local hasta que el servicio confirme el restablecimiento. */
      return RF.cloud.postRawTo(remoteUrl, 'challenge', {}).then(function (ch) {
        if (!ch || !ch.ok) throw Object.assign(new Error('El servicio no respondió. La bóveda local no cambió y el código de recuperación sigue vigente.'), { code: 'SERVICIO' });
        if (!ch.exists) return commit(null, null, true);
        checkChallenge(ch);
        return RF.cloud.postRawTo(remoteUrl, 'resetPassword', { user: prepared.user, authKeyR: prepared.result.authKeyR, saltP: prepared.result.saltP, authKey: prepared.result.authKey, recSalt: prepared.result.recSalt2, authKeyR2: prepared.result.authKeyR2 }).then(function (x) {
          if (!x || x.ok !== true) throw Object.assign(new Error('El servicio rechazó el restablecimiento (' + ((x && x.error) || 'sin confirmación') + '). La bóveda local no cambió y el código de recuperación sigue vigente.'), { code: (x && x.error) || 'RESTABLECIMIENTO_RECHAZADO' });
          return commit(true, x, false);
        });
      });
    });
  }
  /* al bloquear no debe quedar nada de la comunidad a la vista: avisos, diálogos abiertos (además dejarían inerte la pantalla de acceso) ni fotos ampliadas */
  function scrub() {
    var d = root.document; if (!d) return;
    Array.prototype.slice.call(d.querySelectorAll('dialog')).forEach(function (x) { try { if (x.close) x.close(); } catch (e) { /* ya cerrado */ } if (x.parentNode) x.parentNode.removeChild(x); });
    var t = d.getElementById('toasts'); if (t) t.textContent = '';
    Array.prototype.slice.call(d.querySelectorAll('.busy')).forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
    /* La vista previa de impresión contiene un documento completo en un iframe; debe desaparecer al bloquear. */
    Array.prototype.slice.call(d.querySelectorAll('.print-overlay')).forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
    Array.prototype.slice.call(d.querySelectorAll('img[src^="blob:"]')).forEach(function (i) { try { root.URL.revokeObjectURL(i.src); } catch (e) { /* nada */ } i.removeAttribute('src'); });
  }
  function lock(reason) {
    if (!V.isOpen()) return Promise.resolve();
    stopIdle();
    return RF.store.flush().then(function () { V.lock(); RF.store.detach(); S.token = null; S.exp = 0; S.reason = reason || ''; scrub(); emit(); }, function (e) {
      /* No se cierra la bóveda si eso descartaría cambios que no alcanzaron a guardarse. */
      startIdle();
      throw e;
    });
  }
  function wipeDevice() { stopIdle(); V.wipe(); RF.store.detach(); S.token = null; scrub(); return (RF.blobs && RF.blobs.clearAll ? RF.blobs.clearAll() : Promise.resolve()).then(function () { emit(); }); }

  /* ---------- inactividad ---------- */
  function touch() { S.last = Date.now(); }
  function startIdle() {
    if (S.timer) return;
    if (!S.started && root.document) {
      ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) { root.document.addEventListener(ev, touch, { passive: true, capture: true }); });
      S.started = true;
    }
    S.timer = setInterval(function () { if (V.isOpen() && Date.now() - S.last > idleMs()) lock('inactividad').catch(function () { /* el aviso persistente explica por qué no se bloqueó la sesión */ }); }, 10000);
  }
  function stopIdle() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }

  /* ---------- sesión con el servicio ---------- */
  function token() { return S.token && S.exp > Date.now() + 30000 ? S.token : null; }
  /* credencial de equipo: permite entrar aunque un desconocido haya agotado los intentos; vive solo en los datos cifrados de este equipo */
  function deviceKey() { return cfg().device || ''; }
  function keepDevice(r) { if (r && typeof r.device === 'string' && /^[0-9a-f]{64}$/.test(r.device)) RF.store.update(function (s) { s.cloud.device = r.device; }, { silent: true }); }
  function setToken(r) { S.token = r.token; S.exp = r.exp || (Date.now() + 11 * 3600000); }
  function needsSession(action) { return !PUBLIC[action]; }

  function loginFailureMessage(r) {
    var code = r && r.error;
    if (code === 'BLOQUEADO') {
      return 'Pausa de seguridad: faltan ' + RF.util.waitText(Number(r.retryAfter) || 60) + '. Intentos disponibles ahora: 0.';
    }
    if (code === 'CREDENCIALES_INVALIDAS') {
      var message = 'El nombre o la contraseña de la comunidad no coinciden.';
      var remaining = Number(r.attemptsRemaining), limit = Number(r.attemptsLimit);
      if (Number.isInteger(remaining) && remaining >= 0) {
        message += remaining === 1 ? ' Te queda 1 intento' : ' Te quedan ' + remaining + ' intentos';
        if (Number.isInteger(limit) && limit > 0) message += ' (de ' + limit + ')';
        message += '.';
      }
      return message;
    }
    return 'No se pudo iniciar sesión (' + (code || 'ERROR') + ').';
  }

  /* inicia sesión con el servicio usando la contraseña que ya se escribió al abrir la app */
  function serverLogin(passwordOverride) {
    var pw = passwordOverride || V.password(), user = V.user();
    if (!pw) return Promise.reject(Object.assign(new Error('Bloqueada'), { code: 'BLOQUEADA' }));
    return RF.cloud.postRaw('challenge', {}).then(function (ch) {
      if (!ch || !ch.ok) throw Object.assign(new Error('El servicio no respondió bien.'), { code: 'SERVICIO' });
      if (!ch.exists) throw Object.assign(new Error('El servicio todavía no tiene cuenta.'), { code: 'SIN_CUENTA' });
      checkChallenge(ch);
      return C.deriveKeys(pw, ch.saltP, ch.it).then(function (k) { return RF.cloud.postRaw('login', { user: user, authKey: k.authKey, device: deviceKey() || undefined, wantDevice: !deviceKey() }); });
    }).then(function (r) {
      if (r && r.ok) { setToken(r); keepDevice(r); return r.token; }
      var code = (r && r.error) || 'ERROR';
      throw Object.assign(new Error(loginFailureMessage(r)), { code: code === 'CREDENCIALES_INVALIDAS' ? 'CLAVE_DISTINTA' : code, retryAfter: r && r.retryAfter, attemptsRemaining: r && r.attemptsRemaining, attemptsLimit: r && r.attemptsLimit });
    });
  }
  function ensureSession() {
    var t = token(); if (t) return Promise.resolve(t);
    if (!S.inflight) S.inflight = serverLogin().then(function (x) { S.inflight = null; return x; }, function (e) { S.inflight = null; throw e; });
    return S.inflight;
  }
  function dropToken() { S.token = null; S.exp = 0; }

  /* crear la cuenta en el servicio (una vez): pide el código de instalación que puso quien lo desplegó */
  function serverSetup(setupCode) {
    var m = V.meta(), pw = V.password(); if (!pw || !m) return Promise.reject(Object.assign(new Error('Bloqueada'), { code: 'BLOQUEADA' }));
    return Promise.all([V.secrets(), RF.cloud.postRaw('challenge', {})]).then(function (r) {
      var sec = r[0] || {}, ch = r[1];
      if (ch && ch.exists) throw Object.assign(new Error('El servicio ya tiene una cuenta. Inicia sesión con su contraseña.'), { code: 'CUENTA_EXISTENTE' });
      if (!sec.authKeyR) throw Object.assign(new Error('Este equipo no tiene código de recuperación para crear la cuenta del servicio.'), { code: 'SIN_RECUPERACION' });
      return C.deriveKeys(pw, m.saltP, m.it).then(function (k) {
        return RF.cloud.postRaw('setup', { setupCode: setupCode, user: m.user, saltP: m.saltP, authKey: k.authKey, recSalt: sec.recSalt, authKeyR: sec.authKeyR });
      });
    }).then(function (r) {
      if (r && r.ok) { setToken(r); keepDevice(r); return true; }
      throw Object.assign(new Error(r && r.error === 'CODIGO_INVALIDO' ? 'El código de instalación no es correcto.' : r && r.error === 'BLOQUEADO' ? 'Demasiados intentos. Espera un rato.' : 'No se pudo crear la cuenta (' + ((r && r.error) || 'error') + ').'), { code: r && r.error });
    });
  }
  /* equipo nuevo: entra con la dirección del servicio y la contraseña, trae los datos y crea la bóveda de este equipo */
  function connectDevice(url, user, password) {
    var problems = C.passwordProblems(password, user);
    return RF.cloud.postRawTo(url, 'challenge', {}).then(function (ch) {
      if (!ch || !ch.exists) throw Object.assign(new Error('Ese servicio todavía no tiene una cuenta creada.'), { code: 'SIN_CUENTA' });
      checkChallenge(ch);
      return C.deriveKeys(password, ch.saltP, ch.it).then(function (k) { return RF.cloud.postRawTo(url, 'login', { user: user, authKey: k.authKey, wantDevice: true }); });
    }).then(function (r) {
      if (!r || !r.ok) throw Object.assign(new Error(loginFailureMessage(r)), { code: r && r.error, retryAfter: r && r.retryAfter, attemptsRemaining: r && r.attemptsRemaining, attemptsLimit: r && r.attemptsLimit });
      setToken(r);
      return RF.cloud.postRawTo(url, 'loadState', { t: r.token }).then(function (st) {
        var state = st && st.ok ? RF.util.safeParse(st.state) : RF.store.defaults();
        state.cloud = Object.assign({}, state.cloud || {}, { apiUrl: url }); delete state.cloud.device; if (typeof r.device === 'string' && /^[0-9a-f]{64}$/.test(r.device)) state.cloud.device = r.device; state.community = Object.assign({}, state.community || {}, { name: (state.community && state.community.name) || user });
        return V.create(user, password, state, { noRecovery: true, skipPolicy: !problems.length ? false : true }).then(function () { afterOpen(state); return { rev: st && st.rev }; });
      });
    });
  }
  function serverChangePassword(oldPw, newPw) {
    return RF.cloud.postRaw('challenge', {}).then(function (ch) {
      if (!ch || !ch.exists) return null;
      checkChallenge(ch);
      return C.deriveKeys(oldPw, ch.saltP, ch.it).then(function (ko) {
        var saltP = C.b64(C.rand(16));
        return C.deriveKeys(newPw, saltP, C.ITERATIONS).then(function (kn) {
          return ensureSession().then(function (t) { return RF.cloud.postRaw('changePassword', { t: t, authKeyOld: ko.authKey, saltP: saltP, authKey: kn.authKey }); });
        });
      });
    }).then(function (r) { if (r && !r.ok) throw Object.assign(new Error('El servicio no aceptó el cambio (' + r.error + ').'), { code: r.error }); return r; });
  }
  /* Evita que una falla de red deje la bóveda local usando una clave que el servicio no aceptó. */
  function changePassword(oldPw, newPw) {
    /* Serializa primero los cambios pendientes del estado cifrado. Si el KDF y el guardado
       escriben metadata a la vez, uno puede pisar el otro y perder, por ejemplo, la URL. */
    var saved = RF.store && RF.store.flush ? RF.store.flush() : Promise.resolve();
    if (pendingLocalPasswordChange) {
      if (pendingLocalPasswordChange.oldPw !== oldPw || pendingLocalPasswordChange.newPw !== newPw) return Promise.reject(Object.assign(new Error('El servicio ya cambió la contraseña, pero falta guardarla en este equipo. Repite los mismos valores para completar ese paso.'), { code: 'CAMBIO_LOCAL_PENDIENTE' }));
      return saved.then(function () { return V.changePassword(oldPw, newPw); }).then(function (local) {
        pendingLocalPasswordChange = null;
        return Object.assign({}, local, { remoteConfigured: true, remoteChanged: true, remoteAccountMissing: false });
      });
    }
    return saved.then(function () {
      var configured = RF.cloud.configured();
      var trustBlocked = !!cfg().apiUrl && !configured;
      var remote = configured ? serverChangePassword(oldPw, newPw).then(function (r) {
        return { configured: true, changed: !!(r && r.ok), accountMissing: !r };
      }) : Promise.resolve({ configured: false, changed: false, accountMissing: false, trustBlocked: trustBlocked });
      return remote.then(function (status) {
        return V.changePassword(oldPw, newPw).then(function (local) {
          return Object.assign({}, local, { remoteConfigured: status.configured, remoteChanged: status.changed, remoteAccountMissing: status.accountMissing, remoteTrustBlocked: !!status.trustBlocked });
        }, function (e) {
          if (status.changed) {
            pendingLocalPasswordChange = { oldPw: oldPw, newPw: newPw };
            e.remoteChanged = true;
            e.code = 'LOCAL_CHANGE_FAILED_AFTER_REMOTE';
            e.message = 'El servicio sí cambió la contraseña, pero este equipo no pudo guardar la nueva. No cierres ni recargues esta sesión; vuelve a intentar el cambio local. Detalle: ' + (e.message || e);
          }
          throw e;
        });
      });
    });
  }
  function logoutServer(all) {
    var t = token();
    if (!t) return all ? Promise.reject(Object.assign(new Error('No hay una sesión activa para cerrar desde este equipo.'), { code: 'SIN_SESION' })) : Promise.resolve({ ok: true, skipped: true });
    return RF.cloud.postRaw(all ? 'logoutAll' : 'logout', { t: t }).then(function (r) {
      if (!r || r.ok !== true) throw Object.assign(new Error('El servicio no confirmó el cierre de las sesiones.'), { code: (r && r.error) || 'CIERRE_NO_CONFIRMADO' });
      if (all) { dropToken(); RF.store.update(function (s) { delete s.cloud.device; }, { silent: true }); }
      return r;
    });
  }

  RF.auth = { reason: function () { return S.reason || ''; }, init: init, phase: phase, onChange: onChange, createAccount: createAccount, unlock: unlock, recover: recover, lock: lock, wipeDevice: wipeDevice, touch: touch,
    token: token, needsSession: needsSession, ensureSession: ensureSession, dropToken: dropToken, serverLogin: serverLogin, serverSetup: serverSetup, connectDevice: connectDevice,
    serverChangePassword: serverChangePassword, changePassword: changePassword, logoutServer: logoutServer, setToken: setToken };
})(typeof window !== 'undefined' ? window : globalThis);
