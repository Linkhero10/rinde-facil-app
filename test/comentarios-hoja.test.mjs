/* Lista de comentarios (js/58-comentarios.js): sin filas vacías, sin los ocultos y con la fecha en hora de Chile.
   La capa se carga en un entorno con un DOM mínimo y el servicio simulado: no hay red ni envíos. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarCapa } from './comentarios-entorno.mjs';

/* una fila tal como la devuelve el servicio cuando la fila de la hoja está vacía */
const VACIA = { fecha: '', pantalla: '', tipo: '', cita: '', selector: '', nombre: '', comentario: '', estado: '' };
/* un comentario real (nombre ficticio) */
const REAL = { fecha: '2026-10-15T16:31:35.213Z', pantalla: 'Mi ruta', tipo: 'pestana', cita: '', selector: '', nombre: 'Persona de prueba', comentario: 'hola', estado: 'nuevo' };

test('las filas vacías de la hoja no son comentarios: solo queda el comentario real', async () => {
  const lista = await cargarCapa([{ ...VACIA }, { ...VACIA }, { ...VACIA }, { ...REAL }]).cargar();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].comentario, 'hola');
});

test('una fila sin texto se quita aunque tenga fecha: no hay nada que mostrar', async () => {
  const soloFecha = { ...VACIA, fecha: REAL.fecha };
  const lista = await cargarCapa([{ ...VACIA }, soloFecha, { ...VACIA, comentario: '   ' }]).cargar();
  assert.equal(lista.length, 0);
});

test('un comentario con estado «oculto» no se muestra; los demás sí, también los que no tienen estado', async () => {
  const filas = [
    { ...REAL, comentario: 'visible', estado: 'nuevo' },
    { ...REAL, comentario: 'oculto en minúsculas', estado: 'oculto' },
    { ...REAL, comentario: 'oculto con mayúscula y espacios', estado: ' Oculto ' },
    { ...REAL, comentario: 'sin estado', estado: '' }
  ];
  const lista = await cargarCapa(filas).cargar();
  assert.deepEqual(lista.map(c => c.comentario), ['visible', 'sin estado']);
});

test('una fecha de la hoja se lee con el mes primero: 05/10/2026 es el 10 de mayo, no el 5 de octubre', () => {
  const texto = cargarCapa([]).fechaLegible('05/10/2026 16:31:35');
  assert.match(texto, /10-05-2026/);
  assert.doesNotMatch(texto, /05-10-2026/);
});

test('la fecha de la hoja se muestra en hora de Chile, sea texto (UTC) o ISO', () => {
  const rc = cargarCapa([]);
  assert.match(rc.fechaLegible('10/15/2026 16:31:35'), /15-10-2026.*13:31/);
  assert.match(rc.fechaLegible('2026-10-15T16:31:35.213Z'), /15-10-2026.*13:31/);
  assert.match(rc.fechaLegible('2026-10-15 16:31:35'), /15-10-2026.*13:31/, 'sin zona se toma como UTC');
});

test('en invierno Chile está a UTC-4: la misma hora UTC se ve una hora antes', () => {
  assert.match(cargarCapa([]).fechaLegible('2026-07-15T16:31:35Z'), /15-07-2026.*12:31/);
});

test('la hora de Chile no depende de la zona horaria del equipo', () => {
  const previa = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Tokyo';
    const rc = cargarCapa([]);
    assert.match(rc.fechaLegible('2026-10-15T16:31:35.213Z'), /13:31/);
    assert.match(rc.fechaLegible('10/15/2026 16:31:35'), /13:31/);
  } finally {
    if (previa === undefined) delete process.env.TZ; else process.env.TZ = previa;
  }
});

test('una fecha que no se entiende se muestra tal cual, sin romper la lista', () => {
  const rc = cargarCapa([]);
  assert.equal(rc.fechaLegible('no es fecha'), 'no es fecha');
  assert.equal(rc.fechaLegible(''), '');
});

test('una hora de una cifra, con espacio o con T («2026-10-15 9:31:35»), se lee bien: son las 06:31 en Chile', () => {
  const rc = cargarCapa([]);
  assert.match(rc.fechaLegible('2026-10-15 9:31:35'), /15-10-2026.*06:31/);
  assert.match(rc.fechaLegible('2026-10-15T9:31:35Z'), /15-10-2026.*06:31/);
});
