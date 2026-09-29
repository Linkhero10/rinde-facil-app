# Rinde Fácil (app v3)

Guía paso a paso para que las comunidades del Salar de Atacama rindan el convenio CORFO, con formularios listos, cuadre entre trámites y lectura de comprobantes en la nube. Reemplaza a la demo anterior (`../demo`, que se conserva sin cambios).

## Qué incluye

| Área | Qué hace |
|---|---|
| **Mi ruta** | 6 fases en un menú de acordeón; avance por pasos que se pueden tachar; «siguiente paso»; diagrama en carriles de qué le toca a CORFO, la comunidad, Novandina y SMI (con los plazos del flujograma y del Manual). |
| **32 pantallas de trámite** | 29 trámites del inventario + 3 pasos del proceso, en lenguaje simple, con capturas reales de los documentos y sus fuentes. |
| **Varios proyectos** | Selector de proyecto; cada uno con sus fechas, presupuesto, gastos, anexos y avance. |
| **Carta Gantt** | Etapas y actividades con fechas, vista por meses, revisión; sale en Excel, Word, PDF, texto y «copiar para SGP». |
| **Presupuesto** | Por cuenta, ítem, glosa (máx. 200), fuente F1/F2; avisa si supera lo aprobado y el tope de administración. |
| **PEA** | Información general, un formulario por proyecto, Carta Gantt y presupuesto en un solo documento (**borrador**, no es el formulario oficial). |
| **Anexos 1 a 5 y Anexo 6** | Recreados editables con los textos del Manual. Anexo 4 y 5 calculan solos; Anexo 3 se crea desde el gasto en efectivo. Informe técnico con fichas A–E. |
| **Gastos y rendición** | Anotar a mano o con foto; validación con las reglas del Manual (RUT, neto+IVA, glosa, fechas, respaldos por tipo, cotizaciones, efectivo, viáticos, tope de administración, duplicados). Sale en formato SGP. |
| **Revisión (cuadre)** | Cruza gastos, anexos, presupuesto, Gantt, plazos, informe técnico y el orden del proceso; «Arreglar» lleva a cada pantalla. |
| **OCR en la nube** | Foto o PDF → servicio de la comunidad (Apps Script) → Google Cloud Vision → campos del gasto. **Siempre exige revisión humana.** |
| **Nube y copias** | Guardar/traer copia en el Drive de la comunidad; copia local en JSON. |

## Cómo abrirla

Es una app estática (sin instalación): cualquier servidor de archivos sirve.

```
python -m http.server 8790 --directory "D:\SMI\Productos\Rinde fácil\app"
```

Abre `http://127.0.0.1:8790/index.html`. En celular funciona igual y se puede «Agregar a la pantalla de inicio» (tiene manifiesto y modo sin conexión para los archivos de la app).

## Servicio en la nube (OCR y copias)

`backend/WebApi.gs` va en el proyecto de Apps Script de **cada comunidad** (junto a `CloudOcrAdapter.gs` del bundle de Rinde fácil). Decisión vigente (25-sep-2026): cada comunidad tiene su propio Google Workspace; nada pasa por un servidor central.

Instalación y actualización paso a paso: [docs/INSTALAR_SERVICIO.md](docs/INSTALAR_SERVICIO.md). En corto: pegar `WebApi.gs`, crear la propiedad `RINDE_FACIL_SETUP_CODE` (código de un solo uso), implementar como aplicación web (**ejecutar como yo**, acceso **cualquier persona**), pegar la dirección `/exec` en la app y crear la cuenta del servicio con ese código.

**Acceso (versión 3):** al abrir la app se pide el **nombre de la comunidad** (usuario) y una **contraseña** que elige la comunidad. Ya no existe la clave compartida. La contraseña no sale del equipo; los datos locales van cifrados (AES‑256‑GCM) y hay un código de recuperación de 26 caracteres. Modelo de amenazas, controles, pruebas y riesgos que quedan: [docs/SEGURIDAD.md](docs/SEGURIDAD.md). Privacidad y retención: [docs/PRIVACIDAD_Y_RETENCION.md](docs/PRIVACIDAD_Y_RETENCION.md). Cambio de administradores: [docs/TRASPASO_ADMINISTRACION.md](docs/TRASPASO_ADMINISTRACION.md).

## Pruebas

```
npm install                  # una vez: instala ESLint
npm run check                # sintaxis de la app y del servicio
npm run lint                 # ESLint (errores reales: variables sin declarar, claves duplicadas…)
npm test                     # unitarias y del servicio (WebApi.gs real con Apps Script simulado): reglas, exportación, cuentas, bloqueo, sesiones
node test/e2e.mjs            # recorrido completo con Playwright (crear cuenta, bloqueo, recuperación, sin conexión, celular…)
node test/e2e-crawl.mjs      # todas las pantallas en 2 tamaños, con migración de datos antiguos
```

En GitHub, `.github/workflows/ci.yml` corre check, lint y test en cada cambio. Los recorridos con navegador se corren en el equipo de desarrollo.

Las pruebas de OCR usan `test/stub_api.mjs`, un servicio **de prueba** que devuelve un texto fijo; prueban el flujo de la app, no la exactitud de Google.

## Límites (léelos antes de usarla con una comunidad)

- **No está probada con personas de las comunidades.** Falta prueba de usabilidad con consentimiento.
- **El OCR no tiene medición de exactitud** con documentos reales; por eso cada dato se revisa contra la foto y el gasto no queda «listo» hasta marcar «Lo revisé».
- **El formato del PEA no es el oficial** (no está en las fuentes). Los anexos 1 a 6 siguen el texto del Manual.
- **Feriados:** los días hábiles cuentan de lunes a viernes y la app no trae feriados; se agregan a mano.
- **Plazos de revisión de CORFO y de la transferencia final:** las fuentes no los fijan; la app no los inventa.
- **Tope y reglas numéricas** (10 M netos, 3 M mensuales, 200 caracteres de glosa, tolerancia de $1) vienen del Manual y del piloto; si CORFO las cambia hay que actualizar `js/10-data.js`.
- **Datos personales:** viven cifrados en el dispositivo y, si se conecta, en el Drive de la comunidad. Hay un borrador de consentimiento y retención ([docs/PRIVACIDAD_Y_RETENCION.md](docs/PRIVACIDAD_Y_RETENCION.md)) que **falta revisar con una persona abogada** antes del uso real (Ley 21.719: verificar la fecha de vigencia).
- **Sin auditoría externa.** La seguridad se probó con pruebas propias; falta la prueba de penetración y desplegar la versión 3 del servicio en Apps Script real.
- La foto de los comprobantes se guarda solo en el dispositivo (IndexedDB); la copia en JSON no las incluye.

## Estructura

```
index.html · css/app.css · sw.js · manifest.webmanifest
js/01-util · 02-store · 03-crypto · 04-vault · 05-auth · 10-data · 11-tramites · 12-needs · 20-logic · 21-export · 26-receipt · 27-search · 30-ui · 31-forms · 32-tools-plan · 33-cloud · 34-tools-gastos · 35-flow · 36-drive · 37-repo · 38-tools-needs · 39-auth-ui · 41-tools-share · 40-views · 50-search · 60-app
vendor/parser.js          analizador de comprobantes del piloto (copiado sin cambios; SHA-256 en su cabecera)
assets/docs/*.jpg         capturas reales de los documentos (optimizadas por tools/optimize_images.py)
backend/WebApi.gs         servicio de la comunidad
test/                     pruebas
```

## Fuentes

Manual de presentación de informes y rendición (CORFO), Flujograma proceso comunidades, «Introducción al Acuerdo», presentaciones de configuración y de rendición, e inventario `_FARO/07_evaluaciones/inventario_tramites_corfo.json` (29 trámites). Cada trámite conserva su fuente; el Manual manda sobre las presentaciones (decisión del 27-sep-2026).

## Novedades de la versión con documentos oficiales

- **Qué necesitará tu proyecto** (`js/12-needs.js`, `js/38-tools-needs.js`): la comunidad marca viáticos, insumos, inmuebles, etc. y la app muestra solo los trámites que le tocan. El avance se cuenta en trámites (no en pasos). Lo que no estaba en el PEA aprobado se anota como cambio y se avisa que conviene modificar el PEA (reitemización o reprogramación).
- **Botones en cada paso** (`STEP_TOOLS` en `12-needs.js`): «Rellenar» abre la herramienta por casillas y «Ver formato» muestra el documento como queda, sin salir del trámite.
- **Documentos oficiales y actas de mesas de trabajo** (`js/37-repo.js`): registro de lo que llega de CORFO (PEA corregido, acta de no objeción, resoluciones…) con la marca «¿cambia el PEA?», y de las actas de las mesas (asistencia mínima, acuerdos y plazos). Se guardan en el dispositivo y en el Drive de la comunidad.
- En toda la app se habla del **Organismo Colaborador** (no de la institución que hoy cumple ese rol).

Carpeta que arma `backend/WebApi.gs` (versión 3.0.0) en el Drive de la comunidad:

```
Rinde fácil/
  LEEME.txt
  Documentos oficiales/<tipo>/          (PEA y sus cambios, Actas de no objeción, Resoluciones y oficios…)
  Actas de mesas de trabajo/AAAA-MM/
  Copias de seguridad/
  Proyectos/<proyecto>/{1 Planificación, 2 Anexos y formularios, 3 Rendición, 4 Comprobantes/AAAA-MM}
```

## Novedades de la versión 3

- **Cuenta por comunidad** (`js/03-crypto.js`, `04-vault.js`, `05-auth.js`, `39-auth-ui.js`): usuario = nombre de la comunidad; contraseña propia; código de recuperación; bloqueo por inactividad; pantalla «Seguridad» con cambio de contraseña, cierre de sesiones y registro de accesos.
- **Servicio con sesiones** (`backend/WebApi.gs` 3.0.0): claves derivadas (el servidor no conoce la contraseña), bloqueo por intentos, sesiones que vencen, control de versiones de la copia (`CONFLICTO`).
- **Cola sin conexión:** lo que no se pudo subir al Drive queda cifrado en el equipo y se reintenta solo.
- **Resumen para el Organismo Colaborador** (`js/41-tools-share.js`): la comunidad elige qué incluye, revisa el texto y autoriza; sin nombres de proveedores ni RUT; queda registro de lo compartido.
- **Reglas por convenio** (`RF.data.CONVENIOS`): las reglas numéricas son un juego versionado («Manual vigente a septiembre de 2026»); un cambio de Manual o un fondo nuevo no toca los datos.
- **Tamaño de letra** (normal, grande, muy grande) y extracto del texto del OCR en las copias.
