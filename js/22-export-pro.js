/* Rinde Fácil — documentos «profesionales»: portada, índice, gráficos (en el PDF como dibujo, en el Word como imagen), Excel con una hoja por sección
 * y una vista previa de cómo queda en Word, PDF y Excel. Los bloques especiales (cover, toc, chart, pagebreak, big) se convierten a bloques básicos
 * según el formato, así los demás documentos de la app no cambian. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, E = RF.exp = RF.exp || {};
  var SPECIAL = { cover: 1, toc: 1, chart: 1 };

  function esc(x) { return U.esc(x == null ? '' : x); }
  function compact(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(Math.round(n)); }

  /* ---------- gráficos como SVG autónomo (colores en hexadecimal, sin variables CSS) ---------- */
  function chartSvg(b) {
    var W = 760, font = 'font-family="Arial, Helvetica, sans-serif"', out = [], H;
    function text(x, y, t, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" ' + font + ' font-size="' + (o.s || 12) + '" fill="' + (o.c || '#333') + '"' + (o.w ? ' font-weight="' + o.w + '"' : '') + (o.a ? ' text-anchor="' + o.a + '"' : '') + '>' + esc(t) + '</text>'; }
    if (b.kind === 'hbar') {
      var rows = b.items || []; H = 46 + rows.length * 40;
      out.push(text(8, 22, b.title, { s: 15, w: 'bold', c: '#111' }));
      rows.forEach(function (r, i) {
        var y = 44 + i * 40, scale = Math.max(r.max || 0, r.value || 0, 1), w = 380;
        out.push(text(8, y + 15, r.label, { s: 13, w: '600' }));
        out.push('<rect x="200" y="' + y + '" width="' + w + '" height="18" rx="9" fill="#e7e1f0"/>');
        out.push('<rect x="200" y="' + y + '" width="' + Math.max(0, Math.min(w, w * (r.value || 0) / scale)) + '" height="18" rx="9" fill="' + r.color + '"/>');
        if (r.max) out.push('<rect x="' + (200 + Math.min(w, w * r.max / scale) - 1) + '" y="' + (y - 4) + '" width="2.5" height="26" fill="#111"/>');
        out.push(text(592, y + 14, r.text || '', { s: 12 }));
      });
    } else if (b.kind === 'vbar') {
      var cats = b.cats || [], n = cats.length, bw = Math.max(14, Math.min(34, Math.floor(620 / Math.max(1, n)) - 8)), gap = Math.max(6, Math.floor((620 - n * bw) / Math.max(1, n)));
      var left = 70, top = 44, base = 236; H = 286;
      var totals = cats.map(function (_, i) { return b.series.reduce(function (a, s) { return a + (s.values[i] || 0); }, 0); }), max = Math.max.apply(null, totals.concat([1]));
      out.push(text(8, 22, b.title, { s: 15, w: 'bold', c: '#111' }));
      [0, 0.5, 1].forEach(function (f) { out.push('<line x1="' + (left - 6) + '" x2="' + (W - 8) + '" y1="' + (base - (base - top) * f) + '" y2="' + (base - (base - top) * f) + '" stroke="#d8d1e3" stroke-dasharray="3 4"/>'); out.push(text(left - 12, base - (base - top) * f + 4, f === 0 ? '$ 0' : '$ ' + compact(max * f), { s: 10.5, a: 'end', c: '#666' })); });
      cats.forEach(function (c, i) {
        var x = left + i * (bw + gap), y = base;
        b.series.forEach(function (s) { var v = s.values[i] || 0; if (!v) return; var hh = Math.max(2, v * (base - top) / max); y -= hh; out.push('<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + hh + '" rx="2" fill="' + s.color + '"/>'); });
        if (n <= 14 || i % 2 === 0) out.push(text(x + bw / 2, base + 15, c.label || c, { s: 10.5, a: 'middle', c: '#444' }));
        if (c.year) out.push(text(x, base + 30, c.year, { s: 10.5, w: 'bold', c: '#51247a' }));
      });
      var lx = left; b.series.forEach(function (s) { out.push('<rect x="' + lx + '" y="262" width="10" height="10" rx="2" fill="' + s.color + '"/>'); out.push(text(lx + 15, 271, s.name, { s: 11, c: '#333' })); lx += 28 + s.name.length * 6.2; });
    } else { /* donut */
      var items = (b.items || []).filter(function (x) { return x.value > 0; }), tot = items.reduce(function (a, x) { return a + x.value; }, 0) || 1; H = 230;
      out.push(text(8, 22, b.title, { s: 15, w: 'bold', c: '#111' }));
      var cx = 120, cy = 135, r = 70, C = 2 * Math.PI * r, off = 0;
      out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#e7e1f0" stroke-width="30"/>');
      items.forEach(function (x) { var len = C * x.value / tot; out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + x.color + '" stroke-width="30" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>'); off += len; });
      out.push(text(cx, cy + 6, b.center || String(tot), { s: 22, w: 'bold', a: 'middle', c: '#111' }));
      (b.items || []).forEach(function (x, i) { var y = 70 + i * 34; out.push('<rect x="260" y="' + (y - 11) + '" width="14" height="14" rx="3" fill="' + x.color + '"/>'); out.push(text(284, y, x.label + ': ' + x.value + (tot ? ' (' + Math.round(x.value * 100 / tot) + ' %)' : ''), { s: 13 })); });
    }
    b._w = W; b._h = H;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' + '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>' + out.join('') + '</svg>';
  }
  function chartRows(b) {
    if (b.kind === 'hbar') return { head: ['Concepto', 'Valor', 'Referencia'], rows: (b.items || []).map(function (r) { return [r.label, r.value, r.text || '']; }) };
    if (b.kind === 'vbar') return { head: ['Mes'].concat(b.series.map(function (s) { return s.name; })), rows: (b.cats || []).map(function (c, i) { return [c.label || c].concat(b.series.map(function (s) { return s.values[i] || 0; })); }) };
    return { head: ['Concepto', 'Cantidad'], rows: (b.items || []).map(function (x) { return [x.label, x.value]; }) };
  }

  /* ---------- portada, índice, subtítulos, Carta Gantt, indicadores ---------- */
  function secNum(t) { var m = /^(\d+)\.\s*(.*)$/.exec(String(t || '')); return m ? { n: m[1], t: m[2] } : { n: '', t: String(t || '') }; }
  function coverHtml(b) {
    var rows = (b.rows || []).filter(function (r) { return r[1]; });
    return '<section class="cover"><div class="cv-band"></div><div class="cv-body"><p class="cv-k">' + esc(b.kicker || 'Informe') + '</p>' +
      '<div class="cv-mid"><h1 class="cv-t">' + esc(b.title) + '</h1><p class="cv-s">' + esc(b.subtitle || '') + '</p><div class="cv-rule"></div>' +
      '<dl class="cv-meta">' + rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl></div>' +
      (b.kpis && b.kpis.length ? '<div class="cv-kpis">' + b.kpis.map(function (k) { return '<div><span class="kv-v">' + esc(k.value) + '</span><span class="kv-l">' + esc(k.label) + '</span></div>'; }).join('') + '</div>' : '') +
      (b.note ? '<p class="cv-note">' + esc(b.note) + '</p>' : '') + '</div></section>';
  }
  function ganttHtml(b) {
    var ms = b.months || [], cols = 6 + ms.length, last = '', out = '<table class="gantt"><colgroup><col style="width:23%"><col style="width:15%"><col style="width:17%">' + ms.map(function () { return '<col>'; }).join('') + '</colgroup>' +
      '<thead><tr><th>Actividad</th><th>Período</th><th>Resultado o hito</th>' + ms.map(function (m) { return '<th class="gm"><span>' + esc(m) + '</span></th>'; }).join('') + '</tr></thead><tbody>';
    cols = 3 + ms.length;
    (b.rows || []).forEach(function (r) {
      if (r.stage !== last) { last = r.stage; out += '<tr class="gs"><td colspan="' + cols + '">' + esc(r.stage) + '</td></tr>'; }
      out += '<tr><td>' + esc(r.name) + '</td><td class="gp">' + esc(U.fmtDateShort ? U.fmtDateShort(r.start) : r.start) + ' – ' + esc(U.fmtDateShort ? U.fmtDateShort(r.end) : r.end) + '</td><td>' + esc(r.result || '') + '</td>' + (r.on || []).map(function (on) { return '<td class="' + (on ? 'g-on' : 'g-off') + '"></td>'; }).join('') + '</tr>';
    });
    return out + '</tbody></table>';
  }
  function expand(doc, fmt) {
    if (!doc || !doc.blocks || !doc.blocks.some(function (b) { return SPECIAL[b.t] || b.t === 'h3' || b.t === 'gantt' || b.wide; })) return doc;
    var heads = doc.blocks.filter(function (b) { return b.t === 'h'; }).map(function (b) { return b.text; });
    var blocks = [];
    function takeHead() { var l = blocks[blocks.length - 1]; if (l && l.hd) { blocks.pop(); return l.html; } return ''; }
    function kpiRows(b) { return (b.kpis || []).map(function (k) { return [k.label, k.value]; }); }
    function ganttTable(b) { var ms = b.months || []; return { t: 'table', head: ['Etapa', 'Actividad', 'Inicio', 'Término', 'Días', 'Resultado o hito'].concat(ms), types: ['text', 'text', 'date', 'date', 'num', 'text'].concat(ms.map(function () { return 'text'; })), rows: (b.rows || []).map(function (r) { return [r.stage, r.name, r.start, r.end, r.days, r.result].concat((r.on || []).map(function (on) { return on ? '■' : ''; })); }) }; }
    doc.blocks.forEach(function (b) {
      if (b.t === 'cover') {
        if (fmt === 'html') blocks.push({ t: 'html', html: coverHtml(b) });
        else if (fmt === 'docx') { blocks.push({ t: 'big', text: (b.kicker || 'Informe').toUpperCase(), sz: 11, color: '#51247a', before: 1800, after: 120 }, { t: 'big', text: b.title, sz: 28, color: '#111111', after: 80 }, { t: 'big', text: b.subtitle || '', sz: 14, color: '#555555', after: 360 }, { t: 'kv', rows: (b.rows || []).filter(function (r) { return r[1]; }) }, { t: 'big', text: '', sz: 8, after: 600 }, { t: 'kpis', items: b.kpis || [] }, { t: 'note', text: b.note || '' }, { t: 'pagebreak' }); }
        else { blocks.push({ t: 'kv', rows: (b.rows || []).filter(function (r) { return r[1]; }).concat(kpiRows(b)) }); }
      } else if (b.t === 'toc') {
        if (fmt === 'html') blocks.push({ t: 'html', html: '<section class="toc-pg"><h2 class="toc-h">Contenido</h2><ol class="toc">' + heads.map(function (x) { var s = secNum(x); return '<li><span class="tn">' + esc(s.n) + '</span><span class="tt">' + esc(s.t) + '</span></li>'; }).join('') + '</ol></section><div class="pb"></div>' });
        else if (fmt === 'docx') { blocks.push({ t: 'h', text: 'Contenido' }); heads.forEach(function (x) { blocks.push({ t: 'p', text: x }); }); blocks.push({ t: 'pagebreak' }); }
      } else if (b.t === 'h' && fmt === 'html' && doc.report) {
        var sn = secNum(b.text); blocks.push({ t: 'html', hd: true, html: '<h2>' + (sn.n ? '<span class="sn">' + esc(sn.n) + '</span>' : '') + esc(sn.t) + '</h2>' });
      } else if (b.t === 'h3') {
        if (fmt === 'html') blocks.push({ t: 'html', hd: true, html: '<h3>' + esc(b.text) + '</h3>' });
        else if (fmt === 'docx') blocks.push({ t: 'big', hd: true, text: b.text, sz: 12, color: '#51247a', before: 160, after: 60 });
        else blocks.push({ t: 'p', text: b.text });
      } else if (b.t === 'gantt') {
        if (fmt === 'html') blocks.push({ t: 'html', html: '<div class="wide">' + takeHead() + ganttHtml(b) + '</div>' });
        else if (fmt === 'docx') blocks.push(b);
        else blocks.push(ganttTable(b));
      } else if (b.t === 'table' && fmt === 'html' && (b.wide || (b.head || []).length >= 8)) {
        blocks.push({ t: 'html', html: '<div class="wide">' + takeHead() }, b, { t: 'html', html: '</div>' });
      } else if (b.t === 'chart') {
        if (fmt === 'html') blocks.push({ t: 'html', html: '<figure class="chart">' + chartSvg(b) + (b.note ? '<figcaption>' + esc(b.note) + '</figcaption>' : '') + '</figure>' });
        else if (fmt === 'docx' && b.png) { blocks.push({ t: 'image', png: b.png, w: b._w || 760, h: b._h || 300 }); if (b.note) blocks.push({ t: 'note', text: b.note }); }
        else { var cr = chartRows(b); blocks.push({ t: 'p', text: b.title }); blocks.push({ t: 'table', head: cr.head, rows: cr.rows, types: cr.head.map(function (_, i) { return i ? 'money' : 'text'; }) }); }
      } else blocks.push(b);
    });
    return Object.assign({}, doc, { blocks: blocks });
  }

  /* los gráficos del Word se dibujan en un lienzo y se guardan como PNG */
  function rasterizeCharts(doc) {
    var jobs = [], blocks = (doc.blocks || []).map(function (b) {
      if (b.t !== 'chart' || b.png) return b;
      var c = Object.assign({}, b), svg = chartSvg(c), W = c._w, H = c._h;
      jobs.push(new Promise(function (resolve) {
        var im = new Image();
        im.onload = function () { try { var cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2; var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height); c.png = cv.toDataURL('image/png'); } catch (e) { /* sin imagen: se usa la tabla */ } resolve(); };
        im.onerror = function () { resolve(); };
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      }));
      return c;
    });
    return Promise.all(jobs).then(function () { return Object.assign({}, doc, { blocks: blocks }); });
  }

  /* Excel con una hoja por sección y un índice */
  function sheetsPro(doc, base) {
    var ex = expand(doc, 'xlsx'), groups = [], cur = { name: 'Portada', blocks: [] };
    (ex.blocks || []).forEach(function (b) { if (b.t === 'h') { groups.push(cur); cur = { name: b.text, blocks: [] }; } else cur.blocks.push(b); });
    groups.push(cur);
    var sheets = [], index = [[{ v: doc.title, s: 'title' }], [{ v: doc.subtitle || '', s: 'note' }], [], [{ v: 'Hojas de este archivo', s: 'bold' }]];
    groups.filter(function (g) { return g.blocks.length; }).forEach(function (g, i) {
      var nm = (g.name || 'Hoja').replace(/^\d+\.\s*/, '').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 28).trim() || 'Hoja';
      var one = base({ title: g.name, subtitle: i === 0 ? doc.subtitle : '', sheet: nm, blocks: g.blocks });
      one[0].name = nm; sheets.push(one[0]); index.push([{ v: nm, s: 'wrap' }]);
    });
    if (doc.footer) { index.push([]); index.push([{ v: doc.footer, s: 'note' }]); }
    return [{ name: 'Índice', rows: index, cols: [60, 22], merges: [] }].concat(sheets);
  }

  /* ---------- estilos: informe formal (PDF / vista previa). Colores: tinta #1f1b2d, morado institucional #51247a, líneas #ded8e6 ---------- */
  var PRO_CSS = '@page{size:A4;margin:20mm 17mm 22mm}@page wide{size:A4 landscape;margin:16mm 14mm 18mm}@page cover{margin:0}' +
    'body{font-family:"Segoe UI",Calibri,"Helvetica Neue",Arial,sans-serif;font-size:9.8pt;line-height:1.5;color:#1f1b2d;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    'h1{font-family:Georgia,"Times New Roman",serif;text-transform:none}h2{font-family:Georgia,"Times New Roman",serif;font-size:15pt;font-weight:700;color:#1f1b2d;border:0;border-top:2px solid #51247a;margin:26pt 0 9pt;padding-top:7pt;break-after:avoid;page-break-after:avoid}' +
    'h2 .sn{display:inline-block;min-width:22pt;color:#51247a}h3{font-family:Georgia,"Times New Roman",serif;font-size:11.5pt;color:#51247a;margin:14pt 0 4pt;break-after:avoid;page-break-after:avoid}' +
    'p{margin:4pt 0}.note,.sub{color:#6b6478}.foot{border-top:1px solid #ded8e6;color:#6b6478;font-size:8.5pt;margin-top:24pt}' +
    '.kv{margin:4pt 0 8pt}.kv th{width:34%;font-weight:600;font-size:8.8pt;color:#6b6478;padding:4pt 8pt 4pt 0;border-bottom:1px solid #ece7f2}.kv td{padding:4pt 0;border-bottom:1px solid #ece7f2}' +
    'table.grid{font-variant-numeric:tabular-nums;margin:6pt 0 10pt;table-layout:auto}table.grid.fx{table-layout:fixed}.grid th,.grid td{border:0;border-bottom:1px solid #e4dfea;padding:3.5pt 5pt;font-size:8.6pt;line-height:1.35;vertical-align:top;overflow-wrap:anywhere}' +
    '.grid thead th{background:#f1ecf7;color:#3a1a58;font-weight:700;text-align:left;border-bottom:1.5px solid #51247a;vertical-align:bottom}.grid thead{display:table-header-group}.grid tr{break-inside:avoid;page-break-inside:avoid}' +
    '.grid tbody tr:nth-child(even) td{background:transparent}.grid tfoot{display:table-row-group}.wide .grid th,.wide .grid td{font-size:8pt;padding:3pt 4pt}.grid tfoot th{background:#f1ecf7;white-space:nowrap;border-top:1.5px solid #51247a;border-bottom:0;color:#1f1b2d;text-align:left}.grid th.r,.grid td.r{text-align:right}' +
    '.chart{margin:12pt 0;break-inside:avoid;page-break-inside:avoid}.chart svg{width:100%;height:auto;border:0}.chart figcaption{font-size:8.5pt;color:#6b6478;margin-top:2pt}' +
    '.pb{break-after:page;page-break-after:always;height:0}.big{margin:0}.wide{page:wide}.wide h3{margin-top:0}' +
    '.toc-h{margin-top:0}.toc{list-style:none;margin:10pt 0 0;padding:0;columns:1;font-size:11pt}.toc li{display:flex;gap:14pt;padding:7pt 0;border-bottom:1px solid #e4dfea}.toc .tn{width:22pt;color:#51247a;font-family:Georgia,serif;font-weight:700}' +
    '.sign{margin-top:30pt}.empty{height:20pt}' +
    /* Carta Gantt */
    'table.gantt{table-layout:fixed;width:100%;border-collapse:collapse;margin:6pt 0;font-size:8.4pt}.gantt th,.gantt td{border:0;border-bottom:1px solid #e4dfea;padding:3pt 5pt;vertical-align:middle;line-height:1.3}' +
    '.gantt thead th{background:#f1ecf7;color:#3a1a58;border-bottom:1.5px solid #51247a;text-align:left;vertical-align:bottom}.gantt th.gm{padding:3pt 0;text-align:center;height:56pt}.gantt th.gm span{display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);font-weight:600;font-size:7.6pt;white-space:nowrap}' +
    '.gantt tr.gs td{background:#faf8fc;font-family:Georgia,serif;font-weight:700;color:#51247a;border-bottom:1px solid #cfc5e0;padding-top:5pt}.gantt td.gp{white-space:nowrap;color:#4a4458;padding-right:12pt}.gantt td.g-off,.gantt td.g-on{padding:0;border-left:1px solid #f0ecf5}.gantt td.g-on{background:#51247a;border-left-color:#fff}' +
    /* portada: hoja completa, sin márgenes */
    '.cover{page:cover;position:relative;box-sizing:border-box;width:210mm;height:296.5mm;margin:0;padding:0;display:block;break-after:page;page-break-after:always;overflow:hidden}.cv-band{position:absolute;left:0;top:0;bottom:0;width:15mm;background:#51247a}.cv-band:after{content:"";position:absolute;left:15mm;top:0;bottom:0;width:1.2mm;background:#b9a3d4}' +
    '.cv-body{position:absolute;left:34mm;right:22mm;top:0;bottom:0;display:flex;flex-direction:column;padding:34mm 0 20mm}.cv-k{margin:0;font-size:9.5pt;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#51247a}' +
    '.cv-mid{margin-top:46mm}.cv-t{text-align:left;font-family:Georgia,"Times New Roman",serif;font-size:30pt;line-height:1.14;font-weight:700;margin:0 0 6mm;color:#1f1b2d;text-wrap:balance}.cv-s{font-size:14pt;color:#4a4458;margin:0 0 9mm}.cv-rule{width:26mm;height:1.6mm;background:#51247a;margin-bottom:9mm}' +
    '.cv-meta{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:4.5mm 10mm}.cv-meta div{border-top:1px solid #ded8e6;padding-top:2mm}.cv-meta dt{font-size:7.8pt;letter-spacing:.1em;text-transform:uppercase;color:#6b6478;margin:0}.cv-meta dd{margin:.8mm 0 0;font-size:10.5pt;font-weight:600}' +
    '.cv-kpis{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;border-top:2px solid #1f1b2d;padding-top:5mm}.cv-kpis .kv-v{display:block;font-family:Georgia,serif;font-size:17pt;font-weight:700;color:#1f1b2d;font-variant-numeric:tabular-nums}.cv-kpis .kv-l{display:block;font-size:8pt;letter-spacing:.08em;text-transform:uppercase;color:#6b6478;margin-top:1mm}' +
    '.cv-note{margin:9mm 0 0;font-size:8.4pt;color:#6b6478}';
  var LOOK_CSS = {
    word: 'html{background:#d9d9d9}body{background:#fff;width:794px;margin:18px auto;padding:64px 64px;box-shadow:0 2px 12px rgba(0,0,0,.35);font-family:Calibri,"Segoe UI",Arial,sans-serif}.pb{height:36px;margin:30px -64px;background:#d9d9d9;border:0}.cover{margin:-64px -64px 0;width:794px;height:1122px}.wide{zoom:.7;width:1120px;margin-left:-84px}',
    pdf: 'html{background:#525659}body{background:#fff;width:794px;margin:18px auto;padding:64px 64px;box-shadow:0 2px 10px rgba(0,0,0,.5)}.pb{height:40px;margin:30px -64px;background:#525659}.cover{margin:-64px -64px 0;width:794px;height:1122px}.wide{zoom:.7;width:1120px;margin-left:-84px}'
  };

  /* ---------- vista previa de Excel: hojas con columnas A, B, C y números de fila ---------- */
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function excelPreview(sheets) {
    var h = U.h, box = h('div', { class: 'xl' }), tabs = h('div', { class: 'xl-tabs', role: 'tablist' }), view = h('div', { class: 'xl-view' });
    function show(i) {
      Array.prototype.forEach.call(tabs.children, function (t, j) { t.setAttribute('aria-selected', i === j ? 'true' : 'false'); t.className = 'xl-tab' + (i === j ? ' on' : ''); });
      U.clear(view);
      var sh = sheets[i], rows = (sh.rows || []).slice(0, 400), maxC = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 1), tbl = h('table', { class: 'xl-grid' });
      tbl.appendChild(h('thead', null, h('tr', null, h('th', { class: 'xl-corner' }, ''), Array.apply(null, Array(maxC)).map(function (_, c) { return h('th', null, colName(c)); }))));
      var tb = h('tbody');
      rows.forEach(function (r, ri) {
        tb.appendChild(h('tr', null, h('th', { class: 'xl-rn' }, String(ri + 1)), Array.apply(null, Array(maxC)).map(function (_, c) {
          var cell = r[c], v = cell && typeof cell === 'object' ? cell.v : cell, st = cell && typeof cell === 'object' ? cell.s : '';
          if (typeof v === 'number') v = st === 'date' ? U.fmtDateShort(new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)) : (st === 'pct' ? v + ' %' : U.fmtNum(v));
          return h('td', { class: 'xl-c xl-' + (st || 'n') + (typeof (cell && cell.v) === 'number' && st !== 'date' ? ' num' : '') }, v == null ? '' : String(v));
        })));
      });
      tbl.appendChild(tb);
      view.appendChild(h('div', { class: 'xl-scroll' }, tbl));
      if ((sh.rows || []).length > 400) view.appendChild(h('p', { class: 'hint' }, 'Vista previa: se muestran las primeras 400 filas. El archivo trae todas.'));
    }
    sheets.forEach(function (s, i) { tabs.appendChild(h('button', { type: 'button', role: 'tab', class: 'xl-tab', onclick: function () { show(i); } }, s.name)); });
    box.appendChild(h('div', { class: 'xl-bar' }, h('span', { class: 'xl-ico' }, 'X'), h('span', null, 'Vista previa de Excel'))); box.appendChild(view); box.appendChild(tabs); show(0);
    return box;
  }

  E.expand = expand; E.chartSvg = chartSvg; E.rasterizeCharts = rasterizeCharts; E.sheetsPro = sheetsPro; E.PRO_CSS = PRO_CSS; E.LOOK_CSS = LOOK_CSS; E.excelPreview = excelPreview; E.chartRows = chartRows;
})(typeof window !== 'undefined' ? window : globalThis);
