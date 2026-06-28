<#
.SYNOPSIS
  Genera la estructura completa de un agente nuevo (marketplace + plugin + skill)
  listo para publicar en GitHub e instalar en la app de Claude desktop.

.DESCRIPTION
  Crea un repositorio con esta estructura (la "receta"):

    <repo>/
    |-- .claude-plugin/
    |   `-- marketplace.json          (catalogo del marketplace)
    `-- plugins/
        `-- <agente>/
            |-- .claude-plugin/
            |   `-- plugin.json        (manifiesto del plugin)
            `-- skills/
                `-- <agente>/
                    |-- SKILL.md       (el cerebro del agente)
                    |-- scripts/       (opcional)
                    |-- references/    (opcional)
                    `-- assets/        (opcional)

  Toma las plantillas de ..\templates y reemplaza los marcadores {{...}}.
  Los valores por defecto (usuario de GitHub, autor, licencia) se leen de
  ..\kit.config.json y se pueden sobreescribir por parametro.

.PARAMETER Name
  Nombre del agente en kebab-case (ej. "mi-agente"). Obligatorio.

.PARAMETER Description
  Que hace el agente, en una linea. Va a marketplace.json y plugin.json.

.PARAMETER Trigger
  Texto del "description" del frontmatter de SKILL.md = el DISPARADOR.
  Describe cuando debe activarse el skill e incluye palabras clave.
  Si se omite, se construye a partir de -Description.

.PARAMETER OutDir
  Carpeta donde se crea el repo. Por defecto, la carpeta actual.

.EXAMPLE
  .\tools\new-agent.ps1 -Name cotizador -Description "Genera cotizaciones en .docx" `
      -Trigger "Usalo cuando el usuario pida una cotizacion o pegue una lista de precios."

.EXAMPLE
  .\tools\new-agent.ps1 -Name procesos-gama -Description "Documenta procesos" `
      -WithScripts -GitInit -OutDir C:\Users\mz\Desktop\agentes
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [string]$Title,
    [string]$Description = "Que hace el agente en una linea.",
    [string]$DescriptionLong,
    [string]$Trigger,
    [string]$Repo,
    [string]$GitHubUser,
    [string]$Author,
    [string]$MarketplaceName,
    [string]$MarketplaceDescription,
    [string]$Category,
    [string]$Keywords = "",
    [string]$Version,
    [string]$License,
    [string]$OutDir = (Get-Location).Path,
    [switch]$WithScripts,
    [switch]$GitInit,
    [switch]$Force,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $enc = New-Object System.Text.UTF8Encoding($false)   # $false = sin BOM
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

function Expand-Tokens {
    param([string]$Text, [hashtable]$Map)
    foreach ($k in $Map.Keys) {
        $Text = $Text.Replace('{{' + $k + '}}', [string]$Map[$k])
    }
    return $Text
}

function To-Title {
    param([string]$Slug)
    $words = $Slug -split '-' | Where-Object { $_ } | ForEach-Object {
        if ($_.Length -gt 1) { $_.Substring(0, 1).ToUpper() + $_.Substring(1) }
        else { $_.ToUpper() }
    }
    return ($words -join ' ')
}

# ---------------------------------------------------------------------------
# Rutas del kit + config
# ---------------------------------------------------------------------------
$kitRoot     = Split-Path -Parent $PSScriptRoot
$templateDir = Join-Path $kitRoot 'templates'
$configPath  = Join-Path $kitRoot 'kit.config.json'

if (-not (Test-Path -LiteralPath $templateDir)) {
    throw "No se encontro la carpeta de plantillas: $templateDir"
}

$cfg = $null
if (Test-Path -LiteralPath $configPath) {
    try { $cfg = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { Write-Warning "No se pudo leer kit.config.json: $($_.Exception.Message)" }
}
function Cfg([string]$prop, $fallback) {
    if ($cfg -and ($cfg.PSObject.Properties.Name -contains $prop) -and $cfg.$prop) { return $cfg.$prop }
    return $fallback
}

# ---------------------------------------------------------------------------
# Validacion y valores por defecto
# ---------------------------------------------------------------------------
if ($Name -cnotmatch '^[a-z0-9]+(-[a-z0-9]+)*$') {
    throw "El nombre '$Name' no es kebab-case valido. Usa minusculas, numeros y guiones (ej. 'mi-agente')."
}

if (-not $Title)                  { $Title = To-Title $Name }
if (-not $DescriptionLong)        { $DescriptionLong = $Description }
if (-not $Repo)                   { $Repo = $Name }
if (-not $GitHubUser)             { $GitHubUser = Cfg 'githubUser' '<usuario>' }
if (-not $Author)                 { $Author = Cfg 'authorName' 'Tu Nombre' }
if (-not $MarketplaceName)        { $MarketplaceName = Cfg 'marketplaceName' 'mi-marketplace' }
if (-not $MarketplaceDescription) { $MarketplaceDescription = Cfg 'marketplaceDescription' 'Marketplace de agentes para Claude desktop.' }
if (-not $Category)               { $Category = Cfg 'defaultCategory' 'documentation' }
if (-not $Version)                { $Version = Cfg 'defaultVersion' '0.1.0' }
if (-not $License)                { $License = Cfg 'license' 'UNLICENSED' }
if (-not $Trigger) {
    $Trigger = "$Title. Usalo cuando el usuario pida: $Description Incluye palabras clave que deberian dispararlo. Se especifico; esto decide la activacion."
}

# keywords "a, b, c" -> '"a", "b", "c"'
$kwJson = (
    $Keywords -split ',' |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ } |
    ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }
) -join ', '
if (-not $kwJson) { $kwJson = '"ejemplo"' }

# Escapar comillas en campos que van dentro de JSON entre comillas
function JsonStr([string]$s) { if ($null -eq $s) { return "" } return ($s -replace '\\', '\\' -replace '"', '\"') }

$tokens = @{
    'AGENT_NAME'              = $Name
    'AGENT_TITLE'             = $Title
    'AGENT_DESCRIPTION'       = (JsonStr $Description)      # contexto JSON (marketplace.json)
    'AGENT_DESCRIPTION_LONG'  = (JsonStr $DescriptionLong)  # contexto JSON (plugin.json)
    'BODY_DESCRIPTION'        = $DescriptionLong            # contexto Markdown (cuerpo de SKILL.md, sin escapar)
    'TRIGGER_DESCRIPTION'     = (JsonStr $Trigger)          # frontmatter YAML (comillas escapadas \" validas)
    'GITHUB_USER'             = $GitHubUser
    'REPO_NAME'               = $Repo
    'AUTHOR_NAME'             = (JsonStr $Author)
    'MARKETPLACE_NAME'        = $MarketplaceName
    'MARKETPLACE_DESCRIPTION' = (JsonStr $MarketplaceDescription)
    'VERSION'                 = $Version
    'CATEGORY'                = $Category
    'KEYWORDS_JSON'           = $kwJson
    'LICENSE'                 = $License
}

# ---------------------------------------------------------------------------
# Rutas destino
# ---------------------------------------------------------------------------
$repoPath  = Join-Path $OutDir $Repo
$skillDir  = Join-Path $repoPath ("plugins\{0}\skills\{0}" -f $Name)

$plan = @(
    @{ Tpl = 'marketplace.json'; Dest = (Join-Path $repoPath '.claude-plugin\marketplace.json') }
    @{ Tpl = 'plugin.json';      Dest = (Join-Path $repoPath ("plugins\{0}\.claude-plugin\plugin.json" -f $Name)) }
    @{ Tpl = 'SKILL.md';         Dest = (Join-Path $skillDir 'SKILL.md') }
)

Write-Host ""
Write-Host "=== Generando agente '$Name' ===" -ForegroundColor Cyan
Write-Host ("  repo        : {0}" -f $repoPath)
Write-Host ("  github user : {0}" -f $GitHubUser)
Write-Host ("  autor       : {0}" -f $Author)
Write-Host ("  version     : {0}" -f $Version)
Write-Host ("  disparador  : {0}" -f $Trigger)
Write-Host ""

if ((Test-Path -LiteralPath $repoPath) -and -not $Force) {
    throw "La carpeta destino ya existe: $repoPath  (usa -Force para sobreescribir archivos)"
}

if ($DryRun) {
    Write-Host "[DryRun] Se crearian estos archivos:" -ForegroundColor Yellow
    foreach ($p in $plan) { Write-Host ("  - {0}" -f $p.Dest) }
    Write-Host ("  - {0}" -f (Join-Path $skillDir 'references\.gitkeep'))
    Write-Host ("  - {0}" -f (Join-Path $skillDir 'assets\.gitkeep'))
    if ($WithScripts) { Write-Host ("  - {0}" -f (Join-Path $skillDir 'scripts\ejemplo.py')) }
    Write-Host ("  - {0}" -f (Join-Path $repoPath 'README.md'))
    Write-Host "[DryRun] No se escribio nada." -ForegroundColor Yellow
    return
}

# ---------------------------------------------------------------------------
# Generar archivos
# ---------------------------------------------------------------------------
foreach ($p in $plan) {
    $tplPath = Join-Path $templateDir $p.Tpl
    if (-not (Test-Path -LiteralPath $tplPath)) { throw "Falta la plantilla: $tplPath" }
    $content = Get-Content -LiteralPath $tplPath -Raw -Encoding UTF8
    $content = Expand-Tokens -Text $content -Map $tokens
    Write-Utf8NoBom -Path $p.Dest -Content $content
    Write-Host ("  + {0}" -f $p.Dest) -ForegroundColor Green
}

# Carpetas opcionales con .gitkeep (git no versiona carpetas vacias)
foreach ($sub in @('references', 'assets')) {
    Write-Utf8NoBom -Path (Join-Path $skillDir "$sub\.gitkeep") -Content ""
}

if ($WithScripts) {
    $sample = @'
#!/usr/bin/env python3
"""Script de ejemplo. El agente lo ejecuta en el sandbox de Claude.
Uso: python3 scripts/ejemplo.py [entrada] [salida]
"""
import sys


def main(argv):
    print("Args recibidos:", argv)


if __name__ == "__main__":
    main(sys.argv[1:])
'@
    Write-Utf8NoBom -Path (Join-Path $skillDir 'scripts\ejemplo.py') -Content $sample
    Write-Host ("  + {0}" -f (Join-Path $skillDir 'scripts\ejemplo.py')) -ForegroundColor Green
}

# README del repo del agente (instrucciones de instalacion)
$readme = @"
# $Title

$DescriptionLong

## Instalar en la app de Claude desktop
1. Abre Claude -> en el cuadro de mensaje: **"+" -> "Agregar plugins..."**
2. Pestana **"Plugins"** -> boton **"+"** (Agregar marketplace).
3. En URL pega: ``$GitHubUser/$Repo`` -> **Sincronizar**.
4. En la pestana **"Personal"** -> **"+"** para instalar el plugin **$Name**.
5. El skill se dispara solo al pedir lo que hace, en cualquier chat.

## Publicar / actualizar
- Primera vez: ``git init`` -> commit -> push a ``https://github.com/$GitHubUser/$Repo``.
- El repo DEBE ser **publico** (la app no lee repos privados sin conector de GitHub).
- Para que la app detecte cambios, sube **dos versiones** (marketplace.json y plugin.json)
  con ``tools\bump-version.ps1`` del Kit, luego **Sincronizar** + **Actualizar** en la app.

Generado con Kit-tools-Agentes.
"@
Write-Utf8NoBom -Path (Join-Path $repoPath 'README.md') -Content $readme
Write-Host ("  + {0}" -f (Join-Path $repoPath 'README.md')) -ForegroundColor Green

if ($GitInit) {
    Push-Location $repoPath
    try {
        & git init | Out-Null
        & git add -A | Out-Null
        Write-Host "  * git init + add realizados (falta commit/push)." -ForegroundColor Green
    } catch { Write-Warning "git init fallo: $($_.Exception.Message)" }
    finally { Pop-Location }
}

# ---------------------------------------------------------------------------
# Siguientes pasos
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Listo. Siguientes pasos:" -ForegroundColor Cyan
Write-Host "  1) Edita el cerebro del agente:"
Write-Host ("       {0}\SKILL.md" -f $skillDir)
Write-Host "  2) Publica en GitHub (repo PUBLICO):"
Write-Host ("       cd `"{0}`"" -f $repoPath)
if (-not $GitInit) { Write-Host "       git init" }
Write-Host "       git add -A"
Write-Host "       git commit -m `"Primer agente: $Name`""
Write-Host "       git branch -M main"
Write-Host ("       git remote add origin https://github.com/{0}/{1}.git" -f $GitHubUser, $Repo)
Write-Host "       git push -u origin main"
Write-Host "  3) En Claude desktop: + -> Agregar plugins -> + (marketplace) ->"
Write-Host ("       pega  {0}/{1}  -> Sincronizar -> instala '{2}'." -f $GitHubUser, $Repo, $Name)
Write-Host ""
