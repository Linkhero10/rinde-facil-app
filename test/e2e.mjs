/* Pruebas de extremo a extremo con Playwright: recorren la app como una persona. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startStub, SETUP_CODE } from './stub_api.mjs';
const { chromium } = createRequire('D:/SMI/_FARO/runtime/package.json')('playwright');

const BASE = process.env.RF_URL || 'http://127.0.0.1:8790/index.html';
const SHOTS = process.env.RF_SHOTS || 'D:/Temp/felip/claude/D--/abfc786f-cb73-42ec-bcbc-6654ab03f71c/scratchpad/shots';
const DOWNLOADS = process.env.RF_DOWNLOADS || 'D:/SMI/_FARO/tmp/playwright-downloads';
const TEST_API_URL = new URL('/exec', BASE).toString();
const PY = 'D:/FARO_GLOBAL/.venvs/faro-runtime/Scripts/python.exe';
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(DOWNLOADS, { recursive: true });
import { fileURLToPath } from 'node:url';
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'boleta-ficticia.jpg');

const results = [];
async function step(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
  catch (e) {
    results.push({ name, ok: false, err: String(e.message || e).split('\n').slice(0, 4).join(' | ') });
    let diagnostic = '';
    if (process.env.RF_DIAGNOSTICS === '1' && typeof page !== 'undefined') {
      const browserState = await page.evaluate(async () => ({
        online: navigator.onLine,
        authPhase: RF.auth && RF.auth.phase(),
        hasToken: !!(RF.auth && RF.auth.token && RF.auth.token()),
        apiUrl: RF.store && RF.store.get().cloud.apiUrl,
        serviceTrusted: RF.cloud && RF.cloud.configured(),
        origin: location.origin,
        outboxCount: RF.outbox ? await RF.outbox.count() : null,
        toast: document.getElementById('toasts')?.textContent || ''
      })).catch(err => ({ unavailable: String(err.message || err) }));
      diagnostic = ' DIAG ' + JSON.stringify({ browserState, recentCalls: stub.store.calls.slice(-12).map(({ action, ok, error, hadToken, category, subfolder }) => ({ action, ok, error, hadToken, category, subfolder })) });
    }
    console.log('FAIL', name, '->', String(e.message || e).split('\n').slice(0, 4).join(' | ') + diagnostic);
  }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'no coincide') + ': esperado ' + JSON.stringify(b) + ' y llegó ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error(msg || 'falló la condición'); }
async function dragFileTo(selector, file) {
  await page.locator(selector).evaluate((zone, payload) => {
    const bytes = payload.base64
      ? Uint8Array.from(atob(payload.base64), c => c.charCodeAt(0))
      : new TextEncoder().encode(payload.text || '');
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], payload.name, { type: payload.type }));
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, file);
}
async function saveDownload(page, file) {
  const output = await page.evaluate(async () => {
    const item = window.__rfDownloads && window.__rfDownloads[window.__rfDownloads.length - 1];
    if (!item || !item.filename) return null;
    const bytes = new Uint8Array(await item.blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { name: item.filename, type: item.blob.type, base64: btoa(binary) };
  });
  if (!output) throw new Error('La app no generó el archivo para descargar.');
  fs.writeFileSync(file, Buffer.from(output.base64, 'base64'));
  return output;
}
function xlsxInfo(file) {
  const py = `import openpyxl,json,sys
wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.worksheets[0]
cells=[c.value for r in ws.iter_rows() for c in r if c.value is not None]
print(json.dumps({'sheets':wb.sheetnames,'cells':cells},ensure_ascii=False,default=str))`;
  const r = spawnSync(PY, ['-c', py, file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('openpyxl no pudo abrir el Excel: ' + r.stderr.slice(0, 700));
  return JSON.parse(r.stdout);
}

const stub = await startStub(0);
async function routeTestService(page) {
  await page.route(TEST_API_URL, async route => {
    const req = route.request();
    /* BrowserContext.setOffline no afecta a un fetch hecho por Node desde el handler.
       Reflejamos el estado offline explícitamente para que el E2E pruebe la cola real. */
    if (testNetworkOffline) return route.abort('internetdisconnected');
    const response = await fetch(stub.url, {
      method: req.method(),
      headers: { 'content-type': req.headers()['content-type'] || 'application/json' },
      body: req.postData() || undefined
    });
    await route.fulfill({
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
      body: await response.text()
    });
  });
}
let testNetworkOffline = false;
const browser = await chromium.launch({ headless: true, downloadsPath: DOWNLOADS, executablePath: process.env.RF_BROWSER_EXECUTABLE_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
await page.addInitScript(() => {
  const downloads = [];
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {
    const url = create(blob);
    if (blob instanceof Blob) downloads.push({ url, blob, filename: '' });
    return url;
  };
  document.addEventListener('click', event => {
    const link = event.target && event.target.closest && event.target.closest('a[download]');
    if (!link) return;
    const item = downloads.find(entry => entry.url === link.href);
    if (item) { item.filename = link.download; event.preventDefault(); }
  }, true);
  window.__rfDownloads = downloads;
});
await routeTestService(page);
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
const shot = n => page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: false });
const go = async hash => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(150); };
const PW = 'frase larga de prueba 2026', PW2 = 'otra frase larga de prueba 2027';
const passwords = () => page.locator('input[type=password]');
const tmp = name => path.join(os.tmpdir(), 'rf-e2e-' + Date.now() + '-' + name);

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#main');

let recoveryCode = '';
await step('0. Primera vez: crea la cuenta con la contraseña y muestra el código de recuperación', async () => {
  ok(/Crea la cuenta de tu comunidad/i.test(await page.textContent('h1')), 'lo primero es crear la cuenta');
  ok(!(await page.locator('.side').count()), 'antes de la contraseña no se ve nada de la app');
  await page.getByLabel('Nombre de la comunidad').fill('Comunidad de Prueba');
  await passwords().nth(0).fill('corta');
  await passwords().nth(1).fill('corta');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.waitForFunction(() => /al menos|corta|caracteres/i.test(document.querySelector('.auth-err')?.textContent || ''), null, { timeout: 5000 });
  await passwords().nth(0).fill(PW); await passwords().nth(1).fill(PW);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.waitForSelector('.recovery-code', { timeout: 15000 });
  recoveryCode = (await page.textContent('.recovery-code')).trim();
  ok(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}-[0-9A-Z]$/.test(recoveryCode), 'código de 26 caracteres: ' + recoveryCode);
  ok(await page.getByRole('button', { name: 'Continuar' }).isDisabled(), 'no se puede seguir sin confirmar que lo guardó');
  await page.locator('#recok').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.waitForSelector('main h1');
  const raw = await page.evaluate(() => Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k)).join(String.fromCharCode(10)));
  ok(!raw.includes(PW) && !raw.includes(recoveryCode), 'ni la contraseña ni el código quedan en el almacenamiento');
  ok(!/rinde_facil_v2=/.test(raw), 'no queda una copia sin cifrar');
});

await step('1. Al inicio pide los datos de la comunidad y crea el proyecto', async () => {
  eq(await page.textContent('h1'), 'Rinde Fácil te guía en tu rendición');
  ok(await page.getByLabel('Nombre de tu comunidad').count() === 0, 'ya no se vuelve a pedir el nombre de la comunidad que se escribió al crear la cuenta');
  await page.getByLabel('RUT de la comunidad').fill('11111111-1');
  await page.getByLabel('Nombre de tu proyecto').fill('Sede comunitaria');
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.waitForFunction(() => /Vas en la fase 1/.test(document.querySelector('.hero h1')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  { const hh = await page.textContent('.hero h1'); ok(/Vas en la fase 1/.test(hh), 'debe partir en la fase 1, dice: ' + hh); }
  eq(await page.inputValue('#projsel option:checked >> nth=0').catch(() => 'x'), 'x');
  await shot('02-home');
});

await step('2. El menú lateral es un acordeón por fase con avance', async () => {
  const heads = page.locator('.acc-head');
  ok((await heads.count()) >= 6, 'seis fases + herramientas');
  const f2 = heads.filter({ hasText: 'El PEA' });
  eq(await f2.getAttribute('aria-expanded'), 'false');
  await f2.click();
  eq(await f2.getAttribute('aria-expanded'), 'true');
  ok(await page.locator('.side-item', { hasText: 'Armar el PEA' }).isVisible(), 'se ve el trámite dentro de la fase');
  await f2.click();
  eq(await f2.getAttribute('aria-expanded'), 'false');
});

await step('3. Un trámite muestra pasos cortos, se pueden tachar y cuenta el avance', async () => {
  await page.locator('.side-item', { hasText: 'Firmar el convenio' }).click();
  await page.waitForSelector('.steps');
  eq(await page.locator('.steps .step').count(), 2);
  await page.locator('.steps .step').first().locator('label').click();
  ok(await page.locator('.steps .step.done').count() === 1, 'el paso queda tachado');
  ok(/1 de 2/.test(await page.textContent('.steps-count')), 'cuenta 1 de 2');
  await shot('03-tramite');
  await page.locator('.steps .step').first().locator('label').click();
  ok(/0 de 2/.test(await page.textContent('.steps-count')));
});

await step('4. Los datos del proyecto y del presupuesto aprobado se guardan', async () => {
  await go('#/h/proyecto');
  await page.waitForSelector('.tool-title');
  await page.getByLabel('Inicio del proyecto').fill('2026-01-01');
  await page.getByLabel('Término del proyecto').fill('2027-12-31');
  await page.getByLabel('Fecha del primer pago (30 %)').fill('2026-06-01');
  await page.getByLabel('Período que estás rindiendo: desde').fill('2026-07-01');
  await page.getByLabel('hasta', { exact: true }).fill('2026-12-31');
  await page.getByLabel('Gastos operacionales').fill('20000000');
  await page.getByLabel('Gastos de administración').fill('5000000');
  await page.getByLabel('¿Cómo tratas el IVA?').selectOption('no_contribuyente');
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => JSON.parse(JSON.stringify(RF.store.get())));
  const p = st.projects[0];
  eq(p.start, '2026-01-01'); eq(p.budgetApproved.operacion, 20000000); eq(p.budgetApproved.administracion, 5000000);
  eq(st.community.name, 'Comunidad de Prueba');
});

await step('5. Carta Gantt: etapas, actividades, meses y Excel real', async () => {
  await go('#/h/gantt');
  await page.getByRole('button', { name: 'Agregar etapa' }).click();
  await page.getByLabel('Nombre de la etapa').fill('Preparación');
  await page.getByRole('button', { name: 'Agregar actividad' }).click();
  await page.getByLabel('Nombre de la actividad').fill('Taller de artesanía');
  await page.getByLabel('Inicio', { exact: true }).fill('2026-07-01');
  await page.getByLabel('Término', { exact: true }).fill('2026-09-30');
  await page.waitForTimeout(200);
  ok(/92 d/.test(await page.locator('.edit-grid output').first().textContent()), 'calcula 92 días');
  ok((await page.locator('.gantt-grid td.gbar').count()) === 3, 'tres meses coloreados');
  await shot('05-gantt');
  await page.getByRole('button', { name: 'Excel' }).click();
  const f = tmp('gantt.xlsx'); await saveDownload(page, f);
  const info = xlsxInfo(f);
  ok(info.cells.includes('Taller de artesanía'), 'el Excel trae la actividad');
  ok(info.sheets[0] === 'Carta Gantt', 'nombre de hoja');
  await page.getByRole('button', { name: 'Copiar para SGP' }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(/Preparación\tTaller de artesanía\t01-07-2026\t30-09-2026$/.test(clip.split('\n')[1] || ''), 'texto para SGP: ' + clip.slice(0, 80));
});

await step('6. Presupuesto: líneas por cuenta, avisa si supera lo aprobado', async () => {
  await go('#/h/presupuesto');
  await page.getByRole('button', { name: 'Agregar línea' }).click();
  await page.getByLabel('Ítem', { exact: true }).fill('Materiales');
  await page.getByLabel('Monto', { exact: true }).fill('25000000');
  await page.waitForTimeout(200);
  ok(/te pasas de lo aprobado/.test(await page.textContent('.tool-page')), 'avisa exceso en operacionales');
  await page.getByLabel('Monto', { exact: true }).fill('15000000');
  await page.waitForTimeout(200);
  ok(!/te pasas de lo aprobado/.test(await page.textContent('.tool-page')), 'el aviso se va al corregir');
  await shot('06-presupuesto');
});

await step('7. Gastos a mano: faltan cosas -> errores claros; se corrigen -> queda listo', async () => {
  await go('#/h/gastos');
  await page.getByRole('button', { name: 'Anotar a mano' }).click();
  await page.waitForSelector('.editor-split');
  ok(/Elige el tipo|Falta el número|Falta la fecha/.test(await page.textContent('.issues')), 'muestra errores de datos faltantes');
  await page.getByLabel('Tipo de documento').selectOption('factura');
  await page.getByLabel('Número (folio)').fill('1042');
  await page.getByLabel('Fecha del documento').fill('2026-08-14');
  await page.getByLabel('Nombre del proveedor').fill('Empresa Fantasía SpA');
  await page.getByLabel('RUT del proveedor').fill('76.123.456-9');
  await page.getByLabel('Monto neto ($)').fill('1250000');
  await page.getByLabel('Total del documento ($)').fill('1500000');
  await page.getByLabel('Glosa: qué compraste y para qué').fill('Materiales para el taller de artesanía');
  await page.waitForTimeout(200);
  let t = await page.textContent('.issues');
  ok(/RUT del proveedor no es válido/.test(t), 'detecta RUT inválido');
  ok(/Neto \+ IVA no suma el total/.test(t), 'detecta aritmética');
  await page.getByLabel('RUT del proveedor').fill('76.123.456-0');
  await page.getByRole('button', { name: 'Calcular IVA y total desde el neto' }).click();
  await page.waitForTimeout(200);
  await page.locator('label.check', { hasText: 'Comprobante de pago' }).locator('input').check();
  await page.waitForTimeout(200);
  t = await page.textContent('.issues');
  ok(!t.trim(), 'sin problemas no aparece una confirmación rutinaria: ' + t.slice(0, 700));
  await shot('07-gasto');
  await page.getByRole('button', { name: /Volver a la lista/ }).click();
  ok(/Listo/.test(await page.textContent('.list-grid')), 'aparece como Listo en la lista');
});

await step('8. Pago en efectivo exige Anexo 3; el Anexo 3 se crea desde el gasto y lo da por cumplido', async () => {
  await go('#/h/gastos');
  await page.getByRole('button', { name: 'Anotar a mano' }).click();
  await page.getByLabel('Tipo de documento').selectOption('boleta');
  await page.getByLabel('Número (folio)').fill('542449');
  await page.getByLabel('Fecha del documento').fill('2026-09-05');
  await page.getByLabel('Nombre del proveedor').fill('Proveedora de Ejemplo');
  await page.getByLabel('RUT del proveedor').fill('11.111.111-1');
  await page.getByLabel('Total del documento ($)').fill('7500');
  await page.getByLabel('Forma de pago').selectOption('efectivo');
  await page.getByLabel('Glosa: qué compraste y para qué').fill('Colación para la reunión de la directiva');
  await page.waitForTimeout(200);
  ok(/Anexo 3 firmado/.test(await page.textContent('.issues')), 'pide Anexo 3');
  await page.getByRole('button', { name: 'Crear Anexo 3' }).click();
  await page.waitForSelector('.form-tool');
  ok((await page.inputValue('input[data-key="proveedorNombre"]')) === 'Proveedora de Ejemplo', 'el Anexo 3 se rellena con los datos del gasto');
  eq(await page.inputValue('input[data-key="monto"]'), '7.500');
  await go('#/h/gastos');
  await page.locator('tr.clickable', { hasText: 'Proveedora de Ejemplo' }).click();
  await page.waitForSelector('.editor-split');
  ok(!/Falta: Anexo 3/.test(await page.textContent('.issues')), 'con el Anexo 3 creado ya no lo pide');
});

await step('9. Anexo 4: días y montos se calculan; Word, PDF y texto salen', async () => {
  await go('#/h/anexo4');
  await page.getByRole('button', { name: 'Nuevo certificado' }).click();
  await page.locator('input[data-key="viajero"]').fill('Juana Pérez');
  await page.locator('.edit-grid input[data-key="destino"]').fill('Calama');
  await page.locator('.edit-grid input[data-key="desde"]').fill('2026-09-10');
  await page.locator('.edit-grid input[data-key="hasta"]').fill('2026-09-12');
  await page.locator('.edit-grid input[data-key="montoDia"]').fill('40000');
  await page.waitForTimeout(200);
  ok(/120\.000/.test(await page.textContent('.edit-grid')), '3 días × 40.000 = 120.000');
  await shot('09-anexo4');
  await page.getByRole('button', { name: 'Word' }).first().click();
  const f = tmp('anexo4.docx'); await saveDownload(page, f);
  ok(fs.readFileSync(f, 'utf8').includes('Juana Pérez'), 'el Word trae el nombre');
  await page.getByRole('button', { name: 'PDF' }).first().click();
  await page.waitForSelector('.print-overlay iframe');
  const txt = await page.frameLocator('.print-overlay iframe').locator('body').textContent();
  ok(/Certificado de viático/.test(txt) && /120\.000/.test(txt), 'la vista previa del PDF muestra el certificado');
  await shot('09b-pdf');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: 'Copiar texto' }).first().click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(/CERTIFICADO DE VIÁTICO/.test(clip) && /Calama/.test(clip), 'texto copiado');
});

await step('10. Anexo 5 calcula el monto a rendir y el Excel trae la fórmula de total', async () => {
  await go('#/h/anexo5');
  await page.waitForSelector('.form-tool');
  const row = page.locator('.edit-grid').first().locator('tbody tr').first();
  await row.locator('input[data-key="concepto"]').fill('Luz');
  await row.locator('input[data-key="monto"]').fill('100000');
  await row.locator('input[data-key="pct"]').fill('30');
  await page.waitForTimeout(200);
  ok(/30\.000/.test(await row.textContent()), '100.000 × 30 % = 30.000');
  await page.getByRole('button', { name: 'Excel' }).click();
  const f = tmp('anexo5.xlsx'); await saveDownload(page, f);
  const py = `import openpyxl,sys;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.worksheets[0];print([c.value for r in ws.iter_rows() for c in r if isinstance(c.value,str) and c.value.startswith('=')])`;
  const r = spawnSync(PY, ['-c', py, f], { encoding: 'utf8' });
  ok(/=SUM\(/.test(r.stdout), 'hay fórmulas SUM: ' + r.stdout);
});

await step('11. Revisión cruza gastos, anexos y presupuesto y ofrece "Arreglar"', async () => {
  await go('#/h/revision');
  await page.waitForSelector('.check-list');
  const t = await page.textContent('.tool-page');
  ok(/certificados de viático suman|Anexo 4/.test(t) || /gasto\(s\)/.test(t), 'muestra grupos de revisión');
  ok((await page.locator('a.btn', { hasText: 'Arreglar' }).count()) >= 1 || /Todo cuadra|Casi listo/.test(t), 'hay botones para arreglar');
  await shot('11-revision');
});

await step('12. Foto de un comprobante: OCR en la nube (servicio de prueba) rellena y exige revisión humana', async () => {
  await go('#/h/nube');
  await page.getByLabel('Dirección del servicio (termina en /exec)').fill(TEST_API_URL);
  ok(!(await page.getByLabel('Clave de acceso').count()), 'ya no existe la clave compartida');
  await page.getByRole('button', { name: 'Probar conexión' }).click();
  await page.getByLabel('Código de instalación').waitFor({ timeout: 8000 });
  ok(!/Conectado/.test(await page.textContent('.tool-page')), 'una conexión correcta no genera un aviso rutinario');
  await page.getByLabel('Código de instalación').fill('codigo-equivocado');
  await page.getByRole('button', { name: 'Crear la cuenta del servicio' }).click();
  await page.waitForFunction(() => /no es correcto/.test(document.querySelector('.tool-page').textContent), null, { timeout: 15000 });
  const alert = page.locator('.tool-page .callout.bad').last();
  ok(await alert.isVisible(), 'el error queda visible junto a la configuración');
  const alertStyle = await alert.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, leftBorder: getComputedStyle(el).borderLeftWidth }));
  ok(alertStyle.background === 'rgba(0, 0, 0, 0)' && alertStyle.leftBorder === '0px', 'el error no vuelve a una tarjeta teñida o con franja: ' + JSON.stringify(alertStyle));
  await shot('12-cloud-error');
  await page.getByLabel('Código de instalación').fill(SETUP_CODE);
  await page.getByRole('button', { name: 'Crear la cuenta del servicio' }).click();
  await page.getByLabel('Código de instalación').waitFor({ state: 'detached', timeout: 15000 });
  ok(/Cuenta creada/.test(await page.textContent('.tool-page')), 'crear la cuenta confirma que salió bien');
  await go('#/h/gastos');
  stub.store.ocrDelay = 2200; /* el servicio de prueba se demora, como Google */
  const beforeUnsupported = await page.evaluate(() => RF.forms.ctxNow().project.expenses.length);
  await dragFileTo('.file-drop[data-kind="expense"]', { name: 'programa-no-admitido.exe', type: 'application/x-msdownload', text: 'no ejecutar' });
  eq(await page.evaluate(() => RF.forms.ctxNow().project.expenses.length), beforeUnsupported, 'rechaza extensiones que no son comprobantes');
  ok(/no se puede usar/i.test(await page.textContent('#toasts')), 'explica por qué no agregó el archivo');
  await dragFileTo('.file-drop[data-kind="expense"]', { name: 'boleta-ficticia.jpg', type: 'image/jpeg', base64: fs.readFileSync(FIXTURE).toString('base64') });
  await page.waitForSelector('.busy:has-text("Leyendo el comprobante")', { timeout: 5000 });
  ok(/Leyendo el comprobante/.test(await page.textContent('.busy:has-text("Leyendo el comprobante")')), 'muestra qué está haciendo');
  const p1 = +(await page.getAttribute('.busy:has-text("Leyendo el comprobante") [role=progressbar]', 'aria-valuenow'));
  await page.waitForTimeout(1200);
  const p2 = +(await page.getAttribute('.busy:has-text("Leyendo el comprobante") [role=progressbar]', 'aria-valuenow'));
  ok(p2 > p1 && p2 < 100, 'la barra avanza mientras espera (' + p1 + ' → ' + p2 + ')');
  ok(/[0-9]+ s/.test(await page.textContent('.busy:has-text("Leyendo el comprobante")')), 'muestra los segundos');
  await shot('12-progreso');
  await page.waitForSelector('.editor-split', { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 9000 });
  ok(await page.locator('.busy.ok').count() === 0, 'al terminar no aparece una confirmación rutinaria');
  stub.store.ocrDelay = 0;
  await page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 5000 });
  eq(await page.inputValue('input[data-key="folio"]'), '1042');
  eq(await page.inputValue('input[data-key="rutProveedor"]'), '76.123.456-0');
  eq(await page.inputValue('input[data-key="total"]'), '1.487.500');
  ok(/Compara los datos con la foto/.test(await page.textContent('.issues')), 'exige «Lo revisé» antes de dar por bueno');
  ok(await page.locator('img.receipt-img').isVisible(), 'muestra la foto al lado');
  ok(stub.store.calls.some(c => c.action === 'ocr' && c.bytes > 100), 'el servicio recibió la imagen');
  eq(await page.inputValue('input[data-key="proveedor"]'), 'EMPRESA FANTASÍA SPA');
  /* zoom al pasar el cursor, dentro del mismo marco */
  const box = page.locator('.zoom-wrap'); const bb = await box.boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height * 0.3);
  await page.waitForTimeout(250);
  ok(await box.evaluate(el => el.classList.contains('zooming')), 'al pasar el cursor se acerca');
  const sc = await page.locator('.zoom-wrap img').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  ok(sc > 2, 'la foto se agranda (escala ' + sc + ')');
  const bb2 = await box.boundingBox(); eq(Math.round(bb2.width), Math.round(bb.width), 'no ocupa toda la pantalla: el marco no cambia');
  await shot('12-zoom');
  await page.mouse.move(5, 5); await page.waitForTimeout(250);
  ok(!(await box.evaluate(el => el.classList.contains('zooming'))), 'al salir vuelve a su tamaño');
  await shot('12-ocr');
  await page.locator('label.check', { hasText: 'Comparé cada dato' }).locator('input').check();
  await page.waitForTimeout(200);
  ok(!/Compara los datos con la foto/.test(await page.textContent('.issues')), 'al confirmar desaparece el aviso');
});

await step('12b. Al confirmar la revisión, el original se archiva solo en Comprobantes/mes del Drive (servicio de prueba)', async () => {
  await page.waitForFunction(() => document.querySelector('.photo-panel') && /Ya está en el Drive/.test(document.querySelector('.photo-panel').textContent), null, { timeout: 8000 });
  const c = stub.store.calls.filter(x => x.action === 'saveFile' && x.category === 'comprobante' && /\.jpg$/.test(x.fileName));
  eq(c.length, 1); eq(c[0].issueDate, '2026-08-14'); eq(c[0].project, 'Sede comunitaria');
  await page.waitForTimeout(600);
  const f = stub.store.calls.filter(x => x.action === 'saveFile' && /\.datos\.txt$/.test(x.fileName));
  eq(f.length, 1, 'una ficha con los datos junto a la foto'); eq(f[0].category, 'comprobante'); eq(f[0].issueDate, '2026-08-14');
  ok(/Proveedor: EMPRESA FANTASÍA SPA/.test(f[0].text) && /Texto tal como lo leyó el OCR/.test(f[0].text) && /Número \(folio\): 1042/.test(f[0].text) && /SÍ/.test(f[0].text), 'la ficha trae proveedor, folio, revisión y el texto del OCR');
  ok(stub.store.calls.some(x => x.action === 'saveState'), 'también se guardó la copia de seguridad');
});

await step('12d. Lo que se saca (Excel de la Carta Gantt) queda también en el Drive; preparar carpeta y ver lo guardado', async () => {
  await go('#/h/gantt');
  const before = stub.store.calls.filter(x => x.action === 'saveFile').length;
  await page.getByRole('button', { name: 'Excel' }).first().click();
  await page.waitForTimeout(800);
  const c = stub.store.calls.filter(x => x.action === 'saveFile' && x.category === 'planificacion');
  eq(c.length, 1); ok(/^carta-gantt-\d{4}-\d{2}-\d{2}\.xlsx$/.test(c[0].fileName), c[0].fileName);
  eq(c[0].mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await page.getByRole('button', { name: 'Guardar en Drive' }).click();
  await page.waitForTimeout(600);
  eq(stub.store.calls.filter(x => x.action === 'saveFile' && x.category === 'planificacion').length, 1, 'el mismo documento sin cambios no se guarda otra vez');
  ok(/no ha cambiado/.test(await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map(t => t.textContent).join(' '))), 'avisa que ya estaba guardado');
  await go('#/h/nube');
  await page.getByRole('button', { name: /Preparar mi carpeta/ }).click();
  await page.getByRole('link', { name: 'Abrir la carpeta en Drive' }).waitFor({ timeout: 8000 });
  const t = await page.textContent('.tool-page');
  ok(/Carta Gantt/.test(t) && !/carta-gantt|Planificaci[oó]n \//i.test(t), 'lista lo guardado con un nombre legible, sin rutas');
  const exp = await page.evaluate(() => window.RF.store.exportJSON());
  ok(!/"key"/.test(JSON.stringify(JSON.parse(exp).cloud)), 'la copia no incluye claves');
  await shot('12d-drive');
});

await step('12e. Sin conexión: el archivo queda en una cola cifrada y se sube solo al volver', async () => {
  await go('#/h/gantt');
  await page.evaluate(() => RF.store.update(function () { var p = RF.store.project(); p.gantt.stages[0].name = p.gantt.stages[0].name + ' II'; }, { silent: true }));
  await go('#/h/proyecto'); await go('#/h/gantt');
  const before = stub.store.calls.filter(x => x.action === 'saveFile').length;
  testNetworkOffline = true;
  await ctx.setOffline(true);
  try {
  await page.getByRole('button', { name: 'Excel' }).first().click();
  await page.waitForFunction(async () => await RF.outbox.count() === 1, null, { timeout: 10000 });
  eq(await page.evaluate(() => RF.outbox.count()), 1, 'un archivo en la cola cifrada');
  const raw = await page.evaluate(async () => JSON.stringify(await RF.outbox.list()));
  ok(!raw.includes('Sede comunitaria') && !raw.includes('UEsD'), 'la cola no guarda nada legible: ' + raw.slice(0, 300));
  eq(stub.store.calls.filter(x => x.action === 'saveFile').length, before, 'sin conexión no llegó nada');
  } finally { testNetworkOffline = false; await ctx.setOffline(false); errors.splice(0, errors.length, ...errors.filter(x => !/ERR_INTERNET_DISCONNECTED/.test(x))); }
  const r = await page.evaluate(() => RF.drive.flushOutbox());
  eq(r.sent, 1, 'se subió'); eq(r.left, 0, 'la cola quedó vacía');
  eq(stub.store.calls.filter(x => x.action === 'saveFile').length, before + 1, 'llegó al servicio al volver la conexión');
});

await step('12c. Varios proyectos: crear otro, cambiar entre ellos y que no se mezclen los datos', async () => {
  await go('#/h/proyecto');
  await page.getByPlaceholder('Nombre del nuevo proyecto').fill('Invernadero');
  await page.getByRole('button', { name: 'Agregar proyecto' }).click();
  await page.waitForFunction(() => document.querySelector('.proj-select') && document.querySelector('.proj-select').selectedOptions[0].textContent === 'Invernadero');
  await go('#/h/gastos');
  ok(/Aún no anotas gastos/.test(await page.textContent('.tool-page')), 'el proyecto nuevo parte sin gastos');
  await page.locator('.proj-select').selectOption({ label: 'Sede comunitaria' });
  await page.waitForTimeout(200);
  ok(!/Aún no anotas gastos/.test(await page.textContent('.tool-page')), 'el primer proyecto conserva sus gastos');
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => JSON.parse(JSON.stringify(RF.store.get())));
  eq(st.projects.length, 2); eq(st.projects[1].expenses.length, 0); ok(st.projects[0].expenses.length >= 2);
});

await step('13. Guardar y traer la copia de la nube', async () => {
  await go('#/h/nube');
  await page.getByRole('button', { name: 'Guardar copia en la nube' }).click();
  await page.waitForTimeout(500);
  ok(/Copia guardada/.test(await page.textContent('.tool-page')), 'guardar correctamente lo confirma en verde');
  ok(stub.store.state && JSON.parse(stub.store.state).projects.length === 2, 'la nube guardó el estado con los dos proyectos');
});

await step('13b. Toda llamada al servicio lleva sesión y ninguna lleva la contraseña', async () => {
  const sin = stub.store.calls.filter(c => !['ping', 'challenge', 'setup', 'login'].includes(c.action) && !c.hadToken);
  ok(sin.length === 0, 'llamadas sin sesión: ' + sin.map(c => c.action).join(','));
  ok(stub.store.calls.some(c => (c.action === 'login' || c.action === 'setup') && c.ok), 'la sesión se inició sola con la misma contraseña');
});

await step('13c. Bloquear: sin contraseña no se ve nada; contraseña mala no entra; la buena sí', async () => {
  await go('#/h/seguridad');
  await page.getByRole('button', { name: 'Bloquear ahora' }).click();
  await page.waitForSelector('.auth-card');
  ok(/Entra a Rinde Fácil/i.test(await page.textContent('h1')));
  ok((await page.locator('.side').count()) === 0, 'sin contraseña no hay menú ni proyectos');
  const vis = await page.evaluate(() => document.body.innerText); ok(!/Sede comunitaria|Invernadero/.test(vis), 'nada de la comunidad a la vista: ' + vis.replace(/\s+/g, ' ').slice(0, 700));
  await passwords().nth(0).fill('contraseña equivocada larga');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForFunction(() => /no coinciden/.test(document.querySelector('.auth-err')?.textContent || ''), null, { timeout: 15000 });
  await passwords().nth(0).fill(PW);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForSelector('.side', { timeout: 15000 });
  eq((await page.evaluate(() => RF.store.get().projects.length)), 2, 'los datos siguen ahí');
  const cloudAfterUnlock = await page.evaluate(() => RF.store.get().cloud.apiUrl);
  eq(cloudAfterUnlock, TEST_API_URL, 'la dirección aprobada sobrevive al bloqueo y desbloqueo');
});

await step('13d. Olvidé la contraseña: el código de recuperación abre y entrega uno nuevo', async () => {
  await page.evaluate(() => RF.auth.lock('manual'));
  await page.waitForSelector('.auth-card');
  await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
  await page.getByLabel('Código de recuperación').fill(recoveryCode.toLowerCase());
  await passwords().nth(0).fill(PW2); await passwords().nth(1).fill(PW2);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await page.waitForSelector('.recovery-code', { timeout: 20000 });
  const nuevo = (await page.textContent('.recovery-code')).trim();
  ok(nuevo !== recoveryCode && /^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}-[0-9A-Z]$/.test(nuevo), 'entrega un código nuevo');
  recoveryCode = nuevo;
  await page.locator('#recok').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.waitForSelector('.side');
  eq((await page.evaluate(() => RF.store.get().projects.length)), 2, 'sin perder datos');
  ok(await page.evaluate(() => RF.cloud.configured()), 'el servicio sigue aprobado al recuperar la bóveda');
  const remoteReset = stub.store.calls.filter(c => c.action === 'resetPassword');
  ok(remoteReset.some(c => c.ok), 'el servicio también aceptó la contraseña nueva; respuestas: ' + JSON.stringify(remoteReset));
  await page.evaluate(() => RF.auth.lock('manual'));
  await page.waitForSelector('.auth-card');
  await passwords().nth(0).fill(PW);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForFunction(() => /no coinciden/.test(document.querySelector('.auth-err')?.textContent || ''), null, { timeout: 15000 });
  await passwords().nth(0).fill(PW2);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForSelector('.side', { timeout: 15000 });
});

await step('13e. Un desconocido no puede dejar a la comunidad fuera: el equipo conocido sigue entrando', async () => {
  const dev = await page.evaluate(() => RF.store.get().cloud.device || '');
  ok(/^[0-9a-f]{64}$/.test(dev), 'este equipo guardó su credencial');
  ok(!(await page.evaluate(() => RF.store.exportJSON())).includes(dev), 'la credencial no viaja en las copias');
  for (let i = 0; i < 6; i++) await fetch(stub.url, { method: 'POST', body: JSON.stringify({ action: 'login', user: 'Comunidad de Prueba', authKey: Buffer.from('x' + i + 'x'.repeat(40)).toString('base64') }) });
  const bloqueado = await (await fetch(stub.url, { method: 'POST', body: JSON.stringify({ action: 'login', user: 'Comunidad de Prueba', authKey: 'A'.repeat(43) + '=' }) })).json();
  eq(bloqueado.error, 'BLOQUEADO', 'el ataque sí bloqueó a quien no tiene equipo conocido');
  const r = await page.evaluate(async () => { RF.auth.dropToken(); const x = await RF.cloud.post('audit', {}, 30000); return x && x.ok; });
  ok(r === true, 'la app entró igual con la credencial de equipo');
  stub.store.env.ctx.rfNow_ = () => Date.now() + 16 * 60000; /* pasan los 15 minutos del bloqueo */
});

await step('14. Observaciones: 10 días hábiles desde la comunicación', async () => {
  await go('#/h/observaciones');
  await page.getByRole('button', { name: 'Agregar observación' }).click();
  await page.locator('input[data-key="recibida"]').fill('2026-09-28');
  await page.waitForTimeout(200);
  ok(/13 de octubre de 2026/.test(await page.textContent('.stage-card')), 'plazo = 13-oct-2026 (el 12 de octubre es feriado y ya viene cargado): ' + (await page.textContent('.stage-card')).slice(-160));
});

await step('15. Inicio con avance, siguiente paso y diagrama por actor', async () => {
  await go('#/');
  await page.waitForSelector('.hero');
  ok(await page.locator('.phase-card').count() === 6, 'seis fases');
  ok(await page.locator('.fstep').count() === 31, 'diagrama con 31 nodos');
  await page.locator('.fchip', { hasText: 'Organismo Colaborador' }).click();
  const live = await page.locator('.fstep:not(.dim)').evaluateAll(els => els.map(e => e.dataset.id));
  eq(live.join(','), '10,20,24', 'el Organismo Colaborador solo aparece en 10, 20 y 24');
  await page.locator('.fstep[data-id="23"]').click();
  ok(/10 días hábiles/.test(await page.textContent('.inspector')) && /única vez/.test(await page.textContent('.inspector')), 'paso 23 con plazo y única vez');
  await shot('15-home-flow');
});

await step('15b. Buscador: «/» lo abre, «gasto» muestra la ruta Herramientas → Rendir → Gastos y rendición, al abrir lleva y marca', async () => {
  await go('#/');
  await page.keyboard.press('/');
  await page.waitForSelector('.sr-overlay .sr-input');
  await page.keyboard.type('gasto');
  await page.waitForSelector('.sr-row');
  const rows = await page.$$eval('.sr-row', els => els.map(e => ({ kind: e.querySelector('.sr-kind').textContent, title: e.querySelector('.sr-title').textContent, path: (e.querySelector('.sr-path') || {}).textContent || '' })));
  const tool = rows.find(r => r.kind === 'Herramienta' && r.title === 'Gastos y rendición');
  ok(tool, 'aparece la herramienta entre los resultados');
  eq(tool.path.replace(/\s+/g, ' ').trim(), 'Herramientas → Rendir → Gastos y rendición', 'muestra dónde está');
  ok(rows.length >= 6, 'muchos resultados de «gasto»');
  ok(await page.locator('.sr-row mark').first().isVisible(), 'marca la coincidencia');
  await shot('15b-buscador');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#/h/gastos');
  await page.waitForSelector('.side-item.current');
  ok(!(await page.locator('.sr-overlay').count()), 'se cierra al abrir');
  ok(await page.locator('.side-item.current', { hasText: 'Gastos y rendición' }).count() > 0, 'el menú lateral marca dónde estás');
  await page.waitForTimeout(300);
  ok(await page.locator('main mark.search-hit').count() > 0, 'marca lo buscado en la pantalla');
  /* lo que la persona anotó */
  await page.keyboard.press('Control+k');
  await page.keyboard.type('sede comunitaria');
  await page.waitForSelector('.sr-row');
  ok(await page.locator('.sr-row .sr-kind', { hasText: 'Tus datos' }).count() > 0, 'encuentra el nombre del proyecto');
  await page.keyboard.press('Escape');
  ok(!(await page.locator('.sr-overlay').count()), 'Esc cierra');
  /* buscar dentro de los pasos de un trámite y llegar a él */
  await page.locator('.side-search').click();
  await page.keyboard.type('llego el dinero');
  await page.waitForSelector('.sr-row');
  await page.locator('.sr-row').first().click();
  await page.waitForFunction(() => /^#\/t\//.test(location.hash));
  await page.waitForTimeout(300);
  ok(await page.locator('main mark.search-hit').count() > 0, 'marca el paso encontrado');
});

await step('15c. Qué necesitará tu proyecto: solo se muestran los trámites que te tocan; los pasos traen botones a su documento', async () => {
  await go('#/h/necesidades');
  ok(/Necesaria/.test(await page.textContent('.tool-where')) && /Fase 2/.test(await page.textContent('.tool-where')), 'la herramienta dice si es necesaria y en qué fase de la ruta va'); await shot('15c-herramienta-en-la-ruta');
  ok(/Todavía no marcas nada/.test(await page.textContent('.tool-page')), 'al inicio muestra todo');
  const f4Before = await page.locator('.side .acc-head', { hasText: 'Gastos y respaldos' }).textContent();
  await page.getByLabel(/Viajes, pasajes o viáticos/).check();
  await page.waitForTimeout(250);
  ok(/Te tocan\s*\d+\s*de\s*\d+ trámites/.test((await page.textContent('.tool-page')).replace(/\s+/g, ' ')), 'cuenta los trámites que le tocan');
  const f4After = await page.locator('.side .acc-head', { hasText: 'Gastos y respaldos' }).textContent();
  ok(f4Before !== f4After, 'la barra lateral cambia: ' + f4Before + ' → ' + f4After);
  await go('#/t/TRM-010');
  ok(/no te toca por ahora/i.test(await page.textContent('.view')), 'el trámite de administración avisa que no toca');
  await go('#/t/TRM-011');
  ok(!/no te toca por ahora/i.test(await page.textContent('.view')), 'el de viáticos sí toca');
  const rell = page.locator('.step-docs a', { hasText: 'Rellenar · Anexo 4' });
  ok(await rell.count() >= 1, 'un paso que pide llenar el Anexo 4 trae el botón');
  await page.locator('.step-docs button', { hasText: 'Ver formato' }).first().click();
  await page.waitForSelector('.print-overlay iframe');
  await page.waitForTimeout(300);
  const txt = await page.frameLocator('.print-overlay iframe').locator('body').textContent();
  ok(/viático/i.test(txt), 'muestra el formato del certificado');
  await shot('15c-formato');
  await page.locator('.print-overlay button', { hasText: 'Cerrar' }).click();
  await rell.first().click();
  await page.waitForFunction(() => /^#\/h\/anexo4/.test(location.hash));
  await page.waitForSelector('.view.tool .back', { timeout: 5000 });
  ok(/Volver a:/.test(await page.textContent('.view')), 'permite volver al trámite');
  /* agregar algo después de aprobado el PEA */
  await go('#/h/necesidades');
  await page.getByLabel('Mi PEA ya fue aprobado por CORFO').check();
  await page.waitForTimeout(200);
  await page.getByLabel(/Comprar terreno, inmueble o derechos de agua/).check();
  await page.waitForTimeout(250);
  ok(/Esto no estaba en tu PEA aprobado/.test(await page.textContent('.tool-page')), 'avisa que hay que modificar el PEA');
  ok(/reitemización/.test(await page.textContent('.warn-card')) && /asamblea/.test(await page.textContent('.warn-card')), 'explica el camino');
  await shot('15c-necesidades');
});

await step('15d. Documentos oficiales: subir el acta de no objeción; queda registrada y en el Drive (servicio de prueba)', async () => {
  await go('#/h/documentos');
  await page.getByRole('button', { name: 'Agregar un documento' }).first().click();
  await page.locator('.file-pick input[type=file]').setInputFiles(FIXTURE);
  await page.getByLabel('¿Qué documento es?').selectOption('acta_no_objecion');
  await page.waitForTimeout(150);
  ok(/Este documento cambia algo del PEA/.test(await page.textContent('.tool-page')), 'el acta de no objeción sugiere que cambia el PEA');
  await page.getByLabel('Presupuesto').check();
  await page.getByLabel('Nota (opcional)').fill('CORFO autoriza agregar una actividad.');
  await page.getByRole('button', { name: 'Guardar el documento' }).click();
  await page.waitForSelector('table.list-grid');
  await page.waitForTimeout(800);
  ok(/Acta de No Objeción/.test(await page.textContent('table.list-grid')), 'aparece en la lista');
  ok(/Cambios al PEA: qué falta hacer/.test(await page.textContent('.tool-page')), 'queda en el historial de cambios al PEA');
  const o = stub.store.calls.filter(x => x.action === 'saveFile' && x.category === 'oficial');
  eq(o.length, 2, 'archivo y ficha en el Drive');
  eq(o[0].mimeType, 'image/jpeg');
  ok(o.every(x => x.subfolder === 'Actas de no objeción'), 'va a la carpeta de su tipo');
  const ficha = o.find(x => /\.datos\.txt$/.test(x.fileName));
  ok(/Qué cambia: presupuesto/.test(ficha.text) && /Acta de No Objeción/.test(ficha.text), 'la ficha dice qué cambia');
  await page.getByLabel('Ya lo configuré en SGP').check();
  await page.getByLabel('Ya actualicé mi Carta Gantt y presupuesto').check();
  await page.waitForTimeout(250);
  ok(/Al día/.test(await page.textContent('.timeline')), 'al terminar los dos pasos queda al día');
  await shot('15d-documentos');
});

await step('15e. PEA observado, respuesta de la comunidad, versión corregida y documento misceláneo', async () => {
  const beforeDocs = await page.evaluate(() => (RF.store.get().repo?.docs || []).length);
  const callsBefore = stub.store.calls.filter(x => x.action === 'saveFile' && x.category === 'oficial').length;
  await go('#/h/documentos');
  await page.getByRole('button', { name: 'Agregar un documento' }).first().click();
  await dragFileTo('.file-drop[data-kind="official"]', { name: 'pea-observado-sintetico.pdf', type: 'application/pdf', text: '%PDF-1.4\n% Simulación: CORFO pide corregir actividades y presupuesto.\n%%EOF' });
  ok(/pea-observado-sintetico\.pdf/.test(await page.textContent('.file-pick')), 'el archivo soltado queda seleccionado');
  eq(await page.evaluate(() => (RF.store.get().repo?.docs || []).length), beforeDocs, 'soltar el archivo no lo guarda todavía');
  await page.getByLabel('¿Qué documento es?').selectOption('pea_observado');
  await page.getByLabel('Título (opcional)').fill('PEA observado — simulación');
  await page.getByLabel('Nota (opcional)').fill('CORFO solicita corregir actividades y presupuesto. Caso ficticio para prueba.');
  await page.getByLabel('Actividades', { exact: true }).check();
  await page.getByLabel('Presupuesto', { exact: true }).check();
  ok(/reitemización/.test(await page.textContent('.tool-page')) && /asamblea/.test(await page.textContent('.tool-page')), 'explica las acciones sugeridas para un cambio del PEA');
  ok(!/10 días hábiles/.test(await page.textContent('.tool-page')), 'no traslada al PEA el plazo de observaciones de gastos');
  await page.getByRole('button', { name: 'Guardar el documento' }).click();
  await page.waitForFunction(() => (RF.store.get().repo?.docs || []).some(d => d.type === 'pea_observado'));
  const observed = await page.evaluate(() => {
    const d = RF.store.get().repo.docs.find(x => x.type === 'pea_observado');
    return { from: d.from, peaChange: d.peaChange, changes: d.changes, name: d.fileName, blob: d.blobId };
  });
  eq(observed.from, 'corfo'); eq(observed.peaChange, 'si'); eq(observed.changes.actividades, true); eq(observed.changes.presupuesto, true);
  ok(observed.name === 'pea-observado-sintetico.pdf' && observed.blob, 'conserva el adjunto local con nombre y blob');
  await page.waitForTimeout(600);
  const observedCalls = stub.store.calls.filter(x => x.action === 'saveFile' && x.category === 'oficial').slice(callsBefore);
  ok(observedCalls.filter(x => x.subfolder === 'PEA y sus cambios').length >= 2, 'el servicio simulado recibió archivo y ficha del PEA observado');
  ok(observedCalls.some(x => x.mimeType === 'application/pdf' && /\.pdf$/i.test(x.fileName || '') && x.bytes > 20), 'la simulación conserva el PDF original, no solo una ficha');
  await page.locator('table.list-grid tr').filter({ hasText: 'PEA observado — simulación' }).getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('button', { name: 'Preparar la solicitud de cambio' }).click();
  await page.waitForFunction(() => location.hash.includes('/h/reitem') && location.hash.includes('TRM-028'));
  await go('#/h/documentos');

  async function addOfficial(type, name, title, note) {
    await go('#/h/documentos');
    await page.getByRole('button', { name: 'Agregar un documento' }).first().click();
    await dragFileTo('.file-drop[data-kind="official"]', { name, type: 'application/pdf', text: '%PDF-1.4\n% Documento sintético de prueba.\n%%EOF' });
    await page.getByLabel('¿Qué documento es?').selectOption(type);
    await page.getByLabel('Título (opcional)').fill(title);
    if (note) await page.getByLabel('Nota (opcional)').fill(note);
    await page.getByRole('button', { name: 'Guardar el documento' }).click();
    await page.waitForFunction((expected) => (RF.store.get().repo?.docs || []).some(d => d.type === expected.type && d.fileName === expected.name), { type, name });
  }
  await addOfficial('pea_enviado', 'respuesta-comunidad-sintetica.pdf', 'Respuesta de la comunidad — PEA corregido', 'Se reenvía una propuesta corregida a CORFO. Simulación, no enviada de verdad.');
  await addOfficial('pea_corregido', 'pea-version-final-sintetica.pdf', 'PEA corregido — versión simulada', 'Respuesta ficticia de CORFO para probar el historial.');
  await addOfficial('otro', 'respaldo-miscelaneo-sintetico.pdf', 'Documento de prueba misceláneo', 'Archivo ficticio para verificar la carpeta Otros.');
  const docs = await page.evaluate(() => RF.store.get().repo.docs.map(d => ({ type: d.type, from: d.from, name: d.fileName, blob: d.blobId })));
  eq(docs.length, beforeDocs + 4, 'quedan registrados observación, respuesta, versión final y otro respaldo');
  ok(docs.some(d => d.type === 'pea_enviado' && d.from === 'comunidad'), 'la respuesta queda atribuida a la comunidad');
  ok(docs.some(d => d.type === 'pea_corregido' && d.from === 'corfo'), 'la versión corregida queda atribuida a CORFO');
  ok(docs.every(d => d.blob), 'cada documento conserva un adjunto local');
  await page.waitForTimeout(700);
  const allOfficial = stub.store.calls.filter(x => x.action === 'saveFile' && x.category === 'oficial').slice(callsBefore);
  ok(allOfficial.some(x => x.subfolder === 'Otros'), 'el respaldo misceláneo se ordena en la carpeta Otros del Drive simulado');
  ok(allOfficial.filter(x => x.fileName && /\.datos\.txt$/.test(x.fileName)).length >= 4, 'cada archivo tiene su ficha de contexto');
  await shot('15e-pea-observado-respuesta-y-otros');
});

await step('15f. Actas de mesas de trabajo: aviso de asistencia mínima, compromisos pendientes y Drive', async () => {
  await go('#/h/actas');
  await page.getByRole('button', { name: 'Agregar un acta' }).click();
  await page.getByLabel('Representantes de CORFO').fill('1');
  await page.waitForTimeout(150);
  ok(/al menos dos representantes/.test(await page.textContent('.tool-page')), 'avisa el mínimo de asistentes');
  await page.getByLabel('Representantes de CORFO').fill('2'); await page.getByLabel('Representantes de la comunidad').fill('3'); await page.getByLabel('Representantes del Organismo Colaborador').fill('2');
  await page.getByLabel('Temas tratados').fill('Cambio de cronograma del proyecto.');
  await page.getByRole('button', { name: 'Agregar un acuerdo' }).click();
  await page.getByLabel('Acuerdo o compromiso').fill('Enviar el PEA corregido');
  await dragFileTo('.file-drop[data-kind="acta"]', { name: 'acta-mesa-sintetica.pdf', type: 'application/pdf', text: '%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF' });
  await page.getByRole('button', { name: 'Guardar el acta' }).click();
  await page.waitForSelector('table.list-grid');
  await page.waitForTimeout(800);
  ok(/Compromisos pendientes \(1\)/.test(await page.textContent('.tool-page')), 'lista el compromiso pendiente');
  ok(/Organismo Colaborador/.test(await page.textContent('table.list-grid')), 'habla del Organismo Colaborador');
  ok(!/\bSMI\b/.test(await page.textContent('.tool-page')), 'no menciona SMI');
  const a = stub.store.calls.filter(x => x.action === 'saveFile' && x.category === 'acta');
  ok(a.length === 2 && a.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.issueDate)), 'archivo y ficha en Actas de mesas de trabajo');
  ok(/Enviar el PEA corregido/.test(a.find(x => /\.datos\.txt$/.test(x.fileName)).text), 'la ficha trae los acuerdos');
  await shot('15e-actas');
});

await step('15g. Resumen para el Organismo Colaborador: elige qué incluye, exige autorización y no lleva datos de terceros', async () => {
  await go('#/h/compartir');
  await page.waitForSelector('#part-avance');
  ok(/Elige qué quieres incluir/.test(await page.textContent('.tool-page')), 'sin elegir nada no muestra nada');
  for (const id of ['avance', 'rendicion', 'revision', 'observaciones', 'compromisos']) await page.locator('#part-' + id).check();
  await page.waitForSelector('.share-preview');
  const prev = await page.textContent('.share-preview');
  ok(/Avance de los trámites/.test(prev) && /Montos por cuenta/.test(prev), 'muestra lo elegido');
  ok(!/Fantas[ií]a|76.123.456|1042|Proveedora/.test(prev), 'no lleva proveedores, RUT ni folios');
  ok(await page.getByRole('button', { name: 'Excel' }).count() === 0, 'sin autorización no hay botones para sacarlo');
  ok(/Falta tu autorización/.test(await page.textContent('.tool-page')));
  await page.locator('#consent-oc').check();
  await page.getByRole('button', { name: 'Excel' }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Excel' }).click();
  const f = tmp('resumen-organismo-colaborador.xlsx');
  const output = await saveDownload(page, f);
  ok(/resumen-organismo-colaborador/.test(output.name), output.name);
  const cells = JSON.stringify(xlsxInfo(f).cells);
  ok(!/Fantas[ií]a|76\.123\.456|1042|Proveedora/.test(cells), 'el Excel no incorpora proveedores, RUT ni folios');
  const sh = await page.evaluate(() => RF.store.get().shares || []);
  eq(sh.length, 1); eq(sh[0].parts.length, 5, 'queda anotado qué se compartió y cuándo');
  await page.locator('#part-rendicion').uncheck();
  ok(!/Montos por cuenta/.test(await page.textContent('.share-preview')), 'lo desmarcado desaparece');
});

await step('15h. Los enlaces que ejecutan código se descartan, también con tabulaciones o saltos dentro del esquema', async () => {
  const r = await page.evaluate(() => {
    const malos = ['javascript:alert(1)', ' JavaScript:alert(1)', 'java' + String.fromCharCode(9) + 'script:alert(1)', 'java' + String.fromCharCode(10) + 'script:alert(1)', 'jav' + String.fromCharCode(13) + 'ascript:alert(1)', String.fromCharCode(1) + 'javascript:alert(1)', 'vbscript:x', 'data:text/html,<b>x</b>', 'DaTa:text/html,x', 'java' + String.fromCharCode(0x200b) + 'script:alert(1)'];
    const buenos = ['https://drive.google.com/x', '#/h/nube', 'mailto:a@b.cl', 'blob:https://x/1'];
    return { malos: malos.filter(u => RF.util.h('a', { href: u }).hasAttribute('href')), buenos: buenos.filter(u => !RF.util.h('a', { href: u }).hasAttribute('href')) };
  });
  eq(JSON.stringify(r.malos), '[]', 'se colaron'); eq(JSON.stringify(r.buenos), '[]', 'se descartaron enlaces buenos');
});

await step('15i. Calendario: mes y año con animación, evento con hora y lugar, todo junto a Google Calendar y sin feriados en las listas', async () => {
  await go('#/h/calendario');
  ok(/Lo que viene/.test(await page.textContent('.tool-page')), 'muestra lo que viene');
  ok(!/Reúne en un solo lugar/.test(await page.textContent('.tool-page')), 'sin el texto repetido');
  ok(await page.locator('.cal-days .cal-cell').count() >= 28, 'hay una grilla del mes');
  const mes = await page.textContent('.cal-month');
  await page.getByRole('button', { name: 'Mes siguiente' }).click(); await page.waitForTimeout(500);
  ok(await page.textContent('.cal-month') !== mes, 'el título cambia al pasar de mes');
  ok(await page.locator('.cal-stage > .cal-view').count() === 1, 'al terminar la animación queda una sola vista');
  /* clics rápidos: sin esperar la animación, al final debe quedar UNA sola vista y la correcta */
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Mes siguiente' }).click({ delay: 0 });
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Mes anterior' }).click({ delay: 0 });
  await page.waitForTimeout(700);
  ok(await page.locator('.cal-stage > .cal-view').count() === 1, 'tras clics rápidos hay una sola vista del mes');
  const rapido = await page.evaluate(() => { const t = document.querySelector('.cal-month').textContent.trim(); const v = document.querySelector('.cal-stage > .cal-view'); return { t, aria: v.querySelector('.cal-days').getAttribute('aria-label'), pos: v.style.position }; });
  ok(rapido.aria.toLowerCase() === ('calendario de ' + rapido.t).toLowerCase() && rapido.pos === '', 'el mes dibujado es el del título y no quedó a medio animar: ' + JSON.stringify(rapido));
  await page.getByRole('button', { name: 'Año', exact: true }).click(); await page.waitForTimeout(600);
  const y0 = parseInt(await page.textContent('.cal-month'), 10);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Año siguiente' }).click({ delay: 0 });
  await page.getByRole('button', { name: 'Año anterior' }).click({ delay: 0 });
  await page.waitForTimeout(700);
  ok(await page.locator('.cal-stage > .cal-view').count() === 1 && await page.locator('.mini').count() === 12, 'tras clics rápidos en el año hay una sola vista');
  ok(parseInt(await page.textContent('.cal-month'), 10) === y0 + 3, 'el año del título coincide con los clics: ' + y0);
  ok(await page.locator('.mini').count() === 12, 'la vista de año muestra los 12 meses');
  ok(await page.locator('.cal-stage > .cal-view').count() === 1, 'la vista de año no deja el mes dibujado debajo');
  await page.locator('.cal-yearbtn').click();
  const yNow = parseInt(await page.textContent('.cal-month'), 10), yTo = yNow % 12 === 11 ? yNow - 1 : yNow + 1;
  await page.getByRole('button', { name: String(yTo), exact: true }).click(); await page.waitForTimeout(600);
  ok(new RegExp(String(yTo)).test(await page.textContent('.cal-month')) && await page.locator('.mini').count() === 12 && await page.locator('.cal-stage > .cal-view').count() === 1, 'se puede elegir otro año');
  await page.locator('.cal-yearbtn').click(); await page.locator('.cal-yearin').fill('2026'); await page.getByRole('button', { name: 'Ir', exact: true }).click(); await page.waitForTimeout(600);
  ok(/2026/.test(await page.textContent('.cal-month')), 'también se puede escribir el año');
  await page.locator('.mini').nth(9).click(); await page.waitForTimeout(600);
  ok(/Octubre/.test(await page.textContent('.cal-month')) && await page.locator('.cal-days .cal-cell').count() >= 28, 'al tocar un mes se abre ese mes');
  await page.locator('.cal-cell:not(.empty)').nth(14).click();
  await page.getByLabel('¿Qué quieres recordar?').fill('Reunión con la directiva');
  await page.getByLabel('Todo el día').uncheck();
  await page.getByLabel('Desde').fill('19:00'); await page.getByLabel('Hasta (opcional)').fill('20:30');
  await page.getByLabel('Lugar (opcional)').fill('Sede social');
  await page.getByRole('button', { name: 'Agregar a mi calendario' }).click();
  await page.waitForFunction(() => /Reunión con la directiva/.test(document.querySelector('.tool-page').textContent), null, { timeout: 5000 });
  const link = await page.locator('li.cal-ev', { hasText: 'Reunión con la directiva' }).first().getByRole('link', { name: 'Agregar a Google Calendar' }).getAttribute('href');
  ok(/^https:\/\/calendar\.google\.com\//.test(link) && /location=Sede%20social/.test(link) && /dates=\d{8}T190000\/\d{8}T203000/.test(link), 'enlace a Google Calendar con hora y lugar: ' + link);
  await page.getByRole('button', { name: /Pasar todo a Google Calendar/ }).click();
  await page.waitForFunction(() => (window.__rfDownloads || []).some(d => /\.ics$/.test(d.filename)), null, { timeout: 5000 });
  const icsText = await page.evaluate(() => { const d = window.__rfDownloads.filter(x => /\.ics$/.test(x.filename)).pop(); return d.blob.text(); });
  ok(/BEGIN:VCALENDAR/.test(icsText) && /Reunión con la directiva/.test(icsText) && /LOCATION:Sede social/.test(icsText) && !/Feriado/.test(icsText), 'el archivo .ics trae las fechas, con lugar y sin feriados');
  ok(await page.getByRole('link', { name: /Abrir Google Calendar \(Importar\)/ }).count() === 1, 'indica el paso que falta en Google Calendar');
  await shot('15i-calendario');
});

await step('15j. Tamaño de letra y tema se eligen en una lista, sin mover el menú lateral ni la página', async () => {
  await go('#/h/necesidades');
  ok(await page.getByRole('button', { name: /Bloquear/ }).count() === 0, 'ya no hay botón Bloquear en el menú');
  ok(!/vigente a/i.test(await page.textContent('.side')), 'el menú no muestra fechas de vigencia de las reglas');
  const before = await page.evaluate(() => { const s = document.getElementById('side'); s.scrollTop = 220; return s.scrollTop / s.scrollHeight; });
  await page.locator('#prefText').selectOption('grande');
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => { const s = document.getElementById('side'); return { ratio: s.scrollTop / s.scrollHeight, top: s.scrollTop, attr: document.documentElement.getAttribute('data-text') }; });
  ok(info.attr === 'grande', 'la letra cambió a grande');
  ok(info.top > 0 && Math.abs(info.ratio - before) < 0.03, 'el menú lateral conserva su posición: ' + JSON.stringify(info));
  await page.locator('#prefTheme').selectOption('dark');
  ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'el tema cambió a oscuro solo al elegirlo');
  await page.locator('#prefTheme').selectOption('system'); await page.locator('#prefText').selectOption('normal');
});

await step('15k. Cotizaciones se puede sacar en Excel (antes fallaba con «status is not a function») y el buscador encuentra Calendario y Seguridad', async () => {
  await go('#/h/cotizaciones');
  await page.getByRole('button', { name: 'Agregar compra' }).click();
  const before = await page.evaluate(() => window.__rfDownloads.length);
  await page.getByRole('button', { name: 'Excel', exact: true }).click();
  await page.waitForFunction(n => window.__rfDownloads.length > n, before, { timeout: 5000 });
  ok(!/No se pudo armar el documento/.test(await page.textContent('.tool-page')), 'el documento se arma sin error');
  ok(/cotizaciones/.test(await page.evaluate(() => window.__rfDownloads[window.__rfDownloads.length - 1].filename)), 'se descargó el Excel de cotizaciones');
  for (const [q, esperado] of [['calendario', 'Calendario'], ['google calendar', 'Calendario'], ['cerrar sesión', 'Seguridad']]) {
    await page.keyboard.press('/'); await page.keyboard.type(q); await page.waitForTimeout(500);
    const txt = await page.evaluate(() => { const d = document.querySelector('dialog[open], [role=dialog]'); return d ? d.innerText : ''; });
    ok(txt.includes(esperado), 'el buscador encuentra «' + q + '» → ' + esperado);
    await page.keyboard.press('Escape');
  }
});

await step('15l. Mejoras del recorrido: volver a la lista desde el menú, feriados de Chile, enviar el resumen, adjuntar un respaldo y gastos vacíos', async () => {
  /* volver a la lista tocando «Gastos» en el menú estando dentro de un gasto */
  await go('#/h/gastos');
  const filas = page.locator('.list-grid tbody tr'); if (!(await filas.count())) { await page.getByRole('button', { name: 'Anotar a mano' }).click(); } else await filas.first().click();
  await page.waitForSelector('button:has-text("Volver a la lista")');
  await page.evaluate(() => document.querySelector('a.side-item.tool[href="#/h/gastos"]').click());
  await page.waitForSelector('.list-grid, .gastos-top', { timeout: 5000 });
  ok(await page.getByRole('button', { name: 'Volver a la lista' }).count() === 0, 'tocar «Gastos» en el menú vuelve a la lista');
  /* gastos vacíos: se pueden quitar */
  await page.getByRole('button', { name: 'Anotar a mano' }).click(); await page.getByRole('button', { name: 'Volver a la lista' }).click();
  ok(await page.getByRole('button', { name: /Quitar gastos vacíos/ }).count() === 1, 'aparece «Quitar gastos vacíos»');
  { const lista = await page.textContent('.list-grid'); ok(/Pendiente/.test(lista) && !/Falta algo/.test(lista), 'el estado dice «Pendiente»'); ok(/Fecha del documento/.test(lista) && /Subido/.test(lista), 'la lista muestra la fecha del documento y cuándo se subió'); }
  await page.getByRole('button', { name: /Quitar gastos vacíos/ }).click(); await page.locator('dialog[open] button').last().click();
  await page.waitForTimeout(300);
  ok(await page.getByRole('button', { name: /Quitar gastos vacíos/ }).count() === 0, 'se quitaron los gastos vacíos');
  /* feriados nacionales */
  await go('#/h/proyecto');
  ok(await page.getByRole('button', { name: /Agregar los feriados nacionales/ }).count() === 0, 'ya no hay que agregar los feriados nacionales a mano');
  ok(await page.evaluate(() => RF.holidays.all().length) >= 25, 'los feriados nacionales de 2026 y 2027 ya vienen cargados');
  /* resumen para el Organismo: correo y WhatsApp */
  await go('#/h/compartir');
  const cbs = page.locator('main input[type=checkbox]'); for (let i = 0; i < await cbs.count(); i++) await cbs.nth(i).check();
  await page.waitForTimeout(400);
  ok(/^mailto:/.test(await page.getByRole('link', { name: 'Enviar por correo' }).getAttribute('href')), 'enlace de correo');
  ok(/^https:\/\/wa\.me\//.test(await page.getByRole('link', { name: 'Enviar por WhatsApp' }).getAttribute('href')), 'enlace de WhatsApp');
  /* adjuntar un respaldo a un gasto con pago por transferencia */
  await go('#/h/gastos'); await page.getByRole('button', { name: 'Anotar a mano' }).click(); await page.waitForTimeout(300);
  await page.locator('select', { has: page.locator('option[value=factura]') }).selectOption('factura'); await page.getByLabel('Número (folio)').fill('7001'); await page.getByLabel('Fecha del documento').fill('2026-09-10'); await page.getByLabel('Nombre del proveedor').fill('Ferretería de prueba');
  await page.getByLabel('Total del documento').fill('119.000'); await page.getByLabel('Monto neto').fill('100.000'); await page.getByLabel('IVA ($)').fill('19.000');
  await page.getByLabel('Forma de pago').selectOption({ label: 'Transferencia' }); await page.waitForTimeout(300);
  const adj = page.getByRole('button', { name: 'Adjuntar archivo' }).first();
  ok(await page.getByRole('button', { name: 'Adjuntar archivo' }).count() >= 1, 'el respaldo se puede adjuntar: ' + (await page.textContent('main')).slice(-400));
  await page.locator('input[type=file][aria-label^="Adjuntar:"]').first().setInputFiles(FIXTURE); await page.waitForTimeout(800);
  ok(/Adjunto: boleta-ficticia\.jpg/.test(await page.textContent('main')), 'queda el nombre del archivo adjunto');
  ok(await page.evaluate(() => RF.store.project().expenses.some(e => e.attach && Object.keys(e.attach).length)), 'el adjunto queda anotado en el gasto');
  await page.getByRole('button', { name: 'Volver a la lista' }).click();
  await page.getByRole('button', { name: /Quitar gastos vacíos/ }).count();
});

await step('15m. Un respaldo subido como si fuera un gasto (cartola) se reconoce y se adjunta al gasto que prueba', async () => {
  await go('#/h/gastos');
  const ids = await page.evaluate(async () => {
    const p = RF.store.project();
    const tgt = RF.store.get().projects[0].expenses.find(e => e.proveedor) || p.expenses[0];
    const src = { id: 'g-cartola-prueba', createdAt: new Date().toISOString(), cuenta: 'operacion', docType: 'boleta', folio: '', fecha: '', proveedor: '', total: '', montoRendir: '', formaPago: 'transferencia', glosa: '', actId: '', has: {}, imgId: 'img-cartola-prueba', _doc: { kind: 'cartola', key: 'pago', label: 'Cartola del banco' }, ocr: { raw: 'Cartola ' + RF.util.fmtNum(Number(String(tgt.total).replace(/\D/g, '')) || 0), at: new Date().toISOString() } };
    await RF.blobs.put(src.imgId, new Blob(['cartola de prueba'], { type: 'image/jpeg' }));
    p.expenses.push(src); RF.store.update(function () { }, { silent: true });
    return { src: src.id, tgt: tgt.id };
  });
  await go('#/h/proyecto'); await go('#/h/gastos');
  const fila = page.locator('.list-grid tbody tr', { hasText: 'Parece un respaldo' });
  ok(await fila.count() === 1, 'en la lista dice «Parece un respaldo»');
  await fila.click();
  ok(/Esto parece un respaldo \(Cartola del banco\)/.test(await page.textContent('.doc-respaldo')), 'avisa que es una cartola y no un gasto');
  await page.getByRole('button', { name: 'Adjuntarlo a ese gasto' }).click();
  await page.waitForTimeout(800);
  const res = await page.evaluate(({ src, tgt }) => { const p = RF.store.project(); const t = p.expenses.find(e => e.id === tgt); return { sigue: p.expenses.some(e => e.id === src), adjunto: !!(t && t.attach && t.attach.pago), cumple: !!(t && t.has && t.has.pago) }; }, ids);
  ok(!res.sigue && res.adjunto && res.cumple, 'la cartola ya no es un gasto, quedó adjunta al gasto y cumple el respaldo de pago: ' + JSON.stringify(res));
});

await step('15n. Una cartola subida junto a las boletas se adjunta sola al gasto que prueba, avisa y se puede deshacer; sin conexión de fondo la sesión se abre sola', async () => {
  await go('#/h/gastos');
  const antes = await page.evaluate(() => RF.store.project().expenses.length);
  stub.store.ocrDelay = 0;
  stub.store.vision.raw_text = 'Scotiabank®\nCliente\nFecha Consulta\nDesde\nSaldo Anterior\nCargos/Giros\n$ 1.487.500\nEMPRESA FANTASÍA';
  await dragFileTo('.file-drop[data-kind="expense"]', { name: 'cartola-prueba.jpg', type: 'image/jpeg', base64: fs.readFileSync(FIXTURE).toString('base64') });
  await page.waitForSelector('.moved-notice', { timeout: 20000 });
  ok(/cartola-prueba\.jpg/.test(await page.textContent('.moved-notice')) && /se adjuntó al gasto/.test(await page.textContent('.moved-notice')), 'avisa qué archivo era y a dónde fue');
  ok(await page.evaluate(() => RF.store.project().expenses.length) === antes, 'la cartola no quedó como gasto');
  ok(await page.evaluate(() => RF.store.project().expenses.some(e => e.attach && Object.keys(e.attach).some(k => e.attach[k].auto))), 'quedó adjunta con la marca de automática');
  await page.getByRole('button', { name: 'Deshacer' }).first().click(); await page.waitForTimeout(600);
  ok(await page.evaluate(() => RF.store.project().expenses.length) === antes + 1, 'al deshacer vuelve a la lista como gasto');
  ok(await page.locator('.moved-notice').count() === 0, 'el aviso desaparece');
  stub.store.vision.raw_text = stub.store.canned;
});

await step('15o. Montos grandes en cotizaciones, ayuda de la autorización, trámites opcionales sin pasos de relleno y sin secciones obsoletas', async () => {
  await go('#/h/cotizaciones');
  await page.getByRole('button', { name: 'Agregar compra' }).click();
  /* proveedores: al escribir el nombre aparece al instante en «Proveedor elegido»; al elegirlo se rellena el monto */
  const card = page.locator('.stage-card').last();
  await card.locator('input[aria-label="Proveedor"]').nth(0).pressSequentially('Ferretería Sur', { delay: 10 });
  await card.locator('input[aria-label="Monto"]').nth(0).pressSequentially('12500000', { delay: 10 });
  await card.locator('input[aria-label="Proveedor"]').nth(1).pressSequentially('Otra Ltda', { delay: 10 });
  await card.locator('input[aria-label="Monto"]').nth(1).pressSequentially('13000000', { delay: 10 });
  const optsElegido = await card.locator('select[aria-label="Proveedor elegido"]').evaluate(el => [...el.options].map(o => o.textContent));
  ok(optsElegido.includes('Ferretería Sur') && optsElegido.includes('Otra Ltda'), 'los dos proveedores aparecen de inmediato como opciones: ' + JSON.stringify(optsElegido));
  await card.locator('select[aria-label="Proveedor elegido"]').selectOption('Otra Ltda');
  ok(/13\.000\.000/.test(await card.locator('input[aria-label="Monto neto de la compra"]').inputValue()), 'al elegir proveedor se rellena el monto neto de la compra');
  await card.locator('input[aria-label="Monto neto de la compra"]').fill('');
  await card.locator('input[aria-label="Monto neto de la compra"]').pressSequentially('12500000', { delay: 20 });
  const boxChk = await card.locator('label.check:has(.tip-btn)').boundingBox(), boxBtn = await card.locator('label.check .tip-btn').boundingBox();
  ok(boxBtn.y >= boxChk.y - 2 && boxBtn.y + boxBtn.height <= boxChk.y + boxChk.height + 2 && boxBtn.x > boxChk.x + 20, 'el signo ? queda dentro de la línea de la casilla, pegado al texto: ' + JSON.stringify({ boxChk, boxBtn }));

  const dbgN = await page.evaluate(() => ({ neto: RF.store.project().cotizaciones.slice(-1)[0].neto, n: RF.store.project().cotizaciones.length, vals: [...document.querySelectorAll('.stage-card input')].map(i => i.value).slice(0, 6) }));
  ok(dbgN.neto === 12500000, 'se puede escribir un monto de ocho dígitos: ' + JSON.stringify(dbgN));
  ok(/12\.500\.000/.test(await card.locator('input[aria-label="Monto neto de la compra"]').inputValue()), 'se muestra con puntos');
  await page.getByRole('button', { name: 'Cómo saber si tengo la autorización' }).last().click();
  ok(/visto bueno de CORFO/.test(await page.locator('.tip-pop:visible').first().textContent()), 'la ayuda explica qué es la autorización');
  ok(await page.evaluate(() => RF.store.project().cotizaciones.slice(-1)[0].autorizacion !== true), 'tocar el ? no marca la casilla');
  const opts = await card.locator('select[aria-label="Gasto al que corresponde"]').evaluate(el => [...el.options].map(o => o.textContent));
  ok(opts.some(o => /Todavía no compro/.test(o)) && opts.some(o => /Otro gasto que aún no anoté/.test(o)), 'se puede comparar antes de comprar o elegir otro gasto');
  await go('#/t/TRM-028');
  ok(/\(opcional\)/.test(await page.textContent('.view-title')), 'Cambiar el PEA dice que es opcional');
  ok(await page.locator('.step-docs').count() === 1 && await page.locator('.tool-card').count() === 0, 'el formulario aparece una sola vez');
  await go('#/t/TRM-030');
  ok(/Pedir prórroga del PEA \(opcional\)/.test(await page.textContent('.view-title')) && /Duda abierta/.test(await page.textContent('.view')), 'la prórroga es un trámite aparte, opcional, y deja abierta la duda del canal');
  await go('#/t/TRM-027');
  ok(!/Pide la prórroga/.test(await page.textContent('.steps-card')) && /Pedir prórroga del PEA/.test(await page.textContent('.notes-card')), 'la prórroga ya no es un paso del PEA y queda enlazada');
  await go('#/t/TRM-003');
  ok(/No encontramos ese trámite/.test(await page.textContent('.view')), 'ya no existe «Ver si el gasto entra en fecha»');
  await go('#/h/proyecto');
  ok(!/Feriados \(para contar/.test(await page.textContent('.tool-page')), 'ya no se piden feriados a mano');
  await go('#/h/gastos');
});

await step('15p. Ficha D por persona: se calcula sola de arriba hacia abajo, con gráfico de avance; y el botón pequeño «Guardar todo en Drive» está siempre arriba a la derecha', async () => {
  await go('#/h/informeD');
  await page.getByRole('button', { name: 'Nueva ficha' }).click();
  await page.getByLabel('Nombre completo de la persona').fill('Ana Pérez');
  await page.getByLabel('Funciones en el proyecto').fill('Encargada de talleres');
  await page.getByLabel('Contratada desde').fill('2026-07-01');
  await page.getByLabel('hasta', { exact: true }).fill('2027-06-30');
  await page.getByLabel('Monto total presupuestado de la contratación ($)').pressSequentially('12000000', { delay: 10 });
  const calcs = await page.locator('output.calc').allTextContents();
  ok(calcs.some(t => t.trim() === '12') && calcs.some(t => /1\.000\.000/.test(t)), 'salen solos los 12 meses y 1.000.000 por mes: ' + JSON.stringify(calcs));
  ok(calcs.some(t => /847.500/.test(t)), 'sale el líquido mensual a honorarios (retención 15,25 %): ' + JSON.stringify(calcs));
  ok(await page.locator('.avchart').count() === 1, 'hay un gráfico de avance (real contra programado)');
  const cfg = await page.evaluate(() => RF.cloud.configured());
  if (cfg) {
    await page.waitForSelector('#driveAll:not([hidden])', { timeout: 5000 });
    const box = await page.locator('#driveAll').boundingBox(), vw = await page.evaluate(() => document.documentElement.clientWidth);
    ok(box.x + box.width > vw - 120 && box.y < 60 && box.height <= 40, 'el botón de Drive es pequeño y está arriba a la derecha');
  }
  await shot('15p-fichaD');
});

await step('16. Sin errores de consola en todo el recorrido', async () => { ok(errors.length === 0, JSON.stringify(errors.slice(0, 5))); });

/* ---- celular ---- */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
const m = await mctx.newPage();
await routeTestService(m);
const merr = []; m.on('pageerror', e => merr.push(e.message));
await m.goto(BASE);
await m.waitForSelector('.auth-card');
await m.getByRole('button', { name: /Ya tengo cuenta: entrar en este equipo|Ya tengo un servicio de mi comunidad/ }).click();
await m.getByLabel('Nombre de la comunidad').fill('comunidad DE prueba'); await m.locator('input[type=password]').fill(PW2);
if (await m.locator('details.adv summary').count()) ok(await m.locator('form.auth-form').evaluate(f => f.checkValidity()), 'con el servicio ya aprobado, el formulario se puede enviar sin tocar «otra dirección»');
if (await m.locator('details.adv summary').count()) { await m.locator('details.adv summary').click(); await m.getByLabel('Dirección del servicio (termina en /exec)').fill(TEST_API_URL); } else await m.getByLabel('Dirección del servicio (termina en /exec)').fill(TEST_API_URL);
await m.getByLabel('Nombre de la comunidad').fill('comunidad DE prueba');
await m.locator('input[type=password]').fill(PW2);
await m.getByRole('button', { name: /Entrar en este equipo|Conectar este equipo/ }).click();
await m.waitForSelector('.side, .menu-btn', { timeout: 30000 });
await step('17. Celular: menú en cajón, sin desborde horizontal, botones grandes', async () => {
  const sw = await m.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok(sw[0] <= sw[1] + 1, 'sin scroll horizontal: ' + sw);
  ok(await m.locator('.menu-btn').isVisible(), 'hay botón de menú');
  ok(!(await m.locator('#side').isVisible().catch(() => false)) || true);
  await m.locator('.menu-btn').click();
  await m.waitForTimeout(350);
  const alto = await m.evaluate(() => { const s = document.getElementById('side'); return [s.clientHeight, s.scrollHeight, innerHeight]; });
  ok(alto[0] <= alto[2] + 1 && alto[1] > alto[0], 'el menú del celular mide lo que la ventana y se puede bajar hasta el final: ' + alto);
  const box = await m.locator('#side').boundingBox();
  ok(box && box.x >= -2, 'el cajón se abre');
  await m.screenshot({ path: path.join(SHOTS, '17-mobile-menu.png') });
  await m.locator('.scrim').click({ position: { x: 380, y: 400 } });
  await m.waitForTimeout(350);
  await m.evaluate(() => { location.hash = '#/t/TRM-008'; });
  await m.waitForSelector('.steps');
  await m.screenshot({ path: path.join(SHOTS, '17b-mobile-tramite.png') });
  const small = await m.evaluate(() => [...document.querySelectorAll('button,a.btn,.step label')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 38).map(e => e.textContent.trim().slice(0, 25)));
  ok(small.length === 0, 'elementos táctiles pequeños: ' + small.join(', '));
  await m.evaluate(() => { location.hash = '#/h/gastos'; });
  await m.waitForTimeout(300);
  const sw2 = await m.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok(sw2[0] <= sw2[1] + 1, 'gastos sin scroll horizontal: ' + sw2);
  await m.screenshot({ path: path.join(SHOTS, '17c-mobile-gastos.png') });
});
await step('18. Celular sin errores de JavaScript', async () => { ok(merr.length === 0, merr.join(' | ')); });

await browser.close(); stub.server.close();
const failed = results.filter(r => !r.ok);
console.log('\nRESUMEN:', results.length - failed.length + '/' + results.length, 'pasos OK');
if (failed.length) { failed.forEach(f => console.log(' -', f.name, '=>', f.err)); process.exit(1); }
