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
  function send(payload, label) {
    return RF.cloud.post('saveFile', payload, 90000).then(function (r) {
      if (!r || !r.ok) throw new Error(errText(r && r.error));
      remember({ at: new Date().toISOString(), name: r.fileName || payload.fileName, where: r.where, url: r.url, folderUrl: r.folderUrl, idempotent: !!r.idempotent });
      RF.ui.toast((r.idempotent ? 'Ya estaba en el Drive: ' : 'Guardado en el Drive: ') + r.where, 'ok');
      return r;
    }).catch(function (e) { RF.ui.toast('No se pudo guardar «' + (label || payload.fileName) + '» en el Drive (' + (e.message || e) + '). Puedes reintentar con «Guardar en Drive».', 'bad'); throw e; });
  }

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
        return send({ project: (project && project.name) || projectName(), category: 'comprobante', fileName: String(e.proveedor || 'comprobante').replace(/\s+/g, '_') + '-' + (e.folio || 'sn') + ext, mimeType: blob.type || 'image/jpeg', base64: b64, issueDate: e.fecha }, 'comprobante');
      });
    }).then(function (r) { e.driveId = r.fileId; e.driveUrl = r.url || ''; RF.store.update(function () { }, { silent: true }); return r; });
  }

  /* ---------- ficha del gasto: todos los datos ordenados en un texto, junto a la foto ---------- */
  var FIELD_LABELS = { docType: 'Tipo de documento', folio: 'Número', fecha: 'Fecha', proveedor: 'Proveedor', rutProveedor: 'RUT del proveedor', neto: 'Neto', iva: 'IVA', total: 'Total', formaPago: 'Forma de pago' };
  function fichaText(e, project, community) {
    var D = RF.data, L = RF.logic, num = U.parseCLP, money = function (v) { return num(v) ? U.fmtCLP(num(v)) : '—'; };
    var dt = (D.DOC_BY_ID[e.docType] || {}).name || e.docType || '—', fpName = function (id) { return (D.FORMAS_PAGO.filter(function (f) { return f.id === id; })[0] || {}).name || id || '—'; };
    var act = ''; try { var a = L.allActivities(project).filter(function (x) { return x.act.id === e.actId; })[0]; act = a ? a.act.name : ''; } catch (er) { act = ''; }
    var r = null; try { r = L.evaluateExpense(e, project, community, project.expenses || []); } catch (er2) { r = null; }
    var out = [];
    out.push('FICHA DEL GASTO · Rinde Fácil', '================================', '',
      'Proyecto: ' + (project.name || '—') + (project.code ? ' (' + project.code + ')' : ''), 'Comunidad: ' + ((community && community.name) || '—'), 'Generada: ' + new Date().toLocaleString('es-CL'), '',
      '1. EL DOCUMENTO', '   Tipo: ' + dt, '   Número (folio): ' + (e.folio || '—'), '   Fecha del documento: ' + (e.fecha ? U.fmtDate(e.fecha) : '—'), '   Proveedor: ' + (e.proveedor || '—'), '   RUT del proveedor: ' + (e.rutProveedor ? U.rutFormat(e.rutProveedor) : '—'), '',
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
  function saveFicha(e, project, community) {
    if (!enabled()) return Promise.reject(new Error('NO_CONFIGURADO'));
    if (!e.fecha) { RF.ui.toast('Primero anota la fecha del documento: se usa para la carpeta del mes.', 'bad'); return Promise.reject(new Error('SIN_FECHA')); }
    return send({ project: (project && project.name) || projectName(), category: 'comprobante', fileName: baseName(e) + '.datos.txt', mimeType: 'text/plain', base64: textToB64('﻿' + fichaText(e, project, community)), issueDate: e.fecha }, 'ficha del gasto')
      .then(function (r) { e.driveFichaAt = new Date().toISOString(); e.driveFichaUrl = r.url || ''; RF.store.update(function () { }, { silent: true }); return r; });
  }
  /* copia de todos los datos de la app (5 versiones); se hace sola después de archivar un gasto */
  function backupState() {
    if (!enabled()) return Promise.resolve(null);
    return RF.cloud.post('saveState', { state: RF.store.exportJSON() }, 60000).then(function (r) {
      if (r && r.ok) RF.store.update(function (s) { s.cloud.lastSync = new Date().toISOString(); }, { silent: true });
      return r;
    }).catch(function () { return null; });
  }
  /* foto (si hay) + ficha con los datos + copia de seguridad */
  function archiveExpense(e, project, community) {
    var first = e.imgId && !e.driveId ? saveReceipt(e, project) : Promise.resolve(null);
    return first.then(function () { return saveFicha(e, project, community); }).then(function (r) { backupState(); return r; });
  }

  /* Deja armada la carpeta con su orden. */
  function setup(projectName_) {
    return RF.cloud.post('setup', { project: projectName_ || projectName() }, 60000).then(function (r) {
      if (!r || !r.ok) throw new Error(errText(r && r.error));
      remember({ at: new Date().toISOString(), name: 'Carpeta «' + (r.rootName || 'Rinde fácil') + '» lista', where: r.projectName ? 'Proyectos / ' + r.projectName : 'raíz', url: r.projectUrl || r.rootUrl, folderUrl: r.rootUrl, rootUrl: r.rootUrl });
      return r;
    });
  }

  RF.drive = { enabled: enabled, auto: auto, saveDoc: saveDoc, saveReceipt: saveReceipt, saveFicha: saveFicha, archiveExpense: archiveExpense, fichaText: fichaText, backupState: backupState, setup: setup, categoryFor: categoryFor, errText: errText };
})(typeof window !== 'undefined' ? window : globalThis);
