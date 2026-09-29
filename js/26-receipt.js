/* Rinde Fácil — lectura de los datos de un comprobante a partir del texto que devuelve el OCR.
 *
 * Por qué existe: el OCR (Google Cloud Vision) lee bien el texto, pero el analizador heredado del piloto se confundía
 * con boletas de supermercado y facturas (tomaba «TOTAL IVA» por el total, ponía el RUT del cliente como el del proveedor,
 * no entendía años de dos cifras, etc.). Aquí los montos se identifican por CUADRE ARITMÉTICO (neto + IVA = total, IVA ≈ 19 %),
 * no por la posición de las etiquetas, que el OCR suele desordenar. Todo se devuelve con avisos: la persona siempre revisa.
 */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util;
  var MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

  function splitLines(text) { return String(text || '').replace(/\r/g, '').split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- montos ---------- */
  function amountsOf(lines) {
    var out = [];
    lines.forEach(function (ln, idx) {
      var kw = /iva|i\.v\.a|neto|total|monto|compra|valor|impuesto|afecto|ief|iev|honorario|retenido|retencion/i;
      /* el OCR a veces separa la etiqueta de la cifra en dos líneas */
      var lab = kw.test(ln) || (/^[$\s]*\d{1,7}[\s,]*$/.test(ln) && kw.test(lines[idx - 1] || ''));
      var re = /(\$)?\s?(\d[\d.]*)/g, m;
      while ((m = re.exec(ln)) !== null) {
        var tok = m[2].replace(/\.+$/, ''), digitStart = m.index + m[0].length - m[2].length, after = ln.charAt(m.index + m[0].length);
        if (/[\/:%-]/.test(after) || /[\/:-]/.test(digitStart > 0 ? ln.charAt(digitStart - 1) : '')) continue; /* fechas, horas, porcentajes */
        if (after === ',' && /^\d{1,3}$/.test(tok)) continue; /* «19,00%» */
        var dotted = /^\d{1,3}(\.\d{3})+$/.test(tok), plain = /^\d{1,7}$/.test(tok);
        if (!dotted && !plain) continue;
        if (plain && !m[1] && !lab) continue;
        var v = parseInt(tok.replace(/\./g, ''), 10);
        if (!isFinite(v) || v > 2000000000) continue;
        if (plain && !m[1] && v > 0 && v < 20 && /%/.test(ln)) continue;
        out.push({ v: v, line: idx, text: ln });
      }
    });
    return out;
  }
  function labelScore(s, kind) {
    var t = norm(s);
    if (kind === 'neto') return /neto|afecto|compra|monto venta|valor neto/.test(t) ? 1 : 0;
    if (kind === 'iva') return /iva|i\.v\.a/.test(t) ? 1 : 0;
    return /total/.test(t) && !/iva|sub ?total|puntos|items|articulos|pagos/.test(t) ? 1 : 0;
  }
  function findTriple(am) {
    var vals = []; var seen = {};
    am.forEach(function (a) { if (a.v > 0 && !seen[a.v]) { seen[a.v] = a; vals.push(a); } });
    var best = null;
    for (var x = 0; x < vals.length; x++) {
      var n = vals[x];
      for (var y = 0; y < vals.length; y++) {
        if (x === y) continue;
        var i = vals[y];
        if (i.v >= n.v || n.v < 100 || i.v < 10) continue; /* evita «triples» de números sueltos del ticket */
        if (Math.abs(i.v - 0.19 * n.v) > Math.max(3, 0.006 * n.v)) continue;
        for (var z = 0; z < vals.length; z++) {
          var t = vals[z];
          if (t.v <= n.v) continue;
          var gap = t.v - n.v - i.v, extras = null;
          if (Math.abs(gap) <= 1) extras = [];
          else if (gap > 1 && gap < 0.5 * n.v) { /* impuestos específicos (p. ej. combustibles): la diferencia debe ser suma de otros montos del documento */
            var others = vals.filter(function (o) { return o !== n && o !== i && o !== t && o.v < 0.5 * n.v; });
            outer: for (var p = 0; p < others.length; p++) {
              if (Math.abs(others[p].v - gap) <= 1) { extras = [others[p]]; break; }
              for (var q = p + 1; q < others.length; q++) if (Math.abs(others[p].v + others[q].v - gap) <= 1) { extras = [others[p], others[q]]; break outer; }
            }
          }
          if (!extras) continue;
          var score = labelScore(n.text, 'neto') + labelScore(i.text, 'iva') + labelScore(t.text, 'total') - Math.min(n.line, i.line, t.line) / 100000 - (extras.length ? 0.2 : 0);
          if (!best || score > best.score) best = { neto: n.v, iva: i.v, total: t.v, score: score, extras: extras.map(function (e) { return e.v; }) };
        }
      }
    }
    return best;
  }
  function findIvaIncluded(am) {
    var best = null;
    am.forEach(function (a) {
      if (!/iva|i\.v\.a/i.test(a.text) || a.v <= 0) return;
      am.forEach(function (t) {
        if (t.v <= a.v * 3) return;
        if (Math.abs(a.v - Math.round(t.v * 19 / 119)) > 2) return;
        var score = labelScore(t.text, 'total') - t.line / 100000;
        if (!best || score > best.score) best = { neto: t.v - a.v, iva: a.v, total: t.v, score: score };
      });
    });
    return best;
  }
  function findHonorarios(am) {
    var best = null;
    am.forEach(function (b) {
      am.forEach(function (r) {
        if (r.v <= 0 || r.v >= b.v) return;
        var ratio = r.v / b.v; if (ratio < 0.09 || ratio > 0.16) return;
        var liq = b.v - r.v;
        if (!am.some(function (l) { return l.v === liq; })) return;
        var score = -Math.min(b.line, r.line) / 100000;
        if (!best || score > best.score) best = { bruto: b.v, retencion: r.v, liquido: liq, score: score };
      });
    });
    return best;
  }
  function findTotalOnly(am) {
    var c = am.filter(function (a) { return a.v > 0 && labelScore(a.text, 'total'); });
    if (!c.length) return null;
    c.sort(function (a, b) { return b.v - a.v; });
    return c[0].v;
  }

  /* ---------- fecha ---------- */
  function validDate(d, m, y) {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }
  function findDate(lines) {
    var best = null;
    lines.forEach(function (ln, idx) {
      var t = norm(ln), prev = norm(lines[idx - 1] || '');
      if (/saldo|vencer|vigencia|impresion|presentacion|resolucion|res\. |res\.ex|timbre|puntos|periodo/.test(t)) return;
      var found = [], m, re;
      re = /(?:^|[^\d])(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/g;
      while ((m = re.exec(ln)) !== null) { var a = validDate(+m[1], +m[2], +m[3]); if (a) found.push(a); }
      re = /(\d{4})-(\d{2})-(\d{2})/g;
      while ((m = re.exec(ln)) !== null) { var b = validDate(+m[3], +m[2], +m[1]); if (b) found.push(b); }
      re = /(\d{1,2})\s+de\s+([a-zA-Záéíóú]+)\s+(?:de|del)\s+(\d{4})/gi;
      while ((m = re.exec(ln)) !== null) { var mes = MESES[norm(m[2])]; var c = mes ? validDate(+m[1], mes, +m[3]) : null; if (c) found.push(c); }
      if (!found.length) return;
      var pr = 0.5;
      if (/fecha\s*(de\s*)?emision/.test(t) && !/hora\s*emision/.test(t)) pr = 3;
      else if (/hora\s*(de\s*)?emision/.test(t)) pr = 1;
      else if (/^fecha|fecha:|fecha hora/.test(t) || /^fecha/.test(prev)) pr = 2;
      else if (/\d{1,2}:\d{2}/.test(ln)) pr = 1;
      if (!best || pr > best.pr) best = { iso: found[0], pr: pr, line: idx };
    });
    return best;
  }

  /* ---------- RUT del emisor ---------- */
  function findRutEmisor(lines, communityRut) {
    var own = communityRut ? U.rutClean(communityRut) : '';
    for (var idx = 0; idx < lines.length; idx++) {
      var ln = lines[idx], re = /(\d{1,2}(?:\.\d{3}){2}|\d{7,8})\s*-\s*([\dkK])(?![\dkK])/g, m;
      while ((m = re.exec(ln)) !== null) {
        var body = m[1].replace(/\./g, ''), full = body + m[2].toUpperCase();
        if (!U.rutValid(full)) continue;
        if (own && full === own) continue;
        var ctx = norm((lines[idx - 1] || '') + ' ' + ln.slice(0, m.index));
        if (/senor|cliente|receptor|destinatario|comprador|razon social:? comunidad/.test(ctx.slice(-40))) continue;
        return { rut: full, line: idx };
      }
    }
    return null;
  }

  /* ---------- N° de documento ---------- */
  function findFolio(lines) {
    for (var i = 0; i < Math.min(lines.length, 40); i++) {
      if (!/boleta|factura|honorarios|nota de/i.test(lines[i])) continue;
      for (var k = i; k <= Math.min(i + 3, lines.length - 1); k++) {
        var m = lines[k].match(/(?:\bN\s*[º°o.]*\s*[:.]?\s*|\bNRO\.?\s*[:.]?\s*|\bN[úu]mero\s*[:.]?\s*|electr[oó]nica\s*[:.]\s*)(\d{1,12})(?!\d)/i);
        if (m && !/^0+$/.test(m[1])) return m[1];
      }
    }
    return null;
  }

  function docTypeOf(lines) {
    var head = lines.slice(0, 40).join(' ');
    var t = norm(head);
    if (/honorarios/.test(t)) return 'honorarios';
    if (/factura/.test(t) && !/nota de credito/.test(t)) return 'factura';
    if (/boleta electronica|boleta n/.test(t)) return 'boleta';
    if (/valido como boleta/.test(t)) return 'voucher';
    if (/boleta/.test(t)) return 'boleta';
    return null;
  }

  /* ---------- función principal ---------- */
  function extract(text, opts) {
    opts = opts || {};
    var lines = splitLines(text), am = amountsOf(lines), notes = [], f = {}, checks = { rut: false, cuadra: false, fecha: false };
    var dt = docTypeOf(lines); if (dt) f.docType = dt;
    var rut = findRutEmisor(lines, opts.communityRut);
    if (rut) { f.rutProveedor = U.rutFormat(rut.rut); checks.rut = true; } else notes.push('No se encontró un RUT válido del proveedor.');
    var folio = findFolio(lines); if (folio) f.folio = folio;
    var fecha = findDate(lines); if (fecha) { f.fecha = fecha.iso; checks.fecha = true; } else notes.push('No se pudo leer la fecha.');

    var isHon = dt === 'honorarios', tri = null;
    if (isHon) {
      var h = findHonorarios(am);
      if (h) { f.total = h.bruto; f.neto = ''; f.iva = ''; checks.cuadra = true; notes.push('Honorarios: bruto ' + U.fmtCLP(h.bruto) + ', retención ' + U.fmtCLP(h.retencion) + ' y líquido ' + U.fmtCLP(h.liquido) + '. Se anota el bruto como total del gasto.'); }
    } else {
      tri = findTriple(am);
      if (tri) { f.neto = tri.neto; f.iva = tri.iva; f.total = tri.total; checks.cuadra = true; if (tri.extras && tri.extras.length) notes.push('El total incluye otros impuestos (' + tri.extras.map(function (e) { return U.fmtCLP(e); }).join(' + ') + '), como en los combustibles.'); }
      else {
        var inc = findIvaIncluded(am);
        if (inc) { f.neto = inc.neto; f.iva = inc.iva; f.total = inc.total; checks.cuadra = true; notes.push('El comprobante indica el IVA incluido; el neto se calculó restando.'); }
        else {
          var only = findTotalOnly(am);
          if (only) { f.total = only; notes.push('Solo se pudo identificar el total; neto e IVA no se leyeron.'); }
        }
      }
    }
    if (f.total == null) notes.push('No se pudo leer el total.');
    else if (!checks.cuadra && !isHon) notes.push('Las cifras no se pudieron cuadrar entre sí: compara con la foto.');
    if (lines.length > 140) notes.push('El archivo tiene varias hojas: se leyó el primer documento. Revisa que los datos correspondan a él.');
    var level = checks.rut && checks.fecha && checks.cuadra && f.total != null ? 'consistente' : 'revisar';
    return { fields: f, checks: checks, level: level, notes: notes };
  }

  RF.receipt = { extract: extract, _amountsOf: function (t) { return amountsOf(splitLines(t)); } };
})(typeof window !== 'undefined' ? window : globalThis);
