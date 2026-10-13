/* Lecturas ya hechas (RF.ocr en js/33-cloud.js): un mismo archivo no se vuelve a cobrar aunque cambie de nombre, las lecturas
   fallidas no se guardan, nada se guarda en claro con la bóveda cerrada y los límites ya no muestran la semana ni la hora de Chile. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

/* IndexedDB mínima en memoria, con la misma forma que usa js/33-cloud.js */
function memoriaIndexedDB() {
  const datos = new Map();
  return {
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore() {},
          transaction() {
            const tx = { oncomplete: null, onerror: null, error: null };
            const operar = run => {
              const r = {};
              queueMicrotask(() => {
                r.result = run();
                if (r.onsuccess) r.onsuccess();
                if (tx.oncomplete) tx.oncomplete();
              });
              return r;
            };
            tx.objectStore = () => ({
              put: (valor, clave) => operar(() => { datos.set(clave, valor); return clave; }),
              get: clave => operar(() => datos.get(clave)),
              delete: clave => operar(() => datos.delete(clave))
            });
            return tx;
          }
        };
        if (req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    }
  };
}

/* un archivo como el que entrega el navegador: contenido, nombre, tipo y fecha de modificación */
function archivo(contenido, nombre, tipo = '') {
  return Object.assign(new Blob([contenido], { type: tipo }), { name: nombre, lastModified: 1760000000000 });
}

function preparar() {
  const RF = loadApp();
  const ctx = loadApp.lastCtx;
  ctx.indexedDB = memoriaIndexedDB();
  const boveda = { abierta: true };
  RF.vault = {
    isOpen: () => boveda.abierta,
    encryptBlob: b => Promise.resolve(b),
    decryptBlob: b => Promise.resolve(b)
  };
  return { RF, ctx, boveda };
}

test('la identidad de un archivo es su contenido: el mismo PDF con otro nombre es el mismo documento', async () => {
  const { RF } = preparar();
  const original = await RF.ocr.identidad(archivo('contenido del PEA', 'PEA.pdf', 'application/pdf'));
  const copia = await RF.ocr.identidad(archivo('contenido del PEA', 'PEA (2).pdf', 'application/pdf'));
  const otro = await RF.ocr.identidad(archivo('otro PEA', 'PEA.pdf', 'application/pdf'));
  assert.match(original.id, /^h[0-9a-f]{64}$/);
  assert.equal(copia.id, original.id);
  assert.notEqual(otro.id, original.id);
  assert.equal(original.meta.nombre, 'PEA.pdf');
});

test('sin crypto.subtle (la app abierta sin https) la identidad se toma de nombre, tamaño y tipo', async () => {
  const { RF, ctx } = preparar();
  ctx.crypto = {};
  const pdf = archivo('contenido del PEA', 'PEA.pdf', 'application/pdf');
  const idn = await RF.ocr.identidad(pdf);
  assert.equal(idn.id, 'm|PEA.pdf|' + pdf.size + '|application/pdf');
});

test('una foto ya leída no se vuelve a cobrar; «Leer de nuevo» sí lo cobra', async () => {
  const { RF } = preparar();
  let cobros = 0;
  RF.ocr.recognize = async () => { cobros++; return { ok: true, raw_text: 'BOLETA N° 77', engine: 'cloud_vision' }; };

  const primera = await RF.ocr.recognizeCached(archivo('foto del comprobante', 'IMG_1.jpg', 'image/jpeg'));
  assert.equal(cobros, 1);
  assert.equal(primera.desdeCache, undefined);

  const copia = await RF.ocr.recognizeCached(archivo('foto del comprobante', 'copia.jpg', 'image/jpeg'));
  assert.equal(cobros, 1, 'la misma foto con otro nombre no se cobra otra vez');
  assert.equal(copia.desdeCache, true);
  assert.equal(copia.raw_text, 'BOLETA N° 77');
  assert.equal(copia.nombreAntes, 'IMG_1.jpg', 'se avisa con qué nombre se leyó la primera vez');
  assert.ok(copia.leidoEl, 'se avisa cuándo se leyó');

  const forzada = await RF.ocr.recognizeCached(archivo('foto del comprobante', 'IMG_1.jpg', 'image/jpeg'), null, true);
  assert.equal(cobros, 2, '«Leer de nuevo» vuelve a leer y cobra');
  assert.equal(forzada.desdeCache, undefined);
});

test('una lectura fallida no se guarda, y con la bóveda cerrada no se guarda nada', async () => {
  const { RF, boveda } = preparar();
  let llamadas = 0;
  RF.ocr.recognize = async () => (++llamadas === 1 ? { ok: false, error: 'OCR_SIN_TEXTO' } : { ok: true, raw_text: 'TOTAL 1.000', engine: 'cloud_vision' });

  const foto = archivo('recibo', 'recibo.png', 'image/png');
  const fallida = await RF.ocr.recognizeCached(foto);
  assert.equal(fallida.ok, false);
  const buena = await RF.ocr.recognizeCached(foto);
  assert.equal(llamadas, 2, 'la lectura fallida no quedó guardada: se vuelve a leer');
  assert.equal(buena.ok, true);

  boveda.abierta = false;
  const sinBoveda = archivo('recibo sin bóveda', 'otro.png', 'image/png');
  await RF.ocr.recognizeCached(sinBoveda);
  boveda.abierta = true;
  const id = (await RF.ocr.identidad(sinBoveda)).id;
  assert.equal(await RF.ocr.leerGuardada(id, 'doc'), null, 'con la bóveda cerrada no se guardó nada en claro');
});

test('el registro del documento conserva la primera lectura y el nombre con el que se leyó', async () => {
  const { RF } = preparar();
  const pdf = archivo('pdf de prueba', 'PEA.pdf', 'application/pdf');
  const idn = await RF.ocr.identidad(pdf);
  await RF.ocr.anotarDocumento(idn, 31);
  const primera = await RF.ocr.documentoGuardado(idn.id);
  await RF.ocr.anotarDocumento(Object.assign({}, idn, { meta: Object.assign({}, idn.meta, { nombre: 'otro.pdf' }) }), 31);
  const despues = await RF.ocr.documentoGuardado(idn.id);
  assert.equal(despues.primera, primera.primera, 'la fecha de la primera lectura no cambia');
  assert.equal(despues.paginas, 31);
  assert.equal(despues.nombre, 'PEA.pdf');
});

test('los límites ya no muestran la semana ni la hora de Chile; el diario y el mensual sí', () => {
  const { RF } = preparar();
  const cuota = {
    diario: { usadas: 12, limite: 200, restan: 188 },
    semanal: { usadas: 40, limite: 50, restan: 10 },
    mensual: { usadas: 60, limite: null, restan: null }
  };
  /* Array.from: los arreglos que vienen de la VM son de otro realm y deepStrictEqual los rechazaría */
  const titulos = lineas => Array.from(lineas, l => l.titulo);
  const lineas = RF.ocr.lineasLimites(cuota, {});
  assert.deepEqual(titulos(lineas), ['Hoy', 'Este mes']);
  assert.doesNotMatch(Array.from(lineas, l => l.texto).join(' '), /hora de Chile|semana/i);
  assert.deepEqual(titulos(RF.ocr.lineasLimites(cuota, { paginas: 31, leidas: 13 })), ['Hoy', 'Este mes', 'Este PDF']);
  assert.equal(RF.ocr.lecturasDisponibles(cuota).n, 188, 'el límite semanal no cuenta para lo que queda');
  assert.equal(RF.ocr.mensajeLimite('LIMITE_DIARIO', 200), 'se alcanzó el límite diario de lecturas (200); se reinicia a medianoche');
});
