import type { ResultadoBusca, Trecho } from '@/lib/conhecimento/tipos'
import { semCabecalhoIEC } from '@/lib/conhecimento/markdown'

/* Busca local da Base de Conhecimento — sem IA e sem internet.
   - normaliza (minúsculas, sem acento) e reduz a palavra ao radical (plural,
     -ções → -ção…), ignora palavras vazias ("de", "o", "qual"…);
   - expande a pergunta com sinônimos (grupos de EMC abaixo + Glossário do app);
   - ordena os trechos por BM25, com bônus para notas do laboratório e para a
     frase exata;
   - devolve um recorte do trecho com as palavras encontradas destacadas. */

const STOP = new Set(('a o os as um uma uns umas de da do das dos em no na nos nas por pela pelo pelas pelos para pra ' +
  'com sem sob sobre ao aos e ou que se ser sao foi era como mais menos muito muita qual quais quando onde quem ' +
  'eh esta este esse essa isso isto aquele aquela ja nao sim tem ter ha deve devem pode podem the and of to in ' +
  'qual quais faz fazer feito usa usar utiliza utilizar utiliza-se seu sua seus suas lhe me meu minha').split(' '))

/** minúsculas, sem acento. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Radical simples do português (o bastante para plural e -ção/-ções). Números ficam intactos. */
export function radical(t: string): string {
  if (/\d/.test(t) || t.length <= 3) return t
  let r = t
  if (r.endsWith('coes')) r = r.slice(0, -4) + 'cao'
  else if (r.endsWith('oes') || r.endsWith('aes')) r = r.slice(0, -3) + 'ao'
  else if (r.endsWith('ais')) r = r.slice(0, -3) + 'al'
  else if (r.endsWith('eis') && r.length > 5) r = r.slice(0, -3) + 'el'
  else if (r.endsWith('ns')) r = r.slice(0, -2) + 'm'
  else if (r.endsWith('res') && r.length > 5) r = r.slice(0, -2)
  else if (r.endsWith('s') && !/(ss|us|is)$/.test(r)) r = r.slice(0, -1)
  if (r.endsWith('mente') && r.length > 8) r = r.slice(0, -5)
  // feminino/masculino: eletrostatica ~ eletrostatico, medida ~ medido
  if (r.length > 5 && /[ao]$/.test(r) && !r.endsWith('cao') && !r.endsWith('ao')) r = r.slice(0, -1)
  return r
}

// "61000-4-5" também casa com "4-5"; "2.5.2.4" fica inteiro.
const RE_TOKEN = /[a-z0-9]+(?:[-.,/][a-z0-9]+)*/g

export interface Token { termo: string; inicio: number; fim: number }

/** Tokens com posição no texto ORIGINAL (para destacar). */
export function tokenizar(texto: string): Token[] {
  // normaliza caractere a caractere, guardando de qual posição do original veio
  // cada caractere normalizado (acento removido muda o comprimento do texto)
  const out: Token[] = []
  const mapa: number[] = []
  let norm = ''
  for (let i = 0; i < texto.length; i++) {
    const n = normalizar(texto[i])
    for (let k = 0; k < n.length; k++) mapa.push(i)
    norm += n
  }
  mapa.push(texto.length)
  for (const m of norm.matchAll(RE_TOKEN)) {
    const bruto = m[0].replace(/[.,/]+$/, '')
    const ini = m.index ?? 0
    out.push({ termo: bruto, inicio: mapa[ini] ?? 0, fim: mapa[ini + bruto.length] ?? texto.length })
  }
  return out
}

/** Termos indexáveis de um token (com subcódigos: "61000-4-5" → também "4-5"). */
function termosDe(t: string): string[] {
  if (STOP.has(t)) return []
  const out = [radical(t)]
  const partes = t.split('-')
  if (partes.length >= 3 && /^\d+$/.test(partes[0])) out.push(partes.slice(-2).join('-'))
  if (t.includes('-') && !/\d/.test(t)) out.push(...t.split('-').filter(p => p.length > 2 && !STOP.has(p)).map(radical))
  return out
}

export function termos(texto: string): string[] {
  return tokenizar(texto).flatMap(t => termosDe(t.termo))
}

/** Pergunta/sinônimo em radicais, para comparar "distâncias" com "distância".
    Sinônimo só de palavras vazias vira uma chave que nunca casa. */
const chave = (texto: string) => {
  const t = termos(texto)
  return t.length ? ' ' + t.join(' ') + ' ' : '\0'
}

/* Sinônimos da área (EMC/metrologia legal). Cada grupo: se a pergunta tiver um
   deles, os outros também são procurados (com peso menor). */
export const SINONIMOS_PADRAO: string[][] = [
  ['surto', 'impulso combinado', 'surge', '4-5', '61000-4-5'],
  ['burst', 'transientes eletricos rapidos', 'transiente rapido', 'eft', '4-4', '61000-4-4'],
  ['esd', 'descarga eletrostatica', 'descargas eletrostaticas', '4-2', '61000-4-2'],
  ['irradiada', 'rf irradiado', 'campo irradiado', 'imunidade radiada', '4-3', '61000-4-3'],
  ['conduzida', 'rf conduzido', 'imunidade conduzida', '4-6', '61000-4-6'],
  ['dips', 'queda de tensao', 'quedas de tensao', 'curtas interrupcoes', 'afundamento', '4-11', '61000-4-11'],
  ['correntes diferenciais', 'correntes diferenciais conduzidas', '4-19', '61000-4-19'],
  ['radar', 'medidor de velocidade', 'medidores de velocidade'],
  ['hidrometro', 'medidor de agua', 'medidores de agua'],
  ['balanca', 'instrumento de pesagem', 'instrumentos de pesagem'],
  ['bomba de combustivel', 'bomba medidora', 'bombas medidoras'],
  ['sip', 'sistema de iluminacao publica', 'sistemas de iluminacao publica'],
  ['medidor de energia', 'medidores de energia', 'medidor eletronico', 'mee'],
  ['modo relogio', 'multipla tarifacao', 'relogio'],
  ['reativa', 'energia reativa'],
]

/* Ponte português → inglês: as normas IEC da base estão em inglês, as perguntas
   em português. É a mesma palavra em outra língua, então pesa quase como o
   termo da pergunta (e não meio peso, como um sinônimo de assunto). */
const TRADUCOES: string[][] = [
  ['nivel de ensaio', 'nivel de severidade', 'niveis de ensaio', 'test level', 'test levels', 'severity level'],
  ['montagem', 'arranjo de ensaio', 'configuracao de ensaio', 'setup', 'set-up', 'test setup', 'test set-up', 'test arrangement'],
  ['criterio de desempenho', 'criterios de desempenho', 'performance criteria', 'performance criterion', 'evaluation of test results'],
  ['descarga por contato', 'contact discharge'],
  ['descarga pelo ar', 'descarga no ar', 'air discharge'],
  ['plano de acoplamento', 'coupling plane', 'hcp', 'vcp'],
  ['plano de terra', 'plano de referencia', 'ground reference plane', 'grp', 'reference ground plane'],
  ['gerador', 'generator', 'simulador', 'simulator'],
  ['tempo de subida', 'rise time'],
  ['forma de onda', 'waveform', 'wave shape'],
  ['calibracao', 'verificacao do gerador', 'calibration', 'verification'],
  ['incerteza', 'incerteza de medicao', 'measurement uncertainty', 'uncertainty'],
  ['uniformidade de campo', 'campo uniforme', 'field uniformity', 'uniform field area', 'ufa'],
  ['intensidade de campo', 'field strength'],
  ['camara anecoica', 'camara semi-anecoica', 'anechoic chamber', 'absorber lined'],
  ['antena', 'antenna'],
  ['modulacao', 'modulation', 'am'],
  ['tempo de permanencia', 'dwell time'],
  ['passo de frequencia', 'frequency step', 'step size'],
  ['faixa de frequencia', 'frequency range'],
  ['rede de acoplamento', 'acoplamento e desacoplamento', 'cdn', 'coupling/decoupling network', 'coupling network', 'decoupling network'],
  ['alicate', 'clamp', 'pinca de injecao', 'em clamp', 'current clamp', 'capacitive coupling clamp'],
  ['taxa de repeticao', 'frequencia de repeticao', 'repetition frequency', 'repetition rate'],
  ['duracao do burst', 'burst duration', 'burst period'],
  ['onda combinada', 'combination wave', '1,2/50', '8/20'],
  ['angulo de fase', 'phase angle'],
  ['queda de tensao', 'voltage dip', 'voltage dips'],
  ['interrupcao curta', 'curta interrupcao', 'short interruption', 'short interruptions'],
  ['variacao de tensao', 'voltage variation', 'voltage variations'],
  ['classe de ambiente', 'environment class', 'classe 2', 'classe 3'],
  ['equipamento sob ensaio', 'ese', 'eut', 'equipment under test'],
  ['relatorio de ensaio', 'test report'],
  ['cabo', 'cable', 'cabos', 'cables'],
  ['aterramento', 'grounding', 'earthing', 'ground connection'],
  ['porta de alimentacao', 'power port', 'ac power port', 'linha de alimentacao', 'power supply line'],
  ['linha de sinal', 'signal line', 'signal port', 'control line'],
  ['polaridade', 'polarity'],
  ['distancia', 'distance', 'separation'],
  ['impedancia', 'impedance'],
  ['acoplamento', 'coupling'],
  ['desacoplamento', 'decoupling'],
  ['mesa', 'equipamento de mesa', 'table-top', 'table top', 'tabletop'],
  ['piso', 'equipamento de piso', 'floor standing', 'floor-standing'],
  ['suporte isolante', 'isolante', 'insulating support', 'insulation support'],
  ['altura', 'height', 'above the ground'],
  ['comprimento', 'length', 'tamanho do cabo', 'cable length'],
  ['espessura', 'thickness'],
  ['tamanho', 'dimensoes', 'size', 'dimensions'],
  ['tensao de ensaio', 'test voltage'],
  ['duracao', 'duration'],
  ['numero de descargas', 'number of discharges'],
  ['intervalo', 'interval', 'time between'],
]
const EH_TRADUCAO = new Set(TRADUCOES)
SINONIMOS_PADRAO.push(...TRADUCOES)

/** Partes da IEC 61000-4-x e números de portaria citados na pergunta ("4-4", "61000-4-6", "portaria 221"). */
export function normasCitadas(pergunta: string): { iec: string[]; portarias: string[] } {
  const q = normalizar(pergunta)
  const iec = [...q.matchAll(/(?:^|[^\d-])(?:61000-)?4-(\d{1,2})(?!\d)/g)].map(m => m[1])
  const portarias = [...q.matchAll(/(?:^|\D)(\d{3})(?!\d)/g)].map(m => m[1])
  return { iec: [...new Set(iec)], portarias: [...new Set(portarias)] }
}

/** O documento é uma das normas citadas? (pelo id: iec-61000-4-4-2012, portaria-inmetro-221-2022) */
export function ehNormaCitada(docId: string, citadas: { iec: string[]; portarias: string[] }): boolean {
  const iec = docId.match(/^iec-61000-4-(\d+)-/)
  if (iec) return citadas.iec.includes(iec[1])
  const port = docId.match(/^portaria-[a-z]+-(\d+)-/)
  return !!port && citadas.portarias.includes(port[1])
}

/** Termos dos grupos de sinônimos que a pergunta aciona, fora os que ela já tem —
    em geral a versão em inglês ("distância" → distance, separation). */
export function termosAcionados(pergunta: string, sinonimos: string[][]): string[] {
  const q = chave(pergunta)
  const out = new Set<string>()
  for (const grupo of sinonimos) {
    if (!grupo.some(s => q.includes(chave(s)))) continue
    for (const s of grupo) if (!q.includes(chave(s))) out.add(s)
  }
  return [...out]
}

interface Doc { trecho: Trecho; tf: Map<string, number>; len: number; norm: string }

export interface Indice {
  docs: Doc[]
  df: Map<string, number>
  mediaLen: number
  sinonimos: string[][]
}

export function construirIndice(trechos: Trecho[], sinonimosExtras: string[][] = []): Indice {
  const docs: Doc[] = []
  const df = new Map<string, number>()
  for (const t of trechos) {
    const ts = termos([t.contexto, t.ancora, t.texto].filter(Boolean).join('\n'))
    const tf = new Map<string, number>()
    ts.forEach(x => tf.set(x, (tf.get(x) ?? 0) + 1))
    tf.forEach((_, k) => df.set(k, (df.get(k) ?? 0) + 1))
    docs.push({ trecho: t, tf, len: ts.length, norm: normalizar(t.texto) })
  }
  const mediaLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length)
  return { docs, df, mediaLen, sinonimos: [...SINONIMOS_PADRAO, ...sinonimosExtras] }
}

/** Termos da pergunta com peso (1 = da pergunta, 0,9 = tradução, 0,5 = sinônimo de assunto). */
export function expandir(pergunta: string, sinonimos: string[][]): Map<string, number> {
  const pesos = new Map<string, number>()
  termos(pergunta).forEach(t => pesos.set(t, 1))
  const q = chave(pergunta)
  for (const grupo of sinonimos) {
    const temGrupo = grupo.some(s => q.includes(chave(s)))
    if (!temGrupo) continue
    const peso = EH_TRADUCAO.has(grupo) ? 0.9 : 0.5
    for (const s of grupo) for (const t of termos(s)) if ((pesos.get(t) ?? 0) < peso) pesos.set(t, peso)
  }
  return pesos
}

/** Texto para exibir no resultado: sem marcação markdown (|---|, **, #). */
export function textoExibicao(md: string): string {
  return md.split('\n')
    .filter(l => !/^\s*\|?\s*:?-{3,}/.test(l))                       // separador de tabela
    .map(l => l.trim().startsWith('|') ? l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(Boolean).join(' · ') : l)
    .join('\n')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)\*([^*\n]+)\*/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '').replace(/`([^`]+)`/g, '$1')
}

function recorte(texto: string, alvo: Set<string>, max = 320): { trecho: string; destaques: [number, number][] } {
  const toks = tokenizar(texto)
  const acertos = toks.filter(t => termosDe(t.termo).some(x => alvo.has(x)))
  // janela com mais acertos
  let melhorIni = 0
  if (acertos.length) {
    let melhor = -1
    for (const a of acertos) {
      const ini = Math.max(0, a.inicio - 60)
      const n = acertos.filter(b => b.inicio >= ini && b.fim <= ini + max).length
      if (n > melhor) { melhor = n; melhorIni = ini }
    }
  }
  // começa no início de palavra/frase
  if (melhorIni > 0) {
    const ponto = texto.lastIndexOf('. ', melhorIni)
    melhorIni = ponto >= 0 && melhorIni - ponto < 80 ? ponto + 2 : (texto.indexOf(' ', melhorIni) + 1 || melhorIni)
  }
  let fim = Math.min(texto.length, melhorIni + max)
  if (fim < texto.length) { const esp = texto.lastIndexOf(' ', fim); if (esp > melhorIni) fim = esp }
  const prefixo = melhorIni > 0 ? '… ' : ''
  const sufixo = fim < texto.length ? ' …' : ''
  const trecho = prefixo + texto.slice(melhorIni, fim).replace(/\s+/g, ' ') + sufixo
  // destaques recalculados no recorte final
  const destaques = tokenizar(trecho)
    .filter(t => termosDe(t.termo).some(x => alvo.has(x)))
    .map(t => [t.inicio, t.fim] as [number, number])
  return { trecho, destaques }
}

/** Ranking por palavras (BM25): índice do trecho em indice.docs + pontuação. */
export function pontuarBM25(indice: Indice, pergunta: string, limite = 50): { i: number; score: number }[] {
  const pesos = expandir(pergunta, indice.sinonimos)
  if (!pesos.size) return []
  const N = indice.docs.length
  const k1 = 1.2, b = 0.5
  const frase = normalizar(pergunta).replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim()
  const out: { i: number; score: number }[] = []
  indice.docs.forEach((d, i) => {
    let score = 0, distintos = 0
    pesos.forEach((peso, t) => {
      const f = d.tf.get(t)
      if (!f) return
      distintos += peso
      const df = indice.df.get(t) ?? 0
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
      score += peso * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / indice.mediaLen))
    })
    if (score <= 0) return
    score *= 1 + 0.15 * distintos
    if (frase.length > 6 && d.norm.includes(frase)) score *= 1.5
    out.push({ i, score })
  })
  return out.sort((x, y) => y.score - x.score).slice(0, limite)
}

/** Monta o resultado exibível de um trecho (recorte com as palavras da pergunta destacadas). */
export function resultadoDe(indice: Indice, i: number, score: number, pergunta: string): ResultadoBusca {
  const d = indice.docs[i]
  const alvo = new Set(expandir(pergunta, indice.sinonimos).keys())
  const { trecho, destaques } = recorte(semCabecalhoIEC(textoExibicao(d.trecho.texto)), alvo)
  return {
    docId: d.trecho.docId, titulo: d.trecho.titulo, tipo: d.trecho.tipo, ancora: d.trecho.ancora,
    trecho, destaques, score: Math.round(score * 1000) / 1000,
  }
}

export function buscar(indice: Indice, pergunta: string, limite = 12): ResultadoBusca[] {
  const pesos = expandir(pergunta, indice.sinonimos)
  if (!pesos.size) return []
  const N = indice.docs.length
  // b menor que o 0,75 clássico: item de norma longo e completo não deve perder
  // para um item curto que só cita o termo de passagem
  const k1 = 1.2, b = 0.5
  const frase = normalizar(pergunta).replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim()
  const pontuados: { d: Doc; score: number }[] = []
  for (const d of indice.docs) {
    let score = 0
    let distintos = 0
    pesos.forEach((peso, t) => {
      const f = d.tf.get(t)
      if (!f) return
      distintos += peso
      const df = indice.df.get(t) ?? 0
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
      score += peso * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / indice.mediaLen))
    })
    if (score <= 0) continue
    score *= 1 + 0.15 * distintos                                 // cobre mais termos da pergunta
    if (frase.length > 6 && d.norm.includes(frase)) score *= 1.5 // frase exata
    if (d.trecho.tipo === 'nota') score *= 1.6                   // nota do laboratório vem antes
    pontuados.push({ d, score })
  }
  pontuados.sort((x, y) => y.score - x.score)
  const alvo = new Set(pesos.keys())
  return pontuados.slice(0, limite).map(({ d, score }) => {
    const { trecho, destaques } = recorte(textoExibicao(d.trecho.texto), alvo)
    return {
      docId: d.trecho.docId, titulo: d.trecho.titulo, tipo: d.trecho.tipo, ancora: d.trecho.ancora,
      trecho, destaques, score: Math.round(score * 100) / 100,
    }
  })
}
