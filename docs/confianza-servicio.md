# Confianza del servicio remoto — Rinde Fácil

Estado: protección local implementada; nube bloqueada hasta aprobar un deployment concreto.

## Qué protege

La forma de una URL `script.google.com` no demuestra quién controla el código publicado. Antes, cualquier deployment con forma válida podía recibir la contraseña derivada, el código de instalación o el código de recuperación. Ahora, todas las solicitudes remotas pasan por `RF.cloud` y se rechazan salvo que la URL exacta esté incluida en la lista aprobada que acompaña a esta versión.

- La lista vive en `js/00-service-trust.js` y está vacía por defecto.
- No existe confianza en el primer uso (TOFU), ni se aprueba una URL porque responda `ping`, anuncie un `scriptId` o se presente como versión legítima.
- `localhost` solo se admite durante desarrollo si coincide exactamente con el origen local de la propia app.
- La contraseña y las claves derivadas no se envían a direcciones fuera de esa política. La recuperación y el cambio de contraseña locales siguen funcionando; la interfaz avisa cuando el servicio guardado no está aprobado.

## Cómo habilitar un servicio en una futura distribución

1. Quien administra la comunidad verifica fuera de banda el proyecto Apps Script, su deployment/version y la cuenta responsable.
2. Una persona autorizada agrega la URL exacta `/exec` a `approvedAppsScriptUrls` en `js/00-service-trust.js`.
3. Se revisa el cambio, se prueban las rutas de autenticación con fixtures y se distribuye una versión íntegra de la app que incluya ese pin.
4. La rotación de deployment requiere revisar y distribuir un nuevo pin. No se debe pedir a cada usuario que confíe una URL arbitraria.

El pin acredita que la app se conecta al endpoint publicado en esa dirección, suponiendo confiables Google, el canal que distribuye la app y las personas administradoras del deployment. **No es atestación criptográfica del código que está ejecutándose** ni protege contra una cuenta Google de administración comprometida. La lista está vacía hoy porque no se aprobó en este trabajo ningún endpoint concreto; por eso la nube permanecerá deshabilitada hasta el procedimiento anterior.

## Verificación

`test/security.test.mjs` incluye pruebas con un endpoint impostor de fixture: conexión, login y setup no deben hacer solicitudes de red; un endpoint exacto autorizado puede recibir solo la consulta pública de desafío; otro deployment queda bloqueado. Las pruebas no acceden a Google ni a datos reales.
