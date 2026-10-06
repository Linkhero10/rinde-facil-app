<#
  Prepara una vista previa local de publicación de Rinde Fácil.
  No escribe en el clon, no hace commit ni push salvo que se entreguen
  conjuntamente -Publish y -ConfirmPublish "PUBLICAR Linkhero10/rinde-facil-app <rama>".

  El único origen y destino autorizados son:
    D:\SMI\Productos\Rinde fácil\app
    D:\Publicaciones\rinde-facil-app

  Uso seguro (solo lectura):
    .\tools\publicar.ps1 -Clon D:\Publicaciones\rinde-facil-app -Ref main -Mensaje "Actualización"

  Publicación explícita (no ejecutar sin revisar la vista previa):
    .\tools\publicar.ps1 -Clon D:\Publicaciones\rinde-facil-app -Ref main `
      -Mensaje "Actualización" -Publish `
      -ConfirmPublish "PUBLICAR Linkhero10/rinde-facil-app main"
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)][string]$Clon,
  [Parameter(Mandatory = $true)][string]$Ref,
  [Parameter(Mandatory = $true)][string]$Mensaje,
  [switch]$Publish,
  [string]$ConfirmPublish
)

$ErrorActionPreference = 'Stop'
$ExpectedSourceRoot = 'D:\SMI\Productos\Rinde fácil\app'
$ExpectedCloneRoot = 'D:\Publicaciones\rinde-facil-app'
$ExpectedRemote = 'https://github.com/Linkhero10/rinde-facil-app.git'
$AllowedSourceEntries = @(
  '.github', 'assets', 'backend', 'css', 'docs', 'js', 'test', 'tools', 'vendor',
  '.gitignore', 'eslint.config.js', 'index.html', 'manifest.webmanifest',
  'package.json', 'README.md', 'sw.js'
)
$SecretPatterns = @(
  'AIza[0-9A-Za-z_\-]{30,}', 'ya29\.[0-9A-Za-z_\-]{20,}',
  '-----BEGIN [A-Z ]*PRIVATE KEY-----', 'ghp_[0-9A-Za-z]{30,}',
  'sk-[0-9A-Za-z]{30,}', ('rinde' + 'facil2026smi')
)

function Get-NormalizedPath([string]$Path) {
  return [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
}

function Assert-NoReparsePath([string]$Path) {
  $item = Get-Item -LiteralPath (Get-NormalizedPath $Path) -Force -ErrorAction Stop
  while ($item) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "No se admiten junctions/enlaces en una ruta de origen o destino: $($item.FullName)"
    }
    $item = $item.Parent
  }
}

function Test-AllowedRemote([string]$Remote) {
  if ([string]::IsNullOrWhiteSpace($Remote)) { return $false }
  $value = $Remote.Trim()
  return ($value -cmatch '^https://github\.com/Linkhero10/rinde-facil-app(?:\.git)?/?$' -or
          $value -cmatch '^git@github\.com:Linkhero10/rinde-facil-app(?:\.git)?$' -or
          $value -cmatch '^ssh://git@github\.com/Linkhero10/rinde-facil-app(?:\.git)?$')
}

function Invoke-GitRead([string[]]$Arguments) {
  $result = @(& git -C $script:TargetRoot @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "Falló git $($Arguments -join ' ') (código $LASTEXITCODE): $($result -join "`n")" }
  return ($result -join "`n").Trim()
}

function Assert-PublishTarget {
  $script:SourceRoot = Get-NormalizedPath (Join-Path $PSScriptRoot '..')
  $script:TargetRoot = Get-NormalizedPath $Clon

  if (-not $script:SourceRoot.Equals((Get-NormalizedPath $ExpectedSourceRoot), [StringComparison]::OrdinalIgnoreCase)) {
    throw "Origen no autorizado: $script:SourceRoot"
  }
  if (-not $script:TargetRoot.Equals((Get-NormalizedPath $ExpectedCloneRoot), [StringComparison]::OrdinalIgnoreCase)) {
    throw "Destino no autorizado. Debe ser exactamente: $ExpectedCloneRoot"
  }
  Assert-NoReparsePath $script:SourceRoot
  Assert-NoReparsePath $script:TargetRoot
  if ($script:TargetRoot.Equals($script:SourceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Origen y clon no pueden ser el mismo directorio.'
  }
  $gitDirectory = Get-Item -LiteralPath (Join-Path $script:TargetRoot '.git') -Force -ErrorAction SilentlyContinue
  if (-not $gitDirectory -or -not $gitDirectory.PSIsContainer -or ($gitDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "No existe el clon Git esperado: $script:TargetRoot"
  }

  $gitRoot = Get-NormalizedPath (Invoke-GitRead @('rev-parse', '--show-toplevel'))
  if (-not $gitRoot.Equals($script:TargetRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "La raíz Git real ($gitRoot) no coincide con el destino autorizado ($script:TargetRoot)."
  }

  $fetchRemote = Invoke-GitRead @('remote', 'get-url', 'origin')
  $pushRemote = Invoke-GitRead @('remote', 'get-url', '--push', 'origin')
  if (-not (Test-AllowedRemote $fetchRemote) -or -not (Test-AllowedRemote $pushRemote)) {
    throw "Remoto no autorizado. fetch='$fetchRemote'; push='$pushRemote'; esperado='$ExpectedRemote' (o URL SSH equivalente)."
  }

  & git -C $script:TargetRoot check-ref-format --branch $Ref *> $null
  if ($LASTEXITCODE -ne 0) { throw "Ref de rama inválido: $Ref" }
  $branch = Invoke-GitRead @('symbolic-ref', '--short', 'HEAD')
  if (-not $branch.Equals($Ref, [StringComparison]::Ordinal)) {
    throw "La rama activa '$branch' no coincide con -Ref '$Ref'; no se cambia ni se adivina la rama."
  }

  $dirty = Invoke-GitRead @('status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none')
  if (-not [string]::IsNullOrWhiteSpace($dirty)) {
    throw "El clon debe estar limpio antes de copiar. Estado detectado:`n$dirty"
  }
}

function Get-PublishFiles {
  $files = [Collections.Generic.List[object]]::new()
  foreach ($entry in $AllowedSourceEntries) {
    $path = Join-Path $script:SourceRoot $entry
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $item = Get-Item -LiteralPath $path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "No se publican enlaces/reparse points: $entry"
    }
    if ($item.PSIsContainer) {
      foreach ($child in Get-ChildItem -LiteralPath $path -Recurse -File -Force) {
        if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
          throw "No se publican enlaces/reparse points: $($child.FullName)"
        }
        $relative = $child.FullName.Substring($script:SourceRoot.TrimEnd('\').Length + 1).Replace('\', '/')
        if ($relative.StartsWith('../', [StringComparison]::Ordinal)) {
          throw "Ruta fuera de la lista segura de publicación: $relative"
        }
        if ($relative -match '(^|/)(\.git|node_modules|private|\.secrets|__pycache__)(/|$)' -or $relative -match '\.py[co]$') { continue }
        $files.Add([pscustomobject]@{ Source = $child.FullName; Relative = $relative })
      }
    } else {
      $files.Add([pscustomobject]@{ Source = $item.FullName; Relative = $entry })
    }
  }
  return @($files | Sort-Object Relative -Unique)
}

function Assert-NoSecrets($Files) {
  $textExtensions = @('.js', '.mjs', '.gs', '.ps1', '.md', '.json', '.html', '.css', '.webmanifest', '.yml', '.yaml', '.txt')
  foreach ($file in $Files) {
    if ([IO.Path]::GetExtension($file.Source).ToLowerInvariant() -notin $textExtensions) { continue }
    $match = Select-String -LiteralPath $file.Source -Pattern $SecretPatterns -List -ErrorAction Stop
    if ($match) { throw "Posible secreto en origen: $($file.Relative):$($match.LineNumber); no se copia ni publica." }
  }
}

function Assert-NoIgnoredCollisions($Files) {
  foreach ($file in $Files) {
    $destination = Join-Path $script:TargetRoot ($file.Relative -replace '/', [IO.Path]::DirectorySeparatorChar)
    $parent = Split-Path -Parent $destination
    while ($parent -and $parent.StartsWith($script:TargetRoot, [StringComparison]::OrdinalIgnoreCase)) {
      if (Test-Path -LiteralPath $parent) {
        $parentItem = Get-Item -LiteralPath $parent -Force
        if (-not $parentItem.PSIsContainer) { throw "Conflicto: se necesita una carpeta donde ya hay un archivo: $parent" }
        if (($parentItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
          throw "No se copia a través de una junction/enlace local: $parent"
        }
      }
      if ($parent.Equals($script:TargetRoot, [StringComparison]::OrdinalIgnoreCase)) { break }
      $parent = Split-Path -Parent $parent
    }
    if (Test-Path -LiteralPath $destination) {
      $destinationItem = Get-Item -LiteralPath $destination -Force
      if ($destinationItem.PSIsContainer) { throw "Conflicto: se necesita un archivo donde ya hay una carpeta: $($file.Relative)" }
      & git -C $script:TargetRoot check-ignore --quiet -- $file.Relative
      if ($LASTEXITCODE -eq 0) { throw "Colisión con archivo ignorado local; no se sobrescribe: $($file.Relative)" }
      if ($LASTEXITCODE -gt 1) { throw "git check-ignore falló ($LASTEXITCODE) para $($file.Relative)" }
    }
  }
}

Assert-PublishTarget
$files = Get-PublishFiles
Assert-NoSecrets $files
Assert-NoIgnoredCollisions $files

$preview = foreach ($file in $files) {
  $destination = Join-Path $script:TargetRoot ($file.Relative -replace '/', [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $destination)) { "ADD    $($file.Relative)"; continue }
  $sourceHash = (Get-FileHash -LiteralPath $file.Source -Algorithm SHA256).Hash
  $targetHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
  if ($sourceHash -eq $targetHash) { "SAME   $($file.Relative)" } else { "UPDATE $($file.Relative)" }
}

Write-Host "Origen: $script:SourceRoot"
Write-Host "Clon:   $script:TargetRoot"
Write-Host "Remoto: $ExpectedRemote"
Write-Host "Rama:   $Ref"
Write-Host 'Vista previa (no se eliminarán archivos del clon):'
$preview | ForEach-Object { Write-Host "  $_" }
Write-Host 'Los archivos del clon que no estén en el origen se conservarán.'

if (-not $Publish) {
  Write-Host 'Modo de solo lectura: no se copió, preparó, confirmó ni publicó nada.'
  return
}

$requiredConfirmation = "PUBLICAR Linkhero10/rinde-facil-app $Ref"
if (-not [string]::Equals($ConfirmPublish, $requiredConfirmation, [StringComparison]::Ordinal)) {
  throw "Para habilitar publicación, pasa -ConfirmPublish `"$requiredConfirmation`" junto con -Publish."
}
if (-not $PSCmdlet.ShouldProcess("$ExpectedRemote ($Ref)", 'copiar archivos, crear commit y hacer push fast-forward')) {
  return
}

function Invoke-Publish($Files) {
  $paths = [Collections.Generic.List[string]]::new()
  foreach ($file in $Files) {
    $destination = Join-Path $script:TargetRoot ($file.Relative -replace '/', [IO.Path]::DirectorySeparatorChar)
    $parent = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath $file.Source -Destination $destination -Force
    $paths.Add($file.Relative)
  }

  $gitAddArguments = @('add', '--') + $paths.ToArray()
  & git -C $script:TargetRoot @gitAddArguments
  if ($LASTEXITCODE -ne 0) { throw "git add falló ($LASTEXITCODE). No se ejecutó commit ni push." }
  $stagedCheck = Invoke-GitRead @('diff', '--cached', '--check')
  $staged = Invoke-GitRead @('status', '--porcelain=v1', '--untracked-files=all')
  if ([string]::IsNullOrWhiteSpace($staged)) {
    Write-Host 'No hay diferencias que publicar; no se crea commit ni se hace push.'
    return
  }
  Write-Host 'Cambios preparados:'
  Write-Host $staged

  & git -C $script:TargetRoot commit -m $Mensaje
  if ($LASTEXITCODE -ne 0) { throw "git commit falló ($LASTEXITCODE); no se ejecutó push." }
  & git -C $script:TargetRoot push origin "HEAD:refs/heads/$Ref"
  if ($LASTEXITCODE -ne 0) { throw "git push falló ($LASTEXITCODE). El commit local puede existir; revisa antes de reintentar." }
}

Invoke-Publish $files
