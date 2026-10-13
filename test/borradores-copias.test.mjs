/* Los borradores de pantalla son de este equipo: no viajan a las copias de Drive y una copia que llega no los borra. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp(['00-service-trust.js', '01-util.js', '02-store.js', '03-crypto.js', '04-vault.js', '05-auth.js', '33-cloud.js', '36-drive.js']);
const BORRADOR = { calendario: { 'titulo|INPUT|text#1': 'Reunión con la mesa' } };

function ponerBorradores(valor) {
  RF.store.update(function (s) { s.ui = s.ui || {}; s.ui.borradores = valor; }, { silent: true });
}

test('la copia que se sube a Drive no lleva los borradores de las pantallas', () => {
  ponerBorradores(BORRADOR);
  const copia = JSON.parse(RF.store.exportJSON());
  assert.equal(copia.ui && copia.ui.borradores, undefined);
});

test('al cargar una copia, este equipo conserva sus propios borradores', () => {
  ponerBorradores(BORRADOR);
  const copia = JSON.parse(RF.store.exportJSON());
  ponerBorradores(BORRADOR);
  RF.store.importJSON(JSON.stringify(copia));
  assert.deepEqual(RF.store.get().ui.borradores, BORRADOR);
});
