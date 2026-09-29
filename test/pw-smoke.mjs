import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire('D:/SMI/_FARO/runtime/package.json')('playwright');
import path from 'node:path';
const base = process.env.RF_URL || 'http://127.0.0.1:8790/index.html';
const outDir = process.env.RF_SHOTS || 'D:/Temp/felip/claude/D--/abfc786f-cb73-42ec-bcbc-6654ab03f71c/scratchpad/shots';
fs.mkdirSync(outDir, { recursive: true });
const candidates = [undefined];
for (const rev of ['1234', '1228', '1223']) {
  const p = process.env.LOCALAPPDATA + '/ms-playwright/chromium-' + rev + '/chrome-win/chrome.exe';
  if (fs.existsSync(p)) candidates.push(p);
}
let browser, used;
for (const exe of candidates) {
  try { browser = await chromium.launch({ headless: true, executablePath: exe }); used = exe || 'default'; break; } catch (e) { console.log('launch fail', exe || 'default', String(e.message).split('\n')[0]); }
}
if (!browser) { console.log('NO BROWSER'); process.exit(2); }
console.log('browser:', used, browser.version());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
await page.goto(base);
await page.waitForSelector('#main');
await page.screenshot({ path: path.join(outDir, 'home-onboarding.png') });
console.log('title:', await page.title());
console.log('h1:', await page.textContent('h1'));
console.log('errors:', JSON.stringify(errors));
await browser.close();
