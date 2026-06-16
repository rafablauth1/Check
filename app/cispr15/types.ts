export interface Cispr15Config {
  tipo: 'lampada' | 'luminaria'
  tensaoConfig: '127' | '127_220' | '127_220_277'
  // Cliente
  cliente: string
  clienteRua: string
  clienteCidade: string
  clienteCep: string
  // DUT
  produto: string
  fabricante: string
  modelo: string
  identificador: string
  lacre: string
  tensaoAlim: string
  potencia: string
  frequencia: string
  // Driver (acessório de ensaio — apenas luminária)
  temDriver?: boolean
  driverProduto?: string
  driverFabricante?: string
  driverModelo?: string
  driverIdentificador?: string
  driverPotencia?: string
  driverTensaoAlim?: string
  driverFrequencia?: string
  driverOrcamento?: string
  driverProtocolo?: string
  // Amostra
  documentacao: string
  // Relatório
  numRelatorio: string
  orcamento: string
  protocolo: string
  periodoInicio: string
  periodoFim: string
  dataEmissao: string
  responsavel: string
  // Resultados dos ensaios
  resultadoConduzida: 'pass' | 'fail'
  resultadoLoop: 'pass' | 'fail'
  resultadoAnexoB: 'pass' | 'fail'
}

export interface LoteAmostra {
  produto: string; fabricante: string; modelo: string; identificador: string
  tensaoAlim: string; potencia: string; frequencia: string
  protocolo: string; orcamento: string
  periodoInicio: string; periodoFim: string; dataEmissao: string
  conformidade: 'pendente' | 'conforme' | 'reprovado'
  numRelatorio: string
  photos: { name: string; base64: string }[]
  docxHtml: string | null
  docxFilename: string | null
  // Driver (acessório de ensaio — apenas luminária)
  temDriver?: boolean
  driverProduto?: string
  driverFabricante?: string
  driverModelo?: string
  driverIdentificador?: string
  driverPotencia?: string
  driverTensaoAlim?: string
  driverFrequencia?: string
  driverOrcamento?: string
  driverProtocolo?: string
}

export interface LoteConfig {
  tipo: 'lampada' | 'luminaria'
  qtd: number
  cliente: string
  clienteRua: string
  clienteCidade: string
  clienteCep: string
  responsavel: string
  amostras: LoteAmostra[]
  bulkInicio?: string   // período "de todos os ensaios" — persistido p/ sobreviver à navegação
  bulkFim?: string
}

export function getTensoes(cfg: Cispr15Config): string[] {
  if (cfg.tipo === 'luminaria') return ['220V']
  if (cfg.tensaoConfig === '127')         return ['127V']
  if (cfg.tensaoConfig === '127_220_277') return ['127V', '220V', '277V']
  return ['127V', '220V']
}

export const today = () => new Date().toISOString().split('T')[0]

export function newAmostra(): LoteAmostra {
  return {
    produto: '', fabricante: '', modelo: '', identificador: '',
    tensaoAlim: '', potencia: '', frequencia: '60Hz',
    protocolo: '', orcamento: '',
    periodoInicio: today(), periodoFim: today(), dataEmissao: today(),
    conformidade: 'pendente', numRelatorio: '',
    photos: [], docxHtml: null, docxFilename: null,
    temDriver: false,
    driverProduto: '', driverFabricante: '', driverModelo: '', driverIdentificador: '',
    driverPotencia: '', driverTensaoAlim: '', driverFrequencia: '60Hz',
    driverOrcamento: 'Não identificado', driverProtocolo: 'Não identificado',
  }
}

export const DEFAULTS: Cispr15Config = {
  tipo: 'lampada', tensaoConfig: '127_220',
  cliente: '', clienteRua: '', clienteCidade: '', clienteCep: '',
  produto: '', fabricante: '', modelo: '', identificador: '', lacre: '',
  tensaoAlim: '', potencia: '', frequencia: '60Hz',
  temDriver: false,
  driverProduto: '', driverFabricante: '', driverModelo: '', driverIdentificador: '',
  driverPotencia: '', driverTensaoAlim: '', driverFrequencia: '60Hz',
  driverOrcamento: 'Não identificado', driverProtocolo: 'Não identificado',
  documentacao: 'embalagem com especificações',
  numRelatorio: '', orcamento: '', protocolo: '',
  periodoInicio: today(), periodoFim: today(), dataEmissao: today(),
  responsavel: '',
  resultadoConduzida: 'pass', resultadoLoop: 'pass', resultadoAnexoB: 'pass',
}

export interface ClienteDB {
  id: string
  nome: string
  rua: string
  cidade: string
  cep: string
  cnpj: string
}

// localStorage keys
export const CFG_KEY         = 'cispr15_cfg_v3'
export const PHOTOS_KEY      = 'cispr15_photos_v3'
export const DOCX_HTML_KEY   = 'cispr15_docx_html_v3'
export const DOCX_NAME_KEY   = 'cispr15_docx_name_v3'
export const LOTE_KEY        = 'cispr15_lote_v1'
export const CLIENTES_KEY    = 'cispr15_clientes_v1'
export const RELATORIOS_KEY      = 'cispr15_relatorios_v1'
export const EMENDA_DRAFT_KEY    = 'cispr15_emenda_draft_v1'
export const RELATORIO_DOCX_PFX  = 'cispr15_docx_v1_'
export const LOCKED_KEY          = 'cispr15_locked_v1'

/** EMC 1244/2026 + emenda 1 → EMC1244a/2026 */
export function formatEmendaNumero(numRelatorio: string, emendaNum: number): string {
  const letter = String.fromCharCode(96 + Math.min(emendaNum, 26))
  if (!numRelatorio) return `Emenda ${letter}`
  const clean = numRelatorio.replace(/\s+/g, '')
  return clean.includes('/') ? clean.replace('/', `${letter}/`) : `${clean}${letter}`
}

/* Detecta reprovação no relatório Radimation (HTML já parseado pelo parse-docx):
   procura o veredito "Fail" (e variações em PT) ignorando as tags HTML.
   Usado por "Verificar Conformidade" no lote e na emissão unitária. */
export function docxTemFail(html?: string | null): boolean {
  if (!html) return false
  const txt = html.replace(/<[^>]+>/g, ' ')
  return /\bfail\b/i.test(txt) || /\breprovad/i.test(txt) || /n[ãa]o[\s-]+conforme/i.test(txt)
}

export type EnsaioKey = 'conduzida' | 'loop' | 'anexoB'

const ENSAIO_MATCH: Record<EnsaioKey, RegExp> = {
  conduzida: /conduzida|conducted/i,
  loop:      /\bloop\b|radiad/i,
  anexoB:    /anexo\s*b|annex\s*b|insertion loss/i,
}
const ENSAIO_NOME: Record<EnsaioKey, string> = {
  conduzida: 'Emissão Conduzida',
  loop:      'Radiada (Loop)',
  anexoB:    'Anexo B',
}

export interface FailInfo {
  /** Nomes amigáveis dos ensaios reprovados (ex.: "Emissão Conduzida") */
  testes: string[]
  /** Chaves dos ensaios para marcar os status na agenda (statusConduzida/Loop/AnexoB) */
  chaves: EnsaioKey[]
  /** Trechos de texto ao redor de cada "Fail" para o operador localizar a reprovação */
  trechos: string[]
}

/* Localiza ONDE está a reprovação no relatório Radimation (HTML do parse-docx).
   Usa a MESMA segmentação por page-break do docx-filter: quebra o documento em
   seções (uma por ensaio), acha as seções com "Fail" e classifica cada uma em
   Conduzida / Loop / Anexo B. Retorna as chaves para marcar os botões de status. */
export function docxOndeFail(html?: string | null): FailInfo | null {
  if (!html) return null
  const FAIL = /\bfail\b|\breprovad|n[ãa]o[\s-]+conforme/i

  // 1) segmenta em seções por page-break-before (igual ao docx-filter)
  let sections: string[] = []
  try {
    if (typeof DOMParser !== 'undefined') {
      const dom = new DOMParser().parseFromString(html, 'text/html')
      let cur = ''
      for (const child of Array.from(dom.body.children)) {
        const el = child as HTMLElement
        const style = el.getAttribute('style') ?? ''
        if (el.tagName === 'DIV' && /page-break-before\s*:\s*always/i.test(style)) {
          if (cur.trim()) sections.push(cur)
          cur = el.outerHTML
        } else { cur += el.outerHTML }
      }
      if (cur.trim()) sections.push(cur)
    }
  } catch {}
  if (sections.length === 0) sections = [html] // fallback: documento inteiro

  // 2) acha seções com Fail e classifica
  const chaves  = new Set<EnsaioKey>()
  const testes  = new Set<string>()
  const trechos: string[] = []
  for (const sec of sections) {
    const text = sec.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
    if (!FAIL.test(text)) continue
    ;(Object.keys(ENSAIO_MATCH) as EnsaioKey[]).forEach(k => {
      if (ENSAIO_MATCH[k].test(text)) { chaves.add(k); testes.add(ENSAIO_NOME[k]) }
    })
    const idx = text.search(FAIL)
    if (idx >= 0) trechos.push(text.slice(Math.max(0, idx - 70), idx + 45).trim())
  }
  if (trechos.length === 0) return null
  return { testes: [...testes], chaves: [...chaves], trechos: trechos.slice(0, 6) }
}

export interface AmendmentChange {
  marker: number
  campo: string
  descricao: string
  campos?: string[]
}

export interface EmendaDraft {
  relatorioId: string
  numRelatorioOriginal: string
  emendaNum: number
  dataEmenda: string
  alteracoes: AmendmentChange[]
  cfgOriginal: Cispr15Config
  photoNamesOriginal: string[]
  docxFilenameOriginal: string | null
  eutFolderPath?: string
}

export interface RelatorioSalvo {
  id: string
  numRelatorio: string
  dataEmissao: string
  clienteNome: string
  protocolo: string
  produto: string
  cfg: Cispr15Config
  currentCfg?: Cispr15Config
  photos: { name: string; base64: string }[]
  docxFilename: string | null
  emendas: { numero: number; dataEmenda: string; alteracoes: AmendmentChange[]; cfgSnapshot?: Cispr15Config }[]
  eutFolderPath?: string
}

/* ─── configurações do app ─────────────────────────────────────────────────── */

export interface AppSettings {
  excelPath: string
  dataFolder: string
  agendaFolder: string
  pdfCopyFolder: string
  pdfAutoSaveToEut: boolean
  senhaEmissao: string
  updateFolder: string
  certThumbprint: string
  pfxPath: string
  pfxPassword: string
  backupFolder: string
  autoBackup: boolean
}

export const SETTINGS_DEFAULTS: AppSettings = {
  excelPath: '',
  dataFolder: '',
  agendaFolder: '',
  pdfCopyFolder: '',
  pdfAutoSaveToEut: true,
  senhaEmissao: '',
  updateFolder: '',
  certThumbprint: '',
  pfxPath: '',
  pfxPassword: '',
  backupFolder: '',
  autoBackup: true,
}

export interface AgendaItem {
  id: string
  tipo: 'lampada' | 'luminaria'
  protocolo: string
  orcamento: string
  cliente: string
  clienteRua?: string
  clienteCidade?: string
  clienteCep?: string
  produto: string
  fabricante?: string
  modelo?: string
  identificador?: string
  potencia?: string
  tensaoAlim?: string
  frequencia?: string
  documentacao?: string
  // Driver (acessório de ensaio — apenas luminária)
  temDriver?: boolean
  driverProduto?: string
  driverFabricante?: string
  driverModelo?: string
  driverIdentificador?: string
  driverPotencia?: string
  driverTensaoAlim?: string
  driverFrequencia?: string
  driverOrcamento?: string
  driverProtocolo?: string
  dataEntrada: string
  previsaoSaida: string
  dataEmissao: string
  numRelatorio: string
  responsavel: string
  statusConduzida: 'pendente' | 'realizado' | 'reprovado'
  statusLoop: 'pendente' | 'realizado' | 'reprovado'
  statusAnexoB: 'pendente' | 'realizado' | 'reprovado'
  observacoes: string
  pdfPath?: string
  tags?: string[]
  // Cadeia de custódia da amostra (LUM ⇄ EMC)
  entreguePorLum?: string   // entrega: quem entregou (funcionário LUM)
  recebidoPorEmc?: string   // entrega: quem recebeu (funcionário EMC)
  devolvidoPorEmc?: string  // devolução (após emissão): quem entregou (funcionário EMC)
  recebidoPorLum?: string   // devolução (após emissão): quem recebeu (funcionário LUM)
  dataDevolucao?: string    // data da devolução (não necessariamente = data de emissão)
}

export const AGENDA_KEY       = 'cispr15_agenda_v1'
export const EQUIPAMENTOS_KEY = 'cispr15_equipamentos_v1'
export const SESSION_KEY      = 'cispr15_session_v1'
export const AUTH_KEY         = 'cispr15_authed_v1'
export const SETTINGS_KEY     = 'cispr15_app_settings_v1'

export interface EquipamentoSalvo {
  id: string
  tipo: 'lampada' | 'luminaria'
  produto: string
  fabricante: string
  modelo: string
  potencia: string
  tensaoAlim: string
  frequencia: string
  observacoes?: string
}
