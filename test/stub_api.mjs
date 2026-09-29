/* SOLO PARA PRUEBAS: imita el contrato del servicio de la comunidad (Apps Script) sin usar Google.
   No lee ninguna imagen: devuelve un texto fijo de un comprobante ficticio. Sirve para probar el flujo de la app. */
import http from 'node:http';

export function startStub(port = 8791) {
  const store = { state: null, calls: [] };
  const CANNED = `EMPRESA FANTASÍA SPA
RUT: 76.123.456-0
FACTURA ELECTRÓNICA N° 1042
Fecha de emisión: 14 de agosto de 2026
Monto Neto $1.250.000
IVA (19%) $237.500
Total $1.487.500`;
  const server = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let p = {};
      try { p = JSON.parse(body || '{}'); } catch { /* vacío */ }
      store.calls.push({ action: p.action, key: p.key, bytes: (p.base64 || '').length });
      let out;
      if (p.key !== 'clave-de-prueba') out = { ok: false, error: 'CLAVE_INVALIDA' };
      else if (p.action === 'ping') out = { ok: true, version: 'stub', ocr: true };
      else if (p.action === 'ocr') out = { ok: true, engine: 'cloud_vision', raw_text: CANNED, confidence: 0.97, duration_ms: 5, stub: true };
      else if (p.action === 'saveFile') out = { ok: true, fileId: 'stub-file-1', folder: String(p.issueDate || '').slice(0, 7), idempotent: false };
      else if (p.action === 'saveState') { store.state = p.state; out = { ok: true, savedAt: 'now' }; }
      else if (p.action === 'loadState') out = store.state ? { ok: true, state: store.state } : { ok: false, error: 'SIN_COPIA' };
      else out = { ok: false, error: 'ACCION_DESCONOCIDA' };
      res.writeHead(200, cors); res.end(JSON.stringify(out));
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, store, url: 'http://127.0.0.1:' + port + '/exec' })));
}
