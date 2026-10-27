// VIGIA-7S no app — tratamento do quadro da câmera (porte de Camera._perspectiva / _zoom_digital /
// _filtrar / média temporal e ordenar_cantos de vigia7s/app.py), com as mesmas funções do OpenCV.
// O quadro trabalha em BGR, como no Python (o navegador entrega RGBA: converte na entrada).
import type { OpenCV, Mat } from '@/lib/vigia/seg7'
import { FILTROS_PADRAO, type Filtros } from '@/lib/vigia/config'

/** Ordena 4 pontos como: sup. esq., sup. dir., inf. dir., inf. esq. (np.argmin/argmax: 1º empate). */
export function ordenarCantos(pts: number[][]): number[][] {
  const p = pts.map(([x, y]) => [Math.fround(x), Math.fround(y)])
  const s = p.map(([x, y]) => Math.fround(x + y)), d = p.map(([x, y]) => Math.fround(y - x))
  const argmin = (v: number[]) => v.indexOf(Math.min(...v)), argmax = (v: number[]) => v.indexOf(Math.max(...v))
  return [p[argmin(s)], p[argmin(d)], p[argmax(s)], p[argmax(d)]]
}

export class ProcessadorCamera {
  filtros: Filtros = { ...FILTROS_PADRAO }
  zoomDig = 1.0
  desloc: [number, number] = [0, 0]
  /** true enquanto o operador clica os cantos da perspectiva (mostra o quadro bruto) */
  bruto = false
  private media: Mat | null = null
  private perspCache: { chave: string; M: Mat } | null = null
  private clahe: Mat | null = null

  constructor(private cv: OpenCV) {}

  /** aplicar(): zoom digital, deslocamento e filtros (a câmera em si é configurada pelo navegador). */
  aplicar(cfg: { zoom_digital?: number; desloc_x?: number; desloc_y?: number; filtros?: Partial<Filtros> }) {
    this.zoomDig = Math.max(1.0, Number(cfg.zoom_digital ?? 1.0))
    this.desloc = [Number(cfg.desloc_x ?? 0), Number(cfg.desloc_y ?? 0)]
    const novos = { ...FILTROS_PADRAO, ...(cfg.filtros ?? {}) }
    if (novos.media_n !== this.filtros.media_n) this.zerarMedia()
    this.filtros = novos
  }

  zerarMedia() { this.media?.delete(); this.media = null }

  /** Média temporal: acumula a cada quadro recebido (cv2.accumulateWeighted + convertScaleAbs). Devolve um Mat novo. */
  acumular(f: Mat): Mat {
    const cv = this.cv
    const n = Math.trunc(this.filtros.media_n || 1)
    if (n <= 1) return f.clone()
    if (!this.media || this.media.rows !== f.rows || this.media.cols !== f.cols) {
      this.zerarMedia()
      this.media = new cv.Mat()
      f.convertTo(this.media, cv.CV_32FC3)
    } else {
      cv.accumulateWeighted(f, this.media, 1.0 / n)
    }
    const out = new cv.Mat()
    cv.convertScaleAbs(this.media, out)
    return out
  }

  private perspectiva(f: Mat): Mat {
    const cv = this.cv
    const pts = this.filtros.perspectiva || []
    if (pts.length !== 4) return f.clone()
    const w = f.cols, h = f.rows
    const chave = JSON.stringify([pts, w, h])
    if (this.perspCache?.chave !== chave) {
      const src = ordenarCantos(pts)
      const dist = (a: number[], b: number[]) => Math.fround(Math.hypot(a[0] - b[0], a[1] - b[1]))
      const larg = Math.max(dist(src[1], src[0]), dist(src[2], src[3]))
      const alt = Math.max(dist(src[3], src[0]), dist(src[2], src[1]))
      const esc = Math.min(w / larg, h / alt)
      const dw = larg * esc, dh = alt * esc
      const ox = (w - dw) / 2, oy = (h - dh) / 2
      const f32 = (v: number[]) => cv.matFromArray(4, 1, cv.CV_32FC2, v.map(Math.fround))
      const mSrc = f32(src.flat()), mDst = f32([ox, oy, ox + dw, oy, ox + dw, oy + dh, ox, oy + dh])
      this.perspCache?.M.delete()
      this.perspCache = { chave, M: cv.getPerspectiveTransform(mSrc, mDst) }
      mSrc.delete(); mDst.delete()
    }
    const out = new cv.Mat()
    cv.warpPerspective(f, out, this.perspCache.M, new cv.Size(w, h), cv.INTER_CUBIC)
    return out
  }

  /** Recorta a região ampliada (com deslocamento X/Y de -1 a 1) e volta ao tamanho original. */
  private zoomDigital(f: Mat): Mat {
    const cv = this.cv
    const z = this.zoomDig
    if (z <= 1.001) return f.clone()
    const h = f.rows, w = f.cols
    const cw = Math.trunc(w / z), ch = Math.trunc(h / z)
    const [dx, dy] = this.desloc
    const x = Math.trunc(Math.min(Math.max(0, (w - cw) / 2 * (1 + dx)), w - cw))
    const y = Math.trunc(Math.min(Math.max(0, (h - ch) / 2 * (1 + dy)), h - ch))
    const r = f.roi(new cv.Rect(x, y, cw, ch))
    const out = new cv.Mat()
    cv.resize(r, out, new cv.Size(w, h), 0, 0, cv.INTER_CUBIC)
    r.delete()
    return out
  }

  private filtrar(f: Mat): Mat {
    const cv = this.cv
    const p = this.filtros
    let atual = f
    const trocar = (novo: Mat) => { if (atual !== f) atual.delete(); atual = novo }
    let k = Math.trunc(p.mediana || 0)
    if (k >= 3) { const o = new cv.Mat(); cv.medianBlur(atual, o, k | 1); trocar(o) }
    k = Math.trunc(p.desfoque || 0)
    if (k >= 3) { const o = new cv.Mat(); cv.GaussianBlur(atual, o, new cv.Size(k | 1, k | 1), 0, 0, cv.BORDER_DEFAULT); trocar(o) }
    const c = Number(p.contraste ?? 1.0), b = Number(p.brilho ?? 0.0)
    if (Math.abs(c - 1.0) > 0.01 || Math.abs(b) > 0.5) { const o = new cv.Mat(); cv.convertScaleAbs(atual, o, c, b); trocar(o) }
    if (p.clahe) {
      this.clahe ??= new cv.CLAHE(2.0, new cv.Size(8, 8))
      const lab = new cv.Mat()
      cv.cvtColor(atual, lab, cv.COLOR_BGR2Lab)
      const canais = new cv.MatVector()
      cv.split(lab, canais)
      const l = canais.get(0), l2 = new cv.Mat()
      this.clahe.apply(l, l2)
      canais.set(0, l2)
      cv.merge(canais, lab)
      const o = new cv.Mat()
      cv.cvtColor(lab, o, cv.COLOR_Lab2BGR)
      l.delete(); l2.delete(); canais.delete(); lab.delete()
      trocar(o)
    }
    const a = Number(p.nitidez ?? 0.0)
    if (a > 0.01) {
      const borrada = new cv.Mat()
      cv.GaussianBlur(atual, borrada, new cv.Size(0, 0), 3, 0, cv.BORDER_DEFAULT)
      const o = new cv.Mat()
      cv.addWeighted(atual, 1 + a, borrada, -a, 0, o)
      borrada.delete()
      trocar(o)
    }
    return atual === f ? f.clone() : atual
  }

  /** Quadro processado: perspectiva -> zoom digital -> filtros (como Camera.obter). Devolve um Mat novo. */
  obter(f: Mat): Mat {
    if (this.bruto) return f.clone()
    const p = this.perspectiva(f)
    const z = this.zoomDigital(p); p.delete()
    const r = this.filtrar(z); z.delete()
    return r
  }

  liberar() {
    this.zerarMedia()
    this.perspCache?.M.delete(); this.perspCache = null
    this.clahe?.delete?.(); this.clahe = null
  }
}
