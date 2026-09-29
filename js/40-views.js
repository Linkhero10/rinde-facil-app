/* Rinde Fácil — pantallas: inicio, fase, trámite y armazón (menú lateral en acordeón). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, D = RF.data, L = RF.logic, h = U.h;
  var ORDER = [].concat.apply([], D.FASES.map(function (f) { return f.items; })).concat(D.AYUDA);
  var faseOf = {}; D.FASES.forEach(function (f) { f.items.forEach(function (id) { faseOf[id] = f.id; }); }); D.AYUDA.forEach(function (id) { faseOf[id] = 'AY'; });
  var ACTOR = {}; D.ACTORS.forEach(function (a) { ACTOR[a.id] = a; });

  function project() { return RF.store.project(); }
  function fase(id) { return D.FASES.filter(function (f) { return f.id === id; })[0]; }
  function toolTitle(id) { var t = RF.tools[id]; return t ? t.title : id; }

  /* ---------- menú lateral ---------- */
  var TOOL_GROUPS = [
    { id: 'G-plan', name: 'Planificar', tools: ['necesidades', 'proyecto', 'gantt', 'presupuesto', 'pea', 'reitem', 'cotizaciones'] },
    { id: 'G-rend', name: 'Rendir', tools: ['gastos', 'revision', 'resumen', 'observaciones'] },
    { id: 'G-form', name: 'Anexos y formularios', tools: ['anexo1', 'anexo2', 'anexo3', 'anexo4', 'anexo5', 'informe', 'consulta', 'solicitud'] },
    { id: 'G-doc', name: 'Documentos y actas', tools: ['documentos', 'actas'] },
    { id: 'G-ayu', name: 'Ayudas', tools: ['plazos', 'verificador', 'cuentas', 'nofinanciable'] }
  ];
  function isOpen(key, dflt) { var o = RF.store.get().ui.open; return o[key] == null ? !!dflt : !!o[key]; }
  function setOpen(key, v) { RF.store.update(function (s) { s.ui.open[key] = v; }, { silent: true }); }

  function accordion(key, title, sub, kids, opts) {
    opts = opts || {};
    var open = isOpen(key, opts.open), body = h('div', { class: 'acc-body', id: 'acc-' + key }, kids);
    var btn = h('button', { type: 'button', class: 'acc-head' + (opts.cls ? ' ' + opts.cls : ''), 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'acc-' + key },
      opts.badge ? h('span', { class: 'acc-n' }, opts.badge) : null, h('span', { class: 'acc-title' }, title), sub ? h('span', { class: 'acc-sub' }, sub) : null, UI.icon('down', 18));
    if (!open) body.setAttribute('hidden', '');
    btn.addEventListener('click', function () { var o = btn.getAttribute('aria-expanded') === 'true'; btn.setAttribute('aria-expanded', o ? 'false' : 'true'); if (o) body.setAttribute('hidden', ''); else body.removeAttribute('hidden'); setOpen(key, !o); });
    return h('div', { class: 'acc' + (open ? ' open' : '') }, btn, body);
  }

  function sidebar(route) {
    var s = RF.store.get(), p = project(), prog = L.progress(p || { done: {}, na: {} });
    var side = h('nav', { class: 'side', id: 'side', 'aria-label': 'Menú principal' });
    var sel = h('select', { 'aria-label': 'Proyecto activo', class: 'proj-select' }, s.projects.map(function (pr) { return h('option', { value: pr.id }, pr.name || 'Sin nombre'); }), h('option', { value: '__new' }, '+ Nuevo proyecto…'));
    if (p) sel.value = p.id; else sel.value = '__new';
    if (!s.projects.length) { U.clear(sel); sel.appendChild(h('option', { value: '' }, 'Sin proyectos')); }
    sel.addEventListener('change', function () { if (sel.value === '__new') { location.hash = '#/h/proyecto'; } else RF.store.update(function (st) { st.activeProjectId = sel.value; }); });
    side.appendChild(h('div', { class: 'side-brand' }, h('a', { href: '#/', class: 'brand', 'aria-label': 'Rinde Fácil, inicio' }, 'Rinde Fácil'), h('span', { class: 'brand-sub' }, s.community.name || 'Tu comunidad')));
    side.appendChild(h('div', { class: 'proj-pick' }, h('label', { class: 'lbl-sm', for: 'projsel' }, 'Proyecto'), (sel.id = 'projsel', sel)));
    side.appendChild(h('button', { type: 'button', class: 'side-search', 'aria-label': 'Buscar en toda la app', onclick: function () { if (RF.searchui) RF.searchui.open(); } }, UI.icon('search', 18), h('span', { class: 'ss-t' }, 'Buscar en toda la app'), h('kbd', null, '/')));
    side.appendChild(h('a', { href: '#/', class: 'side-link' + (route.name === 'home' ? ' current' : '') }, UI.icon('route', 18), h('span', null, 'Mi ruta')));
    var curFase = route.name === 'tramite' ? faseOf[route.id] : route.name === 'fase' ? route.id : null;
    D.FASES.forEach(function (f) {
      var pf = prog.porFase[f.id], hiddenKids = [], kids = [];
      f.items.forEach(function (id) {
        var t = RF.tramites.byId[id], ip = L.itemProgress(p || { done: {} }, id), cur = route.name === 'tramite' && route.id === id;
        var a = h('a', { href: '#/t/' + id, class: 'side-item' + (cur ? ' current' : '') + (ip.complete ? ' done' : ''), 'aria-current': cur ? 'page' : null },
          h('span', { class: 'ck ' + (ip.complete ? 'on' : ip.done ? 'part' : '') }, ip.complete ? UI.icon('check', 14) : ''), h('span', { class: 'si-t' }, t.title), ip.na ? h('span', { class: 'na' }, ip.auto ? 'no te toca' : 'no aplica') : null);
        if (ip.auto && !cur) hiddenKids.push(a); else kids.push(a);
      });
      if (hiddenKids.length) kids.push(h('details', { class: 'side-hidden' }, h('summary', null, 'No te tocan por ahora (' + hiddenKids.length + ')'), hiddenKids));
      side.appendChild(accordion('fase-' + f.id, f.name, pf.tramDone + '/' + pf.tramTotal, kids, { open: curFase === f.id || (!curFase && prog.faseActual === f.id), badge: String(f.n), cls: pf.complete ? 'complete' : '' }));
    });
    var ay = D.AYUDA.map(function (id) { var t = RF.tramites.byId[id], cur = route.name === 'tramite' && route.id === id; return h('a', { href: '#/t/' + id, class: 'side-item' + (cur ? ' current' : '') }, h('span', { class: 'ck' }), h('span', { class: 'si-t' }, t.title)); });
    side.appendChild(accordion('ayuda', '¿Tienes una duda?', '', ay, { open: curFase === 'AY' }));
    side.appendChild(h('div', { class: 'side-sep' }, 'Herramientas'));
    TOOL_GROUPS.forEach(function (g) {
      var open = route.name === 'tool' && g.tools.indexOf(route.id) >= 0;
      side.appendChild(accordion(g.id, g.name, '', g.tools.map(function (tid) { return h('a', { href: '#/h/' + tid, class: 'side-item tool' + (route.name === 'tool' && route.id === tid ? ' current' : '') }, h('span', { class: 'ck tool' }, UI.icon(RF.tools[tid].icon || 'file', 14)), h('span', { class: 'si-t' }, toolTitle(tid))); }), { open: open, cls: 'tools' }));
    });
    side.appendChild(h('div', { class: 'side-foot' },
      h('a', { href: '#/h/nube', class: 'side-link' + (route.name === 'tool' && route.id === 'nube' ? ' current' : '') }, UI.icon('cloud', 18), h('span', null, 'Nube y copias')),
      h('button', { type: 'button', class: 'side-link', id: 'themeBtn', onclick: function () { RF.app.cycleTheme(); } }, UI.icon('sun', 18), h('span', { id: 'themeLbl' }, 'Tema'))));
    return side;
  }

  /* ---------- inicio ---------- */
  function homeView() {
    var s = RF.store.get(), p = project(), root = h('div', { class: 'view home' });
    if (!p) return onboarding();
    var prog = L.progress(p), res = L.reconcile(p, s.community, U.todayISO(), s.holidays);
    var f = fase(prog.faseActual), nx = prog.next, nt = nx && RF.tramites.byId[nx.tramiteId];
    root.appendChild(h('section', { class: 'hero' },
      h('p', { class: 'kicker' }, (s.community.name || 'Tu comunidad') + ' · ' + (p.name || 'Proyecto')),
      h('h1', null, nx ? 'Vas en la fase ' + f.n + ': ' + f.name : '¡Terminaste todos los pasos!'),
      h('p', { class: 'lead' }, nx ? f.blurb : 'Revisa el cuadre final y guarda tu copia.'),
      h('div', { class: 'hero-row' },
        nt ? h('a', { class: 'btn primary big', href: '#/t/' + nt.id }, 'Continuar: ' + nt.title, UI.icon('right', 20)) : h('a', { class: 'btn primary big', href: '#/h/revision' }, 'Ver la revisión final'),
        h('div', { class: 'ring-wrap' }, UI.progressBar(prog.tramDone, prog.tramTotal, 'Avance total'), h('span', { class: 'ring-t' }, prog.tramDone + ' de ' + prog.tramTotal + ' trámites listos'))),
      nt ? h('p', { class: 'next-step' }, 'Siguiente paso: ', h('strong', null, nt.steps[nx.stepIdx])) : null));
    if (!L.needsAnswered(p)) root.appendChild(h('section', { class: 'card need-banner' }, h('h3', { class: 'card-title' }, 'Cuéntanos qué necesitará tu proyecto'), h('p', null, 'Marca lo que vas a usar (viáticos, insumos, inmuebles…) y te mostramos solo los trámites que te tocan. Hoy ves todos.'), h('a', { class: 'btn primary', href: '#/h/necesidades' }, 'Marcar lo que necesito')));
    /* alertas */
    var flagged = res.groups.reduce(function (a, g) { return a.concat(g.items.filter(function (i) { return i.level === 'error' || i.level === 'warn'; })); }, []);
    root.appendChild(UI.section('¿Cuadra todo?', [flagged.length ? h('ul', { class: 'check-list' }, flagged.slice(0, 4).map(function (i) { return h('li', { class: 'lv-' + i.level }, h('span', { class: 'lv-ico' }, UI.icon('alert', 18)), h('span', { class: 'lv-msg' }, i.msg)); })) : UI.callout('ok', 'Nada por corregir por ahora.', ''), h('div', { class: 'row-actions' }, h('a', { class: 'btn', href: '#/h/revision' }, 'Ver la revisión completa' + (flagged.length > 4 ? ' (' + flagged.length + ' avisos)' : '')))], 'home-check'));
    /* fases */
    var cards = h('div', { class: 'phase-cards' }, D.FASES.map(function (fa) {
      var pf = prog.porFase[fa.id];
      return h('a', { class: 'phase-card' + (fa.id === prog.faseActual ? ' now' : '') + (pf.complete ? ' done' : ''), href: '#/f/' + fa.id }, h('span', { class: 'pc-n' }, String(fa.n)), h('span', { class: 'pc-t' }, fa.name), h('span', { class: 'pc-b' }, fa.blurb), UI.progressBar(pf.tramDone, pf.tramTotal, 'Avance de ' + fa.name), h('span', { class: 'pc-c' }, pf.tramDone + ' de ' + pf.tramTotal + ' trámites'));
    }));
    root.appendChild(h('section', null, h('h2', { class: 'sec-title' }, 'Tu ruta en 6 fases'), cards));
    /* flujo */
    var det = h('details', { class: 'flow-det', open: innerWidth > 860 ? true : null }, h('summary', null, 'Quién hace qué en todo el proceso'), h('p', { class: 'lead' }, 'Cada columna es un actor. Toca un paso para ver qué le toca a cada uno.'));
    var flow = RF.flow.render({ here: prog.faseActual }); det.appendChild(flow);
    det.addEventListener('toggle', function () { if (det.open) flow.redraw(); });
    root.appendChild(det);
    return root;
  }
  function onboarding() {
    var s = RF.store.get(), st = { proyecto: '' }, root = h('div', { class: 'view home' });
    root.appendChild(h('section', { class: 'hero' }, h('p', { class: 'kicker' }, 'Bienvenida y bienvenido'), h('h1', null, 'Rinde Fácil te guía en tu rendición'), h('p', { class: 'lead' }, 'Paso a paso, con los formularios ya armados, y avisándote si algo no cuadra. Empecemos con dos datos.')));
    var go = UI.btn('Empezar', { cls: 'primary big', onclick: function () { if (!s.community.name.trim()) { UI.toast('Escribe el nombre de tu comunidad.', 'bad'); return; } RF.store.addProject(st.proyecto.trim() || 'Mi proyecto'); location.hash = '#/'; } });
    root.appendChild(UI.section('Cuéntanos', [h('div', { class: 'form-grid' }, UI.field('Nombre de tu comunidad', s.community, 'name', { type: 'text', cls: 'wide', ph: 'Ej: Comunidad Atacameña de …' }), UI.field('RUT de la comunidad', s.community, 'rut', { type: 'rut' }), UI.field('Nombre de tu proyecto', st, 'proyecto', { type: 'text', ph: 'Ej: Sede comunitaria' })), h('div', { class: 'row-actions' }, go)]));
    root.appendChild(h('section', null, h('h2', { class: 'sec-title' }, 'Cómo funciona'), h('div', { class: 'cards-3' },
      h('div', { class: 'mini-card' }, h('strong', null, '1. Sigue la ruta'), h('p', null, 'Seis fases, cada una con sus trámites. Marca lo que ya hiciste.')),
      h('div', { class: 'mini-card' }, h('strong', null, '2. Completa aquí'), h('p', null, 'Carta Gantt, presupuesto, anexos e informes: todo se rellena y sale en Excel, Word, PDF o texto.')),
      h('div', { class: 'mini-card' }, h('strong', null, '3. Revisa el cuadre'), h('p', null, 'La app cruza tus datos y avisa qué falta o no calza, antes de enviar.')))));
    root.appendChild(UI.callout('info', 'Tus datos:', ' se guardan en este dispositivo. Puedes hacer una copia o conectar el servicio de tu comunidad en «Nube y copias».'));
    return root;
  }

  /* ---------- fase ---------- */
  function faseView(id) {
    var f = fase(id), p = project(), root = h('div', { class: 'view' });
    if (!f) return h('div', { class: 'view' }, UI.callout('bad', 'No encontramos esa fase.', ''));
    root.appendChild(h('div', { class: 'crumbs' }, h('a', { href: '#/' }, 'Mi ruta'), ' › ', 'Fase ' + f.n));
    root.appendChild(h('h1', { class: 'view-title' }, 'Fase ' + f.n + ': ' + f.name));
    root.appendChild(h('p', { class: 'lead' }, f.blurb));
    root.appendChild(UI.section('Trámites de esta fase', [h('ul', { class: 'item-list' }, f.items.slice().sort(function (a, b) { return (L.itemProgress(p || { done: {} }, a).auto ? 1 : 0) - (L.itemProgress(p || { done: {} }, b).auto ? 1 : 0); }).map(function (tid) {
      var t = RF.tramites.byId[tid], ip = L.itemProgress(p || { done: {} }, tid);
      return h('li', null, h('a', { href: '#/t/' + tid, class: 'item-row' + (ip.complete ? ' done' : '') }, h('span', { class: 'ck ' + (ip.complete ? 'on' : ip.done ? 'part' : '') }, ip.complete ? UI.icon('check', 14) : ''), h('span', { class: 'ir-t' }, t.title), h('span', { class: 'ir-c' }, ip.na ? (ip.auto ? 'no te toca por ahora' : 'no aplica') : ip.done + '/' + ip.total), UI.icon('right', 16)));
    }))]));
    root.appendChild(h('section', null, h('h2', { class: 'sec-title' }, 'Quién hace qué en esta fase'), RF.flow.render({ fases: [f.id], here: f.id })));
    return root;
  }

  /* ---------- trámite ---------- */
  /* botones bajo un paso que pide llenar un documento: «Rellenar» (por casillas) y «Ver formato» (cómo queda el documento) */
  var FORMY = /^(anexo|informe|pea|gantt|presupuesto|cotizaciones|reitem|solicitud|consulta)/;
  function stepDocs(tid, i) {
    var ids = RF.needs.STEP_TOOLS[tid + ':' + i]; if (!ids) return null;
    var kids = [];
    ids.forEach(function (x) {
      var tl = RF.tools[x]; if (!tl) return;
      kids.push(h('span', { class: 'sd' },
        h('a', { class: 'btn small', href: '#/h/' + x + '?from=' + encodeURIComponent(tid) }, UI.icon(tl.icon || 'file', 14), (FORMY.test(x) ? 'Rellenar · ' : 'Abrir · ') + tl.title),
        RF.docs && RF.docs.hasPreview(x) ? UI.btn('Ver formato', { cls: 'ghost small', title: 'Mira cómo queda el documento', onclick: function () { RF.docs.preview(x); } }) : null));
    });
    return kids.length ? h('div', { class: 'step-docs' }, kids) : null;
  }
  function tramiteView(id) {
    var t = RF.tramites.byId[id], p = project(), root = h('div', { class: 'view tramite' });
    if (!t) return h('div', { class: 'view' }, UI.callout('bad', 'No encontramos ese trámite.', ''));
    RF.app.lastTramite = id;
    var f = fase(t.fase), ix = ORDER.indexOf(id), prev = ORDER[ix - 1], next = ORDER[ix + 1];
    var ip = L.itemProgress(p || { done: {} }, id);
    root.appendChild(h('div', { class: 'crumbs' }, h('a', { href: '#/' }, 'Mi ruta'), ' › ', f ? h('a', { href: '#/f/' + f.id }, 'Fase ' + f.n + ': ' + f.name) : '¿Tienes una duda?'));
    root.appendChild(h('div', { class: 'tram-nav' }, prev ? h('a', { class: 'btn ghost small', href: '#/t/' + prev, 'aria-label': 'Anterior: ' + RF.tramites.byId[prev].title }, UI.icon('left', 16), 'Anterior') : h('span'), next ? h('a', { class: 'btn ghost small', href: '#/t/' + next, 'aria-label': 'Siguiente: ' + RF.tramites.byId[next].title }, 'Siguiente', UI.icon('right', 16)) : h('span')));
    var who = ACTOR[t.who] || ACTOR.comunidad;
    root.appendChild(h('header', { class: 'tram-head', style: { '--c': 'var(--' + who.id + ')' } }, h('h1', { class: 'view-title' }, t.title), h('p', { class: 'lead' }, t.why),
      h('div', { class: 'chips-row' }, h('span', { class: 'tag', style: { '--c': 'var(--' + who.id + ')' } }, 'Le toca a: ' + who.name), t.when ? h('span', { class: 'tag plain' }, UI.icon('clock', 14), t.when) : null, t.kind === 'paso' ? h('span', { class: 'tag plain' }, 'Paso del proceso') : null)));
    if (ip.auto) root.appendChild(h('div', { class: 'callout info' }, h('strong', null, 'Este trámite no te toca por ahora.'), h('span', null, ' Según lo que marcaste en «Qué necesitará tu proyecto», no lo vas a usar. Puedes leerlo igual.'), h('div', { class: 'row-actions' }, UI.btn('Me toca igual', { cls: 'ghost small', onclick: function () { RF.store.update(function () { p.show = p.show || {}; p.show[id] = true; }); } }), UI.btn('Cambiar lo que marqué', { cls: 'ghost small', onclick: function () { location.hash = '#/h/necesidades'; } }))));
    if (t.open) root.appendChild(UI.callout('warn', 'Duda abierta:', ' ' + t.open));
    /* plazo automático del PEA */
    if (id === 'TRM-027' && p) { var pd = L.peaDeadline(p, U.todayISO()); root.appendChild(pd ? UI.callout(pd.diasRestantes < 0 ? 'bad' : pd.diasRestantes <= 15 ? 'warn' : 'info', 'Tu plazo:', ' vence el ' + U.fmtDate(pd.fin) + (pd.diasRestantes >= 0 ? ' (faltan ' + pd.diasRestantes + ' días).' : ' (ya venció; con prórroga única, hasta el ' + U.fmtDate(pd.finProrroga) + ').')) : UI.callout('info', '', 'Anota la fecha del primer pago en «Mi comunidad y proyectos» para calcular tu plazo.')); }
    /* qué necesitas */
    if (t.need && t.need.length) root.appendChild(UI.section('Qué necesitas', [h('ul', { class: 'need-list' }, t.need.map(function (n) { return h('li', null, n); }))]));
    /* pasos */
    var stepsBox = h('ol', { class: 'steps' });
    var counter = h('span', { class: 'steps-count' });
    function updCount() { var q = L.itemProgress(p || { done: {} }, id); counter.textContent = q.na ? 'No aplica' : q.done + ' de ' + q.total; }
    t.steps.forEach(function (txt, i) {
      var cb = h('input', { type: 'checkbox', id: 'st-' + i, checked: !!(p && RF.store.isDone(p, id, i)), disabled: !p });
      var li = h('li', { class: 'step' + (cb.checked ? ' done' : '') }, h('label', { for: 'st-' + i }, cb, h('span', { class: 'st-n' }, String(i + 1)), h('span', { class: 'st-t' }, txt)));
      cb.addEventListener('change', function () { RF.store.setDone(id, i, cb.checked); li.classList.toggle('done', cb.checked); updCount(); refreshSide(); });
      var sd = stepDocs(id, i); if (sd) li.appendChild(sd);
      stepsBox.appendChild(li);
    });
    updCount();
    var naBox = h('label', { class: 'check na-check' }, h('input', { type: 'checkbox', checked: !!(p && p.na && p.na[id]), disabled: !p, onchange: function (ev) { RF.store.update(function () { p.na = p.na || {}; if (ev.target.checked) p.na[id] = true; else delete p.na[id]; }); } }), h('span', null, 'Este trámite no me aplica'));
    root.appendChild(h('section', { class: 'card steps-card' }, h('div', { class: 'card-title-row' }, h('h3', { class: 'card-title' }, 'Pasos'), counter), stepsBox, h('div', { class: 'row-actions between' }, UI.btn('Marcar todos', { cls: 'ghost small', onclick: function () { t.steps.forEach(function (_, i) { RF.store.setDone(id, i, true); }); RF.app.render(); } }), naBox)));
    /* herramientas */
    if (t.tools && t.tools.length) root.appendChild(UI.section('Hazlo aquí', [h('div', { class: 'tool-cards' }, t.tools.map(function (tid) { var tl = RF.tools[tid]; return h('a', { class: 'tool-card', href: '#/h/' + tid + '?from=' + encodeURIComponent(id) }, h('span', { class: 'tc-ico' }, UI.icon(tl.icon || 'file', 26)), h('span', { class: 'tc-t' }, tl.title), h('span', { class: 'tc-d' }, tl.desc), UI.icon('right', 18)); }))]));
    /* documento original */
    if (t.img && t.img.length) root.appendChild(h('details', { class: 'card orig' }, h('summary', null, 'Ver el documento original'), h('div', { class: 'orig-grid' }, t.img.map(function (im) { return h('figure', null, h('a', { href: 'assets/docs/' + im[0], target: '_blank', rel: 'noopener' }, h('img', { src: 'assets/docs/' + im[0], alt: im[1], loading: 'lazy' })), h('figcaption', null, im[1])); })), h('p', { class: 'hint' }, 'Fuente: ' + (t.src || []).join(' · '))));
    else if (t.src) root.appendChild(h('p', { class: 'hint' }, 'Fuente: ' + t.src.join(' · ')));
    return root;
  }
  function refreshSide() { var old = document.getElementById('side'); if (!old) return; var neu = sidebar(RF.app.route()); old.parentNode.replaceChild(neu, old); if (document.body.classList.contains('menu-open')) { /* mantener */ } RF.app.applyThemeLabel(); }

  RF.views = { TOOL_GROUPS: TOOL_GROUPS, sidebar: sidebar, home: homeView, fase: faseView, tramite: tramiteView, ORDER: ORDER, faseOf: faseOf, refreshSide: refreshSide };
})(typeof window !== 'undefined' ? window : globalThis);
