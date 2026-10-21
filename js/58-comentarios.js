/* Comentarios de la versión de revisión (temporal; se carga en todas las pantallas). Quien revisa puede dejar un comentario general, uno de la pestaña en la que está,
 * o elegir cualquier cosa de la pantalla (un bloque, un cuadro, una tabla) o un fragmento de texto seleccionado. Los comentarios
 * se guardan en el servicio de Felipe (comentarios/Comentarios.gs), así que vuelven a aparecer en su lugar al reabrir la página. La pestaña se guarda con el nombre que se ve en la app (Mi ruta, Subir el PEA…); el comentario general sigue guardando la dirección de la pantalla, como antes.
 * Los colores y las formas son los de la app (variables del tema y clases btn/card), para que se vea igual en claro y en oscuro. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || doc.getElementById('rf-com-raiz')) return;
  /* servicio de comentarios (comentarios/Comentarios.gs, en la cuenta de quien administra la revisión). Cualquiera puede leer y comentar */
  var SERVICIO = root.RF_COMENTARIOS_URL || 'https://script.google.com/macros/s/AKfycbxGzAkr4fgzeIQbqPXdkkRAguUZEblncalVcpL0LMh8Ig8_8sJoNPj3yhQEUlYmOM5e0Q/exec';
  var MAX_TEXTO = 1500, MAX_NOMBRE = 60;
  /* la misma versión que sw.js (lo comprueba test/publicar-safety.test.mjs): quien revisa la ve al pie de la lista, para saber qué copia usa */
  var VERSION_REVISION = 'rf-v3-62';
  var est = { seleccionando: false, comentarios: [], conDatos: false, cargando: false, fallo: false, panelTipo: null, botonContador: null, pinesPorClave: {}, resaltado: null, etiqueta: null, panel: null, menu: null, principal: null, banner: null, aviso: null, objetivo: null, marcas: [], activo: null, vista: null };

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
      '.rf-com-item{border-top:1px solid var(--line);padding:10px 8px;margin:0 -8px;border-radius:8px;cursor:pointer}',
      '.rf-com-item:hover,.rf-com-item:focus-visible{background:var(--action-soft);outline:none}',
      '.rf-com-acciones{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}',
      '.rf-com-estado{min-height:18px;font-size:13px;color:var(--bad);margin-top:6px}',
      '.rf-com-pin{position:fixed;width:26px;height:26px;border-radius:50%;background:var(--action);color:var(--action-ink);font:600 12px/22px var(--mono);text-align:center;border:2px solid var(--canvas);box-shadow:var(--shadow);cursor:pointer;z-index:2147483000}',
      '.rf-com-resaltado{position:fixed;pointer-events:none;z-index:2147483000;border:2px solid var(--action);background:color-mix(in srgb,var(--action) 18%,transparent);border-radius:4px;display:none}',
      '.rf-com-etiqueta{position:fixed;pointer-events:none;z-index:2147483001;background:var(--action);color:var(--action-ink);font:12px/1.4 var(--mono);padding:3px 8px;border-radius:4px;white-space:nowrap;max-width:70vw;overflow:hidden;text-overflow:ellipsis;display:none}',
      '.rf-com-banner{position:fixed;top:12px;right:12px;z-index:2147483001;max-width:calc(100vw - 200px);display:flex;gap:10px;align-items:center;padding:10px 12px;color:var(--ink);font-family:var(--body);font-size:15px;box-shadow:var(--shadow)}',
      '.rf-com-aviso{position:fixed;left:12px;bottom:12px;z-index:2147483001;max-width:360px;padding:10px 14px;border-radius:6px;background:var(--action);color:var(--action-ink);font-family:var(--body);font-size:14px;box-shadow:var(--shadow)}'
    ].join('\n');
    doc.head.appendChild(s);
    var s2 = doc.createElement('style');
    s2.id = 'rf-com-estilos-vista';
    s2.textContent = [
      '.rf-com-chip{display:inline-block;font:600 11px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:999px;background:var(--action-soft);color:var(--ink-2);margin:0 0 6px}',
      '.rf-com-marca{position:fixed;pointer-events:none;z-index:2147483000;border-radius:3px;background:color-mix(in srgb,var(--action) 30%,transparent);box-shadow:0 0 0 2px var(--action)}',
      '.rf-com-caja{position:fixed;pointer-events:none;z-index:2147483000;border:3px solid var(--action);border-radius:6px;background:color-mix(in srgb,var(--action) 10%,transparent)}',
      '.rf-com-area{position:fixed;pointer-events:none;z-index:2147483000;border:2px dashed var(--action);border-radius:8px}',
      '.rf-com-vista{position:fixed;left:12px;bottom:12px;z-index:2147483002;width:min(420px,calc(100vw - 24px));max-height:46vh;overflow:auto;padding:14px;color:var(--ink);font-family:var(--body);box-shadow:var(--shadow)}'
    ].join('\n');
    doc.head.appendChild(s2);
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
  /* la fecha llega en UTC; se muestra en la hora de este equipo, como aparece en la hoja */
  function fechaLegible(f) {
    var d = new Date(f);
    if (isNaN(d.getTime())) return String(f || '').slice(0, 16).replace('T', ' ');
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
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
  /* el nombre con el que se ve una pestaña (lo que guarda la hoja), leído con la misma ruta que la app (RF.app.route) */
  function nombrePestana(dir) {
    var R = root.RF || {}, r = R.app && R.app.route ? R.app.route(dir) : { name: 'home' };
    if (r.name === 'home') return 'Mi ruta';
    if (r.name === 'tool') { var tl = R.tools && R.tools[r.id]; return tl && tl.title ? tl.title : r.id; }
    if (r.name === 'fase') { var fa = ((R.data && R.data.FASES) || []).filter(function (x) { return x.id === r.id; })[0]; return fa ? 'Fase ' + fa.n + ': ' + fa.name : r.id; }
    if (r.name === 'tramite') { var tr = R.tramites && R.tramites.byId ? R.tramites.byId[r.id] : null; return tr && tr.title ? tr.title : r.id; }
    return dir;
  }
  /* la pestaña en la que está quien revisa: su nombre («Mi ruta», «Subir el PEA»…) */
  /* la pestaña es la del hash, esté o no abierta la sesión: con la pantalla de entrada también se ven los comentarios de esa pestaña */
  function pantallaActual() { return nombrePestana(root.location.hash || '#/'); }

  /* el comentario general no hace referencia a ninguna pestaña: se guarda y se ve en la pantalla donde se escribió, como antes */
  function direccionActual() { return root.location.hash || '#/'; }
  /* en la hoja, pantalla es el nombre de la pestaña; los comentarios guardados antes llevan la dirección (#/…) y se leen como la misma pestaña */
  function pestanaDeComentario(c) { var p = String(c.pantalla || ''); return p.charAt(0) === '#' ? nombrePestana(p) : p; }
  /* qué comentarios se ven en esta pestaña: los generales por su dirección exacta; pestaña, texto y caja por el nombre de la pestaña */
  function esDeAqui(c) {
    if (c.tipo === 'general') return c.pantalla === direccionActual() || (String(c.pantalla || '').charAt(0) !== '#' && c.pantalla === pantallaActual());
    return pestanaDeComentario(c) === pantallaActual();
  }

  /* ---- red: nunca lanza; si algo falla, se avisa y no se pierde el texto escrito ---- */
  /* trae todos (el filtro de cada pantalla está en esDeAqui). Si falla, reintenta dos veces antes de dar el error */
  function cargar(intento) {
    var n = intento || 0;
    if (!SERVICIO) return Promise.resolve({ ok: false, lista: [] });
    /* si el servicio no responde en 12 segundos, se corta el intento: una descarga colgada no debe dejar «cargando…» para siempre */
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var corte = root.setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    var pedido = root.fetch(SERVICIO, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!j || !Array.isArray(j.comentarios)) throw new Error('RESPUESTA'); return { ok: true, lista: j.comentarios }; });
    return pedido.then(function (res) { root.clearTimeout(corte); return res; }, function (e) { root.clearTimeout(corte); throw e; })
      .catch(function () {
        if (n >= 2) return { ok: false, lista: [] };
        return new Promise(function (res) { root.setTimeout(res, 1500 * (n + 1)); }).then(function () { return cargar(n + 1); });
      });
  }
  function enviar(datos) {
    if (!SERVICIO) return Promise.resolve({ ok: false, error: 'SIN_SERVICIO' });
    return root.fetch(SERVICIO, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ accion: 'agregar' }, datos)) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: 'SIN_CONEXION' }; });
  }

  /* ---- marcas sobre la pantalla: un número en el lugar del comentario, con el mismo número que la lista de esta pantalla.
     Los pines se conservan y solo se mueven: si se volvieran a crear cada vez, el botón se soltaría sobre otro nodo y el clic se perdería. */
  function clavesDe(lista) {
    var usadas = {};
    return lista.map(function (c) {
      var base = [c.pantalla, c.fecha, c.tipo, c.selector, c.nombre].join('|');
      usadas[base] = (usadas[base] || 0) + 1;
      return usadas[base] > 1 ? base + '#' + usadas[base] : base;
    });
  }
  function marcar() {
    var propios = est.comentarios.filter(esDeAqui);
    var claves = clavesDe(propios), vistos = {};
    propios.forEach(function (c, i) {
      if (!c.selector) return;
      var destino = buscar(c.selector), r = destino ? destino.getBoundingClientRect() : null;
      if (!r || (r.width === 0 && r.height === 0)) return;
      var clave = claves[i], pin = est.pinesPorClave[clave];
      if (!pin) {
        pin = el('div', 'rf-com-pin');
        pin.addEventListener('click', function (e) { e.stopPropagation(); mostrarComentario(pin.comentario); });
        est.pinesPorClave[clave] = pin;
        doc.body.appendChild(pin);
      }
      pin.comentario = c;
      if (pin.textContent !== String(i + 1)) pin.textContent = String(i + 1);
      pin.title = etiquetaTipo(c) + ': ' + textoDe(c);
      pin.style.left = (r.left - 10) + 'px';
      pin.style.top = (r.top - 10) + 'px';
      vistos[clave] = true;
    });
    Object.keys(est.pinesPorClave).forEach(function (k) {
      if (vistos[k]) return;
      est.pinesPorClave[k].remove();
      delete est.pinesPorClave[k];
    });
  }
  /* pide la lista (al empezar, al cambiar de pantalla y al abrir el menú o la lista). Si falla, se conserva lo último que llegó */
  function refrescar() {
    est.cargando = true;
    actualizarMenu();
    return cargar(0).then(function (r) {
      est.cargando = false;
      est.fallo = !r.ok;
      if (r.ok) { est.comentarios = r.lista; est.conDatos = true; }
      marcar();
      actualizarMenu();
      if (est.panelTipo === 'lista') pintarLista();
      return r;
    });
  }
  /* el texto de «Ver comentarios»: nunca un 0 mientras no se sabe si llegaron */
  function textoContador() {
    if (!est.conDatos) return 'Ver comentarios (' + (est.fallo ? 'sin conexión' : 'cargando…') + ')';
    return 'Ver comentarios (' + est.comentarios.filter(esDeAqui).length + ')';
  }
  function actualizarMenu() { if (est.botonContador) est.botonContador.textContent = textoContador(); }

  /* ---- paneles ---- */
  function cerrarPanel() { if (est.panel) { est.panel.remove(); est.panel = null; } est.panelTipo = null; }
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
      enviar({ pantalla: tipo === 'general' ? direccionActual() : pantallaActual(), tipo: tipo, cita: cita || '', selector: selector || '', nombre: nombre.value.trim(), texto: t })
        .then(function (r) {
          if (r && r.ok) { cerrarPanel(); aviso('Comentario enviado: «' + (t.length > 140 ? t.slice(0, 140) + '…' : t) + '». Gracias.'); refrescar(); return; }
          enviarBtn.disabled = false;
          estado.textContent = r && r.error === 'SIN_SERVICIO' ? 'El servicio de comentarios todavía no está conectado.' : 'No se pudo enviar (' + ((r && r.error) || 'error') + '). Tu texto sigue aquí; inténtalo de nuevo.';
        });
    }, 'primary small');
    est.panel = el('div', 'card rf-com-panel');
    est.panel.appendChild(el('div', 'rf-com-titulo', tipo === 'general' ? 'Comentario general' : tipo === 'pestana' ? 'Comentario de esta pestaña' : 'Comentario sobre lo que señalaste'));
    if (tipo === 'pestana') est.panel.appendChild(el('div', 'rf-com-meta', 'Pestaña: ' + pantallaActual()));
    if (cita) est.panel.appendChild(el('blockquote', 'rf-com-cita', cita.length > 200 ? cita.slice(0, 200) + '…' : cita));
    est.panel.appendChild(nombre); est.panel.appendChild(texto); est.panel.appendChild(estado);
    var acciones = el('div', 'rf-com-acciones');
    acciones.appendChild(boton('Cancelar', cerrarPanel, 'small'));
    acciones.appendChild(enviarBtn);
    est.panel.appendChild(acciones);
    doc.body.appendChild(est.panel);
    texto.focus();
  }
  /* la lista de esta pantalla: se pinta con lo que hay y se vuelve a pintar cuando llega la descarga */
  function abrirLista() {
    cerrarPanel();
    est.panelTipo = 'lista';
    pintarLista();
    refrescar();
  }
  function pintarLista() {
    if (est.panel) est.panel.remove();
    var propios = est.comentarios.filter(esDeAqui);
    est.panel = el('div', 'card rf-com-panel');
    est.panel.appendChild(el('div', 'rf-com-titulo', est.conDatos ? 'Comentarios de esta pantalla (' + propios.length + ')' : 'Comentarios de esta pantalla'));
    if (!est.conDatos && est.fallo) {
      est.panel.appendChild(el('div', 'rf-com-estado', 'No se pudieron cargar los comentarios. Revisa la conexión e inténtalo de nuevo.'));
      est.panel.appendChild(boton('Reintentar', function () { refrescar(); }, 'primary small'));
    } else if (!est.conDatos) {
      est.panel.appendChild(el('div', 'rf-com-cuerpo', 'Cargando comentarios…'));
    } else if (est.fallo) {
      est.panel.appendChild(el('div', 'rf-com-estado', 'No se pudo actualizar; se muestran los últimos comentarios cargados.'));
    }
    if (est.conDatos && !propios.length) est.panel.appendChild(el('div', 'rf-com-cuerpo', 'Todavía no hay comentarios aquí. Usa "Dejar un comentario" para ser el primero.'));
    propios.forEach(function (c, i) {
      /* toda la tarjeta muestra lo comentado al tocarla (o con Enter), no solo el botón */
      var item = el('div', 'rf-com-item');
      item.tabIndex = 0;
      item.title = 'Mostrar lo comentado en la pantalla';
      item.appendChild(el('div', 'rf-com-chip', etiquetaTipo(c)));
      item.appendChild(el('div', 'rf-com-meta', (i + 1) + '. ' + (c.nombre || 'Sin nombre') + ' · ' + fechaLegible(c.fecha)));
      if (c.cita) item.appendChild(el('blockquote', 'rf-com-cita', String(c.cita).slice(0, 300)));
      item.appendChild(el('div', 'rf-com-cuerpo', textoDe(c)));
      item.appendChild(boton('Mostrar lo comentado', function () { mostrarComentario(c); }, 'primary small'));
      item.addEventListener('click', function () { mostrarComentario(c); });
      item.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target === item) mostrarComentario(c); });
      est.panel.appendChild(item);
    });
    est.panel.appendChild(el('div', 'rf-com-meta', 'Recibidos del servicio: ' + (est.conDatos ? est.comentarios.length : 'ninguno todavía') + ' · versión de revisión ' + VERSION_REVISION));
    var acciones = el('div', 'rf-com-acciones');
    acciones.appendChild(boton('Cerrar', cerrarPanel, 'small'));
    est.panel.appendChild(acciones);
    doc.body.appendChild(est.panel);
  }

  /* ---- qué se comentó: el tipo, y el texto exacto, el cuadro o toda la pantalla, para volver a mostrarlo ---- */
  function tipoDe(c) { return c.tipo === 'texto' || c.tipo === 'general' || c.tipo === 'pestana' ? c.tipo : 'elemento'; }
  /* lo que se comentó, en palabras de quien revisa: un texto, una caja, toda la pantalla o la pestaña entera */
  function etiquetaTipo(c) {
    var tipo = tipoDe(c);
    if (tipo === 'texto') return 'Texto';
    if (tipo === 'general') return 'Toda la pantalla';
    if (tipo === 'pestana') return 'Esta pestaña';
    return 'Caja';
  }
  /* el texto sin espacios repetidos y, para cada carácter, su posición en el texto original */
  function normalizarTexto(crudo) {
    var out = '', pos = [], espacio = true;
    for (var i = 0; i < crudo.length; i++) {
      var ch = crudo.charAt(i);
      if (/\s/.test(ch)) { if (!espacio) { out += ' '; pos.push(i); espacio = true; } continue; }
      out += ch; pos.push(i); espacio = false;
    }
    return { texto: out, pos: pos };
  }
  function posicionEnNodos(nodos, i) {
    for (var k = nodos.length - 1; k >= 0; k--) {
      if (i >= nodos[k].inicio) return { nodo: nodos[k].nodo, off: Math.min(i - nodos[k].inicio, nodos[k].nodo.nodeValue.length) };
    }
    return null;
  }
  /* el rango exacto de la cita dentro de «raiz» (sin distinguir espacios repetidos); null si no aparece */
  function rangoDeTexto(raiz, cita) {
    var q = String(cita || '').replace(/\s+/g, ' ').trim();
    if (!raiz || !q) return null;
    var nodos = [], crudo = '';
    var recorrido = doc.createTreeWalker(raiz, root.NodeFilter.SHOW_TEXT, null);
    for (var nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
      var padre = nodo.parentElement;
      if (padre && /^(SCRIPT|STYLE|NOSCRIPT)$/.test(padre.tagName)) continue;
      if (dentroDeLaInterfaz(padre)) continue;
      nodos.push({ nodo: nodo, inicio: crudo.length });
      crudo += nodo.nodeValue;
    }
    var n = normalizarTexto(crudo), largo = q.length, pos = n.texto.indexOf(q);
    if (pos < 0 && q.length > 40) { largo = 40; pos = n.texto.indexOf(q.slice(0, 40)); }
    if (pos < 0) return null;
    var a = posicionEnNodos(nodos, n.pos[pos]), b = posicionEnNodos(nodos, n.pos[pos + largo - 1] + 1);
    if (!a || !b) return null;
    var rango = doc.createRange();
    rango.setStart(a.nodo, a.off);
    rango.setEnd(b.nodo, b.off);
    return rango;
  }
  function dibujarCajas(rects, clase) {
    Array.prototype.forEach.call(rects, function (r) {
      if (!r || (r.width === 0 && r.height === 0)) return;
      var m = el('div', clase);
      m.style.left = r.left + 'px'; m.style.top = r.top + 'px';
      m.style.width = r.width + 'px'; m.style.height = r.height + 'px';
      doc.body.appendChild(m);
      est.marcas.push(m);
    });
  }
  function quitarMarcas() {
    est.marcas.forEach(function (m) { m.remove(); });
    est.marcas = [];
    if (est.vista) { est.vista.remove(); est.vista = null; }
    est.activo = null;
  }
  /* al mover la pantalla, la marca sigue el mismo lugar del comentario */
  function repintarMarca() {
    var a = est.activo;
    if (!a || !a.marcada) return;
    est.marcas.forEach(function (m) { m.remove(); });
    est.marcas = [];
    if (a.rango) dibujarCajas(a.rango.getClientRects(), 'rf-com-marca');
    else if (a.elemento && a.elemento.isConnected) dibujarCajas([a.elemento.getBoundingClientRect()], a.modo === 'general' || a.modo === 'pestana' ? 'rf-com-area' : 'rf-com-caja');
  }
  /* la pestaña entera no se marca sola: solo si quien revisa lo pide (mismo recuadro que el comentario general) */
  function marcarPestana() {
    if (!est.activo) return;
    est.activo.elemento = doc.getElementById('main') || doc.body;
    est.activo.marcada = true;
    est.marcas.forEach(function (m) { m.remove(); });
    est.marcas = [];
    dibujarCajas([est.activo.elemento.getBoundingClientRect()], 'rf-com-area');
    mostrarVista(est.activo.comentario, '');
  }
  function mostrarVista(c, avisoLugar) {
    if (est.vista) est.vista.remove();
    est.vista = el('div', 'card rf-com-vista');
    est.vista.appendChild(el('div', 'rf-com-chip', etiquetaTipo(c)));
    est.vista.appendChild(el('div', 'rf-com-meta', (c.nombre || 'Sin nombre') + ' · ' + fechaLegible(c.fecha)));
    if (c.cita) est.vista.appendChild(el('blockquote', 'rf-com-cita', String(c.cita)));
    est.vista.appendChild(el('div', 'rf-com-cuerpo', textoDe(c)));
    if (avisoLugar) est.vista.appendChild(el('div', 'rf-com-estado', avisoLugar));
    var acciones = el('div', 'rf-com-acciones');
    acciones.appendChild(boton('Ver lista', abrirLista, 'ghost small'));
    if (est.activo && est.activo.modo === 'pestana' && !est.activo.marcada) acciones.appendChild(boton('Marcar la pestaña', marcarPestana, 'ghost small'));
    acciones.appendChild(boton('Quitar resaltado', quitarMarcas, 'small'));
    est.vista.appendChild(acciones);
    doc.body.appendChild(est.vista);
  }
  /* muestra en la pantalla lo que se comentó: el texto exacto, el cuadro o toda la pantalla, con su comentario al lado */
  function mostrarComentario(c) {
    cerrarPanel();
    cerrarMenu();
    quitarMarcas();
    var tipo = tipoDe(c), rango = null, elemento = null, aviso = '';
    /* la pestaña entera no se marca sola: se ve el comentario y la marca se pone solo si quien revisa la pide */
    if (tipo === 'pestana') { est.activo = { comentario: c, rango: null, elemento: null, modo: tipo, marcada: false }; mostrarVista(c, ''); return; }
    if (tipo === 'general') {
      elemento = doc.getElementById('main') || doc.body;
    } else {
      elemento = buscar(c.selector);
      if (tipo === 'texto') rango = rangoDeTexto(elemento || doc.body, c.cita) || (elemento ? rangoDeTexto(doc.body, c.cita) : null);
      if (!rango && !elemento) { elemento = doc.getElementById('main') || doc.body; aviso = 'No encontré ese lugar en la pantalla de ahora; se marca toda la pantalla.'; }
      else if (!rango && tipo === 'texto') aviso = 'No encontré el texto exacto; se marca el bloque donde se comentó.';
    }
    est.activo = { comentario: c, rango: rango, elemento: elemento, modo: tipo, marcada: true };
    if (rango) dibujarCajas(rango.getClientRects(), 'rf-com-marca');
    else dibujarCajas([elemento.getBoundingClientRect()], tipo === 'general' || aviso ? 'rf-com-area' : 'rf-com-caja');
    var donde = rango ? rango.startContainer : elemento;
    var visible = donde && donde.nodeType === 3 ? donde.parentElement : donde;
    if (visible && visible.scrollIntoView) visible.scrollIntoView({ block: 'center', behavior: 'smooth' });
    mostrarVista(c, aviso);
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
  function cerrarMenu() { if (est.menu) { est.menu.remove(); est.menu = null; } est.botonContador = null; }
  function abrirMenu() {
    if (est.menu) { cerrarMenu(); return; }
    est.menu = el('div', 'card rf-com-menu');
    est.menu.appendChild(boton('Comentario general', function () { cerrarMenu(); abrirPanel('general', '', ''); }, 'ghost small rf-com-op'));
    est.menu.appendChild(boton('Comentario de esta pestaña', function () { cerrarMenu(); abrirPanel('pestana', '', ''); }, 'ghost small rf-com-op'));
    est.menu.appendChild(boton('Seleccionar algo de la pantalla', entrarEnSeleccion, 'ghost small rf-com-op'));
    est.botonContador = boton(textoContador(), function () { cerrarMenu(); abrirLista(); }, 'ghost small rf-com-op');
    est.menu.appendChild(est.botonContador);
    est.principal.appendChild(est.menu);
    refrescar();
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
      if (e.key === 'Escape') { salirDeSeleccion(); cerrarMenu(); cerrarPanel(); quitarMarcas(); }
    });
    doc.addEventListener('click', function (e) {
      if (est.menu && !dentroDeLaInterfaz(e.target)) cerrarMenu();
    });
    root.addEventListener('hashchange', function () { cerrarPanel(); salirDeSeleccion(); quitarMarcas(); refrescar(); posicionar(); });
    root.addEventListener('scroll', function () { marcar(); repintarMarca(); }, true);
    root.addEventListener('resize', function () { marcar(); repintarMarca(); posicionar(); });
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
  root.RF_COMENTARIOS = { cargar: function () { return cargar(0).then(function (r) { return r.lista; }); }, enviar: enviar, rutaCss: rutaCss, textoDe: textoDe, comentarios: function () { return est.comentarios.slice(); } };
})(typeof window !== 'undefined' ? window : globalThis);
