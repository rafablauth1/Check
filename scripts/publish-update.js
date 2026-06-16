const fs   = require('fs')
const path = require('path')

const pkg       = require('../package.json')
const version   = pkg.version
const installer = `CISPR 15 LABELO Setup ${version}.exe`
const buildOutput = pkg.build?.directories?.output || 'dist'
const distDir   = path.isAbsolute(buildOutput)
  ? buildOutput
  : path.join(__dirname, '..', buildOutput)
const outFile   = path.join(distDir, 'version.json')

if (!fs.existsSync(distDir)) {
  console.error('Pasta dist/ não encontrada. Execute npm run dist primeiro.')
  process.exit(1)
}

if (!fs.existsSync(path.join(distDir, installer))) {
  console.warn(`Aviso: instalador não encontrado em dist/${installer}`)
}

fs.writeFileSync(outFile, JSON.stringify({ version, installer }, null, 2), 'utf-8')

// Copia o instalador para releases/ dentro do projeto
const releasesDir = path.join(__dirname, '..', 'releases')
fs.mkdirSync(releasesDir, { recursive: true })

// Remove instaladores antigos
const old = fs.readdirSync(releasesDir).filter(f => f.endsWith('.exe') || f.endsWith('.blockmap'))
old.forEach(f => fs.rmSync(path.join(releasesDir, f), { force: true }))

const srcExe = path.join(distDir, installer)
const srcMap = srcExe + '.blockmap'
if (fs.existsSync(srcExe)) {
  fs.copyFileSync(srcExe, path.join(releasesDir, installer))
  if (fs.existsSync(srcMap)) fs.copyFileSync(srcMap, path.join(releasesDir, installer + '.blockmap'))
  fs.copyFileSync(outFile, path.join(releasesDir, 'version.json'))
  console.log(`\n✓ Instalador copiado para releases/`)
}

// Copia dados do AppData para releases/dados/ (backup portátil)
const appData     = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming')
const cispr15Data = path.join(appData, 'cispr15-labelo')
const dadosOut    = path.join(releasesDir, 'dados')

if (fs.existsSync(cispr15Data)) {
  fs.mkdirSync(dadosOut, { recursive: true })
  for (const sub of ['dados', 'agenda']) {
    const src = path.join(cispr15Data, sub)
    const dst = path.join(dadosOut, sub)
    if (!fs.existsSync(src)) continue
    fs.mkdirSync(dst, { recursive: true })
    for (const f of fs.readdirSync(src)) {
      if (f.endsWith('.json')) fs.copyFileSync(path.join(src, f), path.join(dst, f))
    }
  }
  console.log('✓ Dados copiados para releases/dados/')
} else {
  console.warn('Aviso: pasta de dados não encontrada em', cispr15Data)
}

// Gera restaurar-dados.ps1 com suporte a modo silencioso
const ps1 = `param([switch]$Silent)
# Restaura os dados do CISPR 15 LABELO no PC de destino
$dest = "$env:APPDATA\\cispr15-labelo"
New-Item -ItemType Directory -Force "$dest\\dados"  | Out-Null
New-Item -ItemType Directory -Force "$dest\\agenda" | Out-Null
$src = Join-Path $PSScriptRoot "dados"
if (Test-Path "$src\\dados")  { Copy-Item "$src\\dados\\*"  "$dest\\dados\\"  -Force }
if (Test-Path "$src\\agenda") { Copy-Item "$src\\agenda\\*" "$dest\\agenda\\" -Force }
Write-Host "Dados restaurados em $dest" -ForegroundColor Green
if (-not $Silent) { pause }
`
fs.writeFileSync(path.join(releasesDir, 'restaurar-dados.ps1'), ps1, 'utf-8')
console.log('✓ restaurar-dados.ps1 gerado em releases/')

// Gera INSTALAR.bat — faz tudo em um clique, sem SmartScreen
const bat = `@echo off
chcp 65001 > nul
echo.
echo  =========================================
echo   CISPR 15 LABELO - Instalacao Completa
echo  =========================================
echo.
echo  [1/3] Liberando instalador (remove bloqueio SmartScreen)...
powershell -Command "Get-ChildItem '%~dp0CISPR 15 LABELO Setup*.exe' | Unblock-File" 2>nul
echo  [2/3] Instalando app (aceite o UAC quando solicitado)...
for %%f in ("%~dp0CISPR 15 LABELO Setup*.exe") do start /wait "" "%%f"
echo  [3/3] Restaurando dados...
powershell -ExecutionPolicy Bypass -NonInteractive -File "%~dp0restaurar-dados.ps1" -Silent
echo.
echo  Concluido! Abra o CISPR 15 LABELO pelo atalho na area de trabalho.
echo.
pause
`
fs.writeFileSync(path.join(releasesDir, 'INSTALAR.bat'), bat, 'utf-8')
console.log('✓ INSTALAR.bat gerado em releases/')

console.log('\n✓ version.json gerado em dist/')
console.log(`  versão:    ${version}`)
console.log(`  instalador: ${installer}`)
console.log('\nPara instalar em outro PC, copie a pasta releases/ e execute INSTALAR.bat')
console.log('')
