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

  /* Deja armada la carpeta con su orden. */
  function setup(projectName_) {
    return RF.cloud.post('setup', { project: projectName_ || projectName() }, 60000).then(function (r) {
      if (!r || !r.ok) throw new Error(errText(r && r.error));
      remember({ at: new Date().toISOString(), name: 'Carpeta «' + (r.rootName || 'Rinde fácil') + '» lista', where: r.projectName ? 'Proyectos / ' + r.projectName : 'raíz', url: r.projectUrl || r.rootUrl, folderUrl: r.rootUrl, rootUrl: r.rootUrl });
      return r;
    });
  }

  RF.drive = { enabled: enabled, auto: auto, saveDoc: saveDoc, saveReceipt: saveReceipt, setup: setup, categoryFor: categoryFor, errText: errText };
})(typeof window !== 'undefined' ? window : globalThis);
