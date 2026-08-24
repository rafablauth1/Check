export interface Cispr15Config {
  tipo: 'lampada' | 'luminaria'
  tensaoConfig: '127' | '220' | '127_220' | '127_220_277'
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
  lacre?: string
  // Config de ensaio da amostra (só lâmpada) — um lote pode misturar lâmpadas
  // bivolt (127+220V) com lâmpadas de uma tensão só (127 ou 220V), por isso é
  // por amostra, não do lote inteiro. Sem valor = '127_220' (padrão).
  tensaoConfig?: Cispr15Config['tensaoConfig']
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
  id: string
  orcamento: string
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
  if (cfg.tensaoConfig === '220')         return ['220V']
  if (cfg.tensaoConfig === '127_220_277') return ['127V', '220V', '277V']
  return ['127V', '220V']
}

export const TENSAO_CONFIG_MAX: Record<Cispr15Config['tensaoConfig'], number> = {
  '127': 127, '220': 220, '127_220': 220, '127_220_277': 277,
}

/** Maior tensão (V) mencionada em um texto livre, ex.: "90 a 305VAC" → 305.
    Restrito à faixa típica de alimentação AC (90–350V, cobre drivers universais
    tipo 100-305VAC) p/ não pegar potência/frequência junto. */
export function extrairTensaoMaxima(texto: string): number | null {
  const nums = (texto.match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map(n => parseFloat(n.replace(',', '.')))
    .filter(n => n >= 90 && n <= 350)
  return nums.length ? Math.max(...nums) : null
}

/* Compara a tensão de alimentação declarada do DUT (ex.: "90 a 305VAC") com a
   configuração de ensaio escolhida (127 / 127+220 / 127+220+277). Só acusa
   quando a declarada chega a 277V e o ensaio está configurado só até 220V —
   não existe tensão de ensaio intermediária entre 220 e 277, então um valor
   declarado tipo 240V (config. até 220V) não é motivo de aviso.
   Só se aplica a lâmpadas — luminárias são sempre ensaiadas fixas em 220V. */
export function tensaoDeclaradaExcedeEnsaio(cfg: Cispr15Config): number | null {
  if (cfg.tipo !== 'lampada') return null
  const max = extrairTensaoMaxima(cfg.tensaoAlim)
  if (max === null) return null
  return max >= 277 && TENSAO_CONFIG_MAX[cfg.tensaoConfig] <= 220 ? max : null
}

export const today = () => new Date().toISOString().split('T')[0]

export function newAmostra(): LoteAmostra {
  return {
    produto: '', fabricante: '', modelo: '', identificador: '', lacre: '',
    tensaoConfig: '127_220',
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

/* ─── validação das seções de medição do Radimation ─────────────────────────
   Cada página do docx (div com page-break-before) é uma medição: Conduzida
   (LISN: Line 1 / LISN: Neutral — a tensão só aparece no título da página do
   Line 1, a do Neutral vem "muda" logo em seguida), Loop A/B/C (radiada 9kHz–
   30MHz — só o Loop A tem o título com a tensão) ou Anexo B (radiada 30MHz–
   300MHz — sempre título próprio, 1 página só). */
interface PaginaRadimation {
  categoria: 'conduzida' | 'loop' | 'anexoB'
  subtipo: string        // 'Line 1' | 'Neutral' | 'A' | 'B' | 'C' | ''
  tensao: string | null  // ex.: "127"
  linhas: string[][] | null  // linhas da tabela de picos (null = "Nenhum pico detectado")
}

function rotuloPagina(p: PaginaRadimation): string {
  if (p.categoria === 'conduzida') return `Conduzida ${p.tensao}V (${p.subtipo})`
  if (p.categoria === 'loop')      return `Loop ${p.subtipo} ${p.tensao}V`
  return `Anexo B ${p.tensao}V`
}

export function classificarPaginasRadimation(html: string): PaginaRadimation[] {
  const out: PaginaRadimation[] = []
  try {
    const dom = new DOMParser().parseFromString(html, 'text/html')
    let tensaoConduzida: string | null = null
    let tensaoLoop: string | null = null
    dom.querySelectorAll('div').forEach(div => {
      if (!(div.getAttribute('style') ?? '').includes('page-break-before')) return
      // textContent gruda elementos vizinhos sem espaço (ex.: "127 VLoop A"), o que
      // quebra os regex com \b abaixo — troca tags por espaço, igual ao docxOndeFail.
      const text = div.innerHTML.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()

      const mConduzida = text.match(/tens[õo]es de perturba[çc][ãa]o conduzidas.*?em\s*(\d+)\s*v/i)
      if (mConduzida) tensaoConduzida = mConduzida[1]
      const mLoop = text.match(/radiadas na faixa de 9\s*khz a 30\s*mhz em\s*(\d+)\s*v/i)
      if (mLoop) tensaoLoop = mLoop[1]
      const mAnexoB = text.match(/radiadas na faixa de 30\s*mhz a 300\s*mhz em\s*(\d+)\s*v/i)

      let categoria: PaginaRadimation['categoria'] | null = null
      let subtipo = ''
      let tensao: string | null = null
      if (/LISN:\s*Line\s*1/i.test(text))     { categoria = 'conduzida'; subtipo = 'Line 1'; tensao = tensaoConduzida }
      else if (/LISN:\s*Neutral/i.test(text)) { categoria = 'conduzida'; subtipo = 'Neutral'; tensao = tensaoConduzida }
      else if (/\bLoop\s*A\b/i.test(text))    { categoria = 'loop'; subtipo = 'A'; tensao = tensaoLoop }
      else if (/\bLoop\s*B\b/i.test(text))    { categoria = 'loop'; subtipo = 'B'; tensao = tensaoLoop }
      else if (/\bLoop\s*C\b/i.test(text))    { categoria = 'loop'; subtipo = 'C'; tensao = tensaoLoop }
      else if (mAnexoB)                       { categoria = 'anexoB'; tensao = mAnexoB[1] }
      if (!categoria) return // página não reconhecida (capa, resumo, etc.) — ignora

      let linhas: string[][] | null = null
      if (!/nenhum pico detectado/i.test(text)) {
        const table = div.querySelector('table')
        if (table) {
          linhas = Array.from(table.querySelectorAll('tr'))
            .filter(tr => tr.querySelector('td'))
            .map(tr => Array.from(tr.querySelectorAll('td')).map(td => (td.textContent ?? '').trim()))
        }
      }
      out.push({ categoria, subtipo, tensao, linhas })
    })
  } catch {}
  return out
}

/** Tensões (ex.: "220") que aparecem com resultado de medição no docx —
    usado pra cruzar com a tensão de alimentação declarada da amostra. */
export function docxTensoesTestadas(html?: string | null): Set<string> {
  if (!html) return new Set()
  return new Set(
    classificarPaginasRadimation(html).map(p => p.tensao).filter((t): t is string => !!t)
  )
}

/* Valida as regras de revisão do relatório Radimation:
   - Conduzida: exatamente 1 "Line 1" + 1 "Neutral" por tensão (nunca 2 de um e 0 do outro).
   - Loop: exatamente 1 A + 1 B + 1 C por tensão (3 no total).
   - Anexo B: exatamente 1 por tensão.
   - Gráfico/tabela de picos idêntico entre duas páginas diferentes (mesmas linhas,
     mesmos picos) — sinal de que a mesma medição foi colada duas vezes no Radimation.
     Páginas "Nenhum pico detectado" ficam de fora dessa comparação (não tem o que
     conferir quando não há pico nenhum).
   `tensoes` vem de getTensoes(cfg), ex.: ["127V", "220V"]. */
export function validarSecoesRadimation(html: string, tensoes: string[]): string[] {
  const paginas = classificarPaginasRadimation(html)
  const erros: string[] = []

  for (const tv of tensoes) {
    const t = tv.replace(/\s*v$/i, '')
    const conduzida = paginas.filter(p => p.categoria === 'conduzida' && p.tensao === t)
    const line1   = conduzida.filter(p => p.subtipo === 'Line 1').length
    const neutral = conduzida.filter(p => p.subtipo === 'Neutral').length
    if (line1 !== 1 || neutral !== 1)
      erros.push(`Conduzida ${tv}: ${line1}× Line 1 e ${neutral}× Neutral — tem que ser exatamente 1 de cada`)

    const loop = paginas.filter(p => p.categoria === 'loop' && p.tensao === t)
    const a = loop.filter(p => p.subtipo === 'A').length
    const b = loop.filter(p => p.subtipo === 'B').length
    const c = loop.filter(p => p.subtipo === 'C').length
    if (a !== 1 || b !== 1 || c !== 1)
      erros.push(`Loop ${tv}: ${a}× A, ${b}× B, ${c}× C — tem que ser exatamente 1 de cada (3 no total)`)

    const anexoB = paginas.filter(p => p.categoria === 'anexoB' && p.tensao === t).length
    if (anexoB !== 1)
      erros.push(`Anexo B ${tv}: ${anexoB} seção(ões) — tem que ser exatamente 1`)
  }

  const comPico = paginas.filter(p => p.linhas && p.linhas.length > 0)
  for (let i = 0; i < comPico.length; i++) {
    for (let j = i + 1; j < comPico.length; j++) {
      const A = comPico[i], B = comPico[j]
      if (A.linhas!.length !== B.linhas!.length) continue
      if (A.linhas![0]?.length !== B.linhas![0]?.length) continue
      if (JSON.stringify(A.linhas) === JSON.stringify(B.linhas))
        erros.push(`Picos idênticos entre ${rotuloPagina(A)} e ${rotuloPagina(B)} — confira se não foi colado duas vezes no Radimation`)
    }
  }

  return erros
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
  certificadoPdfPath?: string
  certificadoPdfNome?: string
}

/* ─── configurações do app ─────────────────────────────────────────────────── */

export interface AppSettings {
  excelPath: string
  dataFolder: string
  agendaFolder: string
  cadastrosFolder: string
  mirrorFolder: string
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
  cadastrosFolder: '',
  mirrorFolder: '',
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
  lacre?: string
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
  recebimentoEmcOk?: boolean // ida: quem recebeu (EMC) confirmou o recebimento da amostra
  recebimentoLumOk?: boolean // volta: quem recebeu (LUM) confirmou o recebimento da amostra
  // Devolução antecipada da amostra (antes da emissão do relatório) — para colega de outro setor
  devolucaoAntecipada?: boolean        // ativa o registro da devolução antecipada
  dataDevolucaoAntecipada?: string     // data em que a amostra foi devolvida antecipadamente
  entreguePorEmcAntecipado?: string    // quem entregou (funcionário EMC)
  recebidoPorAntecipado?: string       // colega do outro setor que recebeu a amostra
  setorDestinoAntecipado?: string      // setor/área de destino (opcional)
  recebimentoAntecipadoOk?: boolean    // confirmação do recebimento pelo colega do outro setor
  assinadoEm?: string        // data (ISO) em que o relatório foi assinado → status "Concluído"
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
