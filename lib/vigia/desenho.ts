// VIGIA-7S no app — desenho sobre o quadro (porte de desenhar_campos / imagem_debug de seg7.py e do
// Visor de app.py) num canvas 2D. Desenha em coordenadas da imagem (mesma espessura de linha e
// escala de texto do OpenCV) e depois reduz para a tela, como o Python faz com cv2.resize(INTER_AREA).
import {
  celulasAbs, envolvente, fatorK, formatar, legivel, poligono, type CampoDisplay, type ResultadoCampo,
} from '@/lib/vigia/seg7'

/** BGR do OpenCV → cor CSS */
const bgr = (b: number, g: number, r: number) => `rgb(${r},${g},${b})`

/** cv2.FONT_HERSHEY_SIMPLEX escala 1.0 ≈ 22 px de altura de maiúscula */
const fonteHershey = (escala: number) => `${Math.round(30 * escala)}px Arial, sans-serif`
const alturaHershey = (escala: number) => Math.round(22 * escala)

/** unicodedata.normalize("NFKD", s).encode("ascii", "ignore") — o OpenCV não desenha acentos */
export const semAcento = (s: string) => s.normalize('NFKD').replace(/[^\x00-\x7f]/g, '')

export function desenharCampos(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, alturaQuadro: number,
  campos: CampoDisplay[], resultados?: Record<string, ResultadoCampo> | null,
  selecionado?: number | null, celulaSel?: number | null,
) {
  ctx.save()
  ctx.lineJoin = 'miter'
  campos.forEach((c, i) => {
    const cels = celulasAbs(c)
    if (!cels.length) return
    const res = resultados?.[c.nome]
    let cor = bgr(0, 200, 255)
    if (res) cor = legivel(res) ? bgr(0, 210, 0) : bgr(0, 0, 255)
    const k = fatorK(c)
    cels.forEach((cel, j) => {
      const pts = poligono(cel, k).map(([x, y]) => [Math.trunc(x), Math.trunc(y)])
      ctx.beginPath()
      pts.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      if (i === selecionado && j === celulaSel) { ctx.strokeStyle = bgr(0, 235, 255); ctx.lineWidth = 3 }
      else { ctx.strokeStyle = i === selecionado ? cor : bgr(255, 140, 0); ctx.lineWidth = i === selecionado ? 2 : 1 }
      ctx.stroke()
    })
    const [x, y] = envolvente(cels, k)
    let rotulo = c.nome
    if (res) rotulo += ': ' + (legivel(res) ? formatar(c, res.valor) : `'${res.texto}'`)
    rotulo = semAcento(rotulo)
    const escala = Math.max(0.5, alturaQuadro / 900)
    ctx.font = fonteHershey(escala)
    const tw = Math.round(ctx.measureText(rotulo).width), th = alturaHershey(escala)
    const ty = y - th - 10 > 0 ? y - 6 : y + Math.trunc(cels[0][3]) + th + 6
    ctx.fillStyle = '#000'
    ctx.fillRect(x, ty - th - 4, tw + 7, th + 9)
    ctx.fillStyle = cor
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(rotulo, x + 3, ty)
  })
  ctx.restore()
}

/** Pontos clicados da perspectiva (círculos amarelos numerados ligados por linha). */
export function desenharPerspectiva(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, pts: number[][]) {
  ctx.save()
  const am = bgr(0, 235, 255)
  ctx.fillStyle = am; ctx.strokeStyle = am; ctx.lineWidth = 2
  ctx.font = fonteHershey(1.0)
  pts.forEach(([px, py], i) => {
    ctx.beginPath(); ctx.arc(Math.trunc(px), Math.trunc(py), 8, 0, 2 * Math.PI); ctx.fill()
    ctx.fillText(String(i + 1), Math.trunc(px) + 10, Math.trunc(py) - 10)
  })
  if (pts.length > 1) {
    ctx.beginPath()
    pts.forEach(([x, y], n) => (n ? ctx.lineTo(Math.trunc(x), Math.trunc(y)) : ctx.moveTo(Math.trunc(x), Math.trunc(y))))
    ctx.stroke()
  }
  ctx.restore()
}

/** Cada dígito recortado e endireitado, com os segmentos (verde=aceso, vermelho=apagado). */
export function imagemDebug(res: ResultadoCampo, altura = 140): HTMLCanvasElement | null {
  if (!res.recortes?.length) return null
  const blocos = res.recortes.map(r => Math.max(1, Math.trunc(r.largura * (altura / r.altura))))
  const larg = blocos.reduce((a, b) => a + b, 0) + 6 * (blocos.length - 1)
  const cnv = document.createElement('canvas')
  cnv.width = larg; cnv.height = altura
  const ctx = cnv.getContext('2d')!
  ctx.fillStyle = 'rgb(40,40,40)'
  ctx.fillRect(0, 0, larg, altura)
  ctx.imageSmoothingEnabled = false   // INTER_NEAREST
  let x = 0
  res.recortes.forEach((rec, i) => {
    const esc = altura / rec.altura, w = blocos[i]
    // binária ×0,6 (255 → 153)
    const img = new ImageData(rec.largura, rec.altura)
    for (let p = 0; p < rec.dados.length; p++) {
      const v = Math.trunc(rec.dados[p] * 0.6)
      img.data[4 * p] = v; img.data[4 * p + 1] = v; img.data[4 * p + 2] = v; img.data[4 * p + 3] = 255
    }
    const tmp = document.createElement('canvas')
    tmp.width = rec.largura; tmp.height = rec.altura
    tmp.getContext('2d')!.putImageData(img, 0, 0)
    ctx.drawImage(tmp, x, 0, w, altura)
    for (const [x0, y0, x1, y1, , lig] of res.segmentos[i] ?? []) {
      ctx.strokeStyle = lig ? bgr(0, 220, 0) : bgr(0, 0, 230)
      ctx.lineWidth = lig ? 2 : 1
      const a = Math.trunc(x0 * esc), b = Math.trunc(y0 * esc), c = Math.trunc(x1 * esc) - 1, d = Math.trunc(y1 * esc) - 1
      ctx.strokeRect(x + a + 0.5, b + 0.5, c - a, d - b)
    }
    ctx.strokeStyle = bgr(255, 140, 0); ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, 0.5, w - 1, altura - 1)
    x += w + 6
  })
  return cnv
}

/** Visor: mostra o quadro ajustado ao canvas (fundo #111) e converte coordenadas tela ↔ imagem. */
export class Visor {
  escala = 1.0
  off: [number, number] = [0, 0]

  mostrar(canvas: HTMLCanvasElement, quadro: CanvasImageSource, w: number, h: number) {
    const cw = canvas.clientWidth, ch = canvas.clientHeight
    if (cw < 20 || ch < 20) return
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch }
    const ctx = canvas.getContext('2d')!
    const s = Math.min(cw / w, ch / h)
    const nw = Math.max(1, Math.trunc(w * s)), nh = Math.max(1, Math.trunc(h * s))
    const ox = Math.trunc((cw - nw) / 2), oy = Math.trunc((ch - nh) / 2)
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, cw, ch)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(quadro, ox, oy, nw, nh)
    this.escala = s; this.off = [ox, oy]
  }

  paraImagem(cx: number, cy: number): [number, number] {
    return [(cx - this.off[0]) / this.escala, (cy - this.off[1]) / this.escala]
  }

  paraCanvas(x: number, y: number): [number, number] {
    return [x * this.escala + this.off[0], y * this.escala + this.off[1]]
  }
}
