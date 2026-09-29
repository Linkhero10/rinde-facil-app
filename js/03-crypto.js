/* Rinde Fácil — criptografía del navegador (Web Crypto). Sin librerías de terceros.
 *
 * De la contraseña de la comunidad salen DOS cosas independientes (PBKDF2-SHA256, 600.000 vueltas, y luego HKDF con etiquetas distintas):
 *   · «clave de acceso» (authKey): es lo único que viaja al servicio, y solo para iniciar sesión. El servidor guarda un HMAC de ella.
 *   · «clave de envoltura» (wrapKey): nunca sale del dispositivo; abre la clave de datos (DEK) que cifra todo lo guardado aquí.
 * Los datos y las fotos se cifran con AES-GCM de 256 bits (IV aleatorio por mensaje y datos asociados que impiden mover un bloque a otro lugar).
 * La contraseña no se guarda en ningún lado. Si se pierde, se recupera con el código de recuperación (se muestra una sola vez). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var subtle = root.crypto && root.crypto.subtle;
  var TE = new TextEncoder(), TD = new TextDecoder();
  var ITERATIONS = 600000;
  var CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function need() { if (!subtle) throw new Error('Este navegador no permite cifrar. Abre Rinde Fácil desde una dirección https.'); }
  function b64(bytes) { var s = '', a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
  function ub64(str) { var s = atob(str), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function rand(n) { var a = new Uint8Array(n); root.crypto.getRandomValues(a); return a; }

  /* mismo criterio que el servidor: sin tildes, en minúsculas y con espacios simples */
  function normUser(s) {
    var t = String(s == null ? '' : s).normalize('NFD'), o = '';
    for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); if (c < 0x300 || c > 0x36f) o += t.charAt(i); }
    return o.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function pbkdf2(secret, salt, iterations) {
    need();
    return subtle.importKey('raw', TE.encode(String(secret).normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) { return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations || ITERATIONS }, k, 256); });
  }
  function hkdf(master, label) {
    return subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']).then(function (k) {
      return subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: TE.encode(label) }, k, 256);
    });
  }
  /* → { authKey: base64 (para el servidor), wrapKey: CryptoKey (se queda aquí) } */
  function deriveKeys(secret, saltB64, iterations) {
    return pbkdf2(secret, ub64(saltB64), iterations).then(function (master) {
      return Promise.all([hkdf(master, 'rinde-facil/auth/v1'), hkdf(master, 'rinde-facil/wrap/v1')]);
    }).then(function (r) {
      return subtle.importKey('raw', r[1], 'AES-GCM', false, ['encrypt', 'decrypt']).then(function (wk) { return { authKey: b64(r[0]), wrapKey: wk }; });
    });
  }

  function newDek() {
    var raw = rand(32);
    return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']).then(function (key) { return { raw: raw, key: key }; });
  }
  function importDek(raw) { return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  function aesEnc(key, bytes, aad) {
    var iv = rand(12);
    return subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: TE.encode(aad || '') }, key, bytes).then(function (ct) { return { iv: iv, ct: new Uint8Array(ct) }; });
  }
  function aesDec(key, iv, ct, aad) { return subtle.decrypt({ name: 'AES-GCM', iv: iv, additionalData: TE.encode(aad || '') }, key, ct); }

  /* envolver / abrir la clave de datos */
  function wrapDek(dekRaw, wrapKey, aad) { return aesEnc(wrapKey, dekRaw, aad).then(function (e) { return { iv: b64(e.iv), ct: b64(e.ct) }; }); }
  function unwrapDek(w, wrapKey, aad) { return aesDec(wrapKey, ub64(w.iv), ub64(w.ct), aad).then(function (b) { return new Uint8Array(b); }); }
  /* cifrar / descifrar texto y objetos */
  function encJson(dek, obj, aad) { return aesEnc(dek, TE.encode(JSON.stringify(obj)), aad).then(function (e) { return { iv: b64(e.iv), ct: b64(e.ct) }; }); }
  function decJson(dek, blob, aad) { return aesDec(dek, ub64(blob.iv), ub64(blob.ct), aad).then(function (b) { return JSON.parse(TD.decode(b)); }); }
  /* cifrar / descifrar bytes (fotos) */
  function encBytes(dek, buf, aad) { return aesEnc(dek, new Uint8Array(buf), aad); }
  function decBytes(dek, iv, ct, aad) { return aesDec(dek, iv, ct, aad).then(function (b) { return new Uint8Array(b); }); }

  /* código de recuperación: 128 bits en base 32 (Crockford), 26 caracteres en grupos de 5 */
  function newRecoveryCode() {
    var bytes = rand(16), bits = '', out = '', i;
    for (i = 0; i < bytes.length; i++) bits += ('00000000' + bytes[i].toString(2)).slice(-8);
    bits += '00'; // 128 → 130 bits = 26 símbolos
    for (i = 0; i < bits.length; i += 5) out += CROCKFORD.charAt(parseInt(bits.slice(i, i + 5), 2));
    return out.match(/.{1,5}/g).join('-');
  }
  function normalizeRecovery(s) {
    return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  }

  /* contraseña: largo y lo más común; se prefieren frases largas a claves «raras» */
  var COMMON = ['contrasena', 'contraseña', 'password', 'passw0rd', '1234567890', '12345678910', 'qwertyuiop', 'asdfghjkl', 'comunidad', 'atacama', 'atacameno', 'atacameña', 'chile2026', 'chile2025', 'corfo', 'rindefacil', 'rinde facil', 'novandina', 'lickanantay', 'sanpedro', 'sanpedrodeatacama', '0123456789', 'abcdefghij', 'iloveyou', 'bienvenido', 'bienvenida', 'administrador', 'tesorero', 'tesorera', 'presidente', 'presidenta'];
  function passwordProblems(pw, community) {
    var out = [], p = String(pw || ''), n = normUser(p).replace(/[^a-z0-9]/g, ''), c = normUser(community || '').replace(/[^a-z0-9]/g, '');
    if (p.length < 10) out.push('Usa al menos 10 caracteres. Una frase corta de 3 o 4 palabras sirve y es fácil de recordar.');
    if (/^(.)\1+$/.test(p)) out.push('No uses el mismo carácter repetido.');
    if (COMMON.some(function (w) { return n.indexOf(normUser(w).replace(/[^a-z0-9]/g, '')) >= 0 && n.length <= normUser(w).length + 4; })) out.push('Es una contraseña muy común. Elige otra.');
    if (c && n.indexOf(c) >= 0 && n.length <= c.length + 4) out.push('No uses solo el nombre de la comunidad.');
    if (/^[0-9]+$/.test(p) || /^[a-zA-Z]+$/.test(p) && p.length < 14 && !/\s/.test(p)) out.push('Mezcla palabras, números o espacios (por ejemplo, tres palabras con un número).');
    return out;
  }

  RF.crypto = { ITERATIONS: ITERATIONS, available: function () { return !!subtle; }, b64: b64, ub64: ub64, rand: rand, normUser: normUser, deriveKeys: deriveKeys, newDek: newDek, importDek: importDek,
    wrapDek: wrapDek, unwrapDek: unwrapDek, encJson: encJson, decJson: decJson, encBytes: encBytes, decBytes: decBytes, newRecoveryCode: newRecoveryCode, normalizeRecovery: normalizeRecovery, passwordProblems: passwordProblems };
})(typeof window !== 'undefined' ? window : globalThis);
