/* Prueba «Qué necesitará tu proyecto»: qué trámites le tocan a cada proyecto, el avance por trámites y los avisos por cambios al PEA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const RF = loadApp();
const L = RF.logic, N = RF.needs;
const fresh = () => { const p = RF.store.newProject('P'); return p; };

test('sin responder, le tocan todos los trámites; al marcar solo viáticos, se esconden los que no aplican', () => {
  const p = fresh();
  const all = L.progress(p);
  assert.ok(all.tramTotal >= 18);
  p.needsSet = true; p.needs = { viaticos: true };
  const some = L.progress(p);
  assert.ok(some.tramTotal < all.tramTotal, 'menos trámites');
  assert.ok(some.porFase.F4.total < all.porFase.F4.total / 2, 'la fase de gastos baja de 63 pasos a menos de la mitad (' + all.porFase.F4.total + ' → ' + some.porFase.F4.total + ')');
  assert.equal(L.applies(p, 'TRM-011'), true, 'viajes y viáticos');
  assert.equal(L.applies(p, 'TRM-024'), true, 'Anexo 4');
  assert.equal(L.applies(p, 'TRM-025'), false, 'administración no marcada');
  assert.equal(L.applies(p, 'TRM-023'), false, 'efectivo no marcado');
  assert.equal(L.applies(p, 'TRM-008'), true, 'los trámites generales siempre tocan');
  assert.equal(L.itemProgress(p, 'TRM-025').auto, true);
});
test('lo que ya gastó cuenta aunque no lo haya marcado, y «me toca igual» lo fuerza', () => {
  const p = fresh(); p.needsSet = true; p.needs = { insumos: true };
  assert.equal(L.applies(p, 'TRM-023'), false);
  p.expenses.push({ id: 'e1', cuenta: 'operacion', formaPago: 'efectivo', total: 5000 });
  assert.equal(L.applies(p, 'TRM-023'), true, 'pagó en efectivo');
  assert.equal(L.applies(p, 'TRM-025'), false);
  p.show['TRM-025'] = true;
  assert.equal(L.applies(p, 'TRM-025'), true, '«me toca igual»');
  RF.store.get().community.ivaModo = 'no_usa';
  assert.equal(L.applies(p, 'TRM-021'), true, 'quien no usa el IVA necesita el Anexo 1');
  RF.store.get().community.ivaModo = 'no_contribuyente';
});
test('el avance se cuenta en trámites y los que no tocan no cuentan', () => {
  const p = fresh(); p.needsSet = true; p.needs = { viaticos: true };
  const before = L.progress(p);
  ['TRM-011', 'TRM-024'].forEach(tid => RF.tramites.byId[tid].steps.forEach((_, i) => { p.done[tid + ':' + i] = true; }));
  const after = L.progress(p);
  assert.equal(after.tramDone, before.tramDone + 2);
  assert.equal(after.tramTotal, before.tramTotal);
  assert.ok(!Object.values(after.porFase).some(f => f.tramTotal < 0));
});
test('el cuadre avisa si gasta en algo que no planeó y si agregó algo después de aprobado el PEA', () => {
  const p = fresh(); p.name = 'Invernadero'; p.needsSet = true; p.needs = { insumos: true };
  p.expenses.push({ id: 'e1', cuenta: 'administracion', docType: 'factura', total: 1000 });
  let res = L.reconcile(p, RF.store.get().community, '2026-09-29', []);
  let g = res.groups.find(x => x.id === 'plan');
  assert.ok(g && g.items.some(i => i.level === 'warn' && /administración/i.test(i.msg)), 'gasto de administración no marcado');
  p.peaAprobado = true; p.needsPea = { insumos: true }; p.needsAdded = [{ id: 'viaticos', at: '2026-09-20T10:00:00Z' }];
  p.needsCustom = [{ name: 'Semillas para el vivero', at: '2026-09-21T10:00:00Z', afterPea: true }];
  res = L.reconcile(p, RF.store.get().community, '2026-09-29', []);
  g = res.groups.find(x => x.id === 'plan');
  assert.ok(g.items.some(i => /después de aprobado el PEA/.test(i.msg) && i.fix && i.fix.tool === 'reitem'), 'avisa de la modificación del PEA');
  assert.ok(g.items.some(i => /Semillas/.test(i.msg)), 'también lo escrito a mano');
  const q = fresh(); q.needsSet = true; q.needs = { insumos: true };
  assert.ok(L.reconcile(q, RF.store.get().community, '2026-09-29', []).groups.find(x => x.id === 'plan').items[0].level === 'ok');
});
test('un estado antiguo (sin estos datos) se abre bien', () => {
  const old = { v: 2, community: { name: 'C', oc: 'SMI-Chile' }, projects: [{ id: 'p1', name: 'Viejo', expenses: [], done: {} }], activeProjectId: 'p1' };
  const s = RF.store.migrate(old);
  assert.equal(s.community.oc, '', 'ya no se nombra a la institución');
  const p = s.projects[0];
  assert.equal(p.needsSet, false); assert.equal(Object.keys(p.needs).length, 0); assert.ok(Array.isArray(p.needsAdded) && Array.isArray(p.needsCustom));
  assert.equal(JSON.stringify(s.repo), JSON.stringify({ docs: [], actas: [] }));
  assert.equal(L.applies(p, 'TRM-025'), true, 'sin responder muestra todo');
});
test('los botones de cada paso apuntan a pasos que existen', () => {
  Object.keys(N.STEP_TOOLS).forEach(k => {
    const [tid, i] = k.split(':'); const t = RF.tramites.byId[tid];
    assert.ok(t, 'existe ' + tid); assert.ok(+i >= 0 && +i < t.steps.length, k + ' es un paso válido');
    assert.ok(N.STEP_TOOLS[k].length > 0);
  });
  /* cada necesidad activa trámites reales */
  Object.keys(N.APPLIES).forEach(tid => { assert.ok(RF.tramites.byId[tid], tid); N.APPLIES[tid].forEach(n => assert.ok(N.BY_ID[n], n)); });
});
test('en toda la app se habla del Organismo Colaborador, no de SMI', () => {
  assert.equal(RF.data.ACTORS.find(a => a.id === 'smi').name, 'Organismo Colaborador');
  RF.tramites.list.forEach(t => { const txt = [t.title, t.why, t.when, ...(t.need || []), ...t.steps].join(' '); assert.ok(!/\bSMI\b/.test(txt), t.id + ' menciona SMI'); });
});
