/* Rinde Fácil — «Qué necesitará tu proyecto»: según lo que la comunidad marca (viáticos, insumos, inmuebles…), la app muestra solo los trámites que le tocan.
 * Lo que no estaba en el PEA aprobado se avisa: para gastarlo conviene modificar el PEA (reitemización o reprogramación). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};

  var NEEDS = [
    { id: 'sueldos', group: 'Personas', name: 'Pagar sueldos', help: 'Personas con contrato de trabajo.' },
    { id: 'honorarios', group: 'Personas', name: 'Pagar honorarios', help: 'Personas que te entregan boleta de honorarios.' },
    { id: 'actividades', group: 'Actividades', name: 'Hacer actividades con la comunidad', help: 'Talleres, ferias, reuniones, capacitaciones.' },
    { id: 'insumos', group: 'Actividades', name: 'Comprar insumos o materiales, o arrendar', help: 'Materiales, arriendo de salas, equipos o vehículos, alimentación.' },
    { id: 'viaticos', group: 'Actividades', name: 'Viajes, pasajes o viáticos', help: 'Pasajes, alojamiento y viáticos de personas que viajan.' },
    { id: 'estudios', group: 'Servicios', name: 'Estudios, consultorías o servicios técnicos', help: 'Diseños, factibilidades, asesorías profesionales.' },
    { id: 'obras', group: 'Inversión', name: 'Obras o construcción de infraestructura', help: 'Sedes, redes de agua, plantas, mejoras de bienes.' },
    { id: 'activos', group: 'Inversión', name: 'Comprar equipos, maquinaria o vehículos', help: 'Bienes que quedan en el inventario de la comunidad.' },
    { id: 'inmuebles', group: 'Inversión', name: 'Comprar terreno, inmueble o derechos de agua', help: 'Piden tasaciones y estar libres de gravámenes.' },
    { id: 'grandes', group: 'Compras', name: 'Alguna compra de más de $10.000.000 netos', help: 'Piden dos cotizaciones de proveedores distintos.' },
    { id: 'admin', group: 'Administración', name: 'Gastos de administración compartidos', help: 'Luz, agua, internet, contador, oficina: se reparten entre proyectos.' },
    { id: 'efectivo', group: 'Pagos', name: 'Pagar algo en efectivo', help: 'Quien recibe el efectivo firma una declaración.' },
    { id: 'iva_no', group: 'IVA', name: 'Soy contribuyente y no uso el IVA', help: 'Se rinde el total y se acompaña la declaración del Anexo 1.' },
    { id: 'iva_otro', group: 'IVA', name: 'Tengo facturas con IVA que no corresponde al proyecto', help: 'Se informa en el Anexo 2.' }
  ];
  var BY_ID = {}; NEEDS.forEach(function (n) { BY_ID[n.id] = n; });

  /* trámite → necesidades que lo activan (basta con una). Los trámites que no aparecen aquí le tocan a todos. */
  var APPLIES = {
    'TRM-006': ['grandes'],
    'TRM-007': ['sueldos', 'honorarios'],
    'TRM-008': ['actividades', 'insumos', 'viaticos', 'estudios', 'obras'],
    'TRM-009': ['activos', 'inmuebles', 'obras'],
    'TRM-010': ['admin'],
    'TRM-011': ['viaticos'],
    'TRM-021': ['iva_no'],
    'TRM-022': ['iva_otro'],
    'TRM-023': ['efectivo'],
    'TRM-024': ['viaticos'],
    'TRM-025': ['admin'],
    'TRM-017': ['actividades', 'insumos', 'viaticos'],
    'TRM-018': ['estudios'],
    'TRM-019': ['obras', 'activos', 'inmuebles'],
    'TRM-020': ['sueldos', 'honorarios']
  };
  /* qué necesidad delatan los gastos que ya anotó (para avisar si algo no lo marcó) */
  function derivedFromExpenses(project) {
    var out = {};
    (project.expenses || []).forEach(function (e) {
      if (e.cuenta === 'rrhh') { if (e.docType === 'honorarios') out.honorarios = true; else if (e.docType === 'liquidacion') out.sueldos = true; else { out.sueldos = true; out.honorarios = true; } }
      if (e.cuenta === 'inversion') out.activos = true;
      if (e.esInmueble) out.inmuebles = true;
      if (e.cuenta === 'administracion') out.admin = true;
      if (e.esViatico || e.docType === 'certificado_viatico') out.viaticos = true;
      if (e.formaPago === 'efectivo') out.efectivo = true;
      if (parseFloat(String(e.neto || '').replace(/\./g, '').replace(',', '.')) > RF.data.REGLAS.COTIZACION_UMBRAL && !e.servicioTecnico) out.grandes = true;
    });
    return out;
  }

  /* pasos que piden llenar o mirar un documento: «trámite:número de paso (desde 0)» → herramientas */
  var STEP_TOOLS = {
    'P-03:2': ['proyecto'],
    'TRM-027:2': ['pea', 'gantt', 'presupuesto'], 'TRM-027:3': ['pea'],
    'TRM-028:0': ['reitem'], 'TRM-028:1': ['reitem'], 'TRM-028:2': ['reitem'],
    'TRM-001:1': ['gantt'], 'TRM-001:2': ['presupuesto'],
    'TRM-004:2': ['gastos'],
    'TRM-006:0': ['cotizaciones'], 'TRM-006:1': ['cotizaciones'], 'TRM-006:4': ['cotizaciones'],
    'TRM-007:4': ['informeD'],
    'TRM-008:1': ['gastos'],
    'TRM-009:0': ['gastos'], 'TRM-009:2': ['informeC'], 'TRM-009:4': ['cotizaciones'],
    'TRM-010:2': ['anexo5'],
    'TRM-011:3': ['anexo4'],
    'TRM-012:0': ['gastos'], 'TRM-012:2': ['anexo3'],
    'TRM-021:1': ['anexo1'], 'TRM-021:3': ['anexo1'],
    'TRM-022:1': ['anexo2'], 'TRM-022:2': ['anexo2'],
    'TRM-023:1': ['anexo3'], 'TRM-023:2': ['anexo3'], 'TRM-023:3': ['anexo3'],
    'TRM-024:0': ['anexo4'], 'TRM-024:1': ['anexo4'], 'TRM-024:2': ['anexo4'], 'TRM-024:3': ['anexo4'],
    'TRM-025:0': ['anexo5'], 'TRM-025:2': ['anexo5'],
    'TRM-013:1': ['gastos'], 'TRM-013:3': ['resumen'],
    'TRM-014:2': ['resumen'],
    'TRM-016:0': ['informe', 'anexo5'], 'TRM-016:2': ['informe'], 'TRM-016:3': ['informeA', 'informeB', 'informeC', 'informeD', 'informeE'],
    'TRM-017:0': ['informeA'], 'TRM-017:1': ['informeA'], 'TRM-017:2': ['informeA'],
    'TRM-018:0': ['informeB'], 'TRM-018:1': ['informeB'], 'TRM-018:2': ['informeB'],
    'TRM-019:0': ['informeC'], 'TRM-019:1': ['informeC'],
    'TRM-020:0': ['informeD'], 'TRM-020:1': ['informeE'], 'TRM-020:2': ['informeD'],
    'TRM-015:3': ['observaciones'],
    'TRM-029:1': ['solicitud'],
    'TRM-026:0': ['consulta']
  };
  RF.needs = { STEP_TOOLS: STEP_TOOLS, NEEDS: NEEDS, BY_ID: BY_ID, APPLIES: APPLIES, derivedFromExpenses: derivedFromExpenses };
})(typeof window !== 'undefined' ? window : globalThis);
