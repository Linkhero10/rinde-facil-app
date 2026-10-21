import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadApp } from './load.mjs';
import { documentoFalso, buscar, botonPorTexto } from './dom-falso.mjs';

function app() {
  const files = fs.readdirSync(new URL('../js/', import.meta.url)).filter(f => /^(0[1-5]|1\d|2\d|33)-.*\.js$/.test(f)).sort();
  const RF = loadApp(files.concat(['30-ui.js', '31-forms.js', '32-tools-plan.js', '35-flow.js', '38-tools-needs.js', '40-views.js']), {
    RF_SERVICE_TRUST: { approvedAppsScriptUrls: ['https://script.google.com/macros/s/TEST_SINTETICO/exec'] }, document: documentoFalso(), setTimeout: () => 0, addEventListener() {}, getComputedStyle: () => ({ display: 'block' })
  });
  RF.store.addProject('Proyecto sintético');
  return RF;
}
const plano = x => JSON.parse(JSON.stringify(x));

test('ruta sin prórroga y revisión con salida de aprobación dibujable', () => {
  const RF = app();
  assert.equal(RF.tramites.byId['TRM-030'], undefined);
  assert.equal(RF.tools.prorroga, undefined);
  assert.equal(RF.tramites.byId['TRM-028'].title, 'Actualización de proyecto');
  const b = RF.data.FLOW_BLOCKS.find(b => b.ids.includes('D1'));
  assert.ok(b.edges.some(e => e[0] === 'D1' && e[1] === '19' && /sí/i.test(e[2])));
  assert.ok(b.ids.includes('19'));
  assert.doesNotMatch(JSON.stringify(RF.tramites.byId['TRM-027']), /90 días|0 días corridos|con CORFO/);
  assert.equal(RF.data.FLOW['8'][3], null);
});

test('el dibujante produce la flecha de aprobación hasta el paso 19', () => {
  Object.defineProperty(Object.getPrototypeOf(documentoFalso().body), 'lastChild', { configurable: true, get() { return this.children.at(-1); } });
  const RF = app(); loadApp.lastCtx.window = loadApp.lastCtx;
  const view = RF.flow.render({ fases: ['F2'] });
  const blocks = buscar(view, n => n.classList.contains('lanes'));
  blocks.forEach(b => {
    b.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 1500 });
    buscar(b, n => n.classList.contains('fstep')).forEach((n, i) => {
      n.getBoundingClientRect = () => ({ left: n.getAttribute('data-actor') === 'corfo' ? 0 : 230, top: i * 140, bottom: i * 140 + 60, width: 200, height: 60 });
    });
  });
  view.redraw();
  const review = blocks.find(b => b.querySelector('[data-id="D1"]'));
  assert.match(review.querySelector('svg.links').textContent, /sí, lo aprueba/i);
  assert.equal(review.querySelector('svg.links').querySelectorAll('path').length, RF.data.FLOW_BLOCKS.find(b => b.ids.includes('D1')).edges.length);
});

test('campos PEA retirados, clasificación y formularios históricos conservados', () => {
  const RF = app(), p = RF.store.project();
  p.forms.peaGeneral = { data: { comunidad: 'Comunidad sintética', resumen: 'histórico' } };
  const g = RF.forms.getSingle(p, 'peaGeneral');
  assert.equal(g.resumen, 'histórico');
  const sc = RF.forms.SCHEMAS;
  assert.ok(!sc.peaGeneral.fields.some(f => f.k === 'resumen'));
  assert.ok(!sc.peaProyecto.fields.some(f => f.k === 'tipo' || f.k === 'sostenibilidad'));
  assert.deepEqual(plano(sc.peaProyecto.fields.find(f => f.k === 'clasificacion').options).map(x => x.name), ['Agricultura', 'Agua', 'Productivo', 'Turismo', 'Otro']);
  assert.equal(p.forms.peaGeneral.data.resumen, 'histórico');
  const p2 = RF.store.newProject('Segundo proyecto sintético');
  RF.store.get().projects.push(p2);
  assert.equal(RF.forms.getSingle(p2, 'peaGeneral'), g);
  const view = RF.tools.pea.render();
  assert.match(view.textContent, /PEA General/);
  assert.ok(botonPorTexto(view, 'Administración'));
  assert.doesNotMatch(view.textContent, /Plazo:|Resumen del plan|Sacar/);
});

test('necesidades no ofrece administración y las cotizaciones son respaldo opcional', () => {
  const RF = app(), t = RF.tramites.byId['TRM-006'];
  assert.equal(RF.needs.NEEDS.some(n => n.id === 'admin'), false);
  assert.equal(t.auto && t.auto[0], undefined);
  assert.equal(RF.needs.TOOL_ROLE.cotizaciones.kind, 'apoyo');
  assert.match(RF.tools.necesidades.render().textContent, /La app te muestra los pasos que te tocan\. Lo puedes cambiar cuando quieras\./);
});

test('presupuesto oculta fuente, conserva aportes históricos y agrega CORFO', () => {
  const RF = app(), p = RF.store.project();
  p.budgetLines.push({ id: 'b-sintetico', cuenta: 'operacion', item: 'Insumos', glosa: '', fuente: 'propio', monto: 120, actId: '' });
  const original = JSON.stringify(p.budgetLines), view = RF.tools.presupuesto.render();
  assert.doesNotMatch(view.textContent, /F2|Aporte propio|Fuente/);
  assert.equal(JSON.stringify(p.budgetLines), original);
  botonPorTexto(view, 'Agregar línea').dispatch('click');
  assert.equal(p.budgetLines[1].fuente, 'corfo');
  const doc = RF.plan.budgetDoc(p, RF.store.get().community);
  assert.doesNotMatch(JSON.stringify(doc), /F2|Aporte propio|Resumen por cuenta y fuente/);
});

test('desembolsos: agregar, validar, sumar por moneda, persistir y quitar', () => {
  const RF = app(), view = RF.views.desembolsos();
  botonPorTexto(view, 'Agregar desembolso').dispatch('click');
  const com = RF.store.get().community;
  assert.equal(com.desembolsos.length, 1);
  let amount = view.querySelector('[aria-label="Monto"]');
  amount.value = '-3'; amount.dispatch('change');
  assert.equal(com.desembolsos[0].monto, 0);
  amount.value = '120'; amount.dispatch('change');
  assert.equal(com.desembolsos[0].monto, 120);
  com.desembolsos.push({ fondo: 'AA', tramo: '2', monto: 3.5, moneda: 'US$', fecha: '', transferido: true });
  const updated = RF.views.desembolsos();
  assert.match(updated.textContent, /Transferido · US\$.*3[,.]5/);
  assert.match(updated.textContent, /Por transferir · CLP.*120/);
  assert.equal(RF.store.migrate(plano(RF.store.get())).community.desembolsos.length, 2);
  botonPorTexto(updated, 'Quitar').dispatch('click');
  assert.equal(com.desembolsos.length, 1);
});

test('cuota disponible considera semana y mes incluso sin mensual configurado', () => {
  const RF = app();
  const c = { diario: { restan: 98 }, semanal: { limite: 10, restan: 1 }, mensual: { limite: 100, restan: 20 } };
  assert.equal(RF.ocr.lecturasDisponibles(c).n, 1);
  assert.match(RF.ocr.lecturasDisponibles(c).cuando, /lunes/);
  c.mensual.restan = 0;
  assert.equal(RF.ocr.lecturasDisponibles(c).n, 0);
  assert.equal(RF.ocr.lecturasDisponibles({ diario: { restan: 98 } }).n, 98);
});

test('pestaña Administración reutiliza el proyecto administrativo y conserva sus líneas', () => {
  const RF = app(), s = RF.store.get(), original = RF.store.project();
  const adm = RF.store.newProject('Gastos de administración'); adm.tipo = 'administracion';
  adm.budgetApproved.administracion = 450;
  adm.budgetLines.push({ id: 'adm-sintetico', cuenta: 'administracion', item: 'Servicios', fuente: 'propio', monto: 20 });
  s.projects.push(adm);
  const view = RF.tools.pea.render();
  const general = RF.forms.getSingle(original, 'peaGeneral');
  assert.equal(general.presupuestoAdmin, 450);
  botonPorTexto(view, 'Administración').dispatch('click');
  assert.equal(s.projects.length, 2);
  assert.match(view.textContent, /Gasto de administración/);
  botonPorTexto(view, 'Agregar gasto de administración').dispatch('click');
  assert.equal(adm.budgetLines[0].fuente, 'propio');
  assert.equal(adm.budgetLines[1].cuenta, 'administracion');
  assert.equal(adm.budgetLines[1].fuente, 'corfo');
  assert.equal(original.budgetLines.length, 0);
  botonPorTexto(view, 'PEA General').dispatch('click');
  botonPorTexto(view, 'Administración').dispatch('click');
  assert.equal(s.projects.length, 2);
});

test('pestañas de proyecto seleccionan su presupuesto y descarga incluye administración una vez', () => {
  const RF = app(), s = RF.store.get(), first = RF.store.project(), second = RF.store.newProject('Segundo sintético');
  const adm = RF.store.newProject('Gastos de administración'); adm.tipo = 'administracion';
  adm.budgetLines.push({ cuenta: 'administracion', item: 'Administración sintética', monto: 70 });
  s.projects.push(second, adm);
  const view = RF.tools.pea.render();
  botonPorTexto(view, second.name).dispatch('click');
  assert.equal(RF.store.project().id, second.id);
  const doc = JSON.stringify(RF.plan.peaDoc(second, RF.forms.ctxNow()));
  assert.equal(doc.split('Administración sintética').length - 1, 1);
  assert.equal(first.forms.peaGeneral, undefined);
});

test('motivos de actualización se guardan en el mismo formulario y mantienen el legado', () => {
  const RF = app(), p = RF.store.project();
  p.reitem.motivo = 'Motivo histórico sintético';
  let view = RF.tools.reitem.render();
  assert.equal(p.reitem.motivo, 'Motivo histórico sintético');
  const select = buscar(view, n => n.tagName === 'SELECT' && n.children.some(o => /Presupuesto \(aumenta o disminuye\)/.test(o.textContent)))[0];
  assert.ok(select);
  assert.match(select.textContent, /Actividades o etapas \(agregar, eliminar o cambiar la carta Gantt\)/);
  select.value = 'actividades'; select.dispatch('change');
  assert.equal(p.reitem.motivo, 'actividades');
  assert.match(JSON.stringify(RF.plan.reitemDoc(p, RF.forms.ctxNow())), /Actividades o etapas \(agregar, eliminar o cambiar la carta Gantt\)/);
  view = RF.tools.reitem.render();
  assert.match(view.textContent, /Descargar la solicitud/);
});

test('PEA General reutiliza RUT del representante y sincroniza datos y presupuesto', () => {
  const RF = app(), p = RF.store.project(), s = RF.store.get();
  s.community.repRut = '12345678-5';
  p.forms.peaGeneral = { data: { comunidad: 'Comunidad sintética', resumen: 'Texto histórico' } };
  const d = RF.forms.getSingle(p, 'peaGeneral');
  assert.equal(d.repRut, s.community.repRut);
  const adm = RF.store.newProject('Gastos de administración'); adm.tipo = 'administracion'; s.projects.push(adm);
  d.presupuestoAdmin = 210;
  RF.forms.SCHEMAS.peaGeneral.onChange('presupuestoAdmin', d);
  assert.equal(adm.budgetApproved.administracion, 210);
  assert.equal(p.forms.peaGeneral.data.resumen, 'Texto histórico');
});

test('OCR bloquea archivo bruto mayor a 7 MB antes de convertirlo o enviarlo', async () => {
  const RF = app();
  for (const fn of ['recognize', 'recognizeDocument', 'recognizeCached']) {
    await assert.rejects(RF.ocr[fn]({ size: 7 * 1024 * 1024 + 1, type: 'image/jpeg' }), /El archivo pesa más de 7 MB\. Usa una foto más pequeña o un PDF con menos páginas\./);
  }
});

test('PDF de exactamente 7 MB se envía; el exceso no llega a conversión ni red', async () => {
  const RF = app(), ctx = loadApp.lastCtx;
  RF.store.get().cloud.apiUrl = ctx.RF_SERVICE_TRUST.approvedAppsScriptUrls[0];
  RF.auth = { needsSession: () => false };
  let conversions = 0, requests = 0;
  ctx.FileReader = class { readAsDataURL() { conversions++; this.result = 'data:application/pdf;base64,eA=='; this.onload(); } };
  ctx.fetch = async () => { requests++; return { ok: true, text: async () => JSON.stringify({ ok: true, raw_text: 'Documento sintético', engine: 'cloud_vision', document_coverage: 'COMPLETE', page_count: 30 }) }; };
  const r = await RF.ocr.recognizeDocument({ size: 7 * 1024 * 1024, type: 'application/pdf' });
  assert.equal(r.ok, true); assert.equal(r.page_count, 30);
  await assert.rejects(RF.ocr.recognizeDocument({ size: 7 * 1024 * 1024 + 1 }), /más de 7 MB/);
  assert.equal(conversions, 1); assert.equal(requests, 1);
});

test('PDF bruto mayor a 7 MB se frena también antes de OCR por páginas', () => {
  const RF = app(), view = RF.tools.subirpea.render();
  const input = view.querySelector('input[type="file"]');
  assert.ok(input);
  input.files = [{ name: 'documento-sintetico.pdf', size: 7 * 1024 * 1024 + 1, type: 'application/pdf' }];
  input.dispatch('change');
  assert.match(view.textContent, /El archivo pesa más de 7 MB\. Usa una foto más pequeña o un PDF con menos páginas\./);
});

test('OCR de documento mantiene los tres errores de cuota sobre cobertura parcial', async () => {
  const RF = app(), ctx = loadApp.lastCtx;
  RF.store.get().cloud.apiUrl = ctx.RF_SERVICE_TRUST.approvedAppsScriptUrls[0];
  RF.auth = { needsSession: () => false };
  ctx.FileReader = class { readAsDataURL() { this.result = 'data:application/pdf;base64,eA=='; this.onload(); } };
  for (const code of ['LIMITE_DIARIO', 'LIMITE_SEMANAL', 'LIMITE_MENSUAL']) {
    ctx.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ ok: false, error: code, document_coverage: 'PARTIAL' }) });
    const r = await RF.ocr.recognizeDocument({ size: 100, type: 'application/pdf' });
    assert.equal(r.error, code);
  }
});
