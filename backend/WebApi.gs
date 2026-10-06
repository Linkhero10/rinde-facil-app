/**
 * Rinde Fácil — servicio web de la comunidad (Google Apps Script).
 *
 * Qué hace:
 *   - ocr:        lee una foto o PDF de un comprobante con Google Cloud Vision (usa CloudOcrAdapter.gs).
 *                 NO guarda la imagen ni el texto leído: solo los devuelve a la app.
 *   - setup:      deja armada en el Drive la carpeta «Rinde fácil» con su orden (ver más abajo).
 *   - saveFile:   archiva en esa carpeta lo que la app genera o recibe: comprobantes, Carta Gantt, anexos, rendición…
 *                 Es idempotente y NUNCA borra ni pisa: si el archivo cambió, guarda una versión nueva con fecha y hora en el nombre.
 *   - saveState / loadState: copia de todos los datos de la app (con 5 respaldos).
 *
 * Orden de la carpeta en el Drive de la comunidad:
 *   Rinde fácil/
 *     LEEME.txt
 *     Documentos oficiales/<tipo>/       (PEA corregido, actas de no objeción, resoluciones, oficios…; lo que llega de afuera)
 *     Actas de mesas de trabajo/AAAA-MM/ (CORFO, comunidad y Organismo Colaborador)
 *     Copias de seguridad/
 *     Proyectos/
 *       <Nombre del proyecto>/
 *         1 Planificación            (Carta Gantt, presupuesto, reitemización, cotizaciones, PEA)
 *         2 Anexos y formularios     (Anexos 1 a 6, informes)
 *         3 Rendición                (rendición de gastos, carpeta de respaldos, resumen por cuentas)
 *         4 Comprobantes/AAAA-MM     (fotos y PDF de boletas y facturas, por mes del documento)
 *
 * Seguridad (versión 3):
 *   - Se despliega "Ejecutar como: yo" en la cuenta de la comunidad. Los datos quedan en SU Drive y SU proyecto de Google Cloud.
 *   - La comunidad tiene una cuenta: usuario = nombre de la comunidad, contraseña = la que elija. La contraseña no llega aquí:
 *     la app envía una clave derivada (PBKDF2) y el servidor guarda solo un HMAC de ella. Ver la sección «cuenta de la comunidad».
 *   - Salvo ping, challenge, setup, login y resetPassword, toda solicitud exige un token de sesión (vence a las 12 horas).
 *   - Bloqueo por intentos fallidos, registro de accesos, cierre de todas las sesiones al cambiar la contraseña.
 *   - Límite diario de lecturas OCR (RINDE_FACIL_OCR_DAILY_LIMIT, por defecto 200) para no gastar cuota por error.
 *
 * Propiedades de script necesarias (Configuración del proyecto > Propiedades de la secuencia de comandos):
 *   RINDE_FACIL_SETUP_CODE          código de instalación de UN solo uso: la persona que crea la cuenta lo escribe en la app; luego se borra solo.
 *                                   (Si existe la antigua RINDE_FACIL_ACCESS_KEY y falta esta, se usa como código y también se borra.)
 *   RINDE_FACIL_GCP_PROJECT_ID      proyecto de Google Cloud con Cloud Vision habilitado (ya lo usa CloudOcrAdapter.gs)
 *   RINDE_FACIL_OCR_PROVIDER        cloud_vision
 *   RINDE_FACIL_ROOT_FOLDER_ID      (opcional) carpeta raíz en Drive; si falta, se busca o se crea «Rinde fácil»
 *   RINDE_FACIL_OCR_DAILY_LIMIT     (opcional) máximo de lecturas por día
 */

const RF_WEB = {
  version: '3.0.0',
  rootProp: 'RINDE_FACIL_ROOT_FOLDER_ID',
  limitProp: 'RINDE_FACIL_OCR_DAILY_LIMIT',
  rootName: 'Rinde fácil',
  backupsName: 'Copias de seguridad',
  projectsName: 'Proyectos',
  stateFile: 'estado-rinde-facil.json',
  maxBytes: 8 * 1024 * 1024,
  maxStateChars: 4 * 1024 * 1024,
  keepBackups: 5,
  rootCategories: { oficial: 'Documentos oficiales', acta: 'Actas de mesas de trabajo' },
  categories: { planificacion: '1 Planificación', anexos: '2 Anexos y formularios', rendicion: '3 Rendición', comprobante: '4 Comprobantes' },
  okMime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'application/pdf'],
  docMime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/msword', 'text/plain', 'text/html', 'text/csv', 'application/json']
};

function doGet() {
  // Solo confirma que el servicio existe. No entrega datos ni requiere clave.
  return rfJson_({ ok: true, service: 'rinde-facil', version: RF_WEB.version });
}

function doPost(e) {
  try {
    const raw = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
    if (!raw) return rfJson_({ ok: false, error: 'SIN_DATOS' });
    let p;
    try { p = JSON.parse(raw); } catch (err) { return rfJson_({ ok: false, error: 'JSON_INVALIDO' }); }
    if (!p || typeof p !== 'object') return rfJson_({ ok: false, error: 'JSON_INVALIDO' });
    if (typeof p.action !== 'string' || p.action.length > 40) return rfJson_({ ok: false, error: 'ACCION_DESCONOCIDA' });
    const publicActions = ['ping', 'challenge', 'setup', 'login', 'resetPassword']; // lista, no objeto: «__proto__» o «toString» no cuentan como acciones públicas
    if (publicActions.indexOf(p.action) < 0 && !rfSessionValid_(p.t)) return rfJson_({ ok: false, error: 'SESION_INVALIDA' });
    switch (p.action) {
      case 'ping': return rfJson_({ ok: true, version: RF_WEB.version, ocr: rfOcrReady_(), account: !!rfGetJson_(RF_AUTH.accountProp, null) });
      case 'challenge': return rfJson_(rfChallenge_());
      case 'setup': return rfJson_(rfSetupAccount_(p));
      case 'login': return rfJson_(rfLogin_(p));
      case 'resetPassword': return rfJson_(rfResetPassword_(p));
      case 'changePassword': return rfJson_(rfChangePassword_(p));
      case 'logout': return rfJson_(rfLogout_(p, false));
      case 'logoutAll': return rfJson_(rfLogout_(p, true));
      case 'audit': return rfJson_(rfAuditList_());
      case 'ocr': return rfJson_(rfOcr_(p));
      case 'folders': return rfJson_(rfSetup_(p));
      case 'saveState': return rfJson_(rfSaveState_(p));
      case 'loadState': return rfJson_(rfLoadState_());
      case 'saveFile': return rfJson_(rfSaveFile_(p));
      default: return rfJson_({ ok: false, error: 'ACCION_DESCONOCIDA' });
    }
  } catch (err) {
    return rfJson_({ ok: false, error: 'ERROR_INTERNO' }); // sin detalles: lo interno no se muestra a quien llama
  }
}

/* ---------- utilidades ---------- */
function rfJson_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
function rfProp_(name) {
  return String(PropertiesService.getScriptProperties().getProperty(name) || '').trim();
}
function rfSafeEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function rfOcrReady_() {
  return !!rfProp_('RINDE_FACIL_GCP_PROJECT_ID') && typeof callCloudVision_ === 'function';
}
function rfBase64Bytes_(b64) {
  const s = String(b64 || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor(s.length * 3 / 4) - pad;
}
function rfIsBase64_(s) { return typeof s === 'string' && s.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s); }
function rfToday_() { return Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd'); }
function rfCleanName_(s, fallback, max) {
  const t = String(s == null ? '' : s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, max || 80);
  return t || fallback;
}
function rfUrl_(item) { try { return item.getUrl ? item.getUrl() : ''; } catch (e) { return ''; } }

/* límite diario de lecturas */
function rfCountOcr_() {
  const props = PropertiesService.getScriptProperties();
  const key = 'RINDE_FACIL_OCR_COUNT_' + rfToday_();
  const limit = Number(rfProp_(RF_WEB.limitProp)) || 200;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: false, error: 'OCUPADO' };
  try {
    const n = Number(props.getProperty(key) || 0);
    if (n >= limit) return { ok: false, error: 'LIMITE_DIARIO', limit: limit };
    props.setProperty(key, String(n + 1));
    return { ok: true, used: n + 1, limit: limit };
  } finally { lock.releaseLock(); }
}

/* ---------- OCR ---------- */
function rfOcr_(p) {
  if (!rfOcrReady_()) return { ok: false, error: 'OCR_NO_CONFIGURADO', message: 'Falta RINDE_FACIL_GCP_PROJECT_ID o CloudOcrAdapter.gs.' };
  if (RF_WEB.okMime.indexOf(String(p.mimeType || '').toLowerCase()) < 0) return { ok: false, error: 'TIPO_NO_PERMITIDO' };
  if (!rfIsBase64_(p.base64)) return { ok: false, error: 'BASE64_INVALIDO' };
  if (rfBase64Bytes_(p.base64) > RF_WEB.maxBytes) return { ok: false, error: 'ARCHIVO_MUY_GRANDE' };
  const cnt = rfCountOcr_();
  if (!cnt.ok) return cnt;
  const bytes = Utilities.base64Decode(p.base64);
  const blob = Utilities.newBlob(bytes, String(p.mimeType).toLowerCase(), String(p.fileName || 'comprobante').slice(0, 120));
  const r = callCloudVision_(blob, { file_name: String(p.fileName || '').slice(0, 120) });
  const ok = r && r.status === 'SUCCESS' && !!r.raw_text;
  return {
    ok: ok, engine: 'cloud_vision', raw_text: ok ? r.raw_text : '', confidence: r && r.confidence != null ? r.confidence : null,
    duration_ms: r && r.duration_ms || null, page_count: r && r.page_count || null, coverage: r && r.document_coverage || null,
    used_today: cnt.used, limit: cnt.limit,
    error: ok ? null : (r && r.error) || 'OCR_SIN_TEXTO'
  };
}

/* ---------- carpetas en el Drive ---------- */
function rfRoot_() {
  const id = rfProp_(RF_WEB.rootProp);
  if (id) return DriveApp.getFolderById(id);
  const it = DriveApp.getFoldersByName(RF_WEB.rootName);
  return it.hasNext() ? it.next() : DriveApp.createFolder(RF_WEB.rootName);
}
function rfSub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function rfReadme_(root) {
  if (root.getFilesByName('LEEME.txt').hasNext()) return;
  root.createFile('LEEME.txt', [
    'RINDE FÁCIL — cómo está ordenada esta carpeta',
    '',
    'Documentos oficiales/ Lo que llega de afuera, por tipo: PEA corregido, actas de no objeción, resoluciones, oficios, observaciones.',
    'Actas de mesas de trabajo/ Una carpeta por mes (CORFO, comunidad y Organismo Colaborador).',
    'Copias de seguridad/  Copia de todos los datos de la app (se guardan las últimas 5 versiones).',
    'Proyectos/            Una carpeta por proyecto. Adentro:',
    '   1 Planificación        Carta Gantt, presupuesto, reitemización, cotizaciones, PEA.',
    '   2 Anexos y formularios Anexos 1 a 6 e informes.',
    '   3 Rendición            Rendición de gastos, carpeta de respaldos, resumen por cuentas.',
    '   4 Comprobantes         Fotos y PDF de boletas y facturas, en una carpeta por mes del documento (AAAA-MM).',
    '',
    'La app nunca borra nada de aquí. Si un documento cambia, guarda una versión nueva con la fecha y hora en el nombre.',
    'Esta carpeta está en el Drive de tu comunidad: quien la administra decide con quién compartirla.'
  ].join('\n'), 'text/plain');
}
function rfProjectFolders_(root, projectName) {
  const projects = rfSub_(root, RF_WEB.projectsName);
  const proj = rfSub_(projects, rfCleanName_(projectName, 'Proyecto sin nombre'));
  const out = { project: proj };
  Object.keys(RF_WEB.categories).forEach(function (k) { out[k] = rfSub_(proj, RF_WEB.categories[k]); });
  return out;
}
function rfSetup_(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'OCUPADO' };
  try {
    if (!rfSessionValid_(p && p.t)) return { ok: false, error: 'SESION_INVALIDA' };
    const root = rfRoot_();
    rfSub_(root, RF_WEB.backupsName);
    Object.keys(RF_WEB.rootCategories).forEach(function (k) { rfSub_(root, RF_WEB.rootCategories[k]); });
    rfReadme_(root);
    const res = { ok: true, rootId: root.getId(), rootUrl: rfUrl_(root), rootName: root.getName ? root.getName() : RF_WEB.rootName };
    if (p && p.project) { const f = rfProjectFolders_(root, p.project); res.projectUrl = rfUrl_(f.project); res.projectName = rfCleanName_(p.project, 'Proyecto sin nombre'); }
    return res;
  } finally { lock.releaseLock(); }
}

/* ---------- copia de datos ---------- */
function rfSaveState_(p) {
  const text = typeof p.state === 'string' ? p.state : JSON.stringify(p.state || {});
  if (!text || text.length > RF_WEB.maxStateChars) return { ok: false, error: 'ESTADO_INVALIDO' };
  try { const parsed = JSON.parse(text); if (!parsed || !Array.isArray(parsed.projects)) return { ok: false, error: 'ESTADO_INVALIDO' }; } catch (e) { return { ok: false, error: 'ESTADO_INVALIDO' }; }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'OCUPADO' };
  try {
    if (!rfSessionValid_(p.t)) return { ok: false, error: 'SESION_INVALIDA' };
    /* control de versiones: si otro dispositivo guardó algo más nuevo, no se pisa; la app decide (traer lo nuevo o quedarse con lo suyo) */
    const rev = Number(rfProps_().getProperty(RF_AUTH.revProp) || 0);
    if (p.baseRev != null && Number(p.baseRev) < rev && !p.force) return { ok: false, error: 'CONFLICTO', rev: rev };
    const dir = rfSub_(rfRoot_(), RF_WEB.backupsName);
    const it = dir.getFilesByName(RF_WEB.stateFile);
    const stamp = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyyMMdd-HHmmss');
    if (it.hasNext()) { // conserva la versión anterior como respaldo
      const old = it.next();
      dir.createFile('estado-' + stamp + '.json', old.getBlob().getDataAsString(), 'application/json');
      old.setContent(text);
      rfPrune_(dir);
      rfProps_().setProperty(RF_AUTH.revProp, String(rev + 1));
      return { ok: true, savedAt: stamp, rev: rev + 1, fileId: old.getId(), url: rfUrl_(old) };
    }
    const f = dir.createFile(RF_WEB.stateFile, text, 'application/json');
    rfProps_().setProperty(RF_AUTH.revProp, String(rev + 1));
    return { ok: true, savedAt: stamp, rev: rev + 1, fileId: f.getId(), url: rfUrl_(f) };
  } finally { lock.releaseLock(); }
}
function rfPrune_(dir) {
  // Solo se mueven a la papelera respaldos automáticos antiguos de la copia de datos (nunca documentos de la comunidad).
  const files = [];
  const it = dir.getFiles();
  while (it.hasNext()) { const f = it.next(); if (/^estado-\d{8}-\d{6}\.json$/.test(f.getName())) files.push(f); }
  files.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  files.slice(RF_WEB.keepBackups).forEach(function (f) { f.setTrashed(true); });
}
function rfLoadState_() {
  const dir = rfSub_(rfRoot_(), RF_WEB.backupsName);
  const it = dir.getFilesByName(RF_WEB.stateFile);
  if (!it.hasNext()) return { ok: false, error: 'SIN_COPIA' };
  return { ok: true, state: it.next().getBlob().getDataAsString(), rev: Number(rfProps_().getProperty(RF_AUTH.revProp) || 0) };
}

/* ---------- archivar documentos ---------- */
function rfSaveFile_(p) {
  const mime = String(p.mimeType || '').toLowerCase();
  const category = String(p.category || 'comprobante');
  const isRoot = !!RF_WEB.rootCategories[category];
  if (!isRoot && !RF_WEB.categories[category]) return { ok: false, error: 'CATEGORIA_INVALIDA' };
  const allowed = category === 'comprobante' ? RF_WEB.okMime.concat(['text/plain']) : RF_WEB.okMime.concat(RF_WEB.docMime); // junto a la foto va la ficha con los datos (texto)
  if (allowed.indexOf(mime) < 0) return { ok: false, error: 'TIPO_NO_PERMITIDO' };
  if (!rfIsBase64_(p.base64)) return { ok: false, error: 'BASE64_INVALIDO' };
  if (rfBase64Bytes_(p.base64) > RF_WEB.maxBytes) return { ok: false, error: 'ARCHIVO_MUY_GRANDE' };
  let month = '';
  if (category === 'comprobante' || category === 'acta') {
    const m = String(p.issueDate || '').match(/^(\d{4})-(\d{2})/);
    if (!m || +m[2] < 1 || +m[2] > 12) return { ok: false, error: 'FECHA_INVALIDA' };
    month = m[1] + '-' + m[2];
  }
  const sub = category === 'oficial' ? rfCleanName_(p.subfolder, 'Otros', 60) : '';
  const name = rfCleanName_(p.fileName, 'documento', 120);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p.base64 + '|' + name + '|' + category + '|' + month + '|' + sub);
  const key = digest.map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'OCUPADO' };
  try {
    if (!rfSessionValid_(p.t)) return { ok: false, error: 'SESION_INVALIDA' };
    let folder, where;
    if (isRoot) {
      folder = rfSub_(rfRoot_(), RF_WEB.rootCategories[category]);
      if (sub) folder = rfSub_(folder, sub);
      if (month) folder = rfSub_(folder, month);
      where = [RF_WEB.rootCategories[category]].concat(sub ? [sub] : []).concat(month ? [month] : []).join(' / ');
    } else {
      const folders = rfProjectFolders_(rfRoot_(), p.project);
      folder = folders[category];
      if (month) folder = rfSub_(folder, month);
      where = [rfCleanName_(p.project, 'Proyecto sin nombre'), RF_WEB.categories[category]].concat(month ? [month] : []).join(' / ');
    }
    let sameName = false;
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (f.getDescription() === 'rinde-facil:' + key) return { ok: true, fileId: f.getId(), url: rfUrl_(f), folderUrl: rfUrl_(folder), where: where, folder: month || sub || RF_WEB.categories[category] || RF_WEB.rootCategories[category], idempotent: true };
      if (f.getName() === name) sameName = true;
    }
    let finalName = name;
    if (sameName) { // el contenido cambió: se guarda otra versión, la anterior se conserva
      const stamp = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyyMMdd-HHmmss');
      const dot = name.lastIndexOf('.');
      finalName = dot > 0 ? name.slice(0, dot) + ' (' + stamp + ')' + name.slice(dot) : name + ' (' + stamp + ')';
    }
    const blob = Utilities.newBlob(Utilities.base64Decode(p.base64), mime, finalName);
    const file = folder.createFile(blob);
    file.setDescription('rinde-facil:' + key);
    return { ok: true, fileId: file.getId(), url: rfUrl_(file), folderUrl: rfUrl_(folder), where: where, folder: month || sub || RF_WEB.categories[category] || RF_WEB.rootCategories[category], fileName: finalName, idempotent: false };
  } finally { lock.releaseLock(); }
}

/* ================= cuenta de la comunidad y sesiones (v3) =================
 * La comunidad tiene UNA cuenta: usuario = nombre de la comunidad, contraseña = la que ella elija.
 * La contraseña NUNCA llega a este servicio. La app la convierte en una «clave de acceso» de 256 bits con PBKDF2 (600.000 vueltas)
 * y solo esa clave viaja; aquí se guarda únicamente un HMAC de ella con un secreto del servidor (pimienta).
 * Con la clave correcta se entrega un token de sesión aleatorio que vence a las 12 horas; el servidor guarda solo su hash.
 * Defensas: bloqueo progresivo de acceso (5 fallos iniciales, luego 3; pausa de 1, 2, 5, 10, 20 y hasta 30 min), comparaciones en tiempo constante,
 * mismo mensaje para usuario o clave incorrectos, registro de accesos y cierre de todas las sesiones al cambiar la contraseña.
 */
const RF_AUTH = {
  accountProp: 'RF_ACCOUNT', pepperProp: 'RF_PEPPER', sessPrefix: 'RF_SESS_', lockProp: 'RF_LOCK', changeLockPrefix: 'RF_CHANGELOCK_', recLockProp: 'RF_RECLOCK', setupLockProp: 'RF_SETUPLOCK',
  auditProp: 'RF_AUDIT', revProp: 'RF_STATE_REV', setupCodeProp: 'RINDE_FACIL_SETUP_CODE',
  iterations: 600000, sessionMs: 12 * 3600 * 1000, maxSessions: 20, maxFails: 5, lockBaseMs: 15 * 60 * 1000, lockMaxMs: 24 * 3600 * 1000,
  loginPolicyVersion: 2, loginInitialFails: 5, loginSubsequentFails: 3, loginLockMs: [60000, 120000, 300000, 600000, 1200000, 1800000], auditKeep: 80
};

function rfNow_() { return Date.now(); }
function rfProps_() { return PropertiesService.getScriptProperties(); }
function rfGetJson_(name, dflt) { const v = rfProps_().getProperty(name); if (!v) return dflt; try { return JSON.parse(v); } catch (e) { return dflt; } }
function rfSetJson_(name, obj) { rfProps_().setProperty(name, JSON.stringify(obj)); }
function rfWithLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'OCUPADO' };
  try { return fn(); } finally { lock.releaseLock(); }
}
function rfPepper_() {
  let p = rfProps_().getProperty(RF_AUTH.pepperProp);
  if (!p) { p = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); rfProps_().setProperty(RF_AUTH.pepperProp, p); }
  return p;
}
function rfHash_(secret) { return Utilities.base64Encode(Utilities.computeHmacSha256Signature(String(secret), rfPepper_())); }
function rfIsB64Field_(s, min, max) { return typeof s === 'string' && s.length >= min && s.length <= max && /^[A-Za-z0-9+/]+={0,2}$/.test(s); }
function rfNormUser_(s) {
  // minúsculas, sin tildes y con espacios simples: «Comunidad Atacameña de Machuca» y «comunidad atacamena  de machuca» son la misma cuenta
  const t = String(s == null ? '' : s).normalize('NFD');
  let o = '';
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (c < 0x300 || c > 0x36f) o += t.charAt(i); }
  return o.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
}

/* ---- bloqueo por intentos ---- */
function rfLockStatus_(prop) {
  const s = rfGetJson_(prop, { fails: 0, lockUntil: 0 });
  const now = rfNow_();
  return s.lockUntil > now ? { locked: true, retryAfter: Math.ceil((s.lockUntil - now) / 1000) } : { locked: false };
}
function rfRegisterFail_(prop, baseMs) {
  const s = rfGetJson_(prop, { fails: 0, lockUntil: 0 });
  s.fails += 1;
  if (s.fails % RF_AUTH.maxFails === 0) {
    const mult = Math.pow(2, Math.floor(s.fails / RF_AUTH.maxFails) - 1);
    s.lockUntil = rfNow_() + Math.min(baseMs * mult, RF_AUTH.lockMaxMs);
  }
  rfSetJson_(prop, s);
}
function rfClearFails_(prop) { rfProps_().deleteProperty(prop); }

/* El acceso a la cuenta usa una escala corta y legible, separada de setup/cambio de clave. */
function rfLoginLockDuration_(lockouts) {
  const i = Math.max(0, Math.min(Math.floor(Number(lockouts) || 0), RF_AUTH.loginLockMs.length - 1));
  return RF_AUTH.loginLockMs[i];
}
function rfLoginLockStatus_(prop) {
  const now = rfNow_();
  let s = rfGetJson_(prop, { fails: 0, lockUntil: 0, lockouts: 0, loginPolicyVersion: RF_AUTH.loginPolicyVersion });
  if (!s || typeof s !== 'object' || Array.isArray(s)) s = { fails: 0, lockUntil: 0, lockouts: 0, loginPolicyVersion: RF_AUTH.loginPolicyVersion };
  if (s.loginPolicyVersion !== RF_AUTH.loginPolicyVersion) {
    // Conserva la intensidad histórica, pero acorta un bloqueo anterior según la escala nueva.
    const legacyFails = Math.max(0, Math.floor(Number(s.fails) || 0));
    let lockouts = Math.floor(legacyFails / RF_AUTH.maxFails);
    let fails = legacyFails % RF_AUTH.maxFails;
    let lockUntil = Math.max(0, Number(s.lockUntil) || 0);
    if (lockUntil > now) {
      if (lockouts === 0) lockouts = 1;
      lockUntil = Math.min(lockUntil, now + rfLoginLockDuration_(lockouts - 1));
      fails = 0;
    } else {
      lockUntil = 0;
      const threshold = lockouts > 0 ? RF_AUTH.loginSubsequentFails : RF_AUTH.loginInitialFails;
      if (fails >= threshold) {
        lockouts += 1;
        lockUntil = now + rfLoginLockDuration_(lockouts - 1);
        fails = 0;
      }
    }
    s = { fails: fails, lockouts: lockouts, lockUntil: lockUntil, loginPolicyVersion: RF_AUTH.loginPolicyVersion };
    rfSetJson_(prop, s);
  }
  const threshold = Number(s.lockouts) > 0 ? RF_AUTH.loginSubsequentFails : RF_AUTH.loginInitialFails;
  if (Number(s.lockUntil) > now) return { locked: true, retryAfter: Math.ceil((Number(s.lockUntil) - now) / 1000), attemptsRemaining: 0, attemptsLimit: threshold };
  return { locked: false, attemptsRemaining: Math.max(0, threshold - Math.max(0, Number(s.fails) || 0)), attemptsLimit: threshold };
}
function rfRegisterLoginFail_(prop) {
  const status = rfLoginLockStatus_(prop);
  if (status.locked) return status;
  const s = rfGetJson_(prop, { fails: 0, lockUntil: 0, lockouts: 0, loginPolicyVersion: RF_AUTH.loginPolicyVersion });
  const threshold = Number(s.lockouts) > 0 ? RF_AUTH.loginSubsequentFails : RF_AUTH.loginInitialFails;
  s.fails = Math.max(0, Number(s.fails) || 0) + 1;
  if (s.fails >= threshold) {
    const duration = rfLoginLockDuration_(s.lockouts);
    s.lockouts = Math.max(0, Number(s.lockouts) || 0) + 1;
    s.fails = 0;
    s.lockUntil = rfNow_() + duration;
    s.loginPolicyVersion = RF_AUTH.loginPolicyVersion;
    rfSetJson_(prop, s);
    return { locked: true, retryAfter: Math.ceil(duration / 1000), attemptsRemaining: 0, attemptsLimit: threshold };
  }
  s.loginPolicyVersion = RF_AUTH.loginPolicyVersion;
  rfSetJson_(prop, s);
  return { locked: false, attemptsRemaining: threshold - s.fails, attemptsLimit: threshold };
}

/* ---- registro de accesos ---- */
function rfAudit_(ev, ok) {
  const log = rfGetJson_(RF_AUTH.auditProp, []);
  log.push({ t: new Date(rfNow_()).toISOString(), e: ev, ok: !!ok });
  rfSetJson_(RF_AUTH.auditProp, log.slice(-RF_AUTH.auditKeep));
}

/* ---- equipos conocidos ----
 * Quien ya inició sesión recibe una credencial de equipo (256 bits, guardada cifrada en su equipo). Con ella Y la clave correcta puede entrar
 * aunque un desconocido haya agotado los intentos: el bloqueo global solo frena a quien no tiene un equipo conocido, y cada equipo conocido
 * tiene su propio contador. Así nadie puede dejar a la comunidad fuera solo conociendo la dirección del servicio. */
const RF_MAX_DEVICES = 10;
function rfDeviceHash_(d) { return rfHash_('equipo:' + d); }
function rfDeviceOk_(a, d) {
  if (!a || typeof d !== 'string' || !/^[0-9a-f]{64}$/.test(d) || !a.devices) return false;
  const h = rfDeviceHash_(d);
  let ok = false;
  a.devices.forEach(function (x) { if (rfSafeEqual_(x.h, h)) ok = true; });
  return ok;
}
function rfAddDevice_(a) {
  const d = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  a.devices = (a.devices || []).concat([{ h: rfDeviceHash_(d), at: new Date(rfNow_()).toISOString() }]).slice(-RF_MAX_DEVICES);
  return d;
}

/* ---- sesiones ---- */
function rfSessHash_(token) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token))).replace(/=+$/, '');
}
function rfChangeLockProp_(token) { return RF_AUTH.changeLockPrefix + rfSessHash_(token); }
function rfDeleteSessionProp_(props, sessionKey) {
  const sessionHash = sessionKey.slice(RF_AUTH.sessPrefix.length);
  props.deleteProperty(sessionKey);
  props.deleteProperty(RF_AUTH.changeLockPrefix + sessionHash);
}
function rfPurgeSessions_() {
  const props = rfProps_(), now = rfNow_(), live = [];
  props.getKeys().forEach(function (k) {
    if (k.indexOf(RF_AUTH.sessPrefix) !== 0) return;
    const s = rfGetJson_(k, null);
    if (!s || s.exp < now) rfDeleteSessionProp_(props, k); else live.push({ k: k, at: s.at });
  });
  live.sort(function (a, b) { return a.at - b.at; });
  while (live.length > RF_AUTH.maxSessions) rfDeleteSessionProp_(props, live.shift().k);
}
function rfKillSessions_(exceptHash) {
  const props = rfProps_();
  props.getKeys().forEach(function (k) {
    if (k.indexOf(RF_AUTH.sessPrefix) === 0 && k !== RF_AUTH.sessPrefix + (exceptHash || '')) rfDeleteSessionProp_(props, k);
  });
}
function rfNewSession_() {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  rfSetJson_(RF_AUTH.sessPrefix + rfSessHash_(token), { exp: rfNow_() + RF_AUTH.sessionMs, at: rfNow_() });
  rfPurgeSessions_();
  return { token: token, exp: rfNow_() + RF_AUTH.sessionMs };
}
function rfSessionValid_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  const k = RF_AUTH.sessPrefix + rfSessHash_(token), s = rfGetJson_(k, null);
  if (!s) return false;
  if (s.exp < rfNow_()) { rfDeleteSessionProp_(rfProps_(), k); return false; }
  return true;
}

/* ---- acciones públicas ---- */
function rfChallenge_() {
  const a = rfGetJson_(RF_AUTH.accountProp, null);
  return a ? { ok: true, exists: true, saltP: a.saltP, it: a.it } : { ok: true, exists: false, it: RF_AUTH.iterations };
}
function rfSetupAccount_(p) {
  return rfWithLock_(function () {
    if (rfGetJson_(RF_AUTH.accountProp, null)) return { ok: false, error: 'CUENTA_EXISTENTE' };
    const ls = rfLockStatus_(RF_AUTH.setupLockProp);
    if (ls.locked) return { ok: false, error: 'BLOQUEADO', retryAfter: ls.retryAfter };
    const expected = rfProp_(RF_AUTH.setupCodeProp) || rfProp_('RINDE_FACIL_ACCESS_KEY');
    if (!expected || !rfSafeEqual_(p.setupCode, expected)) { rfRegisterFail_(RF_AUTH.setupLockProp, 60 * 60 * 1000); rfAudit_('setup_fail', false); return { ok: false, error: 'CODIGO_INVALIDO' }; }
    const user = rfNormUser_(p.user);
    if (user.length < 3 || !rfIsB64Field_(p.saltP, 16, 64) || !rfIsB64Field_(p.authKey, 40, 48) || !rfIsB64Field_(p.recSalt, 16, 64) || !rfIsB64Field_(p.authKeyR, 40, 48)) return { ok: false, error: 'DATOS_INVALIDOS' };
    const acct = { user: user, saltP: p.saltP, it: RF_AUTH.iterations, hashAuth: rfHash_(p.authKey), recSalt: p.recSalt, hashRec: rfHash_(p.authKeyR), createdAt: new Date(rfNow_()).toISOString(), devices: [] };
    const device = rfAddDevice_(acct);
    rfSetJson_(RF_AUTH.accountProp, acct);
    rfProps_().deleteProperty(RF_AUTH.setupCodeProp); rfProps_().deleteProperty('RINDE_FACIL_ACCESS_KEY'); // el código de instalación sirve una sola vez
    rfAudit_('setup', true);
    const s = rfNewSession_();
    return { ok: true, token: s.token, exp: s.exp, it: RF_AUTH.iterations, device: device };
  });
}
function rfLogin_(p) {
  return rfWithLock_(function () {
    const a = rfGetJson_(RF_AUTH.accountProp, null);
    const known = rfDeviceOk_(a, p.device);
    // equipo conocido: su propio contador; desconocido: el contador global
    const lockProp = known ? RF_AUTH.lockProp + '_D' + rfDeviceHash_(p.device).replace(/[^A-Za-z0-9]/g, '').slice(0, 16) : RF_AUTH.lockProp;
    const ls = rfLoginLockStatus_(lockProp);
    if (ls.locked) return { ok: false, error: 'BLOQUEADO', retryAfter: ls.retryAfter, attemptsRemaining: 0, attemptsLimit: ls.attemptsLimit };
    const h = rfHash_(String(p.authKey || '')); // se calcula siempre: el tiempo no delata si la cuenta existe
    const okUser = a ? rfSafeEqual_(rfNormUser_(p.user), a.user) : false;
    const okPass = a ? rfSafeEqual_(h, a.hashAuth) : false;
    if (!(a && okUser && okPass)) {
      const attempt = rfRegisterLoginFail_(lockProp);
      rfAudit_('login_fail', false);
      return { ok: false, error: attempt.locked ? 'BLOQUEADO' : 'CREDENCIALES_INVALIDAS', attemptsRemaining: attempt.attemptsRemaining, attemptsLimit: attempt.attemptsLimit, retryAfter: attempt.retryAfter };
    }
    rfClearFails_(lockProp);
    let device = null;
    if (!known && p.wantDevice === true) { device = rfAddDevice_(a); rfSetJson_(RF_AUTH.accountProp, a); }
    const s = rfNewSession_();
    rfAudit_('login', true);
    const out = { ok: true, token: s.token, exp: s.exp, saltP: a.saltP, it: a.it, attemptsRemaining: RF_AUTH.loginInitialFails, attemptsLimit: RF_AUTH.loginInitialFails };
    if (device) out.device = device;
    return out;
  });
}
function rfResetPassword_(p) {
  return rfWithLock_(function () {
    // sin bloqueo: el código de recuperación tiene 128 bits (no se adivina en línea) y bloquearlo permitiría a cualquiera cerrar la única vía de rescate
    const a = rfGetJson_(RF_AUTH.accountProp, null);
    const h = rfHash_(String(p.authKeyR || ''));
    const ok = a && rfSafeEqual_(rfNormUser_(p.user), a.user) && rfSafeEqual_(h, a.hashRec);
    if (!ok) { rfAudit_('reset_fail', false); return { ok: false, error: 'CREDENCIALES_INVALIDAS' }; }
    if (!rfIsB64Field_(p.saltP, 16, 64) || !rfIsB64Field_(p.authKey, 40, 48) || !rfIsB64Field_(p.recSalt, 16, 64) || !rfIsB64Field_(p.authKeyR2, 40, 48)) return { ok: false, error: 'DATOS_INVALIDOS' };
    a.saltP = p.saltP; a.hashAuth = rfHash_(p.authKey); a.recSalt = p.recSalt; a.hashRec = rfHash_(p.authKeyR2); a.it = RF_AUTH.iterations;
    a.devices = []; // se revocan todos los equipos conocidos
    const device = rfAddDevice_(a);
    rfSetJson_(RF_AUTH.accountProp, a);
    rfClearFails_(RF_AUTH.lockProp);
    rfKillSessions_(''); rfAudit_('reset', true);
    const s = rfNewSession_();
    return { ok: true, token: s.token, exp: s.exp, device: device };
  });
}

/* ---- acciones con sesión ---- */
function rfChangePassword_(p) {
  return rfWithLock_(function () {
    /* La validación inicial ocurre antes de adquirir el bloqueo; una sesión pudo revocarse mientras esperaba. */
    if (!rfSessionValid_(p.t)) return { ok: false, error: 'SESION_INVALIDA' };
    // Una sesión ya autenticada no debe quedar bloqueada por intentos de login anónimos.
    // Los fallos de verificación de clave anterior sí se limitan por sesión.
    const changeLockProp = rfChangeLockProp_(p.t);
    const ls = rfLockStatus_(changeLockProp);
    if (ls.locked) return { ok: false, error: 'BLOQUEADO', retryAfter: ls.retryAfter };
    const a = rfGetJson_(RF_AUTH.accountProp, null);
    if (!a || !rfSafeEqual_(rfHash_(String(p.authKeyOld || '')), a.hashAuth)) { rfRegisterFail_(changeLockProp, RF_AUTH.lockBaseMs); rfAudit_('change_fail', false); return { ok: false, error: 'CREDENCIALES_INVALIDAS' }; }
    if (!rfIsB64Field_(p.saltP, 16, 64) || !rfIsB64Field_(p.authKey, 40, 48)) return { ok: false, error: 'DATOS_INVALIDOS' };
    a.saltP = p.saltP; a.hashAuth = rfHash_(p.authKey);
    if (rfIsB64Field_(p.recSalt, 16, 64) && rfIsB64Field_(p.authKeyR, 40, 48)) { a.recSalt = p.recSalt; a.hashRec = rfHash_(p.authKeyR); }
    rfSetJson_(RF_AUTH.accountProp, a);
    rfClearFails_(changeLockProp);
    rfClearFails_(RF_AUTH.lockProp);
    rfKillSessions_(rfSessHash_(String(p.t))); // se cierran las demás sesiones
    rfAudit_('change_password', true);
    return { ok: true };
  });
}
function rfLogout_(p, all) {
  return rfWithLock_(function () {
    if (!rfSessionValid_(p.t)) return { ok: false, error: 'SESION_INVALIDA' };
    if (all) {
      rfKillSessions_(''); rfAudit_('logout_all', true);
      const acc = rfGetJson_(RF_AUTH.accountProp, null); if (acc) { acc.devices = []; rfSetJson_(RF_AUTH.accountProp, acc); }
    } else { rfDeleteSessionProp_(rfProps_(), RF_AUTH.sessPrefix + rfSessHash_(String(p.t))); }
    return { ok: true };
  });
}
function rfAuditList_() { return { ok: true, log: rfGetJson_(RF_AUTH.auditProp, []).slice(-40).reverse() }; }
