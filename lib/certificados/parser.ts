import type { LinhaCertificado } from '@/lib/certificados/tipos'

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(',', '.').trim())
  return isNaN(n) ? null : n
}

function fmtCorrecao(n: number): string {
  return (n >= 0 ? '+' : '') + n.toPrecision(4).replace(/\.?0+$/, '')
}

/** Só a grandeza do cabeçalho, cortando no primeiro traço.
 *  Ex.: "Medição de nível - coaxial 50Ω" → "Medição de nível" */
function soGrandeza(s: string): string {
  return (s || '').split(/\s*[-–—]\s*/)[0].trim()
}

/**
 * Tenta extrair linhas de correção de um texto OCR de certificado de calibração.
 * Suporta múltiplos formatos comuns de certificados (DARE, CHOMA, IMETRO, etc).
 */
/* Casa VR↔MM SEMPRE por colunas de mesma grandeza (unidade entre parênteses).
   A unidade da MM define o ensaio; o erro = VR − MM. Evita o caso de pegar a
   coluna de frequência (GHz/MHz) como VR e subtrair de uma MM em dBm. */
function parsearCertificadoVRMM(linhasRaw: string[]): LinhaCertificado[] {
  const linhas = linhasRaw.map(l => l.replace(/ /g, ' '))
  const reUnidade = /\(([^)]+)\)/
  const ehParam   = (l: string) => /^par[âa]metro\b/i.test(l.trim())
  const ehLegenda = (l: string) =>
    /unidade da grandeza|^\s*UMP\s*[-–]|^\s*UST\s*[-–]|^\s*VR\s*\(unidade|^\s*MM\s*\(unidade|^\s*IM\s*\(unidade/i.test(l)
  const numToken = /[≥≤><≈~]?\s*[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?|[+-]?\d+(?:\.\d+)?/g
  const parseN = (s: string): number | null => {
    let t = String(s).replace(/[≥≤><≈~\s]/g, '')
    if (!t || /^[-—–∞]+$/.test(t)) return null
    if (t.includes(',')) t = t.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
    const n = parseFloat(t)
    return isFinite(n) ? n : null
  }
  const extrairNums = (l: string): { n: number; dec: number }[] => {
    const out: { n: number; dec: number }[] = []
    const m = l.match(numToken)
    if (m) for (const tk of m) { const n = parseN(tk); if (n !== null) { const d = tk.match(/,(\d+)/); out.push({ n, dec: d ? d[1].length : 0 }) } }
    return out
  }
  const near2     = (x: number) => x >= 1.9 && x <= 2.35      // fator k típico (2,00 / 2,07)
  const temLetras = (l: string) => /[a-zA-ZÀ-ÿ]{4,}/.test(l) // linha de rótulo/legenda
  // Linhas de ruído que NÃO são grandeza (cabeçalhos de doc, rodapés, etc.)
  const ehRuido = (t: string) =>
    /^(página|page|\d+\s+de\s+\d+|rnbc|labelo|pucrs|emiss[aã]o|valid|assina|tecni|respond|certif|caracteri|document|procedim|m[eé]todo|norma|rastreab|incert|aprovad|fator\s+de|data\s+de|n[º°]\s*de\s*s[eé]rie|fabricante|modelo|protocolo|tag\s*n|período)/i.test(t)

  // Busca a grandeza olhando para trás a partir de um índice "Parâmetro:"
  // Não herda de outro bloco: para ao encontrar outro "Parâmetro:".
  function grandezaAntesDe(paramIdx: number): string {
    for (let i = paramIdx - 1; i >= Math.max(0, paramIdx - 12); i--) {
      const t = linhas[i].trim()
      if (!t) continue
      if (ehParam(linhas[i])) break        // outro Parâmetro → seção diferente, para
      if (ehLegenda(linhas[i])) continue
      if (ehRuido(t)) continue
      const nDigits = (t.match(/\d/g) || []).length
      if (nDigits > 2) continue            // muitos dígitos → linha de dados/tabela
      if (t.length < 3 || t.length > 100) continue
      return soGrandeza(t)                 // primeira linha "limpa" = cabeçalho da grandeza
    }
    return ''
  }

  const inicios: number[] = []
  const grandezaDe: Record<number, string> = {}
  linhas.forEach((l, i) => { if (ehParam(l)) inicios.push(i) })
  // Associa cada "Parâmetro:" à sua grandeza buscando para trás (sem herança entre blocos)
  for (const ini of inicios) grandezaDe[ini] = grandezaAntesDe(ini)

  const res: LinhaCertificado[] = []
  let pnt = 0
  for (let s = 0; s < inicios.length; s++) {
    const ini = inicios[s]
    let fim = s + 1 < inicios.length ? inicios[s + 1] : linhas.length
    for (let i = ini; i < fim; i++) { if (ehLegenda(linhas[i])) { fim = i; break } }
    const bloco = linhas.slice(ini, fim)
    const parametro = (bloco[0].replace(/^par[âa]metro\s*:?\s*/i, '') || '').trim()
    const grandeza = grandezaDe[ini] || parametro

    // unidade da grandeza (a MM define) — UMP (xxx); evita pegar a freq (GHz/MHz)
    const headerTxt = bloco.slice(0, 14).join(' ')
    const unidMM = (headerTxt.match(/UMP\s*\(([^)]+)\)/i)?.[1]
      || headerTxt.match(/UST\s*\((?!GHz|MHz|kHz|Hz)([^)]+)\)/i)?.[1] || '').trim()

    // dados: ancora no fator k (≈2,00). [freq…, VR, MM, IM, k, veff] →
    //   VR, MM, IM são as 3 colunas antes do k. Erro = VR − MM.
    let buf: { n: number; dec: number }[] = []
    for (let i = 1; i < bloco.length; i++) {
      const raw = bloco[i].trim()
      if (!raw) continue
      const nums = extrairNums(raw)
      if (temLetras(raw) && nums.length < 3) { buf = []; continue } // rótulo/config → reinicia
      if (nums.length === 0) continue
      buf.push(...nums)
      let kIdx = -1
      if (buf.length >= 1 && near2(buf[buf.length - 1].n)) kIdx = buf.length - 1
      else if (buf.length >= 2 && near2(buf[buf.length - 2].n)) kIdx = buf.length - 2
      if (kIdx >= 3) {
        const vr = buf[kIdx - 3].n, mm = buf[kIdx - 2].n, im = buf[kIdx - 1].n
        if (isFinite(vr) && isFinite(mm)) {
          pnt++
          // alinha MM e correção ao nº de casas decimais do VR (mesma grandeza)
          const casas = Math.max(buf[kIdx - 3].dec, buf[kIdx - 2].dec)
          const corr = vr - mm
          res.push({
            ponto: pnt,
            grandeza,
            unidade: unidMM,
            valorNominal: vr.toFixed(casas),
            valorIndicado: mm.toFixed(casas),
            correcao: (corr >= 0 ? '+' : '') + corr.toFixed(casas),
            incertezaExpandida: isFinite(im) ? `±${im}` : '',
            fatorCobertura: 2,
          })
        }
        buf = []
      } else if (buf.length > 10) { buf = [] }
    }
  }
  return res
}

export function parsearCertificado(texto: string): LinhaCertificado[] {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const resultado: LinhaCertificado[] = []

  // ── Estratégia 0 (prioritária): formato LABELO/RNBC com colunas VR/MM e
  //    unidade entre parênteses — casa VR e MM pela mesma grandeza. ─────────
  const vrmm = parsearCertificadoVRMM(texto.split(/\r?\n/))
  if (vrmm.length > 0) return vrmm

  // ── Estratégia 1: formato tabulado com marcadores Python (# GRANDEZA / # PARAM / # HEADERS) ──
  const hasMarkers = linhas.some(l => l.startsWith('# GRANDEZA:') || l.startsWith('# PARAM:') || l.startsWith('# HEADERS:'))
  if (hasMarkers) {
    let curGrandeza = ''
    let curParam    = ''
    let vrIdx = -1, mmIdx = -1, imIdx = -1
    let freqBased   = false   // col[0] é frequência (ex: (MHz)) → usar como nominal
    let ponto = 0

    const parseNum2 = (s: string) => {
      // Remove operadores de comparação (≥13,8 → 13,8) e caracteres especiais
      const t = s.trim().replace(/\s+/g,'').replace(/^[≥>≤<≈~]/,'')
      if (!t || t==='-' || t==='—' || t==='∞') return NaN
      if (t.includes(',')) return parseFloat(t.replace(/\./g,'').replace(',','.'))
      return parseFloat(t)
    }

    for (const linha of linhas) {
      if (linha.startsWith('# GRANDEZA:')) { curGrandeza = soGrandeza(linha.slice('# GRANDEZA:'.length)); continue }
      if (linha.startsWith('# PARAM:'))    { curParam    = linha.slice('# PARAM:'.length).trim();    continue }
      if (linha.startsWith('# HEADERS:')) {
        const cols = linha.slice('# HEADERS:'.length).trim().split('\t').map(s => s.trim())
        mmIdx = cols.findIndex(c => /\bUMP\b/i.test(c))
        vrIdx = mmIdx > 0 ? cols.slice(0, mmIdx).reduceRight((f,c,i) => f>=0?f:/\bUST\b/i.test(c)?i:-1, -1) : -1
        imIdx = mmIdx >= 0 && mmIdx+1 < cols.length ? mmIdx+1 : -1
        // fallback se não detectou col VR/MM
        if (vrIdx < 0 || mmIdx < 0) { vrIdx = 1; mmIdx = 2; imIdx = 3 }
        // col[0] é unidade de frequência (MHz/GHz/kHz/Hz) → dados baseados em frequência
        freqBased = cols.length > 0 && /^\([a-zA-Z]*[hH]z\)$/i.test(cols[0].trim())
        continue
      }
      if (linha.startsWith('#')) continue
      if (!linha.includes('\t')) continue

      const cols = linha.split('\t')
      const freqNum = freqBased ? parseNum2(cols[0] ?? '') : NaN
      const vr = parseNum2(cols[vrIdx] ?? '')
      const mm = parseNum2(cols[mmIdx] ?? '')
      if (freqBased ? (!isFinite(freqNum) || !isFinite(mm)) : (!isFinite(vr) || !isFinite(mm))) continue

      ponto++
      // Quando baseado em frequência: nominal=freq, correcao=UMP (valor medido na freq)
      // Caso típico: nominal=VR, correcao=VR-MM
      const nominalNum = freqBased ? freqNum : vr
      const correcaoNum = freqBased ? mm : parseFloat((vr - mm).toPrecision(10))
      const im = imIdx >= 0 ? parseNum2(cols[imIdx] ?? '') : NaN
      resultado.push({
        ponto,
        grandeza: curGrandeza || curParam,
        unidade: '',
        valorNominal: String(nominalNum),
        valorIndicado: String(mm),
        correcao: fmtCorrecao(correcaoNum),
        incertezaExpandida: isFinite(im) ? `±${im}` : '',
        fatorCobertura: 2,
      })
    }
    if (resultado.length > 0) return resultado
  }

  // ── Estratégia 2: detectar tabela com cabeçalho típico ──────────────────
  let dentroTabela = false
  let colCorrecao  = -1
  let colNominal   = -1
  let colIndicado  = -1
  let colIncerteza = -1
  let curGrandeza2 = ''
  let ponto = 0

  for (const linha of linhas) {
    const norm = linha.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

    if (!dentroTabela && (norm.includes('corre') || norm.includes('correction'))) {
      const colunas = linha.split(/\s{2,}|\t/).map(c => c.trim())
      colCorrecao  = colunas.findIndex(c => /corre/i.test(c.normalize('NFD').replace(/[̀-ͯ]/g, '')))
      colNominal   = colunas.findIndex(c => /nominal|padr|refer|vr\b/i.test(c.normalize('NFD').replace(/[̀-ͯ]/g, '')))
      colIndicado  = colunas.findIndex(c => /indic|lido|mm\b|medid/i.test(c.normalize('NFD').replace(/[̀-ͯ]/g, '')))
      colIncerteza = colunas.findIndex(c => /incert|U\b|uc\b/i.test(c))
      if (colCorrecao >= 0) { dentroTabela = true; continue }
    }

    if (dentroTabela) {
      const colunas = linha.split(/\s{2,}|\t/).map(c => c.trim())
      const nums = colunas.map(parseNum)
      const numCount = nums.filter(n => n !== null).length
      if (numCount < 2) {
        if (/[a-zA-ZÀ-ÿ]{4}/.test(linha) && !norm.includes('unid') && numCount === 0)
          curGrandeza2 = linha
        continue
      }

      ponto++
      const correcaoVal = colCorrecao >= 0 ? parseNum(colunas[colCorrecao] ?? '') : null
      const nominalVal  = colNominal  >= 0 ? parseNum(colunas[colNominal]  ?? '') : null
      const indicadoVal = colIndicado >= 0 ? parseNum(colunas[colIndicado] ?? '') : null
      const incerteza   = colIncerteza >= 0 ? (colunas[colIncerteza] ?? '') : ''
      const correcao = correcaoVal ?? (
        nominalVal !== null && indicadoVal !== null ? nominalVal - indicadoVal : null
      )

      resultado.push({
        ponto,
        grandeza: curGrandeza2,
        unidade: '',
        valorNominal:  nominalVal !== null ? String(nominalVal) : (colunas[colNominal] ?? ''),
        valorIndicado: indicadoVal !== null ? String(indicadoVal) : (colunas[colIndicado] ?? ''),
        correcao: correcao !== null ? fmtCorrecao(correcao) : '',
        incertezaExpandida: incerteza,
        fatorCobertura: 2,
      })
    }
  }

  if (resultado.length > 0) return resultado

  // ── Estratégia 2: linha a linha buscando padrão "número ± número" ────────
  // Ex: "10 V  9.998  +0.002  ±0.005"
  const reValores = /([+-]?\d+[,.]?\d*(?:[eE][+-]?\d+)?)/g
  ponto = 0
  for (const linha of linhas) {
    const norm = linha.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    if (norm.includes('corre') || norm.includes('padr') || norm.includes('incert')) continue
    const nums = [...linha.matchAll(reValores)].map(m => parseFloat(m[1].replace(',', '.')))
    if (nums.length >= 3) {
      ponto++
      // Assume: [nominal, indicado, correção, incerteza]
      // Ou: [nominal, correção, incerteza]
      let nominalVal: number, indicadoVal: number | null = null, correcaoVal: number, incVal: number
      if (nums.length >= 4) {
        [nominalVal, indicadoVal, correcaoVal, incVal] = [nums[0], nums[1], nums[2], nums[3]]
      } else {
        [nominalVal, correcaoVal, incVal] = [nums[0], nums[1], nums[2]]
      }
      resultado.push({
        ponto,
        grandeza: '',
        unidade: '',
        valorNominal:  String(nominalVal),
        valorIndicado: indicadoVal !== null ? String(indicadoVal) : '',
        correcao: fmtCorrecao(correcaoVal!),
        incertezaExpandida: incVal !== undefined ? `±${incVal}` : '',
        fatorCobertura: 2,
      })
    }
  }

  return resultado
}

export interface DadosPadrao {
  nome?: string
  fabricante?: string
  modelo?: string
  serie?: string
  tag?: string
  protocolo?: string
  numeroCertificado?: string
  labCalibracao?: string
  ultimaCalibracao?: string  // ISO yyyy-mm-dd (data final do período)
  procedimentos?: string[]   // códigos PC do certificado (ex.: "PC R04") → casa a IT
}

// Letras LABELO válidas para número de certificado: E F R T L V P B J Q A
const LETRAS_CERT_LABELO = 'EFRTLVPBJQA'
const RE_CERT_LABELO = new RegExp(`^[${LETRAS_CERT_LABELO}]\\d{3,5}\\/\\d{4}$`)

/** Retorna true se o número de certificado é um certificado LABELO válido. */
export function certLabeLoValido(num: string): boolean {
  return RE_CERT_LABELO.test((num || '').toUpperCase().trim())
}

/** Retorna true se o texto do PDF parece ser um formulário (FOR 6400/6401/etc.) e NÃO um certificado. */
export function ehFormularioNaoCertificado(texto: string): boolean {
  return /\bFOR\s*6[34]\d{2}\b/i.test(texto)
}

// Limites máx de chars para campos extraídos por OCR (se exceder → garbage → undefined)
const MAX = { nome: 80, fabricante: 60, modelo: 40, serie: 30, tag: 15, protocolo: 20, cert: 12 }

function limitado(v: string | undefined, max: number): string | undefined {
  if (!v) return undefined
  return v.length > max ? undefined : v
}

/* Extrai os dados do PADRÃO da 1ª página do certificado (bloco "Características
   da Unidade Sob Teste"): Nome, Fabricante, Modelo, Nº de Série, TAG, Protocolo,
   período de calibração. Usado para pré-preencher o cadastro de equipamento. */
export function parsearDadosPadrao(texto: string): DadosPadrao {
  const t = texto.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
  // Corrige rótulos quebrados pelo OCR (ex.: "Protoc olo" → "Protocolo")
  const tn = t
    .replace(/Protoc\s*olo/gi, 'Protocolo')
    .replace(/Fabric\s*ante/gi, 'Fabricante')
    .replace(/Proced\s*imento/gi, 'Procedimento')
    .replace(/Caracter\s*[íi]sticas/gi, 'Características')
  const token = (re: RegExp): string | undefined => { const m = tn.match(re); return m?.[1]?.trim() || undefined }
  // termina no PRÓXIMO rótulo — PREFIXOS (robusto a splits) + marcador genérico "Nº:"
  const STOP = '(?:Protoc|Fabric|Modelo|TAG|Procedim|M[ée]todo|Padr|Nome|Caracter|Certificad|N[º°o]?\\s*de\\s*S[ée]rie|N[º°o]\\s*:)'
  const campo = (label: string): string | undefined => {
    // fronteira ANTES do STOP (prefixos como "Protoc" casam no início de "Protocolo")
    const m = tn.match(new RegExp(label + '\\s*:?\\s*(.+?)\\s+' + STOP, 'i'))
    const v = m?.[1]?.trim().replace(/[•\-–:\s]+$/, '').trim()
    return v || undefined
  }

  const nome       = limitado(campo('\\bNome'), MAX.nome)
  const fabricante = limitado(campo('\\bFabricante'), MAX.fabricante)
  const modelo     = limitado(campo('\\bModelo'), MAX.modelo)
  const serie      = limitado(token(/\bN[º°o]?\s*de\s*S[ée]rie\s*:?\s*([A-Za-z0-9.\-/]+)/i), MAX.serie)
  const protocolo  = limitado(token(/\bProtocolo\s*N?[º°o.]*\s*:?\s*([A-Za-z0-9.\-/]+)/i), MAX.protocolo)
  // TAG: pega o número + sufixo de exatamente 3 letras (ex.: "3217 EMC" → "3217EMC")
  const tagRaw = (token(/\bTAG\s*N?[º°o.]*\s*:?\s*(\d+\s*[A-Za-z]{3})\b/i)
    ?? token(/\bTAG\s*N?[º°o.]*\s*:?\s*([A-Za-z0-9]+)/i))?.replace(/\s+/g, '')
  const tag = limitado(tagRaw, MAX.tag)
  const labCalibracao = /LABELO/i.test(t) ? 'LABELO/PUCRS' : undefined

  // número do certificado: "Certificado de Calibração Nº X0000/20XX" (o próprio).
  // Só aceita letras LABELO válidas (EFRTLVPBJQA) + 4 dígitos + /ano.
  // Senão, o ÚLTIMO padrão encontrado na página.
  let numeroCertificado: string | undefined
  const reLabelo = new RegExp(`[${LETRAS_CERT_LABELO}]\\d{3,5}\\/\\d{4}`, 'gi')
  const cm = t.match(new RegExp(`Certificado de Calibra[çc][ãa]o\\s*N[º°o]?\\s*([${LETRAS_CERT_LABELO}]\\d{3,5}\\/\\d{4})`, 'i'))
  if (cm) numeroCertificado = cm[1].toUpperCase()
  else { const all = t.match(reLabelo); if (all?.length) numeroCertificado = all[all.length - 1].toUpperCase() }
  if (numeroCertificado && !certLabeLoValido(numeroCertificado)) numeroCertificado = undefined

  // DATA (só a data, sem texto): período de calibração (última) → data de
  // calibração → data de emissão → primeira data dd/mm/aaaa encontrada.
  const isoFrom = (d?: string) => { if (!d) return undefined; const [dd, mm, yy] = d.split('/'); return `${yy}-${mm}-${dd}` }
  let dataStr: string | undefined
  const per = t.match(/Per[íi]odo de calibra[çc][ãa]o[^0-9]{0,30}(\d{2}\/\d{2}\/\d{4})(?:[^0-9]{0,8}(\d{2}\/\d{2}\/\d{4}))?/i)
  if (per) dataStr = per[2] || per[1]
  if (!dataStr) dataStr = token(/data\s+d[ae]\s+calibra[çc][ãa]o[^0-9]{0,30}(\d{2}\/\d{2}\/\d{4})/i)
  if (!dataStr) dataStr = token(/(?:data\s+de\s+)?emiss[ãa]o[^0-9]{0,30}(\d{2}\/\d{2}\/\d{4})/i)
  if (!dataStr) dataStr = token(/(\d{2}\/\d{2}\/\d{4})/)
  const ultimaCalibracao = isoFrom(dataStr)

  // Procedimentos de calibração referenciados (ex.: "PC R04", "PC E02") →
  // normaliza para "PC <Letra><NN>" e remove duplicados. Casa com o codigo da IT/PC.
  const procedimentos = (() => {
    const set = new Set<string>()
    const re = /\bPC\s+([A-Za-z])\.?\s*(\d{1,3})\b/g
    let m: RegExpExecArray | null
    while ((m = re.exec(tn)) !== null) {
      set.add(`PC ${m[1].toUpperCase()}${m[2].padStart(2, '0')}`)
    }
    return set.size ? [...set] : undefined
  })()

  return { nome, fabricante, modelo, serie, tag, protocolo, numeroCertificado, labCalibracao, ultimaCalibracao, procedimentos }
}

/**
 * Extrai metadados básicos do certificado (número, laboratório, data).
 */
export function parsearMetadadosCertificado(texto: string): {
  numero: string; laboratorio: string; dataEmissao: string
} {
  const linhas = texto.split(/\r?\n/)
  let numero = '', laboratorio = '', dataEmissao = ''

  for (const linha of linhas) {
    const norm = linha.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

    if (!numero && (norm.includes('certificado') || norm.includes('certificate') || norm.includes('n°') || norm.includes('n.') || norm.includes('nr') || norm.includes('n.'))) {
      const reL = new RegExp(`[${LETRAS_CERT_LABELO}]\\d{3,5}[-\\/]\\d{4}`, 'i')
      const m = linha.match(reL)
      if (m) { const v = m[0].replace(/\s+/g, '').toUpperCase(); if (certLabeLoValido(v) && v.length <= MAX.cert) numero = v }
    }

    if (!laboratorio && (norm.includes('laborat') || norm.includes('lab ') || norm.includes('rnbc') || norm.includes('labelo'))) {
      // Pega o primeiro segmento antes de " - " ou ":" (ex: "LABELO - Laboratórios...")
      const parts = linha.split(/\s[-–]\s|:\s/).map(s => s.trim()).filter(s => s.length > 2)
      laboratorio = (parts[0] || '')
        .replace(/\s*p[áa]gina\s+\d+\s+de\s+\d+.*/i, '')   // remove rodapé "Página X de Y"
        .replace(/\s{2,}.*/, '')                            // corta colunas grudadas (2+ espaços)
        .trim()
    }

    if (!dataEmissao) {
      const dateM = linha.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
      if (dateM && (norm.includes('emiss') || norm.includes('data') || norm.includes('date') || norm.includes('period') || norm.includes('calibr'))) {
        const [, d, m, y] = dateM
        dataEmissao = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
      }
    }
  }

  return { numero, laboratorio, dataEmissao }
}
