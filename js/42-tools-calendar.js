/* Rinde Fácil — calendario: todas las fechas del proyecto en un solo lugar (plazos, actividades, boletas, reuniones y las que la comunidad anote).
 * Se puede pasar a Google Calendar (por fecha, o todo junto en un archivo .ics que también abren Outlook y el teléfono).
 * Nada sale de este dispositivo hasta que la persona descarga el archivo o abre el enlace. */
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
  var ISO = /^\d{4}-\d{2}-\d{2}$/;

  function valid(iso) { return typeof iso === 'string' && ISO.test(iso); }

  /* junta todas las fechas del proyecto activo y las de la comunidad; cada una: { date, title, kind, tool?, note? } */
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
        if (!o.respondida) add(L.aclaracionDeadline(o.recibida, (s && s.holidays) || []), 'Vence el plazo para aclarar la observación', 'plazo', { tool: 'observaciones', note: 'Son 10 días hábiles. Se puede aclarar una sola vez.' });
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
    ((s && s.holidays) || []).forEach(function (d) { add(d, 'Feriado que anotaste', 'mio', { tool: 'proyecto' }); });
    ((s && s.events) || []).forEach(function (e) { if (e) add(e.date, String(e.title || '').slice(0, 120), 'mio', { own: e.id, note: String(e.note || '').slice(0, 300) }); });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title, 'es'); });
    return out;
  }

  /* ---------- Google Calendar / archivo .ics ---------- */
  function compact(iso) { return iso.replace(/-/g, ''); }
  function googleUrl(ev) {
    var end = U.addDays(ev.date, 1); /* las fechas de día completo terminan al día siguiente */
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title) +
      '&dates=' + compact(ev.date) + '/' + compact(end) + '&details=' + encodeURIComponent((ev.note ? ev.note + '\n' : '') + 'Desde Rinde Fácil.');
  }
  function icsEsc(t) { return String(t).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
  function fold(line) { var out = [], rest = line; while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); } out.push(rest); return out.join('\r\n'); }
  function toIcs(events, stamp) {
    var now = stamp || new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rinde Facil//Calendario//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Rinde Fácil'];
    events.forEach(function (ev, i) {
      lines.push('BEGIN:VEVENT');
      lines.push('UID:rinde-facil-' + compact(ev.date) + '-' + i + '-' + (ev.title.length) + '@rindefacil');
      lines.push('DTSTAMP:' + now);
      lines.push('DTSTART;VALUE=DATE:' + compact(ev.date));
      lines.push('DTEND;VALUE=DATE:' + compact(U.addDays(ev.date, 1)));
      lines.push('SUMMARY:' + icsEsc(ev.title));
      if (ev.note) lines.push('DESCRIPTION:' + icsEsc(ev.note));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /* ---------- pantalla ---------- */
  function monthStart(iso) { return iso.slice(0, 8) + '01'; }
  function shiftMonth(iso, n) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + (m + 1 < 10 ? '0' : '') + (m + 1) + '-01'; }
  function daysIn(iso) { return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate(); }
  function weekday(iso) { return (new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay() + 6) % 7; } /* lunes = 0 */

  TOOLS.calendario = { title: 'Calendario', icon: 'calendar', desc: 'Todas tus fechas en un solo lugar: plazos, actividades, boletas y reuniones. Se puede pasar a Google Calendar.', render: function () {
    var today = U.todayISO();
    var st = { month: monthStart(today), day: today, kinds: {}, ev: { date: '', title: '', note: '' } };
    KINDS.forEach(function (k) { st.kinds[k.id] = true; });
    var root = h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, 'Calendario'),
      h('p', { class: 'lead' }, 'Aquí aparece toda fecha que anotas en la app: el inicio y el término del proyecto, los plazos, las actividades de la Carta Gantt, las boletas y las reuniones. También puedes agregar tus propias fechas.'));
    var upcoming = h('div'), chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Qué fechas mostrar' }), gridBox = h('div'), dayBox = h('div'), addBox = h('div');

    function visible() { return collect(RF.store.get(), RF.store.project()).filter(function (e) { return st.kinds[e.kind]; }); }
    function gcal(ev) { return h('a', { class: 'cal-g', href: googleUrl(ev), target: '_blank', rel: 'noopener' }, 'Agregar a Google Calendar'); }
    function evRow(ev, withDate) {
      var k = KIND_BY[ev.kind] || KIND_BY.mio;
      return h('li', { class: 'cal-ev' },
        h('span', { class: 'cal-dot', style: { background: k.color }, title: k.name }),
        h('span', { class: 'cal-ev-t' }, withDate ? h('strong', null, U.fmtDate(ev.date) + ' · ') : null, ev.title, ev.note ? h('span', { class: 'muted' }, ' · ' + ev.note) : null),
        h('span', { class: 'cal-ev-a' },
          ev.tool && RF.tools[ev.tool] ? h('a', { href: '#/h/' + ev.tool }, 'Abrir') : null,
          gcal(ev),
          ev.own ? UI.btn('Quitar', { cls: 'ghost small', onclick: function () { RF.store.update(function (x) { x.events = (x.events || []).filter(function (e) { return e.id !== ev.own; }); }); paint(); } }) : null));
    }
    function paintUpcoming() {
      U.clear(upcoming);
      var list = visible().filter(function (e) { return e.date >= today; }).slice(0, 8);
      if (!list.length) { upcoming.appendChild(UI.empty('No hay fechas por delante. Cuando anotes fechas en tu proyecto, aparecen aquí.')); return; }
      upcoming.appendChild(h('ul', { class: 'cal-list' }, list.map(function (e) { return evRow(e, true); })));
    }
    function paintChips() {
      U.clear(chips);
      KINDS.forEach(function (k) {
        chips.appendChild(h('button', { type: 'button', class: 'chip' + (st.kinds[k.id] ? ' on' : ''), 'aria-pressed': st.kinds[k.id] ? 'true' : 'false', onclick: function () { st.kinds[k.id] = !st.kinds[k.id]; paint(); } },
          h('span', { class: 'cal-dot', style: { background: k.color } }), ' ' + k.name));
      });
    }
    function paintGrid() {
      U.clear(gridBox);
      var evs = visible(), byDay = {};
      evs.forEach(function (e) { (byDay[e.date] = byDay[e.date] || []).push(e); });
      var first = st.month, n = daysIn(first), off = weekday(first), rows = [], cells = [], d;
      var y = first.slice(0, 4), mo = first.slice(5, 7);
      for (d = 0; d < off; d++) cells.push(h('td', { class: 'cal-empty' }));
      for (d = 1; d <= n; d++) {
        (function (day) {
          var iso = y + '-' + mo + '-' + (day < 10 ? '0' : '') + day, list = byDay[iso] || [], kinds = [];
          list.forEach(function (e) { if (kinds.indexOf(e.kind) < 0) kinds.push(e.kind); });
          cells.push(h('td', { class: 'cal-cell' + (iso === today ? ' today' : '') + (iso === st.day ? ' sel' : '') },
            h('button', { type: 'button', class: 'cal-day', 'aria-label': day + ' de ' + MONTHS[+mo - 1] + (list.length ? ': ' + list.length + (list.length === 1 ? ' fecha' : ' fechas') : ''), 'aria-pressed': iso === st.day ? 'true' : 'false', onclick: function () { st.day = iso; paintGrid(); paintDay(); } },
              h('span', { class: 'cal-num' }, String(day)),
              h('span', { class: 'cal-dots' }, kinds.slice(0, 4).map(function (k) { return h('span', { class: 'cal-dot', style: { background: KIND_BY[k].color } }); })))));
        })(d);
        if (cells.length === 7) { rows.push(h('tr', null, cells)); cells = []; }
      }
      if (cells.length) { while (cells.length < 7) cells.push(h('td', { class: 'cal-empty' })); rows.push(h('tr', null, cells)); }
      gridBox.appendChild(h('div', { class: 'cal-head' },
        UI.btn('‹ Mes anterior', { cls: 'ghost small', onclick: function () { st.month = shiftMonth(st.month, -1); paintGrid(); } }),
        h('h2', { class: 'cal-month' }, MONTHS[+mo - 1].charAt(0).toUpperCase() + MONTHS[+mo - 1].slice(1) + ' ' + y),
        UI.btn('Mes siguiente ›', { cls: 'ghost small', onclick: function () { st.month = shiftMonth(st.month, 1); paintGrid(); } }),
        UI.btn('Hoy', { cls: 'ghost small', onclick: function () { st.month = monthStart(today); st.day = today; paintGrid(); paintDay(); } })));
      gridBox.appendChild(h('div', { class: 'table-scroll' }, h('table', { class: 'cal-grid', 'aria-label': 'Calendario de ' + MONTHS[+mo - 1] + ' ' + y },
        h('thead', null, h('tr', null, ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(function (x) { return h('th', { scope: 'col' }, x); }))), h('tbody', null, rows))));
    }
    function paintDay() {
      U.clear(dayBox);
      var list = visible().filter(function (e) { return e.date === st.day; });
      dayBox.appendChild(h('h3', { class: 'grp' }, U.fmtDate(st.day)));
      dayBox.appendChild(list.length ? h('ul', { class: 'cal-list' }, list.map(function (e) { return evRow(e, false); })) : UI.empty('No hay nada anotado para este día.'));
    }
    function paintAdd() {
      U.clear(addBox);
      st.ev.date = st.ev.date || st.day;
      var row = h('div', { class: 'form-grid' }, UI.field('Fecha', st.ev, 'date', { type: 'date' }), UI.field('¿Qué quieres recordar?', st.ev, 'title', { type: 'text', ph: 'Ej: Reunión con la directiva', cls: 'span2' }), UI.field('Nota (opcional)', st.ev, 'note', { type: 'text', cls: 'span2' }));
      addBox.appendChild(row);
      addBox.appendChild(UI.btn('Agregar a mi calendario', { icon: 'plus', cls: 'primary', onclick: function () {
        var t = String(st.ev.title || '').trim();
        if (!valid(st.ev.date) || !t) { UI.toast('Escribe la fecha y qué quieres recordar.', 'bad'); return; }
        RF.store.update(function (x) { x.events = (x.events || []).concat([{ id: U.uid('ev'), date: st.ev.date, title: t.slice(0, 120), note: String(st.ev.note || '').slice(0, 300) }]); });
        UI.toast('Fecha agregada a tu calendario.', 'ok'); st.day = st.ev.date; st.month = monthStart(st.ev.date); st.ev = { date: '', title: '', note: '' }; paint();
      } }));
    }
    function paint() { paintChips(); paintUpcoming(); paintGrid(); paintDay(); paintAdd(); }
    paint();

    root.appendChild(UI.section('Lo que viene', [upcoming]));
    root.appendChild(UI.section('Mes a mes', [chips, gridBox, dayBox]));
    root.appendChild(UI.section('Agregar una fecha mía', [addBox]));
    root.appendChild(UI.section('Pasarlo a Google Calendar', [
      h('p', { class: 'hint' }, 'En cada fecha hay un enlace «Agregar a Google Calendar»: abre Google con la fecha ya puesta y tú confirmas. Para pasar todo de una vez, descarga el archivo y en Google Calendar entra a Configuración › Importar y exportar › Importar. Sirve también para Outlook y para el calendario del teléfono. Nada se envía mientras tú no lo hagas.'),
      h('div', { class: 'row-actions' }, UI.btn('Descargar todas mis fechas (.ics)', { icon: 'excel', cls: 'primary', onclick: function () {
        var evs = visible();
        if (!evs.length) { UI.toast('Todavía no hay fechas para descargar.', 'bad'); return; }
        U.download(new Blob([toIcs(evs)], { type: 'text/calendar;charset=utf-8' }), 'rinde-facil-calendario.ics');
        UI.toast('Descargado. Ábrelo para agregarlo a tu calendario.', 'ok');
      } }))]));
    return root;
  } };

  RF.calendar = { collect: collect, googleUrl: googleUrl, toIcs: toIcs, KINDS: KINDS };
})(typeof window !== 'undefined' ? window : globalThis);
