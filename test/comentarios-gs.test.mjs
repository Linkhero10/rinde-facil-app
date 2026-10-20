/* SOLO PARA PRUEBAS: ejecuta comentarios/Comentarios.gs REAL con la hoja, las propiedades, el candado y el correo simulados.
   No despliega nada ni escribe en ninguna hoja real. Cubre los hallazgos 4 (fórmulas), 5 (tope por hora con candado) y el duplicado
   del reenvío (columna I «id_envio» y propiedades «pendiente»/«confirmado»). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const codigo = fs.readFileSync(path.join(here, '..', 'comentarios', 'Comentarios.gs'), 'utf8');

/* la hoja se modela como una rejilla: cabecera de ocho columnas (como la de antes) y filas que se añaden */
function servicio(opciones = {}) {
  const props = new Map(Object.entries(opciones.props || {}));
  const grid = opciones.sinCabecera ? [] : [['fecha', 'pantalla', 'tipo', 'cita', 'selector', 'nombre', 'comentario', 'estado']];
  const estado = { correos: 0, fallosAppend: 0, mensajes: [] };
  const hoja = {
    appendRow: fila => {
      if (estado.fallosAppend > 0) { estado.fallosAppend--; throw new Error('fallo al escribir en la hoja'); }
      /* quitaComilla imita una hoja que no muestra la comilla inicial al leer (la entrada se interpreta como texto) */
      grid.push(fila.map(c => (opciones.quitaComilla && typeof c === 'string' && c.startsWith("'") ? c.slice(1) : c)));
    },
    getLastRow: () => grid.length,
    getDataRange: () => ({ getValues: () => grid.map(f => f.slice()) }),
    getRange: (fila, columna, filas = 1, columnas = 1) => ({
      getValue: () => ((grid[fila - 1] || [])[columna - 1] ?? ''),
      setValue: v => {
        while (grid.length < fila) grid.push([]);
        const f = grid[fila - 1];
        while (f.length < columna) f.push('');
        f[columna - 1] = v;
      },
      getValues: () => grid.slice(fila - 1, fila - 1 + filas).map(f => {
        const r = f.slice(columna - 1, columna - 1 + columnas);
        while (r.length < columnas) r.push('');
        return r;
      })
    }),
    setFrozenRows: () => {}, setName: () => {}, getSheetId: () => 1,
    getParent: () => libro
  };
  const libro = { getSheetByName: () => hoja, getSheets: () => [hoja], insertSheet: () => hoja, getUrl: () => 'https://hoja.test' };
  const ctx = {
    console, JSON, Math, Date, Number, String, Object, Array, Error, Set, RegExp,
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => libro },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => { props.set(k, String(v)); },
      deleteProperty: k => { props.delete(k); },
      getKeys: () => Array.from(props.keys())
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: (d, tz, pat) => (pat === 'yyyyMMddHH' ? d.toISOString().slice(0, 13).replace(/[-T]/g, '') : '') },
    MailApp: { sendEmail: (to, asunto, cuerpo) => { estado.correos++; estado.mensajes.push({ asunto, cuerpo }); } },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'administracion@test' }) }
  };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  const post = cuerpo => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(cuerpo) } }).content);
  return { ctx, props, estado, grid, post, get filas() { return grid.slice(1); } };
}

test('H5: un texto que empieza con = + - o @ se guarda como texto, con una comilla simple delante', () => {
  const s = servicio();
  assert.equal(s.post({ accion: 'agregar', texto: '-1+1 = dos' }).ok, true);
  assert.equal(s.post({ accion: 'agregar', texto: '=HYPERLINK("https://ejemplo.test")' }).ok, true);
  assert.equal(s.post({ accion: 'agregar', texto: '+SUMA(1;1)', pantalla: '@cuenta', nombre: '=nombre' }).ok, true);
  const [guion, igual, mas] = s.filas;
  assert.equal(guion[6], "'-1+1 = dos");
  assert.equal(igual[6], "'=HYPERLINK(\"https://ejemplo.test\")");
  assert.equal(mas[6], "'+SUMA(1;1)");
  assert.equal(mas[1], "'@cuenta");
  assert.equal(mas[5], "'=nombre");
});

test('un texto normal se guarda tal cual', () => {
  const s = servicio();
  s.post({ accion: 'agregar', texto: 'hola', pantalla: 'Mi ruta', nombre: 'Persona de prueba' });
  assert.equal(s.filas[0][6], 'hola');
  assert.equal(s.filas[0][1], 'Mi ruta');
});

test('H6: el tope de 60 por hora se cumple con candado, y solo queda la clave de la hora actual', () => {
  const s = servicio({ props: { 'comentarios-2020010100': '60' } });
  for (let i = 0; i < 60; i++) assert.equal(s.post({ accion: 'agregar', texto: 'comentario ' + i }).ok, true);
  assert.equal(s.post({ accion: 'agregar', texto: 'comentario 61' }).error, 'DEMASIADOS_COMENTARIOS');
  assert.equal(s.filas.length, 60);
  const claves = Array.from(s.props.keys()).filter(k => k.indexOf('comentarios-') === 0);
  assert.equal(claves.length, 1, 'solo la hora actual');
  assert.equal(s.props.has('comentarios-2020010100'), false, 'la hora anterior se borró');
});

test('el número de envío queda en la columna I, con la cabecera «id_envio»; las ocho primeras columnas no cambian', () => {
  const s = servicio();
  s.post({ accion: 'agregar', id: 'abc-1', texto: 'hola', pantalla: 'Mi ruta' });
  assert.equal(s.grid[0][8], 'id_envio');
  assert.equal(s.grid[1][8], 'abc-1');
  assert.equal(s.grid[1][6], 'hola');
});

test('una hoja creada antes (sin columna I) recibe la cabecera al primer envío', () => {
  const s = servicio();
  assert.equal(s.grid[0].length, 8);
  s.post({ accion: 'agregar', texto: 'hola' });
  assert.equal(s.grid[0][8], 'id_envio');
});

test('una pestaña vacía recibe la cabecera completa, con «id_envio» en la columna I, antes del primer comentario', () => {
  const s = servicio({ sinCabecera: true });
  s.post({ accion: 'agregar', id: 'abc-3', texto: 'hola' });
  assert.equal(s.grid[0].length, 9);
  assert.equal(s.grid[0][0], 'fecha');
  assert.equal(s.grid[0][8], 'id_envio');
  assert.equal(s.grid[1][8], 'abc-3');
  assert.equal(s.filas.length, 1);
});

test('el lector ignora la columna de número de envío', () => {
  const s = servicio();
  s.post({ accion: 'agregar', id: 'abc-2', texto: 'hola', nombre: 'Persona de prueba' });
  const salida = JSON.parse(s.ctx.doGet({}).content);
  assert.deepEqual(Object.keys(salida.comentarios[0]).sort(), ['cita', 'comentario', 'estado', 'fecha', 'nombre', 'pantalla', 'selector', 'tipo']);
});

test('un reenvío con el mismo número de envío no guarda el comentario otra vez, no gasta cupo y no avisa dos veces', () => {
  const s = servicio();
  assert.equal(s.post({ accion: 'agregar', id: 'envio-1', texto: 'hola' }).ok, true);
  const otra = s.post({ accion: 'agregar', id: 'envio-1', texto: 'hola' });
  assert.equal(otra.ok, true);
  assert.equal(otra.duplicado, true);
  assert.equal(s.filas.length, 1);
  assert.equal(s.estado.correos, 1);
});

test('el duplicado se reconoce por la columna I aunque las propiedades ya no tengan el número de envío', () => {
  const s = servicio();
  s.post({ accion: 'agregar', id: 'abc-9', texto: 'hola' });
  for (const k of Array.from(s.props.keys())) if (k.indexOf('envio-') === 0) s.props.delete(k);
  const r = s.post({ accion: 'agregar', id: 'abc-9', texto: 'hola' });
  assert.equal(r.duplicado, true);
  assert.equal(s.filas.length, 1);
});

test('M-2: si la escritura falló, el envío queda como fallido y el reenvío lo intenta otra vez (no sale como «incierto»)', () => {
  const s = servicio();
  s.estado.fallosAppend = 1;
  assert.equal(s.post({ accion: 'agregar', id: 'envio-2', texto: 'hola' }).error, 'ERROR');
  assert.match(s.props.get('envio-envio-2'), /^fallido:/);
  const reenvio = s.post({ accion: 'agregar', id: 'envio-2', texto: 'hola' });
  assert.equal(reenvio.ok, true);
  assert.equal(s.filas.length, 1);
  assert.match(s.props.get('envio-envio-2'), /^confirmado:/);
});

test('los números de envío de las propiedades de hace más de 24 horas se borran', () => {
  const hace25Horas = Date.now() - 25 * 60 * 60 * 1000;
  const s = servicio({ props: { 'envio-viejo': 'confirmado:' + hace25Horas } });
  s.post({ accion: 'agregar', texto: 'hola' });
  assert.equal(s.props.has('envio-viejo'), false);
});

test('A-3: un número de envío que empieza con = se guarda como texto, y su reenvío no duplica', () => {
  const s = servicio();
  assert.equal(s.post({ accion: 'agregar', id: '=1+1', texto: 'hola' }).ok, true);
  assert.equal(s.grid[1][8], "'=1+1");
  const otra = s.post({ accion: 'agregar', id: '=1+1', texto: 'hola' });
  assert.equal(otra.duplicado, true);
  assert.equal(s.filas.length, 1);
});

test('A-3: si la hoja no muestra la comilla al leer, el reenvío de =1+1 tampoco duplica', () => {
  const s = servicio({ quitaComilla: true });
  s.post({ accion: 'agregar', id: '=1+1', texto: 'hola' });
  assert.equal(s.grid[1][8], '=1+1');
  for (const k of Array.from(s.props.keys())) if (k.indexOf('envio-') === 0) s.props.delete(k);
  assert.equal(s.post({ accion: 'agregar', id: '=1+1', texto: 'hola' }).duplicado, true);
  assert.equal(s.filas.length, 1);
});

test('B-2: el correo de aviso lleva el texto como lo escribió quien comenta, sin la comilla de neutralización', () => {
  const s = servicio();
  s.post({ accion: 'agregar', texto: '=1+1', pantalla: '=pantalla', nombre: '=nombre', cita: '+cita' });
  const correo = s.estado.mensajes[0];
  assert.match(correo.cuerpo, /=1\+1/);
  assert.doesNotMatch(correo.cuerpo, /'=1\+1/);
  assert.match(correo.asunto, /\(=pantalla\)/);
  assert.match(correo.cuerpo, /De: =nombre/);
  assert.match(correo.cuerpo, /«\+cita»/);
});
