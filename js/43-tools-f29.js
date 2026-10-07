/* Rinde Fácil — Formulario 29 (SII) mes a mes: guarda el F29 real que sube la comunidad y lo compara con el IVA de las facturas anotadas.
 * Si todavía no hay F29, deja listo el IVA del mes para revisarlo con quien lo declara. No lee el archivo: la persona anota los totales que aparecen en su F29. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, L = RF.logic, h = U.h, TOOLS = RF.tools = RF.tools || {};
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function monthName(mes) { return MONTHS[+mes.slice(5, 7) - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + mes.slice(0, 4); }
  function num(x) { return Number(x) || 0; }

  TOOLS.f29 = { title: 'Formulario 29 (IVA)', icon: 'file', desc: 'Sube tu F29 de cada mes y revisamos que calce con el IVA de tus facturas.', render: function () {
    var s = RF.store.get(), p = RF.store.project();
    var root = h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, 'Formulario 29 (IVA)'));
    if (!p) { root.appendChild(UI.callout('info', '', 'Primero crea o elige un proyecto.')); return root; }
    p.f29 = p.f29 || [];
    root.appendChild(h('p', { class: 'lead' }, 'El Manual pide el F29 del período junto a cada factura. Súbelo aquí, mes por mes, y anota los totales que aparecen en él: la app los compara con el IVA de las facturas que anotaste y te avisa si algo no calza.'));
    if ((s.community || {}).ivaModo === 'no_contribuyente') root.appendChild(UI.callout('info', 'Tu comunidad figura como no contribuyente de IVA.', ' Si no declaras F29, no necesitas esta herramienta. Si igual te lo piden junto a una factura, súbelo aquí.'));
    var box = h('div'), addBox = h('div', { class: 'row-actions' });
    function save() { RF.store.update(function () { }, { silent: true }); }
    function paint() {
      U.clear(box);
      var audit = L.f29Audit(p, s.community);
      if (!audit.items.length) box.appendChild(UI.empty('Todavía no hay facturas con IVA anotadas. Cuando las anotes en «Gastos y rendición», aquí aparece cada mes con el IVA que debería llevar tu F29.'));
      audit.items.forEach(function (it) {
        var rec = it.record, card = h('div', { class: 'stage-card f29-card' });
        card.appendChild(h('div', { class: 'stage-head' }, h('span', { class: 'stage-n' }, monthName(it.mes)), h('span', { class: 'f29-sum' }, it.n ? it.n + (it.n === 1 ? ' factura' : ' facturas') + ' anotadas · IVA ' + U.fmtCLP(it.iva) : 'Sin facturas anotadas este mes')));
        var statusBox = h('div'); function paintStatus() { var a = L.f29Audit(p, s.community).items.filter(function (x) { return x.mes === it.mes; })[0] || it; U.clear(statusBox); statusBox.appendChild(UI.callout(a.level === 'ok' ? 'ok' : a.level === 'warn' ? 'warn' : 'info', '', a.msg)); }
        paintStatus(); card.appendChild(statusBox);
        if (!rec) {
          card.appendChild(h('div', { class: 'row-actions' }, UI.btn('Agregar el F29 de este mes', { icon: 'plus', cls: 'primary', onclick: function () { p.f29.push({ id: U.uid('f29'), mes: it.mes, creditos: '', debitos: '', determinado: '', file: null, nota: '' }); save(); paint(); } })));
        } else {
          var inp = h('input', { type: 'file', accept: 'image/*,application/pdf,.pdf', class: 'sr-only', 'aria-label': 'Elegir el F29 de ' + monthName(it.mes) });
          inp.addEventListener('change', function () {
            var f = inp.files && inp.files[0]; if (!f) return;
            if (f.size > 8 * 1024 * 1024) { UI.toast('El archivo pesa más de 8 MB: no lo aceptará el Drive.', 'bad'); return; }
            var blobId = rec.file && rec.file.blobId || ('f29-' + rec.id);
            RF.blobs.put(blobId, f).then(function () {
              rec.file = { blobId: blobId, name: f.name, type: f.type || '', size: f.size, at: new Date().toISOString(), driveUrl: '' }; save();
              UI.toast('F29 guardado en este dispositivo.', 'ok'); if (RF.activity) RF.activity.log('f29', 'Subió el F29 de ' + monthName(rec.mes) + '.', 'f29'); paint();
              if (RF.drive && RF.drive.auto()) RF.drive.saveF29(rec, p, f).then(function (r) { if (r && r.remote) { rec.file.driveUrl = r.url || ''; save(); paint(); } }).catch(function () { });
            });
          });
          card.appendChild(h('div', { class: 'form-grid' },
            UI.field('Total de créditos del F29 ($)', rec, 'creditos', { type: 'money', hint: 'El IVA crédito fiscal que aparece en tu F29 de este mes.', onChange: function () { save(); paintStatus(); } }),
            UI.field('Total de débitos del F29 ($, si lo tienes)', rec, 'debitos', { type: 'money', onChange: save }),
            UI.field('IVA a pagar o remanente ($, si lo tienes)', rec, 'determinado', { type: 'money', onChange: save }),
            UI.field('Nota (opcional)', rec, 'nota', { type: 'text', onChange: save })));
          card.appendChild(h('div', { class: 'row-actions' }, inp, UI.btn(rec.file ? 'Cambiar el archivo del F29' : 'Subir el F29 (foto o PDF)', { icon: 'file', cls: rec.file ? 'ghost' : 'primary', onclick: function () { inp.click(); } }),
            rec.file ? h('span', { class: 'file-name' }, rec.file.name + (rec.file.driveUrl ? ' · ya está en tu Drive' : (RF.drive && RF.drive.enabled() ? ' · todavía no está en tu Drive' : ''))) : null,
            rec.file && rec.file.driveUrl ? h('a', { class: 'btn small ghost', href: rec.file.driveUrl, target: '_blank', rel: 'noopener' }, 'Ver en Drive') : null,
            UI.btn('Quitar este mes', { cls: 'ghost small danger', onclick: function () { UI.confirmBox('¿Quitar el F29 de ' + monthName(it.mes) + ' de la app? El archivo que ya esté en tu Drive no se borra.', 'Quitar').then(function (ok) { if (!ok) return; p.f29 = p.f29.filter(function (x) { return x.id !== rec.id; }); save(); paint(); }); } })));
        }
        box.appendChild(card);
      });
    }
    paint();
    var monthIn = h('input', { type: 'month', 'aria-label': 'Otro mes' });
    addBox.appendChild(h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Agregar otro mes'), monthIn));
    addBox.appendChild(UI.btn('Agregar', { icon: 'plus', cls: 'ghost', onclick: function () { var m = monthIn.value; if (!/^\d{4}-\d{2}$/.test(m)) { UI.toast('Elige un mes.', 'bad'); return; } if (!p.f29.some(function (r) { return r.mes === m; })) { p.f29.push({ id: U.uid('f29'), mes: m, creditos: '', debitos: '', determinado: '', file: null, nota: '' }); save(); } monthIn.value = ''; paint(); } }));
    root.appendChild(UI.section('Mes por mes', [box]));
    root.appendChild(UI.section('Otro mes', [addBox]));
    root.appendChild(UI.section('Para revisarlo con quien declara', [h('p', { class: 'hint' }, 'Si todavía no tienes el F29, igual puedes sacar el IVA de tus facturas por mes y comparar con lo que declara tu contador.'),
      UI.exportBar(function () {
        var a = L.f29Audit(p, s.community);
        return { title: 'IVA de las facturas anotadas por mes', subtitle: p.name, sheet: 'IVA por mes', footer: 'Generado con Rinde Fácil. Compáralo con el F29 de cada mes.', blocks: [{ t: 'table', head: ['Mes', 'Facturas', 'IVA de las facturas ($)', 'Créditos del F29 ($)', 'Estado'], types: ['text', 'number', 'money', 'money', 'text'], rows: a.items.map(function (it) { return [monthName(it.mes), it.n, it.iva, it.record && it.record.creditos !== '' ? num(it.record.creditos) : '', it.msg]; }) }] };
      }, 'iva-por-mes')]));
    return root;
  } };
})(typeof window !== 'undefined' ? window : globalThis);
