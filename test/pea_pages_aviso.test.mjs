/* Avisos por página del PDF escaneado (RF.pea.extractFromOcr): en qué páginas están la carta Gantt y las tablas 2 a 4 del presupuesto.
 * Textos SINTÉTICOS: no contienen datos de ninguna comunidad. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(here, '..', 'js');
const ctx = { TextDecoder, DataView, Uint8Array, console, Promise };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(jsDir, '23-read-docx.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(jsDir, '24-pea-extract.js'), 'utf8'), ctx);
const P = ctx.RF.pea;

/* lectura por página como la entrega RF.pdfPages.aggregate: [{ number, text }] */
function paginas(textos) {
  return Object.keys(textos).map(Number).sort((a, b) => a - b).map(n => ({ number: n, text: textos[n] }));
}

/* disposición inventada: carta Gantt en las páginas 4 y 5, consolidado en la 6, tablas de detalle en la 7, la 9 y la 12 */
const ESCANEADO = paginas({
  1: 'Antecedentes generales del PEA\nNombre de la comunidad: Comunidad de prueba',
  4: '2. Carta Gantt\nEtapa 1\n1.1 Actividad de prueba\nX',
  5: '1.2 Actividad de prueba\nX',
  6: 'Ítem\nTabla 1\nCONSOLIDADO DE COSTOS DEL PROYECTO\na) Cuenta de Recursos Humanos\n$1.000.000.-',
  7: 'Tabla 2 Cuenta de Recursos Humanos\nPersonal o servicio a contratar',
  9: 'Tabla 3 Cuenta Gastos de Inversión\nÍtem',
  12: 'Tabla 4 Cuenta Gastos operacionales\nÍtem'
});

test('escaneado: avisa en qué páginas están la carta Gantt y las tablas 2 a 4 del presupuesto', () => {
  const avisos = P.extractFromOcr({ raw_text: 'texto de prueba', pageTexts: ESCANEADO }).warnings.join('\n');
  assert.match(avisos, /Carta Gantt: páginas 4 a 5 del PDF\./);
  assert.match(avisos, /Detalle del presupuesto: tabla 2 en la página 7; tabla 3 en la página 9; tabla 4 en la página 12 del PDF\./);
});

test('carta Gantt sin consolidado después: dice que puede seguir en las páginas siguientes', () => {
  const avisos = P.extractFromOcr({ raw_text: 'x', pageTexts: paginas({ 3: 'CARTA GANTT', 4: 'Actividad de prueba' }) }).warnings.join('\n');
  assert.match(avisos, /Carta Gantt: empieza en la página 3 del PDF y puede seguir en las páginas siguientes\./);
});

test('sin lectura por página no hay avisos de página; la lectura de texto sigue igual', () => {
  const r = P.extractFromOcr({ raw_text: '2. Carta Gantt\nTabla 2' });
  assert.equal(r.warnings.some(w => /en la página|páginas \d+ a \d+/.test(w)), false);
});

test('un PEA sin carta Gantt ni tablas de detalle no recibe avisos de página', () => {
  const r = P.extractFromOcr({ raw_text: 'x', pageTexts: paginas({ 1: 'Texto general', 2: 'Más texto de prueba' }) });
  assert.equal(r.warnings.some(w => /Carta Gantt|Detalle del presupuesto/.test(w)), false);
});

test('«tabla 2» dentro de una frase no cuenta como tabla de detalle', () => {
  const r = P.extractFromOcr({ raw_text: 'x', pageTexts: paginas({ 1: 'Según se indica en la tabla 2 del Manual, el monto es referencial.' }) });
  assert.equal(r.warnings.some(w => /Detalle del presupuesto/.test(w)), false);
});
