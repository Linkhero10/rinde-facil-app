/* Rinde Fácil — herramientas de planificación: proyecto, Carta Gantt, presupuesto, PEA, cambios, cotizaciones y ayudas. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, D = RF.data, L = RF.logic, h = U.h, num = U.parseCLP;
  var TOOLS = RF.tools = RF.tools || {};

  function page(title, lead, kids) { return h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, title), lead ? h('p', { class: 'lead' }, lead) : null, kids); }
  function needProject(ctx) {
    if (ctx.project) return null;
    return UI.callout('warn', 'Primero crea tu proyecto.', ' Ve a «Mi comunidad y proyectos» y agrega el primero.');
  }
  function ctx() { return RF.forms.ctxNow(); }

  /* ================= Proyecto y comunidad ================= */
  TOOLS.proyecto = { title: 'Mi comunidad y proyectos', icon: 'user', desc: 'Datos de tu comunidad, tus proyectos y fechas clave.', render: function () {
    var s = RF.store.get(), p = RF.store.project();
    var root = h('div');
    var com = s.community;
    var comFields = h('div', { class: 'form-grid' },
      UI.field('Nombre de la comunidad', com, 'name', { type: 'text', cls: 'wide' }),
      UI.field('RUT de la comunidad', com, 'rut', { type: 'rut' }), UI.field('Dirección', com, 'address', { type: 'text' }),
      UI.field('Representante legal', com, 'legalRep', { type: 'text' }), UI.field('Cédula del representante', com, 'repRut', { type: 'rut' }),
      UI.field('Correo', com, 'email', { type: 'text' }), UI.field('Teléfono', com, 'phone', { type: 'text' }),
      UI.field('Organismo Colaborador', com, 'oc', { type: 'text' }),
      UI.field('¿Cómo tratas el IVA?', com, 'ivaModo', { type: 'select', noEmpty: true, cls: 'wide', options: [
        { id: 'no_contribuyente', name: 'No soy contribuyente de IVA (rindo el valor total)' },
        { id: 'recupera', name: 'Soy contribuyente y recupero el IVA (rindo el valor neto)' },
        { id: 'no_usa', name: 'Soy contribuyente y NO uso el IVA (rindo el total con Anexo 1)' }],
        hint: 'Manual p. 7. Si dudas, pregunta a tu contador o al Organismo Colaborador.' }));
    root.appendChild(UI.section('Tu comunidad', [comFields]));
    if (p) { var cv = RF.data.convenioDe(p); root.appendChild(UI.section('Reglas que se aplican', [h('p', { class: 'hint' }, h('strong', null, cv.nombre), ' · ' + cv.fuente + '. Si CORFO cambia el Manual o tu comunidad rinde otro fondo, las reglas se actualizan aparte: tus datos no se tocan.')])); }

    /* lista de proyectos */
    var list = h('div', { class: 'chips' });
    s.projects.forEach(function (pr) { list.appendChild(h('button', { type: 'button', class: 'chip' + (pr.id === s.activeProjectId ? ' on' : ''), onclick: function () { RF.store.update(function (st) { st.activeProjectId = pr.id; }); } }, pr.name || 'Sin nombre')); });
    var nameInp = h('input', { type: 'text', placeholder: 'Nombre del nuevo proyecto', 'aria-label': 'Nombre del nuevo proyecto' });
    var addRow = h('div', { class: 'inline-add' }, nameInp, UI.btn('Agregar proyecto', { icon: 'plus', cls: 'primary', onclick: function () { RF.store.addProject(nameInp.value.trim() || 'Mi proyecto'); UI.toast('Proyecto creado.', 'ok'); } }));
    root.appendChild(UI.section('Tus proyectos', [s.projects.length ? h('p', { class: 'hint' }, 'Una comunidad puede tener varios proyectos. Elige con cuál trabajas:') : UI.empty('Aún no tienes proyectos. Crea el primero.'), list, addRow]));

    if (p) {
      var f = h('div', { class: 'form-grid' },
        UI.field('Nombre del proyecto', p, 'name', { type: 'text', cls: 'wide' }), UI.field('Código (lo asigna CORFO)', p, 'code', { type: 'text', ph: '22CDR-######' }),
        UI.field('Tipo de proyecto', p, 'tipo', { type: 'select', noEmpty: true, options: D.TIPOS_PROYECTO }),
        UI.field('Inicio del proyecto', p, 'start', { type: 'date' }), UI.field('Término del proyecto', p, 'end', { type: 'date' }),
        UI.field('Fecha del primer pago (30 %)', p, 'desembolso1', { type: 'date', hint: 'Desde aquí corren los 90 días del PEA.' }),
        UI.field('Período que estás rindiendo: desde', p, 'periodoInicio', { type: 'date' }), UI.field('hasta', p, 'periodoFin', { type: 'date' }));
      root.appendChild(UI.section('Datos de «' + (p.name || 'tu proyecto') + '»', [f]));
      var bud = h('div', { class: 'form-grid' }, D.CUENTAS.map(function (cu) { return UI.field(cu.name, p.budgetApproved, cu.id, { type: 'money', hint: 'Lo aprobado por CORFO' }); }));
      root.appendChild(UI.section('Presupuesto aprobado por cuenta', [bud]));
      var pd = L.peaDeadline(p, U.todayISO());
      if (pd) root.appendChild(UI.section('Plazo del PEA', [h('p', null, 'Vence el ', h('strong', null, U.fmtDate(pd.fin)), ' (' + (pd.diasRestantes >= 0 ? 'faltan ' + pd.diasRestantes + ' días' : 'pasó hace ' + Math.abs(pd.diasRestantes) + ' días') + '). Con prórroga única de 30 días: ' + U.fmtDate(pd.finProrroga) + '.')]));
      if (s.projects.length > 1 || true) root.appendChild(h('div', { class: 'row-actions' }, UI.btn('Borrar este proyecto', { icon: 'trash', cls: 'ghost danger', onclick: function () { UI.confirmBox('¿Borrar «' + (p.name || 'este proyecto') + '» y todos sus datos? No se puede deshacer.', 'Borrar').then(function (ok) { if (ok) RF.store.removeProject(p.id); }); } })));
    }
    /* feriados */
    var hol = h('div', { class: 'chips' });
    function paintHol() { U.clear(hol); s.holidays.slice().sort().forEach(function (d) { hol.appendChild(h('button', { type: 'button', class: 'chip', title: 'Quitar', onclick: function () { RF.store.update(function (st) { st.holidays = st.holidays.filter(function (x) { return x !== d; }); }, { silent: true }); paintHol(); } }, U.fmtDateShort(d) + ' ✕')); }); if (!s.holidays.length) hol.appendChild(h('span', { class: 'hint' }, 'No agregaste feriados propios.')); }
    paintHol();
    var hd = h('input', { type: 'date', 'aria-label': 'Fecha de feriado' });
    root.appendChild(UI.section('Feriados (para contar días hábiles)', [h('p', { class: 'hint' }, 'Los días hábiles se cuentan de lunes a viernes. Los feriados nacionales de Chile se cargan solos y se actualizan cada mes al abrir la app: no tienes que hacer nada. Aquí solo agrega los que falten, como los regionales o los que se decreten de un día para otro.'), h('div', { class: 'inline-add' }, hd, UI.btn('Agregar', { icon: 'plus', onclick: function () { if (!hd.value) return; RF.store.update(function (st) { if (st.holidays.indexOf(hd.value) < 0) st.holidays.push(hd.value); }, { silent: true }); hd.value = ''; paintHol(); } })), hol]));
    return page('Mi comunidad y proyectos', 'Estos datos se usan para rellenar solos los anexos y revisar tus fechas.', root);
  } };

  /* ================= Carta Gantt ================= */
  function ganttMonths(project) {
    var acts = L.allActivities(project).filter(function (x) { return x.act.start && x.act.end && x.act.end >= x.act.start; });
    var min = project.start, max = project.end;
    acts.forEach(function (x) { if (!min || x.act.start < min) min = x.act.start; if (!max || x.act.end > max) max = x.act.end; });
    var months = U.monthsRange(min, max);
    return months.length > 48 ? months.slice(0, 48) : months;
  }
  function ganttDoc(project, community) {
    var months = ganttMonths(project), rows = [];
    L.allActivities(project).forEach(function (x) {
      var a = x.act, r = [x.stage.name, a.name, a.start, a.end, L.activityDays(a), a.result];
      months.forEach(function (m) { r.push(a.start && a.end && U.monthKey(a.start) <= m && U.monthKey(a.end) >= m ? '■' : ''); });
      rows.push(r);
    });
    return { title: 'Carta Gantt', subtitle: (project.name || 'Proyecto') + (project.code ? ' · ' + project.code : ''), sheet: 'Carta Gantt', footer: 'Generado con Rinde Fácil. Sirve para copiar la información a SGP («Configuración Gantt») o al PEA. Revisa que coincida con lo que aprobó CORFO.', blocks: [
      { t: 'kv', rows: [['Proyecto', project.name], ['Código', project.code], ['Comunidad', community.name], ['Inicio del proyecto', project.start ? U.fmtDate(project.start) : ''], ['Término del proyecto', project.end ? U.fmtDate(project.end) : '']] },
      { t: 'table', head: ['Etapa', 'Actividad', 'Inicio', 'Término', 'Días', 'Resultado o hito'].concat(months.map(U.monthLabel)), types: ['text', 'text', 'date', 'date', 'num', 'text'].concat(months.map(function () { return 'text'; })), widths: [26, 38, 13, 13, 7, 24].concat(months.map(function () { return 7; })), rows: rows }
    ] };
  }
  function sgpTsv(rows, head) { return [head.join('\t')].concat(rows.map(function (r) { return r.join('\t'); })).join('\n'); }
  TOOLS.gantt = { title: 'Carta Gantt', icon: 'gantt', desc: 'Arma tus etapas y actividades con fechas. Sale en Excel, PDF o texto.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('Carta Gantt', '', needProject(c));
    var g = p.gantt;
    var root = h('div'), body = h('div'), monthsBox = h('div');
    function paintMonths() {
      U.clear(monthsBox);
      var months = ganttMonths(p), acts = L.allActivities(p);
      if (!months.length || !acts.length) return;
      var head = h('tr', null, h('th', { class: 'sticky' }, 'Actividad'), months.map(function (m) { return h('th', { class: 'mth' }, U.monthLabel(m)); }));
      var rows = acts.map(function (x) { return h('tr', null, h('th', { class: 'sticky', scope: 'row' }, x.act.name || '(sin nombre)'), months.map(function (m) { var on = x.act.start && x.act.end && U.monthKey(x.act.start) <= m && U.monthKey(x.act.end) >= m; return h('td', { class: on ? 'gbar' : '', title: on ? (x.act.name || '') + ' · ' + U.monthLabel(m) : '' }); })); });
      monthsBox.appendChild(h('div', { class: 'table-scroll' }, h('table', { class: 'gantt-grid', 'aria-label': 'Carta Gantt por meses' }, h('thead', null, head), h('tbody', null, rows))));
    }
    function paint() {
      U.clear(body);
      if (!g.stages.length) body.appendChild(UI.empty('Aún no hay etapas. Agrega la primera: por ejemplo «Preparación», «Ejecución» o «Cierre».'));
      g.stages.forEach(function (st, si) {
        var tb = h('tbody');
        (st.acts || []).forEach(function (a) {
          var days = h('output', { class: 'calc' }, L.activityDays(a) != null ? L.activityDays(a) + ' d' : '');
          var upd = function () { var d = L.activityDays(a); days.textContent = d != null && d > 0 ? d + ' d' : ''; issues.refresh(); paintMonths(); };
          tb.appendChild(h('tr', null,
            h('td', { 'data-label': 'Actividad' }, UI.bind(a, 'name', { type: 'text', ph: 'Ej: Taller de capacitación', aria: 'Nombre de la actividad', onChange: upd })),
            h('td', { 'data-label': 'Inicio' }, UI.bind(a, 'start', { type: 'date', aria: 'Inicio', onChange: upd })),
            h('td', { 'data-label': 'Término' }, UI.bind(a, 'end', { type: 'date', aria: 'Término', onChange: upd })),
            h('td', { 'data-label': 'Días' }, days),
            h('td', { 'data-label': 'Resultado o hito' }, UI.bind(a, 'result', { type: 'text', ph: 'Qué se logra', aria: 'Resultado', onChange: function () { } })),
            h('td', { class: 'act' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar actividad', title: 'Quitar actividad', onclick: function () { try { L.removeActivity(p, a.id); } catch (e) { UI.toast(e.message, 'bad'); return; } RF.store.update(function () { }, { silent: true }); paint(); } }, UI.icon('trash', 18)))));
        });
        body.appendChild(h('div', { class: 'stage-card' },
          h('div', { class: 'stage-head' }, h('span', { class: 'stage-n' }, 'Etapa ' + (si + 1)), UI.bind(st, 'name', { type: 'text', ph: 'Nombre de la etapa', aria: 'Nombre de la etapa', onChange: function () { issues.refresh(); paintMonths(); } }),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar etapa', title: 'Quitar etapa', onclick: function () { UI.confirmBox('¿Quitar esta etapa con sus actividades?', 'Quitar').then(function (ok) { if (!ok) return; try { L.removeStage(p, st.id); } catch (e) { UI.toast(e.message, 'bad'); return; } RF.store.update(function () { }, { silent: true }); paint(); }); } }, UI.icon('trash', 18))),
          h('div', { class: 'table-scroll' }, h('table', { class: 'edit-grid' }, h('thead', null, h('tr', null, ['Actividad', 'Inicio', 'Término', 'Días', 'Resultado o hito', ''].map(function (x) { return h('th', null, x); }))), tb)),
          UI.btn('Agregar actividad', { icon: 'plus', cls: 'ghost', onclick: function () { st.acts = st.acts || []; st.acts.push({ id: U.uid('a'), name: '', start: '', end: '', result: '' }); RF.store.update(function () { }, { silent: true }); paint(); } })));
      });
      body.appendChild(UI.btn('Agregar etapa', { icon: 'plus', cls: 'primary', onclick: function () { g.stages.push({ id: U.uid('s'), name: '', acts: [] }); RF.store.update(function () { }, { silent: true }); paint(); } }));
      paintMonths();
    }
    var issues = { refresh: function () { } };
    var issuesBox = h('div', { class: 'issues' });
    issues.refresh = function () { U.clear(issuesBox); var list = L.ganttIssues(p); list.forEach(function (i) { issuesBox.appendChild(UI.callout(i.level === 'error' ? 'bad' : 'warn', '', i.msg)); }); };
    paint(); issues.refresh();
    root.appendChild(UI.section('Etapas y actividades', [body]));
    root.appendChild(UI.section('Vista por meses', [monthsBox]));
    root.appendChild(UI.section('Revisión', [issuesBox]));
    root.appendChild(UI.section('Sacar la Carta Gantt', [UI.exportBar(function () { return ganttDoc(p, c.community); }, 'carta-gantt', [{ label: 'Copiar para SGP', icon: 'copy', run: function () {
      var rows = L.allActivities(p).map(function (x) { return [x.stage.name, x.act.name, U.fmtDateShort(x.act.start), U.fmtDateShort(x.act.end)]; });
      U.copyText(sgpTsv(rows, ['Etapa', 'Actividad', 'Inicio', 'Término'])).then(function (ok) { UI.toast(ok ? 'Copiado en el orden en que SGP pide los datos (etapa, actividad, inicio y término, con fechas día-mes-año). SGP no recibe pegados: cópialos de a uno en cada campo.' : 'No se pudo copiar.', ok ? 'ok' : 'bad'); }); } }])]));
    return page('Carta Gantt', 'Ordena tu proyecto en etapas y actividades. Después la puedes sacar en Excel, PDF o texto, ordenada como la pide SGP, para ir llenándola campo por campo.', root);
  } };

  /* ================= Presupuesto ================= */
  function budgetDoc(project, community) {
    var lines = project.budgetLines || [], totals = L.totalsByCuenta(project);
    var rows = lines.map(function (l) { var a = L.allActivities(project).filter(function (x) { return x.act.id === l.actId; })[0]; return [D.CUENTA_BY_ID[l.cuenta] ? D.CUENTA_BY_ID[l.cuenta].name : '', l.item, l.glosa, l.fuente === 'propio' ? 'Aporte propio' : 'CORFO', a ? a.act.name : '', num(l.monto)]; });
    var pivot = D.CUENTAS.map(function (cu) { var corfo = 0, propio = 0; lines.forEach(function (l) { if (l.cuenta === cu.id) { if (l.fuente === 'propio') propio += num(l.monto); else corfo += num(l.monto); } }); return [cu.name, corfo, propio, corfo + propio, totals[cu.id].aprobado]; });
    return { title: 'Presupuesto por cuenta', subtitle: (project.name || 'Proyecto') + (project.code ? ' · ' + project.code : ''), sheet: 'Presupuesto', footer: 'Generado con Rinde Fácil. Sirve para cargar la «Vista Pivot de Presupuesto» en SGP (F1 = CORFO, F2 = aporte propio) o para el PEA.', blocks: [
      { t: 'h', text: 'Detalle' }, { t: 'table', head: ['Cuenta', 'Ítem', 'Glosa', 'Fuente', 'Actividad', 'Monto ($)'], types: ['text', 'text', 'text', 'text', 'text', 'money'], rows: rows, foot: ['Total', '', '', '', '', 'SUM'] },
      { t: 'h', text: 'Resumen por cuenta y fuente' }, { t: 'table', head: ['Cuenta', 'F1 · CORFO ($)', 'F2 · Aporte propio ($)', 'Total presupuestado ($)', 'Aprobado por CORFO ($)'], types: ['text', 'money', 'money', 'money', 'money'], rows: pivot, foot: ['Total', 'SUM', 'SUM', 'SUM', 'SUM'] }
    ] };
  }
  TOOLS.presupuesto = { title: 'Presupuesto', icon: 'money', desc: 'Presupuesta por cuenta, ítem y glosa. Te avisa si te pasas de lo aprobado.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('Presupuesto', '', needProject(c));
    var root = h('div'), body = h('div'), sum = h('div');
    function paintSummary() {
      U.clear(sum);
      var t = L.totalsByCuenta(p), months = U.monthsRange(p.start, p.end).length || 0;
      var rows = D.CUENTAS.map(function (cu) {
        var x = t[cu.id]; var over = x.aprobado > 0 && x.corfo > x.aprobado;
        return h('tr', { class: over ? 'row-bad' : '' }, h('th', { scope: 'row' }, cu.name), h('td', { class: 'r' }, U.fmtCLP(x.corfo)), h('td', { class: 'r' }, U.fmtCLP(x.propio)), h('td', { class: 'r' }, U.fmtCLP(x.presupuestado)), h('td', { class: 'r' }, x.aprobado ? U.fmtCLP(x.aprobado) : '—'), h('td', { class: 'r' }, x.aprobado ? U.fmtCLP(x.aprobado - x.corfo) : '—'));
      });
      sum.appendChild(h('div', { class: 'table-scroll' }, h('table', { class: 'plain-grid' }, h('thead', null, h('tr', null, ['Cuenta', 'F1 · CORFO', 'F2 · Aporte propio', 'Total', 'Aprobado CORFO', 'Disponible CORFO'].map(function (x, i) { return h('th', { class: i ? 'r' : '' }, x); }))), h('tbody', null, rows))));
      var over = D.CUENTAS.filter(function (cu) { return t[cu.id].aprobado > 0 && t[cu.id].corfo > t[cu.id].aprobado; });
      over.forEach(function (cu) { sum.appendChild(UI.callout('bad', '', cu.name + ': te pasas de lo aprobado.')); });
      var cap = D.REGLAS.ADMIN_TOPE_MENSUAL * months;
      if (months && t.administracion.presupuestado > cap) sum.appendChild(UI.callout('bad', '', 'Administración: el tope es ' + U.fmtCLP(D.REGLAS.ADMIN_TOPE_MENSUAL) + ' al mes (' + U.fmtCLP(cap) + ' en ' + months + ' meses).'));
    }
    function paint() {
      U.clear(body);
      var acts = [{ id: '', name: 'Sin actividad' }].concat(L.allActivities(p).map(function (x) { return { id: x.act.id, name: x.act.name || '(sin nombre)' }; }));
      var tb = h('tbody');
      p.budgetLines.forEach(function (l, i) {
        tb.appendChild(h('tr', null,
          h('td', { 'data-label': 'Cuenta' }, UI.bind(l, 'cuenta', { type: 'select', options: D.CUENTAS.map(function (x) { return { id: x.id, name: x.name }; }), aria: 'Cuenta', onChange: paintSummary })),
          h('td', { 'data-label': 'Ítem' }, UI.bind(l, 'item', { type: 'text', ph: 'Ej: Materiales', aria: 'Ítem' })),
          h('td', { 'data-label': 'Glosa' }, (function () { var gi = UI.bind(l, 'glosa', { type: 'text', ph: 'Qué es y para qué', max: 200, aria: 'Glosa' }), cnt = h('small', { class: 'muted' }, String((l.glosa || '').length) + ' / 200'); gi.addEventListener('input', function () { cnt.textContent = gi.value.length + ' / 200' + (gi.value.length >= 200 ? ' · llegaste al máximo' : ''); }); return [gi, cnt]; })()),
          h('td', { 'data-label': 'Fuente' }, UI.bind(l, 'fuente', { type: 'select', noEmpty: true, options: [{ id: 'corfo', name: 'F1 · CORFO' }, { id: 'propio', name: 'F2 · Aporte propio' }], aria: 'Fuente' })),
          h('td', { 'data-label': 'Actividad' }, UI.bind(l, 'actId', { type: 'select', noEmpty: true, options: acts, aria: 'Actividad' })),
          h('td', { 'data-label': 'Monto' }, UI.bind(l, 'monto', { type: 'money', aria: 'Monto', onChange: paintSummary })),
          h('td', { class: 'act' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar línea', title: 'Quitar línea', onclick: function () { p.budgetLines.splice(i, 1); RF.store.update(function () { }, { silent: true }); paint(); paintSummary(); } }, UI.icon('trash', 18)))));
      });
      if (!p.budgetLines.length) body.appendChild(UI.empty('Aún no hay líneas. Agrega la primera.'));
      body.appendChild(h('div', { class: 'table-scroll' }, h('table', { class: 'edit-grid' }, h('thead', null, h('tr', null, ['Cuenta', 'Ítem', 'Glosa (máx. 200)', 'Fuente', 'Actividad', 'Monto', ''].map(function (x) { return h('th', null, x); }))), tb)));
      body.appendChild(UI.btn('Agregar línea', { icon: 'plus', cls: 'primary', onclick: function () { p.budgetLines.push({ id: U.uid('b'), cuenta: 'operacion', item: '', glosa: '', fuente: 'corfo', monto: '', actId: '' }); RF.store.update(function () { }, { silent: true }); paint(); } }));
    }
    paint(); paintSummary();
    root.appendChild(UI.section('Líneas de presupuesto', [body]));
    root.appendChild(UI.section('Comparado con lo aprobado', [sum]));
    root.appendChild(UI.section('Sacar el presupuesto', [UI.exportBar(function () { return budgetDoc(p, c.community); }, 'presupuesto', [{ label: 'Copiar para SGP', icon: 'copy', run: function () {
      var acts = L.allActivities(p);
      var rows = p.budgetLines.map(function (l) { var a = acts.filter(function (x) { return x.act.id === l.actId; })[0]; return [a ? a.stage.name : '', (D.CUENTA_BY_ID[l.cuenta] || {}).sgp || '', l.item, l.glosa, l.fuente === 'propio' ? 'Aporte de la comunidad' : 'Aporte CORFO', 'Pecuniario', num(l.monto)]; });
      U.copyText(sgpTsv(rows, ['Etapa', 'Cuenta', 'Ítem', 'Descripción del gasto', 'Aporte', 'Tipo de aporte', 'Monto total'])).then(function (ok) { UI.toast(ok ? 'Copiado en el orden de los campos de SGP (etapa, cuenta, ítem, descripción, aporte, tipo y monto total). SGP no recibe pegados: cópialos de a uno en cada campo.' : 'No se pudo copiar.', ok ? 'ok' : 'bad'); }); } }])]));
    return page('Presupuesto', 'Cada gasto va en una de 4 cuentas. Aquí planificas cuánto vas a gastar en cada una.', root);
  } };

  /* ================= PEA ================= */
  function peaDoc(p, c) {

      var blocks = [], d1 = RF.forms.docOf('peaGeneral', RF.forms.getSingle(p, 'peaGeneral'), c);
      blocks.push({ t: 'h', text: '1. Información general' }); d1.blocks.forEach(function (b) { blocks.push(b); });
      RF.forms.getList(p, 'peaProyecto').forEach(function (it, i) { var d = RF.forms.docOf('peaProyecto', it.data, c); blocks.push({ t: 'h', text: '2.' + (i + 1) + ' ' + d.title }); d.blocks.forEach(function (b) { blocks.push(b); }); });
      var gd = ganttDoc(p, c.community); blocks.push({ t: 'h', text: '3a. Carta Gantt' }); gd.blocks.forEach(function (b) { blocks.push(b); });
      var bd = budgetDoc(p, c.community); blocks.push({ t: 'h', text: '3b. Presupuesto' }); bd.blocks.forEach(function (b) { blocks.push(b); });
      return { title: 'Programa de Ejecución de Actividades (PEA)', subtitle: (c.community.name || 'Comunidad') + ' · ' + (p.name || ''), sheet: 'PEA', footer: 'Borrador generado con Rinde Fácil. No es el formulario oficial de CORFO.', blocks: blocks };
    
  }

  TOOLS.pea = { title: 'PEA: los 3 documentos', icon: 'form', desc: 'Información general, un formulario por proyecto y presupuesto con Carta Gantt.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('PEA', '', needProject(c));
    var root = h('div');
    var pd = L.peaDeadline(p, U.todayISO());
    root.appendChild(UI.callout('info', 'Ojo:', ' estos documentos son un borrador para reunir y copiar tu información. No tenemos el formulario oficial del PEA, así que confirma el formato vigente con tu ejecutivo técnico o con el Organismo Colaborador (Componente 3).'));
    if (pd) root.appendChild(UI.callout(pd.diasRestantes < 0 ? 'bad' : pd.diasRestantes <= 15 ? 'warn' : 'ok', 'Plazo:', ' vence el ' + U.fmtDate(pd.fin) + (pd.diasRestantes >= 0 ? ' (faltan ' + pd.diasRestantes + ' días)' : ' (ya pasó; con prórroga hasta ' + U.fmtDate(pd.finProrroga) + ')') + '.'));
    root.appendChild(h('h2', { class: 'sub-title' }, '1 · Información general del plan')); root.appendChild(RF.forms.renderSingle('peaGeneral', c));
    root.appendChild(h('h2', { class: 'sub-title' }, '2 · Un formulario por proyecto')); root.appendChild(RF.forms.renderRepeat('peaProyecto', c));
    root.appendChild(h('h2', { class: 'sub-title' }, '3 · Presupuesto y Carta Gantt'));
    root.appendChild(UI.section('Estos dos documentos ya los armas en sus propias herramientas', [h('div', { class: 'row-actions' }, UI.btn('Abrir Carta Gantt', { icon: 'gantt', onclick: function () { location.hash = '#/h/gantt'; } }), UI.btn('Abrir Presupuesto', { icon: 'money', onclick: function () { location.hash = '#/h/presupuesto'; } }))]));
    root.appendChild(UI.section('Todo el PEA en un solo documento', [UI.exportBar(function () { return peaDoc(p, c); }, 'pea-completo')]));
    return page('PEA: los 3 documentos', 'El PEA se compone de información general, un formulario por proyecto y el presupuesto con la Carta Gantt.', root);
  } };

  function reitemDoc(p, c) {
    var r = p.reitem;

      return { title: r.tipo === 'reprog' ? 'Solicitud de reprogramación' : 'Solicitud de reitemización', subtitle: (p.name || '') + (p.code ? ' · ' + p.code : ''), sheet: 'Cambios PEA', footer: 'Borrador generado con Rinde Fácil. Envíalo a tu ejecutivo técnico de CORFO (con apoyo del Organismo Colaborador si quieres).', blocks: [
        { t: 'p', text: 'Comunidad: ' + (c.community.name || '') }, { t: 'h', text: 'Motivo' }, { t: 'p', text: r.motivo || '' }, { t: 'h', text: 'Cambios' },
        { t: 'table', head: ['Cuenta', 'Ítem o actividad', 'Monto actual ($)', 'Monto nuevo ($)', 'Diferencia ($)'], types: ['text', 'text', 'money', 'money', 'money'], rows: r.rows.map(function (x) { return [(D.CUENTA_BY_ID[x.cuenta] || {}).name, x.item, num(x.actual), num(x.nuevo), num(x.nuevo) - num(x.actual)]; }), foot: ['Total', '', 'SUM', 'SUM', 'SUM'] }, { t: 'sign', labels: [c.community.legalRep || 'Representante de la comunidad'] }] };
    
  }

  /* ================= Cambios al PEA (reitemización) ================= */
  TOOLS.reitem = { title: 'Cambios al PEA', icon: 'edit', desc: 'Mueve montos entre cuentas o cambia fechas y explica por qué.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('Cambios al PEA', '', needProject(c));
    var r = p.reitem; if (!r.rows) r.rows = [];
    var root = h('div'), body = h('div'), chk = h('div');
    function check() {
      U.clear(chk);
      var delta = U.sum(r.rows, function (x) { return num(x.nuevo) - num(x.actual); });
      if (!r.rows.length) { chk.appendChild(UI.callout('info', '', 'Agrega las líneas que cambian.')); return; }
      if (delta === 0) chk.appendChild(UI.callout('ok', 'El total no cambia:', ' lo que sube en una cuenta baja en otra.'));
      else chk.appendChild(UI.callout('warn', 'El total cambia en ' + U.fmtCLP(delta) + '.', ' Una reitemización normalmente reasigna montos sin aumentar el total. Si es un aumento, debe estar aprobado por CORFO.'));
      if (!String(r.motivo || '').trim()) chk.appendChild(UI.callout('warn', '', 'Falta explicar por escrito el motivo del cambio.'));
    }
    function paint() {
      U.clear(body);
      var tb = h('tbody');
      r.rows.forEach(function (x, i) {
        var dl = h('output', { class: 'calc' });
        var upd = function () { dl.textContent = U.fmtCLP(num(x.nuevo) - num(x.actual)); check(); };
        tb.appendChild(h('tr', null,
          h('td', { 'data-label': 'Cuenta' }, UI.bind(x, 'cuenta', { type: 'select', options: D.CUENTAS.map(function (y) { return { id: y.id, name: y.name }; }), aria: 'Cuenta' })),
          h('td', { 'data-label': 'Ítem o actividad' }, UI.bind(x, 'item', { type: 'text', aria: 'Ítem' })),
          h('td', { 'data-label': 'Monto actual' }, UI.bind(x, 'actual', { type: 'money', aria: 'Monto actual', onChange: upd })),
          h('td', { 'data-label': 'Monto nuevo' }, UI.bind(x, 'nuevo', { type: 'money', aria: 'Monto nuevo', onChange: upd })),
          h('td', { 'data-label': 'Diferencia' }, dl),
          h('td', { class: 'act' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar', onclick: function () { r.rows.splice(i, 1); RF.store.update(function () { }, { silent: true }); paint(); check(); } }, UI.icon('trash', 18)))));
        upd();
      });
      body.appendChild(h('div', { class: 'table-scroll' }, h('table', { class: 'edit-grid' }, h('thead', null, h('tr', null, ['Cuenta', 'Ítem o actividad', 'Monto actual', 'Monto nuevo', 'Diferencia', ''].map(function (x) { return h('th', null, x); }))), tb)));
      body.appendChild(UI.btn('Agregar línea', { icon: 'plus', cls: 'primary', onclick: function () { r.rows.push({ cuenta: 'operacion', item: '', actual: '', nuevo: '' }); RF.store.update(function () { }, { silent: true }); paint(); } }));
    }
    paint(); check();
    root.appendChild(UI.callout('info', 'Recuerda:', ' si solo cambian los plazos se llama reprogramación; si cambian actividades o presupuesto, reitemización. No gastes bajo el nuevo detalle hasta que CORFO lo apruebe.'));
    root.appendChild(UI.section('Qué cambia', [UI.field('Tipo de cambio', r, 'tipo', { type: 'select', options: [{ id: 'reitem', name: 'Reitemización (actividades o presupuesto)' }, { id: 'reprog', name: 'Reprogramación (solo fechas)' }], noEmpty: true }), body, chk]));
    root.appendChild(UI.section('Por qué', [UI.field('Motivo del cambio', r, 'motivo', { type: 'textarea', rows: 4, cls: 'wide', onChange: check, hint: 'Explica qué actividad, monto o ítem del PEA vigente se ve afectado.' })]));
    root.appendChild(UI.section('Sacar la solicitud', [UI.exportBar(function () { return reitemDoc(p, c); }, 'cambios-pea')]));
    return page('Cambios al PEA', 'Si necesitas mover plata entre cuentas o cambiar fechas, se pide antes de gastar.', root);
  } };

  /* estado de una compra respecto de las cotizaciones; lo usan la pantalla y el documento */
  function cotStatus(cq) {
    var neto = num(cq.neto);
    if (neto <= D.REGLAS.COTIZACION_UMBRAL) return { kind: 'info', msg: 'No llega a $10.000.000 netos: no se exigen 2 cotizaciones, pero guarda el respaldo del precio.' };
    if (cq.servicioTecnico) return { kind: 'ok', msg: 'Servicio técnico-profesional: no se exigen cotizaciones.' };
    if (L.cotizacionOk(cq)) return { kind: 'ok', msg: 'Cumple: 2 o más proveedores distintos.' };
    if (cq.autorizacion) return { kind: 'ok', msg: 'Tienes autorización previa de CORFO para comprar con menos cotizaciones.' };
    return { kind: 'bad', msg: 'Faltan cotizaciones: necesitas 2 proveedores distintos o la autorización previa de CORFO.' };
  }
  function cotDoc(p) {

      var blocks = [];
      p.cotizaciones.forEach(function (cq, i) { blocks.push({ t: 'h', text: (i + 1) + '. ' + (cq.descripcion || 'Compra') + ' · neto ' + U.fmtCLP(num(cq.neto)) }); blocks.push({ t: 'table', head: ['Proveedor', 'Monto neto ($)', 'Fecha'], types: ['text', 'money', 'date'], rows: (cq.cots || []).map(function (x) { return [x.proveedor, num(x.monto), x.fecha]; }) }); blocks.push({ t: 'p', text: 'Elección y motivo: ' + (cq.justificacion || '') + ' · ' + cotStatus(cq).msg }); });
      return { title: 'Cuadro comparativo de cotizaciones', subtitle: p.name, sheet: 'Cotizaciones', footer: 'Generado con Rinde Fácil. Guárdalo en el expediente junto con las cotizaciones originales.', blocks: blocks };
    
  }

  /* ================= Cotizaciones ================= */
  TOOLS.cotizaciones = { title: 'Cotizaciones', icon: 'scale', desc: 'Compara cotizaciones. Sobre $10 M netos se piden 2 de proveedores distintos.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('Cotizaciones', '', needProject(c));
    var root = h('div'), body = h('div');
    function paint() {
      U.clear(body);
      if (!p.cotizaciones.length) body.appendChild(UI.empty('Aún no registras compras grandes. Agrega la primera.'));
      p.cotizaciones.forEach(function (cq, i) {
        if (!Array.isArray(cq.cots)) cq.cots = [{}, {}];
        var st = h('div'); var refreshSt = function () { U.clear(st); var s = cotStatus(cq); st.appendChild(UI.callout(s.kind, '', s.msg)); };
        var rows = h('tbody');
        cq.cots.forEach(function (x, j) {
          rows.appendChild(h('tr', null, h('td', { 'data-label': 'Proveedor' }, UI.bind(x, 'proveedor', { type: 'text', aria: 'Proveedor', onChange: refreshSt })), h('td', { 'data-label': 'Monto neto' }, UI.bind(x, 'monto', { type: 'money', aria: 'Monto', onChange: refreshSt })), h('td', { 'data-label': 'Fecha' }, UI.bind(x, 'fecha', { type: 'date', aria: 'Fecha' })),
            h('td', { class: 'act' }, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar cotización', onclick: function () { cq.cots.splice(j, 1); RF.store.update(function () { }, { silent: true }); paint(); } }, UI.icon('trash', 18)))));
        });
        var expOpts = [{ id: '', name: 'Ninguno' }].concat(p.expenses.map(function (e) { return { id: e.id, name: (e.proveedor || 'Sin proveedor') + ' · ' + (e.folio || 's/n') + ' · ' + U.fmtCLP(e.total) }; }));
        body.appendChild(h('div', { class: 'stage-card' },
          h('div', { class: 'stage-head' }, h('span', { class: 'stage-n' }, 'Compra ' + (i + 1)), UI.bind(cq, 'descripcion', { type: 'text', ph: 'Qué vas a comprar o contratar', aria: 'Descripción de la compra', onChange: function () { } }),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitar compra', onclick: function () { p.cotizaciones.splice(i, 1); RF.store.update(function () { }, { silent: true }); paint(); } }, UI.icon('trash', 18))),
          h('div', { class: 'form-grid' }, UI.field('Monto neto de la compra ($)', cq, 'neto', { type: 'money', onChange: refreshSt }), UI.field('Gasto al que corresponde', cq, 'gastoId', { type: 'select', options: expOpts, noEmpty: true, onChange: refreshSt }),
            UI.field('Es servicio técnico-profesional (no pide cotizaciones)', cq, 'servicioTecnico', { type: 'check', onChange: refreshSt }), UI.field('Tengo autorización previa de CORFO', cq, 'autorizacion', { type: 'check', onChange: refreshSt })),
          h('div', { class: 'table-scroll' }, h('table', { class: 'edit-grid' }, h('thead', null, h('tr', null, ['Proveedor', 'Monto neto', 'Fecha', ''].map(function (x) { return h('th', null, x); }))), rows)),
          UI.btn('Agregar cotización', { icon: 'plus', cls: 'ghost', onclick: function () { cq.cots.push({}); RF.store.update(function () { }, { silent: true }); paint(); } }),
          UI.field('Por qué elegiste al proveedor', cq, 'justificacion', { type: 'textarea', rows: 2, cls: 'wide' }), st));
        refreshSt();
      });
      body.appendChild(UI.btn('Agregar compra', { icon: 'plus', cls: 'primary', onclick: function () { p.cotizaciones.push({ id: U.uid('q'), descripcion: '', neto: '', cots: [{}, {}], gastoId: '' }); RF.store.update(function () { }, { silent: true }); paint(); } }));
    }
    paint();
    root.appendChild(UI.callout('info', 'Regla (Manual p. 8):', ' sobre $10.000.000 netos se piden al menos 2 cotizaciones de proveedores distintos y no relacionados, salvo servicios técnico-profesionales. Con una o ninguna, pide autorización a CORFO antes de comprar. No dividas la compra para evitar el umbral.'));
    root.appendChild(UI.section('Tus compras', [body]));
    root.appendChild(UI.section('Sacar el cuadro comparativo', [UI.exportBar(function () { return cotDoc(p); }, 'cotizaciones')]));
    return page('Cotizaciones', 'Prueba que pagaste un precio de mercado.', root);
  } };

  /* ================= Ayudas rápidas ================= */
  TOOLS.verificador = { title: '¿Entra este gasto en fecha?', icon: 'clock', desc: 'Escribe la fecha del gasto y te decimos si cae dentro de tus fechas.', render: function () {
    var c = ctx(), p = c.project; if (!p) return page('¿Entra este gasto en fecha?', '', needProject(c));
    var st = { fecha: '', actId: '' }, out = h('div');
    function paint() {
      U.clear(out);
      if (!st.fecha) { out.appendChild(UI.empty('Elige la fecha del documento.')); return; }
      if (p.start && st.fecha < p.start) out.appendChild(UI.callout('bad', 'No entra:', ' es anterior al inicio del proyecto (' + U.fmtDate(p.start) + ').'));
      else if (p.end && st.fecha > p.end) out.appendChild(UI.callout('bad', 'No entra:', ' es posterior al término del proyecto (' + U.fmtDate(p.end) + ').'));
      else if (!p.start && !p.end) out.appendChild(UI.callout('warn', '', 'Faltan las fechas de tu proyecto. Agrégalas en «Mi comunidad y proyectos».'));
      else out.appendChild(UI.callout('ok', 'Dentro del proyecto.', ''));
      if (p.periodoInicio && p.periodoFin) {
        if (st.fecha >= p.periodoInicio && st.fecha <= p.periodoFin) out.appendChild(UI.callout('ok', 'Va en esta rendición', ' (' + U.fmtDateShort(p.periodoInicio) + ' al ' + U.fmtDateShort(p.periodoFin) + ').'));
        else out.appendChild(UI.callout('warn', 'Iría en otra rendición.', ' Un documento posterior al cierre va en la siguiente; uno anterior solo entra si no fue aprobado antes y no pasa el presupuesto.'));
      }
      if (st.actId) { var a = L.allActivities(p).filter(function (x) { return x.act.id === st.actId; })[0]; if (a && a.act.start && a.act.end) { if (st.fecha < a.act.start || st.fecha > a.act.end) out.appendChild(UI.callout('warn', '', 'La fecha cae fuera de la actividad «' + a.act.name + '» (' + U.fmtDateShort(a.act.start) + ' al ' + U.fmtDateShort(a.act.end) + ').')); else out.appendChild(UI.callout('ok', '', 'Cae dentro de la actividad «' + a.act.name + '».')); } }
    }
    var root = h('div', null, UI.section('Revisa una fecha', [h('div', { class: 'form-grid' }, UI.field('Fecha del documento', st, 'fecha', { type: 'date', onChange: paint }), UI.field('Actividad (opcional)', st, 'actId', { type: 'select', options: [{ id: '', name: 'Ninguna' }].concat(L.allActivities(p).map(function (x) { return { id: x.act.id, name: x.act.name || '(sin nombre)' }; })), noEmpty: true, onChange: paint })), out]));
    paint();
    return page('¿Entra este gasto en fecha?', 'Solo se rinden gastos dentro de la vigencia del convenio y del plazo del proyecto.', root);
  } };
  TOOLS.cuentas = { title: '¿En qué cuenta va?', icon: 'list', desc: 'Elige la cuenta correcta según lo que compraste.', render: function () {
    var items = [
      { q: 'Pago a una persona por su trabajo en el proyecto (sueldo u honorarios)', c: 'rrhh' }, { q: 'Materiales, insumos, arriendo, pasajes, alimentación o talleres de una actividad', c: 'operacion' },
      { q: 'Compra de un vehículo, maquinaria, computador, terreno o derechos de agua', c: 'inversion' }, { q: 'Luz, agua, internet, contador, secretaría u oficina que sirve a todos los proyectos', c: 'administracion' },
      { q: 'Viaje o viático', c: 'operacion', note: 'Dentro de la región, los traslados de los representantes van en administración.' }, { q: 'Servicio contratado a un tercero para una actividad', c: 'operacion' }
    ];
    var out = h('div'), root = h('div');
    function show(it) { U.clear(out); var cu = D.CUENTA_BY_ID[it.c]; out.appendChild(UI.callout('ok', 'Va en «' + cu.name + '».', ' ' + cu.desc + (it.note ? ' ' + it.note : ''))); }
    root.appendChild(UI.section('¿Qué compraste?', [h('div', { class: 'choice-list' }, items.map(function (it) { return h('button', { type: 'button', class: 'choice', onclick: function () { show(it); } }, it.q); })), out]));
    root.appendChild(UI.section('Las 4 cuentas', [h('div', { class: 'cards-2' }, D.CUENTAS.map(function (cu) { return h('div', { class: 'mini-card' }, h('strong', null, cu.name), h('p', null, cu.desc), h('p', { class: 'hint' }, 'Ej: ' + cu.ej)); }))]));
    return page('¿En qué cuenta va?', 'Cada gasto va en una de 4 cuentas (Manual, sección IX).', root);
  } };
  TOOLS.nofinanciable = { title: '¿Se puede pagar con el aporte?', icon: 'shield', desc: 'Revisa si el gasto está en la lista de lo que no se financia.', render: function () {
    var list = ['Impuestos que la comunidad recupera (por ejemplo, IVA crédito fiscal usado)', 'Bienes de capital que CORFO no considere determinantes para el proyecto', 'Deudas, dividendos o recuperación de capital', 'Compra de acciones, derechos sociales, bonos u otros valores', 'Derechos o multas', 'Gastos que no tienen relación con los proyectos del plan'];
    var st = {}, out = h('div');
    function paint() { U.clear(out); var n = list.filter(function (_, i) { return st['k' + i]; }).length; if (n) out.appendChild(UI.callout('bad', 'Probablemente NO se financia.', ' Marcaste ' + n + ' punto(s) de la lista del Manual. Consulta a CORFO antes de gastar.')); else out.appendChild(UI.callout('info', 'Ninguno marcado.', ' Entonces no está en la lista, pero esta ayuda solo orienta: CORFO decide en caso de duda.')); }
    var root = h('div', null, UI.section('Marca lo que aplique a tu gasto', [h('div', { class: 'checks' }, list.map(function (t, i) { return UI.field(t, st, 'k' + i, { type: 'check', onChange: paint }); })), out, h('div', { class: 'row-actions' }, UI.btn('Preparar una consulta a CORFO', { icon: 'help', onclick: function () { location.hash = '#/h/consulta'; } }))]));
    paint();
    return page('¿Se puede pagar con el aporte?', 'El Manual (sección VI) lista lo que no se financia. La única excepción es invertir excedentes en renta fija con aprobación previa de CORFO.', root);
  } };
  TOOLS.plazos = { title: 'Calculadora de plazos', icon: 'clock', desc: 'PEA (90 + 30 días) y aclaración de observaciones (10 días hábiles).', render: function () {
    var s = RF.store.get(), st = { pago: '', obs: U.todayISO() }, o1 = h('div'), o2 = h('div');
    function p1() { U.clear(o1); if (!st.pago) return; var pd = L.peaDeadline({ desembolso1: st.pago }, U.todayISO()); o1.appendChild(UI.callout(pd.diasRestantes < 0 ? 'warn' : 'ok', 'El PEA vence el ' + U.fmtDate(pd.fin) + '.', ' Con la prórroga única (hasta 30 días, pedida antes del vencimiento): ' + U.fmtDate(pd.finProrroga) + '.')); }
    function p2() { U.clear(o2); if (!st.obs) return; var lim = L.aclaracionDeadline(st.obs, RF.holidays.all()); o2.appendChild(UI.callout('info', 'Tienes hasta el ' + U.fmtDate(lim) + '.', ' Son 10 días hábiles desde que CORFO comunicó las observaciones' + (s.holidays.length ? ' (descontando tus feriados).' : ' (sin feriados: agrégalos en «Mi comunidad y proyectos»).') + ' La aclaración se hace una sola vez.')); }
    var root = h('div', null, UI.section('Plazo del PEA', [UI.field('Fecha del primer pago (30 %)', st, 'pago', { type: 'date', onChange: p1 }), o1]), UI.section('Plazo para aclarar observaciones', [UI.field('Fecha en que CORFO comunicó las observaciones', st, 'obs', { type: 'date', onChange: p2 }), o2]));
    p1(); p2();
    return page('Calculadora de plazos', 'Los plazos que aparecen en los documentos del convenio.', root);
  } };

  /* ================= Consulta y solicitud (formularios) ================= */

  /* ================= Anexos y fichas ================= */
  function formTool(id, icon, desc, lead) {
    var sc = RF.forms.SCHEMAS[id];
    TOOLS[id] = { title: sc.title, icon: icon, desc: desc, render: function () { var c = ctx(); if (!c.project) return page(sc.title, '', needProject(c)); return page(sc.title, lead, sc.repeat ? RF.forms.renderRepeat(id, c) : RF.forms.renderSingle(id, c)); } };
  }
  formTool('anexo1', 'form', 'Declaración: no usaste el IVA crédito fiscal.', 'Se rellena con los datos de tu comunidad y proyecto. Revísalo y fírmalo.');
  formTool('anexo2', 'form', 'Declaración de IVA que no es de este proyecto.', 'Anota cada factura cuyo IVA no corresponde al proyecto.');
  formTool('anexo3', 'form', 'Quien recibe un pago en efectivo firma que le pagaron.', 'Crea una declaración por cada pago en efectivo. Si eliges el gasto, se rellena sola.');
  formTool('anexo4', 'form', 'Certificado de viático: viajero, destino, días y monto.', 'Un certificado por cada persona que viaja.');
  formTool('anexo5', 'form', 'Qué parte de cada gasto de administración es del proyecto.', 'Calcula solo el monto que corresponde según el porcentaje de uso. Si recuperas IVA, anota el neto.');
  TOOLS.informe = { title: 'Informe técnico (Anexo 6)', icon: 'form', desc: 'Datos generales, objetivos, resumen y todas las fichas en un solo informe.', render: function () {
    var c = ctx(); if (!c.project) return page('Informe técnico', '', needProject(c));
    var root = h('div');
    var tipo = D.TIPOS_PROYECTO.filter(function (t) { return t.id === c.project.tipo; })[0];
    if (tipo && tipo.informe === 'anexo5') root.appendChild(UI.callout('warn', 'Tu proyecto es de Administración.', ' Para este tipo, el «informe» que se presenta es la memoria de cálculo (Anexo 5), no el Anexo 6.'));
    root.appendChild(RF.forms.renderSingle('informe', c));
    var kinds = [['informeA', 'A · Actividades de la comunidad'], ['informeB', 'B · Estudios y consultorías'], ['informeC', 'C · Infraestructura y activos'], ['informeD', 'D · Personas contratadas'], ['informeE', 'E · Otras actividades']];
    root.appendChild(UI.section('Fichas del informe', [h('div', { class: 'cards-2' }, kinds.map(function (k) { var n = RF.forms.getList(c.project, k[0]).length; return h('a', { class: 'mini-card link', href: '#/h/' + k[0] }, h('strong', null, k[1]), h('p', { class: 'hint' }, n ? n + ' ficha(s)' : 'Sin fichas aún')); }))]));
    root.appendChild(UI.section('Informe completo', [UI.exportBar(function () { return RF.forms.informeCompleto(c); }, 'informe-tecnico')]));
    return page('Informe técnico (Anexo 6)', 'Cabecera del informe. Las fichas de cada actividad se llenan aparte y se juntan aquí.', root);
  } };
  formTool('informeA', 'form', 'Talleres, capacitaciones y visitas.', 'Una ficha por actividad. Si eliges la actividad de tu Gantt, los montos se rellenan solos.');
  formTool('informeB', 'form', 'Estudios y consultorías contratadas.', 'Una ficha por estudio.');
  formTool('informeC', 'form', 'Obras, inmuebles y compra de activos.', 'Una ficha por activo u obra. Recuerda las fotos y los permisos.');
  formTool('informeD', 'form', 'Una ficha por persona contratada.', 'Nombre, RUT, meses, montos y función.');
  formTool('informeE', 'form', 'Actividades que no calzan en las otras fichas.', 'Descripción, proveedor, montos y fechas.');
  formTool('consulta', 'help', 'Redacta tu duda con los hechos, la norma y el impacto.', 'Mejor preguntar antes de gastar. Guarda la respuesta en tu expediente.');
  formTool('solicitud', 'file', 'Borrador de la solicitud cuando CORFO cierre tu rendición.', 'Se pide después de que CORFO finaliza la revisión de tu rendición.');
  formTool('peaGeneral', 'form', 'PEA · información general.', '');
  formTool('peaProyecto', 'form', 'PEA · un formulario por proyecto.', '');

  RF.plan = { ganttDoc: ganttDoc, budgetDoc: budgetDoc, ganttMonths: ganttMonths, peaDoc: peaDoc, reitemDoc: reitemDoc, cotDoc: cotDoc };
})(typeof window !== 'undefined' ? window : globalThis);
