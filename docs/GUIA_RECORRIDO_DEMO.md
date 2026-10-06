# Guía de demostración — Rinde Fácil

Esta demostración combina una prueba real y un recorrido local. El 6 de octubre de 2026, el Apps Script desplegado leyó con Google Cloud Vision una imagen sintética guardada en Google Drive: OCR exitoso, una página completa y sin escribir en una planilla. La aplicación web local aún requiere iniciar sesión con la cuenta de prueba existente para comprobar de punta a punta la carga, revisión humana y archivado desde su interfaz. No uses documentos personales ni presentes esto como validación con comunidades o aprobación de CORFO.

La imagen sintética está en la carpeta de Drive [Demo OCR + Drive — 2026-10-06](https://drive.google.com/drive/folders/12EAdGGCi3IxNu7VLnIp9pi4os9Dh7POe). La app local de demostración se sirve en `http://127.0.0.1:8790/index.html` mientras el servidor siga abierto.

## 1. Crear la cuenta de prueba

1. Abre `http://127.0.0.1:8790/index.html` en el mismo computador.
2. Elige «Ya tengo un servicio de mi comunidad y este equipo es nuevo». La dirección aprobada ya está prellenada.
3. Inicia sesión con la cuenta de demostración existente. La contraseña se escribe directamente en la app; no la compartas por chat. No crees ni restablezcas la cuenta.
4. Si el inicio de sesión falla, detén la prueba y registra el error; no intentes adivinar ni cambiar credenciales.

## 2. Crear el proyecto y elegir la ruta

1. Completa la ficha inicial con datos ficticios y crea un proyecto, por ejemplo **Sede comunitaria**.
2. En «Qué necesitará tu proyecto», marca solo las actividades que quieres explorar. La aplicación adapta la ruta; puedes volver a cambiar esta selección.
3. En «Mi ruta», abre las fases y entra a cada trámite. Lee los pasos y marca los que ya hiciste como recordatorio personal. La marca no significa que CORFO lo haya aprobado ni que el documento se haya enviado.

## 3. Planificar el PEA

1. En «Planificar», completa fechas del proyecto, presupuesto aprobado y líneas por cuenta.
2. Abre «Carta Gantt», agrega etapas y actividades, y completa fechas. Revisa la duración y los meses coloreados.
3. Prueba la exportación a Excel, Word, PDF o texto. La prueba automática comprobó que los archivos generados contienen las actividades y cálculos de ejemplo.
4. Usa la información para preparar el trabajo en SGP; el archivo de la app es apoyo y **no reemplaza el formulario oficial ni envía cambios a SGP**.

## 4. Registrar un gasto y revisar el comprobante

1. Ve a «Rendir → Gastos y rendición» y elige «Subir foto o PDF» o arrastra un archivo permitido al recuadro.
2. Usa únicamente la boleta sintética de la carpeta de Drive enlazada arriba. El servicio desplegado ya procesó una copia de esa imagen con Cloud Vision; falta repetirlo desde la interfaz autenticada para comprobar la integración completa.
3. Compara visualmente tipo de documento, emisor y su RUT, folio, fecha, detalle, montos, forma de pago y proyecto. No aceptes un dato por la confianza que muestre el OCR.
4. Completa la glosa y antecedentes que falten. La app señala inconsistencias de RUT, montos, fechas y respaldos; no inventes ni corrijas silenciosamente una cifra para hacerla cuadrar.
5. Compara todo con la imagen. El OCR no se considera confirmado por su nivel de confianza. Marca «Comparé cada dato…» solo después de revisarlos.
6. Al confirmar la revisión, la app intenta archivar en Drive el comprobante original, la ficha del gasto y una copia del estado. Comprueba el aviso de resultado: `guardado` significa remoto; `pendiente` significa que sigue en este dispositivo y hay que revisar la cola. No afirmes que se guardó sin ver el resultado y el archivo en Drive.

**Límite:** la prueba Cloud Vision fue real, pero usó una sola imagen sintética nítida desde el smoke test de Apps Script, sin escritura en Sheets. Todavía no se ha completado desde la app el ciclo autenticado upload → OCR → revisión → archivo real en Drive, ni se ha probado precisión con fotos borrosas.

## 5. Probar anexos y revisión

- **Pago en efectivo:** registra un gasto ficticio en efectivo y prueba «Crear Anexo 3». Revisa sus datos y completa lo que corresponda antes de usarlo.
- **Viáticos:** completa fechas y monto diario en Anexo 4; comprueba el cálculo y revisa el documento antes de firmarlo.
- **Gasto compartido/administración:** prueba Anexo 5 y el cálculo proporcional. No lo tomes como aprobación normativa.
- **Revisión:** abre «Revisión» para cruzar gastos, anexos y presupuesto. Atiende los avisos y vuelve a los datos de origen para corregirlos.

Los anexos que genera la app son borradores de apoyo: comprueba siempre la versión oficial vigente, los requisitos de firma y la documentación que pida el convenio.

## 6. Registrar un documento observado por CORFO

1. En «Documentos oficiales», agrega un registro y adjunta un PDF ficticio.
2. Elige quién lo envía y el tipo «PEA con observaciones de CORFO»; indica si afecta al PEA.
3. Lee las observaciones y anota manualmente qué debe cambiar. La app no interpreta ni recibe automáticamente una decisión de CORFO.
4. Registra la respuesta de la comunidad y adjunta una versión corregida como documentos separados. Agrega archivos no clasificados como «Otro documento».
5. Cuando haya cambios de alcance, actividades o presupuesto, revisa el PEA, la Carta Gantt, el presupuesto y los pasos oficiales aplicables. No supongas que registrarlo aquí lo modifica en SGP.

Esta parte se puede recorrer con datos ficticios localmente. La escritura de archivos en Google Drive requiere la sesión de prueba autenticada y debe verificarse en la carpeta real; no se conecta con CORFO ni cambia SGP.

## 7. Probar actas y compromisos

1. En «Actas», agrega una reunión ficticia y anota fecha, modalidad, asistentes, temas y acuerdos.
2. Adjunta el PDF sintético; asigna responsable y plazo a cada compromiso.
3. Revisa la alerta de asistencia y la lista de pendientes. Marca un acuerdo como cumplido solo después de verificarlo.

## 8. Compartir un resumen y cerrar

1. En «Resumen para el Organismo Colaborador», selecciona las secciones necesarias y revisa la vista previa.
2. Comprueba que no muestre datos de terceros. La app exige autorización explícita antes de generar el archivo.
3. Descarga una copia local de respaldo y guárdala en un lugar controlado. Cierra o bloquea la sesión cuando termines.

## Qué quedó probado y qué no

La suite actual de la app pasó **124/124 pruebas**, y `lint` y `check` terminaron sin errores. La prueba real independiente de Cloud Vision procesó una imagen sintética de una página con resultado exitoso. Estos resultados no equivalen a una prueba E2E de la app autenticada.

Queda pendiente para cerrar el recorrido real: iniciar sesión con la cuenta de prueba, subir la imagen desde la interfaz, revisar los campos, confirmar, y comprobar que el original y su ficha aparezcan en Drive. También quedan fuera: OCR con fotos borrosas, permisos/costos de producción, sincronización entre dispositivos, revisión normativa y validación con comunidades.
