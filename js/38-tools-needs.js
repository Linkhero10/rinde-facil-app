/* Rinde Fácil — herramienta «Qué necesitará tu proyecto». */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, D = RF.data, L = RF.logic, h = U.h;
  var TOOLS = RF.tools = RF.tools || {};

  function tramitesOf(needId) {
    var out = [];
    Object.keys(RF.needs.APPLIES).forEach(function (tid) { if (RF.needs.APPLIES[tid].indexOf(needId) >= 0 && RF.tramites.byId[tid]) out.push(RF.tramites.byId[tid].title); });
    return out;
  }
  function countApplicable(p) {
    var total = 0, mine = 0, hidden = [];
    D.FASES.forEach(function (f) { f.items.forEach(function (tid) {
      var t = RF.tramites.byId[tid]; if (!t || t.kind === 'paso') return;
      total++; if (L.applies(p, tid)) mine++; else hidden.push(t.title);
    }); });
    return { total: total, mine: mine, hidden: hidden };
  }

  /* «Ver formato»: muestra cómo queda el documento, sin salir del trámite */
  RF.docs = {
    hasPreview: function (tid) { return !!(RF.forms.SCHEMAS[tid] || { gantt: 1, presupuesto: 1, pea: 1, reitem: 1, cotizaciones: 1, informe: 1 }[tid]); },
    model: function (tid) {
      var ctx = RF.forms.ctxNow(), p = ctx.project; if (!p) return null;
      if (tid === 'gantt') return RF.plan.ganttDoc(p, ctx.community);
      if (tid === 'presupuesto') return RF.plan.budgetDoc(p, ctx.community);
      if (tid === 'pea') return RF.plan.peaDoc(p, ctx);
      if (tid === 'reitem') return RF.plan.reitemDoc(p, ctx);
      if (tid === 'cotizaciones') return RF.plan.cotDoc(p);
      if (tid === 'informe') return RF.forms.informeCompleto(ctx);
      var sc = RF.forms.SCHEMAS[tid]; if (!sc) return null;
      if (sc.repeat) { var list = RF.forms.getList(p, tid); return list.length ? RF.forms.combinedDoc(tid, list, ctx) : RF.forms.docOf(tid, sc.defaults(ctx), ctx); }
      return RF.forms.docOf(tid, RF.forms.getSingle(p, tid), ctx);
    },
    preview: function (tid) { var d = null; try { d = RF.docs.model(tid); } catch (e) { d = null; } if (!d) { UI.toast('Primero crea tu proyecto para ver el formato.', 'bad'); return; } RF.exp.printDoc(d); }
  };

  TOOLS.necesidades = { title: 'Qué necesitará tu proyecto', icon: 'list', desc: 'Marca lo que vas a necesitar (viáticos, insumos, inmuebles…) y te mostramos solo los trámites que te tocan.', render: function () {
    var p = RF.store.project();
    var root = h('div', { class: 'tool-page' }, h('h2', { class: 'tool-title' }, 'Qué necesitará tu proyecto'));
    if (!p) { root.appendChild(UI.callout('warn', 'Primero crea tu proyecto.', ' Ve a «Mi comunidad y proyectos» y agrega el primero.')); return root; }
    var body = h('div');
    function silent() { RF.store.update(function () { }, { silent: true }); if (RF.views && RF.views.refreshSide) RF.views.refreshSide(); }
    function nowIso() { return new Date().toISOString(); }

    function setNeed(id, on) {
      p.needs = p.needs || {}; p.needs[id] = on; p.needsSet = true;
      p.needsAdded = p.needsAdded || [];
      if (on && p.peaAprobado && p.needsPea && !p.needsPea[id] && !p.needsAdded.some(function (a) { return a.id === id; })) p.needsAdded.push({ id: id, at: nowIso() });
      if (!on) p.needsAdded = p.needsAdded.filter(function (a) { return a.id !== id; });
      silent(); paint();
    }
    function paint() {
      U.clear(body);
      var dv = RF.needs.derivedFromExpenses(p);
      body.appendChild(h('p', { class: 'lead' }, 'Marca lo que dice tu PEA que vas a necesitar en este proyecto. Con eso, la app te muestra solo los trámites que te tocan y esconde el resto. Lo puedes cambiar cuando quieras.'));

      /* estado del PEA */
      var apr = h('input', { type: 'checkbox', id: 'peaapr', checked: !!p.peaAprobado, disabled: !p.needsSet && !p.peaAprobado });
      apr.addEventListener('change', function () {
        p.peaAprobado = apr.checked;
        if (apr.checked) { p.needsPea = JSON.parse(JSON.stringify(p.needs || {})); p.needsAdded = []; if (!p.peaAprobadoAt) p.peaAprobadoAt = U.todayISO(); }
        else { p.needsPea = null; p.needsAdded = []; }
        silent(); paint();
      });
      body.appendChild(UI.section('¿Tu PEA ya está aprobado?', [
        h('label', { class: 'check', for: 'peaapr' }, apr, h('span', null, 'Mi PEA ya fue aprobado por CORFO')),
        p.needsSet ? null : h('p', { class: 'hint' }, 'Primero marca abajo lo que dice tu PEA. Después podrás indicar que ya fue aprobado; desde ahí, todo lo que agregues se anotará como un cambio.'),
        p.peaAprobado ? UI.field('Fecha de aprobación', p, 'peaAprobadoAt', { type: 'date', onChange: silent }) : null,
        p.peaAprobado ? h('p', { class: 'hint' }, 'Lo que marcaste hasta ahora quedó como «lo que dice tu PEA». Si agregas algo nuevo, te avisamos qué hacer.') : null]));

      /* lista de necesidades por grupo */
      var groups = {}, order = [];
      RF.needs.NEEDS.forEach(function (n) { if (!groups[n.group]) { groups[n.group] = []; order.push(n.group); } groups[n.group].push(n); });
      order.forEach(function (g) {
        body.appendChild(UI.section(g, groups[g].map(function (n) {
          var forced = !!dv[n.id] && !(p.needs && p.needs[n.id]);
          var on = !!(p.needs && p.needs[n.id]) || forced;
          var cb = h('input', { type: 'checkbox', id: 'need-' + n.id, checked: on, disabled: forced });
          cb.addEventListener('change', function () { setNeed(n.id, cb.checked); });
          var tr = tramitesOf(n.id);
          var isNew = (p.needsAdded || []).some(function (a) { return a.id === n.id; });
          return h('div', { class: 'need' + (on ? ' on' : '') + (isNew ? ' new' : '') },
            h('label', { class: 'check', for: 'need-' + n.id }, cb, h('span', null, h('strong', null, n.name), h('span', { class: 'need-help' }, ' ' + n.help))),
            tr.length && on ? h('div', { class: 'need-tr' }, 'Te aparecerá: ' + tr.join(' · ')) : null,
            forced ? h('div', { class: 'need-tr' }, 'Ya anotaste gastos de esto, así que se cuenta aunque no lo marques.') : null,
            isNew ? h('div', { class: 'need-new' }, 'Agregado después de aprobado el PEA') : null);
        })));
      });

      /* otras cosas */
      var inp = h('input', { type: 'text', placeholder: 'Ej: compra de semillas para el vivero', 'aria-label': 'Otra cosa que necesitará el proyecto' });
      body.appendChild(UI.section('¿Algo más?', [
        h('p', { class: 'hint' }, 'Anota aquí lo que no está en la lista. No cambia los trámites que te tocan, pero queda registrado.'),
        h('div', { class: 'inline-add' }, inp, UI.btn('Agregar', { icon: 'plus', onclick: function () { var v = inp.value.trim(); if (!v) return; p.needsCustom = p.needsCustom || []; p.needsCustom.push({ name: v, at: nowIso(), afterPea: !!p.peaAprobado }); p.needsSet = true; silent(); paint(); } })),
        h('ul', { class: 'need-custom' }, (p.needsCustom || []).map(function (c, i) {
          return h('li', null, h('span', null, c.name + (c.afterPea ? '  ·  agregado después de aprobado el PEA' : '')), UI.btn('Quitar', { cls: 'ghost small', onclick: function () { p.needsCustom.splice(i, 1); silent(); paint(); } }));
        }))]));

      /* aviso de cambios respecto al PEA */
      var changed = (p.needsAdded || []).length || (p.needsCustom || []).some(function (c) { return c.afterPea; });
      if (changed) {
        body.appendChild(h('section', { class: 'card warn-card' },
          h('h3', { class: 'card-title' }, 'Esto no estaba en tu PEA aprobado'),
          h('ul', null, (p.needsAdded || []).map(function (a) { return h('li', null, (RF.needs.BY_ID[a.id] || { name: a.id }).name); }).concat((p.needsCustom || []).filter(function (c) { return c.afterPea; }).map(function (c) { return h('li', null, c.name); }))),
          h('p', null, 'Antes de gastar en algo que tu PEA no contempla, conviene modificar el PEA. Según los documentos del convenio, un proyecto puede cambiar en tiempo, actividades y presupuesto si la comunidad lo pide: la reitemización agrega actividades o cambia fechas y presupuesto; la reprogramación cambia solo los plazos.'),
          h('p', null, 'En los informes del Organismo Colaborador, los cambios al PEA se aprueban en asamblea y se envían a CORFO con el acta; después se configuran en SGP (a veces con un Acta de No Objeción de CORFO). Confirma el paso exacto con tu ejecutivo técnico.'),
          h('div', { class: 'row-actions' },
            UI.btn('Preparar la solicitud de cambio', { icon: 'edit', cls: 'primary', onclick: function () { location.hash = '#/h/reitem?from=TRM-028'; } }),
            UI.btn('Ver el trámite «Cambiar el PEA»', { icon: 'route', onclick: function () { location.hash = '#/t/TRM-028'; } }),
            UI.btn('Guardar el acta o la respuesta de CORFO', { icon: 'file', onclick: function () { location.hash = '#/h/documentos'; } }))));
      }

      /* resumen */
      var c = countApplicable(p);
      body.appendChild(UI.section('Lo que te toca', [
        p.needsSet ? h('p', { class: 'big-line' }, 'Te tocan ', h('strong', null, String(c.mine)), ' de ' + c.total + ' trámites.') : UI.callout('info', 'Todavía no marcas nada:', ' mientras tanto te mostramos todos los trámites.'),
        c.hidden.length && p.needsSet ? h('details', null, h('summary', null, 'Trámites que no te aparecerán por ahora (' + c.hidden.length + ')'), h('ul', null, c.hidden.map(function (t) { return h('li', null, t); })), h('p', { class: 'hint' }, 'Si alguno sí te toca, puedes abrirlo igual desde el menú y marcar «Me toca igual».')) : null,
        h('div', { class: 'row-actions' }, UI.btn('Listo, ver mi ruta', { icon: 'route', cls: 'primary', onclick: function () { location.hash = '#/'; } }))]));
    }
    paint();
    root.appendChild(body);
    return root;
  } };
})(typeof window !== 'undefined' ? window : globalThis);
