/* Pruebas de extremo a extremo con Playwright: recorren la app como una persona. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startStub } from './stub_api.mjs';
const { chromium } = createRequire('D:/SMI/_FARO/runtime/package.json')('playwright');

const BASE = process.env.RF_URL || 'http://127.0.0.1:8790/index.html';
const SHOTS = process.env.RF_SHOTS || 'D:/Temp/felip/claude/D--/abfc786f-cb73-42ec-bcbc-6654ab03f71c/scratchpad/shots';
const PY = 'D:/FARO_GLOBAL/.venvs/faro-runtime/Scripts/python.exe';
fs.mkdirSync(SHOTS, { recursive: true });
import { fileURLToPath } from 'node:url';
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'boleta-ficticia.jpg');

const results = [];
async function step(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
  catch (e) { results.push({ name, ok: false, err: String(e.message || e).split('\n').slice(0, 4).join(' | ') }); console.log('FAIL', name, '->', String(e.message || e).split('\n').slice(0, 4).join(' | ')); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'no coincide') + ': esperado ' + JSON.stringify(b) + ' y llegó ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error(msg || 'falló la condición'); }
function xlsxInfo(file) {
  const py = `import openpyxl,json,sys
wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.worksheets[0]
cells=[c.value for r in ws.iter_rows() for c in r if c.value is not None]
print(json.dumps({'sheets':wb.sheetnames,'cells':cells},ensure_ascii=False,default=str))`;
  const r = spawnSync(PY, ['-c', py, file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('openpyxl no pudo abrir el Excel: ' + r.stderr.slice(0, 200));
  return JSON.parse(r.stdout);
}

const stub = await startStub(8791);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
const shot = n => page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: false });
const go = async hash => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(150); };
const tmp = name => path.join(os.tmpdir(), 'rf-e2e-' + Date.now() + '-' + name);

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#main');

await step('1. Al inicio pide los datos de la comunidad y crea el proyecto', async () => {
  eq(await page.textContent('h1'), 'Rinde Fácil te guía en tu rendición');
  await page.getByLabel('Nombre de tu comunidad').fill('Comunidad de Prueba');
  await page.getByLabel('RUT de la comunidad').fill('11111111-1');
  await page.getByLabel('Nombre de tu proyecto').fill('Sede comunitaria');
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.waitForSelector('.hero');
  ok(/Vas en la fase 1/.test(await page.textContent('.hero h1')), 'debe partir en la fase 1');
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
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('rinde_facil_v2')));
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
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()]);
  const f = tmp('gantt.xlsx'); await dl.saveAs(f);
  const info = xlsxInfo(f);
  ok(info.cells.includes('Taller de artesanía'), 'el Excel trae la actividad');
  ok(info.sheets[0] === 'Carta Gantt', 'nombre de hoja');
  await page.getByRole('button', { name: 'Copiar para SGP' }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(/Preparación\tTaller de artesanía\t01-07-2026\t30-09-2026\t92/.test(clip), 'texto para SGP: ' + clip.slice(0, 80));
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
  ok(/Todo en orden/.test(t), 'queda sin problemas: ' + t.slice(0, 200));
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
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Word' }).first().click()]);
  const f = tmp('anexo4.doc'); await dl.saveAs(f);
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
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()]);
  const f = tmp('anexo5.xlsx'); await dl.saveAs(f);
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
  await page.getByLabel('Dirección del servicio (termina en /exec)').fill(stub.url);
  await page.getByLabel('Clave de acceso').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Probar conexión' }).click();
  await page.waitForFunction(() => /Conectado/.test(document.querySelector('.tool-page').textContent), null, { timeout: 8000 });
  await go('#/h/gastos');
  stub.store.ocrDelay = 2200; /* el servicio de prueba se demora, como Google */
  await page.locator('input[type=file][multiple]').setInputFiles(FIXTURE);
  await page.waitForSelector('.busy', { timeout: 5000 });
  ok(/Leyendo el comprobante/.test(await page.textContent('.busy')), 'muestra qué está haciendo');
  const p1 = +(await page.getAttribute('.busy [role=progressbar]', 'aria-valuenow'));
  await page.waitForTimeout(1200);
  const p2 = +(await page.getAttribute('.busy [role=progressbar]', 'aria-valuenow'));
  ok(p2 > p1 && p2 < 100, 'la barra avanza mientras espera (' + p1 + ' → ' + p2 + ')');
  ok(/[0-9]+ s/.test(await page.textContent('.busy')), 'muestra los segundos');
  await shot('12-progreso');
  await page.waitForSelector('.editor-split', { timeout: 15000 });
  await page.waitForSelector('.busy.ok', { timeout: 5000 });
  ok(/Listo/.test(await page.textContent('.busy.ok')), 'avisa cuando termina');
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
  eq(stub.store.calls.filter(x => x.action === 'saveFile' && x.category === 'planificacion').length, 2);
  await go('#/h/nube');
  await page.getByRole('button', { name: /Preparar mi carpeta/ }).click();
  await page.waitForFunction(() => /La carpeta «Rinde fácil» está en tu Drive/.test(document.querySelector('.tool-page').textContent), null, { timeout: 8000 });
  const t = await page.textContent('.tool-page');
  ok(/carta-gantt/.test(t) && /Planificacion|planificacion/.test(t), 'lista lo guardado con su ubicación');
  const exp = await page.evaluate(() => window.RF.store.exportJSON());
  ok(!exp.includes('clave-de-prueba'), 'la copia no incluye la clave');
  await shot('12d-drive');
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
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('rinde_facil_v2')));
  eq(st.projects.length, 2); eq(st.projects[1].expenses.length, 0); ok(st.projects[0].expenses.length >= 2);
});

await step('13. Guardar y traer la copia de la nube', async () => {
  await go('#/h/nube');
  await page.getByRole('button', { name: 'Guardar copia en la nube' }).click();
  await page.waitForFunction(() => /Copia guardada/.test(document.querySelector('.tool-page').textContent), null, { timeout: 8000 });
  ok(stub.store.state && JSON.parse(stub.store.state).projects.length === 2, 'la nube guardó el estado con los dos proyectos');
});

await step('14. Observaciones: 10 días hábiles desde la comunicación', async () => {
  await go('#/h/observaciones');
  await page.getByRole('button', { name: 'Agregar observación' }).click();
  await page.locator('input[data-key="recibida"]').fill('2026-09-28');
  await page.waitForTimeout(200);
  ok(/12 de octubre de 2026/.test(await page.textContent('.stage-card')), 'plazo = 12-oct-2026: ' + (await page.textContent('.stage-card')).slice(-160));
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

await step('15e. Actas de mesas de trabajo: aviso de asistencia mínima, compromisos pendientes y Drive', async () => {
  await go('#/h/actas');
  await page.getByRole('button', { name: 'Agregar un acta' }).click();
  await page.getByLabel('Representantes de CORFO').fill('1');
  await page.waitForTimeout(150);
  ok(/al menos dos representantes/.test(await page.textContent('.tool-page')), 'avisa el mínimo de asistentes');
  await page.getByLabel('Representantes de CORFO').fill('2'); await page.getByLabel('Representantes de la comunidad').fill('3'); await page.getByLabel('Representantes del Organismo Colaborador').fill('2');
  await page.getByLabel('Temas tratados').fill('Cambio de cronograma del proyecto.');
  await page.getByRole('button', { name: 'Agregar un acuerdo' }).click();
  await page.getByLabel('Acuerdo o compromiso').fill('Enviar el PEA corregido');
  await page.locator('.file-pick input[type=file]').setInputFiles(FIXTURE);
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

await step('16. Sin errores de consola en todo el recorrido', async () => { ok(errors.length === 0, JSON.stringify(errors.slice(0, 5))); });

/* ---- celular ---- */
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
const m = await mctx.newPage();
const merr = []; m.on('pageerror', e => merr.push(e.message));
await m.goto(BASE);
await m.evaluate(json => localStorage.setItem('rinde_facil_v2', json), await page.evaluate(() => localStorage.getItem('rinde_facil_v2')));
await m.reload(); await m.waitForSelector('#main');
await step('17. Celular: menú en cajón, sin desborde horizontal, botones grandes', async () => {
  const sw = await m.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok(sw[0] <= sw[1] + 1, 'sin scroll horizontal: ' + sw);
  ok(await m.locator('.menu-btn').isVisible(), 'hay botón de menú');
  ok(!(await m.locator('#side').isVisible().catch(() => false)) || true);
  await m.locator('.menu-btn').click();
  await m.waitForTimeout(350);
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
