/* Rinde Fácil — diagrama en carriles: a qué organismo le toca cada paso. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, D = RF.data, h = U.h;
  var LANES = ['corfo', 'comunidad', 'novandina', 'smi']; /* orden del flujograma original */
  var NAME = {}; D.ACTORS.forEach(function (a) { NAME[a.id] = a.name; });
  var NS = 'http://www.w3.org/2000/svg';

  function stepEl(id, here) {
    var s = D.FLOW[id], actor = s[0], dec = id.charAt(0) === 'D';
    var col = LANES.indexOf(actor) + 1;
    var chips = [];
    if (s[3]) chips.push(h('span', { class: 'chip-t' + (/sin plazo/.test(s[3]) ? ' warn' : '') }, s[3]));
    if (s[4]) chips.push(h('span', { class: 'chip-t loop' }, '↺ ' + s[4]));
    return h('button', { type: 'button', class: 'fstep' + (dec ? ' decision' : '') + (here ? ' here' : ''), 'data-id': id, 'data-actor': actor, 'aria-pressed': 'false',
      style: { '--c': 'var(--' + actor + ')', gridColumn: String(col) }, 'aria-label': (dec ? 'Decisión' : 'Paso ' + id) + ': ' + s[1] + '. Le toca a ' + NAME[actor] },
      h('span', { class: 'who-tag' }, NAME[actor]), dec ? null : h('span', { class: 'step-num' }, id), h('span', { class: 'step-title' }, s[1]), chips);
  }

  function draw(block) {
    var svg = block.querySelector('svg.links'); if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (getComputedStyle(svg).display === 'none') return;
    var br = block.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + br.width + ' ' + br.height);
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" style="fill:var(--muted)"/></marker>';
    svg.appendChild(defs);
    var edges = []; try { edges = JSON.parse(block.getAttribute('data-edges')); } catch (e) { }
    edges.forEach(function (e) {
      var a = block.querySelector('[data-id="' + e[0] + '"]'), b = block.querySelector('[data-id="' + e[1] + '"]'); if (!a || !b) return;
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      var x1 = ra.left + ra.width / 2 - br.left, y1 = ra.bottom - br.top, x2 = rb.left + rb.width / 2 - br.left, y2 = rb.top - br.top - 1, d, lx, ly;
      if (Math.abs(x1 - x2) < 2) { d = 'M' + x1 + ' ' + y1 + 'V' + y2; lx = x1 + 8; ly = y1 + 16; }
      else { var ym = y1 + (y2 - y1) / 2, r = 8, dir = x2 > x1 ? 1 : -1; d = 'M' + x1 + ' ' + y1 + 'V' + (ym - r) + 'Q' + x1 + ' ' + ym + ' ' + (x1 + dir * r) + ' ' + ym + 'H' + (x2 - dir * r) + 'Q' + x2 + ' ' + ym + ' ' + x2 + ' ' + (ym + r) + 'V' + y2; lx = (x1 + x2) / 2; ly = ym - 5; }
      var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('marker-end', 'url(#arr)'); svg.appendChild(p);
      if (e[2]) { var t = document.createElementNS(NS, 'text'); t.setAttribute('x', lx); t.setAttribute('y', ly); t.setAttribute('class', 'lbl'); t.setAttribute('text-anchor', Math.abs(x1 - x2) < 2 ? 'start' : 'middle'); t.textContent = e[2]; svg.appendChild(t); }
    });
  }

  /* opts: {fases:['F4'], here:'F4', onlyActor, inspector:true} */
  function render(opts) {
    opts = opts || {};
    var wrap = h('div', { class: 'flow' });
    var blocks = D.FLOW_BLOCKS.filter(function (b) { return !opts.fases || opts.fases.indexOf(b.fase) >= 0; });
    var gridBlocks = [];
    var filters = h('div', { class: 'filters', role: 'group', 'aria-label': 'Resaltar por actor' }, h('span', { class: 'filters-label' }, 'Resaltar:'));
    var current = null;
    D.ACTORS.forEach(function (a) {
      var b = h('button', { type: 'button', class: 'fchip', 'data-actor': a.id, 'aria-pressed': 'false', style: { '--c': 'var(--' + a.id + ')' } }, h('span', { class: 'dot', style: { background: 'var(--' + a.id + ')' } }), a.name);
      b.addEventListener('click', function () { current = current === a.id ? null : a.id; apply(); });
      filters.appendChild(b);
    });
    wrap.appendChild(filters);
    var inspector = h('div', { class: 'inspector', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'ins-empty' }, 'Toca un paso para ver qué le toca a cada uno.'));
    var holder = h('div', { class: 'flow-blocks' });
    blocks.forEach(function (bl) {
      var grid = h('div', { class: 'lanes', 'data-edges': JSON.stringify(bl.edges) });
      var rows = bl.ids.length + 1;
      LANES.forEach(function (a, k) {
        grid.appendChild(h('div', { class: 'lane-bg', 'data-actor': a, style: { '--c': 'var(--' + a + ')', gridColumn: String(k + 1), gridRow: '1 / span ' + rows } }));
        grid.appendChild(h('div', { class: 'lane-head', 'data-actor': a, style: { '--c': 'var(--' + a + ')', gridColumn: String(k + 1), gridRow: '1' } }, NAME[a]));
      });
      grid.appendChild(document.createElementNS(NS, 'svg')); grid.lastChild.setAttribute('class', 'links'); grid.lastChild.setAttribute('aria-hidden', 'true');
      bl.ids.forEach(function (id, r) {
        var here = opts.here && D.FLOW[id][6] && (function () { var t = RF.tramites.byId[D.FLOW[id][6]]; return t && t.fase === opts.here; })();
        var el = stepEl(id, here); el.style.gridRow = String(r + 2);
        el.addEventListener('click', function () { select(id); });
        grid.appendChild(el);
      });
      gridBlocks.push(grid);
      holder.appendChild(h('div', { class: 'block' }, h('div', { class: 'block-title' }, h('span', { class: 'mono' }, 'Fase ' + bl.fase.slice(1)), h('h3', null, bl.title)), grid));
    });
    wrap.appendChild(holder);
    wrap.appendChild(inspector);

    function select(id) {
      U.$$('.fstep', wrap).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-id') === id ? 'true' : 'false'); });
      var s = D.FLOW[id]; inspector.style.setProperty('--c', 'var(--' + s[0] + ')'); U.clear(inspector);
      inspector.appendChild(h('div', { class: 'ins-head' }, h('strong', null, (id.charAt(0) === 'D' ? 'Decisión: ' : 'Paso ' + id + ': ') + s[1]), h('span', { class: 'ins-actor' }, NAME[s[0]])));
      inspector.appendChild(h('p', null, s[2]));
      if (s[3]) inspector.appendChild(h('p', null, h('strong', null, 'Plazo: '), s[3]));
      if (s[4]) inspector.appendChild(h('p', null, h('strong', null, 'Si hay observaciones: '), s[4].toLowerCase() + '.'));
      if (s[5]) inspector.appendChild(h('p', { class: 'ins-exit' }, s[5]));
      var t = s[6] && RF.tramites.byId[s[6]];
      if (t) inspector.appendChild(h('a', { class: 'btn primary small', href: '#/t/' + t.id }, 'Ir a: ' + t.title));
      inspector.classList.remove('fresh'); void inspector.offsetWidth; inspector.classList.add('fresh');
    }
    function apply() {
      U.$$('.fchip', wrap).forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-actor') === current ? 'true' : 'false'); });
      U.$$('.fstep, .lane-head, .lane-bg', wrap).forEach(function (e) { e.classList.toggle('dim', !!current && e.getAttribute('data-actor') !== current); });
    }
    function drawAll() { gridBlocks.forEach(draw); }
    wrap.redraw = drawAll;
    setTimeout(drawAll, 0);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawAll);
    if (typeof ResizeObserver !== 'undefined') gridBlocks.forEach(function (g) { new ResizeObserver(drawAll).observe(g); });
    window.addEventListener('resize', drawAll);
    return wrap;
  }
  RF.flow = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
