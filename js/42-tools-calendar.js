/* Rinde Fácil — calendario: todas las fechas del proyecto en un solo lugar (plazos, actividades, boletas, reuniones y las que la comunidad anote).
 * Vista de mes y de año, eventos con hora y lugar, y paso a Google Calendar (por evento, o todo junto en un archivo .ics que también abren Outlook y el teléfono).
 * Los feriados no se listan: Google Calendar y el teléfono ya los conocen. Nada sale de este dispositivo hasta que la persona descarga el archivo o abre el enlace. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, L = RF.logic, h = U.h, TOOLS = RF.tools = RF.tools || {};

  var KINDS = [
    { id: 'plazo', name: 'Plazos', color: 'var(--bad)' },
    { id: 'proyecto', name: 'Mi proyecto', color: 'var(--action)' },
    { id: 'actividad', name: 'Actividades', color: 'var(--info)' },
    { id: 'gasto', name: 'Boletas y facturas', color: 'var(--ok)' },
    { id: 'reunion', name: 'Reuniones', color: 'var(--warn)' },
    { id: 'mio', name: 'Mis fechas', color: 'var(--ink-2)' }
  ];
  var KIND_BY = {}; KINDS.forEach(function (k) { KIND_BY[k.id] = k; });
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var ISO = /^\d{4}-\d{2}-\d{2}$/, HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

  function valid(iso) { return typeof iso === 'string' && ISO.test(iso); }
  function validTime(t) { return typeof t === 'string' && HHMM.test(t); }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  /* junta todas las fechas del proyecto activo y las de la comunidad; cada una: { date, title, kind, tool?, note?, time?, endTime?, place?, own? } */
  function collect(s, p) {
    var out = [];
    function add(date, title, kind, extra) { if (valid(date) && title) out.push(Object.assign({ date: date, title: title, kind: kind }, extra || {})); }
    if (p) {
      add(p.start, 'Empieza el proyecto', 'proyecto', { tool: 'proyecto' });
      add(p.end, 'Termina el proyecto', 'plazo', { tool: 'proyecto' });
      add(p.periodoInicio, 'Empieza el período de esta rendición', 'proyecto', { tool: 'proyecto' });
      add(p.periodoFin, 'Termina el período de esta rendición', 'plazo', { tool: 'proyecto' });
      var pd = L.peaDeadline(p, '');
      if (pd) {
        add(pd.inicio, 'Primer pago del 30 %', 'proyecto', { tool: 'proyecto' });
        add(pd.fin, 'Vence el plazo del PEA (90 días)', 'plazo', { tool: 'pea', note: 'Si lo necesitas, pide la prórroga antes de esta fecha.' });
        add(pd.finProrroga, 'Vence la prórroga del PEA', 'plazo', { tool: 'pea' });
      }
      (p.observations || []).forEach(function (o) {
        if (!o || !valid(o.recibida)) return;
        add(o.recibida, 'CORFO comunicó una observación', 'plazo', { tool: 'observaciones' });
        if (!o.respondida) add(L.aclaracionDeadline(o.recibida, RF.holidays.all(s)), 'Vence el plazo para aclarar la observación', 'plazo', { tool: 'observaciones', note: 'Son 10 días hábiles. Se puede aclarar una sola vez.' });
      });
      L.allActivities(p).forEach(function (x) {
        if (!x.act || !x.act.name) return;
        add(x.act.start, 'Empieza: ' + x.act.name, 'actividad', { tool: 'gantt', note: x.stage && x.stage.name ? 'Etapa: ' + x.stage.name : '' });
        add(x.act.end, 'Termina: ' + x.act.name, 'actividad', { tool: 'gantt', note: x.stage && x.stage.name ? 'Etapa: ' + x.stage.name : '' });
      });
      (p.expenses || []).forEach(function (e) {
        if (!e || !valid(e.fecha)) return;
        var money = e.montoRendir || e.total ? ' · ' + U.fmtCLP(e.montoRendir || e.total) : '';
        add(e.fecha, (e.proveedor || 'Gasto sin proveedor') + money, 'gasto', { tool: 'gastos' });
      });
    }
    ((s && s.repo && s.repo.actas) || []).forEach(function (a) { if (a) add(a.date, 'Reunión: ' + (a.place || 'mesa de trabajo'), 'reunion', { tool: 'actas' }); });
    ((s && s.events) || []).forEach(function (e) {
      if (!e) return;
      var t = validTime(e.time) ? e.time : '';
      add(e.date, String(e.title || '').slice(0, 120), 'mio', { own: e.id, note: String(e.note || '').slice(0, 300), time: t, endTime: t && validTime(e.endTime) ? e.endTime : '', place: String(e.place || '').slice(0, 120) });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : a.title.localeCompare(b.title, 'es'); });
    return out;
  }

  /* ---------- Google Calendar / archivo .ics ---------- */
  function compact(iso) { return iso.replace(/-/g, ''); }
  function stamp(iso, hhmm) { return compact(iso) + 'T' + hhmm.replace(':', '') + '00'; }
  /* fin de un evento con hora: la hora de término, o una hora después del inicio; { date, time } */
  function endOf(ev) {
    if (ev.endTime && ev.endTime > ev.time) return { date: ev.date, time: ev.endTime };
    var hh = +ev.time.slice(0, 2) + 1, mm = ev.time.slice(3);
    if (hh >= 24) return { date: U.addDays(ev.date, 1), time: '00:' + mm };
    return { date: ev.date, time: (hh < 10 ? '0' : '') + hh + ':' + mm };
  }
  function googleUrl(ev) {
    var dates, extra = '';
    if (validTime(ev.time)) { var e = endOf(ev); dates = stamp(ev.date, ev.time) + '/' + stamp(e.date, e.time); extra = '&ctz=America%2FSantiago'; }
    else dates = compact(ev.date) + '/' + compact(U.addDays(ev.date, 1)); /* las fechas de día completo terminan al día siguiente */
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title) +
      '&dates=' + dates + extra + (ev.place ? '&location=' + encodeURIComponent(ev.place) : '') + '&details=' + encodeURIComponent((ev.note ? ev.note + '\n' : '') + 'Desde Rinde Fácil.');
  }
  function icsEsc(t) { return String(t).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
  function fold(line) { var out = [], rest = line; while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); } out.push(rest); return out.join('\r\n'); }
  function toIcs(events, stampNow) {
    var now = stampNow || new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rinde Facil//Calendario//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Rinde Fácil'];
    events.forEach(function (ev, i) {
      lines.push('BEGIN:VEVENT');
      lines.push('UID:rinde-facil-' + compact(ev.date) + '-' + i + '-' + (ev.title.length) + '@rindefacil');
      lines.push('DTSTAMP:' + now);
      if (validTime(ev.time)) { var e = endOf(ev); lines.push('DTSTART:' + stamp(ev.date, ev.time)); lines.push('DTEND:' + stamp(e.date, e.time)); } /* hora local, sin zona: Google la toma en la zona de tu calendario */
      else { lines.push('DTSTART;VALUE=DATE:' + compact(ev.date)); lines.push('DTEND;VALUE=DATE:' + compact(U.addDays(ev.date, 1))); }
      lines.push('SUMMARY:' + icsEsc(ev.title));
      if (ev.place) lines.push('LOCATION:' + icsEsc(ev.place));
      if (ev.note) lines.push('DESCRIPTION:' + icsEsc(ev.note));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /* ---------- fechas ---------- */
  function monthStart(iso) { return iso.slice(0, 8) + '01'; }
  function shiftMonth(iso, n) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + (m + 1 < 10 ? '0' : '') + (m + 1) + '-01'; }
  function daysIn(iso) { return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate(); }
  function weekday(iso) { return (new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay() + 6) % 7; } /* lunes = 0 */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function isoOf(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function longDay(iso) { return cap(new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })); }
  function reduced() { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* Cambia lo que muestra el escenario con una animación corta (se omite si la persona pidió menos movimiento).
   * 'slide': el mes nuevo entra desde el lado hacia el que se avanza · 'zoom-in': el mes crece desde el mini-mes que se tocó · 'zoom-out': el año aparece desde el mes. */
  /* Deja en el escenario SOLO la vista `next`. Cada cambio lleva un número: si llega otro cambio antes de que termine la animación,
   * la animación anterior se cancela y no puede tocar lo que ya se dibujó (así nunca quedan dos meses o dos años a la vez). */
  function swap(stage, next, kind, dir, rect) {
    var tok = stage._tok = (stage._tok || 0) + 1;
    function only(el) { Array.prototype.slice.call(stage.children).forEach(function (c) { if (c !== el && c.parentNode === stage) stage.removeChild(c); }); }
    function plain(el) { if (el.getAnimations) el.getAnimations().forEach(function (an) { try { an.cancel(); } catch (e) { /* ya terminó */ } }); el.style.position = ''; el.style.inset = ''; el.style.pointerEvents = ''; el.style.transformOrigin = ''; }
    var kids = stage.children, old = kids.length ? kids[kids.length - 1] : null;
    only(old); if (old) plain(old);
    if (!old || reduced() || !old.animate) { only(null); stage.appendChild(next); return; }
    var box = stage.getBoundingClientRect(), ease = 'cubic-bezier(.2,.8,.2,1)', dur = kind === 'slide' ? 280 : 360;
    old.style.position = 'absolute'; old.style.inset = '0 0 auto 0'; old.style.pointerEvents = 'none';
    stage.appendChild(next);
    var inFrames, outFrames;
    if (kind === 'zoom-in' && rect) {
      var sx = Math.max(.08, rect.width / box.width), sy = Math.max(.08, rect.height / Math.max(1, next.offsetHeight || box.height)), tx = rect.left - box.left, ty = rect.top - box.top;
      next.style.transformOrigin = '0 0';
      inFrames = [{ transform: 'translate(' + tx + 'px,' + ty + 'px) scale(' + sx + ',' + sy + ')', opacity: 0 }, { transform: 'none', opacity: 1 }];
      outFrames = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.05)' }];
    } else if (kind === 'zoom-out') {
      inFrames = [{ transform: 'scale(1.12)', opacity: 0 }, { transform: 'none', opacity: 1 }];
      outFrames = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.6)' }];
    } else {
      var d = (dir || 1) * 48;
      inFrames = [{ transform: 'translateX(' + d + 'px)', opacity: 0 }, { transform: 'none', opacity: 1 }];
      outFrames = [{ transform: 'none', opacity: 1 }, { transform: 'translateX(' + (-d) + 'px)', opacity: 0 }];
    }
    stage.classList.add('moving');
    var a = next.animate(inFrames, { duration: dur, easing: ease }); old.animate(outFrames, { duration: dur * .8, easing: ease, fill: 'forwards' });
    function finish() { if (stage._tok !== tok) return; only(next); next.style.transformOrigin = ''; stage.classList.remove('moving'); }
    a.onfinish = finish; a.oncancel = finish; setTimeout(finish, dur + 120);
  }

  var EMPTY_FORM = function (date) { return { id: '', date: date || '', title: '', allDay: true, time: '', endTime: '', place: '', note: '' }; };

  TOOLS.calendario = { title: 'Calendario', icon: 'calendar', desc: 'Todas tus fechas en un solo lugar: plazos, actividades, boletas, reuniones y las tuyas, con hora y lugar.', render: function () {
    var today = U.todayISO();
    var st = { view: 'mes', month: monthStart(today), year: +today.slice(0, 4), day: today, kinds: {}, form: EMPTY_FORM(today) };
    KINDS.forEach(function (k) { st.kinds[k.id] = true; });
    var root = h('div', { class: 'tool-page cal-page' }, h('h1', { class: 'tool-title' }, 'Calendario'),
      h('p', { class: 'lead' }, 'Aquí aparece toda fecha que anotas en la app: el inicio y el término del proyecto, los plazos, las actividades de la Carta Gantt, las boletas y las reuniones. También puedes agregar tus propios eventos, con hora y lugar.'));
    var upcoming = h('div'), allBox = h('div', { class: 'cal-all' }), chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Qué fechas mostrar' }),
      stage = h('div', { class: 'cal-stage' }), toolbar = h('div', { class: 'cal-head' }), dayBox = h('div', { class: 'cal-daybox' });
    var title = h('h2', { class: 'cal-month', 'aria-live': 'polite' }), pickBox = h('div', { class: 'cal-yearpick-wrap' });
    var segMes, segAnio, arrowPrev, arrowNext;

    function visible() { return collect(RF.store.get(), RF.store.project()).filter(function (e) { return st.kinds[e.kind]; }); }
    function holidaySet() { var m = {}; RF.holidays.all().forEach(function (d) { m[d] = true; }); return m; }
    function byDay(evs) { var m = {}; evs.forEach(function (e) { (m[e.date] = m[e.date] || []).push(e); }); return m; }
    function when(ev) { return U.fmtDate(ev.date) + (validTime(ev.time) ? ' · ' + ev.time + (ev.endTime ? '–' + ev.endTime : '') : ''); }
    function gcal(ev) { return h('a', { class: 'cal-g', href: googleUrl(ev), target: '_blank', rel: 'noopener' }, 'Agregar a Google Calendar'); }
    function evRow(ev, withDate) {
      var k = KIND_BY[ev.kind] || KIND_BY.mio;
      return h('li', { class: 'cal-ev' },
        h('span', { class: 'cal-dot', style: { background: k.color }, title: k.name }),
        h('span', { class: 'cal-ev-t' }, withDate ? h('strong', null, when(ev) + ' · ') : (validTime(ev.time) ? h('strong', null, ev.time + (ev.endTime ? '–' + ev.endTime : '') + ' · ') : null), ev.title,
          ev.place ? h('span', { class: 'muted' }, ' · ' + ev.place) : null, ev.note ? h('span', { class: 'muted' }, ' · ' + ev.note) : null),
        h('span', { class: 'cal-ev-a' },
          ev.tool && RF.tools[ev.tool] ? h('a', { href: '#/h/' + ev.tool }, 'Abrir') : null,
          gcal(ev),
          ev.own ? UI.btn('Editar', { cls: 'ghost small', onclick: function () { editEvent(ev); } }) : null,
          ev.own ? UI.btn('Quitar', { cls: 'ghost small', onclick: function () { RF.store.update(function (x) { x.events = (x.events || []).filter(function (e) { return e.id !== ev.own; }); }, { silent: true }); if (st.form.id === ev.own) st.form = EMPTY_FORM(st.day); paintAll(); } }) : null));
    }

    /* ----- lo que viene + pasar todo a Google Calendar ----- */
    function upcomingAll() { return visible().filter(function (e) { return e.date >= today; }); }
    function paintUpcoming() {
      U.clear(upcoming); U.clear(allBox);
      var all = upcomingAll(), list = all.slice(0, 8);
      if (!list.length) { upcoming.appendChild(UI.empty('No hay fechas por delante. Cuando anotes fechas en tu proyecto, aparecen aquí.')); return; }
      upcoming.appendChild(h('ul', { class: 'cal-list' }, list.map(function (e) { return evRow(e, true); })));
      if (all.length > list.length) upcoming.appendChild(h('p', { class: 'hint' }, 'Y ' + (all.length - list.length) + ' más adelante.'));
      upcoming.appendChild(h('div', { class: 'row-actions' }, UI.btn('Pasar todo a Google Calendar (' + all.length + (all.length === 1 ? ' fecha' : ' fechas') + ')', { icon: 'calendar', cls: 'primary', onclick: exportAll })));
      upcoming.appendChild(allBox);
    }
    function exportAll() {
      var evs = upcomingAll();
      if (!evs.length) { UI.toast('Todavía no hay fechas por delante.', 'bad'); return; }
      U.download(new Blob([toIcs(evs)], { type: 'text/calendar;charset=utf-8' }), 'rinde-facil-calendario.ics');
      U.clear(allBox);
      allBox.appendChild(h('div', { class: 'callout ok' }, h('strong', null, 'Se descargó el archivo con ' + evs.length + (evs.length === 1 ? ' fecha.' : ' fechas.')),
        h('span', null, ' Falta un paso, una sola vez para todas: abre Google Calendar, elige «Importar», selecciona el archivo «rinde-facil-calendario.ics» y el calendario donde quieres guardarlas.'),
        h('div', { class: 'row-actions' }, h('a', { class: 'btn', href: 'https://calendar.google.com/calendar/u/0/r/settings/export', target: '_blank', rel: 'noopener' }, 'Abrir Google Calendar (Importar)'))));
    }

    /* ----- barra: navegación, título, Mes / Año ----- */
    function paintToolbar() {
      U.clear(toolbar);
      arrowPrev = h('button', { type: 'button', class: 'cal-arrow', onclick: function () { step(-1); } }, '‹'); arrowNext = h('button', { type: 'button', class: 'cal-arrow', onclick: function () { step(1); } }, '›');
      var nav = h('div', { class: 'cal-nav' }, arrowPrev, arrowNext,
        UI.btn('Hoy', { cls: 'ghost small', onclick: goToday }));
      segMes = h('button', { type: 'button', 'aria-pressed': st.view === 'mes' ? 'true' : 'false', onclick: function () { if (st.view !== 'mes') showMonth(null); } }, 'Mes');
      segAnio = h('button', { type: 'button', 'aria-pressed': st.view === 'anio' ? 'true' : 'false', onclick: function () { if (st.view !== 'anio') showYear(); } }, 'Año');
      toolbar.appendChild(nav); toolbar.appendChild(title); toolbar.appendChild(h('div', { class: 'seg', role: 'group', 'aria-label': 'Vista' }, segMes, segAnio));
      setSeg(); paintTitle();
    }
    function paintTitle() {
      U.clear(title);
      if (st.view === 'mes') { title.textContent = cap(MONTHS[+st.month.slice(5, 7) - 1]) + ' ' + st.month.slice(0, 4); closePick(); return; }
      title.appendChild(h('button', { type: 'button', class: 'cal-yearbtn', 'aria-haspopup': 'true', 'aria-expanded': pickBox.firstChild ? 'true' : 'false', title: 'Elegir otro año', onclick: togglePick }, String(st.year), h('span', { class: 'cal-caret', 'aria-hidden': 'true' }, '▾')));
    }
    function closePick() { U.clear(pickBox); var b = title.querySelector('.cal-yearbtn'); if (b) b.setAttribute('aria-expanded', 'false'); }
    function goYear(y) {
      y = Math.max(1900, Math.min(2100, Math.round(+y) || st.year)); if (y === st.year) { closePick(); return; }
      var dir = y > st.year ? 1 : -1; st.year = y; swap(stage, buildYear(), 'slide', dir); paintTitle(); closePick();
    }
    function togglePick() {
      if (pickBox.firstChild) { closePick(); return; }
      var rangeEl = h('span', { class: 'cal-yearrange' }), base = Math.floor(st.year / 12) * 12, grid = h('div', { class: 'cal-years' }), inp = h('input', { type: 'number', min: '1900', max: '2100', value: String(st.year), 'aria-label': 'Escribir un año', class: 'cal-yearin' });
      function fill() {
        U.clear(grid); rangeEl.textContent = base + ' – ' + (base + 11);
        for (var y = base; y < base + 12; y++) (function (yy) { grid.appendChild(h('button', { type: 'button', class: 'cal-yearopt' + (yy === st.year ? ' cur' : '') + (yy === +today.slice(0, 4) ? ' now' : ''), onclick: function () { goYear(yy); } }, String(yy))); })(y);
      }
      fill();
      pickBox.appendChild(h('div', { class: 'cal-yearpick', role: 'group', 'aria-label': 'Elegir año' },
        h('div', { class: 'cal-yearpick-nav' }, h('button', { type: 'button', class: 'cal-arrow', 'aria-label': 'Años anteriores', onclick: function () { base -= 12; fill(); } }, '‹'), rangeEl, h('button', { type: 'button', class: 'cal-arrow', 'aria-label': 'Años siguientes', onclick: function () { base += 12; fill(); } }, '›')),
        grid,
        h('form', { class: 'cal-yearform', onsubmit: function (ev) { ev.preventDefault(); goYear(inp.value); } }, h('label', null, 'O escribe un año ', inp), h('button', { type: 'submit', class: 'btn small' }, 'Ir'))));
      var b = title.querySelector('.cal-yearbtn'); if (b) b.setAttribute('aria-expanded', 'true');
    }
    function setSeg() { if (!segMes) return; var u = st.view === 'mes' ? 'Mes' : 'Año'; arrowPrev.setAttribute('aria-label', u + ' anterior'); arrowNext.setAttribute('aria-label', u + ' siguiente'); segMes.setAttribute('aria-pressed', st.view === 'mes' ? 'true' : 'false'); segAnio.setAttribute('aria-pressed', st.view === 'anio' ? 'true' : 'false'); }
    function paintChips() {
      U.clear(chips);
      KINDS.forEach(function (k) {
        chips.appendChild(h('button', { type: 'button', class: 'chip' + (st.kinds[k.id] ? ' on' : ''), 'aria-pressed': st.kinds[k.id] ? 'true' : 'false', onclick: function () { st.kinds[k.id] = !st.kinds[k.id]; paintAll(); } },
          h('span', { class: 'cal-dot', style: { background: k.color } }), ' ' + k.name));
      });
    }

    /* ----- vista de mes ----- */
    function buildMonth() {
      var evs = visible(), map = byDay(evs), hol = holidaySet(), first = st.month, n = daysIn(first), off = weekday(first), y = +first.slice(0, 4), mo = +first.slice(5, 7);
      var cells = [], d;
      for (d = 0; d < off; d++) cells.push(h('div', { class: 'cal-cell empty', 'aria-hidden': 'true' }));
      for (d = 1; d <= n; d++) {
        (function (day) {
          var iso = isoOf(y, mo, day), list = map[iso] || [], wd = (off + day - 1) % 7;
          var pills = list.slice(0, 2).map(function (e) { var k = KIND_BY[e.kind] || KIND_BY.mio; return h('span', { class: 'cal-pill', style: { '--k': k.color }, title: (e.time ? e.time + ' · ' : '') + e.title }, e.time ? e.time + ' ' : '', e.title); });
          var dots = h('span', { class: 'cal-dots' }, list.slice(0, 4).map(function (e) { return h('span', { class: 'cal-dot', style: { background: (KIND_BY[e.kind] || KIND_BY.mio).color } }); }));
          cells.push(h('button', { type: 'button', class: 'cal-cell' + (iso === today ? ' today' : '') + (iso === st.day ? ' sel' : '') + (wd >= 5 ? ' wk' : '') + (hol[iso] ? ' hol' : ''),
            'aria-label': day + ' de ' + MONTHS[mo - 1] + (hol[iso] ? ', feriado' : '') + (list.length ? ': ' + list.length + (list.length === 1 ? ' fecha' : ' fechas') : ''), 'aria-pressed': iso === st.day ? 'true' : 'false', title: hol[iso] ? 'Feriado' : '',
            onclick: function () { pickDay(iso); } },
            h('span', { class: 'cal-num' }, String(day)), h('span', { class: 'cal-pills' }, pills, list.length > 2 ? h('span', { class: 'cal-more' }, '+' + (list.length - 2) + ' más') : null), dots));
        })(d);
      }
      return h('div', { class: 'cal-view cal-month-view' },
        h('div', { class: 'cal-wk', 'aria-hidden': 'true' }, ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(function (x) { return h('span', null, x); })),
        h('div', { class: 'cal-days', role: 'group', 'aria-label': 'Calendario de ' + MONTHS[mo - 1] + ' ' + y }, cells));
    }

    /* ----- vista de año: los 12 meses ----- */
    function buildYear() {
      var evs = visible(), map = byDay(evs), hol = holidaySet(), y = st.year, minis = [];
      for (var m = 1; m <= 12; m++) {
        (function (mm) {
          var first = isoOf(y, mm, 1), n = daysIn(first), off = weekday(first), cells = [], d;
          for (d = 0; d < off; d++) cells.push(h('span', { class: 'mini-d empty' }));
          for (d = 1; d <= n; d++) {
            var iso = isoOf(y, mm, d), has = !!map[iso];
            cells.push(h('span', { class: 'mini-d' + (iso === today ? ' today' : '') + (has ? ' has' : '') + (hol[iso] ? ' hol' : '') }, String(d)));
          }
          var btn = h('button', { type: 'button', class: 'mini' + (y === +today.slice(0, 4) && mm === +today.slice(5, 7) ? ' now' : ''), 'aria-label': 'Abrir ' + MONTHS[mm - 1] + ' ' + y, onclick: function () { showMonth(first, btn); } },
            h('span', { class: 'mini-t' }, cap(MONTHS[mm - 1])), h('span', { class: 'mini-wk', 'aria-hidden': 'true' }, ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(function (x) { return h('i', null, x); })), h('span', { class: 'mini-g' }, cells));
          minis.push(btn);
        })(m);
      }
      return h('div', { class: 'cal-view cal-year-view' }, minis);
    }

    /* ----- cambios de vista ----- */
    function step(dir) {
      if (st.view === 'mes') { st.month = shiftMonth(st.month, dir); swap(stage, buildMonth(), 'slide', dir); }
      else { st.year += dir; swap(stage, buildYear(), 'slide', dir); }
      paintTitle();
    }
    function goToday() {
      var dir = st.view === 'mes' ? (today >= st.month ? 1 : -1) : (+today.slice(0, 4) >= st.year ? 1 : -1);
      st.month = monthStart(today); st.year = +today.slice(0, 4); st.day = today; st.form = EMPTY_FORM(today);
      swap(stage, st.view === 'mes' ? buildMonth() : buildYear(), 'slide', dir); paintTitle(); paintDay();
    }
    function showMonth(first, fromEl) {
      closePick();
      if (first) { st.month = first; st.day = (first.slice(0, 7) === today.slice(0, 7)) ? today : first; st.form = EMPTY_FORM(st.day); }
      st.view = 'mes'; setSeg(); paintTitle();
      var rect = fromEl ? fromEl.getBoundingClientRect() : null;
      swap(stage, buildMonth(), rect ? 'zoom-in' : 'slide', 1, rect); paintDay();
    }
    function showYear() { st.view = 'anio'; st.year = +st.month.slice(0, 4); setSeg(); paintTitle(); swap(stage, buildYear(), 'zoom-out'); }
    function pickDay(iso) {
      st.day = iso; if (!st.form.id) st.form.date = iso;
      Array.prototype.forEach.call(stage.querySelectorAll('.cal-cell'), function (c) { c.classList.remove('sel'); c.setAttribute('aria-pressed', 'false'); });
      var n = +iso.slice(8, 10), cells = stage.querySelectorAll('.cal-cell:not(.empty)'); if (cells[n - 1]) { cells[n - 1].classList.add('sel'); cells[n - 1].setAttribute('aria-pressed', 'true'); }
      paintDay();
    }

    /* ----- panel del día: eventos y formulario ----- */
    function editEvent(ev) {
      var own = (RF.store.get().events || []).filter(function (e) { return e.id === ev.own; })[0]; if (!own) return;
      st.form = { id: own.id, date: own.date, title: own.title || '', allDay: !validTime(own.time), time: validTime(own.time) ? own.time : '', endTime: validTime(own.endTime) ? own.endTime : '', place: own.place || '', note: own.note || '' };
      st.day = own.date; paintDay();
    }
    function saveEvent() {
      var f = st.form, t = String(f.title || '').trim();
      if (!valid(f.date) || !t) { UI.toast('Escribe la fecha y el nombre del evento.', 'bad'); return; }
      if (!f.allDay && !validTime(f.time)) { UI.toast('Pon la hora de inicio, o marca «Todo el día».', 'bad'); return; }
      if (!f.allDay && f.endTime && !validTime(f.endTime)) { UI.toast('La hora de término no es válida.', 'bad'); return; }
      var rec = { id: f.id || U.uid('ev'), date: f.date, title: t.slice(0, 120), note: String(f.note || '').slice(0, 300), place: String(f.place || '').slice(0, 120), time: f.allDay ? '' : f.time, endTime: f.allDay ? '' : (f.endTime || '') };
      RF.store.update(function (x) { var list = (x.events || []).filter(function (e) { return e.id !== rec.id; }); x.events = list.concat([rec]); }, { silent: true });
      UI.toast(f.id ? 'Evento actualizado.' : 'Evento agregado a tu calendario.', 'ok');
      st.day = f.date; st.month = monthStart(f.date); st.form = EMPTY_FORM(f.date); paintAll();
    }
    function paintDay() {
      U.clear(dayBox);
      var list = visible().filter(function (e) { return e.date === st.day; }), hol = holidaySet(), f = st.form;
      dayBox.appendChild(h('h3', { class: 'cal-day-title' }, longDay(st.day)));
      if (hol[st.day]) dayBox.appendChild(h('p', { class: 'hint' }, 'Es feriado.'));
      dayBox.appendChild(list.length ? h('ul', { class: 'cal-list' }, list.map(function (e) { return evRow(e, false); })) : h('p', { class: 'hint' }, 'No hay nada anotado para este día.'));
      var timeRow = h('div', { class: 'cal-time' });
      function paintTimes() {
        U.clear(timeRow);
        if (f.allDay) return;
        timeRow.appendChild(UI.field('Desde', f, 'time', { type: 'time' })); timeRow.appendChild(UI.field('Hasta (opcional)', f, 'endTime', { type: 'time' }));
      }
      paintTimes();
      var form = h('form', { class: 'cal-form', novalidate: 'novalidate', onsubmit: function (ev) { ev.preventDefault(); saveEvent(); } },
        h('h4', { class: 'cal-form-t' }, f.id ? 'Editar evento' : 'Agregar un evento'),
        h('div', { class: 'form-grid' },
          UI.field('¿Qué quieres recordar?', f, 'title', { type: 'text', ph: 'Ej: Reunión con la directiva', cls: 'span2' }),
          UI.field('Fecha', f, 'date', { type: 'date' }),
          UI.field('Todo el día', f, 'allDay', { type: 'check', onChange: function () { if (f.allDay) { f.time = ''; f.endTime = ''; } paintTimes(); } })),
        timeRow,
        h('div', { class: 'form-grid' }, UI.field('Lugar (opcional)', f, 'place', { type: 'text', ph: 'Ej: Sede social', cls: 'span2' }), UI.field('Nota (opcional)', f, 'note', { type: 'text', cls: 'span2' })),
        h('div', { class: 'row-actions' }, h('button', { type: 'submit', class: 'btn primary' }, f.id ? 'Guardar cambios' : 'Agregar a mi calendario'),
          f.id ? UI.btn('Cancelar', { cls: 'ghost', onclick: function () { st.form = EMPTY_FORM(st.day); paintDay(); } }) : null));
      dayBox.appendChild(form);
    }

    function paintAll() { paintChips(); paintUpcoming(); paintToolbar(); stage._tok = (stage._tok || 0) + 1; stage.classList.remove('moving'); U.clear(stage); stage.appendChild(st.view === 'mes' ? buildMonth() : buildYear()); paintDay(); }
    paintAll();

    root.appendChild(UI.section('Lo que viene', [upcoming]));
    root.appendChild(UI.section('Mi calendario', [toolbar, pickBox, chips, h('div', { class: 'cal-layout' }, h('div', { class: 'cal-main' }, stage), dayBox)]));
    return root;
  } };

  RF.calendar = { collect: collect, googleUrl: googleUrl, toIcs: toIcs, KINDS: KINDS };
})(typeof window !== 'undefined' ? window : globalThis);
