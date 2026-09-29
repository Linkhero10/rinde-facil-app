# Privacidad, consentimiento y retención

Borrador operativo. **No es asesoría legal**: antes de entregar la herramienta a comunidades conviene que una persona abogada lo revise, sobre todo por la Ley 21.719 de protección de datos personales (su entrada en vigencia está en discusión; verificar la fecha vigente).

## Qué datos se manejan

* De la comunidad: nombre, RUT, dirección, representante legal, correo, teléfono.
* De terceros que aparecen en los comprobantes: nombre y RUT de proveedores, direcciones, montos. Pueden ser personas naturales (por ejemplo, una boleta de honorarios).
* De las reuniones: nombres de asistentes y compromisos de las actas.

## Dónde quedan

| Lugar | Qué | Cifrado |
|---|---|---|
| Equipo de la comunidad | Todo lo anterior y las fotos | Sí (AES‑256, con la contraseña) |
| Drive de la comunidad | Copia del estado (con un extracto del texto del OCR), fotos y documentos archivados | El Drive protege el acceso; el contenido del estado está en claro (ver `SEGURIDAD.md` §4) |
| Google Cloud Vision | La imagen, solo mientras se lee | En tránsito; el servicio no la guarda |
| Organismo Colaborador | **Nada, salvo el resumen que la comunidad decida sacar** | — |
| Servidor central | **No existe** | — |

## Consentimiento

* Quien registra un comprobante actúa por la comunidad: los datos del proveedor ya figuran en un documento tributario que la comunidad debe conservar y rendir. La app no los usa para otro fin.
* Nada sale hacia el Organismo Colaborador sin acción expresa: en «Resumen para el Organismo Colaborador» se eligen las partes, se revisa el texto exacto, se marca la autorización y recién ahí se puede sacar el archivo. El resumen **no incluye** nombres de proveedores, RUT, fotos ni documentos. Queda anotado qué se compartió y cuándo.
* Las personas que asisten a mesas de trabajo y aparecen en las actas deberían saber que sus nombres constan en el registro. Sugerencia: leer al inicio de la reunión «los nombres de quienes asisten constan en el acta».

## Retención

| Dato | Cuánto tiempo | Por qué |
|---|---|---|
| Comprobantes, fichas y rendición | Lo que exija el convenio y la normativa tributaria (verificar el plazo exacto en el Manual y con el contador; suele ser de varios años) | Fiscalización de CORFO y del SII |
| Extracto del texto del OCR en la copia | Mientras exista el gasto | Ayuda a revisar; el original queda solo en el equipo |
| Registro de accesos del servicio | Últimos 80 eventos | Seguridad |
| Copias de seguridad del estado | Últimas 5 | Recuperar de errores |
| Datos del equipo | Hasta que la comunidad los borre («Seguridad» → «Borrar los datos de este equipo») | Control de la comunidad |

## Derechos

La comunidad puede en cualquier momento: descargar una copia completa (JSON), borrar los datos de un equipo, borrar archivos de su Drive y revocar el acceso del Organismo Colaborador. Como los datos no están en un servidor central, no hay que pedirle a nadie que los borre.

## Pendientes para una versión con clientes

* Texto de términos y política de privacidad revisado por una persona abogada.
* Definir quién es responsable de los datos (la comunidad) y quién encargado (quien opera el servicio si lo hubiera).
* Procedimiento de aviso ante una vulneración.
