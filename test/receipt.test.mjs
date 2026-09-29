/* Prueba el extractor de comprobantes con textos inventados que reproducen los formatos difíciles reales
 * (etiquetas desordenadas por el OCR, «TOTAL IVA», años de dos cifras, IVA incluido, honorarios, combustibles). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp();
const ex = (t, o) => RF.receipt.extract(t, o);

test('supermercado: «TOTAL IVA» no es el total, año de dos cifras y fecha de puntos ignorada', () => {
  const r = ex(`RUT 76.123.456-0
BOLETA ELECTRONICA N 1234567
SII SANTIAGO PONIENTE
SUPERMERCADO EJEMPLO S.A.
7802000003219 CEREALES 5.950
SUB TOTAL $ 11.900
NETO $
10.000
TOTAL IVA 19,00% $
1.900
TOTAL $
11.900
T. DEBITO $ 11.900
Nombre: PERSONA DE PRUEBA
SALDO DE PUNTOS AL 01-08-2026 : 100
FECHA HORA LOCAL CA TRX ID
15/08/26 16:25 1503 01 3701 20`);
  assert.deepEqual([r.fields.neto, r.fields.iva, r.fields.total], [10000, 1900, 11900]);
  assert.equal(r.fields.fecha, '2026-08-15'); assert.equal(r.fields.folio, '1234567'); assert.equal(r.fields.docType, 'boleta');
  assert.equal(r.fields.rutProveedor, '76.123.456-0'); assert.equal(r.level, 'consistente');
});
test('etiquetas separadas de las cifras y IVA incluido: el neto se calcula', () => {
  const r = ex(`GETNET
COMPRA AFECTA
VALIDO COMO BOLETA
Rut: 76.123.456-0
12/08/2026 16:01:48 AID:A0000000041010
Monto : $ 11.900
Total : $ 11.900
Iva incluido en este pago: $ 1.900`);
  assert.deepEqual([r.fields.neto, r.fields.iva, r.fields.total], [10000, 1900, 11900]);
  assert.equal(r.fields.docType, 'voucher'); assert.equal(r.fields.folio, undefined, 'no inventa un N° de boleta');
  assert.match(r.notes.join(' '), /IVA incluido/);
});
test('factura: toma el RUT del emisor aunque el cliente aparezca antes, y fecha con nombre de mes', () => {
  const r = ex(`SEÑOR(ES): COMUNIDAD DE PRUEBA
R.U.T.: 11.111.111-1
R.U.T.: 76.123.456-0
FACTURA ELECTRONICA
Nº36
Fecha Emision: 23 de Septiembre del 2026
MONTO NETO $ 25.000
I.V.A. 19% $ 4.750
TOTAL $ 29.750`, { communityRut: '11.111.111-1' });
  assert.equal(r.fields.rutProveedor, '76.123.456-0'); assert.equal(r.fields.folio, '36'); assert.equal(r.fields.fecha, '2026-09-23');
  assert.deepEqual([r.fields.neto, r.fields.iva, r.fields.total], [25000, 4750, 29750]); assert.equal(r.fields.docType, 'factura');
});
test('combustibles: el total incluye impuestos específicos', () => {
  const r = ex(`RUT: 76.123.456-0
FACTURA ELECTRONICA
NRO. 23581519
FECHA EMISION : 2026-06-03
SUBTOTAL NETO $ 10.000
IVA (19%) $ 1.900
IEF $ 700
IEV/FEPP $ 100
TOTAL $ 12.700`);
  assert.deepEqual([r.fields.neto, r.fields.iva, r.fields.total], [10000, 1900, 12700]);
  assert.equal(r.fields.folio, '23581519'); assert.equal(r.fields.fecha, '2026-06-03');
  assert.match(r.notes.join(' '), /otros impuestos/);
});
test('boleta de honorarios: bruto, retención y líquido', () => {
  const r = ex(`RUT: 12.345.678-5
BOLETA DE HONORARIOS ELECTRONICA
N ° 12
Fecha: 05 de Enero de 2026
Total Honorarios: $ 100.000
15.25 % Impto. Retenido: 15.250
Total: 84.750`);
  assert.equal(r.fields.docType, 'honorarios'); assert.equal(r.fields.total, 100000); assert.equal(r.fields.folio, '12');
  assert.equal(r.fields.fecha, '2026-01-05'); assert.match(r.notes.join(' '), /líquido/);
});
test('si las cifras no cuadran no se inventa nada y queda para revisar', () => {
  const r = ex(`RUT 76.123.456-0
BOLETA ELECTRONICA N 55
Neto 10.000
IVA 1.900
Total 12.900
Fecha 10-08-2026`);
  assert.equal(r.level, 'revisar'); assert.equal(r.fields.neto, undefined); assert.equal(r.fields.iva, undefined);
  assert.match(r.notes.join(' '), /no se pudieron cuadrar/);
});
test('texto sin datos: no devuelve valores y avisa', () => {
  const r = ex('hola mundo\nsin nada útil');
  assert.equal(r.level, 'revisar'); assert.deepEqual(Object.keys(r.fields), []);
  assert.ok(r.notes.length >= 3);
});
test('la copia de datos no lleva la clave de acceso y no pisa la conexión del dispositivo', () => {
  RF.store.reset();
  RF.store.update(s => { s.cloud.apiUrl = 'https://script.google.com/macros/s/X/exec'; s.cloud.key = 'clave-secreta'; s.projects.push(RF.store.newProject('P')); });
  const copia = RF.store.exportJSON();
  assert.ok(!copia.includes('clave-secreta'));
  RF.store.importJSON(copia);
  assert.equal(RF.store.get().cloud.key, 'clave-secreta', 'la clave local se conserva al importar');
  assert.equal(RF.store.get().projects[0].name, 'P');
});

test('voucher válido como boleta: nombre del proveedor, forma de pago y N° de comprobante (no hay N° de boleta)', () => {
  const r = ex(`GETNET
COMPRA AFECTA
VALIDO COMO BOLETA
Rut: 76.123.456-0
EMPRESA DE EJEMPLO LIMITADA
RESTAURANTE EL LUGAR
Pasaje AV LONGITUDINAL 5045 LC 3
12/09/2026 16:01:48 AID:A0000000041010
Tarjeta : *7122 Mastercard Prepago
Monto : $ 19.990
Total : $ 19.990
Iva incluido en este pago: $ 3.192
Aprobación: 956505 Comprobante: 000009`);
  assert.equal(r.fields.proveedor, 'EMPRESA DE EJEMPLO LIMITADA'); assert.equal(r.fields.docType, 'voucher'); assert.equal(r.fields.formaPago, 'prepago');
  assert.equal(r.fields.folio, '000009'); assert.match(r.notes.join(' '), /no trae número de boleta del SII/);
  assert.equal(JSON.stringify([r.fields.neto, r.fields.iva, r.fields.total]), JSON.stringify([16798, 3192, 19990]));
});
test('una factura con «Forma de pago: Crédito» no se toma por tarjeta; con «Medio de pago: tarjeta de débito» sí', () => {
  const base = t => ex(`RUT: 76.123.456-0
FACTURA ELECTRONICA
Nº10
Fecha Emision: 3 de Marzo del 2026
` + t + `
MONTO NETO $ 10.000
I.V.A. 19% $ 1.900
TOTAL $ 11.900`).fields.formaPago;
  assert.equal(base('Forma de Pago:Crédito'), undefined);
  assert.equal(base('MEDIO DE PAGO : TARJETA DE DEBITO'), 'debito');
});
test('las formas de pago incluyen débito y prepago, y un voucher sin número solo avisa', () => {
  const ids = RF.data.FORMAS_PAGO.map(f => f.id);
  assert.ok(ids.includes('debito') && ids.includes('prepago') && ids.includes('tarjeta'));
  const e = { id: 'x', cuenta: 'operacion', docType: 'voucher', folio: '', fecha: '2026-09-12', rutProveedor: '76.123.456-0', proveedor: 'X', total: 19990, glosa: 'Prueba', formaPago: 'debito' };
  const res = RF.logic.evaluateExpense(e, RF.store.newProject('P'), RF.store.get().community, []);
  assert.equal(res.issues.find(i => i.id === 'sin_folio').level, 'warn');
  const bol = RF.logic.evaluateExpense(Object.assign({}, e, { docType: 'boleta' }), RF.store.newProject('P'), RF.store.get().community, []);
  assert.equal(bol.issues.find(i => i.id === 'sin_folio').level, 'error');
});
