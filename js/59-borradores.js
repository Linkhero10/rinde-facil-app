/* Memoria de pantalla. Lo que se escribe o se elige en una pantalla (campos, selecciones, casillas) sobrevive a cambiar de
 * pestaña, a que la app vuelva a dibujarse y a recargar la página. Se guarda en state.ui: no entra en la sincronización con
 * Drive y, con la bóveda abierta, queda cifrado junto con el resto de los datos. Nunca guarda contraseñas ni archivos
 * (los archivos van a RF.blobs, igual que los PEA ya aplicados). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var B = RF.borradores = RF.borradores || {};
  var NO_TIPO = { password: 1, file: 1, button: 1, submit: 1, reset: 1, image: 1, hidden: 1 };
  /* pantallas con modo de edición (un gasto o un documento abierto): restaurar sus campos podría mezclar un registro con otro */
  var SIN_BORRADORES = { gastos: 1, documentos: 1, actas: 1 };
  var pantalla = null, pendiente = null;
  /* el enrutador llama a este módulo en cada dibujo: un fallo aquí no puede dejar la app sin pantalla */
  function seguro(fn) { return function () { try { return fn.apply(this, arguments); } catch (e) { if (root.console) root.console.error(e); } }; }

  function campos(raiz) {
    var out = [];
    if (!raiz || !raiz.querySelectorAll) return out;
    var els = raiz.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], tipo = String(el.type || '').toLowerCase();
      if (NO_TIPO[tipo] || el.disabled || el.readOnly || (el.hasAttribute && el.hasAttribute('data-no-borrador'))) continue;
      out.push(el);
    }
    return out;
  }
  /* clave estable por campo: nombre o id, tipo de campo y el orden entre los iguales */
  function recorrer(raiz, fn) {
    var cuenta = {};
    campos(raiz).forEach(function (el) {
      var base = (el.name || el.id || '') + '|' + el.tagName + '|' + (el.type || '');
      cuenta[base] = (cuenta[base] || 0) + 1;
      fn(el, base + '#' + cuenta[base]);
    });
  }
  function valorDe(el) { return el.type === 'checkbox' || el.type === 'radio' ? !!el.checked : String(el.value); }
  function estado() { return RF.store && RF.store.get ? RF.store.get() : null; }
  function escribirUi(fn) { RF.store.update(function (s) { s.ui = s.ui || {}; fn(s.ui); }, { silent: true }); }

  /* guarda en state.ui.borradores lo que hay en la pantalla de la herramienta tid (solo si cambió) */
  B.guardar = function (tid, raiz) {
    if (!tid || !raiz || !RF.store) return;
    var mapa = {};
    recorrer(raiz, function (el, k) { mapa[k] = valorDe(el); });
    var s = estado(), previo = s && s.ui && s.ui.borradores && s.ui.borradores[tid];
    if (JSON.stringify(previo || {}) === JSON.stringify(mapa)) return;
    escribirUi(function (ui) { ui.borradores = ui.borradores || {}; ui.borradores[tid] = mapa; });
  };

  /* pone en la pantalla recién dibujada lo que se guardó y avisa a la herramienta como si el usuario lo hubiera escrito */
  B.restaurar = function (tid, raiz) {
    var s = estado(), mapa = s && s.ui && s.ui.borradores && s.ui.borradores[tid];
    if (!mapa || !raiz) return;
    recorrer(raiz, function (el, k) {
      if (!Object.prototype.hasOwnProperty.call(mapa, k)) return;
      var v = mapa[k];
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked === v) return; el.checked = v; }
      else { if (el.value === v) return; el.value = v; }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  function cancelar() { if (pendiente) { clearTimeout(pendiente); pendiente = null; } }

  /* antes de volver a dibujar la app: guarda lo que hay en la pantalla que se va */
  B.antes = seguro(function () {
    cancelar();
    var main = root.document && root.document.getElementById('main');
    if (pantalla && main && !SIN_BORRADORES[pantalla]) B.guardar(pantalla, main);
    pantalla = null;
  });

  /* después de dibujar: pone lo guardado y empieza a guardar lo que se escribe (tid = null si no es una herramienta) */
  B.despues = seguro(function (tid, main) {
    pantalla = tid || null;
    if (!tid || !main || SIN_BORRADORES[tid]) return;
    B.restaurar(tid, main);
    var programar = function () {
      cancelar();
      pendiente = setTimeout(function () {
        pendiente = null;
        if (pantalla === tid && main.isConnected) B.guardar(tid, main);
      }, 400);
    };
    main.addEventListener('input', programar);
    main.addEventListener('change', programar);
  });


  /* al recargar o cerrar la pestaña: lo último escrito queda en disco antes de irse */
  if (root.addEventListener) root.addEventListener('pagehide', seguro(function () {
    var main = root.document && root.document.getElementById('main');
    if (pantalla && main && !SIN_BORRADORES[pantalla]) B.guardar(pantalla, main);
    if (RF.store && RF.store.persistNow) RF.store.persistNow();
  }));
})(typeof window !== 'undefined' ? window : globalThis);
