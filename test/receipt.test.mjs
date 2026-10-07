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
test('la copia de datos no lleva claves, no pisa la conexión del dispositivo y descarta claves de copias viejas', () => {
  RF.store.reset();
  RF.store.update(s => { s.cloud.apiUrl = 'https://script.google.com/macros/s/X/exec'; s.projects.push(RF.store.newProject('P')); });
  const copia = RF.store.exportJSON();
  assert.ok(!/"key"/.test(JSON.stringify(JSON.parse(copia).cloud)), 'la copia no tiene campo de clave');
  const vieja = JSON.parse(copia); vieja.cloud.key = 'clave-secreta'; vieja.cloud.apiUrl = 'https://otro.example/exec';
  RF.store.importJSON(JSON.stringify(vieja));
  assert.equal(RF.store.get().cloud.key, undefined, 'una clave que venga en una copia vieja no se conserva');
  assert.equal(RF.store.get().cloud.apiUrl, 'https://script.google.com/macros/s/X/exec', 'la conexión del dispositivo no se pisa');
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
  assert.equal(r.fields.folio, '000009'); assert.match(r.notes.join(' '), /no trae número de boleta del SII/); assert.equal(r.fields.nombreComercial, 'RESTAURANTE EL LUGAR');
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
test('la copia lleva solo un extracto del texto del OCR y no toca el original', () => {
  RF.store.reset();
  const largo = 'LINEA DEL COMPROBANTE 123456\n'.repeat(200);
  RF.store.update(s => { const p = RF.store.newProject('P'); p.expenses.push({ id: 'g1', ocr: { raw: largo, engine: 'cloud_vision' } }); s.projects.push(p); });
  const copia = JSON.parse(RF.store.exportJSON()).projects[0].expenses[0].ocr;
  assert.equal(copia.raw.length, 2000); assert.equal(copia.cortado, true);
  assert.equal(RF.store.get().projects[0].expenses[0].ocr.raw.length, largo.length, 'en el equipo queda completo');
});

test('voucher de tarjeta: el nombre del local es el que va antes del RUT, no el ruido que el OCR deja después («A3 BTASS»)', () => {
  const live = ['Jengib shetallid 6.J', '>sdans', 'TRANSBANK', 'eb', '6X09 VENTA Y COPTA CLIENTE', '76) TARJETA DE PREPAGO', 'LA QUESERIA', 'ABASTECEDORA DE ALIMENTOS JOSE CARRENO O', 'HUGO BRAVO 574 SN', 'SANTIAGO', 'RUT: 76.571.338-2', '597032013937 F3V68963 125.3A0', 'VALIDO COMO BOLETA', 'A3 BTASS', '12/09/2026', '17:36:28', 'DEBIT MASTERCARD', 'MONTO VENTA:', 'IVA:', 'TOTAL:', 'A0000000041010', '*7127 C-DB', '$6.210', 'Anders', 'MONEDA:', 'inul obnalog13', 'OPERACION: 166505', '$1.180', '$7.390', 'PESO', 'AUTORIZACION: 029323', '900%'].join('\n');
  const out = RF.ocr.toExpenseFields(live, 'cloud_vision', {});
  assert.equal(out.fields.proveedor, 'ABASTECEDORA DE ALIMENTOS JOSE CARRENO O');
  assert.equal(out.fields.total, 7390);
});

test('factura de combustible: los otros impuestos van aparte y el total cuadra (antes daba un error de aritmética falso)', () => {
  const r = ex(`RUT: 77215640-5
FACTURA ELECTRONICA
NRO. 23581519
R.Social: ADMINISTRADORA DE VENTAS AL DETAL LE LTDA
GIRO : VENTA DE COMBUSTIBLES
Fecha Emision: 03-06-2026
Monto Neto $78.650
IVA 19% $14.944
Impuesto Especifico $7.146
Impuesto Especifico $1.261
Total $102.001`);
  assert.equal(r.fields.total, 102001); assert.equal(r.fields.otrosImpuestos, 8407);
  const e = { docType: 'factura', total: 102001, neto: 78650, iva: 14944, otrosImpuestos: r.fields.otrosImpuestos, montoRendir: 102001, cuenta: 'operacion', has: {} };
  const out = RF.logic.evaluateExpense(e, { expenses: [e], start: '2026-01-01', end: '2027-01-01' }, {}, [e]);
  assert.ok(!out.issues.some(i => i.id === 'aritmetica'), 'sin error de aritmética: ' + out.issues.map(i => i.id));
});

test('respaldos que se subieron como si fueran gastos: cartola, cheque, F29, informe del SII, transferencia y contrato se reconocen; una factura con anexos pegados sigue siendo una factura', () => {
  const k = t => { const c = RF.receipt.classify(t); return c && c.kind + '/' + c.key; };
  assert.equal(k('Scotiabank®\nCliente\nFecha Consulta\nDesde\nSaldo Anterior\nCargos/Giros\nCOMUNIDAD EJEMPLO'), 'cartola/pago');
  assert.equal(k('Sii\nServicio de\nImpuestos\nInternos\nDECLARACIÓN MENSUAL Y PAGO\nSIMULTÁNEO DE IMPUESTOS\nFORMULARIO 29'), 'f29/f29');
  assert.equal(k('13/8/26, 11:40\nRut: 11111111-1\nSii\nINFORME MENSUAL DE BOLETAS RECIBIDAS'), 'informe_sii/informe_sii');
  assert.equal(k('Serie CHEQUE\n642B\n$12.458.504\nComunidad Ejemplo\nPAGUESE A\nLA ORDEN DE'), 'cheque/pago');
  assert.equal(k('COMPROBANTE DE TRANSFERENCIA\nMonto $249.900\nEstado EXITOSA'), 'transferencia/pago');
  assert.equal(k('CONTRATO DE PRESTACIÓN DE SERVICIOS\nPRIMERO: Antecedentes\nLas partes acuerdan'), 'contrato/null');
  assert.equal(k('UNCA\nDE\nMACHUC\nNOTARIO\nGISELA\nPUBLICO\nQUINTA\nNOTARIA\nCALAMA\nCONTRAPARTE RUT 76.726.478-K'), 'contrato/null', 'hoja notarial del contrato');
  assert.equal(k('R.U.T.: 76.726.478-K\nFACTURA ELECTRONICA\nN° 167\nINVERSIONES ARAYA MOYA LIMITADA\n\nFORMULARIO 29\nSaldo anterior Cargos'), null, 'una factura no se confunde con sus anexos');
  assert.equal(k('JUANA TINTE\nBOLETA DE HONORARIOS\nELECTRONICA\nN°69'), null);
  assert.equal(k('TRANSBANK\nVENTA\nRUT: 76.571.338-2\nVALIDO COMO BOLETA\nTOTAL $7.390'), null);
});
