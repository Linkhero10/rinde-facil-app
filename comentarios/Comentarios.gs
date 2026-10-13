/**
 * Rinde Fácil — comentarios de la versión de revisión (temporal).
 *
 * Esto corre en TU cuenta de Google, no en la de la comunidad. Cada comentario queda como una fila de la hoja
 * de cálculo y te llega un correo. Quien comenta no necesita cuenta; el nombre es opcional.
 *
 * Cómo se pone en marcha (una sola vez):
 *   1. Crea una hoja de cálculo nueva en Google Sheets.
 *   2. Extensiones → Apps Script. Borra lo que aparezca y pega este archivo completo. Guarda.
 *   3. Implementar → Nueva implementación → Tipo: Aplicación web.
 *      Ejecutar como: Yo.  Quién tiene acceso: Cualquier persona.  Implementar.
 *   4. Autoriza el acceso cuando lo pida (solo a tu hoja y a tu correo).
 *   5. Copia la URL que termina en /exec y mándasela a quien te ayude con la app.
 *
 * Qué guarda: fecha, pantalla, tipo (elemento, texto, área o general), cita del texto, selector del lugar,
 * nombre (opcional), comentario y estado. No guarda direcciones IP ni cookies.
 * Límite: 60 comentarios por hora en total, para evitar abusos.
 */
var COMENTARIOS = {
  hoja: 'Comentarios',
  maxTexto: 1500,
  maxCita: 300,
  maxSelector: 400,
  maxNombre: 60,
  porHora: 60,
  correo: true
};

var ENCABEZADOS = ['fecha', 'pantalla', 'tipo', 'cita', 'selector', 'nombre', 'comentario', 'estado'];

/* Lista los comentarios (solo lectura). ?pantalla=calendario filtra por pantalla. */
function doGet(e) {
  var pantalla = e && e.parameter && e.parameter.pantalla ? String(e.parameter.pantalla) : '';
  var filas = leerFilas_();
  if (pantalla) filas = filas.filter(function (f) { return f.pantalla === pantalla; });
  return salida_({ ok: true, comentarios: filas });
}

/* Recibe un comentario nuevo: {accion:'agregar', pantalla, tipo, cita, selector, nombre, texto} */
function doPost(e) {
  try {
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (p.accion !== 'agregar') return salida_({ ok: false, error: 'ACCION_DESCONOCIDA' });
    var texto = limpia_(p.texto, COMENTARIOS.maxTexto);
    if (!texto) return salida_({ ok: false, error: 'TEXTO_VACIO' });
    if (!cabeEnElLimite_()) return salida_({ ok: false, error: 'DEMASIADOS_COMENTARIOS' });
    var fila = [
      new Date(),
      limpia_(p.pantalla, 120),
      limpia_(p.tipo, 20) || 'general',
      limpia_(p.cita, COMENTARIOS.maxCita),
      limpia_(p.selector, COMENTARIOS.maxSelector),
      limpia_(p.nombre, COMENTARIOS.maxNombre),
      texto,
      'nuevo'
    ];
    hoja_().appendRow(fila);
    if (COMENTARIOS.correo) avisar_(fila);
    return salida_({ ok: true });
  } catch (err) {
    return salida_({ ok: false, error: 'ERROR' });
  }
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function limpia_(valor, max) {
  return String(valor == null ? '' : valor).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

function hoja_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(COMENTARIOS.hoja);
  if (!hoja) {
    hoja = libro.insertSheet(COMENTARIOS.hoja);
    hoja.appendRow(ENCABEZADOS);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function leerFilas_() {
  var hoja = hoja_();
  var datos = hoja.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < datos.length; i++) {
    var f = {};
    ENCABEZADOS.forEach(function (k, j) { f[k] = datos[i][j]; });
    if (f.fecha instanceof Date) f.fecha = f.fecha.toISOString();
    out.push(f);
  }
  return out;
}

/* Límite global por hora, guardado en propiedades del script (no identifica a quien comenta) */
function cabeEnElLimite_() {
  var props = PropertiesService.getScriptProperties();
  var clave = 'comentarios-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  var n = Number(props.getProperty(clave) || 0);
  if (n >= COMENTARIOS.porHora) return false;
  props.setProperty(clave, String(n + 1));
  return true;
}

function avisar_(fila) {
  try {
    var asunto = 'Comentario nuevo en Rinde Fácil (' + fila[1] + ')';
    var cuerpo = 'Pantalla: ' + fila[1] + '\n' +
      (fila[3] ? 'Sobre el texto: «' + fila[3] + '»\n' : '') +
      'De: ' + (fila[5] || 'sin nombre') + '\n\n' + fila[6] + '\n\n' +
      'Hoja: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl();
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), asunto, cuerpo);
  } catch (err) {
    /* si el correo falla, el comentario ya quedó en la hoja */
  }
}
