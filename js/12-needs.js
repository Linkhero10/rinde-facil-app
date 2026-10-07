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
    'TRM-009': ['activos', 'inmuebles', 'obras'],
    'TRM-011': ['viaticos'],
    'TRM-021': ['iva_no'],
    'TRM-022': ['iva_otro'],
    'TRM-023': ['efectivo'],
    'TRM-024': ['viaticos'],
    'TRM-025': ['admin']
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
  /* herramientas bajo cada paso: se declaran en cada trámite (stepTools) y aquí se juntan como «TRM-004:2» */
  var STEP_TOOLS = {};
  (RF.tramites ? RF.tramites.list : []).forEach(function (t) { Object.keys(t.stepTools || {}).forEach(function (i) { STEP_TOOLS[t.id + ':' + i] = t.stepTools[i]; }); });
  /* cada herramienta: ¿hay que usarla? 'clave' = necesaria en la ruta; 'segun' = solo si te toca por lo que marcaste o por tu situación; 'apoyo' = opcional, para tener a mano */
  var TOOL_ROLE = {
    necesidades: { kind: 'clave', text: 'Esto decide qué trámites te tocan en toda la ruta. Se hace una vez, antes de armar el PEA (unos 2 minutos), y lo puedes cambiar cuando quieras.' },
    proyecto: { kind: 'clave', text: 'Los datos de tu comunidad y de tu proyecto se usan para llenar todos los documentos. Se completan una vez.' },
    gantt: { kind: 'clave', text: 'Es parte del PEA y después se carga en SGP. Se arma una vez y se ajusta si cambian las fechas.' },
    presupuesto: { kind: 'clave', text: 'Es parte del PEA y después se carga en SGP. Aquí planificas cuánto gastarás en cada cuenta.' },
    pea: { kind: 'clave', text: 'Reúne la Carta Gantt, el presupuesto y los datos del proyecto en el documento que revisa CORFO.' },
    reitem: { kind: 'segun', text: 'Solo si necesitas cambiar montos o actividades de un PEA que CORFO ya aprobó.' },
    cotizaciones: { kind: 'segun', text: 'Solo para compras grandes (sobre $10.000.000 netos): piden comparar proveedores.' },
    gastos: { kind: 'clave', text: 'Aquí anotas cada gasto con su boleta o factura. Es lo que después se rinde.' },
    revision: { kind: 'clave', text: 'Antes de enviar la rendición, revisa que todo cuadre. Puedes usarla cuantas veces quieras.' },
    resumen: { kind: 'clave', text: 'Compara tus gastos con lo aprobado, cuenta por cuenta, antes de enviar.' },
    observaciones: { kind: 'segun', text: 'Solo cuando CORFO te hace observaciones a la rendición.' },
    anexo1: { kind: 'segun', text: 'Solo si eres contribuyente de IVA y no lo usas en el proyecto.' },
    anexo2: { kind: 'segun', text: 'Solo si tienes facturas con IVA que no corresponde al proyecto.' },
    anexo3: { kind: 'segun', text: 'Solo si pagaste algo en efectivo.' },
    anexo4: { kind: 'segun', text: 'Solo si hubo viajes o viáticos.' },
    anexo5: { kind: 'segun', text: 'Solo si repartes gastos de administración entre proyectos.' },
    informe: { kind: 'clave', text: 'Es el informe técnico de cada rendición. Reúne las fichas de actividades, personas e infraestructura.' },
    informeA: { kind: 'segun', text: 'Ficha de actividades con la comunidad: si hiciste talleres, ferias o reuniones.' },
    informeB: { kind: 'segun', text: 'Ficha de estudios y consultorías: solo si contrataste alguno.' },
    informeC: { kind: 'segun', text: 'Ficha de infraestructura y activos: solo si compraste equipos, terrenos u obras.' },
    informeD: { kind: 'segun', text: 'Ficha de personas contratadas: solo si pagaste sueldos u honorarios.' },
    informeE: { kind: 'segun', text: 'Otras actividades de las personas contratadas.' },
    consulta: { kind: 'apoyo', text: 'Para preguntarle a CORFO si un gasto se puede pagar. No es obligatoria: úsala cuando tengas una duda.' },
    historial: { kind: 'apoyo', text: '' },
    obras: { kind: 'segun', text: 'Solo si compraste activos o hiciste una construcción: permisos y fotos, aparte de las boletas y sin OCR.' },
    viaje: { kind: 'segun', text: 'Solo si hubo viajes: anota quién viajó, su rol y por qué era necesario.' },
    f29: { kind: 'segun', text: 'Solo si tus gastos incluyen facturas: el Manual pide el Formulario 29 de cada mes. Aquí lo guardas y se compara con el IVA de tus facturas.' },
    prorroga: { kind: 'segun', text: 'Solo si no alcanzas a entregar el PEA en 90 días: se pide una vez, hasta 30 días más y antes de que venza.' },
    solicitud: { kind: 'clave', text: 'Al final del proyecto, para pedir los aportes que faltan.' },
    calendario: { kind: 'apoyo', text: '' },
    documentos: { kind: 'apoyo', text: 'Tu archivo de documentos importantes: convenio, resoluciones, certificados. Para tenerlos a mano.' },
    actas: { kind: 'apoyo', text: 'Para dejar registro de las reuniones de la mesa de trabajo. Úsala cuando haya una reunión.' },
    compartir: { kind: 'apoyo', text: 'Para enviar un resumen al Organismo Colaborador, solo si tú quieres y con tu permiso.' },
    plazos: { kind: 'apoyo', text: 'Calcula cuánto tiempo te queda. Úsala cuando quieras confirmar una fecha.' },
    verificador: { kind: 'apoyo', text: 'Comprueba si la fecha de un gasto entra en el proyecto. Úsala cuando tengas dudas.' },
    cuentas: { kind: 'apoyo', text: 'Te ayuda a elegir en qué cuenta va un gasto. Úsala cuando tengas dudas.' },
    nofinanciable: { kind: 'apoyo', text: 'Revisa si un gasto no se puede pagar con el aporte. Úsala antes de comprar algo dudoso.' }
  };
  var KIND_LABEL = { clave: 'Necesaria', segun: 'Solo si te toca', apoyo: 'Opcional' };
  RF.needs = { TOOL_ROLE: TOOL_ROLE, KIND_LABEL: KIND_LABEL, STEP_TOOLS: STEP_TOOLS, NEEDS: NEEDS, BY_ID: BY_ID, APPLIES: APPLIES, derivedFromExpenses: derivedFromExpenses };
})(typeof window !== 'undefined' ? window : globalThis);
