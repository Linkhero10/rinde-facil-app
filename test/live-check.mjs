/* Comprueba la app publicada (GitHub Pages) con un navegador real. */
import { createRequire } from 'node:module';
const { chromium } = createRequire('D:/SMI/_FARO/runtime/package.json')('playwright');
const URL_LIVE = process.env.RF_LIVE || 'https://linkhero10.github.io/rinde-facil-app/';
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
let status = 0;
for (let i = 0; i < 30; i++) { const r = await page.goto(URL_LIVE).catch(() => null); status = r ? r.status() : 0; if (status === 200) break; await page.waitForTimeout(6000); }
console.log('estado HTTP:', status);
if (status !== 200) { await browser.close(); process.exit(2); }
await page.waitForSelector('#main');
console.log('h1:', await page.textContent('h1'));
await page.getByLabel('Nombre de tu comunidad').fill('Comunidad de Prueba');
await page.getByRole('button', { name: 'Empezar' }).click();
await page.waitForSelector('.hero');
await page.evaluate(() => { location.hash = '#/t/TRM-008'; });
await page.waitForSelector('.steps');
await page.locator('details.orig summary').click();
await page.waitForTimeout(800);
const img = await page.evaluate(() => [...document.querySelectorAll('.orig img')].map(i => [i.getAttribute('src'), i.naturalWidth]));
console.log('imágenes:', JSON.stringify(img));
const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i); });
console.log('fuentes cargadas:', fonts.join(', '));
const sw = await page.evaluate(async () => { try { const r = await navigator.serviceWorker.getRegistration(); return r ? 'registrado' : 'sin registro'; } catch (e) { return 'error'; } });
console.log('service worker:', sw);
console.log('errores:', JSON.stringify(errs));
await page.screenshot({ path: 'D:/Temp/felip/claude/D--/abfc786f-cb73-42ec-bcbc-6654ab03f71c/scratchpad/shots/live-tramite.png' });
await browser.close();
process.exit(errs.length || img.some(x => !x[1]) ? 1 : 0);
