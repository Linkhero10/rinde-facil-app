/* SOLO PARA PRUEBAS: servicio local que ejecuta el WebApi.gs REAL (con Google simulado, ver gas_sim.mjs).
   No lee ninguna imagen: Vision devuelve el texto fijo de un comprobante ficticio. Nace SIN cuenta: la prueba la crea con el código de instalación. */
import http from 'node:http';
import { makeEnv } from './gas_sim.mjs';

export const SETUP_CODE = 'codigo-de-instalacion-de-prueba';
const CANNED = `EMPRESA FANTASÍA SPA
RUT: 76.123.456-0
FACTURA ELECTRÓNICA N° 1042
Fecha de emisión: 14 de agosto de 2026
Monto Neto $1.250.000
IVA (19%) $237.500
Total $1.487.500`;

export function startStub(port = 8791) {
  const vision = { status: 'SUCCESS', raw_text: CANNED, confidence: 0.97, duration_ms: 5, page_count: 1, document_coverage: 'COMPLETE' };
  const env = makeEnv({ RINDE_FACIL_SETUP_CODE: SETUP_CODE, RINDE_FACIL_GCP_PROJECT_ID: 'proyecto-de-prueba' }, vision, { anon: true });
  const store = { state: null, calls: [], env, vision, canned: CANNED, ocrDelay: 0 };
  const server = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let p = {};
      try { p = JSON.parse(body || '{}'); } catch { /* vacío */ }
      const out = env.call(null, body);
      store.calls.push({ action: p.action, ok: out.ok, error: out.error, hadToken: typeof p.t === 'string', bytes: (p.base64 || '').length, category: p.category, subfolder: p.subfolder, project: p.project, fileName: p.fileName, mimeType: p.mimeType, issueDate: p.issueDate, text: p.mimeType === 'text/plain' && p.base64 ? Buffer.from(p.base64, 'base64').toString('utf8') : undefined });
      if (p.action === 'saveState' && out.ok) store.state = p.state;
      setTimeout(() => { res.writeHead(200, cors); res.end(JSON.stringify(out)); }, p.action === 'ocr' ? store.ocrDelay : 0);
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    resolve({ server, store, url: 'http://127.0.0.1:' + address.port + '/exec' });
  }));
}
