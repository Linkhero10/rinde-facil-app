/**
 * Rinde Fácil — servicio web de la comunidad (Google Apps Script).
 *
 * Qué hace:
 *   - ocr:        lee una foto o PDF de un comprobante con Google Cloud Vision (usa CloudOcrAdapter.gs).
 *                 NO guarda la imagen ni el texto leído: solo los devuelve a la app.
 *   - saveState / loadState: guarda y trae una copia de los datos de la app en el Drive de la comunidad.
 *   - saveFile:   archiva el original de un comprobante en Drive, en carpetas por mes (idempotente).
 *
 * Seguridad:
 *   - Se despliega "Ejecutar como: yo" en la cuenta de la comunidad. Los datos quedan en SU Drive y SU proyecto de Google Cloud.
 *   - Toda solicitud (menos doGet) exige la clave RINDE_FACIL_ACCESS_KEY. Si la propiedad no está definida, se rechaza todo.
 *   - Límite diario de lecturas OCR (RINDE_FACIL_OCR_DAILY_LIMIT, por defecto 200) para no gastar cuota por error.
 *
 * Propiedades de script necesarias (Configuración del proyecto > Propiedades de la secuencia de comandos):
 *   RINDE_FACIL_ACCESS_KEY          clave que se pega también en la app (Nube y copias)
 *   RINDE_FACIL_GCP_PROJECT_ID      proyecto de Google Cloud con Cloud Vision habilitado (ya lo usa CloudOcrAdapter.gs)
 *   RINDE_FACIL_OCR_PROVIDER        cloud_vision
 *   RINDE_FACIL_ROOT_FOLDER_ID      (opcional) carpeta raíz en Drive; si falta, se crea «Rinde fácil — datos»
 *   RINDE_FACIL_OCR_DAILY_LIMIT     (opcional) máximo de lecturas por día
 */

const RF_WEB = {
  version: '2.0.0',
  keyProp: 'RINDE_FACIL_ACCESS_KEY',
  rootProp: 'RINDE_FACIL_ROOT_FOLDER_ID',
  limitProp: 'RINDE_FACIL_OCR_DAILY_LIMIT',
  defaultRootName: 'Rinde fácil — datos',
  stateFile: 'estado-rinde-facil.json',
  maxBytes: 8 * 1024 * 1024,
  maxStateChars: 4 * 1024 * 1024,
  keepBackups: 5,
  okMime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'application/pdf']
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
    if (!rfAuthorized_(p.key)) return rfJson_({ ok: false, error: 'CLAVE_INVALIDA' });
    switch (p.action) {
      case 'ping': return rfJson_({ ok: true, version: RF_WEB.version, ocr: rfOcrReady_() });
      case 'ocr': return rfJson_(rfOcr_(p));
      case 'saveState': return rfJson_(rfSaveState_(p));
      case 'loadState': return rfJson_(rfLoadState_());
      case 'saveFile': return rfJson_(rfSaveFile_(p));
      default: return rfJson_({ ok: false, error: 'ACCION_DESCONOCIDA' });
    }
  } catch (err) {
    return rfJson_({ ok: false, error: 'ERROR_INTERNO', message: String(err && err.message ? err.message : err).slice(0, 200) });
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
function rfAuthorized_(key) {
  const expected = rfProp_(RF_WEB.keyProp);
  if (!expected) return false; // sin clave configurada no se atiende a nadie
  return rfSafeEqual_(key, expected);
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

/* ---------- Drive ---------- */
function rfRoot_() {
  const id = rfProp_(RF_WEB.rootProp);
  if (id) return DriveApp.getFolderById(id);
  const it = DriveApp.getFoldersByName(RF_WEB.defaultRootName);
  return it.hasNext() ? it.next() : DriveApp.createFolder(RF_WEB.defaultRootName);
}
function rfSub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function rfSaveState_(p) {
  const text = typeof p.state === 'string' ? p.state : JSON.stringify(p.state || {});
  if (!text || text.length > RF_WEB.maxStateChars) return { ok: false, error: 'ESTADO_INVALIDO' };
  try { const parsed = JSON.parse(text); if (!parsed || !Array.isArray(parsed.projects)) return { ok: false, error: 'ESTADO_INVALIDO' }; } catch (e) { return { ok: false, error: 'ESTADO_INVALIDO' }; }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'OCUPADO' };
  try {
    const dir = rfSub_(rfRoot_(), 'copias');
    const it = dir.getFilesByName(RF_WEB.stateFile);
    const stamp = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyyMMdd-HHmmss');
    if (it.hasNext()) { // conserva la versión anterior como respaldo
      const old = it.next();
      dir.createFile('estado-' + stamp + '.json', old.getBlob().getDataAsString(), 'application/json');
      old.setContent(text);
      rfPrune_(dir);
      return { ok: true, savedAt: stamp, fileId: old.getId() };
    }
    const f = dir.createFile(RF_WEB.stateFile, text, 'application/json');
    return { ok: true, savedAt: stamp, fileId: f.getId() };
  } finally { lock.releaseLock(); }
}
function rfPrune_(dir) {
  const files = [];
  const it = dir.getFiles();
  while (it.hasNext()) { const f = it.next(); if (/^estado-\d{8}-\d{6}\.json$/.test(f.getName())) files.push(f); }
  files.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  files.slice(RF_WEB.keepBackups).forEach(function (f) { f.setTrashed(true); });
}
function rfLoadState_() {
  const dir = rfSub_(rfRoot_(), 'copias');
  const it = dir.getFilesByName(RF_WEB.stateFile);
  if (!it.hasNext()) return { ok: false, error: 'SIN_COPIA' };
  return { ok: true, state: it.next().getBlob().getDataAsString() };
}
function rfSaveFile_(p) {
  if (RF_WEB.okMime.indexOf(String(p.mimeType || '').toLowerCase()) < 0) return { ok: false, error: 'TIPO_NO_PERMITIDO' };
  if (!rfIsBase64_(p.base64)) return { ok: false, error: 'BASE64_INVALIDO' };
  if (rfBase64Bytes_(p.base64) > RF_WEB.maxBytes) return { ok: false, error: 'ARCHIVO_MUY_GRANDE' };
  const m = String(p.issueDate || '').match(/^(\d{4})-(\d{2})/);
  if (!m || +m[2] < 1 || +m[2] > 12) return { ok: false, error: 'FECHA_INVALIDA' };
  const name = String(p.fileName || 'comprobante').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p.base64 + '|' + name + '|' + p.issueDate);
  const key = digest.map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'OCUPADO' };
  try {
    const folder = rfSub_(rfSub_(rfRoot_(), 'comprobantes'), m[1] + '-' + m[2]);
    const files = folder.getFiles();
    while (files.hasNext()) { const f = files.next(); if (f.getDescription() === 'rinde-facil:' + key) return { ok: true, fileId: f.getId(), folder: m[1] + '-' + m[2], idempotent: true }; }
    const blob = Utilities.newBlob(Utilities.base64Decode(p.base64), String(p.mimeType).toLowerCase(), name);
    const file = folder.createFile(blob);
    file.setDescription('rinde-facil:' + key);
    return { ok: true, fileId: file.getId(), folder: m[1] + '-' + m[2], idempotent: false };
  } finally { lock.releaseLock(); }
}
