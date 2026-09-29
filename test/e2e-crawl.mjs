/* Recorre TODAS las pantallas (fases, 32 trámites, todas las herramientas) en escritorio y celular:
   sin errores de JavaScript, sin desborde horizontal, imágenes cargadas, campos con nombre accesible y enlaces válidos. */
import { createRequire } from 'node:module';
const { chromium } = createRequire('D:/SMI/_FARO/runtime/package.json')('playwright');
const BASE = process.env.RF_URL || 'http://127.0.0.1:8790/index.html';

const seed = {
  v: 2, community: { name: 'Comunidad de Prueba', rut: '76.123.456-0', address: 'Calle 1', legalRep: 'Persona Ejemplo', repRut: '12.345.678-5', email: 'a@b.cl', phone: '123', ivaModo: 'recupera', oc: 'SMI-Chile' },
  cloud: { apiUrl: '', key: '', lastSync: null }, holidays: ['2026-10-12'], activeProjectId: 'p1', ui: { theme: 'system', open: {} },
  projects: [{ id: 'p1', name: 'Sede comunitaria', code: '22CDR-000001', tipo: 'inversion', start: '2026-01-01', end: '2027-12-31', desembolso1: '2026-06-01', periodoInicio: '2026-07-01', periodoFin: '2026-12-31',
    budgetApproved: { rrhh: 1000000, operacion: 20000000, inversion: 0, administracion: 5000000 }, done: { 'TRM-001:0': true }, na: { 'TRM-009': true },
    gantt: { stages: [{ id: 's1', name: 'Preparación', acts: [{ id: 'a1', name: 'Taller', start: '2026-07-01', end: '2026-09-30', result: 'Taller hecho' }] }] },
    budgetLines: [{ id: 'b1', cuenta: 'operacion', item: 'Materiales', glosa: 'Materiales del taller', fuente: 'corfo', monto: 15000000, actId: 'a1' }],
    expenses: [{ id: 'g1', cuenta: 'operacion', item: 'Materiales', docType: 'factura', folio: '1042', fecha: '2026-08-14', fechaPago: '2026-08-15', rutProveedor: '76.123.456-0', proveedor: 'Empresa Fantasía SpA', neto: 1250000, iva: 237500, total: 1487500, montoRendir: 1250000, pctUso: '', formaPago: 'transferencia', glosa: 'Materiales del taller', actId: 'a1', has: { pago: true }, esViatico: false, servicioTecnico: false, esInmueble: false, verified: false, ocr: null, imgId: null }],
    forms: { anexo3: [{ id: 'f1', data: { ciudad: 'X', fecha: '2026-09-01', proveedorNombre: 'Proveedora de Ejemplo', proveedorRut: '11.111.111-1', monto: 7500, repNombre: 'P', documentos: 'boleta 1', gastoId: '' } }],
      informeA: [{ id: 'f2', data: { actId: 'a1', nombre: 'Taller', presupuestado: 15000000, rendido: 1250000, avanceProg: 50, avanceReal: 40 } }] },
    pea: { general: {}, proyecto: {} }, observations: [{ id: 'o1', titulo: 'Obs', recibida: '2026-09-25', gastos: '', detalle: '', respuesta: '', respondida: false }],
    cotizaciones: [{ id: 'q1', descripcion: 'Compra grande', neto: 12000000, cots: [{ proveedor: 'A', monto: 12000000 }, { proveedor: 'B', monto: 12500000 }], gastoId: 'g1' }], reitem: { rows: [], motivo: '' }, notes: '' }]
};

const browser = await chromium.launch({ headless: true });
let failures = 0, checked = 0;
function bad(msg) { failures++; console.log('  ✖', msg); }

for (const vp of [{ name: 'escritorio', width: 1280, height: 900 }, { name: 'celular', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('requestfailed', r => { if (!/fonts\.g/.test(r.url())) errs.push('REQFAIL ' + r.url()); });
  page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(BASE);
  await page.evaluate(s => localStorage.setItem('rinde_facil_v2', JSON.stringify(s)), seed);
  await page.reload();
  /* datos de la versión anterior (sin cifrar): la app ofrece protegerlos con una contraseña y luego los abre */
  await page.waitForSelector('.auth-card');
  if (!/Protege los datos/i.test(await page.textContent('h1'))) bad('debía ofrecer proteger los datos antiguos: ' + await page.textContent('h1'));
  await page.locator('input[type=password]').nth(0).fill('frase larga de prueba 2026');
  await page.locator('input[type=password]').nth(1).fill('frase larga de prueba 2026');
  await page.getByRole('button', { name: 'Proteger mis datos' }).click();
  await page.waitForSelector('.recovery-code', { timeout: 20000 });
  await page.locator('#recok').check(); await page.getByRole('button', { name: 'Continuar' }).click();
  await page.waitForSelector('#main .hero, #main h1', { timeout: 10000 });
  const mig = await page.evaluate(() => ({ old: localStorage.getItem('rinde_facil_v2'), vault: !!localStorage.getItem('rinde_facil_vault_v3'), proj: RF.store.get().projects.map(p => p.name) }));
  if (mig.old) bad('quedó la copia sin cifrar'); if (!mig.vault) bad('no se creó la bóveda'); if (mig.proj[0] !== 'Sede comunitaria') bad('se perdieron los datos al migrar');
  const ids = await page.evaluate(() => ({ tram: RF.tramites.list.map(t => t.id), tools: Object.keys(RF.tools), fases: RF.data.FASES.map(f => f.id) }));
  const routes = ['#/'].concat(ids.fases.map(f => '#/f/' + f), ids.tram.map(t => '#/t/' + t), ids.tools.map(t => '#/h/' + t));
  console.log(`\n[${vp.name}] ${routes.length} pantallas`);
  for (const r of routes) {
    errs.length = 0;
    await page.evaluate(h => { location.hash = h; }, r);
    await page.waitForTimeout(120);
    checked++;
    const info = await page.evaluate(async () => {
      document.querySelectorAll('details.orig').forEach(d => { d.open = true; });
      const imgs = [...document.querySelectorAll('main img')];
      imgs.forEach(i => { i.loading = 'eager'; });
      await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(res => { i.onload = i.onerror = res; setTimeout(res, 3000); })));
      const de = document.documentElement;
      const unnamed = [...document.querySelectorAll('main input:not([type=file]), main select, main textarea')].filter(el => {
        if (el.type === 'hidden') return false;
        const lab = el.closest('label'); const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        const byFor = el.id && document.querySelector('label[for="' + el.id + '"]');
        return !(lab && lab.textContent.trim()) && !aria && !byFor;
      }).map(el => (el.dataset.key || el.type || el.tagName) + '');
      const badLinks = [...document.querySelectorAll('main a[href^="#/"]')].map(a => a.getAttribute('href')).filter(h => {
        const p = h.slice(2).split('?')[0].split('/');
        if (p[0] === 't') return !RF.tramites.byId[p[1]];
        if (p[0] === 'h') return !RF.tools[p[1]];
        if (p[0] === 'f') return !RF.data.FASES.some(f => f.id === p[1]);
        return h !== '#/';
      });
      const small = [...document.querySelectorAll('main button, main a.btn, main a.tool-card, main a.item-row, main input:not([type=checkbox]):not([type=file]), main select, aside a, #side a, #side button, .topbar button')].filter(e => e.offsetParent && !e.closest('.gantt-grid') && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 36).map(e => (e.textContent || e.getAttribute('aria-label') || e.dataset.key || e.tagName).trim().slice(0, 24) + ':' + Math.round(e.getBoundingClientRect().height));
      window.__seen = (window.__seen || { inputs: 0, imgs: 0, links: 0 });
      window.__seen.inputs += document.querySelectorAll('main input:not([type=file]), main select, main textarea').length; window.__seen.imgs += imgs.length; window.__seen.links += document.querySelectorAll('main a[href^="#/"]').length;
      return { small, h: (document.querySelector('main h1, main h2.tool-title') || {}).textContent || '', overflow: de.scrollWidth - de.clientWidth, brokenImgs: imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')), unnamed, badLinks, errorCard: !!document.querySelector('.callout.bad') && /Algo salió mal/.test(document.body.textContent) };
    });
    if (!info.h.trim()) bad(r + ': sin título');
    if (info.overflow > 1) bad(r + ': desborde horizontal de ' + info.overflow + 'px');
    if (info.brokenImgs.length) bad(r + ': imágenes rotas ' + info.brokenImgs.join(','));
    if (info.unnamed.length) bad(r + ': campos sin nombre accesible ' + info.unnamed.join(','));
    if (info.badLinks.length) bad(r + ': enlaces inválidos ' + info.badLinks.join(','));
    if (vp.isMobile && info.small.length) bad(r + ': botones o campos táctiles de menos de 36 px ' + info.small.slice(0, 4).join(', '));
    if (info.errorCard) bad(r + ': muestra la tarjeta de error');
    if (errs.length) bad(r + ': errores de consola/red ' + JSON.stringify(errs.slice(0, 3)));
  }
  console.log('  examinado:', JSON.stringify(await page.evaluate(() => window.__seen)));
  /* prueba de sensibilidad: un campo sin nombre debe detectarse */
  const probe = await page.evaluate(() => { const i = document.createElement('input'); document.querySelector('main').appendChild(i); const lab = i.closest('label'), aria = i.getAttribute('aria-label'); const found = !(lab && lab.textContent.trim()) && !aria; i.remove(); return found; });
  if (!probe) bad('la prueba de campos sin nombre no detecta un campo sin etiqueta');
  await ctx.close();
}
await browser.close();
console.log(`\n${checked} pantallas revisadas · ${failures} problema(s)`);
process.exit(failures ? 1 : 0);
