import fs from 'fs'
import path from 'path'

// Pasta de rede padrão para os cadastros/catálogos do laboratório (equipamentos,
// grupos, normas, procedimentos, certificados, laboratórios, planos de calibração,
// áreas & siglas, glossário, demandas, checagens). Mesma pasta em todos os PCs,
// para que todo mundo enxergue os mesmos dados sem precisar configurar nada.
// Clientes/relatórios (dataFolder) e agenda (agendaFolder) NÃO usam este valor —
// continuam com seus próprios padrões (ver electron/main.js getDefaultPaths()).
export const CADASTROS_FOLDER_PADRAO =
  'R:\\Compartilhado\\CISPR15'

// Pasta espelho padrão — mantida em sincronia com electron/main.js
// (MIRROR_FOLDER_PADRAO). Recebe cópia automática de todo cadastro salvo,
// além da pasta principal configurada acima. Existe pra PCs que só conseguem
// escrever na pasta de Alta Tecnologia, mas continuam enxergando os cadastros
// atualizados através do espelho.
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
