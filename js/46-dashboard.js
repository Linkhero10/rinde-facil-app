/* Rinde Fácil — «Tu proyecto en un vistazo» (Mi ruta) y la celebración al terminar.
 * Identidad del panel: denso y numérico (cifras tabulares), sin adornos; cada gráfico responde a lo que tocas (la cuenta y el mes elegidos
 * filtran la lista de gastos y resaltan los otros gráficos). Las barras crecen una vez al abrir; con «menos movimiento» aparecen quietas. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, L = RF.logic, D = RF.data, h = U.h;
  var NS = 'http://www.w3.org/2000/svg';
  var COLOR = { rrhh: 'var(--action)', operacion: 'var(--info)', inversion: 'var(--ok)', administracion: 'var(--warn)' };
  var MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function num(x) { return Number(x) || 0; }
  function reduced() { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function svg(tag, attrs, kids) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); (kids || []).forEach(function (c) { if (c) e.appendChild(c); }); return e; }
  function money(n) { return U.fmtCLP(n); }
  function monthLabel(m) { return LONG[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4); }

  /* un solo globo de ayuda para todo el panel */
  var tip = null;
  function showTip(ev, lines) {
    if (!tip) { tip = h('div', { class: 'dash-tip', role: 'tooltip' }); document.body.appendChild(tip); }
    U.clear(tip); lines.forEach(function (l, i) { tip.appendChild(i === 0 ? h('strong', null, l) : h('div', null, l)); });
    tip.hidden = false;
    var r = ev.target && ev.target.getBoundingClientRect ? ev.target.getBoundingClientRect() : { left: ev.clientX, top: ev.clientY, width: 0, height: 0 };
    var x = ev.clientX && ev.type !== 'focus' ? ev.clientX : r.left + r.width / 2, y = ev.clientY && ev.type !== 'focus' ? ev.clientY : r.top;
    tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, x - tip.offsetWidth / 2)) + 'px'; tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  function statusOf(e, p, community) {
    var r = L.evaluateExpense(e, p, community, p.expenses || []);
    return r.issues.some(function (i) { return i.level === 'error'; }) ? { id: 'error', label: 'Pendiente' } : r.issues.some(function (i) { return i.level === 'warn'; }) ? { id: 'warn', label: 'Revisar' } : { id: 'ok', label: 'Listo' };
  }

  /* ¿terminó todo y está todo bien? (todos los pasos y ningún error en la revisión) */
  function isComplete(p, s) {
    if (!p) return false;
    var prog = L.progress(p); if (!(prog.total > 0) || prog.done < prog.total) return false;
    var res = L.reconcile(p, s.community, U.todayISO(), RF.holidays.all());
    return !res.groups.some(function (g) { return g.items.some(function (i) { return i.level === 'error'; }); });
  }

  function render(p, s, info) {
    var community = s.community, prog = info.prog, res = info.res, tot = L.totalsByCuenta(p), expenses = (p.expenses || []).filter(function (e) { return e && (e.proveedor || e.total); });
    var st = { cuenta: '', month: '' }, box = h('section', { class: 'dash', 'aria-label': 'Tu proyecto en un vistazo' });
    var flagged = res.groups.reduce(function (a, g) { return a.concat(g.items.filter(function (i) { return i.level === 'error' || i.level === 'warn'; })); }, []);
    var errors = flagged.filter(function (i) { return i.level === 'error'; }).length;
    var rendidoTotal = D.CUENTAS.reduce(function (a, c) { return a + tot[c.id].rendido; }, 0), aprobadoTotal = D.CUENTAS.reduce(function (a, c) { return a + tot[c.id].aprobado; }, 0);
    var porRevisar = expenses.filter(function (e) { return statusOf(e, p, community).id !== 'ok'; }).length;

    /* --- cifras --- */
    function tile(label, big, small, tone) { return h('div', { class: 'dash-tile' + (tone ? ' ' + tone : '') }, h('span', { class: 'dt-l' }, label), h('span', { class: 'dt-n' }, big), h('span', { class: 'dt-s' }, small)); }
    var stats = h('div', { class: 'dash-tiles' },
      tile('Ruta', prog.tramTotal ? Math.round(prog.tramDone * 100 / prog.tramTotal) + ' %' : '0 %', prog.tramDone + ' de ' + prog.tramTotal + ' trámites listos'),
      tile('Rendido', money(rendidoTotal), aprobadoTotal ? 'de ' + money(aprobadoTotal) + ' aprobados (' + Math.round(rendidoTotal * 100 / aprobadoTotal) + ' %)' : 'anota lo aprobado en cada cuenta'),
      tile('Gastos anotados', String(expenses.length), porRevisar ? porRevisar + ' por revisar' : 'todos listos', porRevisar ? 'warn' : 'ok'),
      tile('Revisión', errors ? errors + (errors === 1 ? ' error' : ' errores') : flagged.length ? flagged.length + ' avisos' : 'Sin problemas', errors ? 'corrígelos antes de enviar' : flagged.length ? 'conviene revisarlos' : 'todo calza', errors ? 'bad' : flagged.length ? 'warn' : 'ok'));

    /* --- fases --- */
    var phases = h('div', { class: 'dash-phases', role: 'list', 'aria-label': 'Avance por fase' }, D.FASES.map(function (f) {
      var pf = prog.porFase[f.id], pct = pf.tramTotal ? Math.round(pf.tramDone * 100 / pf.tramTotal) : 0;
      var a = h('a', { class: 'dash-phase' + (f.id === prog.faseActual ? ' now' : '') + (pf.complete ? ' done' : ''), href: '#/f/' + f.id, role: 'listitem', 'aria-label': 'Fase ' + f.n + ' ' + f.name + ': ' + pf.tramDone + ' de ' + pf.tramTotal }, h('span', { class: 'dp-n' }, String(f.n)), h('span', { class: 'dp-t' }, f.short), h('span', { class: 'dp-bar' }, h('i', { style: { width: pct + '%' } })), h('span', { class: 'dp-c' }, pf.tramDone + '/' + pf.tramTotal));
      a.addEventListener('mousemove', function (ev) { showTip(ev, ['Fase ' + f.n + ': ' + f.name, pf.tramDone + ' de ' + pf.tramTotal + ' trámites listos', 'Toca para abrirla']); }); a.addEventListener('mouseleave', hideTip); a.addEventListener('focus', function (ev) { showTip(ev, ['Fase ' + f.n + ': ' + f.name, pf.tramDone + ' de ' + pf.tramTotal + ' trámites listos']); }); a.addEventListener('blur', hideTip);
      return a;
    }));

    /* --- plata por cuenta --- */
    var acct = h('div', { class: 'dash-accts' }), chart = h('div', { class: 'dash-chart' }), list = h('div', { class: 'dash-list' }), legend = h('div', { class: 'dash-legend' });
    function monthsOf() {
      var seen = {}; expenses.forEach(function (e) { var m = String(e.fecha || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m)) seen[m] = true; });
      var keys = Object.keys(seen).sort(); if (!keys.length) return [];
      var out = [], cur = keys[0], end = keys[keys.length - 1];
      while (cur <= end && out.length < 60) { out.push(cur); var y = +cur.slice(0, 4), m = +cur.slice(5, 7); m++; if (m > 12) { m = 1; y++; } cur = y + '-' + (m < 10 ? '0' : '') + m; }
      return out;
    }
    function paintAccts() {
      U.clear(acct);
      D.CUENTAS.forEach(function (c) {
        var t = tot[c.id], scale = Math.max(t.aprobado, t.rendido, 1), over = t.aprobado > 0 && t.rendido > t.aprobado + 1, pct = t.aprobado ? Math.round(t.rendido * 100 / t.aprobado) : null;
        var fill = h('i', { class: 'da-fill' + (over ? ' over' : ''), style: { width: '0%', background: COLOR[c.id] } });
        var row = h('button', { type: 'button', class: 'dash-acct' + (st.cuenta === c.id ? ' on' : '') + (st.cuenta && st.cuenta !== c.id ? ' dim' : ''), 'aria-pressed': st.cuenta === c.id ? 'true' : 'false', onclick: function () { st.cuenta = st.cuenta === c.id ? '' : c.id; paintAll(false); } },
          h('span', { class: 'da-name' }, h('span', { class: 'da-sw', style: { background: COLOR[c.id] } }), c.name),
          h('span', { class: 'da-bar' }, fill, t.aprobado ? h('b', { class: 'da-mark', style: { left: Math.min(100, t.aprobado * 100 / scale) + '%' }, title: 'Aprobado' }) : null),
          h('span', { class: 'da-txt' }, money(t.rendido), t.aprobado ? h('span', { class: 'muted' }, ' de ' + money(t.aprobado) + (pct != null ? ' · ' + pct + ' %' : '')) : h('span', { class: 'muted' }, ' · sin monto aprobado'), over ? h('span', { class: 'da-over' }, 'Pasa lo aprobado') : null));
        row.addEventListener('mousemove', function (ev) { showTip(ev, [c.name, 'Rendido: ' + money(t.rendido) + ' (' + t.cantidad + (t.cantidad === 1 ? ' gasto' : ' gastos') + ')', 'Aprobado: ' + money(t.aprobado), 'Presupuestado en tu PEA: ' + money(t.presupuestado), 'Toca para filtrar']); }); row.addEventListener('mouseleave', hideTip);
        acct.appendChild(row);
        var w = Math.min(100, t.rendido * 100 / scale), target = w + '%';
        if (reduced() || !first) fill.style.width = target; else requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = target; }); });
      });
    }
    function paintLegend() {
      U.clear(legend);
      if (st.cuenta || st.month) legend.appendChild(UI.btn('Quitar filtros', { cls: 'ghost small', onclick: function () { st.cuenta = ''; st.month = ''; paintAll(false); } }));
      legend.appendChild(h('span', { class: 'muted' }, st.cuenta || st.month ? 'Filtrando: ' + [st.cuenta ? D.CUENTA_BY_ID[st.cuenta].name : '', st.month ? monthLabel(st.month) : ''].filter(Boolean).join(' · ') : 'Toca una cuenta o un mes para filtrar la lista de gastos.'));
    }
    /* gasto mes a mes: muestra una ventana de meses (los últimos 12 o todos); con más meses se desliza con las flechas o con el scroll */
    function compact(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(Math.round(n)); }
    function paintChart() {
      U.clear(chart);
      var all = monthsOf();
      if (!all.length) { chart.appendChild(UI.empty('Cuando anotes gastos con su fecha, aquí ves cuánto rendiste cada mes.')); return; }
      if (st.range == null) st.range = all.length > 12 ? '12' : 'todo';
      var win = st.range === '12' && all.length > 12;
      if (win) { if (st.start == null) st.start = all.length - 12; st.start = Math.max(0, Math.min(all.length - 12, st.start)); }
      var months = win ? all.slice(st.start, st.start + 12) : all;
      var sums = {}; all.forEach(function (m) { sums[m] = {}; D.CUENTAS.forEach(function (c) { sums[m][c.id] = 0; }); });
      expenses.forEach(function (e) { var m = String(e.fecha || '').slice(0, 7); if (sums[m] && sums[m][e.cuenta] != null) sums[m][e.cuenta] += num(e.montoRendir || e.total); });
      var totals = months.map(function (m) { return D.CUENTAS.reduce(function (a, c) { return a + sums[m][c.id]; }, 0); }), max = Math.max.apply(null, totals.concat([1]));
      /* controles: rango y flechas */
      if (all.length > 12) {
        chart.appendChild(h('div', { class: 'dash-range' },
          win ? h('button', { type: 'button', class: 'cal-arrow', 'aria-label': 'Meses anteriores', disabled: st.start <= 0, onclick: function () { st.start -= 3; paintChart(); } }, '‹') : null,
          win ? h('button', { type: 'button', class: 'cal-arrow', 'aria-label': 'Meses siguientes', disabled: st.start >= all.length - 12, onclick: function () { st.start += 3; paintChart(); } }, '›') : null,
          h('span', { class: 'muted' }, monthLabel(months[0]) + ' a ' + monthLabel(months[months.length - 1])),
          h('div', { class: 'seg', role: 'group', 'aria-label': 'Cuántos meses ver' }, h('button', { type: 'button', 'aria-pressed': win ? 'true' : 'false', onclick: function () { st.range = '12'; st.start = all.length - 12; paintChart(); } }, 'Últimos 12'), h('button', { type: 'button', 'aria-pressed': win ? 'false' : 'true', onclick: function () { st.range = 'todo'; paintChart(); } }, 'Todo'))));
      }
      var bw = 34, gap = 14, left = 58, top = 14, base = 168, ph = base - top, W = left + months.length * (bw + gap) + 6, H = 212;
      var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'dash-svg', role: 'group', 'aria-label': 'Gastos rendidos por mes' });
      [0, 0.5, 1].forEach(function (f) {
        g.appendChild(svg('line', { x1: left - 6, x2: W, y1: base - ph * f, y2: base - ph * f, class: 'dash-grid' }));
        var lab = svg('text', { x: left - 12, y: base - ph * f + 4, 'text-anchor': 'end', class: 'dash-axis' }); lab.textContent = f === 0 ? '$ 0' : '$ ' + compact(max * f); g.appendChild(lab);
      });
      var nowM = U.todayISO().slice(0, 7);
      months.forEach(function (m, i) {
        var x = left + i * (bw + gap), y = base, mm = m.slice(5, 7);
        var grp = svg('g', { class: 'dash-bar' + (st.month === m ? ' on' : '') + (st.month && st.month !== m ? ' dim' : ''), tabindex: '0', role: 'button', 'aria-label': monthLabel(m) + ': ' + money(totals[i]), 'aria-pressed': st.month === m ? 'true' : 'false' });
        D.CUENTAS.forEach(function (c) {
          var v = sums[m][c.id]; if (!v) return;
          var hh = Math.max(3, v * ph / max); y -= hh;
          grp.appendChild(svg('rect', { x: x, y: y, width: bw, height: hh, rx: 2, style: 'fill:' + COLOR[c.id] + ';opacity:' + (st.cuenta && st.cuenta !== c.id ? '.22' : '1') }));
        });
        grp.appendChild(svg('rect', { x: x - 3, y: top, width: bw + 6, height: H - top, fill: 'transparent', class: 'dash-hit' }));
        var t = svg('text', { x: x + bw / 2, y: base + 16, 'text-anchor': 'middle', class: 'dash-axis' + (m === nowM ? ' now' : '') }); t.textContent = MONTHS[+mm - 1]; grp.appendChild(t);
        if (!totals[i]) { grp.appendChild(svg('line', { x1: x + 6, x2: x + bw - 6, y1: base - 1, y2: base - 1, class: 'dash-zero' })); }
        /* el año se escribe completo en la primera barra y cada enero, con una raya que separa los años */
        if (mm === '01' || i === 0) {
          if (mm === '01' && i > 0) g.appendChild(svg('line', { x1: x - gap / 2, x2: x - gap / 2, y1: top, y2: H - 6, class: 'dash-year-line' }));
          var yr = svg('text', { x: mm === '01' && i > 0 ? x - gap / 2 + 6 : x, y: base + 34, 'text-anchor': 'start', class: 'dash-year' }); yr.textContent = m.slice(0, 4); g.appendChild(yr);
        }
        function lines() { return [monthLabel(m) + ': ' + money(totals[i])].concat(D.CUENTAS.filter(function (c) { return sums[m][c.id]; }).map(function (c) { return c.name + ': ' + money(sums[m][c.id]); })).concat(['Toca para filtrar la lista']); }
        grp.addEventListener('mousemove', function (ev) { showTip(ev, lines()); }); grp.addEventListener('mouseleave', hideTip); grp.addEventListener('focus', function (ev) { showTip(ev, lines()); }); grp.addEventListener('blur', hideTip);
        function pick() { st.month = st.month === m ? '' : m; paintAll(false); }
        grp.addEventListener('click', pick); grp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
        g.appendChild(grp);
      });
      var wrap = h('div', { class: 'dash-scroll' }); wrap.appendChild(g); chart.appendChild(wrap);
      if (!win) [0, 80, 250].forEach(function (ms) { setTimeout(function () { if (wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = wrap.scrollWidth; }, ms); }); /* con todos los meses, se parte viendo lo más reciente */
      chart.appendChild(h('div', { class: 'dash-keys' }, D.CUENTAS.map(function (c) { return h('span', null, h('i', { style: { background: COLOR[c.id] } }), c.name); })));
    }
    function paintList() {
      U.clear(list);
      var rows = expenses.filter(function (e) { return (!st.cuenta || e.cuenta === st.cuenta) && (!st.month || String(e.fecha || '').slice(0, 7) === st.month); }).sort(function (a, b) { return String(b.fecha || '') < String(a.fecha || '') ? -1 : 1; });
      list.appendChild(h('h3', { class: 'dash-h' }, 'Gastos' + (st.cuenta || st.month ? ' filtrados' : ' recientes'), h('span', { class: 'muted' }, ' · ' + rows.length)));
      if (!rows.length) { list.appendChild(UI.empty(expenses.length ? 'Ningún gasto con ese filtro.' : 'Todavía no anotas gastos.')); return; }
      var ul = h('ul', { class: 'dash-rows' });
      rows.slice(0, 8).forEach(function (e) {
        var s2 = statusOf(e, p, community), cu = D.CUENTA_BY_ID[e.cuenta];
        ul.appendChild(h('li', null, h('a', { href: '#/h/gastos', onclick: function () { if (RF.app) RF.app.pendingEdit = e.id; }, class: 'dr-link' },
          h('span', { class: 'dr-d' }, e.fecha ? U.fmtDateShort(e.fecha) : 's/f'), h('span', { class: 'dr-p' }, e.proveedor || 'Sin proveedor', h('span', { class: 'muted' }, ' · ' + (((D.DOC_BY_ID[e.docType] || {}).name || '') + (e.folio ? ' N° ' + e.folio : '')))),
          h('span', { class: 'dr-c' }, h('i', { style: { background: COLOR[e.cuenta] || 'var(--muted)' } }), cu ? cu.name : ''), h('span', { class: 'dr-m' }, money(num(e.montoRendir || e.total))), h('span', { class: 'chip-s ' + s2.id }, s2.label))));
      });
      list.appendChild(ul);
      list.appendChild(h('div', { class: 'row-actions' }, h('a', { class: 'btn ghost small', href: '#/h/gastos' }, 'Ver todos los gastos'), rows.length > 8 ? h('span', { class: 'muted' }, 'Se muestran 8 de ' + rows.length) : null));
    }
    var first = true;
    function paintAll(isFirst) { first = !!isFirst; paintAccts(); paintLegend(); paintChart(); paintList(); first = false; }

    /* --- lo que falta --- */
    var todo = h('div', { class: 'dash-todo' }, h('h3', { class: 'dash-h' }, 'Lo que falta resolver'));
    if (!flagged.length) todo.appendChild(h('p', { class: 'dash-ok' }, 'Nada pendiente por ahora: lo anotado calza.'));
    else {
      var ul2 = h('ul', { class: 'dash-rows' });
      flagged.slice(0, 5).forEach(function (i) { ul2.appendChild(h('li', null, h('span', { class: 'todo-i ' + i.level }, i.level === 'error' ? 'Error' : 'Aviso'), h('span', { class: 'todo-m' }, i.msg), RF.rendicion && RF.rendicion.fixTarget(i.fix) ? h('a', { class: 'btn ghost small', href: RF.rendicion.fixTarget(i.fix) }, 'Arreglar') : null)); });
      todo.appendChild(ul2); todo.appendChild(h('a', { class: 'btn ghost small', href: '#/h/revision' }, 'Ver toda la revisión' + (flagged.length > 5 ? ' (' + flagged.length + ')' : '')));
    }

    box.appendChild(h('div', { class: 'dash-head' }, h('h2', { class: 'sec-title' }, 'Tu proyecto en un vistazo'), h('div', { class: 'row-actions' }, h('a', { class: 'btn primary small', href: '#/h/expediente' }, 'Ver el expediente completo'), h('span', { class: 'muted' }, 'Se va armando solo, a medida que avanzas.'))));
    box.appendChild(stats); box.appendChild(phases);
    box.appendChild(h('div', { class: 'dash-grid2' }, h('div', { class: 'dash-card' }, h('h3', { class: 'dash-h' }, 'Plata por cuenta'), acct), h('div', { class: 'dash-card' }, h('h3', { class: 'dash-h' }, 'Gasto mes a mes'), chart)));
    box.appendChild(legend);
    box.appendChild(h('div', { class: 'dash-grid2 low' }, h('div', { class: 'dash-card' }, list), h('div', { class: 'dash-card' }, todo)));
    paintAll(true);
    return box;
  }

  /* ---------- celebración ---------- */
  var fw = null;
  function fireworks() {
    if (fw || reduced() || typeof document === 'undefined') return;
    var cv = document.createElement('canvas'); cv.className = 'fireworks'; cv.setAttribute('aria-hidden', 'true'); document.body.appendChild(cv);
    var g = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight, parts = [], t0 = Date.now(), last = 0;
    var COLS = ['#b99df0', '#ffd166', '#6ee7a8', '#7ec8ff', '#ff8fab', '#ffffff'];
    function burst(x, y) { var n = 54, c = COLS[Math.floor(Math.random() * COLS.length)], c2 = COLS[Math.floor(Math.random() * COLS.length)]; for (var i = 0; i < n; i++) { var a = Math.PI * 2 * i / n + Math.random() * .2, v = 2 + Math.random() * 3.6; parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: i % 3 ? c : c2, s: 1.6 + Math.random() * 1.8 }); } }
    function frame() {
      var now = Date.now(), el = now - t0;
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
      if (el < 5200 && now - last > 520) { last = now; burst(W * (.15 + Math.random() * .7), H * (.12 + Math.random() * .4)); }
      parts = parts.filter(function (p) { return p.life > 0; });
      parts.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += .035; p.vx *= .985; p.life -= .011; g.globalAlpha = Math.max(0, p.life); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill(); });
      g.globalAlpha = 1;
      if (el < 7600 || parts.length) fw = requestAnimationFrame(frame); else { cv.parentNode && cv.parentNode.removeChild(cv); fw = null; }
    }
    fw = requestAnimationFrame(frame);
  }
  function congrats(p) {
    var card = h('section', { class: 'congrats card', role: 'status' }, h('h2', null, '¡Lo lograron!'),
      h('p', { class: 'lead' }, 'Completaron todos los pasos de «' + (p.name || 'su proyecto') + '» y la revisión no encontró errores. Es un trabajo largo y bien hecho: gracias por rendir con orden.'),
      h('div', { class: 'row-actions' }, h('a', { class: 'btn primary', href: '#/h/expediente' }, 'Juntar todo en un solo archivo'), UI.btn('Ver los fuegos artificiales otra vez', { cls: 'ghost', onclick: function () { fireworks(); } })));
    RF.celebrated = RF.celebrated || {};
    if (!RF.celebrated[p.id]) { RF.celebrated[p.id] = true; setTimeout(fireworks, 350); }
    return card;
  }

  RF.dash = { render: render, isComplete: isComplete, congrats: congrats, fireworks: fireworks, statusOf: statusOf };
})(typeof window !== 'undefined' ? window : globalThis);
