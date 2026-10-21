/* Correcciones de la revisión de Argon sobre el diff de Sol (backend/CloudOcrAdapter.gs):
   - una página con error y fullTextAnnotation vacío no cuenta como leída;
   - sin número de página, cada página de un lote usa su número real (no el índice del lote);
   - no se inicia una llamada a Vision si no cabe el margen de un fetch antes del presupuesto.
   Usa respuestas simuladas: no llama a Google. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', 'backend', 'CloudOcrAdapter.gs'), 'utf8');

function env(replies = []) {
  const llamadas = [];
  const ctx = {
    console, JSON, Math, Number, Object, Array, String, Date, Error, Set, Buffer,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'RINDE_FACIL_GCP_PROJECT_ID' ? 'proy' : '') }) },
    ScriptApp: { getOAuthToken: () => 'tok' },
    Utilities: { base64Encode: b => Buffer.from(b).toString('base64'), sleep: () => {} },
    Logger: { log: () => {} },
    UrlFetchApp: {
      fetch: (url, opts) => {
        llamadas.push(JSON.parse(opts.payload));
        const r = replies.shift();
        return { getResponseCode: () => r.code || 200, getContentText: () => JSON.stringify(r.body) };
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, llamadas };
}
const pdf = { getContentType: () => 'application/pdf', getBytes: () => Buffer.from('%PDF') };
const textoPagina = n => ({ context: { pageNumber: n }, fullTextAnnotation: { text: 'p' + n, pages: [{ width: 1, height: 1, blocks: [] }] } });

test('una página con error y fullTextAnnotation vacío no cuenta como leída', () => {
  const { ctx } = env();
  const out = ctx.parseCloudVisionPayload_({ responses: [{ responses: [{ error: { message: 'cuota' }, fullTextAnnotation: {} }] }] }, { file_request: true });
  assert.equal(out.status, 'ERROR');
  assert.equal(out.page_count, 0);
  assert.match(out.error, /cuota/);
});

test('sin número de página, la página sin texto se etiqueta con su número real del lote, y la cobertura no se infiere', () => {
  const { ctx } = env();
  const payload = { responses: [{ responses: [
    { fullTextAnnotation: { text: 'a', pages: [{}] } },
    { fullTextAnnotation: { text: '', pages: [{}] } }
  ] }] };
  const out = ctx.parseCloudVisionPayload_(payload, { file_request: true, pages_batch: [6, 7] });
  assert.deepEqual(JSON.parse(JSON.stringify(out.pages_without_text)), [7]);
  assert.deepEqual(JSON.parse(JSON.stringify(out.pages_received)), [null, null]);
});

test('no se inicia una llamada a Vision si no cabe el margen de un fetch antes del presupuesto', () => {
  const { ctx, llamadas } = env([{ body: { responses: [{ totalPages: 1, responses: [textoPagina(1)] }] } }]);
  const out = ctx.callCloudVision_(pdf, { started_at_ms: Date.now() - 230000 });
  assert.equal(out.status, 'ERROR');
  assert.match(out.error, /OCR_TIEMPO_AGOTADO/);
  assert.equal(llamadas.length, 0);
});
