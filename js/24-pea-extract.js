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
    var m = /^(\d{1,2}) DE ([A-Z]+) DE (\d{4})$/.exec(t);
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
    var adminAnyRow = false, adminSum = 0, adminNull = false;

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

      /* administración: no se reparte entre proyectos, va al proyecto automático */
      if (presentes.administracion) {
        adminAnyRow = true;
        if (budget.administracion === null) adminNull = true;
        else adminSum += budget.administracion;
        if (budget.administracion) {
          warnings.push(pfx + 'los gastos de administración ($' + fmt(budget.administracion) + ') no se reparten entre proyectos; van a "Gastos de administración".');
        }
        budget.administracion = budget.administracion === null ? null : 0;
      }

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
    if (adminAnyRow || antTotal !== null) {
      var monto = adminAnyRow ? (adminNull ? null : adminSum) : antTotal;
      if (!adminAnyRow) {
        warnings.push('Los consolidados no separan gastos de administración; el proyecto "Gastos de administración" toma el total de la tabla de antecedentes ($' + fmt(antTotal) + '). Verificar.');
      } else if (antTotal !== null && monto !== null && antTotal !== monto) {
        warnings.push('La tabla de antecedentes indica gastos administrativos totales por $' + fmt(antTotal) + ', pero los consolidados suman $' + fmt(monto) + '; se usó el consolidado. Verificar cuál corresponde.');
      }
      projects.push({
        name: 'Gastos de administración',
        code: null,
        start: null,
        end: null,
        budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: monto },
        budgetLines: [],
        gantt: { stages: [] },
        peaDatos: [],
        fuentes: { aia30: null, aia70: null, otras: null },
        source: adminAnyRow ? 'PEA: consolidados de costos' : 'PEA: tabla de antecedentes'
      });
    } else {
      warnings.push('El documento no separa gastos de administración (ni en los consolidados ni en la tabla de antecedentes).');
    }

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

  /* ---------- PEA escaneado (PDF leído por OCR): renglones por posición, etiquetas y valores ----------
   * Mismo modelo de salida que extractFromStructure. Lo que no se lee con certeza queda vacío y se anota en warnings.
   * Esta versión NO lee presupuestos ni carta Gantt del escaneado: quedan a mano (se avisa por proyecto). */

  /* etiquetas del formulario: «f» es la forma comparable (sin tildes ni mayúsculas) */
  var OCR_LABELS = [
    { key: 'comunidad', name: 'Nombre de comunidad', f: 'nombre de comunidad' },
    { key: 'rutComunidad', name: 'Rut de la comunidad', f: 'rut de la comunidad' },
    { key: 'encargado', name: 'Nombre Encargado Convenio', f: 'nombre encargado convenio' },
    { key: 'telefono', name: 'Teléfono de contacto', f: 'telefono de contacto' },
    { key: 'correo', name: 'Correo electrónico del Encargado Convenio', f: 'correo electronico del encargado convenio' },
    { key: 'fechaEntrega', name: 'Fecha de entrega del Proyecto', f: 'fecha de entrega del proyecto' },
    { key: 'apoyo', name: 'Indicar si recibió apoyo', f: 'indicar si recibio apoyo' },
    { key: 'asamblea', name: 'Validados por la Asamblea', f: 'validados por la asamblea' },
    { key: 'nombreProyecto', name: 'Nombre del proyecto', f: 'nombre del proyecto' },
    { key: 'objGeneral', name: 'Objetivo general', f: 'objetivo general' },
    { key: 'objEspecificos', name: 'Objetivos específicos', f: 'objetivos especificos' },
    { key: 'inicio', name: 'Fecha de inicio', f: 'fecha de inicio' },
    { key: 'termino', name: 'Fecha de término', f: 'fecha de termino' },
    { key: 'presupuesto', name: 'Presupuesto total del Proyecto', f: 'presupuesto total' },
    { key: 'financiamiento', name: 'Tipo de financiamiento', f: 'tipo de financiamiento' },
    { key: 'beneficiarios', name: 'Beneficiarios', f: 'beneficiarios' },
    { key: 'otros', name: 'Otros antecedentes', f: 'otros antecedentes' }
  ];
  var OCR_TOL_ROW = 0.012, OCR_TOL_COL = 0.05;

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
  function normAngle(a) {
    var n = Math.round((Number(a) || 0) / 90) * 90;
    return ((n % 360) + 360) % 360;
  }
  /* coordenadas normalizadas de la página tal como está escrita -> coordenadas de lectura (página derecha) */
  function uprightPoint(x, y, angle) {
    if (angle === 90) return [y, 1 - x];
    if (angle === 180) return [1 - x, 1 - y];
    if (angle === 270) return [1 - y, x];
    return [x, y];
  }
  function uprightBox(b, angle) {
    var pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(function (p) { return uprightPoint(p[0], p[1], angle); });
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    return { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
  }
  function makeLine(items, page, y) {
    var text = '';
    items.forEach(function (it, k) { if (k) text += ' '; it.start = text.length; text += it.text; it.end = text.length; });
    return { page: page, y: y, items: items, text: text, x0: items.length ? Math.min.apply(null, items.map(function (it) { return it.x0; })) : 0 };
  }
  /* párrafos -> renglones: se agrupan por el centro vertical (tolerancia OCR_TOL_ROW) y van de izquierda a derecha */
  function ocrLines(pages) {
    var out = [];
    pages.forEach(function (pg, pi) {
      var angle = normAngle(pg && pg.angle), items = [];
      ((pg && pg.paragraphs) || []).forEach(function (p) {
        var t = clean(p && p.text);
        if (!t) return;
        var b = p.box ? uprightBox(p.box, angle) : { x0: 0, y0: 0, x1: 0, y1: 0 };
        items.push({ text: t, x0: b.x0, x1: b.x1, cy: (b.y0 + b.y1) / 2 });
      });
      items.sort(function (a, b) { return a.cy - b.cy || a.x0 - b.x0; });
      var rows = [];
      items.forEach(function (it) {
        var row = rows[rows.length - 1];
        if (row && Math.abs(it.cy - row.cy) <= OCR_TOL_ROW) row.items.push(it);
        else rows.push({ cy: it.cy, items: [it] });
      });
      rows.forEach(function (row) {
        out.push(makeLine(row.items.sort(function (a, b) { return a.x0 - b.x0; }), pi + 1, row.cy));
      });
    });
    return out;
  }
  function itemAt(line, idx) {
    var its = line.items, i;
    for (i = 0; i < its.length; i++) if (idx >= its[i].start && idx < its[i].end) return its[i];
    for (i = 0; i < its.length; i++) if (its[i].start >= idx) return its[i];
    return its[its.length - 1] || null;
  }
  /* etiquetas que empiezan un párrafo, el renglón o una frase («1. Nombre de comunidad») */
  function labelHits(line) {
    var f = foldKeep(line.text), hits = [];
    OCR_LABELS.forEach(function (def) {
      var from = 0, idx;
      while ((idx = f.indexOf(def.f, from)) >= 0) {
        var inicioOk = idx === 0 || /[\d.):;|*\-–—•]\s*$/.test(f.slice(0, idx)) || line.items.some(function (it) { return it.start === idx; });
        if (inicioOk) hits.push({ def: def, start: idx, end: idx + def.f.length });
        from = idx + def.f.length;
      }
    });
    return hits.sort(function (a, b) { return a.start - b.start; });
  }
  /* pares etiqueta-valor: el valor es el texto a la derecha en el mismo renglón, más los renglones siguientes
   * que no empiecen por otra etiqueta y caigan en la misma columna (la x de la etiqueta o del valor). Se corta al primer renglón que no cumple. */
  function collectPairs(lines, conPosiciones) {
    var pairs = [];
    lines.forEach(function (line, i) {
      var hits = labelHits(line);
      hits.forEach(function (h, hi) {
        var segEnd = hi + 1 < hits.length ? hits[hi + 1].start : line.text.length;
        /* lo que sigue a la etiqueta dentro de su misma celda («($), impuestos incluidos.») es parte de la etiqueta
         * cuando el valor viene en otra celda; sólo es valor si va con «:» o si no hay otra celda a la derecha */
        var itEnd = itemAt(line, h.end - 1), cutAt = h.end;
        if (itEnd) {
          var finCelda = Math.min(itEnd.end, segEnd);
          var restoCelda = line.text.slice(h.end, finCelda);
          if (restoCelda.trim() !== '' && !/^\s*:/.test(restoCelda) && line.text.slice(finCelda, segEnd).trim() !== '') cutAt = finCelda;
        }
        var seg = line.text.slice(cutAt, segEnd);
        var lead = seg.length - seg.replace(/^[\s:.\-–—|()$]+/, '').length;
        var same = seg.slice(lead).replace(/\s+$/, '');
        var itVal = same ? itemAt(line, cutAt + lead) : null;
        var colX = itVal ? itVal.x0 : (itemAt(line, h.start) || { x0: 0 }).x0;
        var vals = same ? [same] : [];
        if (conPosiciones && hi === hits.length - 1) {
          var j = i + 1;
          while (j < lines.length && labelHits(lines[j]).length === 0 && Math.abs(lines[j].x0 - colX) <= OCR_TOL_COL) { vals.push(lines[j].text); j++; }
        }
        pairs.push({ key: h.def.key, name: h.def.name, vals: vals, line: i });
      });
    });
    return pairs;
  }
  function valsOf(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i].key === key && list[i].vals.join('').trim()) return list[i].vals;
    return [];
  }
  function valOf(list, key) { return valsOf(list, key).join(' ').replace(/\s+/g, ' ').trim(); }
  function rowsOf(list) { return list.map(function (p) { return { k: p.name, v: p.vals.join(' ').replace(/\s+/g, ' ').trim() }; }); }
  function avisosVacios(list, pfx, warnings) {
    list.forEach(function (p) { if (!p.vals.join('').trim()) warnings.push(pfx + 'la etiqueta «' + p.name + '» no tiene valor; queda vacía.'); });
  }
  function ocrRut(raw, warnings) {
    var t = clean(raw).replace(/^N\s*[°º.o]?\s*(?=\d)/i, '');
    if (!t) return null;
    var m = /(\d{1,3}(?:[.\s]\d{3})+|\d{5,9})\s*-\s*([\dkK])/.exec(t);
    if (m) return m[1].replace(/\s+/g, '.') + '-' + m[2].toUpperCase();
    warnings.push('El RUT de la comunidad no tiene la forma número-dígito ("' + t + '"); revísalo.');
    return t;
  }
  /* fecha dd-mm-aaaa (también dd-m-aaaa) o escrita; se convierte a AAAA-MM-DD */
  function fechaOcr(raw, what, warnings) {
    var t = clean(raw);
    if (!t) { warnings.push(what + ' no aparece en el PEA escaneado; queda vacía.'); return null; }
    var m = /(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{4})/.exec(t);
    var f = m ? P.parseFecha(m[1] + '-' + m[2] + '-' + m[3]) : P.parseFecha(t);
    if (!f) { warnings.push(what + ' no es una fecha válida ("' + t + '"); queda vacía.'); return null; }
    if (f.precision === 'mes') warnings.push(what + ' sólo tiene mes y año ("' + t + '"); se usó el día 1.');
    return f.iso;
  }
  /* «Sra. Ana Pérez», «Secretaria Juana Díaz Rut: 9.999.999-9» (en la misma línea o en la anterior) */
  function contactoOcr(vals, warnings) {
    var ls = vals.map(clean).filter(function (l) { return l !== ''; });
    var esSec = function (l) { return /secretar/i.test(foldKeep(l)); };
    var esRut = function (l) { return /^RUT\b/i.test(l); };
    var sinTitulo = function (l) { return clean(l.replace(/^(Sr\.?|Sra\.?|Srta\.?)\s+/i, '')); };
    var secIdx = -1, usado = -1, sec = null;
    ls.forEach(function (l, i) { if (secIdx < 0 && esSec(l)) secIdx = i; });
    var rutM = /RUT\s*:?\s*([\d.\s]+-\s*[\dkK])/i.exec(ls.join(' '));
    if (secIdx >= 0 && rutM) {
      var nombre = sinTitulo(ls[secIdx].replace(/secretar[ií]a/i, '').replace(/RUT\s*:?.*$/i, '').replace(/^[\s,:;.\-–—]+|[\s,:;.\-–—]+$/g, ''));
      if (!nombre && secIdx > 0 && !esRut(ls[secIdx - 1])) { nombre = sinTitulo(ls[secIdx - 1]); usado = secIdx - 1; }
      sec = { nombre: nombre || null, rut: rutM[1].replace(/\s+/g, '') };
      if (!sec.nombre) warnings.push('La secretaria aparece en el PEA escaneado con RUT, pero sin nombre claro; queda sin nombre.');
    }
    var cands = [];
    ls.forEach(function (l, i) {
      if (i === secIdx || i === usado || esRut(l)) return;
      var b = sinTitulo(l.replace(/RUT\s*:?.*$/i, ''));
      if (b) cands.push(b);
    });
    return { encargado: cands[0] || null, secretaria: sec };
  }
  /* teléfonos: los números de 8 a 11 dígitos que aparezcan (los RUT se quitan antes) */
  function telefonosOcr(partes) {
    var out = [];
    (Array.isArray(partes) ? partes : [partes]).forEach(function (parte) {
      String(parte || '').replace(/RUT\s*:?\s*[\d.\s]+-\s*[\dkK]/gi, ' ').split(/[\/;,|]+/).forEach(function (t) {
        (t.match(/\+?\d[\d\s.()\-]{6,}\d/g) || []).forEach(function (c) {
          var d = c.replace(/\D/g, '');
          if (d.length < 8 || d.length > 11) return;
          var v = clean(c);
          if (out.indexOf(v) < 0) out.push(v);
        });
      });
    });
    return out;
  }
  function correosOcr(text) {
    var out = [];
    (String(text || '').match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || []).forEach(function (c) {
      if (out.indexOf(c) < 0) out.push(c);
    });
    return out;
  }
  /* monto tras «=», «:» o «$» en el mismo renglón; si no lo hay, un «$» al inicio del renglón siguiente */
  function montoTras(rest, next) {
    var m = /[=:]\s*\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?!\d)/.exec(rest) || /\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?!\d)/.exec(rest);
    if (!m && next) m = /^\s*\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?!\d)/.exec(next);
    return m ? parseInt(m[1].replace(/\./g, ''), 10) : null;
  }
  /* fuentes de financiamiento de un proyecto: «con cargo al 30% del AIA = X», «70%», «otras fuentes» */
  function fuentesOcr(texts, pfx, warnings) {
    var out = { aia30: null, aia70: null, otras: null };
    texts.forEach(function (t, k) {
      var f = foldKeep(t), m = /(30|70)\s*%\s*del\s*aia/.exec(f);
      if (m) {
        var clave = m[1] === '30' ? 'aia30' : 'aia70';
        var monto = montoTras(t.slice(m.index + m[0].length), texts[k + 1]);
        if (monto === null) warnings.push(pfx + 'no se pudo leer el monto con cargo al ' + m[1] + '% del AIA ("' + clean(t) + '"); queda vacío.');
        else if (out[clave] === null) out[clave] = monto;
        return;
      }
      var mo = /otras\s+fuentes/.exec(f);
      if (mo) {
        var rest = t.slice(mo.index + mo[0].length);
        if (/N\/A|NO APLICA/i.test(rest)) return;
        var v = montoTras(rest, texts[k + 1]);
        if (v === null) warnings.push(pfx + 'no se pudo leer el monto de otras fuentes ("' + clean(t) + '"); queda vacío.');
        else if (out.otras === null) out.otras = v;
      }
    });
    return out;
  }
  function modeloVacio(msg) {
    return {
      community: { name: null, rut: null, address: null, legalRep: null, oc: null,
        contacto: { encargado: null, secretaria: null, telefonos: [], correos: [] },
        fechaEntrega: null, asambleaValidacion: null, apoyo: null, peaDatos: [] },
      projects: [], warnings: [msg]
    };
  }

  /* res = { raw_text, pages_layout (o pages), ... } de la acción 'ocr' del servicio */
  P.extractFromOcr = function (res) {
    var warnings = [];
    var pagesIn = res && Array.isArray(res.pages_layout) && res.pages_layout.length ? res.pages_layout : (res && res.pages) || [];
    var rawText = String((res && res.raw_text) || '');
    var lines = Array.isArray(pagesIn) ? ocrLines(pagesIn) : [];
    var conPosiciones = true;
    if (!lines.length && clean(rawText)) {
      lines = rawText.split(/\n+/).map(clean).filter(function (t) { return t !== ''; })
        .map(function (t, i) { return makeLine([{ text: t, x0: 0, x1: 0, cy: i }], 1, i); });
      conPosiciones = false;
      warnings.push('El OCR no devolvió posiciones de texto; se leyó renglón por renglón y los valores de varias líneas pueden quedar incompletos.');
    }
    if (!lines.length) return modeloVacio('El OCR no devolvió texto legible: revisa que el PDF sea de buena calidad.');

    var pairs = collectPairs(lines, conPosiciones);
    var projIdx = [];
    pairs.forEach(function (p, i) { if (p.key === 'nombreProyecto') projIdx.push(i); });
    var comPairs = projIdx.length ? pairs.slice(0, projIdx[0]) : pairs;
    if (!projIdx.length) warnings.push('El PEA escaneado no trae proyectos reconocibles («Nombre del proyecto»).');

    /* comunidad */
    var nombre = valOf(comPairs, 'comunidad');
    var enc = contactoOcr(valsOf(comPairs, 'encargado'), warnings);
    var community = {
      name: nombre || null,
      rut: ocrRut(valOf(comPairs, 'rutComunidad'), warnings),
      address: null, legalRep: null, oc: null,
      contacto: {
        encargado: enc.encargado,
        secretaria: enc.secretaria,
        telefonos: telefonosOcr(valsOf(comPairs, 'telefono')),
        correos: correosOcr(valOf(comPairs, 'correo'))
      },
      fechaEntrega: fechaOcr(valOf(comPairs, 'fechaEntrega'), 'La fecha de entrega del proyecto a CORFO', warnings),
      asambleaValidacion: fechaOcr(valOf(comPairs, 'asamblea'), 'La fecha de validación por la Asamblea', warnings),
      apoyo: valOf(comPairs, 'apoyo') || null,
      peaDatos: rowsOf(comPairs)
    };
    avisosVacios(comPairs, '', warnings);
    if (!community.name) warnings.push('No se encontró el nombre de la comunidad.');
    if (!community.rut) warnings.push('No se encontró el RUT de la comunidad.');
    if (!enc.encargado) warnings.push('El encargado del convenio no aparece en el PEA escaneado.');
    if (!community.apoyo) warnings.push('La pregunta sobre apoyo para elaborar el PEA no tiene respuesta en el PEA.');
    warnings.push('La dirección y el representante legal no se leen del PEA escaneado: complétalos a mano.');
    warnings.push('El organismo colaborador no aparece con nombre en el PEA (sólo se marcan opciones); queda vacío.');

    /* proyectos: cada «Nombre del proyecto» abre uno; sus pares forman peaDatos */
    var projects = projIdx.map(function (pi, k) {
      var fin = k + 1 < projIdx.length ? projIdx[k + 1] : pairs.length;
      var sec = pairs.slice(pi, fin);
      var lineTo = k + 1 < projIdx.length ? pairs[projIdx[k + 1]].line : lines.length;
      var texts = lines.slice(pairs[pi].line, lineTo).map(function (l) { return l.text; });
      var pfx = 'Proyecto ' + (k + 1) + ': ';
      var nombreP = valOf(sec, 'nombreProyecto');
      if (!nombreP) warnings.push(pfx + 'sin nombre de proyecto.');
      var start = fechaOcr(valOf(sec, 'inicio'), pfx + 'fecha de inicio', warnings);
      var end = fechaOcr(valOf(sec, 'termino'), pfx + 'fecha de término', warnings);
      avisosVacios(sec, pfx, warnings);
      warnings.push(pfx + 'El presupuesto y la carta Gantt de este PEA escaneado no se leyeron: cárgalos a mano o sube el Word del PEA.');
      return {
        name: nombreP || null,
        code: null,
        start: start,
        end: end,
        budgetApproved: { rrhh: 0, operacion: 0, inversion: 0, administracion: 0 },
        budgetLines: [],
        gantt: { stages: [] },
        peaDatos: rowsOf(sec),
        fuentes: fuentesOcr(texts, pfx, warnings),
        source: 'PEA escaneado: proyecto ' + (k + 1)
      };
    });

    /* gastos de administración: no se toman solos; se avisa como en el Word */
    if (/gastos de administracion/.test(foldKeep(lines.map(function (l) { return l.text; }).join(' ')))) {
      warnings.push('El PEA escaneado menciona gastos de administración; no se toman automáticamente: revísalos a mano.');
    }
    return { community: community, projects: projects, warnings: warnings };
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
