# build.ps1 - Gera o instalador CISPR 15 LABELO standalone (.exe)
#
# Uso:
#   .\build.ps1                 -> build completo
#   .\build.ps1 -SkipNextBuild  -> so recompila o Electron (Next.js ja buildado)
param([switch]$SkipNextBuild)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host ""
Write-Host "=== CISPR 15 LABELO - Builder ===" -ForegroundColor Cyan

# Passo 1: Build do Next.js (standalone)
if (-not $SkipNextBuild) {
    Write-Host ""
    Write-Host "[1/3] Compilando Next.js..." -ForegroundColor Yellow
    Set-Location $root
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build falhou" }

    $serverJs = Join-Path $root ".next\standalone\server.js"
    if (-not (Test-Path $serverJs)) {
        throw "Standalone nao gerado. Verifique next.config.js: precisa de output standalone"
    }

    # Copia static e public para dentro do standalone
    $standaloneDir = Join-Path $root ".next\standalone"
    Write-Host "    Copiando .next/static -> standalone/.next/static" -ForegroundColor DarkGray
    Copy-Item -Recurse -Force (Join-Path $root ".next\static") (Join-Path $standaloneDir ".next\static")
    Write-Host "    Copiando public/ -> standalone/public" -ForegroundColor DarkGray
    Copy-Item -Recurse -Force (Join-Path $root "public") (Join-Path $standaloneDir "public")

    Write-Host "[1/3] OK - Standalone gerado" -ForegroundColor Green
} else {
    Write-Host "[1/3] Pulando build do Next.js (-SkipNextBuild)" -ForegroundColor DarkGray
}

# Passo 2: Instalar dependencias (apenas electron e electron-builder)
Write-Host ""
Write-Host "[2/3] Verificando dependencias..." -ForegroundColor Yellow
Set-Location $root
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install falhou" }
Write-Host "[2/3] OK" -ForegroundColor Green

# Passo 3: Gerar instalador
Write-Host ""
Write-Host "[3/3] Gerando instalador .exe..." -ForegroundColor Yellow
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:WIN_CSC_LINK                = ""
npm run dist
if ($LASTEXITCODE -ne 0) { throw "electron-builder falhou" }

# Resultado
$exe = Get-ChildItem (Join-Path $root "dist") -Filter "*.exe" -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Host ""
Write-Host "=== PRONTO ===" -ForegroundColor Green
if ($exe) {
    Write-Host "Arquivo: $($exe.FullName)" -ForegroundColor White
    Write-Host "Tamanho: $([Math]::Round($exe.Length / 1MB, 1)) MB" -ForegroundColor White
}
