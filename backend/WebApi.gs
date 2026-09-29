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
 * Seguridad:
 *   - Se despliega "Ejecutar como: yo" en la cuenta de la comunidad. Los datos quedan en SU Drive y SU proyecto de Google Cloud.
 *   - Toda solicitud (menos doGet) exige la clave RINDE_FACIL_ACCESS_KEY. Si la propiedad no está definida, se rechaza todo.
 *   - Límite diario de lecturas OCR (RINDE_FACIL_OCR_DAILY_LIMIT, por defecto 200) para no gastar cuota por error.
 *
 * Propiedades de script necesarias (Configuración del proyecto > Propiedades de la secuencia de comandos):
 *   RINDE_FACIL_ACCESS_KEY          clave que se pega también en la app (Nube y copias)
 *   RINDE_FACIL_GCP_PROJECT_ID      proyecto de Google Cloud con Cloud Vision habilitado (ya lo usa CloudOcrAdapter.gs)
 *   RINDE_FACIL_OCR_PROVIDER        cloud_vision
 *   RINDE_FACIL_ROOT_FOLDER_ID      (opcional) carpeta raíz en Drive; si falta, se busca o se crea «Rinde fácil»
 *   RINDE_FACIL_OCR_DAILY_LIMIT     (opcional) máximo de lecturas por día
 */

const RF_WEB = {
  version: '2.3.0',
  keyProp: 'RINDE_FACIL_ACCESS_KEY',
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
    if (!rfAuthorized_(p.key)) return rfJson_({ ok: false, error: 'CLAVE_INVALIDA' });
    switch (p.action) {
      case 'ping': return rfJson_({ ok: true, version: RF_WEB.version, ocr: rfOcrReady_() });
      case 'ocr': return rfJson_(rfOcr_(p));
      case 'setup': return rfJson_(rfSetup_(p));
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
    const dir = rfSub_(rfRoot_(), RF_WEB.backupsName);
    const it = dir.getFilesByName(RF_WEB.stateFile);
    const stamp = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyyMMdd-HHmmss');
    if (it.hasNext()) { // conserva la versión anterior como respaldo
      const old = it.next();
      dir.createFile('estado-' + stamp + '.json', old.getBlob().getDataAsString(), 'application/json');
      old.setContent(text);
      rfPrune_(dir);
      return { ok: true, savedAt: stamp, fileId: old.getId(), url: rfUrl_(old) };
    }
    const f = dir.createFile(RF_WEB.stateFile, text, 'application/json');
    return { ok: true, savedAt: stamp, fileId: f.getId(), url: rfUrl_(f) };
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
  return { ok: true, state: it.next().getBlob().getDataAsString() };
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
