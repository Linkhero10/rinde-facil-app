<#
  Publica la app en el repositorio público ya autorizado (Linkhero10/rinde-facil-app), SIN pasar por D:\SMI.
  La única copia editable del código es esta carpeta (Productos\Rinde fácil\app). El repositorio público vive FUERA de D:\SMI
  para no anidar repositorios. Uso:
    powershell -File tools\publicar.ps1 -Clon D:\Publicaciones\rinde-facil-app -Mensaje "texto del commit"
  Hace: copia (sin private, .git, node_modules), escanea secretos, muestra el resumen y se detiene. Con -Enviar hace commit y push.
#>
param(
  [Parameter(Mandatory = $true)][string]$Clon,
  [Parameter(Mandatory = $true)][string]$Mensaje,
  [switch]$Enviar
)
$ErrorActionPreference = 'Stop'
$origen = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Clon '.git'))) { throw "«$Clon» no es un clon de git. Clónalo primero: git clone https://github.com/Linkhero10/rinde-facil-app $Clon" }
if ($Clon.TrimEnd('\') -like 'D:\SMI*') { throw 'El clon no puede estar dentro de D:\SMI (repositorios anidados).' }

robocopy $origen $Clon /MIR /XD private .git node_modules /XF *.log /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy falló ($LASTEXITCODE)" }

# escaneo simple de secretos: claves de API, tokens de Google, códigos de instalación y contraseñas escritas en archivos
$patrones = 'AIza[0-9A-Za-z_\-]{30,}', 'ya29\.[0-9A-Za-z_\-]{20,}', '-----BEGIN [A-Z ]*PRIVATE KEY-----', 'ghp_[0-9A-Za-z]{30,}', 'sk-[0-9A-Za-z]{30,}', 'rindefacil2026smi'
$hallazgos = Get-ChildItem $Clon -Recurse -File -Exclude *.png, *.jpg, *.jpeg, *.woff2, *.ico, publicar.ps1 | Where-Object { $_.FullName -notmatch '[\\/](\.git|node_modules)[\\/]' } | Select-String -Pattern $patrones -List
if ($hallazgos) { $hallazgos | ForEach-Object { Write-Host "POSIBLE SECRETO: $($_.Path):$($_.LineNumber)" }; throw 'Se encontraron posibles secretos: no se publica.' }

git -C $Clon add -A
git -C $Clon status --short
if ($Enviar) {
  git -C $Clon commit -m "$Mensaje`n`nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
  git -C $Clon push
} else { Write-Host 'Revisa el resumen. Repite con -Enviar para hacer commit y push.' }
