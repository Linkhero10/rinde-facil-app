/* Rinde Fácil — expediente completo: todo lo del proyecto en un único archivo que se arma solo (Word, PDF, Excel o Drive).
 * Incluye datos, ruta, plata por cuenta, PEA, gastos (escritos), respaldos, cotizaciones, F29, anexos con sus firmas, informe técnico y fichas,
 * observaciones, lista de archivos guardados e historial. Las imágenes no van dentro: se listan con su enlace al Drive. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, L = RF.logic, D = RF.data, h = U.h, TOOLS = RF.tools = RF.tools || {};
  function num(x) { return Number(x) || 0; }
  function money(n) { return U.fmtCLP(Number(n) || 0); }
  function safe(fn) { try { return fn(); } catch (e) { return null; } }

  function hasData(p, id) { var f = p.forms && p.forms[id]; return Array.isArray(f) ? f.length > 0 : !!(f && f.data && Object.keys(f.data).some(function (k) { var v = f.data[k]; return v !== '' && v != null && !(Array.isArray(v) && !v.length) && k !== 'fecha'; })); }

  /* qué incluye y cuánto lleva cada parte */
  function parts(p, s) {
    var ex = (p.expenses || []).filter(function (e) { return e && (e.proveedor || e.total); }), forms = function (id) { var f = p.forms && p.forms[id]; return Array.isArray(f) ? f.length : (hasData(p, id) ? 1 : 0); };
    return [
      { id: 'datos', t: 'Datos de la comunidad y del proyecto', n: (s.community.name ? 1 : 0) + (p.name ? 1 : 0), unit: '', done: !!(s.community.name && p.name) },
      { id: 'plata', t: 'Plata por cuenta', n: D.CUENTAS.filter(function (c) { return num(p.budgetApproved && p.budgetApproved[c.id]) > 0; }).length, unit: 'cuentas con monto aprobado', done: true },
      { id: 'pea', t: 'PEA: Carta Gantt, presupuesto y formularios', n: L.allActivities(p).length + (p.budgetLines || []).length, unit: 'actividades y líneas', done: L.allActivities(p).length > 0 && (p.budgetLines || []).length > 0 },
      { id: 'gastos', t: 'Gastos y respaldos (escritos)', n: ex.length, unit: ex.length === 1 ? 'gasto' : 'gastos', done: ex.length > 0 },
      { id: 'cot', t: 'Cotizaciones', n: (p.cotizaciones || []).length, unit: 'compras', done: true },
      { id: 'f29', t: 'Formulario 29 mes a mes', n: (p.f29 || []).length, unit: 'meses', done: true },
      { id: 'anexos', t: 'Anexos 1 a 5 y registro de viaje', n: ['anexo1', 'anexo2', 'anexo3', 'anexo4', 'anexo5', 'viaje'].reduce(function (a, k) { return a + forms(k); }, 0), unit: 'documentos', done: true },
      { id: 'informe', t: 'Informe técnico y fichas', n: forms('informe') + ['informeA', 'informeB', 'informeC', 'informeD', 'informeE'].reduce(function (a, k) { return a + forms(k); }, 0), unit: 'documentos', done: forms('informe') > 0 },
      { id: 'obs', t: 'Observaciones de CORFO y cambios', n: (p.observations || []).length + ((p.reitem && (p.reitem.rows || []).length) ? 1 : 0) + forms('prorroga') + forms('solicitud'), unit: 'registros', done: true },
    ];
  }

  function build(p, s) {
    var c = s.community, blocks = [];
    var CCOL = { rrhh: '#51247a', operacion: '#2a5db0', inversion: '#2e7d4f', administracion: '#a8741a' };
    var tot = L.totalsByCuenta(p), exAll = (p.expenses || []).filter(function (e) { return e && (e.proveedor || e.total); });
    var rend0 = D.CUENTAS.reduce(function (a, cu) { return a + tot[cu.id].rendido; }, 0), apro0 = D.CUENTAS.reduce(function (a, cu) { return a + tot[cu.id].aprobado; }, 0);
    function fd(d) { return d ? U.fmtDate(d) : ''; }
    var vigencia = (p.start ? fd(p.start) : '') + (p.end ? ' al ' + fd(p.end) : '');
    blocks.push({ t: 'cover', kicker: 'Informe de ejecución y rendición', title: p.name || 'Proyecto', subtitle: c.name || '', rows: [['Comunidad', c.name], ['RUT', c.rut], ['Representante legal', c.legalRep], ['Código del proyecto', p.code], ['Vigencia', vigencia], ['Emitido el', fd(U.todayISO())]],
      kpis: [{ label: 'Aprobado por CORFO', value: money(apro0) }, { label: 'Rendido a la fecha', value: money(rend0) }, { label: 'Saldo por rendir', value: money(apro0 - rend0) }], note: 'Documento preparado con Rinde Fácil a partir de la información registrada por la comunidad.' });
    blocks.push({ t: 'toc' });
    function H(t) { blocks.push({ t: 'h', text: t }); }
    /* un documento ajeno (PEA, anexos…) se incluye con sus títulos internos como subtítulos */
    function addDoc(title, d, opts) {
      if (!d || !(d.blocks || []).length) return; H(title);
      var skipKv = false;
      d.blocks.forEach(function (b) {
        if (b.t === 'h') { var tx = String(b.text || '').replace(/^\d+[a-z]?\.\s*/, ''); skipKv = !!(opts && opts.ganttHead && /gantt/i.test(tx)); blocks.push({ t: 'h3', text: tx }); }
        else if (b.t === 'kv' && skipKv) { skipKv = false; }
        else if (b.t === 'table' && opts && opts.ganttHead && b.head && b.head[0] === 'Etapa' && b.head.length > 6) { blocks.push(ganttBlock(b)); }
        else blocks.push(b);
      });
    }
    function ganttBlock(b) {
      var months = b.head.slice(6);
      return { t: 'gantt', months: months, rows: b.rows.map(function (r) { return { stage: r[0], name: r[1], start: r[2], end: r[3], days: r[4], result: r[5], on: months.map(function (_, i) { return r[6 + i] === '■'; }) }; }) };
    }
    H('1. Datos de la comunidad y del proyecto');
    blocks.push({ t: 'kv', rows: [['Comunidad', c.name], ['RUT de la comunidad', c.rut], ['Dirección', c.address], ['Representante legal', c.legalRep], ['Correo y teléfono', [c.email, c.phone].filter(Boolean).join(' · ')], ['Organismo Colaborador', c.oc], ['Proyecto', p.name], ['Código', p.code], ['Vigencia del proyecto', vigencia], ['Período que se rinde', (p.periodoInicio ? fd(p.periodoInicio) : '') + (p.periodoFin ? ' al ' + fd(p.periodoFin) : '')], ['Primer pago (30 %)', fd(p.desembolso1)]] });
    H('2. Ejecución financiera');
    blocks.push({ t: 'table', head: ['Cuenta', 'Aprobado ($)', 'Presupuestado en el PEA ($)', 'Rendido ($)', 'Saldo por rendir ($)', 'Gastos'], types: ['text', 'money', 'money', 'money', 'money', 'number'], rows: D.CUENTAS.map(function (cu) { var t = tot[cu.id]; return [cu.name, t.aprobado, t.presupuestado, t.rendido, t.aprobado - t.rendido, t.cantidad]; }), foot: ['TOTAL', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM'] });
    blocks.push({ t: 'chart', kind: 'hbar', title: 'Rendido y aprobado por cuenta', note: 'La barra es lo rendido; la raya negra, lo aprobado por CORFO en cada cuenta.', items: D.CUENTAS.map(function (cu) { var t = tot[cu.id]; return { label: cu.name, value: t.rendido, max: t.aprobado, color: CCOL[cu.id], text: money(t.rendido) + (t.aprobado ? ' de ' + money(t.aprobado) : '') }; }) });
    (function () {
      var seen = {}; exAll.forEach(function (e) { var m = String(e.fecha || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m)) seen[m] = true; });
      var keys = Object.keys(seen).sort(); if (!keys.length) return;
      var cats = [], cur = keys[0], end = keys[keys.length - 1], MS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      while (cur <= end && cats.length < 36) { cats.push(cur); var y = +cur.slice(0, 4), m = +cur.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } cur = y + '-' + (m < 10 ? '0' : '') + m; }
      blocks.push({ t: 'chart', kind: 'vbar', title: 'Gasto rendido mes a mes', note: 'Cada barra suma lo rendido en el mes, separado por cuenta.', cats: cats.map(function (m, i) { return { label: MS[+m.slice(5, 7) - 1], year: (i === 0 || m.slice(5, 7) === '01') ? m.slice(0, 4) : '' }; }), series: D.CUENTAS.map(function (cu) { return { name: cu.name, color: CCOL[cu.id], values: cats.map(function (m) { return exAll.filter(function (e) { return e.cuenta === cu.id && String(e.fecha || '').slice(0, 7) === m; }).reduce(function (a, e) { return a + num(e.montoRendir || e.total); }, 0); }) }; }) });
    })();
    var pea = safe(function () { return RF.docs.model('pea'); }); addDoc('3. Plan de ejecución (PEA)', pea, { ganttHead: true });
    var ex = exAll.slice().sort(function (a, b) { return String(a.fecha || '') < String(b.fecha || '') ? -1 : 1; });
    H('4. Detalle de los gastos');
    blocks.push({ t: 'table', wide: true, pw: [2.5, 6.5, 8, 9.5, 12, 8, 7.5, 7, 7.5, 7.5, 8.5, 16], head: ['N°', 'Fecha', 'Cuenta', 'Documento', 'Proveedor', 'RUT', 'Neto ($)', 'IVA ($)', 'Total ($)', 'A rendir ($)', 'Forma de pago', 'Glosa'], types: ['number', 'date', 'text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'text', 'text'],
      rows: ex.map(function (e, i) { var cu = D.CUENTA_BY_ID[e.cuenta] || {}; return [i + 1, e.fecha, cu.name || '', ((D.DOC_BY_ID[e.docType] || {}).name || '') + (e.folio ? ' N° ' + e.folio : ''), e.proveedor, e.rutProveedor, num(e.neto), num(e.iva), num(e.total), num(e.montoRendir), (D.FORMAS_PAGO.filter(function (f) { return f.id === e.formaPago; })[0] || {}).name || e.formaPago || '', e.glosa]; }), foot: ['', '', '', '', '', 'TOTAL', 'SUM', 'SUM', 'SUM', 'SUM', '', ''] });
    var n = 5;
    var exp = safe(function () { return RF.rendicion.expedienteDoc(p, c); }); if (exp) { addDoc(n + '. Respaldos de cada gasto', exp); n++; }
    if ((p.cotizaciones || []).length) { addDoc(n + '. Cotizaciones', safe(function () { return RF.plan.cotDoc(p); })); n++; }
    var f29 = L.f29Audit(p, c);
    if (f29.items.length) { H(n + '. Formulario 29 mes a mes'); n++; blocks.push({ t: 'table', pw: [10, 9, 18, 18, 22, 23], head: ['Mes', 'Facturas', 'IVA de las facturas ($)', 'Créditos del F29 ($)', 'Archivo', 'Resultado'], types: ['text', 'number', 'money', 'money', 'text', 'text'], rows: f29.items.map(function (it) { return [it.mes, it.n, it.iva, it.record && it.record.creditos !== '' && it.record.creditos != null ? num(it.record.creditos) : '', it.record && it.record.file ? it.record.file.name : '', it.msg]; }) }); }
    [['anexo1', 'Anexo 1 · Declaración por no utilización de IVA CF'], ['anexo2', 'Anexo 2 · IVA CF no relacionado con los proyectos'], ['anexo3', 'Anexo 3 · Declaraciones de pago en efectivo'], ['anexo4', 'Anexo 4 · Certificados de viático'], ['viaje', 'Registro de viajes'], ['anexo5', 'Anexo 5 · Memoria de cálculo de gastos de administración']].forEach(function (a) {
      if (hasData(p, a[0])) { var m = safe(function () { return RF.docs.model(a[0]); }); if (m) { addDoc(n + '. ' + a[1], m); n++; } }
    });
    if (hasData(p, 'informe')) { addDoc(n + '. Informe técnico de avance (Anexo 6) con sus fichas', safe(function () { return RF.docs.model('informe'); })); n++; }
    if ((p.reitem && ((p.reitem.rows || []).length || p.reitem.motivo))) { addDoc(n + '. Cambios al PEA (reitemización)', safe(function () { return RF.docs.model('reitem'); })); n++; }
    if (hasData(p, 'prorroga')) { addDoc(n + '. Solicitud de prórroga del PEA', safe(function () { return RF.docs.model('prorroga'); })); n++; }
    if ((p.observations || []).length) { H(n + '. Observaciones de CORFO y aclaraciones'); n++; blocks.push({ t: 'table', wide: true, pw: [14, 9, 10, 25, 25, 7, 10], head: ['Resumen', 'Comunicada el', 'Gastos afectados', 'Qué pidió CORFO', 'Aclaración de la comunidad', 'Respondida', 'Archivos de CORFO'], types: ['text', 'date', 'text', 'text', 'text', 'text', 'text'], rows: p.observations.map(function (o) { return [o.titulo, o.recibida, o.gastos, o.detalle, o.respuesta, o.respondida ? 'Sí' : 'No', (o.files || []).map(function (f) { return f.name; }).join(', ')]; }) }); }
    if (hasData(p, 'solicitud')) { addDoc(n + '. Solicitud de aportes restantes', safe(function () { return RF.docs.model('solicitud'); })); n++; }
    return { pro: true, report: true, sheetsBy: 'h', footTitle: (p.name || 'Proyecto') + ' · ' + (c.name || ''), title: 'Informe de ejecución y rendición «' + (p.name || '') + '»', subtitle: (c.name || '') + (p.code ? ' · ' + p.code : '') + ' · emitido el ' + fd(U.todayISO()), sheet: 'Informe', footer: '', blocks: blocks };
  }

  TOOLS.expediente = { title: 'Expediente completo del proyecto', icon: 'file', desc: 'Todo lo del proyecto en un solo archivo, que se arma solo a medida que avanzas.', render: function () {
    var s = RF.store.get(), p = RF.store.project(), root = h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, 'Expediente completo del proyecto'));
    if (!p) { root.appendChild(UI.callout('info', '', 'Primero crea o elige un proyecto.')); return root; }
    root.appendChild(h('p', { class: 'lead' }, 'Aquí se arma el informe final del proyecto, listo para entregar: datos de la comunidad, ejecución financiera, PEA con su Carta Gantt, detalle de los gastos, respaldos, cotizaciones, F29, anexos con sus firmas, informe técnico y observaciones de CORFO. Se actualiza solo cada vez que lo sacas.'));
    var list = h('ul', { class: 'exp-parts' });
    parts(p, s).forEach(function (x) { list.appendChild(h('li', { class: x.n || x.done ? 'on' : '' }, h('span', { class: 'ep-ck', 'aria-hidden': 'true' }, x.n ? '✓' : '·'), h('span', { class: 'ep-t' }, x.t), h('span', { class: 'ep-n' }, x.unit ? x.n + ' ' + x.unit : (x.n ? 'incluido' : 'por completar')))); });
    root.appendChild(UI.section('Qué incluye y cuánto llevas', [list]));
    var st = { fmt: 'word', doc: null }, prev = h('div', { class: 'exp-prev' });
    function paintPrev() {
      U.clear(prev);
      var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Ver como' }, [['word', 'Word'], ['pdf', 'PDF'], ['xlsx', 'Excel']].map(function (f) { return h('button', { type: 'button', 'aria-pressed': st.fmt === f[0] ? 'true' : 'false', onclick: function () { st.fmt = f[0]; paintPrev(); } }, f[1]); }));
      prev.appendChild(h('div', { class: 'row-actions between' }, seg, UI.btn('Actualizar la vista previa', { cls: 'ghost small', onclick: function () { st.doc = null; paintPrev(); } })));
      var doc;
      try { doc = st.doc = st.doc || build(RF.store.project(), RF.store.get()); } catch (e) { prev.appendChild(UI.callout('bad', 'No se pudo armar la vista previa.', ' ' + (e.message || e))); return; }
      prev.appendChild(h('p', { class: 'hint' }, st.fmt === 'xlsx' ? 'Excel: una hoja por sección y un índice. Los gráficos pasan a tablas con sus datos (Excel no los lleva dentro).' : st.fmt === 'word' ? 'Word: portada, índice, gráficos como imagen, tablas anchas en hoja horizontal y número de página. Es una vista aproximada: el archivo puede variar un poco según tu versión de Word.' : 'PDF: la misma portada, gráficos y tablas. Se guarda con «Imprimir o guardar como PDF».'));
      if (st.fmt === 'xlsx') { prev.appendChild(RF.exp.excelPreview(RF.exp.docToSheets(doc))); return; }
      var frame = h('iframe', { class: 'exp-frame', title: 'Vista previa en ' + (st.fmt === 'word' ? 'Word' : 'PDF') });
      prev.appendChild(frame);
      frame.srcdoc = RF.exp.docToHtml(doc, { look: st.fmt }); /* srcdoc: funciona aunque el marco todavía no esté en la página */
      if (st.fmt === 'pdf') prev.appendChild(h('div', { class: 'row-actions' }, UI.btn('Abrir en pantalla completa', { cls: 'ghost small', onclick: function () { RF.exp.printDoc(doc); } })));
    }
    paintPrev();
    root.appendChild(UI.section('Cómo queda', [prev]));
    root.appendChild(UI.section('Sácalo', [h('p', { class: 'hint' }, 'Word para editarlo, PDF para enviarlo, Excel para ordenar las tablas, o directo a tu Drive.'), UI.exportBar(function () { return build(RF.store.project(), RF.store.get()); }, 'expediente-completo')]));
    return root;
  } };
  RF.dossier = { build: build, parts: parts };
})(typeof window !== 'undefined' ? window : globalThis);
