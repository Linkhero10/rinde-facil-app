/* Rinde Fácil — PDF escaneado: cada página se dibuja ya derecha (pdf.js aplica la rotación del PDF) y se manda al OCR como imagen.
 * Así no importa cómo esté girada la imagen guardada dentro del PDF. La librería se carga solo cuando se necesita (vendor/pdfjs). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var PP = RF.pdfPages = RF.pdfPages || {};
  var SCALE = 2.2; /* ~158 ppp en carta: una hoja carta sale a 1346x1742 px; texto legible para el OCR sin archivos enormes */
  var LADO_MAX = 3000; /* formatos gigantes (p. ej. A0): la escala baja para que el lado mayor no pase de 3000 px */
  var LIMITE_PAGINA_MS = 90000; /* una página que no se dibuja y codifica en 90 s se corta y el PDF no se aplica */
  var libPromise = null;

  PP.load = function () {
    if (!libPromise) {
      var base = (root.document && root.document.baseURI) || root.location.href;
      libPromise = import(new URL('vendor/pdfjs/pdf.min.mjs', base).href).then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', base).href;
        return lib;
      }, function (e) { libPromise = null; throw e; }); /* si no se pudo cargar (sin conexión), la próxima vez se vuelve a intentar */
    }
    return libPromise;
  };

  function motivo(e) { return (e && e.message) || String(e || 'error desconocido'); }
  function abrirError(e) {
    if (e && e.name === 'PasswordException') return new Error('el PDF tiene clave; quítale la clave e intenta de nuevo');
    return new Error('no se pudo abrir el PDF (¿está dañado?): ' + motivo(e));
  }
  /* cierra el documento de pdf.js (worker y memoria); si ya estaba cerrado no pasa nada */
  function cerrar(doc) {
    if (!doc || typeof doc.destroy !== 'function') return;
    try { Promise.resolve(doc.destroy()).catch(function () { }); } catch (e) { /* ya cerrado */ }
  }
  /* libera el canvas (ancho y alto a 0) y la página de pdf.js; page.cleanup() espera si la página todavía se está dibujando */
  function liberar(page, canvas) {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    if (page && typeof page.cleanup === 'function') { try { page.cleanup(); } catch (e) { /* no es crítico */ } }
  }
  /* dibuja una página a JPEG con fondo blanco. Pedir la página, dibujarla y codificarla tienen un límite común de 90 s:
     si se pasa, se cancela el dibujo y se rechaza. El temporizador se borra al terminar, sea como sea. */
  function dibujarPagina(doc, num) {
    var page = null, canvas = null, tarea = null, cortada = false, timer = null;
    var trabajo = doc.getPage(num).then(function (p) {
      if (cortada) throw new Error('cortada');
      page = p;
      var base = p.getViewport({ scale: 1 }); /* getViewport aplica la rotación de la página (por defecto, page.rotate) */
      var escala = Math.min(SCALE, LADO_MAX / Math.max(base.width, base.height));
      var vp = p.getViewport({ scale: escala });
      canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      var ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('el navegador no pudo crear la imagen (¿falta memoria?)');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height); /* fondo blanco: sin esto una hoja vacía (transparente) sale negra en el JPEG */
      tarea = p.render({ canvasContext: ctx, viewport: vp });
      return tarea.promise;
    }).then(function () {
      if (cortada) throw new Error('cortada');
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error('no se pudo codificar la imagen')); }, 'image/jpeg', 0.92);
      });
    }).then(function (blob) {
      return { blob: blob, width: canvas.width, height: canvas.height };
    });
    var limite = new Promise(function (_, rechaza) {
      timer = setTimeout(function () {
        cortada = true;
        if (tarea) { try { tarea.cancel(); } catch (e) { /* ya terminó */ } }
        rechaza(new Error('tardó más de ' + (LIMITE_PAGINA_MS / 1000) + ' s'));
      }, LIMITE_PAGINA_MS);
    });
    return Promise.race([trabajo, limite]).then(function (img) {
      clearTimeout(timer); liberar(page, canvas);
      return img;
    }, function (e) {
      clearTimeout(timer); liberar(page, canvas);
      throw e;
    });
  }

  /* devuelve { total, pages: [{ number, blob, width, height }] }. onPage(num, total) avisa qué página empieza;
   * seguir() (opcional) devuelve false cuando ya no hace falta seguir (p. ej. el usuario cambió de archivo).
   * Si una página no se puede dibujar, rechaza diciendo cuál y por qué. El documento de pdf.js se cierra siempre. */
  PP.renderPages = function (arrayBuffer, onPage, seguir) {
    var doc = null;
    return PP.load().then(function (lib) {
      return lib.getDocument({ data: arrayBuffer }).promise.catch(function (e) { throw abrirError(e); });
    }, function (e) {
      throw new Error('no se pudo cargar la lectura de PDF (' + motivo(e) + ')');
    }).then(function (d) {
      doc = d;
      var n = doc.numPages, out = [], chain = Promise.resolve();
      var paso = function (num) {
        return function () {
          if (seguir && !seguir()) throw new Error('lectura cancelada');
          if (onPage) onPage(num, n);
          return dibujarPagina(doc, num).then(function (img) {
            out.push({ number: num, blob: img.blob, width: img.width, height: img.height });
          }, function (e) {
            throw new Error('la página ' + num + ' no se pudo dibujar: ' + motivo(e));
          });
        };
      };
      for (var i = 1; i <= n; i++) chain = chain.then(paso(i));
      return chain.then(function () { return { total: n, pages: out }; });
    }).then(function (res) {
      cerrar(doc);
      return res;
    }, function (e) {
      cerrar(doc);
      throw e;
    });
  };

  /* junta lo leído página por página en un solo resultado con la misma forma que el OCR de un PDF.
   * results: [{ number, ok, raw_text, pages, error }]; total: páginas del PDF.
   * Una página sin texto (OCR_SIN_TEXTO o «no devolvió texto») cuenta como leída: puede ser una hoja en blanco.
   * Además devuelve failedPages [{ number, error }] (páginas que no se leyeron), missingPages, duplicatePages y
   * pageTexts [{ number, text }] (el texto de cada página, para revisarlo con PP.reviewText). raw_text no cambia. */
  PP.aggregate = function (results, total) {
    total = Math.max(0, Math.floor(Number(total) || 0));
    var byNumber = {}, duplicatePages = [], fueraDeRango = [], texts = [], layout = [], pageTexts = [], failedPages = [], missingPages = [], leidas = 0;
    (results || []).forEach(function (r) {
      if (!r) return;
      var n = Number(r.number);
      if (!(n >= 1 && n <= total && n % 1 === 0)) { fueraDeRango.push(isNaN(n) ? '(sin número)' : n); return; }
      if (byNumber[n]) { if (duplicatePages.indexOf(n) < 0) duplicatePages.push(n); return; }
      byNumber[n] = r;
    });
    for (var i = 1; i <= total; i++) {
      var r = byNumber[i];
      if (!r) { missingPages.push(i); continue; }
      if (r.ok === false && !/SIN_TEXTO|no devolvió texto/.test(String(r.error || ''))) { failedPages.push({ number: i, error: String(r.error || 'error') }); continue; }
      var texto = r.raw_text ? String(r.raw_text) : '';
      leidas++;
      pageTexts.push({ number: i, text: texto });
      if (texto) texts.push(texto);
      (r.pages || []).forEach(function (p) { layout.push(Object.assign({}, p, { number: i })); });
    }
    duplicatePages.sort(function (a, b) { return a - b; });
    var errors = [];
    if (total < 1) errors.push('el PDF no tiene páginas');
    failedPages.forEach(function (f) { errors.push('página ' + f.number + ': ' + f.error); });
    if (missingPages.length) errors.push('no se leyeron las páginas ' + missingPages.join(', '));
    if (duplicatePages.length) errors.push('páginas repetidas en la lectura: ' + duplicatePages.join(', '));
    if (fueraDeRango.length) errors.push('resultados de páginas fuera del PDF: ' + fueraDeRango.join(', '));
    var completo = errors.length === 0;
    return {
      ok: completo && texts.length > 0,
      raw_text: texts.join('\n\f'),
      pages: layout,
      page_count: leidas,
      total_pages: total,
      document_coverage: completo ? 'COMPLETE' : 'PARTIAL_PAGE_SELECTION',
      error: completo ? (texts.length ? null : 'OCR_SIN_TEXTO') : errors.join('; '),
      failedPages: failedPages,
      missingPages: missingPages,
      duplicatePages: duplicatePages,
      pageTexts: pageTexts
    };
  };

  /* texto para revisar en pantalla: una línea «— página N —» antes de cada página. No es lo que usa el extractor (eso es raw_text). */
  PP.reviewText = function (res) {
    return ((res && res.pageTexts) || []).map(function (p) {
      return '— página ' + p.number + ' —\n' + (p.text || '(sin texto: hoja en blanco)');
    }).join('\n\n');
  };
})(typeof window !== 'undefined' ? window : globalThis);
