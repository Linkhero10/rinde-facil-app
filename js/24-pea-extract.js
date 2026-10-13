/* Rinde Fácil — extracción del PEA (Programa de Ejecución de Actividades) que sube la comunidad: datos de la comunidad,
 * proyectos, consolidado de costos por cuenta, líneas de presupuesto, carta Gantt y advertencias.
 * Se apoya en encabezados y etiquetas, no en posiciones fijas. Lo que no se puede leer con certeza queda vacío y se anota
 * en warnings: nunca se inventa un valor. Usa RF.read (js/23-read-docx.js). Sin servicios externos ni costo. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var P = RF.pea = RF.pea || {};

  var MESES = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8,
    SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 };
  var MARCAS = ['X', '✓', '✔', '●', '■', '1', '*'];
  var CLAVES = ['rrhh', 'operacion', 'inversion', 'administracion'];
  var NOMBRE_CLAVE = { rrhh: 'Recursos humanos', operacion: 'Gastos operacionales', inversion: 'Gastos de inversión', administracion: 'Gastos de administración' };

  /* ---------- texto y números ---------- */

  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim().toUpperCase();
  }
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  /* varias líneas de una celda en una sola, separadas por "; " */
  function flat(s) {
    return String(s == null ? '' : s).split(/\n+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x !== ''; }).join('; ');
  }
  /* párrafos de una celda (cada salto de línea) -> textos limpios, sin vacíos */
  function partes(s) {
    return String(s == null ? '' : s).split(/\n+/).map(function (x) { return clean(x); })
      .filter(function (x) { return x !== ''; });
  }
  /* celda con varios párrafos -> un solo texto con ' | ' (no se corta nada) */
  function unir(s) { return partes(s).join(' | '); }
  /* "$0.-", "147.419.606.-", "74.025.538.-serán…" -> entero al inicio del texto; "1.2" no se lee como 1 */
  function montoInicio(t) {
    var m = /^\s*\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?!\d|[.,]\d)/.exec(String(t == null ? '' : t));
    return m ? parseInt(m[1].replace(/\./g, ''), 10) : null;
  }
  /* primera tabla cuyo título (celda 0 de la fila 0) cumple la expresión */
  function tablaPor(tables, re) {
    for (var i = 0; i < tables.length; i++) {
      var g = tableRows(tables[i]);
      if (g.length && g[0] && re.test(norm(g[0][0]))) return g;
    }
    return null;
  }
  /* filas { k, v } de una tabla de dos o más columnas: k = etiqueta; v = celdas con texto desde la columna 1, unidas con ' | '.
   * Salta la fila 0 (título o encabezado). soloConTexto: descarta filas sin texto en las columnas de respuesta. */
  function filasDatos(grid, soloConTexto) {
    var out = [];
    if (!grid) return out;
    for (var r = 1; r < grid.length; r++) {
      var row = grid[r] || [];
      var k = unir(row[0]);
      var vals = [];
      for (var c = 1; c < row.length; c++) { var t = unir(row[c]); if (t) vals.push(t); }
      var v = vals.join(' | ');
      if (!k && !v) continue;
      if (soloConTexto && !v) continue;
      out.push({ k: k, v: v });
    }
    return out;
  }
  /* celda «Nombre Encargado Convenio»: nombre (sin cargo ni RUT) y secretaria con su RUT, si la celda los trae */
  function contactoDe(raw, warnings) {
    var lines = partes(raw);
    var esRut = function (l) { return /^RUT\s*:/i.test(l); };
    var esCargo = function (l) { return /SECRETAR|PRESIDEN|TESORER|CARGO/i.test(l); };
    var sinTitulo = function (l) { return l.replace(/^(Sr\.?|Sra\.?|Srta\.?)\s+/i, ''); };
    var nombres = lines.filter(function (l) { return !esRut(l) && !esCargo(l); });
    var out = { encargado: nombres.length ? sinTitulo(nombres[0]) : null, secretaria: null };
    var iSec = -1, rut = null;
    lines.forEach(function (l, i) {
      if (iSec < 0 && /SECRETAR/i.test(l)) iSec = i;
      if (!rut && esRut(l)) rut = clean(l.replace(/^RUT\s*:/i, '')) || null;
    });
    if (iSec >= 0 && rut) {
      var anterior = iSec > 0 ? lines[iSec - 1] : null;
      var nombre = anterior && !esRut(anterior) && !esCargo(anterior) ? sinTitulo(anterior) : null;
      out.secretaria = { nombre: nombre, rut: rut };
      if (!nombre) warnings.push('La secretaria aparece en el PEA con RUT, pero sin nombre claro; queda sin nombre.');
    }
    return out;
  }
  /* fuentes de financiamiento de un proyecto (filas de su tabla de información): null si no hay fila */
  function fuentesDe(rows, pfx, warnings) {
    var out = { aia30: null, aia70: null, otras: null };
    rows.forEach(function (row, i) {
      if (i === 0) return;
      var val = lastNonEmpty(row, 1);
      var t = unir(val);
      var n = norm(t);
      var m;
      if (/CON CARGO AL (30|70)% DEL AIA/.test(n)) {
        var clave = /CON CARGO AL 30%/.test(n) ? 'aia30' : 'aia70';
        var etiqueta = clave === 'aia30' ? '30% del AIA' : '70% del AIA';
        m = /=\s*(.*)$/.exec(t);
        var monto = m ? montoInicio(m[1]) : null;
        if (monto === null) warnings.push(pfx + 'no se pudo leer el monto con cargo al ' + etiqueta + ' ("' + t + '"); queda vacío.');
        else out[clave] = monto;
      } else if (/FINANCIAR.*MEDIANTE OTRAS FUENTES/.test(norm(row[0]))) {
        if (!t || /^(N\/A|NO APLICA)\.?$/.test(n)) return;
        var mo = montoInicio(t);
        if (mo === null) warnings.push(pfx + 'no se pudo leer el monto de otras fuentes ("' + t + '"); queda vacío.');
        else out.otras = mo;
      }
    });
    return out;
  }

  /* último texto no vacío de la fila, desde la columna "from" (sin el texto crudo recortado) */
  function lastNonEmpty(row, from) {
    if (!row) return '';
    for (var c = row.length - 1; c >= from; c--) {
      if (String(row[c] == null ? '' : row[c]).trim() !== '') return String(row[c]);
    }
    return '';
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function isoOf(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }

  /* "$71.511.496.-", "530.000.000", "$0.-", "$0" -> entero. Cualquier otra cosa -> null (no se adivina). */
  P.parseMonto = function (text) {
    var m = /^\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:\.-|-)?$/.exec(clean(text));
    return m ? parseInt(m[1].replace(/\./g, ''), 10) : null;
  };

  /* "1 de mayo de 2023", "15-02-2024", "2023-05-01" -> { iso, precision: 'dia' }; "Marzo 2024" -> { iso (día 1), precision: 'mes' }.
   * Fechas inexistentes (31 de abril) o no reconocidas -> null. */
  P.parseFecha = function (text) {
    var t = norm(text);
    var m = /^(\d{1,2}) DE ([A-Z]+)(?: DE)? (\d{4})$/.exec(t);
    var iso;
    if (m && MESES[m[2]]) {
      iso = isoOf(+m[3], MESES[m[2]], +m[1]);
      return iso ? { iso: iso, precision: 'dia' } : null;
    }
    m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(t);
    if (m) {
      iso = isoOf(+m[3], +m[2], +m[1]);
      return iso ? { iso: iso, precision: 'dia' } : null;
    }
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (m) {
      iso = isoOf(+m[1], +m[2], +m[3]);
      return iso ? { iso: iso, precision: 'dia' } : null;
    }
    m = /^([A-Z]+)(?: DE)? (\d{4})$/.exec(t);
    if (m && MESES[m[1]]) {
      iso = isoOf(+m[2], MESES[m[1]], 1);
      return iso ? { iso: iso, precision: 'mes' } : null;
    }
    return null;
  };

  /* ---------- tablas ---------- */

  function tableRows(t) { return (t && t.grid) || []; }

  /* primera fila cuya etiqueta (columna 0, normalizada) cumple la expresión */
  function labelRow(rows, re) {
    for (var r = 0; r < rows.length; r++) {
      if (re.test(norm(rows[r][0]))) return rows[r];
    }
    return null;
  }
  function findRowAnywhere(tables, re) {
    for (var i = 0; i < tables.length; i++) {
      var row = labelRow(tableRows(tables[i]), re);
      if (row) return row;
    }
    return null;
  }
  function valueOf(row) { return row ? (flat(lastNonEmpty(row, 1)) || null) : null; }

  /* primera columna que cumple la expresión de mayor prioridad */
  function findCol(H, pats) {
    for (var p = 0; p < pats.length; p++) {
      for (var c = 0; c < H.length; c++) {
        if (pats[p].test(H[c])) return c;
      }
    }
    return -1;
  }

  /* título de tabla de cuenta: "Tabla 1 RECURSOS HUMANOS", "Tabla 2 CUENTA GASTOS DE OPERACIÓN" */
  function accountOf(grid) {
    var title = clean(grid[0] && grid[0][0]);
    var label = title.replace(/^TABLA\s*\d+\s*/i, '').replace(/^CUENTA\s+/i, '').trim();
    var n = norm(label);
    if (/^RECURSOS HUMANOS$/.test(n)) return { label: label, key: 'rrhh' };
    if (/^GASTOS (OPERACIONALES|DE OPERACION)$/.test(n)) return { label: label, key: 'operacion' };
    if (/^GASTOS DE INVERSION$/.test(n)) return { label: label, key: 'inversion' };
    if (/^GASTOS ADMINISTRACION$/.test(n)) return { label: label, key: 'administracion' };
    return null;
  }

  function kindOf(grid) {
    if (!grid.length) return null;
    var t0 = norm(grid[0].join(' '));
    if (/CONSOLIDADO DE COSTOS/.test(t0)) return 'consolidado';
    if (grid.length >= 3 && norm(grid[0][0]) === 'ETAPAS' && /ACTIVIDADES/.test(t0)) return 'gantt';
    if (accountOf(grid)) return 'cuenta';
    return null;
  }

  /* ---------- consolidado de costos ---------- */

  function parseConsolidado(grid, pfx, warnings) {
    var budget = { rrhh: null, operacion: null, inversion: null, administracion: null };
    var hallado = {}, total = null;
    grid.forEach(function (row) {
      var et = norm(row[0]);
      var clave = null;
      if (/RECURSOS HUMANOS/.test(et)) clave = 'rrhh';
      else if (/INVERSION/.test(et)) clave = 'inversion';
      else if (/OPERACIONAL|OPERACION/.test(et)) clave = 'operacion';
      else if (/ADMINISTRACION/.test(et)) clave = 'administracion';
      else if (/^TOTAL/.test(et)) clave = 'total';
      if (!clave) return;
      hallado[clave] = true;
      var raw = lastNonEmpty(row, 1);
      var v = P.parseMonto(raw);
      if (clave === 'total') {
        total = v;
        if (v === null) warnings.push(pfx + 'el total del consolidado no es legible ("' + clean(raw) + '").');
        return;
      }
      if (v === null) warnings.push(pfx + NOMBRE_CLAVE[clave] + ' en el consolidado no es legible ("' + (clean(raw) || 'vacío') + '"); queda vacío.');
      budget[clave] = v;
    });
    var suma = 0, completa = true;
    CLAVES.forEach(function (k) {
      if (budget[k] === null) completa = false; else suma += budget[k];
    });
    return { budget: budget, hallado: hallado, total: total, suma: completa ? suma : null };
  }

  /* ---------- tablas de cuenta (líneas de presupuesto) ---------- */

  function parseAccountTable(grid, acc, pfx, warnings) {
    var out = [];
    var H = (grid[1] || []).map(function (h) { return norm(h); });
    var colMonto = findCol(H, [/PRESUPUESTO TOTAL/, /PRESUPUESTO/, /COSTO/, /MONTO/]);
    var colItem = findCol(H, [/PERSONAL|OBRAS/, /ITEM|BIENES|SERVICIO|ACTIVIDAD/]);
    var colGlosa = findCol(H, [/FUNCIONES|VINCULACION|DESCRIPCION/]);
    var colFuente = findCol(H, [/FUENTE|FINANCIAMIENTO/]);
    if (colMonto < 0 || colItem < 0) {
      warnings.push(pfx + 'no se reconoce el encabezado de la tabla "' + acc.label + '"; no se leyeron sus líneas.');
      return out;
    }
    for (var r = 2; r < grid.length; r++) {
      var row = grid[r];
      var item = flat(row[colItem]);
      var rawM = clean(row[colMonto]);
      if (/^TOTAL/.test(norm(row[0])) || /^TOTAL/.test(norm(item))) continue;
      if (!item && !rawM) continue;
      var nombre = item || flat(row[0]) || '(sin nombre)';
      var monto = P.parseMonto(rawM);
      if (monto === null) {
        warnings.push(pfx + acc.label + ': la línea "' + nombre + '" no tiene monto legible (' + (rawM || 'vacío') + '); no se incluyó.');
        continue;
      }
      out.push({
        cuenta: acc.label,
        item: nombre,
        glosa: colGlosa >= 0 ? (flat(row[colGlosa]) || null) : null,
        monto: monto,
        fuente: colFuente >= 0 ? (flat(row[colFuente]) || null) : null
      });
    }
    return out;
  }

  /* ---------- carta Gantt ---------- */

  function parseGantt(grid, pfx, warnings) {
    var stages = [];
    var h = 0, c, r, hr;
    while (h < grid.length && norm(grid[h][0]) === 'ETAPAS') h++;
    var cols = grid[0].length;
    var actCol = -1, resCol = -1;
    for (c = 0; c < cols; c++) {
      var txt = '';
      for (hr = 0; hr < h; hr++) txt += ' ' + norm(grid[hr][c]);
      if (actCol < 0 && /ACTIVIDADES/.test(txt)) actCol = c;
      if (resCol < 0 && /ENTREGABLE/.test(txt)) resCol = c;
    }
    if (actCol < 0) {
      warnings.push(pfx + 'carta Gantt: no se reconoce la columna de actividades; no se leyó.');
      return stages;
    }
    /* años: filas de encabezado de arriba; cada año cubre desde su columna hasta el siguiente año */
    var yearAt = {};
    for (hr = 0; hr < h - 1; hr++) {
      for (c = 0; c < cols; c++) {
        var y = clean(grid[hr][c]);
        if (/^20\d{2}$/.test(y)) yearAt[c] = +y;
      }
    }
    var meses = [], year = null;
    for (c = 0; c < cols; c++) {
      if (yearAt[c] !== undefined) year = yearAt[c];
      var mm = /^M(\d{1,2})$/.exec(norm(grid[h - 1][c]).replace(/\s+/g, ''));
      if (mm && +mm[1] >= 1 && +mm[1] <= 12) meses.push({ c: c, mes: +mm[1], anio: year });
    }
    if (!meses.length) {
      warnings.push(pfx + 'carta Gantt: no se reconocen columnas de meses (M1 a M12); no se leyeron fechas.');
    } else if (meses.some(function (m) { return m.anio === null; })) {
      warnings.push(pfx + 'carta Gantt: algunas columnas de mes no tienen año; esas fechas quedan vacías.');
    }

    var sinMarcas = [], desconocidas = [], conFechas = false;
    var nombreEtapa = '';
    for (r = h; r < grid.length; r++) {
      var row = grid[r];
      var nEtapa = flat(row[0]);
      var nAct = flat(row[actCol]);
      var marcas = [], raros = [];
      for (var i = 0; i < meses.length; i++) {
        var raw = clean(row[meses[i].c]);
        if (!raw) continue;
        if (MARCAS.indexOf(norm(raw)) >= 0) marcas.push(meses[i]);
        else raros.push(raw);
      }
      if (!nAct && !marcas.length) continue;
      if (nEtapa) nombreEtapa = nEtapa;
      var nombre = nombreEtapa || 'Sin etapa';
      var act = { name: nAct || '(sin nombre)', start: null, end: null, result: flat(row[resCol]) || null };
      if (marcas.length) {
        var a = marcas[0], z = marcas[marcas.length - 1];
        if (a.anio !== null && z.anio !== null) {
          act.start = isoOf(a.anio, a.mes, 1);
          act.end = isoOf(z.anio, z.mes, 1);
          conFechas = true;
        }
      } else {
        sinMarcas.push(act.name);
      }
      if (raros.length) desconocidas.push(act.name + ' (' + raros.join(', ') + ')');
      if (!stages.length || stages[stages.length - 1].name !== nombre) stages.push({ name: nombre, acts: [] });
      stages[stages.length - 1].acts.push(act);
    }
    if (conFechas) {
      warnings.push(pfx + 'carta Gantt: las fechas son por mes; se usó el día 1 del primer y del último mes marcados.');
    }
    if (sinMarcas.length) {
      warnings.push(pfx + 'carta Gantt: ' + sinMarcas.length + ' actividad(es) sin marcas (fechas vacías; si el formato es de celdas coloreadas, el color no se leyó): ' + sinMarcas.join(' | '));
    }
    if (desconocidas.length) {
      warnings.push(pfx + 'carta Gantt: celdas no reconocidas (no se marcaron) en: ' + desconocidas.join(' | '));
    }
    return stages;
  }

  /* ---------- administración citada en antecedentes ---------- */

  function adminFromAntecedentes(tables) {
    for (var i = 0; i < tables.length; i++) {
      var grid = tableRows(tables[i]);
      for (var r = 0; r < grid.length; r++) {
        for (var c = 0; c < grid[r].length; c++) {
          var m = /TOTAL DE GASTOS ADMINISTRATIVOS\s*:\s*\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)/.exec(norm(grid[r][c]));
          if (m) return P.parseMonto(m[1]);
        }
      }
    }
    return null;
  }

  /* ---------- extracción principal ---------- */

  P.extractFromStructure = function (structure) {
    var warnings = [];
    var tables = (structure && structure.tables) || [];
    var paragraphs = (structure && structure.paragraphs) || [];

    /* comunidad */
    var rr = valueOf(findRowAnywhere(tables, /NOMBRE DE (LA )?COMUNIDAD/));
    var rut = valueOf(findRowAnywhere(tables, /RUT DE (LA )?COMUNIDAD/));
    var tGen = tablaPor(tables, /^ANTECEDENTES GENERALES DEL PEA/);
    var tPlan = tablaPor(tables, /^ANTECEDENTES DEL PLAN DE VIDA/);
    var enc = contactoDe(rawOf(findRowAnywhere(tables, /NOMBRE ENCARGADO CONVENIO/)), warnings);
    var fechaCorfo = P.parseFecha(clean(rawOf(findRowAnywhere(tables, /^FECHA DE ENTREGA DEL PROYECTO A CORFO/))));
    var asambleaRaw = clean(rawOf(findRowAnywhere(tables, /SE ENCUENTRAN VALIDADOS/)));
    var asambleaM = /FECHA\s+(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{4})/i.exec(asambleaRaw);
    var asamblea = asambleaM ? P.parseFecha(asambleaM[1]) : null;
    var community = {
      name: rr,
      rut: rut ? rut.replace(/^N[°º]\s*/i, '') : null,
      address: valueOf(findRowAnywhere(tables, /DIRECCION/)),
      legalRep: valueOf(findRowAnywhere(tables, /REPRESENTANTE LEGAL/)),
      oc: null,
      contacto: {
        encargado: enc.encargado,
        secretaria: enc.secretaria,
        telefonos: partes(rawOf(findRowAnywhere(tables, /TELEFONO DE CONTACTO/))),
        correos: partes(rawOf(findRowAnywhere(tables, /CORREO ELECTRONICO DEL ENCARGADO/)))
      },
      fechaEntrega: fechaCorfo ? fechaCorfo.iso : null,
      asambleaValidacion: asamblea ? asamblea.iso : null,
      apoyo: unir(rawOf(findRowAnywhere(tables, /^INDICAR SI RECIBIO APOYO/))) || null,
      peaDatos: filasDatos(tGen, false).concat(filasDatos(tPlan, true))
    };
    if (!enc.encargado) warnings.push('El encargado del convenio no aparece en el PEA.');
    if (!fechaCorfo) warnings.push('La fecha de entrega del proyecto a CORFO no aparece o no es válida; queda vacía.');
    else if (fechaCorfo.precision === 'mes') warnings.push('La fecha de entrega a CORFO sólo tiene mes y año; se usó el día 1.');
    if (!asamblea) warnings.push('La fecha de validación por la Asamblea no aparece o no es válida; queda vacía.');
    if (!community.apoyo) warnings.push('La pregunta sobre apoyo para elaborar el PEA no tiene respuesta en el PEA.');
    if (!community.name) warnings.push('No se encontró el nombre de la comunidad.');
    if (!community.rut) warnings.push('No se encontró el RUT de la comunidad.');
    if (!community.address) warnings.push('La dirección de la comunidad no aparece en el PEA.');
    if (!community.legalRep) warnings.push('El representante legal no aparece en el PEA (el encargado del convenio no es lo mismo).');
    warnings.push('El organismo colaborador no aparece con nombre en el PEA (sólo se marcan opciones); queda vacío.');

    /* proyectos: cada tabla "Nombre del proyecto" abre un proyecto */
    var infos = [];
    tables.forEach(function (t, i) {
      if (labelRow(tableRows(t), /^NOMBRE DEL PROYECTO$/)) infos.push(i);
    });
    var codes = [];
    paragraphs.forEach(function (p) {
      var m = /^Proyecto\s+N[°º]\s*(\d+)\s*$/i.exec(clean(p));
      if (m) codes.push('N°' + m[1]);
    });
    var codigosOk = codes.length === infos.length;
    if (!codigosOk) {
      warnings.push('Se encontraron ' + infos.length + ' tablas de proyecto y ' + codes.length + ' encabezados "Proyecto N°"; los códigos quedan vacíos.');
    }

    /* asociar cada tabla de presupuesto o Gantt al proyecto que la precede */
    var buckets = infos.map(function () { return { consol: [], gantt: [], cuentas: [] }; });
    tables.forEach(function (t, i) {
      if (infos.indexOf(i) >= 0) return;
      var grid = tableRows(t);
      var kind = kindOf(grid);
      if (!kind) return;
      var owner = -1;
      infos.forEach(function (ti, k) { if (ti < i) owner = k; });
      if (owner < 0) {
        warnings.push('Hay una tabla de ' + kind + ' antes del primer proyecto; no se asoció a ningún proyecto.');
        return;
      }
      if (kind === 'consolidado') buckets[owner].consol.push(grid);
      else if (kind === 'gantt') buckets[owner].gantt.push(grid);
      else buckets[owner].cuentas.push(grid);
    });

    var projects = [];
    var adm = [];

    infos.forEach(function (ti, k) {
      var rows = tableRows(tables[ti]);
      var b = buckets[k];
      var code = null; /* el PEA no trae código de proyecto: «Proyecto N°1» es un título, no un código */
      var pfx = 'Proyecto ' + (code || (k + 1)) + ': ';
      var name = valueOf(labelRow(rows, /^NOMBRE DEL PROYECTO$/));
      if (!name) warnings.push(pfx + 'sin nombre de proyecto.');

      /* plazo */
      var plazo = labelRow(rows, /^PLAZO ESTIMADO/);
      var rawPlazo = plazo ? lastNonEmpty(plazo, 1) : '';
      if (!rawPlazo) warnings.push(pfx + 'sin plazo de inicio y término en el PEA.');
      var ini = /inicio\s*:\s*([^\n]*)/i.exec(rawPlazo);
      var fin = /t[eé]rmino\s*:\s*([^\n]*)/i.exec(rawPlazo);
      var start = fechaDe(ini ? ini[1] : '', pfx + 'fecha de inicio', warnings);
      var end = fechaDe(fin ? fin[1] : '', pfx + 'fecha de término', warnings);

      /* consolidado */
      var budget = { rrhh: null, operacion: null, inversion: null, administracion: null };
      var presentes = {};
      var sumaConsol = null;
      if (!b.consol.length) {
        warnings.push(pfx + 'no tiene consolidado de costos; presupuesto vacío.');
      } else {
        if (b.consol.length > 1) warnings.push(pfx + 'tiene más de un consolidado; se usó el primero.');
        var cons = parseConsolidado(b.consol[0], pfx, warnings);
        budget = cons.budget;
        presentes = cons.hallado;
        sumaConsol = cons.suma;
        CLAVES.forEach(function (key) {
          if (!presentes[key]) {
            warnings.push(pfx + (key === 'administracion' ? 'el consolidado no separa gastos de administración.' : 'el consolidado no trae la fila de ' + NOMBRE_CLAVE[key] + '.'));
          }
        });
        if (cons.total !== null && sumaConsol !== null && cons.total !== sumaConsol) {
          warnings.push(pfx + 'el consolidado no cuadra: la suma de cuentas es $' + fmt(sumaConsol) + " y el total declarado $" + fmt(cons.total) + '.');
        }
      }
      var declaradoRaw = rawOf(labelRow(rows, /^PRESUPUESTO TOTAL DEL PROYECTO/));
      var declarado = P.parseMonto(declaradoRaw);
      if (declarado !== null && sumaConsol !== null && declarado !== sumaConsol) {
        warnings.push(pfx + 'el presupuesto total declarado ($' + fmt(declarado) + ') no coincide con el consolidado ($' + fmt(sumaConsol) + '); revisar si la diferencia corresponde a otras fuentes.');
      }

      /* líneas de presupuesto por cuenta */
      var lines = [];
      var sumas = {}, conTabla = {};
      b.cuentas.forEach(function (g) {
        var acc = accountOf(g);
        parseAccountTable(g, acc, pfx, warnings).forEach(function (l) {
          lines.push(l);
          sumas[acc.key] = (sumas[acc.key] || 0) + l.monto;
        });
        conTabla[acc.key] = true;
      });
      CLAVES.forEach(function (key) {
        if (conTabla[key] && budget[key] !== null && (sumas[key] || 0) !== budget[key]) {
          warnings.push(pfx + 'la suma de las líneas de ' + NOMBRE_CLAVE[key] + ' ($' + fmt(sumas[key] || 0) + ') no coincide con el consolidado ($' + fmt(budget[key]) + ').');
        }
        if (!conTabla[key] && budget[key] !== null && budget[key] > 0) {
          warnings.push(pfx + 'hay monto en ' + NOMBRE_CLAVE[key] + ' ($' + fmt(budget[key]) + ') pero no hay tabla de detalle.');
        }
      });

      /* carta Gantt */
      var gantt = { stages: [] };
      if (b.gantt.length) gantt.stages = parseGantt(b.gantt[0], pfx, warnings);
      else warnings.push(pfx + 'no tiene carta Gantt en el PEA.');

      /* administración: no se reparte entre proyectos; cierreAdmin la lleva al proyecto automático */
      adm.push({ pfx: pfx, budget: budget, presentes: !!presentes.administracion });

      projects.push({
        name: name,
        code: code,
        start: start,
        end: end,
        budgetApproved: budget,
        budgetLines: lines,
        gantt: gantt,
        peaDatos: filasDatos(rows, false),
        fuentes: fuentesDe(rows, pfx, warnings),
        source: 'PEA: ' + (code ? 'Proyecto ' + code : 'proyecto ' + (k + 1))
      });
    });

    var antTotal = adminFromAntecedentes(tables);
    var autoAdm = cierreAdmin(adm, antTotal, 'PEA: ', warnings);
    if (autoAdm) projects.push(autoAdm);

    /* el texto del mismo Word se lee con las mismas reglas: sólo avisa de discrepancias y aporta lo que las tablas no traen */
    var tx = P.extractFromText(textoDeTablas(tables), { origen: 'word' });
    compararTexto(community, projects, tx, warnings);
    community.presidente = tx.community.presidente;
    community.aia30 = tx.community.aia30;
    if (!community.asambleaTexto) community.asambleaTexto = tx.community.asambleaTexto;

    return { community: community, projects: projects, warnings: warnings };
  };

  function rawOf(row) { return row ? lastNonEmpty(row, 1) : ''; }

  function fechaDe(raw, what, warnings) {
    if (!clean(raw)) {
      warnings.push(what + ' no aparece en el PEA; queda vacía.');
      return null;
    }
    var f = P.parseFecha(raw);
    if (!f) {
      warnings.push(what + ' no es una fecha válida ("' + clean(raw) + '"); queda vacía.');
      return null;
    }
    if (f.precision === 'mes') {
      warnings.push(what + ' sólo tiene mes y año ("' + clean(raw) + '"); se usó el día 1.');
    }
    return f.iso;
  }


  /* minúsculas y sin tildes, carácter a carácter: el largo no cambia, así que los índices sirven en el texto original */
  function foldKeep(s) {
    var out = '', str = String(s == null ? '' : s);
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      var base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0) || ch;
      var low = base.toLowerCase();
      out += low.length === 1 ? low : base;
    }
    return out;
  }



  /* ---------- lectura por TEXTO: PEA escaneado (OCR) y texto del Word ----------
   * Un solo conjunto de reglas para los dos formatos: cada etiqueta del formulario se busca en el texto (aunque el OCR haya
   * partido la línea) y su valor es lo que sigue. Lo que no se lee con certeza queda vacío y se anota en warnings.
   * No usa posiciones ni tablas. No lee el detalle del presupuesto (tablas 2 a 4) ni la carta Gantt. */

  /* texto de las tablas del Word, en orden: una línea por celda (las celdas combinadas se repiten en la rejilla: se cuentan una vez) */
  function textoDeTablas(tables) {
    return (tables || []).map(function (t) {
      return tableRows(t).map(function (row) {
        var out = [];
        (row || []).forEach(function (c) {
          var s = String(c == null ? '' : c).trim();
          if (s && out[out.length - 1] !== s) out.push(s);
        });
        return out.join('\n');
      }).filter(function (x) { return x !== ''; }).join('\n');
    }).join('\n\n');
  }

  /* primera coincidencia de «re» en el texto plegado «f» a partir de «desde»; los índices valen también en el texto original */
  function buscar(f, re, desde) {
    var m = re.exec(f.slice(desde));
    return m ? { i: desde + m.index, e: desde + m.index + m[0].length } : null;
  }
  /* montos con «$» en un texto: "$56.068.943.-" -> 56068943; "$0" -> 0 */
  function montosEn(s) {
    var out = [], re = /\$\s*(\d[\d.]*)/g, m;
    while ((m = re.exec(String(s || '')))) {
      var d = m[1].replace(/\.+$/, '').replace(/\./g, '');
      if (d !== '') out.push(parseInt(d, 10));
    }
    return out;
  }
  /* monto al inicio del texto, con o sin «$»: "147.419.606.-" -> 147419606; "por definir" -> null */
  function montoAl(s) {
    var m = /^\s*\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?!\d|[.,]\d)/.exec(String(s || ''));
    return m ? parseInt(m[1].replace(/\./g, ''), 10) : null;
  }
  /* primera fecha a partir de «desde» (plegado «f», original «t»): { txt, f } con f = P.parseFecha (null si la fecha no existe).
   * saltarDeFecha: no toma las numéricas que van tras «de fecha» (p. ej. la fecha de la Asamblea). */
  function fechaEn(t, f, desde, hasta, saltarDeFecha) {
    var sub = f.slice(desde, hasta === undefined ? f.length : hasta);
    var re = /(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})|(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{4})/g, m;
    while ((m = re.exec(sub))) {
      if (m[4] && saltarDeFecha && /fecha\s*$/.test(sub.slice(Math.max(0, m.index - 10), m.index))) continue;
      var txt = m[1] ? m[1] + ' de ' + m[2] + ' de ' + m[3] : m[4] + '-' + m[5] + '-' + m[6];
      return { txt: t.substr(desde + m.index, m[0].length), f: P.parseFecha(txt) };
    }
    return null;
  }
  /* fecha de un rótulo («Fecha de inicio: 1 de julio de 2022»): el valor va en su línea o en la siguiente */
  function fechaDeRotulo(t, f, re, what, warnings) {
    var r = buscar(f, re, 0);
    if (!r) { warnings.push(what + ' no aparece en el PEA; queda vacía.'); return null; }
    var fin = f.indexOf('\n', r.e);
    if (fin < 0) fin = f.length;
    var c = fechaEn(t, f, r.e, fin, false);
    if (!c) {
      var fin2 = f.indexOf('\n', fin + 1);
      c = fechaEn(t, f, fin + 1, fin2 < 0 ? f.length : fin2, false);
    }
    if (!c) { warnings.push(what + ' no aparece en el PEA; queda vacía.'); return null; }
    if (!c.f) { warnings.push(what + ' no es una fecha válida ("' + clean(c.txt) + '"); queda vacía.'); return null; }
    return c.f.iso;
  }

  /* RUT con formato dd.ddd.ddd-d que no es parte de un número más largo: [{ rut, i }] */
  function rutsEn(s) {
    var out = [], re = /\d{1,2}\.\d{3}\.\d{3}-[\dkK]/g, m;
    while ((m = re.exec(s))) {
      var ant = m.index > 0 ? s.charAt(m.index - 1) : '';
      if (!/[\d.]/.test(ant)) out.push({ rut: m[0], i: m.index });
    }
    return out;
  }
  /* RUT de la comunidad: el primero que no va tras «Rut:» (ese es el de una persona, p. ej. la secretaria) */
  function rutComunidadDe(a) {
    var rs = rutsEn(a);
    for (var k = 0; k < rs.length; k++) {
      if (!/RUT\s*:\s*(N\s*[°º.o]?\s*)?$/i.test(a.slice(Math.max(0, rs[k].i - 14), rs[k].i))) return rs[k].rut;
    }
    return null;
  }
  /* «COMUNIDAD ...» en mayúsculas, sin el RUT pegado */
  function nombreComunidadDe(a) {
    var ls = a.split('\n');
    for (var k = 0; k < ls.length; k++) {
      var t = clean(ls[k]), rs = rutsEn(t);
      if (rs.length) t = clean(t.slice(0, rs[0].i).replace(/\sN\s*[°º.]?\s*$/, ''));
      if (t.length > 9 && /^COMUNIDAD\b/.test(t) && t === t.toUpperCase()) return t;
    }
    return null;
  }

  var PARTICULAS_NOMBRE = /^(de|del|la|las|los|y|e|da|do|dos|das)$/;
  function esPalabraNombre(w) { return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(w); }
  /* nombre de persona: dos o más palabras con mayúscula inicial (las partículas van en minúscula); no todo en mayúsculas */
  function pareceNombre(s) {
    var t = clean(s);
    if (t.length < 3 || t.length > 60 || /[\d@:;()=$]/.test(t) || t === t.toUpperCase()) return false;
    var ws = t.split(' ');
    return ws.length >= 2 && ws.every(function (w) {
      return PARTICULAS_NOMBRE.test(w) || /^[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ'.\-]*$/.test(w);
    });
  }
  /* «Sra. Ana Pérez», «Secretaria Juana Díaz», «Ana Pérez (presidenta)» -> nombre limpio; si no es un nombre, null */
  function nombrePersona(l) {
    var t = clean(String(l || '').replace(/^(Sr\.?|Sra\.?|Srta\.?)\s+/i, '').replace(/\(.*$/, '').replace(/\bRUT\b\s*:?.*$/i, '')
      .replace(/\b(secretar[ií]a|presidenta?|tesorer[oa])\b(\s+de\s+la\s+comunidad)?/gi, ' '));
    return pareceNombre(t) ? t : null;
  }
  /* «Ana Ejemplo Prueba (presidente de la comunidad)»: el nombre va en la misma línea o en las anteriores */
  function presidenteEn(f, t) {
    var m = /\(\s*presidente\b/.exec(f);
    if (!m) return null;
    var antes = t.slice(0, m.index).split('\n');
    var nombre = clean(antes[antes.length - 1]);
    if (!pareceNombre(nombre)) {
      var acum = [];
      for (var k = antes.length - 2; k >= 0 && k >= antes.length - 10; k--) {
        var l = clean(antes[k]);
        if (!l || /^[-–—•]/.test(l)) continue;
        if (esPalabraNombre(l) || pareceNombre(l)) { acum.unshift(l); if (acum.length === 4) break; }
        else if (acum.length) break;
      }
      nombre = acum.join(' ');
    }
    var n = nombre ? nombre.split(' ').length : 0;
    return n >= 2 && n <= 5 ? nombre : null;
  }

  /* validación por la Asamblea: el PEA la afirma en una frase («Se encuentran validados por la Asamblea de la Comunidad de X.»).
   * Se guarda la frase tal como está en el PEA; la fecha, si la trae, va aparte. Si el OCR partió la pregunta y la respuesta,
   * se prefiere la frase con «Se» (la respuesta) y no la etiqueta de la pregunta. */
  function asambleaTextoEn(f, t) {
    var re = /(se\s+)?encuentran\s+validados\s+por\s+la\s+asamblea/g, m, hit = null;
    while ((m = re.exec(f))) {
      if (m[1]) { hit = m; break; }
      if (!hit) hit = m;
    }
    if (!hit) return null;
    var frase = t.slice(hit.index, hit.index + 240), fin = frase.indexOf('.');
    if (fin >= 0) frase = frase.slice(0, fin + 1);
    frase = clean(frase);
    return frase === '' ? null : frase;
  }

  /* fuentes de un proyecto: «con cargo al 30 % / 70 % del AIA = X» y «otras fuentes» con el monto en la misma línea o la siguiente */
  function fuentesEn(t, f, pfx, warnings) {
    var out = { aia30: null, aia70: null, otras: null }, m, raw, v, mp, resto, sig, primera;
    m = /30\s*%\s*del\s*aia\s*=\s*([^\n]*)/.exec(f);
    if (m) {
      raw = t.substr(m.index + m[0].length - m[1].length, m[1].length);
      out.aia30 = montoAl(raw);
      if (out.aia30 === null) warnings.push(pfx + 'no se pudo leer el monto con cargo al 30% del AIA ("' + clean(raw) + '"); queda vacío.');
    } else if ((v = /30\s*%\s*del\s*aia/.exec(f))) {
      /* PEA escaneado: el monto va como «Proyecto <nombre> $X» junto a la etiqueta del 30 % */
      mp = /proyecto\s+[^\n$]{0,60}\$\s*(\d[\d.]*)/.exec(f.slice(v.index, v.index + 400));
      if (mp) out.aia30 = montoAl(mp[1]);
    }
    m = /70\s*%\s*del\s*aia\s*=\s*([^\n]*)/.exec(f);
    if (m) {
      raw = t.substr(m.index + m[0].length - m[1].length, m[1].length);
      out.aia70 = montoAl(raw);
      if (out.aia70 === null) warnings.push(pfx + 'no se pudo leer el monto con cargo al 70% del AIA ("' + clean(raw) + '"); queda vacío.');
    }
    m = /otras\s+fuentes/.exec(f);
    if (m) {
      var desde = m.index + m[0].length, fin1 = f.indexOf('\n', desde);
      if (fin1 < 0) fin1 = f.length;
      resto = clean(t.slice(desde, fin1)).replace(/^[:\s]+/, '');
      sig = fin1 < t.length ? clean(t.slice(fin1 + 1).split('\n')[0]) : '';
      /* el monto va en la misma línea tras «otras fuentes» o en la siguiente; «N/A» deja el campo vacío */
      for (var c = 0; c < 2; c++) {
        primera = c === 0 ? resto : sig;
        if (/^(N\/A|NO APLICA)/i.test(primera)) break;
        if (/^(\$\s*\d|\d{1,3}(\.\d{3})+)/.test(primera)) { out.otras = montoAl(primera); break; }
      }
    }
    return out;
  }
  /* nombre del proyecto: la primera línea en mayúsculas tras «Nombre del proyecto» (se salta el rótulo «RESPUESTA») */
  function nombreProyectoEn(t, f) {
    var r = buscar(f, /nombre\s+del\s+proyecto/, 0);
    if (!r) return null;
    var ls = t.slice(r.e).split('\n').map(clean).filter(function (l) { return l !== ''; }).slice(0, 6);
    for (var k = 0; k < ls.length; k++) {
      var l = ls[k];
      if (l === l.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(l) && !/^(RESPUESTA|INFORMACION SOLICITADA)$/.test(norm(l))) return l;
    }
    return null;
  }

  /* administración: no se reparte entre proyectos; va a un proyecto automático «Gastos de administración».
   * items: [{ pfx, budget, presentes }]. En cada proyecto budget.administracion queda en 0 (o null si no se pudo leer). */
  function cierreAdmin(items, antTotal, base, warnings) {
    var hay = false, suma = 0, nulo = false;
    items.forEach(function (it) {
      if (!it.presentes) return;
      hay = true;
      if (it.budget.administracion === null) nulo = true;
      else suma += it.budget.administracion;
      if (it.budget.administracion) warnings.push(it.pfx + 'los gastos de administración ($' + fmt(it.budget.administracion) + ') no se reparten entre proyectos; van a "Gastos de administración".');
      it.budget.administracion = it.budget.administracion === null ? null : 0;
    });
    if (!hay && antTotal === null) {
      warnings.push('El documento no separa gastos de administración (ni en los consolidados ni en la tabla de antecedentes).');
      return null;
    }
    var monto = hay ? (nulo ? null : suma) : antTotal;
    if (!hay) {
      warnings.push('Los consolidados no separan gastos de administración; el proyecto "Gastos de administración" toma el total de la tabla de antecedentes ($' + fmt(antTotal) + '). Verificar.');
    } else if (antTotal !== null && monto !== null && antTotal !== monto) {
      warnings.push('La tabla de antecedentes indica gastos administrativos totales por $' + fmt(antTotal) + ', pero los consolidados suman $' + fmt(monto) + '; se usó el consolidado. Verificar cuál corresponde.');
    }
    return {
      name: 'Gastos de administración', code: null, start: null, end: null,
      budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: monto },
      budgetLines: [], gantt: { stages: [] }, peaDatos: [],
      fuentes: { aia30: null, aia70: null, otras: null },
      source: hay ? base + 'consolidados de costos' : base + 'tabla de antecedentes'
    };
  }

  /* lo que leen las tablas del Word frente a lo que lee su texto: sólo avisa cuando ambos traen valor y no coinciden */
  function compararTexto(com, projects, tx, warnings) {
    var tc = tx.community, ce = com.contacto || {}, te = tc.contacto || {};
    var msg = function (campo, a, b) {
      warnings.push('Word: el texto y las tablas difieren en ' + campo + ' («' + a + '» en las tablas, «' + b + '» en el texto); se usó lo de las tablas.');
    };
    var clave = function (s) { return norm(s).replace(/[^A-Z0-9]/g, ''); };
    var telKey = function (arr) { return (arr || []).map(function (x) { return String(x).replace(/\D/g, ''); }).sort().join('|'); };
    var mailKey = function (arr) { return (arr || []).map(function (x) { return String(x).toLowerCase(); }).sort().join('|'); };
    if (com.name && tc.name && clave(com.name) !== clave(tc.name)) msg('el nombre de la comunidad', com.name, tc.name);
    if (com.rut && tc.rut && clave(com.rut) !== clave(tc.rut)) msg('el RUT de la comunidad', com.rut, tc.rut);
    if (ce.encargado && te.encargado && clave(ce.encargado) !== clave(te.encargado)) msg('el encargado del convenio', ce.encargado, te.encargado);
    if (ce.secretaria && te.secretaria && ce.secretaria.rut && te.secretaria.rut && clave(ce.secretaria.rut) !== clave(te.secretaria.rut)) msg('el RUT de la secretaria', ce.secretaria.rut, te.secretaria.rut);
    if (telKey(ce.telefonos) && telKey(te.telefonos) && telKey(ce.telefonos) !== telKey(te.telefonos)) msg('los teléfonos de contacto', (ce.telefonos || []).join(' | '), (te.telefonos || []).join(' | '));
    if (mailKey(ce.correos) && mailKey(te.correos) && mailKey(ce.correos) !== mailKey(te.correos)) msg('los correos de contacto', (ce.correos || []).join(' | '), (te.correos || []).join(' | '));
    if (com.fechaEntrega && tc.fechaEntrega && com.fechaEntrega !== tc.fechaEntrega) msg('la fecha de entrega a CORFO', com.fechaEntrega, tc.fechaEntrega);
    if (com.asambleaValidacion && tc.asambleaValidacion && com.asambleaValidacion !== tc.asambleaValidacion) msg('la fecha de validación por la Asamblea', com.asambleaValidacion, tc.asambleaValidacion);
    var esAdm = function (p) { return p.name === 'Gastos de administración'; };
    var mias = projects.filter(function (p) { return !esAdm(p); }), suyos = tx.projects.filter(function (p) { return !esAdm(p); });
    if (mias.length !== suyos.length) {
      warnings.push('Word: las tablas traen ' + mias.length + ' proyecto(s) y el texto ' + suyos.length + '; no se comparan los proyectos.');
    } else {
      mias.forEach(function (p, i) {
        var q = suyos[i], pf = 'proyecto ' + (i + 1) + ': ';
        if (p.name && q.name && clave(p.name) !== clave(q.name)) msg(pf + 'el nombre', p.name, q.name);
        if (p.start && q.start && p.start !== q.start) msg(pf + 'la fecha de inicio', p.start, q.start);
        if (p.end && q.end && p.end !== q.end) msg(pf + 'la fecha de término', p.end, q.end);
        ['rrhh', 'operacion', 'inversion'].forEach(function (c) {
          var a = p.budgetApproved[c], b = q.budgetApproved[c];
          if (a !== null && b !== null && a !== b) msg(pf + 'el consolidado (' + c + ')', fmt(a), fmt(b));
        });
        [['aia30', 'el 30 % del AIA'], ['aia70', 'el 70 % del AIA'], ['otras', 'la fuente "otras"']].forEach(function (par) {
          var a = p.fuentes[par[0]], b = q.fuentes[par[0]];
          if (a !== null && b !== null && a !== b) msg(pf + par[1], fmt(a), fmt(b));
        });
      });
    }
    var adA = projects.filter(esAdm)[0], adB = tx.projects.filter(esAdm)[0];
    if (adA && adB && adA.budgetApproved.administracion !== null && adB.budgetApproved.administracion !== null && adA.budgetApproved.administracion !== adB.budgetApproved.administracion) {
      msg('los gastos de administración', fmt(adA.budgetApproved.administracion), fmt(adB.budgetApproved.administracion));
    }
  }

  function modeloVacio(msg) {
    return {
      community: { name: null, rut: null, address: null, legalRep: null, oc: null,
        contacto: { encargado: null, secretaria: null, telefonos: [], correos: [] },
        fechaEntrega: null, asambleaValidacion: null, apoyo: null, peaDatos: [],
        presidente: null, aia30: { recibido: null, saldo: null } },
      projects: [], warnings: [msg]
    };
  }

  /* ---------- filas «lo que dice el PEA» ----------
   * Se arman desde los campos del modelo: el extractor de texto las escribe y la pantalla las rehace al corregir un campo. */
  var NOMBRE_ADMIN = 'Gastos de administración';
  function esAdministracion(p) { return norm(p && p.name) === norm(NOMBRE_ADMIN); }
  function pesos(n) { return n === null || n === undefined ? null : '$' + fmt(n) + '.-'; }
  function filasDeComunidad(c) {
    var ct = c.contacto || {}, sec = ct.secretaria || null, out = [];
    var fila = function (etiqueta, valor) { if (valor) out.push({ k: etiqueta, v: valor }); };
    fila('Nombre de comunidad', c.name);
    fila('Rut de la comunidad', c.rut);
    fila('Nombre Encargado Convenio', [ct.encargado, sec && sec.rut ? 'Rut: ' + sec.rut : ''].filter(Boolean).join(' | '));
    fila('Teléfono de contacto de Encargado Convenio', (ct.telefonos || []).filter(Boolean).join(' | '));
    fila('Correo electrónico del Encargado Convenio', (ct.correos || []).filter(Boolean).join(' | '));
    fila('Fecha de entrega del Proyecto a CORFO', c.fechaEntrega);
    fila('Validados por la Asamblea', c.asambleaTexto || c.asambleaValidacion);
    fila('Monto total recibido como primera cuota (30 % del AIA)', c.aia30 ? pesos(c.aia30.recibido) : null);
    fila('Saldo del 30 % del AIA', c.aia30 ? pesos(c.aia30.saldo) : null);
    fila('Dirección', c.address);
    fila('Representante legal', c.legalRep);
    fila('Organismo colaborador', c.oc);
    fila('Apoyo para elaborar el PEA', c.apoyo);
    return out;
  }
  function filasDeProyecto(p) {
    var fu = p.fuentes || {}, out = [];
    var fila = function (etiqueta, valor) { if (valor !== null && valor !== undefined && valor !== '') out.push({ k: etiqueta, v: valor }); };
    fila('Nombre del proyecto', p.name);
    fila('Fecha de inicio', p.start);
    fila('Fecha de término', p.end);
    fila('Presupuesto total del proyecto ($), impuestos incluidos', pesos(p.presupuestoTotal));
    fila('Con cargo al 30 % del AIA', pesos(fu.aia30));
    fila('Con cargo al 70 % del AIA', pesos(fu.aia70));
    fila('Financiamiento con otras fuentes', pesos(fu.otras));
    return out;
  }
  /* saldo del 30 %: debe ser lo recibido menos lo que el PEA asigna a los proyectos (sin contar la administración automática) */
  function avisoSaldo(recibido, saldo, proyectos, warnings) {
    if (recibido === null || saldo === null) return;
    var del = proyectos.filter(function (p) { return !esAdministracion(p); });
    if (!del.length || !del.every(function (p) { return p.fuentes && p.fuentes.aia30 !== null; })) return;
    var asignado = del.reduce(function (s, p) { return s + p.fuentes.aia30; }, 0);
    if (recibido - asignado !== saldo) warnings.push('El saldo del 30 % del AIA no cuadra: lo recibido ($' + fmt(recibido) + ') menos lo que el PEA asigna a los proyectos ($' + fmt(asignado) + ') da $' + fmt(recibido - asignado) + ', y el PEA dice $' + fmt(saldo) + '. Revisa cuál es el dato correcto.');
  }
  /* deja el modelo listo para aplicar: sin teléfonos ni correos vacíos y con los objetos que la pantalla edita */
  P.normalizarModelo = function (model) {
    var c = model.community = model.community || {};
    var ct = c.contacto = c.contacto || { encargado: null, secretaria: null, telefonos: [], correos: [] };
    ct.telefonos = (ct.telefonos || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    ct.correos = (ct.correos || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    c.aia30 = c.aia30 || { recibido: null, saldo: null };
    (model.projects || []).forEach(function (p) {
      p.budgetApproved = p.budgetApproved || { rrhh: null, operacion: null, inversion: null, administracion: null };
      p.fuentes = p.fuentes || { aia30: null, aia70: null, otras: null };
      /* las filas vacías que se dejaron en la pantalla no se aplican: ni líneas sin ítem ni monto, ni actividades sin nombre */
      p.budgetLines = (p.budgetLines || []).filter(function (l) { return String(l.item || '').trim() !== '' || l.monto > 0; });
      p.gantt = p.gantt && Array.isArray(p.gantt.stages) ? p.gantt : { stages: [] };
      p.gantt.stages = p.gantt.stages.map(function (st) {
        return Object.assign({}, st, { acts: (st.acts || []).filter(function (a) { return String(a.name || '').trim() !== ''; }) });
      }).filter(function (st) { return String(st.name || '').trim() !== '' || st.acts.length > 0; });
    });
    return model;
  };
  /* rehace las filas «lo que dice el PEA» con los campos corregidos. Solo para el PEA escaneado: el Word trae sus filas de las tablas. */
  P.refrescarDatos = function (model) {
    if (!model || model.origen !== 'escaneado') return model;
    model.community.peaDatos = filasDeComunidad(model.community);
    (model.projects || []).forEach(function (p) { if (!esAdministracion(p)) p.peaDatos = filasDeProyecto(p); });
    return model;
  };

  /* texto del PEA -> mismo modelo que extractFromStructure (con presidente y aia30).
   * opts.origen: 'escaneado' (OCR de un PDF; es el valor por defecto) o 'word' (texto de las tablas del Word, para comparar). */
  P.extractFromText = function (text, opts) {
    var esW = !!(opts && opts.origen === 'word');
    var base = esW ? 'PEA: ' : 'PEA escaneado: ';
    var T = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/[ \t]/g, ' ').replace(/ {2,}/g, ' ');
    if (!T.trim()) return modeloVacio(esW ? 'El texto del PEA está vacío.' : 'El OCR no devolvió texto legible: revisa que el PDF sea de buena calidad.');
    var F = foldKeep(T), warnings = [];

    /* antecedentes: hasta «2. Antecedentes del Plan de Vida»; si no está, hasta el primer proyecto */
    var iPlan = buscar(F, /antecedentes\s+del\s+plan\s+de\s+vida/, 0);
    var desde = iPlan ? iPlan.i : 0;

    /* un proyecto por cada «Proyecto N°n» al inicio de línea; si no hay, por cada «INFORMACIÓN SOLICITADA» (tablas del Word)
     * o, sin encabezado, por cada «Nombre del proyecto» (su tabla trae el plazo, el consolidado y las fuentes) */
    var inicios = [], re = /(^|\n)\s*proyecto\s*n[º°o]\s*\d+/g, m;
    while ((m = re.exec(F))) {
      var st = F.indexOf('proyecto', m.index);
      if (st >= desde) inicios.push(st);
    }
    if (!inicios.length) {
      re = /informaci\s*on\s+solicitada/g;
      while ((m = re.exec(F))) if (m.index >= desde) inicios.push(m.index);
    }
    if (!inicios.length) {
      re = /nombre\s+del\s+proyecto/g;
      while ((m = re.exec(F))) if (m.index >= desde) inicios.push(m.index);
    }
    var finAnt = iPlan ? iPlan.i : F.length;
    if (inicios.length && inicios[0] < finAnt) finAnt = inicios[0];
    var A = T.slice(0, finAnt), FA = F.slice(0, finAnt);
    var bloques = inicios.map(function (st0, j) {
      var en = j + 1 < inicios.length ? inicios[j + 1] : F.length;
      return { t: T.slice(st0, en), f: F.slice(st0, en) };
    });

    /* comunidad: nombre, RUT, encargado, secretaria, teléfonos, correos y fechas (sección de antecedentes) */
    var nombre = nombreComunidadDe(A), rut = rutComunidadDe(A);
    var iEnc = buscar(FA, /nombre\s+encargado\s+convenio/, 0);
    var lsZ = (iEnc ? A.slice(iEnc.e) : A).split('\n').map(clean).filter(function (l) { return l !== ''; });
    var encargado = null, k, mr;
    for (k = 0; k < lsZ.length && !encargado; k++) if (/^(Sr|Sra|Srta)\.?\s+/i.test(lsZ[k])) encargado = nombrePersona(lsZ[k]);
    for (k = 0; k < Math.min(3, lsZ.length) && !encargado; k++) encargado = nombrePersona(lsZ[k]);
    /* secretaria: el «Rut:» de la celda del encargado; si la línea dice «Secretaria», el nombre sale de la línea de antes */
    var iR = -1, rutSec = null, secretaria = null;
    for (k = 0; k < lsZ.length && iR < 0; k++) {
      mr = /RUT\s*:\s*(\d{1,2}\.\d{3}\.\d{3}-[\dkK])/i.exec(lsZ[k]);
      if (mr) { iR = k; rutSec = mr[1]; }
    }
    if (iR >= 0) {
      var linea = lsZ[iR], nomSec = nombrePersona(linea.slice(0, linea.search(/RUT\s*:/i)));
      if (!nomSec && iR > 0) nomSec = /secretar/i.test(lsZ[iR - 1]) ? (iR > 1 ? nombrePersona(lsZ[iR - 2]) : null) : nombrePersona(lsZ[iR - 1]);
      secretaria = { nombre: nomSec || encargado, rut: rutSec };
    }
    /* teléfonos (+56 y 9 dígitos) y correos de la sección de antecedentes */
    var telefonos = [], correos = [], mt, mc, dg;
    var reTel = /\+\s*56[ .\-()]*(?:\d[ .\-()]*){9}/g;
    while ((mt = reTel.exec(A))) {
      dg = mt[0].replace(/\D/g, '');
      if (dg.length === 11 && dg.slice(0, 2) === '56' && telefonos.indexOf('+56' + dg.slice(2)) < 0) telefonos.push('+56' + dg.slice(2));
    }
    var reMail = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
    while ((mc = reMail.exec(A))) if (correos.indexOf(mc[0]) < 0) correos.push(mc[0]);
    /* fechas: entrega a CORFO (la primera después del rótulo, salvo las de «de fecha») y validación por la Asamblea */
    var iEnt = buscar(FA, /fecha\s+de\s+entrega\s+del\s+proyecto/, 0);
    var fEnt = iEnt ? fechaEn(A, FA, iEnt.e, undefined, true) : null;
    var asm = /de\s+fecha\s+(\d{1,2}\s*[-\/.]\s*\d{1,2}\s*[-\/.]\s*\d{4})/.exec(FA);
    var fAsm = asm ? P.parseFecha(asm[1].replace(/\s+/g, '')) : null;
    var fechaEntrega = fEnt && fEnt.f ? fEnt.f.iso : null;
    var asambleaValidacion = fAsm ? fAsm.iso : null;
    var asambleaTexto = asambleaTextoEn(F, T);
    /* monto total recibido como primera cuota (30 % del AIA) y saldo del 30 % (en el campo del saldo o como «Saldo = $X») */
    var mRec = /(por\s+un|corresponden\s+a\s+un)\s+total\s+de\s*:?\s*(\$\s*\d[\d.]*)/.exec(F);
    var recibido = mRec ? montoAl(mRec[2]) : null;
    var iSal = buscar(F, /del\s+saldo\s+que/, 0), finS = inicios.length ? inicios[0] : F.length;
    var mSal = iSal ? /=\s*(\$?\s*\d[\d.]*)/.exec(F.slice(iSal.e, finS)) : null;
    var saldo = mSal ? montoAl(mSal[1]) : null;
    if (saldo === null) {
      var mSal2 = /saldo\s*=\s*(\$?\s*\d[\d.]*)/.exec(F);
      if (mSal2) saldo = montoAl(mSal2[1]);
    }
    var presidente = presidenteEn(F, T);

    var comunidad = {
      name: nombre, rut: rut, address: null, legalRep: null, oc: null,
      contacto: { encargado: encargado, secretaria: secretaria, telefonos: telefonos, correos: correos },
      fechaEntrega: fechaEntrega, asambleaValidacion: asambleaValidacion, asambleaTexto: asambleaTexto, apoyo: null,
      peaDatos: [], presidente: presidente ? { nombre: presidente } : null,
      aia30: { recibido: recibido, saldo: saldo }
    };
    comunidad.peaDatos = filasDeComunidad(comunidad);

    if (!nombre) warnings.push('No se encontró el nombre de la comunidad.');
    if (!rut) warnings.push('No se encontró el RUT de la comunidad.');
    if (!encargado) warnings.push('El encargado del convenio no aparece en el ' + (esW ? 'PEA.' : 'PEA escaneado.'));
    if (!fechaEntrega) warnings.push('La fecha de entrega del proyecto a CORFO no aparece o no es válida; queda vacía.');
    if (asm && !fAsm) warnings.push('La fecha de validación por la Asamblea no es válida ("' + asm[1] + '"); queda vacía.');
    if (!asambleaTexto && !fAsm) warnings.push('La validación por la Asamblea no aparece en el PEA; queda vacía.');
    if (!esW) {
      warnings.push('La dirección y el representante legal no se leen del PEA escaneado: complétalos a mano.');
      warnings.push('La pregunta sobre apoyo para elaborar el PEA no se lee desde el texto (las casillas no se ven): revísala a mano.');
      warnings.push('El organismo colaborador no aparece con nombre en el PEA (sólo se marcan opciones); queda vacío.');
    }

    /* proyectos: presupuesto del consolidado (5 montos en orden), fuentes y plazo */
    var proyectos = [], items = [];
    bloques.forEach(function (bl, j) {
      var pfx = 'Proyecto ' + (j + 1) + ': ';
      var nombreP = nombreProyectoEn(bl.t, bl.f);
      if (!nombreP) warnings.push(pfx + 'sin nombre de proyecto.');
      var inicio = fechaDeRotulo(bl.t, bl.f, /fecha\s+de\s+inicio/, pfx + 'fecha de inicio', warnings);
      var termino = fechaDeRotulo(bl.t, bl.f, /fecha\s+de\s+termino/, pfx + 'fecha de término', warnings);
      var budget = { rrhh: null, operacion: null, inversion: null, administracion: null }, total = null, montos = null;
      var iCons = buscar(bl.f, /consolidado\s+de\s+costos/, 0);
      if (!iCons) {
        warnings.push(pfx + 'no tiene consolidado de costos; presupuesto vacío.');
      } else {
        var fCons = buscar(bl.f, /tabla\s*\d|a\s+continuacion|personal\s+o\s+servicio/, iCons.e);
        montos = montosEn(bl.t.slice(iCons.e, fCons ? fCons.i : bl.t.length));
        if (montos.length !== 5) {
          warnings.push(pfx + 'el consolidado de costos no trae los 5 montos en orden (RRHH, inversión, operacional, administración y total); se encontraron ' + montos.length + '. Queda vacío.');
          montos = null;
        } else {
          budget.rrhh = montos[0]; budget.inversion = montos[1]; budget.operacion = montos[2]; budget.administracion = montos[3]; total = montos[4];
          var suma = montos[0] + montos[1] + montos[2] + montos[3];
          if (suma !== total) warnings.push(pfx + 'el consolidado no cuadra: la suma de cuentas es $' + fmt(suma) + ' y el total declarado $' + fmt(total) + '.');
        }
      }
      var fuentes = fuentesEn(bl.t, bl.f, pfx, warnings);
      if (!esW) warnings.push(pfx + 'El presupuesto y la carta Gantt de este PEA escaneado no se leyeron: cárgalos a mano o sube el Word del PEA.' + (montos ? ' Los totales del consolidado sí se leyeron; las líneas de detalle (tablas 2 a 4) y la carta Gantt no.' : ''));
      var proy = {
        name: nombreP, code: null, start: inicio, end: termino, budgetApproved: budget, presupuestoTotal: total, budgetLines: [],
        gantt: { stages: [] }, peaDatos: [], fuentes: fuentes, source: base + 'proyecto ' + (j + 1)
      };
      proy.peaDatos = filasDeProyecto(proy);
      proyectos.push(proy);
      items.push({ pfx: pfx, budget: budget, presentes: montos !== null });
    });

    /* administración: el monto de los consolidados va al proyecto automático; la tabla de antecedentes sólo es respaldo */
    var mAdm = /total\s+de\s+gastos\s+administrativos\s*:\s*(\$?\s*\d[\d.]*)/.exec(F);
    var autoAdm = cierreAdmin(items, mAdm ? montoAl(mAdm[1]) : null, base, warnings);
    if (autoAdm) proyectos.push(autoAdm);
    avisoSaldo(recibido, saldo, proyectos, warnings);
    return { community: comunidad, projects: proyectos, warnings: warnings, origen: esW ? 'word' : 'escaneado' };
  };

  /* Avisos con la página donde está lo que el texto no conserva: la carta Gantt y las tablas 2 a 4 del presupuesto.
   * pageTexts = [{ number, text }] de la lectura por página. Solo señala páginas: no inventa valores. */
  function paginasPorRevisar(pageTexts) {
    var paginas = (pageTexts || []).filter(function (p) { return p && p.text; })
      .sort(function (a, b) { return a.number - b.number; });
    var avisos = [];
    var rango = function (a, b) { return a === b ? 'página ' + a : 'páginas ' + a + ' a ' + b; };
    var gantt = paginas.filter(function (p) { return /CARTA\s+GANTT/i.test(p.text); });
    if (gantt.length) {
      var inicio = gantt[0].number;
      var cierre = paginas.filter(function (p) { return p.number > inicio && /CONSOLIDADO\s+DE\s+COSTOS/i.test(p.text); });
      if (cierre.length) avisos.push('Carta Gantt: ' + rango(inicio, cierre[0].number - 1) + ' del PDF. Es una tabla de actividades por mes con marcas (X): el texto del OCR no conserva las celdas, así que no se leyó. Revísala en el PDF o cárgala a mano.');
      else avisos.push('Carta Gantt: empieza en la página ' + inicio + ' del PDF y puede seguir en las páginas siguientes. El texto del OCR no conserva las celdas, así que no se leyó. Revísala en el PDF o cárgala a mano.');
    }
    var tablas = [];
    [2, 3, 4].forEach(function (n) {
      var re = new RegExp('^\\s*TABLA\\s*' + n + '\\b', 'im');
      var hit = paginas.filter(function (p) { return re.test(p.text); });
      if (hit.length) tablas.push('tabla ' + n + ' en la página ' + hit[0].number);
    });
    if (tablas.length) avisos.push('Detalle del presupuesto: ' + tablas.join('; ') + ' del PDF. El OCR devuelve las celdas sueltas, así que las líneas no se leyeron. Revisa esas páginas y las siguientes o cárgalas a mano.');
    return avisos;
  }

  /* res = { raw_text, pageTexts, ... } de la acción 'ocr' del servicio: se lee el TEXTO; las posiciones (pages_layout) no se usan */
  P.extractFromOcr = function (res) {
    var model = P.extractFromText(String((res && res.raw_text) || ''), { origen: 'escaneado' });
    model.warnings = (model.warnings || []).concat(paginasPorRevisar(res && res.pageTexts));
    return model;
  };

  /* lee un .docx (ArrayBuffer o Uint8Array) y devuelve el modelo del PEA */
  P.extractFromDocxBytes = function (buffer) {
    if (!RF.read || !RF.read.readDocx) {
      return Promise.reject(new Error('Falta el lector de Word (js/23-read-docx.js).'));
    }
    return RF.read.readDocx(buffer).then(function (structure) {
      return P.extractFromStructure(structure);
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
