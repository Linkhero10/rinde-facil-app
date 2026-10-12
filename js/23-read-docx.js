/* Rinde Fácil — lectura de Word (.docx) en el navegador: párrafos y tablas con sus columnas bien alineadas (celdas combinadas en horizontal y en vertical). Sin servicios externos ni costo. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var R = RF.read = RF.read || {};

  function xmlText(s) {
    return String(s == null ? '' : s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&amp;/g, '&');
  }

  /* Recorre el XML de word/document.xml y devuelve párrafos sueltos y tablas.
   * Cada tabla: { grid: [[texto]], rows: n, cols: n }. grid es la rejilla real: una celda combinada en horizontal
   * deja vacío lo que se extiende; una combinada en vertical repite el texto de arriba (así cada fila se lee completa). */
  R.docxStructure = function (xml) {
    var tokens = /<\/?w:(tbl|tr|tc|p)\b[^>]*>|<w:gridSpan\b[^>]*w:val="(\d+)"[^>]*\/>|<w:vMerge\b([^>]*)\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g;
    var tables = [], stack = [], outside = [], para = null, cell = null, row = null, tbl = null;
    var m;
    function flushPara() {
      if (!para) return;
      var txt = para.trim();
      para = null;
      if (cell) { cell.paras.push(txt); }
      else if (!tbl && txt) { outside.push(txt); }
    }
    while ((m = tokens.exec(xml))) {
      var tag = m[0];
      if (m[1] === 'tbl') {
        if (tag.charAt(1) === '/') { flushPara(); tbl = stack.pop() || null; }
        else { stack.push(tbl); tbl = { rows: [] }; tables.push(tbl); }
      } else if (m[1] === 'tr') {
        if (tag.charAt(1) === '/') { if (tbl && row) tbl.rows.push(row); row = null; }
        else row = [];
      } else if (m[1] === 'tc') {
        if (tag.charAt(1) === '/') { flushPara(); if (row && cell) row.push(cell); cell = null; }
        else cell = { paras: [], span: 1, vmerge: null };
      } else if (m[1] === 'p') {
        if (tag.charAt(1) === '/') flushPara();
        else para = para === null ? '' : para;
      } else if (tag.indexOf('<w:gridSpan') === 0) {
        if (cell) cell.span = Number(m[2]) || 1;
      } else if (tag.indexOf('<w:vMerge') === 0) {
        if (cell) cell.vmerge = /w:val="restart"/.test(m[3] || '') ? 'restart' : 'continue';
      } else if (tag === '<w:tab/>' || tag === '<w:br/>') {
        if (para !== null) para += ' ';
      } else if (m[4] !== undefined) {
        if (para !== null) para += xmlText(m[4]);
      }
    }
    return {
      paragraphs: outside,
      tables: tables.map(function (t) { return R.tableGrid_(t.rows); })
    };
  };

  /* convierte las filas con celdas combinadas en una rejilla rectangular */
  R.tableGrid_ = function (rows) {
    var grid = [], above = [];
    rows.forEach(function (cells, r) {
      var line = [], c = 0;
      cells.forEach(function (cell) {
        var text = cell.paras.filter(function (x) { return x !== ''; }).join('\n');
        if (cell.vmerge === 'continue') text = above[c] || '';
        for (var k = 0; k < cell.span; k++) {
          line[c + k] = k === 0 ? text : '';
          above[c + k] = line[c + k];
        }
        c += cell.span;
      });
      grid.push(line);
    });
    var cols = grid.reduce(function (n, line) { return Math.max(n, line.length); }, 0);
    grid = grid.map(function (line) {
      var out = [];
      for (var c = 0; c < cols; c++) out.push(line[c] == null ? '' : line[c]);
      return out;
    });
    return { grid: grid, rows: grid.length, cols: cols };
  };

  /* lee un .docx (ArrayBuffer o Uint8Array) y devuelve su estructura. Requiere DecompressionStream (navegadores modernos). */
  R.readDocx = function (buffer) {
    return R.unzipEntry(buffer, 'word/document.xml').then(function (bytes) {
      return R.docxStructure(new TextDecoder('utf-8').decode(bytes));
    });
  };

  /* extrae una entrada de un zip sin dependencias (solo lectura central + deflate-raw o sin comprimir) */
  R.unzipEntry = function (buffer, name) {
    var u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('No es un archivo Word válido (zip).'));
    var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true);
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      var local = dv.getUint32(p + 42, true);
      var entry = new TextDecoder('utf-8').decode(u8.subarray(p + 46, p + 46 + nlen));
      if (entry === name) {
        var lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true);
        var data = u8.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
        if (method === 0) return Promise.resolve(data);
        if (method !== 8) return Promise.reject(new Error('Método de compresión no soportado.'));
        return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')))
          .arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
      }
      p += 46 + nlen + xlen + clen;
    }
    return Promise.reject(new Error('No se encontró ' + name + ' en el Word.'));
  };
})(typeof window !== 'undefined' ? window : globalThis);
