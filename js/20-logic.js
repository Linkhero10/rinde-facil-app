/* Rinde Fácil — reglas y cuadre entre trámites. Sin DOM: se prueba en Node. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, D = RF.data, R = D.REGLAS;

  function num(v) { return U.parseCLP(v); }

  /* Monto que corresponde rendir según la situación de IVA de la comunidad (Manual p.7) */
  function expectedMontoRendir(exp, community) {
    var dt = D.DOC_BY_ID[exp.docType] || {};
    var base = num(exp.total);
    if (dt.iva && community && community.ivaModo === 'recupera' && num(exp.neto) > 0) base = num(exp.neto);
    var pct = exp.pctUso === '' || exp.pctUso == null ? 100 : Number(exp.pctUso);
    if (isFinite(pct) && pct > 0 && pct < 100) base = Math.round(base * pct / 100);
    return base;
  }

  /* Respaldos que ya se dan por cumplidos porque existe el anexo o las cotizaciones en la app */
  function cotizacionOk(c) {
    var names = {};
    (c.cots || []).forEach(function (x) { if (String(x.proveedor || '').trim() && num(x.monto) > 0) names[String(x.proveedor).trim().toLowerCase()] = true; });
    return Object.keys(names).length >= R.COTIZACIONES_MIN;
  }
  function effectiveHas(exp, project) {
    var has = Object.assign({}, exp.has || {});
    var f = (project && project.forms) || {};
    if (Array.isArray(f.anexo3) && f.anexo3.some(function (x) { return x.data && x.data.gastoId === exp.id; })) has.anexo3 = true;
    if (f.anexo5 && f.anexo5.data && exp.folio) {
      var rows = (f.anexo5.data.uso || []).concat(f.anexo5.data.hh || []);
      if (rows.some(function (r) { return String(r.doc || '').trim() === String(exp.folio).trim(); })) has.anexo5 = true;
    }
    ((project && project.cotizaciones) || []).forEach(function (c) {
      if (c.gastoId !== exp.id) return;
      if (cotizacionOk(c)) has.cotizaciones = true;
      if (c.autorizacion) has.autorizacion = true;
    });
    return has;
  }

  /* Lista de respaldos que pide el Manual para este gasto, con lo que ya marcaste */
  function requirements(exp, project, community) {
    var dt = D.DOC_BY_ID[exp.docType] || {};
    var has = effectiveHas(exp, project);
    var out = [];
    function need(key, why) { out.push({ key: key, label: D.RESPALDOS[key], why: why || '', met: !!has[key] }); }
    var pagoImplicito = dt.pagoImplicito && exp.formaPago !== 'efectivo';
    if (!pagoImplicito) need('pago', 'Todos los gastos deben estar pagados y demostrarlo (Manual p. 14).');
    (dt.extras || []).forEach(function (k) { need(k, 'Lo pide el Manual para este tipo de documento.'); });
    if (exp.formaPago === 'efectivo') need('anexo3', 'Pago en efectivo: declaración jurada simple (Manual p. 14).');
    if (exp.esViatico || exp.docType === 'certificado_viatico') need('anexo4', 'Los viáticos se acreditan con el certificado (Manual p. 15).');
    var netoN = num(exp.neto);
    if (netoN > R.COTIZACION_UMBRAL && !exp.servicioTecnico) {
      if (!has.autorizacion) need('cotizaciones', 'Sobre $10.000.000 netos se piden 2 cotizaciones (Manual p. 8).');
    }
    if (community && community.ivaModo === 'no_usa' && dt.iva) need('anexo1', 'No usas el IVA: declaración del Anexo 1 y Formularios 29 (Manual p. 7).');
    if (exp.cuenta === 'administracion' && exp.pctUso !== '' && exp.pctUso != null && Number(exp.pctUso) < 100) need('anexo5', 'Gasto compartido: memoria de cálculo (Manual p. 20).');
    if (exp.cuenta === 'inversion' && exp.esInmueble) { need('tasaciones', 'Inmuebles y derechos de agua: 2 tasaciones (Manual p. 19).'); need('gravamenes', 'Deben estar libres de gravámenes (Manual p. 19).'); }
    return out;
  }

  /* ---------- validación de un gasto ---------- */
  function evaluateExpense(exp, project, community, allExpenses) {
    var issues = [];
    function add(level, id, msg, field) { issues.push({ level: level, id: id, msg: msg, field: field || null, expenseId: exp.id }); }
    var dt = D.DOC_BY_ID[exp.docType] || {};
    var glosa = String(exp.glosa || '');

    if (!exp.cuenta) add('error', 'sin_cuenta', 'Elige la cuenta del gasto.', 'cuenta');
    if (!exp.docType) add('error', 'sin_tipo', 'Elige el tipo de documento.', 'docType');
    if (!String(exp.folio || '').trim() && exp.docType !== 'certificado_viatico') {
      if (exp.docType === 'voucher') add('warn', 'sin_folio', 'Un voucher no trae número de boleta del SII. Puedes anotar el N° de comprobante que trae impreso o dejarlo vacío.', 'folio');
      else add('error', 'sin_folio', 'Falta el número del documento.', 'folio');
    }
    if (!exp.fecha) add('error', 'sin_fecha', 'Falta la fecha del documento.', 'fecha');
    if (!String(exp.proveedor || '').trim()) add('error', 'sin_proveedor', 'Falta el nombre del proveedor.', 'proveedor');
    if (exp.docType !== 'invoice') {
      if (!String(exp.rutProveedor || '').trim()) add('error', 'sin_rut', 'Falta el RUT del proveedor.', 'rutProveedor');
      else if (!U.rutValid(exp.rutProveedor)) add('error', 'rut_invalido', 'El RUT del proveedor no es válido. Compáralo con el documento.', 'rutProveedor');
    }
    if (!(num(exp.total) > 0)) add('error', 'sin_total', 'Falta el monto total.', 'total');

    /* aritmética */
    var neto = num(exp.neto), iva = num(exp.iva), total = num(exp.total);
    if (dt.iva && neto > 0 && total > 0) {
      var diff = Math.abs(neto + iva - total);
      if (diff > R.TOLERANCIA_IVA) add('error', 'aritmetica', 'Neto + IVA no suma el total (hay ' + U.fmtCLP(diff) + ' de diferencia).', 'total');
      else if (iva > 0 && Math.abs(iva - Math.round(neto * R.IVA)) > 2) add('warn', 'iva_raro', 'El IVA no es el 19 % del neto. Revisa las cifras.', 'iva');
    }

    /* monto a rendir */
    var esp = expectedMontoRendir(exp, community);
    var mr = num(exp.montoRendir);
    if (total > 0 && mr > 0 && Math.abs(mr - esp) > R.TOLERANCIA_IVA) {
      if (community && community.ivaModo === 'recupera' && dt.iva && neto > 0 && Math.abs(mr - total) <= R.TOLERANCIA_IVA) add('error', 'rendir_bruto', 'Como recuperas el IVA, debes rendir el valor neto (' + U.fmtCLP(neto) + ').', 'montoRendir');
      else add('warn', 'monto_distinto', 'El monto a rendir (' + U.fmtCLP(mr) + ') no coincide con el que corresponde (' + U.fmtCLP(esp) + ').', 'montoRendir');
    }
    if (total > 0 && !(mr > 0)) add('error', 'sin_rendir', 'Falta el monto a rendir.', 'montoRendir');

    /* glosa */
    if (!glosa.trim()) add('error', 'sin_glosa', 'Escribe la glosa: qué compraste y para qué.', 'glosa');
    else if (glosa.length > R.GLOSA_MAX) add('error', 'glosa_larga', 'La glosa pasa de ' + R.GLOSA_MAX + ' caracteres (tiene ' + glosa.length + ').', 'glosa');
    else if (glosa.length >= R.GLOSA_AVISO) add('warn', 'glosa_aviso', 'La glosa está cerca del máximo de ' + R.GLOSA_MAX + ' caracteres.', 'glosa');

    /* fechas */
    if (exp.fecha && project) {
      if (project.start && exp.fecha < project.start) add('error', 'fecha_antes', 'La fecha es anterior al inicio del proyecto.', 'fecha');
      else if (project.end && exp.fecha > project.end) add('error', 'fecha_despues', 'La fecha es posterior al término del proyecto.', 'fecha');
      if (project.periodoInicio && project.periodoFin && (exp.fecha < project.periodoInicio || exp.fecha > project.periodoFin)) add('warn', 'fuera_periodo', 'La fecha está fuera del período que estás rindiendo: iría en otra rendición.', 'fecha');
    }
    if (exp.fecha && exp.fechaPago && exp.fechaPago < exp.fecha && !dt.pagoImplicito) add('warn', 'pago_antes', 'La fecha de pago es anterior a la del documento.', 'fechaPago');

    /* respaldos */
    var reqs = requirements(exp, project, community);
    reqs.forEach(function (r) {
      if (!r.met) {
        var lvl = (r.key === 'anexo3' || r.key === 'anexo4' || r.key === 'anexo1' || r.key === 'cotizaciones' || r.key === 'pago') ? 'error' : 'warn';
        add(lvl, 'falta_' + r.key, 'Falta: ' + r.label + '.', 'has.' + r.key);
      }
    });
    if (neto > R.COTIZACION_UMBRAL && !exp.servicioTecnico && exp.cuenta === 'inversion' && exp.esInmueble) { /* ya cubierto por tasaciones */ }

    /* duplicado */
    if (allExpenses && exp.folio && exp.rutProveedor) {
      var key = U.rutClean(exp.rutProveedor) + '|' + String(exp.folio).trim() + '|' + exp.docType;
      var dup = allExpenses.some(function (o) { return o.id !== exp.id && o.folio && o.rutProveedor && (U.rutClean(o.rutProveedor) + '|' + String(o.folio).trim() + '|' + o.docType) === key; });
      if (dup) add('error', 'duplicado', 'Ya anotaste un documento con el mismo proveedor, tipo y número.', 'folio');
    }

    /* revisión humana obligatoria si vino del OCR */
    if (exp.ocr && exp.ocr.engine && !exp.verified) add('error', 'sin_verificar', 'Compara los datos con la foto y marca «Lo revisé».', 'verified');

    var errs = issues.filter(function (i) { return i.level === 'error'; }).length;
    var warns = issues.filter(function (i) { return i.level === 'warn'; }).length;
    return { issues: issues, requirements: reqs, errors: errs, warns: warns, status: errs ? 'error' : warns ? 'warn' : 'ok' };
  }

  /* ---------- totales ---------- */
  function totalsByCuenta(project) {
    var out = {};
    D.CUENTAS.forEach(function (c) { out[c.id] = { presupuestado: 0, aprobado: num(project.budgetApproved && project.budgetApproved[c.id]), rendido: 0, cantidad: 0 }; });
    (project.budgetLines || []).forEach(function (l) { if (out[l.cuenta]) out[l.cuenta].presupuestado += num(l.monto); });
    (project.expenses || []).forEach(function (e) { if (out[e.cuenta]) { out[e.cuenta].rendido += num(e.montoRendir); out[e.cuenta].cantidad++; } });
    return out;
  }
  function adminByMonth(project) {
    var m = {};
    (project.expenses || []).forEach(function (e) {
      if (e.cuenta !== 'administracion' || !e.fecha) return;
      var k = U.monthKey(e.fecha);
      m[k] = (m[k] || 0) + num(e.montoRendir);
    });
    return m;
  }
  function expensesByActivity(project) {
    var m = {};
    (project.expenses || []).forEach(function (e) { if (e.actId) m[e.actId] = (m[e.actId] || 0) + num(e.montoRendir); });
    return m;
  }
  function budgetByActivity(project) {
    var m = {};
    (project.budgetLines || []).forEach(function (l) { if (l.actId) m[l.actId] = (m[l.actId] || 0) + num(l.monto); });
    return m;
  }

  /* ---------- Gantt ---------- */
  function allActivities(project) {
    var out = [];
    ((project.gantt && project.gantt.stages) || []).forEach(function (s, si) {
      (s.acts || []).forEach(function (a, ai) { out.push({ stage: s, stageIndex: si, act: a, actIndex: ai }); });
    });
    return out;
  }
  function ganttIssues(project) {
    var out = [];
    var acts = allActivities(project);
    if (!acts.length) return out;
    acts.forEach(function (x) {
      var a = x.act, label = (a.name || 'Actividad sin nombre');
      if (!String(a.name || '').trim()) out.push({ level: 'error', msg: 'Hay una actividad sin nombre.' });
      if (!a.start || !a.end) out.push({ level: 'error', msg: '«' + label + '»: faltan fechas de inicio o término.' });
      else if (a.end < a.start) out.push({ level: 'error', msg: '«' + label + '»: el término es anterior al inicio.' });
      else {
        if (project.start && a.start < project.start) out.push({ level: 'warn', msg: '«' + label + '» empieza antes del inicio del proyecto.' });
        if (project.end && a.end > project.end) out.push({ level: 'warn', msg: '«' + label + '» termina después del término del proyecto.' });
      }
    });
    return out;
  }
  function activityDays(a) { var d = U.diffDays(a.start, a.end); return d == null ? null : d + 1; }

  /* ---------- plazos ---------- */
  function peaDeadline(project, todayIso) {
    if (!project.desembolso1) return null;
    var fin = U.addDays(project.desembolso1, R.PEA_DIAS);
    var finProrroga = U.addDays(fin, R.PEA_PRORROGA);
    return { inicio: project.desembolso1, fin: fin, finProrroga: finProrroga, diasRestantes: todayIso ? U.diffDays(todayIso, fin) : null };
  }
  function aclaracionDeadline(recibidaIso, holidays) {
    if (!recibidaIso) return '';
    return U.addBusinessDays(recibidaIso, R.ACLARACION_DIAS_HABILES, holidays);
  }

  /* ---------- avance por trámite / fase ---------- */
  function itemSteps(tid) { var t = RF.tramites.byId[tid]; return t ? t.steps.length : 0; }
  /* ---------- qué trámites le tocan a este proyecto (según «Qué necesitará tu proyecto») ---------- */
  function needsAnswered(p) { return !!(p && p.needsSet); }
  function effectiveNeeds(p, community) {
    var out = {}, sel = (p && p.needs) || {};
    Object.keys(sel).forEach(function (k) { if (sel[k]) out[k] = true; });
    var dv = RF.needs ? RF.needs.derivedFromExpenses(p || {}) : {}; Object.keys(dv).forEach(function (k) { out[k] = true; }); /* lo que ya gastó también cuenta */
    var com = community || (RF.store && RF.store.get && RF.store.get().community) || {};
    if (com.ivaModo === 'no_usa') out.iva_no = true;
    return out;
  }
  function applies(p, tid, community) {
    var map = RF.needs && RF.needs.APPLIES[tid];
    if (!map || !needsAnswered(p)) return true;
    if (p.show && p.show[tid]) return true; /* «me toca igual» */
    var eff = effectiveNeeds(p, community);
    return map.some(function (k) { return !!eff[k]; });
  }
  function itemProgress(project, tid) {
    var n = itemSteps(tid), done = 0;
    if (project && project.na && project.na[tid]) return { done: 0, total: 0, na: true, complete: true };
    if (project && project.needsSet && !applies(project, tid)) return { done: 0, total: 0, na: true, auto: true, complete: true };
    for (var i = 0; i < n; i++) if (project && project.done[tid + ':' + i]) done++;
    return { done: done, total: n, na: false, complete: n > 0 && done === n };
  }
  function progress(project) {
    var porFase = {}, total = 0, done = 0, tramTotal = 0, tramDone = 0, next = null, cur = null;
    D.FASES.forEach(function (f) {
      var d = 0, t = 0, td = 0, tt = 0, started = false, complete = true;
      f.items.forEach(function (tid) {
        var ip = itemProgress(project, tid);
        d += ip.done; t += ip.total;
        if (!ip.na) { tt++; if (ip.complete) td++; }
        if (ip.done > 0 && !ip.na) started = true;
        if (!ip.complete) {
          complete = false;
          if (!next) {
            next = { tramiteId: tid, stepIdx: 0, fase: f.id };
            for (var i = 0; i < ip.total; i++) { if (!(project && project.done[tid + ':' + i])) { next.stepIdx = i; break; } }
          }
        }
      });
      porFase[f.id] = { done: d, total: t, tramDone: td, tramTotal: tt, started: started, complete: complete };
      total += t; done += d; tramTotal += tt; tramDone += td;
      if (!cur && !complete) cur = f.id;
    });
    return { porFase: porFase, done: done, total: total, tramDone: tramDone, tramTotal: tramTotal, next: next, faseActual: cur || 'F6', pct: total ? Math.round(done * 100 / total) : 0 };
  }
  function skippedPhases(project) {
    var prog = progress(project), out = [];
    var order = D.FASES.map(function (f) { return f.id; });
    order.forEach(function (fid, i) {
      if (i === 0 || !prog.porFase[fid].started) return;
      /* si esta fase ya empezó pero la anterior (o anteriores no opcionales) no tiene nada marcado */
      for (var j = 0; j < i; j++) {
        var pf = prog.porFase[order[j]];
        if (order[j] === 'F1') continue; /* fase 1 son pasos del proceso, no trámites */
        if (!pf.started && !pf.complete) { out.push({ fase: fid, falta: order[j] }); break; }
      }
    });
    return out;
  }

  /* ---------- cuadre entre trámites ---------- */
  function forms(project, id) { return (project.forms && project.forms[id]) || null; }
  function formList(project, id) { var f = forms(project, id); return Array.isArray(f) ? f : []; }

  function reconcile(project, community, todayIso, holidays) {
    var groups = [];
    function grp(id, title) { var g = { id: id, title: title, items: [] }; groups.push(g); return g; }
    function add(g, level, msg, fix) { g.items.push({ level: level, msg: msg, fix: fix || null }); }
    var today = todayIso || U.todayISO();
    var expenses = project.expenses || [];
    var t = totalsByCuenta(project);

    /* 1. Proyecto */
    var g1 = grp('proyecto', 'Datos del proyecto');
    if (!String(project.name || '').trim() || project.name === 'Mi proyecto') add(g1, 'warn', 'Ponle nombre a tu proyecto.', { tool: 'proyecto' });
    if (!project.code) add(g1, 'info', 'Falta el código del proyecto (lo asigna CORFO).', { tool: 'proyecto' });
    if (!project.start || !project.end) add(g1, 'warn', 'Faltan las fechas de inicio y término del proyecto.', { tool: 'proyecto' });
    else if (project.end < project.start) add(g1, 'error', 'El término del proyecto es anterior al inicio.', { tool: 'proyecto' });
    if (!project.periodoInicio || !project.periodoFin) add(g1, 'info', 'Indica el período que estás rindiendo para poder revisar las fechas.', { tool: 'proyecto' });
    if (!g1.items.length) add(g1, 'ok', 'Datos del proyecto completos.');

    /* 1b. Lo que planeó frente a lo que gasta */
    if (needsAnswered(project)) {
      var gp = grp('plan', 'Lo que planeaste'), dv = RF.needs.derivedFromExpenses(project), sel = project.needs || {};
      Object.keys(dv).forEach(function (k) {
        if (sel[k]) return;
        add(gp, 'warn', 'Anotaste gastos de «' + RF.needs.BY_ID[k].name + '» que no marcaste en «Qué necesitará tu proyecto».' + (project.peaAprobado ? ' Tu PEA ya está aprobado: si no estaba en el PEA, conviene pedir el cambio antes de rendirlo.' : ''), { tool: 'necesidades' });
      });
      (project.needsAdded || []).forEach(function (a) {
        var nd = RF.needs.BY_ID[a.id]; add(gp, 'warn', 'Agregaste «' + (nd ? nd.name : a.id) + '» después de aprobado el PEA (' + U.fmtDate(String(a.at).slice(0, 10)) + '). Pide la modificación del PEA y guarda la respuesta de CORFO en «Documentos».', { tool: 'reitem' });
      });
      (project.needsCustom || []).forEach(function (c) {
        if (project.peaAprobado) add(gp, 'warn', 'Agregaste «' + c.name + '», que no estaba en tu PEA aprobado. Conviene pedir la modificación del PEA.', { tool: 'reitem' });
      });
      if (!gp.items.length) add(gp, 'ok', 'Lo que gastas coincide con lo que planeaste.');
    }

    /* 2. Plazos */
    var g2 = grp('plazos', 'Plazos');
    var pd = peaDeadline(project, today);
    var peaHecho = itemProgress(project, 'TRM-027').complete;
    if (pd && !peaHecho) {
      if (pd.diasRestantes < 0 && today <= pd.finProrroga) add(g2, 'warn', 'Pasó el plazo de 90 días del PEA. Solo sirve si pediste la prórroga (hasta ' + U.fmtDate(pd.finProrroga) + ').', { tramite: 'TRM-027' });
      else if (pd.diasRestantes < 0) add(g2, 'error', 'Pasó el plazo del PEA, incluso con prórroga (' + U.fmtDate(pd.finProrroga) + ').', { tramite: 'TRM-027' });
      else if (pd.diasRestantes <= 15) add(g2, 'warn', 'Te quedan ' + pd.diasRestantes + ' días para entregar el PEA (vence el ' + U.fmtDate(pd.fin) + ').', { tramite: 'TRM-027' });
      else add(g2, 'ok', 'PEA: te quedan ' + pd.diasRestantes + ' días (vence el ' + U.fmtDate(pd.fin) + ').');
    } else if (!pd && !peaHecho) add(g2, 'info', 'Anota la fecha del primer pago para calcular el plazo del PEA.', { tool: 'proyecto' });
    (project.observations || []).forEach(function (o) {
      if (o.respondida) return;
      var lim = aclaracionDeadline(o.recibida, holidays || []);
      if (!o.recibida) return;
      var left = U.businessDaysBetween(today, lim, []);
      if (today > lim) add(g2, 'error', 'Venció el plazo para aclarar «' + (o.titulo || 'una observación') + '». Los gastos observados se rechazan.', { tool: 'observaciones' });
      else if (left <= 3) add(g2, 'warn', 'Quedan ' + left + ' días hábiles para aclarar «' + (o.titulo || 'una observación') + '».', { tool: 'observaciones' });
    });
    if (!g2.items.length) add(g2, 'ok', 'Sin plazos urgentes.');

    /* 3. Gantt y presupuesto */
    var g3 = grp('planificacion', 'Carta Gantt y presupuesto');
    var gi = ganttIssues(project);
    gi.forEach(function (i) { add(g3, i.level, i.msg, { tool: 'gantt' }); });
    var acts = allActivities(project);
    if (!acts.length) add(g3, 'info', 'Aún no has armado la Carta Gantt.', { tool: 'gantt' });
    D.CUENTAS.forEach(function (c) {
      var x = t[c.id];
      if (x.aprobado > 0 && x.presupuestado > x.aprobado) add(g3, 'error', c.name + ': tu presupuesto (' + U.fmtCLP(x.presupuestado) + ') supera lo aprobado (' + U.fmtCLP(x.aprobado) + ').', { tool: 'presupuesto' });
      else if (x.aprobado > 0 && x.presupuestado > 0 && Math.abs(x.presupuestado - x.aprobado) > R.TOLERANCIA_IVA) add(g3, 'warn', c.name + ': presupuestaste ' + U.fmtCLP(x.presupuestado) + ' de ' + U.fmtCLP(x.aprobado) + ' aprobados.', { tool: 'presupuesto' });
    });
    var sinAct = (project.budgetLines || []).filter(function (l) { return !l.actId; }).length;
    if (sinAct) add(g3, 'info', sinAct + ' línea(s) de presupuesto sin actividad asociada.', { tool: 'presupuesto' });
    if (!g3.items.length) add(g3, 'ok', 'Carta Gantt y presupuesto sin problemas.');

    /* 4. Gastos */
    var g4 = grp('gastos', 'Gastos rendidos');
    var evals = expenses.map(function (e) { return { e: e, r: evaluateExpense(e, project, community, expenses) }; });
    var bad = evals.filter(function (x) { return x.r.status === 'error'; }).length;
    var warnE = evals.filter(function (x) { return x.r.status === 'warn'; }).length;
    if (!expenses.length) add(g4, 'info', 'Aún no anotas gastos.', { tool: 'gastos' });
    else {
      if (bad) add(g4, 'error', bad + ' gasto(s) con errores que hay que corregir antes de enviar.', { tool: 'gastos', filtro: 'error' });
      if (warnE) add(g4, 'warn', warnE + ' gasto(s) con avisos.', { tool: 'gastos', filtro: 'warn' });
      if (!bad && !warnE) add(g4, 'ok', expenses.length + ' gasto(s) sin problemas.');
    }
    D.CUENTAS.forEach(function (c) {
      var x = t[c.id];
      var tope = x.presupuestado > 0 ? x.presupuestado : x.aprobado;
      if (tope > 0 && x.rendido > tope) add(g4, 'error', c.name + ': rendiste ' + U.fmtCLP(x.rendido) + ' y el presupuesto es ' + U.fmtCLP(tope) + '. No puedes pasarte del presupuesto.', { tool: 'resumen' });
    });
    var am = adminByMonth(project);
    Object.keys(am).sort().forEach(function (mk) { if (am[mk] > R.ADMIN_TOPE_MENSUAL) add(g4, 'error', 'Administración de ' + U.monthLabel(mk) + ': ' + U.fmtCLP(am[mk]) + ' pasa el tope de ' + U.fmtCLP(R.ADMIN_TOPE_MENSUAL) + ' al mes.', { tool: 'gastos' }); });
    var sinActE = expenses.filter(function (e) { return !e.actId; }).length;
    if (acts.length && sinActE) add(g4, 'info', sinActE + ' gasto(s) sin actividad asociada.', { tool: 'gastos' });
    if (!g4.items.length) add(g4, 'ok', 'Gastos al día.');

    /* 5. Anexos que deben calzar con los gastos */
    var g5 = grp('anexos', 'Anexos y documentos');
    var efectivo = expenses.filter(function (e) { return e.formaPago === 'efectivo'; });
    var a3 = formList(project, 'anexo3');
    if (efectivo.length && a3.length < efectivo.length) add(g5, 'error', 'Tienes ' + efectivo.length + ' pago(s) en efectivo y ' + a3.length + ' declaración(es) del Anexo 3.', { tool: 'anexo3' });
    else if (efectivo.length) {
      var s3 = U.sum(a3, function (x) { return num(x.data && x.data.monto); }), e3 = U.sum(efectivo, function (e) { return num(e.total); });
      if (Math.abs(s3 - e3) > R.TOLERANCIA_IVA) add(g5, 'warn', 'Los Anexos 3 suman ' + U.fmtCLP(s3) + ' y los pagos en efectivo suman ' + U.fmtCLP(e3) + '.', { tool: 'anexo3' });
    }
    var viat = expenses.filter(function (e) { return e.esViatico || e.docType === 'certificado_viatico'; });
    var a4 = formList(project, 'anexo4');
    if (viat.length && !a4.length) add(g5, 'error', 'Tienes viáticos y ningún certificado del Anexo 4.', { tool: 'anexo4' });
    else if (viat.length) {
      var s4 = U.sum(a4, function (x) { return num(x.data && x.data.total); }), e4 = U.sum(viat, function (e) { return num(e.montoRendir); });
      if (Math.abs(s4 - e4) > R.TOLERANCIA_IVA) add(g5, 'warn', 'Los certificados de viático suman ' + U.fmtCLP(s4) + ' y los gastos de viático ' + U.fmtCLP(e4) + '.', { tool: 'anexo4' });
    }
    var comp = expenses.filter(function (e) { return e.cuenta === 'administracion' && e.pctUso !== '' && e.pctUso != null && Number(e.pctUso) < 100; });
    if (comp.length) {
      var f5 = forms(project, 'anexo5');
      var s5 = f5 && f5.data ? num(f5.data.totalUso) + num(f5.data.totalHH) : 0;
      var e5 = U.sum(comp, function (e) { return num(e.montoRendir); });
      if (!f5) add(g5, 'error', 'Tienes gastos de administración repartidos y falta la memoria de cálculo (Anexo 5).', { tool: 'anexo5' });
      else if (Math.abs(s5 - e5) > R.TOLERANCIA_IVA) add(g5, 'warn', 'El Anexo 5 suma ' + U.fmtCLP(s5) + ' y los gastos repartidos suman ' + U.fmtCLP(e5) + '.', { tool: 'anexo5' });
    }
    if (community && community.ivaModo === 'no_usa' && expenses.some(function (e) { return (D.DOC_BY_ID[e.docType] || {}).iva; }) && !forms(project, 'anexo1')) add(g5, 'error', 'Indicaste que no usas el IVA y falta el Anexo 1.', { tool: 'anexo1' });
    if (!g5.items.length) add(g5, 'ok', 'Los anexos calzan con tus gastos.');

    /* 6. Informe técnico vs gastos */
    var g6 = grp('informe', 'Informe técnico');
    var eByAct = expensesByActivity(project);
    ['informeA', 'informeB', 'informeC', 'informeE'].forEach(function (fid) {
      formList(project, fid).forEach(function (f) {
        var d = f.data || {};
        if (d.actId && eByAct[d.actId] != null && d.rendido !== '' && d.rendido != null && Math.abs(num(d.rendido) - eByAct[d.actId]) > R.TOLERANCIA_IVA) {
          add(g6, 'warn', '«' + (d.nombre || 'Actividad') + '»: el informe dice ' + U.fmtCLP(num(d.rendido)) + ' rendidos y tus gastos ligados suman ' + U.fmtCLP(eByAct[d.actId]) + '.', { tool: fid });
        }
        var pr = Number(d.avanceReal), pp = Number(d.avanceProg);
        if (isFinite(pr) && pr > 100) add(g6, 'error', '«' + (d.nombre || 'Actividad') + '»: el avance real no puede pasar de 100 %.', { tool: fid });
        if (d.avanceReal !== '' && d.avanceProg !== '' && isFinite(pr) && isFinite(pp) && Math.abs(pr - pp) > 0 && !String(d.desviaciones || '').trim()) add(g6, 'info', '«' + (d.nombre || 'Actividad') + '»: explica por qué el avance real difiere del programado.', { tool: fid });
      });
    });
    acts.forEach(function (x) {
      var rend = eByAct[x.act.id] || 0;
      var informed = ['informeA', 'informeB', 'informeC', 'informeE'].some(function (fid) { return formList(project, fid).some(function (f) { return f.data && f.data.actId === x.act.id; }); });
      if (rend > 0 && !informed) add(g6, 'info', '«' + (x.act.name || 'Actividad') + '» tiene gastos pero aún no tiene ficha en el informe técnico.', { tool: 'informe' });
    });
    if (!g6.items.length) add(g6, 'ok', 'Informe técnico coherente con los gastos.');

    /* 7. Orden del proceso */
    var g7 = grp('orden', 'Orden del proceso');
    skippedPhases(project).forEach(function (s) {
      var f = D.FASES.filter(function (x) { return x.id === s.fase; })[0], q = D.FASES.filter(function (x) { return x.id === s.falta; })[0];
      add(g7, 'warn', 'Avanzaste en «' + f.name + '», pero no has marcado nada en «' + q.name + '». ¿Te saltaste algo?', { fase: s.falta });
    });
    if (!g7.items.length) add(g7, 'ok', 'Vas en orden.');

    var counts = { error: 0, warn: 0, info: 0, ok: 0 };
    groups.forEach(function (g) { g.items.forEach(function (i) { counts[i.level] = (counts[i.level] || 0) + 1; }); });
    return { groups: groups, counts: counts, evals: evals, totals: t };
  }

  RF.logic = {
    expectedMontoRendir: expectedMontoRendir, requirements: requirements, evaluateExpense: evaluateExpense, effectiveHas: effectiveHas, cotizacionOk: cotizacionOk,
    totalsByCuenta: totalsByCuenta, adminByMonth: adminByMonth, expensesByActivity: expensesByActivity, budgetByActivity: budgetByActivity,
    allActivities: allActivities, ganttIssues: ganttIssues, activityDays: activityDays,
    peaDeadline: peaDeadline, aclaracionDeadline: aclaracionDeadline,
    itemProgress: itemProgress, applies: applies, needsAnswered: needsAnswered, effectiveNeeds: effectiveNeeds, progress: progress, skippedPhases: skippedPhases, reconcile: reconcile
  };
})(typeof window !== 'undefined' ? window : globalThis);
