/* Rinde Fácil — expediente completo: todo lo del proyecto en un único archivo que se arma solo (Word, PDF, Excel o Drive).
 * Incluye datos, ruta, plata por cuenta, PEA, gastos (escritos), respaldos, cotizaciones, F29, anexos con sus firmas, informe técnico y fichas,
 * observaciones, lista de archivos guardados e historial. Las imágenes no van dentro: se listan con su enlace al Drive. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, L = RF.logic, D = RF.data, h = U.h, TOOLS = RF.tools = RF.tools || {};
  function num(x) { return Number(x) || 0; }
  function safe(fn) { try { return fn(); } catch (e) { return null; } }

  function hasData(p, id) { var f = p.forms && p.forms[id]; return Array.isArray(f) ? f.length > 0 : !!(f && f.data && Object.keys(f.data).some(function (k) { var v = f.data[k]; return v !== '' && v != null && !(Array.isArray(v) && !v.length) && k !== 'fecha'; })); }

  /* qué incluye y cuánto lleva cada parte */
  function parts(p, s) {
    var ex = (p.expenses || []).filter(function (e) { return e && (e.proveedor || e.total); }), forms = function (id) { var f = p.forms && p.forms[id]; return Array.isArray(f) ? f.length : (hasData(p, id) ? 1 : 0); };
    return [
      { id: 'datos', t: 'Datos de la comunidad y del proyecto', n: (s.community.name ? 1 : 0) + (p.name ? 1 : 0), unit: '', done: !!(s.community.name && p.name) },
      { id: 'ruta', t: 'Avance de la ruta', n: L.progress(p).tramDone, unit: 'trámites listos', done: true },
      { id: 'plata', t: 'Plata por cuenta', n: D.CUENTAS.filter(function (c) { return num(p.budgetApproved && p.budgetApproved[c.id]) > 0; }).length, unit: 'cuentas con monto aprobado', done: true },
      { id: 'pea', t: 'PEA: Carta Gantt, presupuesto y formularios', n: L.allActivities(p).length + (p.budgetLines || []).length, unit: 'actividades y líneas', done: L.allActivities(p).length > 0 && (p.budgetLines || []).length > 0 },
      { id: 'gastos', t: 'Gastos y respaldos (escritos)', n: ex.length, unit: ex.length === 1 ? 'gasto' : 'gastos', done: ex.length > 0 },
      { id: 'cot', t: 'Cotizaciones', n: (p.cotizaciones || []).length, unit: 'compras', done: true },
      { id: 'f29', t: 'Formulario 29 mes a mes', n: (p.f29 || []).length, unit: 'meses', done: true },
      { id: 'anexos', t: 'Anexos 1 a 5 y registro de viaje', n: ['anexo1', 'anexo2', 'anexo3', 'anexo4', 'anexo5', 'viaje'].reduce(function (a, k) { return a + forms(k); }, 0), unit: 'documentos', done: true },
      { id: 'informe', t: 'Informe técnico y fichas', n: forms('informe') + ['informeA', 'informeB', 'informeC', 'informeD', 'informeE'].reduce(function (a, k) { return a + forms(k); }, 0), unit: 'documentos', done: forms('informe') > 0 },
      { id: 'obs', t: 'Observaciones de CORFO y cambios', n: (p.observations || []).length + ((p.reitem && (p.reitem.rows || []).length) ? 1 : 0) + forms('prorroga') + forms('solicitud'), unit: 'registros', done: true },
      { id: 'archivos', t: 'Archivos guardados (lista con enlaces)', n: (p.obras || []).length + (p.f29 || []).filter(function (r) { return r.file; }).length, unit: 'archivos', done: true },
      { id: 'historial', t: 'Historial de cambios', n: (s.activity || []).length, unit: 'anotaciones', done: true }
    ];
  }

  function build(p, s) {
    var c = s.community, blocks = [];
    function H(t) { blocks.push({ t: 'h', text: t }); }
    function addDoc(title, d) { if (!d || !(d.blocks || []).length) return; H(title); d.blocks.forEach(function (b) { blocks.push(b); }); }
    function fd(d) { return d ? U.fmtDate(d) : ''; }
    H('1. Datos de la comunidad y del proyecto');
    blocks.push({ t: 'kv', rows: [['Comunidad', c.name], ['RUT de la comunidad', c.rut], ['Dirección', c.address], ['Representante legal', c.legalRep], ['Correo y teléfono', [c.email, c.phone].filter(Boolean).join(' · ')], ['Organismo Colaborador', c.oc], ['Proyecto', p.name], ['Código', p.code], ['Vigencia del proyecto', (p.start ? fd(p.start) : '') + (p.end ? ' al ' + fd(p.end) : '')], ['Período que se rinde', (p.periodoInicio ? fd(p.periodoInicio) : '') + (p.periodoFin ? ' al ' + fd(p.periodoFin) : '')], ['Primer pago (30 %)', fd(p.desembolso1)]] });
    H('2. Avance de la ruta');
    var rows = [];
    D.FASES.forEach(function (f) { f.items.forEach(function (tid) { var t = RF.tramites.byId[tid], ip = L.itemProgress(p, tid); rows.push(['Fase ' + f.n + ' · ' + f.name, t.title, ip.na ? 'No aplica' : ip.optional && !ip.done ? 'Opcional' : ip.complete ? 'Listo' : ip.done + ' de ' + ip.total]); }); });
    blocks.push({ t: 'table', head: ['Fase', 'Trámite', 'Estado'], types: ['text', 'text', 'text'], rows: rows });
    H('3. Plata por cuenta');
    var tot = L.totalsByCuenta(p);
    blocks.push({ t: 'table', head: ['Cuenta', 'Aprobado ($)', 'Presupuestado en el PEA ($)', 'Rendido ($)', 'Saldo por rendir ($)', 'Gastos'], types: ['text', 'money', 'money', 'money', 'money', 'number'], rows: D.CUENTAS.map(function (cu) { var t = tot[cu.id]; return [cu.name, t.aprobado, t.presupuestado, t.rendido, t.aprobado - t.rendido, t.cantidad]; }), foot: ['TOTAL', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM'] });
    var pea = safe(function () { return RF.docs.model('pea'); }); addDoc('4. PEA: información general, formularios, Carta Gantt y presupuesto', pea);
    H('5. Todos los gastos (escritos)');
    var ex = (p.expenses || []).filter(function (e) { return e && (e.proveedor || e.total); }).sort(function (a, b) { return String(a.fecha || '') < String(b.fecha || '') ? -1 : 1; });
    blocks.push({ t: 'table', head: ['N°', 'Fecha', 'Cuenta', 'Documento', 'Folio', 'Proveedor', 'RUT', 'Neto ($)', 'IVA ($)', 'Total ($)', 'A rendir ($)', 'Forma de pago', 'Glosa', 'Estado'], types: ['number', 'date', 'text', 'text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'text', 'text', 'text'],
      rows: ex.map(function (e, i) { var cu = D.CUENTA_BY_ID[e.cuenta] || {}; return [i + 1, e.fecha, cu.name || '', (D.DOC_BY_ID[e.docType] || {}).name || '', e.folio, e.proveedor, e.rutProveedor, num(e.neto), num(e.iva), num(e.total), num(e.montoRendir), (D.FORMAS_PAGO.filter(function (f) { return f.id === e.formaPago; })[0] || {}).name || e.formaPago || '', e.glosa, RF.dash ? RF.dash.statusOf(e, p, c).label : '']; }), foot: ['', '', '', '', '', '', 'TOTAL', 'SUM', 'SUM', 'SUM', 'SUM', '', '', ''] });
    var exp = safe(function () { return RF.rendicion.expedienteDoc(p, c); }); addDoc('6. Respaldos que lleva cada gasto', exp);
    if ((p.cotizaciones || []).length) addDoc('7. Cotizaciones', safe(function () { return RF.plan.cotDoc(p); }));
    var f29 = L.f29Audit(p, c);
    if (f29.items.length) { H('8. Formulario 29 mes a mes'); blocks.push({ t: 'table', head: ['Mes', 'Facturas', 'IVA de las facturas ($)', 'Créditos del F29 ($)', 'Archivo', 'Resultado'], types: ['text', 'number', 'money', 'money', 'text', 'text'], rows: f29.items.map(function (it) { return [it.mes, it.n, it.iva, it.record && it.record.creditos !== '' && it.record.creditos != null ? num(it.record.creditos) : '', it.record && it.record.file ? it.record.file.name : '', it.msg]; }) }); }
    var n = 9;
    [['anexo1', 'Anexo 1 · Declaración por no utilización de IVA CF'], ['anexo2', 'Anexo 2 · IVA CF no relacionado con los proyectos'], ['anexo3', 'Anexo 3 · Declaraciones de pago en efectivo'], ['anexo4', 'Anexo 4 · Certificados de viático'], ['viaje', 'Registro de viajes'], ['anexo5', 'Anexo 5 · Memoria de cálculo de gastos de administración']].forEach(function (a) {
      if (hasData(p, a[0])) { var m = safe(function () { return RF.docs.model(a[0]); }); if (m) { addDoc(n + '. ' + a[1], m); n++; } }
    });
    if (hasData(p, 'informe')) { addDoc(n + '. Informe técnico de avance (Anexo 6) con sus fichas', safe(function () { return RF.docs.model('informe'); })); n++; }
    if ((p.reitem && ((p.reitem.rows || []).length || p.reitem.motivo))) { addDoc(n + '. Cambios al PEA (reitemización)', safe(function () { return RF.docs.model('reitem'); })); n++; }
    if (hasData(p, 'prorroga')) { addDoc(n + '. Solicitud de prórroga del PEA', safe(function () { return RF.docs.model('prorroga'); })); n++; }
    if ((p.observations || []).length) { H(n + '. Observaciones de CORFO y aclaraciones'); n++; blocks.push({ t: 'table', head: ['Resumen', 'Comunicada el', 'Gastos afectados', 'Qué pidió CORFO', 'Aclaración de la comunidad', 'Respondida', 'Archivos de CORFO'], types: ['text', 'date', 'text', 'text', 'text', 'text', 'text'], rows: p.observations.map(function (o) { return [o.titulo, o.recibida, o.gastos, o.detalle, o.respuesta, o.respondida ? 'Sí' : 'No', (o.files || []).map(function (f) { return f.name; }).join(', ')]; }) }); }
    if (hasData(p, 'solicitud')) { addDoc(n + '. Solicitud de aportes restantes', safe(function () { return RF.docs.model('solicitud'); })); n++; }
    var files = [];
    (p.obras || []).forEach(function (r) { files.push([(RF.obras && RF.obras.KINDS[r.kind] || {}).name || 'Archivo de obra', r.name, r.at ? r.at.slice(0, 10) : '', r.driveUrl || '']); });
    (p.f29 || []).forEach(function (r) { if (r.file) files.push(['F29 de ' + r.mes, r.file.name, r.file.at ? r.file.at.slice(0, 10) : '', r.file.driveUrl || '']); });
    Object.keys(p.forms || {}).forEach(function (id) { var f = p.forms[id]; (Array.isArray(f) ? f : [f]).forEach(function (x) { var d = x && x.data; if (d && d.signedFile) files.push([(RF.forms.SCHEMAS[id] || {}).title || id, d.signedFile.name, d.signedFile.at ? d.signedFile.at.slice(0, 10) : '', d.signedFile.driveUrl || '']); }); });
    (p.observations || []).forEach(function (o) { (o.files || []).forEach(function (r) { files.push(['Observación de CORFO', r.name, r.at ? r.at.slice(0, 10) : '', r.driveUrl || '']); }); });
    ex.forEach(function (e) { if (e.driveUrl) files.push(['Comprobante del gasto «' + (e.proveedor || '') + '»', e.fileName || 'foto', e.fecha || '', e.driveUrl]); Object.keys(e.attach || {}).forEach(function (k) { var a = e.attach[k]; if (a) files.push(['Respaldo de «' + (e.proveedor || '') + '»: ' + (D.RESPALDOS[k] || k), a.name || k, e.fecha || '', a.driveUrl || '']); }); });
    if (files.length) { H(n + '. Archivos guardados'); n++; blocks.push({ t: 'table', head: ['Qué es', 'Archivo', 'Fecha', 'Enlace en Drive'], types: ['text', 'text', 'text', 'text'], rows: files }); }
    var act = (s.activity || []).slice(-100).reverse();
    if (act.length) { H(n + '. Historial de cambios (los últimos ' + act.length + ')'); blocks.push({ t: 'table', head: ['Cuándo', 'Quién', 'Qué'], types: ['text', 'text', 'text'], rows: act.map(function (a) { return [new Date(a.t).toLocaleString('es-CL'), a.who, a.text]; }) }); }
    return { title: 'Expediente del proyecto «' + (p.name || '') + '»', subtitle: (c.name || '') + (p.code ? ' · ' + p.code : '') + ' · generado el ' + U.fmtDate(U.todayISO()), sheet: 'Expediente', footer: 'Generado con Rinde Fácil. Las fotos y los PDF no van dentro de este archivo: están en el Drive de la comunidad y la sección «Archivos guardados» tiene el enlace de cada uno.', blocks: blocks };
  }

  TOOLS.expediente = { title: 'Expediente completo del proyecto', icon: 'file', desc: 'Todo lo del proyecto en un solo archivo, que se arma solo a medida que avanzas.', render: function () {
    var s = RF.store.get(), p = RF.store.project(), root = h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, 'Expediente completo del proyecto'));
    if (!p) { root.appendChild(UI.callout('info', '', 'Primero crea o elige un proyecto.')); return root; }
    root.appendChild(h('p', { class: 'lead' }, 'Aquí se junta, en un único archivo, todo lo que hiciste en el proyecto: datos, ruta, plata por cuenta, PEA, todos los gastos (escritos), anexos con sus firmas, informe técnico, observaciones y el historial. Se actualiza solo cada vez que lo sacas.'));
    var list = h('ul', { class: 'exp-parts' });
    parts(p, s).forEach(function (x) { list.appendChild(h('li', { class: x.n || x.done ? 'on' : '' }, h('span', { class: 'ep-ck', 'aria-hidden': 'true' }, x.n ? '✓' : '·'), h('span', { class: 'ep-t' }, x.t), h('span', { class: 'ep-n' }, x.unit ? x.n + ' ' + x.unit : (x.n ? 'incluido' : 'por completar')))); });
    root.appendChild(UI.section('Qué incluye y cuánto llevas', [list]));
    root.appendChild(UI.section('Sácalo', [h('p', { class: 'hint' }, 'Word para editarlo, PDF para enviarlo, Excel para ordenar las tablas, o directo a tu Drive.'), UI.exportBar(function () { return build(RF.store.project(), RF.store.get()); }, 'expediente-completo')]));
    return root;
  } };
  RF.dossier = { build: build, parts: parts };
})(typeof window !== 'undefined' ? window : globalThis);
