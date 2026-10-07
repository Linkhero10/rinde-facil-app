/* Rinde Fácil — resumen para el Organismo Colaborador, con consentimiento de la comunidad.
 * Nada se centraliza: la comunidad decide qué incluye, lo revisa y lo envía ella misma (correo, WhatsApp, impreso).
 * No lleva nombres de proveedores, RUT, fotos ni documentos: solo avance y montos por cuenta. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, D = RF.data, L = RF.logic, h = U.h, TOOLS = RF.tools = RF.tools || {};

  var PARTS = [
    { id: 'avance', name: 'Avance de los trámites por fase' },
    { id: 'rendicion', name: 'Montos por cuenta: aprobado, presupuestado y rendido' },
    { id: 'revision', name: 'Cuántos avisos de la revisión siguen abiertos (sin detalle de los gastos)' },
    { id: 'observaciones', name: 'Observaciones de CORFO abiertas y su plazo' },
    { id: 'compromisos', name: 'Compromisos de las mesas de trabajo pendientes' }
  ];

  function ctx() { var s = RF.store.get(); return { s: s, community: s.community, project: RF.store.project() }; }

  /* arma el documento con las partes elegidas; sin las que no se eligieron ni rastro de ellas */
  function summaryDoc(p, s, chosen) {
    var blocks = [], today = U.todayISO(), c = s.community || {};
    blocks.push({ t: 'p', text: 'Este resumen lo preparó y lo envía la comunidad, con su autorización, el ' + U.fmtDate(today) + '. No incluye nombres de proveedores, RUT, fotos ni documentos: solo avance y montos.' });
    if (chosen.avance) {
      var pr = L.progress(p);
      blocks.push({ t: 'h', text: 'Avance de los trámites' });
      blocks.push({ t: 'table', head: ['Fase', 'Trámites listos', 'Total'], types: ['text', 'text', 'text'], rows: D.FASES.map(function (f) { var x = pr.porFase[f.id]; return [f.n + '. ' + f.name, String(x.tramDone), String(x.tramTotal)]; }).concat([['Total', String(pr.tramDone), String(pr.tramTotal)]]) });
    }
    if (chosen.rendicion) {
      var t = L.totalsByCuenta(p);
      blocks.push({ t: 'h', text: 'Montos por cuenta' });
      blocks.push({ t: 'table', head: ['Cuenta', 'Aprobado ($)', 'Presupuestado ($)', 'Rendido ($)'], types: ['text', 'money', 'money', 'money'], rows: D.CUENTAS.map(function (cu) { var x = t[cu.id]; return [cu.name, x.aprobado || 0, x.presupuestado || 0, x.rendido || 0]; }) });
    }
    if (chosen.revision) {
      var res = L.reconcile(p, c, today, s.holidays), errs = 0, warns = 0;
      res.groups.forEach(function (g) { g.items.forEach(function (i) { if (i.level === 'error') errs++; else if (i.level === 'warn') warns++; }); });
      blocks.push({ t: 'h', text: 'Revisión de la rendición' });
      blocks.push({ t: 'p', text: errs + ' errores y ' + warns + ' advertencias abiertas en la revisión de Rinde Fácil.' });
    }
    if (chosen.observaciones) {
      var open = (p.observations || []).filter(function (o) { return !o.respondida; });
      blocks.push({ t: 'h', text: 'Observaciones de CORFO abiertas' });
      blocks.push(open.length ? { t: 'table', head: ['Recibida', 'Vence'], types: ['date', 'date'], rows: open.map(function (o) { return [o.recibida || '', o.recibida ? L.aclaracionDeadline(o.recibida, s.holidays) : '']; }) } : { t: 'p', text: 'No hay observaciones abiertas.' });
    }
    if (chosen.compromisos) {
      var pend = [], actas = (s.repo && s.repo.actas) || [];
      actas.forEach(function (a) { (a.agreements || []).forEach(function (x) { if (!x.done) pend.push([x.what || '', x.due || '']); }); });
      blocks.push({ t: 'h', text: 'Compromisos de las mesas de trabajo pendientes' });
      blocks.push(pend.length ? { t: 'table', head: ['Compromiso', 'Plazo'], types: ['text', 'date'], rows: pend } : { t: 'p', text: 'No hay compromisos pendientes.' });
    }
    return { title: 'Resumen de avance', subtitle: (c.name || '') + ' · ' + (p.name || '') + (p.code ? ' · ' + p.code : ''), sheet: 'Resumen', footer: 'Preparado por la comunidad con Rinde Fácil.', blocks: blocks };
  }

  TOOLS.compartir = { title: 'Resumen para el Organismo Colaborador', icon: 'user', desc: 'Prepara un resumen de avance para compartir, eligiendo qué incluye. Tú lo revisas y lo envías; nada se manda solo.', render: function () {
    var c = ctx(), p = c.project;
    var root = h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, 'Resumen para el Organismo Colaborador'), h('p', { class: 'lead' }, 'La comunidad decide qué comparte. Este resumen no lleva nombres de proveedores, RUT, fotos ni documentos.'));
    if (!p) { root.appendChild(UI.empty('Primero crea un proyecto.')); return root; }
    var chosen = {}, preview = h('div'), consent = h('input', { type: 'checkbox', id: 'consent-oc' }), bar = h('div');
    var boxes = PARTS.map(function (x) {
      var cb = h('input', { type: 'checkbox', id: 'part-' + x.id }); cb.addEventListener('change', function () { chosen[x.id] = cb.checked; paint(); });
      return h('label', { class: 'check', for: 'part-' + x.id }, cb, h('span', null, x.name));
    });
    function anyChosen() { return PARTS.some(function (x) { return chosen[x.id]; }); }
    function docModel() { return summaryDoc(p, c.s, chosen); }
    function paint() {
      U.clear(preview); U.clear(bar);
      if (!anyChosen()) { preview.appendChild(UI.empty('Elige qué quieres incluir para ver cómo queda.')); return; }
      var d = docModel();
      preview.appendChild(h('div', { class: 'callout info' }, h('strong', null, 'Así se verá lo que compartes:'),
        h('pre', { class: 'share-preview' }, RF.exp.docToText(d))));
      if (!consent.checked) { bar.appendChild(UI.callout('warn', 'Falta tu autorización.', ' Marca la casilla de abajo para poder sacar el archivo.')); return; }
      bar.appendChild(UI.exportBar(function () { RF.store.update(function (s) { s.shares = (s.shares || []).concat([{ at: new Date().toISOString(), with: 'Organismo Colaborador', parts: PARTS.filter(function (x) { return chosen[x.id]; }).map(function (x) { return x.id; }) }]).slice(-50); }, { silent: true }); return docModel(); }, 'resumen-organismo-colaborador'));
      /* mandarlo: la comunidad elige por dónde; nada sale hasta que ella pulsa */
      var textOut = RF.exp.docToText(d);
      function noted(via) { RF.store.update(function (st) { st.shares = (st.shares || []).concat([{ at: new Date().toISOString(), with: 'Organismo Colaborador (' + via + ')', parts: PARTS.filter(function (x) { return chosen[x.id]; }).map(function (x) { return x.id; }) }]).slice(-50); }, { silent: true }); }
      function clip(t, n) { return t.length > n ? t.slice(0, n - 1) + '…\n\n(El resumen completo va en el archivo adjunto.)' : t; }
      var send = h('div', { class: 'row-actions' },
        h('a', { class: 'btn', href: 'mailto:?subject=' + encodeURIComponent('Resumen de avance · ' + (c.community.name || 'Comunidad')) + '&body=' + encodeURIComponent(clip(textOut, 1500)), onclick: function () { noted('correo'); } }, UI.icon('link', 14), 'Enviar por correo'),
        h('a', { class: 'btn', href: 'https://wa.me/?text=' + encodeURIComponent(clip(textOut, 1400)), target: '_blank', rel: 'noopener', onclick: function () { noted('WhatsApp'); } }, UI.icon('link', 14), 'Enviar por WhatsApp'),
        root.navigator && root.navigator.share ? UI.btn('Compartir desde este equipo…', { icon: 'link', cls: 'ghost', onclick: function () { root.navigator.share({ title: 'Resumen de avance', text: clip(textOut, 3000) }).then(function () { noted('menú de compartir'); }, function () { }); } }) : null);
      bar.appendChild(h('p', { class: 'hint' }, 'También puedes mandarlo directamente. El correo y WhatsApp se abren con el texto ya escrito; tú eliges a quién y pulsas enviar. Para mandar el archivo completo, descárgalo arriba y adjúntalo.'));
      bar.appendChild(send);
    }
    consent.addEventListener('change', paint);
    root.appendChild(UI.section('1. Qué incluir', [h('div', { class: 'checks' }, boxes)]));
    root.appendChild(UI.section('2. Revisa', [preview]));
    root.appendChild(UI.section('3. Autoriza y saca el archivo', [
      h('label', { class: 'check', for: 'consent-oc' }, consent, h('span', null, 'La comunidad autoriza compartir este resumen con el Organismo Colaborador. Entiendo que el archivo sale de este equipo y que lo envío yo.')), bar]));
    var shares = (c.s.shares || []).slice().reverse().slice(0, 5);
    if (shares.length) root.appendChild(UI.section('Lo que ya se sacó', [h('ul', { class: 'sec-list' }, shares.map(function (x) { return h('li', null, h('span', null, new Date(x.at).toLocaleString('es-CL') + ' · ' + x.with + ' · ' + x.parts.length + ' partes')); }))]));
    paint();
    return root;
  } };
})(typeof window !== 'undefined' ? window : globalThis);
