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
    var community = {
      name: rr,
      rut: rut ? rut.replace(/^N[°º]\s*/i, '') : null,
      address: valueOf(findRowAnywhere(tables, /DIRECCION/)),
      legalRep: valueOf(findRowAnywhere(tables, /REPRESENTANTE LEGAL/)),
      oc: null
    };
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
      var code = codigosOk ? codes[k] : null;
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
