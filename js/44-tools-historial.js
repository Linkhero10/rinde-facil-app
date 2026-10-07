/* Rinde Fácil — historial de actividad: quién hizo qué y cuándo, para que todo quede trazable.
 * Se anota solo (gastos revisados, archivos guardados en Drive, respaldos movidos, documentos sacados, cambios traídos de otro equipo…).
 * Es una lista que solo crece: viaja con la copia de seguridad y se une entre equipos. No guarda contraseñas ni contenido de documentos. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, h = U.h, TOOLS = RF.tools = RF.tools || {};
  var KEEP = 400;
  var KINDS = { gasto: 'Gastos', drive: 'Drive', respaldo: 'Respaldos', documento: 'Documentos', ficha: 'Fichas', sync: 'Entre equipos', proyecto: 'Proyectos', f29: 'F29' };

  function who() { try { var m = RF.vault && RF.vault.meta && RF.vault.meta(); return (m && (m.display || m.user)) || 'Este equipo'; } catch (e) { return 'Este equipo'; } }
  function log(kind, text, ref) {
    if (!text || !RF.store) return;
    try {
      RF.store.update(function (s) {
        s.activity = Array.isArray(s.activity) ? s.activity : [];
        s.activity.push({ id: U.uid('ac'), t: new Date().toISOString(), who: who(), kind: kind, text: String(text).slice(0, 200), ref: ref || '' });
        if (s.activity.length > KEEP) s.activity = s.activity.slice(-KEEP);
      }, { silent: true });
    } catch (e) { /* el historial nunca debe impedir lo que la persona estaba haciendo */ }
  }

  TOOLS.historial = { title: 'Historial de cambios', icon: 'list', desc: 'Quién hizo qué y cuándo: gastos revisados, archivos guardados en Drive, documentos sacados.', render: function () {
    var st = { kind: '' }, list = h('div'), root = h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, 'Historial de cambios'),
      h('p', { class: 'lead' }, 'Aquí queda anotado, solo, lo importante que se hizo en la plataforma: quién y cuándo. Sirve para responder «¿esto quién lo revisó?» o «¿cuándo se guardó en Drive?». No guarda contraseñas ni el contenido de tus documentos.'));
    function paint() {
      U.clear(list);
      var all = (RF.store.get().activity || []).slice().reverse().filter(function (a) { return !st.kind || a.kind === st.kind; });
      if (!all.length) { list.appendChild(UI.empty('Todavía no hay nada anotado.')); return; }
      var lastDay = '', ul = null;
      all.slice(0, 150).forEach(function (a) {
        var d = new Date(a.t), day = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
        if (day !== lastDay) { lastDay = day; list.appendChild(h('h3', { class: 'grp' }, day.replace(/^./, function (c) { return c.toUpperCase(); }))); ul = h('ul', { class: 'cal-list' }); list.appendChild(ul); }
        ul.appendChild(h('li', { class: 'cal-ev' }, h('span', { class: 'cal-dot', title: KINDS[a.kind] || a.kind }), h('span', { class: 'cal-ev-t' }, h('strong', null, d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + ' · '), a.who + ': ' + a.text, a.ref && RF.tools[a.ref] ? [' ', h('a', { href: '#/h/' + a.ref }, 'Abrir')] : null)));
      });
      if (all.length > 150) list.appendChild(h('p', { class: 'hint' }, 'Se muestran los últimos 150 de ' + all.length + '.'));
    }
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar' });
    function paintChips() {
      U.clear(chips);
      [['', 'Todo']].concat(Object.keys(KINDS).map(function (k) { return [k, KINDS[k]]; })).forEach(function (k) {
        chips.appendChild(h('button', { type: 'button', class: 'chip' + (st.kind === k[0] ? ' on' : ''), 'aria-pressed': st.kind === k[0] ? 'true' : 'false', onclick: function () { st.kind = k[0]; paintChips(); paint(); } }, k[1]));
      });
    }
    paintChips(); paint();
    root.appendChild(chips); root.appendChild(UI.section('Lo último', [list]));
    return root;
  } };

  RF.activity = { log: log, KINDS: KINDS };
})(typeof window !== 'undefined' ? window : globalThis);
