/* Rinde Fácil — datos fijos: actores, fases, flujo oficial, cuentas, reglas. */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};

  var ACTORS = [
    { id: 'corfo', name: 'CORFO', full: 'Corporación de Fomento de la Producción' },
    { id: 'comunidad', name: 'Comunidad', full: 'Titular del convenio' },
    { id: 'novandina', name: 'Novandino (ex SQM)', full: 'Transfiere el dinero del AIA' },
    { id: 'smi', name: 'Organismo Colaborador', full: 'Apoya a la comunidad si ella lo pide' }
  ];

  var FASES = [
    { id: 'F1', n: 1, name: 'Convenio y primer dinero', short: 'Convenio', blurb: 'Firmar, abrir la cuenta y recibir el 30 %.', items: ['P-01', 'P-02', 'P-03'] },
    { id: 'F2', n: 2, name: 'El PEA', short: 'PEA', blurb: 'Armar el plan de tus proyectos y enviarlo a CORFO.', items: ['TRM-027', 'TRM-028'] },
    { id: 'F3', n: 3, name: 'Configurar en SGP', short: 'SGP', blurb: 'Cargar etapas, actividades y presupuesto.', items: ['TRM-002', 'TRM-001'] },
    { id: 'F4', n: 4, name: 'Gastos y respaldos', short: 'Gastos', blurb: 'Gastar bien y guardar cada respaldo.', items: ['TRM-003', 'TRM-004', 'TRM-005', 'TRM-006', 'TRM-007', 'TRM-008', 'TRM-009', 'TRM-010', 'TRM-011', 'TRM-012', 'TRM-021', 'TRM-022', 'TRM-023', 'TRM-024', 'TRM-025'] },
    { id: 'F5', n: 5, name: 'Rendir y responder', short: 'Rendir', blurb: 'Enviar la rendición, el informe técnico y responder a CORFO.', items: ['TRM-013', 'TRM-014', 'TRM-016', 'TRM-017', 'TRM-018', 'TRM-019', 'TRM-020', 'TRM-015'] },
    { id: 'F6', n: 6, name: 'Cierre', short: 'Cierre', blurb: 'Pedir los aportes que faltan.', items: ['TRM-029'] }
  ];
  var AYUDA = ['TRM-026'];

  /* ---------- cuentas presupuestarias (Manual, sección IX) ---------- */
  var CUENTAS = [
    { id: 'rrhh', name: 'Recursos Humanos', sgp: 'RECURSOS HUMANOS', desc: 'Personal técnico y profesional del proyecto: sueldos y honorarios.', ej: 'Sueldo, honorarios, cotizaciones' },
    { id: 'operacion', name: 'Gastos operacionales', sgp: 'GASTOS DE OPERACION', desc: 'Gastos directos de las actividades: materiales, arriendos, transporte, pasajes, alojamiento, talleres, seguros.', ej: 'Materiales, arriendo, pasajes, talleres' },
    { id: 'inversion', name: 'Gastos de inversión', sgp: 'GASTOS DE INVERSION', desc: 'Bienes de capital, inmuebles, derechos de agua y mejoras de bienes inventariables.', ej: 'Camioneta, maquinaria, terreno' },
    { id: 'administracion', name: 'Gastos de administración', sgp: 'GASTOS DE ADMINISTRACION', desc: 'Gastos indirectos que no se asocian a un solo proyecto. Hasta $3.000.000 al mes.', ej: 'Luz, agua, internet, contador, oficina' }
  ];
  var CUENTA_BY_ID = {}; CUENTAS.forEach(function (c) { CUENTA_BY_ID[c.id] = c; });

  var TIPOS_PROYECTO = [
    { id: 'inversion', name: 'Inversión', informe: 'anexo6' },
    { id: 'fomento', name: 'Fomento', informe: 'anexo6' },
    { id: 'administracion', name: 'Administración', informe: 'anexo5' }
  ];

  /* ---------- tipos de documento y respaldos que exige el Manual ---------- */
  var DOC_TYPES = [
    { id: 'factura', name: 'Factura', iva: true },
    { id: 'factura_terceros', name: 'Factura de compra de terceros', iva: true },
    { id: 'boleta', name: 'Boleta de venta o servicios', iva: false, pagoImplicito: true },
    { id: 'voucher', name: 'Voucher válido como boleta', iva: false, pagoImplicito: true },
    { id: 'honorarios', name: 'Boleta de honorarios', iva: false, extras: ['f29', 'informe_sii'] },
    { id: 'liquidacion', name: 'Liquidación de sueldo', iva: false, extras: ['previred', 'f29', 'contrato'] },
    { id: 'terceros_bpst', name: 'Boleta de prestación de servicios de terceros', iva: false },
    { id: 'invoice', name: 'Invoice (gasto en el extranjero)', iva: false, extras: ['traduccion'] },
    { id: 'contrato', name: 'Contrato o comprobante de arriendo', iva: false, extras: ['contrato_arriendo'] },
    { id: 'certificado_viatico', name: 'Certificado de viático', iva: false },
    { id: 'otro', name: 'Otro documento', iva: false }
  ];
  var DOC_BY_ID = {}; DOC_TYPES.forEach(function (d) { DOC_BY_ID[d.id] = d; });

  var RESPALDOS = {
    pago: 'Comprobante de pago (transferencia, cartola o cheque cobrado)',
    f29: 'Formulario 29 del SII del período',
    informe_sii: 'Informe mensual de boletas recibidas (SII)',
    previred: 'Certificado de Previred',
    contrato: 'Contrato de trabajo',
    aduana: 'Declaración de Ingreso de Aduana (importaciones)',
    f50: 'Formulario 50 del SII (impuesto adicional)',
    traduccion: 'Traducción simple, si el idioma es de difícil traducción',
    contrato_arriendo: 'Copia del contrato de arriendo',
    tasaciones: 'Dos tasaciones comerciales independientes',
    gravamenes: 'Certificado de hipotecas y gravámenes',
    cotizaciones: 'Cotizaciones de 2 proveedores distintos',
    autorizacion: 'Autorización previa de CORFO (una o ninguna cotización)',
    anexo1: 'Anexo 1 firmado (no uso de IVA CF)',
    anexo3: 'Anexo 3 firmado por quien recibió el efectivo',
    anexo4: 'Anexo 4 firmado (certificado de viático)',
    anexo5: 'Anexo 5 (memoria de cálculo)'
  };

  var FORMAS_PAGO = [
    { id: 'transferencia', name: 'Transferencia' },
    { id: 'cheque', name: 'Cheque' },
    { id: 'efectivo', name: 'Efectivo' },
    { id: 'debito', name: 'Tarjeta de débito' },
    { id: 'tarjeta', name: 'Tarjeta de crédito' },
    { id: 'prepago', name: 'Tarjeta prepago' },
    { id: 'electronico', name: 'Pago electrónico (PayPal u otro)' }
  ];

  /* ---------- reglas numéricas del Manual (con página) ---------- */
  var REGLAS = {
    COTIZACION_UMBRAL: 10000000,   /* Manual p.8: sobre $10.000.000 netos, mínimo 2 cotizaciones */
    COTIZACIONES_MIN: 2,
    ADMIN_TOPE_MENSUAL: 3000000,   /* Manual p.20 */
    GLOSA_MAX: 200,                /* SGP / piloto: máximo 200 caracteres */
    GLOSA_AVISO: 180,
    TOLERANCIA_IVA: 1,             /* pesos de diferencia por redondeo (criterio del piloto) */
    PEA_DIAS: 90,                  /* flujograma paso 8: días corridos desde el primer desembolso */
    PEA_PRORROGA: 30,
    ACLARACION_DIAS_HABILES: 10,   /* Manual p.10 */
    PASAJE_ANTICIPACION: 15,       /* Manual p.15 */
    IVA: 0.19
  };

  /* ---------- convenios y fondos: cada uno con SUS reglas, para que un cambio de Manual o un fondo nuevo no toque los datos de nadie ----------
     REGLAS (arriba) es el juego vigente; useConvenio() copia en él las reglas del convenio del proyecto. Hoy hay uno solo. */
  var CONVENIOS = {
    'corfo-2026-09': { id: 'corfo-2026-09', nombre: 'Convenio CORFO – Novandino (ex SQM)', fuente: 'Manual de rendición y flujograma del convenio, con la página citada en cada aviso', reglas: Object.assign({}, REGLAS) }
  };
  /* feriados nacionales de Chile en días de semana o fin de semana, sin los regionales; cambian por ley: confirma con el calendario oficial */
  var FERIADOS_CL = {
    2026: ['2026-01-01', '2026-04-03', '2026-04-04', '2026-05-01', '2026-05-21', '2026-06-21', '2026-06-29', '2026-07-16', '2026-08-15', '2026-09-18', '2026-09-19', '2026-10-12', '2026-10-31', '2026-11-01', '2026-12-08', '2026-12-25'],
    2027: ['2027-01-01', '2027-03-26', '2027-03-27', '2027-05-01', '2027-05-21', '2027-06-20', '2027-06-28', '2027-07-16', '2027-08-15', '2027-09-18', '2027-09-19', '2027-10-11', '2027-11-01', '2027-12-08', '2027-12-25']
  };
  var CONVENIO_DEFECTO = 'corfo-2026-09';
  function convenioDe(project) { return CONVENIOS[(project && project.convenio) || CONVENIO_DEFECTO] || CONVENIOS[CONVENIO_DEFECTO]; }
  function useConvenio(project) { var c = convenioDe(project); Object.keys(REGLAS).forEach(function (k) { delete REGLAS[k]; }); Object.assign(REGLAS, c.reglas); return c; }

  /* ---------- flujo oficial (28 pasos), con las correcciones del Manual p.10 ---------- */
  /* [actor, título corto, detalle fiel al flujograma, plazo, retorno, salida, trámite relacionado] */
  var FLOW = {
    '1': ['corfo', 'Entrega el convenio', 'CORFO entrega el convenio a las comunidades. Ahí se detallan los aportes y cómo se pueden usar.', null, null, null, 'P-01'],
    '2': ['comunidad', 'Firma el convenio', 'La comunidad y CORFO firman el convenio.', null, null, null, 'P-01'],
    '3': ['comunidad', 'Abre cuenta corriente', 'La comunidad abre una cuenta corriente para recibir el Aporte Inicial Atribuible (AIA). Solo puede financiar proyectos de inversión y fomento de las comunidades de la cuenca del Salar de Atacama.', null, null, null, 'P-02'],
    '4': ['novandina', 'Transfiere el 30 % del AIA', 'La empresa (SQM, hoy Novandino) transfiere el 30 % del AIA a la cuenta de la comunidad, dentro de 15 días hábiles desde que CORFO comunica la total tramitación de la resolución que aprueba el convenio.', '15 días hábiles', null, null, 'P-03'],
    '5': ['comunidad', 'Recibe la transferencia', 'La comunidad recibe el 30 % del AIA.', null, null, null, 'P-03'],
    '6': ['comunidad', 'Define sus proyectos', 'La comunidad define los proyectos que describirá en el PEA. Lo llena la comunidad, con apoyo del Organismo Colaborador si lo necesita, y lo presenta a CORFO para su aprobación.', null, null, null, 'TRM-027'],
    '7': ['comunidad', 'Pide a CORFO armar el PEA', 'La comunidad envía un correo a CORFO para poder confeccionar el PEA.', null, null, null, 'TRM-027'],
    '8': ['corfo', 'Activa el plazo del PEA', 'CORFO activa el plazo para armar el PEA: 90 días corridos desde el primer desembolso. Se puede prorrogar una sola vez, hasta 30 días, con solicitud fundada antes de que venza.', '90 días + 30', null, null, 'TRM-027'],
    '9': ['comunidad', 'Acepta el Componente 3', 'En el gráfico dice «Acepta componente 3». «Introducción al Acuerdo» define el Componente 3 como el apoyo del Organismo Colaborador para formular el PEA.', null, null, null, 'TRM-027'],
    '10': ['smi', 'Apoya la elaboración del PEA', 'Si la comunidad necesita apoyo con el PEA, el Organismo Colaborador la ayuda y facilita la comunicación con CORFO durante toda la vigencia del acuerdo.', null, null, null, 'TRM-027'],
    '11': ['comunidad', 'Elabora el PEA', 'La comunidad elabora el PEA y lo envía a CORFO para su aprobación.', null, null, null, 'TRM-027'],
    '12': ['corfo', 'Recibe el PEA', 'CORFO recibe el PEA.', null, null, null, 'TRM-027'],
    '13': ['corfo', 'Revisa el PEA', 'CORFO revisa el PEA. El flujograma no fija plazo para esta revisión.', 'sin plazo escrito', null, null, 'TRM-027'],
    'D1': ['corfo', '¿Aprueba el PEA?', 'Si CORFO lo observa, la comunidad lo corrige (paso 14) y vuelve a la revisión; si lo aprueba, sigue la configuración en SGP (paso 15).', null, null, 'Sí: paso 15. No: paso 14.', 'TRM-027'],
    '14': ['comunidad', 'Corrige según observaciones', 'Si el PEA es observado, la comunidad hace las modificaciones que indica CORFO.', null, 'Vuelve a la revisión (paso 13)', null, 'TRM-027'],
    '15': ['comunidad', 'Configura sus proyectos en SGP', 'Con el PEA aprobado, la comunidad configura sus proyectos en SGP.', null, null, null, 'TRM-001'],
    '16': ['corfo', 'Revisa la configuración', 'CORFO revisa la configuración de los proyectos cargados por la comunidad.', null, null, null, 'TRM-001'],
    'D2': ['corfo', '¿Hay observaciones?', 'Con observaciones, la comunidad corrige (paso 17) y CORFO revisa de nuevo; sin observaciones, CORFO aprueba (paso 18).', null, null, 'Sí: paso 17. No: paso 18.', 'TRM-001'],
    '17': ['comunidad', 'Corrige la configuración', 'La comunidad corrige las observaciones de la configuración.', null, 'Vuelve a la revisión (paso 16)', null, 'TRM-001'],
    '18': ['corfo', 'Aprueba la configuración', 'CORFO aprueba la configuración.', null, null, null, 'TRM-001'],
    '19': ['comunidad', 'Comienza a configurar los gastos', 'La comunidad comienza a configurar los gastos.', null, null, null, 'TRM-004'],
    '20': ['smi', 'Apoya la rendición', 'La comunidad puede pedir apoyo al Organismo Colaborador en las rendiciones. «Introducción al Acuerdo» agrega que puede revisar la documentación antes del envío y, si la comunidad quiere, subir los documentos a la plataforma.', null, null, null, 'TRM-013'],
    '21': ['comunidad', 'Rinde el total del AIA en SGP', 'La comunidad termina de rendir el total del AIA en SGP. Según el Acuerdo, la rendición se hace cada 6 meses.', 'cada 6 meses', null, null, 'TRM-013'],
    '22': ['corfo', 'Recibe y revisa las rendiciones', 'CORFO recibe las rendiciones y comienza la revisión. El flujograma no fija plazo para esta revisión.', 'sin plazo escrito', null, null, 'TRM-015'],
    'D3': ['corfo', '¿Aprueba la rendición?', 'Con observaciones, la comunidad las recibe (paso 23); si no hay, CORFO finaliza el proceso de rendición (paso 26).', null, null, 'Sí: paso 26. No: paso 23.', 'TRM-015'],
    '23': ['comunidad', 'Recibe observaciones', 'Si hay observaciones a la rendición, la comunidad tiene 10 días hábiles para aclararlas. Según el Manual (p. 10), se puede hacer por única vez y el plazo se cuenta desde que CORFO comunica las observaciones.', '10 días hábiles, una vez', null, null, 'TRM-015'],
    '24': ['smi', 'Apoya con las observaciones', 'La comunidad puede pedir apoyo al Organismo Colaborador para responder las observaciones.', null, null, null, 'TRM-015'],
    '25': ['comunidad', 'Aclara y modifica en SGP', 'La comunidad aclara sus observaciones y las modifica en SGP. El gráfico no dibuja un regreso a la revisión: de aquí pasa al cierre (paso 26). El Manual (p. 10) agrega que CORFO revisa las respuestas, y que un gasto no aprobado puede presentarse en la rendición siguiente si se resolvieron las causas del rechazo.', null, null, null, 'TRM-015'],
    '26': ['corfo', 'Finaliza la rendición', 'CORFO finaliza el proceso de rendición.', null, null, null, 'TRM-029'],
    '27': ['comunidad', 'Solicita los aportes restantes', 'La comunidad solicita los aportes restantes del AIA.', null, null, null, 'TRM-029'],
    '28': ['novandina', 'Transfiere los aportes', 'La empresa (SQM, hoy Novandino) transfiere los aportes. El flujograma no da plazo para esta transferencia.', 'sin plazo escrito', null, null, 'TRM-029']
  };
  var FLOW_BLOCKS = [
    { fase: 'F1', title: 'Convenio y primer dinero', ids: ['1', '2', '3', '4', '5'], edges: [['1', '2'], ['2', '3'], ['3', '4'], ['4', '5']] },
    { fase: 'F2', title: 'Preparar el PEA', ids: ['6', '7', '8', '9', '10', '11'], edges: [['6', '7'], ['7', '8'], ['8', '9'], ['9', '10', 'si pide apoyo'], ['9', '11'], ['10', '11']] },
    { fase: 'F2', title: 'CORFO revisa el PEA', ids: ['12', '13', 'D1', '14'], edges: [['12', '13'], ['13', 'D1'], ['D1', '14', 'no']] },
    { fase: 'F3', title: 'Configurar en SGP', ids: ['15', '16', 'D2', '17', '18'], edges: [['15', '16'], ['16', 'D2'], ['D2', '17', 'sí'], ['D2', '18', 'no']] },
    { fase: 'F4', title: 'Gastos y rendición', ids: ['19', '20', '21', '22', 'D3'], edges: [['19', '20', 'si pide apoyo'], ['19', '21'], ['20', '21'], ['21', '22'], ['22', 'D3']] },
    { fase: 'F5', title: 'Aclarar lo observado', ids: ['23', '24', '25'], edges: [['23', '24', 'si pide apoyo'], ['23', '25'], ['24', '25']] },
    { fase: 'F6', title: 'Cierre', ids: ['26', '27', '28'], edges: [['26', '27'], ['27', '28']] }
  ];

  RF.data = { FERIADOS_CL: FERIADOS_CL,
    ACTORS: ACTORS, FASES: FASES, AYUDA: AYUDA, CUENTAS: CUENTAS, CUENTA_BY_ID: CUENTA_BY_ID,
    TIPOS_PROYECTO: TIPOS_PROYECTO, DOC_TYPES: DOC_TYPES, DOC_BY_ID: DOC_BY_ID, RESPALDOS: RESPALDOS,
    FORMAS_PAGO: FORMAS_PAGO, REGLAS: REGLAS, CONVENIOS: CONVENIOS, CONVENIO_DEFECTO: CONVENIO_DEFECTO, convenioDe: convenioDe, useConvenio: useConvenio, FLOW: FLOW, FLOW_BLOCKS: FLOW_BLOCKS
  };
})(typeof window !== 'undefined' ? window : globalThis);
