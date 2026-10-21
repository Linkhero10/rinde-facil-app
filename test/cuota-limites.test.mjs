/* Límites de lectura OCR (backend/WebApi.gs): el diario siempre; el semanal y el mensual solo si se configuran;
   la acción «cuota» (con sesión) informa lo leído. Con Apps Script simulado: no llama a Google ni cobra nada. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas_sim.mjs';

const B64 = Buffer.from('imagen-de-prueba').toString('base64');
const base = { RINDE_FACIL_SETUP_CODE: 'k', RINDE_FACIL_GCP_PROJECT_ID: 'proy' };
const enHoy = (e, fecha) => { e.ctx.rfToday_ = () => fecha; };
const lectura = (e) => e.call({ action: 'ocr', t: e.t, mimeType: 'image/jpeg', base64: B64 });

test('fechas de calendario: el lunes de la semana y los días que cruzan mes', () => {
  const e = makeEnv(base);
  assert.equal(e.ctx.rfAddDias_('2026-10-14', -e.ctx.rfDiaSemana_('2026-10-14')), '2026-10-12', 'miércoles 14: el lunes es el 12');
  assert.equal(e.ctx.rfDiaSemana_('2026-10-12'), 0, 'lunes');
  assert.equal(e.ctx.rfDiaSemana_('2026-10-11'), 6, 'domingo');
  assert.equal(e.ctx.rfAddDias_('2026-10-31', 1), '2026-11-01');
  assert.equal(e.ctx.rfAddDias_('2026-03-01', -1), '2026-02-28', '2026 no es bisiesto');
});

test('resumen: suma por semana (desde el lunes) y por mes; sin límites configurados quedan en null', () => {
  const e = makeEnv(base);
  const cuentas = new Map([
    ['RINDE_FACIL_OCR_COUNT_2026-09-30', '50'], /* mes anterior: no cuenta */
    ['RINDE_FACIL_OCR_COUNT_2026-10-01', '4'],
    ['RINDE_FACIL_OCR_COUNT_2026-10-11', '7'], /* domingo anterior: cuenta en el mes, no en la semana */
    ['RINDE_FACIL_OCR_COUNT_2026-10-12', '3'],
    ['RINDE_FACIL_OCR_COUNT_2026-10-14', '2'],
    ['RINDE_FACIL_OCR_COUNT_2026-10-15', '99'] /* futuro: no cuenta */
  ]);
  const leer = (k) => (cuentas.has(k) ? cuentas.get(k) : null);
  const r = e.ctx.rfResumenLecturas_(leer, '2026-10-14');
  assert.equal(r.diario.usadas, 2);
  assert.equal(r.diario.limite, 100, 'el diario por defecto es 100 páginas');
  assert.equal(r.diario.restan, 98);
  assert.equal(r.semanal.desde, '2026-10-12');
  assert.equal(r.semanal.usadas, 3 + 2);
  assert.equal(r.mensual.desde, '2026-10-01');
  assert.equal(r.mensual.usadas, 4 + 7 + 3 + 2);
  assert.equal(r.semanal.limite, null, 'sin límite semanal configurado');
  assert.equal(r.mensual.limite, null, 'sin límite mensual configurado');
  assert.equal(r.semanal.restan, null);
  assert.equal(r.referenciaGratisMes, 1000);
});

test('resumen: los límites configurados se informan; valores no válidos cuentan como sin límite', () => {
  const e = makeEnv(base);
  const props = { RINDE_FACIL_OCR_DAILY_LIMIT: '10', RINDE_FACIL_OCR_WEEKLY_LIMIT: '8', RINDE_FACIL_OCR_MONTHLY_LIMIT: '30' };
  const cuentas = new Map([['RINDE_FACIL_OCR_COUNT_2026-10-12', '5'], ['RINDE_FACIL_OCR_COUNT_2026-10-14', '2']]);
  const leer = (k) => (k in props ? props[k] : (cuentas.has(k) ? cuentas.get(k) : null));
  const r = e.ctx.rfResumenLecturas_(leer, '2026-10-14');
  assert.equal(r.diario.limite, 10);
  assert.equal(r.semanal.limite, 8);
  assert.equal(r.semanal.usadas, 7);
  assert.equal(r.semanal.restan, 1);
  assert.equal(r.mensual.limite, 30);
  assert.equal(r.mensual.restan, 23);
  const basura = { RINDE_FACIL_OCR_DAILY_LIMIT: 'abc', RINDE_FACIL_OCR_WEEKLY_LIMIT: '0', RINDE_FACIL_OCR_MONTHLY_LIMIT: '-5' };
  const r2 = e.ctx.rfResumenLecturas_((k) => (k in basura ? basura[k] : null), '2026-10-14');
  assert.equal(r2.diario.limite, 100, 'un diario no numérico vuelve al valor por defecto');
  assert.equal(r2.semanal.limite, null);
  assert.equal(r2.mensual.limite, null);
});

test('cuota: informa lo leído hoy, esta semana y este mes; exige sesión', () => {
  const e = makeEnv(base);
  enHoy(e, '2026-10-14');
  e.P.set('RINDE_FACIL_OCR_COUNT_2026-10-13', '2');
  assert.equal(e.call({ action: 'cuota' }).error, 'SESION_INVALIDA', 'sin sesión no se informa nada');
  const c0 = e.call({ action: 'cuota', t: e.t });
  assert.equal(c0.ok, true);
  assert.equal(c0.diario.usadas, 0);
  assert.equal(c0.diario.limite, 100);
  assert.equal(c0.semanal.usadas, 2);
  assert.equal(c0.semanal.limite, null);
  assert.equal(c0.mensual.usadas, 2);
  assert.equal(lectura(e).ok, true);
  const c1 = e.call({ action: 'cuota', t: e.t });
  assert.equal(c1.diario.usadas, 1);
  assert.equal(c1.diario.restan, 99);
  assert.equal(c1.semanal.usadas, 3);
  assert.equal(c1.mensual.usadas, 3);
});

test('límite diario: se corta con LIMITE_DIARIO, lo informa y el intento extra no llega a Google', () => {
  const e = makeEnv(Object.assign({ RINDE_FACIL_OCR_DAILY_LIMIT: '2' }, base));
  enHoy(e, '2026-10-14');
  assert.equal(lectura(e).ok, true);
  assert.equal(lectura(e).ok, true);
  const r = lectura(e);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'LIMITE_DIARIO');
  assert.equal(r.limit, 2);
  assert.equal(r.used, 2);
  assert.equal(e.ctx.__vision.length, 2, 'el tercer intento no se envía a Google');
  const c = e.call({ action: 'cuota', t: e.t });
  assert.equal(c.diario.usadas, 2);
  assert.equal(c.diario.restan, 0);
});

test('límite semanal: solo si se configura; cuenta desde el lunes y corta con LIMITE_SEMANAL', () => {
  const e = makeEnv(Object.assign({ RINDE_FACIL_OCR_DAILY_LIMIT: '50', RINDE_FACIL_OCR_WEEKLY_LIMIT: '3' }, base));
  enHoy(e, '2026-10-14');
  e.P.set('RINDE_FACIL_OCR_COUNT_2026-10-11', '9'); /* domingo anterior: no cuenta para esta semana */
  e.P.set('RINDE_FACIL_OCR_COUNT_2026-10-12', '2'); /* lunes: sí cuenta */
  assert.equal(lectura(e).ok, true, 'semana: 2 → 3');
  const r = lectura(e);
  assert.equal(r.error, 'LIMITE_SEMANAL');
  assert.equal(r.limit, 3);
  assert.equal(r.used, 3);
  const c = e.call({ action: 'cuota', t: e.t });
  assert.equal(c.semanal.limite, 3);
  assert.equal(c.semanal.restan, 0);
  assert.equal(c.diario.usadas, 1);
});

test('límite mensual: solo si se configura; corta con LIMITE_MENSUAL', () => {
  const e = makeEnv(Object.assign({ RINDE_FACIL_OCR_DAILY_LIMIT: '50', RINDE_FACIL_OCR_MONTHLY_LIMIT: '6' }, base));
  enHoy(e, '2026-10-14');
  e.P.set('RINDE_FACIL_OCR_COUNT_2026-10-01', '5');
  assert.equal(lectura(e).ok, true, 'mes: 5 → 6');
  const r = lectura(e);
  assert.equal(r.error, 'LIMITE_MENSUAL');
  assert.equal(r.limit, 6);
  assert.equal(e.call({ action: 'cuota', t: e.t }).mensual.restan, 0);
});
