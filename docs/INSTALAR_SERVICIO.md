# Instalar o actualizar el servicio de la comunidad (versión 3)

Sirve para una comunidad nueva o para pasar un servicio de la versión 2 (clave compartida) a la 3 (usuario y contraseña).

## Comunidad nueva

1. Con la cuenta de Google de la comunidad (con verificación en dos pasos), abrir <https://script.google.com> → **Nuevo proyecto**.
2. Pegar el contenido de `backend/WebApi.gs` (y `CloudOcrAdapter.gs` si se usa la lectura de fotos).
3. **Configuración del proyecto → Propiedades de la secuencia de comandos** → agregar:
   * `RINDE_FACIL_SETUP_CODE`: un código largo y aleatorio (20 caracteres o más). Se usa una sola vez.
   * `RINDE_FACIL_GCP_PROJECT_ID`: proyecto de Google Cloud con Cloud Vision habilitado (solo si se usa OCR).
   * `RINDE_FACIL_OCR_PROVIDER` = `cloud_vision`; opcional `RINDE_FACIL_OCR_DAILY_LIMIT`.
4. **Implementar → Nueva implementación → Aplicación web**: *Ejecutar como*: **yo**; *Quién tiene acceso*: **cualquier persona**. Copiar la dirección que termina en `/exec`.
5. En la app: **Nube y copias** → pegar la dirección → **Probar conexión** → escribir el código de instalación → **Crear la cuenta del servicio**. Desde ahí entra con el nombre de la comunidad y su contraseña.

## Pasar de la versión 2 a la 3

1. Abrir el proyecto de Apps Script y reemplazar todo el código de `WebApi.gs` por el nuevo (versión 3.0.0).
2. Si existía `RINDE_FACIL_ACCESS_KEY`, se usa como código de instalación **una vez** (y se borra sola). Mejor: crear `RINDE_FACIL_SETUP_CODE` nuevo y borrar la clave vieja.
3. **Implementar → Administrar implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar.** La dirección `/exec` **no cambia**.
4. En la app, el equipo que ya tenía datos ofrece **«Proteger mis datos»**: elegir contraseña, guardar el código de recuperación, y luego crear la cuenta del servicio como en el paso 5 de arriba.
5. Comprobar en «Seguridad» que el servicio aparece con sesión abierta.

## Verificación después de instalar

* «Probar conexión» muestra `versión 3.0.0`.
* Cerrar sesión y volver a entrar funciona; una contraseña equivocada dice «no coinciden» sin decir cuál falló.
* En «Seguridad» → «Quién entró al servicio» aparece la creación de la cuenta y los ingresos.
* Un equipo nuevo se conecta con la dirección, el nombre de la comunidad y la contraseña, y trae los datos del Drive.

## Si algo sale mal

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| «El servicio es de una versión anterior» | No se creó una nueva versión de la implementación | Paso 3 de la migración |
| «El código de instalación no es correcto» | Código mal escrito o ya usado | Crear otra propiedad `RINDE_FACIL_SETUP_CODE`; 5 errores bloquean una hora |
| «Demasiados intentos» | Bloqueo por fallos | Esperar; o usar el código de recuperación (tiene otro contador) |
| «La contraseña del servicio es distinta a la de este equipo» | Se cambió la contraseña en otro dispositivo sin actualizar | «Olvidé mi contraseña» con el código de recuperación |
