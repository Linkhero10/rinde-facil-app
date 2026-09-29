/* Rinde Fácil — ventana del buscador: se abre con «/» o Ctrl+K, o desde el menú. Muestra dónde está cada cosa y, al llegar, la marca. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, h = U.h;
  var overlay = null, input = null, list = null, status = null, lastFocus = null;
  var st = { results: [], sel: -1, q: '' };
  var SUGGEST = ['gasto', 'gantt', 'IVA', 'cotización', 'viático', 'anexo', 'plazo', 'boleta', 'presupuesto', 'Drive'];

  function segs(parts) { return parts.map(function (p) { return p.m ? h('mark', null, p.t) : p.t; }); }

  function paint() {
    U.clear(list);
    var q = input.value.trim();
    if (!q) {
      status.textContent = '';
      list.appendChild(h('li', { class: 'sr-hint' }, h('p', null, 'Escribe lo que buscas. Busca en los trámites, las herramientas, el mapa de quién hace qué, las reglas del Manual y también en lo que ya anotaste.'),
        h('p', { class: 'sr-try' }, 'Prueba con: ', SUGGEST.map(function (w) { return h('button', { type: 'button', class: 'chip', onclick: function () { input.value = w; run(); input.focus(); } }, w); }))));
      return;
    }
    if (!st.results.length) {
      status.textContent = 'Sin resultados para «' + q + '».';
      list.appendChild(h('li', { class: 'sr-hint' }, h('p', null, 'No encontré «' + q + '». Prueba con otra palabra o una parte de ella (por ejemplo «gast» en vez de «gastos»).')));
      return;
    }
    status.textContent = st.total > st.results.length ? st.total + ' resultados para «' + q + '»; se muestran los ' + st.results.length + ' mejores. Agrega otra palabra para acotar.' : st.results.length + (st.results.length === 1 ? ' resultado' : ' resultados') + ' para «' + q + '».';
    st.results.forEach(function (r, i) {
      var it = r.item;
      /* en herramientas, trámites y fases el título es el último tramo de la ruta: «Herramientas → Rendir → Gastos y rendición» */
      var full = (it.path || []).concat(/^(Herramienta|Trámite|Paso|Fase)$/.test(it.kind) ? [it.title.replace(/^Fase \d+: /, '')] : []);
      var path = full.length ? h('div', { class: 'sr-path' }, full.map(function (p, k) { return [k ? h('span', { class: 'sr-arrow', 'aria-hidden': 'true' }, ' → ') : null, p]; })) : null;
      var li = h('li', { role: 'option', id: 'sr-' + i, 'aria-selected': i === st.sel ? 'true' : 'false', class: 'sr-row' + (i === st.sel ? ' sel' : ''), onclick: function () { go(r); }, onmousemove: function () { if (st.sel !== i) select(i, false); } },
        h('div', { class: 'sr-top' }, h('span', { class: 'sr-kind k-' + it.kind.toLowerCase().replace(/\s+/g, '-') }, it.kind), h('span', { class: 'sr-title' }, segs(r.titleSegs))),
        path,
        r.snippetSegs ? h('div', { class: 'sr-snip' }, r.snippetLabel ? h('span', { class: 'sr-lbl' }, r.snippetLabel + ': ') : null, segs(r.snippetSegs)) : null);
      list.appendChild(li);
    });
    input.setAttribute('aria-activedescendant', st.sel >= 0 ? 'sr-' + st.sel : '');
  }
  function select(i, scroll) {
    var rows = list.querySelectorAll('.sr-row'); if (!rows.length) return;
    st.sel = Math.max(0, Math.min(rows.length - 1, i));
    for (var k = 0; k < rows.length; k++) { var on = k === st.sel; rows[k].classList.toggle('sel', on); rows[k].setAttribute('aria-selected', on ? 'true' : 'false'); }
    input.setAttribute('aria-activedescendant', 'sr-' + st.sel);
    if (scroll !== false && rows[st.sel].scrollIntoView) rows[st.sel].scrollIntoView({ block: 'nearest' });
  }
  function run() {
    st.q = input.value;
    var all = RF.search.search(st.q, 1000);
    st.total = all.length; st.results = all.slice(0, 40);
    st.sel = st.results.length ? 0 : -1;
    paint();
  }
  function go(r) {
    var it = r.item, toks = RF.search.tokens(st.q);
    close(true);
    if (it.open) it.open();
    if (RF.app) RF.app.pendingHighlight = toks;
    var target = it.href, cur = location.hash || '#/';
    if (cur === target || (target === '#/' && (cur === '' || cur === '#'))) { if (RF.app && RF.app.render) RF.app.render(); } else location.hash = target;
  }
  function open(prefill) {
    if (overlay) { input.focus(); input.select(); return; }
    lastFocus = document.activeElement;
    RF.search.resetIndex && RF.search.resetIndex();
    input = h('input', { type: 'search', class: 'sr-input', placeholder: 'Buscar en toda la app: gasto, IVA, Anexo 4…', 'aria-label': 'Buscar en toda la app', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'sr-list', autocomplete: 'off', spellcheck: 'false' });
    list = h('ul', { class: 'sr-list', id: 'sr-list', role: 'listbox', 'aria-label': 'Resultados' });
    status = h('div', { class: 'sr-status', 'aria-live': 'polite' });
    var box = h('div', { class: 'sr-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Buscador' },
      h('div', { class: 'sr-head' }, UI.icon('search', 20), input, h('button', { type: 'button', class: 'icon-btn sr-close', 'aria-label': 'Cerrar el buscador', onclick: function () { close(); } }, UI.icon('close', 20))),
      status, list,
      h('div', { class: 'sr-foot' }, h('span', null, '↑ ↓ para moverte'), h('span', null, 'Enter para abrir'), h('span', null, 'Esc para cerrar')));
    overlay = h('div', { class: 'sr-overlay', onmousedown: function (e) { if (e.target === overlay) close(); } }, box);
    document.body.appendChild(overlay);
    document.body.classList.add('sr-open');
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); select(st.sel + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); select(st.sel - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (st.results[st.sel]) go(st.results[st.sel]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') { e.preventDefault(); input.focus(); } /* el foco se queda dentro de la ventana */
    });
    if (prefill) input.value = prefill;
    run();
    input.focus();
  }
  function close(skipFocus) {
    if (!overlay) return;
    overlay.parentNode.removeChild(overlay); overlay = null; document.body.classList.remove('sr-open');
    if (!skipFocus && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* sin foco */ } }
  }

  /* marca las coincidencias en la pantalla a la que se llegó y baja hasta la primera */
  function highlight(container, toks) {
    if (!container || !toks || !toks.length) return 0;
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      var p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|SELECT|OPTION|MARK)$/.test(p.nodeName) || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT;
    } });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    var hits = [], first = null;
    for (var i = 0; i < nodes.length && hits.length < 40; i++) {
      var node = nodes[i], parts = RF.search.mark(node.nodeValue, toks);
      if (!parts.some(function (p) { return p.m; })) continue;
      var frag = document.createDocumentFragment();
      parts.forEach(function (p) { if (p.m) { var m = document.createElement('mark'); m.className = 'search-hit'; m.textContent = p.t; frag.appendChild(m); hits.push(m); if (!first) first = m; } else frag.appendChild(document.createTextNode(p.t)); });
      node.parentNode.replaceChild(frag, node);
    }
    hits.forEach(function (m) { var d = m.closest && m.closest('details'); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest ? d.parentElement.closest('details') : null; } });
    if (first && first.scrollIntoView) setTimeout(function () { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60);
    return hits.length;
  }

  document.addEventListener('keydown', function (e) {
    var t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.nodeName) || t.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open(); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !overlay) { e.preventDefault(); open(); }
  });

  RF.searchui = { open: open, close: close, highlight: highlight };
})(typeof window !== 'undefined' ? window : globalThis);
