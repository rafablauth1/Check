const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage, nativeTheme } = require('electron')
const path    = require('path')
const http    = require('http')
const https   = require('https')
const fs      = require('fs')
const os      = require('os')
const crypto  = require('crypto')
const { execFile, spawn } = require('child_process')
const XLSX    = require('xlsx')
const mammoth = require('mammoth')
const { listSigningCerts, signPDF, signPDFWithPfx, validatePfx } = require('./pdf-signer')

/* ─── PowerShell script para Windows OCR ─────────────────────────────────── */
const PS_OCR_SCRIPT = `
param([string]$ImgPath)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
function Await($task) {
  $t = [System.WindowsRuntimeSystemExtensions]::AsTask($task)
  [void]$t.Wait(-1)
  $t.Result
}
$null = [Windows.Media.Ocr.OcrEngine,            Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile,            Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language,          Windows.Foundation, ContentType=WindowsRuntime]
try {
  $file    = Await([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImgPath))
  $stream  = Await($file.OpenAsync(0))
  $decoder = Await([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
  $bitmap  = Await($decoder.GetSoftwareBitmapAsync())
  $engine  = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('pt-BR'))
  if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  if (-not $engine) { throw 'OCR engine unavailable' }
  $result  = Await($engine.RecognizeAsync($bitmap))
  $result.Lines | ForEach-Object { $_.Text }
} catch { }
`

const DEV_PORT  = 3000
const PROD_PORT = 3721
const APP_PATH  = '/dashboard'

const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets', 'icon.ico')
  : path.join(__dirname, '../assets/icon.ico')

app.setAppUserModelId('br.pucrs.labelo.cispr15')

/* ─── Modo PORTÁTIL ───────────────────────────────────────────────────────────
   Se houver um marcador ".portable" ao lado do executável, grava TODOS os dados
   (userData → dados, agenda, settings, server.log) DENTRO da pasta do app, e não
   em %APPDATA%. Resolve o PC corporativo onde %APPDATA% é bloqueado/redirecionado
   e "nada salva". Deve rodar ANTES de qualquer app.getPath('userData'). */
if (app.isPackaged) {
  try {
    const exeDir = path.dirname(app.getPath('exe'))
    if (fs.existsSync(path.join(exeDir, '.portable'))) {
      const dataDir = path.join(exeDir, 'dados-app')
      fs.mkdirSync(dataDir, { recursive: true })
      fs.accessSync(dataDir, fs.constants.W_OK)   // confirma que dá pra escrever aqui
      app.setPath('userData', dataDir)
    }
  } catch { /* sem permissão ao lado do exe → mantém %APPDATA% */ }
}

if (app.isPackaged) {
  app.commandLine.appendSwitch('disable-background-networking')
  app.commandLine.appendSwitch('disable-component-update')
  app.commandLine.appendSwitch('disable-sync')
  app.commandLine.appendSwitch('no-pings')
  app.commandLine.appendSwitch('disable-breakpad')
}

/* pasta da EUT ativa */
let eutFolderPath = null

/* ─── settings ────────────────────────────────────────────────────────────── */

// Pasta de rede única pra TODOS os dados (cadastros, agenda, relatórios,
// clientes) — mesma pasta em todos os PCs, sem precisar configurar nada.
// Mantida em sincronia com lib/settings-server.ts (CADASTROS_FOLDER_PADRAO).
const CADASTROS_FOLDER_PADRAO = 'R:\\Compartilhado\\CISPR15'
const DATA_FOLDER_PADRAO       = 'R:\\Compartilhado\\CISPR15'
const AGENDA_FOLDER_PADRAO     = 'R:\\Compartilhado\\CISPR15\\agenda'

// Pasta espelho padrão: recebe cópia automática de TODOS os dados (cadastros,
// agenda, relatórios, clientes) a cada save — best-effort, sem bloquear o save
// principal (ver espelharArquivo). Existe pra PCs que só conseguem escrever
// na pasta de Alta Tecnologia, mas continuam enxergando os dados atualizados
// através do espelho.
const MIRROR_FOLDER_PADRAO =
  'T:\\Laboratórios\\Alta Tecnologia\\Compatibilidade Eletromagnética\\3 - Planilhas de ensaios\\3.2 - Registros de ensaios\\CISPR15'

// Pasta de rede com o instalador mais recente + version.json — o app confere
// aqui (silenciosamente, ver ipcMain 'update:check') se há versão mais nova e
// oferece instalar sem precisar copiar nada manualmente em cada PC. Mantida
// atualizada automaticamente pelo script scripts/publish-update.js a cada
// "npm run dist".
const UPDATE_FOLDER_PADRAO =
  'T:\\Laboratórios\\Alta Tecnologia\\Compatibilidade Eletromagnética\\3 - Planilhas de ensaios\\3.2 - Registros de ensaios\\CISPR15\\instalador'

const SETTINGS_DEFAULTS = { excelPath: '', dataFolder: DATA_FOLDER_PADRAO, agendaFolder: AGENDA_FOLDER_PADRAO, pdfCopyFolder: '', cadastrosFolder: CADASTROS_FOLDER_PADRAO, mirrorFolder: MIRROR_FOLDER_PADRAO, pdfAutoSaveToEut: true, updateFolder: UPDATE_FOLDER_PADRAO, certThumbprint: '', pfxPath: '', pfxPassword: '', backupFolder: '', autoBackup: true }

// Pastas de rede da Iluminação onde ficam as pastas por protocolo (uma pasta
// por ano) — usadas pra importar fotos de amostras pra nossa rede (EMC). O
// tipo do item na agenda ('lampada'/'luminaria') decide qual base usar.
const ILUMINACAO_LAMPADA_BASE   = 'T:\\Laboratórios\\Iluminação\\2 - Lâmpadas\\!Protocolos'
const ILUMINACAO_LUMINARIA_BASE = 'T:\\Laboratórios\\Iluminação\\5 - Luminárias\\!Protocolos'
// Pasta de rede EMC onde as pastas por protocolo (com "fotos" dentro) são criadas.
const FOTOS_DESTINO_BASE =
  'T:\\Laboratórios\\Alta Tecnologia\\Compatibilidade Eletromagnética\\3 - Planilhas de ensaios\\3.2 - Registros de ensaios'
const IMG_EXTENSOES = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tif', '.tiff'])

/* pasta raiz do app:
   - dev:       …/cispr15-standalone/
   - instalado: …/AppData/Local/Programs/CISPR 15 LABELO/   (junto ao exe)  */
function getAppRoot() {
  if (app.isPackaged) return path.dirname(app.getPath('exe'))
  return path.join(__dirname, '..')
}

/* defaults de pasta que NÃO têm padrão de rede — dataFolder/agendaFolder/
   cadastrosFolder/mirrorFolder/updateFolder já vêm de SETTINGS_DEFAULTS
   (pasta de rede, igual em todos os PCs) e NÃO devem ser sobrescritos aqui. */
function getDefaultPaths() {
  const userData = app.getPath('userData')
  return {
    excelPath:     'C:\\Users\\Notla\\OneDrive\\Área de Trabalho\\Compatibilidade eletromagnética_2026.xlsx',
    pdfCopyFolder: path.join(userData, 'pdfs'),
  }
}

function getUserDataDir() {
  return app.getPath('userData')
}

function getSettingsFile() {
  return path.join(getUserDataDir(), 'settings.json')
}

function readSettings() {
  const def = { ...SETTINGS_DEFAULTS, ...getDefaultPaths() }
  try {
    const f = getSettingsFile()
    if (fs.existsSync(f)) {
      const saved = JSON.parse(fs.readFileSync(f, 'utf-8'))
      return { ...def, ...saved }
    }
  } catch {}
  return def
}

/* Migra dados antigos (dentro da pasta do app) para userData, uma única vez */
function migrateDataFolders() {
  const root    = getAppRoot()
  const userData = app.getPath('userData')
  const files   = ['cispr15_relatorios.json', 'cispr15_clientes.json']
  const agFile  = 'cispr15_agenda.json'

  // dados e agenda
  const oldDirs = [
    { old: path.join(root, 'dados'),  new: path.join(userData, 'dados'),  list: files },
    { old: path.join(root, 'agenda'), new: path.join(userData, 'agenda'), list: [agFile] },
  ]
  for (const { old: oldDir, new: newDir, list } of oldDirs) {
    if (!fs.existsSync(oldDir)) continue
    fs.mkdirSync(newDir, { recursive: true })
    for (const file of list) {
      const src = path.join(oldDir, file)
      const dst = path.join(newDir, file)
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        try { fs.copyFileSync(src, dst) } catch {}
      }
    }
  }
}

/* Migra cadastros/catálogos (equipamentos, grupos, normas, procedimentos,
   certificados, laboratórios, planos, taxonomia, glossário, demandas, checagens)
   do local antigo (onde "dataFolder" apontava antes de existir "cadastrosFolder")
   para a pasta de rede padrão — assim quem já usava o app não vê os cadastros
   "sumirem" após a atualização. Só copia o que ainda não existe no destino. */
function migrateCadastrosParaRede() {
  const userData = app.getPath('userData')
  const s = readSettings()
  const oldDir = s.dataFolder || path.join(userData, 'dados') // fórmula antiga de getDadosDir()
  const newDir = s.cadastrosFolder
  if (!newDir || !fs.existsSync(oldDir) || path.resolve(oldDir) === path.resolve(newDir)) return

  const files = [
    'equipamentos.json', 'grupos.json', 'instrucoes.json', 'it-template.json',
    'certificados.json', 'laboratorios.json', 'planos.json', 'taxonomia.json',
    'glossario.json', 'check.json', 'checagens.json', 'rascunho-equipamentos.json',
  ]
  try {
    fs.mkdirSync(newDir, { recursive: true })
    for (const file of files) {
      const src = path.join(oldDir, file)
      const dst = path.join(newDir, file)
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        try { fs.copyFileSync(src, dst) } catch {}
      }
    }
    const oldNormas = path.join(oldDir, 'normas')
    const newNormas = path.join(newDir, 'normas')
    if (fs.existsSync(oldNormas)) {
      fs.mkdirSync(newNormas, { recursive: true })
      for (const f of fs.readdirSync(oldNormas)) {
        const src = path.join(oldNormas, f), dst = path.join(newNormas, f)
        if (!fs.existsSync(dst)) { try { fs.copyFileSync(src, dst) } catch {} }
      }
    }
  } catch { /* pasta de rede indisponível no momento — tenta de novo no próximo início */ }
}

function writeSettings(partial) {
  // Remove espaços acidentais nos caminhos de pasta (ex.: colar com espaço no
  // final) — um caminho com espaço sobrando aponta pra uma pasta que não
  // existe, e o erro fica difícil de perceber só olhando a tela.
  const limpo = { ...partial }
  for (const k of Object.keys(limpo)) {
    if (typeof limpo[k] === 'string') limpo[k] = limpo[k].trim()
  }
  const merged = { ...readSettings(), ...limpo }
  const f = getSettingsFile()
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}

/* ─── dados (rede ou local) ───────────────────────────────────────────────── */

// Criptografia em repouso — mesma lógica/chave de lib/dados.ts (arquivos de
// cadastros, que passam pelo servidor Next). Aqui cobre agenda/relatórios/
// clientes, que são lidos/gravados direto pelo processo principal via IPC.
// Objetivo: impedir edição casual/acidental abrindo o .json fora do app (não é
// proteção contra alguém disposto a extrair a chave do próprio executável).
const ENC_MAGIC = 'CISPR15ENC1:'
const ENC_KEY = crypto.scryptSync('cispr15-labelo-dados-em-repouso', 'cispr15-labelo-salt-fixo', 32)

function encriptar(json) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc = Buffer.concat([cipher.update(json, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_MAGIC + Buffer.concat([iv, tag, enc]).toString('base64')
}

function decriptar(conteudo) {
  const buf = Buffer.from(conteudo.slice(ENC_MAGIC.length), 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const dados = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(dados), decipher.final()]).toString('utf-8')
}

// Interpreta o conteúdo lido do disco: criptografado (formato novo) ou JSON
// puro (arquivo legado, de antes desta mudança — segue funcionando, e é
// migrado no próximo save).
function parseConteudo(bruto) {
  if (bruto.startsWith(ENC_MAGIC)) return JSON.parse(decriptar(bruto))
  return JSON.parse(bruto)
}

// Espelha o arquivo (já criptografado) numa segunda pasta de rede, se
// configurada — best-effort: nunca lança, nunca atrasa o save principal.
async function espelharArquivo(relPath, conteudo) {
  const { mirrorFolder } = readSettings()
  if (!mirrorFolder) return
  try {
    const mp = path.join(mirrorFolder, relPath)
    await fs.promises.mkdir(path.dirname(mp), { recursive: true })
    await fs.promises.writeFile(mp, conteudo, 'utf-8')
  } catch {}
}

// Fallback de último recurso (pasta local) — só entra em jogo se dataFolder
// tiver sido explicitamente esvaziado nas configurações (o padrão normal já
// vem preenchido com a pasta de rede via SETTINGS_DEFAULTS).
function getDefaultDataDir() {
  return path.join(app.getPath('userData'), 'dados')
}

function dataFilePath(filename) {
  const { dataFolder } = readSettings()
  return path.join(dataFolder || getDefaultDataDir(), filename)
}

function agendaFilePath() {
  const { agendaFolder, dataFolder } = readSettings()
  return path.join(agendaFolder || dataFolder || getDefaultDataDir(), 'cispr15_agenda.json')
}

// Lê um arquivo já decriptografando; se o principal estiver corrompido/ilegível
// (ex.: PC ainda no build antigo lendo um arquivo já migrado por outro PC),
// tenta o .bak antes de desistir — mesma proteção que lib/dados.ts já tinha
// para os cadastros. Evita que a agenda/relatórios/clientes "sumam" (vejam
// lista vazia) durante a janela de atualização entre PCs.
async function lerArquivoComFallback(fp) {
  try { return parseConteudo(await fs.promises.readFile(fp, 'utf-8')) }
  catch {
    try { return parseConteudo(await fs.promises.readFile(fp + '.bak', 'utf-8')) }
    catch { return null }
  }
}

// Grava com backup da versão anterior antes de sobrescrever (mesmo padrão do
// escreverJSON de lib/dados.ts) — best-effort, não impede o save principal.
async function gravarComBackup(fp, conteudo) {
  try { await fs.promises.copyFile(fp, fp + '.bak') } catch {}
  await fs.promises.writeFile(fp, conteudo, 'utf-8')
}

// ASSÍNCRONOS (fs.promises): escrita/leitura síncrona no processo PRINCIPAL congela
// a janela inteira (inclusive a digitação) durante o I/O — pior em pasta de rede.
async function readAgendaFile() {
  return (await lerArquivoComFallback(agendaFilePath())) ?? []
}

async function writeAgendaFile(data) {
  const fp = agendaFilePath()
  await fs.promises.mkdir(path.dirname(fp), { recursive: true })
  const conteudo = encriptar(JSON.stringify(data, null, 2))
  let lastErr = null
  for (let i = 0; i < 4; i++) {
    try {
      await gravarComBackup(fp, conteudo)
      // Mirror da agenda vai para a subpasta "agenda/" dentro da pasta espelho —
      // mesma convenção de subpasta que agendaFolder já usa na pasta principal,
      // em vez de cair solto na raiz da pasta espelho (misturado com cadastros).
      espelharArquivo('agenda/cispr15_agenda.json', conteudo).catch(() => {})
      return
    }
    catch (e) { lastErr = e }
  }
  throw lastErr
}

function copyPdfToFolder(filePath) {
  const { pdfCopyFolder } = readSettings()
  if (!pdfCopyFolder || !filePath) return
  try {
    fs.mkdirSync(pdfCopyFolder, { recursive: true })
    fs.copyFileSync(filePath, path.join(pdfCopyFolder, path.basename(filePath)))
  } catch {}
}

/* Lista todos os PDFs sob a pasta de cópias, incluindo subpastas por ano
   (organização .../pdfs/2026/). Mantém compatibilidade com PDFs antigos
   salvos direto na raiz (flat). */
function listPdfsDeep(root) {
  const out = []
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const full = path.join(root, entry.name)
      if (entry.isDirectory()) {
        try {
          for (const f of fs.readdirSync(full)) {
            if (f.toLowerCase().endsWith('.pdf')) out.push(path.join(full, f))
          }
        } catch {}
      } else if (entry.name.toLowerCase().endsWith('.pdf')) {
        out.push(full)
      }
    }
  } catch {}
  return out
}

async function readDataFile(filename) {
  return (await lerArquivoComFallback(dataFilePath(filename))) ?? []
}

async function writeDataFile(filename, data) {
  const fp = dataFilePath(filename)
  await fs.promises.mkdir(path.dirname(fp), { recursive: true })
  const conteudo = encriptar(JSON.stringify(data, null, 2))
  let lastErr = null
  for (let i = 0; i < 4; i++) {
    try {
      await gravarComBackup(fp, conteudo)
      espelharArquivo(filename, conteudo).catch(() => {})
      return
    }
    catch (e) { lastErr = e }
  }
  throw lastErr
}

/* ─── backup do banco de dados ────────────────────────────────────────────── */

/* Diretório de backup padrão — fora do %APPDATA%\cispr15-labelo, para sobreviver
   caso alguém apague a pasta de dados. Pode ser trocado em Configurações. */
function getDefaultBackupDir() {
  try { return path.join(app.getPath('documents'), 'CISPR15-Backups') }
  catch { return path.join(getUserDataDir(), '..', 'CISPR15-Backups') }
}

function backupRootDir(destBase) {
  const base = destBase || readSettings().backupFolder || getDefaultBackupDir()
  return path.join(base, 'CISPR15_Backups')
}

/* Todas as fontes de dados a serem incluídas no backup (deduplicadas por caminho).
   'dados' já inclui a subpasta cispr15_assets (fotos+DOCX por relatório). */
function getBackupSources() {
  const s = readSettings()
  const out = []
  const seen = new Set()
  const add = (name, p, type) => {
    if (!p) return
    const key = path.resolve(p).toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name, path: p, type })
  }
  add('dados',         s.dataFolder,    'dir')
  add('agenda',        s.agendaFolder,  'dir')
  add('settings.json', getSettingsFile(), 'file')
  return out
}

function timestampFolder() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `backup_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

function listBackups(destBase) {
  const root = backupRootDir(destBase)
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith('backup_'))
      .map(e => {
        let manifest = null
        try { manifest = JSON.parse(fs.readFileSync(path.join(root, e.name, 'manifest.json'), 'utf-8')) } catch {}
        return { name: e.name, path: path.join(root, e.name), date: manifest?.date ?? null, items: manifest?.items ?? [] }
      })
      .sort((a, b) => b.name.localeCompare(a.name))
  } catch { return [] }
}

function pruneBackups(destBase, keep = 4) {
  const root = backupRootDir(destBase)
  const all = listBackups(destBase)
  for (const b of all.slice(keep)) {
    try { fs.rmSync(b.path, { recursive: true, force: true }) } catch {}
  }
}

async function runBackup(destBase) {
  const root = backupRootDir(destBase)
  const dir  = path.join(root, timestampFolder())
  await fs.promises.mkdir(dir, { recursive: true })
  const sources = getBackupSources()
  const items = []
  for (const src of sources) {
    try {
      if (!fs.existsSync(src.path)) continue
      const target = path.join(dir, src.name)
      // cópia ASSÍNCRONA (libuv threadpool) — não bloqueia o processo principal/UI
      if (src.type === 'file') await fs.promises.copyFile(src.path, target)
      else await fs.promises.cp(src.path, target, { recursive: true })
      items.push(src.name)
    } catch {}
  }
  const manifest = { date: new Date().toISOString(), version: app.getVersion(), items }
  try { await fs.promises.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8') } catch {}
  pruneBackups(destBase)
  return { ok: true, dir, items }
}

/* Restaura um backup (o mais recente por padrão, ou o nomeado) por cima das
   pastas de dados atuais. É o que recupera tudo se os dados sumirem. */
function restoreBackup(destBase, which) {
  const root = backupRootDir(destBase)
  const all = listBackups(destBase)
  if (!all.length) return { ok: false, error: 'Nenhum backup encontrado em ' + root }
  const chosen = which ? all.find(b => b.name === which) : all[0]
  if (!chosen) return { ok: false, error: 'Backup não encontrado: ' + which }
  const s = readSettings()
  const map = {
    'dados':         { to: s.dataFolder,    type: 'dir'  },
    'agenda':        { to: s.agendaFolder,  type: 'dir'  },
    'settings.json': { to: getSettingsFile(), type: 'file' },
  }
  const restored = []
  for (const [name, { to, type }] of Object.entries(map)) {
    const from = path.join(chosen.path, name)
    try {
      if (!fs.existsSync(from) || !to) continue
      if (type === 'file') { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to) }
      else { fs.mkdirSync(to, { recursive: true }); fs.cpSync(from, to, { recursive: true, force: true }) }
      restored.push(name)
    } catch {}
  }
  return { ok: true, restored, from: chosen.path, date: chosen.date }
}

/* Auto-backup ao abrir: roda no máximo 1×/semana (compara com o backup mais recente).
   Assíncrono e adiado (não bloqueia o carregamento nem a digitação). */
async function maybeAutoBackup() {
  try {
    const s = readSettings()
    if (!s.autoBackup) return
    const all = listBackups()
    const last = all[0]?.date ? new Date(all[0].date).getTime() : 0
    if (Date.now() - last < 7 * 24 * 3600 * 1000) return // já há backup recente (<7 dias)
    await runBackup()
  } catch {}
}

/* ─── utilitários ─────────────────────────────────────────────────────────── */

function ping(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 800 }, () => {
      req.destroy(); resolve(true)
    })
    req.on('error',   () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

function waitForServer(port, timeoutMs = 120_000, proc) {
  return new Promise((resolve, reject) => {
    let done = false
    const deadline = Date.now() + timeoutMs
    if (proc) {
      proc.on('exit', (code) => {
        if (!done) { done = true; reject(new Error(`Servidor encerrou inesperadamente (código ${code ?? '?'}). Veja ${app.getPath('userData')}\\server.log`)) }
      })
    }
    async function attempt() {
      if (done) return
      if (await ping(port)) { done = true; return resolve() }
      if (Date.now() >= deadline) { done = true; return reject(new Error('Servidor não respondeu em ' + (timeoutMs / 1000) + 's')) }
      setTimeout(attempt, 600)
    }
    attempt()
  })
}

async function writeWithRetry(filePath, data, retries = 4) {
  for (let i = 0; i <= retries; i++) {
    try { await fs.promises.writeFile(filePath, data); return }  // async: não trava a UI
    catch (err) {
      if (i === retries) throw err
      await new Promise(r => setTimeout(r, 400 * (i + 1)))
    }
  }
}

/* ─── janela ──────────────────────────────────────────────────────────────── */

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: 'CISPR 15 — LABELO/PUCRS',
    backgroundColor: '#0B0E14',
    icon: nativeImage.createFromPath(ICON_PATH),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Corretor ortográfico DESLIGADO: estava travando a digitação/células
      // (o spellchecker do Chromium engasgava ao carregar dicionário). Menu de
      // contexto com Recortar/Copiar/Colar continua funcionando abaixo.
      spellcheck: false,
    },
  })

  win.webContents.on('context-menu', (_e, params) => {
    const tpl = []
    if (params.isEditable || params.selectionText) {
      tpl.push({ role: 'cut',       label: 'Recortar',        enabled: params.editFlags.canCut })
      tpl.push({ role: 'copy',      label: 'Copiar',          enabled: params.editFlags.canCopy })
      tpl.push({ role: 'paste',     label: 'Colar',           enabled: params.editFlags.canPaste })
      tpl.push({ role: 'selectAll', label: 'Selecionar tudo' })
    }
    if (tpl.length) Menu.buildFromTemplate(tpl).popup({ window: win })
  })

  /* Barra de título nativa em dark mode para combinar com o tema escuro do app. */
  nativeTheme.themeSource = 'dark'
  // Menu nativo escondido (Alt revela): a faixa clara do Windows destoava do
  // tema dark e poluía o topo. Navegação completa fica na sidebar.
  win.setMenuBarVisibility(false)
  win.autoHideMenuBar = true


  const HIDE_CHROME_CSS = `header.sticky { display: none !important; }`
  win.webContents.on('did-start-loading', () => {
    win.webContents.insertCSS(HIDE_CHROME_CSS).catch(() => {})
  })

  // Tela de "iniciando": versão divertida só no modo dev (não empacotado) —
  // não sai no build de produção.
  win.loadFile(path.join(__dirname, app.isPackaged ? 'loading.html' : 'loading-dev.html'))
  win.maximize()
  win.show()

  let port

  if (!app.isPackaged) {
    if (await ping(DEV_PORT)) {
      port = DEV_PORT
    } else {
      const standaloneDir    = path.resolve(__dirname, '../.next/standalone')
      const standaloneScript = path.join(standaloneDir, 'server.js')
      if (!fs.existsSync(standaloneScript)) {
        dialog.showErrorBox(
          'Build não encontrado',
          'Execute "npm run build" na pasta cispr15-standalone antes de iniciar.\n\nEsperado em:\n' + standaloneDir
        )
        app.quit(); return
      }
      port = PROD_PORT
      try { const proc = await startServer(standaloneDir); await waitForServer(PROD_PORT, 120_000, proc) }
      catch (err) { dialog.showErrorBox('Erro ao iniciar servidor', String(err)); app.quit(); return }
    }
  } else {
    port = PROD_PORT
    try { const proc = await startServer(path.join(process.resourcesPath, 'nextapp')); await waitForServer(PROD_PORT, 120_000, proc) }
    catch (err) { dialog.showErrorBox('Erro ao iniciar CISPR 15', String(err)); app.quit(); return }
  }

  currentAppPort = port

  // Pasta arrastada pro atalho no cold start → abre direto no formulário do
  // CISPR15 (em vez do dashboard) e manda o conteúdo assim que a página carrega.
  const folderToOpen = pendingFolderPath
  pendingFolderPath = null
  win.loadURL('http://127.0.0.1:' + port + (folderToOpen ? '/cispr15' : APP_PATH))
  if (folderToOpen) {
    win.webContents.once('did-finish-load', () => processarPastaArrastada(win, folderToOpen))
  }
}

/* Conversão WMF/EMF→PNG agora é feita pelo bin/wmf2png.exe (autocontido),
   chamado direto pela API parse-docx. Sem porta auxiliar e sem PowerShell. */

/* ─── servidor Next.js ────────────────────────────────────────────────────── */

let serverProcess = null

async function startServer(appDir) {
  const { utilityProcess } = require('electron')
  const serverScript = path.join(appDir, 'server.js')
  if (!fs.existsSync(serverScript)) throw new Error('server.js não encontrado em:\n' + serverScript)

  const logPath = path.join(app.getPath('userData'), 'server.log')
  const log = fs.createWriteStream(logPath, { flags: 'a', encoding: 'utf8' })
  log.write(`\n--- start ${new Date().toISOString()} ---\n`)

  serverProcess = utilityProcess.fork(serverScript, [], {
    env: {
      ...process.env,
      PORT: String(PROD_PORT),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      CISPR_USER_DATA: getUserDataDir(),
      CISPR_WMF2PNG: app.isPackaged
        ? path.join(process.resourcesPath, 'bin', 'wmf2png.exe')
        : path.join(__dirname, '..', 'bin', 'wmf2png.exe'),
    },
    cwd: appDir, stdio: 'pipe',
  })
  if (serverProcess.stdout) serverProcess.stdout.on('data', d => log.write('[OUT] ' + d))
  if (serverProcess.stderr) serverProcess.stderr.on('data', d => log.write('[ERR] ' + d))
  serverProcess.on('exit', (code) => {
    log.write(`--- exit code=${code} ${new Date().toISOString()} ---\n`)
    log.end()
    serverProcess = null
  })
  return serverProcess
}

/* ─── menu ────────────────────────────────────────────────────────────────── */

function openPage(win, path_) {
  const port = app.isPackaged ? PROD_PORT : DEV_PORT
  win?.loadURL('http://127.0.0.1:' + port + path_)
}

function buildMenu(port) {
  return Menu.buildFromTemplate([
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Abrir pasta da EUT no Explorer',
          click: () => { if (eutFolderPath) shell.openPath(eutFolderPath) },
        },
        { type: 'separator' },
        {
          label: 'Configurações',
          accelerator: 'CmdOrCtrl+,',
          click: () => openPage(BrowserWindow.getFocusedWindow(), '/configuracoes'),
        },
        { type: 'separator' },
        { label: 'Sair', accelerator: 'Alt+F4', click: () => app.quit() },
      ],
    },
    {
      // Registra os atalhos padrão de edição (Ctrl+Z/Y/X/C/V/A) nos campos de texto.
      label: 'Editar',
      submenu: [
        { role: 'undo',      label: 'Desfazer' },
        { role: 'redo',      label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut',       label: 'Recortar' },
        { role: 'copy',      label: 'Copiar' },
        { role: 'paste',     label: 'Colar' },
        { role: 'delete',    label: 'Excluir' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
    {
      label: 'Formulários',
      submenu: [
        {
          label: 'CISPR 15 — Iluminação',
          click: () => openPage(BrowserWindow.getFocusedWindow(), '/cispr15'),
        },
      ],
    },
    {
      label: 'Agenda',
      submenu: [
        {
          label: 'Agenda de Execução',
          accelerator: 'CmdOrCtrl+Shift+A',   // antes era Ctrl+A — sequestrava "selecionar tudo"
          click: () => openPage(BrowserWindow.getFocusedWindow(), '/agenda'),
        },
      ],
    },
    {
      label: 'Relatório',
      submenu: [
        {
          label: 'Salvar PDF',
          accelerator: 'CmdOrCtrl+P',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu:salvar-pdf'),
        },
        {
          label: 'Salvar PDF na pasta da EUT',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu:salvar-pdf-eut'),
        },
        {
          label: 'Salvar HTML na pasta da EUT',
          click: async () => {
            const win = BrowserWindow.getFocusedWindow()
            if (!win || !eutFolderPath) {
              dialog.showMessageBox({ type: 'info', message: 'Selecione uma pasta da EUT primeiro.' })
              return
            }
            const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
            const outPath = path.join(eutFolderPath, 'relatorio.html')
            fs.writeFileSync(outPath, html)
            shell.showItemInFolder(outPath)
          },
        },
      ],
    },
    {
      label: 'Laboratório',
      submenu: [
        { label: 'Dashboard',    accelerator: 'CmdOrCtrl+D', click: () => openPage(BrowserWindow.getFocusedWindow(), '/dashboard') },
        { label: 'Equipamentos', accelerator: 'CmdOrCtrl+E', click: () => openPage(BrowserWindow.getFocusedWindow(), '/equipamentos') },
        { label: 'Normas',  click: () => openPage(BrowserWindow.getFocusedWindow(), '/normas') },
        { label: 'Checagens', click: () => openPage(BrowserWindow.getFocusedWindow(), '/checagens') },
        { type: 'separator' },
        { label: 'Grupos de Equipamentos', click: () => openPage(BrowserWindow.getFocusedWindow(), '/equipamentos/grupos') },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        { label: `CISPR 15 LABELO  v${app.getVersion()}`, enabled: false },
        { type: 'separator' },
        {
          label: 'Verificar atualizações',
          click: () => {
            if (!app.isPackaged) {
              dialog.showMessageBox({ type: 'info', message: 'Verificação de atualizações disponível apenas na versão instalada.' })
              return
            }
            runUpdateCheck(true)
          },
        },
      ],
    },
  ])
}

/* ─── auto-update customizado (zip, sem installer) ────────────────────────── */

let updateInProgress = false

function httpsGetFollow(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      https.get(u, { headers: { 'User-Agent': 'CISPR15-LABELO', ...headers } }, res => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          return go(res.headers.location)
        }
        let body = ''
        res.on('data', c => body += c)
        res.on('end', () => resolve({ statusCode: res.statusCode, body }))
      }).on('error', reject)
    }
    go(url)
  })
}

function downloadFileHttps(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      https.get(u, { headers: { 'User-Agent': 'CISPR15-LABELO' } }, res => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          return go(res.headers.location)
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const stream = fs.createWriteStream(dest)
        stream.on('error', reject)                         // captura EBUSY/arquivo travado
        stream.on('finish', () => stream.close(() => resolve()))
        res.on('data', chunk => {
          received += chunk.length
          if (total > 0 && onProgress) onProgress(Math.round(received / total * 100))
        })
        res.on('error', reject)
        res.pipe(stream)                                   // só resolve após gravar tudo (finish)
      }).on('error', reject)
    }
    go(url)
  })
}

async function checkUpdate() {
  const { body } = await httpsGetFollow('https://api.github.com/repos/rafablauth1/CISPR-15_/releases/latest')
  const release = JSON.parse(body)
  const latest  = release.tag_name.replace(/^v/, '')
  const current = app.getVersion()

  const newer = latest.split('.').map(Number).reduce((acc, n, i) => {
    if (acc !== 0) return acc
    return n - (current.split('.').map(Number)[i] ?? 0)
  }, 0) > 0

  if (!newer) return { upToDate: true, current }

  const asset = release.assets.find(a => a.name.endsWith('-win.zip'))
  if (!asset) return { upToDate: true, current }

  return { upToDate: false, current, latest, downloadUrl: asset.browser_download_url }
}

const PS_EXE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

async function applyUpdate(downloadUrl, version) {
  const tmpDir     = os.tmpdir()
  const stamp      = Date.now()
  // Nomes ÚNICOS por tentativa: evita EBUSY quando um zip/.bat de uma tentativa
  // anterior ficou travado (antivírus ou cmd pendente) com o mesmo nome fixo.
  const zipPath    = path.join(tmpDir, `cispr15-update-${version}-${stamp}.zip`)
  const extractDir = path.join(tmpDir, `cispr15-update-extracted-${stamp}`)
  const exePath    = app.getPath('exe')
  const appDir     = path.dirname(exePath)
  const logPath    = path.join(tmpDir, 'cispr15-update.log')

  // Limpa restos de updates anteriores (best-effort; ignora os que estiverem travados)
  try {
    for (const f of fs.readdirSync(tmpDir)) {
      if (/^cispr15-(update-.*\.zip|run-update.*\.bat|update-extracted)/.test(f)) {
        try { fs.rmSync(path.join(tmpDir, f), { recursive: true, force: true }) } catch {}
      }
    }
  } catch {}

  const win = BrowserWindow.getAllWindows()[0]

  // Download
  await downloadFileHttps(downloadUrl, zipPath, pct => {
    win?.setProgressBar(pct / 100)
    win?.webContents.send('update:progress', pct)
  })
  win?.setProgressBar(-1)
  win?.webContents.send('update:progress', -1)

  const batPath = path.join(tmpDir, `cispr15-run-update-${stamp}.bat`)
  const exeName = path.basename(exePath)

  // Script .bat autossuficiente: extrai (tar nativo do Windows 10+, fallback PowerShell),
  // copia sobre a pasta do app e reinicia. Roda via cmd.exe — não depende de WSH/.vbs,
  // que costuma estar bloqueado em PCs corporativos.
  const bat = `@echo off
chcp 65001 >nul
set "LOG=${logPath}"
echo %DATE% %TIME% Iniciando update v${version} >> "%LOG%"
rem aguarda o app fechar para liberar os arquivos (server filho + exe)
timeout /t 5 /nobreak >nul

if exist "${extractDir}" rmdir /s /q "${extractDir}"
mkdir "${extractDir}"

echo %DATE% %TIME% Extraindo (tar)... >> "%LOG%"
tar -xf "${zipPath}" -C "${extractDir}" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo %DATE% %TIME% tar falhou - tentando PowerShell >> "%LOG%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force" >> "%LOG%" 2>&1
)

rem trava de seguranca: so copia se a extracao gerou o executavel
rem (evita /MIR apagar o app caso a extracao falhe)
if not exist "${extractDir}\${exeName}" (
  echo %DATE% %TIME% ERRO: extracao falhou - abortando para nao apagar o app >> "%LOG%"
  start "" "${exePath}"
  del /q "%~f0" >nul 2>&1
  exit /b 1
)

echo %DATE% %TIME% Copiando arquivos... >> "%LOG%"
robocopy "${extractDir}" "${appDir}" /MIR /R:5 /W:2 >> "%LOG%" 2>&1

echo %DATE% %TIME% Limpando... >> "%LOG%"
del /q "${zipPath}" >nul 2>&1
rmdir /s /q "${extractDir}" >nul 2>&1

echo %DATE% %TIME% Reiniciando app... >> "%LOG%"
start "" "${exePath}"
echo %DATE% %TIME% Concluido. >> "%LOG%"
del /q "%~f0" >nul 2>&1
`

  fs.writeFileSync(batPath, bat, 'utf8')

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Atualização concluída',
    message: `Download concluído! (v${version})`,
    detail: 'O app vai fechar e reiniciar com a versão atualizada.',
    buttons: ['Reiniciar agora', 'Mais tarde'],
    defaultId: 0,
  })

  if (response !== 0) return

  // Lança o .bat detached via cmd.exe — sobrevive ao fechamento do app.
  // cmd raramente é bloqueado por política (ao contrário do WSH/.vbs).
  let launched = false
  try {
    spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    launched = true
  } catch (err) {
    // Fallback: ShellExecute (.bat → cmd) caso o spawn falhe
    const openErr = await shell.openPath(batPath)
    if (!openErr) launched = true
    else {
      dialog.showMessageBox({
        type: 'error',
        title: 'Erro ao iniciar atualização',
        message: openErr || String(err),
        detail: `Atualize manualmente pela pasta de rede/pendrive.\nLog: ${logPath}`,
        buttons: ['OK'],
      })
    }
  }
  if (launched) {
    // Encerra o server filho (Next standalone) para liberar os arquivos do app
    // antes do robocopy — senão resources/nextapp fica travado e a cópia falha.
    try { if (serverProcess) serverProcess.kill() } catch {}
    setTimeout(() => app.quit(), 800)
  }
}

async function runUpdateCheck(manual) {
  if (updateInProgress) return
  updateInProgress = true
  try {
    const result = await checkUpdate()

    if (result.upToDate) {
      if (manual) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Sem atualizações',
          message: `Você já está na versão mais recente (v${result.current}).`,
          buttons: ['OK'],
        })
      }
      return
    }

    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Atualização disponível',
      message: `Nova versão disponível: v${result.latest}`,
      detail: 'Deseja baixar e instalar agora?',
      buttons: ['Baixar agora', 'Mais tarde'],
      defaultId: 0,
    })

    if (response !== 0) return

    await applyUpdate(result.downloadUrl, result.latest)
  } catch (err) {
    console.error('Update error:', err.message)
    if (manual) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Erro ao verificar',
        message: 'Não foi possível verificar atualizações.',
        detail: err.message,
        buttons: ['OK'],
      })
    }
  } finally {
    updateInProgress = false
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return
  setTimeout(() => runUpdateCheck(false), 4000)
}

/* ─── abrir pasta arrastada pro atalho do app (sem dialog, sem registro do
   Windows) — Windows chama o exe com a pasta como argumento (argv[1]) quando
   você arrasta uma pasta pro ícone/atalho. Aqui só aceita caminho ABSOLUTO
   (descarta '.' do modo dev "electron .") e que já exista como diretório. ─── */
function extrairPastaDoArgv(argv) {
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('-') || !path.isAbsolute(a)) continue
    try { if (fs.existsSync(a) && fs.statSync(a).isDirectory()) return a } catch {}
  }
  return null
}

// Lê a pasta (docx + fotos + certificado) e manda pro renderer abrir no
// formulário — usado tanto no cold start quanto quando uma 2ª pasta é
// arrastada com o app já aberto (evento 'second-instance').
function processarPastaArrastada(win, folderPath) {
  try {
    eutFolderPath = folderPath
    const conteudo = lerConteudoPastaEut(folderPath)
    win.webContents.send('eut:folder-dropped', conteudo)
  } catch (err) {
    dialog.showErrorBox('Erro ao abrir pasta', String(err))
  }
}

let pendingFolderPath = extrairPastaDoArgv(process.argv)
let currentAppPort = null   // porta do server em uso nesta janela (setada em createWindow)

// Só uma instância — arrastar uma 2ª pasta com o app já aberto reaproveita a
// janela existente em vez de abrir outro processo/servidor.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
    const folder = extrairPastaDoArgv(argv)
    if (!folder) return
    // Força ir pro formulário do CISPR15 mesmo se a janela estava em outra
    // página — é lá (e só lá) que o listener de pasta arrastada existe.
    if (currentAppPort) {
      win.loadURL('http://127.0.0.1:' + currentAppPort + '/cispr15')
      win.webContents.once('did-finish-load', () => processarPastaArrastada(win, folder))
    } else {
      processarPastaArrastada(win, folder)
    }
  })
}

/* ─── ciclo de vida ───────────────────────────────────────────────────────── */

app.whenReady().then(() => {
  // migra dados antigos (dentro do app) para userData, se necessário
  try { migrateDataFolders() } catch {}
  // migra cadastros/catálogos (equipamentos, normas, etc.) para a pasta de rede padrão
  try { migrateCadastrosParaRede() } catch {}
  // garante que as pastas de dados existam (valores atuais, não os defaults —
  // dataFolder/agendaFolder já vêm da pasta de rede via SETTINGS_DEFAULTS)
  const s = readSettings()
  for (const dir of [s.dataFolder, s.agendaFolder, s.cadastrosFolder, s.mirrorFolder, s.pdfCopyFolder, s.updateFolder]) {
    if (dir) { try { fs.mkdirSync(dir, { recursive: true }) } catch {} }
  }
  Menu.setApplicationMenu(buildMenu())
  createWindow()
  setupAutoUpdater()
  // backup automático do banco (no máx. 1×/dia) — adiado p/ não travar o início
  setTimeout(() => { maybeAutoBackup().catch(() => {}) }, 8000)
})

app.on('window-all-closed', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null }
  app.quit()
})

/* ─── IPC: Settings ───────────────────────────────────────────────────────── */

ipcMain.handle('settings:get', () => readSettings())

ipcMain.handle('settings:set', (_, partial) => {
  try { return { ok: true, settings: writeSettings(partial) } }
  catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('settings:browse-excel', async () => {
  const win = BrowserWindow.getFocusedWindow()
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: 'Selecionar planilha Excel',
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths.length) return { canceled: true }
  return { filePath: filePaths[0] }
})

ipcMain.handle('settings:browse-folder', async (_, { title }) => {
  const win = BrowserWindow.getFocusedWindow()
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: title || 'Selecionar pasta',
    properties: ['openDirectory'],
  })
  if (canceled || !filePaths.length) return { canceled: true }
  return { folderPath: filePaths[0] }
})

/* ─── IPC: Backup ─────────────────────────────────────────────────────────── */

ipcMain.handle('backup:run', async (_, { destBase } = {}) => {
  try { return await runBackup(destBase) }
  catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('backup:list', (_, { destBase } = {}) => {
  try { return { ok: true, backups: listBackups(destBase), root: backupRootDir(destBase) } }
  catch (err) { return { ok: false, error: String(err), backups: [] } }
})

ipcMain.handle('backup:restore', (_, { destBase, which } = {}) => {
  try { return restoreBackup(destBase, which) }
  catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('backup:open-folder', (_, { destBase } = {}) => {
  try {
    const root = backupRootDir(destBase)
    fs.mkdirSync(root, { recursive: true })
    shell.openPath(root)
    return { ok: true, root }
  } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('settings:browse-pdf', async () => {
  const win = BrowserWindow.getFocusedWindow()
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: 'Selecionar PDF do Relatório',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths.length) return { canceled: true }
  return { filePath: filePaths[0] }
})

ipcMain.handle('shell:open-path', async (_, { path: p }) => {
  try { await shell.openPath(p); return { ok: true } }
  catch (err) { return { ok: false, error: String(err) } }
})

/* ─── IPC: "Executar no Claude Code" (Check — gerenciador de demandas) ──────
   Abre uma aba DE VERDADE da extensão Claude Code dentro do VSCode (a mesma
   interface desta conversa), via o URI handler OFICIAL que a extensão
   registra: vscode://anthropic.claude-code/open?prompt=... — documentado em
   https://code.claude.com/docs/en/vs-code.md#launch-a-vs-code-tab-from-other-tools
   Não depende de `claude` estar no PATH (a extensão usa uma cópia bundled
   própria) nem de terminal nenhum — resolve o problema de "claude.cmd só
   funciona dentro do terminal do VSCode". O prompt fica PRÉ-PREENCHIDO na
   caixa de texto — não é enviado sozinho, o usuário aperta Enter pra mandar
   (dá uma chance de revisar antes). Só em modo desenvolvimento. */
ipcMain.handle('check:executar-tarefa', async (_, { prompt, titulo }) => {
  if (app.isPackaged) return { ok: false, error: 'Disponível só em modo desenvolvimento.' }
  try {
    const texto = `[Demanda: ${titulo || 'Demanda'}]\n\n${String(prompt || '')}`
    const uri = 'vscode://anthropic.claude-code/open?prompt=' + encodeURIComponent(texto)
    await shell.openExternal(uri)
    return { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
})

/* ─── IPC: "Subir pro Git" (Check — botão na área de demandas) ─────────────
   Faz `git add -A` + commit (com a mensagem digitada no modal) + `git push`
   na raiz do repositório. Só em modo desenvolvimento — o pacote instalado
   não tem `.git`. Usa execFile (sem shell) para não haver risco de injeção
   pela mensagem de commit digitada pelo usuário. */
function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout; err.stderr = stderr; reject(err); return }
      resolve({ stdout, stderr })
    })
  })
}

ipcMain.handle('check:git-push', async (_, { message } = {}) => {
  if (app.isPackaged) return { ok: false, error: 'Disponível só em modo desenvolvimento.' }
  const cwd = getAppRoot()
  try {
    const status = await runGit(['status', '--porcelain'], cwd)
    let committed = false
    if (status.stdout.trim()) {
      const msg = (message && message.trim()) || `Check: atualização ${new Date().toLocaleString('pt-BR')}`
      await runGit(['add', '-A'], cwd)
      await runGit(['commit', '-m', msg], cwd)
      committed = true
    }
    const push = await runGit(['push'], cwd)
    return { ok: true, committed, output: (push.stdout + push.stderr).trim() }
  } catch (err) {
    return { ok: false, error: (err.stderr || err.stdout || err.message || String(err)).toString().trim() }
  }
})

/* ─── IPC: extração de texto de PDF (pdf-parse, sem Python) ──────────────── */

/* Layout posicionado: cada item de texto com (x,y). Usado para reconstruir
   tabelas de PDF gerados por Excel (ex.: FOR 6400), onde o texto linear vem
   fora de ordem mas a grade por coordenadas é fiel. */
// Lê texto (agrupado em linhas) + layout (itens com x,y) de um PDF numa única
// passada de pdf-parse. Compartilhado pelo extract-layout e pelo scan em lote.
async function pdfTextLayout(pdfBuffer) {
  const pdfParse = require('pdf-parse')
  const items = []
  const pages = []
  let pageIdx = 0
  await pdfParse(pdfBuffer, {
    pagerender: (pageData) =>
      pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then(tc => {
        const p = pageIdx++
        const list = tc.items || []
        for (const it of list) {
          const s = (it.str || '').trim()
          if (s) items.push({ s, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), page: p })
        }
        const sorted = [...list].sort((a, b) => b.transform[5] - a.transform[5])
        const lineGroups = []; let curGroup = []; let curY = null
        for (const item of sorted) {
          const y = item.transform[5]
          if (curY === null || curY - y > 4) { if (curGroup.length) lineGroups.push(curGroup); curGroup = []; curY = y }
          const fsz = Math.abs(item.transform[0]) || 8
          const end = item.transform[4] + (item.width > 0 ? item.width : item.str.length * fsz * 0.55)
          curGroup.push({ x: item.transform[4], str: item.str, end })
        }
        if (curGroup.length) lineGroups.push(curGroup)
        const lines = lineGroups.map(grp => {
          const g = grp.sort((a, b) => a.x - b.x); let line = ''; let prevEnd = null
          for (const it of g) { if (prevEnd !== null && it.x - prevEnd > 15) line += '\t'; line += it.str; prevEnd = it.end }
          return line
        })
        pages.push(lines.filter(l => l.trim()).join('\n'))
        return ''
      }),
  })
  return { items, text: pages.join('\n\n') }
}

ipcMain.handle('pdf:extract-layout', async (_, { base64 }) => {
  try {
    const { items, text } = await pdfTextLayout(Buffer.from(base64, 'base64'))
    return { ok: true, items, text }
  } catch (err) { return { ok: false, error: String(err), items: [], text: '' } }
})

// Procura recursivamente o "…Certificado.pdf" dentro da pasta de uma TAG.
// Prioriza arquivo terminando em "Certificado.pdf"; senão, qualquer PDF.
// Lista TODOS os PDFs de uma pasta da TAG (recursivo), com os que tem "certificado"
// no nome primeiro (são os candidatos mais prováveis).
function listarPdfs(dir, depth, acc) {
  depth = depth || 0; acc = acc || []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) if (e.isFile() && /\.pdf$/i.test(e.name)) acc.push(path.join(dir, e.name))
    if (depth < 3) for (const e of entries) if (e.isDirectory()) listarPdfs(path.join(dir, e.name), depth + 1, acc)
  } catch {}
  return acc
}

// É mesmo um certificado de calibração do LABELO? (mesma regra do parser TS)
//  - não pode ser formulário interno (FOR 6xxx / Análise Crítica);
//  - precisa do nº no padrão letra[EFRTLVPBJQA]+4díg + / (ou -) + ano;
//  - precisa mencionar LABELO.
function ehCertLabelo(text) {
  if (!text) return false
  if (/\bFOR\s*6\d{3}\b/i.test(text) || /an[áa]lise\s+cr[íi]tica/i.test(text)) return false
  const temNumero = /(?<![A-Za-z0-9])[ABEFJLMPQRTV]\s?-?\s?\d{1,4}\s?[/.\-]\s?\d{2,4}/i.test(text)
  const temTitulo = /certificado\s+de\s+calibra[çc][ãa]o/i.test(text)
  return /LABELO/i.test(text) && (temNumero || temTitulo)
}

// É o formulário FOR 6401 (análise crítica de certificado)? Mesma regra do
// parser TS (ehAnaliseCritica em lib/certificados/parser.ts).
function ehAnaliseCriticaTexto(text) {
  return !!text && (/\bFOR\s*6401\b/i.test(text) || /an[áa]lise\s+cr[íi]tica\s+de\s+certificad/i.test(text))
}

// Lê os PDFs de UMA pasta de TAG e escolhe APENAS o certificado do LABELO como
// base (campo `text`). Se nenhum for LABELO, devolve o melhor candidato com o
// texto (a rota explica o motivo → rascunho). TAMBÉM procura, entre os demais
// PDFs da pasta, um FOR 6401 (análise crítica) e devolve o texto dele à parte
// em `acText` — sem isso, uma pasta com certificado + FOR 6401 só devolvia o
// texto do certificado e a periodicidade/dados do FOR 6401 nunca eram lidos.
async function scanUmaPasta(folder, dir) {
  const pdfs = listarPdfs(dir).sort((a, b) => {
    const ca = /certificado/i.test(path.basename(a)) ? 0 : 1
    const cb = /certificado/i.test(path.basename(b)) ? 0 : 1
    return ca - cb
  })
  if (!pdfs.length) return { folder, certPath: null, error: 'Sem PDF na pasta' }
  let escolhido = null, fallback = null, acText = null
  for (const pdf of pdfs) {
    try {
      const { items, text } = await pdfTextLayout(fs.readFileSync(pdf))
      if (!fallback) fallback = { folder, certPath: pdf, text, items }
      if (!escolhido && ehCertLabelo(text)) escolhido = { folder, certPath: pdf, text, items }
      if (!acText && ehAnaliseCriticaTexto(text)) acText = text
      if (escolhido && acText) break   // achou os dois — não precisa ler o resto
    } catch {}
  }
  const base = escolhido || fallback || { folder, certPath: pdfs[0], error: 'Falha ao ler os PDFs da pasta' }
  return acText && acText !== base.text ? { ...base, acText } : base
}

// Lista só os NOMES das subpastas (rápido) — para processar em lotes.
ipcMain.handle('equip:list-mae', async (_, { pastaMae }) => {
  try {
    if (!pastaMae || !fs.existsSync(pastaMae)) return { ok: false, error: 'Pasta inválida' }
    const subs = fs.readdirSync(pastaMae, { withFileTypes: true }).filter(d => d.isDirectory())
    if (!subs.length) return { ok: false, error: 'A pasta-mãe não tem subpastas (uma por TAG).' }
    return { ok: true, folders: subs.map(s => {
      const dir = path.join(pastaMae, s.name)
      // mtime = atividade mais recente na pasta (dir + arquivos do 1º nível)
      let mtime = 0
      try {
        mtime = fs.statSync(dir).mtimeMs
        for (const f of fs.readdirSync(dir)) { try { const m = fs.statSync(path.join(dir, f)).mtimeMs; if (m > mtime) mtime = m } catch {} }
      } catch {}
      return { folder: s.name, dir, mtime }
    }) }
  } catch (err) { return { ok: false, error: String(err) } }
})

// Escaneia um LOTE de pastas (chamado em chunks pelo renderer, com progresso).
ipcMain.handle('equip:scan-batch', async (_, { folders }) => {
  try {
    const resultados = []
    for (const f of (folders || [])) resultados.push(await scanUmaPasta(f.folder, f.dir))
    return { ok: true, resultados }
  } catch (err) { return { ok: false, error: String(err) } }
})

// Re-varredura: re-lê PDFs já conhecidos pelo certPath (itens pendentes do
// rascunho). Se o PDF original não tiver texto, tenta os outros PDFs da pasta.
ipcMain.handle('equip:rescan', async (_, { itens }) => {
  try {
    const resultados = []
    for (const it of (itens || [])) {
      const folder = it.folder || ''
      const certPath = it.certPath
      try {
        if (certPath && fs.existsSync(certPath)) {
          const { items, text } = await pdfTextLayout(fs.readFileSync(certPath))
          if (text && text.trim().length > 20) { resultados.push({ folder, certPath, text, items }); continue }
          // sem texto → tenta a pasta inteira (escolhe o cert LABELO se houver)
          resultados.push(await scanUmaPasta(folder, path.dirname(certPath)))
        } else {
          resultados.push({ folder, certPath: certPath || null, error: 'PDF não encontrado' })
        }
      } catch (e) { resultados.push({ folder, certPath: certPath || null, error: 'Falha ao reler: ' + String(e) }) }
    }
    return { ok: true, resultados }
  } catch (err) { return { ok: false, error: String(err) } }
})

// (compat) Escaneia a pasta-mãe inteira de uma vez — evite para muitos itens.
ipcMain.handle('equip:scan-certificados', async (_, { pastaMae }) => {
  try {
    if (!pastaMae || !fs.existsSync(pastaMae)) return { ok: false, error: 'Pasta inválida' }
    const subs = fs.readdirSync(pastaMae, { withFileTypes: true }).filter(d => d.isDirectory())
    if (!subs.length) return { ok: false, error: 'A pasta-mãe não tem subpastas (uma por TAG).' }
    const resultados = []
    for (const sub of subs) resultados.push(await scanUmaPasta(sub.name, path.join(pastaMae, sub.name)))
    return { ok: true, resultados }
  } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('pdf:extract-text', async (_, { base64 }) => {
  try {
    const pdfBuffer = Buffer.from(base64, 'base64')
    const pdfParse  = require('pdf-parse')

    const pages = []

    function renderPage(pageData) {
      return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
        .then(tc => {
          if (!tc.items || !tc.items.length) { pages.push(''); return '' }

          // Ordena itens de cima para baixo (Y decrescente = topo da página primeiro)
          const sorted = [...tc.items].sort((a, b) => b.transform[5] - a.transform[5])

          // Agrupa em linhas por proximidade de Y (tolerância adaptativa: ±4 unidades)
          const lineGroups = []
          let curGroup = []
          let curY = null
          for (const item of sorted) {
            const y = item.transform[5]
            if (curY === null || curY - y > 4) {
              if (curGroup.length) lineGroups.push(curGroup)
              curGroup = []
              curY = y
            }
            const fs  = Math.abs(item.transform[0]) || 8
            const end = item.transform[4] + (item.width > 0 ? item.width : item.str.length * fs * 0.55)
            curGroup.push({ x: item.transform[4], str: item.str, end })
          }
          if (curGroup.length) lineGroups.push(curGroup)

          const lines = lineGroups.map(grp => {
            const items = grp.sort((a, b) => a.x - b.x)
            let line = ''
            let prevEnd = null
            for (const item of items) {
              // Gap > 15 unidades entre itens → separador de coluna
              if (prevEnd !== null && item.x - prevEnd > 15) line += '\t'
              line += item.str
              prevEnd = item.end
            }
            return line
          })

          const text = lines.filter(l => l.trim()).join('\n')
          pages.push(text)
          return text
        })
        .catch(() => { pages.push(''); return '' })
    }

    const data = await pdfParse(pdfBuffer, { pagerender: renderPage })

    // Ignora apenas a primeira página (capa) — dados podem estar na última página
    let text
    if (pages.length > 1) {
      text = pages.slice(1).join('\n\n')
    } else {
      text = pages.join('\n\n') || data.text || ''
    }

    return { ok: true, text: text || '' }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

// Extrai SÓ o texto da 1ª página (dados do padrão p/ cadastro de equipamento)
ipcMain.handle('pdf:extract-page1', async (_, { base64 }) => {
  try {
    const pdfBuffer = Buffer.from(base64, 'base64')
    const pdfParse  = require('pdf-parse')
    let first = ''
    let pn = 0
    await pdfParse(pdfBuffer, {
      max: 1,
      pagerender: (pd) => pd.getTextContent().then(tc => {
        pn++
        const txt = (tc.items || []).map(i => i.str).join(' ')
        if (pn === 1) first = txt
        return txt
      }),
    })
    return { ok: true, text: first }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

/* ─── IPC: Dados de rede (clientes / relatórios) ─────────────────────────── */

ipcMain.handle('data:get-clientes', async () => {
  const { dataFolder } = readSettings()
  const data = await readDataFile('cispr15_clientes.json')
  return { ok: true, clientes: data ?? [], fromNetwork: !!dataFolder }
})

ipcMain.handle('data:save-clientes', async (_, { clientes }) => {
  try { await writeDataFile('cispr15_clientes.json', clientes); return { ok: true } }
  catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('data:get-relatorios', async () => {
  const { dataFolder } = readSettings()
  const data = await readDataFile('cispr15_relatorios.json')
  return { ok: true, relatorios: data ?? [], fromNetwork: !!dataFolder }
})

ipcMain.handle('data:save-relatorios', async (_, { relatorios }) => {
  try { await writeDataFile('cispr15_relatorios.json', relatorios); return { ok: true } }
  catch (err) { return { ok: false, error: String(err) } }
})

/* Assets pesados (fotos + DOCX) por relatório — ficam num arquivo separado por id,
   na pasta de rede, para qualquer PC reabrir o relatório completo sem inchar o índice. */
function assetsFilePath(id) {
  const safe = String(id).replace(/[^A-Za-z0-9._-]/g, '_')
  const { dataFolder } = readSettings()
  return path.join(dataFolder || getDefaultDataDir(), 'cispr15_assets', `${safe}.json`)
}

ipcMain.handle('data:save-relatorio-assets', async (_, { id, photos, docxHtml }) => {
  try {
    const fp = assetsFilePath(id)
    await fs.promises.mkdir(path.dirname(fp), { recursive: true })
    await fs.promises.writeFile(fp, JSON.stringify({ photos: photos ?? [], docxHtml: docxHtml ?? null }), 'utf-8')
    return { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('data:get-relatorio-assets', async (_, { id }) => {
  try {
    const data = JSON.parse(await fs.promises.readFile(assetsFilePath(id), 'utf-8'))
    return { ok: true, photos: data.photos ?? [], docxHtml: data.docxHtml ?? null, found: true }
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, photos: [], docxHtml: null, found: false }
    return { ok: false, error: String(err), photos: [], docxHtml: null, found: false }
  }
})

ipcMain.handle('data:delete-relatorio-assets', async (_, { id }) => {
  try {
    await fs.promises.rm(assetsFilePath(id), { force: true })
    return { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
})

/* Exporta os arquivos do relatório (fotos + DOCX/HTML) para a pasta da EUT,
   para o usuário ter os arquivos físicos mesmo reabrindo de outro PC. */
ipcMain.handle('relatorio:export-files', async (_, { folderPath, numRelatorio, photos, docxHtml, docxName }) => {
  try {
    // Mesma lógica do PDF: usa a pasta informada ou a pasta da EUT carregada (global)
    const baseDir = folderPath || eutFolderPath
    if (!baseDir) return { ok: false, error: 'Pasta da EUT não associada — carregue a pasta da EUT primeiro.' }
    const safeNum = String(numRelatorio || 'relatorio').replace(/[\\/:"*?<>|]/g, '_')
    const outDir  = path.join(baseDir, `Arquivos_${safeNum}`)
    fs.mkdirSync(outDir, { recursive: true })

    let nFotos = 0
    const lista = Array.isArray(photos) ? photos : []
    for (let i = 0; i < lista.length; i++) {
      const p = lista[i]
      if (!p?.base64) continue
      const raw  = String(p.base64).replace(/^data:image\/\w+;base64,/, '')
      const ext  = (p.name && path.extname(p.name)) || '.jpg'
      const base = (p.name ? path.basename(p.name, path.extname(p.name)) : `foto_${i + 1}`).replace(/[\\/:"*?<>|]/g, '_')
      const fname = `${String(i + 1).padStart(2, '0')}_${base}${ext}`
      fs.writeFileSync(path.join(outDir, fname), Buffer.from(raw, 'base64'))
      nFotos++
    }

    let docxSaved = false
    if (docxHtml) {
      const docBase = (docxName ? path.basename(docxName, path.extname(docxName)) : `${safeNum}_radimation`).replace(/[\\/:"*?<>|]/g, '_')
      const htmlDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>${docxHtml}</body></html>`
      fs.writeFileSync(path.join(outDir, `${docBase}.doc`), htmlDoc, 'utf-8')
      docxSaved = true
    }

    shell.openPath(outDir)
    return { ok: true, outDir, nFotos, docxSaved }
  } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('data:get-agenda', async () => {
  const { agendaFolder, dataFolder } = readSettings()
  const data = await readAgendaFile()
  return { ok: true, agenda: data ?? [], fromNetwork: !!(agendaFolder || dataFolder) }
})

ipcMain.handle('data:save-agenda', async (_, { agenda }) => {
  try { await writeAgendaFile(agenda); return { ok: true } }
  catch (err) { return { ok: false, error: String(err) } }
})

// Acha, dentro de baseDir, a subpasta cujo nome contém o protocolo (ex.: pasta
// "0887 - Cliente X" casa com protocolo "0887"). Não exige nome exato porque
// a pasta da Iluminação costuma ter texto extra no nome.
function acharPastaProtocolo(baseDir, protocolo) {
  try {
    const alvo = protocolo.trim().toLowerCase()
    if (!alvo) return null
    const entrada = fs.readdirSync(baseDir, { withFileTypes: true })
      .find(e => e.isDirectory() && e.name.toLowerCase().includes(alvo))
    return entrada ? path.join(baseDir, entrada.name) : null
  } catch { return null }
}

// Dentro da pasta do protocolo, acha uma subpasta chamada "fotos" (qualquer
// capitalização). Se não achar, a própria pasta do protocolo é usada como
// origem (só as imagens da raiz, ignorando outros arquivos).
function acharSubpastaFotos(protocoloDir) {
  try {
    const entrada = fs.readdirSync(protocoloDir, { withFileTypes: true })
      .find(e => e.isDirectory() && e.name.toLowerCase() === 'fotos')
    return entrada ? path.join(protocoloDir, entrada.name) : null
  } catch { return null }
}

async function copiarFotosDir(origemDir, destinoDir, apenasImagens) {
  await fs.promises.mkdir(destinoDir, { recursive: true })
  const entradas = await fs.promises.readdir(origemDir, { withFileTypes: true })
  let copiados = 0
  for (const e of entradas) {
    if (!e.isFile()) continue
    if (apenasImagens && !IMG_EXTENSOES.has(path.extname(e.name).toLowerCase())) continue
    await fs.promises.copyFile(path.join(origemDir, e.name), path.join(destinoDir, e.name))
    copiados++
  }
  return copiados
}

// Varre a agenda, casa cada protocolo com a pasta correspondente na rede da
// Iluminação (por tipo lâmpada/luminária, na pasta do ano atual) e copia as
// fotos pra nossa rede (Alta Tecnologia), criando <protocolo>\fotos. Best-
// effort por item — um protocolo sem pasta/foto não impede os demais.
ipcMain.handle('agenda:importar-fotos-rede', async () => {
  try {
    const agenda = await readAgendaFile()
    const ano = String(new Date().getFullYear())
    const resultado = { processados: 0, copiados: 0, semPasta: [], semFotos: [], erros: [] }
    const vistos = new Set()
    for (const item of agenda) {
      const protocolo = String(item.protocolo || '').trim()
      if (!protocolo || vistos.has(protocolo)) continue
      vistos.add(protocolo)
      resultado.processados++

      const baseOrigem = path.join(
        item.tipo === 'luminaria' ? ILUMINACAO_LUMINARIA_BASE : ILUMINACAO_LAMPADA_BASE,
        ano,
      )
      const pastaProtocolo = acharPastaProtocolo(baseOrigem, protocolo)
      if (!pastaProtocolo) { resultado.semPasta.push(protocolo); continue }

      const pastaFotos    = acharSubpastaFotos(pastaProtocolo)
      const origemFotos   = pastaFotos || pastaProtocolo
      const apenasImagens = !pastaFotos
      const destino       = path.join(FOTOS_DESTINO_BASE, ano, protocolo, 'fotos')

      try {
        const n = await copiarFotosDir(origemFotos, destino, apenasImagens)
        if (n > 0) resultado.copiados++
        else resultado.semFotos.push(protocolo)
      } catch (err) {
        resultado.erros.push(`${protocolo}: ${err.message}`)
      }
    }
    return { ok: true, ...resultado }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

// Move (corta) um arquivo pra outro caminho; se a origem/destino estiverem em
// volumes diferentes (rede vs local), rename falha com EXDEV — nesse caso
// copia e apaga o original, simulando o mesmo efeito de "recortar".
async function moverArquivo(src, dest) {
  try {
    await fs.promises.rename(src, dest)
  } catch (err) {
    if (err.code !== 'EXDEV') throw err
    await fs.promises.copyFile(src, dest)
    await fs.promises.unlink(src)
  }
}

// Lista, recursivamente, o caminho completo de todo arquivo sob `dir` (em
// qualquer profundidade) — permite escolher a pasta-mãe (que contém várias
// subpastas, do jeito que estiverem organizadas) em vez de exigir que os
// arquivos já estejam soltos numa única pasta.
function listarArquivosRecursivo(dir) {
  const out = []
  let entradas
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entradas) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...listarArquivosRecursivo(full))
    else if (e.isFile()) out.push(full)
  }
  return out
}

// Pede pro usuário escolher a pasta-mãe com os resultados (pode ter subpastas
// em qualquer organização) e move cada .docx achado (em qualquer profundidade)
// pra pasta do protocolo correspondente (já criada em FOTOS_DESTINO_BASE —
// mesma pasta usada pelo "Importar Fotos"). Casa pelo nome do ARQUIVO conter
// o número do protocolo (não pelo nome da subpasta); entre protocolos
// candidatos, prefere o mais específico (nome mais longo), pra "88" não
// roubar um arquivo que é do protocolo "0887".
ipcMain.handle('agenda:organizar-resultados', async () => {
  const win = BrowserWindow.getFocusedWindow()
  const escolha = await dialog.showOpenDialog(win, {
    title: 'Selecionar a pasta-mãe com os resultados (.docx)',
    properties: ['openDirectory'],
  })
  if (escolha.canceled || !escolha.filePaths.length) return { ok: false, canceled: true }
  const origemDir = escolha.filePaths[0]
  const ano = String(new Date().getFullYear())
  const destBaseAno = path.join(FOTOS_DESTINO_BASE, ano)

  let protocolos
  try {
    protocolos = fs.readdirSync(destBaseAno, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort((a, b) => b.length - a.length)
  } catch (err) {
    return { ok: false, error: 'Não consegui ler a pasta de destino (' + destBaseAno + '): ' + err.message }
  }

  const arquivos = listarArquivosRecursivo(origemDir)
    .filter(f => f.toLowerCase().endsWith('.docx') && !path.basename(f).startsWith('~'))

  const resultado = { total: arquivos.length, movidos: 0, semPasta: [], erros: [] }
  for (const caminho of arquivos) {
    const nome = path.basename(caminho)
    const alvo = nome.toLowerCase()
    const protocolo = protocolos.find(p => alvo.includes(p.toLowerCase()))
    if (!protocolo) { resultado.semPasta.push(nome); continue }
    try {
      const destDir = path.join(destBaseAno, protocolo)
      await fs.promises.mkdir(destDir, { recursive: true })
      await moverArquivo(caminho, path.join(destDir, nome))
      resultado.movidos++
    } catch (err) {
      resultado.erros.push(`${nome}: ${err.message}`)
    }
  }
  return { ok: true, ...resultado }
})

// Pede uma pasta-mãe (ex.: a pasta do ano em "3.2 - Registros de ensaios") e,
// pra cada protocolo informado, acha a subpasta correspondente, lê as fotos
// (de "fotos/" ou da raiz) e o .docx (da raiz) e devolve tudo já em base64 —
// tudo lido aqui no processo principal (Node puro), bem mais rápido/confiável
// em pasta de rede grande do que o <input type="file" webkitdirectory> do
// navegador, que precisa enumerar a árvore inteira antes de disparar o onChange.
ipcMain.handle('lote:importar-pasta-mae', async (_, { protocolos }) => {
  const win = BrowserWindow.getFocusedWindow()
  const escolha = await dialog.showOpenDialog(win, {
    title: 'Selecionar a pasta-mãe (ex.: pasta do ano)',
    properties: ['openDirectory'],
  })
  if (escolha.canceled || !escolha.filePaths.length) return { ok: false, canceled: true }
  const baseDir = escolha.filePaths[0]

  const resultados = {}
  const naoEncontrados = []
  for (const protocolo of protocolos || []) {
    const proto = String(protocolo || '').trim()
    if (!proto) continue
    const pastaProtocolo = acharPastaProtocolo(baseDir, proto)
    if (!pastaProtocolo) { naoEncontrados.push(proto); continue }

    const pastaFotos  = acharSubpastaFotos(pastaProtocolo)
    const origemFotos = pastaFotos || pastaProtocolo

    let photos = []
    try {
      const entradas = await fs.promises.readdir(origemFotos, { withFileTypes: true })
      for (const e of entradas) {
        if (!e.isFile() || !IMG_EXTENSOES.has(path.extname(e.name).toLowerCase())) continue
        try {
          const buf = await fs.promises.readFile(path.join(origemFotos, e.name))
          photos.push({ name: e.name, base64: buf.toString('base64') })
        } catch {}
      }
    } catch {}

    let docx = null
    try {
      const entradas = await fs.promises.readdir(pastaProtocolo, { withFileTypes: true })
      const arquivoDocx = entradas.find(e => e.isFile() && e.name.toLowerCase().endsWith('.docx') && !e.name.startsWith('~'))
      if (arquivoDocx) {
        const buf = await fs.promises.readFile(path.join(pastaProtocolo, arquivoDocx.name))
        docx = { name: arquivoDocx.name, base64: buf.toString('base64') }
      }
    } catch {}

    if (photos.length === 0 && !docx) { naoEncontrados.push(proto); continue }
    resultados[proto] = { photos, docx }
  }

  return { ok: true, resultados, naoEncontrados }
})

/* ─── lote em andamento (arquivo local — não depende da cota do localStorage,
   por isso datas e fotos sobrevivem à navegação entre telas) ──────────────── */
function loteFilePath() {
  return path.join(getUserDataDir(), 'lote', 'cispr15_lote.json')
}

ipcMain.handle('lote:get', async () => {
  try {
    return { ok: true, lote: JSON.parse(await fs.promises.readFile(loteFilePath(), 'utf-8')) }
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, lote: null }
    return { ok: false, error: String(err), lote: null }
  }
})

ipcMain.handle('lote:save', async (_, { lote }) => {
  try {
    const fp = loteFilePath()
    await fs.promises.mkdir(path.dirname(fp), { recursive: true })
    await fs.promises.writeFile(fp, JSON.stringify(lote), 'utf-8')
    return { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('lote:clear', async () => {
  try {
    await fs.promises.rm(loteFilePath(), { force: true })
    return { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
})

/* ─── lotes em andamento (coleção, na pasta de rede — dataFolder) ────────────
   Substitui o arquivo local único acima: agora ficam na mesma pasta de rede
   de clientes/relatórios (já com criptografia + espelho automáticos), como
   uma coleção — permite mais de um lote em andamento ao mesmo tempo, cada um
   identificado pelo orçamento, e visível em qualquer PC configurado com a
   mesma pasta de rede. */
ipcMain.handle('data:get-lotes', async () => {
  try {
    let lotes = await readDataFile('cispr15_lotes.json')
    if (!Array.isArray(lotes)) lotes = []

    // Migração única do lote antigo (armazenamento local, um só por vez) —
    // preserva o trabalho em andamento na primeira vez que isso rodar.
    try {
      const legacyPath = loteFilePath()
      const legacy = JSON.parse(await fs.promises.readFile(legacyPath, 'utf-8'))
      if (legacy && Array.isArray(legacy.amostras) && legacy.amostras.length > 0) {
        const id = legacy.id || crypto.randomUUID()
        if (!lotes.some(l => l.id === id)) {
          const migrado = { orcamento: legacy.amostras[0]?.orcamento || '', ...legacy, id }
          lotes = [...lotes, migrado]
          await writeDataFile('cispr15_lotes.json', lotes)
        }
        await fs.promises.rename(legacyPath, legacyPath + '.migrado')
      }
    } catch {}

    return { ok: true, lotes }
  } catch (err) {
    return { ok: false, error: String(err), lotes: [] }
  }
})

ipcMain.handle('data:save-lotes', async (_, { lotes }) => {
  try { await writeDataFile('cispr15_lotes.json', lotes); return { ok: true } }
  catch (err) { return { ok: false, error: String(err) } }
})

/* Grava o PDF (+ DOCX + fotos) de uma amostra na subpasta do protocolo,
   dentro da pasta-mãe escolhida. Usado pelo "Baixar PDFs" do lote. */
ipcMain.handle('lote:save-pdf', async (_, { pastaMae, protocolo, filename, pdfBase64, photos, docxHtml, docxName, saveExtras }) => {
  try {
    if (!pastaMae) return { ok: false, error: 'pasta-mãe não informada' }
    const safeProto = (String(protocolo || 'sem-protocolo').replace(/[\\/:"*?<>|]/g, '_').trim()) || 'sem-protocolo'
    const dir = path.join(pastaMae, safeProto)
    fs.mkdirSync(dir, { recursive: true })

    const safeName = String(filename || 'relatorio.pdf').replace(/[\\/:"*?<>|]/g, '_')
    const rawPdf = String(pdfBase64 || '').replace(/^data:.*;base64,/, '')
    fs.writeFileSync(path.join(dir, safeName), Buffer.from(rawPdf, 'base64'))

    let nFotos = 0, docxSaved = false
    if (saveExtras) {
      const lista = Array.isArray(photos) ? photos : []
      for (let i = 0; i < lista.length; i++) {
        const p = lista[i]
        if (!p?.base64) continue
        const raw  = String(p.base64).replace(/^data:image\/\w+;base64,/, '')
        const ext  = (p.name && path.extname(p.name)) || '.jpg'
        const base = (p.name ? path.basename(p.name, path.extname(p.name)) : `foto_${i + 1}`).replace(/[\\/:"*?<>|]/g, '_')
        fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(2, '0')}_${base}${ext}`), Buffer.from(raw, 'base64'))
        nFotos++
      }
      if (docxHtml) {
        const docBase = (docxName ? path.basename(docxName, path.extname(docxName)) : `${safeProto}_radimation`).replace(/[\\/:"*?<>|]/g, '_')
        const htmlDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>${docxHtml}</body></html>`
        fs.writeFileSync(path.join(dir, `${docBase}.doc`), htmlDoc, 'utf-8')
        docxSaved = true
      }
    }
    return { ok: true, dir, nFotos, docxSaved }
  } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('settings:get-local-data-dir', () => getDefaultDataDir())

/* ─── IPC: PDF ────────────────────────────────────────────────────────────── */

/* Rodapé nativo (margem de página reservada — igual ao Word): aparece em TODAS
   as páginas, independente do conteúdo, com numeração automática do Chromium. */
const PDF_FOOTER_TEMPLATE = `
<div style="font-family:Arial,Helvetica,sans-serif; font-size:8px; color:#333; width:100%; box-sizing:border-box; padding:0 53px;">
  <div style="border-top:2px solid #3C3C3C; display:flex; align-items:flex-start; padding-top:3px;">
    <div style="font-weight:bold; color:#000; white-space:nowrap; line-height:1.25; width:55px;">LABELO<br/>PUCRS</div>
    <div style="flex:1; text-align:center; line-height:1.3; color:#444; font-size:7px;">
      Av. Ipiranga n° 6681, Prédio 30 Bloco A, Sala 210 – Partenon · CEP 90619-900 – Porto Alegre – RS – Brasil<br/>
      Tel.: (51) 3320 3551 · labelo@pucrs.br · www.labelo.com.br
    </div>
    <div style="white-space:nowrap; width:95px; text-align:right; color:#444; font-size:7px;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>
  </div>
</div>`

// Opções de impressão com rodapé dedicado (margem inferior ~20mm reservada)
const PDF_PRINT_OPTS = {
  printBackground: true,
  pageSize: 'A4',
  landscape: false,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: PDF_FOOTER_TEMPLATE,
  margins: { top: 0, bottom: 0.8, left: 0, right: 0 }, // polegadas (0.8in ≈ 20mm)
}

ipcMain.handle('pdf:save', async (_, { filename }) => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return { ok: false, error: 'sem janela' }
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Salvar Relatório PDF',
    defaultPath: filename || 'relatorio-cispr15.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try {
    try { await win.webContents.executeJavaScript(`new Promise(function(r){ var imgs=[].slice.call(document.images); var pend=imgs.filter(function(i){return !i.complete}); function go(){ var f=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve(); f.then(function(){ requestAnimationFrame(function(){ requestAnimationFrame(function(){ setTimeout(r,150) }) }) }) } if(pend.length===0){go();return} var n=0,t=setTimeout(go,8000); function chk(){ if(++n>=pend.length){clearTimeout(t);go()} } pend.forEach(function(i){ i.addEventListener("load",chk); i.addEventListener("error",chk) }) })`) } catch (e) {}
    const data = await win.webContents.printToPDF(PDF_PRINT_OPTS)
    fs.writeFileSync(filePath, data)
    shell.openPath(filePath)
    return { ok: true, filePath }
  } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('pdf:save-eut', async (_, { filename, folderPath, force }) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  if (!win) return { ok: false, error: 'sem janela' }
  try {
    let outDir = folderPath || eutFolderPath || app.getPath('documents')
    let usedDocuments = false
    // Tenta garantir que o diretório exista; se falhar (ex: pasta de rede inacessível), recai para Documentos
    if (outDir !== app.getPath('documents')) {
      try {
        fs.mkdirSync(outDir, { recursive: true })
      } catch {
        outDir = app.getPath('documents')
        usedDocuments = true
      }
    }
    const outPath = path.join(outDir, (filename || 'relatorio.pdf').replace(/[\\/:"*?<>|]/g, '_'))
    // Se já existe, apenas abre a pasta sem regerar — a menos que "force" (ex.:
    // reimprimir com o carimbo de assinatura já posicionado, antes de assinar).
    if (fs.existsSync(outPath) && !force) {
      shell.showItemInFolder(outPath)
      return { ok: true, filePath: outPath, skipped: true, usedDocuments }
    }
    try { await win.webContents.executeJavaScript(`new Promise(function(r){ var imgs=[].slice.call(document.images); var pend=imgs.filter(function(i){return !i.complete}); function go(){ var f=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve(); f.then(function(){ requestAnimationFrame(function(){ requestAnimationFrame(function(){ setTimeout(r,150) }) }) }) } if(pend.length===0){go();return} var n=0,t=setTimeout(go,8000); function chk(){ if(++n>=pend.length){clearTimeout(t);go()} } pend.forEach(function(i){ i.addEventListener("load",chk); i.addEventListener("error",chk) }) })`) } catch (e) {}
    const data = await win.webContents.printToPDF(PDF_PRINT_OPTS)
    try {
      await writeWithRetry(outPath, data)
    } catch (err) {
      if (err && (err.code === 'EBUSY' || err.code === 'EPERM')) {
        return { ok: false, error: `O arquivo PDF está aberto em outro programa (leitor de PDF, Explorer, etc.):\n${outPath}\n\nFeche-o e tente novamente.` }
      }
      throw err
    }
    if (!force) shell.showItemInFolder(outPath) // regeração pra assinar: não abre o Explorer, é um passo interno
    return { ok: true, filePath: outPath, usedDocuments }
  } catch (err) { return { ok: false, error: String(err) } }
})

// Lista certificados com chave privada disponíveis no Windows Certificate Store
ipcMain.handle('pdf:list-certs', async () => {
  try {
    const certs = listSigningCerts()
    return { ok: true, certs }
  } catch (err) {
    return { ok: false, error: String(err), certs: [] }
  }
})

// Assina digitalmente um PDF já salvo na pasta da EUT
ipcMain.handle('pdf:sign-file', async (_, { eutFolderPath: eutPath, pdfFilename }) => {
  const { certThumbprint, pfxPath, pfxPassword } = readSettings()
  if (!pfxPath && !certThumbprint) return { ok: false, error: 'Nenhum certificado/.pfx configurado em Configurações → Assinatura Digital.' }
  if (!eutPath || !pdfFilename) return { ok: false, error: 'Caminho da pasta EUT não disponível.' }
  const pdfPath = path.join(eutPath, pdfFilename)
  if (!fs.existsSync(pdfPath)) return { ok: false, error: `PDF não encontrado:\n${pdfPath}` }
  try {
    const pdfBuffer = fs.readFileSync(pdfPath)
    let signed
    if (pfxPath) {
      if (!fs.existsSync(pfxPath)) return { ok: false, error: `Arquivo .pfx não encontrado:\n${pfxPath}` }
      signed = await signPDFWithPfx(pdfBuffer, fs.readFileSync(pfxPath), pfxPassword || '')
    } else {
      signed = await signPDF(pdfBuffer, certThumbprint)
    }
    fs.writeFileSync(pdfPath, signed)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
})

// Abre diálogo para escolher um arquivo .pfx/.p12
ipcMain.handle('pdf:pick-pfx', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const r = await dialog.showOpenDialog(win, {
      title: 'Selecione o arquivo de assinatura (.pfx / .p12)',
      filters: [{ name: 'Certificado PKCS#12', extensions: ['pfx', 'p12'] }],
      properties: ['openFile'],
    })
    if (r.canceled || !r.filePaths?.length) return { ok: false, canceled: true }
    return { ok: true, path: r.filePaths[0] }
  } catch (err) { return { ok: false, error: String(err) } }
})

// Valida o .pfx + senha e devolve dados do certificado (subject / validade)
ipcMain.handle('pdf:validate-pfx', async (_, { pfxPath: p, password }) => {
  try {
    if (!p || !fs.existsSync(p)) return { ok: false, error: 'Arquivo .pfx não encontrado.' }
    return validatePfx(fs.readFileSync(p), password || '')
  } catch (err) { return { ok: false, error: err.message || String(err) } }
})

// Copia o PDF assinado da pasta EUT para a pasta da agenda (acionado manualmente após assinatura)
ipcMain.handle('pdf:publish', async (_, { eutFolderPath: eutPath, pdfFilename, ano }) => {
  const { pdfCopyFolder } = readSettings()
  if (!pdfCopyFolder) return { ok: false, error: 'Pasta de destino não configurada em Configurações.' }
  if (!eutPath || !pdfFilename) return { ok: false, error: 'Caminho da pasta EUT não disponível.' }
  const src = path.join(eutPath, pdfFilename)
  if (!fs.existsSync(src)) return { ok: false, error: `PDF não encontrado em:\n${src}` }
  try {
    // Organiza por ano em subpasta (.../pdfs/2026/); sem ano cai na raiz (legado)
    const anoStr = ano ? String(ano).replace(/\D/g, '').slice(0, 4) : ''
    const destDir = anoStr ? path.join(pdfCopyFolder, anoStr) : pdfCopyFolder
    fs.mkdirSync(destDir, { recursive: true })
    const dest = path.join(destDir, pdfFilename)
    fs.copyFileSync(src, dest)
    return { ok: true, dest }
  } catch (err) { return { ok: false, error: String(err) } }
})

// Pasta fixa de cópia dos relatórios CISPR 15 (LABELO) — mesma pasta em todos
// os PCs, sem depender da "Pasta de destino" configurável em Configurações
// (essa é usada só pelo fluxo de assinatura/publicação acima).
const RELATORIOS_COPIA_FOLDER = 'T:\\Relatórios\\Compatibilidade eletromagnética'

// Botão "Enviar cópia" da aba Relatórios: manda o PDF mais recente da pasta da
// EUT pra pasta fixa acima, organizada por ano (uma subpasta "2026", "2027" etc.
// — a pasta-mãe já existe na rede, só a subpasta do ano pode não existir ainda).
// Não presume o nome do arquivo — se a pasta tiver mais de um PDF (ex.: revisão,
// versão assinada à parte), pega o de modificação mais recente.
ipcMain.handle('pdf:send-copy', async (_, { eutFolderPath: eutPath, ano }) => {
  if (!eutPath) return { ok: false, error: 'Pasta EUT não associada — carregue a pasta da EUT primeiro.' }
  if (!fs.existsSync(eutPath)) return { ok: false, error: `Pasta não encontrada:\n${eutPath}` }
  if (!fs.existsSync(RELATORIOS_COPIA_FOLDER)) return { ok: false, error: `Pasta de destino não encontrada:\n${RELATORIOS_COPIA_FOLDER}` }
  try {
    const pdfs = fs.readdirSync(eutPath, { withFileTypes: true })
      .filter(e => e.isFile() && /\.pdf$/i.test(e.name))
      .map(e => path.join(eutPath, e.name))
    if (!pdfs.length) return { ok: false, error: 'Nenhum PDF encontrado na pasta da EUT.' }
    const maisRecente = pdfs
      .map(p => ({ p, mtime: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0].p
    const anoStr = ano ? String(ano).replace(/\D/g, '').slice(0, 4) : ''
    const destDir = anoStr ? path.join(RELATORIOS_COPIA_FOLDER, anoStr) : RELATORIOS_COPIA_FOLDER
    fs.mkdirSync(destDir, { recursive: true })
    const dest = path.join(destDir, path.basename(maisRecente))
    fs.copyFileSync(maisRecente, dest)
    return { ok: true, dest }
  } catch (err) { return { ok: false, error: String(err) } }
})

/* Reconcilia a CÓPIA do PDF: ao reabrir/ver o relatório, se o PDF original (na
   pasta do docx) estiver ASSINADO e a cópia estiver ausente/desatualizada, copia
   pra pasta de cópias. Cobre o caso 2: PDF assinado manualmente (fora do app).
   Geração simples (PDF não assinado) NÃO copia. */
function pdfEstaAssinado(filePath) {
  try {
    const txt = fs.readFileSync(filePath).toString('latin1')
    return /\/ByteRange\s*\[/.test(txt) && /\/(Sig|Adobe\.PPKLite)|adbe\.pkcs7/.test(txt)
  } catch { return false }
}
ipcMain.handle('pdf:sync-eut-copy', (_, { eutFolderPath: eutPath, pdfFilename, ano }) => {
  try {
    const { pdfCopyFolder } = readSettings()
    if (!pdfCopyFolder || !eutPath || !pdfFilename) return { ok: true, copied: false }
    const src = path.join(eutPath, pdfFilename)
    if (!fs.existsSync(src)) return { ok: true, copied: false }
    const anoStr = ano ? String(ano).replace(/\D/g, '').slice(0, 4) : ''
    const destDir = anoStr ? path.join(pdfCopyFolder, anoStr) : pdfCopyFolder
    const dest = path.join(destDir, pdfFilename)
    const s = fs.statSync(src)
    // Cópia já em dia? (mesmo tamanho e não mais antiga) → nada a fazer
    if (fs.existsSync(dest)) {
      const d = fs.statSync(dest)
      if (d.size === s.size && d.mtimeMs >= s.mtimeMs) return { ok: true, copied: false }
    }
    // Só copia se estiver assinado (assinatura manual = alteração do original)
    if (!pdfEstaAssinado(src)) return { ok: true, copied: false }
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(src, dest)
    return { ok: true, copied: true, dest }
  } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('relatorio:cancel-pdf', async (_, { eutFolderPath: eutPath, pdfFilename }) => {
  const s = readSettings()
  const targets = []
  if (eutPath && pdfFilename) targets.push(path.join(eutPath, pdfFilename))
  if (s.pdfCopyFolder && pdfFilename) {
    targets.push(path.join(s.pdfCopyFolder, pdfFilename)) // raiz (legado)
    // varre subpastas por ano e pega qualquer cópia com o mesmo nome
    for (const p of listPdfsDeep(s.pdfCopyFolder)) {
      if (path.basename(p) === pdfFilename) targets.push(p)
    }
  }
  const deleted = []
  for (const p of [...new Set(targets)]) {
    try { if (fs.existsSync(p)) { fs.unlinkSync(p); deleted.push(p) } } catch {}
  }
  return { ok: true, deleted }
})

// Gera PDF a partir de HTML arbitrário e abre o diálogo "Salvar como".
// Usado para baixar Instruções de Trabalho / PCs (módulo Lab).
ipcMain.handle('pdf:save-html', async (_, { html, filename, landscape }) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Salvar PDF',
    defaultPath: (filename || 'documento.pdf').replace(/[\\/:"*?<>|]/g, '_'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  const tmpPath = path.join(app.getPath('temp'), `it_print_${Date.now()}.html`)
  let pwin = null
  try {
    fs.writeFileSync(tmpPath, html, 'utf-8')
    pwin = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { javascript: false } })
    await pwin.loadFile(tmpPath)
    const data = await pwin.webContents.printToPDF({
      printBackground: true, pageSize: 'A4', landscape: !!landscape,
      margins: { marginType: 'minimum' }, displayHeaderFooter: false,
    })
    fs.writeFileSync(filePath, data)
    shell.openPath(filePath)
    return { ok: true, filePath }
  } catch (err) {
    return { ok: false, error: String(err) }
  } finally {
    try { if (pwin) pwin.destroy() } catch {}
    try { fs.unlinkSync(tmpPath) } catch {}
  }
})

ipcMain.handle('pdf:followup', async (_, { html, filename, landscape }) => {
  const tmpPath = path.join(app.getPath('temp'), `fu_print_${Date.now()}.html`)
  let win = null
  try {
    fs.writeFileSync(tmpPath, html, 'utf-8')
    const docsDir = path.join(app.getPath('documents'), 'CISPR 15 LABELO', 'followup')
    fs.mkdirSync(docsDir, { recursive: true })
    const safe = (filename || 'followup.pdf').replace(/[\\/:"*?<>|]/g, '_')
    const outPath = path.join(docsDir, safe)
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { javascript: false } })
    await win.loadFile(tmpPath)
    const data = await win.webContents.printToPDF({
      printBackground: true, pageSize: 'A4', landscape: !!landscape,
      margins: { marginType: 'minimum' }, displayHeaderFooter: false,
    })
    fs.writeFileSync(outPath, data)
    shell.showItemInFolder(outPath)
    return { ok: true, filePath: outPath }
  } catch (err) {
    return { ok: false, error: String(err) }
  } finally {
    try { if (win) win.destroy() } catch {}
    try { fs.unlinkSync(tmpPath) } catch {}
  }
})

ipcMain.handle('pdf:find-in-copy-folder', (_, { query }) => {
  const { pdfCopyFolder } = readSettings()
  if (!pdfCopyFolder || !query) return { ok: false, filePaths: [], folder: pdfCopyFolder }
  try {
    if (!fs.existsSync(pdfCopyFolder)) return { ok: false, filePaths: [], folder: pdfCopyFolder }
    const san = s => String(s).replace(/[/\\:*?"<>|\s]/g, '_').replace(/_+/g, '_').toLowerCase()
    const needle = san(query)
    // busca em raiz + subpastas por ano
    const matches = listPdfsDeep(pdfCopyFolder).filter(p => san(path.basename(p)).includes(needle))
    if (matches.length > 0) {
      return { ok: true, filePaths: matches, filePath: matches[0], folder: pdfCopyFolder }
    }
    return { ok: false, filePaths: [], folder: pdfCopyFolder }
  } catch (err) { return { ok: false, filePaths: [], error: String(err) } }
})

ipcMain.handle('pdf:delete-copy', (_, { pdfPath }) => {
  const { pdfCopyFolder } = readSettings()
  if (!pdfCopyFolder || !pdfPath) return { ok: true }
  try {
    // remove cópias com o mesmo nome em raiz + subpastas por ano
    const base = path.basename(pdfPath)
    for (const p of listPdfsDeep(pdfCopyFolder)) {
      if (path.basename(p) === base) { try { fs.unlinkSync(p) } catch {} }
    }
    return { ok: true }
  } catch (err) { return { ok: false, error: String(err) } }
})

/* ─── IPC: DOCX ───────────────────────────────────────────────────────────── */

ipcMain.handle('docx:parse', async (_, { buffer }) => {
  try {
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) })
    return { html: result.value }
  } catch (err) { return { error: String(err) } }
})

/* ─── IPC: Pasta da EUT ──────────────────────────────────────────────────── */

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp', '.tif', '.tiff'])

// Lê o .docx e as fotos de uma pasta da EUT já resolvida (por diálogo manual ou
// por match automático de protocolo — ver eut:find-by-protocolo). Compartilhada
// pelos dois fluxos pra não duplicar a leitura.
function lerConteudoPastaEut(folderPath) {
  const entries = fs.readdirSync(folderPath)

  let docxName = null, docxBuffer = null
  for (const f of entries) {
    if (f.toLowerCase().endsWith('.docx') && !f.startsWith('~')) {
      docxName   = f
      docxBuffer = Array.from(fs.readFileSync(path.join(folderPath, f)))
      break
    }
  }

  const imageFiles = []
  for (const f of entries) {
    const full = path.join(folderPath, f)
    const ext  = path.extname(f).toLowerCase()
    try {
      const stat = fs.statSync(full)
      if (stat.isFile() && IMAGE_EXTS.has(ext)) {
        imageFiles.push({ name: f, filePath: full })
      } else if (stat.isDirectory()) {
        for (const sf of fs.readdirSync(full)) {
          const sext = path.extname(sf).toLowerCase()
          if (IMAGE_EXTS.has(sext)) imageFiles.push({ name: sf, filePath: path.join(full, sf) })
        }
      }
    } catch {}
  }
  imageFiles.sort((a, b) => {
    const n = s => parseInt(s.replace(/\D/g, ''), 10) || 0
    return n(a.name) - n(b.name)
  })
  const images = imageFiles.map(({ name, filePath }) => ({
    name, ext: path.extname(name).toLowerCase().replace('.', ''),
    base64: fs.readFileSync(filePath).toString('base64'),
  }))

  // "Certificado" da pasta — o PDF que fica junto do docx/fotos (não presume
  // nome; se tiver mais de um PDF na raiz, pega o de modificação mais recente,
  // mesmo critério do botão "Enviar cópia").
  let certPath = null, certName = null
  try {
    const pdfs = entries
      .filter(f => /\.pdf$/i.test(f))
      .map(f => path.join(folderPath, f))
      .filter(p => { try { return fs.statSync(p).isFile() } catch { return false } })
    if (pdfs.length) {
      certPath = pdfs.map(p => ({ p, mtime: fs.statSync(p).mtimeMs })).sort((a, b) => b.mtime - a.mtime)[0].p
      certName = path.basename(certPath)
    }
  } catch {}

  return { folderPath, folderName: path.basename(folderPath), docxName, docxBuffer, images, certPath, certName }
}

ipcMain.handle('eut:open-folder', async () => {
  const win = BrowserWindow.getFocusedWindow()
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: 'Selecionar pasta da EUT (protocolo)',
    properties: ['openDirectory'],
  })
  if (canceled || !filePaths.length) return { canceled: true }

  const folderPath = filePaths[0]
  eutFolderPath = folderPath
  return { ok: true, ...lerConteudoPastaEut(folderPath) }
})

// Acha automaticamente a pasta da EUT pelo protocolo — mesma convenção usada
// em toda a rede: T:\...\3.2 - Registros de ensaios\<ano>\<pasta com o nome
// do protocolo>. Usado ao carregar um relatório salvo, pra não depender de
// abrir a pasta manualmente toda vez (ver FOTOS_DESTINO_BASE).
ipcMain.handle('eut:find-by-protocolo', async (_, { protocolo, ano }) => {
  const proto = String(protocolo || '').trim()
  const anoStr = String(ano || '').replace(/\D/g, '').slice(0, 4)
  if (!proto || !anoStr) return { ok: false, error: 'Protocolo ou ano ausente.' }
  const baseDir = path.join(FOTOS_DESTINO_BASE, anoStr)
  if (!fs.existsSync(baseDir)) return { ok: false, error: `Pasta do ano não encontrada:\n${baseDir}` }
  const folderPath = acharPastaProtocolo(baseDir, proto)
  if (!folderPath) return { ok: false, error: `Nenhuma pasta com o protocolo "${proto}" em:\n${baseDir}` }
  try {
    eutFolderPath = folderPath
    return { ok: true, ...lerConteudoPastaEut(folderPath) }
  } catch (err) { return { ok: false, error: String(err) } }
})

ipcMain.handle('eut:get-folder',   () => ({ folderPath: eutFolderPath }))
ipcMain.handle('eut:clear-folder', () => { eutFolderPath = null; return { ok: true } })

ipcMain.handle('window:focus', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) { win.focus(); win.webContents.focus() }
  return { ok: true }
})



/* ─── IPC: Excel ──────────────────────────────────────────────────────────── */

function toExcelSerial(d) { return d.getTime() / 86400000 + 25569 }

function findNextEmptyRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][1] === 'EMC' && rows[i][4] === '' && rows[i][5] === '' && rows[i][6] === '') return i
  }
  return -1
}

function getExcelPath() {
  const s = readSettings()
  if (s.excelPath) return s.excelPath
  return 'C:\\Users\\Notla\\OneDrive\\Área de Trabalho\\Compatibilidade eletromagnética_2026.xlsx'
}

ipcMain.handle('excel:check-protocolo', async (_, { protocolo }) => {
  const EXCEL_PATH = getExcelPath()
  try {
    if (!fs.existsSync(EXCEL_PATH)) return { exists: false, error: 'Planilha não encontrada' }
    const wb   = XLSX.read(fs.readFileSync(EXCEL_PATH), { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
    const needle = protocolo.trim().toLowerCase()
    for (const row of rows) {
      const cell = String(row[6] ?? '').trim().toLowerCase()
      if (cell && cell === needle) {
        const num = row[2]; const year = new Date().getFullYear()
        return { exists: true, numRelatorio: num ? `EMC ${num}/${year}` : undefined }
      }
    }
    return { exists: false }
  } catch (err) { return { exists: false, error: String(err) } }
})

ipcMain.handle('excel:proximo-numero', async () => {
  const EXCEL_PATH = getExcelPath()
  try {
    if (!fs.existsSync(EXCEL_PATH)) return { error: 'Planilha não encontrada: ' + EXCEL_PATH }
    const wb   = XLSX.read(fs.readFileSync(EXCEL_PATH), { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
    const idx  = findNextEmptyRow(rows)
    if (idx === -1) return { error: 'Sem linhas disponíveis' }
    const num = parseInt(String(rows[idx][2]), 10)
    return { proximoNumero: num, relatorio: `EMC ${num}/${new Date().getFullYear()}` }
  } catch (err) { return { error: String(err) } }
})

ipcMain.handle('excel:registrar', async (_, { cliente, produto, protocolo, orcamento, responsavel }) => {
  const EXCEL_PATH = getExcelPath()
  try {
    if (!fs.existsSync(EXCEL_PATH)) return { error: 'Planilha não encontrada: ' + EXCEL_PATH }
    // Lê só para encontrar a linha vazia (sem reescrever com XLSX para não perder formatação)
    const buf  = fs.readFileSync(EXCEL_PATH)
    const wb   = XLSX.read(buf, { type: 'buffer' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const idx  = findNextEmptyRow(rows)
    if (idx === -1) return { error: 'Sem linhas disponíveis' }
    const num    = parseInt(String(rows[idx][2]), 10)
    const row1   = idx + 1
    const orcNum = Number(orcamento)

    // Usa xlsx-populate para escrever preservando toda a formatação do modelo
    const XlsxPopulate = require('xlsx-populate')
    let lastErr = null
    for (let i = 1; i <= 4; i++) {
      try {
        const pop   = await XlsxPopulate.fromFileAsync(EXCEL_PATH)
        const sheet = pop.sheet(0)
        sheet.cell(`E${row1}`).value(cliente)
        sheet.cell(`F${row1}`).value(produto)
        sheet.cell(`G${row1}`).value(protocolo)
        sheet.cell(`H${row1}`).value(isNaN(orcNum) ? orcamento : orcNum)
        sheet.cell(`I${row1}`).value(new Date()).style('numberFormat', 'dd/mm/yyyy')
        sheet.cell(`J${row1}`).value(responsavel)
        await pop.toFileAsync(EXCEL_PATH)
        lastErr = null
        break
      } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 400 * i)) }
    }
    if (lastErr) throw lastErr
    return { numero: num, numRelatorio: `EMC ${num}/${new Date().getFullYear()}` }
  } catch (err) {
    const msg = String(err)
    return { error: msg + ((msg.includes('EBUSY') || msg.includes('EPERM')) ? ' — feche a planilha' : '') }
  }
})

/* ─── IPC: Auto-update ────────────────────────────────────────────────────── */

function semverGt(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true
    if ((pa[i] || 0) < (pb[i] || 0)) return false
  }
  return false
}

ipcMain.handle('update:check', async () => {
  try {
    const s = readSettings()
    if (!s.updateFolder) return { available: false }
    const versionFile = path.join(s.updateFolder, 'version.json')
    if (!fs.existsSync(versionFile)) return { available: false }
    const remote = JSON.parse(fs.readFileSync(versionFile, 'utf-8'))
    if (!remote.version || !remote.installer) return { available: false }
    if (semverGt(remote.version, app.getVersion())) {
      return { available: true, version: remote.version, installer: remote.installer }
    }
    return { available: false }
  } catch (err) {
    return { available: false, error: String(err) }
  }
})

ipcMain.handle('update:install', async (_, { installer }) => {
  try {
    const s = readSettings()
    const src  = path.join(s.updateFolder, installer)
    const dest = path.join(os.tmpdir(), installer)
    fs.copyFileSync(src, dest)
    spawn(dest, ['/SILENT', '/NORESTART'], { detached: true, stdio: 'ignore' }).unref()
    setTimeout(() => app.quit(), 800)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

/* ─── IPC: OCR (Windows.Media.Ocr via PowerShell) ────────────────────────── */

ipcMain.handle('ocr:recognize', async (_, { images }) => {
  const scriptPath = path.join(os.tmpdir(), 'cispr15_ocr_engine.ps1')
  try { fs.writeFileSync(scriptPath, PS_OCR_SCRIPT, 'utf-8') } catch {}

  const runOcr = (base64, idx) => new Promise((resolve) => {
    const tmpImg = path.join(os.tmpdir(), `cispr15_img_${Date.now()}_${idx}.jpg`)
    try { fs.writeFileSync(tmpImg, Buffer.from(base64, 'base64')) }
    catch { resolve(''); return }
    execFile(
      'powershell',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ImgPath', tmpImg],
      { timeout: 25000, encoding: 'utf8' },
      (err, stdout) => {
        try { fs.unlinkSync(tmpImg) } catch {}
        resolve(err ? '' : stdout.trim())
      }
    )
  })

  try {
    const texts = await Promise.all((images || []).slice(0, 4).map((img, i) => runOcr(img.base64, i)))
    return { ok: true, texts }
  } catch (err) {
    return { ok: false, error: String(err), texts: [] }
  }
})
