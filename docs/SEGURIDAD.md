# Seguridad de Rinde Fácil (versión 3)

Estado: **revisión propia con pruebas automáticas; todavía sin auditoría externa ni prueba de penetración**. Lo que sigue describe lo que el código hace hoy, lo que se probó y lo que **no** se cubre. No es una certificación.

## 1. Qué se protege y de quién

| Qué | Dónde vive | Quién podría querer verlo |
|---|---|---|
| Gastos, proveedores (RUT, nombres), fotos de boletas, actas, documentos oficiales | Equipo de la comunidad (cifrado) y Drive de la comunidad | Quien robe o encuentre un equipo; alguien con acceso al Drive; un tercero que adivine la contraseña |
| La contraseña de la comunidad | Solo en la cabeza de quien la usa; en memoria mientras la sesión está abierta | Quien mire por encima del hombro, phishing, un servicio falso |
| El servicio (Apps Script) | Cuenta de Google de la comunidad | Cualquiera que conozca la dirección `/exec` (es pública por diseño) |

## 2. Cómo funciona el acceso

* **Usuario** = nombre de la comunidad (sin distinguir mayúsculas ni tildes). **Contraseña** = la que elija la comunidad (mínimo 10 caracteres; se rechazan las de lista común y las que repiten el nombre).
* La contraseña **nunca sale del equipo**. Con PBKDF2‑SHA256 (600.000 vueltas) y HKDF se derivan dos claves independientes: una *clave de acceso* (viaja al servicio) y una *clave de cifrado* (se queda en el equipo).
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
| Llamar al servicio sin sesión | Todas las acciones con datos exigen token; lista cerrada de acciones públicas (`ping`, `challenge`, `setup`, `login`, `resetPassword`) | `backend.test.mjs` «toda acción con datos exige una sesión válida» (tokens vacíos, mal formados, mayúsculas, objetos, arreglos, `__proto__`) |
| Sesión robada | Vence a las 12 h; cerrar sesión propia o en todos los dispositivos; cambiar contraseña cierra las demás | `backend.test.mjs` |
| Servicio falso (enlace pegado por error o suplantación) | Solo se acepta `https://script.google.com/…/exec`; la app rechaza un servicio que proponga menos de 600.000 vueltas o una sal corta y **no le envía ninguna clave** | `security.test.mjs` |
| Robo de la clave en tránsito | Solo https; no viaja la contraseña, viaja una clave derivada | e2e |
| Inyección de código (XSS) | CSP (`script-src 'self'`, sin `unsafe-inline` ni `unsafe-eval`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`); la app arma el DOM con texto, no con HTML; enlaces `javascript:`/`data:` se descartan | e2e (el navegador bloqueó un `eval` de prueba); revisión de todos los `innerHTML` |
| Perder la contraseña | Código de recuperación (funciona aunque el ingreso esté bloqueado, tiene su propio contador) | e2e paso 13d |
| Dos personas guardando a la vez | Control de versiones: el servicio rechaza guardar sobre una copia más nueva (`CONFLICTO`); la app ofrece combinar | `backend.test.mjs`, e2e |
| Datos de terceros en la copia | La copia lleva solo un extracto (2.000 caracteres) del texto que leyó el OCR | `receipt.test.mjs` |
| Abuso del OCR (gasto) | Límite diario configurable; tipos y tamaño validados antes de llamar a Google | `backend.test.mjs` |

## 4. Riesgos que quedan (dichos sin adorno)

1. **El servicio es público.** Apps Script "ejecutar como yo, acceso: cualquier persona" es necesario para que la app funcione sin que cada persona tenga sesión de Google. Cualquiera que conozca la dirección puede intentar entrar; por eso existe el bloqueo. **Consecuencia**: alguien que conozca la dirección puede mantener el ingreso al servicio bloqueado (denegación de servicio). La recuperación con código tiene otro contador y sigue funcionando; la app sigue trabajando sin conexión.
2. **La cuenta de Google que instala el servicio es la raíz de confianza.** Quien pueda editar el script ve la pimienta y los datos del Drive. Debe tener verificación en dos pasos y no compartirse.
3. **El estado guardado en el Drive de la comunidad está en claro** (el script lo valida al guardarlo). El cifrado en reposo cubre el equipo local, no el Drive. Si se quisiera cifrar también la copia en la nube, el servicio ya no podría validarla y habría que quitar esa validación: decisión pendiente.
4. **Google procesa las imágenes** que se mandan al OCR (Cloud Vision). El servicio no guarda ni la imagen ni el texto, pero pasan por Google.
5. **Un equipo desbloqueado es un equipo abierto.** El bloqueo por inactividad reduce el riesgo, no lo elimina. Un navegador con extensiones maliciosas o un equipo con virus puede leer la memoria.
6. **Sin dependencia de terceros en ejecución**, salvo `vendor/parser.js` (propio) y las tipografías de Google Fonts. No hay auditoría de cadena de suministro más allá de eso.
7. **La versión 3 del servicio no se ha desplegado todavía en Apps Script real**: las pruebas usan una simulación del servicio (`test/gas_sim.mjs`) que ejecuta el `WebApi.gs` verdadero con Drive y propiedades simulados. Falta la verificación contra el servicio real.
8. **Prueba de penetración parcial.** Se hizo una pasada con Strix (ver §6); cubrió el servicio sin sesión y la revisión del código, pero no los flujos autenticados ni la app en el navegador.

## 5. Operación segura (para quien instala)

1. Crear una cuenta de Google dedicada a la comunidad, con verificación en dos pasos.
2. Pegar `WebApi.gs`; crear la propiedad `RINDE_FACIL_SETUP_CODE` con un código largo y aleatorio. **Se usa una sola vez**: al crear la cuenta se borra.
3. Implementar como aplicación web (ejecutar como yo; acceso: cualquier persona). Si se cambia el código, crear una **nueva versión** de la implementación (la dirección `/exec` no cambia).
4. Entregar a la persona responsable de la comunidad, por canales separados: la dirección del servicio y el código de instalación. **Nunca** la contraseña: la elige ella.
5. Si se sospecha un acceso indebido: en «Seguridad» → «Quién entró al servicio», cambiar la contraseña y «Cerrar sesión en todos los dispositivos».
6. Revocar de inmediato el acceso al script y al Drive de quien deje de administrar (ver `TRASPASO_ADMINISTRACION.md`).

## 6. Prueba de penetración (Strix)

**Pasada del 30-sep-2026** — Strix 1.6.2, modo profundo, modelo `gpt-6-luna` con esfuerzo `xhigh` sobre una suscripción de ChatGPT; 13 minutos y 190 llamadas al modelo. Se corrió sobre una **copia aislada** (Docker local, datos de prueba, servicio simulado que ejecuta el `WebApi.gs` real), sin arreglos automáticos.

* **Hallazgos confirmados por Strix: 0.** Las acciones con datos rechazaron tokens ausentes, mal formados o inválidos; usuario conocido y desconocido dieron el mismo error; no se filtraron secretos; el CORS del simulador no permitió leer datos protegidos.
* **Lo que no cubrió (8 puntos marcados «requiere más revisión»):** no hubo flujo autenticado; la app servida por HTTP mostró la barrera de origen seguro y no se pudo probar en el navegador; no se probó el vencimiento a 12 horas ni el umbral de 5 fallos; no se probaron con sesión válida los límites de `saveFile`, `saveState` y `ocr`. Esos controles sí tienen pruebas propias (`backend.test.mjs`, `e2e.mjs`), pero no fueron atacados por una herramienta externa.
* **Hallazgo propio derivado de la pasada:** al importar un respaldo con claves `__proto__` o `constructor`, el estado heredaba propiedades ajenas (`Object.prototype` global no se contaminaba). Severidad baja. **Corregido**: los datos que entran desde afuera se leen con `RF.util.safeParse`, que descarta esas claves; prueba de regresión en `security.test.mjs`.
* **Límites:** el modelo usado no figura en la lista de modelos recomendados de Strix, así que puede pasar por alto vulnerabilidades. Un resultado sin hallazgos no prueba que no existan. El servicio simulado no es Apps Script real: CORS, límites de cuerpo y cuotas de producción no se probaron.
* **Siguiente pasada recomendada:** con sesión válida de prueba y la app servida por un origen seguro (HTTPS), para cubrir los 8 puntos pendientes.

## 7. ¿Hace falta un servidor de base de datos?

**No, para el piloto.** Cada comunidad guarda todo en su propio Drive y en su equipo; no existe un lugar central que pueda filtrarse en bloque. Un servidor propio solo tendría sentido si se quisiera un panel que junte varias comunidades (versión SaaS); ahí habría que agregar cuentas por comunidad, cifrado en el servidor, copias de seguridad, registro de accesos y un responsable legal de los datos, y este documento se rehace.
