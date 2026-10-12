/* Rinde Fácil — «Subir el PEA»: lee el Word del PEA (RF.pea, js/24-pea-extract.js), muestra un resumen para revisar
 * y lo aplica al proyecto sin borrar nada de lo que ya existe.
 * La parte pura (RF.pea.applyToState: modelo del PEA -> estado nuevo) no toca el DOM ni los servicios; se prueba en test/pea_apply.test.mjs.
 * Los campos de cada proyecto siguen el esquema de js/02-store.js (newProject) y de js/32-tools-plan.js (budgetLines, gantt). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var P = RF.pea = RF.pea || {};
  var TOOLS = RF.tools = RF.tools || {};

  var ADMIN = 'Gastos de administración';
  var RUT_ACUERDO = ''; /* el RUT de la comunidad se escribe al subir el PEA (está en el Acuerdo): no va en el código */
  var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  var CUENTAS = ['rrhh', 'operacion', 'inversion', 'administracion'];
  var CUENTA_LBL = { rrhh: 'Recursos humanos', operacion: 'Gastos operacionales', inversion: 'Gastos de inversión', administracion: 'Gastos de administración' };
  var PDF_MIME = 'application/pdf';
  var OCR_AVISO = 'Este PEA se leyó por OCR (PDF escaneado): revisa cada dato contra el documento antes de aplicar. El presupuesto y la carta Gantt no se leen de un escaneado: cárgalos a mano o sube el Word del PEA.';
  var LOCAL_MSG = 'Guardado solo en este equipo; conecta el servicio para copiarlo al Drive.';
  var seq = 0;

  /* ---------- lógica pura ---------- */

  function nrm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function clean(v) { var s = String(v == null ? '' : v).trim(); return s === '' ? null : s; }
  function copia(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function sameName(a, b) { var x = nrm(a); return x !== '' && x === nrm(b); }
  function findNamed(list, name) {
    for (var i = 0; i < (list || []).length; i++) if (sameName(list[i].name, name)) return list[i];
    return null;
  }
  function newId(prefix, opts) {
    if (opts && typeof opts.uid === 'function') return opts.uid(prefix);
    if (RF.util && RF.util.uid) return RF.util.uid(prefix);
    seq++;
    return prefix + '-' + seq.toString(36) + '-' + Date.now().toString(36);
  }
  /* etiqueta de cuenta del PEA («RECURSOS HUMANOS», «GASTOS DE INVERSIÓN»…) -> clave de la app */
  function cuentaKey(label) {
    var n = nrm(label).toUpperCase();
    if (/RECURSOS HUMANOS/.test(n)) return 'rrhh';
    if (/OPERACION/.test(n)) return 'operacion';
    if (/INVERSION/.test(n)) return 'inversion';
    if (/ADMINISTRACION/.test(n)) return 'administracion';
    return null;
  }
  /* nombre con el que se crea el proyecto; si el PEA no trae nombre no se inventa uno */
  P.nameOf = function (mp) { return clean(mp && mp.name) || ('Proyecto ' + ((mp && mp.code) || 'sin nombre')); };
  function lineSig(cuenta, item, monto, fuente) { return [cuenta, nrm(item), monto, fuente].join('|'); }
  /* mismo esquema que RF.store newProject (js/02-store.js); migrate() completa los campos que falten al recargar */
  function makeProject(name, opts) {
    return {
      id: newId('p', opts), name: name, code: '', convenio: 'corfo-2026-09', tipo: 'inversion',
      start: '', end: '', desembolso1: '', periodoInicio: '', periodoFin: '',
      budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: 0 },
      done: {}, gantt: { stages: [] }, budgetLines: [], expenses: [], f29: [], obras: [], forms: {}, pea: { general: {}, proyecto: {} },
      observations: [], cotizaciones: [], reitem: { rows: [], motivo: '' }, notes: '',
      needs: {}, needsSet: false, peaAprobado: false, peaAprobadoAt: '', needsPea: null, needsAdded: [], needsCustom: [], show: {}, createdAt: new Date().toISOString()
    };
  }

  /* RUT que se prellena en la pantalla: el del PEA (vacío si el PEA no lo trae) */
  P.rutInicial = function (model) { return clean(model && model.community && model.community.rut) || ''; };

  /* Devuelve un estado NUEVO (no toca el de entrada). Reglas:
   * - nunca borra comunidades, proyectos, líneas ni actividades existentes;
   * - un proyecto con el mismo nombre se reutiliza (no se duplica); sus datos del PEA reemplazan los campos del PEA
   *   solo cuando el PEA trae un valor (un campo vacío en el PEA no borra lo que hubiera);
   * - las líneas de presupuesto y las actividades que ya existen (mismo contenido) no se repiten;
   * - «Gastos de administración» se crea o actualiza una sola vez, con auto: true;
   * - opts.rut y opts.legalRep, si vienen, reemplazan los del modelo (opts.rut undefined = usar el del modelo). */
  P.applyToState = function (state, model, opts) {
    opts = opts || {};
    var s = JSON.parse(JSON.stringify(state || {}));
    var m = model || {};
    var mc = m.community || {};

    s.community = s.community || {};
    var c = s.community;
    c.name = clean(mc.name) || c.name || '';
    var rut = opts.rut !== undefined ? clean(opts.rut) : clean(mc.rut);
    c.rut = rut || c.rut || '';
    var legal = opts.legalRep !== undefined ? clean(opts.legalRep) : clean(mc.legalRep);
    c.legalRep = legal || c.legalRep || '';

    /* contacto y datos del PEA: se copian del modelo (o de opts.contacto); nunca borran lo que ya hay */
    var contacto = opts.contacto || mc.contacto;
    if (contacto) c.contacto = copia(contacto);
    var mail = clean(((contacto && contacto.correos) || [])[0]);
    var fono = clean(((contacto && contacto.telefonos) || [])[0]);
    if (!clean(c.email) && mail) c.email = mail;
    if (!clean(c.phone) && fono) c.phone = fono;
    if (Array.isArray(mc.peaDatos)) c.peaDatos = copia(mc.peaDatos);
    else if (!Array.isArray(c.peaDatos)) c.peaDatos = [];
    ['fechaEntrega', 'asambleaValidacion', 'apoyo'].forEach(function (k) {
      if (mc[k] != null) c[k] = mc[k];
      else if (c[k] === undefined) c[k] = null;
    });

    s.projects = Array.isArray(s.projects) ? s.projects : [];
    (m.projects || []).forEach(function (mp) {
      if (!mp || sameName(mp.name, ADMIN)) return;
      var p = findNamed(s.projects, P.nameOf(mp));
      if (!p) { p = makeProject(P.nameOf(mp), opts); s.projects.push(p); }

      if (clean(mp.code)) p.code = clean(mp.code);
      if (mp.start) p.start = mp.start;
      if (mp.end) p.end = mp.end;
      if (mp.source) p.peaSource = mp.source;
      if (Array.isArray(mp.peaDatos)) p.peaDatos = copia(mp.peaDatos);
      if (mp.fuentes) p.fuentes = copia(mp.fuentes);

      p.budgetApproved = Object.assign({ rrhh: 0, operacion: 0, inversion: 0, administracion: 0 }, p.budgetApproved || {});
      CUENTAS.forEach(function (k) {
        var v = mp.budgetApproved && mp.budgetApproved[k];
        if (v != null) p.budgetApproved[k] = v;
      });

      p.budgetLines = Array.isArray(p.budgetLines) ? p.budgetLines : [];
      var sigs = {};
      p.budgetLines.forEach(function (l) { sigs[lineSig(l.cuenta, l.item, l.monto, l.fuente)] = true; });
      (mp.budgetLines || []).forEach(function (l) {
        var cu = cuentaKey(l.cuenta);
        if (!cu || l.monto == null) return;
        var fuente = /propio|aporte/i.test(String(l.fuente || '')) ? 'propio' : 'corfo';
        var item = clean(l.item) || '(sin nombre)';
        var sig = lineSig(cu, item, l.monto, fuente);
        if (sigs[sig]) return;
        sigs[sig] = true;
        p.budgetLines.push({ id: newId('b', opts), cuenta: cu, item: item, glosa: clean(l.glosa) || '', fuente: fuente, monto: l.monto, actId: '' });
      });

      if (!p.gantt || !Array.isArray(p.gantt.stages)) p.gantt = { stages: [] };
      ((mp.gantt && mp.gantt.stages) || []).forEach(function (ms) {
        var sname = clean(ms.name) || 'Sin etapa';
        var st = findNamed(p.gantt.stages, sname);
        if (!st) { st = { id: newId('s', opts), name: sname, acts: [] }; p.gantt.stages.push(st); }
        if (!Array.isArray(st.acts)) st.acts = [];
        (ms.acts || []).forEach(function (a) {
          var aname = clean(a.name) || '(sin nombre)';
          if (findNamed(st.acts, aname)) return;
          st.acts.push({ id: newId('a', opts), name: aname, start: a.start || '', end: a.end || '', result: clean(a.result) || '' });
        });
      });
    });

    var admin = (m.projects || []).filter(function (x) { return x && sameName(x.name, ADMIN); })[0];
    if (admin) {
      var ap = findNamed(s.projects, ADMIN);
      if (!ap) { ap = makeProject(ADMIN, opts); s.projects.push(ap); }
      ap.auto = true;
      ap.budgetApproved = Object.assign({ rrhh: 0, operacion: 0, inversion: 0, administracion: 0 }, ap.budgetApproved || {});
      var monto = admin.budgetApproved && admin.budgetApproved.administracion;
      if (monto != null) ap.budgetApproved.administracion = monto;
    }
    return s;
  };

  /* ---------- pantalla ---------- */

  function readBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('no se pudo leer el archivo')); };
      fr.readAsArrayBuffer(file);
    });
  }
  function msgOf(e) { return (e && e.message) || String(e || 'error desconocido'); }

  /* guarda el Word del PEA en la carpeta de planificación del Drive; devuelve {local:true} si no hay servicio */
  function savePeaDrive(file, projectName) {
    if (!RF.drive || !RF.drive.enabled()) return Promise.resolve({ local: true });
    var mime = /\.pdf$/i.test(file.name) ? PDF_MIME : DOCX_MIME;
    return RF.cloud.blobToBase64(file).then(function (b64) {
      return RF.cloud.post('saveFile', { project: projectName || 'Mi comunidad', category: 'planificacion', fileName: file.name, mimeType: mime, base64: b64 }, 90000);
    }).then(function (r) {
      if (!r || !r.ok) throw new Error(RF.drive.errText(r && r.error));
      return r;
    });
  }

  /* acta de no objeción: Documentos oficiales (categoría oficial, subcarpeta «Actas de no objeción») */
  function saveActaRecord(file, date, projectId) {
    var s = RF.store.get();
    var p = (s.projects || []).filter(function (x) { return x.id === projectId; })[0];
    if (!p) return Promise.reject(new Error('el proyecto ya no existe'));
    var rec = { id: newId('d'), type: 'acta_no_objecion', title: 'Acta de No Objeción', date: date, projectId: p.id, from: 'corfo', peaChange: 'no', changes: {}, note: '', sgpDone: false, appDone: false, createdAt: new Date().toISOString(), fileName: file.name, mime: RF.repo.mimeOf(file.name, file.type), size: file.size, blobId: null };
    rec.blobId = 'rec-' + rec.id;
    return RF.blobs.put(rec.blobId, file).then(function () {
      RF.store.update(function (st2) {
        st2.repo = st2.repo || { docs: [], actas: [] };
        st2.repo.docs = st2.repo.docs || [];
        st2.repo.docs.push(rec);
        var pp = (st2.projects || []).filter(function (x) { return x.id === p.id; })[0];
        if (pp) pp.actaNoObjecion = { date: date, fileName: file.name, docId: rec.id, at: rec.createdAt };
      });
      if (!RF.drive || !RF.drive.enabled()) return { local: true, rec: rec };
      return RF.drive.saveExternal(rec, file).then(function (r) {
        if (RF.repo.attachDriveResult(rec, r)) RF.store.update(function () { }, { silent: true });
        return { local: false, rec: rec, r: r };
      });
    });
  }

  TOOLS.subirpea = { title: 'Subir el PEA', icon: 'file', desc: 'Sube el Word del PEA: la app lee tu comunidad, tus proyectos, el presupuesto y la Carta Gantt, y los aplica sin borrar nada.', render: function () {
    var U = RF.util, UI = RF.ui, h = U.h;
    var st = { file: null, model: null, notice: '', reading: false, stage: '', ocrText: '', fromPdf: false, busy: false, rut: RUT_ACUERDO, legalRep: '', result: null,
      acta: { file: null, date: '', projectId: '', busy: false, result: null } };
    var body = h('div');

    function dd(label, value, fallback) { return [h('dt', null, label), h('dd', null, value ? String(value) : (fallback || 'No aparece en el PEA'))]; }
    function fechaTxt(iso) { return iso ? U.fmtDate(iso) : null; }
    function money(v) { return v == null ? '—' : U.fmtCLP(v); }

    function onFile(file) {
      if (!file) return;
      st.file = null; st.model = null; st.result = null; st.notice = ''; st.ocrText = ''; st.fromPdf = false; st.stage = '';
      if (/\.pdf$/i.test(file.name) || /pdf/i.test(file.type || '')) { onPdf(file); return; }
      if (!/\.docx$/i.test(file.name)) { st.notice = 'Ese archivo no es un Word (.docx) ni un PDF. Sube el Word del PEA o el PDF escaneado.'; paint(); return; }
      st.file = file; st.reading = true; paint();
      readBuffer(file).then(function (buf) { return P.extractFromDocxBytes(buf); }).then(function (model) {
        if (st.file !== file) return;
        st.model = model;
        st.rut = P.rutInicial(model);
        st.legalRep = clean(model.community && model.community.legalRep) || '';
      }).catch(function (e) {
        if (st.file === file) { st.file = null; st.notice = 'No se pudo leer el Word: ' + msgOf(e) + '. Revisa que sea el Word del PEA.'; }
      }).then(function () { st.reading = false; paint(); });
    }

    /* PDF escaneado: se manda al OCR del servicio y se lee por posición (RF.pea.extractFromOcr) */
    function onPdf(file) {
      if (!RF.ocr || !RF.ocr.recognizePage || !RF.pdfPages || !RF.pea.extractFromOcr) { st.notice = 'No está cargada la lectura de PDF en esta versión.'; paint(); return; }
      if (!RF.cloud || !RF.cloud.configured()) { st.notice = 'Para leer un PDF escaneado conecta primero el servicio en la nube (en Ajustes). Mientras tanto puedes subir el Word del PEA.'; paint(); return; }
      st.file = file; st.reading = true; st.fromPdf = true; st.stage = 'Leyendo el PDF con Google…'; paint();
      var say = function (label) { st.stage = label; if (st.file === file) paint(); };
      readBuffer(file).then(function (buf) {
        return RF.pdfPages.renderPages(buf, function (num, total) { say('Preparando la página ' + num + ' de ' + total + '…'); });
      }).then(function (rendered) {
        var results = [], chain = Promise.resolve();
        rendered.pages.forEach(function (p) {
          chain = chain.then(function () {
            say('Leyendo la página ' + p.number + ' de ' + rendered.total + ' con Google…');
            return RF.ocr.recognizePage(p.blob, p.number).then(function (r) { results.push(r); });
          });
        });
        return chain.then(function () { return RF.pdfPages.aggregate(results, rendered.total); });
      }).then(function (res) {
        if (st.file !== file) return;
        if (!res || !res.ok) {
          var det = String((res && res.error) || 'OCR_SIN_TEXTO');
          throw new Error(/SIN_TEXTO/.test(det) ? 'el OCR no encontró texto legible en el PDF' : 'el servicio respondió con «' + det + '»');
        }
        st.ocrText = res.raw_text || '';
        st.model = RF.pea.extractFromOcr(res);
        st.rut = P.rutInicial(st.model);
        st.legalRep = clean(st.model.community && st.model.community.legalRep) || '';
      }).catch(function (e) {
        if (st.file === file) { st.file = null; st.model = null; st.fromPdf = false; st.notice = 'No se pudo leer el PDF: ' + msgOf(e) + '.'; }
      }).then(function () { st.reading = false; st.stage = ''; paint(); });
    }

    function uploadBox() {
      var inp = h('input', { type: 'file', accept: '.docx,.pdf', class: 'sr-only', 'aria-label': 'Elegir el Word o el PDF del PEA' });
      return UI.section('1 · Elige el Word o el PDF del PEA', [
        h('div', { class: 'file-pick' }, inp,
          UI.btn(st.file ? 'Cambiar archivo' : 'Elegir el PEA', { icon: 'file', cls: st.file ? 'ghost' : 'primary', onclick: function () { inp.click(); } }),
          st.file ? h('span', { class: 'file-name' }, st.file.name + ' · ' + Math.max(1, Math.round(st.file.size / 1024)) + ' KB') : h('span', { class: 'hint' }, 'Word (.docx) o PDF escaneado (se lee con el OCR del servicio).')),
        UI.fileDrop(inp, { kind: 'official', label: 'Arrastra aquí el PEA o pulsa para buscarlo', hint: 'Word (.docx) o PDF.', invalidText: 'Ese formato no se puede leer aquí. Sube el PEA en Word (.docx) o PDF.', onFiles: function (files) { onFile(files[0]); } }),
        st.notice ? UI.callout('warn', '', st.notice) : null,
        st.reading ? h('p', { class: 'hint' }, st.stage || 'Leyendo el PEA…') : null
      ]);
    }

    function summaryBox() {
      var m = st.model, mc = m.community || {}, kids = [];
      var pdfRut = clean(mc.rut);
      var difiere = pdfRut && st.rut && pdfRut.replace(/\D/g, '') !== st.rut.replace(/\D/g, '');
      var rutInp = h('input', { type: 'text', value: st.rut, autocomplete: 'off', 'aria-label': 'RUT de la comunidad' });
      rutInp.addEventListener('input', function () { st.rut = rutInp.value; });
      var legalInp = h('input', { type: 'text', value: st.legalRep, autocomplete: 'off', 'aria-label': 'Representante legal' });
      legalInp.addEventListener('input', function () { st.legalRep = legalInp.value; });

      kids.push(UI.section('2 · Lo que dice el PEA', [
        h('dl', { class: 'kv' }, dd('Comunidad', mc.name), dd('RUT en el PEA', pdfRut), dd('Dirección', mc.address), dd('Representante legal en el PEA', mc.legalRep, 'No aparece en el PEA'), dd('Organismo colaborador', null, 'No aparece con nombre en el PEA; queda vacío')),
        h('p', { class: 'hint' }, 'Organismo colaborador: el PEA solo marca opciones, así que no se completa.')
      ]));

      kids.push(UI.section('3 · Datos que se aplican', [
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'RUT de la comunidad'), rutInp,
          h('span', { class: 'hint' }, difiere ? ('El PEA dice ' + pdfRut + '; revisa cuál corresponde.') : (pdfRut && st.rut ? 'El RUT viene del PEA. Revisa que coincida con el del Acuerdo CORFO.' : (st.rut ? 'Revisa que sea el RUT de la comunidad.' : 'Escribe el RUT de la comunidad (está en el Acuerdo CORFO).')))),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Representante legal'), legalInp,
          h('span', { class: 'hint' }, mc.legalRep ? 'Tomado del PEA; puedes cambiarlo.' : 'El PEA no lo trae: queda vacío hasta que lo escribas.'))
      ]));

      var projs = (m.projects || []).filter(function (x) { return x && !sameName(x.name, ADMIN); });
      if (!projs.length) kids.push(UI.callout('warn', 'El PEA no trae proyectos.', ' Revisa el Word: la app busca tablas «Nombre del proyecto».'));
      projs.forEach(function (mp) {
        var acts = 0, stages = ((mp.gantt && mp.gantt.stages) || []);
        stages.forEach(function (x) { acts += (x.acts || []).length; });
        var bud = mp.budgetApproved || {};
        kids.push(h('article', { class: 'pea-proj' },
          h('h3', null, P.nameOf(mp)),
          h('dl', { class: 'kv' }, dd('Código', mp.code, 'Sin código: lo asigna CORFO'), dd('Inicio', fechaTxt(mp.start), 'No aparece en el PEA'), dd('Término', fechaTxt(mp.end), 'No aparece en el PEA')),
          h('table', { class: 'plain-grid' }, h('tbody', null, CUENTAS.map(function (k) { return h('tr', null, h('th', { scope: 'row' }, CUENTA_LBL[k]), h('td', { class: 'r' }, money(bud[k]))); }))),
          h('p', { class: 'hint' }, (mp.budgetLines || []).length + ' línea(s) de presupuesto · ' + acts + ' actividad(es) en ' + stages.length + ' etapa(s) de la Carta Gantt.')));
      });

      var adm = (m.projects || []).filter(function (x) { return x && sameName(x.name, ADMIN); })[0];
      kids.push(UI.section('Proyecto automático «' + ADMIN + '»', [
        adm && adm.budgetApproved && adm.budgetApproved.administracion != null
          ? h('p', null, 'Monto de administración: ', h('strong', null, U.fmtCLP(adm.budgetApproved.administracion)), '. Se crea o actualiza una sola vez.')
          : UI.callout('warn', 'Sin monto:', ' el PEA no trae el total de gastos de administración.')
      ]));

      kids.push(UI.section('Todo lo que encontramos en el PEA', todoBox(mc, projs)));

      if (st.fromPdf) {
        kids.push(UI.callout('warn', 'PDF escaneado:', ' ' + OCR_AVISO));
        kids.push(h('details', { class: 'ocr-raw' }, h('summary', null, 'Texto que leyó el OCR'), h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, st.ocrText || '(sin texto)')));
      }

      var w = m.warnings || [];
      kids.push(UI.section('Avisos del PEA (' + w.length + ')', w.length
        ? [h('p', { class: 'hint' }, 'Revisa cada aviso antes de aplicar. Lo que no se pudo leer con certeza queda vacío.'), h('ul', { class: 'pea-warn' }, w.map(function (x) { return h('li', null, x); }))]
        : [UI.callout('ok', '', 'El lector no encontró avisos.')]));

      kids.push(UI.section('4 · Aplicar', [
        h('p', { class: 'hint' }, 'No borra nada de lo que ya tienes: actualiza la comunidad y agrega o completa los proyectos sin duplicarlos. Si aplicas el mismo PEA otra vez, no se repite nada.'),
        h('div', { class: 'row-actions' }, UI.btn('Aplicar al proyecto', { icon: 'check', cls: 'primary', disabled: st.busy || !st.file, onclick: apply })),
        st.result ? UI.callout(st.result.kind, '', st.result.text) : null
      ]));
      return h('div', null, kids);
    }

    /* bloque «Todo lo que encontramos»: texto completo (sin cortar), con saltos de línea */
    var WRAP = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
    function ddw(label, value) { return [h('dt', null, label), h('dd', { style: WRAP }, (value === null || value === undefined || value === '') ? 'No aparece en el PEA' : String(value))]; }
    function filasPea(list, vacio) {
      var rows = (list || []).filter(function (r) { return r && r.k; });
      if (!rows.length) return h('p', { class: 'hint' }, vacio);
      return h('dl', { class: 'kv' }, rows.map(function (r) { return ddw(r.k, r.v); }));
    }
    function fuentesPea(f) {
      f = f || {};
      var peso = function (v) { return v == null ? null : U.fmtCLP(v); };
      return h('dl', { class: 'kv' }, ddw('Con cargo al 30 % del AIA', peso(f.aia30)), ddw('Con cargo al 70 % del AIA', peso(f.aia70)), ddw('Financiamiento con otras fuentes', peso(f.otras)));
    }
    function todoBox(mc, projs) {
      var ct = mc.contacto || {}, sec = ct.secretaria || null;
      var kids = [h('p', { class: 'hint' }, 'Lectura completa del PEA. Lo que el PEA no trae aparece como «No aparece en el PEA».')];
      var comDatos = mc.peaDatos || [];
      kids.push(h('details', { open: true }, h('summary', null, 'Comunidad (' + comDatos.length + ' datos)'), filasPea(comDatos, 'El PEA no trae datos de la comunidad.')));
      kids.push(h('details', { open: true }, h('summary', null, 'Contacto y fechas'),
        h('dl', { class: 'kv' },
          ddw('Encargado del convenio', ct.encargado),
          ddw('Secretaria', sec && sec.nombre),
          ddw('RUT de la secretaria', sec && sec.rut),
          ddw('Teléfonos', (ct.telefonos || []).join('\n')),
          ddw('Correos', (ct.correos || []).join('\n')),
          ddw('Fecha de entrega a CORFO', mc.fechaEntrega ? U.fmtDate(mc.fechaEntrega) : null),
          ddw('Validación por la Asamblea', mc.asambleaValidacion ? U.fmtDate(mc.asambleaValidacion) : null))));
      projs.forEach(function (mp) {
        var datos = mp.peaDatos || [];
        kids.push(h('details', null, h('summary', null, P.nameOf(mp) + ' (' + datos.length + ' datos)'),
          filasPea(datos, 'El PEA no trae datos de este proyecto.'),
          h('h4', null, 'Fuentes de financiamiento'),
          fuentesPea(mp.fuentes)));
      });
      return kids;
    }

    function apply() {
      var m = st.model, n = (m && m.projects || []).length;
      if (!m || !st.file) return;
      UI.confirmBox('Se actualizará tu comunidad y se aplicarán ' + n + ' proyecto(s) del PEA, incluido «' + ADMIN + '». No se borra nada de lo que ya tienes. ¿Aplicar?', 'Aplicar').then(function (ok) {
        if (ok) doApply();
      });
    }

    function doApply() {
      var m = st.model, file = st.file, prevActive = RF.store.get().activeProjectId;
      st.busy = true; st.result = null; paint();
      var names = (m.projects || []).filter(Boolean).map(P.nameOf);
      try {
        names.forEach(function (nm) { if (!findNamed(RF.store.get().projects, nm)) RF.store.addProject(nm); });
        var res = P.applyToState(RF.store.get(), m, { rut: st.rut, legalRep: st.legalRep });
        RF.store.update(function (s) {
          s.community = res.community;
          s.projects = res.projects;
          if (prevActive && s.projects.some(function (p) { return p.id === prevActive; })) s.activeProjectId = prevActive;
        });
      } catch (e) {
        st.busy = false; st.result = { kind: 'bad', text: 'No se aplicó el PEA: ' + msgOf(e) + '. Revisa tus proyectos antes de volver a intentarlo.' };
        paint(); return;
      }
      var rec = { id: newId('pea'), fileName: file.name, at: new Date().toISOString(), blobId: null, projects: names, drive: null };
      var blobId = 'pea-' + rec.id;
      RF.blobs.put(blobId, file).then(function () { rec.blobId = blobId; }, function () { rec.blobId = null; })
        .then(function () {
          RF.store.update(function (s) { s.peaImports = (s.peaImports || []).concat([rec]); });
          var pr = RF.store.project();
          return savePeaDrive(file, pr && pr.name).then(function (r) { return { ok: true, r: r }; }, function (e) { return { ok: false, err: e }; });
        })
        .then(function (out) {
          var note, kind = 'ok';
          if (out.ok && out.r.local) note = LOCAL_MSG;
          else if (out.ok) {
            rec.drive = { url: out.r.url || '', folderUrl: out.r.folderUrl || '', at: new Date().toISOString() };
            RF.store.update(function () { }, { silent: true });
            note = 'El Word quedó en la carpeta de Planificación del Drive.';
          } else { kind = 'warn'; note = 'El Word no se pudo copiar al Drive (' + msgOf(out.err) + '); queda guardado en este equipo.'; }
          var adm = (m.projects || []).filter(function (x) { return x && sameName(x.name, ADMIN); })[0];
          st.busy = false;
          st.result = { kind: kind, text: 'PEA aplicado: comunidad actualizada y ' + names.length + ' proyecto(s) listos' + (adm ? ' (con «' + ADMIN + '»)' : '') + '. ' + note + ' Revisa «Mi comunidad y proyectos» y la Carta Gantt.' };
          UI.toast('PEA aplicado.', kind === 'ok' ? 'ok' : 'warn');
          paint();
        });
    }

    function actaBox() {
      var s = RF.store.get(), projs = s.projects || [];
      var inp = h('input', { type: 'file', accept: '.pdf,.docx', class: 'sr-only', 'aria-label': 'Elegir el acta de no objeción' });
      var dateInp = h('input', { type: 'date', value: st.acta.date, 'aria-label': 'Fecha del acta de no objeción' });
      dateInp.addEventListener('input', function () { st.acta.date = dateInp.value; });
      var sel = h('select', { 'aria-label': 'Proyecto al que corresponde' }, projs.map(function (p) { return h('option', { value: p.id }, p.name || 'Proyecto sin nombre'); }));
      sel.value = st.acta.projectId || s.activeProjectId || (projs[0] && projs[0].id) || '';
      sel.addEventListener('change', function () { st.acta.projectId = sel.value; });
      return UI.section('Acta de no objeción (opcional)', [
        h('p', { class: 'hint' }, 'Se registra en Documentos oficiales con la fecha que escribas. Si el servicio está conectado, también va al Drive, en «Documentos oficiales › Actas de no objeción».'),
        h('div', { class: 'file-pick' }, inp,
          UI.btn(st.acta.file ? 'Cambiar archivo' : 'Elegir el acta (PDF o Word)', { icon: 'file', cls: 'ghost', onclick: function () { inp.click(); } }),
          st.acta.file ? h('span', { class: 'file-name' }, st.acta.file.name) : null),
        UI.fileDrop(inp, { kind: 'official', label: 'Arrastra aquí el acta o pulsa para buscarla', hint: 'PDF o Word.', invalidText: 'Formato no compatible. Sube el acta en PDF o Word.', onFiles: function (files) { st.acta.file = files[0]; paint(); } }),
        h('div', { class: 'form-grid' },
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Fecha del acta'), dateInp),
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Proyecto'), sel)),
        h('div', { class: 'row-actions' }, UI.btn('Registrar el acta', { icon: 'check', cls: 'primary', disabled: st.acta.busy, onclick: saveActa })),
        st.acta.result ? UI.callout(st.acta.result.kind, '', st.acta.result.text) : null
      ]);
    }

    function saveActa() {
      var a = st.acta;
      if (!a.file) { a.result = { kind: 'bad', text: 'Elige el archivo del acta (PDF o Word).' }; paint(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) { a.result = { kind: 'bad', text: 'Escribe la fecha del acta.' }; paint(); return; }
      var pid = a.projectId || RF.store.get().activeProjectId;
      if (!pid || !(RF.store.get().projects || []).some(function (p) { return p.id === pid; })) { a.result = { kind: 'bad', text: 'Crea o aplica el PEA primero: el acta se anota en un proyecto.' }; paint(); return; }
      a.busy = true; a.result = null; paint();
      saveActaRecord(a.file, a.date, pid).then(function (out) {
        var txt, kind = 'ok';
        if (out.local) txt = 'Acta registrada en Documentos oficiales. ' + LOCAL_MSG;
        else if (out.r.status === 'saved') txt = 'Acta registrada en Documentos oficiales y copiada al Drive (Actas de no objeción).';
        else if (out.r.status === 'queued') { kind = 'warn'; txt = 'Acta registrada; su copia en el Drive quedó pendiente en este equipo (sin conexión).'; }
        else { kind = 'warn'; txt = 'Acta registrada, pero la copia en el Drive quedó incompleta. Revisa la cola antes de darla por terminada.'; }
        a.busy = false; a.file = null; a.result = { kind: kind, text: txt };
        paint();
      }).catch(function (e) {
        a.busy = false; a.result = { kind: 'bad', text: 'No se registró el acta: ' + msgOf(e) + '.' };
        paint();
      });
    }

    function paint() {
      U.clear(body);
      body.appendChild(uploadBox());
      if (st.model) body.appendChild(summaryBox());
      body.appendChild(actaBox());
    }

    paint();
    return h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, 'Subir el PEA'),
      h('p', { class: 'lead' }, 'Sube el Word del PEA para que la app arme tu comunidad, tus proyectos, el presupuesto y la Carta Gantt. Revisas todo antes de aplicarlo.'),
      body);
  } };
})(typeof window !== 'undefined' ? window : globalThis);
