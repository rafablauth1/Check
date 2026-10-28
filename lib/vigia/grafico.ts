// VIGIA-7S no app — gráfico erro × frequência (como os do FOR EMC38, com acabamento para relatório):
// porte de vigia7s/grafico.py (Pillow) para canvas. Eixo de frequência logarítmico, faixa de aprovação ±limite,
// pontos reprovados em destaque, faixas de antena sombreadas e uma série por bloco (polarização/face).
import { fixo } from '@/lib/vigia/util'

const CORES = [[31, 119, 180], [44, 160, 44], [148, 103, 189], [255, 127, 14], [23, 190, 207], [140, 86, 75],
  [227, 119, 194], [127, 127, 127], [188, 189, 34], [57, 59, 121]]
const VERMELHO = [200, 30, 30]
const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`

const _br = (v: number, casas: number) => fixo(v, casas).replace('.', ',')

/** Marcas 1-2-5 (e 3, 8 quando couber) entre fmin e fmax (MHz). */
function _ticks_log(fmin: number, fmax: number): number[] {
  let out: number[] = []
  let dec = 10 ** Math.floor(Math.log10(fmin))
  while (dec <= fmax * 10) {
    for (const m of [1, 2, 3, 5, 8]) {
      const v = m * dec
      if (fmin * 0.999 <= v && v <= fmax * 1.001) out.push(v)
    }
    dec *= 10
  }
  if (out.length > 14) out = out.filter(v => '125'.includes(String(v).replace(/^[0.]+/, '')[0]))
  return out
}

function _fmt_freq(v: number): string {
  if (v >= 1000) return _br(v / 1000, v % 1000 === 0 ? 0 : 1) + ' GHz'
  if (v < 1) return _br(v * 1000, 0) + ' kHz'
  return _br(v, v === Math.trunc(v) ? 0 : 2) + ' MHz'
}

type Ancora = 'mm' | 'rm' | 'mt' | 'rb' | 'rt' | 'lm'
function texto(d: CanvasRenderingContext2D, x: number, y: number, t: string, fonte: string, cor: string, a: Ancora) {
  d.font = fonte
  d.fillStyle = cor
  d.textAlign = a[0] === 'm' ? 'center' : a[0] === 'r' ? 'right' : 'left'
  d.textBaseline = a[1] === 'm' ? 'middle' : a[1] === 't' ? 'top' : 'bottom'
  d.fillText(t, x, y)
}

export interface Serie { nome: string; pontos: [number, number | null][] }

/** series: [{nome, pontos: [(freq_MHz, erro_pct), ...]}]; limite: % (faixa ±limite);
 *  faixas: [(nome, fmin, fmax)] sombreadas. Retorna um canvas (1500 × 760). */
export function grafico_erro_frequencia(series: Serie[], limite: number, titulo = '', faixas: [string, number, number][] | null = null,
  largura = 1500, altura = 760, log = true): HTMLCanvasElement {
  const pts = series.flatMap(s => s.pontos).filter((p): p is [number, number] => !!p[0] && p[0] > 0 && p[1] !== null)
  const cv = document.createElement('canvas')
  cv.width = largura; cv.height = altura
  const d = cv.getContext('2d')!
  d.fillStyle = '#fff'
  d.fillRect(0, 0, largura, altura)
  const f_tit = 'bold 26px "Segoe UI", Arial', f_eixo = 'bold 20px "Segoe UI", Arial', f_tick = '17px "Segoe UI", Arial', f_leg = f_tick
  const ml = 110, mr = 40, mt = titulo ? 70 : 30, mb = 130
  const x0 = ml, x1 = largura - mr, y0 = mt, y1 = altura - mb
  if (titulo) texto(d, (x0 + x1) / 2, 30, titulo, f_tit, 'rgb(30,30,30)', 'mm')
  if (!pts.length) {
    texto(d, (x0 + x1) / 2, (y0 + y1) / 2, 'Sem leituras com frequência', f_eixo, 'rgb(120,120,120)', 'mm')
    return cv
  }
  let fmin = Math.min(...pts.map(([f]) => f))
  let fmax = Math.max(...pts.map(([f]) => f))
  if (faixas && faixas.length) {
    fmin = Math.min(fmin, Math.min(...faixas.filter(([, a]) => a).map(([, a]) => a)))
    fmax = Math.max(fmax, Math.max(...faixas.filter(([, , b]) => b).map(([, , b]) => b)))
  }
  if (fmax <= fmin) fmax = fmin * 1.1
  const emax = Math.max(...pts.map(([, e]) => Math.abs(e)))
  let lim_y = Math.max(limite ? limite * 1.6 : 0.5, emax * 1.15)
  const passo = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50].find(p => lim_y / p <= 6) ?? 50
  lim_y = Math.ceil(lim_y / passo) * passo

  const X = (f: number) => log
    ? x0 + (Math.log10(f) - Math.log10(fmin)) / (Math.log10(fmax) - Math.log10(fmin)) * (x1 - x0)
    : x0 + (f - fmin) / (fmax - fmin) * (x1 - x0)
  const Y = (e: number) => y0 + (lim_y - e) / (2 * lim_y) * (y1 - y0)
  const linha = (pts2: [number, number][], cor: string, w: number) => {
    d.strokeStyle = cor; d.lineWidth = w
    d.beginPath()
    pts2.forEach(([x, y], i) => (i ? d.lineTo(x, y) : d.moveTo(x, y)))
    d.stroke()
  }

  // faixas de antena sombreadas
  ;(faixas ?? []).forEach(([nome, a, b], k) => {
    if (!a || !b) return
    const xa = X(Math.max(a, fmin)), xb = X(Math.min(b, fmax))
    if (k % 2 === 0) { d.fillStyle = 'rgb(244,246,250)'; d.fillRect(xa, y0, xb - xa, y1 - y0) }
    texto(d, (xa + xb) / 2, y0 + 14, nome, f_tick, 'rgb(110,115,125)', 'mm')
  })
  // faixa de aprovação
  if (limite) { d.fillStyle = 'rgb(232,245,233)'; d.fillRect(x0, Y(limite), x1 - x0, Y(-limite) - Y(limite)) }
  // grade
  for (let v = -lim_y; v <= lim_y + 1e-9; v += passo) {
    const y = Y(v)
    linha([[x0, y], [x1, y]], 'rgb(225,228,232)', 1)
    texto(d, x0 - 12, y, _br(v, passo < 0.1 ? 2 : passo < 1 ? 1 : 0), f_tick, 'rgb(70,70,70)', 'rm')
  }
  for (const f of log ? _ticks_log(fmin, fmax) : []) {
    const x = X(f)
    linha([[x, y0], [x, y1]], 'rgb(225,228,232)', 1)
    texto(d, x, y1 + 12, _fmt_freq(f), f_tick, 'rgb(70,70,70)', 'mt')
  }
  linha([[x0, Y(0)], [x1, Y(0)]], 'rgb(150,150,150)', 2)
  // limites ±
  if (limite) {
    for (const s of [1, -1]) {
      const y = Y(s * limite)
      for (let xs = Math.trunc(x0); xs < Math.trunc(x1); xs += 22) linha([[xs, y], [Math.min(xs + 12, x1), y]], rgb(VERMELHO), 3)
    }
    texto(d, x1 - 6, Y(limite) - 6, `+${_br(limite, 2)} %`, f_tick, rgb(VERMELHO), 'rb')
    texto(d, x1 - 6, Y(-limite) + 6, `−${_br(limite, 2)} %`, f_tick, rgb(VERMELHO), 'rt')
  }
  d.strokeStyle = 'rgb(90,90,90)'; d.lineWidth = 2
  d.strokeRect(x0, y0, x1 - x0, y1 - y0)
  // séries
  series.forEach((s, k) => {
    const cor = rgb(CORES[k % CORES.length])
    const ps = s.pontos.filter((p): p is [number, number] => !!p[0] && p[0] > 0 && p[1] !== null).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    if (ps.length > 1) { d.lineJoin = 'round'; linha(ps.map(([f, e]) => [X(f), Y(e)]), cor, 2) }
    for (const [f, e] of ps) {
      const x = X(f), y = Y(Math.max(-lim_y, Math.min(lim_y, e)))
      const fora = limite && Math.abs(Number(fixo(e, 3))) >= limite - 1e-9
      const r = fora ? 8 : 5
      d.beginPath(); d.arc(x, y, r, 0, 2 * Math.PI)
      d.fillStyle = fora ? rgb(VERMELHO) : cor; d.fill()
      d.strokeStyle = '#fff'; d.lineWidth = 1; d.stroke()
    }
  })
  // eixos
  texto(d, (x0 + x1) / 2, altura - 70, 'Frequência', f_eixo, 'rgb(30,30,30)', 'mm')
  d.save()
  d.translate(14 + 20, (y0 + y1) / 2)
  d.rotate(-Math.PI / 2)
  texto(d, 0, 0, 'Erro [% L]', f_eixo, 'rgb(30,30,30)', 'mm')
  d.restore()
  // legenda
  const itens: [string, string][] = series.map((s, k) => [s, k] as const).filter(([s]) => s.pontos.length)
    .map(([s, k]) => [s.nome, rgb(CORES[k % CORES.length])])
  if (limite) itens.push([`reprovado (|erro| ≥ ${_br(limite, 2)} %)`, rgb(VERMELHO)])
  let xl = x0
  const yl = altura - 38
  d.font = f_leg
  for (const [nome, cor] of itens) {
    const larg = d.measureText(nome).width + 40
    if (xl + larg > x1) break
    d.beginPath(); d.ellipse(xl + 7, yl, 7, 7, 0, 0, 2 * Math.PI); d.fillStyle = cor; d.fill()
    texto(d, xl + 20, yl, nome, f_leg, 'rgb(40,40,40)', 'lm')
    xl += larg
  }
  return cv
}
