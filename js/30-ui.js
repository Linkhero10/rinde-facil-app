/* Rinde Fácil — piezas de interfaz reutilizables: campos, avisos, menú de exportar, iconos. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, h = U.h;

  /* ---------- iconos (SVG en línea, trazo simple) ---------- */
  var ICONS = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    check: 'M5 12l5 5L20 7',
    alert: 'M12 3l10 18H2L12 3zM12 10v5M12 18v.5',
    info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 11v6M12 7.5v.5',
    down: 'M6 9l6 6 6-6', right: 'M9 6l6 6-6 6', left: 'M15 6l-6 6 6 6', up: 'M6 15l6-6 6 6',
    menu: 'M4 6h16M4 12h16M4 18h16', close: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4V8zM12 17a4 4 0 100-8 4 4 0 000 8z', file: 'M6 3h8l4 4v14H6V3zM14 3v4h4', download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
    excel: 'M4 4h16v16H4V4zM4 10h16M4 15h16M10 4v16', word: 'M4 4h16v16H4V4zM8 9l1.5 7L12 10l2.5 6L16 9', pdf: 'M6 3h8l4 4v14H6V3zM14 3v4h4M9 15h6M9 18h4', copy: 'M8 8h11v13H8V8zM5 16V3h11', cloud: 'M7 18a4 4 0 01-.5-8 6 6 0 0111.5 1.5A3.5 3.5 0 0117 18H7z',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1', sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5', moon: 'M20 14A8 8 0 0110 4a8 8 0 1010 10z',
    help: 'M12 22a10 10 0 100-20 10 10 0 000 20zM9.5 9a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 4M12 17v.5', route: 'M6 3v12a3 3 0 003 3h6a3 3 0 003-3V9M6 3l-2 2M6 3l2 2M18 9l-2-2M18 9l2-2',
    gantt: 'M4 6h8M8 12h10M6 18h9', money: 'M3 7h18v10H3V7zM12 14a2 2 0 100-4 2 2 0 000 4z', form: 'M6 3h12v18H6V3zM9 8h6M9 12h6M9 16h4', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    scale: 'M12 3v18M5 7h14M5 7l-3 7a3 3 0 006 0L5 7zM19 7l-3 7a3 3 0 006 0l-3-7z', clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 7v5l3 2', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3', edit: 'M4 20h4L19 9l-4-4L4 16v4z', settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 8.5 4 8l-1 3 2 1v2l-2 1 1 3 2-.5L7.5 19l-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1v-2z'
  };
  function icon(name, size) {
    var s = size || 20;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', s); svg.setAttribute('height', s);
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ico');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name] || ICONS.info); svg.appendChild(p);
    return svg;
  }

  /* ---------- avisos ---------- */
  var toastTimer = null;
  function toast(msg, kind) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var t = h('div', { class: 'toast ' + (kind || ''), role: 'status' }, msg);
    host.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 3200);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3700);
  }
  function confirmBox(msg, okLabel) {
    return new Promise(function (resolve) {
      var dlg = h('dialog', { class: 'dlg' },
        h('p', { class: 'dlg-msg' }, msg),
        h('div', { class: 'dlg-actions' },
          h('button', { class: 'btn', type: 'button', onclick: function () { dlg.close(); resolve(false); } }, 'Cancelar'),
          h('button', { class: 'btn primary', type: 'button', onclick: function () { dlg.close(); resolve(true); } }, okLabel || 'Aceptar')));
      dlg.addEventListener('close', function () { if (dlg.parentNode) dlg.parentNode.removeChild(dlg); });
      document.body.appendChild(dlg);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
  }

  /* ---------- campos ---------- */
  var money = U.fmtNum;
  function labelWrap(label, control, hint, cls) {
    return h('label', { class: 'field ' + (cls || '') }, h('span', { class: 'lbl' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
  }
  /* Enlaza un input a obj[key]. type: text|textarea|date|money|number|select|check|rut. */
  function bind(obj, key, opts) {
    opts = opts || {};
    var type = opts.type || 'text';
    var onChange = opts.onChange || function () {};
    function commit(v) { obj[key] = v; RF.store.update(function () {}, { silent: true }); onChange(v); }
    var el;
    if (type === 'textarea') {
      el = h('textarea', { rows: opts.rows || 3, placeholder: opts.ph || '', maxlength: opts.max || null });
      el.value = obj[key] == null ? '' : obj[key];
      el.addEventListener('input', function () { commit(el.value); });
    } else if (type === 'select') {
      el = h('select', null, (opts.options || []).map(function (o) { return h('option', { value: o.id }, o.name); }));
      var cur = obj[key] == null ? '' : obj[key];
      el.value = cur;
      if (el.value !== String(cur)) { /* valor no está en la lista */ if (!opts.noEmpty) { el.insertBefore(h('option', { value: '' }, opts.empty || 'Elige…'), el.firstChild); el.value = ''; } }
      el.addEventListener('change', function () { commit(el.value); });
    } else if (type === 'check') {
      el = h('input', { type: 'checkbox' });
      el.checked = !!obj[key];
      el.addEventListener('change', function () { commit(el.checked); });
    } else if (type === 'money') {
      el = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: opts.ph || '0' });
      el.value = obj[key] === '' || obj[key] == null || obj[key] === 0 && !opts.showZero ? (obj[key] === 0 && opts.showZero ? '0' : '') : money(obj[key]);
      el.addEventListener('input', function () { commit(U.parseCLP(el.value)); });
      el.addEventListener('blur', function () { el.value = obj[key] ? money(obj[key]) : (opts.showZero && obj[key] === 0 ? '0' : ''); });
    } else if (type === 'number' || type === 'pct') {
      el = h('input', { type: 'number', inputmode: 'decimal', min: opts.min != null ? opts.min : (type === 'pct' ? 0 : null), max: opts.max != null ? opts.max : (type === 'pct' ? 100 : null), step: opts.step || 'any', placeholder: opts.ph || '' });
      el.value = obj[key] == null ? '' : obj[key];
      el.addEventListener('input', function () { commit(el.value === '' ? '' : Number(el.value)); });
    } else if (type === 'date') {
      el = h('input', { type: 'date', min: opts.min || null, max: opts.max || null });
      el.value = obj[key] || '';
      el.addEventListener('input', function () { commit(el.value); });
    } else if (type === 'rut') {
      el = h('input', { type: 'text', inputmode: 'text', autocomplete: 'off', placeholder: opts.ph || '12.345.678-5' });
      el.value = obj[key] || '';
      el.addEventListener('input', function () { commit(el.value); });
      el.addEventListener('blur', function () { if (el.value) { el.value = U.rutFormat(el.value); commit(el.value); } });
    } else {
      el = h('input', { type: 'text', placeholder: opts.ph || '', maxlength: opts.max || null, autocomplete: 'off' });
      el.value = obj[key] == null ? '' : obj[key];
      el.addEventListener('input', function () { commit(el.value); });
    }
    if (opts.name) el.setAttribute('name', opts.name);
    el.dataset.key = key;
    if (opts.aria) el.setAttribute('aria-label', opts.aria);
    return el;
  }
  function field(label, obj, key, opts) {
    opts = opts || {};
    var el = bind(obj, key, opts);
    if (opts.type === 'check') return h('label', { class: 'check ' + (opts.cls || '') }, el, h('span', null, label), opts.hint ? h('span', { class: 'hint' }, opts.hint) : null);
    var ctl = el;
    if (opts.counter) { /* contador de caracteres */
      var cnt = h('span', { class: 'counter' });
      var upd = function () { var n = String(obj[key] || '').length; cnt.textContent = n + ' / ' + opts.counter; cnt.className = 'counter' + (n > opts.counter ? ' bad' : n >= (opts.counterWarn || opts.counter) ? ' warn' : ''); };
      el.addEventListener('input', upd); upd();
      return h('label', { class: 'field ' + (opts.cls || '') }, h('span', { class: 'lbl' }, label), ctl, cnt, opts.hint ? h('span', { class: 'hint' }, opts.hint) : null);
    }
    return labelWrap(label, ctl, opts.hint, opts.cls);
  }

  /* ---------- botones y menú de exportar ---------- */
  function btn(label, opts) {
    opts = opts || {};
    return h('button', { type: 'button', class: 'btn ' + (opts.cls || ''), onclick: opts.onclick, disabled: opts.disabled, title: opts.title || null }, opts.icon ? icon(opts.icon, 18) : null, h('span', null, label));
  }
  /* getDoc: función que devuelve el documento actual. extras: [{label, icon, run}] */
  function exportBar(getDoc, base, extras) {
    var bar = h('div', { class: 'export-bar', role: 'group', 'aria-label': 'Sacar el documento' });
    function run(kind) {
      var d;
      try { d = getDoc(); } catch (e) { toast('No se pudo armar el documento: ' + e.message, 'bad'); return; }
      if (!d) return;
      if (kind === 'xlsx') RF.exp.downloadDocXlsx(d, base);
      else if (kind === 'doc') RF.exp.downloadWord(d, base);
      else if (kind === 'pdf') RF.exp.printDoc(d);
      else if (kind === 'txt') U.copyText(RF.exp.docToText(d)).then(function (ok) { toast(ok ? 'Texto copiado. Ya puedes pegarlo.' : 'No se pudo copiar. Usa «Descargar texto».', ok ? 'ok' : 'bad'); });
      else if (kind === 'txtfile') RF.exp.downloadText(d, base);
    }
    bar.appendChild(h('span', { class: 'export-label' }, 'Sacar documento:'));
    bar.appendChild(btn('Excel', { icon: 'excel', onclick: function () { run('xlsx'); } }));
    bar.appendChild(btn('Word', { icon: 'word', onclick: function () { run('doc'); } }));
    bar.appendChild(btn('PDF', { icon: 'pdf', onclick: function () { run('pdf'); } }));
    bar.appendChild(btn('Copiar texto', { icon: 'copy', onclick: function () { run('txt'); } }));
    (extras || []).forEach(function (x) { bar.appendChild(btn(x.label, { icon: x.icon, onclick: x.run })); });
    return bar;
  }

  /* ---------- pequeñas piezas ---------- */
  function badge(text, kind) { return h('span', { class: 'badge ' + (kind || '') }, text); }
  function callout(kind, title, body) { return h('div', { class: 'callout ' + kind, role: kind === 'bad' ? 'alert' : null }, title ? h('strong', null, title) : null, body ? h('span', null, ' ' + body) : null); }
  function empty(text) { return h('p', { class: 'empty-note' }, text); }
  function section(title, kids, cls) { return h('section', { class: 'card ' + (cls || '') }, title ? h('h3', { class: 'card-title' }, title) : null, kids); }
  function progressBar(done, total, label) {
    var pct = total ? Math.round(done * 100 / total) : 0;
    return h('div', { class: 'pbar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': label || 'Avance' }, h('span', { style: { width: pct + '%' } }));
  }

  RF.ui = { icon: icon, ICONS: ICONS, toast: toast, confirmBox: confirmBox, bind: bind, field: field, labelWrap: labelWrap, btn: btn, exportBar: exportBar, badge: badge, callout: callout, empty: empty, section: section, progressBar: progressBar };
})(typeof window !== 'undefined' ? window : globalThis);
