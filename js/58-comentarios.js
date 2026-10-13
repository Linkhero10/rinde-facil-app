/* Comentarios de la versión de revisión (solo se carga con ?comentarios=1). Quien revisa puede dejar un comentario general,
 * o elegir cualquier cosa de la pantalla (un bloque, un cuadro, una tabla) o un fragmento de texto seleccionado. Los comentarios
 * se guardan en el servicio de Felipe (comentarios/Comentarios.gs), así que vuelven a aparecer en su lugar al reabrir la página. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || doc.getElementById('rf-com-raiz')) return;
  /* servicio de comentarios (comentarios/Comentarios.gs, en la cuenta de quien administra la revisión). Cualquiera puede leer y comentar */
  var SERVICIO = root.RF_COMENTARIOS_URL || 'https://script.google.com/macros/s/AKfycbxGzAkr4fgzeIQbqPXdkkRAguUZEblncalVcpL0LMh8Ig8_8sJoNPj3yhQEUlYmOM5e0Q/exec';
  var MAX_TEXTO = 1500, MAX_NOMBRE = 60;
  var est = { seleccionando: false, comentarios: [], pins: [], resaltado: null, panel: null, menu: null, principal: null, banner: null, aviso: null };

  function el(tag, cls, texto, estilo) {
    var n = doc.createElement(tag);
    n.className = 'rf-com' + (cls ? ' ' + cls : '');
    if (estilo) Object.keys(estilo).forEach(function (k) { n.style[k] = estilo[k]; });
    if (texto != null) n.textContent = String(texto);
    return n;
  }
  function boton(texto, onclick, estilo) {
    var b = el('button', 'rf-com-btn', texto, Object.assign({ cursor: 'pointer', border: '1px solid #6b5b95', background: '#fff', color: '#2d2440', borderRadius: '8px', padding: '6px 10px', font: '14px system-ui, sans-serif' }, estilo || {}));
    b.type = 'button';
    b.addEventListener('click', function (e) { e.stopPropagation(); onclick(e); });
    return b;
  }
  function dentroDeLaInterfaz(n) { return !!(n && n.closest && n.closest('.rf-com')); }
  function aviso(texto) {
    if (est.aviso) est.aviso.remove();
    est.aviso = el('div', 'rf-com-aviso', texto, { position: 'fixed', top: '64px', left: '10px', zIndex: '2147483001', maxWidth: '360px', background: '#2d2440', color: '#fff', padding: '8px 12px', borderRadius: '8px', font: '14px system-ui, sans-serif' });
    doc.body.appendChild(est.aviso);
    setTimeout(function () { if (est.aviso) { est.aviso.remove(); est.aviso = null; } }, 4000);
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

  /* ---- red: nunca lanza; sin servicio, el comentario no se pierde porque se avisa ---- */
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

  /* ---- marcas sobre la pantalla ---- */
  function marcar() {
    est.pins.forEach(function (p) { p.remove(); });
    est.pins = [];
    var pantalla = pantallaActual();
    est.comentarios.forEach(function (c, i) {
      if (c.pantalla !== pantalla || !c.selector) return;
      var destino = buscar(c.selector);
      if (!destino) return;
      var r = destino.getBoundingClientRect();
      var pin = el('div', 'rf-com-pin', String(i + 1), { position: 'fixed', left: (r.left - 8) + 'px', top: (r.top - 8) + 'px', zIndex: '2147483000', width: '22px', height: '22px', borderRadius: '50%', background: '#6b5b95', color: '#fff', font: '12px/22px system-ui, sans-serif', textAlign: 'center', cursor: 'pointer' });
      pin.title = c.texto;
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
    var texto = el('textarea', 'rf-com-texto', '', { width: '100%', minHeight: '90px', boxSizing: 'border-box', font: '14px system-ui, sans-serif', padding: '8px' });
    texto.maxLength = MAX_TEXTO; texto.placeholder = 'Escribe tu comentario';
    var nombre = el('input', 'rf-com-nombre', '', { width: '100%', boxSizing: 'border-box', font: '14px system-ui, sans-serif', padding: '6px', marginBottom: '6px' });
    nombre.maxLength = MAX_NOMBRE; nombre.placeholder = 'Tu nombre (opcional)'; nombre.value = nombreGuardado;
    var estado = el('div', 'rf-com-estado', '', { fontSize: '13px', color: '#8a1c1c', minHeight: '18px' });
    var enviarBtn = boton('Enviar', function () {
      var t = texto.value.trim();
      if (!t) { estado.textContent = 'Escribe el comentario antes de enviar.'; return; }
      try { root.localStorage.setItem('rf-com-nombre', nombre.value.trim()); } catch (e) { /* sin almacenamiento */ }
      enviarBtn.disabled = true; estado.textContent = 'Enviando…';
      enviar({ pantalla: pantallaActual(), tipo: tipo, cita: cita || '', selector: selector || '', nombre: nombre.value.trim(), texto: t })
        .then(function (r) {
          if (r && r.ok) { cerrarPanel(); aviso('Comentario enviado. Gracias.'); refrescar(); return; }
          enviarBtn.disabled = false;
          estado.textContent = r && r.error === 'SIN_SERVICIO' ? 'El servicio de comentarios todavía no está conectado. Pide la URL a quien administra la revisión.' : 'No se pudo enviar (' + ((r && r.error) || 'error') + '). Inténtalo de nuevo.';
        });
    }, { background: '#6b5b95', color: '#fff', border: 'none' });
    var titulo = tipo === 'general' ? 'Comentario general sobre esta pantalla' : 'Comentario sobre lo que señalaste';
    var vista = cita ? el('blockquote', 'rf-com-cita', cita.length > 200 ? cita.slice(0, 200) + '…' : cita, { margin: '0 0 8px', padding: '6px 10px', borderLeft: '3px solid #6b5b95', background: '#f4f1fa', fontSize: '13px' }) : null;
    est.panel = el('div', 'rf-com-panel', '', { position: 'fixed', right: '12px', bottom: '12px', width: 'min(360px, calc(100vw - 24px))', zIndex: '2147483002', background: '#fff', border: '1px solid #6b5b95', borderRadius: '12px', padding: '12px', boxShadow: '0 8px 24px rgba(0,0,0,.2)', font: '14px system-ui, sans-serif' });
    est.panel.appendChild(el('div', '', titulo, { fontWeight: '700', marginBottom: '6px' }));
    if (vista) est.panel.appendChild(vista);
    est.panel.appendChild(nombre); est.panel.appendChild(texto); est.panel.appendChild(estado);
    est.panel.appendChild(el('div', '', '', { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }));
    var acciones = est.panel.lastChild;
    acciones.appendChild(boton('Cancelar', cerrarPanel, {}));
    acciones.appendChild(enviarBtn);
    doc.body.appendChild(est.panel);
    texto.focus();
  }
  function abrirLista() {
    cerrarPanel();
    var pantalla = pantallaActual();
    var propios = est.comentarios.filter(function (c) { return c.pantalla === pantalla; });
    est.panel = el('div', 'rf-com-panel', '', { position: 'fixed', right: '12px', bottom: '12px', width: 'min(360px, calc(100vw - 24px))', maxHeight: '60vh', overflow: 'auto', zIndex: '2147483002', background: '#fff', border: '1px solid #6b5b95', borderRadius: '12px', padding: '12px', boxShadow: '0 8px 24px rgba(0,0,0,.2)', font: '14px system-ui, sans-serif' });
    est.panel.appendChild(el('div', '', 'Comentarios de esta pantalla (' + propios.length + ')', { fontWeight: '700', marginBottom: '6px' }));
    if (!SERVICIO) est.panel.appendChild(el('div', '', 'El servicio de comentarios todavía no está conectado.', { color: '#8a1c1c' }));
    if (!propios.length) est.panel.appendChild(el('div', '', 'Todavía no hay comentarios aquí.', { color: '#555' }));
    propios.forEach(function (c, i) {
      var item = el('div', 'rf-com-item', '', { borderTop: '1px solid #eee', padding: '6px 0' });
      item.appendChild(el('div', '', (i + 1) + '. ' + (c.nombre || 'Sin nombre') + ' · ' + String(c.fecha || '').slice(0, 16).replace('T', ' '), { fontSize: '12px', color: '#555' }));
      if (c.cita) item.appendChild(el('div', '', '«' + String(c.cita).slice(0, 140) + '»', { fontSize: '13px', fontStyle: 'italic' }));
      item.appendChild(el('div', '', c.texto, { whiteSpace: 'pre-wrap' }));
      if (c.selector && buscar(c.selector)) {
        var ir = el('a', '', 'Ver en la pantalla', { fontSize: '13px', cursor: 'pointer', color: '#6b5b95' });
        ir.addEventListener('click', function () { var d = buscar(c.selector); if (d) d.scrollIntoView({ block: 'center' }); });
        item.appendChild(ir);
      }
      est.panel.appendChild(item);
    });
    est.panel.appendChild(el('div', '', '', { display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }));
    est.panel.lastChild.appendChild(boton('Cerrar', cerrarPanel, {}));
    doc.body.appendChild(est.panel);
  }

  /* ---- modo de selección: lo que se resalta es lo que se comenta ---- */
  function salirDeSeleccion() {
    est.seleccionando = false;
    if (est.resaltado) { est.resaltado.remove(); est.resaltado = null; }
    if (est.banner) { est.banner.remove(); est.banner = null; }
    doc.body.style.cursor = '';
  }
  function entrarEnSeleccion() {
    cerrarMenu();
    est.seleccionando = true;
    est.banner = el('div', 'rf-com-barra', 'Haz clic en cualquier cosa de la pantalla, o selecciona un texto. Esc para salir.', { position: 'fixed', top: '10px', right: '10px', zIndex: '2147483001', background: '#2d2440', color: '#fff', padding: '8px 12px', borderRadius: '8px', font: '14px system-ui, sans-serif', maxWidth: 'calc(100vw - 180px)' });
    est.banner.appendChild(boton('Salir', salirDeSeleccion, { marginLeft: '8px' }));
    est.resaltado = el('div', 'rf-com-resaltado', '', { position: 'fixed', pointerEvents: 'none', border: '2px dashed #6b5b95', background: 'rgba(107,91,149,.08)', zIndex: '2147483000', display: 'none' });
    doc.body.appendChild(est.banner); doc.body.appendChild(est.resaltado);
    doc.body.style.cursor = 'crosshair';
  }
  function resaltar(n) {
    if (!est.resaltado) return;
    var r = n.getBoundingClientRect();
    est.resaltado.style.display = 'block';
    est.resaltado.style.left = r.left + 'px'; est.resaltado.style.top = r.top + 'px';
    est.resaltado.style.width = r.width + 'px'; est.resaltado.style.height = r.height + 'px';
  }

  /* ---- menú del botón principal ---- */
  function cerrarMenu() { if (est.menu) { est.menu.remove(); est.menu = null; } }
  function abrirMenu() {
    if (est.menu) { cerrarMenu(); return; }
    est.menu = el('div', 'rf-com-menu', '', { position: 'absolute', top: '44px', left: '0', background: '#fff', border: '1px solid #6b5b95', borderRadius: '10px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '240px', boxShadow: '0 6px 18px rgba(0,0,0,.18)' });
    est.menu.appendChild(boton('Comentario general', function () { cerrarMenu(); abrirPanel('general', '', ''); }, { border: 'none', textAlign: 'left' }));
    est.menu.appendChild(boton('Seleccionar algo de la pantalla', entrarEnSeleccion, { border: 'none', textAlign: 'left' }));
    est.menu.appendChild(boton('Ver comentarios (' + est.comentarios.filter(function (c) { return c.pantalla === pantallaActual(); }).length + ')', function () { cerrarMenu(); abrirLista(); }, { border: 'none', textAlign: 'left' }));
    est.principal.appendChild(est.menu);
  }

  function construirBarra() {
    est.principal = el('div', 'rf-com-principal', '', { position: 'fixed', top: '10px', left: '10px', zIndex: '2147483000' });
    est.principal.id = 'rf-com-raiz';
    est.principal.appendChild(boton('Dejar un comentario', function () { abrirMenu(); }, { background: '#6b5b95', color: '#fff', border: 'none', fontWeight: '600', boxShadow: '0 2px 8px rgba(0,0,0,.2)' }));
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
      var texto = (n.textContent || '').trim().slice(0, 200);
      var sel = root.getSelection ? String(root.getSelection()).trim() : '';
      salirDeSeleccion();
      abrirPanel(sel ? 'texto' : 'elemento', sel || texto, rutaCss(n));
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
    root.addEventListener('hashchange', function () { cerrarPanel(); refrescar(); });
    root.addEventListener('scroll', function () { marcar(); }, true);
    root.addEventListener('resize', function () { marcar(); });
    root.setInterval(function () { marcar(); }, 1500);
  }

  function iniciar() {
    construirBarra();
    eventosSeleccion();
    refrescar();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  /* para pruebas y para quien administra la revisión: lo que quedó en pantalla */
  root.RF_COMENTARIOS = { cargar: cargar, enviar: enviar, rutaCss: rutaCss, comentarios: function () { return est.comentarios.slice(); } };
})(typeof window !== 'undefined' ? window : globalThis);
