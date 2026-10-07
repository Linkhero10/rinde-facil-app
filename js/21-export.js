/* Rinde Fácil — exportar a Excel (.xlsx real, sin librerías), Word, PDF (imprimir) y texto.
   Todo parte de un "documento" simple: {title, subtitle, blocks:[...]}. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util;

  /* ======================= ZIP (sin compresión) + XLSX ======================= */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function u16(n) { return [n & 255, (n >>> 8) & 255]; }
  function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

  function zipStore(files) { /* files: [{name, data:Uint8Array}] */
    var chunks = [], central = [], offset = 0;
    var dosTime = (0 << 11) | (0 << 5) | 0, dosDate = ((2026 - 1980) << 9) | (9 << 5) | 29;
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data);
      var local = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      chunks.push(new Uint8Array(local), name, data);
      var cen = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push(new Uint8Array(cen), name);
      offset += local.length + name.length + data.length;
    });
    var cenSize = 0; central.forEach(function (c) { cenSize += c.length; });
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cenSize), u32(offset), u16(0)));
    var all = chunks.concat(central, [end]);
    var total = 0; all.forEach(function (c) { total += c.length; });
    var out = new Uint8Array(total), p = 0;
    all.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }

  function xmlEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function excelSerial(iso) { var d = U.isoToDate(iso); if (!d) return null; return Math.round(d.getTime() / 86400000) + 25569; }

  /* estilos (índices en cellXfs) */
  var STYLE = { normal: 0, bold: 1, header: 2, money: 3, date: 4, wrap: 5, moneyBold: 6, title: 7, pct: 8, note: 9, mark: 10 };
  var STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="165" formatCode="0&quot;%&quot;"/></numFmts>' +
    '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF555555"/><name val="Calibri"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E7E5"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFD84D"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><top style="thin"><color rgb="FF999999"/></top><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="11">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>' +
    '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
    '<xf numFmtId="3" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function cellXml(cell, r, c) {
    if (cell === null || cell === undefined || cell === '') return '';
    var ref = colName(c) + (r + 1), s = 0, v = cell, f = null;
    if (typeof cell === 'object' && !(cell instanceof Date)) { v = cell.v; s = STYLE[cell.s] != null ? STYLE[cell.s] : 0; f = cell.f || null; }
    if (f) return '<c r="' + ref + '" s="' + s + '"><f>' + xmlEsc(f) + '</f><v>' + (isFinite(v) ? v : 0) + '</v></c>';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + (s ? ' s="' + s + '"' : '') + '><v>' + v + '</v></c>';
    if (v === null || v === undefined || v === '') return s ? '<c r="' + ref + '" s="' + s + '"/>' : '';
    return '<c r="' + ref + '" t="inlineStr"' + (s ? ' s="' + s + '"' : '') + '><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
  }
  function sheetXml(sh) {
    var rows = sh.rows || [], maxC = 0;
    rows.forEach(function (r) { if (r.length > maxC) maxC = r.length; });
    var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    x += '<sheetViews><sheetView workbookViewId="0"' + (sh.freeze ? '' : '') + '>' + (sh.freeze ? '<pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/>' : '') + '</sheetView></sheetViews>';
    x += '<sheetFormatPr defaultRowHeight="15"/>';
    if (sh.cols && sh.cols.length) { x += '<cols>'; sh.cols.forEach(function (w, i) { x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }); x += '</cols>'; }
    x += '<sheetData>';
    rows.forEach(function (row, r) {
      var cs = '';
      for (var c = 0; c < row.length; c++) cs += cellXml(row[c], r, c);
      x += '<row r="' + (r + 1) + '">' + cs + '</row>';
    });
    x += '</sheetData>';
    if (sh.merges && sh.merges.length) { x += '<mergeCells count="' + sh.merges.length + '">'; sh.merges.forEach(function (m) { x += '<mergeCell ref="' + m + '"/>'; }); x += '</mergeCells>'; }
    x += '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
    return x;
  }
  function safeSheetName(n, used) {
    var s = String(n || 'Hoja').replace(/[\[\]\*\/\\\?:]/g, ' ').trim().slice(0, 31) || 'Hoja';
    var base = s, i = 2;
    while (used[s.toLowerCase()]) { s = base.slice(0, 28) + ' ' + i++; }
    used[s.toLowerCase()] = true;
    return s;
  }
  function buildXlsx(sheets) {
    if (!sheets || !sheets.length) sheets = [{ name: 'Hoja1', rows: [] }];
    var used = {}, names = sheets.map(function (s) { return safeSheetName(s.name, used); });
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    sheets.forEach(function (s, i) { ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; });
    ct += '</Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    names.forEach(function (n, i) { wb += '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; });
    wb += '</sheets></workbook>';
    var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    sheets.forEach(function (s, i) { wbRels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; });
    wbRels += '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    var files = [
      { name: '[Content_Types].xml', data: utf8(ct) },
      { name: '_rels/.rels', data: utf8(rels) },
      { name: 'xl/workbook.xml', data: utf8(wb) },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8(wbRels) },
      { name: 'xl/styles.xml', data: utf8(STYLES_XML) }
    ];
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: utf8(sheetXml(s)) }); });
    return zipStore(files);
  }
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /* ======================= Documento -> hojas / texto / HTML ======================= */
  function fmtCell(v, type) {
    if (v === null || v === undefined || v === '') return '';
    if (type === 'money') return U.fmtCLP(v);
    if (type === 'pct') return U.fmtNum(v) + ' %';
    if (type === 'date') return U.fmtDateShort(v);
    return String(v);
  }
  function docToSheets(doc) {
    var rows = [], merges = [], widths = [34, 22, 22, 22, 22, 22, 22, 22];
    var maxCols = 2, custom = {};
    function push(r) { rows.push(r); if (r.length > maxCols) maxCols = r.length; }
    push([{ v: doc.title, s: 'title' }]);
    if (doc.subtitle) push([{ v: doc.subtitle, s: 'note' }]);
    push([]);
    (doc.blocks || []).forEach(function (b) {
      if (b.t === 'h') { push([]); push([{ v: b.text, s: 'bold' }]); }
      else if (b.t === 'p') { push([{ v: b.text, s: 'wrap' }]); merges.push('A' + rows.length + ':F' + rows.length); }
      else if (b.t === 'note') push([{ v: b.text, s: 'note' }]);
      else if (b.t === 'kv') (b.rows || []).forEach(function (r) { push([{ v: r[0], s: 'bold' }, { v: r[1] === undefined ? '' : r[1], s: 'wrap' }]); });
      else if (b.t === 'table') {
        push([]);
        if (b.widths) b.widths.forEach(function (w, i) { custom[i] = w; });
        push((b.head || []).map(function (x) { return { v: x, s: 'header' }; }));
        var first = rows.length + 1; /* 1-based, primera fila de datos */
        (b.rows || []).forEach(function (r) {
          push(r.map(function (v, i) {
            var ty = (b.types && b.types[i]) || 'text';
            if (v === '■') return { v: '', s: 'mark' }; /* mes cubierto en la Carta Gantt: la celda completa va en amarillo, sin símbolo */
            if (v === null || v === undefined || v === '') return { v: '', s: ty === 'money' ? 'money' : 'wrap' };
            if (ty === 'money') return { v: Number(v) || 0, s: 'money' };
            if (ty === 'pct') return { v: Number(v) || 0, s: 'pct' };
            if (ty === 'date') { var ser = excelSerial(v); return ser ? { v: ser, s: 'date' } : { v: String(v), s: 'wrap' }; }
            if (ty === 'num') return { v: Number(v) || 0, s: 'money' };
            return { v: String(v), s: 'wrap' };
          }));
        });
        var last = rows.length; /* 1-based, última fila de datos */
        if (b.foot) {
          push(b.foot.map(function (v, i) {
            var ty = (b.types && b.types[i]) || 'text';
            if (v === 'SUM' && last >= first) return { v: sumCol(b.rows, i), f: 'SUM(' + colName(i) + first + ':' + colName(i) + last + ')', s: 'moneyBold' };
            if (v === null || v === undefined || v === '') return '';
            return { v: v, s: ty === 'money' ? 'moneyBold' : 'bold' };
          }));
        }
      }
      else if (b.t === 'sign') { push([]); push(b.labels.map(function (l) { return { v: '______________________  ' + l, s: 'normal' }; })); }
    });
    var cols = []; for (var i = 0; i < maxCols; i++) cols.push(custom[i] || widths[i] || 22);
    return [{ name: doc.sheet || doc.title, rows: rows, cols: cols, merges: merges }];
  }
  function sumCol(rows, i) { var t = 0; rows.forEach(function (r) { t += Number(r[i]) || 0; }); return t; }

  function docToText(doc) {
    var out = [doc.title.toUpperCase()];
    if (doc.subtitle) out.push(doc.subtitle);
    out.push('');
    (doc.blocks || []).forEach(function (b) {
      if (b.t === 'h') { out.push(''); out.push(b.text); out.push(new Array(b.text.length + 1).join('-')); }
      else if (b.t === 'p' || b.t === 'note') out.push(b.text);
      else if (b.t === 'kv') (b.rows || []).forEach(function (r) { out.push(r[0] + ': ' + (r[1] === undefined ? '' : r[1])); });
      else if (b.t === 'table') {
        out.push('');
        out.push((b.head || []).join('\t'));
        (b.rows || []).forEach(function (r) { out.push(r.map(function (v, i) { return fmtCell(v, b.types && b.types[i]); }).join('\t')); });
        if (b.foot) out.push(b.foot.map(function (v, i) { if (v === 'SUM') return fmtCell(sumCol(b.rows, i), b.types && b.types[i]); return v == null ? '' : fmtCell(v, b.types && b.types[i]); }).join('\t'));
      }
      else if (b.t === 'sign') { out.push(''); out.push(b.labels.map(function (l) { return '______________________ ' + l; }).join('     ')); }
    });
    if (doc.footer) { out.push(''); out.push(doc.footer); }
    return out.join('\n');
  }

  function docToHtmlBody(doc) {
    var e = U.esc, h = '<h1>' + e(doc.title) + '</h1>';
    if (doc.subtitle) h += '<p class="sub">' + e(doc.subtitle) + '</p>';
    (doc.blocks || []).forEach(function (b) {
      if (b.t === 'h') h += '<h2>' + e(b.text) + '</h2>';
      else if (b.t === 'p') h += '<p>' + e(b.text).replace(/\n/g, '<br>') + '</p>';
      else if (b.t === 'note') h += '<p class="note">' + e(b.text) + '</p>';
      else if (b.t === 'kv') { h += '<table class="kv">'; (b.rows || []).forEach(function (r) { h += '<tr><th>' + e(r[0]) + '</th><td>' + e(r[1] === undefined ? '' : r[1]).replace(/\n/g, '<br>') + '</td></tr>'; }); h += '</table>'; }
      else if (b.t === 'table') {
        h += '<table class="grid"><thead><tr>' + (b.head || []).map(function (x, i) { return '<th' + (b.types && (b.types[i] === 'money' || b.types[i] === 'pct' || b.types[i] === 'num') ? ' class="r"' : '') + '>' + e(x) + '</th>'; }).join('') + '</tr></thead><tbody>';
        (b.rows || []).forEach(function (r) { h += '<tr>' + r.map(function (v, i) { var ty = b.types && b.types[i]; return '<td' + (ty === 'money' || ty === 'pct' || ty === 'num' ? ' class="r"' : '') + '>' + e(fmtCell(v, ty)) + '</td>'; }).join('') + '</tr>'; });
        if (!(b.rows || []).length) h += '<tr><td colspan="' + (b.head || []).length + '" class="empty">&nbsp;</td></tr>';
        h += '</tbody>';
        if (b.foot) h += '<tfoot><tr>' + b.foot.map(function (v, i) { var ty = b.types && b.types[i]; var val = v === 'SUM' ? sumCol(b.rows, i) : v; return '<th' + (ty === 'money' || ty === 'pct' || ty === 'num' ? ' class="r"' : '') + '>' + e(fmtCell(val, ty)) + '</th>'; }).join('') + '</tr></tfoot>';
        h += '</table>';
      }
      else if (b.t === 'sign') { h += '<div class="sign">' + b.labels.map(function (l) { return '<div><span></span>' + e(l) + '</div>'; }).join('') + '</div>'; }
    });
    if (doc.footer) h += '<p class="foot">' + e(doc.footer) + '</p>';
    return h;
  }
  var DOC_CSS = '@page{size:A4;margin:18mm 16mm}*{box-sizing:border-box}body{font:12pt/1.45 "Times New Roman",Georgia,serif;color:#111;margin:0;padding:0}' +
    'h1{font-size:16pt;margin:0 0 4pt;text-align:center;text-transform:uppercase}h2{font-size:12.5pt;margin:14pt 0 5pt;border-bottom:1px solid #666;padding-bottom:2pt}' +
    '.sub{text-align:center;color:#444;margin:0 0 12pt}p{margin:5pt 0}.note{font-size:10pt;color:#444}.foot{font-size:9pt;color:#555;margin-top:18pt;border-top:1px solid #aaa;padding-top:5pt}' +
    'table{width:100%;border-collapse:collapse;margin:6pt 0}.kv th{width:36%;text-align:left;font-weight:bold;vertical-align:top;padding:3pt 6pt 3pt 0}.kv td{padding:3pt 0;border-bottom:1px dotted #999}' +
    '.grid th,.grid td{border:1px solid #444;padding:3pt 5pt;font-size:10.5pt;vertical-align:top}.grid thead th{background:#e3ecea;text-align:left}.grid tfoot th{background:#f2f2f2;text-align:left}.r{text-align:right!important;white-space:nowrap}' +
    '.empty{height:22pt}.sign{display:flex;gap:28pt;margin-top:46pt}.sign>div{flex:1;text-align:center;font-size:10.5pt}.sign span{display:block;border-top:1px solid #000;margin-bottom:3pt}';
  function docToHtml(doc) {
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + U.esc(doc.title) + '</title><style>' + DOC_CSS + '</style></head><body>' + docToHtmlBody(doc) + '</body></html>';
  }
  function docToWord(doc) { /* Word abre HTML con extensión .doc */
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + U.esc(doc.title) + '</title><style>' + DOC_CSS + '</style></head><body>' + docToHtmlBody(doc) + '</body></html>';
  }
  /* .docx de verdad: párrafos, títulos y tablas con los mismos datos que el resto de las salidas */
  function docToDocx(doc) {
    var W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    function run(t, o) { o = o || {}; return '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>' + (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + '<w:sz w:val="' + (o.sz || 22) + '"/></w:rPr><w:t xml:space="preserve">' + xmlEsc(t) + '</w:t></w:r>'; }
    function para(text, o) {
      o = o || {};
      var lines = String(text == null ? '' : text).split('\n');
      var runs = lines.map(function (l, i) { return (i ? '<w:r><w:br/></w:r>' : '') + run(l, o); }).join('');
      return '<w:p><w:pPr><w:spacing w:before="' + (o.before == null ? 0 : o.before) + '" w:after="' + (o.after == null ? 120 : o.after) + '"/>' + (o.keep ? '<w:keepNext/>' : '') + '</w:pPr>' + runs + '</w:p>';
    }
    function cell(text, o) {
      o = o || {};
      return '<w:tc><w:tcPr><w:tcW w:w="' + (o.w || 2000) + '" w:type="dxa"/>' + (o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>' : '') + '</w:tcPr>' + para(text, { b: o.b, sz: 20, after: 40 }) + '</w:tc>';
    }
    function table(head, rows, foot, types, wide) {
      var cols = Math.max(head ? head.length : 0, rows.length ? rows[0].length : 0, 1), total = wide ? 14000 : 9600, w = Math.floor(total / cols);
      var x = '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (k) { return '<w:' + k + ' w:val="single" w:sz="4" w:space="0" w:color="999999"/>'; }).join('') + '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' + new Array(cols + 1).join('<w:gridCol w:w="' + w + '"/>') + '</w:tblGrid>';
      if (head && head.length) x += '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + head.map(function (t) { return cell(t, { w: w, b: true, shade: 'D9E7E5' }); }).join('') + '</w:tr>';
      rows.forEach(function (r) { x += '<w:tr>' + r.map(function (v, i) { return cell(fmtCell(v, types && types[i]), { w: w }); }).join('') + '</w:tr>'; });
      if (foot) x += '<w:tr>' + foot.map(function (v, i) { return cell(v === 'SUM' ? fmtCell(sumCol(rows, i), types && types[i]) : (v == null ? '' : fmtCell(v, types && types[i])), { w: w, b: true }); }).join('') + '</w:tr>';
      return x + '</w:tbl>' + para('', { after: 80 });
    }
    var wide = (doc.blocks || []).some(function (b) { return b.t === 'table' && (b.head || []).length > 7; });
    var body = para(doc.title, { b: true, sz: 32, after: 60 });
    if (doc.subtitle) body += para(doc.subtitle, { i: true, color: '555555', after: 200 });
    (doc.blocks || []).forEach(function (b) {
      if (b.t === 'h') body += para(b.text, { b: true, sz: 26, before: 200, keep: true });
      else if (b.t === 'p') body += para(b.text);
      else if (b.t === 'note') body += para(b.text, { i: true, sz: 20, color: '555555' });
      else if (b.t === 'kv') body += table(null, (b.rows || []).map(function (r) { return [r[0], r[1] === undefined ? '' : r[1]]; }), null, null, wide);
      else if (b.t === 'table') body += table(b.head || [], b.rows || [], b.foot, b.types, wide);
      else if (b.t === 'sign') body += para('', { after: 400 }) + para((b.labels || []).map(function (l) { return '______________________  ' + l; }).join('        '));
    });
    if (doc.footer) body += para(doc.footer, { i: true, sz: 18, color: '555555', before: 240 });
    var sect = wide ? '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr>' : '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" w:right="1100" w:bottom="1200" w:left="1100"/></w:sectPr>';
    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + W + '><w:body>' + body + sect + '</w:body></w:document>';
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    return zipStore([{ name: '[Content_Types].xml', data: utf8(ct) }, { name: '_rels/.rels', data: utf8(rels) }, { name: 'word/document.xml', data: utf8(documentXml) }]);
  }
  var DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  function fileName(base, ext) {
    var b = U.slug(base) || 'documento';
    return b + '-' + U.todayISO() + '.' + ext;
  }

  /* ---------- salidas en navegador ---------- */
  function downloadXlsx(sheets, base) {
    var bytes = buildXlsx(sheets);
    U.download(new Blob([bytes], { type: XLSX_MIME }), fileName(base, 'xlsx'));
  }
  function downloadDocXlsx(doc, base) { downloadXlsx(docToSheets(doc), base || doc.title); }
  function downloadWord(doc, base) { U.download(new Blob([docToDocx(doc)], { type: DOCX_MIME }), fileName(base || doc.title, 'docx')); }
  function downloadText(doc, base) { U.download(new Blob(['﻿', docToText(doc)], { type: 'text/plain;charset=utf-8' }), fileName(base || doc.title, 'txt')); }
  function printDoc(doc) { /* vista previa dentro de la página; desde ahí se imprime o se guarda como PDF */
    var host = document.createElement('div');
    host.className = 'print-overlay';
    var bar = document.createElement('div');
    bar.className = 'print-bar';
    var frame = document.createElement('iframe');
    frame.setAttribute('title', 'Vista previa del documento');
    var btnPrint = document.createElement('button'); btnPrint.className = 'btn primary'; btnPrint.textContent = 'Imprimir o guardar como PDF';
    var btnClose = document.createElement('button'); btnClose.className = 'btn'; btnClose.textContent = 'Cerrar';
    bar.appendChild(btnPrint); bar.appendChild(btnClose);
    host.appendChild(bar); host.appendChild(frame);
    document.body.appendChild(host);
    frame.contentDocument.open(); frame.contentDocument.write(docToHtml(doc)); frame.contentDocument.close();
    btnPrint.onclick = function () { frame.contentWindow.focus(); frame.contentWindow.print(); };
    btnClose.onclick = function () { document.body.removeChild(host); };
    btnClose.focus();
    return host;
  }

  RF.exp = {
    crc32: crc32, zipStore: zipStore, buildXlsx: buildXlsx, XLSX_MIME: XLSX_MIME,
    docToSheets: docToSheets, docToText: docToText, docToHtml: docToHtml, docToWord: docToWord, docToHtmlBody: docToHtmlBody,
    docToDocx: docToDocx, DOCX_MIME: DOCX_MIME, fileName: fileName, downloadXlsx: downloadXlsx, downloadDocXlsx: downloadDocXlsx, downloadWord: downloadWord, downloadText: downloadText, printDoc: printDoc,
    excelSerial: excelSerial
  };
})(typeof window !== 'undefined' ? window : globalThis);
