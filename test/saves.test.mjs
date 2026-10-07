/* La lista «Últimos archivos guardados» muestra tipo, nombre legible, lugar y una sola fecha. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp(['00-service-trust.js', '01-util.js', '02-store.js', '03-crypto.js', '04-vault.js', '05-auth.js', '33-cloud.js', '36-drive.js'].filter(() => true));

test('una boleta y su ficha se muestran como una sola línea, sin folio ni extensión', () => {
  const list = [
    { name: 'SANCAN_PRODUCCIONES_SPA-30494.datos (20261006-192343).txt', where: 'Prueba de funcionamiento / 4 Comprobantes / 2026-09', at: '2026-10-06T19:23:45', folderUrl: 'https://drive.google.com/drive/folders/x' },
    { name: 'SANCAN_PRODUCCIONES_SPA-30494.datos.txt', where: 'Prueba de funcionamiento / 4 Comprobantes / 2026-09', at: '2026-10-06T19:23:42' },
    { name: 'SANCAN_PRODUCCIONES_SPA-30494.jpg', where: 'Prueba de funcionamiento / 4 Comprobantes / 2026-09', at: '2026-10-06T19:23:37', url: 'https://drive.google.com/file/d/1/view', folderUrl: 'https://drive.google.com/drive/folders/x' }
  ];
  const out = RF.drive.friendlySaves(list);
  assert.equal(out.length, 1);
  assert.equal(out[0].tipo, 'Comprobante');
  assert.equal(out[0].titulo, 'SANCAN PRODUCCIONES SPA');
  assert.equal(out[0].lugar, 'septiembre 2026');
  assert.match(out[0].fecha, /2026/);
  assert.ok(!/Comprobantes|^4/.test(out[0].lugar), 'sin el número de carpeta');
});

test('de las carpetas listas solo queda la última; copia de seguridad y Carta Gantt tienen su nombre', () => {
  const out = RF.drive.friendlySaves([
    { name: 'Carpeta «Rinde fácil» lista', where: 'Proyectos / Prueba', at: '2026-10-06T19:29:00' },
    { name: 'Carpeta «Rinde fácil» lista', where: 'Proyectos / Prueba', at: '2026-10-06T19:18:35' },
    { name: 'Carta-Gantt-2026-10-06.xlsx', where: 'Prueba / 1 Planificación', at: '2026-10-06T18:00:00' }
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].tipo, 'Carpeta');
  assert.equal(out[0].lugar, 'Proyecto: Prueba');
  assert.equal(out[1].tipo, 'Carta Gantt');
});

test('un respaldo adjunto se muestra con su nombre y a qué documento pertenece', () => {
  const out = RF.drive.friendlySaves([{ name: 'COMERCIAL_LOS_ANDES-9912-respaldo-Comprobante_de_pago.jpg', where: 'Prueba / 4 Comprobantes / 2026-09', at: '2026-10-07T06:53:00' }]);
  assert.equal(out[0].tipo, 'Respaldo');
  assert.match(out[0].titulo, /Comprobante de pago · COMERCIAL LOS ANDES/);
});
