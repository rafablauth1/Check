const fs   = require('fs')
const path = require('path')

const pkg       = require('../package.json')
const version   = pkg.version
const installer = `CISPR 15 LABELO Setup ${version}.exe`
// O ZIP é o pacote preferido pela atualização automática: o app extrai e copia
// por cima da própria pasta (robocopy), sem instalador e sem UAC — nos PCs do
// laboratório não dá pra instalar nada. O instalador segue publicado como
// alternativa para quem tiver permissão de administrador.
const zipNome = `CISPR 15 LABELO-${version}-win.zip`
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

const temZip = fs.existsSync(path.join(distDir, zipNome))
if (!temZip) console.warn(`Aviso: pacote zip não encontrado em dist/${zipNome}`)
fs.writeFileSync(
  outFile,
  JSON.stringify({ version, installer, ...(temZip ? { zip: zipNome } : {}) }, null, 2),
  'utf-8',
)

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

// Publica na pasta de rede de atualização automática (mesma que updateFolder
// aponta em electron/main.js: UPDATE_FOLDER_PADRAO) — best-effort: se a rede
// estiver fora do ar ou sem permissão, só avisa e não quebra o build. Com
// isso, os outros PCs veem a versão nova sozinhos (banner "Nova versão
// disponível" já existente no app) sem precisar copiar nada manualmente.
const NETWORK_UPDATE_FOLDER =
  'T:\\Laboratórios\\Alta Tecnologia\\Compatibilidade Eletromagnética\\3 - Planilhas de ensaios\\3.2 - Registros de ensaios\\CISPR15\\instalador'
try {
  fs.mkdirSync(NETWORK_UPDATE_FOLDER, { recursive: true })
  fs.copyFileSync(path.join(releasesDir, installer), path.join(NETWORK_UPDATE_FOLDER, installer))
  // O zip vai direto do dist/ (não é copiado pra releases/, que é a pasta do
  // pacote manual) — é ele que a atualização sem instalador consome.
  if (temZip) fs.copyFileSync(path.join(distDir, zipNome), path.join(NETWORK_UPDATE_FOLDER, zipNome))
  fs.copyFileSync(outFile, path.join(NETWORK_UPDATE_FOLDER, 'version.json'))
  // remove instaladores antigos da pasta de rede (mantém só o atual)
  for (const f of fs.readdirSync(NETWORK_UPDATE_FOLDER)) {
    if ((f.endsWith('.exe') || f.endsWith('.blockmap') || f.endsWith('.zip')) && f !== installer && f !== installer + '.blockmap' && f !== zipNome) {
      try { fs.rmSync(path.join(NETWORK_UPDATE_FOLDER, f), { force: true }) } catch {}
    }
  }
  console.log(`✓ Publicado na rede para atualização automática: ${NETWORK_UPDATE_FOLDER}`)
} catch (err) {
  console.warn('Aviso: não consegui publicar na pasta de rede de atualização —', err.message)
}

/* ── poda do dist/ ───────────────────────────────────────────────────────────
   Cada build deixa ~260 MB em dist/ (instalador + blockmap + zip). Em
   15/09/2026 havia 25 versões acumuladas ali, 6,1 GB — ninguém apaga isso na
   mão, então acumula até acabar o disco.

   Ficam a versão ATUAL e a ANTERIOR: a anterior é a volta rápida se a nova sair
   com problema. As mais velhas já estão publicadas na rede e o código está no
   git; não há motivo para ocupar disco.

   Nunca toca em win-unpacked/ (é de onde o app roda neste PC) nem nos .yml e
   version.json. */
function versaoDoArquivo(nome) {
  const m = nome.match(/(\d+\.\d+\.\d+)/)
  return m ? m[1] : null
}
function comparaVersao(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  return (pa[0] - pb[0]) || (pa[1] - pb[1]) || (pa[2] - pb[2])
}
try {
  const porVersao = new Map()
  for (const f of fs.readdirSync(distDir)) {
    if (!/\.(exe|blockmap|zip)$/i.test(f)) continue          // .yml e .json ficam
    let st
    try { st = fs.statSync(path.join(distDir, f)) } catch { continue }
    if (st.isDirectory()) continue                            // win-unpacked fica
    const v = versaoDoArquivo(f)
    if (!v) continue
    if (!porVersao.has(v)) porVersao.set(v, [])
    porVersao.get(v).push(f)
  }
  const manter = [...porVersao.keys()].sort(comparaVersao).slice(-2)
  let apagados = 0, liberado = 0
  for (const [v, arquivos] of porVersao) {
    if (manter.includes(v)) continue
    for (const f of arquivos) {
      const fp = path.join(distDir, f)
      try {
        const tam = fs.statSync(fp).size
        fs.rmSync(fp, { force: true })
        apagados++; liberado += tam
      } catch {}
    }
  }
  if (apagados) {
    console.log('')
    console.log('✓ dist/ podado: ' + apagados + ' arquivo(s) de versões antigas, ' +
                (liberado / 1073741824).toFixed(2) + ' GB liberados')
    console.log('  mantidas: ' + manter.join(', '))
  }
} catch (err) {
  console.warn('Aviso: não consegui podar o dist/ —', err.message)
}
