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
    var mesGasto = String(exp.fecha || '').slice(0, 7);
    if (mesGasto && ((project && project.f29) || []).some(function (r) { return r.mes === mesGasto && (r.file || (r.creditos !== '' && r.creditos != null)); })) has.f29 = true;
    ((project && project.cotizaciones) || []).forEach(function (c) {
      var linked = c.gastoId === exp.id || (!c.gastoId || c.gastoId === '__otro') && c.elegido && exp.proveedor && String(c.elegido).trim().toLowerCase() === String(exp.proveedor).trim().toLowerCase();
      if (!linked) return;
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
    if (exp.actId && !allActivities(project).some(function (a) { return a.act.id === exp.actId; })) add('error', 'actividad_invalida', 'La actividad asociada ya no existe. Reasigna este gasto.', 'actId');
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
    var neto = num(exp.neto), iva = num(exp.iva), total = num(exp.total), otros = num(exp.otrosImpuestos);
    if (dt.iva && neto > 0 && total > 0) {
      var diff = Math.abs(neto + iva + otros - total);
      if (diff > R.TOLERANCIA_IVA) add('error', 'aritmetica', 'Neto + IVA no suma el total (hay ' + U.fmtCLP(diff) + ' de diferencia).', 'total');
      else if (iva > 0 && Math.abs(iva - Math.round(neto * R.IVA)) > 2) add('warn', 'iva_raro', 'El IVA no es el 19 % del neto. Revisa las cifras.', 'iva');

    } else if (!dt.iva && neto > 0 && iva > 0 && total > 0 && Math.abs(neto + iva + otros - total) > R.TOLERANCIA_IVA) {
      add('warn', 'aritmetica_boleta', 'En la boleta, neto + IVA no suma el total (hay ' + U.fmtCLP(Math.abs(neto + iva + otros - total)) + ' de diferencia). Compara con el documento.', 'total');
    }

    /* monto a rendir */
    var esp = expectedMontoRendir(exp, community);
    var mr = num(exp.montoRendir);
    if (total > 0 && mr > 0 && Math.abs(mr - esp) > R.TOLERANCIA_IVA) {
      if (community && community.ivaModo === 'recupera' && dt.iva && neto > 0 && Math.abs(mr - total) <= R.TOLERANCIA_IVA) add('error', 'rendir_bruto', 'Como recuperas el IVA, debes rendir el valor neto (' + U.fmtCLP(neto) + ').', 'montoRendir');
      else add('warn', 'monto_distinto', 'El monto a rendir (' + U.fmtCLP(mr) + ') no coincide con el que corresponde (' + U.fmtCLP(esp) + ').' + (exp.cuenta === 'administracion' ? ' Si el gasto lo comparten varios proyectos, anota el «Porcentaje que corresponde al proyecto» y el monto se calcula solo (se pide el Anexo 5).' : ''), 'montoRendir');
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
    if (exp.fecha && exp.actId) {
      var ax = allActivities(project).filter(function (a) { return a.act.id === exp.actId; })[0];
      if (ax && ax.act.start && ax.act.end && (exp.fecha < ax.act.start || exp.fecha > ax.act.end)) add('warn', 'fecha_actividad', 'La fecha está fuera del plazo de la actividad «' + (ax.act.name || 'sin nombre') + '» (' + U.fmtDate(ax.act.start) + ' al ' + U.fmtDate(ax.act.end) + '). Solo se rinden gastos dentro del plazo aprobado en el PEA.', 'fecha');
    }
    if (exp.noFin && Object.keys(exp.noFin).some(function (k) { return exp.noFin[k]; })) add('warn', 'no_financiable', 'Marcaste que podría ser un gasto que el aporte no financia. Consulta a CORFO antes de rendirlo.', 'noFin');
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
    D.CUENTAS.forEach(function (c) { out[c.id] = { presupuestado: 0, corfo: 0, propio: 0, aprobado: num(project.budgetApproved && project.budgetApproved[c.id]), rendido: 0, cantidad: 0 }; });
    (project.budgetLines || []).forEach(function (l) { if (out[l.cuenta]) { out[l.cuenta].presupuestado += num(l.monto); out[l.cuenta][l.fuente === 'propio' ? 'propio' : 'corfo'] += num(l.monto); } });
    (project.expenses || []).forEach(function (e) { if (out[e.cuenta]) { out[e.cuenta].rendido += num(e.montoRendir); out[e.cuenta].cantidad++; } });
    return out;
  }
  function activityReferences(project, ids) {
    var refs = [];
    ['expenses', 'budgetLines'].forEach(function (k) { (project[k] || []).forEach(function (r) { if (ids.indexOf(r.actId) >= 0) refs.push({ kind: k, id: r.id }); }); });
    function scan(value) {
      if (!value || typeof value !== 'object') return;
      if (ids.indexOf(value.actId) >= 0) refs.push({ kind: 'formulario', id: value.id || value.actId });
      Object.keys(value).forEach(function (k) { if (k !== 'actId') scan(value[k]); });
    }
    scan(project.forms);
    return refs;
  }
  function removeActivity(project, id) {
    if (activityReferences(project, [id]).length) throw new Error('Reasigna primero los gastos, líneas de presupuesto o formularios asociados a esta actividad.');
    (project.gantt.stages || []).forEach(function (s) { s.acts = (s.acts || []).filter(function (a) { return a.id !== id; }); });
  }
  function removeStage(project, id) {
    var stage = (project.gantt.stages || []).filter(function (s) { return s.id === id; })[0];
    if (stage && activityReferences(project, (stage.acts || []).map(function (a) { return a.id; })).length) throw new Error('Reasigna primero los gastos, líneas de presupuesto o formularios asociados a esta etapa.');
    project.gantt.stages = (project.gantt.stages || []).filter(function (s) { return s.id !== id; });
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
      else {
        if (a.end < a.start) out.push({ level: 'error', msg: '«' + label + '»: el término es anterior al inicio.' });
        if (project.start && (a.start < project.start || a.end < project.start)) out.push({ level: 'warn', msg: '«' + label + '» queda antes del inicio del proyecto (' + U.fmtDateShort(project.start) + ').' });
        if (project.end && (a.end > project.end || a.start > project.end)) out.push({ level: 'warn', msg: '«' + label + '» queda después del término del proyecto (' + U.fmtDateShort(project.end) + ').' });
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

  /* ---------- pasos que se marcan solos, a partir de lo que ya hay en la app ---------- */
  function realExp(e) { return !!(e && (e.proveedor || e.total || e.folio)); }
  function normRutL(r) { return String(r || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
  function hasForm(project, id) { var f = project.forms && project.forms[id]; return Array.isArray(f) ? f.length > 0 : !!(f && f.data && Object.keys(f.data).some(function (k) { var v = f.data[k]; return v !== '' && v != null && !(Array.isArray(v) && !v.length) && k !== 'fecha' && k !== 'firma'; })); }
  function listN(project, id) { var f = project.forms && project.forms[id]; return Array.isArray(f) ? f.length : 0; }
  function missingOf(project, community, list) { return list.filter(function (e) { return requirements(e, project, community).some(function (r) { return !r.met; }); }); }
  function ok(why) { return { done: true, why: why }; }
  function no(why, tool) { return { done: false, why: why, tool: tool }; }
  function respaldos(project, community, cuentas, nombre) {
    var list = (project.expenses || []).filter(function (e) { return realExp(e) && (!cuentas || cuentas.indexOf(e.cuenta) >= 0); });
    if (!list.length) return no('Todavía no anotas ' + nombre + '.', 'gastos');
    var m = missingOf(project, community, list);
    return m.length ? no(m.length + ' de ' + list.length + ' gastos tienen respaldos pendientes.', 'gastos') : ok('los ' + list.length + (list.length === 1 ? ' gasto tiene' : ' gastos tienen') + ' todos sus respaldos.');
  }
  function fichasPorGasto(project, formId, cuentas, nombre) {
    var list = (project.expenses || []).filter(function (e) { return realExp(e) && cuentas.indexOf(e.cuenta) >= 0; });
    if (!list.length) return no('Todavía no anotas ' + nombre + '.', 'gastos');
    var need = formId === 'informeD' ? Object.keys(list.reduce(function (acc, e) { acc[normRutL(e.rutProveedor) || ('p:' + String(e.proveedor || '').toLowerCase())] = 1; return acc; }, {})).length : list.length, have = listN(project, formId);
    return have >= need ? ok('hay ' + have + (have === 1 ? ' ficha' : ' fichas') + ' para ' + need + (formId === 'informeD' ? (need === 1 ? ' persona.' : ' personas.') : (need === 1 ? ' gasto.' : ' gastos.'))) : no('Hay ' + have + ' de ' + need + ' fichas.', formId);
  }
  var AUTO = {
    desembolso: function (p) { return p.desembolso1 ? ok('anotaste la fecha del primer pago (' + U.fmtDate(p.desembolso1) + ').') : no('Anota la fecha del primer pago en «Mi comunidad y proyectos».', 'proyecto'); },
    pea_docs: function (p) { var g = forms(p, 'peaGeneral'); var ok1 = !!(g && g.data && g.data.resumen), ok2 = listN(p, 'peaProyecto') > 0, ok3 = allActivities(p).length > 0, ok4 = (p.budgetLines || []).length > 0; return ok1 && ok2 && ok3 && ok4 ? ok('tienes la información general, ' + listN(p, 'peaProyecto') + ' formulario(s) de proyecto, la Carta Gantt y el presupuesto.') : no('Falta: ' + [!ok1 && 'información general', !ok2 && 'formulario de proyecto', !ok3 && 'Carta Gantt', !ok4 && 'presupuesto'].filter(Boolean).join(', ') + '.', 'pea'); },
    reitem_form: function (p) { return (p.reitem && ((p.reitem.rows || []).length || p.reitem.motivo)) ? ok('ya llenaste la solicitud de cambio.') : no('Llena la solicitud de cambio.', 'reitem'); },
    prorroga_form: function (p) { var f = forms(p, 'prorroga'); return f && f.data && f.data.motivo ? ok('ya redactaste la solicitud de prórroga.') : no('Redacta la solicitud de prórroga.', 'prorroga'); },
    cot_ok: function (p) { var big = (p.cotizaciones || []).filter(function (c) { return num(c.neto) > R.COTIZACION_UMBRAL; }); if (!big.length) return no('Todavía no registras compras sobre $10.000.000 con sus cotizaciones.', 'cotizaciones'); var bad = big.filter(function (c) { return !(c.servicioTecnico || c.autorizacion || cotizacionOk(c)); }); return bad.length ? no(bad.length + ' compra(s) grande(s) sin 2 cotizaciones ni autorización.', 'cotizaciones') : ok('las compras grandes tienen sus cotizaciones o su autorización.'); },
    resp_todos: function (p, c) { return respaldos(p, c, null, 'gastos'); },
    resp_rrhh: function (p, c) { return respaldos(p, c, ['rrhh'], 'gastos de recursos humanos'); },
    resp_inversion: function (p, c) { return respaldos(p, c, ['inversion'], 'compras de inversión'); },
    verificados: function (p) { var list = (p.expenses || []).filter(realExp); if (!list.length) return no('Todavía no anotas gastos.', 'gastos'); var m = list.filter(function (e) { return !e.verified; }); return m.length ? no(m.length + ' de ' + list.length + ' gastos sin marcar «Lo revisé».', 'gastos') : ok('los ' + list.length + ' gastos están revisados contra el documento.'); },
    gastos_ok: function (p, c) { var list = (p.expenses || []).filter(realExp); if (!list.length) return no('Todavía no anotas gastos.', 'gastos'); var bad = list.filter(function (e) { return evaluateExpense(e, p, c, p.expenses).issues.some(function (i) { return i.level === 'error'; }); }); return bad.length ? no(bad.length + ' de ' + list.length + ' gastos con errores por corregir.', 'revision') : ok('los ' + list.length + ' gastos están anotados sin errores.'); },
    obs_resp: function (p) { var o = p.observations || []; if (!o.length) return no('Todavía no registras observaciones.', 'observaciones'); var pend = o.filter(function (x) { return !x.respondida; }); return pend.length ? no(pend.length + ' observación(es) sin responder.', 'observaciones') : ok('todas las observaciones tienen su respuesta.'); },
    informe_general: function (p) { var f = forms(p, 'informe'); return f && f.data && f.data.objetivoGeneral ? ok('ya llenaste los datos generales y los objetivos.') : no('Llena los datos generales y los objetivos.', 'informe'); },
    fichas_alguna: function (p) { var n = ['informeA', 'informeB', 'informeC', 'informeD', 'informeE'].reduce(function (a, k) { return a + listN(p, k); }, 0); return n ? ok('hay ' + n + (n === 1 ? ' ficha' : ' fichas') + ' de actividades.') : no('Todavía no hay fichas de actividades.', 'informe'); },
    ficha_A: function (p) { var n = listN(p, 'informeA'); return n ? ok('hay ' + n + (n === 1 ? ' ficha' : ' fichas') + ' de actividades.') : no('Todavía no hay fichas.', 'informeA'); },
    ficha_B: function (p) { var n = listN(p, 'informeB'); return n ? ok('hay ' + n + (n === 1 ? ' ficha' : ' fichas') + ' de estudios.') : no('Todavía no hay fichas.', 'informeB'); },
    ficha_E: function (p) { var n = listN(p, 'informeE'); return n ? ok('hay ' + n + (n === 1 ? ' ficha' : ' fichas') + ' de otras actividades.') : no('Si tuviste otras actividades, crea su ficha.', 'informeE'); },
    ficha_C: function (p) { return fichasPorGasto(p, 'informeC', ['inversion'], 'compras de inversión'); },
    ficha_D: function (p) { return fichasPorGasto(p, 'informeD', ['rrhh'], 'gastos de recursos humanos'); },
    viaje_form: function (p) { var n = listN(p, 'viaje'); return n ? ok('hay ' + n + (n === 1 ? ' registro de viaje.' : ' registros de viaje.')) : no('Registra quién viaja y por qué es necesario.', 'viaje'); },
    anexo1: function (p) { return hasForm(p, 'anexo1') ? ok('ya llenaste el Anexo 1.') : no('Llena el Anexo 1.', 'anexo1'); },
    anexo2: function (p) { return hasForm(p, 'anexo2') ? ok('ya llenaste el Anexo 2.') : no('Llena el Anexo 2.', 'anexo2'); },
    anexo3: function (p) { var n = (p.expenses || []).filter(function (e) { return realExp(e) && e.formaPago === 'efectivo'; }).length, have = listN(p, 'anexo3'); if (!n) return no('Todavía no anotas pagos en efectivo.', 'gastos'); return have >= n ? ok('hay ' + have + ' declaración(es) para ' + n + ' pago(s) en efectivo.') : no('Hay ' + have + ' de ' + n + ' declaraciones del Anexo 3.', 'anexo3'); },
    anexo4: function (p) { var n = (p.expenses || []).filter(function (e) { return realExp(e) && (e.esViatico || e.docType === 'certificado_viatico'); }).length, have = listN(p, 'anexo4'); if (!n) return no('Todavía no anotas viáticos.', 'gastos'); return have >= n ? ok('hay ' + have + ' certificado(s) para ' + n + ' viático(s).') : no('Hay ' + have + ' de ' + n + ' certificados del Anexo 4.', 'anexo4'); },
    anexo5: function (p) { var f = forms(p, 'anexo5'); return f && f.data && (num(f.data.totalUso) + num(f.data.totalHH)) > 0 ? ok('la memoria de cálculo ya suma ' + U.fmtCLP(num(f.data.totalUso) + num(f.data.totalHH)) + '.') : no('Llena la memoria de cálculo (Anexo 5).', 'anexo5'); }
  };
  var autoMemo = { ver: -1, map: {} };
  /* el paso i del trámite tid: { done, why, tool } si se marca solo, o null si es manual. Se calcula una vez por cambio de datos. */
  function autoStep(project, tid, i) {
    var t = RF.tramites.byId[tid], key = t && t.auto && t.auto[i];
    if (!key || !AUTO[key] || !project) return null;
    var ver = RF.store && RF.store.version ? RF.store.version() : 0;
    if (autoMemo.ver !== ver) autoMemo = { ver: ver, map: {} };
    var mk = project.id + '|' + key;
    if (!autoMemo.map[mk]) { try { autoMemo.map[mk] = AUTO[key](project, (RF.store && RF.store.get().community) || {}); } catch (e) { autoMemo.map[mk] = no('No se pudo revisar.', null); } }
    return autoMemo.map[mk];
  }
  function stepDone(project, tid, i) { if (project && project.done && project.done[tid + ':' + i]) return true; var a = autoStep(project, tid, i); return !!(a && a.done); }

  /* ---------- avance por trámite / fase ---------- */
  /* pasos obligatorios de un trámite (los opcionales se pueden marcar, pero no cuentan para el avance) */
  function requiredSteps(tid) { var t = RF.tramites.byId[tid], out = []; if (!t) return out; t.steps.forEach(function (_, i) { if (!(t.opt && t.opt[i])) out.push(i); }); return out; }
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
  /* Compara, mes a mes, el IVA de las facturas anotadas con el F29 que subió la comunidad. Sin F29, deja el IVA del mes listo para revisarlo. */
  function f29Audit(project, community) {
    var mode = (community && community.ivaModo) || 'no_contribuyente', months = {}, items = [];
    function slot(mes) { return months[mes] || (months[mes] = { mes: mes, n: 0, iva: 0 }); }
    ((project && project.expenses) || []).forEach(function (e) {
      var dt = D.DOC_BY_ID[e.docType] || {}, mes = String(e.fecha || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(mes) || !(dt.iva || (dt.extras || []).indexOf('f29') >= 0)) return;
      var m = slot(mes); m.n++; m.iva += num(e.iva);
    });
    ((project && project.f29) || []).forEach(function (r) { if (/^\d{4}-\d{2}$/.test(r.mes || '')) slot(r.mes); });
    Object.keys(months).sort().forEach(function (mes) {
      var m = months[mes], rec = ((project && project.f29) || []).filter(function (r) { return r.mes === mes; })[0] || null, it = { mes: mes, n: m.n, iva: m.iva, record: rec, level: 'info', msg: '' };
      var cred = rec && rec.creditos !== '' && rec.creditos != null ? num(rec.creditos) : null;
      if (!m.n && !rec) return;
      if (!rec) { it.level = 'warn'; it.msg = 'Falta el F29 de este mes: el Manual lo pide junto a las facturas. IVA que debería incluir tu F29 por estas facturas: ' + U.fmtCLP(m.iva) + '.'; }
      else if (cred === null) { it.level = 'info'; it.msg = rec.file ? 'Anota el total de créditos que aparece en tu F29 para compararlo con el IVA de las facturas (' + U.fmtCLP(m.iva) + ').' : 'Sube el archivo del F29 y anota su total de créditos para compararlo con el IVA de las facturas (' + U.fmtCLP(m.iva) + ').'; }
      else if (!m.n) { it.level = 'ok'; it.msg = 'F29 guardado. No hay facturas anotadas este mes para comparar.'; }
      else if (mode === 'no_usa') { it.level = cred >= m.iva - R.TOLERANCIA_IVA && m.iva > 0 ? 'warn' : 'ok'; it.msg = it.level === 'warn' ? 'Tu F29 tiene crédito por ' + U.fmtCLP(cred) + ', suficiente para cubrir el IVA de estas facturas (' + U.fmtCLP(m.iva) + '). Dijiste que no usas el IVA: si ese crédito incluye estas facturas, no se pueden rendir con IVA; si es de otras compras, corresponde el Anexo 2.' : 'El crédito del F29 (' + U.fmtCLP(cred) + ') no alcanza para cubrir el IVA de estas facturas, coherente con que no lo usas.'; }
      else if (cred < m.iva - R.TOLERANCIA_IVA) { it.level = 'warn'; it.msg = 'Tu F29 declara ' + U.fmtCLP(cred) + ' de crédito, pero las facturas que anotaste suman ' + U.fmtCLP(m.iva) + ' de IVA: falta alguna factura en el F29 o alguna anotada no es de este mes.'; }
      else { it.level = 'ok'; it.msg = 'El crédito del F29 (' + U.fmtCLP(cred) + ') cubre el IVA de tus facturas (' + U.fmtCLP(m.iva) + ').'; }
      items.push(it);
    });
    return { mode: mode, items: items };
  }
  function itemProgress(project, tid) {
    var req = requiredSteps(tid), n = req.length, done = 0;
    if (project && project.na && project.na[tid]) return { done: 0, total: 0, na: true, complete: true };
    if (project && project.needsSet && !applies(project, tid)) return { done: 0, total: 0, na: true, auto: true, complete: true };
    req.forEach(function (i) { if (stepDone(project, tid, i)) done++; });
    return { done: done, total: n, na: false, optional: !!(RF.tramites.byId[tid] && RF.tramites.byId[tid].optional), complete: n > 0 && done === n };
  }
  function progress(project) {
    var porFase = {}, total = 0, done = 0, tramTotal = 0, tramDone = 0, next = null, cur = null;
    D.FASES.forEach(function (f) {
      var d = 0, t = 0, td = 0, tt = 0, started = false, complete = true;
      f.items.forEach(function (tid) {
        var ip = itemProgress(project, tid);
        if (ip.optional) return; /* los opcionales no cuentan en el avance ni frenan la fase */
        d += ip.done; t += ip.total;
        if (!ip.na) { tt++; if (ip.complete) td++; }
        if (ip.done > 0 && !ip.na) started = true;
        if (!ip.complete) {
          complete = false;
          if (!next) {
            next = { tramiteId: tid, stepIdx: 0, fase: f.id };
            var rq = requiredSteps(tid); for (var i = 0; i < rq.length; i++) { if (!stepDone(project, tid, rq[i])) { next.stepIdx = rq[i]; break; } }
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
    var GROUP_FIX = { proyecto: { tool: 'proyecto' }, plan: { tool: 'necesidades' }, plazos: { tool: 'plazos' }, planificacion: { tool: 'presupuesto' }, gastos: { tool: 'gastos' }, anexos: { tool: 'f29' }, informe: { tramite: 'TRM-016' }, orden: { tramite: 'TRM-027' } };
    function add(g, level, msg, fix) { g.items.push({ level: level, msg: msg, fix: fix || (level === 'ok' ? null : GROUP_FIX[g.id] || null) }); }
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
      if (x.aprobado > 0 && x.corfo > x.aprobado) add(g3, 'error', c.name + ': tu presupuesto CORFO (' + U.fmtCLP(x.corfo) + ') supera lo aprobado (' + U.fmtCLP(x.aprobado) + ').', { tool: 'presupuesto' });
      else if (x.aprobado > 0 && x.corfo > 0 && Math.abs(x.corfo - x.aprobado) > R.TOLERANCIA_IVA) add(g3, 'warn', c.name + ': presupuestaste ' + U.fmtCLP(x.corfo) + ' CORFO de ' + U.fmtCLP(x.aprobado) + ' aprobados.', { tool: 'presupuesto' });
    });
    var sinAct = (project.budgetLines || []).filter(function (l) { return !l.actId; }).length;
    if (sinAct) add(g3, 'info', sinAct + ' línea(s) de presupuesto sin actividad asociada.', { tool: 'presupuesto' });
    (project.budgetLines || []).forEach(function (l) { if (l.actId && !acts.some(function (a) { return a.act.id === l.actId; })) add(g3, 'error', 'Una línea de presupuesto referencia una actividad inexistente. Reasígnala.', { tool: 'presupuesto' }); });
    if (!g3.items.length) add(g3, 'ok', 'Carta Gantt y presupuesto sin problemas.');

    /* 4. Gastos */
    var g4 = grp('gastos', 'Gastos rendidos');
    var evals = expenses.map(function (e) { return { e: e, r: evaluateExpense(e, project, community, expenses) }; });
    var bad = evals.filter(function (x) { return x.r.status === 'error'; }).length;
    var warnE = evals.filter(function (x) { return x.r.status === 'warn'; }).length;
    if (!expenses.length) add(g4, 'info', 'Aún no anotas gastos.', { tool: 'gastos' });
    else {
      if (bad) add(g4, 'error', bad + ' gasto(s) pendientes de corregir antes de enviar.', { tool: 'gastos', filtro: 'error' });
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
    f29Audit(project, community).items.forEach(function (it) { if (it.level === 'warn') add(g5, 'warn', 'F29 de ' + it.mes + ': ' + it.msg, { tool: 'f29' }); });
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
    allActivities: allActivities, ganttIssues: ganttIssues, activityDays: activityDays, activityReferences: activityReferences, removeActivity: removeActivity, removeStage: removeStage,
    peaDeadline: peaDeadline, aclaracionDeadline: aclaracionDeadline,
    f29Audit: f29Audit, autoStep: autoStep, stepDone: stepDone, itemProgress: itemProgress, requiredSteps: requiredSteps, applies: applies, needsAnswered: needsAnswered, effectiveNeeds: effectiveNeeds, progress: progress, skippedPhases: skippedPhases, reconcile: reconcile
  };
})(typeof window !== 'undefined' ? window : globalThis);
