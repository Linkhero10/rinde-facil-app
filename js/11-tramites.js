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
      steps: ['Anota la fecha en que llegó el dinero: desde ahí corren los 90 días del PEA.'], stepTools: {0:['proyecto']}, auto: { 0: 'desembolso' },
      tools: ['proyecto'], img: [['flujograma_overview.jpg', 'Flujograma oficial, pasos 4 y 5']], src: ['Flujograma, pasos 4 y 5'] },

    /* ---------- Fase 2: PEA ---------- */
    { id: 'TRM-027', fase: 'F2', title: 'Armar el PEA', why: 'El PEA (Programa de Ejecución de Actividades) explica qué proyectos harás, con qué plazos y presupuesto.', who: 'comunidad', when: '90 días corridos desde el primer pago (se puede prorrogar 30 días, una vez)', need: ['Primer pago recibido', 'Ideas de proyectos', 'Apoyo del Organismo Colaborador (opcional)'],
      notes: ['Tienes 90 días corridos desde el primer pago; CORFO activa ese plazo.'],
      steps: ['Si necesitas ayuda, pídela al Organismo Colaborador antes de redactar (Componente 3).', 'Arma los 3 documentos: información general, un formulario por proyecto y el presupuesto con la Carta Gantt.', 'Envía el PEA a CORFO. Si lo observan, corrígelo y reenvíalo.'], stepTools: { 1: ['pea', 'gantt', 'presupuesto'], 2: ['pea'] }, opt: { 0: 'Opcional' }, related: ['TRM-030'], auto: { 1: 'pea_docs' },
      tools: ['necesidades', 'pea', 'gantt', 'presupuesto'], img: [['flujograma_overview.jpg', 'Flujograma oficial, pasos 6 a 14']], src: ['Flujograma, pasos 6 a 14', '«Introducción al Acuerdo», diapositiva 2'] },
    { id: 'TRM-030', fase: 'F2', title: 'Pedir prórroga del PEA (opcional)', optional: true, why: 'Si no alcanzas a entregar el PEA dentro de los 90 días, puedes pedir más tiempo: una sola vez y hasta 30 días.', who: 'comunidad', when: 'Antes de que venza el plazo de 90 días', need: ['Plazo del PEA corriendo', 'El motivo por el que necesitas más tiempo'],
      notes: ['Se puede pedir una sola vez y por hasta 30 días más.', 'Tiene que ser una solicitud fundada y hacerse antes de que venza el plazo.'],
      steps: ['Redacta la solicitud: explica por qué necesitas más tiempo y cuántos días pides.', 'Junta lo que respalde tu motivo y envía la solicitud a CORFO antes de que venza el plazo.'], stepTools: { 0: ['prorroga'] }, auto: { 0: 'prorroga_form' },
      open: 'El flujograma no dice por qué canal se envía ni qué antecedentes hay que adjuntar. Confírmalo con tu ejecutivo técnico antes de enviarla.',
      tools: ['prorroga'], img: [['flujograma_overview.jpg', 'Flujograma oficial, paso 8']], src: ['Flujograma, paso 8', '«Introducción al Acuerdo», diapositiva 2'] },
    { id: 'TRM-028', fase: 'F2', title: 'Cambiar el PEA (opcional)', optional: true, why: 'Si necesitas mover plata entre cuentas, agregar actividades o cambiar fechas, hay que pedirlo antes de gastar.', who: 'comunidad', when: 'Antes de ejecutar o rendir lo que no calce con el PEA', need: ['PEA vigente', 'Motivo del cambio'],
      notes: ['Reitemización: mover plata entre cuentas o cambiar actividades. Reprogramación: solo cambiar las fechas.', 'Hay que pedirlo y esperar la aprobación de CORFO antes de gastar lo que no calce con el PEA.'],
      steps: ['Completa la solicitud: qué cambia (actividades, presupuesto o fechas), el motivo y qué monto o actividad se ve afectado.', 'Envía la solicitud a CORFO y espera su aprobación antes de gastar.'], stepTools: { 0: ['reitem'] }, auto: { 0: 'reitem_form' },
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
      notes: ['No dividas una compra para evitar el umbral: CORFO puede rechazarla.', 'Las 2 cotizaciones no se piden en servicios técnico-profesionales.', { t: 'Con una sola cotización o ninguna, hay que pedir autorización a CORFO antes de comprar.', tag: 'Solo si aplica', a: ['Preparar la consulta a CORFO', '#/h/consulta'] }, { t: 'Inmuebles y derechos de agua: se piden 2 tasaciones comerciales independientes.', tag: 'Solo si aplica', a: ['Ver cómo respaldar compras de activos', '#/t/TRM-009'] }],
      steps: ['Si la compra pasa de $10.000.000 netos, reúne al menos 2 cotizaciones de proveedores distintos y no relacionados y compáralas.'], stepTools: { 0: ['cotizaciones'] }, auto: { 0: 'cot_ok' },
      tools: ['cotizaciones'], img: [['doc-004-79b28f1aad_p008.jpg', 'Manual, p. 8: adquisiciones']], src: ['Manual CORFO, sección VII (p. 8)'] },
    { id: 'TRM-007', fase: 'F4', title: 'Respaldar sueldos y honorarios', why: 'Los pagos de personas necesitan contrato o boleta y prueba de pago.', who: 'comunidad', when: 'En cada rendición', need: ['Contrato', 'Boleta o liquidación', 'Previred / F29 según el caso', 'Comprobante de pago'],
      notes: ['Contratado: contrato + liquidación + certificado de Previred + Formulario 29 + comprobante de pago.', 'A honorarios: boleta + informe mensual de boletas del SII + Formulario 29 + comprobante de pago.', 'Si la persona no puede emitir boleta, usa una Boleta de Prestación de Servicios de Terceros.', 'Extranjeros: distingue servicio esporádico (invoice o contrato) de permanente (visa o permiso).'],
      steps: ['Cada sueldo u honorario tiene sus documentos, según el tipo de contrato.', 'Cada persona contratada tiene su ficha técnica.'], stepTools: { 0: ['gastos'], 1: ['informeD'] }, auto: { 0: 'resp_rrhh', 1: 'ficha_D' },
      tools: ['gastos', 'informeD'], img: [['doc-005-7690461ef7_p004.jpg', 'Presentación de rendición, diap. 4: respaldo de Recursos Humanos']], src: ['Manual CORFO, sección IX-a (p. 11-14)'] },
    { id: 'TRM-008', fase: 'F4', title: 'Respaldar cada gasto', why: 'Cada gasto se rinde con su documento, los datos exactos y la prueba de que lo pagaste. La app lo revisa sola.', who: 'comunidad', when: 'En cada rendición', need: ['Factura o boleta', 'Comprobante de pago'],
      notes: ['Factura: copia + Formulario 29 + comprobante de pago. Boleta: copia + comprobante de pago.', 'Un error en los datos del documento puede rechazar toda la rendición.', 'Transferencia: guarda el comprobante o la cartola. Cheque: la cartola donde se cobró.', { t: 'Pago en efectivo: declaración jurada simple firmada por quien recibió.', tag: 'Solo si aplica', a: ['Rellenar el Anexo 3', '#/h/anexo3'] }, 'Tarjeta de crédito (excepcional): paga en 1 cuota dentro de un mes. PayPal: invoice del proveedor y detalle de la transacción.', { t: 'Si anotas facturas, sube el Formulario 29 de cada mes y la app lo compara con el IVA.', tag: 'Solo si aplica', a: ['Ir al Formulario 29', '#/h/f29'] }],
      steps: ['Cada gasto tiene sus respaldos: el documento, el F29 si es factura y la prueba de pago.', 'Cada gasto está revisado contra el documento original (folio, fecha, RUT y montos).'], stepTools: { 0: ['gastos'] }, auto: { 0: 'resp_todos', 1: 'verificados' },
      tools: ['gastos'], img: [['doc-005-7690461ef7_p005.jpg', 'Presentación de rendición, diap. 5: respaldo de operación'], ['doc-005-7690461ef7_p018.jpg', 'Diap. 18: cómo anotar un gasto en SGP']], src: ['Manual CORFO, sección IX-b (p. 14-18)', 'Presentación de rendición, diap. 5 y 18'] },
    { id: 'TRM-009', fase: 'F4', title: 'Respaldar compras de activos e inmuebles', why: 'Las compras grandes (vehículos, maquinaria, terrenos) piden más papeles.', who: 'comunidad', when: 'En la rendición del período', need: ['Factura o escritura', 'Pago', 'Tasaciones y certificados si es inmueble'],
      steps: ['Las compras de la cuenta de inversión tienen todos sus respaldos.', 'Cada activo u obra tiene su ficha técnica.', 'Agrega las cotizaciones (compras sobre $10.000.000 netos).', 'Inmueble o derechos de agua: sube como respaldo del gasto el certificado del Conservador (libre de gravámenes) y las 2 tasaciones.', 'Construcciones: sube los permisos y las fotos (no pasan por OCR).'], stepTools: { 0: ['gastos'], 1: ['informeC'], 2: ['cotizaciones'], 3: ['gastos'], 4: ['obras'] }, opt: { 2: 'Solo sobre $10.000.000', 3: 'Solo inmuebles o derechos de agua', 4: 'Solo construcciones' }, auto: { 0: 'resp_inversion', 1: 'ficha_C' },
      tools: ['gastos', 'informeC'], img: [['doc-004-79b28f1aad_p019.jpg', 'Manual, p. 19: inmuebles y derechos de agua']], src: ['Manual CORFO, sección IX-c (p. 18-19)'] },
    { id: 'TRM-011', fase: 'F4', title: 'Viajes y viáticos', why: 'Los viajes se financian solo si son necesarios y están bien respaldados.', who: 'comunidad', when: 'Consulta antes del viaje; rendición en el período', need: ['Objetivo del viaje', 'Quiénes viajan', 'Pasajes y comprobantes'],
      notes: ['Compra los pasajes con 15 días de anticipación, en clase económica.', 'El viático diario no puede superar los topes del DFL 262/1977 (grado 4° de la escala única).'],
      steps: ['El viaje debe ser esencial: registra a cada asistente, su rol y por qué es necesario.', 'Completa el certificado de viático (Anexo 4).', 'Gastos en el extranjero: reúne el documento del país, traducción simple si hace falta y el monto en pesos al tipo de cambio del Banco Central.'], stepTools: { 0: ['viaje'], 1: ['anexo4'] }, opt: {2:'Solo si el gasto fue en el extranjero'}, auto: { 0: 'viaje_form', 1: 'anexo4' },
      tools: ['anexo4', 'gastos'], img: [['doc-004-79b28f1aad_p015.jpg', 'Manual, p. 15: viáticos y pasajes']], src: ['Manual CORFO, sección IX-b (p. 14-17)'] },
    { id: 'TRM-021', fase: 'F4', title: 'Anexo 1 · Declaración por no utilización de IVA CF', why: 'Si eres contribuyente de IVA y decides no usar el crédito fiscal, lo declaras bajo juramento con este documento.', who: 'comunidad', when: 'Con la rendición', need: ['Datos de la comunidad y del proyecto', 'Formularios 29 de cada mes'],
      embed: ['anexo1'],
      notes: [{ t: 'Úsalo solo si eres contribuyente de IVA y decides no usar el crédito fiscal.', tag: 'Solo si aplica' }, { t: 'Se acompaña con los Formularios 29 de cada mes.', a: ['Ir al Formulario 29', '#/h/f29'] }],
      steps: ['Listo: llené la declaración, la firmé y adjunté los Formularios 29 de cada mes.'], gate: [0],
      img: [['doc-004-79b28f1aad_p007.jpg', 'Manual, p. 7: IVA']], src: ['Manual CORFO, Anexo N° 1'] },
    { id: 'TRM-022', fase: 'F4', title: 'Anexo 2 · IVA CF no relacionado con los proyectos', why: 'Si el F29 muestra IVA usado, pero de compras que no son del proyecto, se declara con este documento.', who: 'comunidad', when: 'Con la rendición', need: ['Formularios 29', 'Facturas de las otras compras'],
      embed: ['anexo2'],
      notes: [{ t: 'Úsalo si el F29 muestra IVA usado, pero de compras que no son del proyecto.', tag: 'Solo si aplica' }],
      steps: ['Listo: llené la declaración con cada factura y la firmé.'], gate: [0],
      img: [], src: ['Manual CORFO, Anexo N° 2'] },
    { id: 'TRM-023', fase: 'F4', title: 'Anexo 3 · Declaración jurada simple (pago en efectivo)', why: 'Quien recibe un pago en efectivo declara por escrito que lo recibió. Va una declaración por cada pago.', who: 'comunidad', when: 'Con cada pago en efectivo', need: ['Datos de quien recibió el pago'],
      embed: ['anexo3'],
      notes: [{ t: 'Úsalo solo si el pago fue en efectivo. Sin este anexo, el gasto en efectivo queda observado.', tag: 'Solo si aplica' }, 'No tienes que adjuntarlo al gasto: la app lo vincula sola cuando eliges el gasto en efectivo.'],
      steps: ['Listo: hay una declaración firmada por cada pago en efectivo.'], gate: [0],
      img: [], src: ['Manual CORFO, Anexo N° 3 y sección IX (p. 14 y 21)'] },
    { id: 'TRM-024', fase: 'F4', title: 'Anexo 4 · Certificado de viático', why: 'Cada persona que viaja recibe un viático y certifica que lo recibió. Va un certificado por persona.', who: 'comunidad', when: 'Con cada viaje', need: ['Registro del viaje', 'Datos de quien viaja'],
      embed: ['anexo4'],
      notes: [{ t: 'Antes del certificado, registra quién viaja y por qué era necesario.', a: ['Registro del viaje', '#/h/viaje'] }, { t: 'Los pasajes y el alojamiento se suben como gastos, con su boleta o factura.', a: ['Ir a Gastos', '#/h/gastos'] }],
      steps: ['Listo: cada persona que viajó tiene su certificado firmado.'], gate: [0],
      img: [], src: ['Manual CORFO, Anexo N° 4'] },
    { id: 'TRM-025', fase: 'F4', title: 'Anexo 5 · Memoria de cálculo de gastos de administración', why: 'La luz, el internet o el contador sirven a varios proyectos: se reparte el gasto con esta memoria de cálculo.', who: 'comunidad', when: 'Con la rendición de cada período', need: ['Gastos anotados en la cuenta Administración'],
      embed: ['anexo5'],
      notes: ['El tope es $3.000.000 al mes en esta cuenta.', 'Servicios básicos: la dirección debe ser donde se hacen las actividades.', 'Se sube en Word, Excel o PDF, por cada ítem de la cuenta de administración.', { t: 'Sube la boleta o factura de cada gasto repartido como gasto de la cuenta Administración.', a: ['Ir a Gastos', '#/h/gastos'] }],
      steps: ['Listo: completé la memoria de cálculo y subí el documento original de cada gasto.'], gate: [0],
      stepTools: { 0: ['gastos'] },
      img: [['doc-004-79b28f1aad_p020.jpg', 'Manual, p. 20: gastos de administración']], src: ['Manual CORFO, sección IX-d (p. 20-21) y Anexo N° 5'] },

    /* ---------- Fase 5: rendir ---------- */
    { id: 'TRM-013', fase: 'F5', title: 'Preparar y enviar la rendición', why: 'Aquí juntas todos los gastos del período y los envías por SGP.', who: 'comunidad', when: 'En la fecha de tu calendario de rendiciones (cada 6 meses como máximo)', need: ['Gastos del período', 'Respaldos y pruebas de pago'],
      notes: ['Un documento emitido después del cierre va en la rendición siguiente (salvo el informe final).'],
      steps: ['Revisa el presupuesto disponible por cuenta.', 'Anota cada gasto, uno a uno, con fecha y forma de pago exactas y su respaldo.', 'Revisa el resumen por cuentas y corrige lo que no cuadre.', 'Envía a tiempo.'], stepTools: {1:['gastos'],2:['resumen']}, auto: { 1: 'gastos_ok' },
      tools: ['gastos', 'revision'], img: [['doc-004-79b28f1aad_p009.jpg', 'Manual, p. 9: preparación y envío']], src: ['Manual CORFO, sección VIII (p. 9-10)'] },
    { id: 'TRM-014', fase: 'F5', title: 'Cuadrar el resumen por cuentas', why: 'Antes de enviar, los totales de cada cuenta deben calzar con lo presupuestado.', who: 'comunidad', when: 'Antes de cada envío', need: ['Gastos ingresados'],
      steps: ['En SGP entra a «Resumen por Cuentas».', 'Comprueba que los montos sean los que debías cargar, cuenta por cuenta.', 'Corrige o explica cualquier diferencia antes de enviar.'], stepTools: {2:['resumen']},
      tools: ['resumen', 'revision'], img: [['doc-005-7690461ef7_p020.jpg', 'Presentación de rendición, diap. 20: resumen por cuentas']], src: ['Presentación de rendición, diap. 20'] },
    { id: 'TRM-016', fase: 'F5', title: 'Informe técnico de avance (Anexo 6)', why: 'Cuenta qué actividades hiciste y cómo van, junto con la rendición. Aquí llenas el informe y las fichas de lo que hiciste.', who: 'comunidad', when: 'Con cada rendición', need: ['Datos del proyecto', 'Lo que hiciste en el período'],
      embed: ['informe'], embedFichas: ['informeA', 'informeB', 'informeC', 'informeD', 'informeE'],
      notes: ['Inversión y Fomento: informe técnico (Anexo 6). Administración: memoria de cálculo (Anexo 5).', { t: 'Cada gasto de inversión o de personas tiene un botón para crear su ficha con los datos ya puestos.', a: ['Ir a Gastos', '#/h/gastos'] }, { t: 'Las fotos y los permisos de obras se suben aparte, sin OCR.', a: ['Permisos y fotos de obras', '#/h/obras'] }],
      steps: ['Completa los datos generales y los objetivos del informe.', 'Completa las fichas de lo que hiciste (actividades, estudios, activos, personas).', 'En SGP elige «Informe de Avance» y «Ver Informe / Rendir», adjunta los archivos y presiona «Enviar Informe».'], auto: { 0: 'informe_general', 1: 'fichas_alguna' },
      img: [['doc-005-7690461ef7_p024.jpg', 'Presentación de rendición, diap. 24: informe técnico en SGP'], ['doc-004-79b28f1aad_p028.jpg', 'Manual, p. 28: formato del informe']], src: ['Manual CORFO, Anexo N° 6 (p. 28-38)', 'Presentación de rendición, diap. 24'] },
    { id: 'TRM-015', fase: 'F5', title: 'Responder las observaciones de CORFO', why: 'Si CORFO observa gastos, tienes 10 días hábiles y una sola oportunidad para aclarar.', who: 'comunidad', when: '10 días hábiles desde que CORFO comunica las observaciones', need: ['Observaciones de CORFO', 'Documentos que faltan'],
      notes: ['CORFO revisa los gastos y puede pedir más antecedentes.', 'Solo tienes una oportunidad para aclarar. Si no respondes a tiempo, los gastos observados se rechazan.', 'CORFO revisa tus respuestas y cierra la revisión.'],
      steps: ['Aclara las observaciones en un máximo de 10 días hábiles: regístralas en SGP y comenta la glosa del gasto.', 'Pídele ayuda al Organismo Colaborador.'], stepTools: {0:['observaciones']}, opt: {1:'Solo si la necesitas'}, auto: { 0: 'obs_resp' },
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
