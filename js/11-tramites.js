/* Rinde Fácil — trámites en lenguaje simple. Cada trámite conserva sus fuentes (Manual, flujograma, presentaciones). */
(function (root) {
  'use strict';
  var RF = root.RF = root.RF || {};

  /* img: [archivo, leyenda]  ·  tools: ids de herramientas  ·  who: actor principal */
  var T = [
    /* ---------- Fase 1: pasos del proceso (no son trámites del inventario) ---------- */
    { id: 'P-01', fase: 'F1', kind: 'paso', title: 'Firmar el convenio', why: 'Es el documento que fija los aportes y cómo usarlos.', who: 'comunidad', when: 'Al inicio', need: ['Convenio entregado por CORFO'],
      steps: ['Recibe el convenio de CORFO y léelo con la directiva.', 'Firma el convenio junto con CORFO.'],
      img: [['flujograma_overview.jpg', 'Flujograma oficial, pasos 1 y 2']], src: ['Flujograma, pasos 1 y 2'] },
    { id: 'P-02', fase: 'F1', kind: 'paso', title: 'Abrir la cuenta corriente', why: 'El dinero del aporte llega a una cuenta de la comunidad. Sin cuenta, el proceso no avanza.', who: 'comunidad', when: 'Antes de recibir el primer pago', need: ['Documentos de la comunidad', 'Banco'],
      notes: ['Mejor si la cuenta es exclusiva para este aporte: así es más fácil seguir cada peso. Si no puedes, crea un centro de costos separado en tu contabilidad.'],
      steps: ['Abre una cuenta corriente para recibir el aporte.'],
      img: [['doc-004-79b28f1aad_p021.jpg', 'Manual, p. 21: cuenta corriente exclusiva']], src: ['Flujograma, paso 3', 'Manual CORFO, sección X (p. 21)'] },
    { id: 'P-03', fase: 'F1', kind: 'paso', title: 'Recibir el 30 % inicial', why: 'Es el primer pago del aporte. Desde aquí corren tus plazos.', who: 'novandina', when: 'Hasta 15 días hábiles después de la resolución de CORFO', need: ['Cuenta corriente abierta'],
      notes: ['CORFO avisa que la resolución que aprueba el convenio está totalmente tramitada.', 'Novandino (ex SQM) transfiere el 30 % en un máximo de 15 días hábiles.'],
      steps: ['Anota la fecha en que llegó el dinero: desde ahí corren los 90 días del PEA.'], stepTools: {0:['proyecto']},
      tools: ['proyecto'], img: [['flujograma_overview.jpg', 'Flujograma oficial, pasos 4 y 5']], src: ['Flujograma, pasos 4 y 5'] },

    /* ---------- Fase 2: PEA ---------- */
    { id: 'TRM-027', fase: 'F2', title: 'Armar el PEA', why: 'El PEA (Programa de Ejecución de Actividades) explica qué proyectos harás, con qué plazos y presupuesto.', who: 'comunidad', when: '90 días corridos desde el primer pago (se puede prorrogar 30 días, una vez)', need: ['Primer pago recibido', 'Ideas de proyectos', 'Apoyo del Organismo Colaborador (opcional)'],
      notes: ['Tienes 90 días corridos desde el primer pago; CORFO activa ese plazo.'],
      steps: ['Si necesitas ayuda, pídela al Organismo Colaborador antes de redactar (Componente 3).', 'Arma los 3 documentos: información general, un formulario por proyecto y el presupuesto con la Carta Gantt.', 'Envía el PEA a CORFO. Si lo observan, corrígelo y reenvíalo.'], stepTools: { 1: ['pea', 'gantt', 'presupuesto'], 2: ['pea'] }, opt: { 0: 'Opcional' }, related: ['TRM-030'],
      tools: ['necesidades', 'pea', 'gantt', 'presupuesto'], img: [['flujograma_overview.jpg', 'Flujograma oficial, pasos 6 a 14']], src: ['Flujograma, pasos 6 a 14', '«Introducción al Acuerdo», diapositiva 2'] },
    { id: 'TRM-030', fase: 'F2', title: 'Pedir prórroga del PEA (opcional)', optional: true, why: 'Si no alcanzas a entregar el PEA dentro de los 90 días, puedes pedir más tiempo: una sola vez y hasta 30 días.', who: 'comunidad', when: 'Antes de que venza el plazo de 90 días', need: ['Plazo del PEA corriendo', 'El motivo por el que necesitas más tiempo'],
      notes: ['Se puede pedir una sola vez y por hasta 30 días más.', 'Tiene que ser una solicitud fundada y hacerse antes de que venza el plazo.'],
      steps: ['Redacta la solicitud: explica por qué necesitas más tiempo y cuántos días pides.', 'Junta lo que respalde tu motivo y envía la solicitud a CORFO antes de que venza el plazo.'], stepTools: { 0: ['prorroga'] },
      open: 'El flujograma no dice por qué canal se envía ni qué antecedentes hay que adjuntar. Confírmalo con tu ejecutivo técnico antes de enviarla.',
      tools: ['prorroga'], img: [['flujograma_overview.jpg', 'Flujograma oficial, paso 8']], src: ['Flujograma, paso 8', '«Introducción al Acuerdo», diapositiva 2'] },
    { id: 'TRM-028', fase: 'F2', title: 'Cambiar el PEA (opcional)', optional: true, why: 'Si necesitas mover plata entre cuentas, agregar actividades o cambiar fechas, hay que pedirlo antes de gastar.', who: 'comunidad', when: 'Antes de ejecutar o rendir lo que no calce con el PEA', need: ['PEA vigente', 'Motivo del cambio'],
      notes: ['Reitemización: mover plata entre cuentas o cambiar actividades. Reprogramación: solo cambiar las fechas.', 'Hay que pedirlo y esperar la aprobación de CORFO antes de gastar lo que no calce con el PEA.'],
      steps: ['Completa la solicitud: qué cambia (actividades, presupuesto o fechas), el motivo y qué monto o actividad se ve afectado.', 'Envía la solicitud a CORFO y espera su aprobación antes de gastar.'], stepTools: { 0: ['reitem'] },
      tools: ['reitem'], img: [], src: ['«Introducción al Acuerdo», diapositiva 2'] },

    /* ---------- Fase 3: SGP ---------- */
    { id: 'TRM-002', fase: 'F3', title: 'Entrar a SGP y mantener tu usuario', why: 'SGP es la plataforma de CORFO donde se cargan proyectos y se rinde.', who: 'comunidad', when: 'Antes de cada rendición', need: ['RUT de la comunidad', 'Clave que entrega tu ejecutivo técnico'],
      steps: ['Entra a SGP con tu RUT sin puntos ni guión (ej: 123456789) y tu clave.', 'Revisa que tu proyecto diga «VIGENTE». Si no, no puedes rendir.', 'Escribe a tu ejecutivo técnico de CORFO, con copia a la coordinadora de CORFO y al Organismo Colaborador, para recuperar la clave.'], opt: {2:'Solo si perdiste la clave'},
      img: [['doc-005-7690461ef7_p015.jpg', 'Presentación de rendición, diap. 15: ingreso a SGP'], ['doc-005-7690461ef7_p016.jpg', 'Diap. 16: proyecto VIGENTE']], src: ['Presentación de rendición, diap. 2, 15 y 16'],
      open: 'Las presentaciones traen dos direcciones de SGP: https://sgp.corfo.cl/SGP/Extranet_cei/login.aspx (presentaciones de configuración técnica y financiera y de rendición) y https://sgp.corfo.cl/SGP/extranetv2/login.aspx (presentación «Configuración de Proyecto»). Pregunta a tu ejecutivo técnico cuál usar.' },
    { id: 'TRM-001', fase: 'F3', title: 'Cargar el proyecto en SGP', why: 'CORFO revisa aquí tus etapas, actividades y presupuesto.', who: 'comunidad', when: 'Con el PEA aprobado y antes de rendir', need: ['PEA aprobado', 'Carta Gantt', 'Presupuesto por cuenta'],
      steps: ['Revisa que tu proyecto diga «ADJUDICADO (Configurando)». Si no, consulta a tu ejecutivo.', 'Entra a «Configuración Gantt» y completa cada actividad: etapa, inicio, término y duración.', 'Carga el presupuesto por fuente (F1 = CORFO, F2 = aporte propio) y por cuenta.'], stepTools: { 1: ['gantt'], 2: ['presupuesto'] },
      tools: ['gantt', 'presupuesto'], img: [['2-presentacion-configuracion-de-proyecto_image41.jpg', 'Configuración Gantt en SGP']], src: ['Presentación «Configuración de Proyecto»', 'Manual, sección IV (p. 4-5)'] },

    /* ---------- Fase 4: gastos ---------- */
    { id: 'TRM-006', fase: 'F4', title: 'Cotizaciones y precio de mercado', why: 'Compras grandes necesitan cotizaciones para probar que pagaste un precio justo.', who: 'comunidad', when: 'Antes de comprar o contratar', need: ['Cotizaciones de proveedores distintos'],
      notes: ['No dividas una compra para evitar el umbral: CORFO puede rechazarla.', 'Las 2 cotizaciones no se piden en servicios técnico-profesionales.'],
      steps: ['Si la compra pasa de $10.000.000 netos, reúne al menos 2 cotizaciones de proveedores distintos y no relacionados.', 'Guarda las cotizaciones en el expediente.', 'Con una sola cotización o ninguna, pide autorización a CORFO antes de comprar.', 'Inmuebles y derechos de agua: consigue 2 tasaciones comerciales independientes.'], stepTools: {0:['cotizaciones'],2:['cotizaciones']}, opt: {2:'Solo si no hay más cotizaciones',3:'Solo inmuebles o derechos de agua'},
      tools: ['cotizaciones'], img: [['doc-004-79b28f1aad_p008.jpg', 'Manual, p. 8: adquisiciones']], src: ['Manual CORFO, sección VII (p. 8)'] },
    { id: 'TRM-007', fase: 'F4', title: 'Respaldar sueldos y honorarios', why: 'Los pagos de personas necesitan contrato o boleta y prueba de pago.', who: 'comunidad', when: 'En cada rendición', need: ['Contrato', 'Boleta o liquidación', 'Previred / F29 según el caso', 'Comprobante de pago'],
      notes: ['Contratado: contrato + liquidación + certificado de Previred + Formulario 29 + comprobante de pago.', 'A honorarios: boleta + informe mensual de boletas del SII + Formulario 29 + comprobante de pago.', 'Si la persona no puede emitir boleta, usa una Boleta de Prestación de Servicios de Terceros.', 'Extranjeros: distingue servicio esporádico (invoice o contrato) de permanente (visa o permiso).'],
      steps: ['Reúne los documentos de cada sueldo u honorario, según el tipo de contrato.', 'Completa la ficha técnica de cada persona contratada.'], stepTools: {0:['gastos'],1:['informeD']},
      tools: ['gastos', 'informeD'], img: [['doc-005-7690461ef7_p004.jpg', 'Presentación de rendición, diap. 4: respaldo de Recursos Humanos']], src: ['Manual CORFO, sección IX-a (p. 11-14)'] },
    { id: 'TRM-008', fase: 'F4', title: 'Respaldar gastos de operación', why: 'Compras y servicios de tus actividades se rinden con factura o boleta y prueba de pago.', who: 'comunidad', when: 'En cada rendición', need: ['Factura o boleta', 'Comprobante de pago'],
      notes: ['Factura: copia + Formulario 29 + comprobante de pago.', 'Boleta: copia + comprobante de pago.', 'Un error en los datos del documento puede rechazar toda la rendición.'],
      steps: ['Junta los respaldos de cada gasto.', 'Anota cada gasto con los datos exactos del documento: folio, fecha, RUT y nombre del proveedor, montos.'], stepTools: {1:['gastos']},
      tools: ['gastos'], img: [['doc-005-7690461ef7_p005.jpg', 'Presentación de rendición, diap. 5: respaldo de operación'], ['doc-005-7690461ef7_p018.jpg', 'Diap. 18: cómo anotar un gasto en SGP']], src: ['Manual CORFO, sección IX-b (p. 14-18)', 'Presentación de rendición, diap. 5 y 18'] },
    { id: 'TRM-009', fase: 'F4', title: 'Respaldar compras de activos e inmuebles', why: 'Las compras grandes (vehículos, maquinaria, terrenos) piden más papeles.', who: 'comunidad', when: 'En la rendición del período', need: ['Factura o escritura', 'Pago', 'Tasaciones y certificados si es inmueble'],
      steps: ['Reúne la factura y anótala en la cuenta de inversión.', 'Completa la ficha técnica del activo.', 'Agrega las cotizaciones (compras sobre $10.000.000 netos).', 'Inmueble o derechos de agua: reúne el certificado del Conservador (libre de gravámenes) y 2 tasaciones.', 'Construcciones: guarda los permisos y saca fotos.'], stepTools: {0:['gastos'],1:['informeC'],2:['cotizaciones']}, opt: {2:'Solo sobre $10.000.000',3:'Solo inmuebles o derechos de agua',4:'Solo construcciones'},
      tools: ['gastos', 'informeC'], img: [['doc-004-79b28f1aad_p019.jpg', 'Manual, p. 19: inmuebles y derechos de agua']], src: ['Manual CORFO, sección IX-c (p. 18-19)'] },
    { id: 'TRM-010', fase: 'F4', title: 'Repartir gastos de administración', why: 'La luz, el internet o el contador sirven a varios proyectos: se reparte el gasto con una memoria de cálculo.', who: 'comunidad', when: 'Con la rendición del período', need: ['Documento del gasto', 'Porcentaje de uso'],
      notes: ['El tope es $3.000.000 al mes en esta cuenta.', 'Servicios básicos: la dirección debe ser donde se hacen las actividades.'],
      steps: ['Calcula qué porcentaje del gasto corresponde al proyecto.', 'Completa la memoria de cálculo (Anexo 5).', 'Adjunta el documento original con la memoria.'], stepTools: {1:['anexo5']},
      tools: ['anexo5', 'gastos'], img: [['doc-004-79b28f1aad_p020.jpg', 'Manual, p. 20: gastos de administración']], src: ['Manual CORFO, sección IX-d (p. 20-21)'] },
    { id: 'TRM-011', fase: 'F4', title: 'Viajes y viáticos', why: 'Los viajes se financian solo si son necesarios y están bien respaldados.', who: 'comunidad', when: 'Consulta antes del viaje; rendición en el período', need: ['Objetivo del viaje', 'Quiénes viajan', 'Pasajes y comprobantes'],
      notes: ['Compra los pasajes con 15 días de anticipación, en clase económica.', 'El viático diario no puede superar los topes del DFL 262/1977 (grado 4° de la escala única).'],
      steps: ['El viaje debe ser esencial: anota a cada asistente, su rol y por qué es necesario.', 'Completa el certificado de viático (Anexo 4).', 'Gastos en el extranjero: reúne el documento del país, traducción simple si hace falta y el monto en pesos al tipo de cambio del Banco Central.'], stepTools: {1:['anexo4']}, opt: {2:'Solo si el gasto fue en el extranjero'},
      tools: ['anexo4', 'gastos'], img: [['doc-004-79b28f1aad_p015.jpg', 'Manual, p. 15: viáticos y pasajes']], src: ['Manual CORFO, sección IX-b (p. 14-17)'] },
    { id: 'TRM-012', fase: 'F4', title: 'Probar que pagaste', why: 'Cada gasto debe estar pagado y demostrarlo.', who: 'comunidad', when: 'Antes de enviar la rendición', need: ['Cartola, transferencia, cheque cobrado o voucher'],
      notes: ['Transferencia: guarda el comprobante o la cartola. Cheque: la cartola donde se cobró.', 'Tarjeta de crédito (excepcional): paga en 1 cuota dentro de un mes.', 'PayPal: invoice del proveedor y detalle de la transacción.'],
      steps: ['Anota cómo pagaste cada gasto.', 'Guarda el comprobante de pago de cada gasto (mira abajo qué sirve según la forma de pago).', 'Efectivo: completa la declaración jurada simple (Anexo 3), firmada por quien recibió.'], stepTools: {0:['gastos'],2:['anexo3']}, opt: {2:'Solo pagos en efectivo'},
      tools: ['gastos', 'anexo3'], img: [['doc-004-79b28f1aad_p014.jpg', 'Manual, p. 14: cómo acreditar el pago']], src: ['Manual CORFO, secciones IX y X (p. 14, 21-22)'] },
    { id: 'TRM-021', fase: 'F4', title: 'Anexo 1: no usaste el IVA', why: 'Si la comunidad paga IVA pero no lo recupera, esta declaración permite rendir el valor con IVA.', who: 'comunidad', when: 'Con la rendición que lleva las facturas', need: ['Facturas', 'Formularios 29 sin uso del IVA'],
      notes: ['Úsalo solo si eres contribuyente de IVA y decides no usar el crédito fiscal.'],
      steps: ['Completa los datos de la comunidad, el proyecto y el período.', 'Adjunta los Formularios 29 de cada mes.', 'Fírmalo antes de adjuntarlo.'], stepTools: {0:['anexo1'],2:['anexo1']},
      tools: ['anexo1'], img: [['doc-004-79b28f1aad_p007.jpg', 'Manual, p. 7: tratamiento del IVA']], src: ['Manual CORFO, sección VI-a (p. 7) y Anexo 1 (p. 23)'] },
    { id: 'TRM-022', fase: 'F4', title: 'Anexo 2: IVA que no es del proyecto', why: 'Si el F29 muestra IVA usado pero es de otras compras, se declara aquí cuáles.', who: 'comunidad', when: 'Con la rendición del período', need: ['Lista de facturas ajenas al proyecto'],
      notes: ['Úsalo si el F29 muestra IVA usado, pero de compras que no son del proyecto.'],
      steps: ['Anota cada factura: número, fecha, valores, detalle y contexto.', 'Fírmalo.'], stepTools: {0:['anexo2'],1:['anexo2']},
      tools: ['anexo2'], img: [['doc-004-79b28f1aad_p024.jpg', 'Manual, p. 24: Anexo 2']], src: ['Manual CORFO, Anexo 2 (p. 24)'] },
    { id: 'TRM-023', fase: 'F4', title: 'Anexo 3: pago en efectivo', why: 'Cuando pagas en efectivo, quien recibe firma que le pagaron.', who: 'comunidad', when: 'Junto al documento del gasto', need: ['Datos de quien recibió', 'Monto y documento pagado'],
      notes: ['Úsalo solo si el pago fue en efectivo. Sin este anexo, el gasto en efectivo queda observado.'],
      steps: ['Anota nombre y RUT de quien recibió el pago.', 'Indica el monto, la fecha y el documento que acredita.', 'Que firme quien recibió el dinero.', 'Adjúntalo al gasto.'], stepTools: {0:['anexo3'],1:['anexo3'],2:['anexo3']},
      tools: ['anexo3'], img: [['doc-004-79b28f1aad_p025.jpg', 'Manual, p. 25: Anexo 3']], src: ['Manual CORFO, Anexo 3 (p. 25)'] },
    { id: 'TRM-024', fase: 'F4', title: 'Anexo 4: certificado de viático', why: 'Deja constancia del viaje y de que la persona recibió su viático.', who: 'comunidad', when: 'Con la rendición del viaje', need: ['Viajero, destino, fechas y monto por día'],
      steps: ['Completa el encabezado: comunidad, proyecto y viajero.', 'Llena la tabla: destino, fechas, días y monto por día.', 'El viajero declara cómo recibió el pago y la fecha.', 'Firman el viajero y quien representa a la comunidad.'], stepTools: {0:['anexo4'],1:['anexo4'],2:['anexo4'],3:['anexo4']},
      tools: ['anexo4'], img: [['doc-004-79b28f1aad_p026.jpg', 'Manual, p. 26: Anexo 4']], src: ['Manual CORFO, Anexo 4 (p. 26)'] },
    { id: 'TRM-025', fase: 'F4', title: 'Anexo 5: memoria de cálculo de administración', why: 'Muestra qué parte de cada gasto administrativo corresponde al proyecto.', who: 'comunidad', when: 'Durante el primer mes del período a informar', need: ['Documentos de administración', 'Porcentajes de uso'],
      notes: ['Si recuperas IVA, usa el monto neto.'],
      steps: ['Completa una fila por gasto: concepto, período, N° de documento, monto y porcentaje.', 'Verifica que el porcentaje esté justificado y que el total sume bien.', 'Súbela en Word, Excel o PDF, por cada ítem de la cuenta de administración.'], stepTools: {0:['anexo5'],1:['anexo5']},
      tools: ['anexo5'], img: [['doc-004-79b28f1aad_p027.jpg', 'Manual, p. 27: Anexo 5']], src: ['Manual CORFO, sección IX-d (p. 20) y Anexo 5 (p. 27)'] },

    /* ---------- Fase 5: rendir ---------- */
    { id: 'TRM-013', fase: 'F5', title: 'Preparar y enviar la rendición', why: 'Aquí juntas todos los gastos del período y los envías por SGP.', who: 'comunidad', when: 'En la fecha de tu calendario de rendiciones (cada 6 meses como máximo)', need: ['Gastos del período', 'Respaldos y pruebas de pago'],
      notes: ['Un documento emitido después del cierre va en la rendición siguiente (salvo el informe final).'],
      steps: ['Revisa el presupuesto disponible por cuenta.', 'Anota cada gasto, uno a uno, con fecha y forma de pago exactas y su respaldo.', 'Revisa el resumen por cuentas y corrige lo que no cuadre.', 'Envía a tiempo.'], stepTools: {1:['gastos'],2:['resumen']},
      tools: ['gastos', 'revision'], img: [['doc-004-79b28f1aad_p009.jpg', 'Manual, p. 9: preparación y envío']], src: ['Manual CORFO, sección VIII (p. 9-10)'] },
    { id: 'TRM-014', fase: 'F5', title: 'Cuadrar el resumen por cuentas', why: 'Antes de enviar, los totales de cada cuenta deben calzar con lo presupuestado.', who: 'comunidad', when: 'Antes de cada envío', need: ['Gastos ingresados'],
      steps: ['En SGP entra a «Resumen por Cuentas».', 'Comprueba que los montos sean los que debías cargar, cuenta por cuenta.', 'Corrige o explica cualquier diferencia antes de enviar.'], stepTools: {2:['resumen']},
      tools: ['resumen', 'revision'], img: [['doc-005-7690461ef7_p020.jpg', 'Presentación de rendición, diap. 20: resumen por cuentas']], src: ['Presentación de rendición, diap. 20'] },
    { id: 'TRM-016', fase: 'F5', title: 'Informe técnico de avance', why: 'Cuenta qué actividades hiciste y cómo van, junto con la rendición.', who: 'comunidad', when: 'Según tu calendario, cuando el informe figure «Pendiente»', need: ['Datos del proyecto', 'Actividades realizadas', 'Fotos'],
      notes: ['Inversión y Fomento: informe técnico (Anexo 6). Administración: memoria de cálculo (Anexo 5).'],
      steps: ['En SGP elige «Informe de Avance» y «Ver Informe / Rendir».', 'Completa datos generales y objetivos.', 'Llena cada actividad con su formato (A a E).', 'Adjunta archivos y presiona «Enviar Informe».'], stepTools: {1:['informe'],2:['informeA','informeB','informeC','informeD','informeE']},
      tools: ['informe'], img: [['doc-005-7690461ef7_p024.jpg', 'Presentación de rendición, diap. 24: informe técnico en SGP'], ['doc-004-79b28f1aad_p028.jpg', 'Manual, p. 28: portada del informe']], src: ['Manual CORFO, Anexo 6 (p. 28-38)', 'Presentación de rendición, diap. 23-28'] },
    { id: 'TRM-017', fase: 'F5', title: 'Ficha de actividades de la comunidad', why: 'Talleres, capacitaciones y visitas se informan con esta ficha.', who: 'comunidad', when: 'Con el informe técnico', need: ['Nombre, fecha, lugar y asistentes', 'Lista de asistencia', 'Fotos'],
      steps: ['Llena una ficha por actividad.', 'Cuenta los objetivos, proveedores y participantes.', 'Informa el avance real y programado.', 'Adjunta la lista de asistencia firmada (o pantallazo si fue en línea) y fotos.'], stepTools: {0:['informeA'],1:['informeA'],2:['informeA']},
      tools: ['informeA'], img: [['doc-004-79b28f1aad_p032.jpg', 'Manual, p. 32: formato A']], src: ['Manual CORFO, Anexo 6-A (p. 32)'] },
    { id: 'TRM-018', fase: 'F5', title: 'Ficha de estudios y consultorías', why: 'Los estudios contratados se informan con sus entregables.', who: 'comunidad', when: 'Con el informe técnico', need: ['Proveedor', 'Monto adjudicado', 'Entregables'],
      steps: ['Llena una ficha por estudio.', 'Describe el objetivo y los entregables.', 'Informa el avance.', 'Adjunta los informes del estudio.'], stepTools: {0:['informeB'],1:['informeB'],2:['informeB']},
      tools: ['informeB'], img: [['doc-004-79b28f1aad_p034.jpg', 'Manual, p. 34: formato B']], src: ['Manual CORFO, Anexo 6-B (p. 33-34)'] },
    { id: 'TRM-019', fase: 'F5', title: 'Ficha de infraestructura y activos', why: 'Obras y compras de activos se informan con fotos y permisos.', who: 'comunidad', when: 'Con el informe técnico', need: ['Datos del activo u obra', 'Fotos', 'Permisos si es construcción'],
      steps: ['Llena una ficha por activo u obra.', 'Informa el avance.', 'Guarda copia de los permisos (física y escaneada).', 'Adjunta fotos.'], stepTools: {0:['informeC'],1:['informeC']},
      tools: ['informeC'], img: [['doc-004-79b28f1aad_p035.jpg', 'Manual, p. 35: formato C']], src: ['Manual CORFO, Anexo 6-C (p. 34-36)'] },
    { id: 'TRM-020', fase: 'F5', title: 'Ficha de personas contratadas y otras actividades', why: 'Cada persona contratada y cada actividad que no calza en las otras fichas.', who: 'comunidad', when: 'Con el informe técnico', need: ['Datos de la persona o actividad', 'Meses y montos'],
      steps: ['Personas: una ficha por persona (nombre, RUT, meses, función).', 'Otras actividades: descripción, proveedor, montos y fechas.', 'Informa el avance.', 'Revisa que calce con lo rendido en gastos.'], stepTools: {0:['informeD'],1:['informeE'],2:['informeD']},
      tools: ['informeD', 'informeE'], img: [['doc-004-79b28f1aad_p036.jpg', 'Manual, p. 36: formato D']], src: ['Manual CORFO, Anexo 6-D y 6-E (p. 36-38)'] },
    { id: 'TRM-015', fase: 'F5', title: 'Responder las observaciones de CORFO', why: 'Si CORFO observa gastos, tienes 10 días hábiles y una sola oportunidad para aclarar.', who: 'comunidad', when: '10 días hábiles desde que CORFO comunica las observaciones', need: ['Observaciones de CORFO', 'Documentos que faltan'],
      notes: ['CORFO revisa los gastos y puede pedir más antecedentes.', 'Solo tienes una oportunidad para aclarar. Si no respondes a tiempo, los gastos observados se rechazan.', 'CORFO revisa tus respuestas y cierra la revisión.'],
      steps: ['Aclara las observaciones en un máximo de 10 días hábiles: regístralas en SGP y comenta la glosa del gasto.', 'Pídele ayuda al Organismo Colaborador.'], stepTools: {0:['observaciones']}, opt: {1:'Solo si la necesitas'},
      tools: ['observaciones'], img: [['doc-004-79b28f1aad_p010.jpg', 'Manual, p. 10: revisión y aclaración']], src: ['Manual CORFO, sección VIII (p. 10-11)'] },

    /* ---------- Fase 6 ---------- */
    { id: 'TRM-029', fase: 'F6', title: 'Pedir los aportes restantes', why: 'Al cerrar la revisión de tu rendición, puedes pedir el resto del dinero.', who: 'comunidad', when: 'Cuando CORFO finaliza la revisión de la rendición', need: ['Rendición cerrada por CORFO'],
      notes: ['Novandino (ex SQM) transfiere los aportes.', 'Recuerda: la rendición se hace cada 6 meses como máximo.'],
      steps: ['Confirma que CORFO finalizó la revisión de tu rendición.', 'Presenta la solicitud de los aportes restantes.'], stepTools: {1:['solicitud']},
      tools: ['solicitud'], img: [['flujograma_overview.jpg', 'Flujograma oficial, pasos 26 a 28']], src: ['Flujograma, pasos 26 a 28', '«Introducción al Acuerdo», diapositiva 4'] },

    /* ---------- Ayuda ---------- */
    { id: 'TRM-026', fase: 'AY', title: 'Consultar una duda a CORFO', why: 'CORFO resuelve las dudas sobre el Manual. Mejor preguntar antes de gastar.', who: 'comunidad', when: 'Antes de ejecutar o rendir, si la duda importa', need: ['Tu pregunta', 'Los hechos', 'Qué parte del Manual'],
      steps: ['Escribe la consulta: qué pasó, qué parte del Manual, y cuánto dinero o plazo está en juego.', 'Envíala a CORFO. El Organismo Colaborador puede ayudar a comunicarse.', 'Guarda la respuesta en tu expediente antes de decidir.'], stepTools: {0:['consulta']},
      tools: ['consulta'], img: [['doc-004-79b28f1aad_p022.jpg', 'Manual, p. 22: interpretación']], src: ['Manual CORFO, sección XI (p. 22)'] }
  ];

  var BY_ID = {}; T.forEach(function (t) { BY_ID[t.id] = t; });

  RF.tramites = { list: T, byId: BY_ID };
})(typeof window !== 'undefined' ? window : globalThis);
