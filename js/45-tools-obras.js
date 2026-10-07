/* Rinde Fácil — permisos y fotos de obras o activos: archivos aparte de las boletas.
 * Las fotos NO se leen con OCR (no hay nada que leer): solo se guardan y se ordenan. Los permisos y las fotos van a carpetas distintas del Drive. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, h = U.h, TOOLS = RF.tools = RF.tools || {};
  var KINDS = {
    permiso: { name: 'Permisos y documentos de la obra', folder: 'Obras - permisos', accept: 'image/*,application/pdf,.pdf', help: 'Permiso de edificación, recepción, planos u otros papeles. Guarda una copia física y una escaneada, como pide el Manual.' },
    foto: { name: 'Fotos de la obra o del activo', folder: 'Obras - fotos', accept: 'image/*', help: 'Respaldo fotográfico de los activos comprados o de la construcción. Las fotos no se leen con OCR: solo se ordenan.' }
  };

  function silent() { RF.store.update(function () { }, { silent: true }); }
  function ext(name, type) { var e = String(name || '').split('.').pop().toLowerCase(); if (/^(pdf|jpg|jpeg|png|webp)$/.test(e)) return '.' + (e === 'jpeg' ? 'jpg' : e); return /pdf/.test(type) ? '.pdf' : /png/.test(type) ? '.png' : /webp/.test(type) ? '.webp' : '.jpg'; }
  function mimeOf(name, type) { var e = String(name || '').split('.').pop().toLowerCase(); return { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[e] || type || 'image/jpeg'; }

  /* un archivo de obra va a «Obras - permisos» u «Obras - fotos», con la fecha y el nombre del proyecto */
  function saveToDrive(rec, project, blob) {
    var k = KINDS[rec.kind] || KINDS.foto, base = (rec.at || U.todayISO()).slice(0, 10) + ' · ' + (project && project.name || 'Proyecto') + ' · ' + String(rec.name || 'archivo').replace(/\.[^.]+$/, '').slice(0, 50);
    return RF.drive.saveObra(rec, k.folder, base + ext(rec.name, blob.type), blob);
  }

  TOOLS.obras = { title: 'Permisos y fotos de obras', icon: 'file', desc: 'Guarda aparte los permisos y las fotos de tus obras o activos. Las fotos no pasan por OCR y todo queda ordenado en el Drive.', render: function () {
    var p = RF.store.project(), root = h('div', { class: 'tool-page' }, h('h1', { class: 'tool-title' }, 'Permisos y fotos de obras'));
    if (!p) { root.appendChild(UI.callout('info', '', 'Primero crea o elige un proyecto.')); return root; }
    p.obras = p.obras || [];
    root.appendChild(h('p', { class: 'lead' }, 'Para compras de activos y construcciones el Manual pide los permisos y fotos del resultado. Se suben aquí, separados de las boletas: así no pasan por la lectura de documentos y quedan en carpetas distintas de tu Drive.'));
    var boxes = {};
    function paintKind(kind) {
      var k = KINDS[kind], box = boxes[kind]; U.clear(box);
      var items = p.obras.filter(function (x) { return x.kind === kind; });
      var inp = h('input', { type: 'file', accept: k.accept, multiple: true, class: 'sr-only', 'aria-label': 'Elegir ' + k.name.toLowerCase() });
      inp.addEventListener('change', function () { add(kind, Array.prototype.slice.call(inp.files || [])); inp.value = ''; });
      box.appendChild(h('p', { class: 'hint' }, k.help));
      box.appendChild(UI.fileDrop(inp, { kind: 'obra-' + kind, label: kind === 'foto' ? 'Suelta aquí las fotos o pulsa para elegirlas' : 'Suelta aquí los documentos o pulsa para elegirlos', hint: 'Se guardan en este dispositivo' + (RF.drive && RF.drive.enabled() ? ' y en tu Drive, en «' + k.folder + '».' : '.'), multiple: true }));
      box.appendChild(h('div', { class: 'row-actions' }, inp, UI.btn(kind === 'foto' ? 'Elegir fotos' : 'Elegir documentos', { icon: 'file', cls: 'primary', onclick: function () { inp.click(); } })));
      if (!items.length) { box.appendChild(UI.empty('Todavía no hay archivos aquí.')); return; }
      var ul = h('ul', { class: 'obra-list' });
      items.forEach(function (rec) {
        var li = h('li', { class: 'obra-item' });
        if (kind === 'foto') { var im = h('img', { alt: rec.name, class: 'obra-thumb', loading: 'lazy' }); li.appendChild(im); RF.blobs.get(rec.blobId).then(function (b) { if (b) im.src = URL.createObjectURL(b); }); }
        li.appendChild(h('div', { class: 'obra-meta' }, h('strong', null, rec.name), h('span', { class: 'hint' }, U.fmtDate(rec.at.slice(0, 10)) + (rec.driveUrl ? ' · ya está en tu Drive' : (RF.drive && RF.drive.enabled() ? ' · todavía no está en tu Drive' : ''))),
          h('div', { class: 'row-actions' }, rec.driveUrl ? h('a', { class: 'btn small ghost', href: rec.driveUrl, target: '_blank', rel: 'noopener' }, 'Ver en Drive') : null,
            UI.btn('Quitar', { cls: 'ghost small danger', onclick: function () { UI.confirmBox('¿Quitar este archivo de la app? Lo que ya esté en tu Drive no se borra.', 'Quitar').then(function (ok) { if (!ok) return; p.obras = p.obras.filter(function (x) { return x.id !== rec.id; }); silent(); paintKind(kind); }); } }))));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    function add(kind, files) {
      if (!files.length) return;
      var chain = Promise.resolve(), n = 0;
      files.forEach(function (f) {
        chain = chain.then(function () {
          if (f.size > 8 * 1024 * 1024) { UI.toast('«' + f.name + '» pesa más de 8 MB: el Drive no lo aceptaría.', 'bad'); return null; }
          var id = U.uid('ob'), rec = { id: id, kind: kind, name: f.name, mime: mimeOf(f.name, f.type), size: f.size, at: new Date().toISOString(), blobId: 'obra-' + id, driveUrl: '' };
          return RF.blobs.put(rec.blobId, f).then(function () {
            p.obras.push(rec); silent(); n++;
            if (RF.drive && RF.drive.auto()) saveToDrive(rec, p, f).then(function (r) { if (r && r.remote) { rec.driveUrl = r.url || ''; silent(); paintKind(kind); } }).catch(function () { });
          });
        });
      });
      chain.then(function () { if (n) { UI.toast(n === 1 ? 'Archivo guardado.' : n + ' archivos guardados.', 'ok'); if (RF.activity) RF.activity.log('respaldo', 'Subió ' + n + (kind === 'foto' ? ' foto(s)' : ' documento(s)') + ' de obra.', 'obras'); } paintKind(kind); });
    }
    Object.keys(KINDS).forEach(function (kind) { boxes[kind] = h('div'); paintKind(kind); root.appendChild(UI.section(KINDS[kind].name, [boxes[kind]])); });
    return root;
  } };
  RF.obras = { KINDS: KINDS, saveToDrive: saveToDrive };
})(typeof window !== 'undefined' ? window : globalThis);
