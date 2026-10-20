/* Comportamiento de la capa de comentarios en el navegador (js/58-comentarios.js): descargas que llegan tarde,
   el contador mientras se reintenta y el envío que no responde. Sin red: el servicio es una simulación. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarCapaCon, esperar, buscar, buscarClase, buscarTexto, textoDe } from './comentarios-entorno.mjs';

/* un comentario real (nombre ficticio) */
const REAL = { fecha: '2026-10-15T16:31:35.213Z', pantalla: 'Mi ruta', tipo: 'pestana', cita: '', selector: '', nombre: 'Persona de prueba', comentario: 'hola', estado: 'nuevo' };
const respuesta = comentarios => ({ ok: true, json: () => Promise.resolve({ ok: true, comentarios }) });

test('mientras se reintenta una descarga, el contador dice «cargando…» y no «sin conexión»', async () => {
  let llamadas = 0;
  /* las tres primeras descargas (el arranque) fallan; las siguientes no terminan */
  const e = cargarCapaCon({ fetch: () => { llamadas++; return llamadas <= 3 ? Promise.reject(new Error('sin red')) : new Promise(() => {}); } });
  await esperar(); await esperar(); await esperar();
  e.disparar('hashchange', {});
  await esperar();
  e.clic(e.doc.body.children[0].children[0]);
  const contador = buscar(e.doc.body, n => String(n.textContent || '').indexOf('Ver comentarios') === 0);
  assert.match(contador.textContent, /cargando/);
});

test('una descarga vieja que llega tarde no pisa la lista de una descarga más nueva', async () => {
  const pendientes = [];
  const e = cargarCapaCon({ fetch: () => new Promise(resolver => pendientes.push(resolver)) });
  e.disparar('hashchange', {});
  assert.equal(pendientes.length, 2, 'el arranque y el cambio de pantalla piden la lista');
  pendientes[1](respuesta([Object.assign({}, REAL, { comentario: 'nueva' })]));
  await esperar();
  pendientes[0](respuesta([Object.assign({}, REAL, { comentario: 'vieja' })]));
  await esperar();
  assert.deepEqual(e.rc.comentarios().map(c => c.comentario), ['nueva']);
});

test('si el envío no responde a tiempo, se dice que no sabemos si se guardó, y el reenvío lleva el mismo número de envío', async () => {
  const envios = [];
  const e = cargarCapaCon({ fetch: (url, opts) => {
    if (opts && opts.method === 'POST') { envios.push(JSON.parse(opts.body)); return new Promise(() => {}); }
    return Promise.resolve(respuesta([]));
  } });
  await esperar();
  e.clic(e.doc.body.children[0].children[0]);                       /* «Dejar un comentario» */
  e.clic(buscarTexto(e.doc.body, 'Comentario general'));           /* abre el panel */
  const panel = buscarClase(e.doc.body, 'rf-com-panel');
  buscarClase(panel, 'rf-com-texto').value = 'prueba de envío';
  const enviar = buscarTexto(panel, 'Enviar');
  e.clic(enviar);
  await esperar();
  e.temporizador(30000);                                          /* a los 30 s, la app dice que sigue esperando */
  await esperar();
  assert.match(textoDe(panel), /Seguimos esperando la confirmación\./);
  e.temporizador(120000);                                         /* a los 120 s deja de esperar: no sabemos si se guardó */
  await esperar();
  assert.match(textoDe(panel), /No sabemos si se guardó\. Revisa la lista antes de reenviar\./);
  assert.equal(enviar.disabled, false, 'el botón vuelve a estar disponible para reenviar después de revisar');
  e.clic(enviar);
  await esperar();
  assert.equal(envios.length, 2);
  assert.ok(envios[0].id, 'cada envío lleva un número');
  assert.equal(envios[1].id, envios[0].id, 'el reenvío del mismo panel usa el mismo número');
});

test('el pie de la lista renderizada dice cuántos comentarios llegaron (sin vacíos ni ocultos) y la versión', async () => {
  const e = cargarCapaCon({ fetch: () => Promise.resolve(respuesta([
    Object.assign({}, REAL, { comentario: 'uno' }),
    { fecha: '', pantalla: '', tipo: '', cita: '', selector: '', nombre: '', comentario: '', estado: '' },
    Object.assign({}, REAL, { comentario: 'oculto', estado: 'oculto' })
  ])) });
  await esperar();
  await esperar();
  e.clic(e.doc.body.children[0].children[0]);                                   /* «Dejar un comentario» */
  e.clic(buscar(e.doc.body, n => String(n.textContent || '').indexOf('Ver comentarios') === 0));  /* abre la lista */
  const panel = buscarClase(e.doc.body, 'rf-com-panel');
  assert.match(textoDe(panel), /Recibidos del servicio: 1 · versión de revisión rf-v3-\d+/);
});

test('una descarga que no responde se corta a los 12 segundos y no queda «cargando…» para siempre', async () => {
  const e = cargarCapaCon({ fetch: (url, opciones) => new Promise((resolver, rechazar) => {
    opciones.signal.addEventListener('abort', () => rechazar(new Error('AbortError')));
  }) });
  /* cada intento tiene su corte de 12 s; una descarga completa son tres intentos */
  const cortarUnaDescarga = async () => { for (let i = 0; i < 3; i++) { e.temporizador(12000); await esperar(); } };
  await esperar();
  await cortarUnaDescarga();                                   /* el arranque: se corta y se da por fallida */
  e.clic(e.doc.body.children[0].children[0]);                  /* abre el menú, que vuelve a pedir la lista */
  const contador = buscar(e.doc.body, n => String(n.textContent || '').indexOf('Ver comentarios') === 0);
  assert.match(contador.textContent, /cargando/, 'mientras pide la lista, dice «cargando…»');
  await cortarUnaDescarga();                                   /* esa descarga también se corta */
  assert.match(contador.textContent, /sin conexión/, 'al terminar sin datos, dice «sin conexión»');
});

test('un fallo de red al enviar dice lo mismo que el tiempo agotado: no sabemos si se guardó', async () => {
  const e = cargarCapaCon({ fetch: (url, opts) => (opts && opts.method === 'POST' ? Promise.reject(new Error('sin red')) : Promise.resolve(respuesta([]))) });
  await esperar();
  e.clic(e.doc.body.children[0].children[0]);
  e.clic(buscarTexto(e.doc.body, 'Comentario general'));
  const panel = buscarClase(e.doc.body, 'rf-com-panel');
  buscarClase(panel, 'rf-com-texto').value = 'prueba de red';
  e.clic(buscarTexto(panel, 'Enviar'));
  await esperar();
  await esperar();
  assert.match(textoDe(panel), /No sabemos si se guardó\. Revisa la lista antes de reenviar\./);
});
