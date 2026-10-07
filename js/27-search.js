/* Rinde Fácil — buscador de toda la app.
 * Busca en trámites (con cada paso), herramientas (con los nombres de sus campos y secciones), el mapa «quién hace qué», cuentas,
 * tipos de documento, respaldos, reglas del Manual y también en los datos de la persona (gastos, actividades, proveedores…).
 * Cada resultado dice dónde está, como en la configuración de un navegador: «Herramientas → Rendir → Gastos y rendición».
 * Sin tildes ni mayúsculas: «gasto» encuentra «Gastos y rendición». Este archivo no toca la pantalla: solo arma y ordena resultados. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, D = RF.data;

  /* ---------- texto sin tildes, misma longitud que el original (sirve para marcar la coincidencia) ---------- */
  function normChar(c) {
    var n = c.normalize ? c.normalize('NFD').replace(/[̀-ͯ]/g, '') : c;
    var lo = n.toLowerCase();
    return lo.length === 1 ? lo : c;
  }
  function norm(s) { s = String(s == null ? '' : s); var o = ''; for (var i = 0; i < s.length; i++) o += normChar(s.charAt(i)); return o; }
  function tokens(q) {
    var seen = {}, out = [];
    norm(q).split(/[\s,;]+/).forEach(function (t) { if (t && !seen[t]) { seen[t] = true; out.push(t); } });
    return out;
  }
  /* partes de un texto marcando las coincidencias: [{t, m}] */
  function mark(text, toks) {
    text = String(text == null ? '' : text);
    var n = norm(text), flags = new Array(text.length);
    toks.forEach(function (t) { if (!t) return; var i = n.indexOf(t); while (i >= 0) { for (var k = i; k < i + t.length; k++) flags[k] = true; i = n.indexOf(t, i + t.length); } });
    var out = [], cur = null;
    for (var i2 = 0; i2 < text.length; i2++) {
      var m = !!flags[i2];
      if (!cur || cur.m !== m) { cur = { t: '', m: m }; out.push(cur); }
      cur.t += text.charAt(i2);
    }
    return out;
  }
  function excerpt(text, toks) {
    text = String(text || '');
    var n = norm(text), first = -1;
    toks.forEach(function (t) { var i = n.indexOf(t); if (i >= 0 && (first < 0 || i < first)) first = i; });
    if (first < 0) return null;
    var s = Math.max(0, first - 45), e = Math.min(text.length, first + 95);
    if (s > 0) { var sp = text.indexOf(' ', s); if (sp >= 0 && sp < first) s = sp + 1; }
    var piece = text.slice(s, e);
    return (s > 0 ? '…' : '') + piece + (e < text.length ? '…' : '');
  }

  /* ---------- puntaje ---------- */
  function scoreItem(item, toks) {
    var title = item._t || (item._t = norm(item.title)), path = item._p || (item._p = norm((item.path || []).join(' ')));
    var fields = item._f || (item._f = (item.fields || []).map(function (f) { return { n: norm(f.text), kw: !!f.kw, f: f }; }));
    var total = 0, bestField = null, bestFieldScore = -1;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], s = 0;
      var ti = title.indexOf(t);
      if (ti === 0) s = Math.max(s, 60); else if (ti > 0) s = Math.max(s, /[\s·:(«]/.test(title.charAt(ti - 1)) ? 50 : 35);
      if (path.indexOf(t) >= 0) s = Math.max(s, 18);
      for (var j = 0; j < fields.length; j++) {
        var fi = fields[j].n.indexOf(t);
        if (fi >= 0) {
          var fs = fields[j].kw ? 24 : 10;
          if (fs > s) s = fs;
          if (fs > bestFieldScore) { bestFieldScore = fs; bestField = fields[j].f; }
        }
      }
      if (!s) return null; /* todas las palabras tienen que aparecer en algún lugar */
      total += s;
    }
    var phrase = toks.join(' ');
    if (toks.length > 1 && title.indexOf(phrase) >= 0) total += 40;
    if (title === toks[0] && toks.length === 1) total += 30;
    total += item.boost || 0;
    return { score: total, field: bestField };
  }
  /* devuelve [{ item, score, titleSegs, snippetSegs, snippetLabel }] */
  function rank(items, query, limit) {
    var toks = tokens(query);
    if (!toks.length) return [];
    var out = [];
    items.forEach(function (it) {
      var r = scoreItem(it, toks);
      if (!r) return;
      var sn = null, label = '';
      if (r.field) {
        /* si la coincidencia está en el título no hace falta mostrar un fragmento */
        var inTitle = toks.every(function (t) { return norm(it.title).indexOf(t) >= 0; });
        if (!inTitle) { var ex = excerpt(r.field.text, toks); if (ex) { sn = mark(ex, toks); label = r.field.label || ''; } }
      }
      out.push({ item: it, score: r.score, titleSegs: mark(it.title, toks), snippetSegs: sn, snippetLabel: label });
    });
    out.sort(function (a, b) { return b.score - a.score || (a.item.title < b.item.title ? -1 : 1); });
    return limit ? out.slice(0, limit) : out;
  }

  /* ---------- lo que hay en la app (no cambia mientras se usa) ---------- */
  var EXTRA = {
    proyecto: ['Datos del proyecto', 'Código del proyecto', 'Presupuesto aprobado', 'Fecha de inicio y de término', 'Primer desembolso', 'Nombre de la comunidad', 'RUT de la comunidad', 'Representante legal', 'Situación de IVA', 'Crear otro proyecto', 'Varios proyectos', 'Mi comunidad'],
    gantt: ['Etapas', 'Actividades', 'Meses', 'Fechas de inicio y término', 'Excel', 'Copiar para SGP', 'Guardar en Drive'],
    presupuesto: ['Líneas por cuenta', 'Recursos humanos', 'Gastos operacionales', 'Inversión', 'Administración', 'Presupuesto aprobado', 'Supera lo aprobado', 'Copiar para SGP'],
    pea: ['Plan Estratégico Anual', 'PEA general', 'PEA por proyecto', 'Todo el PEA en un solo documento', 'Plazo de 90 días', 'Prórroga de 30 días'],
    reitem: ['Reitemización', 'Mover plata entre cuentas', 'Motivo del cambio', 'Cambio de presupuesto'],
    cotizaciones: ['Cotizaciones', 'Cuadro comparativo', 'Sobre $10.000.000 netos', 'Dos proveedores distintos', 'Autorización previa de CORFO', 'Servicio técnico-profesional'],
    gastos: ['Subir foto o PDF', 'Sacar foto al comprobante', 'Anotar a mano', 'Leer con la nube (OCR)', 'Boleta', 'Factura', 'Boleta de honorarios', 'Monto neto', 'IVA', 'Total del documento', 'Monto a rendir', 'Glosa', 'Viático', 'Pago en efectivo', 'Comparé cada dato con el documento original', 'Rendición en formato SGP', 'Carpeta de respaldos por gasto', 'Gastos por cuenta', 'Proveedor', 'RUT del proveedor', 'Número (folio)', 'Foto del comprobante'],
    revision: ['Cuadre entre trámites', 'Qué falta', 'Arreglar', 'Diferencias entre anexos y gastos', 'Fases saltadas', 'Si los números cuadran'],
    resumen: ['Resumen por cuentas', 'Rendido y presupuestado', 'Totales por cuenta'],
    observaciones: ['Observaciones de CORFO', '10 días hábiles', 'Aclarar las observaciones', 'Plazo para responder', 'Por única vez'],
    plazos: ['Plazos', 'Días hábiles', 'Feriados', 'PEA de 90 días', 'Aclarar observaciones'],
    verificador: ['¿Se puede pagar esto?', 'Verificar un gasto'],
    cuentas: ['¿En qué cuenta va?', 'Recursos humanos', 'Gastos operacionales', 'Inversión', 'Administración'],
    obras: ['Permisos y fotos de obras', 'Fotos y permisos de construcciones y activos, aparte de las boletas'],
    viaje: ['Registro del viaje', 'Quién viaja, su rol y por qué es necesario'],
    historial: ['Historial de cambios', 'Quién hizo qué y cuándo'],
    f29: ['Formulario 29, F29, IVA mensual', 'Sube el F29 de cada mes y compáralo con tus facturas'],
    nofinanciable: ['Gastos no financiables', 'Lo que no se puede pagar con el aporte'],
    necesidades: ['Qué necesitará tu proyecto', 'Sueldos', 'Honorarios', 'Insumos', 'Viáticos', 'Inmuebles', 'Pagos en efectivo', 'Mi PEA ya está aprobado', 'Agregar algo que no estaba en el PEA', 'Trámites que te tocan'],
    documentos: ['Subir un documento', 'PEA corregido por CORFO', 'Acta de No Objeción', 'Acta de asamblea', 'Resolución u oficio', 'Observaciones de CORFO', '¿Cambia el PEA?', 'Cambios al PEA: qué falta hacer', 'Trazabilidad', 'Registro de documentos'],
    actas: ['Mesa de Trabajo', 'Acta firmada', 'Asistentes de CORFO, la comunidad y el Organismo Colaborador', 'Acuerdos y compromisos', 'Compromisos pendientes', 'Estado del acta', 'Revisada por CORFO'],
    seguridad: ['Contraseña', 'Cambiar la contraseña', 'Código de recuperación', 'Bloquear', 'Cerrar sesión', 'Quién entró al servicio', 'Registro de accesos', 'Cifrado', 'Inactividad', 'Borrar los datos de este equipo'],
    calendario: ['Calendario', 'Fechas', 'Plazos', 'Recordatorios', 'Agenda', 'Google Calendar', 'Agregar una fecha', 'Próximas fechas'],
    nube: ['Dirección del servicio', 'Código de instalación', 'Crear la cuenta del servicio', 'Combinar las copias', 'Probar conexión', 'Guardar copia en la nube', 'Traer la copia de la nube', 'Carpeta Rinde fácil en tu Drive', 'Descargar copia', 'Cargar una copia', 'Borrar todo', 'Google Drive', 'Google Cloud Vision', 'Lectura automática de fotos']
  };
  var REGLAS = [
    { t: 'Cotizaciones: sobre $10.000.000 netos se piden 2 cotizaciones de proveedores distintos', d: 'Manual, p. 8. Salvo servicios técnico-profesionales; requiere autorización previa de CORFO.', tool: 'cotizaciones' },
    { t: 'Gastos de administración: hasta $3.000.000 al mes', d: 'Manual, p. 20. Los gastos compartidos se reparten con el Anexo 5.', tool: 'cuentas' },
    { t: 'Glosa del gasto: máximo 200 caracteres', d: 'SGP no acepta más. La app avisa al llegar a 180.', tool: 'gastos' },
    { t: 'PEA: 90 días corridos desde el primer desembolso y una prórroga única de 30', d: 'Flujograma, paso 8. La prórroga se pide con solicitud fundada antes de que venza.', tool: 'plazos' },
    { t: 'Aclarar observaciones de la rendición: 10 días hábiles, por única vez', d: 'Manual, p. 10. El plazo se cuenta desde que CORFO comunica las observaciones.', tool: 'observaciones' },
    { t: 'IVA de 19 % y diferencia permitida de $1 por redondeo', d: 'Si la comunidad recupera el IVA, se rinde el neto; si no, el total.', tool: 'gastos' },
    { t: 'Pasajes: comprarlos con 15 días de anticipación', d: 'Manual, p. 15.', tool: 'gastos' },
    { t: 'Pago en efectivo: pide el Anexo 3', d: 'Declaración de gasto en efectivo.', tool: 'anexo3' },
    { t: 'Viáticos: certificado de viático (Anexo 4)', d: 'Los días y montos se calculan en la app.', tool: 'anexo4' }
  ];

  var staticCache = null;
  function toolPath(tid) {
    var groups = (RF.views && RF.views.TOOL_GROUPS) || [];
    for (var i = 0; i < groups.length; i++) if (groups[i].tools.indexOf(tid) >= 0) return ['Herramientas', groups[i].name];
    return [];
  }
  function toolTitle(tid) { return RF.tools && RF.tools[tid] ? RF.tools[tid].title : tid; }
  function actorName(id) { var a = (D.ACTORS || []).filter(function (x) { return x.id === id; })[0]; return a ? a.name : id; }

  function buildStatic() {
    var items = [], byId = RF.tramites ? RF.tramites.byId : {};
    /* fases */
    D.FASES.forEach(function (f) {
      items.push({ kind: 'Fase', title: 'Fase ' + f.n + ': ' + f.name, path: ['Mi ruta'], fields: [{ text: f.blurb }], href: '#/f/' + f.id, boost: 4 });
      f.items.forEach(function (id) { addTramite(byId[id], ['Mi ruta', 'Fase ' + f.n + ' · ' + f.name]); });
    });
    D.AYUDA.forEach(function (id) { addTramite(byId[id], ['¿Tienes una duda?']); });
    function addTramite(t, path) {
      if (!t) return;
      var fields = [{ text: t.why, label: 'Por qué' }, { text: 'Quién: ' + actorName(t.who), label: '' }, { text: 'Cuándo: ' + (t.when || ''), label: '' }];
      (t.need || []).forEach(function (n) { fields.push({ text: n, label: 'Necesitas' }); });
      (t.notes || []).forEach(function (s) { fields.push({ text: typeof s === 'string' ? s : s.t, label: 'Ten en cuenta' }); });
      (t.steps || []).forEach(function (s, i) { fields.push({ text: s, label: 'Paso ' + (i + 1) }); });
      (t.src || []).forEach(function (s) { fields.push({ text: s, label: 'Fuente' }); });
      items.push({ kind: t.kind === 'paso' ? 'Paso' : 'Trámite', title: t.title, path: path, fields: fields, href: '#/t/' + t.id, boost: 8 });
    }
    /* herramientas */
    var seen = {};
    ((RF.views && RF.views.TOOL_GROUPS) || []).forEach(function (g) {
      g.tools.forEach(function (tid) { addTool(tid, ['Herramientas', g.name]); });
    });
    addTool('nube', []);
    addTool('calendario', []);
    addTool('seguridad', []);
    function addTool(tid, path) {
      var tl = RF.tools && RF.tools[tid]; if (!tl || seen[tid]) return; seen[tid] = true;
      var fields = [{ text: tl.desc || '', label: '' }];
      (EXTRA[tid] || []).forEach(function (w) { fields.push({ text: w, kw: true, label: 'Sección o campo' }); });
      var sc = RF.forms && RF.forms.SCHEMAS && RF.forms.SCHEMAS[tid];
      if (sc) (sc.fields || []).forEach(function (fl) { if (fl.l) fields.push({ text: fl.l, kw: true, label: 'Campo' }); });
      items.push({ kind: 'Herramienta', title: tl.title, path: path, fields: fields, href: '#/h/' + tid, boost: 14 });
    }
    /* mapa: quién hace qué */
    (D.FLOW_BLOCKS || []).forEach(function (b) {
      var fa = D.FASES.filter(function (x) { return x.id === b.fase; })[0];
      b.ids.forEach(function (sid) {
        var s = D.FLOW[sid]; if (!s) return;
        var fields = [{ text: s[2], label: '' }];
        if (s[3]) fields.push({ text: 'Plazo: ' + s[3], label: '' });
        if (s[4]) fields.push({ text: s[4], label: '' });
        if (s[5]) fields.push({ text: s[5], label: '' });
        items.push({ kind: 'Mapa', title: (/^D/.test(sid) ? 'Decisión' : 'Paso ' + sid) + ': ' + s[1], path: ['Quién hace qué', fa ? 'Fase ' + fa.n + ' · ' + fa.name : '', actorName(s[0])].filter(Boolean), fields: fields, href: '#/f/' + b.fase });
      });
    });
    /* cuentas, documentos, respaldos, reglas */
    var cuentasPath = toolPath('cuentas').concat([toolTitle('cuentas')]);
    (D.CUENTAS || []).forEach(function (c) { items.push({ kind: 'Cuenta', title: c.name, path: cuentasPath, fields: [{ text: c.desc }, { text: 'Ejemplos: ' + c.ej }, { text: c.sgp, label: 'En SGP' }], href: '#/h/cuentas', boost: 6 }); });
    var docPath = toolPath('gastos').concat([toolTitle('gastos'), 'Tipo de documento']);
    (D.DOC_TYPES || []).forEach(function (d) {
      var f = (d.extras || []).map(function (x) { return { text: (D.RESPALDOS || {})[x] || x, label: 'Pide' }; });
      items.push({ kind: 'Documento', title: d.name, path: docPath, fields: f, href: '#/h/gastos' });
    });
    var resPath = toolPath('gastos').concat([toolTitle('gastos'), 'Respaldos que pide el Manual']);
    Object.keys(D.RESPALDOS || {}).forEach(function (k) { items.push({ kind: 'Respaldo', title: D.RESPALDOS[k], path: resPath, fields: [], href: '#/h/gastos' }); });
    REGLAS.forEach(function (r) { items.push({ kind: 'Regla', title: r.t, path: ['Reglas del Manual'], fields: [{ text: r.d }], href: '#/h/' + r.tool, boost: 5 }); });
    items.push({ kind: 'Inicio', title: 'Mi ruta: dónde voy y qué sigue', path: ['Inicio'], fields: [{ text: 'Avance, siguiente paso, diagrama de quién hace qué y cuadre entre trámites.', kw: true }, { text: 'Inicio', kw: true }], href: '#/', boost: 6 });
    return items;
  }

  /* ---------- lo que la persona ha escrito en la app (cambia; se arma cada vez) ---------- */
  function strings(o, max) {
    var out = [];
    Object.keys(o || {}).forEach(function (k) { var v = o[k]; if (typeof v === 'string' && v && k !== 'id' && k.charAt(0) !== '_') out.push(v); else if (typeof v === 'number' && k !== 'createdAt') out.push(String(v)); });
    var s = out.join(' · '); return max ? s.slice(0, max) : s;
  }
  function buildUser() {
    var items = [], s = RF.store ? RF.store.get() : null; if (!s) return items;
    var com = s.community || {};
    var comText = strings(com);
    if (comText) items.push({ kind: 'Tus datos', title: com.name || 'Mi comunidad', path: ['Tus datos', 'Comunidad'], fields: [{ text: comText }], href: '#/h/proyecto' });
    (s.projects || []).forEach(function (p) {
      var open = function () { RF.store.update(function (st) { st.activeProjectId = p.id; }, { silent: true }); };
      var base = ['Tus datos', p.name || 'Proyecto'];
      items.push({ kind: 'Tus datos', title: p.name || 'Proyecto sin nombre', path: ['Tus datos', 'Proyectos'], fields: [{ text: strings({ code: p.code, notes: p.notes }) }], href: '#/h/proyecto', open: open });
      (p.expenses || []).forEach(function (e) {
        var t = (e.proveedor || 'Gasto sin proveedor') + (e.folio ? ' N° ' + e.folio : '');
        var fields = [{ text: e.glosa || '', label: 'Glosa' }, { text: e.nombreComercial || '', label: 'Local' }, { text: e.item || '', label: 'Ítem' }, { text: e.rutProveedor || '', label: 'RUT' }, { text: e.fecha || '', label: 'Fecha' }, { text: String(e.total || '') + ' ' + (e.total ? U.fmtCLP(e.total) : ''), label: 'Total' }, { text: (RF.data.DOC_BY_ID[e.docType] || {}).name || '', label: 'Documento' }];
        items.push({ kind: 'Tu gasto', title: t, path: base.concat(['Gastos y rendición']), fields: fields, href: '#/h/gastos', open: function () { open(); if (RF.app) RF.app.pendingEdit = e.id; } });
      });
      var acts = []; try { acts = RF.logic.allActivities(p) || []; } catch (er) { acts = []; }
      acts.forEach(function (a) { if (a.act && a.act.name) items.push({ kind: 'Tu actividad', title: a.act.name, path: base.concat(['Carta Gantt']), fields: [{ text: strings(a.act, 300) }], href: '#/h/gantt', open: open }); });
      var gen = function (arr, kind, sub, tool) { (arr || []).forEach(function (o) { var t = o.name || o.proveedor || o.title || o.nombre || o.texto || o.item || o.motivo || ''; var txt = strings(o, 400); if (t || txt) items.push({ kind: kind, title: String(t || txt).slice(0, 80), path: base.concat([sub]), fields: [{ text: txt }], href: '#/h/' + tool, open: open }); }); };
      gen(p.budgetLines, 'Tu presupuesto', 'Presupuesto', 'presupuesto');
      gen(p.observations, 'Tu observación', 'Observaciones', 'observaciones');
      gen(p.cotizaciones, 'Tu cotización', 'Cotizaciones', 'cotizaciones');
    });
    return items;
  }

  /* frases comunes → palabras que sí están en la app */
  var INTENTS = [
    [/(subir|sacar|tomar|cargar|mandar|mandar).*(foto|boleta|factura|comprobante|pdf)|leer.*(foto|boleta)/, 'subir foto'],
    [/cuenta (bancaria|corriente|del banco)|banco|chequera/, 'cuenta corriente'],
    [/(pagar|pago|pagarle).*(sueldo|honorario|trabajador|persona)|contratar/, 'sueldos honorarios'],
    [/(donde|dónde|como|cómo).*(guard|respald|copia)|perder.*(dato|todo)|guardar mis datos/, 'copia nube'],
    [/(olvide|olvidé|perdi|perdí|no recuerdo).*(clave|contrasena|contraseña)|cambiar.*(clave|contrasena|contraseña)|clave/, 'contraseña'],
    [/cuanto tiempo|cuándo vence|cuando vence|hasta cuando|hasta cuándo|fecha limite|fecha límite|me quedan/, 'plazo'],
    [/recordar|recordatorio|agenda|aviso de fecha|no olvidar/, 'calendario'],
    [/duda|ayuda|no se que hacer|no sé qué hacer|no entiendo|preguntar/, 'duda consulta'],
    [/firma(r)?.*convenio|convenio/, 'convenio'],
    [/viaje|pasaje|hospedaje|alojamiento|bencina|combustible|vi[aá]tico/, 'viáticos'],
    [/efectivo|plata en mano|billete/, 'efectivo'],
    [/sueldo|liquidaci/, 'sueldos'],
    [/iva|impuesto/, 'iva']
  ];
  var STOP = { a: 1, al: 1, algo: 1, como: 1, con: 1, cual: 1, de: 1, del: 1, donde: 1, el: 1, en: 1, es: 1, esta: 1, esto: 1, hacer: 1, la: 1, las: 1, lo: 1, los: 1, me: 1, mi: 1, mis: 1, no: 1, para: 1, por: 1, puedo: 1, que: 1, quiero: 1, se: 1, si: 1, su: 1, sus: 1, necesito: 1, tengo: 1, un: 1, una: 1, uno: 1, unos: 1, unas: 1, y: 1 };
  function interpret(query) {
    var n = norm(query), extra = [];
    INTENTS.forEach(function (it) { if (it[0].test(n)) extra.push(it[1]); });
    var words = tokens(query).filter(function (t) { return !STOP[t]; });
    return { extra: extra, words: words };
  }
  function search(query, limit) {
    if (!staticCache) staticCache = buildStatic();
    var pool = staticCache.concat(buildUser()), lim = limit || 40;
    var direct = rank(pool, query, lim);
    if (direct.length || tokens(query).length < 2) return direct;
    /* sin resultados exactos: se prueba sin las palabras de relleno y con lo que la frase quiere decir */
    var it = interpret(query), tried = [];
    if (!it.extra.length && it.words.length === tokens(query).length) return direct; /* una búsqueda exacta sin resultados sigue sin resultados */
    var attempts = [];
    if (it.words.length && it.words.join(' ') !== norm(query)) attempts.push(it.words.join(' '));
    it.extra.forEach(function (e) { attempts.push(e); });
    var merged = {}, order = [];
    attempts.forEach(function (q) {
      if (tried.indexOf(q) >= 0) return; tried.push(q);
      rank(pool, q, lim).forEach(function (r, i) { var k = r.item.href + '|' + r.item.title; if (!merged[k]) { merged[k] = r; order.push(k); } });
    });
    if (!order.length) { /* última salida: cada palabra por separado */
      it.words.filter(function (w) { return w.length >= 4; }).forEach(function (w) { rank(pool, w, lim).slice(0, 8).forEach(function (r) { var k = r.item.href + '|' + r.item.title; if (!merged[k]) { merged[k] = r; order.push(k); } }); });
    }
    return order.map(function (k) { return merged[k]; }).slice(0, lim);
  }
  function resetIndex() { staticCache = null; }

  RF.search = { norm: norm, tokens: tokens, mark: mark, excerpt: excerpt, rank: rank, search: search, buildStatic: buildStatic, buildUser: buildUser, resetIndex: resetIndex };
})(typeof window !== 'undefined' ? window : globalThis);
