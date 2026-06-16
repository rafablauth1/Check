/**
 * Motor de interpolação para correções de certificados de calibração.
 *
 * Suporta:
 *   - Interpolação linear simples (1 eixo: valor nominal × correção)
 *   - Interpolação bilinear (2 eixos: ex. frequência × nível → correção)
 *
 * Extrapolação: usa os valores extremos (clamping), não extrapola.
 */

export interface PontoCalibracaoSimples {
  valorNominal: number  // valor do eixo (ex: tensão, frequência)
  correcao: number
  incerteza?: number
}

export interface PontoCalibracao2D {
  eixo1: number
  eixo2: number
  correcao: number
  incerteza?: number
  grandeza?: string
  tabela?: string
  eixo1Unidade?: string
  eixo2Unidade?: string
  eixo1b?: number
  eixo1bUnidade?: string
  eixo1bNome?: string
  vr?: number
  mmVal?: number
  vrUnidade?: string
  casas?: number       // nº de casas decimais do VR (para alinhar MM e correção)
  minSpec?: boolean    // parâmetro de mínimo (reflexão / perda de retorno / atenuação)
  apto?: boolean       // em minSpec: MM ≥ VR → equipamento atende
}

/** Clamp de valor dentro de um intervalo */
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

/** Extrai só a grandeza do cabeçalho, cortando no primeiro traço.
 *  Ex.: "Medição de nível - coaxial 50Ω" → "Medição de nível" */
function soGrandeza(s: string): string {
  return (s || '').split(/\s*[-–—]\s*/)[0].trim()
}

/**
 * Interpolação linear entre dois pontos conhecidos.
 * Se x estiver fora do intervalo, usa o extremo mais próximo (sem extrapolação).
 */
export function interpolarLinear(
  x: number,
  pontos: PontoCalibracaoSimples[]
): number | null {
  if (!pontos.length) return null

  const sorted = [...pontos].sort((a, b) => a.valorNominal - b.valorNominal)

  // Fora do intervalo — usa extremo
  if (x <= sorted[0].valorNominal) return sorted[0].correcao
  if (x >= sorted[sorted.length - 1].valorNominal) return sorted[sorted.length - 1].correcao

  // Encontra o par vizinho
  for (let i = 0; i < sorted.length - 1; i++) {
    const p0 = sorted[i], p1 = sorted[i + 1]
    if (x >= p0.valorNominal && x <= p1.valorNominal) {
      const t = (x - p0.valorNominal) / (p1.valorNominal - p0.valorNominal)
      return p0.correcao + t * (p1.correcao - p0.correcao)
    }
  }

  return null
}

/**
 * Interpolação bilinear numa grade 2D.
 *
 * Algoritmo:
 *   1. Para cada valor único de eixo1 que envolve x1: interpola ao longo de eixo2 → valor intermediário
 *   2. Interpola os dois valores intermediários ao longo de eixo1 → correção final
 *
 * Se (x1, x2) estiver fora da grade, usa os extremos (sem extrapolação).
 */
export function interpolarBilinear(
  x1: number,
  x2: number,
  pontos: PontoCalibracao2D[]
): number | null {
  if (!pontos.length) return null

  // Eixos únicos ordenados
  const vals1 = [...new Set(pontos.map(p => p.eixo1))].sort((a, b) => a - b)
  const vals2 = [...new Set(pontos.map(p => p.eixo2))].sort((a, b) => a - b)

  if (!vals1.length || !vals2.length) return null

  // Clamp x1 e x2 dentro da grade
  const cx1 = clamp(x1, vals1[0], vals1[vals1.length - 1])
  const cx2 = clamp(x2, vals2[0], vals2[vals2.length - 1])

  // Acha os dois valores de eixo1 que envolvem cx1
  let i1lo = 0, i1hi = vals1.length - 1
  for (let i = 0; i < vals1.length - 1; i++) {
    if (cx1 >= vals1[i] && cx1 <= vals1[i + 1]) { i1lo = i; i1hi = i + 1; break }
  }

  // Para cada um dos dois valores de eixo1, interpola ao longo de eixo2
  function interpEixo2(e1val: number): number | null {
    const row = pontos
      .filter(p => p.eixo1 === e1val)
      .sort((a, b) => a.eixo2 - b.eixo2)
    if (!row.length) return null
    return interpolarLinear(cx2, row.map(p => ({ valorNominal: p.eixo2, correcao: p.correcao })))
  }

  const c_lo = interpEixo2(vals1[i1lo])
  const c_hi = interpEixo2(vals1[i1hi])

  if (c_lo === null || c_hi === null) return null

  // Se os dois extremos de eixo1 são iguais (ponto exato), retorna direto
  if (vals1[i1lo] === vals1[i1hi]) return c_lo

  const t = (cx1 - vals1[i1lo]) / (vals1[i1hi] - vals1[i1lo])
  return c_lo + t * (c_hi - c_lo)
}

/**
 * Extrai valores únicos de eixo1 e eixo2 de uma lista de pontos 2D.
 * Útil para montar a visualização da grade.
 */
export function extrairGrade(pontos: PontoCalibracao2D[]): {
  eixo1Vals: number[]
  eixo2Vals: number[]
  grade: Record<string, number | undefined>  // chave: "e1_e2"
} {
  const eixo1Vals = [...new Set(pontos.map(p => p.eixo1))].sort((a, b) => a - b)
  const eixo2Vals = [...new Set(pontos.map(p => p.eixo2))].sort((a, b) => a - b)
  const grade: Record<string, number | undefined> = {}
  for (const p of pontos) grade[`${p.eixo1}_${p.eixo2}`] = p.correcao
  return { eixo1Vals, eixo2Vals, grade }
}

/**
 * Parser específico para certificados RBC/LABELO (formato ABNT NBR ISO/IEC 17025).
 *
 * Suporta formato tabulado com marcadores (#) e fallback heurístico por token stream.
 */
export function parsearCertificadoRBC(texto: string): {
  pontos: PontoCalibracao2D[]
  eixo1Nome: string; eixo1Unidade: string
  eixo2Nome: string; eixo2Unidade: string
  equipamentoTag: string; numeroCert: string
} {
  const linhas = texto.split(/\r?\n/)

  const tagM  = texto.match(/TAG[:\s]+([A-Z0-9]{4,10}EMC)/i) ?? texto.match(/\b(\d{4}EMC)\b/i)
  const certM = texto.match(/N[°º]\s*(R\d{4}\/\d{4})/i)      ?? texto.match(/(R\d{4}[/-]\d{4})/i)
  const equipamentoTag = tagM?.[1]?.toUpperCase() ?? ''
  const numeroCert     = certM?.[1] ?? ''

  // --- Formato tabulado com marcadores (saída do extrator Python) ---
  const hasMarkers = linhas.some(l => l.startsWith('#'))
  if (hasMarkers) {
    const pontos: PontoCalibracao2D[] = []
    let tabelaAtual = ''
    let curGrandeza = ''
    let curEixo1Nome = 'Frequência', curEixo1Unidade = ''
    let curEixo2Nome = 'Nível',      curEixo2Unidade = ''
    let curEixo1bNome = '',          curEixo1bUnidade = ''
    let curVrUnidade = ''
    let eixo1bIdx = -1
    let firstEixo1Unidade = '', firstEixo2Unidade = ''
    let vrIdx = -1, mmIdx = -1, eixo2Idx = -1, imIdx = -1, is1D = false

    const extractCol = (h: string) => ({
      nome:    h.replace(/\s*\([^)]*\).*/, '').trim(),
      unidade: (h.match(/\(([^)]+)\)/) ?? [])[1]?.trim() ?? '',
    })

    const parseNum = (s: string): number => {
      const t = s.trim().replace(/\s+/g, '')
      if (!t || t === '∞' || t === '-' || t === '—') return NaN
      if (t.includes(','))
        return parseFloat(t.replace(/\./g, '').replace(',', '.'))
      if ((t.match(/\./g) ?? []).length > 1)
        return parseFloat(t.replace(/\./g, ''))
      return parseFloat(t)
    }

    const detectColMap = (hCols: string[]) => {
      const parsed = hCols.map(extractCol)
      const mm = parsed.findIndex(c => /\bUMP\b/i.test(c.nome))
      if (mm < 1) return null
      const mmUnit = parsed[mm].unidade
      const vr = parsed.slice(0, mm).reduceRight((found, c, i) =>
        found >= 0 ? found : (/\bUST\b/i.test(c.nome) && c.unidade === mmUnit ? i : -1), -1)
      if (vr < 0) return null
      const im = mm + 1 < hCols.length ? mm + 1 : -1
      const e2 = vr
      const one_d = vr === 0
      const e1b = vr === 2 ? 1 : -1
      return { vrIdx: vr, mmIdx: mm, imIdx: im, eixo1Idx: 0, eixo2Idx: e2, eixo1bIdx: e1b, is1D: one_d }
    }

    for (const linha of linhas) {
      if (linha.startsWith('# HEADERS:')) {
        const hCols = linha.slice('# HEADERS:'.length).trim().split('\t').map(s => s.trim())
        if (hCols[0]) { const c = extractCol(hCols[0]); if (c.unidade) curEixo1Unidade = c.unidade; if (c.nome) curEixo1Nome = c.nome }
        if (!firstEixo1Unidade && curEixo1Unidade) firstEixo1Unidade = curEixo1Unidade
        const map = detectColMap(hCols)
        if (map) {
          vrIdx = map.vrIdx; mmIdx = map.mmIdx; eixo2Idx = map.eixo2Idx
          imIdx = map.imIdx; is1D = map.is1D
          if (hCols[eixo2Idx]) { const c = extractCol(hCols[eixo2Idx]); if (c.unidade) curEixo2Unidade = c.unidade; if (c.nome) curEixo2Nome = c.nome }
          if (is1D) { curEixo2Nome = curEixo1Nome; curEixo2Unidade = curEixo1Unidade }
          if (hCols[vrIdx]) { const c = extractCol(hCols[vrIdx]); if (c.unidade) curVrUnidade = c.unidade }
          eixo1bIdx = map.eixo1bIdx
          if (eixo1bIdx >= 0 && hCols[eixo1bIdx]) {
            const c = extractCol(hCols[eixo1bIdx]); curEixo1bNome = c.nome; curEixo1bUnidade = c.unidade
          } else { curEixo1bNome = ''; curEixo1bUnidade = '' }
        } else {
          vrIdx = 1; mmIdx = 2; eixo2Idx = 1; imIdx = 3; is1D = false; eixo1bIdx = -1
          if (hCols[1]) { const c = extractCol(hCols[1]); if (c.unidade) { curEixo2Unidade = c.unidade; curVrUnidade = c.unidade } if (c.nome) curEixo2Nome = c.nome }
          curEixo1bNome = ''; curEixo1bUnidade = ''
        }
        if (!firstEixo2Unidade && curEixo2Unidade) firstEixo2Unidade = curEixo2Unidade
        continue
      }
      if (linha.startsWith('# GRANDEZA:')) { curGrandeza = soGrandeza(linha.slice('# GRANDEZA:'.length)); continue }
      if (linha.startsWith('# PARAM:'))    { tabelaAtual = linha.slice('# PARAM:'.length).trim();    continue }
      if (linha.startsWith('# UST:'))      { continue }
      if (linha.startsWith('#'))           { tabelaAtual = linha.slice(1).trim(); continue }
      if (!linha.includes('\t')) continue
      const cols = linha.split('\t').map(s => parseNum(s))
      if (cols.length < 2) continue

      const e1  = cols[0]
      const vr  = cols[vrIdx  >= 0 ? vrIdx  : 1]
      const mm  = cols[mmIdx  >= 0 ? mmIdx  : 2]
      const e2  = is1D ? e1 : cols[eixo2Idx >= 0 ? eixo2Idx : 1]
      const im  = imIdx >= 0 ? cols[imIdx] : cols[3]
      const e1b = eixo1bIdx >= 0 ? cols[eixo1bIdx] : undefined

      if (!isFinite(e1) || !isFinite(vr) || !isFinite(mm)) continue

      pontos.push({
        eixo1: e1, eixo2: e2,
        correcao: parseFloat((vr - mm).toPrecision(10)),
        incerteza:     isFinite(im) ? im : undefined,
        grandeza:      curGrandeza     || undefined,
        tabela:        tabelaAtual     || undefined,
        eixo1Unidade:  curEixo1Unidade || undefined,
        eixo2Unidade:  curEixo2Unidade || undefined,
        eixo1b:        isFinite(e1b as number) ? e1b : undefined,
        eixo1bUnidade: curEixo1bUnidade || undefined,
        eixo1bNome:    curEixo1bNome    || undefined,
      })
    }
    if (pontos.length >= 3) {
      const maxFreq = Math.max(...pontos.map(p => p.eixo1))
      const eixo1Unidade = firstEixo1Unidade || (maxFreq <= 100 ? 'GHz' : 'MHz')
      return {
        pontos,
        eixo1Nome: curEixo1Nome, eixo1Unidade,
        eixo2Nome: curEixo2Nome, eixo2Unidade: firstEixo2Unidade || 'dBm',
        equipamentoTag, numeroCert,
      }
    }
  }

  // --- Formato LABELO/RNBC (seções "Parâmetro:" com VR/MM e unidades entre
  //     parênteses). Casa VR↔MM SEMPRE pela mesma grandeza (a MM define);
  //     erro = VR − MM. eixo1 = frequência, eixo2 = VR. ---------------------
  {
    const numTok = /[≥≤><≈~]?\s*[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?|[+-]?\d+(?:\.\d+)?/g
    const pN = (s: string): number | null => {
      let t = String(s).replace(/[≥≤><≈~\s]/g, '')
      if (!t || /^[-—–∞]+$/.test(t)) return null
      if (t.includes(',')) t = t.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
      const n = parseFloat(t); return isFinite(n) ? n : null
    }
    const getNums = (l: string): { n: number; dec: number }[] => {
      const o: { n: number; dec: number }[] = []; const m = l.match(numTok)
      if (m) for (const tk of m) { const n = pN(tk); if (n !== null) { const d = tk.match(/,(\d+)/); o.push({ n, dec: d ? d[1].length : 0 }) } }
      return o
    }
    const near2 = (x: number) => x >= 1.9 && x <= 2.35
    const ehParam = (l: string) => /^par[âa]metro\b/i.test(l.trim())
    const temLetras = (l: string) => /[a-zA-ZÀ-ÿ]{4,}/.test(l)
    const freqUnit = (s: string) => (s.match(/\((GHz|MHz|kHz|Hz)\)/i)?.[1] || '')
    // parâmetros de valor MÍNIMO: o equipamento deve ATINGIR pelo menos o VR
    // (reflexão / perda de retorno) — MM ≥ VR significa que já atende (apto)
    const ehMinSpec = (g: string) => /reflex|perda de retorno|return\s*loss|\bretorno\b/i.test(g)
    // GRANDEZA = cabeçalho em negrito/centralizado que antecede a tabela.
    // Busca para trás a partir de cada "Parâmetro:" sem herdar de blocos anteriores.
    const ehLegRBC = (l: string) =>
      /unidade da grandeza|^\s*UMP\s*[-–]|^\s*UST\s*[-–]|^\s*VR\s*\(unidade|^\s*MM\s*\(unidade/i.test(l)
    const ehRuidoRBC = (t: string) =>
      /^(página|page|\d+\s+de\s+\d+|rnbc|labelo|pucrs|emiss[aã]o|valid|assina|tecni|respond|certif|caracteri|document|procedim|m[eé]todo|norma|rastreab|incert|aprovad|fator\s+de|data\s+de|n[º°]\s*de\s*s[eé]rie|fabricante|modelo|protocolo|tag\s*n|período|unidade da)/i.test(t)

    function grandezaAntesDeRBC(paramIdx: number): string {
      for (let i = paramIdx - 1; i >= Math.max(0, paramIdx - 12); i--) {
        const t = linhas[i].trim()
        if (!t) continue
        if (ehParam(linhas[i])) break
        if (ehLegRBC(linhas[i])) continue
        if (ehRuidoRBC(t)) continue
        const nDigits = (t.match(/\d/g) || []).length
        if (nDigits > 2) continue
        if (t.length < 3 || t.length > 100) continue
        return soGrandeza(t)
      }
      return ''
    }

    const inicios: number[] = []
    const grandezaDe: Record<number, string> = {}
    linhas.forEach((l, i) => { if (ehParam(l)) inicios.push(i) })
    for (const ini of inicios) grandezaDe[ini] = grandezaAntesDeRBC(ini)

    const pts: PontoCalibracao2D[] = []
    let e1U = '', e2U = ''
    for (let s = 0; s < inicios.length; s++) {
      const ini = inicios[s]
      const fim = s + 1 < inicios.length ? inicios[s + 1] : linhas.length
      const bloco = linhas.slice(ini, fim)
      const parametro = (bloco[0].replace(/^par[âa]metro\s*:?\s*/i, '') || '').trim()
      const grandeza = grandezaDe[ini] || parametro
      const minSpec = ehMinSpec(parametro) || ehMinSpec(grandeza)
      const headerTxt = bloco.slice(0, 14).join(' ')
      const uMM = (headerTxt.match(/UMP\s*\(([^)]+)\)/i)?.[1]
        || headerTxt.match(/UST\s*\((?!GHz|MHz|kHz|Hz)([^)]+)\)/i)?.[1] || '').trim()
      const uFreq = freqUnit(headerTxt)

      // Ancora no fator k (≈2,00): [freq…, VR, MM, IM, k, veff] → VR/MM/IM são as
      // 3 colunas antes do k. eixo1 = frequência, eixo2 = VR. Erro = VR − MM.
      let buf: { n: number; dec: number }[] = []
      for (let i = 1; i < bloco.length; i++) {
        const raw = bloco[i].trim(); if (!raw) continue
        const ns = getNums(raw)
        if (temLetras(raw) && ns.length < 3) { buf = []; continue }
        if (ns.length === 0) continue
        buf.push(...ns)
        let kIdx = -1
        if (buf.length >= 1 && near2(buf[buf.length - 1].n)) kIdx = buf.length - 1
        else if (buf.length >= 2 && near2(buf[buf.length - 2].n)) kIdx = buf.length - 2
        if (kIdx >= 3) {
          const vr = buf[kIdx - 3].n, mm = buf[kIdx - 2].n, im = buf[kIdx - 1].n
          const casas = Math.max(buf[kIdx - 3].dec, buf[kIdx - 2].dec)
          const temFreq = (kIdx - 3) > 0
          const e1 = temFreq ? buf[0].n : vr
          if (isFinite(vr) && isFinite(mm) && isFinite(e1)) {
            const e1u = temFreq ? (uFreq || uMM) : uMM
            if (!e1U) e1U = e1u
            if (!e2U) e2U = uMM
            pts.push({
              eixo1: e1, eixo2: vr,
              correcao: parseFloat((vr - mm).toPrecision(10)),
              incerteza: isFinite(im) ? im : undefined,
              grandeza: grandeza || undefined,
              tabela: parametro || undefined,
              eixo1Unidade: e1u || undefined,
              eixo2Unidade: uMM || undefined,
              casas,
              minSpec: minSpec || undefined,
              apto: minSpec ? mm >= vr : undefined,
            })
          }
          buf = []
        } else if (buf.length > 10) { buf = [] }
      }
    }
    if (pts.length >= 3) {
      return {
        pontos: pts,
        eixo1Nome: 'Frequência', eixo1Unidade: e1U || 'MHz',
        eixo2Nome: 'Nível',      eixo2Unidade: e2U || 'dBm',
        equipamentoTag, numeroCert,
      }
    }
  }

  // --- Fallback: heurística por token stream (texto OCR livre) ---
  const isGHz = /ghz/i.test(texto)
  const isMHz = /mhz/i.test(texto)
  const eixo1Unidade = isGHz ? 'GHz' : isMHz ? 'MHz' : 'Hz'
  const eixo2Unidade = /dbm/i.test(texto) ? 'dBm' : /db/i.test(texto) ? 'dB' : ''

  // Parses numbers in Brazilian locale ("1.000,5" = 1000.5; "2.450" = 2450; "30,5" = 30.5)
  const parseNumFallback = (s: string): number => {
    const t = s.trim().replace(/\s/g, '')
    if (!t || t === '-' || t === '—') return NaN
    // Vírgula presente → vírgula é decimal, pontos são milhar: "1.234,5" → 1234.5
    if (t.includes(','))
      return parseFloat(t.replace(/\./g, '').replace(',', '.'))
    // Múltiplos pontos → separadores de milhar: "1.000.000" → 1000000
    if ((t.match(/\./g) ?? []).length > 1)
      return parseFloat(t.replace(/\./g, ''))
    // Ponto único com exatamente 3 dígitos após → separador de milhar: "2.450" → 2450
    if (/^[+-]?\d{1,3}\.\d{3}$/.test(t))
      return parseFloat(t.replace('.', ''))
    return parseFloat(t)
  }

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

  // Caminho 1: linhas tab-separadas (extração espacial do PDF)
  // Detecta cabeçalho com VR/MM, agrupa por parâmetro e calcula correcao = VR - MM
  if (linhas.some(l => l.includes('\t'))) {
    const tabPontos: PontoCalibracao2D[] = []
    let curTabela   = ''
    let curGrandeza = ''
    let freqIdx = -1, vrIdx = -1, mmIdx = -1, imIdx = -1
    let headerOk = false

    for (const linha of linhas) {
      const trimmed = linha.trim()
      if (!trimmed) continue

      const cols = trimmed.split('\t').map(s => s.trim())

      // — Cabeçalho (tab): VR+MM na mesma linha; só detecta quando !headerOk
      //   Isso evita que sub-linhas de unidades ("UST(dBm)\tUMP(dBm)") sobrescrevam o cabeçalho correto
      if (!headerOk && cols.length >= 2) {
        const nc = cols.map(norm)
        // Exclui colunas que contenham "freq" do match de VR/MM:
        // "Frequência Nominal" / "Frequência de Referência" não são VR, são eixo de frequência
        const nVr = nc.findIndex(c => !/freq/.test(c) && /\bv\.?r\.?\b|\bust\.?\b|refer[eê]?nc|padr[aã]?o|valor.ref|nominal/.test(c))
        const nMm = nc.findIndex(c => !/freq/.test(c) && /\bm\.?m\.?\b|\bump\.?\b|medid[ao]|medic[aã]|valor.med|indicad|leitur/.test(c))
        if (nVr >= 0 && nMm >= 0 && nVr !== nMm) {
          vrIdx = nVr; mmIdx = nMm
          imIdx = nc.findIndex(c => /\bim\b|incert/.test(c))
          const fIdx = nc.findIndex(c => /freq/.test(c))
          // Se há coluna "freq*" distinta de VR/MM → usa ela; senão col[0] se VR não for col[0]
          freqIdx = (fIdx >= 0 && fIdx !== nVr && fIdx !== nMm)
            ? fIdx
            : (nVr > 0 ? 0 : -1)
          headerOk = true
          continue
        }
      }

      // — Dados (tab, numérico) —
      if (headerOk && vrIdx >= 0 && mmIdx >= 0 && cols.length >= Math.max(vrIdx, mmIdx) + 1) {
        const nums = cols.map(parseNumFallback)
        const vr   = nums[vrIdx]
        const mm   = nums[mmIdx]
        const freq = freqIdx >= 0 ? nums[freqIdx] : vr
        // IM detectado no cabeçalho; se não, tenta coluna após MM se for valor pequeno
        let im = imIdx >= 0 ? nums[imIdx] : NaN
        if (!isFinite(im) && mmIdx + 1 < nums.length) {
          const c = nums[mmIdx + 1]
          if (isFinite(c) && c >= 0 && c < 10) im = c
        }
        if (isFinite(vr) && isFinite(mm) && isFinite(freq)) {
          tabPontos.push({
            eixo1:     freq,
            eixo2:     vr,
            correcao:  parseFloat((vr - mm).toFixed(6)),
            incerteza: isFinite(im) ? im : undefined,
            tabela:    curTabela  || undefined,
            grandeza:  curGrandeza || undefined,
          })
          continue
        }
      }

      // — Linhas sem tab: grandeza, parâmetro ou boilerplate —
      if (!trimmed.includes('\t')) {
        const n = norm(trimmed)
        // Boilerplate: ignorar
        if (/^(configurac[a-z]*\s+da|av\.\s|telefone|fax\s*:|e-mail|website|labelo\/|laborat|periodo\s+de\s+calib|certif.*calibr|resultado[s]?\s+da|pagina\s+\d|numero\s+do\s+cert|acreditad)/.test(n)) continue
        // "Medição de ..." ou "Grandeza:" → grandeza
        if (/\bmedicao\s+de\b/.test(n) || /\bgrandeza[s]?\s*[:;]/.test(n)) {
          curGrandeza = soGrandeza(trimmed.replace(/grandeza[s]?\s*[:;]\s*/i, ''))
          headerOk = false; continue
        }
        // "Parâmetro: ..." ou "Parâmetro ..." (com ou sem dois-pontos)
        if (/\bpar[aâ]metro[s]?\b/i.test(trimmed)) {
          curTabela = trimmed.replace(/par[aâ]metro[s]?\s*[:;\s]*/i, '').trim()
          headerOk = false; continue
        }
      }
    }

    if (tabPontos.length >= 3) {
      return {
        pontos: tabPontos,
        eixo1Nome: 'Frequência', eixo1Unidade,
        eixo2Nome: 'Nível',      eixo2Unidade,
        equipamentoTag, numeroCert,
      }
    }
  }

  // Caminho 2: token stream genérico
  const pontos: PontoCalibracao2D[] = []
  const tokens: number[] = []
  for (const linha of linhas) {
    const cleanLinha = linha.replace(/(\d)\s+(?=\d)/g, '$1')
    const nums = cleanLinha.match(/[+-]?\d+[,.]?\d*/g)
    if (!nums) continue
    if (nums.length === 1 && parseInt(nums[0]) > 2000 && parseInt(nums[0]) < 2100) continue
    for (const n of nums) {
      const v = parseFloat(n.replace(',', '.'))
      if (!isNaN(v)) tokens.push(v)
    }
  }

  let i = 0
  while (i < tokens.length - 3) {
    const freq = tokens[i], vr = tokens[i+1], mm = tokens[i+2], im = tokens[i+3]
    const freqOk = freq > 0.001 && freq < 100000
    const vrOk   = vr >= -60 && vr <= 30
    const mmOk   = Math.abs(mm - vr) < 5
    const imOk   = im >= 0 && im < 5
    if (freqOk && vrOk && mmOk && imOk) {
      pontos.push({ eixo1: freq, eixo2: vr, correcao: parseFloat((vr - mm).toFixed(4)), incerteza: im })
      i += 4
      while (i < tokens.length && (tokens[i] === 2 || tokens[i] > 100)) i++
    } else { i++ }
  }

  return {
    pontos,
    eixo1Nome: 'Frequência', eixo1Unidade,
    eixo2Nome: 'Nível',      eixo2Unidade,
    equipamentoTag, numeroCert,
  }
}

/**
 * Tenta parsear texto OCR de um certificado e extrair pontos de correção 2D.
 *
 * Heurística:
 *  - Detecta linhas com ≥3 números (eixo1, eixo2, correção)
 *  - Ignora linhas de cabeçalho (palavras longas dominantes)
 */
export function parsearTabelaCertificado2D(texto: string): PontoCalibracao2D[] {
  // Tenta primeiro o parser específico RBC
  const rbc = parsearCertificadoRBC(texto)
  if (rbc.pontos.length >= 3) return rbc.pontos

  const pontos: PontoCalibracao2D[] = []
  const linhas = texto.split(/\r?\n/).filter(l => l.trim())

  for (const linha of linhas) {
    // Extrai todos os números da linha (inclui decimais e negativos)
    const nums = linha.match(/[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/g)
    if (!nums || nums.length < 3) continue

    const parsed = nums.map(n => parseFloat(n.replace(',', '.')))
    if (parsed.some(isNaN)) continue

    // Heurística: 3 números → (eixo1, eixo2, correção)
    //             4 números → (eixo1, eixo2, correção, incerteza)
    pontos.push({
      eixo1: parsed[0],
      eixo2: parsed[1],
      correcao: parsed[2],
      incerteza: parsed[3],
    })
  }

  return pontos
}
