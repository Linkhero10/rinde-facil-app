# Panel del Organismo Colaborador — diseño propuesto

Estado: **propuesta, sin implementar**. Pide decisiones del equipo antes de escribir código, porque cambia el modelo de privacidad y de seguridad de Rinde Fácil.

## Qué se quiere

1. Que el Organismo Colaborador (hoy SMI) tenga un acceso propio, con un panel que muestre **todas las comunidades**: en qué fase van, si están atrasadas, si incumplen plazos, si necesitan apoyo, con estadísticas.
2. Que pueda **abrir y editar** los datos de una comunidad cuando la apoye, y llegar al **Drive** que se crea para ella.
3. Que las cuentas de las comunidades se **creen de antemano** (usuario = nombre de la comunidad) y cada comunidad las **active** poniendo su RUT e inventando su contraseña.

## Lo que cambia respecto de hoy

| Hoy (v3) | Con el panel |
|---|---|
| Un servicio por comunidad, con **una sola cuenta**. | Un servicio central con **muchas cuentas** y roles. |
| Los datos viven cifrados en el equipo de la comunidad; el servicio solo guarda copias. | El Organismo debe poder **leer** los datos: el servicio tiene que poder abrirlos (no pueden quedar cifrados solo con la contraseña de la comunidad). |
| El Organismo solo recibe el resumen que la comunidad decide enviar (`Compartir`). | El Organismo ve el avance de todas, sin que cada comunidad envíe nada. |

Esto es un cambio de fondo en quién ve qué. Hay que **decirlo con claridad a las comunidades** (consentimiento al activar la cuenta) y dejarles un **registro visible de cada vez que el Organismo abrió sus datos**. Conviene que lo revise una persona del área legal antes de usarlo con comunidades reales (datos personales, convenio con CORFO).

## Arquitectura propuesta

- **Un solo servicio de Apps Script** administrado por el Organismo, con un Drive central: `Rinde Fácil › Comunidades › <nombre de la comunidad> › Proyectos › …`. El Organismo, como dueño, llega a cualquier carpeta; cada comunidad ve la suya.
- **Roles**
  - `comunidad`: ve y edita solo lo suyo.
  - `organismo`: ve el panel y puede abrir cualquier comunidad (lectura). La edición se activa por comunidad y queda registrada.
  - `admin`: además crea, reinicia y borra cuentas, y administra a las personas del Organismo.
- **Cuentas del Organismo personales** (una por persona), no una contraseña compartida: así se sabe quién hizo qué y se revoca a una persona sin cambiar la clave de todas. La «llave maestra» es el rol `admin`, no una contraseña que circule.
- **Cuentas de comunidad pre-creadas**: el `admin` carga nombre y RUT; la cuenta queda «pendiente». La comunidad entra con su nombre, confirma su RUT y elige su contraseña. Si alguien la activa por error o por mala fe, el `admin` la borra y la crea de nuevo.
- **Resumen para el panel**: el servicio calcula por comunidad fase actual, avance, plazos vencidos o próximos, observaciones abiertas y montos por cuenta. El panel lista las comunidades con un semáforo (al día, atención, atrasada, sin movimiento) y permite entrar al detalle.
- **Edición asistida**: el Organismo abre la comunidad dentro de la misma app, con una franja visible «Editando como Organismo» y un registro de cambios (quién, cuándo, qué sección).
- **Registro de accesos** para la comunidad: lista de entradas del Organismo a sus datos, con fecha y persona.

## Seguridad que hay que sumar

- Rate limit y bloqueo **por cuenta** (hoy es global): ya hay equipos conocidos; se extiende a cada usuario.
- Sesiones con rol; ninguna acción de `organismo` o `admin` se acepta sin sesión de ese rol.
- Segundo factor para las cuentas del Organismo (código temporal), porque abren los datos de todas las comunidades.
- Cuentas pre-creadas: el RUT **no es secreto**; sirve para evitar errores, no para impedir que alguien se adelante. Si se quiere más garantía, el Organismo entrega además un **código de activación** de un solo uso (en persona o por teléfono).
- Nueva pasada de Strix contra el servicio multi-cuenta antes de usarlo con comunidades reales, y revisión de privacidad.

## Entrega por etapas

1. Servicio multi-cuenta con roles y migración de la cuenta única actual.
2. Pre-creación y activación de cuentas de comunidad.
3. Panel del Organismo (lista, semáforo, detalle, estadísticas, descarga).
4. Edición asistida con registro, y acceso al Drive de cada comunidad.
5. Segundo factor, pasada de Strix y revisión legal.

## Decisiones que se necesitan

1. **Visibilidad**: ¿el Organismo ve el detalle completo de cada comunidad (con aviso y registro de accesos), o solo el resumen automático y el detalle cuando la comunidad lo autoriza?
2. **Activación de cuentas**: ¿solo RUT, o RUT más un código de activación de un solo uso?
3. **Dónde vive el servicio**: ¿un servicio central del Organismo para todas las comunidades (recomendado), o uno por comunidad con un panel que los junta?
4. **Cuentas del Organismo**: ¿personales con rol (recomendado) o una llave compartida?
