/* Rinde Fácil — lleva a la carpeta «Rinde fácil» del Drive de la comunidad todo lo que la app genera o recibe.
 * Usa el servicio de la comunidad (backend/WebApi.gs): nada pasa por un servidor central.
 * Nunca borra: si un documento cambia, el servicio guarda una versión nueva con la fecha y hora en el nombre. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util;
  var XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var ERRORS = { CLAVE_INVALIDA: 'La clave no coincide con la del servicio.', LIMITE_DIARIO: 'Se alcanzó el límite diario de lecturas.', ARCHIVO_MUY_GRANDE: 'El archivo pesa más de 8 MB.', TIPO_NO_PERMITIDO: 'Ese tipo de archivo no se puede guardar.', FECHA_INVALIDA: 'La fecha del documento no es válida.', OCUPADO: 'El servicio estaba ocupado; intenta de nuevo.', CATEGORIA_INVALIDA: 'Categoría desconocida.' };

  function cfg() { return RF.store.get().cloud; }
  function enabled() { return RF.cloud.configured(); }
  function auto() { return enabled() && cfg().autoSave !== false; }
  function projectName() { var p = RF.store.project(); return p ? (p.name || 'Proyecto sin nombre') : 'Sin proyecto'; }
  function errText(e) { return ERRORS[e] || String(e || 'error desconocido'); }

  /* A qué carpeta va cada documento según cómo se llama el archivo que se saca */
  function categoryFor(base) {
    var b = String(base || '').toLowerCase();
    if (/^(carta-gantt|gantt|presupuesto|reitem|cotiz|cuadro|pea|solicitud|consulta|proyecto)/.test(b)) return 'planificacion';
    if (/^(rendicion|resumen|expediente|carpeta|cuadre|observ)/.test(b)) return 'rendicion';
    return 'anexos';
  }
  function bytesToB64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function textToB64(str) { return bytesToB64(new TextEncoder().encode(str)); }

  function remember(entry) {
    RF.store.update(function (s) {
      s.cloud.saves = [entry].concat(s.cloud.saves || []).slice(0, 20);
      if (entry.rootUrl) s.cloud.rootUrl = entry.rootUrl;
    }, { silent: true });
  }
  /* falta de conexión o servicio caído: se puede reintentar más tarde. Un rechazo del servicio (tipo no permitido, sesión bloqueada…) no. */
  function retryable(e) { return !!e && !e.server && (root.navigator && root.navigator.onLine === false || /^(TIMEOUT|RESPUESTA_INVALIDA)$/.test(e.message) || /Failed to fetch|NetworkError|Load failed|HTTP 5\d\d|fetch/i.test(String(e.message))); }
  function outKey(p) { return [p.project, p.category, p.subfolder || '', p.fileName, p.issueDate || '', (p.base64 || '').length].join('|'); }
  function send(payload, label, quiet, meta) {
    return RF.cloud.post('saveFile', payload, 90000).then(function (r) {
      if (!r || !r.ok) { var er = new Error(errText(r && r.error)); er.server = true; throw er; }
      remember({ at: new Date().toISOString(), name: r.fileName || payload.fileName, where: r.where, url: r.url, folderUrl: r.folderUrl, idempotent: !!r.idempotent });
      if (!quiet) RF.ui.toast((r.idempotent ? 'Ya estaba en el Drive: ' : 'Guardado en el Drive: ') + r.where, 'ok');
      return r;
    }).catch(function (e) {
      if (retryable(e)) return RF.outbox.add(outKey(payload), label || payload.fileName, payload, meta).then(function (id) {
        if (id) { RF.ui.toast('Sin conexión: «' + (label || payload.fileName) + '» quedó en la cola y se subirá sola al volver.', 'info'); return { ok: true, queued: true }; }
        throw e;
      }).catch(function (e2) { RF.ui.toast('No se pudo guardar «' + (label || payload.fileName) + '» en el Drive (' + ((e2 && e2.message) || e2) + ').', 'bad'); throw e2; });
      RF.ui.toast('No se pudo guardar «' + (label || payload.fileName) + '» en el Drive (' + (e.message || e) + '). Puedes reintentar con «Guardar en Drive».', 'bad'); throw e;
    });
  }
  /* sube lo que quedó en la cola; se llama al volver la conexión, al abrir la app y cada minuto */
  var flushing = null;
  function applyMeta(meta, r) {
    if (!meta || !meta.expId) return;
    RF.store.update(function (s) { s.projects.forEach(function (p) { (p.expenses || []).forEach(function (x) { if (x.id !== meta.expId) return; if (meta.kind === 'foto') { x.driveId = r.fileId; x.driveUrl = r.url || ''; } else if (meta.kind === 'ficha') { x.driveFichaAt = new Date().toISOString(); x.driveFichaUrl = r.url || ''; } }); }); }, { silent: true });
  }
  function flushOutbox() {
    if (flushing) return flushing;
    if (!enabled() || !RF.auth || RF.auth.phase() !== 'open' || (root.navigator && root.navigator.onLine === false)) return Promise.resolve({ sent: 0, left: null });
    var sent = 0, stop = false;
    flushing = RF.outbox.list().then(function (items) {
      var chain = Promise.resolve();
      items.forEach(function (rec) {
        chain = chain.then(function () {
          if (stop) return null;
          return RF.outbox.open(rec).then(function (o) { return RF.cloud.post('saveFile', o.payload, 90000).then(function (r) {
            if (r && r.ok) { remember({ at: new Date().toISOString(), name: r.fileName || o.payload.fileName, where: r.where, url: r.url, folderUrl: r.folderUrl, idempotent: !!r.idempotent }); applyMeta(o.meta, r); sent++; return RF.outbox.del(rec.id); }
            if (r && r.error === 'SESION_INVALIDA') { stop = true; return null; }
            if (rec.tries >= 5) return RF.outbox.del(rec.id); /* el servicio lo rechaza una y otra vez: no se reintenta para siempre */
            return RF.outbox.bump(rec);
          }); }).catch(function () { stop = true; });
        });
      });
      return chain;
    }).then(function () { return RF.outbox.count(); }).then(function (left) { flushing = null; if (sent) RF.ui.toast(sent === 1 ? 'Se subió 1 archivo que estaba en la cola.' : 'Se subieron ' + sent + ' archivos que estaban en la cola.', 'ok'); return { sent: sent, left: left }; }, function () { flushing = null; return { sent: sent, left: null }; });
    return flushing;
  }
  var outboxStarted = false;
  function startOutbox() {
    if (outboxStarted || !root.addEventListener) return; outboxStarted = true;
    root.addEventListener('online', function () { flushOutbox(); });
    setInterval(function () { flushOutbox(); }, 60000);
    if (RF.auth && RF.auth.onChange) RF.auth.onChange(function (ph) { if (ph === 'open') setTimeout(flushOutbox, 1500); });
  }
  startOutbox();

  /* Guarda un documento armado por la app (Gantt, anexos, rendición…) en la carpeta del proyecto. kind: xlsx | doc | txt */
  function saveDoc(doc, base, kind) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    var payload = { project: projectName(), category: categoryFor(base) }, E = RF.exp;
    if (kind === 'doc') { payload.mimeType = 'application/msword'; payload.fileName = E.fileName(base || doc.title, 'doc'); payload.base64 = textToB64('﻿' + E.docToWord(doc)); }
    else if (kind === 'txt') { payload.mimeType = 'text/plain'; payload.fileName = E.fileName(base || doc.title, 'txt'); payload.base64 = textToB64('﻿' + E.docToText(doc)); }
    else { payload.mimeType = XLSX; payload.fileName = E.fileName(base || doc.title, 'xlsx'); payload.base64 = bytesToB64(E.buildXlsx(E.docToSheets(doc))); }
    return send(payload);
  }

  /* Archiva la foto o PDF original de un comprobante en «4 Comprobantes/AAAA-MM» del proyecto. */
  function saveReceipt(e, project) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    if (!e.fecha) { RF.ui.toast('Primero anota la fecha del documento: se usa para la carpeta del mes.', 'bad'); return Promise.reject(new Error('SIN_FECHA')); }
    return RF.blobs.get(e.imgId).then(function (blob) {
      if (!blob) throw new Error('La foto ya no está en este dispositivo.');
      var ext = /pdf/.test(blob.type) ? '.pdf' : /png/.test(blob.type) ? '.png' : /webp/.test(blob.type) ? '.webp' : '.jpg';
      return RF.cloud.blobToBase64(blob).then(function (b64) {
        return send({ project: (project && project.name) || projectName(), category: 'comprobante', fileName: String(e.proveedor || 'comprobante').replace(/\s+/g, '_') + '-' + (e.folio || 'sn') + ext, mimeType: blob.type || 'image/jpeg', base64: b64, issueDate: e.fecha }, 'comprobante', false, { expId: e.id, kind: 'foto' });
      });
    }).then(function (r) { if (r.queued) return r; e.driveId = r.fileId; e.driveUrl = r.url || ''; RF.store.update(function () { }, { silent: true }); return r; });
  }

  /* ---------- ficha del gasto: todos los datos ordenados en un texto, junto a la foto ---------- */
  var FIELD_LABELS = { docType: 'Tipo de documento', folio: 'Número', fecha: 'Fecha', proveedor: 'Proveedor', nombreComercial: 'Nombre comercial', rutProveedor: 'RUT del proveedor', neto: 'Neto', iva: 'IVA', total: 'Total', formaPago: 'Forma de pago' };
  function fichaText(e, project, community) {
    var D = RF.data, L = RF.logic, num = U.parseCLP, money = function (v) { return num(v) ? U.fmtCLP(num(v)) : '—'; };
    var dt = (D.DOC_BY_ID[e.docType] || {}).name || e.docType || '—', fpName = function (id) { return (D.FORMAS_PAGO.filter(function (f) { return f.id === id; })[0] || {}).name || id || '—'; };
    var act = ''; try { var a = L.allActivities(project).filter(function (x) { return x.act.id === e.actId; })[0]; act = a ? a.act.name : ''; } catch (er) { act = ''; }
    var r = null; try { r = L.evaluateExpense(e, project, community, project.expenses || []); } catch (er2) { r = null; }
    var out = [];
    out.push('FICHA DEL GASTO · Rinde Fácil', '================================', '',
      'Proyecto: ' + (project.name || '—') + (project.code ? ' (' + project.code + ')' : ''), 'Comunidad: ' + ((community && community.name) || '—'), 'Generada: ' + new Date().toLocaleString('es-CL'), '',
      '1. EL DOCUMENTO', '   Tipo: ' + dt, '   Número (folio): ' + (e.folio || '—'), '   Fecha del documento: ' + (e.fecha ? U.fmtDate(e.fecha) : '—'), '   Proveedor: ' + (e.proveedor || '—'), (e.nombreComercial ? '   Nombre comercial o local: ' + e.nombreComercial : '   Nombre comercial o local: —'), '   RUT del proveedor: ' + (e.rutProveedor ? U.rutFormat(e.rutProveedor) : '—'), '',
      '2. LOS MONTOS', '   Neto: ' + money(e.neto), '   IVA: ' + money(e.iva), '   Total del documento: ' + money(e.total), '   Monto a rendir: ' + money(e.montoRendir) + (e.pctUso !== '' && e.pctUso != null ? '  (' + e.pctUso + ' % del proyecto)' : ''), '',
      '3. DÓNDE VA', '   Cuenta: ' + ((D.CUENTA_BY_ID[e.cuenta] || {}).name || '—'), '   Actividad de la Carta Gantt: ' + (act || '—'), '   Ítem del presupuesto: ' + (e.item || '—'), '   Glosa: ' + (e.glosa || '—'), '',
      '4. EL PAGO', '   Forma de pago: ' + fpName(e.formaPago), '   Fecha del pago: ' + (e.fechaPago ? U.fmtDate(e.fechaPago) : '—'), '',
      '5. MARCAS', '   Viático o viaje: ' + (e.esViatico ? 'sí' : 'no'), '   Servicio técnico-profesional: ' + (e.servicioTecnico ? 'sí' : 'no'), '');
    var req = []; try { req = L.requirements(e, project, community); } catch (er3) { req = []; }
    var has = {}; try { has = L.effectiveHas(e, project); } catch (er4) { has = {}; }
    out.push('6. RESPALDOS QUE PIDE EL MANUAL');
    if (!req.length) out.push('   Ninguno adicional.'); else req.forEach(function (q) { out.push('   [' + (has[q.key] ? 'x' : ' ') + '] ' + q.label); });
    out.push('', '7. REVISIÓN', '   La persona comparó cada dato con el documento original: ' + (e.verified ? 'SÍ' : 'NO todavía'));
    if (r) { out.push('   Estado según las reglas de la app: ' + (r.status === 'ok' ? 'sin problemas' : r.status === 'warn' ? 'con avisos' : 'con errores')); (r.issues || []).forEach(function (i) { out.push('   - ' + (i.level === 'error' ? 'ERROR: ' : 'Aviso: ') + i.msg); }); }
    if (e.ocr) {
      out.push('', '8. LECTURA AUTOMÁTICA', '   Motor: Google Cloud Vision · ' + (e.ocr.at ? new Date(e.ocr.at).toLocaleString('es-CL') : '') + (e.ocr.confidence != null ? ' · confianza ' + Math.round(e.ocr.confidence * 100) + ' %' : ''));
      var diffs = [];
      Object.keys(FIELD_LABELS).forEach(function (k) {
        var was = e.ocr.auto && e.ocr.auto[k] != null ? String(e.ocr.auto[k]) : '', now = e[k] == null ? '' : String(e[k]);
        if (e.ocr.auto && was !== now) diffs.push('   - ' + FIELD_LABELS[k] + ': leído «' + (was || 'vacío') + '» → quedó «' + (now || 'vacío') + '»');
      });
      out.push(diffs.length ? '   Datos que la persona corrigió o completó a mano:' : '   La persona no cambió ningún dato leído.'); diffs.forEach(function (d) { out.push(d); });
      out.push('', '--- Texto tal como lo leyó el OCR (sin editar) ---', e.ocr.raw || '');
    } else out.push('', '8. Los datos se anotaron a mano (sin lectura automática).');
    return out.join('\n');
  }
  function baseName(e) { return String(e.proveedor || 'comprobante').replace(/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) + '-' + (String(e.folio || 'sn').replace(/[^A-Za-z0-9]+/g, '')); }
  function saveFicha(e, project, community, quiet) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    if (!e.fecha) { RF.ui.toast('Primero anota la fecha del documento: se usa para la carpeta del mes.', 'bad'); return Promise.reject(new Error('SIN_FECHA')); }
    return send({ project: (project && project.name) || projectName(), category: 'comprobante', fileName: baseName(e) + '.datos.txt', mimeType: 'text/plain', base64: textToB64('﻿' + fichaText(e, project, community)), issueDate: e.fecha }, 'ficha del gasto', quiet, { expId: e.id, kind: 'ficha' })
      .then(function (r) { if (r.queued) return r; e.driveFichaAt = new Date().toISOString(); e.driveFichaUrl = r.url || ''; RF.store.update(function () { }, { silent: true }); return r; });
  }
  /* copia de todos los datos de la app, con control de versiones: si otro equipo guardó algo más nuevo, no se pisa */
  function pushState(force) {
    var rev = cfg().rev || 0;
    return RF.cloud.post('saveState', { state: RF.store.exportJSON(), baseRev: rev, force: !!force }, 60000).then(function (r) {
      if (r && r.ok) { RF.store.update(function (s) { s.cloud.lastSync = new Date().toISOString(); s.cloud.rev = r.rev; s.cloud.conflict = false; }, { silent: true }); return { ok: true, rev: r.rev }; }
      if (r && r.error === 'CONFLICTO') { RF.store.update(function (s) { s.cloud.conflict = true; }, { silent: true }); return { ok: false, conflict: true, rev: r.rev }; }
      return { ok: false, error: r && r.error };
    });
  }
  function pullState() {
    return RF.cloud.post('loadState', {}, 60000).then(function (r) {
      if (!r || !r.ok || !r.state) return { ok: false, error: (r && r.error) || 'SIN_COPIA' };
      return { ok: true, remote: JSON.parse(r.state), rev: r.rev || 0 };
    });
  }
  /* pullOnly: el usuario pidió traer la copia. Si no, hay un conflicto al guardar. Devuelve { ok, text } */
  function resolveConflict(opts) {
    return pullState().then(function (p) {
      if (!p.ok) return { ok: false, text: p.error === 'SIN_COPIA' ? 'Todavía no hay una copia en la nube.' : 'No se pudo leer la copia (' + p.error + ').' };
      var msg = (opts && opts.pullOnly ? 'Hay una copia en la nube. ' : 'Otro equipo guardó una copia más nueva. ') + '¿Qué hacemos?';
      return RF.ui.choiceBox(msg, [{ id: 'merge', label: 'Combinar las dos (recomendado): se suman los gastos, documentos y actas nuevos', primary: true }, { id: 'replace', label: 'Usar la de la nube y descartar lo de este equipo' }].concat(opts && opts.pullOnly ? [] : [{ id: 'overwrite', label: 'Guardar lo de este equipo encima de la nube' }])).then(function (c) {
        if (!c) return { ok: false, text: 'No se hizo ningún cambio.' };
        if (c === 'overwrite') return pushState(true).then(function (r) { return { ok: r.ok, text: r.ok ? 'La nube quedó con lo de este equipo.' : 'No se pudo guardar.' }; });
        if (c === 'replace') { RF.store.importJSON(JSON.stringify(p.remote)); RF.store.update(function (s) { s.cloud.rev = p.rev; s.cloud.conflict = false; }, { silent: true }); return { ok: true, text: 'Se cargó la copia de la nube.' }; }
        var added = RF.store.mergeRemote(p.remote);
        RF.store.update(function (s) { s.cloud.rev = p.rev; }, { silent: true });
        return pushState(false).then(function (r) { return { ok: r.ok, text: 'Se combinaron las copias (' + added + ' elementos nuevos).' + (r.ok ? ' La nube quedó al día.' : ' Falta guardar en la nube: vuelve a pulsar «Guardar copia».') }; });
      });
    });
  }
  function backupState() {
    if (!enabled()) return Promise.resolve(null);
    return pushState(false).then(function (r) {
      if (r.conflict) RF.ui.toast('Hay una copia más nueva en la nube (otro equipo). Ve a «Nube y copias» para combinarlas.', 'bad');
      return r;
    }).catch(function () { return null; });
  }

  /* foto (si hay) + ficha con los datos + copia de seguridad */
  function archiveExpense(e, project, community) {
    var first = e.imgId && !e.driveId ? saveReceipt(e, project) : Promise.resolve(null);
    return first.then(function (r0) { return saveFicha(e, project, community, !!r0); }).then(function (r) { backupState(); return r; });
  }

  /* ---------- documentos oficiales y actas (lo que llega de afuera) ---------- */
  function extOf(name) { var m = String(name || '').match(/\.([A-Za-z0-9]{2,5})$/); return m ? '.' + m[1].toLowerCase() : ''; }
  function yesNo(v) { return v ? 'sí' : 'no'; }
  function docMeta(rec) {
    var t = RF.repo.TYPE_BY_ID[rec.type] || { name: 'Documento' }, s = RF.store.get();
    var proj = rec.projectId ? (s.projects.filter(function (p) { return p.id === rec.projectId; })[0] || {}).name : 'Todos los proyectos';
    var changes = Object.keys(rec.changes || {}).filter(function (k) { return rec.changes[k]; });
    return ['FICHA DEL DOCUMENTO · Rinde Fácil', '================================', '', 'Comunidad: ' + (s.community.name || '—'), 'Registrada: ' + new Date().toLocaleString('es-CL'), '',
      'Tipo: ' + t.name, 'Título: ' + (rec.title || '—'), 'Fecha del documento: ' + (rec.date ? U.fmtDate(rec.date) : '—'), 'Lo envía: ' + (rec.from || '—'), 'Proyecto: ' + (proj || '—'), 'Archivo original: ' + (rec.fileName || '—'), '',
      '¿Cambia algo del PEA?: ' + (rec.peaChange === 'si' ? 'SÍ' : rec.peaChange === 'nose' ? 'No está seguro' : 'No'), rec.peaChange === 'si' ? 'Qué cambia: ' + (changes.join(', ') || 'sin indicar') : '',
      rec.peaChange === 'si' ? 'Configurado en SGP: ' + yesNo(rec.sgpDone) : '', rec.peaChange === 'si' ? 'Carta Gantt y presupuesto de la app al día: ' + yesNo(rec.appDone) : '', '', 'Nota: ' + (rec.note || '—')].filter(function (x, i, a) { return !(x === '' && a[i - 1] === ''); }).join('\n');
  }
  function actaMeta(a) {
    var s = RF.store.get(), as = a.asistentes || {};
    var out = ['FICHA DEL ACTA DE MESA DE TRABAJO · Rinde Fácil', '================================', '', 'Comunidad: ' + (s.community.name || '—'), 'Fecha de la reunión: ' + (a.date ? U.fmtDate(a.date) : '—'), 'Modalidad: ' + (a.mode || '—'), 'Lugar: ' + (a.place || '—'), 'Estado del acta: ' + (a.state || '—'), '',
      'Asistentes: CORFO ' + (as.corfo || 0) + ' · Comunidad ' + (as.comunidad || 0) + ' · Organismo Colaborador ' + (as.oc || 0), 'Nombres: ' + (a.names || '—'), '', 'TEMAS TRATADOS', a.topics || '—', '', 'ACUERDOS Y COMPROMISOS'];
    if (!(a.agreements || []).length) out.push('(sin acuerdos anotados)');
    (a.agreements || []).forEach(function (x, i) { out.push((i + 1) + '. ' + (x.what || '—') + ' · responsable: ' + (x.who || '—') + ' · plazo: ' + (x.due ? U.fmtDate(x.due) : 'sin plazo') + ' · cumplido: ' + yesNo(x.done)); });
    out.push('', 'Archivo del acta: ' + (a.fileName || '—'), 'Nota: ' + (a.note || '—'));
    return out.join('\n');
  }
  /* guarda el archivo (si hay) y una ficha de texto con los datos; devuelve el resultado del archivo o, si no hay archivo, el de la ficha */
  function saveWithFicha(category, subfolder, base, rec, blob, metaText, issueDate) {
    var ext = extOf(rec.fileName), send1 = null;
    if (blob) {
      var mime = RF.repo.mimeOf(rec.fileName, blob.type);
      if (!mime) return Promise.reject(new Error('Ese tipo de archivo no se puede guardar en el Drive (usa PDF, foto, Word o Excel)'));
      send1 = RF.cloud.blobToBase64(blob).then(function (b64) { return send({ category: category, subfolder: subfolder, fileName: base + ext, mimeType: mime, base64: b64, issueDate: issueDate }, base + ext); });
    }
    return (send1 || Promise.resolve(null)).then(function (r1) {
      return send({ category: category, subfolder: subfolder, fileName: base + '.datos.txt', mimeType: 'text/plain', base64: textToB64('﻿' + metaText), issueDate: issueDate }, 'ficha', !!r1).then(function (r2) { return r1 || r2; });
    });
  }
  function saveExternal(rec, blob) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    var t = RF.repo.TYPE_BY_ID[rec.type] || { name: 'Documento', folder: 'Otros' }, s = RF.store.get();
    var proj = rec.projectId ? (s.projects.filter(function (p) { return p.id === rec.projectId; })[0] || {}).name : '';
    var base = (rec.date || U.todayISO()) + ' · ' + t.name + (proj ? ' · ' + proj : '') + (rec.title && rec.title !== t.name ? ' · ' + rec.title : '');
    return saveWithFicha('oficial', t.folder, base.slice(0, 110), rec, blob, docMeta(rec), null);
  }
  function saveActa(rec, blob) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    if (!rec.date) return Promise.reject(new Error('SIN_FECHA'));
    return saveWithFicha('acta', '', rec.date + ' · Acta de Mesa de Trabajo' + (rec.place ? ' · ' + rec.place : ''), rec, blob, actaMeta(rec), rec.date);
  }

  /* Deja armada la carpeta con su orden. */
  function setup(projectName_) {
    return RF.cloud.post('folders', { project: projectName_ || projectName() }, 60000).then(function (r) {
      if (!r || !r.ok) throw new Error(errText(r && r.error));
      remember({ at: new Date().toISOString(), name: 'Carpeta «' + (r.rootName || 'Rinde fácil') + '» lista', where: r.projectName ? 'Proyectos / ' + r.projectName : 'raíz', url: r.projectUrl || r.rootUrl, folderUrl: r.rootUrl, rootUrl: r.rootUrl });
      return r;
    });
  }

  RF.drive = { flushOutbox: flushOutbox, enabled: enabled, auto: auto, saveDoc: saveDoc, saveReceipt: saveReceipt, saveFicha: saveFicha, archiveExpense: archiveExpense, fichaText: fichaText, backupState: backupState, pushState: pushState, pullState: pullState, resolveConflict: resolveConflict, saveExternal: saveExternal, saveActa: saveActa, docMeta: docMeta, actaMeta: actaMeta, setup: setup, categoryFor: categoryFor, errText: errText };
})(typeof window !== 'undefined' ? window : globalThis);
