/* Validación de RUT (js/01-util.js, rutValid): no limpia en silencio, no acepta cuerpos de solo ceros ni fuera del rango provisional,
   y comprueba el dígito verificador. Es el ajuste previo que pidió el director para SMI-RF-04 (plan v2). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp();
const U = RF.util;

/* un RUT completo para un cuerpo dado, con el dígito verificador que calcula la app (módulo 11) */
const rutCon = (cuerpo, dv) => String(cuerpo) + '-' + (dv || U.rutDv(String(cuerpo)));

test('acepta RUT bien escritos: con o sin puntos y guion, con espacios, y con K en mayúscula o minúscula', () => {
  assert.ok(U.rutValid('76.123.456-0'));
  assert.ok(U.rutValid('76123456-0'));
  assert.ok(U.rutValid('761234560'));
  assert.ok(U.rutValid('76 123 456 0'));
  const cuerpoConK = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012].find(c => U.rutDv(String(c)) === 'K');
  assert.ok(cuerpoConK, 'hay un cuerpo cuyo dígito verificador es K');
  assert.ok(U.rutValid(rutCon(cuerpoConK, 'K')));
  assert.ok(U.rutValid(rutCon(cuerpoConK, 'k')));
});

test('no limpia en silencio: letras, símbolos o texto alrededor invalidan el RUT', () => {
  for (const malo of ['RUT 12.345.678-5', '12.345.678-5 x', '12a345678-5', '12/345/678-5', '12.345.678-5.', 'R12345678-5', '12.345.678–5']) {
    assert.equal(U.rutValid(malo), false, malo);
  }
});

test('rechaza un cuerpo de solo ceros y cuerpos fuera de 1.000 a 99.999.999', () => {
  for (const malo of ['00000-0', '0000000-0', '0-0', '999-K', '100000000-0']) {
    assert.equal(U.rutValid(malo), false, malo);
  }
});

test('el dígito verificador debe cuadrar; un valor vacío o nulo no es RUT', () => {
  assert.equal(U.rutValid('12.345.678-9'), false);
  assert.equal(U.rutValid(rutCon(12345678, '0')), false, 'un dígito verificador equivocado');
  assert.equal(U.rutValid(''), false);
  assert.equal(U.rutValid(null), false);
  assert.equal(U.rutValid(undefined), false);
});

test('rutFormat sigue dando el formato de siempre a un RUT correcto (es solo visual)', () => {
  assert.equal(U.rutFormat('123456785'), '12.345.678-5');
});
