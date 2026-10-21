/* Rinde Fácil — raíz de confianza local para servicios Apps Script.
 * La lista se fija al distribuir una versión aprobada. No se aprende del primer contacto.
 * Un servicio sin entrada permanece bloqueado por defecto. */
(function (root) {
  'use strict';
  /* Cada comunidad requiere su propia publicación aprobada. La edición pública no confía en endpoints por defecto. */
  var bundled = {
    approvedAppsScriptUrls: []
  };
  var supplied = root.RF_SERVICE_TRUST || bundled;
  var urls = supplied && Array.isArray(supplied.approvedAppsScriptUrls) ? supplied.approvedAppsScriptUrls.slice() : [];
  var policy = Object.freeze({ approvedAppsScriptUrls: Object.freeze(urls) });
  try {
    Object.defineProperty(root, 'RF_SERVICE_TRUST', { value: policy, enumerable: false, writable: false, configurable: false });
  } catch (e) {
    root.RF_SERVICE_TRUST = policy;
  }
})(typeof window !== 'undefined' ? window : globalThis);
