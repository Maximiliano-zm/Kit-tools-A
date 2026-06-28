<#
.SYNOPSIS
  Sube la version de un agente ya generado en TODOS los archivos a la vez,
  para que la app de Claude detecte el cambio (truco de "las dos versiones").

.DESCRIPTION
  La app de Claude cachea el marketplace; si solo cambias el contenido del
  skill sin tocar las versiones, no detecta la actualizacion. Este script
  reemplaza el numero de version en:
    - <repo>\.claude-plugin\marketplace.json   (metadata.version y plugins[].version)
    - <repo>\plugins\<agente>\.claude-plugin\plugin.json   (version)

.PARAMETER RepoPath
  Ruta al repo del agente (la carpeta que contiene .claude-plugin\marketplace.json).

.PARAMETER NewVersion
  Nueva version semantica (ej. "0.2.0"). Si se omite, incrementa el patch (z+1).

.EXAMPLE
  .\tools\bump-version.ps1 -RepoPath C:\Users\mz\Desktop\agentes\mi-agente -NewVersion 0.2.0

.EXAMPLE
  .\tools\bump-version.ps1 -RepoPath .\mi-agente        # auto: 0.1.0 -> 0.1.1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RepoPath,
    [string]$NewVersion
)

$ErrorActionPreference = 'Stop'

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

$marketplace = Join-Path $RepoPath '.claude-plugin\marketplace.json'
if (-not (Test-Path -LiteralPath $marketplace)) {
    throw "No se encontro marketplace.json en: $marketplace"
}

# Detectar version actual (primer campo "version")
$mkRaw = Get-Content -LiteralPath $marketplace -Raw -Encoding UTF8
$curMatch = [regex]::Match($mkRaw, '"version"\s*:\s*"([^"]+)"')
$current = if ($curMatch.Success) { $curMatch.Groups[1].Value } else { '0.0.0' }

if (-not $NewVersion) {
    $parts = $current.Split('.')
    while ($parts.Count -lt 3) { $parts += '0' }
    $patch = 0; [void][int]::TryParse($parts[2], [ref]$patch)
    $NewVersion = "{0}.{1}.{2}" -f $parts[0], $parts[1], ($patch + 1)
}

if ($NewVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version invalida '$NewVersion'. Usa formato semantico x.y.z (ej. 0.2.0)."
}

Write-Host ("Subiendo version: {0} -> {1}" -f $current, $NewVersion) -ForegroundColor Cyan

# Reemplazar TODOS los campos "version" en marketplace.json (metadata + plugins[])
$mkNew = [regex]::Replace($mkRaw, '"version"\s*:\s*"[^"]*"', ('"version": "{0}"' -f $NewVersion))
Write-Utf8NoBom -Path $marketplace -Content $mkNew
Write-Host ("  + {0}" -f $marketplace) -ForegroundColor Green

# Reemplazar version en cada plugin.json
$pluginFiles = Get-ChildItem -LiteralPath (Join-Path $RepoPath 'plugins') -Recurse -Filter 'plugin.json' -ErrorAction SilentlyContinue
foreach ($pf in $pluginFiles) {
    $raw = Get-Content -LiteralPath $pf.FullName -Raw -Encoding UTF8
    $new = [regex]::Replace($raw, '"version"\s*:\s*"[^"]*"', ('"version": "{0}"' -f $NewVersion))
    Write-Utf8NoBom -Path $pf.FullName -Content $new
    Write-Host ("  + {0}" -f $pf.FullName) -ForegroundColor Green
}

Write-Host ""
Write-Host "Hecho. Ahora:" -ForegroundColor Cyan
Write-Host "  git add -A; git commit -m `"v$NewVersion`"; git push"
Write-Host "  En la app: Sincronizar el marketplace (...) y luego Actualizar el plugin."
Write-Host "  Si 'Actualizar' sigue gris, elimina y vuelve a agregar el marketplace (cache ~5 min)."
