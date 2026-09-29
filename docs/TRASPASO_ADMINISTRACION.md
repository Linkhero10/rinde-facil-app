# Traspaso de administración

Sirve cuando cambia quien administra Rinde Fácil en una comunidad (dirigencia nueva, salida del Organismo Colaborador, cambio de persona técnica). Lo importante: **nadie debería depender de una sola persona ni de una sola contraseña.**

## Qué hay que traspasar

| Elemento | Dónde está | Quién lo controla hoy | Cómo se traspasa |
|---|---|---|---|
| Cuenta de Google de la comunidad | Google | La comunidad | Cambiar contraseña y datos de recuperación; verificación en dos pasos con el teléfono o correo de la nueva persona **antes** de retirar a la anterior |
| Proyecto de Apps Script (`WebApi.gs`) | Cuenta de Google de la comunidad | Igual | Si la cuenta es de la comunidad, se traspasa con ella. Si el script quedó en una cuenta personal, copiarlo a la de la comunidad y crear una implementación nueva (la dirección `/exec` cambiará: avisar a los equipos) |
| Carpeta «Rinde fácil» del Drive | Cuenta de Google de la comunidad | Igual | Verificar en «Compartir» quién más tiene acceso y retirar lo que sobre |
| Contraseña de la app | La eligió la comunidad | Quienes la usan | Cambiarla en «Seguridad» → «Cambiar la contraseña» (cierra las sesiones de los demás dispositivos) |
| Código de recuperación | Papel en un lugar seguro | La directiva | Guardar en dos lugares distintos (por ejemplo, tesorería y presidencia). Si se perdió: «Cambiar la contraseña» genera uno nuevo |
| Proyecto de Google Cloud (Vision) | Google Cloud | Quien lo creó | Agregar a la nueva persona como propietaria y luego retirar a la anterior; revisar la facturación |

## Lista de verificación (imprimir y firmar)

1. [ ] La nueva persona tiene acceso a la cuenta de Google de la comunidad con su propia verificación en dos pasos.
2. [ ] La nueva persona probó entrar a la app con el nombre de la comunidad y la contraseña.
3. [ ] Se cambió la contraseña de la app y se guardó un **código de recuperación nuevo** en dos lugares.
4. [ ] En «Seguridad» → «Quién entró al servicio» no hay accesos que se desconozcan.
5. [ ] Se pulsó «Cerrar sesión en todos los dispositivos».
6. [ ] En Drive → carpeta «Rinde fácil» → «Compartir»: solo tienen acceso las personas que corresponde.
7. [ ] En Apps Script → «Compartir»: solo las personas que corresponde pueden editar.
8. [ ] La persona que sale ya no tiene acceso a la cuenta de Google, al script, al Drive ni a Google Cloud.
9. [ ] Se anotó la fecha del traspaso y quiénes participaron.

Fecha: ________  Sale: ____________________  Entra: ____________________  Testigo: ____________________

## Si el Organismo Colaborador deja de acompañar

La comunidad conserva **todo**: los datos están en su Drive y en sus equipos. La app funciona sin el Organismo Colaborador. Lo único que se pierde es el acompañamiento; el resumen para el Organismo Colaborador es opcional y solo sale si la comunidad lo autoriza.
