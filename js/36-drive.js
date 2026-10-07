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
  function serviceKey() { return String(cfg().apiUrl || '').trim().replace(/\/+$/, ''); }
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
  function retryable(e) {
    if (!e) return false;
    var code = String(e.code || '').toUpperCase(), message = String(e.message || '');
    var transientServer = e.server && (/^(OCUPADO|TIMEOUT|RESPUESTA_INVALIDA)$/.test(code) || /^HTTP 5\d\d$/.test(code));
    if (e.server && !transientServer) return false;
    return !!(root.navigator && root.navigator.onLine === false) || /^(TIMEOUT|RESPUESTA_INVALIDA)$/.test(code || message) || /Failed to fetch|NetworkError|Load failed|HTTP 5\d\d|fetch/i.test(message);
  }
  function outKey(p) { return [p.project, p.category, p.subfolder || '', p.fileName, p.issueDate || '', (p.base64 || '').length].join('|'); }
  function send(payload, label, quiet, meta) {
    return RF.cloud.post('saveFile', payload, 90000).then(function (r) {
      if (!r || !r.ok) { var er = new Error(errText(r && r.error)); er.server = true; er.code = r && r.error; throw er; }
      remember({ at: new Date().toISOString(), name: r.fileName || payload.fileName, where: r.where, url: r.url, folderUrl: r.folderUrl, idempotent: !!r.idempotent });
      if (!quiet) RF.ui.toast((r.idempotent ? 'Ya estaba en el Drive: ' : 'Guardado en el Drive: ') + '«' + (r.fileName || payload.fileName) + '» en ' + String(r.where || '').split(' / ').map(function (x) { return x.replace(/^\d+\s+/, ''); }).join(' › '), 'ok', { href: r.folderUrl || r.url });
      return Object.assign({ remote: true, queued: false }, r);
    }).catch(function (e) {
      if (retryable(e)) return RF.outbox.add(outKey(payload), label || payload.fileName, payload, Object.assign({}, meta || {}, { action: 'saveFile', serviceUrl: serviceKey() })).then(function (id) {
        if (!quiet) RF.ui.toast('Sin conexión: «' + (label || payload.fileName) + '» quedó pendiente en este dispositivo; todavía no está en el Drive.', 'warn');
        return { ok: false, remote: false, queued: true, outboxId: id };
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
  function applyStateResult(r) {
    RF.store.update(function (s) { s.cloud.lastSync = new Date().toISOString(); s.cloud.rev = r.rev; s.cloud.conflict = false; }, { silent: true, noSync: true });
  }
  function errorCode(e) {
    var value = e && (e.code || e.message) || 'ERROR_DE_SERVICIO';
    return String(value).toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64) || 'ERROR_DE_SERVICIO';
  }
  function flushOutbox() {
    if (flushing) return flushing;
    if (!enabled()) return Promise.resolve({ ok: false, sent: 0, left: null, error: 'NO_CONFIGURADO' });
    if (!RF.auth || RF.auth.phase() !== 'open') return Promise.resolve({ ok: false, sent: 0, left: null, error: 'SESION_CERRADA' });
    if (root.navigator && root.navigator.onLine === false) return Promise.resolve({ ok: false, sent: 0, left: null, error: 'SIN_CONEXION' });
    var sent = 0, stop = false;
    flushing = RF.outbox.list().then(function (items) {
      var chain = Promise.resolve();
      items.forEach(function (rec) {
        chain = chain.then(function () {
          if (stop || rec.status === 'needs_attention') return null;
          return RF.outbox.open(rec).then(function (o) {
            var action = o.meta && o.meta.action || 'saveFile';
            var destination = String(o.meta && o.meta.serviceUrl || '').trim().replace(/\/+$/, '');
            if (!destination) return RF.outbox.bump(rec, 'ORIGEN_NO_VERIFICADO', true);
            if (destination !== serviceKey()) return RF.outbox.bump(rec, 'SERVICIO_CAMBIO', true);
            var payload = action === 'saveState' ? { state: RF.store.exportJSON(), baseRev: cfg().rev || 0, force: false } : o.payload;
            return RF.cloud.post(action, payload, action === 'saveState' ? 60000 : 90000).then(function (r) {
              if (r && r.ok) {
                if (action === 'saveState') applyStateResult(r);
                else { remember({ at: new Date().toISOString(), name: r.fileName || payload.fileName, where: r.where, url: r.url, folderUrl: r.folderUrl, idempotent: !!r.idempotent }); applyMeta(o.meta, r); }
                return RF.outbox.del(rec.id).then(function () { sent++; });
              }
              var responseError = { server: true, code: r && r.error, message: errText(r && r.error) };
              var code = errorCode(responseError);
              if (action === 'saveState' && r && r.error === 'CONFLICTO') RF.store.update(function (s) { s.cloud.conflict = true; }, { silent: true });
              if (retryable(responseError)) {
                var nextTry = (rec.tries || 0) + 1;
                return RF.outbox.bump(rec, code, nextTry >= 5).then(function () { stop = true; });
              }
              return RF.outbox.bump(rec, code, true).then(function () { if (r && r.error === 'SESION_INVALIDA') stop = true; });
            }, function (e) {
              var nextTry = (rec.tries || 0) + 1;
              if (!retryable(e)) return RF.outbox.bump(rec, errorCode(e), true);
              return RF.outbox.bump(rec, errorCode(e), nextTry >= 5).then(function () { stop = true; });
            });
          }).catch(function (e) {
            /* A failure to decrypt/read/reconcile the queue is not an empty queue or a successful upload. */
            stop = true;
            throw e;
          });
        });
      });
      return chain;
    }).then(function () { return RF.outbox.count(); }).then(function (left) {
      var attention = 0;
      return RF.outbox.list().then(function (items) {
        attention = items.filter(function (rec) { return rec.status === 'needs_attention'; }).length;
        flushing = null;
        if (sent) RF.ui.toast(sent === 1 ? 'Se subió 1 archivo pendiente.' : 'Se subieron ' + sent + ' elementos pendientes.', 'ok');
        return { ok: true, sent: sent, left: left, needsAttention: attention };
      });
    }).catch(function (e) { flushing = null; return { ok: false, sent: sent, left: null, error: errorCode(e) }; });
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
  function hash32(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
  function saveDoc(doc, base, kind) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    var payload = { project: projectName(), category: categoryFor(base) }, E = RF.exp;
    if (kind === 'doc') { payload.mimeType = 'application/msword'; payload.fileName = E.fileName(base || doc.title, 'doc'); payload.base64 = textToB64('﻿' + E.docToWord(doc)); }
    else if (kind === 'txt') { payload.mimeType = 'text/plain'; payload.fileName = E.fileName(base || doc.title, 'txt'); payload.base64 = textToB64('﻿' + E.docToText(doc)); }
    else { payload.mimeType = XLSX; payload.fileName = E.fileName(base || doc.title, 'xlsx'); payload.base64 = bytesToB64(E.buildXlsx(E.docToSheets(doc))); }
    /* una sola copia por documento y solo si cambió: sacar el mismo documento en Excel y en Word no llena el Drive de repetidos */
    var fp = payload.category + '|' + payload.fileName + '|' + payload.base64.length + '|' + hash32(payload.base64);
    var seen = (cfg().docHashes || {});
    if (seen[payload.fileName] === fp) return Promise.resolve({ ok: true, remote: true, queued: false, unchanged: true });
    return send(payload).then(function (r) { if (r && r.remote) RF.store.update(function (st) { st.cloud.docHashes = Object.assign({}, st.cloud.docHashes || {}); st.cloud.docHashes[payload.fileName] = fp; }, { silent: true }); return r; });
  }

  /* Archiva la foto o PDF original de un comprobante en «4 Comprobantes/AAAA-MM» del proyecto. */
  function saveReceipt(e, project, quiet) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    if (!e.fecha) { RF.ui.toast('Primero anota la fecha del documento: se usa para la carpeta del mes.', 'bad'); return Promise.reject(new Error('SIN_FECHA')); }
    return RF.blobs.get(e.imgId).then(function (blob) {
      if (!blob) throw new Error('La foto ya no está en este dispositivo.');
      var ext = /pdf/.test(blob.type) ? '.pdf' : /png/.test(blob.type) ? '.png' : /webp/.test(blob.type) ? '.webp' : '.jpg';
      return RF.cloud.blobToBase64(blob).then(function (b64) {
        return send({ project: (project && project.name) || projectName(), category: 'comprobante', fileName: String(e.proveedor || 'comprobante').replace(/\s+/g, '_') + '-' + (e.folio || 'sn') + ext, mimeType: blob.type || 'image/jpeg', base64: b64, issueDate: e.fecha }, 'comprobante', !!quiet, { expId: e.id, kind: 'foto' });
      });
    }).then(function (r) { if (!r.remote) return r; e.driveId = r.fileId; e.driveUrl = r.url || ''; RF.store.update(function () { }, { silent: true }); return r; });
  }

  /* Archiva un respaldo adjunto (comprobante de pago, cartola, F29…) junto a la foto del gasto, en «4 Comprobantes/AAAA-MM». */
  function saveAttachment(e, project, key, label, blob, quiet) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    if (!e.fecha) { RF.ui.toast('Primero anota la fecha del documento: se usa para la carpeta del mes.', 'bad'); return Promise.reject(new Error('SIN_FECHA')); }
    var ext = /pdf/.test(blob.type) ? '.pdf' : /png/.test(blob.type) ? '.png' : /webp/.test(blob.type) ? '.webp' : '.jpg';
    return RF.cloud.blobToBase64(blob).then(function (b64) {
      var tag = String(label || key).split('(')[0].trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
      return send({ project: (project && project.name) || projectName(), category: 'comprobante', fileName: baseName(e) + '-respaldo-' + tag + ext, mimeType: blob.type || 'image/jpeg', base64: b64, issueDate: e.fecha }, 'respaldo ' + label, !!quiet, { expenseId: e.id });
    });
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
      .then(function (r) { if (!r.remote) return r; e.driveFichaAt = new Date().toISOString(); e.driveFichaUrl = r.url || ''; RF.store.update(function () { }, { silent: true }); return r; });
  }
  /* copia de todos los datos de la app, con control de versiones: si otro equipo guardó algo más nuevo, no se pisa */
  function pushState(force) {
    var rev = cfg().rev || 0;
    var payload = { state: RF.store.exportJSON(), baseRev: rev, force: !!force };
    function queueSnapshot() {
      return RF.outbox.add('saveState', 'copia de seguridad', payload, { action: 'saveState', coalesce: true, serviceUrl: serviceKey() }).then(function (id) {
        return { ok: false, remote: false, queued: true, outboxId: id };
      });
    }
    function handle(r) {
      if (r && r.ok) { applyStateResult(r); return { ok: true, remote: true, queued: false, rev: r.rev }; }
      if (r && r.error === 'CONFLICTO') { RF.store.update(function (s) { s.cloud.conflict = true; }, { silent: true }); return { ok: false, remote: false, conflict: true, rev: r.rev }; }
      if (retryable({ server: true, code: r && r.error, message: r && r.error })) return queueSnapshot();
      return { ok: false, remote: false, error: r && r.error };
    }
    return RF.cloud.post('saveState', payload, 60000).then(handle, function (e) { return retryable(e) ? queueSnapshot() : Promise.reject(e); });
  }
  function pullState() {
    return RF.cloud.post('loadState', {}, 60000).then(function (r) {
      if (!r || !r.ok || !r.state) return { ok: false, error: (r && r.error) || 'SIN_COPIA' };
      return { ok: true, remote: U.safeParse(r.state), rev: r.rev || 0 };
    });
  }
  /* pullOnly: el usuario pidió traer la copia. Si no, hay un conflicto al guardar. Devuelve { ok, text } */
  function resolveConflict(opts) {
    return pullState().then(function (p) {
      if (!p.ok) return { ok: false, text: p.error === 'SIN_COPIA' ? 'Todavía no hay una copia en la nube.' : 'No se pudo leer la copia (' + p.error + ').' };
      var msg = (opts && opts.pullOnly ? 'Hay una copia en la nube. ' : 'Otro equipo guardó una copia más nueva. ') + '¿Qué hacemos?';
      return RF.ui.choiceBox(msg, [{ id: 'merge', label: 'Combinar registros nuevos; si hay cambios incompatibles, se detiene para revisarlos', primary: true }, { id: 'replace', label: 'Usar la de la nube y descartar lo de este equipo' }].concat(opts && opts.pullOnly ? [] : [{ id: 'overwrite', label: 'Guardar lo de este equipo encima de la nube' }])).then(function (c) {
        if (!c) return { ok: false, text: 'No se hizo ningún cambio.' };
        if (c === 'overwrite') return pushState(true).then(function (r) { if (r.ok) markSynced(); return { ok: r.ok, text: r.ok ? 'La nube quedó con lo de este equipo.' : 'No se pudo guardar.' }; });
        if (c === 'replace') { RF.store.importJSON(JSON.stringify(p.remote)); RF.store.update(function (s) { s.cloud.rev = p.rev; s.cloud.conflict = false; }, { silent: true, noSync: true }); markSynced(); return { ok: true, text: 'Se cargó la copia de la nube.' }; }
        var added;
        try { added = RF.store.mergeRemote(p.remote, cfg().base); } catch (e) { if (e.code !== 'MERGE_CONFLICT') throw e; return { ok: false, conflict: true, text: e.message }; }
        RF.store.update(function (s) { s.cloud.rev = p.rev; }, { silent: true, noSync: true });
        return pushState(false).then(function (r) { if (r.ok) markSynced(); return { ok: r.ok, text: 'Se combinaron las copias (' + added + ' elementos nuevos).' + (r.ok ? ' La nube quedó al día.' : ' Falta guardar en la nube: vuelve a pulsar «Guardar copia».') }; });
      });
    });
  }
  function backupState() {
    if (!enabled()) return Promise.resolve({ ok: false, remote: false, queued: false, error: 'NO_CONFIGURADO' });
    return pushState(false).then(function (r) {
      if (r.conflict) RF.ui.toast('Hay una copia más nueva en la nube (otro equipo). Ve a «Nube y copias» para combinarlas.', 'bad');
      return r;
    });
  }


  /* ---------- sincronización automática entre equipos ----------
     Trae la copia de la nube, la une con la de este equipo (respetando lo que cambió cada lado desde la última vez) y sube el resultado.
     Se hace al abrir la sesión, al volver a la pestaña, cada pocos minutos y unos segundos después de cualquier cambio. */
  function syncFingerprint() { var st = RF.store.get(); return RF.store.fingerprint({ community: st.community, holidays: st.holidays, events: st.events, activity: st.activity, repo: st.repo, projects: st.projects }); }
  function isDirty() { return cfg().syncFp !== syncFingerprint(); }
  function markSynced() {
    RF.store.update(function (s) { s.cloud.base = RF.store.snapshotBase(s); s.cloud.syncFp = syncFingerprint(); s.cloud.lastSync = new Date().toISOString(); s.cloud.conflict = false; delete s.cloud.conflictText; }, { silent: true, noSync: true });
  }
  var syncing = null, syncTimer = null, lastSyncAt = 0, SYNC_LISTENERS = [];
  function onSync(fn) { SYNC_LISTENERS.push(fn); }
  function typing() { var a = root.document && root.document.activeElement; return !!(a && /^(input|textarea|select)$/i.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio'); }
  function syncNow(opts) {
    if (!auto() || !RF.auth || RF.auth.phase() !== 'open') return Promise.resolve({ ok: false, skipped: true });
    if (root.navigator && root.navigator.onLine === false) return Promise.resolve({ ok: false, skipped: true });
    if (syncing) return syncing;
    if (typing() && !(opts && opts.force)) { scheduleSync(4000); return Promise.resolve({ ok: false, skipped: true, typing: true }); }
    lastSyncAt = Date.now();
    var out;
    syncing = pullState().then(function (p) {
      if (RF.auth.phase() !== 'open') return { ok: false, skipped: true }; /* se cerró la sesión mientras se consultaba */
      if (!p.ok) {
        if (p.error === 'SIN_COPIA') return pushState(false).then(function (r) { if (r.ok) markSynced(); return r; });
        return p;
      }
      var rev = cfg().rev || 0;
      if (p.rev === rev) {
        if (!isDirty()) { if (!cfg().base) markSynced(); return { ok: true, same: true }; }
        return pushState(false).then(function (r) { if (r.ok) markSynced(); return r; });
      }
      var added;
      try { added = RF.store.mergeRemote(p.remote, cfg().base); }
      catch (e) {
        if (e.code !== 'MERGE_CONFLICT') throw e;
        RF.store.update(function (s) { s.cloud.conflict = true; s.cloud.conflictText = e.message; }, { silent: true, noSync: true });
        return { ok: false, conflict: true, text: e.message };
      }
      RF.store.update(function (s) { s.cloud.rev = p.rev; }, { silent: true, noSync: true });
      return pushState(false).then(function (r) { if (r.ok) markSynced(); return Object.assign({ merged: added }, r); });
    }).then(function (r) { out = r; }, function (e) { out = { ok: false, error: errorCode(e) }; }).then(function () {
      syncing = null;
      SYNC_LISTENERS.forEach(function (fn) { try { fn(out); } catch (e) { /* aviso opcional */ } });
      return out;
    });
    return syncing;
  }
  function scheduleSync(ms) {
    if (!root.setTimeout) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncTimer = null; syncNow(); }, ms == null ? 6000 : ms);
    if (syncTimer && syncTimer.unref) syncTimer.unref();
  }
  if (RF.store.onChange) RF.store.onChange(function () { if (auto()) scheduleSync(); });
  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('visibilitychange', function () { if (root.document.visibilityState === 'visible' && Date.now() - lastSyncAt > 30000) syncNow(); });
    root.addEventListener('online', function () { syncNow(); });
    if (root.setInterval) root.setInterval(function () { if (root.document.visibilityState === 'visible' && Date.now() - lastSyncAt > 150000) syncNow(); }, 60000);
  }

  /* F29 de un mes: va a «4 Comprobantes/AAAA-MM» con el nombre «F29-AAAA-MM» */
  function saveF29(rec, project, blob) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    var ext = /pdf/.test(blob.type) ? '.pdf' : /png/.test(blob.type) ? '.png' : /webp/.test(blob.type) ? '.webp' : '.jpg';
    return RF.cloud.blobToBase64(blob).then(function (b64) {
      return send({ project: (project && project.name) || projectName(), category: 'comprobante', fileName: 'F29-' + rec.mes + ext, mimeType: blob.type || 'application/pdf', base64: b64, issueDate: rec.mes + '-01' }, 'F29 de ' + rec.mes, false, null);
    });
  }
  /* permisos y fotos de obras: carpeta propia del Drive (Obras - permisos / Obras - fotos), sin ficha de texto ni OCR */
  function saveObra(rec, folder, fileName, blob) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    return RF.cloud.blobToBase64(blob).then(function (b64) {
      return send({ category: 'oficial', subfolder: folder, fileName: fileName, mimeType: blob.type || 'image/jpeg', base64: b64, issueDate: (rec.at || '').slice(0, 10) || undefined }, fileName, false, null);
    });
  }
  /* anexo firmado (foto o PDF): va a la carpeta «Anexos» del proyecto */
  function saveSigned(rec, sc, project, blob) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    var ext = /pdf/.test(blob.type) ? '.pdf' : /png/.test(blob.type) ? '.png' : /webp/.test(blob.type) ? '.webp' : '.jpg';
    var tag = String(sc.title || 'Anexo').split('·')[0].trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return RF.cloud.blobToBase64(blob).then(function (b64) { return send({ project: (project && project.name) || projectName(), category: 'anexos', fileName: tag + '-firmado-' + U.todayISO() + ext, mimeType: blob.type || 'image/jpeg', base64: b64, issueDate: U.todayISO() }, tag + ' firmado', false, null); });
  }
  /* ---------- «Guardar todo en Drive»: lo que está listo en la plataforma pero nunca se guardó ---------- */
  function realExpense(e) { return !!(e && e.fecha && (e.proveedor || e.total || e.folio)); }
  function pendingItems() {
    var out = [], st = RF.store.get();
    (st.projects || []).forEach(function (p) {
      (p.obras || []).forEach(function (r) { if (r && r.blobId && !r.driveUrl) out.push({ kind: 'obra', r: r, p: p, e: { id: r.id } }); });
      (p.f29 || []).forEach(function (r) { if (r && r.file && r.file.blobId && !r.file.driveUrl) out.push({ kind: 'f29', r: r, p: p, e: { id: r.id } }); });
      (p.expenses || []).forEach(function (e) {
        if (!realExpense(e)) return;
        if ((e.imgId && !e.driveId) || !e.driveFichaAt) out.push({ kind: 'gasto', e: e, p: p });
        Object.keys(e.attach || {}).forEach(function (k) { var a = e.attach[k]; if (a && a.id && !a.driveUrl && !a.driveId) out.push({ kind: 'respaldo', e: e, p: p, key: k, a: a }); });
      });
    });
    return out;
  }
  function pendingCount() { return enabled() ? pendingItems().length + (cfg().syncFp && isDirty() ? 1 : 0) : 0; }
  var savingAll = null;
  function saveAll() {
    if (!enabled()) return Promise.resolve({ ok: false, error: 'NO_CONFIGURADO' });
    if (savingAll) return savingAll;
    var items = pendingItems(), done = 0, fail = 0, total = items.length, community = RF.store.get().community;
    function progress() { SAVE_LISTENERS.forEach(function (fn) { try { fn({ busy: true, done: done, total: total }); } catch (e) { /* aviso opcional */ } }); }
    progress();
    var chain = Promise.resolve();
    items.forEach(function (it) {
      chain = chain.then(function () {
        if (it.kind === 'obra') {
          return RF.blobs.get(it.r.blobId).then(function (blob) { if (!blob) { fail++; return null; } return RF.obras.saveToDrive(it.r, it.p, blob).then(function (r) { if (r && r.remote) { it.r.driveUrl = r.url || ''; RF.store.update(function () { }, { silent: true }); done++; } else fail++; }, function () { fail++; }); }, function () { fail++; });
        }
        if (it.kind === 'f29') {
          return RF.blobs.get(it.r.file.blobId).then(function (blob) { if (!blob) { fail++; return null; } return saveF29(it.r, it.p, blob).then(function (r) { if (r && r.remote) { it.r.file.driveUrl = r.url || ''; RF.store.update(function () { }, { silent: true }); done++; } else fail++; }, function () { fail++; }); }, function () { fail++; });
        }
        if (it.kind === 'gasto') {
          var rec = it.e.imgId && !it.e.driveId ? saveReceipt(it.e, it.p, true) : Promise.resolve({ ok: true });
          return rec.then(function () { return saveFicha(it.e, it.p, community, true); }).then(function (r) { if (r && (r.remote || r.queued)) done++; else fail++; }, function () { fail++; });
        }
        return RF.blobs.get(it.a.id).then(function (blob) {
          if (!blob) { fail++; return null; }
          return saveAttachment(it.e, it.p, it.key, (RF.data.RESPALDOS && RF.data.RESPALDOS[it.key]) || it.key, blob, true).then(function (r) { if (r && r.remote) { it.a.driveUrl = r.url || ''; RF.store.update(function () { }, { silent: true }); done++; } else fail++; }, function () { fail++; });
        }, function () { fail++; });
      }).then(progress);
    });
    savingAll = chain.then(function () { return syncNow({ force: true }); }).then(function () { return { ok: fail === 0, done: done, fail: fail, total: total }; }).then(function (r) {
      savingAll = null; if (RF.activity && r.total) RF.activity.log('drive', r.ok ? 'Guardó ' + r.done + (r.done === 1 ? ' archivo' : ' archivos') + ' en Drive.' : 'Intentó guardar ' + r.total + ' archivos en Drive: ' + r.done + ' listos, ' + r.fail + ' con problema.');
      SAVE_LISTENERS.forEach(function (fn) { try { fn({ busy: false, result: r }); } catch (e) { /* aviso opcional */ } }); return r;
    }, function (e) { savingAll = null; SAVE_LISTENERS.forEach(function (fn) { try { fn({ busy: false, result: { ok: false, fail: total, done: done, total: total } }); } catch (x) { /* aviso opcional */ } }); return { ok: false, error: errorCode(e) }; });
    return savingAll;
  }
  var SAVE_LISTENERS = [];
  function onSaveAll(fn) { SAVE_LISTENERS.push(fn); }

  /* foto (si hay) + ficha con los datos + copia de seguridad */
  function archiveExpense(e, project, community) {
    function settle(p) { return Promise.resolve(p).then(function (r) { return r; }, function (e) { return { ok: false, remote: false, queued: false, error: errorCode(e) }; }); }
    var receipt = e.imgId && !e.driveId ? saveReceipt(e, project, true) : Promise.resolve({ ok: true, remote: true, skipped: true });
    var result = {};
    return settle(receipt).then(function (r) { result.receipt = r; return settle(saveFicha(e, project, community, true)); })
      .then(function (r) { result.ficha = r; return settle(backupState()); })
      .then(function (r) {
        result.backup = r;
        var parts = [result.receipt, result.ficha, result.backup].filter(function (x) { return !x.skipped; });
        var queued = parts.filter(function (x) { return x.queued; }).length;
        var remote = parts.filter(function (x) { return x.remote; }).length;
        var status = remote === parts.length ? 'saved' : queued === parts.length ? 'queued' : 'partial';
        if (!parts.length) status = 'partial';
        var documentsLabel = result.receipt.skipped ? 'La ficha del gasto y la copia' : 'La foto del comprobante, su ficha y la copia';
        if (RF.activity && status !== 'partial') RF.activity.log('drive', (status === 'saved' ? 'Guardó en Drive' : 'Dejó pendiente de enviar a Drive') + ' el gasto «' + (e.proveedor || 'sin proveedor') + (e.folio ? ' N° ' + e.folio : '') + '».', 'gastos');
        if (status === 'saved') RF.ui.toast(documentsLabel + ' quedaron guardadas en Drive.', 'ok', { href: (result.receipt && result.receipt.folderUrl) || (result.ficha && result.ficha.folderUrl) || (result.backup && result.backup.folderUrl) });
        else if (status === 'queued') RF.ui.toast(documentsLabel + ' quedaron pendientes en este dispositivo; todavía no están en Drive.', 'warn');
        else RF.ui.toast('Guardado parcial: algunas partes están en Drive y otras siguen pendientes o requieren atención. Revisa la cola antes de darlo por terminado.', 'warn');
        return { ok: status === 'saved', remote: status === 'saved', queued: queued > 0, queuedParts: queued, status: status, parts: result };
      });
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
  /* Guarda archivo y ficha como partes separadas; el éxito remoto solo se declara si todas las partes requeridas llegaron. */
  function saveWithFicha(category, subfolder, base, rec, blob, metaText, issueDate) {
    if (rec.blobId && !blob) return Promise.reject(new Error('ARCHIVO_LOCAL_NO_DISPONIBLE'));
    var ext = extOf(rec.fileName), filePromise = null;
    if (blob) {
      var mime = RF.repo.mimeOf(rec.fileName, blob.type);
      if (!mime) return Promise.reject(new Error('Ese tipo de archivo no se puede guardar en el Drive (usa PDF, foto, Word o Excel)'));
      filePromise = RF.cloud.blobToBase64(blob).then(function (b64) { return send({ category: category, subfolder: subfolder, fileName: base + ext, mimeType: mime, base64: b64, issueDate: issueDate }, base + ext, true); });
    }
    var fileResult = filePromise
      ? Promise.resolve(filePromise).then(function (r) { return r; }, function (e) { return { ok: false, remote: false, queued: false, error: errorCode(e) }; })
      : Promise.resolve({ ok: true, remote: false, queued: false, skipped: true });
    return fileResult.then(function (r1) {
      return Promise.resolve(send({ category: category, subfolder: subfolder, fileName: base + '.datos.txt', mimeType: 'text/plain', base64: textToB64('﻿' + metaText), issueDate: issueDate }, 'ficha', true))
        .then(function (r) { return r; }, function (e) { return { ok: false, remote: false, queued: false, error: errorCode(e) }; })
        .then(function (r2) {
          var required = blob ? [r1, r2] : [r2];
          var allRemote = required.every(function (part) { return part.remote === true; });
          var allQueued = required.every(function (part) { return part.queued === true; });
          var status = allRemote ? 'saved' : allQueued ? 'queued' : 'partial';
          var primary = blob ? r1 : r2;
          var result = Object.assign({}, primary, {
            ok: status === 'saved',
            remote: status === 'saved',
            queued: required.some(function (part) { return part.queued === true; }),
            status: status,
            parts: { file: r1, ficha: r2 }
          });
          if (status !== 'saved') { delete result.fileId; delete result.url; delete result.folderUrl; }
          if (status === 'saved') RF.ui.toast(blob ? 'El archivo original y su ficha quedaron guardados en Drive.' : 'La ficha quedó guardada en Drive.', 'ok', { href: primary.folderUrl || (r1 && r1.folderUrl) || (r2 && r2.folderUrl) });
          else if (status === 'queued') RF.ui.toast(blob ? 'El archivo original y su ficha quedaron pendientes en este dispositivo; todavía no están en Drive.' : 'La ficha quedó pendiente en este dispositivo; todavía no está en Drive.', 'warn');
          else {
            var stateText = function (part) { return part.remote ? 'guardado en Drive' : part.queued ? 'pendiente en este dispositivo, aún no está en Drive' : part.skipped ? 'no requerido' : 'requiere revisión'; };
            RF.ui.toast('Guardado parcial. Archivo original: ' + stateText(r1) + '. Ficha: ' + stateText(r2) + '. Revisa la cola antes de darlo por terminado.', 'warn');
          }
          return result;
        });
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

  /* «Últimos archivos guardados»: lo que ve la comunidad es el tipo de documento, a qué corresponde y cuándo se subió; sin rutas, números de carpeta ni nombres técnicos */
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function describeSave(x) {
    var name = String(x && x.name || ''), where = String(x && x.where || ''), parts = where.split(' / ');
    var isFolder = /^Carpeta «/.test(name), isFicha = /\.datos(\s*\(|\.)/.test(name), isEstado = /^estado/i.test(name) || /seguridad/i.test(where);
    var base = name.replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/\.datos/, '').replace(/\s*\(\d{8}-\d{6}\)\s*$/, '').replace(/_+/g, ' ').replace(/-\d{3,}$/, '').replace(/\s{2,}/g, ' ').trim();
    var respaldo = /-respaldo-/.test(name), tipo, titulo = base, lugar = '';
    var comp = /Comprobantes/i.test(where), plan = /Planificaci/i.test(where), anex = /Anexos/i.test(where), rend = /Rendici/i.test(where);
    if (isFolder) { tipo = 'Carpeta'; titulo = name; lugar = parts.length > 1 ? 'Proyecto: ' + parts[1] : ''; }
    else if (isEstado) { tipo = 'Copia de seguridad'; titulo = 'Copia de todos tus datos'; }
    else if (/Actas/i.test(where)) { tipo = 'Acta'; }
    else if (/oficiales/i.test(where)) { tipo = 'Documento oficial'; }
    else if (comp && respaldo) { tipo = 'Respaldo'; var parts2 = base.split('-respaldo-'); titulo = (parts2[1] || 'adjunto').replace(/ /g, ' ') + ' · ' + parts2[0]; }
    else if (comp) { tipo = isFicha ? 'Datos del comprobante' : 'Comprobante'; }
    else if (plan) { tipo = /gantt/i.test(name) ? 'Carta Gantt' : 'Planificación'; if (/gantt/i.test(name)) titulo = ''; }
    else if (anex) { tipo = 'Anexo'; }
    else if (rend) { tipo = 'Rendición'; }
    else { tipo = 'Archivo'; }
    var month = parts.filter(function (p) { return /^\d{4}-\d{2}$/.test(p); })[0];
    if (month && !lugar) lugar = MONTHS[Number(month.slice(5)) - 1] + ' ' + month.slice(0, 4);
    var d = x && x.at ? new Date(x.at) : null, fecha = d && !isNaN(d) ? d.toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return { tipo: tipo, titulo: titulo, lugar: lugar, fecha: fecha, url: x && x.url || '', folderUrl: x && x.folderUrl || '', ficha: isFicha, carpeta: isFolder, base: base, yaEstaba: !!(x && x.idempotent) };
  }
  /* una boleta y su ficha de datos se muestran como una sola línea; de las carpetas listas solo la última */
  function friendlySaves(list) {
    var seen = {}, out = [], infos = (list || []).map(describeSave), photos = {};
    infos.forEach(function (i) { if (i.tipo === 'Comprobante') photos[i.base] = true; });
    infos.forEach(function (i) {
      if (i.ficha && photos[i.base]) return;
      var key = i.carpeta ? 'carpeta' : i.tipo + '|' + i.base + '|' + i.lugar;
      if (seen[key]) return;
      seen[key] = true; out.push(i);
    });
    return out;
  }

  /* Deja armada la carpeta con su orden. */
  function setup(projectName_) {
    return RF.cloud.post('folders', { project: projectName_ || projectName() }, 60000).then(function (r) {
      if (!r || !r.ok) throw new Error(errText(r && r.error));
      remember({ at: new Date().toISOString(), name: 'Carpeta «' + (r.rootName || 'Rinde fácil') + '» lista', where: r.projectName ? 'Proyectos / ' + r.projectName : 'raíz', url: r.projectUrl || r.rootUrl, folderUrl: r.rootUrl, rootUrl: r.rootUrl });
      return r;
    });
  }

  RF.drive = { saveAttachment: saveAttachment, describeSave: describeSave, friendlySaves: friendlySaves, flushOutbox: flushOutbox, enabled: enabled, auto: auto, saveDoc: saveDoc, saveReceipt: saveReceipt, saveFicha: saveFicha, archiveExpense: archiveExpense, fichaText: fichaText, backupState: backupState, syncNow: syncNow, onSync: onSync, saveF29: saveF29, saveObra: saveObra, saveSigned: saveSigned, pendingItems: pendingItems, pendingCount: pendingCount, saveAll: saveAll, onSaveAll: onSaveAll, markSynced: markSynced, pushState: pushState, pullState: pullState, resolveConflict: resolveConflict, saveExternal: saveExternal, saveActa: saveActa, docMeta: docMeta, actaMeta: actaMeta, setup: setup, categoryFor: categoryFor, errText: errText };
})(typeof window !== 'undefined' ? window : globalThis);
