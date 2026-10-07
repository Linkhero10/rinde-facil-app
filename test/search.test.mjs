/* Prueba el buscador de toda la app: sin tildes, con la ruta de cada resultado y también en los datos de la persona. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp();
/* en las pruebas no se cargan las pantallas: se simulan las herramientas y sus grupos */
RF.tools = {
  gastos: { title: 'Gastos y rendición', desc: 'Anota cada gasto a mano o con foto del comprobante.' },
  gantt: { title: 'Carta Gantt', desc: 'Arma tus etapas y actividades con fechas.' },
  presupuesto: { title: 'Presupuesto', desc: 'Líneas por cuenta.' },
  anexo4: { title: 'Anexo 4', desc: 'Certificado de viático.' },
  cuentas: { title: '¿En qué cuenta va?', desc: 'Ayuda para elegir la cuenta.' },
  nube: { title: 'Nube y copias', desc: 'Conecta el servicio de tu comunidad.' }
};
RF.views = { TOOL_GROUPS: [{ id: 'g1', name: 'Planificar', tools: ['gantt', 'presupuesto'] }, { id: 'g2', name: 'Rendir', tools: ['gastos'] }, { id: 'g3', name: 'Anexos y formularios', tools: ['anexo4'] }, { id: 'g4', name: 'Ayudas', tools: ['cuentas'] }] };
RF.forms = { SCHEMAS: { anexo4: { fields: [{ l: 'Nombre de quien viaja' }, { l: 'Días de viaje' }] } } };
RF.search.resetIndex();

const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const S = (q, n) => RF.search.search(q, n);
const label = r => r.item.title;

test('sin tildes ni mayúsculas, y la coincidencia se marca en el texto original', () => {
  assert.equal(RF.search.norm('Rendición'), 'rendicion');
  const segs = RF.search.mark('Gastos y rendición', RF.search.tokens('RENDICION'));
  same(segs.filter(s => s.m).map(s => s.t), ['rendición']);
  assert.equal(segs.map(s => s.t).join(''), 'Gastos y rendición', 'no se pierde ni se cambia texto');
});
test('«gasto» encuentra la herramienta y dice dónde está: Herramientas → Rendir → Gastos y rendición', () => {
  const r = S('gasto', 40);
  const tool = r.find(x => x.item.kind === 'Herramienta' && x.item.title === 'Gastos y rendición');
  assert.ok(tool, 'aparece la herramienta');
  same(tool.item.path, ['Herramientas', 'Rendir']);
  assert.equal(tool.item.href, '#/h/gastos');
  assert.ok(r.indexOf(tool) === 0, 'es el primer resultado');
  assert.ok(r.some(x => x.item.kind === 'Fase' && /Gastos y respaldos/.test(x.item.title)), 'también la fase');
});
test('busca dentro de los pasos de los trámites y muestra el fragmento con su número de paso', () => {
  const r = S('llego dinero', 40).filter(x => x.item.kind === 'Trámite' || x.item.kind === 'Paso');
  assert.ok(r.length > 0);
  assert.ok(r.some(x => /^Paso \d/.test(x.snippetLabel) && x.snippetSegs.some(s => s.m)), 'fragmento con la palabra marcada');
  assert.ok(r.every(x => x.item.href.startsWith('#/t/')));
});
test('busca en los campos de las herramientas y en el mapa de quién hace qué', () => {
  const campo = S('dias de viaje', 10).find(x => x.item.kind === 'Herramienta');
  assert.equal(campo.item.title, 'Anexo 4'); same(campo.item.path, ['Herramientas', 'Anexos y formularios']); assert.equal(campo.snippetLabel, 'Campo');
  const mapa = S('componente 3', 20).find(x => x.item.kind === 'Mapa');
  assert.ok(mapa && mapa.item.path[0] === 'Quién hace qué');
});
test('varias palabras: todas deben aparecer; sin coincidencias no devuelve nada', () => {
  assert.ok(S('cotizaciones proveedores 10.000.000', 5).length >= 1);
  same(S('zzzxqw', 5), []);
  same(S('   ', 5), []);
  assert.equal(S('gantt zzzxqw', 5).length, 0);
});
test('también busca en lo que la persona anotó y lleva a esa pantalla', () => {
  RF.store.reset();
  RF.store.update(s => {
    const p = RF.store.newProject('Invernadero comunitario');
    p.expenses.push({ id: 'g1', proveedor: 'Ferretería Los Cóndores', folio: '4521', glosa: 'Malla raschel para el invernadero', total: 59900, docType: 'boleta', fecha: '2026-08-14' });
    s.projects.push(p); s.activeProjectId = p.id;
  });
  const r = S('malla', 5).find(x => x.item.kind === 'Tu gasto');
  assert.ok(r, 'encuentra la glosa del gasto');
  same(r.item.path, ['Tus datos', 'Invernadero comunitario', 'Gastos y rendición']);
  assert.equal(r.item.href, '#/h/gastos'); assert.equal(typeof r.item.open, 'function');
  assert.ok(S('4521', 5).some(x => x.item.kind === 'Tu gasto'), 'por folio');
  assert.ok(S('condores', 5).some(x => x.item.kind === 'Tu gasto'), 'sin tildes');
});

test('frases de todos los días llevan a la herramienta correcta', () => {
  const top = q => S(q, 5).map(r => r.item.href + ' ' + r.item.title);
  assert.ok(top('no se como subir una foto').some(t => /h\/gastos/.test(t)), 'subir una foto → Gastos');
  assert.ok(top('donde abro la cuenta bancaria').some(t => /P-02/.test(t)), 'cuenta bancaria → Abrir la cuenta corriente');
});
