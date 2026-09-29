# Rinde Fácil (app v2)

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

`backend/WebApi.gs` va en el proyecto de Apps Script de **cada comunidad** (junto a `CloudOcrAdapter.gs` del bundle de Rinde fácil). Decisión vigente (25-sep-2026): cada comunidad tiene su propio Google Workspace; nada pasa por un servidor de SMI.

1. Copiar `WebApi.gs` al proyecto (el bundle ya trae `CloudOcrAdapter.gs` y los permisos de Drive y Cloud Vision).
2. Propiedades de la secuencia de comandos: `RINDE_FACIL_ACCESS_KEY` (una clave larga), `RINDE_FACIL_GCP_PROJECT_ID`, `RINDE_FACIL_OCR_PROVIDER=cloud_vision`; opcionales `RINDE_FACIL_ROOT_FOLDER_ID` y `RINDE_FACIL_OCR_DAILY_LIMIT`.
3. Implementar → Nueva implementación → Aplicación web → **Ejecutar como: yo** · **Quién tiene acceso: cualquier persona**. La clave protege el servicio.
4. Pegar la dirección `/exec` y la clave en la app: «Nube y copias» → «Probar conexión».

Seguridad: sin clave configurada el servicio no atiende a nadie; el OCR no guarda ni la imagen ni el texto; hay límite diario de lecturas; el estado guardado se valida y se conservan 5 respaldos.

## Pruebas

```
node --test test/logic.test.mjs test/export.test.mjs test/backend.test.mjs   # reglas, exportación (Excel abierto con openpyxl), servicio simulado
node test/e2e.mjs                                                            # recorrido completo con Playwright (18 pasos, escritorio y celular)
node test/e2e-crawl.mjs                                                      # las 69 pantallas en 2 tamaños: errores, desborde, imágenes, accesibilidad
```

Las pruebas de OCR usan `test/stub_api.mjs`, un servicio **de prueba** que devuelve un texto fijo; prueban el flujo de la app, no la exactitud de Google.

## Límites (léelos antes de usarla con una comunidad)

- **No está probada con personas de las comunidades.** Falta prueba de usabilidad con consentimiento.
- **El OCR no tiene medición de exactitud** con documentos reales; por eso cada dato se revisa contra la foto y el gasto no queda «listo» hasta marcar «Lo revisé».
- **El formato del PEA no es el oficial** (no está en las fuentes). Los anexos 1 a 6 siguen el texto del Manual.
- **Feriados:** los días hábiles cuentan de lunes a viernes y la app no trae feriados; se agregan a mano.
- **Plazos de revisión de CORFO y de la transferencia final:** las fuentes no los fijan; la app no los inventa.
- **Tope y reglas numéricas** (10 M netos, 3 M mensuales, 200 caracteres de glosa, tolerancia de $1) vienen del Manual y del piloto; si CORFO las cambia hay que actualizar `js/10-data.js`.
- **Datos personales:** viven en el dispositivo y, si se conecta, en el Drive de la comunidad. Falta definir consentimiento, retención y responsables antes del uso real (Ley 21.719, vigente desde el 1-dic-2026).
- La foto de los comprobantes se guarda solo en el dispositivo (IndexedDB); la copia en JSON no las incluye.

## Estructura

```
index.html · css/app.css · sw.js · manifest.webmanifest
js/01-util · 02-store · 10-data · 11-tramites · 20-logic · 21-export · 30-ui · 31-forms · 32-tools-plan · 33-cloud · 34-tools-gastos · 35-flow · 40-views · 60-app
vendor/parser.js          analizador de comprobantes del piloto (copiado sin cambios; SHA-256 en su cabecera)
assets/docs/*.jpg         capturas reales de los documentos (optimizadas por tools/optimize_images.py)
backend/WebApi.gs         servicio de la comunidad
test/                     pruebas
```

## Fuentes

Manual de presentación de informes y rendición (CORFO), Flujograma proceso comunidades, «Introducción al Acuerdo», presentaciones de configuración y de rendición, e inventario `_FARO/07_evaluaciones/inventario_tramites_corfo.json` (29 trámites). Cada trámite conserva su fuente; el Manual manda sobre las presentaciones (decisión del 27-sep-2026).
