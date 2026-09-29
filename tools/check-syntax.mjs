/* Revisa que todos los archivos de la app y del servicio se puedan leer como JavaScript (sin ejecutarlos). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [['js', '.js'], ['backend', '.gs']].flatMap(([d, ext]) => fs.readdirSync(path.join(root, d)).filter(f => f.endsWith(ext)).map(f => path.join(root, d, f))).concat([path.join(root, 'sw.js')]);
let bad = 0;
for (const f of targets) {
  try { new Function(fs.readFileSync(f, 'utf8')); } catch (e) { bad++; console.log('✖', path.relative(root, f), e.message); }
}
console.log(targets.length + ' archivos revisados, ' + bad + ' con error de sintaxis');
process.exit(bad ? 1 : 0);
