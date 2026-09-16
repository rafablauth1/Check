import fs from 'fs'
import path from 'path'

// Os caminhos de rede do laboratório vêm todos de shared/network-paths.js —
// arquivo único, consumido também pelo processo principal do Electron. Antes
// eram duas cópias das mesmas strings, uma aqui e outra em electron/main.js,
// com comentários pedindo pra "manter em sincronia": bastava alguém trocar a
// letra da unidade num lado pro servidor Next e o Electron passarem a gravar em
// pastas diferentes, e os dados "sumirem" dependendo de qual tela salvou.
//
// CADASTROS_FOLDER_PADRAO: cadastros/catálogos (equipamentos, grupos, normas,
// procedimentos, certificados, laboratórios, planos, glossário, checagens).
// MIRROR_FOLDER_PADRAO: espelho best-effort de tudo que é salvo, pros PCs que
// só conseguem escrever na pasta de Alta Tecnologia.
// ATENÇÃO: os valores abaixo têm de ser IDÊNTICOS aos de shared/network-paths.js,
// que é o que o processo principal do Electron consome.
//
// Já tentamos `require('../shared/network-paths')` aqui para ter uma fonte
// única de verdade — e o build do Next passou a estourar a heap (OOM no
// webpack). Um require de CommonJS dentro de um módulo que o webpack compila
// como ESM arrasta o módulo (e o `crypto` dele) pro grafo dos dois lados.
// Então a cópia fica, mas NÃO fica solta: scripts/conferir-constantes.js
// compara os dois arquivos e quebra o build se divergirem. Ao mudar um
// caminho, mude nos dois — o script avisa se você esquecer.
export const CADASTROS_FOLDER_PADRAO =
  'R:\\Compartilhado\\CISPR15'

export const MIRROR_FOLDER_PADRAO =
  'T:\\Laboratórios\\Alta Tecnologia\\Compatibilidade Eletromagnética\\3 - Planilhas de ensaios\\3.2 - Registros de ensaios\\CISPR15'

export interface AppSettings {
  excelPath: string
  dataFolder: string
  cadastrosFolder: string
  // Pasta secundária: recebe uma cópia espelhada de todo arquivo de dados gravado
  // (cadastros, agenda, relatórios, clientes) — best-effort, sem bloquear o save
  // principal. Existe para PCs que só têm permissão de escrita numa das duas
  // pastas de rede, mas ainda assim precisam que os dois locais fiquem em sincronia.
  mirrorFolder: string
  pdfAutoSaveToEut: boolean
}

const DEFAULTS: AppSettings = {
  excelPath: '',
  dataFolder: '',
  cadastrosFolder: CADASTROS_FOLDER_PADRAO,
  mirrorFolder: MIRROR_FOLDER_PADRAO,
  pdfAutoSaveToEut: true,
}

// Pasta de userData — MESMA que o Electron usa (app.getPath('userData') =
// %APPDATA%/CISPR 15 LABELO). É gravável; o cwd do servidor Next empacotado NÃO é.
export function getUserDataDir(): string {
  return (
    process.env.CISPR_USER_DATA ||
    (process.env.APPDATA ? path.join(process.env.APPDATA, 'CISPR 15 LABELO') : null) ||
    path.join(process.env.HOME || '.', '.cispr15-labelo')
  )
}

export function getSettingsFilePath(): string {
  return path.join(getUserDataDir(), 'settings.json')
}

// ASSÍNCRONO: leitura/escrita síncrona aqui também congela a janela inteira
// (mesmo problema já corrigido em lib/dados.ts) — settings.json fica em
// %APPDATA%, que em máquinas com perfil redirecionado/roaming é, na prática,
// uma pasta de rede. E getDadosDir() (usado por TODO lerJSON/escreverJSON,
// inclusive nos deletes) chama readSettings() a cada chamada — cacheamos em
// memória (só o processo do servidor Next altera settings.json, via writeSettings)
// pra não bater na rede de novo a cada fetch de cada página/troca de aba.
let cache: AppSettings | null = null

export async function readSettings(): Promise<AppSettings> {
  if (cache) return cache
  let lidas: AppSettings
  try {
    const p = getSettingsFilePath()
    const conteudo = await fs.promises.readFile(p, 'utf-8')
    lidas = { ...DEFAULTS, ...JSON.parse(conteudo) }
  } catch {
    lidas = { ...DEFAULTS }
  }
  /* Pasta vazia no arquivo salvo volta ao padrão de rede — vazio aqui manda o
     dado para uma pasta local do PC, onde ele some para os outros. */
  if (!String(lidas.cadastrosFolder ?? '').trim()) lidas.cadastrosFolder = DEFAULTS.cadastrosFolder
  if (!String(lidas.mirrorFolder ?? '').trim())    lidas.mirrorFolder    = DEFAULTS.mirrorFolder
  cache = lidas
  return lidas
}

export async function writeSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await readSettings()
  const merged = { ...current, ...settings }
  const p = getSettingsFilePath()
  await fs.promises.mkdir(path.dirname(p), { recursive: true })
  await fs.promises.writeFile(p, JSON.stringify(merged, null, 2), 'utf-8')
  cache = merged
  return merged
}
