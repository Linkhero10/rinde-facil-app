# Seguridad de Rinde Fácil (versión 3)

Estado: **NO LISTA PARA CUENTAS reales conectadas a Apps Script**. El cliente ahora bloquea URLs no aprobadas mediante un pin exacto incluido en la distribución, pero la lista sigue vacía y el pin no demuestra criptográficamente qué código se ejecuta detrás del deployment. Además: revisión propia con pruebas automáticas; no es certificación ni reemplaza una prueba de penetración independiente.

## 1. Qué se protege y de quién

| Qué | Dónde vive | Quién podría querer verlo |
|---|---|---|
| Gastos, proveedores (RUT, nombres), fotos de boletas, actas, documentos oficiales | Equipo de la comunidad (cifrado) y Drive de la comunidad | Quien robe o encuentre un equipo; alguien con acceso al Drive; un tercero que adivine la contraseña |
| La contraseña de la comunidad | Solo en la cabeza de quien la usa; en memoria mientras la sesión está abierta | Quien mire por encima del hombro, phishing, un servicio falso |
| El servicio (Apps Script) | Cuenta de Google de la comunidad | Cualquiera que conozca la dirección `/exec` (es pública por diseño) |

## 2. Cómo funciona el acceso

* **Usuario** = nombre de la comunidad (sin distinguir mayúsculas ni tildes). **Contraseña** = la que elija la comunidad (mínimo 10 caracteres; debe ser distinta del nombre de la comunidad). La confirmación debe coincidir antes de guardar.
* La contraseña escrita no se envía en claro; con PBKDF2‑SHA256 y HKDF se deriva una *clave de acceso* que sí viaja al servicio aprobado, y otra clave de cifrado que se queda en el equipo. La clave de acceso actual es reutilizable como verificador de inicio de sesión; por eso la app bloquea toda dirección no aprobada antes de enviarla.
* Los datos del equipo se guardan cifrados con AES‑256‑GCM. La clave de datos (DEK) se guarda envuelta por la contraseña y, aparte, por el **código de recuperación** de 128 bits que se muestra una sola vez al crear la cuenta.
* Las fotos en IndexedDB y la cola de envíos sin conexión también van cifradas; el nombre del proyecto y del archivo no quedan a la vista en la cola.
* El servicio guarda solo un HMAC (con una pimienta que nunca sale del script) de la clave de acceso. Con ese dato no se puede recuperar la contraseña.
* Sesión con el servicio: token de 256 bits que vence a las 12 horas; el servidor guarda solo su hash; el token vive solo en memoria (al recargar hay que volver a entrar). Máximo 20 sesiones a la vez.
* Bloqueo por inactividad (15 minutos por defecto, se puede cambiar). Al bloquear se cierran diálogos, se limpian avisos y se sueltan las fotos ampliadas.

## 3. Controles y cómo se comprobaron

| Amenaza | Control | Prueba |
|---|---|---|
| Robo o pérdida del equipo | Cifrado AES‑GCM; nada legible en `localStorage` salvo el nombre de la comunidad (es el usuario) | `test/vault.test.mjs`; e2e paso 0 verifica que ni la contraseña ni el código de recuperación queden guardados |
| Contraseña débil | Política de contraseñas; PBKDF2 600.000 vueltas; freno local tras 5 fallos | `vault.test.mjs` |
| Fuerza bruta contra el servicio | Bloqueo tras 5 fallos (15 min, se duplica hasta 24 h); mismo error para usuario o clave incorrectos; el tiempo de respuesta no delata si la cuenta existe | `backend.test.mjs` (bloqueo, duplicación, liberación por tiempo) |
| Dejar a la comunidad fuera con intentos fallidos (hallazgo de Strix, gravedad media) | **Equipos conocidos**: quien ya inició sesión guarda (cifrada) una credencial de equipo; con ella y la clave correcta entra aunque un desconocido haya agotado los intentos. Cada equipo conocido tiene su propio contador. La recuperación con código no se bloquea (128 bits, no se adivina en línea). Cerrar todas las sesiones o recuperar la cuenta revoca los equipos | `backend.test.mjs` «equipos conocidos», e2e paso 13e |
| Llamar al servicio sin sesión | Todas las acciones con datos exigen token; lista cerrada de acciones públicas (`ping`, `challenge`, `setup`, `login`, `resetPassword`) | `backend.test.mjs` «toda acción con datos exige una sesión válida» (tokens vacíos, mal formados, mayúsculas, objetos, arreglos, `__proto__`) |
| Sesión robada | Vence a las 12 h; cerrar sesión propia o en todos los dispositivos; cambiar contraseña cierra las demás | `backend.test.mjs` |
| Servicio Apps Script no aprobado | Pinning local de la URL exacta en `js/00-service-trust.js`; lista vacía por defecto, sin TOFU. Un pin debe incorporarse a una distribución revisada. La recuperación y el cambio de contraseña locales siguen disponibles cuando la dirección guardada no está aprobada. | `security.test.mjs`: endpoint impostor no recibe requests/secretos; endpoint de fixture exacto aceptado; otro deployment rechazado |
| Clickjacking / UI redressing | Los servidores locales documentados de app y demo agregan `Content-Security-Policy: frame-ancestors 'none'` y `X-Frame-Options: DENY` como headers HTTP. El sitio público de GitHub Pages no se verificó; la meta CSP por sí sola no controla `frame-ancestors`. | `test/test_serve_headers.py`; `demo/test/server-security.test.mjs`; headers públicos pendientes |
| Robo de la clave en tránsito | Solo https; no viaja la contraseña, viaja una clave derivada | e2e |
| Inyección de código (XSS) | CSP (`script-src 'self'`, sin `unsafe-inline` ni `unsafe-eval`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`); la app arma el DOM con texto, no con HTML; enlaces `javascript:`/`data:` se descartan | e2e (el navegador bloqueó un `eval` de prueba); revisión de todos los `innerHTML` |
| Perder la contraseña | Código de recuperación (funciona aunque el ingreso esté bloqueado, tiene su propio contador) | e2e paso 13d |
| Dos personas guardando a la vez | Control de versiones: el servicio rechaza guardar sobre una copia más nueva (`CONFLICTO`); la app ofrece combinar | `backend.test.mjs`, e2e |
| Datos de terceros en la copia | La copia lleva solo un extracto (2.000 caracteres) del texto que leyó el OCR | `receipt.test.mjs` |
| Abuso del OCR (gasto) | Límite diario configurable; tipos y tamaño validados antes de llamar a Google | `backend.test.mjs` |

## 4. Riesgos que quedan (dichos sin adorno)

1. **El servicio es público.** Apps Script "ejecutar como yo, acceso: cualquier persona" es necesario para que la app funcione sin que cada persona tenga sesión de Google. Cualquiera que conozca la dirección puede intentar entrar; por eso existe el bloqueo. **Consecuencia que queda**: un desconocido puede impedir que se conecte un **equipo nuevo** durante el bloqueo (15 minutos, hasta 24 h si insiste). Los equipos que ya iniciaron sesión no se ven afectados (credencial de equipo), la recuperación con código nunca se bloquea y la app sigue trabajando sin conexión. Quien robe la credencial de un equipo no gana acceso: sigue necesitando la contraseña.
2. **La cuenta de Google que instala el servicio es la raíz de confianza.** Quien pueda editar el script ve la pimienta y los datos del Drive. Debe tener verificación en dos pasos y no compartirse.
3. **El estado guardado en el Drive de la comunidad está en claro** (el script lo valida al guardarlo). El cifrado en reposo cubre el equipo local, no el Drive. Si se quisiera cifrar también la copia en la nube, el servicio ya no podría validarla y habría que quitar esa validación: decisión pendiente.
4. **Google procesa las imágenes** que se mandan al OCR (Cloud Vision). El servicio no guarda ni la imagen ni el texto, pero pasan por Google.
5. **Un equipo desbloqueado es un equipo abierto.** El bloqueo por inactividad reduce el riesgo, no lo elimina. Un navegador con extensiones maliciosas o un equipo con virus puede leer la memoria.
6. **Sin dependencia de terceros en ejecución**, salvo `vendor/parser.js` (propio) y las tipografías de Google Fonts. No hay auditoría de cadena de suministro más allá de eso.
7. **La versión 3 del servicio no se ha desplegado todavía en Apps Script real**: las pruebas usan una simulación del servicio (`test/gas_sim.mjs`) que ejecuta el `WebApi.gs` verdadero con Drive y propiedades simulados. Falta la verificación contra el servicio real.
8. **Pruebas de penetración con herramienta automática, no con una persona experta.** Tres pasadas con Strix (ver §6); faltan la prueba contra el servicio desplegado en Apps Script real y una revisión humana independiente.
9. **Bloqueo para uso real en la nube (P1, contenido):** esta copia de demostración fija un único endpoint en `js/00-service-trust.js`, verificado con ping y un smoke test de Cloud Vision; eso no valida el ciclo autenticado desde la interfaz ni la seguridad para varias comunidades. La implementación de demostración ejecuta como propietaria y admite acceso web de cualquiera: usar solo documentos sintéticos. El pin estático confía en la URL distribuida, Google, el canal de distribución y las personas administradoras; **no es atestación del código en ejecución** ni cubre una cuenta administrativa comprometida. Antes de conectar comunidades reales, revisar el modelo de despliegue, verificar el código desplegado fuera de banda, definir propiedad/acceso por comunidad y probarlo. La suite local no demuestra protección contra cambios del código por un administrador autorizado.
10. **Headers del sitio público pendientes:** los headers se verificaron ausentes en los dos servidores locales anteriores y ya se agregan en los nuevos servidores locales. No fue posible consultar la respuesta HTTP del sitio GitHub Pages desde este entorno, por lo que su protección anti-iframe queda `UNKNOWN`; verificarla antes de promocionar. Si faltan, usar un proxy/CDN/hosting que permita `frame-ancestors` por respuesta.

## 5. Operación segura (para quien instala)

1. Crear una cuenta de Google dedicada a la comunidad, con verificación en dos pasos.
2. Pegar `WebApi.gs`; crear la propiedad `RINDE_FACIL_SETUP_CODE` con un código largo y aleatorio. **Se usa una sola vez**: al crear la cuenta se borra.
3. Implementar como aplicación web (ejecutar como yo; acceso: cualquier persona) y verificar quién administra el deployment. Antes de entregar, la persona responsable debe aprobar fuera de banda el endpoint e incluirlo en `approvedAppsScriptUrls` de una versión revisada de la app. Hasta entonces, pegar una dirección en la app no habilita conexión.
4. Solo después de distribuir la versión que contiene el pin aprobado, entregar a la persona responsable, por canales separados, la dirección del servicio y el código de instalación. **Nunca** la contraseña: la elige ella.
5. Si se sospecha un acceso indebido: en «Seguridad» → «Quién entró al servicio», cambiar la contraseña y «Cerrar sesión en todos los dispositivos».
6. Revocar de inmediato el acceso al script y al Drive de quien deje de administrar (ver `TRASPASO_ADMINISTRACION.md`).

## 6. Prueba de penetración (Strix)

**Pasada del 30-sep-2026** — Strix 1.6.2, modo profundo, modelo `gpt-6-luna` con esfuerzo `xhigh` sobre una suscripción de ChatGPT; 13 minutos y 190 llamadas al modelo. Se corrió sobre una **copia aislada** (Docker local, datos de prueba, servicio simulado que ejecuta el `WebApi.gs` real), sin arreglos automáticos.

* **Hallazgos confirmados por Strix: 0.** Las acciones con datos rechazaron tokens ausentes, mal formados o inválidos; usuario conocido y desconocido dieron el mismo error; no se filtraron secretos; el CORS del simulador no permitió leer datos protegidos.
* **Lo que no cubrió (8 puntos marcados «requiere más revisión»):** no hubo flujo autenticado; la app servida por HTTP mostró la barrera de origen seguro y no se pudo probar en el navegador; no se probó el vencimiento a 12 horas ni el umbral de 5 fallos; no se probaron con sesión válida los límites de `saveFile`, `saveState` y `ocr`. Esos controles sí tienen pruebas propias (`backend.test.mjs`, `e2e.mjs`), pero no fueron atacados por una herramienta externa.
* **Hallazgo propio derivado de la pasada:** al importar un respaldo con claves `__proto__` o `constructor`, el estado heredaba propiedades ajenas (`Object.prototype` global no se contaminaba). Severidad baja. **Corregido**: los datos que entran desde afuera se leen con `RF.util.safeParse`, que descarta esas claves; prueba de regresión en `security.test.mjs`.
* **Límites:** el modelo usado no figura en la lista de modelos recomendados de Strix, así que puede pasar por alto vulnerabilidades. Un resultado sin hallazgos no prueba que no existan. El servicio simulado no es Apps Script real: CORS, límites de cuerpo y cuotas de producción no se probaron.

**Segunda pasada (30-sep-2026, 17 min, 286 llamadas):** app por HTTPS y servicio con sesión de prueba. **1 hallazgo confirmado, gravedad media:** quien conozca la dirección del servicio podía bloquear los inicios de sesión de la comunidad con 5 intentos fallidos. **Corregido** con *equipos conocidos* (ver §3): la credencial de equipo permite entrar con la clave correcta aunque el contador global esté agotado, y la recuperación con código ya no se bloquea. Sin XSS, sin datos legibles en el almacenamiento local, CSP efectiva, sin fuga de secretos en el registro de accesos.

**Tercera pasada (30-sep-2026, 27 min, 445 llamadas):** sobre el código corregido. **0 hallazgos confirmados.** Verificó en vivo los límites de `saveState` y `saveFile`, `CONFLICTO` con escrituras concurrentes (gana una sola), el tope de OCR bajo concurrencia, el cierre de sesión individual, la revocación con `changePassword` y `logoutAll`, el bloqueo global y por equipo, e importar un respaldo de 6,3 MB y de 1.200 niveles de profundidad. Observó un enlace con una tabulación dentro del esquema (`java<tab>script:`) que el filtro de enlaces no descartaba; la CSP impidió su ejecución, y **se endureció** el filtro (`stripInvisible`) con prueba en el recorrido con navegador.

**Sigue sin cubrir por prueba en vivo:** `resetPassword` con una credencial de recuperación real del servicio, el tope de 10 equipos y condiciones de carrera entre `login` y `logoutAll` (solo probados con el simulador y las pruebas propias), y respaldos aún más grandes o profundos.

* **Límites generales:** el modelo usado (`gpt-6-luna`) no figura en la lista de modelos recomendados de Strix, así que puede pasar por alto vulnerabilidades. Un resultado sin hallazgos no prueba que no existan. El servicio simulado no es Apps Script real: CORS, límites de cuerpo y cuotas de producción no se probaron.
* **Siguiente paso recomendado:** repetir una pasada contra el servicio ya desplegado en Apps Script (con una cuenta de prueba aparte), para confirmar que se comporta como el simulador.

## 7. ¿Hace falta un servidor de base de datos?

### Integridad de las copias y de la rendición (revisión local)

- Combinar copias agrega registros con IDs nuevos en gastos, cotizaciones, observaciones, presupuesto, necesidades, documentos, actas y listas de formularios. Registros con el mismo ID deben tener el mismo contenido. Se validan IDs ausentes o duplicados en las listas combinadas y en proyectos.
- Sin una versión base común, una diferencia en Gantt, formularios individuales, datos del proyecto u otros campos de contenido no combinables bloquea la combinación. Toda la propuesta se prepara en una copia: un conflicto no modifica el estado local, la revisión de nube ni envía `saveState`. El mensaje propone guardar ambas copias y revisar; las opciones explícitas de reemplazar o sobrescribir siguen siendo decisiones de la persona.
- Configuración del dispositivo (`ui`, proyecto seleccionado) y conexión (`cloud`) se conservan localmente; no se mezclan desde el otro dispositivo. Un merge no resuelve automáticamente eliminaciones históricas: una ausencia en una lista de IDs puede significar una eliminación o un registro todavía no recibido. Requiere revisión humana si hubo eliminaciones.
- El presupuesto muestra F1 CORFO, F2 propio y total por separado. El exceso respecto de lo aprobado por CORFO se compara solo con F1. No se modificó el tope normativo de administración.
- Con período de rendición completo, la exportación incluye solo gastos fechados dentro de sus límites, informa los excluidos y conserva todos los registros originales. Un período incompleto o invertido bloquea la exportación.
- Quitar actividad o etapa exige primero reasignar los gastos, líneas de presupuesto y formularios asociados. La validación detecta referencias inexistentes en gastos y presupuesto.

Evidencia automatizada: `test/integrity.test.mjs` (cálculos, septiembre/octubre, referencias, combinación, no mutación y ausencia de envío ante conflicto). Estas pruebas locales no demuestran el comportamiento de Apps Script desplegado.

**No, para el piloto.** Cada comunidad guarda todo en su propio Drive y en su equipo; no existe un lugar central que pueda filtrarse en bloque. Un servidor propio solo tendría sentido si se quisiera un panel que junte varias comunidades (versión SaaS); ahí habría que agregar cuentas por comunidad, cifrado en el servidor, copias de seguridad, registro de accesos y un responsable legal de los datos, y este documento se rehace.
