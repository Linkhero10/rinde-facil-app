/* Regresión de filas del formato anterior. Solo datos sintéticos y servicio simulado, sin red. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarCapaCon, esperar, buscar, buscarClase } from './comentarios-entorno.mjs';

const PANTALLAS = [
  ['#/', 'Mi ruta', { name: 'home' }],
  ['#/h/pea', 'Subir el PEA', { name: 'tool', id: 'pea' }],
  ['#/f/inicio', 'Fase 1: Inicio', { name: 'fase', id: 'inicio' }],
  ['#/t/informe', 'Informe', { name: 'tramite', id: 'informe' }]
];
const LEGADO = { pantalla: '', tipo: '', estado: '', comentario: 'Registro sintético' };

function entorno(filas) {
  const e = cargarCapaCon({ fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ comentarios: filas }) }) });
  e.ctx.RF = {
    app: { route: dir => PANTALLAS.find(p => p[0] === dir.split('?')[0])[2] },
    tools: { pea: { title: 'Subir el PEA' } },
    data: { FASES: [{ id: 'inicio', n: 1, name: 'Inicio' }] },
    tramites: { byId: { informe: { title: 'Informe' } } }
  };
  return e;
}

async function verPantalla(e, hash, cantidad) {
  e.ctx.location.hash = hash;
  e.disparar('hashchange');
  await esperar();
  e.clic(e.doc.body.children[0].children[0]);
  const contador = buscar(e.doc.body, n => String(n.textContent || '').startsWith('Ver comentarios'));
  assert.equal(contador.textContent, 'Ver comentarios (' + cantidad + ')', hash);
  e.clic(contador);
  await esperar();
  const panel = buscarClase(e.doc.body, 'rf-com-panel');
  const items = panel.children.filter(n => String(n.className).split(' ').includes('rf-com-item'));
  assert.equal(items.length, cantidad, hash);
  return items;
}

test('una fila legado con pantalla y tipo vacíos se ve como general en todas las pantallas', async () => {
  const e = entorno([{ ...LEGADO }]);
  for (const [hash] of PANTALLAS) {
    const [item] = await verPantalla(e, hash, 1);
    assert.equal(buscarClase(item, 'rf-com-chip').textContent, 'Toda la pantalla');
    e.clic(item);
    const vista = buscarClase(e.doc.body, 'rf-com-vista');
    assert.equal(buscarClase(vista, 'rf-com-chip').textContent, 'Toda la pantalla');
    assert.equal(buscarClase(vista, 'rf-com-estado'), null);
  }
});

test('una fila del formato anterior sin las propiedades pantalla y tipo también se ve en todas las pantallas', async () => {
  const e = entorno([{ comentario: LEGADO.comentario }]);
  for (const [hash] of PANTALLAS) await verPantalla(e, hash, 1);
});

test('pantalla con solo espacios y tipo vacío se trata como legado: se ve como general en todas las pantallas', async () => {
  const e = entorno([{ ...LEGADO, pantalla: ' ', tipo: '', comentario: 'Registro con pantalla en blanco' }]);
  for (const [hash] of PANTALLAS) {
    const [item] = await verPantalla(e, hash, 1);
    assert.equal(buscarClase(item, 'rf-com-chip').textContent, 'Toda la pantalla');
  }
});

test('pantalla vacía y tipo con solo espacios se trata como legado: se ve como general en todas las pantallas', async () => {
  const e = entorno([{ ...LEGADO, pantalla: '', tipo: ' ', comentario: 'Registro con tipo en blanco' }]);
  for (const [hash] of PANTALLAS) {
    const [item] = await verPantalla(e, hash, 1);
    assert.equal(buscarClase(item, 'rf-com-chip').textContent, 'Toda la pantalla');
  }
});

test('las filas con pantalla y tipo válidos conservan su alcance y etiqueta', async () => {
  const etiquetas = { pestana: 'Esta pestaña', texto: 'Texto', elemento: 'Caja', general: 'Toda la pantalla' };
  for (const [hash, pantalla] of PANTALLAS) {
    for (const tipo of Object.keys(etiquetas)) {
      for (const destino of [pantalla, hash]) {
        const e = entorno([{ ...LEGADO, pantalla: destino, tipo }]);
        for (const [actual] of PANTALLAS) {
          const items = await verPantalla(e, actual, actual === hash ? 1 : 0);
          if (items.length) assert.equal(buscarClase(items[0], 'rf-com-chip').textContent, etiquetas[tipo]);
        }
        await verPantalla(e, hash + '?from=prueba', tipo === 'general' && destino === hash ? 0 : 1);
      }
    }
  }
});

test('la excepción legado exige que falten tanto pantalla como tipo', async () => {
  const e = entorno([
    { ...LEGADO, pantalla: 'Mi ruta' },
    { ...LEGADO, tipo: 'pestana' },
    { ...LEGADO, tipo: 'general' }
  ]);
  for (const [hash] of PANTALLAS) await verPantalla(e, hash, hash === '#/' ? 1 : 0);
});

test('las filas ocultas y vacías siguen sin verse, incluidas las del formato legado', async () => {
  const filas = ['', 'Mi ruta'].flatMap(pantalla => ['oculto', ' Oculto '].map(estado => ({
    ...LEGADO, pantalla, tipo: pantalla ? 'pestana' : '', estado
  })));
  const e = entorno([...filas, { ...LEGADO, comentario: '' }, { ...LEGADO, comentario: '   ' }]);
  for (const [hash] of PANTALLAS) await verPantalla(e, hash, 0);
  assert.equal(e.rc.comentarios().length, 0);
});
