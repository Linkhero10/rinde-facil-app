/* Rinde Fácil — rendición: anotar gastos (a mano o con foto), cuadre entre trámites, resumen por cuentas, observaciones y conexión a la nube. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, D = RF.data, L = RF.logic, h = U.h, num = U.parseCLP;
  var TOOLS = RF.tools = RF.tools || {};

  function page(title, lead, kids) { return h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, title), lead ? h('p', { class: 'lead' }, lead) : null, kids); }
  function ctx() { return RF.forms.ctxNow(); }
  function needProject() { return UI.callout('warn', 'Primero crea tu proyecto.', ' Ve a «Mi comunidad y proyectos» y agrega el primero.'); }
  function silent() { RF.store.update(function () { }, { silent: true }); }
  var STATUS_LABEL = { ok: 'Listo', warn: 'Revisar', error: 'Pendiente' };

  function newExpense() {
    return { id: U.uid('g'), cuenta: 'operacion', item: '', docType: 'boleta', folio: '', fecha: '', fechaPago: '', rutProveedor: '', proveedor: '', nombreComercial: '', neto: '', iva: '', otrosImpuestos: '', total: '', montoRendir: '', pctUso: '', formaPago: 'transferencia', glosa: '', actId: '', has: {}, esViatico: false, servicioTecnico: false, esInmueble: false, verified: false, ocr: null, imgId: null, createdAt: new Date().toISOString() };
  }
  function addExpenseWithReceipt(project, file) {
    if (!project || !Array.isArray(project.expenses) || !file) return Promise.reject(new Error('Falta el proyecto o la foto del comprobante.'));
    var e = newExpense(); e.imgId = 'img-' + e.id; e.imgType = file.type; e.fileName = String(file.name || '').slice(0, 120);
    return RF.blobs.put(e.imgId, file).then(function () {
      project.expenses.push(e);
      silent();
      return e;
    });
  }
  function syncRendir(e, community) { if (!e._manualRendir && num(e.total) > 0) e.montoRendir = L.expectedMontoRendir(e, community); }

  /* ---------- rendición en formato SGP ---------- */
  function rendicionDoc(project, community) {
    var hasPeriod = project.periodoInicio || project.periodoFin;
    if (hasPeriod && (!project.periodoInicio || !project.periodoFin || project.periodoInicio > project.periodoFin)) throw new Error('Completa un período de rendición válido antes de exportar.');
    var selected = (project.expenses || []).filter(function (e) { return !hasPeriod || (e.fecha && e.fecha >= project.periodoInicio && e.fecha <= project.periodoFin); });
    var excluded = (project.expenses || []).length - selected.length;
    var res = L.reconcile(project, community, U.todayISO(), RF.holidays.all());
    var ev = {}; res.evals.forEach(function (x) { ev[x.e.id] = x.r; });
    var bad = res.evals.filter(function (x) { return selected.indexOf(x.e) >= 0 && x.r.status === 'error'; }).length;
    var rows = selected.slice().sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }).map(function (e) {
      var per = e.fecha ? e.fecha.slice(0, 7) + '-01' : '';
      return [project.code || project.name, (D.CUENTA_BY_ID[e.cuenta] || {}).sgp || '', 'CORFO', e.item || '', per, num(e.montoRendir), (D.FORMAS_PAGO.filter(function (f) { return f.id === e.formaPago; })[0] || {}).name || '', (D.DOC_BY_ID[e.docType] || {}).name || '', e.folio, e.rutProveedor ? U.rutFormat(e.rutProveedor) : '', e.proveedor, e.glosa, STATUS_LABEL[(ev[e.id] || {}).status] || ''];
    });
    return { title: (bad ? 'BORRADOR · ' : '') + 'Rendición de gastos', subtitle: (project.name || '') + (project.code ? ' · ' + project.code : '') + (project.periodoInicio ? ' · período ' + U.fmtDateShort(project.periodoInicio) + ' al ' + U.fmtDateShort(project.periodoFin) : ''), sheet: 'Rendición', footer: 'Generado con Rinde Fácil. Sirve para ingresar cada gasto en SGP, uno a uno, con los datos exactos del documento.' + (bad ? ' ATENCIÓN: hay ' + bad + ' gasto(s) con errores; corrígelos antes de enviar.' : '') + ' ' + excluded + ' gasto(s) fuera del período o sin fecha excluidos; siguen guardados en el proyecto.', blocks: [
      { t: 'table', head: ['Proyecto', 'Cuenta', 'Fuente', 'Ítem', 'Período', 'Monto rendido ($)', 'Forma de pago', 'Tipo de documento', 'N° documento', 'RUT proveedor', 'Proveedor', 'Glosa', 'Estado'], types: ['text', 'text', 'text', 'text', 'date', 'money', 'text', 'text', 'text', 'text', 'text', 'text', 'text'], rows: rows, foot: ['Total', '', '', '', '', 'SUM', '', '', '', '', '', '', ''] },
      { t: 'p', text: excluded + ' gasto(s) fuera del período o sin fecha se excluyeron; siguen guardados en el proyecto.' }
    ] };
  }
  function expedienteDoc(project, community) {
    var rows = (project.expenses || []).map(function (e, i) {
      var rq = L.requirements(e, project, community);
      return [i + 1, e.proveedor, ((D.DOC_BY_ID[e.docType] || {}).name || '') + ' N° ' + e.folio, num(e.montoRendir), rq.map(function (r) { return (r.met ? '[x] ' : '[ ] ') + r.label; }).join('\n') || 'Sin respaldos adicionales'];
    });
    return { title: 'Carpeta de respaldos por gasto', subtitle: project.name, sheet: 'Expediente', footer: 'Generado con Rinde Fácil. Arma tu expediente físico o digital siguiendo esta lista: cada gasto con todos sus papeles.', blocks: [{ t: 'table', head: ['N°', 'Proveedor', 'Documento', 'Monto ($)', 'Respaldos que pide el Manual ([x] = ya lo tienes)'], types: ['num', 'text', 'text', 'money', 'text'], rows: rows, foot: ['', 'Total', '', 'SUM', ''] }] };
  }

  /* ================= Gastos ================= */
  TOOLS.gastos = { title: 'Gastos y rendición', icon: 'money', desc: 'Anota cada gasto a mano o con foto del comprobante. Te avisa qué falta.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('Gastos y rendición', '', needProject());
    var st = { editing: (RF.app && RF.app.pendingEdit) || null, filter: (RF.app && RF.app.pendingFilter) || 'all' }; if (RF.app) { RF.app.pendingFilter = null; RF.app.pendingEdit = null; }
    TOOLS.gastos.reset = function () { st.editing = null; }; /* lo usa el menú: tocar «Gastos» vuelve a la lista */
    var root = h('div');
    var fileInput = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, class: 'sr-only', 'aria-label': 'Elegir fotos o PDF de comprobantes' });
    var camInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', 'aria-label': 'Sacar foto al comprobante' });
    function paint() { U.clear(root); root.appendChild(fileInput); root.appendChild(camInput); if (st.editing) paintEditor(); else paintList(); }

    function refreshIfList() { if (!st.editing && root.isConnected !== false && document.body.contains(root)) paint(); }
    /* ---- procesar fotos ---- */
    function handleFiles(files) {
      files = Array.prototype.slice.call(files || []); if (!files.length) return;
      var made = [], i = 0, movedCount = 0;
      function next() {
        if (i >= files.length) {
          made = made.filter(function (id) { return p.expenses.some(function (x) { return x.id === id; }); }); /* los respaldos que se movieron solos ya no son gastos */
          if (!made.length && !movedCount) UI.toast('No se agregó ningún comprobante: no se pudo guardar la foto en este dispositivo.', 'bad');
          else if (made.length) UI.toast(made.length + ' comprobante(s) agregado(s). Revísalos uno por uno.', 'ok');
          if (made.length === 1) st.editing = made[0]; paint(); return Promise.resolve();
        }
        var file = files[i++];
        return addExpenseWithReceipt(p, file).then(function (e) {
          made.push(e.id); e._reading = true;
          if (!RF.cloud.configured()) { e._reading = false; e._ocrNote = 'Anota los datos mirando la foto. Para leerla automáticamente, conecta el servicio en la nube.'; return null; }
          return ocrJob(file, e, files.length > 1 ? 'Leyendo el comprobante ' + i + ' de ' + files.length : 'Leyendo el comprobante').then(function (res) { if (e._doc) return autoFile(e).then(function (moved) { if (moved) movedCount++; }); });
        }).catch(function (err) {
          UI.toast('No se agregó este gasto porque no se pudo guardar su comprobante (' + (err.message || err) + ').', 'bad');
        }).then(next);
      }
      UI.toast('Agregando ' + files.length + ' archivo(s)…');
      next();
    }
    /* lectura en la nube con barra de progreso: preparar → enviar y leer → ordenar */
    var STAGES = [{ id: 'prep', label: 'Preparando la foto…', from: 0, to: 12, tau: 1.5 }, { id: 'read', label: 'Enviando la foto y leyéndola con Google…', from: 12, to: 88, tau: 9 }, { id: 'parse', label: 'Ordenando los datos…', from: 88, to: 98, tau: 1 }];
    function ocrJob(file, e, title) {
      var b = UI.busy(title, STAGES);
      return RF.ocr.recognize(file, b.stage).then(function (res) {
        b.stage('parse', 'Ordenando los datos…');
        applyOcr(e, res);
        if (res && res.ok) b.done('Listo. Compara los datos con la foto.'); else b.fail('Google no pudo leer esta foto (' + ((res && res.error) || 'error') + '). Anota los datos a mano.');
        e._reading = false; refreshIfList();
        return res;
      }).catch(function (err) {
        e._ocrNote = 'No se pudo leer la foto automáticamente: ' + RF.cloud.humanError(err) + ' Anota los datos mirando la foto, o usa «Leer de nuevo» cuando vuelva la conexión.';
        b.fail('No se pudo leer (' + (err.message || err) + '). Anota los datos mirando la foto.');
        e._reading = false; refreshIfList();
      });
    }
    function applyOcr(e, res) {
      if (!res || !res.ok) { e._ocrNote = (/no devolvi[oó] texto|SIN_TEXTO/i.test(String((res && res.error) || '')) ? 'No se pudo leer texto en la foto. Prueba con otra más clara, de frente y con buena luz, o anota los datos mirando la foto.' : 'No se pudo leer la foto (' + String((res && res.error) || 'error desconocido').replace(/\.+$/, '') + '). Anota los datos mirando la foto.'); return; }
      var out = RF.ocr.toExpenseFields(res.raw_text, 'cloud_vision', { communityRut: c.community && c.community.rut, communityName: c.community && c.community.name }), f = out.fields;
      Object.keys(f).forEach(function (k) { e[k] = f[k]; });
      e._doc = out.document || null; /* cartola, cheque, F29…: no es un gasto */
      if (!f.docType && f.total != null) e.docType = e.docType || 'boleta';
      e.ocr = { engine: res.engine || 'cloud_vision', at: new Date().toISOString(), raw: String(res.raw_text || '').slice(0, 6000), confidence: res.confidence == null ? null : res.confidence, ms: res.duration_ms || null, note: out.note, auto: JSON.parse(JSON.stringify(f)) };
      if (!e.fechaPago && e.fecha && /^(debito|tarjeta|prepago)$/.test(e.formaPago || '')) e.fechaPago = e.fecha; /* pago con tarjeta: se paga al comprar */
      e.verified = false; e._manualRendir = false; syncRendir(e, c.community);
      e._ocrNote = 'Leído con Google Cloud Vision. Compara cada dato con la foto antes de seguir.' + (out.note ? ' ' + out.note : '');
      silent();
    }
    camInput.addEventListener('change', function () { handleFiles(camInput.files); camInput.value = ''; });

    /* ---- un respaldo subido como si fuera un gasto ---- */
    function guessTarget(src) {
      var raw = String((src.ocr && src.ocr.raw) || '').replace(/\s+/g, ' '), best = null, bestScore = 0;
      p.expenses.forEach(function (x) {
        if (x.id === src.id || x._doc) return;
        var sc = 0, tot = num(x.total) > 0 ? U.fmtNum(num(x.total)) : '';
        if (tot && raw.indexOf(tot) >= 0) sc += 5;
        String(x.proveedor || '').toUpperCase().split(/\s+/).filter(function (w) { return w.length >= 5; }).forEach(function (w) { if (raw.toUpperCase().indexOf(w) >= 0) sc += 1; });
        if (sc > bestScore) { bestScore = sc; best = x; }
      });
      return best;
    }
    function moveToAttachment(src, tgt, key, label, opts) {
      return RF.blobs.get(src.imgId).then(function (blob) {
        if (!blob) throw new Error('La foto ya no está en este dispositivo.');
        var k = key || ('extra-' + U.uid('x')), id = 'att-' + tgt.id + '-' + k;
        return RF.blobs.put(id, blob).then(function () {
          tgt.attach = tgt.attach || {}; tgt.attach[k] = { id: id, name: label, type: blob.type || '', at: new Date().toISOString(), extra: !key, key: key || null, auto: !!(opts && opts.auto), doc: src._doc || null, from: JSON.parse(JSON.stringify(src)) };
          if (key) { tgt.has = tgt.has || {}; tgt.has[key] = true; }
          RF.blobs.del(src.imgId);
          p.expenses = p.expenses.filter(function (x) { return x.id !== src.id; });
          silent();
          if (RF.drive && RF.drive.auto() && tgt.fecha) RF.drive.saveAttachment(tgt, p, k, label, blob, false).then(function (r) { if (r && r.remote && tgt.attach && tgt.attach[k]) { tgt.attach[k].driveUrl = r.url || ''; silent(); } }).catch(function () { });
          return tgt;
        });
      });
    }
    /* deshacer: el archivo vuelve a la lista como un gasto, tal como estaba */
    function undoMove(tgt, k) {
      var a = tgt.attach && tgt.attach[k]; if (!a || !a.from) return Promise.reject(new Error('No hay nada que deshacer.'));
      return RF.blobs.get(a.id).then(function (blob) {
        if (!blob) throw new Error('El archivo ya no está en este dispositivo.');
        var src = a.from; src._doc = null; src._reading = false; src.imgId = 'img-' + src.id;
        return RF.blobs.put(src.imgId, blob).then(function () {
          RF.blobs.del(a.id); if (a.key && tgt.has) tgt.has[a.key] = false; delete tgt.attach[k];
          p.expenses.push(src); silent();
        });
      });
    }
    function notices() { var app = RF.app || {}; return (app.notices = app.notices || []); }
    function noticesBox() {
      return notices().map(function (n) {
        return h('div', { class: 'callout info moved-notice', role: 'status' }, h('span', null, n.text + ' '),
          UI.btn('Deshacer', { cls: 'ghost small', onclick: function () { undoMove(n.tgt, n.key).then(function () { notices().splice(notices().indexOf(n), 1); UI.toast('Listo: el archivo volvió a la lista como gasto.', 'ok'); paint(); }).catch(function (er) { UI.toast(RF.cloud.humanError(er), 'bad'); }); } }),
          UI.btn('Entendido', { cls: 'ghost small', onclick: function () { notices().splice(notices().indexOf(n), 1); paint(); } }));
      });
    }
    /* un respaldo reconocido se adjunta solo al gasto que corresponde (por monto o proveedor, o si es el único que lo pide) y se avisa con la opción de deshacer */
    function autoFile(e) {
      var d = e._doc; if (!d) return Promise.resolve(false);
      var tgt = guessTarget(e);
      if (!tgt && d.key) {
        var cands = p.expenses.filter(function (x) { return x.id !== e.id && !x._doc && !(x.has && x.has[d.key]) && L.evaluateExpense(x, p, c.community, p.expenses).requirements.some(function (q) { return q.key === d.key; }); });
        if (cands.length === 1) tgt = cands[0];
      }
      if (!tgt) return Promise.resolve(false);
      var fname = e.fileName || 'El archivo', k = null;
      return moveToAttachment(e, tgt, d.key, d.label, { auto: true }).then(function () {
        Object.keys(tgt.attach).forEach(function (kk) { if (tgt.attach[kk].from && tgt.attach[kk].from.id === e.id) k = kk; });
        notices().push({ tgt: tgt, key: k, text: '«' + fname + '» parece ser ' + d.label.toLowerCase() + ' y se adjuntó al gasto «' + (tgt.proveedor || 'sin proveedor') + (tgt.folio ? ' N° ' + tgt.folio : '') + '». Si fue un error, puedes deshacerlo aquí o abrir ese gasto y quitar el adjunto.' });
        return true;
      }).catch(function () { return false; });
    }
    function respaldoBox(src) {
      var d = src._doc, targets = p.expenses.filter(function (x) { return x.id !== src.id && !x._doc; }), guess = guessTarget(src);
      var sel = h('select', { 'aria-label': 'Gasto al que pertenece' }, targets.map(function (x) { return h('option', { value: x.id }, (x.proveedor || 'Sin proveedor') + (x.folio ? ' N° ' + x.folio : '') + ' · ' + U.fmtCLP(num(x.total))); }));
      if (guess) sel.value = guess.id;
      var box = h('div', { class: 'callout warn doc-respaldo', role: 'status' },
        h('strong', null, 'Esto parece un respaldo (' + d.label + '), no un gasto.'),
        h('span', null, ' Los respaldos se adjuntan al gasto que prueban: ' + (d.kind === 'contrato' ? 'queda guardado con ese gasto.' : 'así el gasto da por cumplido su «' + (D.RESPALDOS[d.key] || 'respaldo').toLowerCase() + '».')));
      if (!targets.length) { box.appendChild(h('p', { class: 'hint' }, 'Primero agrega el gasto al que pertenece y vuelve a subirlo.')); return box; }
      box.appendChild(h('div', { class: 'row-actions' }, h('label', { class: 'field' }, h('span', { class: 'lbl' }, '¿A qué gasto pertenece?'), sel),
        UI.btn('Adjuntarlo a ese gasto', { cls: 'primary', onclick: function () {
          var tgt = p.expenses.filter(function (x) { return x.id === sel.value; })[0]; if (!tgt) return;
          moveToAttachment(src, tgt, d.key, d.label).then(function () { UI.toast('Adjunto agregado a «' + (tgt.proveedor || 'gasto') + '». Ya no aparece como gasto.', 'ok'); st.editing = null; paint(); }).catch(function (er) { UI.toast(RF.cloud.humanError(er), 'bad'); });
        } }),
        UI.btn('Sí es un gasto, dejarlo', { cls: 'ghost', onclick: function () { src._doc = null; silent(); paint(); } })));
      return box;
    }

    /* ---- lista ---- */
    /* cuándo se subió o anotó el gasto (los anteriores a este dato usan la hora de la lectura de la foto, si la hay) */
    function uploadedText(e) { var at = e.createdAt || (e.ocr && e.ocr.at); var d = at ? new Date(at) : null; var same = d && d.getFullYear() === new Date().getFullYear(); return d && !isNaN(d) ? d.toLocaleString('es-CL', same ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
    function emptyExpenses() { return p.expenses.filter(function (x) { return !String(x.proveedor || '').trim() && !String(x.folio || '').trim() && !(num(x.total) > 0) && !String(x.glosa || '').trim() && !String(x.item || '').trim(); }); }
    function paintList() {
      var res = L.reconcile(p, c.community, U.todayISO(), RF.holidays.all());
      var evs = {}; res.evals.forEach(function (x) { evs[x.e.id] = x.r; });
      var totals = res.totals, tot = U.sum(p.expenses, function (e) { return num(e.montoRendir); });
      var counts = { ok: 0, warn: 0, error: 0 }; p.expenses.forEach(function (e) { counts[evs[e.id].status]++; });
      noticesBox().forEach(function (n) { root.appendChild(n); });
      root.appendChild(UI.section('', [h('div', { class: 'gastos-top' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-n' }, String(p.expenses.length)), h('span', null, 'gastos')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-n' }, U.fmtCLP(tot)), h('span', null, 'a rendir')),
        h('div', { class: 'stat ok' }, h('span', { class: 'stat-n' }, String(counts.ok)), h('span', null, 'listos')),
        h('div', { class: 'stat warn' }, h('span', { class: 'stat-n' }, String(counts.warn)), h('span', null, 'por revisar')),
        h('div', { class: 'stat bad' }, h('span', { class: 'stat-n' }, String(counts.error)), h('span', null, 'pendientes'))),
        h('div', { class: 'row-actions' },
          UI.btn('Sacar foto al comprobante', { icon: 'camera', cls: 'primary', onclick: function () { camInput.click(); } }),
          UI.btn('Subir foto o PDF', { icon: 'file', onclick: function () { fileInput.click(); } }),
          UI.btn('Anotar a mano', { icon: 'edit', onclick: function () { var e = newExpense(); p.expenses.push(e); silent(); st.editing = e.id; paint(); } }),
          emptyExpenses().length ? UI.btn('Quitar gastos vacíos (' + emptyExpenses().length + ')', { icon: 'trash', cls: 'ghost', title: 'Gastos sin datos, por ejemplo fotos que no se pudieron leer', onclick: function () { UI.confirmBox('¿Quitar ' + emptyExpenses().length + ' gasto(s) sin datos? Las fotos asociadas también se quitan.', 'Quitar').then(function (yes) { if (!yes) return; var ids = emptyExpenses().map(function (x) { return x.id; }); p.expenses.filter(function (x) { return ids.indexOf(x.id) >= 0 && x.imgId; }).forEach(function (x) { RF.blobs.del(x.imgId); }); p.expenses = p.expenses.filter(function (x) { return ids.indexOf(x.id) < 0; }); silent(); paint(); }); } }) : null),
        h('div', { class: 'expense-drop-wrap' }, UI.fileDrop(fileInput, { kind: 'expense', multiple: true, label: 'Suelta aquí las fotos o PDF', hint: 'Sube boletas, facturas y también tus respaldos (cartola, cheque, Formulario 29…): la app los reconoce y adjunta cada respaldo al gasto que prueba, avisándote. La foto se guarda en este dispositivo y, si el OCR está conectado, se envía para leerla. No va al Drive hasta que revises y confirmes.', invalidText: 'Ese archivo no se puede usar como comprobante. Elige una foto compatible o un PDF.', onFiles: handleFiles })),
        RF.cloud.configured() ? h('p', { class: 'hint' }, 'Las fotos se leen en la nube con Google Cloud Vision, en la cuenta de tu comunidad. Siempre tienes que revisar los datos.') : UI.callout('info', 'Lectura automática desactivada.', ' Puedes anotar los gastos a mano o conectar el servicio en la nube en «Nube y copias».')]));
      var chips = h('div', { class: 'chips' }, [['all', 'Todos'], ['error', 'Pendientes'], ['warn', 'Por revisar'], ['ok', 'Listos']].map(function (f) { return h('button', { type: 'button', class: 'chip' + (st.filter === f[0] ? ' on' : ''), onclick: function () { st.filter = f[0]; paint(); } }, f[1]); }));
      var rows = p.expenses.filter(function (e) { return st.filter === 'all' || evs[e.id].status === st.filter; }).slice().sort(function (a, b) { return String(b.fecha || 'z').localeCompare(String(a.fecha || 'z')); }).map(function (e) {
        var r = evs[e.id];
        return h('tr', { class: 'clickable', tabindex: 0, onclick: function () { st.editing = e.id; paint(); }, onkeydown: function (ev) { if (ev.key === 'Enter') { st.editing = e.id; paint(); } } },
          h('td', { 'data-label': 'Estado' }, e._reading ? UI.badge('Leyendo…', 'info') : UI.badge(STATUS_LABEL[r.status], r.status === 'ok' ? 'ok' : r.status === 'warn' ? 'warn' : 'bad')),
          h('td', { 'data-label': 'Fecha del documento' }, e.fecha ? U.fmtDateShort(e.fecha) : '—'), h('td', { 'data-label': 'Subido' }, uploadedText(e)), h('td', { 'data-label': 'Proveedor' }, e.proveedor || 'Sin proveedor'),
          h('td', { 'data-label': 'Documento' }, ((D.DOC_BY_ID[e.docType] || {}).name || '—') + (e.folio ? ' N° ' + e.folio : '')), h('td', { 'data-label': 'Cuenta' }, (D.CUENTA_BY_ID[e.cuenta] || {}).name || '—'),
          h('td', { class: 'r', 'data-label': 'A rendir' }, U.fmtCLP(num(e.montoRendir))), h('td', { 'data-label': 'Problemas' }, e._reading ? 'Leyendo la foto…' : e._doc ? 'Parece un respaldo' : r.errors ? r.errors + ' error(es)' : r.warns ? r.warns + ' aviso(s)' : '✓'));
      });
      root.appendChild(UI.section('Tus gastos', [p.expenses.length ? chips : null, p.expenses.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'plain-grid list-grid' }, h('thead', null, h('tr', null, ['Estado', 'Fecha del documento', 'Subido', 'Proveedor', 'Documento', 'Cuenta', 'A rendir', 'Problemas'].map(function (x, i) { return h('th', { class: i === 6 ? 'r' : '' }, x); }))), h('tbody', null, rows))) : UI.empty('Aún no anotas gastos. Saca una foto al primer comprobante o anótalo a mano.')]));
      /* totales por cuenta */
      root.appendChild(UI.section('Por cuenta', [h('div', { class: 'table-scroll' }, h('table', { class: 'plain-grid' }, h('thead', null, h('tr', null, ['Cuenta', 'Gastos', 'Rendido', 'Presupuesto'].map(function (x, i) { return h('th', { class: i ? 'r' : '' }, x); }))), h('tbody', null, D.CUENTAS.map(function (cu) { var x = totals[cu.id], tope = x.presupuestado > 0 ? x.presupuestado : x.aprobado; return h('tr', { class: tope > 0 && x.rendido > tope ? 'row-bad' : '' }, h('th', { scope: 'row' }, cu.name), h('td', { class: 'r' }, String(x.cantidad)), h('td', { class: 'r' }, U.fmtCLP(x.rendido)), h('td', { class: 'r' }, tope ? U.fmtCLP(tope) : '—')); }))))]));
      root.appendChild(UI.section('Sacar la rendición', [UI.exportBar(function () { return rendicionDoc(p, c.community); }, 'rendicion-gastos'), h('div', { class: 'row-actions' }, UI.btn('Carpeta de respaldos por gasto', { icon: 'list', onclick: function () { RF.exp.printDoc(expedienteDoc(p, c.community)); } }), UI.btn('Ver el cuadre completo', { icon: 'check', onclick: function () { location.hash = '#/h/revision'; } }))]));
    }

    /* foto con zoom al pasar el cursor (o al tocar en el celular), dentro del mismo marco */
    function zoomBox(src) {
      var img = h('img', { src: src, alt: 'Foto del comprobante', class: 'receipt-img', draggable: 'false' });
      var box = h('div', { class: 'zoom-wrap', 'aria-label': 'Foto del comprobante con zoom' }, img);
      function origin(cx, cy) { var r = box.getBoundingClientRect(); img.style.transformOrigin = Math.max(0, Math.min(100, (cx - r.left) / r.width * 100)) + '% ' + Math.max(0, Math.min(100, (cy - r.top) / r.height * 100)) + '%'; }
      var last = 'mouse';
      box.addEventListener('pointerenter', function (ev) { last = ev.pointerType || 'mouse'; if (last === 'mouse') { origin(ev.clientX, ev.clientY); box.classList.add('zooming'); } });
      box.addEventListener('pointermove', function (ev) { last = ev.pointerType || last; if (last === 'mouse') origin(ev.clientX, ev.clientY); });
      box.addEventListener('pointerleave', function (ev) { if ((ev.pointerType || 'mouse') === 'mouse') box.classList.remove('zooming'); });
      box.addEventListener('click', function (ev) { if (last === 'mouse') return; origin(ev.clientX, ev.clientY); box.classList.toggle('zooming'); });
      box.addEventListener('touchmove', function (ev) { if (box.classList.contains('zooming') && ev.touches[0]) { ev.preventDefault(); origin(ev.touches[0].clientX, ev.touches[0].clientY); } }, { passive: false });
      return box;
    }

    /* ---- editor ---- */
    function paintEditor() {
      var e = p.expenses.filter(function (x) { return x.id === st.editing; })[0];
      if (!e) { st.editing = null; paint(); return; }
      var issuesBox = h('div', { class: 'issues' }), reqBox = h('div'), calcBox = h('div');
      function refresh() {
        if (!(e._manualRendir)) syncRendir(e, c.community);
        var r = L.evaluateExpense(e, p, c.community, p.expenses);
        U.clear(issuesBox);
        r.issues.forEach(function (i) { issuesBox.appendChild(UI.callout(i.level === 'error' ? 'bad' : i.level === 'warn' ? 'warn' : 'info', '', i.msg)); });
        paintReq(r);
        var es = L.expectedMontoRendir(e, c.community); calcBox.textContent = num(e.total) > 0 ? 'Corresponde rendir: ' + U.fmtCLP(es) : '';
        silent();
      }
      function paintReq(r) {
        U.clear(reqBox);
        var has = L.effectiveHas(e, p);
        var extras = Object.keys(e.attach || {}).filter(function (k) { return e.attach[k] && e.attach[k].extra; });
        extras.forEach(function (k) { reqBox.appendChild(h('div', { class: 'req met' }, h('span', null, 'Otro adjunto: ' + e.attach[k].name + ' '), UI.btn('Quitar', { cls: 'ghost small', onclick: function () { RF.blobs.del(e.attach[k].id); delete e.attach[k]; silent(); paintReq(L.evaluateExpense(e, p, c.community, p.expenses)); } }))); });
        if (!r.requirements.length) { if (!extras.length) reqBox.appendChild(UI.empty('Este gasto no pide respaldos adicionales.')); return; }
        r.requirements.forEach(function (q) {
          var auto = has[q.key] && !(e.has && e.has[q.key]);
          var cb = h('input', { type: 'checkbox', checked: q.met, disabled: auto, id: 'rq-' + q.key });
          cb.addEventListener('change', function () { e.has = e.has || {}; e.has[q.key] = cb.checked; refresh(); });
          var extra = null;
          if (q.key === 'anexo3' && !has.anexo3) extra = UI.btn('Crear Anexo 3', { icon: 'form', cls: 'ghost', onclick: function () { var fl = RF.forms.getList(p, 'anexo3'); var d = RF.forms.SCHEMAS.anexo3.defaults(c); d.gastoId = e.id; RF.forms.SCHEMAS.anexo3.onChange('gastoId', d, c); fl.push({ id: U.uid('f'), data: d }); silent(); location.hash = '#/h/anexo3'; } });
          if (q.key === 'anexo4') extra = UI.btn('Crear Anexo 4', { icon: 'form', cls: 'ghost', onclick: function () { location.hash = '#/h/anexo4'; } });
          if (q.key === 'anexo5') extra = UI.btn('Abrir Anexo 5', { icon: 'form', cls: 'ghost', onclick: function () { location.hash = '#/h/anexo5'; } });
          if (q.key === 'anexo1') extra = UI.btn('Abrir Anexo 1', { icon: 'form', cls: 'ghost', onclick: function () { location.hash = '#/h/anexo1'; } });
          if (q.key === 'cotizaciones') extra = UI.btn('Comparar cotizaciones', { icon: 'scale', cls: 'ghost', onclick: function () { location.hash = '#/h/cotizaciones'; } });
          /* los respaldos que son un documento (no un anexo de la app) se pueden adjuntar: foto o PDF, queda en este equipo y va al Drive junto al comprobante */
          var attachable = !/^(anexo\d|cotizaciones)/.test(q.key);
          var att = e.attach && e.attach[q.key];
          if (attachable) {
            var pick = h('input', { type: 'file', accept: 'image/*,application/pdf', class: 'sr-only', 'aria-label': 'Adjuntar: ' + q.label });
            pick.addEventListener('change', function () {
              var f = pick.files && pick.files[0]; pick.value = ''; if (!f) return;
              var id = 'att-' + e.id + '-' + q.key;
              RF.blobs.put(id, f).then(function () {
                e.attach = e.attach || {}; e.attach[q.key] = { id: id, name: f.name || 'archivo', type: f.type || '', at: new Date().toISOString() };
                e.has = e.has || {}; e.has[q.key] = true; silent();
                if (RF.drive && RF.drive.auto() && e.fecha) RF.drive.saveAttachment(e, p, q.key, q.label, f, false).then(function (r) { if (r && r.remote && e.attach && e.attach[q.key]) { e.attach[q.key].driveUrl = r.url || ''; silent(); } paintReq(L.evaluateExpense(e, p, c.community, p.expenses)); }).catch(function () { });
                paintReq(L.evaluateExpense(e, p, c.community, p.expenses));
              }).catch(function () { UI.toast('No se pudo guardar el archivo en este dispositivo.', 'bad'); });
            });
            extra = h('span', { class: 'att' },
              att ? h('span', { class: 'muted' }, 'Adjunto: ' + att.name + ' ') : null,
              UI.btn(att ? 'Cambiar archivo' : 'Adjuntar archivo', { icon: 'file', cls: 'ghost', onclick: function () { pick.click(); } }),
              att ? UI.btn('Quitar', { cls: 'ghost small', onclick: function () { RF.blobs.del(att.id); delete e.attach[q.key]; if (e.has) e.has[q.key] = false; silent(); paintReq(L.evaluateExpense(e, p, c.community, p.expenses)); } }) : null, att && att.from ? UI.btn('Deshacer: volver a la lista', { cls: 'ghost small', title: 'El archivo vuelve a la lista de gastos', onclick: function () { undoMove(e, q.key).then(function () { UI.toast('El archivo volvió a la lista como gasto.', 'ok'); st.editing = null; paint(); }).catch(function (er) { UI.toast(RF.cloud.humanError(er), 'bad'); }); } }) : null, pick);
          }
          reqBox.appendChild(h('div', { class: 'req' + (q.met ? ' met' : '') }, h('label', { class: 'check', for: 'rq-' + q.key }, cb, h('span', null, q.label + (auto ? ' (ya lo tienes en la app)' : ''))), extra));
        });
      }
      /* foto */
      var photo = h('div', { class: 'photo-panel' });
      function paintPhoto() {
        U.clear(photo);
        if (!e.imgId) { photo.appendChild(UI.empty('Sin foto. Puedes agregar una para revisar los datos junto al documento.')); photo.appendChild(UI.btn('Agregar foto', { icon: 'camera', cls: 'ghost', onclick: function () { var inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment' }); inp.addEventListener('change', function () { var f = inp.files[0]; if (!f) return; var id = 'img-' + e.id; RF.blobs.put(id, f).then(function () { e.imgId = id; e.imgType = f.type; silent(); paintPhoto(); }).catch(function (err) { UI.toast('No se pudo guardar la foto; el gasto sigue sin comprobante (' + (err.message || err) + ').', 'bad'); }); }); inp.click(); } })); return; }
        RF.blobs.get(e.imgId).then(function (blob) {
          if (!blob) { photo.appendChild(UI.empty('La foto ya no está en este dispositivo.')); return; }
          var url = URL.createObjectURL(blob);
          if (/pdf/.test(blob.type)) photo.appendChild(h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, 'Abrir el PDF'));
          else { photo.appendChild(zoomBox(url)); photo.appendChild(h('p', { class: 'hint' }, 'Pasa el cursor sobre la foto para acercarla (en el celular, tócala y arrastra).')); }
          var acts = h('div', { class: 'row-actions' });
          if (RF.cloud.configured()) acts.appendChild(UI.btn(e.ocr ? 'Leer de nuevo' : 'Leer con la nube', { icon: 'cloud', cls: 'ghost', onclick: function (ev) { var bt = ev.currentTarget; bt.disabled = true; bt.querySelector('span').textContent = 'Leyendo…'; ocrJob(new File([blob], 'comprobante', { type: blob.type }), e, 'Leyendo el comprobante de nuevo').then(function () { paint(); }); } }));
          if (RF.cloud.configured()) acts.appendChild(UI.btn(e.driveId ? 'Ya está en el Drive' : 'Guardar en el Drive', { icon: 'cloud', cls: 'ghost', disabled: !!e.driveId, onclick: function () {
            RF.drive.archiveExpense(e, p, c.community).then(function () { paintPhoto(); }).catch(function () { });
          } }));
          acts.appendChild(UI.btn('Quitar foto', { icon: 'trash', cls: 'ghost danger', onclick: function () { RF.blobs.del(e.imgId); e.imgId = null; silent(); paintPhoto(); } }));
          photo.appendChild(acts);
        }).catch(function (err) { U.clear(photo); photo.appendChild(UI.callout('bad', 'No se pudo leer la foto del comprobante.', 'No significa que se haya borrado. Revisa el almacenamiento del dispositivo antes de continuar. ' + (err && err.message || err))); });
        if (e.ocr && e.ocr.raw) photo.appendChild(h('details', { class: 'ocr-raw' }, h('summary', null, 'Ver el texto que leyó la nube'), h('pre', null, e.ocr.raw)));
      }
      /* desde el gasto se crea (o se abre) su ficha técnica: C para inversión, D para recursos humanos */
      function fichaLink(x) {
        var kind = x.cuenta === 'inversion' ? 'informeC' : x.cuenta === 'rrhh' ? 'informeD' : '';
        if (!kind || !(x.proveedor || x.total)) return null;
        var existe = (p.forms && Array.isArray(p.forms[kind]) ? p.forms[kind] : []).some(function (f) { var d = f.data || {}; return kind === 'informeC' ? d.gastoId === x.id : (x.rutProveedor && d.rut && String(d.rut).replace(/[^0-9kK]/g, '').toUpperCase() === String(x.rutProveedor).replace(/[^0-9kK]/g, '').toUpperCase()); });
        var label = kind === 'informeC' ? 'Ficha C del activo' : 'Ficha D de la persona';
        return h('div', { class: 'row-actions fichalink' }, UI.btn((existe ? 'Abrir la ' : 'Crear la ') + label.toLowerCase(), { icon: 'form', cls: 'ghost', onclick: function () {
          RF.forms.ficha(p, kind, function (d) { return kind === 'informeC' ? d.gastoId === x.id : !!(x.rutProveedor && d.rut && String(d.rut).replace(/[^0-9kK]/g, '').toUpperCase() === String(x.rutProveedor).replace(/[^0-9kK]/g, '').toUpperCase()); },
            kind === 'informeC' ? { gastoId: x.id, nombre: x.glosa || x.proveedor || '', proveedor: x.proveedor || '', rendido: num(x.montoRendir || x.total) || '', desde: x.fecha || '', actId: x.actId || '' }
              : { nombre: x.proveedor || '', rut: x.rutProveedor || '', tipo: x.docType === 'honorarios' ? 'honorarios' : 'contrato', funcion: x.glosa || '' });
          if (RF.activity) RF.activity.log('ficha', (existe ? 'Abrió' : 'Creó') + ' la ' + label.toLowerCase() + ' desde el gasto «' + (x.proveedor || 'sin proveedor') + '».', kind);
          location.hash = '#/h/' + kind; }}), h('span', { class: 'hint' }, existe ? 'Ya existe: se abre con sus datos.' : 'Se crea con los datos de este gasto y la completas allí.'));
      }
      var fld = function (label, key, opts) { opts = opts || {}; opts.onChange = function (v) { if (key === 'montoRendir') e._manualRendir = true; if (opts.after) opts.after(v); refresh();
        /* al confirmar que revisó el comprobante, la foto original se archiva sola en el Drive, en la carpeta del mes */
        if (key === 'verified' && v && RF.activity) RF.activity.log('gasto', 'Revisó contra el documento el gasto «' + (e.proveedor || 'sin proveedor') + (e.folio ? ' N° ' + e.folio : '') + '».', 'gastos');
        if (key === 'verified' && v && e.fecha && RF.drive.auto()) RF.drive.archiveExpense(e, p, c.community).then(function () { paintPhoto(); }).catch(function () { }); }; return UI.field(label, e, key, opts); };
      var docOpts = D.DOC_TYPES.map(function (d) { return { id: d.id, name: d.name }; });
      var actOpts = [{ id: '', name: 'Sin actividad' }].concat(L.allActivities(p).map(function (x) { return { id: x.act.id, name: x.act.name || '(sin nombre)' }; }));
      var form = h('div', null,
        e._doc ? respaldoBox(e) : null,
        e._ocrNote ? UI.callout('info', '', e._ocrNote) : null,
        h('h3', { class: 'grp' }, '1. El documento'),
        h('div', { class: 'form-grid' }, fld('Tipo de documento', 'docType', { type: 'select', options: docOpts, noEmpty: true, cls: 'span2' }), fld('Número (folio)', 'folio', { type: 'text' }), fld('Fecha del documento', 'fecha', { type: 'date' }), fld('Nombre del proveedor', 'proveedor', { type: 'text', cls: 'wide' }), fld('Nombre comercial o local (opcional)', 'nombreComercial', { type: 'text', cls: 'wide', hint: 'Solo para reconocerlo; el proveedor es quien tiene el RUT.' }), fld('RUT del proveedor', 'rutProveedor', { type: 'rut' })),
        h('h3', { class: 'grp' }, '2. Los montos'),
        h('div', { class: 'form-grid' }, fld('Monto neto ($)', 'neto', { type: 'money' }), fld('IVA ($)', 'iva', { type: 'money' }), fld('Otros impuestos ($)', 'otrosImpuestos', { type: 'money', hint: 'Solo si el total incluye impuestos que no son IVA, como el de los combustibles.' }), fld('Total del documento ($)', 'total', { type: 'money' }),
          h('div', { class: 'field wide' }, h('div', { class: 'row-actions' },
            UI.btn('Calcular IVA y total desde el neto', { cls: 'ghost', onclick: function () { var n = num(e.neto); e.iva = Math.round(n * D.REGLAS.IVA); e.total = n + e.iva; paint(); } }),
            UI.btn('Calcular neto e IVA desde el total', { cls: 'ghost', onclick: function () { var t = num(e.total); e.neto = Math.round(t / (1 + D.REGLAS.IVA)); e.iva = t - e.neto; paint(); } }))),
          e.cuenta === 'administracion' ? fld('Porcentaje que corresponde al proyecto (%)', 'pctUso', { type: 'pct', hint: 'Si el gasto es compartido, se pide el Anexo 5.' }) : null,
          fld('Monto a rendir ($)', 'montoRendir', { type: 'money' }), h('div', { class: 'field calc-field' }, h('span', { class: 'lbl' }, 'Según tu situación de IVA'), calcBox,
            UI.btn('Usar ese monto', { cls: 'ghost', onclick: function () { e._manualRendir = false; syncRendir(e, c.community); paint(); } }))),
        h('h3', { class: 'grp' }, '3. Dónde va'),
        h('div', { class: 'form-grid' }, fld('Cuenta', 'cuenta', { type: 'select', options: D.CUENTAS.map(function (x) { return { id: x.id, name: x.name }; }), noEmpty: true, after: function () { paint(); } }), fld('Actividad de tu Gantt', 'actId', { type: 'select', options: actOpts, noEmpty: true }), fld('Ítem del presupuesto', 'item', { type: 'text', ph: 'Ej: Materiales' }),
          fld('Glosa: qué compraste y para qué', 'glosa', { type: 'textarea', rows: 2, cls: 'wide', counter: D.REGLAS.GLOSA_MAX, counterWarn: D.REGLAS.GLOSA_AVISO })),
        h('p', { class: 'hint' }, '¿No sabes en qué cuenta va? ', h('a', { href: '#/h/cuentas' }, 'Mira la ayuda para elegirla'), '.'),
        h('h3', { class: 'grp' }, '4. El pago'),
        h('div', { class: 'form-grid' }, fld('Forma de pago', 'formaPago', { type: 'select', options: D.FORMAS_PAGO, noEmpty: true }), fld('Fecha del pago', 'fechaPago', { type: 'date' })),
        h('h3', { class: 'grp' }, '5. Marcas'),
        h('details', { class: 'nofin', open: Object.keys(e.noFin || {}).some(function (k) { return e.noFin[k]; }) }, h('summary', null, '¿Se puede pagar con el aporte?'), h('p', { class: 'hint' }, 'Marca solo si el gasto es de alguno de estos tipos (el Manual dice que no se financian):'), h('div', { class: 'checks' }, (e.noFin = e.noFin || {}, D.NO_FINANCIABLE.map(function (t, i) { return UI.field(t, e.noFin, 'k' + i, { type: 'check', onChange: refresh }); })))),
        h('div', { class: 'checks' }, fld('Es un viático o viaje', 'esViatico', { type: 'check' }), fld('Es un servicio técnico-profesional (no pide cotizaciones)', 'servicioTecnico', { type: 'check' }), e.cuenta === 'inversion' ? fld('Es un inmueble o derechos de agua', 'esInmueble', { type: 'check' }) : null),
        fichaLink(e),
        h('h3', { class: 'grp' }, '6. Respaldos que hay que guardar'), reqBox,
        h('h3', { class: 'grp' }, '7. Revisión humana'),
        fld('Comparé cada dato con el documento original y está correcto', 'verified', { type: 'check', hint: e.ocr ? 'Obligatorio: los datos leídos por la nube pueden tener errores (por ejemplo, un dígito del RUT).' : '' }),
        RF.cloud.configured() ? h('div', { class: 'row-actions' }, UI.btn(e.driveFichaAt ? 'Actualizar la ficha en el Drive' : 'Guardar la ficha en el Drive', { icon: 'cloud', cls: 'ghost', onclick: function () { RF.drive.saveFicha(e, p, c.community).then(function () { paint(); }).catch(function () { }); } }), h('span', { class: 'hint' }, 'La ficha es un texto con todos los datos de este gasto y lo que leyó la nube. Se guarda sola al marcar la revisión; usa este botón si cambias algo después.')) : null);
      var head = h('div', { class: 'row-actions between' }, UI.btn('← Volver a la lista', { cls: 'ghost', onclick: function () { st.editing = null; paint(); } }),
        h('div', { class: 'row-actions' }, UI.btn('Duplicar', { icon: 'copy', cls: 'ghost', onclick: function () { var d = U.deepClone(e); d.id = U.uid('g'); d.imgId = null; d.verified = false; d.folio = ''; p.expenses.push(d); silent(); st.editing = d.id; paint(); UI.toast('Gasto duplicado (sin foto ni número).', 'ok'); } }),
          UI.btn('Borrar gasto', { icon: 'trash', cls: 'ghost danger', onclick: function () { UI.confirmBox('¿Borrar este gasto? No se puede deshacer.', 'Borrar').then(function (ok) { if (!ok) return; if (e.imgId) RF.blobs.del(e.imgId); p.expenses.splice(p.expenses.indexOf(e), 1); silent(); st.editing = null; paint(); }); } })));
      root.appendChild(head);
      root.appendChild(h('div', { class: 'editor-split' }, h('div', { class: 'editor-form' }, UI.section('', [form]), UI.section('Revisión de este gasto', [issuesBox])), h('aside', { class: 'editor-photo' }, UI.section('Foto del comprobante', [photo]))));
      paintPhoto(); refresh();
    }
    paint();
    return page('Gastos y rendición', 'Anota cada gasto con los datos exactos del documento. La app revisa las reglas del Manual y te dice qué falta.', root);
  } };

  /* ================= Cuadre entre trámites ================= */
  function fixTarget(fix) {
    if (!fix) return null;
    if (fix.tool) { if (fix.filtro && RF.app) RF.app.pendingFilter = fix.filtro; return '#/h/' + fix.tool; }
    if (fix.tramite) return '#/t/' + fix.tramite;
    if (fix.fase) { var f = D.FASES.filter(function (x) { return x.id === fix.fase; })[0]; return f ? '#/t/' + f.items[0] : null; }
    return null;
  }
  TOOLS.revision = { title: 'Revisión: ¿cuadra todo?', icon: 'check', desc: 'Cruza gastos, anexos, presupuesto, plazos e informe técnico.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('Revisión', '', needProject());
    var res = L.reconcile(p, c.community, U.todayISO(), RF.holidays.all()), root = h('div');
    var verdict = res.counts.error ? UI.callout('bad', 'Todavía no está listo para enviar.', ' Hay ' + res.counts.error + ' cosa(s) que corregir.') : res.counts.warn ? UI.callout('warn', 'Casi listo.', ' Revisa ' + res.counts.warn + ' aviso(s) antes de enviar.') : UI.callout('ok', 'Todo cuadra.', ' No vemos problemas con lo que has ingresado.');
    root.appendChild(UI.section('Resultado', [verdict, h('p', { class: 'hint' }, 'La revisión solo usa lo que has anotado en la app y las reglas del Manual. No reemplaza la revisión de CORFO.')]));
    res.groups.forEach(function (g) {
      var list = h('ul', { class: 'check-list' }, g.items.map(function (i) {
        var t = fixTarget(i.fix);
        return h('li', { class: 'lv-' + i.level }, h('span', { class: 'lv-ico' }, UI.icon(i.level === 'ok' ? 'check' : i.level === 'error' ? 'alert' : i.level === 'warn' ? 'alert' : 'info', 18)), h('span', { class: 'lv-msg' }, i.msg), t ? h('a', { class: 'btn ghost small', href: t }, 'Arreglar') : null);
      }));
      root.appendChild(UI.section(g.title, [list]));
    });
    root.appendChild(UI.section('Antes de enviar', [h('div', { class: 'row-actions' }, UI.btn('Sacar la rendición', { icon: 'download', onclick: function () { location.hash = '#/h/gastos'; } }), UI.btn('Ver el resumen por cuentas', { icon: 'list', onclick: function () { location.hash = '#/h/resumen'; } }))]));
    return page('Revisión: ¿cuadra todo?', 'Cruza lo que anotaste en cada trámite para encontrar diferencias antes de que las encuentre CORFO.', root);
  } };

  /* ================= Resumen por cuentas ================= */
  TOOLS.resumen = { title: 'Resumen por cuentas', icon: 'list', desc: 'Presupuestado, aprobado y rendido en cada cuenta y mes.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('Resumen por cuentas', '', needProject());
    var t = L.totalsByCuenta(p), root = h('div');
    function docModel() {
      var months = {}; p.expenses.forEach(function (e) { if (!e.fecha) return; var k = U.monthKey(e.fecha); months[k] = months[k] || {}; months[k][e.cuenta] = (months[k][e.cuenta] || 0) + num(e.montoRendir); });
      var mk = Object.keys(months).sort();
      return { title: 'Resumen por cuentas', subtitle: (p.name || '') + (p.code ? ' · ' + p.code : ''), sheet: 'Resumen', footer: 'Generado con Rinde Fácil. Compáralo con el menú «Resumen por Cuentas» de SGP antes de enviar.', blocks: [
        { t: 'table', head: ['Cuenta', 'Aprobado ($)', 'Presupuestado ($)', 'Rendido ($)', 'Saldo ($)', '% rendido'], types: ['text', 'money', 'money', 'money', 'money', 'pct'], rows: D.CUENTAS.map(function (cu) { var x = t[cu.id], tope = x.presupuestado || x.aprobado; return [cu.name, x.aprobado, x.presupuestado, x.rendido, tope ? tope - x.rendido : '', tope ? Math.round(x.rendido * 100 / tope) : '']; }), foot: ['Total', 'SUM', 'SUM', 'SUM', 'SUM', ''] },
        { t: 'h', text: 'Rendido por mes' }, { t: 'table', head: ['Mes'].concat(D.CUENTAS.map(function (cu) { return cu.name + ' ($)'; })).concat(['Total ($)']), types: ['text', 'money', 'money', 'money', 'money', 'money'], rows: mk.map(function (k) { var r = [U.monthLabel(k)], s = 0; D.CUENTAS.forEach(function (cu) { var v = months[k][cu.id] || 0; r.push(v); s += v; }); r.push(s); return r; }), foot: ['Total', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM'] }] };
    }
    var rows = D.CUENTAS.map(function (cu) { var x = t[cu.id], tope = x.presupuestado || x.aprobado, over = tope > 0 && x.rendido > tope; return h('tr', { class: over ? 'row-bad' : '' }, h('th', { scope: 'row' }, cu.name), h('td', { class: 'r' }, x.aprobado ? U.fmtCLP(x.aprobado) : '—'), h('td', { class: 'r' }, x.presupuestado ? U.fmtCLP(x.presupuestado) : '—'), h('td', { class: 'r' }, U.fmtCLP(x.rendido)), h('td', { class: 'r' }, tope ? U.fmtCLP(tope - x.rendido) : '—'), h('td', { class: 'r' }, tope ? Math.round(x.rendido * 100 / tope) + ' %' : '—')); });
    root.appendChild(UI.section('Por cuenta', [h('div', { class: 'table-scroll' }, h('table', { class: 'plain-grid' }, h('thead', null, h('tr', null, ['Cuenta', 'Aprobado', 'Presupuestado', 'Rendido', 'Saldo', '% rendido'].map(function (x, i) { return h('th', { class: i ? 'r' : '' }, x); }))), h('tbody', null, rows)))]));
    root.appendChild(UI.section('Sacar el resumen', [UI.exportBar(docModel, 'resumen-por-cuentas')]));
    return page('Resumen por cuentas', 'Debe calzar con el menú «Resumen por Cuentas» de SGP antes de enviar.', root);
  } };

  /* ================= Observaciones de CORFO ================= */
  /* borrador del correo al Organismo Colaborador pidiendo ayuda con una observación de CORFO */
  function obsMail(p, community, o) {
    var lim = o.recibida ? L.aclaracionDeadline(o.recibida, RF.holidays.all()) : '';
    var body = 'Hola:\n\nSomos ' + (community.name || '[comunidad]') + (community.rut ? ' (RUT ' + community.rut + ')' : '') + ', del proyecto «' + (p.name || '[proyecto]') + '»' + (p.code ? ' (código ' + p.code + ')' : '') + '.\n\n' +
      'CORFO nos comunicó' + (o.recibida ? ' el ' + U.fmtDate(o.recibida) : '') + ' una observación a nuestra rendición' + (o.titulo ? ': «' + o.titulo + '»' : '') + '.' + (o.detalle ? '\n\nLo que pide CORFO:\n' + o.detalle : '') + (o.gastos ? '\n\nGastos o documentos afectados: ' + o.gastos : '') + '\n\n' +
      (lim ? 'Tenemos hasta el ' + U.fmtDate(lim) + ' (10 días hábiles) para aclararla y solo podemos hacerlo una vez. ' : 'Solo podemos aclararla una vez y en un máximo de 10 días hábiles. ') + '¿Pueden ayudarnos a revisarla y a redactar la aclaración?\n\nAdjuntamos lo que nos envió CORFO.\n\nMuchas gracias,\n' + (community.legalRep || '[nombre]') + '\n' + (community.name || '');
    return { to: community.ocEmail || '', subject: 'Ayuda con una observación de CORFO · ' + (p.name || 'proyecto') + (p.code ? ' · ' + p.code : ''), body: body };
  }
  RF.obsMail = obsMail;
  TOOLS.observaciones = { title: 'Observaciones de CORFO', icon: 'alert', desc: 'Anota lo que observó CORFO y cuenta tus 10 días hábiles.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('Observaciones de CORFO', '', needProject());
    var hol = RF.holidays.all(), root = h('div'), body = h('div');
    function paint() {
      U.clear(body);
      if (!p.observations.length) body.appendChild(UI.empty('No hay observaciones registradas.'));
      p.observations.forEach(function (o, i) {
        var status = h('div');
        var upd = function () {
          U.clear(status); if (!o.recibida) { status.appendChild(UI.callout('info', '', 'Anota la fecha en que CORFO te comunicó la observación para calcular tu plazo.')); return; }
          var lim = L.aclaracionDeadline(o.recibida, hol), left = U.businessDaysBetween(U.todayISO(), lim, hol);
          if (o.respondida) status.appendChild(UI.callout('ok', 'Respondida.', ' El plazo vencía el ' + U.fmtDate(lim) + '.'));
          else if (U.todayISO() > lim) status.appendChild(UI.callout('bad', 'Venció el plazo (' + U.fmtDate(lim) + ').', ' Si no se envió la aclaración a tiempo, los gastos observados se rechazan.'));
          else if (left <= 3) status.appendChild(UI.callout('warn', 'Plazo próximo: ' + U.fmtDate(lim) + '.', ' Quedan ' + left + ' día(s) hábil(es).'));
          else status.appendChild(UI.callout('ok', 'Tienes hasta el ' + U.fmtDate(lim) + '.', ' Quedan ' + left + ' día(s) hábil(es). Se puede aclarar una sola vez.'));
        };
        o.files = o.files || [];
        var viewer = h('div', { class: 'obs-viewer', hidden: true }), filesBox = h('div', { class: 'obs-files' }), mailBox = h('div');
        function showFile(rec) {
          viewer.hidden = false; U.clear(viewer);
          viewer.appendChild(h('div', { class: 'row-actions between' }, h('strong', null, rec.name), UI.btn('Cerrar', { cls: 'ghost small', onclick: function () { viewer.hidden = true; U.clear(viewer); } })));
          RF.blobs.get(rec.blobId).then(function (b) {
            if (!b) { viewer.appendChild(UI.empty('El archivo ya no está en este dispositivo. Si lo guardaste en el Drive, ábrelo desde allí.')); return; }
            var url = URL.createObjectURL(b), isPdf = /pdf/i.test(rec.type || rec.name);
            viewer.appendChild(isPdf ? h('iframe', { src: url, title: rec.name, class: 'obs-frame' }) : h('img', { src: url, alt: rec.name, class: 'obs-img' }));
          });
        }
        function paintFiles() {
          U.clear(filesBox);
          var inp = h('input', { type: 'file', accept: 'image/*,application/pdf,.pdf', multiple: true, class: 'sr-only', 'aria-label': 'Elegir lo que envió CORFO' });
          inp.addEventListener('change', function () {
            var list = Array.prototype.slice.call(inp.files || []); inp.value = '';
            list.forEach(function (f) {
              if (f.size > 8 * 1024 * 1024) { UI.toast('«' + f.name + '» pesa más de 8 MB: el Drive no lo aceptaría.', 'bad'); return; }
              var rec = { id: U.uid('of'), name: f.name, type: f.type || '', size: f.size, at: new Date().toISOString(), blobId: 'obsf-' + U.uid('b'), driveUrl: '' };
              RF.blobs.put(rec.blobId, f).then(function () {
                o.files.push(rec); silent(); paintFiles(); showFile(rec); if (RF.activity) RF.activity.log('respaldo', 'Subió lo que envió CORFO sobre una observación.', 'observaciones');
                if (RF.drive && RF.drive.auto()) RF.drive.saveObra(rec, 'Rendiciones - observaciones y respuestas', (o.recibida || U.todayISO()) + ' · Observación de CORFO · ' + (p.name || 'proyecto') + ' · ' + rec.name, f).then(function (r) { if (r && r.remote) { rec.driveUrl = r.url || ''; silent(); paintFiles(); } }).catch(function () { });
              });
            });
          });
          filesBox.appendChild(h('div', { class: 'row-actions' }, inp, UI.btn(o.files.length ? 'Agregar otro archivo' : 'Subir lo que envió CORFO (imagen o PDF)', { icon: 'file', cls: o.files.length ? 'ghost' : 'primary', onclick: function () { inp.click(); } })));
          o.files.forEach(function (rec) {
            filesBox.appendChild(h('div', { class: 'row-actions' }, h('span', { class: 'file-name' }, rec.name + (rec.driveUrl ? ' · ya está en tu Drive' : (RF.drive && RF.drive.enabled() ? ' · todavía no está en tu Drive' : ''))),
              UI.btn('Verlo aquí', { cls: 'small', onclick: function () { showFile(rec); } }), rec.driveUrl ? h('a', { class: 'btn small ghost', href: rec.driveUrl, target: '_blank', rel: 'noopener' }, 'Ver en Drive') : null,
              UI.btn('Quitar', { cls: 'ghost small danger', onclick: function () { o.files = o.files.filter(function (x) { return x.id !== rec.id; }); silent(); paintFiles(); viewer.hidden = true; } })));
          });
        }
        paintFiles();
        function paintMail() {
          U.clear(mailBox);
          mailBox.appendChild(UI.btn('Pedir ayuda al Organismo Colaborador', { icon: 'help', cls: 'ghost', onclick: function () {
            U.clear(mailBox);
            var com = RF.store.get().community, m = obsMail(p, com, o), st = { to: m.to, subject: m.subject, body: m.body };
            var gm = h('a', { class: 'btn primary', target: '_blank', rel: 'noopener' }, 'Abrir en Gmail'), ml = h('a', { class: 'btn ghost' }, 'Abrir en mi programa de correo');
            function links() {
              var q = 'to=' + encodeURIComponent(st.to) + '&su=' + encodeURIComponent(st.subject) + '&body=' + encodeURIComponent(st.body);
              gm.href = 'https://mail.google.com/mail/?view=cm&fs=1&' + q; ml.href = 'mailto:' + encodeURIComponent(st.to) + '?subject=' + encodeURIComponent(st.subject) + '&body=' + encodeURIComponent(st.body);
            }
            links();
            mailBox.appendChild(h('div', { class: 'mail-draft' }, h('h4', { class: 'cot-sub' }, 'Borrador del correo'), h('p', { class: 'hint' }, 'Edítalo a tu gusto. Este es un boceto: el archivo de CORFO tienes que adjuntarlo tú en el correo.'),
              UI.field('Para (correo del Organismo Colaborador)', st, 'to', { type: 'text', ph: 'correo@organismo.cl', onChange: function () { RF.store.update(function (x) { x.community.ocEmail = st.to; }, { silent: true }); links(); } }),
              UI.field('Asunto', st, 'subject', { type: 'text', onChange: links }), UI.field('Mensaje', st, 'body', { type: 'textarea', rows: 12, cls: 'wide', onChange: links }),
              h('div', { class: 'row-actions' }, gm, ml, UI.btn('Copiar el mensaje', { cls: 'ghost', onclick: function () { U.copyText(st.body).then(function (ok) { UI.toast(ok ? 'Mensaje copiado.' : 'No se pudo copiar.', ok ? 'ok' : 'bad'); }); } }), UI.btn('Cerrar', { cls: 'ghost', onclick: paintMail }))));
          } }));
        }
        paintMail();
        body.appendChild(h('div', { class: 'stage-card obs-card' },
          h('div', { class: 'stage-head' }, h('span', { class: 'stage-n' }, 'Observación ' + (i + 1)), UI.bind(o, 'titulo', { type: 'text', ph: 'Resumen corto', aria: 'Resumen de la observación' }),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar', onclick: function () { p.observations.splice(i, 1); silent(); paint(); } }, UI.icon('trash', 18))),
          h('div', { class: 'form-grid' }, UI.field('Fecha en que CORFO la comunicó', o, 'recibida', { type: 'date', onChange: upd }), UI.field('Gastos o documentos afectados', o, 'gastos', { type: 'text' }),
            UI.field('Qué pidió CORFO', o, 'detalle', { type: 'textarea', rows: 3, cls: 'wide' }), UI.field('Tu aclaración', o, 'respuesta', { type: 'textarea', rows: 4, cls: 'wide', hint: 'También agrega un comentario en la glosa del gasto en SGP.' }),
            UI.field('Ya envié la aclaración en SGP', o, 'respondida', { type: 'check', onChange: upd })), status, h('h4', { class: 'cot-sub' }, 'Lo que envió CORFO'), filesBox, viewer, h('h4', { class: 'cot-sub' }, '¿Necesitas ayuda?'), mailBox));
        upd();
      });
      body.appendChild(UI.btn('Agregar observación', { icon: 'plus', cls: 'primary', onclick: function () { p.observations.push({ id: U.uid('o'), titulo: '', recibida: U.todayISO(), gastos: '', detalle: '', respuesta: '', respondida: false }); silent(); paint(); } }));
    }
    paint();
    root.appendChild(UI.callout('info', 'Recuerda (Manual p. 10):', ' la aclaración se hace por única vez y en un máximo de 10 días hábiles desde la comunicación. Si no envías la aclaración a tiempo, los gastos observados se rechazan. El Organismo Colaborador puede apoyarte.'));
    root.appendChild(UI.section('Tus observaciones', [body]));
    root.appendChild(UI.section('Sacar las respuestas', [UI.exportBar(function () { return { title: 'Respuesta a observaciones de CORFO', subtitle: (p.name || '') + (p.code ? ' · ' + p.code : ''), sheet: 'Observaciones', footer: 'Generado con Rinde Fácil.', blocks: p.observations.map(function (o, i) { return { t: 'kv', rows: [[(i + 1) + '. Observación', o.titulo], ['Comunicada el', o.recibida ? U.fmtDate(o.recibida) : ''], ['Gastos afectados', o.gastos], ['Qué pidió CORFO', o.detalle], ['Aclaración de la comunidad', o.respuesta]] }; }) }; }, 'observaciones')]));
    return page('Observaciones de CORFO', 'Cuenta tus días y ordena tu respuesta.', root);
  } };

  /* ================= Nube y copias ================= */
  TOOLS.nube = { title: 'Nube y copias', icon: 'cloud', desc: 'Conecta el servicio de tu comunidad, guarda en la nube y haz copias.', render: function () {
    var s = RF.store.get(), root = h('div'), out = h('div');
    /* si la app trae un único servicio aprobado y todavía no hay uno anotado, ya viene puesto: no hace falta pegar nada */
    if (!s.cloud.apiUrl && RF.cloud.approvedUrls().length === 1) { s.cloud.apiUrl = RF.cloud.approvedUrls()[0]; RF.store.update(function () { }, { silent: true }); }
    function msg(kind, t) { U.clear(out); if (t) out.appendChild(UI.callout(kind, '', t)); }
    function working(title, promise) {
      var b = UI.busy(title, [{ id: 'k', label: 'Esperando la respuesta de Google. Puede tardar hasta un minuto y medio.', from: 0, to: 90, tau: 25 }]);
      return promise.then(function (r) { b.done('Listo'); return r; }, function (e) { b.fail(RF.cloud.humanError(e)); throw e; });
    }
    function dropConflictNotice() { Array.prototype.slice.call(root.querySelectorAll('.callout.warn')).forEach(function (c) { if (/copia más nueva/.test(c.textContent)) c.parentNode.removeChild(c); }); }
    function reportResolution(res) {
      if (res && res.ok) dropConflictNotice();
      if (!res) { msg('bad', 'No se recibió respuesta al resolver la copia.'); return; }
      msg(res.ok ? 'ok' : 'info', res.text);
    }
    root.appendChild(UI.callout('info', 'Cómo funciona:', ' tus datos se guardan en este dispositivo. Si conectas el servicio de tu comunidad (un Apps Script en su propia cuenta de Google) y entras con la contraseña de tu comunidad, la app puede leer fotos con Google Cloud Vision y guardar una copia en el Drive de la comunidad. Nada se manda a la nube sin que tú lo pidas.'));
    var pendBox = h('div');
    function paintPend() {
      U.clear(pendBox);
      RF.outbox.list().then(function (items) {
        if (!items.length) return;
        var attention = items.filter(function (x) { return x.status === 'needs_attention'; }).length;
        var attentionText = items.filter(function (x) { return x.status === 'needs_attention'; }).map(function (x) {
          if (x.errorCode === 'SERVICIO_CAMBIO') return 'Cambió la dirección del servicio desde que se guardó este elemento. Verifica la comunidad de destino antes de reintentar.';
          if (x.errorCode === 'ORIGEN_NO_VERIFICADO') return 'Este elemento es de una cola antigua sin destino verificable. No se enviará hasta resolver su origen.';
          return x.errorCode ? 'Hay elementos que requieren revisión (' + x.errorCode + ').' : '';
        }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' ');
        pendBox.appendChild(UI.callout(attention ? 'bad' : 'warn', items.length + (items.length === 1 ? ' elemento pendiente.' : ' elementos pendientes.'), attention ? attention + ' necesitan revisión antes de volver a intentar. Los originales siguen en este dispositivo. ' + attentionText : 'Se intentarán subir cuando vuelva la conexión; aún no están guardados en Drive.'));
        pendBox.appendChild(UI.btn(attention ? 'Reintentar lo pendiente' : 'Reintentar ahora', { icon: 'cloud', cls: 'ghost', onclick: function () {
          U.clear(out);
          RF.outbox.retryAll().then(function () { return RF.drive.flushOutbox(); }).then(function (r) {
            if (!r.ok) msg('bad', 'No se pudo revisar o actualizar la cola local (' + (r.error || 'error') + '). No asumimos que esté vacía.');
            else if (r.needsAttention) msg('warn', 'Quedan ' + r.needsAttention + ' elementos que requieren revisión; siguen guardados en este dispositivo.');
            else if (r.left) msg('warn', 'Quedan ' + r.left + ' elementos pendientes; aún no están guardados en Drive.');
            else msg('ok', 'La cola se revisó y no quedan elementos pendientes.');
            paintPend();
          }).catch(function (e) { msg('bad', 'No se pudo revisar la cola (' + (e.message || e) + '). Los datos locales no se borraron.'); });
        } }));
      }).catch(function (e) {
        pendBox.appendChild(UI.callout('bad', 'No se pudo revisar la cola local.', 'No significa que esté vacía. ' + (e.message || e)));
      });
    }
    paintPend();
    var setupBox = h('div');
    function paintSetup(info) {
      U.clear(setupBox);
      if (!info) return;
      if (/^[12]\./.test(String(info.version || ''))) { setupBox.appendChild(UI.callout('warn', 'El servicio es de una versión anterior (' + info.version + ').', ' Pide a quien lo instaló que ponga la versión 3, que agrega la cuenta con contraseña. Mientras tanto la app funciona sin nube.')); return; }
      if (info.account === false) {
        var code = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Código de instalación' });
        setupBox.appendChild(h('div', { class: 'setup-guidance' }, h('strong', null, 'El servicio todavía no tiene cuenta.'), h('span', null, ' Escribe el código de instalación que puso quien lo instaló (se usa una sola vez). La cuenta se crea con el nombre de tu comunidad y la contraseña que ya elegiste.'),
          h('div', { class: 'inline-add' }, code, UI.btn('Crear la cuenta del servicio', { icon: 'shield', cls: 'primary', onclick: function () { msg('info', 'Creando la cuenta…'); RF.auth.serverSetup(code.value.trim()).then(function () { code.value = ''; paintSetup({ account: true, version: info.version }); msg('ok', 'Cuenta creada. Desde ahora entras al servicio con la misma contraseña.'); }).catch(function (e) { msg('bad', e.message); }); } }))));
      }
    }
    root.appendChild(UI.section('Servicio de la comunidad', [h('div', { class: 'form-grid' },
      UI.field('Dirección del servicio (termina en /exec)', s.cloud, 'apiUrl', { type: 'text', cls: 'wide', ph: 'https://script.google.com/macros/s/…/exec', onChange: function () { if (RF.app && RF.app.render) RF.app.render(); } })),
      h('div', { class: 'row-actions' },
        UI.btn('Probar conexión', { icon: 'link', cls: 'primary', onclick: function () { msg('info', 'Probando…'); working('Probando la conexión', RF.cloud.ping()).then(function (r) { if (r && r.ok) { msg(r.ocr ? 'ok' : 'warn', r.ocr ? 'Conexión correcta: el servicio responde' + (r.version ? ' (versión ' + r.version + ')' : '') + ', la lectura de fotos está disponible' + (r.account ? ' y la cuenta del servicio existe.' : ', pero todavía no tiene cuenta creada.') : 'El servicio responde, pero la lectura de fotos no está configurada.'); /* es el resultado de una acción pedida: se muestra aunque sea correcto */ paintSetup(r); } else msg('bad', 'El servicio respondió con un error: ' + ((r && r.error) || 'desconocido')); }).catch(function (e) { msg('bad', e.message === 'NO_CONFIGURADO' ? 'Pega primero la dirección del servicio (empieza con https://).' : 'No se pudo conectar: ' + RF.cloud.humanError(e)); }); } }),
        RF.cloud.configured() ? UI.btn('Guardar copia en la nube', { icon: 'cloud', onclick: function () { msg('info', 'Guardando…'); working('Guardando la copia en la nube', RF.drive.pushState()).then(function (r) { if (r.ok && r.remote) { dropConflictNotice(); msg('ok', 'Copia guardada en el Drive de la comunidad.'); } else if (r.queued) msg('warn', 'La copia quedó pendiente en este dispositivo; todavía no está en Drive.'); else if (r.conflict) RF.drive.resolveConflict().then(reportResolution); else msg('bad', 'No se pudo guardar: ' + (r.error || 'error')); }).catch(function (e) { msg('bad', 'No se pudo guardar: ' + RF.cloud.humanError(e)); }); } }) : null,
        RF.cloud.configured() ? UI.btn('Traer la copia de la nube', { icon: 'download', onclick: function () { msg('info', 'Trayendo…'); working('Trayendo la copia de la nube', RF.drive.resolveConflict({ pullOnly: true })).then(reportResolution).catch(function (e) { msg('bad', 'No se pudo traer: ' + RF.cloud.humanError(e)); }); } }) : null),
      s.cloud.conflict ? UI.callout('warn', 'Hay una copia más nueva en la nube.', ' Otro equipo guardó cambios. Pulsa «Guardar copia en la nube» para combinarlas sin perder nada.') : null,
      s.cloud.lastSync ? h('p', { class: 'hint' }, 'Última copia en la nube: ' + new Date(s.cloud.lastSync).toLocaleString('es-CL')) : null, setupBox, pendBox, out]));
    /* carpeta «Rinde fácil» en el Drive de la comunidad */
    var driveOut = h('div'), savesBox = h('div');
    function paintSaves() {
      U.clear(savesBox);
      var list = (RF.store.get().cloud.saves || []);
      if (!list.length) { savesBox.appendChild(UI.empty('Aún no se guarda nada desde esta app.')); return; }
      savesBox.appendChild(h('ul', { class: 'saves' }, RF.drive.friendlySaves(list).slice(0, 8).map(function (i) {
        var label = i.titulo || i.tipo, meta = [i.lugar, i.fecha].filter(Boolean).join(' · ');
        return h('li', { class: 'save-item' },
          h('span', { class: 'save-kind' }, i.tipo),
          i.url ? h('a', { href: i.url, target: '_blank', rel: 'noopener' }, label) : h('span', null, label),
          h('span', { class: 'muted save-meta' }, meta),
          i.folderUrl ? h('a', { class: 'save-folder', href: i.folderUrl, target: '_blank', rel: 'noopener' }, 'Ver carpeta') : null);
      })));
    }
    var pj = RF.store.project();
    root.appendChild(UI.section('Carpeta «Rinde fácil» en tu Drive', [
      h('p', { class: 'hint' }, 'Lo que saques (Carta Gantt, anexos, rendición) y las fotos que revises quedan ordenados en una carpeta de tu Drive: Proyectos › nombre del proyecto › Planificación, Anexos, Rendición y Comprobantes por mes. Nunca se borra nada; si un documento cambia, se guarda otra versión.'),
      UI.field('Guardar en el Drive todo lo que saque o suba', s.cloud, 'autoSave', { type: 'check', onChange: function () { silentSave(); } }),
      h('div', { class: 'row-actions' },
        UI.btn('Preparar mi carpeta' + (pj ? ' para «' + pj.name + '»' : ''), { icon: 'folder', cls: 'primary', onclick: function () { U.clear(driveOut); driveOut.appendChild(UI.callout('info', '', 'Preparando la carpeta…')); working('Preparando la carpeta en tu Drive', RF.drive.setup(pj && pj.name)).then(function (r) { U.clear(driveOut); driveOut.appendChild(UI.callout('ok', 'Lista.', ' La carpeta «Rinde fácil» está en tu Drive.')); if (r.rootUrl) driveOut.appendChild(h('p', null, h('a', { href: r.rootUrl, target: '_blank', rel: 'noopener' }, 'Abrir la carpeta en Drive'))); paintSaves(); }).catch(function (e) { U.clear(driveOut); RF.authui.showErr(driveOut, e.message === 'NO_CONFIGURADO' ? 'Primero conecta el servicio de tu comunidad.' : (e.retryAfter || e.seconds) ? e.message : 'No se pudo preparar la carpeta: ' + RF.cloud.humanError(e), e); }); } }),
        s.cloud.rootUrl ? h('a', { class: 'btn ghost', href: s.cloud.rootUrl, target: '_blank', rel: 'noopener' }, 'Abrir en Drive') : null),
      driveOut, h('h3', { class: 'grp' }, 'Últimos archivos guardados'), savesBox]));
    function silentSave() { RF.store.update(function () { }, { silent: true }); }
    paintSaves();
    var fi = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', 'aria-label': 'Cargar copia' });
    fi.addEventListener('change', function () { var f = fi.files[0]; if (!f) return; f.text().then(function (t) { try { RF.store.importJSON(t); UI.toast('Copia cargada.', 'ok'); } catch (e) { UI.toast(e.message, 'bad'); } }); });
    root.appendChild(UI.section('Copia en tu dispositivo', [fi, h('div', { class: 'row-actions' },
      UI.btn('Descargar copia', { icon: 'download', onclick: function () { U.download(new Blob([RF.store.exportJSON()], { type: 'application/json' }), 'rinde-facil-copia-' + U.todayISO() + '.json'); } }),
      UI.btn('Cargar una copia', { icon: 'file', onclick: function () { fi.click(); } }),
      UI.btn('Borrar todo en este dispositivo', { icon: 'trash', cls: 'ghost danger', onclick: function () { UI.confirmBox('Se borrarán proyectos, gastos, fotos y la cuenta de ESTE dispositivo. Lo que esté en el Drive de la comunidad no se toca. ¿Seguro?', 'Borrar todo').then(function (ok) { if (ok) RF.auth.wipeDevice().then(function () { location.hash = '#/'; location.reload(); }); }); } })),
      h('p', { class: 'hint' }, 'La copia no incluye las fotos de los comprobantes: quedan en este dispositivo.')]));
    return page('Nube y copias', 'Lo que quede en este dispositivo puedes respaldarlo y llevarlo a otro.', root);
  } };

  RF.rendicion = { fixTarget: fixTarget, rendicionDoc: rendicionDoc, expedienteDoc: expedienteDoc, newExpense: newExpense, addExpenseWithReceipt: addExpenseWithReceipt };
})(typeof window !== 'undefined' ? window : globalThis);
