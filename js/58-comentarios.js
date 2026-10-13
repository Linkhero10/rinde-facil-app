/* Comentarios de la versión de revisión (temporal; se carga en todas las pantallas). Quien revisa puede dejar un comentario general,
 * o elegir cualquier cosa de la pantalla (un bloque, un cuadro, una tabla) o un fragmento de texto seleccionado. Los comentarios
 * se guardan en el servicio de Felipe (comentarios/Comentarios.gs), así que vuelven a aparecer en su lugar al reabrir la página.
 * Los colores y las formas son los de la app (variables del tema y clases btn/card), para que se vea igual en claro y en oscuro. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || doc.getElementById('rf-com-raiz')) return;
  /* servicio de comentarios (comentarios/Comentarios.gs, en la cuenta de quien administra la revisión). Cualquiera puede leer y comentar */
  var SERVICIO = root.RF_COMENTARIOS_URL || 'https://script.google.com/macros/s/AKfycbxGzAkr4fgzeIQbqPXdkkRAguUZEblncalVcpL0LMh8Ig8_8sJoNPj3yhQEUlYmOM5e0Q/exec';
  var MAX_TEXTO = 1500, MAX_NOMBRE = 60;
  var est = { seleccionando: false, comentarios: [], pins: [], resaltado: null, etiqueta: null, panel: null, menu: null, principal: null, banner: null, aviso: null, objetivo: null };

  function estilos() {
    if (doc.getElementById('rf-com-estilos')) return;
    var s = doc.createElement('style');
    s.id = 'rf-com-estilos';
    s.textContent = [
      '.rf-com-principal{position:fixed;top:10px;left:10px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-start}',
      '.rf-com-principal .btn{margin:0}',
      '.rf-com-menu{margin-top:6px;min-width:260px;padding:6px;display:flex;flex-direction:column;gap:4px;box-shadow:var(--shadow)}',
      '.rf-com-op{justify-content:flex-start;width:100%;margin:0;text-align:left}',
      '.rf-com-panel{position:fixed;right:12px;bottom:12px;width:min(380px,calc(100vw - 24px));max-height:70vh;overflow:auto;padding:16px;z-index:2147483002;color:var(--ink);font-family:var(--body);box-shadow:var(--shadow)}',
      '.rf-com-titulo{font-family:var(--display);font-size:20px;line-height:1.15;margin:0 0 10px;color:var(--ink)}',
      '.rf-com-cita{margin:0 0 10px;padding:8px 10px;border-left:3px solid var(--action);background:var(--action-soft);color:var(--ink-2);font-size:14px;border-radius:4px;white-space:pre-wrap}',
      '.rf-com-meta{font-family:var(--mono);font-size:12px;color:var(--muted);margin:0 0 4px}',
      '.rf-com-cuerpo{white-space:pre-wrap;color:var(--ink);font-size:15px;margin:4px 0 6px}',
      '.rf-com-item{border-top:1px solid var(--line);padding:10px 0}',
      '.rf-com-acciones{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}',
      '.rf-com-estado{min-height:18px;font-size:13px;color:var(--bad);margin-top:6px}',
      '.rf-com-pin{position:fixed;width:26px;height:26px;border-radius:50%;background:var(--action);color:var(--action-ink);font:600 12px/22px var(--mono);text-align:center;border:2px solid var(--canvas);box-shadow:var(--shadow);cursor:pointer;z-index:2147483000}',
      '.rf-com-resaltado{position:fixed;pointer-events:none;z-index:2147483000;border:2px solid var(--action);background:color-mix(in srgb,var(--action) 18%,transparent);border-radius:4px;display:none}',
      '.rf-com-etiqueta{position:fixed;pointer-events:none;z-index:2147483001;background:var(--action);color:var(--action-ink);font:12px/1.4 var(--mono);padding:3px 8px;border-radius:4px;white-space:nowrap;max-width:70vw;overflow:hidden;text-overflow:ellipsis;display:none}',
      '.rf-com-banner{position:fixed;top:12px;right:12px;z-index:2147483001;max-width:calc(100vw - 200px);display:flex;gap:10px;align-items:center;padding:10px 12px;color:var(--ink);font-family:var(--body);font-size:15px;box-shadow:var(--shadow)}',
      '.rf-com-aviso{position:fixed;left:12px;bottom:12px;z-index:2147483001;max-width:360px;padding:10px 14px;border-radius:6px;background:var(--action);color:var(--action-ink);font-family:var(--body);font-size:14px;box-shadow:var(--shadow)}'
    ].join('\n');
    doc.head.appendChild(s);
  }
  function el(tag, cls, texto) {
    var n = doc.createElement(tag);
    n.className = 'rf-com' + (cls ? ' ' + cls : '');
    if (texto != null) n.textContent = String(texto);
    return n;
  }
  function boton(texto, onclick, cls) {
    var b = el('button', 'btn ' + (cls || 'small'), texto);
    b.type = 'button';
    b.addEventListener('click', function (e) { e.stopPropagation(); onclick(e); });
    return b;
  }
  function dentroDeLaInterfaz(n) { return !!(n && n.closest && n.closest('.rf-com')); }
  function aviso(texto) {
    if (est.aviso) est.aviso.remove();
    est.aviso = el('div', 'rf-com-aviso', texto);
    doc.body.appendChild(est.aviso);
    setTimeout(function () { if (est.aviso) { est.aviso.remove(); est.aviso = null; } }, 4000);
  }
  /* texto del comentario: el servicio lo devuelve como «comentario» (y acepta «texto» por si cambia) */
  function textoDe(c) { return String(c.comentario != null ? c.comentario : (c.texto || '')); }
  /* texto tal como se ve: innerText pone espacio entre elementos vecinos (textContent los pega: «Subir el PEAElegir») */
  function textoVisible(n) { return String(n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim(); }
  function descripcion(n) {
    var t = textoVisible(n);
    return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (t ? ' · ' + t.slice(0, 60) + (t.length > 60 ? '…' : '') : '');
  }

  /* ruta CSS corta y estable para volver a encontrar el elemento al reabrir */
  function rutaCss(n) {
    var partes = [];
    while (n && n.nodeType === 1 && n !== doc.body && n !== doc.documentElement) {
      if (n.id && !/\s/.test(n.id)) { partes.unshift('#' + root.CSS.escape(n.id)); break; }
      var sel = n.tagName.toLowerCase(), padre = n.parentElement;
      if (padre) {
        var hermanos = Array.prototype.filter.call(padre.children, function (x) { return x.tagName === n.tagName; });
        if (hermanos.length > 1) sel += ':nth-of-type(' + (hermanos.indexOf(n) + 1) + ')';
      }
      partes.unshift(sel);
      n = padre;
    }
    return partes.join(' > ');
  }
  function buscar(selector) {
    if (!selector) return null;
    try { return doc.querySelector(selector); } catch (e) { return null; }
  }
  function pantallaActual() { return root.location.hash || '#/'; }

  /* ---- red: nunca lanza; si algo falla, se avisa y no se pierde el texto escrito ---- */
  function cargar() {
    if (!SERVICIO) return Promise.resolve([]);
    return root.fetch(SERVICIO + '?pantalla=' + encodeURIComponent(pantallaActual()), { cache: 'no-store' })
      .then(function (r) { return r.json(); }).then(function (j) { return (j && j.comentarios) || []; })
      .catch(function () { return []; });
  }
  function enviar(datos) {
    if (!SERVICIO) return Promise.resolve({ ok: false, error: 'SIN_SERVICIO' });
    return root.fetch(SERVICIO, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ accion: 'agregar' }, datos)) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: 'SIN_CONEXION' }; });
  }

  /* ---- marcas sobre la pantalla: un número en el lugar del comentario ---- */
  function marcar() {
    est.pins.forEach(function (p) { p.remove(); });
    est.pins = [];
    var pantalla = pantallaActual();
    est.comentarios.forEach(function (c, i) {
      if (c.pantalla !== pantalla || !c.selector) return;
      var destino = buscar(c.selector);
      if (!destino) return;
      var r = destino.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      var pin = el('div', 'rf-com-pin', String(i + 1));
      pin.style.left = (r.left - 10) + 'px';
      pin.style.top = (r.top - 10) + 'px';
      pin.title = textoDe(c);
      pin.addEventListener('click', function (e) { e.stopPropagation(); abrirLista(); });
      doc.body.appendChild(pin);
      est.pins.push(pin);
    });
  }
  function refrescar() { cargar().then(function (lista) { est.comentarios = lista; marcar(); }); }

  /* ---- paneles ---- */
  function cerrarPanel() { if (est.panel) { est.panel.remove(); est.panel = null; } }
  function abrirPanel(tipo, cita, selector) {
    cerrarPanel();
    var nombreGuardado = ''; try { nombreGuardado = root.localStorage.getItem('rf-com-nombre') || ''; } catch (e) { /* sin almacenamiento */ }
    var texto = el('textarea', 'rf-com-texto');
    texto.maxLength = MAX_TEXTO; texto.rows = 4; texto.placeholder = 'Escribe tu comentario';
    var nombre = el('input', 'rf-com-nombre');
    nombre.type = 'text'; nombre.maxLength = MAX_NOMBRE; nombre.placeholder = 'Tu nombre (opcional)'; nombre.value = nombreGuardado;
    var estado = el('div', 'rf-com-estado');
    var enviarBtn = boton('Enviar', function () {
      var t = texto.value.trim();
      if (!t) { estado.textContent = 'Escribe el comentario antes de enviar.'; return; }
      try { root.localStorage.setItem('rf-com-nombre', nombre.value.trim()); } catch (e) { /* sin almacenamiento */ }
      enviarBtn.disabled = true; estado.textContent = 'Enviando…';
      enviar({ pantalla: pantallaActual(), tipo: tipo, cita: cita || '', selector: selector || '', nombre: nombre.value.trim(), texto: t })
        .then(function (r) {
          if (r && r.ok) { cerrarPanel(); aviso('Comentario enviado. Gracias.'); refrescar(); return; }
          enviarBtn.disabled = false;
          estado.textContent = r && r.error === 'SIN_SERVICIO' ? 'El servicio de comentarios todavía no está conectado.' : 'No se pudo enviar (' + ((r && r.error) || 'error') + '). Tu texto sigue aquí; inténtalo de nuevo.';
        });
    }, 'primary small');
    est.panel = el('div', 'card rf-com-panel');
    est.panel.appendChild(el('div', 'rf-com-titulo', tipo === 'general' ? 'Comentario general' : 'Comentario sobre lo que señalaste'));
    if (cita) est.panel.appendChild(el('blockquote', 'rf-com-cita', cita.length > 200 ? cita.slice(0, 200) + '…' : cita));
    est.panel.appendChild(nombre); est.panel.appendChild(texto); est.panel.appendChild(estado);
    var acciones = el('div', 'rf-com-acciones');
    acciones.appendChild(boton('Cancelar', cerrarPanel, 'small'));
    acciones.appendChild(enviarBtn);
    est.panel.appendChild(acciones);
    doc.body.appendChild(est.panel);
    texto.focus();
  }
  function abrirLista() {
    cerrarPanel();
    var pantalla = pantallaActual();
    var propios = est.comentarios.filter(function (c) { return c.pantalla === pantalla; });
    est.panel = el('div', 'card rf-com-panel');
    est.panel.appendChild(el('div', 'rf-com-titulo', 'Comentarios de esta pantalla (' + propios.length + ')'));
    if (!SERVICIO) est.panel.appendChild(el('div', 'rf-com-estado', 'El servicio de comentarios todavía no está conectado.'));
    if (!propios.length) est.panel.appendChild(el('div', 'rf-com-cuerpo', 'Todavía no hay comentarios aquí. Usa "Dejar un comentario" para ser el primero.'));
    propios.forEach(function (c, i) {
      var item = el('div', 'rf-com-item');
      item.appendChild(el('div', 'rf-com-meta', (i + 1) + '. ' + (c.nombre || 'Sin nombre') + ' · ' + String(c.fecha || '').slice(0, 16).replace('T', ' ')));
      if (c.cita) item.appendChild(el('blockquote', 'rf-com-cita', String(c.cita).slice(0, 160)));
      item.appendChild(el('div', 'rf-com-cuerpo', textoDe(c)));
      if (c.selector && buscar(c.selector)) {
        var ir = boton('Ver en la pantalla', function () { var d = buscar(c.selector); if (d) d.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 'ghost small');
        item.appendChild(ir);
      }
      est.panel.appendChild(item);
    });
    var acciones = el('div', 'rf-com-acciones');
    acciones.appendChild(boton('Cerrar', cerrarPanel, 'small'));
    est.panel.appendChild(acciones);
    doc.body.appendChild(est.panel);
  }

  /* ---- modo de selección: se ve qué parte de la pantalla se va a comentar ---- */
  function salirDeSeleccion() {
    est.seleccionando = false;
    if (est.resaltado) { est.resaltado.remove(); est.resaltado = null; }
    if (est.etiqueta) { est.etiqueta.remove(); est.etiqueta = null; }
    if (est.banner) { est.banner.remove(); est.banner = null; }
    est.objetivo = null;
    doc.body.style.cursor = '';
  }
  function entrarEnSeleccion() {
    cerrarMenu();
    cerrarPanel();
    est.seleccionando = true;
    est.banner = el('div', 'card rf-com-banner', 'Pasa el cursor sobre lo que quieras comentar, haz clic o selecciona un texto.');
    est.banner.appendChild(boton('Salir (Esc)', salirDeSeleccion, 'small'));
    est.resaltado = el('div', 'rf-com-resaltado');
    est.etiqueta = el('div', 'rf-com-etiqueta');
    doc.body.appendChild(est.resaltado); doc.body.appendChild(est.etiqueta); doc.body.appendChild(est.banner);
    doc.body.style.cursor = 'crosshair';
  }
  function resaltar(n) {
    if (!est.resaltado || !n || !n.getBoundingClientRect) return;
    est.objetivo = n;
    var r = n.getBoundingClientRect();
    est.resaltado.style.display = 'block';
    est.resaltado.style.left = r.left + 'px'; est.resaltado.style.top = r.top + 'px';
    est.resaltado.style.width = r.width + 'px'; est.resaltado.style.height = r.height + 'px';
    est.etiqueta.style.display = 'block';
    est.etiqueta.textContent = descripcion(n);
    est.etiqueta.style.left = Math.max(4, r.left) + 'px';
    est.etiqueta.style.top = Math.max(4, r.top - 26) + 'px';
  }

  /* ---- menú del botón principal ---- */
  function cerrarMenu() { if (est.menu) { est.menu.remove(); est.menu = null; } }
  function abrirMenu() {
    if (est.menu) { cerrarMenu(); return; }
    var propios = est.comentarios.filter(function (c) { return c.pantalla === pantallaActual(); }).length;
    est.menu = el('div', 'card rf-com-menu');
    est.menu.appendChild(boton('Comentario general', function () { cerrarMenu(); abrirPanel('general', '', ''); }, 'ghost small rf-com-op'));
    est.menu.appendChild(boton('Seleccionar algo de la pantalla', entrarEnSeleccion, 'ghost small rf-com-op'));
    est.menu.appendChild(boton('Ver comentarios (' + propios + ')', function () { cerrarMenu(); abrirLista(); }, 'ghost small rf-com-op'));
    est.principal.appendChild(est.menu);
  }

  /* arriba a la izquierda, sin tapar el botón del menú del celular ni el menú lateral del escritorio */
  function posicionar() {
    if (!est.principal) return;
    var barra = doc.querySelector('.topbar'), lado = doc.getElementById('side');
    var movil = !!barra && root.getComputedStyle(barra).display !== 'none';
    var lateral = !movil && !!lado && root.getComputedStyle(lado).display !== 'none';
    est.principal.style.top = movil ? (barra.getBoundingClientRect().bottom + 8) + 'px' : '10px';
    est.principal.style.left = lateral ? (lado.getBoundingClientRect().right + 12) + 'px' : '10px';
  }

  function construirBarra() {
    est.principal = el('div', 'rf-com-principal');
    est.principal.id = 'rf-com-raiz';
    est.principal.appendChild(boton('Dejar un comentario', function () { abrirMenu(); }, 'primary small'));
    doc.body.appendChild(est.principal);
  }

  function eventosSeleccion() {
    doc.addEventListener('mousemove', function (e) {
      if (!est.seleccionando || dentroDeLaInterfaz(e.target)) return;
      resaltar(e.target);
    }, true);
    doc.addEventListener('click', function (e) {
      if (!est.seleccionando || dentroDeLaInterfaz(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      var n = e.target;
      var sel = root.getSelection ? String(root.getSelection()).trim() : '';
      var cita = sel || textoVisible(n).slice(0, 200);
      salirDeSeleccion();
      abrirPanel(sel ? 'texto' : 'elemento', cita, rutaCss(n));
    }, true);
    doc.addEventListener('mouseup', function () {
      if (!est.seleccionando) return;
      var sel = root.getSelection ? String(root.getSelection()).trim() : '';
      if (!sel) return;
      var ancla = root.getSelection().anchorNode;
      ancla = ancla && ancla.nodeType === 3 ? ancla.parentElement : ancla;
      if (!ancla || dentroDeLaInterfaz(ancla)) return;
      salirDeSeleccion();
      abrirPanel('texto', sel.slice(0, 300), rutaCss(ancla));
    }, true);
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { salirDeSeleccion(); cerrarMenu(); cerrarPanel(); }
    });
    doc.addEventListener('click', function (e) {
      if (est.menu && !dentroDeLaInterfaz(e.target)) cerrarMenu();
    });
    root.addEventListener('hashchange', function () { cerrarPanel(); salirDeSeleccion(); refrescar(); posicionar(); });
    root.addEventListener('scroll', function () { marcar(); }, true);
    root.addEventListener('resize', function () { marcar(); posicionar(); });
    root.setInterval(function () { marcar(); posicionar(); }, 1500);
  }

  function iniciar() {
    estilos();
    construirBarra();
    posicionar();
    eventosSeleccion();
    refrescar();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  /* para pruebas y para quien administra la revisión: lo que quedó en pantalla */
  root.RF_COMENTARIOS = { cargar: cargar, enviar: enviar, rutaCss: rutaCss, textoDe: textoDe, comentarios: function () { return est.comentarios.slice(); } };
})(typeof window !== 'undefined' ? window : globalThis);
