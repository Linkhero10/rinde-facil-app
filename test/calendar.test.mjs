/* Calendario: junta las fechas del proyecto y las pasa a Google Calendar o a un archivo .ics. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp(['00-service-trust.js', '01-util.js', '02-store.js', '10-data.js', '11-tramites.js', '12-needs.js', '13-holidays.js', '20-logic.js', '30-ui.js', '42-tools-calendar.js']);

const state = {
  holidays: ['2026-09-18'], repo: { docs: [], actas: [{ id: 'a1', date: '2026-10-20', place: 'Sede' }] },
  events: [{ id: 'e1', date: '2026-10-15', title: 'Reunión con la directiva, 19:00', note: 'Llevar libro; actas' }]
};
const project = {
  id: 'p1', name: 'Invernadero', start: '2026-07-01', end: '2027-06-30', desembolso1: '2026-08-01', periodoInicio: '', periodoFin: '',
  gantt: { stages: [{ id: 's1', name: 'Preparación', acts: [{ id: 'x1', name: 'Taller de artesanía', start: '2026-09-01', end: '2026-09-30' }] }] },
  expenses: [{ id: 'g1', proveedor: 'Ferretería Sur', fecha: '2026-09-05', montoRendir: '12000' }], observations: []
};

test('junta fechas de plazos, actividades, boletas, reuniones y las que anotó la comunidad', () => {
  const ev = RF.calendar.collect(state, project);
  const has = (d, t) => ev.some(e => e.date === d && e.title.includes(t));
  assert.ok(has('2026-07-01', 'Empieza el proyecto'), 'inicio del proyecto');
  assert.ok(ev.some(e => e.title.includes('plazo del PEA')), 'plazo del PEA: ' + JSON.stringify(ev.filter(e => /PEA/.test(e.title))));
  assert.ok(has('2026-09-01', 'Empieza: Taller de artesanía'), 'actividad');
  assert.ok(has('2026-09-05', 'Ferretería Sur'), 'boleta');
  assert.ok(has('2026-10-20', 'Reunión: Sede'), 'acta');
  assert.ok(has('2026-10-15', 'Reunión con la directiva'), 'fecha propia');
  assert.ok(!ev.some(e => /Feriado/.test(e.title)), 'los feriados no se listan: Google Calendar ya los conoce');
  assert.deepEqual(ev.map(e => e.date), ev.map(e => e.date).slice().sort(), 'ordenadas por fecha');
});

test('ignora fechas inválidas', () => {
  const ev = RF.calendar.collect({ holidays: ['no-fecha'], repo: { actas: [{ date: '2026-13-99x' }] }, events: [null, { id: 'z', date: '', title: 'x' }] }, { start: 'ayer', gantt: { stages: [] }, expenses: [], observations: [] });
  assert.equal(ev.length, 0);
});

test('enlace de Google Calendar: día completo y texto codificado', () => {
  const u = RF.calendar.googleUrl({ date: '2026-10-30', title: 'Vence el plazo del PEA', note: 'Pide la prórroga' });
  assert.ok(u.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
  assert.ok(u.includes('dates=20261030/20261031'));
  assert.ok(u.includes('text=Vence%20el%20plazo%20del%20PEA'));
});

test('archivo .ics válido: fechas de día completo, comas y punto y coma escapados, saltos CRLF', () => {
  const ics = RF.calendar.toIcs([{ date: '2026-10-15', title: 'Reunión, directiva; 19:00', note: 'Llevar libro\nactas' }], '20261006T120000Z');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261015\r\n'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261016\r\n'));
  assert.ok(ics.includes('SUMMARY:Reunión\\, directiva\\; 19:00\r\n'));
  assert.ok(ics.includes('DESCRIPTION:Llevar libro\\nactas\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('eventos con hora y lugar: se ordenan por hora y pasan a Google Calendar y al .ics con hora local y lugar', () => {
  const ev = RF.calendar.collect({ events: [{ id: 'b', date: '2026-10-20', title: 'Tarde', time: '19:00', endTime: '20:30', place: 'Sede social' }, { id: 'a', date: '2026-10-20', title: 'Mañana', time: '09:00' }, { id: 'c', date: '2026-10-20', title: 'Todo el día' }] }, null);
  assert.equal(JSON.stringify(ev.map(e => e.title)), JSON.stringify(['Todo el día', 'Mañana', 'Tarde']));
  const tarde = ev[2];
  const u = RF.calendar.googleUrl(tarde);
  assert.ok(u.includes('dates=20261020T190000/20261020T203000'));
  assert.ok(u.includes('ctz=America%2FSantiago') && u.includes('location=Sede%20social'));
  assert.ok(RF.calendar.googleUrl(ev[1]).includes('dates=20261020T090000/20261020T100000'), 'sin hora de término dura una hora');
  const ics = RF.calendar.toIcs([tarde], '20261006T120000Z');
  assert.ok(ics.includes('DTSTART:20261020T190000\r\n') && ics.includes('DTEND:20261020T203000\r\n') && ics.includes('LOCATION:Sede social\r\n'));
  const noche = RF.calendar.toIcs([{ date: '2026-10-20', title: 'Noche', time: '23:30' }], 'x');
  assert.ok(noche.includes('DTEND:20261021T003000'), 'cruza la medianoche');
});
