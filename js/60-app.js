/* Rinde Fácil — arranque: rutas, tema y dibujo de la pantalla. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, h = U.h;
  var app = RF.app = { pendingFilter: null, lastTramite: null };

  function route() {
    var hash = (location.hash || '#/').replace(/^#\/?/, ''), parts = hash.split('?')[0].split('/'), from = null;
    try { from = new URLSearchParams(hash.split('?')[1] || '').get('from'); } catch (e) { from = null; }
    if (parts[0] === 't' && parts[1]) return { name: 'tramite', id: decodeURIComponent(parts[1]) };
    if (parts[0] === 'f' && parts[1]) return { name: 'fase', id: decodeURIComponent(parts[1]) };
    if (parts[0] === 'h' && parts[1]) return { name: 'tool', id: decodeURIComponent(parts[1]), from: from };
    return { name: 'home' };
  }
  app.route = route;

  /* ---------- tema ---------- */
  function applyTheme() {
    var t = RF.store.get().ui.theme || 'system', el = document.documentElement;
    if (t === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
    applyThemeLabel();
  }
  function applyThemeLabel() {
    var t = RF.store.get().ui.theme || 'system', lbl = document.getElementById('themeLbl');
    if (lbl) lbl.textContent = 'Tema: ' + (t === 'system' ? 'del dispositivo' : t === 'light' ? 'claro' : 'oscuro');
  }
  app.cycleTheme = function () { var order = ['system', 'light', 'dark'], cur = RF.store.get().ui.theme || 'system'; RF.store.update(function (s) { s.ui.theme = order[(order.indexOf(cur) + 1) % 3]; }, { silent: true }); applyTheme(); };
  app.applyThemeLabel = applyThemeLabel;

  /* ---------- dibujo ---------- */
  var lastKey = null;
  function render() {
    var r = route(), host = document.getElementById('app'); if (!host) return;
    var side = document.getElementById('side'), sideScroll = side ? side.scrollTop : 0;
    var main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
    var view;
    try {
      if (r.name === 'home') view = RF.views.home();
      else if (r.name === 'fase') view = RF.views.fase(r.id);
      else if (r.name === 'tramite') view = RF.views.tramite(r.id);
      else if (r.name === 'tool') {
        var tl = RF.tools[r.id];
        if (!tl) view = h('div', { class: 'view' }, UI.callout('bad', 'No encontramos esa herramienta.', ''));
        else {
          var back = r.from && RF.tramites.byId[r.from] ? h('a', { class: 'btn ghost small back', href: '#/t/' + r.from }, UI.icon('left', 16), 'Volver a: ' + RF.tramites.byId[r.from].title) : null;
          view = h('div', { class: 'view tool' }, back, tl.render());
        }
      }
    } catch (e) {
      if (root.console) console.error(e);
      view = h('div', { class: 'view' }, UI.callout('bad', 'Algo salió mal al mostrar esta pantalla.', ' ' + (e && e.message ? e.message : '') + ' Tus datos están guardados. Prueba volver al inicio.'), h('a', { class: 'btn', href: '#/' }, 'Volver al inicio'));
    }
    main.appendChild(view);
    U.clear(host);
    var top = h('header', { class: 'topbar' },
      h('button', { type: 'button', class: 'icon-btn menu-btn', 'aria-label': 'Abrir el menú', 'aria-controls': 'side', 'aria-expanded': 'false', onclick: toggleMenu }, UI.icon('menu', 24)),
      h('a', { href: '#/', class: 'brand' }, 'Rinde Fácil'),
      h('span', { class: 'top-proj' }, (RF.store.project() || {}).name || ''),
      h('button', { type: 'button', class: 'icon-btn top-search', 'aria-label': 'Buscar en toda la app', onclick: function () { if (RF.searchui) RF.searchui.open(); } }, UI.icon('search', 22)));
    var scrim = h('div', { class: 'scrim', onclick: closeMenu });
    var sideEl = RF.views.sidebar(r);
    host.appendChild(h('div', { class: 'shell' }, top, sideEl, scrim, main));
    sideEl.scrollTop = sideScroll;
    U.$$('a', sideEl).forEach(function (a) { a.addEventListener('click', closeMenu); });
    applyThemeLabel();
    if (app.pendingHighlight && RF.searchui) { var toks = app.pendingHighlight; app.pendingHighlight = null; RF.searchui.highlight(main, toks); } /* viene del buscador: marca lo encontrado */
    var key = location.hash;
    if (key !== lastKey) { window.scrollTo(0, 0); lastKey = key; main.focus({ preventScroll: true }); }
  }
  function toggleMenu() { var open = document.body.classList.toggle('menu-open'); var b = document.querySelector('.menu-btn'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  function closeMenu() { document.body.classList.remove('menu-open'); var b = document.querySelector('.menu-btn'); if (b) b.setAttribute('aria-expanded', 'false'); }
  app.render = render;

  /* aviso cuando hay una versión nueva de la app: no se recarga sola para no cortar lo que estás escribiendo */
  function showUpdate() {
    if (document.getElementById('updateBar')) return;
    document.body.appendChild(h('div', { class: 'update-bar', id: 'updateBar', role: 'status' }, h('span', null, 'Hay una versión nueva de Rinde Fácil.'), h('button', { type: 'button', class: 'btn primary small', onclick: function () { location.reload(); } }, 'Actualizar ahora'), h('button', { type: 'button', class: 'btn ghost small', onclick: function () { var b = document.getElementById('updateBar'); if (b) b.parentNode.removeChild(b); } }, 'Después')));
  }
  app.showUpdate = showUpdate;

  function boot() {
    RF.store.load();
    applyTheme();
    var pending = null;
    RF.store.subscribe(function () { clearTimeout(pending); pending = setTimeout(render, 0); });
    window.addEventListener('hashchange', render);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    if (!RF.store.storageOk()) { /* aviso si el navegador no deja guardar */ }
    render();
    if ('serviceWorker' in navigator && /^(https:|http:\/\/localhost|http:\/\/127\.0\.0\.1)/.test(location.protocol + '//' + location.host) ) { try {
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        /* al volver a la pestaña, busca una versión nueva de la app */
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { try { reg.update(); } catch (e) { } } });
      }).catch(function () { });
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadController) showUpdate(); });
    } catch (e) { } }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
