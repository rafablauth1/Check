// VIGIA-7S no app — teste dos dígitos 0–9 e encaixe dos dígitos (recursos do app; não existem no
// VIGIA-7S em Python). Roda no worker, com o opencv.js.
//
// Teste 0–9: o display costuma ficar parado num valor (ex.: 4,000), então não dá para ver se o 1, o 7
// ou o 2 seriam lidos. Com os segmentos REAIS da imagem atual (cada segmento aceso em algum dígito e
// apagado em outro), monta qualquer dígito em qualquer posição — pixel a pixel, da própria câmera —
// e roda a leitura de verdade (lerCampo) em cima. Depois procura os parâmetros (binarização, dilatar,
// espessura, limiar) que leem todos com a maior folga entre segmento aceso e apagado.
//
// Encaixe: no modo "Dígito a dígito", copia o tamanho do dígito escolhido para os outros e procura,
// na imagem, a posição de cada um onde os segmentos ficam mais nítidos (aceso bem aceso, apagado bem apagado).
import {
  lerCampo, celulasAbs, fatorK, envolvente, binarizar, regioesSegmentos, pyRound, TABELA, SEGMENTOS,
  type CampoDisplay, type Binarizacao, type OpenCV, type Mat,
} from '@/lib/vigia/seg7'

/** padrão a..g de cada dígito (a 1ª forma da tabela: 6 com traço em cima, 7 sem o f, 9 com o d) */
const PADRAO: Record<string, number[]> = {}
for (const [bits, ch] of Object.entries(TABELA)) if (!(ch in PADRAO)) PADRAO[ch] = [...bits].map(Number)
const DIGITOS = '0123456789'

export interface ParamsLeitura { binarizacao: Binarizacao; dilatar: number; espessura: number; limiar_segmento: number }

export interface Grade {
  /** [dígito 0–9][posição]: lido certo em todos os testes */
  ok: boolean[][]
  /** o que foi lido errado, para mostrar (ex.: "7→1") */
  erros: string[]
  /** fração do segmento aceso mais fraco e do apagado mais forte */
  acesoMin: number
  apagadoMax: number
}

export interface ResultadoAutoteste {
  campo: string
  erro?: string
  leitura: string
  atual?: Grade & { params: ParamsLeitura; folga: number }
  sugerido?: (Grade & { params: ParamsLeitura; folga: number }) | null
  /** estados que o display não mostrou e foram montados com outro segmento */
  substituidos?: string[]
  /** dígitos montados (RGBA), para conferir na tela */
  amostras?: { texto: string; largura: number; altura: number; dados: ArrayBuffer }[]
}

const f32 = Math.fround

interface Celula { wi: number; hi: number; idx: Int32Array; zona: Int8Array; caixa: number[][] }

/** de onde vem cada zona: célula, zona de origem e se espelha na horizontal/vertical */
type Fonte = (i: number, j: number, s: number) => [number, number, boolean, boolean]

/** Para cada célula: que pixel do quadro cada ponto da célula endireitada lê (o MESMO warp do lerCampo,
 *  aplicado a uma imagem de índices) e a que segmento cada ponto pertence. */
function mapearCelulas(cv: OpenCV, W: number, H: number, campo: CampoDisplay): { cels: Celula[]; env: [number, number, number, number] } | null {
  const cels = celulasAbs(campo)
  const k = fatorK(campo)
  let [x0, y0, x1, y1] = envolvente(cels, k)
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1)
  if (!cels.length || x1 - x0 < 8 || y1 - y0 < 8) return null
  const ew = x1 - x0, eh = y1 - y0
  const ind = new cv.Mat(eh, ew, cv.CV_32FC1)
  const d = ind.data32F
  for (let yy = 0; yy < eh; yy++) for (let xx = 0; xx < ew; xx++) d[yy * ew + xx] = (y0 + yy) * W + x0 + xx
  const rec = new cv.Mat()
  const out: Celula[] = []
  try {
    for (const [x, y, w, h] of cels) {
      const wi = Math.max(4, pyRound(w)), hi = Math.max(4, pyRound(h))
      const M = cv.matFromArray(2, 3, cv.CV_64F, [f32(1), f32(-k), f32(x - x0 + k * hi / 2.0), f32(0), f32(1), f32(y - y0)])
      cv.warpAffine(ind, rec, M, new cv.Size(wi, hi), cv.INTER_NEAREST | cv.WARP_INVERSE_MAP, cv.BORDER_CONSTANT, new cv.Scalar(-1))
      M.delete()
      const r = rec.data32F
      const idx = new Int32Array(wi * hi)
      for (let i = 0; i < idx.length; i++) idx[i] = r[i] < 0 ? -1 : Math.round(r[i])
      const zona = zonas(wi, hi)
      const caixa = Array.from({ length: 7 }, () => [Infinity, Infinity, -Infinity, -Infinity])
      for (let v = 0; v < hi; v++) for (let u = 0; u < wi; u++) {
        const c = caixa[zona[v * wi + u]]
        c[0] = Math.min(c[0], u); c[1] = Math.min(c[1], v); c[2] = Math.max(c[2], u); c[3] = Math.max(c[3], v)
      }
      out.push({ wi, hi, idx, zona, caixa })
    }
  } finally { ind.delete(); rec.delete() }
  return { cels: out, env: [x0, y0, x1, y1] }
}

/** Divide a célula entre os 7 segmentos (o mais perto de cada ponto): a = borda de cima, d = de baixo,
 *  g = meio, b/c = direita em cima/embaixo, e/f = esquerda embaixo/em cima. Não depende da espessura. */
function zonas(w: number, h: number): Int8Array {
  const z = new Int8Array(w * h)
  const hm = h / 2
  const distSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(px - ax - t * dx, py - ay - t * dy)
  }
  // linhas de centro nas bordas da célula (a célula envolve o dígito)
  const L: [number, number, number, number][] = [
    [0, 0, w, 0], [w, 0, w, hm], [w, hm, w, h], [0, h, w, h], [0, hm, 0, h], [0, 0, 0, hm], [0, hm, w, hm],
  ]
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
    let melhor = 0, dm = Infinity
    for (let j = 0; j < 7; j++) {
      const [ax, ay, bx, by] = L[j]
      const dd = distSeg(u + 0.5, v + 0.5, ax, ay, bx, by)
      if (dd < dm) { dm = dd; melhor = j }
    }
    z[v * w + u] = melhor
  }
  return z
}

/** Monta no quadro `dst` (BGR) os dígitos pedidos, copiando cada zona de segmento de uma célula da imagem
 *  original (`orig`) em que aquele segmento tem o estado necessário — a própria célula quando possível. */
function compor(dst: Uint8Array, orig: Uint8Array, cels: Celula[], estados: number[][], fonte: Fonte, alvo: string[]) {
  cels.forEach((T, i) => {
    const pad = PADRAO[alvo[i]] ?? PADRAO[' ']
    for (let v = 0; v < T.hi; v++) for (let u = 0; u < T.wi; u++) {
      const p = v * T.wi + u
      const di = T.idx[p]
      if (di < 0) continue
      const j = T.zona[p], s = pad[j]
      let us: number, vs: number, S: Celula
      if (estados[i][j] === s) { S = T; us = u; vs = v }
      else {
        const [si, sj, espU, espV] = fonte(i, j, s)
        S = cels[si]
        if (sj === j) {   // mesmo segmento em outra célula: mesma posição relativa na célula
          us = Math.round(u * S.wi / T.wi); vs = Math.round(v * S.hi / T.hi)
        } else {          // outro segmento (mesma orientação): mesma posição relativa dentro da zona
          const [a0, b0, a1, b1] = T.caixa[j], [c0, d0, c1, d1] = S.caixa[sj]
          let fu = a1 > a0 ? (u - a0) / (a1 - a0) : 0.5, fv = b1 > b0 ? (v - b0) / (b1 - b0) : 0.5
          if (espU) fu = 1 - fu
          if (espV) fv = 1 - fv
          us = Math.round(c0 + fu * (c1 - c0)); vs = Math.round(d0 + fv * (d1 - d0))
        }
        us = Math.min(S.wi - 1, Math.max(0, us)); vs = Math.min(S.hi - 1, Math.max(0, vs))
      }
      const oi = S.idx[vs * S.wi + us]
      if (oi < 0) continue
      dst[di * 3] = orig[oi * 3]; dst[di * 3 + 1] = orig[oi * 3 + 1]; dst[di * 3 + 2] = orig[oi * 3 + 2]
    }
  })
}

/** Lê os conjuntos de teste com um conjunto de parâmetros: certo/errado por dígito e posição + frações. */
function avaliar(cv: OpenCV, trab: Mat, orig: Uint8Array, cels: Celula[], estados: number[][],
  fonte: Fonte, conjuntos: string[][], campo: CampoDisplay, limiarProprio: boolean): Grade {
  const n = cels.length
  const certos = Array.from({ length: 10 }, () => Array(n).fill(true) as boolean[])
  const erros = new Set<string>()
  let acesoMin = Infinity, apagadoMax = -Infinity
  for (const alvo of conjuntos) {
    compor(trab.data, orig, cels, estados, fonte, alvo)
    const r = lerCampo(cv, trab, campo, 'BGR')
    alvo.forEach((ch, i) => {
      const pad = PADRAO[ch]
      const segs = r.segmentos[i] ?? []
      pad.forEach((s, j) => {
        const fr = segs[j]?.[4] ?? 0
        if (s) acesoMin = Math.min(acesoMin, fr)
        else apagadoMax = Math.max(apagadoMax, fr)
      })
      if (!limiarProprio) return
      const lido = r.texto[i] ?? '?'
      if (lido !== ch && DIGITOS.includes(ch)) { certos[+ch][i] = false; erros.add(`${ch}→${lido === ' ' ? '(apagado)' : lido} na posição ${i + 1}`) }
    })
  }
  return { ok: certos, erros: [...erros], acesoMin, apagadoMax }
}

/** Conjuntos de teste: o valor que está no display, cada dígito em todas as posições e a sequência girando. */
function conjuntosDeTeste(n: number, atual: string): string[][] {
  const c: string[][] = [[...atual]]
  for (let d = 0; d < 10; d++) c.push(Array(n).fill(String(d)))
  for (let d = 0; d < 10; d++) c.push(Array.from({ length: n }, (_, p) => String((d + p) % 10)))
  return c
}

const ROTULO_SEG = (j: number) => SEGMENTOS[j]
/** segmentos que podem emprestar a aparência (mesma orientação; o mais parecido primeiro) */
const SUBSTITUTOS: number[][] = [[3, 6], [5, 2, 4], [4, 1, 5], [0, 6], [2, 5, 1], [1, 4, 2], [0, 3]]
/** lado de cada segmento: [esquerda/direita, em cima/embaixo] (−1, 0 = meio, 1) */
const LADO: [number, number][] = [[0, -1], [1, -1], [1, 1], [0, 1], [-1, 1], [-1, -1], [0, 0]]

/** As frações acesas de cada segmento, como o lerCampo calcula (mesma binarização, mesmo warp, mesmas
 *  regiões), para várias espessuras de uma vez: cb(índice da espessura, dígito, segmento, fração). */
function fracoesPorEspessura(cv: OpenCV, frame: Mat, campo: CampoDisplay, esps: number[], cb: (e: number, i: number, j: number, fr: number) => void) {
  const cels = celulasAbs(campo)
  const k = fatorK(campo)
  const H = frame.rows, W = frame.cols
  let [x0, y0, x1, y1] = envolvente(cels, k)
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1)
  const recorte = frame.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0))
  const b = binarizar(cv, recorte, campo, 'BGR')
  recorte.delete()
  const rec = new cv.Mat()
  try {
    cels.forEach(([x, y, w, h], i) => {
      const wi = Math.max(4, pyRound(w)), hi = Math.max(4, pyRound(h))
      const M = cv.matFromArray(2, 3, cv.CV_64F, [f32(1), f32(-k), f32(x - x0 + k * hi / 2.0), f32(0), f32(1), f32(y - y0)])
      cv.warpAffine(b, rec, M, new cv.Size(wi, hi), cv.INTER_NEAREST | cv.WARP_INVERSE_MAP, cv.BORDER_CONSTANT, new cv.Scalar(0))
      M.delete()
      // soma acumulada 2D de "aceso" (≠ 0) = countNonZero de qualquer retângulo
      const d: Uint8Array = rec.data
      const S = new Int32Array((wi + 1) * (hi + 1))
      for (let v = 0; v < hi; v++) {
        let linha = 0
        for (let u = 0; u < wi; u++) {
          linha += d[v * wi + u] ? 1 : 0
          S[(v + 1) * (wi + 1) + u + 1] = S[v * (wi + 1) + u + 1] + linha
        }
      }
      const conta = (a0: number, b0: number, a1: number, b1: number) =>
        S[b1 * (wi + 1) + a1] - S[b0 * (wi + 1) + a1] - S[b1 * (wi + 1) + a0] + S[b0 * (wi + 1) + a0]
      esps.forEach((esp, e) => {
        regioesSegmentos(wi, hi, esp).forEach(([sx0, sy0, sx1, sy1], j) => {
          const ax0 = Math.min(Math.max(sx0, 0), wi), ay0 = Math.min(Math.max(sy0, 0), hi)
          const ax1 = Math.min(Math.max(sx1, 0), wi), ay1 = Math.min(Math.max(sy1, 0), hi)
          const area = Math.max(0, ax1 - ax0) * Math.max(0, ay1 - ay0)
          cb(e, i, j, area ? conta(ax0, ay0, ax1, ay1) / area : 0.0)
        })
      })
    })
  } finally { rec.delete(); b.delete() }
}

export function autotestar(cv: OpenCV, frame: Mat, campoIn: CampoDisplay): ResultadoAutoteste {
  const campo = { ...campoIn }
  const base = lerCampo(cv, frame, campo, 'BGR')
  const res: ResultadoAutoteste = { campo: campo.nome, leitura: base.texto }
  if (!base.texto || base.texto.includes('?') || base.valor === null) {
    res.erro = `A leitura atual é '${base.texto || '?'}': ajuste o campo até ler o display certo e teste de novo.`
    return res
  }
  const mapa = mapearCelulas(cv, frame.cols, frame.rows, campo)
  if (!mapa || mapa.cels.length !== base.segmentos.length) { res.erro = 'Área do campo fora da imagem.'; return res }
  const { cels, env } = mapa
  const n = cels.length
  const estados = base.segmentos.map(d => d.map(s => (s[5] ? 1 : 0)))
  // de onde copiar cada segmento aceso/apagado: a célula mais próxima que tenha esse segmento nesse estado;
  // se o display não mostra o segmento naquele estado (ex.: em "4000" b, c e f nunca apagam), usa outro
  // segmento da mesma orientação naquele estado (espelhado se estiver do outro lado do dígito)
  const com: number[][][] = [0, 1].map(s => Array.from({ length: 7 }, (_, j) => estados.map((e, i) => (e[j] === s ? i : -1)).filter(i => i >= 0)))
  const perto = (lista: number[], i: number) => lista.reduce((m, c) => (Math.abs(c - i) < Math.abs(m - i) ? c : m), lista[0])
  const faltam: string[] = [], substituidos: string[] = []
  const tabela: ([number, boolean, boolean] | null)[][] = [0, 1].map(s => Array.from({ length: 7 }, (_, j) => {
    if (com[s][j].length) return [j, false, false]
    for (const jj of SUBSTITUTOS[j]) if (com[s][jj].length) {
      substituidos.push(`'${ROTULO_SEG(j)}' ${s ? 'aceso' : 'apagado'} (copiado do '${ROTULO_SEG(jj)}')`)
      return [jj, LADO[j][0] !== LADO[jj][0], LADO[j][1] !== LADO[jj][1]]
    }
    faltam.push(`nenhum segmento ${ROTULO_SEG(j) === 'a' || ROTULO_SEG(j) === 'd' || ROTULO_SEG(j) === 'g' ? 'horizontal' : 'vertical'} aparece ${s ? 'ACESO' : 'APAGADO'}`)
    return null
  }))
  if (faltam.length) {
    res.erro = `Com o display mostrando '${base.texto}', ${[...new Set(faltam)].join('; ')}. `
      + 'Deixe o display num valor com segmentos acesos e apagados (ex.: um 8 junto com um 1 ou um 0) e teste de novo.'
    return res
  }
  res.substituidos = substituidos
  const fonte: Fonte = (i, j, s) => {
    const [jj, eu, ev] = tabela[s][j]!
    return [perto(com[s][jj], i), jj, eu, ev]
  }
  const conjuntos = conjuntosDeTeste(n, base.texto)
  const orig = (frame.data as Uint8Array).slice()
  // quadro de trabalho onde os dígitos são montados (clone() do opencv.js compartilharia os pixels)
  const proprio = new cv.Mat(frame.rows, frame.cols, cv.CV_8UC3)
  proprio.data.set(orig)
  try {
    const folga = (g: Grade, lim: number) => Math.min(g.acesoMin - lim, lim - g.apagadoMax)
    const pAtual: ParamsLeitura = { binarizacao: campo.binarizacao, dilatar: campo.dilatar, espessura: campo.espessura, limiar_segmento: campo.limiar_segmento }
    const gAtual = avaliar(cv, proprio, orig, cels, estados, fonte, conjuntos, campo, true)
    res.atual = { ...gAtual, params: pAtual, folga: folga(gAtual, campo.limiar_segmento) }

    // procura: binarização × dilatar × espessura; o limiar sai do meio entre o aceso mais fraco e o apagado mais forte
    const bins: Binarizacao[] = campo.binarizacao === 'fixa' ? ['fixa', 'otsu', 'adaptativa'] : ['otsu', 'adaptativa']
    const ESPS = Array.from({ length: 12 }, (_, i) => (8 + 2 * i) / 100)
    let melhor = null as { p: ParamsLeitura; folga: number; custo: number } | null
    for (const binarizacao of bins) for (let dilatar = 0; dilatar <= 3; dilatar++) {
      // binariza uma vez por montagem; cada espessura só muda as regiões contadas
      const c = { ...campo, binarizacao, dilatar }
      const acesoMin = ESPS.map(() => Infinity), apagadoMax = ESPS.map(() => -Infinity)
      for (const alvo of conjuntos) {
        compor(proprio.data, orig, cels, estados, fonte, alvo)
        fracoesPorEspessura(cv, proprio, c, ESPS, (e, i, j, fr) => {
          if (PADRAO[alvo[i]][j]) { if (fr < acesoMin[e]) acesoMin[e] = fr }
          else if (fr > apagadoMax[e]) apagadoMax[e] = fr
        })
      }
      ESPS.forEach((espessura, e) => {
        const g = { acesoMin: acesoMin[e], apagadoMax: apagadoMax[e] }
        if (!(g.acesoMin > g.apagadoMax)) return
        const lim = Math.min(0.95, Math.max(0.05, Math.round((g.acesoMin + g.apagadoMax) / 2 * 100) / 100))
        const fg = Math.min(g.acesoMin - lim, lim - g.apagadoMax)
        // empate: prefere mexer menos no que já está
        const custo = (binarizacao !== campo.binarizacao ? 0.004 : 0) + Math.abs(dilatar - campo.dilatar) * 0.002 + Math.abs(espessura - campo.espessura) * 0.05
        if (!melhor || fg - custo > melhor.folga - melhor.custo) melhor = { p: { binarizacao, dilatar, espessura, limiar_segmento: lim }, folga: fg, custo }
      })
    }
    if (melhor) {
      // confere com a leitura de verdade, com o limiar sugerido
      const g = avaliar(cv, proprio, orig, cels, estados, fonte, conjuntos, { ...campo, ...melhor.p }, true)
      res.sugerido = { ...g, params: melhor.p, folga: folga(g, melhor.p.limiar_segmento) }
    } else res.sugerido = null

    // amostras: a sequência girando (cada posição com um dígito diferente), recortada na área do campo
    const [x0, y0, x1, y1] = env
    const m = 6
    const rx0 = Math.max(0, x0 - m), ry0 = Math.max(0, y0 - m), rx1 = Math.min(frame.cols, x1 + m), ry1 = Math.min(frame.rows, y1 + m)
    res.amostras = []
    for (const alvo of conjuntos.slice(11)) {
      compor(proprio.data, orig, cels, estados, fonte, alvo)
      const roi = proprio.roi(new cv.Rect(rx0, ry0, rx1 - rx0, ry1 - ry0))
      const rgba = new cv.Mat()
      cv.cvtColor(roi, rgba, cv.COLOR_BGR2RGBA)
      res.amostras.push({ texto: alvo.join(''), largura: rgba.cols, altura: rgba.rows, dados: (rgba.data as Uint8Array).slice().buffer })
      roi.delete(); rgba.delete()
    }
  } finally { proprio.delete() }
  return res
}

/** Igualar e encaixar: todos os dígitos com o tamanho do `sel`; cada um procura, perto de onde está, a
 *  posição em que os segmentos ficam mais nítidos. Devolve as células novas (x, y, w, h) e o deslocamento. */
export function encaixar(cv: OpenCV, frame: Mat, campo: CampoDisplay, sel: number): { celulas: number[][]; movidos: [number, number][] } {
  const ref = campo.celulas_manuais[sel]
  const [, yr, w, h] = ref
  const k = fatorK(campo)
  const wi = Math.max(4, pyRound(w)), hi = Math.max(4, pyRound(h))
  const rx = Math.max(2, Math.round(w * 0.5)), ry = Math.max(1, Math.round(h * 0.1))
  // binariza uma vez a região que cobre todas as posições possíveis
  const base = campo.celulas_manuais.map(([x, , ww]) => [x + ww / 2 - w / 2, yr, w, h])
  const amplas = base.flatMap(([x, y]) => [[x - rx, y - ry, w, h], [x + rx, y + ry, w, h]])
  let [x0, y0, x1, y1] = envolvente(amplas, k)
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(frame.cols, x1); y1 = Math.min(frame.rows, y1)
  const recorte = frame.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0))
  const b = binarizar(cv, recorte, campo, 'BGR')
  recorte.delete()
  const regs = regioesSegmentos(wi, hi, campo.espessura)
  const rec = new cv.Mat()
  const celulas: number[][] = [], movidos: [number, number][] = []
  try {
    base.forEach(([xb, yb], i) => {
      if (i === sel) { celulas.push([...ref]); movidos.push([0, 0]); return }
      // pixels acesos na janela de busca: sem nada aceso (dígito apagado) não mexe
      const janela = envolvente([[xb - rx, yb - ry, w, h], [xb + rx, yb + ry, w, h]], k)
      const jx0 = Math.max(0, janela[0] - x0), jy0 = Math.max(0, janela[1] - y0)
      const jx1 = Math.min(b.cols, janela[2] - x0), jy1 = Math.min(b.rows, janela[3] - y0)
      const jr = b.roi(new cv.Rect(jx0, jy0, Math.max(1, jx1 - jx0), Math.max(1, jy1 - jy0)))
      const acesosJanela = cv.countNonZero(jr)
      jr.delete()
      let melhor = { s: -Infinity, dx: 0, dy: 0 }
      if (acesosJanela >= 0.02 * w * h) {
        for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
          const x = xb + dx, y = yb + dy
          const M = cv.matFromArray(2, 3, cv.CV_64F, [f32(1), f32(-k), f32(x - x0 + k * hi / 2.0), f32(0), f32(1), f32(y - y0)])
          cv.warpAffine(b, rec, M, new cv.Size(wi, hi), cv.INTER_NEAREST | cv.WARP_INVERSE_MAP, cv.BORDER_CONSTANT, new cv.Scalar(0))
          M.delete()
          let nitidez = 0, dentro = 0
          for (const [sx0, sy0, sx1, sy1] of regs) {
            const ax0 = Math.min(Math.max(sx0, 0), wi), ay0 = Math.min(Math.max(sy0, 0), hi)
            const ax1 = Math.min(Math.max(sx1, 0), wi), ay1 = Math.min(Math.max(sy1, 0), hi)
            const area = Math.max(0, ax1 - ax0) * Math.max(0, ay1 - ay0)
            if (!area) continue
            const r = rec.roi(new cv.Rect(ax0, ay0, ax1 - ax0, ay1 - ay0))
            const ac = cv.countNonZero(r)
            r.delete()
            nitidez += Math.abs(ac / area - campo.limiar_segmento)
            dentro += ac
          }
          const total = cv.countNonZero(rec)
          // segmentos nítidos + o dígito inteiro dentro da célula (e não cortado) − um pouco por se afastar
          const s = nitidez + 2 * (total ? dentro / total : 0) * Math.min(1, total / Math.max(1, acesosJanela)) - 0.002 * (Math.abs(dx) + Math.abs(dy))
          if (s > melhor.s) melhor = { s, dx, dy }
        }
      }
      celulas.push([Math.round((xb + melhor.dx) * 10) / 10, Math.round((yb + melhor.dy) * 10) / 10, w, h])
      movidos.push([melhor.dx, melhor.dy])
    })
  } finally { rec.delete(); b.delete() }
  return { celulas, movidos }
}
