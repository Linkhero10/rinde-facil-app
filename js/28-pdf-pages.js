/* Rinde Fácil — PDF escaneado: cada página se dibuja ya derecha (pdf.js aplica la rotación del PDF) y se manda al OCR como imagen.
 * Así no importa cómo esté girada la imagen guardada dentro del PDF. La librería se carga solo cuando se necesita (vendor/pdfjs). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var PP = RF.pdfPages = RF.pdfPages || {};
  var SCALE = 2.2; /* ~158 ppp en carta: texto legible para el OCR sin archivos enormes */
  var libPromise = null;

  PP.load = function () {
    if (!libPromise) {
      var base = (root.document && root.document.baseURI) || root.location.href;
      libPromise = import(new URL('vendor/pdfjs/pdf.min.mjs', base).href).then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', base).href;
        return lib;
      });
    }
    return libPromise;
  };

  /* devuelve { total, pages: [{ number, blob, width, height }] }; onPage(num, total) avisa el avance */
  PP.renderPages = function (arrayBuffer, onPage) {
    return PP.load().then(function (lib) {
      return lib.getDocument({ data: arrayBuffer }).promise;
    }).then(function (doc) {
      var n = doc.numPages, out = [], chain = Promise.resolve();
      var step = function (num) {
        return doc.getPage(num).then(function (page) {
          var vp = page.getViewport({ scale: SCALE });
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(vp.width);
          canvas.height = Math.round(vp.height);
          var dibujo = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          var limite = new Promise(function (_, rechaza) { setTimeout(function () { rechaza(new Error('la página ' + num + ' tardó demasiado en dibujarse')); }, 90000); });
          return Promise.race([dibujo, limite]).then(function () {
            return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.92); });
          }).then(function (blob) {
            out.push({ number: num, blob: blob, width: canvas.width, height: canvas.height });
            canvas.width = 0;
            canvas.height = 0;
            if (page.cleanup) page.cleanup();
            if (onPage) onPage(num, n);
          });
        });
      };
      for (var i = 1; i <= n; i++) chain = chain.then(step.bind(null, i));
      return chain.then(function () { return { total: n, pages: out }; });
    });
  };

  /* junta lo leído página por página en un solo resultado con la misma forma que el OCR de un PDF.
   * results: [{ number, ok, raw_text, pages, error }]; total: páginas del PDF.
   * Una página sin texto (OCR_SIN_TEXTO) cuenta como leída: puede ser una hoja en blanco. */
  PP.aggregate = function (results, total) {
    var byNumber = {}, errors = [], texts = [], layout = [];
    (results || []).forEach(function (r) { if (r && r.number) byNumber[r.number] = r; });
    var missing = [];
    for (var i = 1; i <= total; i++) {
      var r = byNumber[i];
      if (!r) { missing.push(i); continue; }
      if (r.ok === false && !/SIN_TEXTO|no devolvió texto/.test(String(r.error || ''))) { errors.push('página ' + i + ': ' + (r.error || 'error')); continue; }
      if (r.raw_text) texts.push(String(r.raw_text));
      (r.pages || []).forEach(function (p) { layout.push(Object.assign({}, p, { number: i })); });
    }
    if (missing.length) errors.push('no se leyeron las páginas ' + missing.join(', '));
    var completo = errors.length === 0;
    return {
      ok: completo && texts.length > 0,
      raw_text: texts.join('\n\f'),
      pages: layout,
      page_count: Object.keys(byNumber).length,
      total_pages: total,
      document_coverage: completo ? 'COMPLETE' : 'PARTIAL_PAGE_SELECTION',
      error: completo ? (texts.length ? null : 'OCR_SIN_TEXTO') : errors.join('; ')
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
