/* Carga los módulos sin DOM (util, datos, trámites, store, lógica, exportación) en un contexto de pruebas. */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(here, '..', 'js');

export function loadApp(files) {
  const ctx = { console, Date, Math, JSON, Intl, Promise, setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob, crypto: globalThis.crypto, atob: globalThis.atob, btoa: globalThis.btoa };
  ctx.globalThis = ctx;
  ctx.window = undefined;
  ctx.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
  vm.createContext(ctx);
  const list = files || fs.readdirSync(jsDir).filter(f => /^(0[1-5]|1\d|2\d|33)-.*\.js$/.test(f)).sort();
  for (const f of list) {
    const code = fs.readFileSync(path.join(jsDir, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  loadApp.lastCtx = ctx;
  return ctx.RF;
}
