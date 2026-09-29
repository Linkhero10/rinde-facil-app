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
  var STATUS_LABEL = { ok: 'Listo', warn: 'Revisar', error: 'Falta algo' };

  function newExpense() {
    return { id: U.uid('g'), cuenta: 'operacion', item: '', docType: 'boleta', folio: '', fecha: '', fechaPago: '', rutProveedor: '', proveedor: '', nombreComercial: '', neto: '', iva: '', total: '', montoRendir: '', pctUso: '', formaPago: 'transferencia', glosa: '', actId: '', has: {}, esViatico: false, servicioTecnico: false, esInmueble: false, verified: false, ocr: null, imgId: null, createdAt: new Date().toISOString() };
  }
  function syncRendir(e, community) { if (!e._manualRendir && num(e.total) > 0) e.montoRendir = L.expectedMontoRendir(e, community); }

  /* ---------- rendición en formato SGP ---------- */
  function rendicionDoc(project, community) {
    var res = L.reconcile(project, community, U.todayISO(), RF.store.get().holidays);
    var ev = {}; res.evals.forEach(function (x) { ev[x.e.id] = x.r; });
    var bad = res.evals.filter(function (x) { return x.r.status === 'error'; }).length;
    var rows = (project.expenses || []).slice().sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }).map(function (e) {
      var per = e.fecha ? e.fecha.slice(0, 7) + '-01' : '';
      return [project.code || project.name, (D.CUENTA_BY_ID[e.cuenta] || {}).sgp || '', 'CORFO', e.item || '', per, num(e.montoRendir), (D.FORMAS_PAGO.filter(function (f) { return f.id === e.formaPago; })[0] || {}).name || '', (D.DOC_BY_ID[e.docType] || {}).name || '', e.folio, e.rutProveedor ? U.rutFormat(e.rutProveedor) : '', e.proveedor, e.glosa, STATUS_LABEL[(ev[e.id] || {}).status] || ''];
    });
    return { title: (bad ? 'BORRADOR · ' : '') + 'Rendición de gastos', subtitle: (project.name || '') + (project.code ? ' · ' + project.code : '') + (project.periodoInicio ? ' · período ' + U.fmtDateShort(project.periodoInicio) + ' al ' + U.fmtDateShort(project.periodoFin) : ''), sheet: 'Rendición', footer: 'Generado con Rinde Fácil. Sirve para ingresar cada gasto en SGP, uno a uno, con los datos exactos del documento.' + (bad ? ' ATENCIÓN: hay ' + bad + ' gasto(s) con errores; corrígelos antes de enviar.' : ''), blocks: [
      { t: 'table', head: ['Proyecto', 'Cuenta', 'Fuente', 'Ítem', 'Período', 'Monto rendido ($)', 'Forma de pago', 'Tipo de documento', 'N° documento', 'RUT proveedor', 'Proveedor', 'Glosa', 'Estado'], types: ['text', 'text', 'text', 'text', 'date', 'money', 'text', 'text', 'text', 'text', 'text', 'text', 'text'], rows: rows, foot: ['Total', '', '', '', '', 'SUM', '', '', '', '', '', '', ''] }
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
    var root = h('div');
    var fileInput = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, class: 'sr-only', 'aria-label': 'Elegir fotos o PDF de comprobantes' });
    var camInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', 'aria-label': 'Sacar foto al comprobante' });
    function paint() { U.clear(root); root.appendChild(fileInput); root.appendChild(camInput); if (st.editing) paintEditor(); else paintList(); }

    /* ---- procesar fotos ---- */
    function handleFiles(files) {
      files = Array.prototype.slice.call(files || []); if (!files.length) return;
      var made = [], i = 0;
      function next() {
        if (i >= files.length) { UI.toast(made.length + ' comprobante(s) agregado(s). Revísalos uno por uno.', 'ok'); if (made.length === 1) st.editing = made[0]; paint(); return Promise.resolve(); }
        var file = files[i++], e = newExpense(); e.imgId = 'img-' + e.id; e.imgType = file.type;
        return RF.blobs.put(e.imgId, file).then(function () {
          p.expenses.push(e); made.push(e.id); silent();
          if (!RF.cloud.configured()) { e._ocrNote = 'Anota los datos mirando la foto. Para leerla automáticamente, conecta el servicio en la nube.'; return null; }
          return ocrJob(file, e, files.length > 1 ? 'Leyendo el comprobante ' + i + ' de ' + files.length : 'Leyendo el comprobante');
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
        return res;
      }).catch(function (err) {
        e._ocrNote = 'No se pudo leer automáticamente (' + (err.message || err) + '). Anota los datos mirando la foto.';
        b.fail('No se pudo leer (' + (err.message || err) + '). Anota los datos mirando la foto.');
      });
    }
    function applyOcr(e, res) {
      if (!res || !res.ok) { e._ocrNote = 'El servicio respondió con un error: ' + ((res && res.error) || 'desconocido') + '. Anota los datos mirando la foto.'; return; }
      var out = RF.ocr.toExpenseFields(res.raw_text, 'cloud_vision', { communityRut: c.community && c.community.rut, communityName: c.community && c.community.name }), f = out.fields;
      Object.keys(f).forEach(function (k) { e[k] = f[k]; });
      if (!f.docType && f.total != null) e.docType = e.docType || 'boleta';
      e.ocr = { engine: res.engine || 'cloud_vision', at: new Date().toISOString(), raw: String(res.raw_text || '').slice(0, 6000), confidence: res.confidence == null ? null : res.confidence, ms: res.duration_ms || null, note: out.note, auto: JSON.parse(JSON.stringify(f)) };
      if (!e.fechaPago && e.fecha && /^(debito|tarjeta|prepago)$/.test(e.formaPago || '')) e.fechaPago = e.fecha; /* pago con tarjeta: se paga al comprar */
      e.verified = false; e._manualRendir = false; syncRendir(e, c.community);
      e._ocrNote = 'Leído con Google Cloud Vision. Compara cada dato con la foto antes de seguir.' + (out.note ? ' ' + out.note : '');
      silent();
    }
    fileInput.addEventListener('change', function () { handleFiles(fileInput.files); fileInput.value = ''; });
    camInput.addEventListener('change', function () { handleFiles(camInput.files); camInput.value = ''; });

    /* ---- lista ---- */
    function paintList() {
      var res = L.reconcile(p, c.community, U.todayISO(), RF.store.get().holidays);
      var evs = {}; res.evals.forEach(function (x) { evs[x.e.id] = x.r; });
      var totals = res.totals, tot = U.sum(p.expenses, function (e) { return num(e.montoRendir); });
      var counts = { ok: 0, warn: 0, error: 0 }; p.expenses.forEach(function (e) { counts[evs[e.id].status]++; });
      root.appendChild(UI.section('', [h('div', { class: 'gastos-top' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-n' }, String(p.expenses.length)), h('span', null, 'gastos')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-n' }, U.fmtCLP(tot)), h('span', null, 'a rendir')),
        h('div', { class: 'stat ok' }, h('span', { class: 'stat-n' }, String(counts.ok)), h('span', null, 'listos')),
        h('div', { class: 'stat warn' }, h('span', { class: 'stat-n' }, String(counts.warn)), h('span', null, 'por revisar')),
        h('div', { class: 'stat bad' }, h('span', { class: 'stat-n' }, String(counts.error)), h('span', null, 'con errores'))),
        h('div', { class: 'row-actions' },
          UI.btn('Sacar foto al comprobante', { icon: 'camera', cls: 'primary', onclick: function () { camInput.click(); } }),
          UI.btn('Subir foto o PDF', { icon: 'file', onclick: function () { fileInput.click(); } }),
          UI.btn('Anotar a mano', { icon: 'edit', onclick: function () { var e = newExpense(); p.expenses.push(e); silent(); st.editing = e.id; paint(); } })),
        RF.cloud.configured() ? h('p', { class: 'hint' }, 'Las fotos se leen en la nube con Google Cloud Vision, en la cuenta de tu comunidad. Siempre tienes que revisar los datos.') : UI.callout('info', 'Lectura automática desactivada.', ' Puedes anotar los gastos a mano o conectar el servicio en la nube en «Nube y copias».')]));
      var chips = h('div', { class: 'chips' }, [['all', 'Todos'], ['error', 'Con errores'], ['warn', 'Por revisar'], ['ok', 'Listos']].map(function (f) { return h('button', { type: 'button', class: 'chip' + (st.filter === f[0] ? ' on' : ''), onclick: function () { st.filter = f[0]; paint(); } }, f[1]); }));
      var rows = p.expenses.filter(function (e) { return st.filter === 'all' || evs[e.id].status === st.filter; }).slice().sort(function (a, b) { return String(b.fecha || 'z').localeCompare(String(a.fecha || 'z')); }).map(function (e) {
        var r = evs[e.id];
        return h('tr', { class: 'clickable', tabindex: 0, onclick: function () { st.editing = e.id; paint(); }, onkeydown: function (ev) { if (ev.key === 'Enter') { st.editing = e.id; paint(); } } },
          h('td', { 'data-label': 'Estado' }, UI.badge(STATUS_LABEL[r.status], r.status === 'ok' ? 'ok' : r.status === 'warn' ? 'warn' : 'bad')),
          h('td', { 'data-label': 'Fecha' }, e.fecha ? U.fmtDateShort(e.fecha) : '—'), h('td', { 'data-label': 'Proveedor' }, e.proveedor || 'Sin proveedor'),
          h('td', { 'data-label': 'Documento' }, ((D.DOC_BY_ID[e.docType] || {}).name || '—') + (e.folio ? ' N° ' + e.folio : '')), h('td', { 'data-label': 'Cuenta' }, (D.CUENTA_BY_ID[e.cuenta] || {}).name || '—'),
          h('td', { class: 'r', 'data-label': 'A rendir' }, U.fmtCLP(num(e.montoRendir))), h('td', { 'data-label': 'Problemas' }, r.errors ? r.errors + ' error(es)' : r.warns ? r.warns + ' aviso(s)' : '✓'));
      });
      root.appendChild(UI.section('Tus gastos', [p.expenses.length ? chips : null, p.expenses.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'plain-grid list-grid' }, h('thead', null, h('tr', null, ['Estado', 'Fecha', 'Proveedor', 'Documento', 'Cuenta', 'A rendir', 'Problemas'].map(function (x, i) { return h('th', { class: i === 5 ? 'r' : '' }, x); }))), h('tbody', null, rows))) : UI.empty('Aún no anotas gastos. Saca una foto al primer comprobante o anótalo a mano.')]));
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
        if (!r.issues.length) issuesBox.appendChild(UI.callout('ok', 'Todo en orden.', ' Este gasto no tiene problemas.'));
        r.issues.forEach(function (i) { issuesBox.appendChild(UI.callout(i.level === 'error' ? 'bad' : i.level === 'warn' ? 'warn' : 'info', '', i.msg)); });
        paintReq(r);
        var es = L.expectedMontoRendir(e, c.community); calcBox.textContent = num(e.total) > 0 ? 'Corresponde rendir: ' + U.fmtCLP(es) : '';
        silent();
      }
      function paintReq(r) {
        U.clear(reqBox);
        var has = L.effectiveHas(e, p);
        if (!r.requirements.length) { reqBox.appendChild(UI.empty('Este gasto no pide respaldos adicionales.')); return; }
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
          reqBox.appendChild(h('div', { class: 'req' + (q.met ? ' met' : '') }, h('label', { class: 'check', for: 'rq-' + q.key }, cb, h('span', null, q.label + (auto ? ' (ya lo tienes en la app)' : ''))), extra));
        });
      }
      /* foto */
      var photo = h('div', { class: 'photo-panel' });
      function paintPhoto() {
        U.clear(photo);
        if (!e.imgId) { photo.appendChild(UI.empty('Sin foto. Puedes agregar una para revisar los datos junto al documento.')); photo.appendChild(UI.btn('Agregar foto', { icon: 'camera', cls: 'ghost', onclick: function () { var inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment' }); inp.addEventListener('change', function () { var f = inp.files[0]; if (!f) return; e.imgId = 'img-' + e.id; e.imgType = f.type; RF.blobs.put(e.imgId, f).then(function () { paintPhoto(); silent(); }); }); inp.click(); } })); return; }
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
        });
        if (e.ocr && e.ocr.raw) photo.appendChild(h('details', { class: 'ocr-raw' }, h('summary', null, 'Ver el texto que leyó la nube'), h('pre', null, e.ocr.raw)));
      }
      var fld = function (label, key, opts) { opts = opts || {}; opts.onChange = function (v) { if (key === 'montoRendir') e._manualRendir = true; if (opts.after) opts.after(v); refresh();
        /* al confirmar que revisó el comprobante, la foto original se archiva sola en el Drive, en la carpeta del mes */
        if (key === 'verified' && v && e.fecha && RF.drive.auto()) RF.drive.archiveExpense(e, p, c.community).then(function () { paintPhoto(); }).catch(function () { }); }; return UI.field(label, e, key, opts); };
      var docOpts = D.DOC_TYPES.map(function (d) { return { id: d.id, name: d.name }; });
      var actOpts = [{ id: '', name: 'Sin actividad' }].concat(L.allActivities(p).map(function (x) { return { id: x.act.id, name: x.act.name || '(sin nombre)' }; }));
      var form = h('div', null,
        e._ocrNote ? UI.callout('info', '', e._ocrNote) : null,
        h('h3', { class: 'grp' }, '1. El documento'),
        h('div', { class: 'form-grid' }, fld('Tipo de documento', 'docType', { type: 'select', options: docOpts, noEmpty: true, cls: 'span2' }), fld('Número (folio)', 'folio', { type: 'text' }), fld('Fecha del documento', 'fecha', { type: 'date' }), fld('Nombre del proveedor', 'proveedor', { type: 'text', cls: 'wide' }), fld('Nombre comercial o local (opcional)', 'nombreComercial', { type: 'text', cls: 'wide', hint: 'Solo para reconocerlo; el proveedor es quien tiene el RUT.' }), fld('RUT del proveedor', 'rutProveedor', { type: 'rut' })),
        h('h3', { class: 'grp' }, '2. Los montos'),
        h('div', { class: 'form-grid' }, fld('Monto neto ($)', 'neto', { type: 'money' }), fld('IVA ($)', 'iva', { type: 'money' }), fld('Total del documento ($)', 'total', { type: 'money' }),
          h('div', { class: 'field wide' }, h('div', { class: 'row-actions' },
            UI.btn('Calcular IVA y total desde el neto', { cls: 'ghost', onclick: function () { var n = num(e.neto); e.iva = Math.round(n * D.REGLAS.IVA); e.total = n + e.iva; paint(); } }),
            UI.btn('Calcular neto e IVA desde el total', { cls: 'ghost', onclick: function () { var t = num(e.total); e.neto = Math.round(t / (1 + D.REGLAS.IVA)); e.iva = t - e.neto; paint(); } }))),
          e.cuenta === 'administracion' ? fld('Porcentaje que corresponde al proyecto (%)', 'pctUso', { type: 'pct', hint: 'Si el gasto es compartido, se pide el Anexo 5.' }) : null,
          fld('Monto a rendir ($)', 'montoRendir', { type: 'money' }), h('div', { class: 'field calc-field' }, h('span', { class: 'lbl' }, 'Según tu situación de IVA'), calcBox,
            UI.btn('Usar ese monto', { cls: 'ghost', onclick: function () { e._manualRendir = false; syncRendir(e, c.community); paint(); } }))),
        h('h3', { class: 'grp' }, '3. Dónde va'),
        h('div', { class: 'form-grid' }, fld('Cuenta', 'cuenta', { type: 'select', options: D.CUENTAS.map(function (x) { return { id: x.id, name: x.name }; }), noEmpty: true, after: function () { paint(); } }), fld('Actividad de tu Gantt', 'actId', { type: 'select', options: actOpts, noEmpty: true }), fld('Ítem del presupuesto', 'item', { type: 'text', ph: 'Ej: Materiales' }),
          fld('Glosa: qué compraste y para qué', 'glosa', { type: 'textarea', rows: 2, cls: 'wide', counter: D.REGLAS.GLOSA_MAX, counterWarn: D.REGLAS.GLOSA_AVISO })),
        h('h3', { class: 'grp' }, '4. El pago'),
        h('div', { class: 'form-grid' }, fld('Forma de pago', 'formaPago', { type: 'select', options: D.FORMAS_PAGO, noEmpty: true }), fld('Fecha del pago', 'fechaPago', { type: 'date' })),
        h('h3', { class: 'grp' }, '5. Marcas'),
        h('div', { class: 'checks' }, fld('Es un viático o viaje', 'esViatico', { type: 'check' }), fld('Es un servicio técnico-profesional (no pide cotizaciones)', 'servicioTecnico', { type: 'check' }), e.cuenta === 'inversion' ? fld('Es un inmueble o derechos de agua', 'esInmueble', { type: 'check' }) : null),
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
    var res = L.reconcile(p, c.community, U.todayISO(), RF.store.get().holidays), root = h('div');
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
  TOOLS.observaciones = { title: 'Observaciones de CORFO', icon: 'alert', desc: 'Anota lo que observó CORFO y cuenta tus 10 días hábiles.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('Observaciones de CORFO', '', needProject());
    var hol = RF.store.get().holidays, root = h('div'), body = h('div');
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
          else status.appendChild(UI.callout(left <= 3 ? 'warn' : 'ok', 'Tienes hasta el ' + U.fmtDate(lim) + '.', ' Quedan ' + left + ' día(s) hábil(es). Se puede aclarar una sola vez.'));
        };
        body.appendChild(h('div', { class: 'stage-card' },
          h('div', { class: 'stage-head' }, h('span', { class: 'stage-n' }, 'Observación ' + (i + 1)), UI.bind(o, 'titulo', { type: 'text', ph: 'Resumen corto', aria: 'Resumen de la observación' }),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar', onclick: function () { p.observations.splice(i, 1); silent(); paint(); } }, UI.icon('trash', 18))),
          h('div', { class: 'form-grid' }, UI.field('Fecha en que CORFO la comunicó', o, 'recibida', { type: 'date', onChange: upd }), UI.field('Gastos o documentos afectados', o, 'gastos', { type: 'text' }),
            UI.field('Qué pidió CORFO', o, 'detalle', { type: 'textarea', rows: 3, cls: 'wide' }), UI.field('Tu aclaración', o, 'respuesta', { type: 'textarea', rows: 4, cls: 'wide', hint: 'También agrega un comentario en la glosa del gasto en SGP.' }),
            UI.field('Ya envié la aclaración en SGP', o, 'respondida', { type: 'check', onChange: upd })), status));
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
    function msg(kind, t) { U.clear(out); out.appendChild(UI.callout(kind, '', t)); }
    root.appendChild(UI.callout('info', 'Cómo funciona:', ' tus datos se guardan en este dispositivo. Si conectas el servicio de tu comunidad (un Apps Script en su propia cuenta de Google) y entras con la contraseña de tu comunidad, la app puede leer fotos con Google Cloud Vision y guardar una copia en el Drive de la comunidad. Nada se manda a la nube sin que tú lo pidas.'));
    var pendBox = h('div');
    function paintPend() {
      U.clear(pendBox);
      RF.outbox.list().then(function (items) {
        if (!items.length) return;
        pendBox.appendChild(UI.callout('warn', items.length + (items.length === 1 ? ' archivo espera para subirse al Drive.' : ' archivos esperan para subirse al Drive.'), ' Se subirán solos cuando haya conexión.'));
        pendBox.appendChild(UI.btn('Reintentar ahora', { icon: 'cloud', cls: 'ghost', onclick: function () { msg('info', 'Subiendo lo pendiente…'); RF.drive.flushOutbox().then(function (r) { msg(r.left ? 'info' : 'ok', r.left ? 'Todavía quedan ' + r.left + ' pendientes.' : 'No queda nada pendiente.'); paintPend(); }); } }));
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
        setupBox.appendChild(h('div', { class: 'callout info' }, h('strong', null, 'El servicio todavía no tiene cuenta.'), h('span', null, ' Escribe el código de instalación que puso quien lo instaló (se usa una sola vez). La cuenta se crea con el nombre de tu comunidad y la contraseña que ya elegiste.'),
          h('div', { class: 'inline-add' }, code, UI.btn('Crear la cuenta del servicio', { icon: 'shield', cls: 'primary', onclick: function () { msg('info', 'Creando la cuenta…'); RF.auth.serverSetup(code.value.trim()).then(function () { code.value = ''; msg('ok', 'Cuenta creada. Desde ahora entras al servicio con la misma contraseña.'); paintSetup({ account: true, version: info.version }); }).catch(function (e) { msg('bad', e.message); }); } }))));
      } else setupBox.appendChild(UI.callout('ok', 'El servicio tiene cuenta.', ' Se inicia sesión sola con tu contraseña cada vez que abres la app.'));
    }
    root.appendChild(UI.section('Servicio de la comunidad', [h('div', { class: 'form-grid' },
      UI.field('Dirección del servicio (termina en /exec)', s.cloud, 'apiUrl', { type: 'text', cls: 'wide', ph: 'https://script.google.com/macros/s/…/exec' })),
      h('div', { class: 'row-actions' },
        UI.btn('Probar conexión', { icon: 'link', cls: 'primary', onclick: function () { msg('info', 'Probando…'); RF.cloud.ping().then(function (r) { if (r && r.ok) { msg('ok', 'Conectado · versión ' + (r.version || '?') + ' · lectura de fotos: ' + (r.ocr ? 'lista' : 'no configurada')); paintSetup(r); } else msg('bad', 'El servicio respondió con un error: ' + ((r && r.error) || 'desconocido')); }).catch(function (e) { msg('bad', e.message === 'NO_CONFIGURADO' ? 'Pega primero la dirección del servicio (empieza con https://).' : 'No se pudo conectar (' + e.message + ').'); }); } }),
        UI.btn('Guardar copia en la nube', { icon: 'cloud', onclick: function () { msg('info', 'Guardando…'); RF.drive.pushState().then(function (r) { if (r.ok) msg('ok', 'Copia guardada en el Drive de la comunidad.'); else if (r.conflict) RF.drive.resolveConflict().then(function (res) { msg(res.ok ? 'ok' : 'info', res.text); }); else msg('bad', 'No se pudo guardar: ' + (r.error || 'error')); }).catch(function (e) { msg('bad', 'No se pudo guardar (' + e.message + ').'); }); } }),
        UI.btn('Traer la copia de la nube', { icon: 'download', onclick: function () { msg('info', 'Trayendo…'); RF.drive.resolveConflict({ pullOnly: true }).then(function (res) { msg(res.ok ? 'ok' : 'info', res.text); }).catch(function (e) { msg('bad', 'No se pudo traer (' + e.message + ').'); }); } })),
      s.cloud.conflict ? UI.callout('warn', 'Hay una copia más nueva en la nube.', ' Otro equipo guardó cambios. Pulsa «Guardar copia en la nube» para combinarlas sin perder nada.') : null,
      s.cloud.lastSync ? h('p', { class: 'hint' }, 'Última copia en la nube: ' + new Date(s.cloud.lastSync).toLocaleString('es-CL')) : null, setupBox, pendBox, out]));
    /* carpeta «Rinde fácil» en el Drive de la comunidad */
    var driveOut = h('div'), savesBox = h('div');
    function paintSaves() {
      U.clear(savesBox);
      var list = (RF.store.get().cloud.saves || []);
      if (!list.length) { savesBox.appendChild(UI.empty('Aún no se guarda nada desde esta app.')); return; }
      savesBox.appendChild(h('ul', { class: 'saves' }, list.slice(0, 8).map(function (x) {
        return h('li', null, x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.name) : h('span', null, x.name), h('span', { class: 'muted' }, ' · ' + (x.where || '') + ' · ' + new Date(x.at).toLocaleString('es-CL')));
      })));
    }
    var pj = RF.store.project();
    root.appendChild(UI.section('Carpeta «Rinde fácil» en tu Drive', [
      h('p', { class: 'hint' }, 'Lo que saques (Carta Gantt, anexos, rendición) y las fotos que revises quedan ordenados en una carpeta de tu Drive: Proyectos › nombre del proyecto › Planificación, Anexos, Rendición y Comprobantes por mes. Nunca se borra nada; si un documento cambia, se guarda otra versión.'),
      UI.field('Guardar en el Drive todo lo que saque o suba', s.cloud, 'autoSave', { type: 'check', onChange: function () { silentSave(); } }),
      h('div', { class: 'row-actions' },
        UI.btn('Preparar mi carpeta' + (pj ? ' para «' + pj.name + '»' : ''), { icon: 'folder', cls: 'primary', onclick: function () { U.clear(driveOut); driveOut.appendChild(UI.callout('info', '', 'Preparando la carpeta…')); RF.drive.setup(pj && pj.name).then(function (r) { U.clear(driveOut); driveOut.appendChild(UI.callout('ok', 'Lista.', ' La carpeta «Rinde fácil» está en tu Drive.')); if (r.rootUrl) driveOut.appendChild(h('p', null, h('a', { href: r.rootUrl, target: '_blank', rel: 'noopener' }, 'Abrir la carpeta en Drive'))); paintSaves(); }).catch(function (e) { U.clear(driveOut); driveOut.appendChild(UI.callout('bad', '', e.message === 'NO_CONFIGURADO' ? 'Primero conecta el servicio de tu comunidad.' : 'No se pudo preparar la carpeta (' + e.message + ').')); }); } }),
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

  RF.rendicion = { rendicionDoc: rendicionDoc, expedienteDoc: expedienteDoc, newExpense: newExpense };
})(typeof window !== 'undefined' ? window : globalThis);
