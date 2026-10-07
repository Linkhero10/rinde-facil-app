import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadApp } from './load.mjs';

const RF = loadApp();
const U = RF.util, D = RF.data, L = RF.logic;

test('util: dinero, RUT y fechas', () => {
  assert.equal(U.parseCLP('1.234.567'), 1234567);
  assert.equal(U.parseCLP('$ 10.000'), 10000);
  assert.equal(U.parseCLP('1234,5'), 1234.5);
  assert.equal(U.parseCLP('abc'), 0);
  assert.equal(U.parseCLP(''), 0);
  assert.equal(U.fmtCLP(1234567), '$ 1.234.567');
  assert.ok(U.rutValid('76.123.456-0'));
  assert.ok(U.rutValid('12.345.678-5'));
  assert.ok(U.rutValid('11.111.111-1'));
  assert.ok(!U.rutValid('12.345.678-9'));
  assert.ok(!U.rutValid('123'));
  assert.equal(U.rutFormat('123456785'), '12.345.678-5');
  assert.equal(U.rutDv('1'), '9');
  /* 10 días hábiles desde un lunes, sin feriados */
  assert.equal(U.addBusinessDays('2026-09-28', 10, []), '2026-10-12');
  assert.equal(U.addBusinessDays('2026-09-28', 10, ['2026-10-12']), '2026-10-13');
  assert.equal(U.addBusinessDays('2026-09-25', 1, []), '2026-09-28'); /* viernes -> lunes */
  assert.equal(U.businessDaysBetween('2026-09-28', '2026-10-12', []), 10);
  assert.equal(U.diffDays('2026-01-01', '2026-04-01'), 90);
  assert.equal(U.addDays('2026-01-01', 90), '2026-04-01');
  assert.deepEqual(Array.from(U.monthsRange('2026-11-15', '2027-02-01')), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.equal(U.fmtDate('2026-09-28'), '28 de septiembre de 2026');
});

test('datos: cada trámite del inventario está cubierto una sola vez', () => {
  /* Contrato versionado para que el paquete público no dependa del disco privado de SMI. */
  const ids = JSON.parse(fs.readFileSync(new URL('./fixtures/tramite-ids.json', import.meta.url), 'utf8')).sort();
  assert.equal(ids.length, 21);
  const inFases = [].concat(...D.FASES.map(f => f.items), D.AYUDA).filter(x => x.startsWith('TRM-')).sort();
  assert.deepEqual(Array.from(inFases), ids, 'las fases + ayuda deben cubrir exactamente los 21 trámites');
  const all = [].concat(...D.FASES.map(f => f.items), D.AYUDA);
  assert.equal(new Set(all).size, all.length, 'ningún trámite repetido');
  all.forEach(id => assert.ok(RF.tramites.byId[id], 'existe contenido para ' + id));
  RF.tramites.list.forEach(t => {
    assert.ok(t.title && t.why && t.steps.length >= 1, t.id + ' tiene título, motivo y pasos');
    t.steps.forEach(s => assert.ok(s.length < 260, t.id + ' paso demasiado largo: ' + s.slice(0, 50)));
    const req = t.steps.filter((_, i) => !(t.opt && t.opt[i]));
    assert.ok(req.length >= 1, t.id + ' tiene al menos un paso obligatorio (si no, nunca se completa)');
    Object.keys(t.opt || {}).concat(Object.keys(t.stepTools || {})).forEach(i => assert.ok(i >= 0 && i < t.steps.length, t.id + ' apunta a un paso que no existe: ' + i));
    (t.notes || []).forEach(n => assert.ok((typeof n === 'string' ? n : n.t).length > 10, t.id + ' nota vacía'));
    /* un paso es una acción: no debe empezar describiendo lo que hace otra persona o el sistema */
    t.steps.forEach(x => assert.ok(!/^(CORFO (avisa|revisa)|Novandino .* transfiere|Espera que)/.test(x), t.id + ' paso que no es acción del usuario: ' + x.slice(0, 50)));
  });
  /* el flujo tiene los 28 pasos + 3 decisiones y las aristas apuntan a nodos del mismo bloque */
  assert.equal(Object.keys(D.FLOW).length, 31);
  D.FLOW_BLOCKS.forEach(b => b.edges.forEach(e => { assert.ok(b.ids.includes(e[0]) && b.ids.includes(e[1])); }));
  /* no debe existir ningún retorno inventado (Manual p.10: aclaración por única vez) */
  assert.equal(D.FLOW['25'][4], null);
  assert.match(D.FLOW['23'][2], /única vez/);
});

const community = { ivaModo: 'no_contribuyente' };
function baseExp(over) {
  return Object.assign({
    id: 'e1', cuenta: 'operacion', docType: 'factura', folio: '1042', fecha: '2026-08-14', rutProveedor: '76.123.456-0',
    proveedor: 'Empresa Fantasía SpA', neto: 1250000, iva: 237500, total: 1487500, montoRendir: 1487500, formaPago: 'transferencia',
    glosa: 'Compra de materiales para el taller de artesanía', has: { pago: true }
  }, over || {});
}
const project = { start: '2026-01-01', end: '2027-01-01', periodoInicio: '2026-07-01', periodoFin: '2026-12-31', expenses: [], budgetLines: [], budgetApproved: {}, gantt: { stages: [] }, done: {}, forms: {} };

test('gasto correcto queda sin errores', () => {
  const r = L.evaluateExpense(baseExp(), project, community, []);
  assert.equal(r.errors, 0, JSON.stringify(r.issues));
  assert.equal(r.status, 'ok');
});

test('gasto: RUT malo, aritmética, glosa, efectivo y fechas', () => {
  let r = L.evaluateExpense(baseExp({ rutProveedor: '76.123.456-9' }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'rut_invalido'));
  r = L.evaluateExpense(baseExp({ total: 1500000, montoRendir: 1500000 }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'aritmetica'));
  r = L.evaluateExpense(baseExp({ glosa: 'x'.repeat(201) }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'glosa_larga'));
  r = L.evaluateExpense(baseExp({ glosa: 'x'.repeat(185) }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'glosa_aviso') && !r.issues.some(i => i.id === 'glosa_larga'));
  r = L.evaluateExpense(baseExp({ formaPago: 'efectivo', has: { pago: true } }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'falta_anexo3'), 'efectivo exige Anexo 3');
  r = L.evaluateExpense(baseExp({ formaPago: 'efectivo', has: { anexo3: true } }), project, community, []);
  assert.ok(!r.issues.some(i => i.id === 'falta_anexo3'));
  r = L.evaluateExpense(baseExp({ fecha: '2025-12-31' }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'fecha_antes'));
  r = L.evaluateExpense(baseExp({ fecha: '2026-03-01' }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'fuera_periodo' && i.level === 'warn'));
});

test('gasto: cotizaciones sobre $10 M, IVA recuperable y duplicados', () => {
  let r = L.evaluateExpense(baseExp({ neto: 12000000, iva: 2280000, total: 14280000, montoRendir: 14280000 }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'falta_cotizaciones' && i.level === 'error'));
  r = L.evaluateExpense(baseExp({ neto: 12000000, iva: 2280000, total: 14280000, montoRendir: 14280000, servicioTecnico: true }), project, community, []);
  assert.ok(!r.issues.some(i => i.id === 'falta_cotizaciones'), 'servicios técnico-profesionales no piden cotizaciones');
  r = L.evaluateExpense(baseExp({ neto: 12000000, iva: 2280000, total: 14280000, montoRendir: 14280000, has: { pago: true, autorizacion: true } }), project, community, []);
  assert.ok(!r.issues.some(i => i.id === 'falta_cotizaciones'), 'con autorización previa de CORFO alcanza');
  /* la comunidad recupera IVA: debe rendir el neto */
  const comRec = { ivaModo: 'recupera' };
  r = L.evaluateExpense(baseExp(), project, comRec, []);
  assert.ok(r.issues.some(i => i.id === 'rendir_bruto'));
  r = L.evaluateExpense(baseExp({ montoRendir: 1250000 }), project, comRec, []);
  assert.ok(!r.issues.some(i => i.id === 'rendir_bruto' || i.id === 'monto_distinto'));
  /* no usa IVA: pide Anexo 1 */
  r = L.evaluateExpense(baseExp(), project, { ivaModo: 'no_usa' }, []);
  assert.ok(r.issues.some(i => i.id === 'falta_anexo1'));
  /* duplicado */
  const a = baseExp({ id: 'a' }), b = baseExp({ id: 'b' });
  r = L.evaluateExpense(a, project, community, [a, b]);
  assert.ok(r.issues.some(i => i.id === 'duplicado'));
  /* OCR sin revisión humana */
  r = L.evaluateExpense(baseExp({ ocr: { engine: 'cloud_vision' }, verified: false }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'sin_verificar' && i.level === 'error'));
  r = L.evaluateExpense(baseExp({ ocr: { engine: 'cloud_vision' }, verified: true }), project, community, []);
  assert.ok(!r.issues.some(i => i.id === 'sin_verificar'));
});

test('gasto: honorarios piden F29 e informe del SII; viático pide Anexo 4', () => {
  let r = L.evaluateExpense(baseExp({ cuenta: 'rrhh', docType: 'honorarios', neto: 0, iva: 0, total: 300000, montoRendir: 300000 }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'falta_f29') && r.issues.some(i => i.id === 'falta_informe_sii'));
  r = L.evaluateExpense(baseExp({ esViatico: true }), project, community, []);
  assert.ok(r.issues.some(i => i.id === 'falta_anexo4'));
});

test('boleta: el pago se entiende al momento (Manual p.18)', () => {
  const r = L.evaluateExpense(baseExp({ docType: 'boleta', neto: 0, iva: 0, total: 8000, montoRendir: 8000, has: {} }), project, community, []);
  assert.ok(!r.issues.some(i => i.id === 'falta_pago'));
});

test('administración: gasto compartido pide Anexo 5 y el tope mensual se controla', () => {
  const e = baseExp({ cuenta: 'administracion', pctUso: 30, neto: 0, iva: 0, total: 100000, docType: 'boleta', montoRendir: 30000, has: {} });
  const r = L.evaluateExpense(e, project, community, []);
  assert.ok(r.issues.some(i => i.id === 'falta_anexo5'));
  assert.equal(L.expectedMontoRendir(e, community), 30000);
  const p = Object.assign({}, project, { expenses: [baseExp({ id: '1', cuenta: 'administracion', montoRendir: 2000000, total: 2000000, fecha: '2026-08-05' }), baseExp({ id: '2', cuenta: 'administracion', montoRendir: 1500000, total: 1500000, fecha: '2026-08-20' })] });
  const rec = L.reconcile(p, community, '2026-09-01', []);
  assert.ok(rec.groups.find(g => g.id === 'gastos').items.some(i => /tope/.test(i.msg) && i.level === 'error'));
});

test('cuadre: presupuesto vs aprobado, anexos 3/4/5 vs gastos, plazos y saltos', () => {
  const p = JSON.parse(JSON.stringify(project));
  p.budgetApproved = { rrhh: 0, operacion: 1000000, inversion: 0, administracion: 0 };
  p.budgetLines = [{ id: 'b1', cuenta: 'operacion', item: 'Materiales', glosa: 'x', fuente: 'CORFO', monto: 1200000 }];
  p.expenses = [baseExp({ id: 'e1', formaPago: 'efectivo', has: {} }), baseExp({ id: 'e2', folio: '2000', esViatico: true, docType: 'certificado_viatico', total: 60000, neto: 0, iva: 0, montoRendir: 60000, has: {} })];
  p.forms = { anexo3: [], anexo4: [{ id: 'a', data: { total: 50000 } }] };
  const rec = L.reconcile(p, community, '2026-09-01', []);
  const txt = JSON.stringify(rec.groups);
  assert.match(txt, /supera lo aprobado/);
  assert.match(txt, /pago\(s\) en efectivo y 0 declaración/);
  assert.match(txt, /certificados de viático suman/);
  assert.ok(rec.counts.error >= 3);
  /* rendido más allá del presupuesto */
  assert.match(txt, /No puedes pasarte del presupuesto/);
});

test('plazos: PEA 90 días + 30 y aclaración de 10 días hábiles', () => {
  const pd = L.peaDeadline({ desembolso1: '2026-07-01' }, '2026-09-01');
  assert.equal(pd.fin, '2026-09-29');
  assert.equal(pd.finProrroga, '2026-10-29');
  assert.equal(pd.diasRestantes, 28);
  assert.equal(L.aclaracionDeadline('2026-09-28', []), '2026-10-12');
  const p = JSON.parse(JSON.stringify(project));
  p.desembolso1 = '2026-06-15'; /* vence el 13-sep; con prórroga, el 13-oct */
  let rec = L.reconcile(p, community, '2026-09-20', []);
  assert.ok(rec.groups.find(g => g.id === 'plazos').items.some(i => i.level === 'warn' && /prórroga/.test(i.msg)));
  rec = L.reconcile(p, community, '2026-12-01', []);
  assert.ok(rec.groups.find(g => g.id === 'plazos').items.some(i => i.level === 'error'));
  p.observations = [{ id: 'o1', titulo: 'Gasto observado', recibida: '2026-09-01' }];
  p.desembolso1 = '';
  rec = L.reconcile(p, community, '2026-09-20', []);
  assert.ok(rec.groups.find(g => g.id === 'plazos').items.some(i => i.level === 'error' && /Venció/.test(i.msg)));
});

test('avance: siguiente paso, "no aplica" y fases saltadas', () => {
  const p = JSON.parse(JSON.stringify(project));
  let pr = L.progress(p);
  assert.equal(pr.next.tramiteId, 'P-01');
  assert.equal(pr.faseActual, 'F1');
  p.done['P-01:0'] = true; p.done['P-01:1'] = true;
  pr = L.progress(p);
  assert.equal(pr.next.tramiteId, 'P-02');
  p.na = { 'P-02': true, 'P-03': true };
  pr = L.progress(p);
  assert.equal(pr.next.tramiteId, 'TRM-027');
  assert.equal(pr.faseActual, 'F2');
  /* marcar algo en la fase 4 sin haber tocado 2 ni 3 */
  p.done['TRM-008:0'] = true;
  const sk = L.skippedPhases(p);
  assert.ok(sk.some(s => s.fase === 'F4' && s.falta === 'F2'));
  const rec = L.reconcile(p, community, '2026-09-01', []);
  assert.ok(rec.groups.find(g => g.id === 'orden').items.some(i => /te saltaste algo/i.test(i.msg)));
});

test('almacenamiento: una sesión sin cambios no pisa lo que guardó otra; con cambios sí guarda', () => {
  const R2 = loadApp(); const ls = loadApp.lastCtx.localStorage;
  R2.store.load();
  ls.setItem(R2.store.KEY, JSON.stringify({ v: 2, projects: [{ id: 'x', name: 'Guardado por otra pestaña' }] }));
  R2.store.persistNow();
  assert.match(ls.getItem(R2.store.KEY), /Guardado por otra pestaña/, 'sin cambios locales no se escribe');
  R2.store.addProject('Nuevo'); R2.store.persistNow();
  assert.match(ls.getItem(R2.store.KEY), /Nuevo/, 'con cambios locales sí se guarda');
  const st = JSON.parse(ls.getItem(R2.store.KEY));
  assert.ok(st.projects.length === 1 && st.projects[0].name === 'Nuevo' || st.projects.length >= 1);
  assert.throws(() => R2.store.importJSON('{"a":1}'), /copia de Rinde Fácil/);
});

test('respaldos: anexo 3 y cotizaciones creados en la app cuentan como cumplidos', () => {
  const p = JSON.parse(JSON.stringify(project));
  const e = baseExp({ id: 'gx', formaPago: 'efectivo', has: { pago: true }, neto: 12000000, iva: 2280000, total: 14280000, montoRendir: 14280000 });
  p.expenses = [e];
  let r = L.evaluateExpense(e, p, community, p.expenses);
  assert.ok(r.issues.some(i => i.id === 'falta_anexo3') && r.issues.some(i => i.id === 'falta_cotizaciones'));
  p.forms = { anexo3: [{ id: 'a', data: { gastoId: 'gx', monto: 14280000 } }] };
  p.cotizaciones = [{ gastoId: 'gx', neto: 12000000, cots: [{ proveedor: 'A', monto: 12000000 }, { proveedor: 'A', monto: 11000000 }] }];
  r = L.evaluateExpense(e, p, community, p.expenses);
  assert.ok(!r.issues.some(i => i.id === 'falta_anexo3'), 'Anexo 3 ligado al gasto');
  assert.ok(r.issues.some(i => i.id === 'falta_cotizaciones'), 'dos cotizaciones del MISMO proveedor no cuentan');
  p.cotizaciones[0].cots[1].proveedor = 'B';
  r = L.evaluateExpense(e, p, community, p.expenses);
  assert.ok(!r.issues.some(i => i.id === 'falta_cotizaciones'), 'con 2 proveedores distintos cumple');
});

test('Gantt: fechas y límites del proyecto', () => {
  const p = JSON.parse(JSON.stringify(project));
  p.gantt.stages = [{ id: 's1', name: 'Etapa 1', acts: [{ id: 'a1', name: 'Taller', start: '2026-03-01', end: '2026-02-01' }, { id: 'a2', name: 'Compra', start: '2025-12-01', end: '2026-01-15' }, { id: 'a3', name: '', start: '2026-02-01', end: '2026-03-01' }] }];
  const g = L.ganttIssues(p);
  assert.ok(g.some(i => /anterior al inicio/.test(i.msg)));
  assert.ok(g.some(i => /antes del inicio del proyecto/.test(i.msg)));
  assert.ok(g.some(i => /sin nombre/.test(i.msg)));
  assert.equal(L.activityDays({ start: '2026-02-01', end: '2026-02-10' }), 10);
});
