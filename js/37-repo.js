/* Rinde Fácil — repositorio de documentos oficiales (lo que llega de CORFO u otros) y de actas de las mesas de trabajo.
 * Todo queda registrado en la app y, si la comunidad lo conectó, en su carpeta «Rinde fácil» del Drive. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, D = RF.data, h = U.h;
  var TOOLS = RF.tools = RF.tools || {};

  /* ---------- catálogo ---------- */
  var DOC_TYPES = [
    { id: 'pea_enviado', name: 'PEA enviado a CORFO', folder: 'PEA y sus cambios', from: 'comunidad', pea: 'no' },
    { id: 'pea_observado', name: 'PEA con observaciones de CORFO', folder: 'PEA y sus cambios', from: 'corfo', pea: 'si' },
    { id: 'pea_corregido', name: 'PEA corregido por CORFO o versión final', folder: 'PEA y sus cambios', from: 'corfo', pea: 'si' },
    { id: 'pea_aprobado', name: 'PEA aprobado (resolución o carta)', folder: 'PEA y sus cambios', from: 'corfo', pea: 'no' },
    { id: 'acta_no_objecion', name: 'Acta de No Objeción', folder: 'Actas de no objeción', from: 'corfo', pea: 'si' },
    { id: 'acta_asamblea', name: 'Acta de asamblea (aprueba el PEA o un cambio)', folder: 'Actas de asamblea', from: 'comunidad', pea: 'si' },
    { id: 'reitem', name: 'Reitemización o reprogramación (solicitud o respuesta)', folder: 'Reitemizaciones y reprogramaciones', from: 'corfo', pea: 'si' },
    { id: 'resolucion', name: 'Resolución u oficio de CORFO', folder: 'Resoluciones y oficios', from: 'corfo', pea: 'nose' },
    { id: 'obs_rend', name: 'Observaciones de CORFO a la rendición', folder: 'Rendiciones - observaciones y respuestas', from: 'corfo', pea: 'no' },
    { id: 'resp_obs', name: 'Respuesta de la comunidad a las observaciones', folder: 'Rendiciones - observaciones y respuestas', from: 'comunidad', pea: 'no' },
    { id: 'transferencia', name: 'Comprobante de transferencia', folder: 'Transferencias', from: 'novandina', pea: 'no' },
    { id: 'convenio', name: 'Convenio o Acuerdo firmado', folder: 'Convenio', from: 'corfo', pea: 'no' },
    { id: 'correo', name: 'Correo o carta oficial', folder: 'Correos y cartas', from: 'corfo', pea: 'nose' },
    { id: 'otro', name: 'Otro documento', folder: 'Otros', from: 'otro', pea: 'nose' }
  ];
  var TYPE_BY_ID = {}; DOC_TYPES.forEach(function (t) { TYPE_BY_ID[t.id] = t; });
  var FROM = [{ id: 'corfo', name: 'CORFO' }, { id: 'comunidad', name: 'La comunidad' }, { id: 'novandina', name: 'Novandina (ex SQM)' }, { id: 'smi', name: 'Organismo Colaborador' }, { id: 'otro', name: 'Otro' }];
  var PEA_OPTS = [{ id: 'no', name: 'No cambia nada del PEA' }, { id: 'si', name: 'Sí, cambia o pide cambiar algo del PEA' }, { id: 'nose', name: 'No estoy seguro' }];
  var ACTA_STATES = [{ id: 'borrador', name: 'Borrador' }, { id: 'firmada', name: 'Firmada' }, { id: 'enviada', name: 'Enviada a CORFO' }, { id: 'revisada', name: 'Revisada por CORFO' }, { id: 'observada', name: 'Observada por CORFO' }];
  var MODES = [{ id: 'presencial', name: 'Presencial' }, { id: 'online', name: 'Por videollamada' }, { id: 'mixta', name: 'Mixta' }];
  var CHANGES = [{ id: 'actividades', name: 'Actividades' }, { id: 'presupuesto', name: 'Presupuesto' }, { id: 'fechas', name: 'Fechas o plazos' }, { id: 'otro', name: 'Otra cosa' }];

  var MIME_BY_EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  function mimeOf(name, type) { var ext = String(name || '').split('.').pop().toLowerCase(); return MIME_BY_EXT[ext] || type || ''; }

  function repo() { var s = RF.store.get(); s.repo = s.repo || { docs: [], actas: [] }; s.repo.docs = s.repo.docs || []; s.repo.actas = s.repo.actas || []; return s.repo; }
  function silent() { RF.store.update(function () { }, { silent: true }); }
  function page(title, lead, kids) { return h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, title), lead ? h('p', { class: 'lead' }, lead) : null, kids); }
  function projectName(id) { var s = RF.store.get(), p = s.projects.filter(function (x) { return x.id === id; })[0]; return p ? (p.name || 'Proyecto') : 'Todos los proyectos'; }
  function fromName(id) { return (FROM.filter(function (f) { return f.id === id; })[0] || {}).name || ''; }
  function openBlob(blobId, name) {
    RF.blobs.get(blobId).then(function (b) { if (!b) { UI.toast('El archivo ya no está en este dispositivo. Si lo guardaste en el Drive, ábrelo desde allí.', 'bad'); return; } var url = URL.createObjectURL(b); var a = h('a', { href: url, target: '_blank', rel: 'noopener', download: /^(image|application\/pdf)/.test(b.type) ? null : name }); document.body.appendChild(a); a.click(); document.body.removeChild(a); });
  }
  function fileButton(st, redraw, label) {
    var inp = h('input', { type: 'file', accept: 'image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx', class: 'sr-only', 'aria-label': 'Elegir el archivo' });
    inp.addEventListener('change', function () { var f = inp.files[0]; if (f) { st.file = f; redraw(); } });
    return h('div', { class: 'file-pick' }, inp, UI.btn(st.file ? 'Cambiar archivo' : (label || 'Elegir el archivo o sacar una foto'), { icon: 'file', cls: st.file ? 'ghost' : 'primary', onclick: function () { inp.click(); } }),
      st.file ? h('span', { class: 'file-name' }, st.file.name + ' · ' + Math.max(1, Math.round(st.file.size / 1024)) + ' KB') : (st.rec && st.rec.fileName ? h('span', { class: 'file-name' }, 'Archivo guardado: ' + st.rec.fileName) : h('span', { class: 'hint' }, 'PDF, foto, Word o Excel. Hasta 8 MB para el Drive.')));
  }

  /* ---------- guardar el archivo en este dispositivo y, si corresponde, en el Drive ---------- */
  function storeFile(rec, file) {
    if (!file) return Promise.resolve();
    rec.fileName = file.name; rec.mime = mimeOf(file.name, file.type); rec.size = file.size; rec.blobId = rec.blobId || ('rec-' + rec.id);
    return RF.blobs.put(rec.blobId, file);
  }
  function driveSave(kind, rec, file) {
    if (!RF.drive || !RF.drive.enabled()) return Promise.resolve(null);
    var go = function (blob) { return (kind === 'doc' ? RF.drive.saveExternal(rec, blob) : RF.drive.saveActa(rec, blob)); };
    if (file) return go(file);
    return rec.blobId ? RF.blobs.get(rec.blobId).then(function (b) { return go(b || null); }) : go(null);
  }

  /* ================= Documentos oficiales ================= */
  function docLine(rec) { return (rec.date ? U.fmtDate(rec.date) : 'sin fecha') + ' · ' + (TYPE_BY_ID[rec.type] || { name: 'Documento' }).name; }
  function docsDoc() {
    var rows = repo().docs.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).map(function (r) {
      return [r.date || '', (TYPE_BY_ID[r.type] || {}).name || '', r.title || '', fromName(r.from), projectName(r.projectId), r.peaChange === 'si' ? 'Sí: ' + Object.keys(r.changes || {}).filter(function (k) { return r.changes[k]; }).join(', ') : r.peaChange === 'nose' ? 'No seguro' : 'No', r.sgpDone ? 'Sí' : '', r.fileName || '', r.note || ''];
    });
    return { title: 'Registro de documentos oficiales', subtitle: (RF.store.get().community.name || ''), sheet: 'Documentos', footer: 'Generado con Rinde Fácil. Es el registro de lo que llegó y se envió, para tener trazabilidad.', blocks: [{ t: 'table', head: ['Fecha', 'Tipo', 'Título', 'Quién lo envía', 'Aplica a', '¿Cambia el PEA?', '¿Ya en SGP?', 'Archivo', 'Nota'], types: ['date', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text'], rows: rows }] };
  }
  TOOLS.documentos = { title: 'Documentos oficiales', icon: 'file', desc: 'Guarda lo que llega de CORFO u otros (PEA corregido, acta de no objeción, resoluciones) para no perder la trazabilidad.', render: function () {
    var st = { editing: null, filter: 'todos', file: null, rec: null };
    var root = h('div');
    function newRec() { return { id: U.uid('d'), type: 'pea_corregido', title: '', date: U.todayISO(), projectId: '', from: 'corfo', peaChange: 'si', changes: {}, note: '', sgpDone: false, appDone: false, createdAt: new Date().toISOString() }; }
    function paint() { U.clear(root); root.appendChild(st.editing ? formView() : listView()); }

    function formView() {
      var rec = st.rec, box = h('div');
      var isNew = !repo().docs.some(function (d) { return d.id === rec.id; });
      var typeSel = UI.field('¿Qué documento es?', rec, 'type', { type: 'select', noEmpty: true, cls: 'wide', options: DOC_TYPES.map(function (t) { return { id: t.id, name: t.name }; }), onChange: function (v) { var t = TYPE_BY_ID[v]; if (isNew && t) { rec.from = t.from; rec.peaChange = t.pea; } paint(); } });
      var advice = h('div');
      function paintAdvice() {
        U.clear(advice);
        if (rec.peaChange === 'si') {
          advice.appendChild(h('div', { class: 'callout warn' }, h('strong', null, 'Este documento cambia algo del PEA.'),
            h('span', null, ' Marca qué cambia. Según los documentos del convenio, los cambios de actividades, presupuesto y fechas se piden con reitemización (o reprogramación si solo cambian los plazos), se aprueban en asamblea, se envían a CORFO con el acta y luego se configuran en SGP.')));
          advice.appendChild(h('div', { class: 'checks' }, CHANGES.map(function (c) { rec.changes = rec.changes || {}; return UI.field(c.name, rec.changes, c.id, { type: 'check' }); })));
          advice.appendChild(h('div', { class: 'row-actions' }, UI.btn('Preparar la solicitud de cambio', { icon: 'edit', cls: 'ghost', onclick: function () { location.hash = '#/h/reitem?from=TRM-028'; } }), UI.btn('Ver el trámite «Cambiar el PEA»', { icon: 'route', cls: 'ghost', onclick: function () { location.hash = '#/t/TRM-028'; } })));
        } else if (rec.peaChange === 'nose') {
          advice.appendChild(UI.callout('info', 'Si tienes dudas:', ' pregúntale a tu ejecutivo técnico de CORFO o al Organismo Colaborador si este documento obliga a corregir el PEA. Puedes guardarlo igual y volver a marcarlo después.'));
        }
      }
      paintAdvice();
      var projOpts = [{ id: '', name: 'Todos mis proyectos' }].concat(RF.store.get().projects.map(function (p) { return { id: p.id, name: p.name || 'Proyecto' }; }));
      var saveBtn = UI.btn(isNew ? 'Guardar el documento' : 'Guardar los cambios', { icon: 'check', cls: 'primary', onclick: function () {
        if (isNew && !st.file) { UI.toast('Elige el archivo del documento (puedes sacarle una foto).', 'bad'); return; }
        if (!rec.title) rec.title = (TYPE_BY_ID[rec.type] || {}).name || 'Documento';
        if (st.file && st.file.size > 8 * 1024 * 1024) UI.toast('El archivo pesa más de 8 MB: se guarda aquí, pero el Drive no lo aceptará.', 'bad');
        saveBtn.disabled = true;
        storeFile(rec, st.file).then(function () {
          if (isNew) repo().docs.push(rec);
          silent();
          var f = st.file; st.editing = null; st.file = null; paint();
          UI.toast('Documento guardado en este dispositivo.', 'ok');
          if (RF.drive && RF.drive.auto()) driveSave('doc', rec, f).then(function (r) { if (r) { rec.drive = { fileId: r.fileId, url: r.url, at: new Date().toISOString() }; silent(); paint(); } }).catch(function () { });
        });
      } });
      box.appendChild(UI.section(isNew ? 'Agregar un documento' : 'Editar el documento', [
        h('div', { class: 'form-grid' }, typeSel,
          UI.field('Título (opcional)', rec, 'title', { type: 'text', cls: 'wide', ph: 'Ej: PEA con las observaciones de septiembre' }),
          UI.field('Fecha del documento', rec, 'date', { type: 'date' }),
          UI.field('¿Quién lo envía?', rec, 'from', { type: 'select', noEmpty: true, options: FROM }),
          UI.field('¿A qué proyecto se refiere?', rec, 'projectId', { type: 'select', noEmpty: true, options: projOpts })),
        h('div', { class: 'field wide' }, h('span', { class: 'lbl' }, 'El archivo'), fileButton(st, paint)),
        h('h3', { class: 'grp' }, '¿Cambia algo del PEA?'),
        UI.field('Este documento…', rec, 'peaChange', { type: 'select', noEmpty: true, cls: 'wide', options: PEA_OPTS, onChange: function () { paintAdvice(); } }), advice,
        UI.field('Nota (opcional)', rec, 'note', { type: 'textarea', rows: 2, cls: 'wide', ph: 'Ej: CORFO pide agregar una actividad de capacitación.' }),
        h('div', { class: 'row-actions' }, saveBtn, UI.btn('Cancelar', { cls: 'ghost', onclick: function () { st.editing = null; st.file = null; paint(); } }))]));
      return box;
    }

    function listView() {
      var box = h('div'), docs = repo().docs;
      box.appendChild(UI.callout('info', 'Para qué sirve:', ' aquí queda todo lo que llega de afuera: el PEA corregido por CORFO, el acta de no objeción, resoluciones, observaciones y las respuestas. Así, si alguien pregunta «¿qué versión valía?», está a mano.'));
      box.appendChild(h('div', { class: 'row-actions' }, UI.btn('Agregar un documento', { icon: 'plus', cls: 'primary', onclick: function () { st.rec = newRec(); st.editing = st.rec.id; st.file = null; paint(); } }), UI.btn('Sacar foto a un documento', { icon: 'camera', onclick: function () { st.rec = newRec(); st.editing = st.rec.id; st.file = null; paint(); } })));
      /* historial de cambios al PEA */
      var cambios = docs.filter(function (d) { return d.peaChange === 'si'; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      if (cambios.length) {
        box.appendChild(UI.section('Cambios al PEA: qué falta hacer', [h('p', { class: 'hint' }, 'Cada documento que cambia el PEA pide dos cosas: que quede configurado en SGP y que tu Carta Gantt y presupuesto de esta app queden al día.'),
          h('ul', { class: 'timeline' }, cambios.map(function (d) {
            return h('li', null, h('div', { class: 'tl-h' }, docLine(d) + (d.title && d.title !== (TYPE_BY_ID[d.type] || {}).name ? ' · ' + d.title : '')),
              h('div', { class: 'checks' }, UI.field('Ya lo configuré en SGP', d, 'sgpDone', { type: 'check', onChange: paint }), UI.field('Ya actualicé mi Carta Gantt y presupuesto', d, 'appDone', { type: 'check', onChange: paint })),
              d.sgpDone && d.appDone ? h('span', { class: 'badge ok' }, 'Al día') : h('span', { class: 'badge warn' }, 'Pendiente'));
          }))]));
      }
      var chips = h('div', { class: 'chips' }, [['todos', 'Todos'], ['pea', 'PEA y cambios'], ['actas', 'Actas'], ['corfo', 'De CORFO'], ['comunidad', 'De la comunidad']].map(function (f) { return h('button', { type: 'button', class: 'chip' + (st.filter === f[0] ? ' on' : ''), onclick: function () { st.filter = f[0]; paint(); } }, f[1]); }));
      var shown = docs.filter(function (d) { var t = TYPE_BY_ID[d.type] || {}; return st.filter === 'todos' || (st.filter === 'pea' && /^pea_|reitem/.test(d.type)) || (st.filter === 'actas' && /^acta_/.test(d.type)) || (st.filter === 'corfo' && d.from === 'corfo') || (st.filter === 'comunidad' && d.from === 'comunidad'); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      var rows = shown.map(function (d) {
        var t = TYPE_BY_ID[d.type] || { name: 'Documento' };
        return h('tr', null,
          h('td', { 'data-label': 'Fecha' }, d.date ? U.fmtDateShort(d.date) : '—'),
          h('td', { 'data-label': 'Documento' }, h('strong', null, d.title || t.name), h('div', { class: 'muted small' }, t.name + ' · ' + fromName(d.from) + ' · ' + projectName(d.projectId))),
          h('td', { 'data-label': '¿Cambia el PEA?' }, d.peaChange === 'si' ? UI.badge('Sí', 'warn') : d.peaChange === 'nose' ? UI.badge('Por confirmar', 'info') : UI.badge('No', '')),
          h('td', { 'data-label': 'En el Drive' }, d.drive && d.drive.url ? h('a', { href: d.drive.url, target: '_blank', rel: 'noopener' }, 'Abrir') : (RF.drive && RF.drive.enabled() ? UI.btn('Guardar', { cls: 'ghost small', onclick: function () { driveSave('doc', d, null).then(function (r) { if (r) { d.drive = { fileId: r.fileId, url: r.url, at: new Date().toISOString() }; silent(); paint(); } }).catch(function () { }); } }) : '—')),
          h('td', { 'data-label': 'Acciones' }, h('div', { class: 'row-actions' },
            d.blobId ? UI.btn('Ver', { cls: 'ghost small', onclick: function () { openBlob(d.blobId, d.fileName); } }) : null,
            UI.btn('Editar', { cls: 'ghost small', onclick: function () { st.rec = d; st.editing = d.id; st.file = null; paint(); } }),
            UI.btn('Borrar', { cls: 'ghost small danger', onclick: function () { UI.confirmBox('¿Borrar este documento de la app? Lo que ya está en el Drive no se borra.', 'Borrar').then(function (ok) { if (!ok) return; if (d.blobId) RF.blobs.del(d.blobId); repo().docs.splice(repo().docs.indexOf(d), 1); silent(); paint(); }); } }))));
      });
      box.appendChild(UI.section('Tus documentos', [docs.length ? chips : null, rows.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'plain-grid list-grid' }, h('thead', null, h('tr', null, ['Fecha', 'Documento', '¿Cambia el PEA?', 'En el Drive', ''].map(function (x) { return h('th', null, x); }))), h('tbody', null, rows))) : UI.empty(docs.length ? 'No hay documentos en este filtro.' : 'Aún no guardas documentos. Agrega el primero.')]));
      if (docs.length) box.appendChild(UI.section('Sacar el registro', [UI.exportBar(docsDoc, 'registro-documentos')]));
      return box;
    }
    paint();
    return page('Documentos oficiales', 'Sube lo que llega de CORFO u otros y queda registrado, con fecha, quién lo envió y si cambia el PEA.', root);
  } };

  /* ================= Actas de mesas de trabajo ================= */
  function actaDoc(a) {
    var s = RF.store.get(), asis = a.asistentes || {};
    return { title: 'Acta de Mesa de Trabajo', subtitle: (s.community.name || '') + ' · ' + (a.date ? U.fmtDate(a.date) : ''), sheet: 'Acta', footer: 'Borrador generado con Rinde Fácil. No es un formato oficial: usa el que te pida CORFO. Una Mesa de Trabajo se hace con al menos dos representantes de CORFO, dos de la comunidad y dos del Organismo Colaborador.', blocks: [
      { t: 'kv', rows: [['Comunidad', s.community.name || ''], ['Fecha', a.date ? U.fmtDate(a.date) : ''], ['Modalidad', (MODES.filter(function (m) { return m.id === a.mode; })[0] || {}).name || ''], ['Lugar', a.place || ''], ['Asistentes CORFO', asis.corfo || ''], ['Asistentes de la comunidad', asis.comunidad || ''], ['Asistentes del Organismo Colaborador', asis.oc || ''], ['Nombres de los asistentes', a.names || '']] },
      { t: 'h', text: 'Temas tratados' }, { t: 'p', text: a.topics || '' },
      { t: 'h', text: 'Acuerdos y compromisos' },
      { t: 'table', head: ['Acuerdo', 'Responsable', 'Plazo', 'Cumplido'], types: ['text', 'text', 'date', 'text'], rows: (a.agreements || []).map(function (x) { return [x.what || '', fromName(x.who), x.due || '', x.done ? 'Sí' : 'No']; }) },
      { t: 'sign', labels: ['Firma · CORFO', 'Firma · ' + (s.community.name || 'Comunidad'), 'Firma · Organismo Colaborador'] }] };
  }
  function actasDoc() {
    var rows = repo().actas.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).map(function (a) { return [a.date || '', (ACTA_STATES.filter(function (x) { return x.id === a.state; })[0] || {}).name || '', (MODES.filter(function (m) { return m.id === a.mode; })[0] || {}).name || '', a.place || '', (a.asistentes || {}).corfo || '', (a.asistentes || {}).comunidad || '', (a.asistentes || {}).oc || '', (a.agreements || []).length, (a.agreements || []).filter(function (x) { return !x.done; }).length, a.fileName || '']; });
    return { title: 'Registro de actas de mesas de trabajo', subtitle: RF.store.get().community.name || '', sheet: 'Actas', footer: 'Generado con Rinde Fácil.', blocks: [{ t: 'table', head: ['Fecha', 'Estado', 'Modalidad', 'Lugar', 'CORFO', 'Comunidad', 'Organismo Colaborador', 'Acuerdos', 'Pendientes', 'Archivo'], types: ['date', 'text', 'text', 'text', 'num', 'num', 'num', 'num', 'num', 'text'], rows: rows }] };
  }
  TOOLS.actas = { title: 'Actas de mesas de trabajo', icon: 'user', desc: 'El repositorio de las actas de las mesas entre CORFO, la comunidad y el Organismo Colaborador, con sus compromisos.', render: function () {
    var st = { editing: null, file: null, rec: null };
    var root = h('div');
    function newActa() { return { id: U.uid('a'), date: U.todayISO(), mode: 'presencial', place: '', asistentes: { corfo: '', comunidad: '', oc: '' }, names: '', topics: '', agreements: [], state: 'borrador', note: '', createdAt: new Date().toISOString() }; }
    function paint() { U.clear(root); root.appendChild(st.editing ? formView() : listView()); }

    function formView() {
      var a = st.rec, isNew = !repo().actas.some(function (x) { return x.id === a.id; }), box = h('div');
      a.asistentes = a.asistentes || { corfo: '', comunidad: '', oc: '' }; a.agreements = a.agreements || [];
      var warn = h('div');
      function paintWarn() {
        U.clear(warn);
        var low = [['corfo', 'CORFO'], ['comunidad', 'la comunidad'], ['oc', 'el Organismo Colaborador']].filter(function (x) { var n = Number(a.asistentes[x[0]]); return a.asistentes[x[0]] !== '' && n < 2; });
        if (low.length) warn.appendChild(UI.callout('warn', 'Ojo con la asistencia:', ' una Mesa de Trabajo se hace con al menos dos representantes de CORFO, dos de la comunidad y dos del Organismo Colaborador. Faltan representantes de ' + low.map(function (x) { return x[1]; }).join(', ') + '.'));
      }
      paintWarn();
      var agBox = h('div', { class: 'ag-list' });
      function paintAg() {
        U.clear(agBox);
        a.agreements.forEach(function (x, i) {
          agBox.appendChild(h('div', { class: 'ag-row' },
            UI.field('Acuerdo o compromiso', x, 'what', { type: 'text', cls: 'wide' }),
            UI.field('Responsable', x, 'who', { type: 'select', noEmpty: true, options: FROM }),
            UI.field('Plazo', x, 'due', { type: 'date' }),
            UI.field('Cumplido', x, 'done', { type: 'check' }),
            UI.btn('Quitar', { cls: 'ghost small danger', onclick: function () { a.agreements.splice(i, 1); silent(); paintAg(); } })));
        });
        agBox.appendChild(UI.btn('Agregar un acuerdo', { icon: 'plus', cls: 'ghost', onclick: function () { a.agreements.push({ what: '', who: 'comunidad', due: '', done: false }); silent(); paintAg(); } }));
      }
      paintAg();
      var saveBtn = UI.btn(isNew ? 'Guardar el acta' : 'Guardar los cambios', { icon: 'check', cls: 'primary', onclick: function () {
        if (!a.date) { UI.toast('Falta la fecha de la reunión.', 'bad'); return; }
        saveBtn.disabled = true;
        storeFile(a, st.file).then(function () {
          if (isNew) repo().actas.push(a);
          silent(); var f = st.file; st.editing = null; st.file = null; paint();
          UI.toast('Acta guardada en este dispositivo.', 'ok');
          if (RF.drive && RF.drive.auto()) driveSave('acta', a, f).then(function (r) { if (r) { a.drive = { fileId: r.fileId, url: r.url, at: new Date().toISOString() }; silent(); paint(); } }).catch(function () { });
        });
      } });
      box.appendChild(UI.section(isNew ? 'Agregar un acta' : 'Editar el acta', [
        h('div', { class: 'form-grid' }, UI.field('Fecha de la reunión', a, 'date', { type: 'date' }), UI.field('Modalidad', a, 'mode', { type: 'select', noEmpty: true, options: MODES }), UI.field('Lugar', a, 'place', { type: 'text', ph: 'Ej: Sede de la comunidad' }),
          UI.field('Estado del acta', a, 'state', { type: 'select', noEmpty: true, options: ACTA_STATES })),
        h('h3', { class: 'grp' }, 'Quiénes asistieron'),
        h('div', { class: 'form-grid' }, UI.field('Representantes de CORFO', a.asistentes, 'corfo', { type: 'number', min: 0, onChange: paintWarn }), UI.field('Representantes de la comunidad', a.asistentes, 'comunidad', { type: 'number', min: 0, onChange: paintWarn }), UI.field('Representantes del Organismo Colaborador', a.asistentes, 'oc', { type: 'number', min: 0, onChange: paintWarn }),
          UI.field('Nombres (opcional)', a, 'names', { type: 'textarea', rows: 2, cls: 'wide' })), warn,
        h('h3', { class: 'grp' }, 'Lo que se conversó'), UI.field('Temas tratados', a, 'topics', { type: 'textarea', rows: 4, cls: 'wide' }),
        h('h3', { class: 'grp' }, 'Acuerdos y compromisos'), agBox,
        h('h3', { class: 'grp' }, 'El acta firmada'), h('div', { class: 'field wide' }, fileButton(st, paint, 'Subir el acta (PDF o foto)')),
        UI.field('Nota (opcional)', a, 'note', { type: 'textarea', rows: 2, cls: 'wide' }),
        h('div', { class: 'row-actions' }, saveBtn, UI.btn('Cancelar', { cls: 'ghost', onclick: function () { st.editing = null; st.file = null; paint(); } }))]));
      return box;
    }

    function listView() {
      var box = h('div'), actas = repo().actas.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }), today = U.todayISO();
      box.appendChild(UI.callout('info', 'Qué es una Mesa de Trabajo:', ' una reunión de coordinación entre CORFO, la comunidad y el Organismo Colaborador, con al menos dos representantes de cada uno. CORFO revisa las actas, así que conviene guardarlas firmadas y anotar sus compromisos.'));
      box.appendChild(h('div', { class: 'row-actions' }, UI.btn('Agregar un acta', { icon: 'plus', cls: 'primary', onclick: function () { st.rec = newActa(); st.editing = st.rec.id; st.file = null; paint(); } })));
      /* compromisos pendientes */
      var pend = []; actas.forEach(function (a) { (a.agreements || []).forEach(function (x) { if (!x.done && (x.what || '').trim()) pend.push({ a: a, x: x }); }); });
      pend.sort(function (p, q) { return String(p.x.due || '9999').localeCompare(String(q.x.due || '9999')); });
      if (pend.length) box.appendChild(UI.section('Compromisos pendientes (' + pend.length + ')', [h('ul', { class: 'timeline' }, pend.map(function (p) {
        var late = p.x.due && p.x.due < today;
        return h('li', null, h('div', { class: 'tl-h' }, p.x.what), h('div', { class: 'muted small' }, 'Responsable: ' + (fromName(p.x.who) || '—') + ' · Plazo: ' + (p.x.due ? U.fmtDate(p.x.due) : 'sin plazo') + ' · Acta del ' + (p.a.date ? U.fmtDate(p.a.date) : '—')),
          late ? UI.badge('Vencido', 'bad') : null, UI.field('Cumplido', p.x, 'done', { type: 'check', onChange: paint }));
      }))]));
      var rows = actas.map(function (a) {
        var st2 = (ACTA_STATES.filter(function (x) { return x.id === a.state; })[0] || {}).name || '', as = a.asistentes || {}, low = ['corfo', 'comunidad', 'oc'].some(function (k) { return as[k] !== '' && as[k] != null && Number(as[k]) < 2; });
        return h('tr', null,
          h('td', { 'data-label': 'Fecha' }, a.date ? U.fmtDateShort(a.date) : '—'),
          h('td', { 'data-label': 'Acta' }, h('strong', null, (MODES.filter(function (m) { return m.id === a.mode; })[0] || {}).name || 'Reunión'), h('div', { class: 'muted small' }, (a.place || 'Sin lugar') + ' · ' + (as.corfo || 0) + ' CORFO, ' + (as.comunidad || 0) + ' comunidad, ' + (as.oc || 0) + ' Organismo Colaborador'), low ? UI.badge('Asistencia bajo el mínimo', 'warn') : null),
          h('td', { 'data-label': 'Estado' }, UI.badge(st2, a.state === 'observada' ? 'bad' : a.state === 'revisada' ? 'ok' : 'info')),
          h('td', { 'data-label': 'Acuerdos' }, (a.agreements || []).filter(function (x) { return !x.done; }).length + ' pendientes de ' + (a.agreements || []).length),
          h('td', { 'data-label': 'En el Drive' }, a.drive && a.drive.url ? h('a', { href: a.drive.url, target: '_blank', rel: 'noopener' }, 'Abrir') : (RF.drive && RF.drive.enabled() ? UI.btn('Guardar', { cls: 'ghost small', onclick: function () { driveSave('acta', a, null).then(function (r) { if (r) { a.drive = { fileId: r.fileId, url: r.url, at: new Date().toISOString() }; silent(); paint(); } }).catch(function () { }); } }) : '—')),
          h('td', { 'data-label': 'Acciones' }, h('div', { class: 'row-actions' },
            a.blobId ? UI.btn('Ver acta', { cls: 'ghost small', onclick: function () { openBlob(a.blobId, a.fileName); } }) : null,
            UI.btn('Editar', { cls: 'ghost small', onclick: function () { st.rec = a; st.editing = a.id; st.file = null; paint(); } }),
            UI.btn('Borrador', { cls: 'ghost small', title: 'Sacar un borrador del acta en Excel, Word o PDF', onclick: function () { RF.exp.printDoc(actaDoc(a)); } }),
            UI.btn('Borrar', { cls: 'ghost small danger', onclick: function () { UI.confirmBox('¿Borrar esta acta de la app? Lo que ya está en el Drive no se borra.', 'Borrar').then(function (ok) { if (!ok) return; if (a.blobId) RF.blobs.del(a.blobId); repo().actas.splice(repo().actas.indexOf(a), 1); silent(); paint(); }); } }))));
      });
      box.appendChild(UI.section('Tus actas', [rows.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'plain-grid list-grid' }, h('thead', null, h('tr', null, ['Fecha', 'Acta', 'Estado', 'Acuerdos', 'En el Drive', ''].map(function (x) { return h('th', null, x); }))), h('tbody', null, rows))) : UI.empty('Aún no guardas actas. Agrega la primera.')]));
      if (actas.length) box.appendChild(UI.section('Sacar el registro', [UI.exportBar(actasDoc, 'registro-actas')]));
      return box;
    }
    paint();
    return page('Actas de mesas de trabajo', 'Guarda las actas de las mesas entre CORFO, la comunidad y el Organismo Colaborador, y sigue sus compromisos.', root);
  } };

  RF.repo = { DOC_TYPES: DOC_TYPES, TYPE_BY_ID: TYPE_BY_ID, mimeOf: mimeOf, docsDoc: docsDoc, actasDoc: actasDoc, actaDoc: actaDoc };
})(typeof window !== 'undefined' ? window : globalThis);
