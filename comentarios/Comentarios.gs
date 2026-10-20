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
  vigenciaEnvioMs: 24 * 60 * 60 * 1000,
  correo: true
};

var ENCABEZADOS = ['fecha', 'pantalla', 'tipo', 'cita', 'selector', 'nombre', 'comentario', 'estado'];
/* columna I: el número de envío de cada comentario. El lector solo usa las ocho primeras columnas */
var ENCABEZADO_ENVIO = 'id_envio';
var COLUMNA_ENVIO = 9;

/* Lista los comentarios (solo lectura). ?pantalla=calendario filtra por pantalla. */
function doGet(e) {
  var pantalla = e && e.parameter && e.parameter.pantalla ? String(e.parameter.pantalla) : '';
  var filas = leerFilas_();
  if (pantalla) filas = filas.filter(function (f) { return f.pantalla === pantalla; });
  return salida_({ ok: true, comentarios: filas });
}

/* Recibe un comentario nuevo: {accion:'agregar', pantalla, tipo, cita, selector, nombre, texto, id}.
   «id» es el número de envío: si llega otra vez (un reenvío), el comentario se guarda una sola vez. */
function doPost(e) {
  try {
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (p.accion !== 'agregar') return salida_({ ok: false, error: 'ACCION_DESCONOCIDA' });
    var texto = limpia_(p.texto, COMENTARIOS.maxTexto);
    if (!texto) return salida_({ ok: false, error: 'TEXTO_VACIO' });
    var envio = claveEnvio_(limpia_(p.id, 60));
    var fila = [
      new Date(),
      textoSeguro_(limpia_(p.pantalla, 120)),
      textoSeguro_(limpia_(p.tipo, 20)) || 'general',
      textoSeguro_(limpia_(p.cita, COMENTARIOS.maxCita)),
      textoSeguro_(limpia_(p.selector, COMENTARIOS.maxSelector)),
      textoSeguro_(limpia_(p.nombre, COMENTARIOS.maxNombre)),
      textoSeguro_(texto),
      'nuevo'
    ];
    /* el correo lleva el texto como lo escribió quien comenta, sin la comilla de textoSeguro_ */
    var aviso = { pantalla: limpia_(p.pantalla, 120), cita: limpia_(p.cita, COMENTARIOS.maxCita), nombre: limpia_(p.nombre, COMENTARIOS.maxNombre), texto: texto };
    var candado = LockService.getScriptLock();
    if (!candado.tryLock(10000)) return salida_({ ok: false, error: 'OCUPADO' });
    try {
      limpiaEnvios_();
      var hojaActual = hoja_();
      asegurarEncabezadoEnvio_(hojaActual);
      /* la comprobación de la columna I sobrevive a la caducidad de las propiedades: un reenvío nunca escribe otra fila */
      if (envio && idsEnvio_(hojaActual).indexOf(envio) >= 0) return salida_({ ok: true, duplicado: true });
      var previo = envio ? estadoEnvio_(envio) : '';
      if (previo === 'confirmado') return salida_({ ok: true, duplicado: true });
      if (previo === 'pendiente') return salida_({ ok: false, error: 'ENVIO_INCIERTO' });
      if (!cabeEnElLimite_()) return salida_({ ok: false, error: 'DEMASIADOS_COMENTARIOS' });
      if (envio) marcaEnvio_(envio, 'pendiente');
      try {
        hojaActual.appendRow(fila.concat([textoSeguro_(envio)]));
      } catch (err) {
        /* la fila no llegó a la hoja: el reenvío puede intentarlo otra vez (no queda como «incierto») */
        if (envio) marcaEnvio_(envio, 'fallido');
        throw err;
      }
      if (envio) marcaEnvio_(envio, 'confirmado');
    } finally { candado.releaseLock(); }
    if (COMENTARIOS.correo) avisar_(aviso);
    return salida_({ ok: true });
  } catch (err) {
    return salida_({ ok: false, error: 'ERROR' });
  }
}

/* números de envío ya guardados en la columna I (desde la fila 2) */
function idsEnvio_(hoja) {
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  return hoja.getRange(2, COLUMNA_ENVIO, ultima - 1, 1).getValues().map(function (f) { return claveEnvio_(f[0]); });
}
/* una hoja creada antes no tiene la columna de número de envío en la cabecera: se añade una vez. Una pestaña vacía recibe la cabecera completa */
function asegurarEncabezadoEnvio_(hoja) {
  if (hoja.getLastRow() === 0) { hoja.appendRow(ENCABEZADOS.concat([ENCABEZADO_ENVIO])); return; }
  const celda = hoja.getRange(1, COLUMNA_ENVIO);
  if (!String(celda.getValue() || '')) celda.setValue(ENCABEZADO_ENVIO);
}

/* número de envío tal como se compara y se guarda: sin las comillas del principio. La hoja puede no mostrar la comilla que textoSeguro_ pone delante, así que al leer también se quitan */
function claveEnvio_(valor) {
  return String(valor == null ? '' : valor).replace(/^'+/, '');
}
/* una celda que empieza con = + - o @ la evalúa la hoja como fórmula: se guarda como texto, con una comilla simple delante */
function textoSeguro_(valor) {
  var s = String(valor == null ? '' : valor);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* número de envío: «pendiente» mientras se escribe la fila, «confirmado» después y «fallido» si la escritura falló. El número también va en la columna I de la hoja; estas propiedades duran 24 horas */
function estadoEnvio_(envio) {
  return String(PropertiesService.getScriptProperties().getProperty('envio-' + envio) || '').split(':')[0];
}
function marcaEnvio_(envio, estado) {
  PropertiesService.getScriptProperties().setProperty('envio-' + envio, estado + ':' + Date.now());
}
/* borra los números de envío de hace más de 24 horas (vigenciaEnvioMs) */
function limpiaEnvios_() {
  var props = PropertiesService.getScriptProperties();
  var limite = Date.now() - COMENTARIOS.vigenciaEnvioMs;
  props.getKeys().forEach(function (k) {
    if (k.indexOf('envio-') !== 0) return;
    if (!(Number(String(props.getProperty(k) || '').split(':')[1]) > limite)) props.deleteProperty(k);
  });
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
    /* una hoja nueva trae una primera pestaña vacía: si está vacía, esa pestaña pasa a llamarse Comentarios
       (así no queda una pestaña vacía al lado, que es la que se abre al entrar al enlace) */
    var primera = libro.getSheets()[0];
    if (primera.getLastRow() === 0) {
      hoja = primera;
      hoja.setName(COMENTARIOS.hoja);
    } else {
      hoja = libro.insertSheet(COMENTARIOS.hoja);
    }
    hoja.appendRow(ENCABEZADOS.concat([ENCABEZADO_ENVIO]));
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/* enlace directo a la pestaña de comentarios (no a la primera pestaña) */
function hojaUrl_() {
  var hoja = hoja_();
  return hoja.getParent().getUrl() + '#gid=' + hoja.getSheetId();
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

/* Límite global por hora, guardado en propiedades del script (no identifica a quien comenta). Solo se guarda la hora actual: las de horas anteriores se borran. Quien llama tiene el candado. */
function cabeEnElLimite_() {
  var props = PropertiesService.getScriptProperties();
  var clave = 'comentarios-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  props.getKeys().forEach(function (k) { if (k.indexOf('comentarios-') === 0 && k !== clave) props.deleteProperty(k); });
  var n = Number(props.getProperty(clave) || 0);
  if (n >= COMENTARIOS.porHora) return false;
  props.setProperty(clave, String(n + 1));
  return true;
}

function avisar_(aviso) {
  try {
    var asunto = 'Comentario nuevo en Rinde Fácil (' + aviso.pantalla + ')';
    var cuerpo = 'Pantalla: ' + aviso.pantalla + '\n' +
      (aviso.cita ? 'Sobre el texto: «' + aviso.cita + '»\n' : '') +
      'De: ' + (aviso.nombre || 'sin nombre') + '\n\n' + aviso.texto + '\n\n' +
      'Hoja (pestaña Comentarios): ' + hojaUrl_();
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), asunto, cuerpo);
  } catch (err) {
    /* si el correo falla, el comentario ya quedó en la hoja */
  }
}
