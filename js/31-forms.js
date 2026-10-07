/* Rinde Fácil — formularios editables: Anexos 1 a 6, PEA, consulta, solicitud.
   Cada formulario es un "esquema": campos + cómo calcular + cómo armar el documento final. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};
  var U = RF.util, UI = RF.ui, h = U.h;
  var num = U.parseCLP;

  function foot(anexo) { return 'Formato basado en ' + anexo + ' del Manual de presentación de informes y rendición del aporte (CORFO). Revísalo y fírmalo antes de entregarlo. Generado con Rinde Fácil.'; }
  function v(x, dflt) { return x === undefined || x === null || x === '' ? (dflt === undefined ? '' : dflt) : x; }
  function actOptions(ctx) {
    var out = [{ id: '', name: 'Sin actividad asociada' }];
    RF.logic.allActivities(ctx.project).forEach(function (x) { out.push({ id: x.act.id, name: (x.act.name || 'Actividad sin nombre') }); });
    return out;
  }
  function actName(ctx, id) { var a = RF.logic.allActivities(ctx.project).filter(function (x) { return x.act.id === id; })[0]; return a ? a.act.name : ''; }
  function proj(ctx) { return ctx.project || {}; }
  function com(ctx) { return ctx.community || {}; }

  var COMMON_AVANCE = [
    { k: 'avanceProg', l: 'Avance programado del período (%)', t: 'pct' },
    { k: 'avanceReal', l: 'Avance real del período (%)', t: 'pct' },
    { k: 'avanceProgAcum', l: 'Avance programado acumulado (%)', t: 'pct' },
    { k: 'avanceRealAcum', l: 'Avance real acumulado (%)', t: 'pct' },
    { k: 'criterio', l: 'Cómo calculaste el porcentaje de avance', t: 'textarea', rows: 2 },
    { k: 'desviaciones', l: 'Por qué el avance real es distinto del programado (si aplica)', t: 'textarea', rows: 2 },
    { k: 'riesgos', l: 'Riesgos o problemas que causaron atraso (si aplica)', t: 'textarea', rows: 2 }
  ];
  function avanceRows(d) {
    return [['Avance programado del período', v(d.avanceProg) === '' ? '' : d.avanceProg + ' %'], ['Avance real del período', v(d.avanceReal) === '' ? '' : d.avanceReal + ' %'],
      ['Avance programado acumulado a la fecha', v(d.avanceProgAcum) === '' ? '' : d.avanceProgAcum + ' %'], ['Avance real acumulado a la fecha', v(d.avanceRealAcum) === '' ? '' : d.avanceRealAcum + ' %'],
      ['Criterio para calcular el avance', d.criterio], ['Razones de las desviaciones', d.desviaciones], ['Riesgos o problemas', d.riesgos]];
  }
  function fillMontos(d, ctx) { /* rellena presupuestado y rendido desde tus datos cuando eliges la actividad */
    if (!d.actId) return;
    var rend = RF.logic.expensesByActivity(ctx.project)[d.actId];
    var pres = RF.logic.budgetByActivity(ctx.project)[d.actId];
    if (rend != null) d.rendido = rend;
    if (pres != null) d.presupuestado = pres;
    if (!d.nombre) d.nombre = actName(ctx, d.actId);
  }

  var SCHEMAS = {};

  function stateOf() { return RF.store.get(); }
  function commNames() { var n = v(stateOf().community.name); return n ? [n] : []; }
  function repNames() { var n = v(stateOf().community.legalRep); return n ? [n] : []; }
  function projectNames() { return (stateOf().projects || []).map(function (p) { return p.name; }).filter(Boolean); }
  var CARGOS = ['Presidente(a)', 'Representante legal', 'Tesorero(a)', 'Secretario(a)', 'Director(a)'];
  /* al elegir el proyecto se rellenan su código y el período que se rinde */
  function projectFill(k, d) {
    if (k !== 'proyectoNombre') return;
    var pr = (stateOf().projects || []).filter(function (p) { return p.name === d.proyectoNombre; })[0]; if (!pr) return;
    if (pr.code) d.proyectoCodigo = pr.code;
    if ('periodoInicio' in d && pr.periodoInicio) d.periodoInicio = pr.periodoInicio;
    if ('periodoFin' in d && pr.periodoFin) d.periodoFin = pr.periodoFin;
  }
  /* ============ ANEXO 1 ============ */
  SCHEMAS.anexo1 = {
    id: 'anexo1', title: 'Anexo 1 · Declaración por no utilización de IVA CF', repeat: false, sheet: 'Anexo 1', signers: [{ k: 'rep', l: 'Firma de quien representa a la comunidad' }], anexoN: 1,
    defaults: function (ctx) { return { ciudad: '', fecha: U.todayISO(), repNombre: v(com(ctx).legalRep), repRut: v(com(ctx).repRut), comunidad: v(com(ctx).name), comunidadRut: v(com(ctx).rut), proyectoNombre: v(proj(ctx).name), proyectoCodigo: v(proj(ctx).code), periodoInicio: v(proj(ctx).periodoInicio), periodoFin: v(proj(ctx).periodoFin) }; },
    fields: [
      { k: 'comunidad', l: 'Comunidad que declara', t: 'choice', options: commNames }, { k: 'comunidadRut', l: 'RUT de la comunidad', t: 'rut' },
      { k: 'repNombre', l: 'Quién la representa y firma', t: 'choice', options: repNames }, { k: 'repRut', l: 'Cédula de identidad de quien firma', t: 'rut' },
      { k: 'proyectoNombre', l: 'Proyecto', t: 'choice', options: projectNames }, { k: 'proyectoCodigo', l: 'Código del proyecto', t: 'text', ph: '22CDR-######', hint: 'Se rellena solo al elegir el proyecto.' },
      { k: 'periodoInicio', l: 'Período que rindes: desde', t: 'date' }, { k: 'periodoFin', l: 'hasta', t: 'date' },
      { k: 'ciudad', l: 'Ciudad donde firmas', t: 'text', ph: 'Ej: San Pedro de Atacama' }, { k: 'fecha', l: 'Fecha de la declaración', t: 'date' }
    ],
    onChange: function (k, d) { projectFill(k, d); },
    check: function (d) { var o = []; if (!d.periodoInicio || !d.periodoFin) o.push({ level: 'warn', msg: 'Falta el período de la rendición.' }); if (!d.repNombre) o.push({ level: 'warn', msg: 'Falta quien representa a la comunidad.' }); return o; },
    doc: function (d) {
      var f = U.fmtDate;
      return { title: 'Declaración jurada por no utilización de IVA CF', sheet: 'Anexo 1', footer: foot('el Anexo N° 1'), blocks: [
        { t: 'p', text: v(d.ciudad, '[Ciudad]') + ', ' + (d.fecha ? f(d.fecha) : '[fecha]') },
        { t: 'p', text: 'Yo, ' + v(d.repNombre, '[nombre]') + ', cédula de identidad N° ' + v(d.repRut, '[RUT]') + ', en representación de ' + v(d.comunidad, '[comunidad]') + ', RUT ' + v(d.comunidadRut, '[RUT comunidad]') + ', vengo en declarar bajo juramento que, en el contexto de ejecución del proyecto «' + v(d.proyectoNombre, '[proyecto]') + '», código ' + v(d.proyectoCodigo, '[código]') + ', que forma parte del Programa de Ejecución de Actividades que ejecuta esta Comunidad con el Aporte, no he hecho ni haré uso del IVA CF generado por la utilización de servicios y adquisiciones de que dan cuenta las facturas que acompaño a la rendición, correspondiente al período que va desde el ' + (d.periodoInicio ? f(d.periodoInicio) : '[inicio]') + ' al ' + (d.periodoFin ? f(d.periodoFin) : '[término]') + '.' },
        { t: 'p', text: 'En consecuencia, el IVA CF referido en el párrafo precedente, no ha sido ni será declarado ni utilizado por ' + v(d.comunidad, '[comunidad]') + ' para la deducción o rebaja del Impuesto al Valor Agregado débito fiscal, por lo que no constituye para ésta un impuesto recuperable.' },
        { t: 'p', text: 'Asimismo, declaro estar en conocimiento de lo dispuesto en las instrucciones dadas por Corfo, en el sentido que:\n- La utilización del IVA CF y el contenido de esta declaración puede ser verificado directamente por Corfo.\n- Si se detectare que la información entregada es falsa, se podrá solicitar la restitución de los recursos indebidamente rendidos, sin perjuicio del ejercicio de las acciones que se indican en el Convenio suscrito con Corfo.' },
        { t: 'sign', labels: [v(d.repNombre, 'Nombre') + ' · ' + v(d.comunidad, 'Comunidad')] }
      ] };
    }
  };

  /* ============ ANEXO 2 ============ */
  SCHEMAS.anexo2 = {
    id: 'anexo2', title: 'Anexo 2 · IVA CF no relacionado con los proyectos', repeat: false, sheet: 'Anexo 2', signers: [{ k: 'rep', l: 'Firma de quien representa a la comunidad' }], anexoN: 2,
    defaults: function (ctx) { return { ciudad: '', fecha: U.todayISO(), repNombre: v(com(ctx).legalRep), repCargo: '', proyectoNombre: v(proj(ctx).name), proyectoCodigo: v(proj(ctx).code), periodoInicio: v(proj(ctx).periodoInicio), periodoFin: v(proj(ctx).periodoFin), filas: [] }; },
    fields: [
      { k: 'repNombre', l: 'Quién representa a la comunidad y firma', t: 'choice', options: repNames }, { k: 'repCargo', l: 'Su cargo o relación con la comunidad', t: 'choice', options: CARGOS },
      { k: 'proyectoNombre', l: 'Proyecto', t: 'choice', options: projectNames }, { k: 'proyectoCodigo', l: 'Código del proyecto', t: 'text', hint: 'Se rellena solo al elegir el proyecto.' },
      { k: 'periodoInicio', l: 'Período que rindes: desde', t: 'date' }, { k: 'periodoFin', l: 'hasta', t: 'date' },
      { k: 'filas', l: 'Facturas cuyo IVA no es de este proyecto', t: 'table', add: 'Agregar factura', cols: [
        { k: 'nFactura', l: 'N° de factura', t: 'text' }, { k: 'fecha', l: 'Fecha de emisión', t: 'date' }, { k: 'bruto', l: 'Valor bruto', t: 'money' }, { k: 'neto', l: 'Valor neto', t: 'money' },
        { k: 'detalle', l: 'Qué se compró o contrató', t: 'text' }, { k: 'contexto', l: 'Para qué se hizo (otra actividad de la comunidad)', t: 'text' }] },
      { k: 'ciudad', l: 'Ciudad donde firmas', t: 'text' }, { k: 'fecha', l: 'Fecha de la declaración', t: 'date' }
    ],
    onChange: function (k, d) { projectFill(k, d); },
    check: function (d) { var o = []; if (!d.filas || !d.filas.length) o.push({ level: 'warn', msg: 'Agrega al menos una factura.' }); (d.filas || []).forEach(function (r, i) { if (r.bruto && r.neto && num(r.neto) > num(r.bruto)) o.push({ level: 'error', msg: 'Fila ' + (i + 1) + ': el neto no puede ser mayor que el bruto.' }); }); return o; },
    doc: function (d) {
      var f = U.fmtDate;
      return { title: 'Declaración jurada · Utilización de IVA CF no relacionado con los proyectos', sheet: 'Anexo 2', footer: foot('el Anexo N° 2'), blocks: [
        { t: 'p', text: v(d.ciudad, '[Ciudad]') + ', ' + (d.fecha ? f(d.fecha) : '[fecha]') },
        { t: 'p', text: 'Yo, ' + v(d.repNombre, '[nombre]') + ', vengo en declarar bajo juramento, que el IVA CF declarado en los Formularios 29 del SII que acompaño a la rendición del período comprendido entre el ' + (d.periodoInicio ? f(d.periodoInicio) : '[inicio]') + ' y el ' + (d.periodoFin ? f(d.periodoFin) : '[término]') + ', no dicen relación alguna con adquisiciones o utilización de servicios en el contexto de ejecución de los proyectos comprendidos en el Programa de Ejecución de Actividades que desarrolla esta Comunidad con el Aporte, proyecto denominado «' + v(d.proyectoNombre, '[proyecto]') + '» código ' + v(d.proyectoCodigo, '[código]') + ', sino con otros que a continuación detallo:' },
        { t: 'table', head: ['N° factura', 'Fecha emisión', 'Valor bruto', 'Valor neto', 'Detalle de la adquisición o del servicio', 'Contexto en que se realizó'], types: ['text', 'date', 'money', 'money', 'text', 'text'],
          rows: (d.filas || []).map(function (r) { return [r.nFactura, r.fecha, num(r.bruto), num(r.neto), r.detalle, r.contexto]; }), foot: ['Total', '', 'SUM', 'SUM', '', ''] },
        { t: 'p', text: 'Asimismo, declaro estar en conocimiento de lo dispuesto en las instrucciones dadas por Corfo, en el sentido que:\n- La utilización del IVA CF y el contenido de esta declaración puede ser verificado directamente.\n- Si se detectare que la información entregada es falsa, se podrá solicitar la restitución de los recursos indebidamente rendidos, sin perjuicio del ejercicio de las acciones que se indican en el Convenio suscrito con Corfo.' },
        { t: 'sign', labels: [v(d.repNombre, 'Nombre') + (d.repCargo ? ' · ' + d.repCargo : '')] }
      ] };
    }
  };

  /* ============ ANEXO 3 (uno por pago en efectivo) ============ */
  SCHEMAS.anexo3 = {
    id: 'anexo3', title: 'Anexo 3 · Declaración jurada simple (pago en efectivo)', repeat: true, sheet: 'Anexo 3', signers: [{ k: 'prov', l: 'Firma de quien recibió el pago' }], anexoN: 3, addLabel: 'Nueva declaración', itemName: function (d) { return (d.proveedorNombre || 'Sin nombre') + (d.monto ? ' · ' + U.fmtCLP(d.monto) : ''); },
    defaults: function (ctx) { return { ciudad: '', fecha: U.todayISO(), proveedorNombre: '', proveedorRut: '', monto: '', repNombre: v(com(ctx).legalRep), documentos: '', gastoId: '' }; },
    fields: [
      { k: 'gastoId', l: 'Gasto en efectivo al que corresponde (opcional)', t: 'expenseSelect', filter: function (e) { return e.formaPago === 'efectivo'; } },
      { k: 'ciudad', l: 'Ciudad donde se firma', t: 'text' }, { k: 'fecha', l: 'Fecha del pago', t: 'date' },
      { k: 'proveedorNombre', l: 'Quien recibió el pago (nombre completo)', t: 'text' }, { k: 'proveedorRut', l: 'RUT o cédula de quien recibió', t: 'rut' },
      { k: 'monto', l: 'Monto pagado en efectivo ($)', t: 'money' }, { k: 'repNombre', l: 'Quién pagó, por la comunidad', t: 'choice', options: repNames },
      { k: 'documentos', l: 'Documento que se pagó (N° de factura, boleta u otro)', t: 'text', ph: 'Ej: boleta N° 542449' }
    ],
    onChange: function (k, d, ctx) {
      if (k !== 'gastoId' || !d.gastoId) return;
      var e = (ctx.project.expenses || []).filter(function (x) { return x.id === d.gastoId; })[0]; if (!e) return;
      d.proveedorNombre = e.proveedor || d.proveedorNombre; d.proveedorRut = e.rutProveedor || d.proveedorRut; d.monto = num(e.total) || d.monto;
      d.documentos = ((RF.data.DOC_BY_ID[e.docType] || {}).name || 'documento') + ' N° ' + (e.folio || '');
      if (e.fechaPago || e.fecha) d.fecha = e.fechaPago || e.fecha; /* la declaración lleva la fecha en que se pagó */
    },
    check: function (d) { var o = []; if (!(num(d.monto) > 0)) o.push({ level: 'error', msg: 'Falta el monto.' }); if (!d.proveedorNombre) o.push({ level: 'error', msg: 'Falta el nombre de quien recibió.' }); if (d.proveedorRut && !U.rutValid(d.proveedorRut)) o.push({ level: 'warn', msg: 'El RUT no parece válido.' }); return o; },
    doc: function (d) {
      return { title: 'Declaración jurada simple', sheet: 'Anexo 3', footer: foot('el Anexo N° 3'), blocks: [
        { t: 'p', text: v(d.ciudad, '[Ciudad]') + ', ' + (d.fecha ? U.fmtDate(d.fecha) : '[fecha]') },
        { t: 'p', text: 'Yo ' + v(d.proveedorNombre, '[nombre del prestador del servicio/proveedor]') + (d.proveedorRut ? ', RUT ' + d.proveedorRut : '') + ', declaro que he recibido el pago en efectivo de ' + (num(d.monto) ? U.fmtCLP(d.monto) : '[$ monto]') + ', de parte de ' + v(d.repNombre, '[nombre del representante de la Comunidad]') + ', por la(s) ' + v(d.documentos, '[N° de facturas, N° de boleta de honorarios u otro documento]') + ', sin que exista monto adeudado por estos conceptos a esta fecha.' },
        { t: 'sign', labels: ['Firma · ' + v(d.proveedorNombre, 'Nombre del prestador del servicio/proveedor')] }
      ] };
    }
  };

  /* ============ Registro del viaje (ayuda de la app, no es un anexo de CORFO) ============ */
  var ROLES_VIAJE = ['Representante legal', 'Integrante de la directiva', 'Socio o socia de la comunidad', 'Persona contratada en el proyecto', 'Asesor o proveedor del servicio', 'Otro'];
  SCHEMAS.viaje = {
    id: 'viaje', title: 'Registro del viaje: quién viaja y por qué', repeat: true, sheet: 'Registro de viaje', addLabel: 'Nuevo viaje', itemName: function (d) { return d.destino || 'Viaje sin destino'; },
    defaults: function () { return { actId: '', destino: '', desde: '', hasta: '', motivo: '', anticipacion: false, asistentes: [{}] }; },
    fields: [
      { k: 'actId', l: 'Actividad de tu Carta Gantt a la que pertenece el viaje', t: 'actSelect' },
      { k: 'destino', l: 'A dónde viajan', t: 'text', ph: 'Ej: Calama' }, { k: 'desde', l: 'Sale el', t: 'date' }, { k: 'hasta', l: 'Vuelve el', t: 'date' },
      { k: 'motivo', l: 'Por qué el viaje es esencial para la actividad', t: 'textarea', rows: 3, ph: 'Ej: Reunión con el proveedor para firmar el contrato de la maquinaria.' },
      { k: 'asistentes', l: 'Quiénes viajan', t: 'table', add: 'Agregar persona', cols: [
        { k: 'nombre', l: 'Nombre completo', t: 'text' }, { k: 'rut', l: 'RUT', t: 'text' }, { k: 'rol', l: 'Rol', t: 'select', options: ROLES_VIAJE.map(function (r) { return { id: r, name: r }; }) }, { k: 'porque', l: 'Por qué es necesaria su presencia', t: 'text' }] },
      { k: 'anticipacion', l: 'Los pasajes se compraron con 15 días de anticipación y en clase económica', t: 'check' }
    ],
    check: function (d) {
      var o = []; if (!d.destino) o.push({ level: 'warn', msg: 'Falta el destino.' }); if (!d.motivo) o.push({ level: 'warn', msg: 'Explica por qué el viaje es esencial: es lo que pide el Manual.' });
      (d.asistentes || []).forEach(function (a, i) { if (!a.nombre) o.push({ level: 'warn', msg: 'Persona ' + (i + 1) + ': falta el nombre.' }); else if (!a.rol || !a.porque) o.push({ level: 'warn', msg: a.nombre + ': falta su rol o por qué es necesaria su presencia.' }); });
      if (d.desde && d.hasta && d.hasta < d.desde) o.push({ level: 'error', msg: 'La vuelta es anterior a la salida.' });
      if (!d.anticipacion) o.push({ level: 'info', msg: 'El Manual pide comprar pasajes con 15 días de anticipación, en clase económica. Si no fue así, explícalo en el motivo.' });
      return o;
    },
    doc: function (d, ctx) {
      return { title: 'Registro del viaje', subtitle: v(d.destino), sheet: 'Registro de viaje', footer: 'Borrador generado con Rinde Fácil. No es un anexo oficial de CORFO: sirve para justificar el viaje y respaldar los certificados de viático (Anexo 4).', blocks: [
        { t: 'kv', rows: [['Comunidad', v(com(ctx).name)], ['Proyecto', v(proj(ctx).name)], ['Destino', d.destino], ['Salida', d.desde ? U.fmtDate(d.desde) : ''], ['Regreso', d.hasta ? U.fmtDate(d.hasta) : ''], ['Por qué el viaje es esencial', d.motivo], ['Pasajes', d.anticipacion ? 'Comprados con 15 días de anticipación, en clase económica.' : 'Sin confirmar.']] },
        { t: 'table', head: ['Nombre completo', 'RUT', 'Rol', 'Por qué es necesaria su presencia'], types: ['text', 'text', 'text', 'text'], rows: (d.asistentes || []).map(function (a) { return [a.nombre, a.rut, a.rol, a.porque]; }) }] };
    }
  };

  /* ============ ANEXO 4 (uno por viajero) ============ */
  SCHEMAS.anexo4 = {
    id: 'anexo4', title: 'Anexo 4 · Certificado de viático', repeat: true, sheet: 'Anexo 4', signers: [{ k: 'viajero', l: 'Firma de quien viaja' }, { k: 'rep', l: 'Firma de quien representa a la comunidad' }], anexoN: 4, addLabel: 'Nuevo certificado', itemName: function (d) { return (d.viajero || 'Falta el nombre') + (d.total ? ' · ' + U.fmtCLP(d.total) : ''); },
    defaults: function (ctx) { return { viajero: '', comunidad: v(com(ctx).name), proyectoCodigo: v(proj(ctx).code), proyectoNombre: v(proj(ctx).name), ciudad: '', fecha: U.todayISO(), repNombre: v(com(ctx).legalRep), medioPago: 'transferencia', fechaPago: '', filas: [{}], total: 0 }; },
    autoCols: ['dias', 'desde', 'hasta'],
    fields: [
      { k: 'viajero', l: 'Nombre completo de quien viaja', t: 'text', ph: 'Ej: María Pérez González', hint: 'Escríbelo primero: es el nombre con que se guarda el certificado.' },
      { k: 'comunidad', l: 'Comunidad que paga el viático', t: 'choice', options: commNames },
      { k: 'proyectoNombre', l: 'Proyecto', t: 'choice', options: projectNames }, { k: 'proyectoCodigo', l: 'Código del proyecto', t: 'text', hint: 'Se rellena solo al elegir el proyecto.' },
      { k: 'filas', l: 'Viajes', t: 'table', add: 'Agregar viaje', cols: [
        { k: 'destino', l: 'Destino del viaje', t: 'text', tip: 'El lugar al que viajó la persona. No es la ciudad donde se firma el certificado: esa va más abajo.' },
        { k: 'dias', l: 'N° de días', t: 'number' }, { k: 'desde', l: 'Inicio', t: 'date' }, { k: 'hasta', l: 'Término', t: 'date', tip: 'Si escribes el inicio y los días, el término se calcula solo. Si escribes inicio y término, se calculan los días.' },
        { k: 'montoDia', l: 'Monto por día', t: 'money' }, { k: 'monto', l: 'Monto del viático', t: 'calc', fmt: 'money' }] },
      { k: 'total', l: 'Total del viático', t: 'calc', fmt: 'money' },
      { k: 'medioPago', l: 'Cómo recibió el pago', t: 'select', options: [{ id: 'transferencia', name: 'Transferencia bancaria' }, { id: 'efectivo', name: 'Efectivo' }] }, { k: 'fechaPago', l: 'Fecha del pago', t: 'date' },
      { k: 'repNombre', l: 'Quién representa a la comunidad y firma', t: 'choice', options: repNames },
      { k: 'ciudad', l: 'Ciudad donde se firma el certificado', t: 'text', hint: 'No es el destino del viaje.' }, { k: 'fecha', l: 'Fecha del certificado', t: 'date' }
    ],
    onChange: function (k, d) { projectFill(k, d); },
    derive: function (d) {
      (d.filas || []).forEach(function (r) {
        var last = r._last, dd = Number(r.dias) || 0;
        if (last === 'hasta' && r.desde && r.hasta && r.hasta >= r.desde) r.dias = U.diffDays(r.desde, r.hasta) + 1;
        else if ((last === 'dias' || last === 'desde') && r.desde && dd > 0) r.hasta = U.addDays(r.desde, dd - 1);
        else if (r.desde && r.hasta && r.hasta >= r.desde && !dd) r.dias = U.diffDays(r.desde, r.hasta) + 1;
        else if (r.desde && dd > 0 && !r.hasta) r.hasta = U.addDays(r.desde, dd - 1);
        else if (!r.desde && r.hasta && dd > 0) r.desde = U.addDays(r.hasta, -(dd - 1));
        r.monto = Math.round((Number(r.dias) || 0) * num(r.montoDia));
      });
      d.total = U.sum(d.filas || [], function (r) { return r.monto; });
    },
    check: function (d) { var o = []; if (!d.viajero) o.push({ level: 'error', msg: 'Falta el nombre de quien viaja.' }); (d.filas || []).forEach(function (r, i) { if (r.desde && r.hasta && r.hasta < r.desde) o.push({ level: 'error', msg: 'Viaje ' + (i + 1) + ': el término es anterior al inicio.' }); }); if (!(d.total > 0)) o.push({ level: 'warn', msg: 'El total del viático es cero.' }); o.push({ level: 'info', msg: 'Recuerda: el monto diario no puede superar los topes del DFL 262/1977 (Manual p. 15).' }); return o; },
    doc: function (d) {
      return { title: 'Certificado de viático', sheet: 'Anexo 4', footer: foot('el Anexo N° 4'), blocks: [
        { t: 'p', text: v(d.ciudad, '[Ciudad]') + ', ' + (d.fecha ? U.fmtDate(d.fecha) : '[fecha]') },
        { t: 'p', text: v(d.comunidad, '[nombre de la Comunidad otorgante del viático]') + ', en el proyecto ' + v(d.proyectoCodigo, '[código del proyecto]') + ', denominado «' + v(d.proyectoNombre, '[nombre del proyecto]') + '», ha pagado a ' + v(d.viajero, '[nombre viajero(a)]') + ', la suma de ' + U.fmtCLP(d.total || 0) + ' por concepto de viático, por cuanto ha debido trasladarse fuera del lugar de desempeño habitual de sus funciones:' },
        { t: 'table', head: ['Destino', 'Fecha de inicio del viaje', 'Fecha de término del viaje', 'N° de días totales de viático', 'Monto por día ($)', 'Monto de asignación del viático ($)'], types: ['text', 'date', 'date', 'num', 'money', 'money'],
          rows: (d.filas || []).map(function (r) { return [r.destino, r.desde, r.hasta, r.dias === '' ? '' : Number(r.dias), num(r.montoDia), r.monto]; }), foot: ['TOTAL', '', '', '', '', 'SUM'] },
        { t: 'p', text: 'El/La Sr.(a.) ' + v(d.viajero, '[nombre viajero(a)]') + ', declara haber recibido los montos antes señalados, mediante ' + (d.medioPago === 'efectivo' ? 'pago en efectivo' : 'transferencia bancaria') + ', con fecha ' + (d.fechaPago ? U.fmtDate(d.fechaPago) : '[fecha]') + ', por concepto de viático.' },
        { t: 'p', text: 'Asimismo, declara estar en conocimiento de lo dispuesto en las instrucciones dadas por Corfo, en el sentido que, si se detectare que la información entregada es falsa, se podrá solicitar la restitución de los recursos indebidamente rendidos, sin perjuicio del ejercicio de las acciones que se indican en el Convenio suscrito con Corfo.' },
        { t: 'sign', labels: ['Firma · ' + v(d.viajero, 'Viajero(a)'), 'Firma · ' + v(d.repNombre, 'Representante de la Comunidad')] }
      ] };
    }
  };

  /* ============ ANEXO 5 ============ */
  var CONCEPTOS_USO = ['Luz', 'Agua', 'Internet', 'Teléfono', 'Gas', 'Arriendo', 'Gastos de oficina (impresiones, correos, notaría)', 'Otro'];
  var CONCEPTOS_HH = ['Contador', 'Secretaria', 'Contraparte administrativa-financiera', 'Otro'];
  function a5Gastos(ctx) { return [{ id: '', name: 'Elige el gasto' }].concat(((ctx.project && ctx.project.expenses) || []).filter(function (e) { return e.cuenta === 'administracion' && (e.proveedor || e.total); }).map(function (e) { return { id: e.id, name: (e.proveedor || 'Sin proveedor') + ' · ' + (e.folio || 's/n') + ' · ' + U.fmtCLP(e.total) }; })); }
  function a5Cols(kind) {
    var lista = kind === 'uso' ? CONCEPTOS_USO : CONCEPTOS_HH;
    return [
      { k: 'gastoId', l: 'Gasto', t: 'select', options: a5Gastos, tip: 'Elige el gasto que anotaste en «Gastos y rendición» (cuenta Administración): el N° de documento, el monto y el mes se rellenan solos.' },
      { k: 'concepto', l: 'Concepto', t: 'select', options: lista.map(function (x) { return { id: x, name: x }; }), tip: 'Qué es el gasto. Si no está en la lista, elige «Otro» y escríbelo en la columna siguiente.' },
      { k: 'conceptoOtro', l: 'Si es «Otro», cuál', t: 'text' },
      { k: 'periodo', l: 'Mes', t: 'month' }, { k: 'doc', l: 'N° del documento', t: 'text' },
      { k: 'monto', l: 'Monto del documento ($)', t: 'money', tip: 'Si recuperas el IVA, el monto neto; si no, el total.' },
      { k: 'pct', l: kind === 'uso' ? '% que usa el proyecto' : '% de su tiempo en el proyecto', t: 'pct', tip: kind === 'uso' ? 'Qué parte del gasto corresponde a este proyecto. Ej: la cuenta de luz es de $100.000 y el proyecto usa el 30 %: se rinden $30.000.' : 'Qué parte del tiempo de la persona o servicio se dedica a este proyecto. Ej: el contador cobra $80.000 y dedica el 20 % al proyecto: se rinden $16.000.' },
      { k: 'aRendir', l: 'Monto a rendir al proyecto', t: 'calc', fmt: 'money' }];
  }
  var CONCEPTO_GUESS = [[/luz|electric/i, 'Luz'], [/agua/i, 'Agua'], [/internet|wifi|fibra/i, 'Internet'], [/telef|celular|movil/i, 'Teléfono'], [/\bgas\b/i, 'Gas'], [/arriendo|alquiler/i, 'Arriendo'], [/conta/i, 'Contador'], [/secretar/i, 'Secretaria']];
  SCHEMAS.anexo5 = {
    id: 'anexo5', title: 'Anexo 5 · Memoria de cálculo de gastos de administración', repeat: false, sheet: 'Anexo 5',
    defaults: function (ctx) { return { proyectoNombre: v(proj(ctx).name), comunidadNombre: v(com(ctx).name), uso: [{}], hh: [], totalUso: 0, totalHH: 0 }; },
    autoCols: ['concepto', 'periodo', 'doc', 'monto', 'pct'],
    fields: [
      { k: 'proyectoNombre', l: 'Proyecto (según el PEA)', t: 'choice', options: projectNames },
      { k: 'uso', l: 'Gastos que se reparten según el uso (luz, agua, internet, arriendo…)', t: 'table', add: 'Agregar gasto', cols: a5Cols('uso') },
      { k: 'totalUso', l: 'Total por uso', t: 'calc', fmt: 'money' },
      { k: 'hh', l: 'Gastos que se reparten según las horas de trabajo dedicadas al proyecto (contador, secretaria…)', t: 'table', add: 'Agregar persona o servicio', cols: a5Cols('hh'), hint: 'El Manual los llama «horas HH» (horas hombre).' },
      { k: 'totalHH', l: 'Total por horas de trabajo', t: 'calc', fmt: 'money' }
    ],
    onCell: function (fk, ck, row, data, ctx) {
      if (ck !== 'gastoId') return;
      var e = ((ctx.project && ctx.project.expenses) || []).filter(function (x) { return x.id === row.gastoId; })[0]; if (!e) return;
      row.doc = e.folio || row.doc || ''; row.monto = ctx.community && ctx.community.ivaModo === 'recupera' && num(e.neto) ? num(e.neto) : num(e.total); row.periodo = String(e.fecha || '').slice(0, 7) || row.periodo;
      if (e.pctUso !== '' && e.pctUso != null && Number(e.pctUso) > 0) row.pct = Number(e.pctUso);
      if (!row.concepto) { var txt = [e.glosa, e.proveedor, e.nombreComercial].join(' '); CONCEPTO_GUESS.forEach(function (g) { if (!row.concepto && g[0].test(txt)) row.concepto = g[1]; }); }
    },
    onChange: function (k, d) { projectFill(k, d); },
    derive: function (d) {
      ['uso', 'hh'].forEach(function (k) { (d[k] || []).forEach(function (r) { r.aRendir = Math.round(num(r.monto) * (Number(r.pct) || 0) / 100); }); });
      d.totalUso = U.sum(d.uso || [], function (r) { return r.aRendir; }); d.totalHH = U.sum(d.hh || [], function (r) { return r.aRendir; });
    },
    check: function (d, ctx) {
      var o = []; var n = (d.uso || []).length + (d.hh || []).length;
      if (!n) o.push({ level: 'warn', msg: 'Agrega al menos un gasto.' });
      ['uso', 'hh'].forEach(function (k) { (d[k] || []).forEach(function (r, i) { if (Number(r.pct) > 100) o.push({ level: 'error', msg: (k === 'uso' ? 'Uso' : 'HH') + ' fila ' + (i + 1) + ': el porcentaje no puede pasar de 100.' }); if (r.monto && !r.pct) o.push({ level: 'warn', msg: (k === 'uso' ? 'Uso' : 'HH') + ' fila ' + (i + 1) + ': falta el porcentaje.' }); }); });
      if (ctx && ctx.community && ctx.community.ivaModo === 'recupera') o.push({ level: 'info', msg: 'Como recuperas el IVA, anota el monto neto de cada documento.' });
      return o;
    },
    doc: function (d) {
      var mk = function (rows) { return rows.map(function (r) { return [r.concepto === 'Otro' ? v(r.conceptoOtro, 'Otro') : r.concepto, v(r.comunidad, d.comunidadNombre), r.periodo, r.doc, num(r.monto), r.pct === '' || r.pct == null ? '' : Number(r.pct), r.aRendir]; }); };
      var head = ['Concepto del gasto', 'Nombre comunidad', 'Período mensual', 'N° del documento', 'Monto del documento de respaldo ($)', '% de uso', 'Monto a rendir al proyecto ($)'];
      var types = ['text', 'text', 'text', 'text', 'money', 'pct', 'money'];
      return { title: 'Memoria de cálculo para gastos de administración', subtitle: 'Por valor de uso · Proyecto «' + v(d.proyectoNombre, '[proyecto]') + '» de acuerdo con el Programa de Ejecución de Actividades', sheet: 'Anexo 5', footer: foot('el Anexo N° 5') + ' Monto del documento de respaldo: si recuperas el IVA CF, ingresa el valor neto.', blocks: [
        { t: 'h', text: 'Por valor de uso del proyecto' }, { t: 'table', head: head, types: types, rows: mk(d.uso || []), foot: ['TOTAL', '', '', '', '', '', 'SUM'] },
        { t: 'h', text: 'Por cantidad de horas HH' }, { t: 'table', head: head.map(function (x) { return x === '% de uso' ? '% de participación' : x; }), types: types, rows: mk(d.hh || []), foot: ['TOTAL', '', '', '', '', '', 'SUM'] }
      ] };
    }
  };

  /* ============ ANEXO 6: informe técnico ============ */
  SCHEMAS.informe = {
    id: 'informe', title: 'Anexo 6 · Informe de seguimiento técnico', repeat: false, sheet: 'Informe técnico',
    defaults: function (ctx) { return { proyectoNombre: v(proj(ctx).name), nInforme: '', comunidad: v(com(ctx).name), proyectoCodigo: v(proj(ctx).code), fechaInforme: U.todayISO(), elaboradoPor: '', fechaInicio: v(proj(ctx).start), fechaTermino: v(proj(ctx).end), fechaTransferencia: v(proj(ctx).desembolso1), periodoInicio: v(proj(ctx).periodoInicio), periodoFin: v(proj(ctx).periodoFin), responsableCorreo: '', responsableTel: '', comunidadRut: v(com(ctx).rut), direccion: v(com(ctx).address), repLegal: v(com(ctx).legalRep), repCorreo: v(com(ctx).email), repTel: v(com(ctx).phone), oc: v(com(ctx).oc, 'Organismo Colaborador'), objetivoGeneral: '', objetivosEspecificos: '', resumen: '' }; },
    fields: [
      { k: 'proyectoNombre', l: 'Nombre del proyecto (según el PEA)', t: 'text' }, { k: 'nInforme', l: 'Informe técnico N°', t: 'text' }, { k: 'comunidad', l: 'Nombre de la comunidad', t: 'text' }, { k: 'proyectoCodigo', l: 'Código del proyecto', t: 'text' },
      { k: 'fechaInforme', l: 'Fecha del informe', t: 'date' }, { k: 'elaboradoPor', l: 'Elaborado por (responsable en la comunidad)', t: 'text' },
      { k: 'fechaInicio', l: 'Fecha de inicio del proyecto', t: 'date' }, { k: 'fechaTermino', l: 'Fecha estimada de término', t: 'date' }, { k: 'fechaTransferencia', l: 'Fecha de transferencia de recursos para el hito que informas', t: 'date' },
      { k: 'periodoInicio', l: 'Período del informe: desde', t: 'date' }, { k: 'periodoFin', l: 'hasta', t: 'date' },
      { k: 'responsableCorreo', l: 'Correo de quien elabora', t: 'text' }, { k: 'responsableTel', l: 'Teléfono de quien elabora', t: 'text' },
      { k: 'comunidadRut', l: 'RUT de la comunidad', t: 'rut' }, { k: 'direccion', l: 'Dirección de la comunidad', t: 'text' },
      { k: 'repLegal', l: 'Representante legal', t: 'text' }, { k: 'repCorreo', l: 'Correo del representante', t: 'text' }, { k: 'repTel', l: 'Teléfono del representante', t: 'text' }, { k: 'oc', l: 'Organismo Colaborador que apoyó', t: 'text' },
      { k: 'objetivoGeneral', l: 'Objetivo general del proyecto', t: 'textarea' }, { k: 'objetivosEspecificos', l: 'Objetivos específicos', t: 'textarea', rows: 4 },
      { k: 'resumen', l: 'Resumen de lo que hiciste en el período (etapa o hitos comprometidos en el PEA)', t: 'textarea', rows: 5 }
    ],
    check: function (d) { var o = []; if (!d.objetivoGeneral) o.push({ level: 'warn', msg: 'Falta el objetivo general.' }); if (!d.resumen) o.push({ level: 'warn', msg: 'Falta el resumen de actividades del período.' }); return o; },
    doc: function (d, ctx) { return informeDoc(d, ctx, false); }
  };
  function fichaBlocks(kind, list) {
    var out = [];
    var titles = { informeA: 'Actividad ejecutada por la comunidad', informeB: 'Estudio o consultoría', informeC: 'Infraestructura, inmueble o activo', informeD: 'Recursos humanos', informeE: 'Otra actividad' };
    list.forEach(function (f, i) {
      var d = f.data || {}, rows = [];
      if (kind === 'informeA') rows = [['Nombre de la actividad', d.nombre], ['Fecha de ejecución', d.fecha ? U.fmtDate(d.fecha) : ''], ['Lugar de realización', d.lugar], ['N° de asistentes', d.asistentes], ['Monto total presupuestado ($)', d.presupuestado === '' ? '' : U.fmtCLP(num(d.presupuestado))], ['Monto total rendido acumulado ($)', d.rendido === '' ? '' : U.fmtCLP(num(d.rendido))], ['Objetivos y descripción de la actividad', d.objetivos], ['Forma de adquisición', d.formaAdq], ['Proveedores', d.proveedores], ['Descripción de los participantes', d.participantes], ['Descripción de lo realizado o avance', d.descripcion]];
      if (kind === 'informeB') rows = [['Nombre del estudio / consultoría', d.nombre], ['Monto total presupuestado ($)', d.presupuestado === '' ? '' : U.fmtCLP(num(d.presupuestado))], ['Monto total adjudicado ($)', d.adjudicado === '' ? '' : U.fmtCLP(num(d.adjudicado))], ['Nombre del proveedor', d.proveedor], ['Período de contratación', (d.desde ? U.fmtDateShort(d.desde) : '') + (d.hasta ? ' al ' + U.fmtDateShort(d.hasta) : '')], ['Objetivo general de la contratación', d.objetivo], ['Entregables', d.entregables], ['Descripción de lo realizado o avance', d.descripcion]];
      if (kind === 'informeC') rows = [['Nombre del activo / edificación', d.nombre], ['Objetivos de la adquisición', d.objetivos], ['Características técnicas', d.caracteristicas], ['Forma de adquisición', d.formaAdq], ['Monto total presupuestado ($)', d.presupuestado === '' ? '' : U.fmtCLP(num(d.presupuestado))], ['Monto total rendido acumulado ($)', d.rendido === '' ? '' : U.fmtCLP(num(d.rendido))], ['Nombre del proveedor', d.proveedor], ['Período de ejecución', (d.desde ? U.fmtDateShort(d.desde) : '') + (d.hasta ? ' al ' + U.fmtDateShort(d.hasta) : '')], ['Descripción de lo realizado o avance', d.descripcion]];
      if (kind === 'informeD') rows = [['Nombre completo de la persona', d.nombre], ['Cédula de identidad', d.rut], ['Monto total presupuestado de la contratación ($)', d.presupuestado === '' ? '' : U.fmtCLP(num(d.presupuestado))], ['Monto total rendido acumulado ($)', d.rendido === '' ? '' : U.fmtCLP(num(d.rendido))], ['N° de meses de contratación', d.meses], ['N° de meses ejecutados a la fecha', d.mesesEjec], ['Período de contratación', (d.desde ? U.fmtDateShort(d.desde) : '') + (d.hasta ? ' al ' + U.fmtDateShort(d.hasta) : '')], ['Función en el proyecto', d.funcion], ['Descripción resumida de avances acumulados', d.descripcion], ['Principales actividades o logros del período', d.principales]];
      if (kind === 'informeE') rows = [['Descripción de la actividad y sus objetivos', d.nombre], ['Proveedor', d.proveedor], ['Lugar de realización del servicio', d.lugar], ['Monto total presupuestado ($)', d.presupuestado === '' ? '' : U.fmtCLP(num(d.presupuestado))], ['Monto total rendido acumulado ($)', d.rendido === '' ? '' : U.fmtCLP(num(d.rendido))], ['Forma de contratación', d.formaContratacion], ['Fechas de realización', (d.fechaInicio ? U.fmtDateShort(d.fechaInicio) : '') + (d.fechaTermino ? ' al ' + U.fmtDateShort(d.fechaTermino) : '')], ['Descripción de lo realizado o avance', d.descripcion]];
      out.push({ t: 'h', text: titles[kind] + ' ' + (i + 1) + (d.nombre && kind !== 'informeE' ? ': ' + d.nombre : '') });
      out.push({ t: 'kv', rows: rows.concat(avanceRows(d)) });
    });
    return out;
  }
  function informeDoc(d, ctx, soloFicha) {
    var blocks = [];
    blocks.push({ t: 'kv', rows: [['Proyecto', d.proyectoNombre], ['Informe técnico N°', d.nInforme], ['Comunidad', d.comunidad], ['Código del proyecto', d.proyectoCodigo], ['Fecha del informe', d.fechaInforme ? U.fmtDate(d.fechaInforme) : ''], ['Elaborado por', d.elaboradoPor], ['Fecha de inicio del proyecto', d.fechaInicio ? U.fmtDate(d.fechaInicio) : ''], ['Fecha estimada de término', d.fechaTermino ? U.fmtDate(d.fechaTermino) : ''], ['Fecha de transferencia de recursos del hito reportado', d.fechaTransferencia ? U.fmtDate(d.fechaTransferencia) : '']] });
    blocks.push({ t: 'h', text: 'I. Datos generales del proyecto' });
    blocks.push({ t: 'kv', rows: [['Período del informe', (d.periodoInicio ? U.fmtDate(d.periodoInicio) : '') + (d.periodoFin ? ' al ' + U.fmtDate(d.periodoFin) : '')], ['Responsable de la elaboración', d.elaboradoPor], ['Correo y teléfono del responsable', [d.responsableCorreo, d.responsableTel].filter(Boolean).join(' · ')], ['Nombre de la comunidad', d.comunidad], ['RUT de la comunidad', d.comunidadRut], ['Dirección de la comunidad', d.direccion], ['Representante legal', d.repLegal], ['Contacto del representante', [d.repCorreo, d.repTel].filter(Boolean).join(' · ')], ['Organismo Colaborador que apoyó', d.oc]] });
    blocks.push({ t: 'h', text: 'II. Antecedentes del proyecto' });
    blocks.push({ t: 'kv', rows: [['Objetivo general', d.objetivoGeneral], ['Objetivos específicos', d.objetivosEspecificos]] });
    blocks.push({ t: 'h', text: 'III. Detalle de actividades informadas' });
    blocks.push({ t: 'kv', rows: [['Resumen de actividades del período', d.resumen]] });
    var p = ctx.project;
    ['informeA', 'informeB', 'informeC', 'informeD', 'informeE'].forEach(function (k) { fichaBlocks(k, (p.forms && Array.isArray(p.forms[k]) ? p.forms[k] : [])).forEach(function (b) { blocks.push(b); }); });
    blocks.push({ t: 'note', text: 'Recuerda adjuntar: lista de asistentes firmada (o pantallazo si fue en línea), registro fotográfico (Anexo B del Manual), informes de estudios y permisos de obras, según corresponda.' });
    return { title: 'Informe de seguimiento técnico de avance de ejecución de actividades', subtitle: v(d.proyectoNombre), sheet: 'Informe técnico', footer: foot('el Anexo N° 6'), blocks: blocks };
  }

  function fichaSchema(id, title, kind, fields, defaults, nameFn) {
    return { id: id, title: title, repeat: true, sheet: title, addLabel: 'Nueva ficha', itemName: nameFn || function (d) { return d.nombre || 'Sin nombre'; }, fields: fields.concat(COMMON_AVANCE), defaults: function (ctx) { return Object.assign({ actId: '', avanceProg: '', avanceReal: '', avanceProgAcum: '', avanceRealAcum: '', criterio: '', desviaciones: '', riesgos: '' }, defaults(ctx)); },
      onChange: function (k, d, ctx) { if (k === 'actId') fillMontos(d, ctx); },
      check: function (d) { var o = []; if (!d.nombre) o.push({ level: 'warn', msg: 'Falta el nombre.' }); [d.avanceProg, d.avanceReal, d.avanceProgAcum, d.avanceRealAcum].forEach(function (x) { if (x !== '' && (Number(x) < 0 || Number(x) > 100)) o.push({ level: 'error', msg: 'Los porcentajes de avance van de 0 a 100.' }); }); if (d.avanceReal !== '' && d.avanceProg !== '' && d.avanceReal !== d.avanceProg && !d.desviaciones) o.push({ level: 'info', msg: 'Explica por qué el avance real difiere del programado.' }); return o; },
      doc: function (d, ctx) { return { title: title, subtitle: v(ctx.project.name), sheet: title.slice(0, 28), footer: foot('el Anexo N° 6'), blocks: fichaBlocks(kind, [{ data: d }]).concat([{ t: 'note', text: 'Adjunta el registro fotográfico y la lista de participantes o respaldos que correspondan.' }]) }; } };
  }
  var ACT_SEL = { k: 'actId', l: 'Actividad de tu Carta Gantt (rellena los montos solos)', t: 'actSelect' };
  SCHEMAS.informeA = fichaSchema('informeA', 'Ficha A · Actividad de la comunidad', 'informeA', [ACT_SEL,
    { k: 'nombre', l: 'Nombre de la actividad', t: 'text' }, { k: 'fecha', l: 'Fecha de ejecución', t: 'date' }, { k: 'lugar', l: 'Lugar de realización', t: 'text' }, { k: 'asistentes', l: 'N° de asistentes', t: 'number' },
    { k: 'presupuestado', l: 'Monto total presupuestado ($)', t: 'money' }, { k: 'rendido', l: 'Monto total rendido acumulado ($)', t: 'money' },
    { k: 'objetivos', l: 'Objetivos y descripción de la actividad', t: 'textarea' }, { k: 'formaAdq', l: 'Forma de adquisición', t: 'text' }, { k: 'proveedores', l: 'Proveedores', t: 'text' }, { k: 'participantes', l: 'Quiénes participaron (perfil y cantidad)', t: 'textarea', rows: 2 },
    { k: 'descripcion', l: 'Qué se hizo o cómo va (y conclusiones si ya terminó)', t: 'textarea', rows: 4 }], function () { return { nombre: '', fecha: '', lugar: '', asistentes: '', presupuestado: '', rendido: '', objetivos: '', formaAdq: '', proveedores: '', participantes: '', descripcion: '' }; });
  SCHEMAS.informeB = fichaSchema('informeB', 'Ficha B · Estudio o consultoría', 'informeB', [ACT_SEL,
    { k: 'nombre', l: 'Nombre del estudio o consultoría', t: 'text' }, { k: 'presupuestado', l: 'Monto total presupuestado ($)', t: 'money' }, { k: 'adjudicado', l: 'Monto total adjudicado ($)', t: 'money' }, { k: 'rendido', l: 'Monto rendido acumulado ($)', t: 'money' },
    { k: 'proveedor', l: 'Nombre del proveedor', t: 'text' }, { k: 'desde', l: 'Contratación desde', t: 'date' }, { k: 'hasta', l: 'hasta', t: 'date' },
    { k: 'objetivo', l: 'Objetivo general de la contratación', t: 'textarea', rows: 2 }, { k: 'entregables', l: 'Entregables', t: 'textarea', rows: 2 }, { k: 'descripcion', l: 'Qué se hizo o cómo va', t: 'textarea', rows: 4 }],
    function () { return { nombre: '', presupuestado: '', adjudicado: '', rendido: '', proveedor: '', desde: '', hasta: '', objetivo: '', entregables: '', descripcion: '' }; });
  SCHEMAS.informeC = fichaSchema('informeC', 'Ficha C · Infraestructura, inmueble o activo', 'informeC', [ACT_SEL,
    { k: 'nombre', l: 'Nombre del activo o edificación', t: 'text' }, { k: 'objetivos', l: 'Objetivos de la adquisición', t: 'textarea', rows: 2 }, { k: 'caracteristicas', l: 'Características técnicas', t: 'textarea', rows: 2 }, { k: 'formaAdq', l: 'Forma de adquisición', t: 'text' },
    { k: 'presupuestado', l: 'Monto total presupuestado ($)', t: 'money' }, { k: 'rendido', l: 'Monto rendido acumulado ($)', t: 'money' }, { k: 'proveedor', l: 'Nombre del proveedor', t: 'text' }, { k: 'desde', l: 'Ejecución desde', t: 'date' }, { k: 'hasta', l: 'hasta', t: 'date' },
    { k: 'descripcion', l: 'Qué se hizo o cómo va', t: 'textarea', rows: 4 }], function () { return { gastoId: '', nombre: '', objetivos: '', caracteristicas: '', formaAdq: '', presupuestado: '', rendido: '', proveedor: '', desde: '', hasta: '', descripcion: '' }; });
  SCHEMAS.informeD = fichaSchema('informeD', 'Ficha D · Persona contratada', 'informeD', [ACT_SEL,
    { k: 'nombre', l: 'Nombre completo de la persona', t: 'text' }, { k: 'rut', l: 'Cédula de identidad', t: 'rut' }, { k: 'presupuestado', l: 'Monto presupuestado de la contratación ($)', t: 'money' }, { k: 'rendido', l: 'Monto rendido acumulado ($)', t: 'money' },
    { k: 'meses', l: 'N° de meses de contratación', t: 'number' }, { k: 'mesesEjec', l: 'Meses ejecutados a la fecha', t: 'number' }, { k: 'desde', l: 'Contratación desde', t: 'date' }, { k: 'hasta', l: 'hasta', t: 'date' },
    { k: 'funcion', l: 'Función en el proyecto', t: 'textarea', rows: 2 }, { k: 'descripcion', l: 'Avances acumulados a la fecha', t: 'textarea', rows: 3 }, { k: 'principales', l: 'Principales actividades o logros del período', t: 'textarea', rows: 3 }],
    function () { return { nombre: '', rut: '', presupuestado: '', rendido: '', meses: '', mesesEjec: '', desde: '', hasta: '', funcion: '', descripcion: '', principales: '' }; });
  /* Ficha D (Manual, p. 36-37): todos los campos son los del formato oficial. Lo que se puede calcular se calcula solo, de arriba hacia abajo. */
  var RETENCION = { 2025: 14.5, 2026: 15.25, 2027: 16, 2028: 17 }; /* retención de boletas de honorarios (Ley 21.133, SII); desde 2028 queda en 17 % */
  function retencion(year) { return year >= 2028 ? 17 : (RETENCION[year] != null ? RETENCION[year] : 14.5); }
  function monthsInc(a, b) { if (!a || !b || b < a) return 0; return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)) + 1; }
  function normRut(r) { return String(r || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
  function personExpenses(project, rut) { var k = normRut(rut); if (!k || !project) return []; return (project.expenses || []).filter(function (e) { return e.cuenta === 'rrhh' && normRut(e.rutProveedor) === k; }); }
  function pct(n) { return Math.max(0, Math.min(100, Math.round(n))); }
  function deriveD(d, ctx) {
    if (!d.tipo) d.tipo = 'honorarios';
    var p = ctx.project || {}, pres = num(d.presupuestado), meses = monthsInc(d.desde, d.hasta), today = U.todayISO();
    d.meses = meses || '';
    d.mensualBruto = meses && pres ? Math.round(pres / meses) : 0;
    var year = +(d.desde || today).slice(0, 4), ret = retencion(year);
    d.mensualLiquido = d.tipo === 'honorarios' && d.mensualBruto ? Math.round(d.mensualBruto * (1 - ret / 100)) : 0;
    var pi = p.periodoInicio, pf = p.periodoFin, ov = pi && pf && d.desde && d.hasta ? monthsInc(d.desde > pi ? d.desde : pi, d.hasta < pf ? d.hasta : pf) : 0;
    d.mesesPeriodo = ov;
    d.periodoBruto = d.mensualBruto * ov; d.periodoLiquido = d.mensualLiquido * ov;
    var ej = d.desde && d.desde <= today ? Math.min(meses, monthsInc(d.desde, d.hasta && d.hasta < today ? d.hasta : today)) : 0;
    d.mesesEjec = meses ? ej : '';
    var gastos = personExpenses(p, d.rut), tot = gastos.reduce(function (a, e) { return a + num(e.montoRendir || e.total); }, 0);
    var enPeriodo = gastos.filter(function (e) { return pi && pf && e.fecha >= pi && e.fecha <= pf; }).reduce(function (a, e) { return a + num(e.montoRendir || e.total); }, 0);
    d.rendidoGastos = tot; d.rendido = tot > 0 ? tot : (d.rendidoManual === '' || d.rendidoManual == null ? '' : num(d.rendidoManual));
    d.avanceProgAcum = meses ? pct(ej * 100 / meses) : ''; d.avanceRealAcum = pres && d.rendido !== '' ? pct(num(d.rendido) * 100 / pres) : '';
    d.avanceProg = meses && pi && pf ? pct(ov * 100 / meses) : ''; d.avanceReal = pres && pi && pf ? pct(enPeriodo * 100 / pres) : '';
    d.criterio = 'Programado: meses ejecutados ÷ meses de contratación. Real: monto rendido ÷ monto presupuestado de la contratación.';
  }
  function avanceChart(d) {
    var prog = d.avanceProgAcum === '' ? null : Number(d.avanceProgAcum), real = d.avanceRealAcum === '' ? null : Number(d.avanceRealAcum);
    var wrap = h('div', { class: 'avchart', role: 'img', 'aria-label': 'Avance acumulado: programado ' + (prog == null ? 'sin datos' : prog + ' por ciento') + ', real ' + (real == null ? 'sin datos' : real + ' por ciento') });
    if (prog == null && real == null) { wrap.appendChild(h('p', { class: 'hint' }, 'Cuando pongas las fechas y el monto, aquí se compara lo que debería llevar con lo que lleva de verdad.')); return wrap; }
    wrap.appendChild(h('div', { class: 'av-track' }, h('div', { class: 'av-real', style: { width: (real || 0) + '%' } }), prog != null ? h('div', { class: 'av-prog', style: { left: prog + '%' }, title: 'Programado: ' + prog + ' %' }) : null));
    wrap.appendChild(h('div', { class: 'av-legend' }, h('span', null, h('i', { class: 'av-sw real' }), 'Real (lo rendido): ', h('b', null, real == null ? '—' : real + ' %')), h('span', null, h('i', { class: 'av-sw prog' }), 'Programado (meses transcurridos): ', h('b', null, prog == null ? '—' : prog + ' %'))));
    if (prog != null && real != null && Math.abs(prog - real) > 10) wrap.appendChild(h('p', { class: 'hint' }, real < prog ? 'Vas más lento de lo programado: explica la razón más abajo.' : 'Vas más rápido de lo programado: explica la razón más abajo.'));
    return wrap;
  }
  SCHEMAS.informeE = fichaSchema('informeE', 'Ficha E · Otra actividad', 'informeE', [ACT_SEL,
    { k: 'nombre', l: 'Descripción de la actividad y sus objetivos', t: 'textarea', rows: 2 }, { k: 'proveedor', l: 'Proveedor', t: 'text' }, { k: 'lugar', l: 'Lugar de realización del servicio', t: 'text' },
    { k: 'presupuestado', l: 'Monto total presupuestado ($)', t: 'money' }, { k: 'rendido', l: 'Monto rendido acumulado ($)', t: 'money' }, { k: 'formaContratacion', l: 'Forma de contratación', t: 'text' },
    { k: 'fechaInicio', l: 'Fecha de inicio', t: 'date' }, { k: 'fechaTermino', l: 'Fecha de término', t: 'date' }, { k: 'descripcion', l: 'Qué se hizo o cómo va', t: 'textarea', rows: 4 }],
    function () { return { nombre: '', proveedor: '', lugar: '', presupuestado: '', rendido: '', formaContratacion: '', fechaInicio: '', fechaTermino: '', descripcion: '' }; });

  (function () {
    var sc = SCHEMAS.informeD;
    sc.fields = [
      { k: 'nombre', l: 'Nombre completo de la persona', t: 'text' }, { k: 'rut', l: 'Cédula de identidad', t: 'rut' },
      { k: 'funcion', l: 'Funciones en el proyecto', t: 'textarea', rows: 2, ph: 'Ej: Encargada de los talleres de tejido' },
      { k: 'tipo', l: 'Cómo la contrataron', t: 'select', options: [{ id: 'honorarios', name: 'A honorarios (boleta)' }, { id: 'contrato', name: 'Con contrato de trabajo' }] },
      { k: 'desde', l: 'Contratada desde', t: 'date' }, { k: 'hasta', l: 'hasta', t: 'date' },
      { k: 'presupuestado', l: 'Monto total presupuestado de la contratación ($)', t: 'money' },
      { k: 'meses', l: 'N° de meses de contratación', t: 'calc' },
      { k: 'mensualBruto', l: 'Por mes (bruto)', t: 'calc', fmt: 'money' },
      { k: 'mensualLiquido', l: 'Por mes (líquido, a honorarios)', t: 'calc', fmt: 'money', hint: 'Bruto menos la retención de honorarios del año de inicio (2026: 15,25 %; 2027: 16 %; desde 2028: 17 %). Con contrato, el líquido depende de AFP, salud e impuesto: míralo en la liquidación.' },
      { k: 'periodoBruto', l: 'Lo que recibe en el período que rindes (bruto)', t: 'calc', fmt: 'money' },
      { k: 'periodoLiquido', l: 'Lo que recibe en el período que rindes (líquido, a honorarios)', t: 'calc', fmt: 'money' },
      { k: 'rendidoGastos', l: 'Rendido según los gastos que anotaste (cuenta Recursos humanos, con su RUT)', t: 'calc', fmt: 'money' },
      { k: 'rendidoManual', l: 'Monto rendido a la fecha, si aún no anotas sus gastos ($)', t: 'money' },
      { k: 'mesesEjec', l: 'N° de meses ejecutados a la fecha', t: 'calc' },
      { k: 'avance', l: 'Avance acumulado', t: 'custom' },
      { k: 'descripcion', l: 'Descripción resumida de los avances acumulados a la fecha (y conclusiones si terminó)', t: 'textarea', rows: 3 },
      { k: 'principales', l: 'Principales actividades ejecutadas o logros del período rendido', t: 'textarea', rows: 3 },
      { k: 'desviaciones', l: 'Si el avance real es distinto del programado: por qué', t: 'textarea', rows: 2 },
      { k: 'riesgos', l: 'Riesgos o problemas que causaron atraso (si aplica)', t: 'textarea', rows: 2 }
    ];
    sc.derive = deriveD;
    sc.onChange = function () { };
    var baseDefaults = sc.defaults;
    sc.defaults = function (ctx) { return Object.assign(baseDefaults(ctx), { tipo: 'honorarios', rendidoManual: '', mensualBruto: 0, mensualLiquido: 0, periodoBruto: 0, periodoLiquido: 0, rendidoGastos: 0 }); };
    sc.custom = { avance: avanceChart };
  })();

  /* ============ PEA ============ */
  SCHEMAS.peaGeneral = {
    id: 'peaGeneral', title: 'PEA · 1. Información general del plan', repeat: false, sheet: 'PEA general',
    defaults: function (ctx) { return { comunidad: v(com(ctx).name), rut: v(com(ctx).rut), direccion: v(com(ctx).address), repLegal: v(com(ctx).legalRep), correo: v(com(ctx).email), telefono: v(com(ctx).phone), oc: v(com(ctx).oc, 'Organismo Colaborador'), fechaPrimerPago: v(proj(ctx).desembolso1), resumen: '', objetivos: '', beneficiarios: '', territorio: '' }; },
    fields: [
      { k: 'comunidad', l: 'Nombre de la comunidad', t: 'text' }, { k: 'rut', l: 'RUT', t: 'rut' }, { k: 'direccion', l: 'Dirección', t: 'text' }, { k: 'repLegal', l: 'Representante legal', t: 'text' }, { k: 'correo', l: 'Correo', t: 'text' }, { k: 'telefono', l: 'Teléfono', t: 'text' },
      { k: 'oc', l: 'Organismo Colaborador que apoya', t: 'text' }, { k: 'fechaPrimerPago', l: 'Fecha del primer pago (30 % del AIA)', t: 'date' },
      { k: 'resumen', l: 'Resumen del plan de la comunidad', t: 'textarea', rows: 4 }, { k: 'objetivos', l: 'Objetivos del programa', t: 'textarea', rows: 3 }, { k: 'beneficiarios', l: 'Quiénes se benefician (familias, socios)', t: 'textarea', rows: 2 }, { k: 'territorio', l: 'Dónde se hará (territorio)', t: 'text' }
    ],
    check: function (d) { var o = []; if (!d.resumen) o.push({ level: 'warn', msg: 'Falta el resumen del plan.' }); return o; },
    doc: function (d, ctx) { return { title: 'PEA · Información general del plan', subtitle: 'Borrador de información para presentar a CORFO', sheet: 'PEA general', footer: 'Borrador generado con Rinde Fácil. No es el formulario oficial de CORFO: sirve para reunir y copiar la información. Confirma el formato vigente con tu ejecutivo técnico o con el Organismo Colaborador.', blocks: [{ t: 'kv', rows: [['Comunidad', d.comunidad], ['RUT', d.rut], ['Dirección', d.direccion], ['Representante legal', d.repLegal], ['Contacto', [d.correo, d.telefono].filter(Boolean).join(' · ')], ['Organismo Colaborador', d.oc], ['Fecha del primer pago', d.fechaPrimerPago ? U.fmtDate(d.fechaPrimerPago) : ''], ['Resumen del plan', d.resumen], ['Objetivos del programa', d.objetivos], ['Beneficiarios', d.beneficiarios], ['Territorio', d.territorio]] }] }; }
  };
  SCHEMAS.peaProyecto = {
    id: 'peaProyecto', title: 'PEA · 2. Información por proyecto', repeat: true, sheet: 'PEA proyecto', addLabel: 'Nuevo proyecto en el PEA', itemName: function (d) { return d.nombre || 'Proyecto sin nombre'; },
    defaults: function (ctx) { return { nombre: v(proj(ctx).name), tipo: v(proj(ctx).tipo, 'inversion'), objetivoGeneral: '', objetivosEspecificos: '', descripcion: '', beneficiarios: '', lugar: '', inicio: v(proj(ctx).start), termino: v(proj(ctx).end), resultados: '', riesgos: '', sostenibilidad: '' }; },
    fields: [
      { k: 'nombre', l: 'Nombre del proyecto', t: 'text' }, { k: 'tipo', l: 'Tipo de proyecto', t: 'select', options: RF.data.TIPOS_PROYECTO }, { k: 'objetivoGeneral', l: 'Objetivo general', t: 'textarea', rows: 2 }, { k: 'objetivosEspecificos', l: 'Objetivos específicos', t: 'textarea', rows: 3 },
      { k: 'descripcion', l: 'Descripción del proyecto', t: 'textarea', rows: 4 }, { k: 'beneficiarios', l: 'Quiénes se benefician', t: 'text' }, { k: 'lugar', l: 'Lugar de ejecución', t: 'text' }, { k: 'inicio', l: 'Inicio', t: 'date' }, { k: 'termino', l: 'Término', t: 'date' },
      { k: 'resultados', l: 'Resultados esperados', t: 'textarea', rows: 3 }, { k: 'riesgos', l: 'Riesgos y cómo enfrentarlos', t: 'textarea', rows: 2 }, { k: 'sostenibilidad', l: 'Cómo se mantendrá en el tiempo', t: 'textarea', rows: 2 }
    ],
    check: function (d) { var o = []; if (!d.objetivoGeneral) o.push({ level: 'warn', msg: 'Falta el objetivo general.' }); if (d.inicio && d.termino && d.termino < d.inicio) o.push({ level: 'error', msg: 'El término es anterior al inicio.' }); return o; },
    doc: function (d) { return { title: 'PEA · Proyecto «' + v(d.nombre, 'sin nombre') + '»', subtitle: 'Borrador de información para presentar a CORFO', sheet: 'PEA proyecto', footer: 'Borrador generado con Rinde Fácil. No es el formulario oficial de CORFO.', blocks: [{ t: 'kv', rows: [['Nombre', d.nombre], ['Tipo', (RF.data.TIPOS_PROYECTO.filter(function (x) { return x.id === d.tipo; })[0] || {}).name], ['Objetivo general', d.objetivoGeneral], ['Objetivos específicos', d.objetivosEspecificos], ['Descripción', d.descripcion], ['Beneficiarios', d.beneficiarios], ['Lugar', d.lugar], ['Plazo', (d.inicio ? U.fmtDate(d.inicio) : '') + (d.termino ? ' al ' + U.fmtDate(d.termino) : '')], ['Resultados esperados', d.resultados], ['Riesgos', d.riesgos], ['Sostenibilidad', d.sostenibilidad]] }] }; }
  };

  /* ============ Consulta a CORFO y solicitud de aportes ============ */
  SCHEMAS.consulta = {
    id: 'consulta', title: 'Consulta a CORFO', repeat: false, sheet: 'Consulta',
    defaults: function (ctx) { return { fecha: U.todayISO(), asunto: '', hechos: '', manual: '', impacto: '', pregunta: '', firma: v(com(ctx).legalRep) }; },
    fields: [
      { k: 'asunto', l: 'Asunto', t: 'text', ph: 'Ej: Consulta por compra de camioneta' }, { k: 'hechos', l: 'Qué pasó o qué quieren hacer', t: 'textarea', rows: 4 },
      { k: 'manual', l: 'Parte del Manual o del convenio que genera la duda', t: 'text', ph: 'Ej: Manual, sección VII (p. 8)' }, { k: 'impacto', l: 'Cuánto dinero o plazo está en juego', t: 'text' },
      { k: 'pregunta', l: 'Tu pregunta concreta', t: 'textarea', rows: 3 }, { k: 'firma', l: 'Quién firma', t: 'text' }
    ],
    check: function (d) { var o = []; if (!d.pregunta) o.push({ level: 'warn', msg: 'Escribe tu pregunta.' }); return o; },
    doc: function (d, ctx) { return { title: 'Consulta a CORFO', subtitle: v(d.asunto), sheet: 'Consulta', footer: 'Borrador generado con Rinde Fácil. Envíalo a tu ejecutivo técnico de CORFO (con copia al Organismo Colaborador si quieres apoyo) y guarda la respuesta en tu expediente.', blocks: [{ t: 'p', text: 'Fecha: ' + (d.fecha ? U.fmtDate(d.fecha) : '') }, { t: 'p', text: 'Estimado(a) ejecutivo(a) técnico(a):' }, { t: 'p', text: 'Junto con saludar, le escribimos desde ' + v(ctx.community.name, '[comunidad]') + (proj(ctx).code ? ' (proyecto ' + proj(ctx).code + ')' : '') + ' para consultar lo siguiente.' }, { t: 'h', text: 'Situación' }, { t: 'p', text: v(d.hechos, '[describa los hechos]') }, { t: 'h', text: 'Norma que genera la duda' }, { t: 'p', text: v(d.manual, '[indique la parte del Manual o del convenio]') }, { t: 'h', text: 'Impacto' }, { t: 'p', text: v(d.impacto, '[monto o plazo involucrado]') }, { t: 'h', text: 'Consulta' }, { t: 'p', text: v(d.pregunta, '[su pregunta]') }, { t: 'p', text: 'Agradecemos su respuesta antes de ejecutar el gasto.' }, { t: 'sign', labels: [v(d.firma, 'Nombre')] }] }; }
  };
  SCHEMAS.prorroga = {
    id: 'prorroga', title: 'Solicitud de prórroga del PEA', repeat: false, sheet: 'Prórroga',
    defaults: function (ctx) { var pd = ctx.project && RF.logic.peaDeadline ? RF.logic.peaDeadline(ctx.project, '') : null; return { fecha: U.todayISO(), vencimiento: pd ? pd.fin : '', dias: 30, motivo: '', antecedentes: '', firma: v(com(ctx).legalRep) }; },
    fields: [
      { k: 'vencimiento', l: 'Fecha en que vence el plazo del PEA', t: 'date' }, { k: 'dias', l: 'Días que pides (máximo 30)', t: 'number', min: 1, max: 30 },
      { k: 'motivo', l: 'Por qué necesitas más tiempo', t: 'textarea', rows: 5 }, { k: 'antecedentes', l: 'Antecedentes que adjuntas (uno por línea, si los hay)', t: 'textarea', rows: 3 }, { k: 'firma', l: 'Quién firma', t: 'text' }
    ],
    check: function (d) {
      var o = [], today = U.todayISO();
      if (!d.motivo) o.push({ level: 'warn', msg: 'Explica por qué necesitas más tiempo: la solicitud tiene que ser fundada.' });
      if (d.dias && (Number(d.dias) < 1 || Number(d.dias) > 30)) o.push({ level: 'error', msg: 'La prórroga es de hasta 30 días.' });
      if (d.vencimiento && today > d.vencimiento) o.push({ level: 'error', msg: 'El plazo del PEA ya venció. La prórroga se pide antes de que venza.' });
      o.push({ level: 'info', msg: 'Se concede una sola vez. El flujograma no dice el canal ni los antecedentes que se adjuntan: confirma con tu ejecutivo técnico antes de enviarla.' });
      return o;
    },
    doc: function (d, ctx) {
      var nuevo = d.vencimiento && d.dias ? U.addDays(d.vencimiento, Number(d.dias)) : '';
      return { title: 'Solicitud de prórroga del plazo del PEA', sheet: 'Prórroga', footer: 'Borrador generado con Rinde Fácil. No es un formato oficial: confirma el canal y los antecedentes con tu ejecutivo técnico de CORFO.', blocks: [{ t: 'p', text: 'Fecha: ' + (d.fecha ? U.fmtDate(d.fecha) : '') }, { t: 'p', text: 'Estimado(a) ejecutivo(a) técnico(a):' },
        { t: 'p', text: 'Junto con saludar, ' + v(ctx.community.name, '[comunidad]') + (ctx.community.rut ? ' (RUT ' + ctx.community.rut + ')' : '') + ' solicita la prórroga del plazo para presentar el Programa de Ejecución de Actividades (PEA)' + (d.dias ? ', por ' + d.dias + ' días' : '') + (d.vencimiento ? '. El plazo vence el ' + U.fmtDate(d.vencimiento) + (nuevo ? ' y con la prórroga pasaría al ' + U.fmtDate(nuevo) : '') : '') + '.' },
        { t: 'h', text: 'Fundamento' }, { t: 'p', text: v(d.motivo, '[explique por qué necesita más tiempo]') },
        { t: 'h', text: 'Antecedentes que se adjuntan' }, { t: 'p', text: v(d.antecedentes, 'Ninguno.') },
        { t: 'p', text: 'Quedamos atentos a su respuesta.' }, { t: 'sign', labels: [v(d.firma, 'Nombre')] }] };
    }
  };
  SCHEMAS.solicitud = {
    id: 'solicitud', title: 'Solicitud de aportes restantes del AIA', repeat: false, sheet: 'Solicitud',
    defaults: function (ctx) { return { fecha: U.todayISO(), destinatario: 'Novandino Litio (ex SQM Litio)', cierreRevision: '', comentario: '', firma: v(com(ctx).legalRep) }; },
    fields: [
      { k: 'destinatario', l: 'A quién va dirigida', t: 'text' }, { k: 'cierreRevision', l: 'Fecha en que CORFO finalizó la revisión de tu rendición', t: 'date' },
      { k: 'comentario', l: 'Comentario adicional (opcional)', t: 'textarea', rows: 3 }, { k: 'firma', l: 'Quién firma', t: 'text' }
    ],
    check: function (d, ctx) { var o = []; if (!d.cierreRevision) o.push({ level: 'error', msg: 'Sin la fecha de cierre de la revisión de CORFO no deberías pedir los aportes restantes.' }); o.push({ level: 'info', msg: 'El flujograma no dice a qué canal ni con qué formato se hace esta solicitud. Confirma con tu ejecutivo técnico o con el Organismo Colaborador antes de enviarla.' }); return o; },
    doc: function (d, ctx) { return { title: 'Solicitud de aportes restantes del AIA', sheet: 'Solicitud', footer: 'Borrador generado con Rinde Fácil. No es un formato oficial: confirma el canal y los requisitos con CORFO o con el Organismo Colaborador.', blocks: [{ t: 'p', text: 'Fecha: ' + (d.fecha ? U.fmtDate(d.fecha) : '') }, { t: 'p', text: 'Para: ' + v(d.destinatario) }, { t: 'p', text: 'Por medio de la presente, ' + v(ctx.community.name, '[comunidad]') + (ctx.community.rut ? ' (RUT ' + ctx.community.rut + ')' : '') + ' solicita los aportes restantes del Aporte Inicial Atribuible (AIA)' + (proj(ctx).code ? ' correspondientes al proyecto ' + proj(ctx).code : '') + ', una vez que CORFO ' + (d.cierreRevision ? 'finalizó, con fecha ' + U.fmtDate(d.cierreRevision) + ',' : 'finalice') + ' la revisión de nuestra rendición.' }, d.comentario ? { t: 'p', text: d.comentario } : { t: 'p', text: '' }, { t: 'sign', labels: [v(d.firma, 'Nombre y firma')] }] }; }
  };

  /* ============ Motor de formularios (interfaz) ============ */
  /* lo que impide dar por listo un documento: errores de revisión y falta de firma */
  function errors(ids, ctx) {
    var out = [];
    (ids || []).forEach(function (id) {
      var sc = SCHEMAS[id]; if (!sc) return;
      if (sc.repeat) {
        var list = getList(ctx.project, id);
        if (!list.length) { out.push('crea al menos un documento de «' + sc.title + '»'); return; }
        list.forEach(function (f) { var nm = sc.itemName(f.data); (sc.check ? sc.check(f.data, ctx) : []).concat(signIssues(sc, f.data)).forEach(function (i) { if (i.level === 'error') out.push(nm + ': ' + i.msg); }); });
      } else {
        var d = getSingle(ctx.project, id); (sc.check ? sc.check(d, ctx) : []).concat(signIssues(sc, d)).forEach(function (i) { if (i.level === 'error') out.push(i.msg); });
      }
    });
    return out;
  }
  var PRESELECT = {};
  /* crea una ficha con datos de un gasto (si ya existe una de ese gasto o de esa persona, la abre) y devuelve su id */
  function ficha(project, id, match, patch) {
    var list = getList(project, id), hit = list.filter(function (f) { return match(f.data || {}); })[0];
    if (!hit) { var ctx = { project: project, community: RF.store.get().community }, sc = SCHEMAS[id], d = Object.assign(sc.defaults(ctx), patch); if (id === 'informeC' && d.actId) fillMontos(d, ctx); if (sc.derive) sc.derive(d, ctx); hit = { id: U.uid('f'), data: d }; list.push(hit); RF.store.update(function () { }, { silent: true }); }
    PRESELECT[id] = hit.id; return { id: hit.id };
  }
  function ctxNow() { var s = RF.store.get(); return { project: RF.store.project(), community: s.community, state: s }; }
  function getSingle(project, id) {
    var sc = SCHEMAS[id];
    if (!project.forms[id] || !project.forms[id].data) project.forms[id] = { data: sc.defaults({ project: project, community: RF.store.get().community }) };
    return project.forms[id].data;
  }
  function getList(project, id) { if (!Array.isArray(project.forms[id])) project.forms[id] = []; return project.forms[id]; }
  function docOf(id, data, ctx) {
    var sc = SCHEMAS[id]; if (sc.derive) sc.derive(data, ctx); var doc = sc.doc(data, ctx);
    if (sc.signers && data.firmas) (doc.blocks || []).forEach(function (b) { if (b.t === 'sign') b.images = sc.signers.map(function (x) { return data.firmas[x.k] || ''; }); });
    return doc;
  }

  function renderFieldSet(sc, data, ctx, onAny) {
    var wrap = h('div', { class: 'form-grid' });
    var refreshers = [];
    function changed(k) {
      if (sc.onChange) sc.onChange(k, data, ctx);
      if (sc.derive) sc.derive(data, ctx);
      refreshers.forEach(function (f) { f(); });
      RF.store.update(function () {}, { silent: true });
      if (onAny) onAny(k);
    }
    sc.fields.forEach(function (f) {
      var el;
      if (f.t === 'table') { el = renderTable(sc, f, data, ctx, changed, refreshers); wrap.appendChild(h('div', { class: 'field wide' }, h('span', { class: 'lbl' }, f.l), el)); return; }
      if (f.t === 'choice') { /* lista de opciones con «Otro (escribir)»: nada de teclear el nombre de un proyecto y equivocarse en una letra */
        var copts = (typeof f.options === 'function' ? f.options(ctx) : f.options || []).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        var csel = h('select', { 'aria-label': f.l }, copts.map(function (o) { return h('option', { value: o }, o); }), h('option', { value: '__otro' }, 'Otro (escribir)'));
        var ctxt = h('input', { type: 'text', placeholder: 'Escríbelo aquí', 'aria-label': f.l + ' (otro)' });
        var cur = data[f.k] == null ? '' : String(data[f.k]);
        if (cur && copts.indexOf(cur) >= 0) csel.value = cur; else if (cur) { csel.value = '__otro'; ctxt.value = cur; } else if (copts.length) { csel.value = copts[0]; data[f.k] = copts[0]; } else csel.value = '__otro';
        function showTxt() { ctxt.hidden = csel.value !== '__otro'; }
        showTxt();
        csel.addEventListener('change', function () { showTxt(); data[f.k] = csel.value === '__otro' ? ctxt.value : csel.value; changed(f.k); });
        ctxt.addEventListener('input', function () { data[f.k] = ctxt.value; changed(f.k); });
        wrap.appendChild(UI.labelWrap(f.l, h('div', { class: 'choice-wrap' }, csel, ctxt), f.hint, f.cls));
        return;
      }
      if (f.t === 'custom') {
        var holder = h('div', { class: 'field wide' }, h('span', { class: 'lbl' }, f.l)), body = h('div');
        var paintC = function () { U.clear(body); body.appendChild(sc.custom[f.k](data, ctx)); };
        holder.appendChild(body); refreshers.push(paintC); paintC(); wrap.appendChild(holder); return;
      }
      if (f.t === 'calc') {
        var out = h('output', { class: 'calc' });
        var upd = function () { out.textContent = f.fmt === 'money' ? U.fmtCLP(data[f.k] || 0) : String(data[f.k] == null || data[f.k] === '' ? '—' : data[f.k]); };
        refreshers.push(upd); upd();
        wrap.appendChild(h('div', { class: 'field calc-field' }, h('span', { class: 'lbl' }, f.l), out, f.hint ? h('span', { class: 'hint' }, f.hint) : null)); return;
      }
      if (f.t === 'actSelect' || f.t === 'expenseSelect') {
        var opts = f.t === 'actSelect' ? actOptions(ctx) : [{ id: '', name: 'Ninguno' }].concat((ctx.project.expenses || []).filter(f.filter || function () { return true; }).map(function (e) { return { id: e.id, name: (e.proveedor || 'Sin proveedor') + ' · ' + U.fmtCLP(e.total) + ' · ' + (e.folio || 's/n') }; }));
        /* al elegir actividad o gasto se rellenan otros campos: quien dibuja la ficha se entera por el evento "change" (ver renderRepeat) */
        var sel = UI.bind(data, f.k, { type: 'select', options: opts, noEmpty: true, onChange: function () { changed(f.k); }, aria: f.l });
        wrap.appendChild(UI.labelWrap(f.l, sel, null, 'wide')); return;
      }
      var type = f.t === 'month' ? 'text' : f.t;
      var cls = (f.t === 'textarea' ? 'wide' : '');
      var fld = UI.field(f.l, data, f.k, { type: type, ph: f.ph, rows: f.rows, hint: f.hint, cls: cls, options: f.options, noEmpty: f.noEmpty !== false && !!f.options, counter: f.counter, onChange: function () { changed(f.k); } });
      wrap.appendChild(fld);
    });
    if (sc.derive) sc.derive(data, ctx);
    return wrap;
  }
  function renderTable(sc, f, data, ctx, changed, refreshers) {
    if (!Array.isArray(data[f.k])) data[f.k] = [];
    var box = h('div', { class: 'edit-table-wrap' }), mine = [];
    function draw() {
      mine.forEach(function (fn) { var i = refreshers.indexOf(fn); if (i >= 0) refreshers.splice(i, 1); }); mine = [];
      function reg(fn) { refreshers.push(fn); mine.push(fn); }
      U.clear(box);
      var tbl = h('table', { class: 'edit-grid' });
      tbl.appendChild(h('thead', null, h('tr', null, f.cols.map(function (c) { return h('th', null, c.l, c.tip ? UI.tip(c.tip, 'Qué significa ' + c.l) : null); }), h('th', { class: 'act' }, ''))));
      var tb = h('tbody');
      data[f.k].forEach(function (row, ri) {
        var tr = h('tr');
        f.cols.forEach(function (c) {
          var td = h('td', { 'data-label': c.l });
          if (c.t === 'calc') {
            var o = h('output', { class: 'calc' });
            var upd = function () { o.textContent = c.fmt === 'money' ? U.fmtCLP(row[c.k] || 0) : String(row[c.k] == null ? '' : row[c.k]); };
            reg(upd); upd(); td.appendChild(o);
          } else {
            var type = c.t === 'month' ? 'month' : c.t;
            var copt = typeof c.options === 'function' ? c.options(ctx) : c.options;
            var inp = UI.bind(row, c.k, { type: type === 'month' ? 'text' : type, aria: c.l, options: copt, noEmpty: copt ? false : undefined, empty: copt ? 'Elige…' : undefined, ph: c.t === 'month' ? 'AAAA-MM' : '', onChange: function () { row._last = c.k; if (sc.onCell) sc.onCell(f.k, c.k, row, data, ctx); changed(f.k); } });
            if (sc.autoCols && sc.autoCols.indexOf(c.k) >= 0) reg(function () { if (document.activeElement !== inp) inp.value = c.t === 'money' ? (row[c.k] ? U.fmtNum(row[c.k]) : '') : (row[c.k] == null ? '' : row[c.k]); }); /* valor calculado, pero editable */
            if (c.t === 'select') reg(function () { if (inp.value !== String(row[c.k] == null ? '' : row[c.k]) && document.activeElement !== inp) inp.value = row[c.k] == null ? '' : row[c.k]; });
            td.appendChild(inp);
          }
          tr.appendChild(td);
        });
        tr.appendChild(h('td', { class: 'act' }, h('button', { type: 'button', class: 'icon-btn', title: 'Quitar fila', 'aria-label': 'Quitar fila', onclick: function () { data[f.k].splice(ri, 1); changed(f.k); draw(); } }, UI.icon('trash', 18))));
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      box.appendChild(h('div', { class: 'table-scroll' }, tbl));
      box.appendChild(UI.btn(f.add || 'Agregar fila', { icon: 'plus', cls: 'ghost', onclick: function () { data[f.k].push({}); changed(f.k); draw(); } }));
    }
    draw();
    return box;
  }

  /* ¿está firmado? Cada firmante dibujó la suya, o se subió el documento ya firmado */
  function signIssues(sc, data) {
    if (!sc.signers) return [];
    var hasFile = !!(data.signedFile && data.signedFile.blobId), missing = sc.signers.filter(function (x) { return !(data.firmas && data.firmas[x.k]); });
    return hasFile || !missing.length ? [] : [{ level: 'error', msg: 'Falta la firma: ' + (sc.signers.length === 1 ? 'fírmalo aquí abajo' : 'faltan ' + missing.map(function (x) { return x.l.replace(/^Firma de /, ''); }).join(' y ')) + ', o sube el documento ya firmado.' }];
  }
  function renderIssues(sc, data, ctx) {
    var box = h('div', { class: 'issues' });
    function paint() {
      U.clear(box);
      var list = (sc.check ? sc.check(data, ctx) : []).concat(signIssues(sc, data));
      list.forEach(function (i) { box.appendChild(UI.callout(i.level === 'error' ? 'bad' : i.level === 'warn' ? 'warn' : 'info', '', i.msg)); });
    }
    paint();
    box.refresh = paint;
    return box;
  }

  /* ---------- firma dibujada (con el dedo o el mouse) y documento firmado ---------- */
  function signPad(onSave) {
    var cv = h('canvas', { width: 480, height: 160, class: 'sign-pad', 'aria-label': 'Espacio para firmar con el dedo o el mouse' }), g = cv.getContext && cv.getContext('2d'), down = false, dirty = false;
    if (g) { g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111'; }
    function pos(ev) { var r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * cv.width / r.width, y: (ev.clientY - r.top) * cv.height / r.height }; }
    cv.addEventListener('pointerdown', function (ev) { if (!g) return; ev.preventDefault(); down = true; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ } var p = pos(ev); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + .1, p.y + .1); g.stroke(); dirty = true; });
    cv.addEventListener('pointermove', function (ev) { if (!down || !g) return; ev.preventDefault(); var p = pos(ev); g.lineTo(p.x, p.y); g.stroke(); });
    function up() { if (!down) return; down = false; if (dirty && onSave) onSave(cv.toDataURL('image/png')); }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.clear = function () { if (g) g.clearRect(0, 0, cv.width, cv.height); dirty = false; };
    return cv;
  }
  function signBlock(sc, data, ctx, onChange) {
    if (!sc.signers) return null;
    var box = h('div', { class: 'sign-block' }), status = h('div');
    data.firmas = data.firmas || {};
    function paintStatus() { U.clear(status); var errs = signIssues(sc, data); status.appendChild(errs.length ? UI.callout('warn', '', errs[0].msg) : UI.callout('ok', '', data.signedFile && data.signedFile.blobId ? 'Firmado: subiste el documento ya firmado.' : 'Firmado en la app.')); }
    sc.signers.forEach(function (sg) {
      var row = h('div', { class: 'sign-row' }), holder = h('div');
      function paintRow() {
        U.clear(holder);
        if (data.firmas[sg.k]) {
          holder.appendChild(h('img', { src: data.firmas[sg.k], alt: sg.l, class: 'sign-img' }));
          holder.appendChild(UI.btn('Borrar la firma', { cls: 'ghost small', onclick: function () { delete data.firmas[sg.k]; RF.store.update(function () { }, { silent: true }); paintRow(); paintStatus(); if (onChange) onChange(); } }));
        } else {
          var pad = signPad(function (url) { data.firmas[sg.k] = url; RF.store.update(function () { }, { silent: true }); if (RF.activity) RF.activity.log('ficha', 'Firmó en la app: ' + sc.title + '.'); paintRow(); paintStatus(); if (onChange) onChange(); });
          holder.appendChild(pad); holder.appendChild(UI.btn('Borrar y empezar de nuevo', { cls: 'ghost small', onclick: function () { pad.clear(); } }));
          holder.appendChild(h('p', { class: 'hint' }, 'Dibuja tu firma con el dedo o el mouse; se guarda sola al soltar.'));
        }
      }
      paintRow(); row.appendChild(h('div', { class: 'lbl' }, sg.l)); row.appendChild(holder); box.appendChild(row);
    });
    var fileBox = h('div', { class: 'row-actions' });
    function paintFile() {
      U.clear(fileBox);
      var inp = h('input', { type: 'file', accept: 'image/*,application/pdf,.pdf', class: 'sr-only', 'aria-label': 'Elegir el documento firmado' });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        if (f.size > 8 * 1024 * 1024) { UI.toast('El archivo pesa más de 8 MB: el Drive no lo aceptaría.', 'bad'); return; }
        var bid = 'signed-' + U.uid('sg');
        RF.blobs.put(bid, f).then(function () {
          data.signedFile = { blobId: bid, name: f.name, type: f.type || '', at: new Date().toISOString(), driveUrl: '' };
          RF.store.update(function () { }, { silent: true }); UI.toast('Documento firmado guardado.', 'ok'); if (RF.activity) RF.activity.log('respaldo', 'Subió el documento firmado: ' + sc.title + '.');
          paintFile(); paintStatus(); if (onChange) onChange();
          if (RF.drive && RF.drive.auto()) RF.drive.saveSigned(data.signedFile, sc, ctx.project, f).then(function (r) { if (r && r.remote) { data.signedFile.driveUrl = r.url || ''; RF.store.update(function () { }, { silent: true }); paintFile(); } }).catch(function () { });
        });
      });
      fileBox.appendChild(inp);
      fileBox.appendChild(UI.btn(data.signedFile ? 'Cambiar el documento firmado' : 'Subir el documento ya firmado (foto o PDF)', { icon: 'file', cls: data.signedFile ? 'ghost' : 'primary', onclick: function () { inp.click(); } }));
      if (data.signedFile) { fileBox.appendChild(h('span', { class: 'file-name' }, data.signedFile.name + (data.signedFile.driveUrl ? ' · ya está en tu Drive' : ''))); if (data.signedFile.driveUrl) fileBox.appendChild(h('a', { class: 'btn small ghost', href: data.signedFile.driveUrl, target: '_blank', rel: 'noopener' }, 'Ver en Drive')); fileBox.appendChild(UI.btn('Quitar', { cls: 'ghost small danger', onclick: function () { delete data.signedFile; RF.store.update(function () { }, { silent: true }); paintFile(); paintStatus(); if (onChange) onChange(); } })); }
    }
    paintFile(); paintStatus();
    box.appendChild(h('p', { class: 'hint' }, 'Puedes firmarlo aquí, o imprimirlo, firmarlo a mano y subir la foto o el PDF. Una de las dos es obligatoria.'));
    box.appendChild(fileBox); box.appendChild(status);
    return box;
  }

  /* Formulario único (un documento por proyecto) */
  function renderSingle(id, ctxArg) {
    var ctx = ctxArg || ctxNow(), sc = SCHEMAS[id];
    var data = getSingle(ctx.project, id);
    var root = h('div', { class: 'form-tool' });
    var issues = renderIssues(sc, data, ctx);
    var fieldsBox = h('div');
    function drawFields() { U.clear(fieldsBox); fieldsBox.appendChild(renderFieldSet(sc, data, ctx, function () { issues.refresh(); })); }
    drawFields();
    root.appendChild(UI.section(sc.title, [fieldsBox]));
    var sb = signBlock(sc, data, ctx, function () { issues.refresh(); });
    if (sb) root.appendChild(UI.section('Firma', [sb]));
    root.appendChild(UI.section('Revisión', [issues]));
    root.appendChild(UI.section('Sacar el documento', [UI.exportBar(function () { return docOf(id, data, ctx); }, sc.sheet)]));
    root._redraw = drawFields;
    return root;
  }

  /* Formularios repetibles (una ficha por pago, viajero, actividad…) */
  function renderRepeat(id, ctxArg) {
    var ctx = ctxArg || ctxNow(), sc = SCHEMAS[id];
    var list = getList(ctx.project, id);
    var root = h('div', { class: 'form-tool' });
    var selected = list.length ? list[0].id : null;
    if (PRESELECT[id] && list.some(function (x) { return x.id === PRESELECT[id]; })) selected = PRESELECT[id];
    delete PRESELECT[id];
    function paint() {
      U.clear(root);
      var head = h('div', { class: 'repeat-head' });
      list.forEach(function (it, i) {
        head.appendChild(h('button', { type: 'button', class: 'chip' + (it.id === selected ? ' on' : ''), onclick: function () { selected = it.id; paint(); } }, (i + 1) + '. ' + sc.itemName(it.data)));
      });
      head.appendChild(UI.btn(sc.addLabel || 'Agregar', { icon: 'plus', cls: 'primary', onclick: function () { var d = sc.defaults(ctx); if (sc.derive) sc.derive(d, ctx); var e = { id: U.uid('f'), data: d }; list.push(e); selected = e.id; RF.store.update(function () {}, { silent: true }); paint(); } }));
      root.appendChild(head);
      var cur = list.filter(function (x) { return x.id === selected; })[0];
      if (!cur) { root.appendChild(UI.empty('Aún no hay documentos. Toca «' + (sc.addLabel || 'Agregar') + '» para crear el primero.')); if (list.length) { selected = list[0].id; paint(); } return; }
      var issues = renderIssues(sc, cur.data, ctx);
      var fieldsBox = h('div'), curIx = list.indexOf(cur), chipEl = head.children[curIx], secEl = null;
      function relabel() { var nm = sc.itemName(cur.data); if (chipEl) chipEl.textContent = (curIx + 1) + '. ' + nm; if (secEl) secEl.textContent = sc.title + ' · ' + nm; }
      var drawFields = function () { U.clear(fieldsBox); fieldsBox.appendChild(renderFieldSet(sc, cur.data, ctx, function () { issues.refresh(); relabel(); })); };
      drawFields();
      var secCard = UI.section(sc.title + ' · ' + sc.itemName(cur.data), [fieldsBox, h('div', { class: 'row-actions' },
        UI.btn('Duplicar', { icon: 'copy', cls: 'ghost', onclick: function () { var c = { id: U.uid('f'), data: U.deepClone(cur.data) }; list.push(c); selected = c.id; RF.store.update(function () {}, { silent: true }); paint(); UI.toast('Ficha duplicada.', 'ok'); } }),
        UI.btn('Borrar', { icon: 'trash', cls: 'ghost danger', onclick: function () { UI.confirmBox('¿Borrar esta ficha? No se puede deshacer.', 'Borrar').then(function (ok) { if (!ok) return; var ix = list.indexOf(cur); list.splice(ix, 1); selected = list.length ? list[Math.max(0, ix - 1)].id : null; RF.store.update(function () {}, { silent: true }); paint(); }); } }))]);
      secEl = secCard.querySelector('.card-title');
      root.appendChild(secCard);
      /* si eligen actividad o gasto, se re-dibuja para mostrar los montos rellenados */
      fieldsBox.addEventListener('change', function (ev) { var t = ev.target; if (t && t.tagName === 'SELECT' && (t.dataset.key === 'actId' || t.dataset.key === 'gastoId')) { if (sc.onChange) sc.onChange(t.dataset.key, cur.data, ctx); RF.store.update(function () {}, { silent: true }); drawFields(); issues.refresh(); } });
      var sbR = signBlock(sc, cur.data, ctx, function () { issues.refresh(); });
      if (sbR) root.appendChild(UI.section('Firma', [sbR]));
      root.appendChild(UI.section('Revisión', [issues]));
      root.appendChild(UI.section('Sacar el documento', [UI.exportBar(function () { return docOf(id, cur.data, ctx); }, sc.sheet + '-' + (cur.data.nombre || cur.data.viajero || cur.data.proveedorNombre || 'ficha'))]));
      if (list.length > 1) root.appendChild(UI.section('Todos juntos', [UI.exportBar(function () { return combinedDoc(id, list, ctx); }, sc.sheet + '-todos')]));
    }
    paint();
    return root;
  }
  function combinedDoc(id, list, ctx) {
    var sc = SCHEMAS[id], blocks = [];
    list.forEach(function (it, i) { var d = docOf(id, it.data, ctx); blocks.push({ t: 'h', text: (i + 1) + '. ' + d.title }); d.blocks.forEach(function (b) { blocks.push(b); }); });
    return { title: sc.title, subtitle: v(ctx.project.name), sheet: sc.sheet, blocks: blocks, footer: 'Generado con Rinde Fácil.' };
  }

  /* Informe técnico completo: cabecera + fichas A–E */
  function informeCompleto(ctx) { var d = getSingle(ctx.project, 'informe'); return informeDoc(d, ctx, false); }

  RF.forms = { errors: errors, ficha: ficha, SCHEMAS: SCHEMAS, getSingle: getSingle, getList: getList, docOf: docOf, renderSingle: renderSingle, renderRepeat: renderRepeat, informeCompleto: informeCompleto, combinedDoc: combinedDoc, ctxNow: ctxNow };
})(typeof window !== 'undefined' ? window : globalThis);
