import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../tools/publicar.ps1', import.meta.url);
const source = await readFile(scriptPath, 'utf8');
const swSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('el publicador fija y comprueba los dos directorios autorizados', () => {
  assert.match(source, /ExpectedSourceRoot\s*=\s*['"]D:\\SMI\\Productos\\Rinde fácil\\app['"]/i);
  assert.match(source, /ExpectedCloneRoot\s*=\s*['"]D:\\Publicaciones\\rinde-facil-app['"]/i);
  assert.match(source, /GetFullPath/i);
  assert.match(source, /ExpectedSourceRoot/i);
  assert.match(source, /ExpectedCloneRoot/i);
});

test('valida el remoto de lectura y escritura contra el repositorio público exacto', () => {
  assert.match(source, /https:\/\/github\.com\/Linkhero10\/rinde-facil-app\.git/);
  assert.match(source, /remote',\s*'get-url',\s*'origin'/i);
  assert.match(source, /remote',\s*'get-url',\s*'--push',\s*'origin'/i);
  assert.match(source, /function\s+Test-AllowedRemote/i);
});

test('exige ref explícito, rama actual coincidente y árbol Git limpio antes de copiar', () => {
  assert.match(source, /\[Parameter\(Mandatory\s*=\s*\$true\)\]\[string\]\$Ref/i);
  assert.match(source, /check-ref-format\s+--branch\s+\$Ref/i);
  assert.match(source, /symbolic-ref',\s*'--short',\s*'HEAD'/i);
  assert.match(source, /status',\s*'--porcelain=v1',\s*'--untracked-files=all'/i);
  assert.match(source, /Assert-NoReparsePath/i);
  assert.match(source, /No se copia a través de una junction\/enlace local/i);
  assert.match(source, /check-ignore\s+--quiet/i);
});

test('publicación queda en seco por defecto y requiere -Publish más confirmación literal', () => {
  assert.match(source, /SupportsShouldProcess\s*=\s*\$true/i);
  assert.match(source, /\[switch\]\$Publish/i);
  assert.match(source, /\$ConfirmPublish/i);
  assert.match(source, /PUBLICAR\s+Linkhero10\/rinde-facil-app/i);
  assert.match(source, /\$PSCmdlet\.ShouldProcess\(/i);
  assert.match(source, /if\s*\(-not\s+\$Publish\)[\s\S]*?return/i);
});

test('no hace espejo ni borrados, y solo agrega archivos explícitos del origen', () => {
  assert.doesNotMatch(source, /\/MIR\b|Remove-Item|Delete-Item|Clear-Content/i);
  assert.match(source, /@\('add',\s*'--'\)/i);
  assert.doesNotMatch(source, /add\s+-A\b/i);
  assert.match(source, /Copy-Item/i);
});

test('el escáner incluye la credencial heredada sin hacer que el propio script se autodenuncie', () => {
  assert.match(source, /\('rinde'\s*\+\s*'facil2026smi'\)/i);
  assert.doesNotMatch(source, new RegExp('rinde' + 'facil2026smi', 'i'));
});

test('omite fixtures privados y cachés generadas en lugar de copiarlos o bloquear una publicación válida', () => {
  const filterStart = source.indexOf("if ($relative -match");
  const filterEnd = source.indexOf("$files.Add", filterStart);
  assert.ok(filterStart >= 0 && filterEnd > filterStart, 'el filtro de exclusión se ejecuta antes de agregar un archivo');
  const filter = source.slice(filterStart, filterEnd);
  assert.match(filter, /private|__pycache__/i);
  assert.match(filter, /\.py\[co\]\$/i);
  assert.match(filter, /continue/i);
});

test('la publicación invalida la caché anterior y precarga el módulo de confianza', () => {
  assert.match(swSource, /var VERSION\s*=\s*['"]rf-v3-4['"]/);
  assert.match(swSource, /CORE\s*=\s*\[[^\]]*['"]js\/00-service-trust\.js['"]/s);
});

test('commit y push usan funciones protegidas y un refspec explícito, sin force', () => {
  assert.match(source, /function\s+Invoke-Publish/i);
  assert.match(source, /refs\/heads\/\$Ref/i);
  assert.match(source, /push\s+origin\s+"HEAD:refs\/heads\/\$Ref"/i);
  assert.doesNotMatch(source, /git\s+push\s+[^\r\n]*--force/i);
});

test('toda mutación queda después de validar el destino, confirmar y pasar ShouldProcess', () => {
  const validation = source.indexOf('Assert-PublishTarget\n$files = Get-PublishFiles');
  const confirmation = source.indexOf('if (-not [string]::Equals($ConfirmPublish');
  const shouldProcess = source.indexOf('$PSCmdlet.ShouldProcess(');
  const mutation = source.indexOf('Copy-Item -LiteralPath $file.Source');
  const commit = source.indexOf("commit -m $Mensaje");
  const push = source.indexOf('push origin "HEAD:refs/heads/$Ref"');
  for (const position of [validation, confirmation, shouldProcess, mutation, commit, push]) {
    assert.notEqual(position, -1, 'cada control/operación requerida aparece en el script');
  }
  assert.ok(validation < confirmation && confirmation < shouldProcess && shouldProcess < mutation && mutation < commit && commit < push);
});
