/* Rinde Fácil — arranque: rutas, tema y dibujo de la pantalla. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, h = U.h;
  var app = RF.app = { pendingFilter: null, lastTramite: null };
  var storageBanner = null, storageBannerText = null, storageRetry = null, lastStorageOk = true;

  function paintStorageStatus(ok) {
    if (!storageBanner && document.body) {
      storageBannerText = h('span', null, '');
      storageRetry = h('button', { type: 'button', class: 'btn ghost small', onclick: function () {
        storageRetry.disabled = true;
        var wasFailed = !RF.store.storageOk();
        RF.store.flush().then(function () { if (!wasFailed) UI.toast('No hay cambios pendientes de guardar.', 'ok'); }, function () { UI.toast('Todavía no se pudo guardar. Revisa el espacio disponible y vuelve a intentar.', 'bad'); }).then(function () { storageRetry.disabled = false; });
      } }, 'Reintentar guardado');
      storageBanner = h('div', { class: 'storage-warning', id: 'storageWarning', role: 'alert', 'aria-live': 'assertive' }, storageBannerText, storageRetry);
      document.body.appendChild(storageBanner);
    }
    if (!storageBanner) return;
    storageBanner.hidden = !!ok;
    if (!ok) storageBannerText.textContent = 'No se guardaron los últimos cambios en este dispositivo. No cierres ni bloquees Rinde Fácil todavía. Libera espacio o comprueba el almacenamiento y pulsa «Reintentar guardado».';
    if (lastStorageOk === false && ok) UI.toast('El guardado volvió a funcionar.', 'ok');
    lastStorageOk = ok;
  }

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
    var t = RF.auth.phase() === 'open' ? (RF.store.get().ui.theme || 'system') : 'system', el = document.documentElement;
    if (t === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
    var sz = RF.auth.phase() === 'open' ? (RF.store.get().ui.textSize || 'normal') : 'normal';
    if (sz === 'normal') el.removeAttribute('data-text'); else el.setAttribute('data-text', sz);
    applyThemeLabel();
  }
  function applyThemeLabel() { /* las listas desplegables ya muestran la opción elegida */ }
  /* el tamaño de letra cambia el alto de todo: se guarda la posición del menú y de la página en proporción y se restituye */
  function keepScroll(change) {
    var side = document.getElementById('side'), ratioSide = side && side.scrollHeight ? side.scrollTop / side.scrollHeight : 0;
    var de = document.documentElement, ratioPage = de.scrollHeight ? (window.pageYOffset || 0) / de.scrollHeight : 0;
    change();
    var restore = function () { var s2 = document.getElementById('side'); if (s2) s2.scrollTop = ratioSide * s2.scrollHeight; window.scrollTo(0, ratioPage * document.documentElement.scrollHeight); };
    restore(); if (window.requestAnimationFrame) window.requestAnimationFrame(restore);
  }
  app.setTheme = function (v) { if (['system', 'light', 'dark'].indexOf(v) < 0) return; keepScroll(function () { RF.store.update(function (s) { s.ui.theme = v; }, { silent: true }); applyTheme(); }); };
  app.setText = function (v) { if (['normal', 'grande', 'muy-grande'].indexOf(v) < 0) return; keepScroll(function () { RF.store.update(function (s) { s.ui.textSize = v; }, { silent: true }); applyTheme(); }); };
  app.applyThemeLabel = applyThemeLabel;

  /* ---------- dibujo ---------- */
  var lastKey = null;
  function render() {
    var r = route(), host = document.getElementById('app'); if (!host) return;
    /* sin contraseña no se muestra nada de la comunidad: primero la pantalla de acceso */
    var ph = RF.auth.phase();
    if (ph === 'open') RF.data.useConvenio(RF.store.project()); /* las reglas son las del convenio del proyecto activo */
    if (ph !== 'open' || (RF.authui && RF.authui.pending())) { U.clear(host); host.appendChild(RF.authui.screen(ph)); document.body.classList.remove('menu-open'); return; }
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
          var page = tl.render(), where = RF.views.toolContext(r.id);
          if (where && page && page.children) {
            var heading = null; for (var ci = 0; ci < page.children.length; ci++) { if (page.children[ci].tagName === 'H1') { heading = page.children[ci]; break; } }
            if (heading && heading.nextSibling) page.insertBefore(where, heading.nextSibling); else if (heading) page.appendChild(where); else page.insertBefore(where, page.firstChild);
          }
          view = h('div', { class: 'view tool' }, back, page);
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
    RF.auth.init().then(function () {
      RF.auth.onChange(function () { applyTheme(); render(); });
      start();
    });
  }
  function start() {
    applyTheme();
    paintStorageStatus(RF.store.storageOk());
    RF.store.onStorageStatus(paintStorageStatus);
    var pending = null;
    RF.store.subscribe(function () { clearTimeout(pending); pending = setTimeout(render, 0); });
    window.addEventListener('hashchange', render);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
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
