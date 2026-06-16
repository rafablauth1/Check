import type { PontoPlano } from '@/lib/planos/tipos'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

/** Interpreta um critério de aprovação (ex.: "± 1 dB", "± 7,0 %", "0,00003%",
 *  "3 Hz", "10 ppm") em campos estruturados + texto original. */
export function parsearCriterio(s: string): Partial<PontoPlano> {
  const t = s.replace(/\s+/g, ' ').trim()
  const out: Partial<PontoPlano> = { criterioTexto: t.replace(/^±\s*/, '± ') }
  const temPM = /±/.test(t)   // "mais ou menos" → tolerância FIXA (absoluta), mesmo se a unidade for %
  const m = t.match(/±?\s*([\d.,]+)\s*(ppm|%|dB[m]?|Hz|kHz|MHz|GHz|mV|µV|uV|V|mA|µA|uA|A|Ω|ohm|°C|s|ms|µs)?/i)
  if (m) {
    const valor = m[1]
    const un = (m[2] || '').trim()
    if (temPM) { out.tolFixo = valor; if (un) out.unidade = un }
    else if (/ppm/i.test(un)) out.tolPpm = valor
    else if (un === '%') out.tolPercentual = valor
    else { out.tolFixo = valor; if (un) out.unidade = un }
  }
  return out
}

/* ── Parser por LAYOUT (x,y) — para PDFs do FOR 6400 gerados via Excel ──────
   Colunas: 1=Grandeza · 2=Faixa/Pontos de calibração · 3=Critério de aprovação.
   Cada linha (grandeza) ocupa várias linhas de y; ancoramos a linha pelo CRITÉRIO
   (um por linha, bem espaçados) e atribuímos grandeza/pontos ao critério + próximo. */
export interface LayoutItem { s: string; x: number; y: number; page?: number }

export function parsearPlanoLayout(items: LayoutItem[]): { pontos: PontoPlano[]; obs: string } {
  if (!items?.length) return { pontos: [], obs: '' }
  // só a 1ª página (a tabela do FOR 6400 cabe numa página)
  const page0 = Math.min(...items.map(i => i.page ?? 0))
  const its = items.filter(i => (i.page ?? 0) === page0)

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  // Cabeçalho da tabela: âncora na palavra "Grandeza"; as colunas são lidas só na
  // FAIXA DE Y do cabeçalho (evita casar com o título "…critérios de aprovação").
  const gItem = its.find(i => /^grandeza/.test(norm(i.s)))
  const headerY = gItem ? gItem.y : Math.max(...its.map(i => i.y))
  const band = its.filter(i => Math.abs(i.y - headerY) <= 12)
  const findX = (re: RegExp, def: number) => { const m = band.find(i => re.test(norm(i.s))); return m ? m.x : def }
  const gX = gItem ? gItem.x : findX(/^grandeza/, 64)
  const pX = findX(/pontos de calibra|faixa de medi/, 174)
  const cX = findX(/^crit[eé]rio/, 306)
  const dX = findX(/^data/, 415)
  // fronteiras (pontos médios entre centros de coluna)
  const b1 = (gX + pX) / 2, b2 = (pX + cX) / 2, b3 = (cX + dX) / 2
  const col = (x: number) => x < b1 ? 'g' : x < b2 ? 'p' : x < b3 ? 'c' : 'ign'

  // região da tabela: entre o cabeçalho e a seção de observações
  const obsItem = its.find(i => /observa/.test(norm(i.s)) && i.y < headerY)
  const obsY = obsItem ? obsItem.y : 0
  const corpo = its.filter(i => i.y < headerY - 10 && i.y > obsY + 2)

  const criterios = corpo.filter(i => col(i.x) === 'c').sort((a, b) => b.y - a.y)
  const grands    = corpo.filter(i => col(i.x) === 'g')
  const pts       = corpo.filter(i => col(i.x) === 'p')
  if (!criterios.length) return { pontos: [], obs: extrairObs(its, obsY) }

  const nearestCrit = (y: number) =>
    criterios.reduce((best, c) => Math.abs(c.y - y) < Math.abs(best.y - y) ? c : best, criterios[0])

  const linhas: PontoPlano[] = criterios.map(c => {
    const g = grands.filter(i => nearestCrit(i.y) === c).sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()
    const p = pts.filter(i => nearestCrit(i.y) === c).sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.s).join(' · ').replace(/\s+/g, ' ').trim()
    const parsed = parsearCriterio(c.s)
    return { id: uid(), grandeza: g, unidade: parsed.unidade || '', pontosTexto: p, ...parsed }
  })
  return { pontos: linhas, obs: extrairObs(its, obsY) }
}

function extrairObs(its: LayoutItem[], obsY: number): string {
  if (!obsY) return ''
  return its.filter(i => i.y < obsY - 2 && i.y > 45)  // entre Observações e o rodapé
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()
}

const RE_GRANDEZA = /(exatid|linearidade|resposta|estabilidade|n[ií]vel|frequ[eê]ncia|pot[eê]ncia|tens[aã]o|corrente|resist[eê]ncia|modula|amplitude|impedanc|atenua|ru[ií]do|distor|ganho|temperatura|umidade|press[aã]o|tempo|fase)/i

const BLACKLIST = /(^|\b)(for\s*6400|identifica|dados para|observa|grandeza\s*$|^data$|crit[eé]rio|respons[aá]vel|faixa de medi|pontos de calibra|nome do|tag do|revis[aã]o|elaborado|aprovado|p[aá]gina|an[aá]lise cr[ií]tica|informa[çc])/i

function ehData(l: string)     { return /^\d{2}\/\d{2}\/\d{4}$/.test(l.trim()) }
function ehNomePessoa(l: string){ return /^[A-ZÀ-Ý][a-zà-ÿ]+(\s+[A-ZÀ-Ý][a-zà-ÿ.]+){1,3}(\s*-\s*.+)?$/.test(l.trim()) && !RE_GRANDEZA.test(l) }
function ehCriterio(l: string) {
  const t = l.trim()
  if (/[a-zà-ÿ]{6,}/i.test(t) && !/^±/.test(t)) return false   // frase longa não é critério
  return /^±/.test(t) || /^[\d.,]+\s*(ppm|%|dB[m]?|Hz|kHz|MHz|GHz|V|A|Ω)\b/i.test(t)
}
function ehPontos(l: string) {
  const t = l.trim()
  return (/\(/.test(t) && /\d/.test(t)) || /ponto\s*:/i.test(t) || /\d\s*a\s*-?\d/i.test(t) ||
         /\d.*\b(MHz|GHz|kHz|Hz|dBm|dB|V|A|%)\b/.test(t)
}
function ehGrandeza(l: string) {
  const t = l.trim()
  if (t.length < 8) return false
  if (BLACKLIST.test(t) || ehData(t) || ehCriterio(t) || ehNomePessoa(t)) return false
  if (/^[(\d±]/.test(t)) return false
  return RE_GRANDEZA.test(t) || (t.split(/\s+/).length >= 3 && /[a-zà-ÿ]{4,}/i.test(t))
}

/** Extrai linhas do plano (FOR 6400) de um texto OCR. Associa grandeza↔pontos↔critério
 *  por PROXIMIDADE (o pdf-parse embaralha as células; é best-effort, revise depois). */
export function parsearPlanoOCR(texto: string): PontoPlano[] {
  const linhas = texto.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)

  const grandezas: { idx: number; text: string; row: PontoPlano }[] = []
  const criterios: { idx: number; text: string; claimed: boolean }[] = []
  const pontos:    { idx: number; text: string; claimed: boolean }[] = []

  linhas.forEach((l, idx) => {
    if (ehGrandeza(l)) grandezas.push({ idx, text: l, row: { id: uid(), grandeza: l, unidade: '', pontosTexto: '' } })
    else if (ehCriterio(l)) criterios.push({ idx, text: l, claimed: false })
    else if (ehPontos(l))   pontos.push({ idx, text: l, claimed: false })
  })

  if (!grandezas.length) return []

  // dedup grandezas iguais consecutivas (OCR repete)
  const uniq: typeof grandezas = []
  for (const g of grandezas) {
    if (!uniq.length || uniq[uniq.length - 1].text.toLowerCase() !== g.text.toLowerCase()) uniq.push(g)
  }

  // associa cada critério/ponto à grandeza mais próxima (por distância de linha)
  const nearest = (idx: number) =>
    uniq.reduce((best, g) => Math.abs(g.idx - idx) < Math.abs(best.idx - idx) ? g : best, uniq[0])

  for (const c of criterios) {
    const g = nearest(c.idx)
    const parsed = parsearCriterio(c.text)
    g.row = { ...g.row, ...parsed, unidade: g.row.unidade || parsed.unidade || '' }
  }
  for (const p of pontos) {
    const g = nearest(p.idx)
    g.row.pontosTexto = g.row.pontosTexto ? `${g.row.pontosTexto} · ${p.text}` : p.text
  }

  return uniq.map(g => g.row)
}
