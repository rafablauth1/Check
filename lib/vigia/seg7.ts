// VIGIA-7S no app — leitura de displays de 7 segmentos por amostragem dos segmentos.
// Porte fiel de vigia7s/seg7.py (VIGIA-7S validado), com o MESMO OpenCV (opencv.js 5.0.0 =
// cv2 5.0.0 do Python): cada passo usa a mesma função, com os mesmos parâmetros, para dar o
// mesmo resultado. Pontos em que JavaScript e Python diferem e que importam aqui:
//   - round() do Python arredonda o ".5" para o PAR (round(2.5) = 2): usar pyRound;
//   - a matriz do warpAffine é float32 no Python (np.float32): Math.fround em cada termo;
//   - percentil do NumPy (interpolação linear).
//
// Cada "campo" do display (ex.: Litros) tem N dígitos. Cada dígito tem a sua célula: um
// paralelogramo (retângulo inclinado pelo ângulo de itálico do campo), gerada dividindo a área
// do campo em partes iguais ou ajustada uma a uma. Para cada célula, verifica-se a fração de
// pixels acesos em cada um dos 7 segmentos (a..g) e consulta-se a tabela. O ponto decimal não é
// detectado: a posição é fixa (casas decimais).

/* opencv.js não traz tipos completos; o objeto `cv` é passado por quem chama (carregado uma vez). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenCV = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Mat = any

// Ordem dos segmentos: a (topo), b (sup. dir.), c (inf. dir.), d (base), e (inf. esq.), f (sup. esq.), g (meio)
export const SEGMENTOS = 'abcdefg'

export const TABELA: Record<string, string> = {
  '1111110': '0',
  '0110000': '1',
  '1101101': '2',
  '1111001': '3',
  '0110011': '4',
  '1011011': '5',
  '1011111': '6',
  '0011111': '6',  // 6 sem traço superior
  '1110000': '7',
  '1110010': '7',  // 7 com segmento f
  '1111111': '8',
  '1111011': '9',
  '1110011': '9',  // 9 sem traço inferior
  '0000000': ' ',  // dígito apagado (zeros à esquerda)
  '0000001': '-',
}

export type Binarizacao = 'otsu' | 'adaptativa' | 'fixa'

export interface CampoDisplay {
  nome: string
  roi: [number, number, number, number]   // x, y, w, h (pixels)
  digitos: number
  decimais: number
  largura_digito: number      // fração do passo entre dígitos ocupada pelo dígito
  inclinacao: number          // graus (+ = dígitos inclinados para a direita, itálico)
  espessura: number           // espessura do segmento / altura do dígito
  limiar_segmento: number     // fração de pixels acesos p/ considerar segmento ligado
  binarizacao: Binarizacao
  limiar_fixo: number
  inverter: boolean           // true p/ LCD (dígito escuro sobre fundo claro)
  dilatar: number
  validar: boolean
  esperado: number
  tolerancia: number
  celulas_manuais: number[][] // [[x, y, w, h]] por dígito, pixels da imagem
}

export const CAMPO_PADRAO: CampoDisplay = {
  nome: 'Litros', roi: [0, 0, 0, 0], digitos: 6, decimais: 2, largura_digito: 0.75, inclinacao: 0, espessura: 0.15,
  limiar_segmento: 0.40, binarizacao: 'otsu', limiar_fixo: 128, inverter: false, dilatar: 1, validar: false,
  esperado: 0, tolerancia: 0, celulas_manuais: [],
}

/** Campo a partir de um objeto salvo (ignora chaves desconhecidas; o que faltar vem do padrão). */
export function campoDe(d: Partial<CampoDisplay>): CampoDisplay {
  const out = { ...CAMPO_PADRAO, celulas_manuais: [] as number[][] } as CampoDisplay
  for (const k of Object.keys(CAMPO_PADRAO) as (keyof CampoDisplay)[]) {
    if (d[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = d[k]
  }
  return out
}

/** round() do Python 3: metade vai para o par. */
export function pyRound(x: number): number {
  const f = Math.floor(x), d = x - f
  if (d > 0.5) return f + 1
  if (d < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}

const pyInt = (x: number) => Math.trunc(x)   // int() do Python: trunca em direção ao zero

export function formatar(campo: CampoDisplay, valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '---'
  return valor.toFixed(campo.decimais).replace('.', ',')
}

export const fatorK = (campo: CampoDisplay) => Math.tan(campo.inclinacao * Math.PI / 180)
export const ehManual = (campo: CampoDisplay) => campo.celulas_manuais.length === Math.trunc(campo.digitos) && campo.digitos > 0

export interface ResultadoCampo {
  texto: string
  valor: number | null
  /** por dígito: [x0, y0, x1, y1, fração, ligado] de cada segmento */
  segmentos: [number, number, number, number, number, boolean][][]
  /** imagem binária de cada dígito (endireitada) — só quando pedida (calibração) */
  recortes?: { largura: number; altura: number; dados: Uint8Array }[]
}
export const legivel = (r: ResultadoCampo) => r.valor !== null

// ----------------------------------------------------------------------------- geometria
/** Divisão automática: células (x, y, w, h) relativas à área do campo.
 *  A área marcada envolve os dígitos inclinados; já endireitados, eles ficam
 *  |tan(inclinação)| * h / 2 afastados de cada borda lateral. */
export function celulas(campo: CampoDisplay, w: number, h: number): [number, number, number, number][] {
  const n = Math.max(1, Math.trunc(campo.digitos))
  const r = Math.min(1.0, Math.max(0.2, campo.largura_digito))
  let margem = Math.abs(fatorK(campo)) * h / 2.0
  margem = Math.min(margem, w / 4.0)
  const util = w - 2 * margem
  const passo = util / (n - 1 + r)
  const dw = r * passo
  return Array.from({ length: n }, (_, i) => [margem + i * passo, 0.0, Math.max(1.0, dw), h] as [number, number, number, number])
}

/** Células de todos os dígitos em coordenadas da imagem: [[x, y, w, h]]. */
export function celulasAbs(campo: CampoDisplay): number[][] {
  if (ehManual(campo)) return campo.celulas_manuais.map(c => c.map(Number))
  const [x, y, w, h] = campo.roi.map(Number)
  if (w < 2 || h < 2) return []
  return celulas(campo, w, h).map(([cx, cy, cw, ch]) => [x + cx, y + cy, cw, ch])
}

/** Os 4 cantos da célula inclinada (sup. esq., sup. dir., inf. dir., inf. esq.). */
export function poligono(cel: number[], k: number): [number, number][] {
  const [x, y, w, h] = cel
  const p = (u: number, v: number): [number, number] => [x + u - k * (v - h / 2.0), y + v]
  return [p(0, 0), p(w, 0), p(w, h), p(0, h)]
}

/** Converte um ponto da imagem para coordenadas (u, v) dentro da célula endireitada. */
export function paraCelula(cel: number[], k: number, px: number, py: number): [number, number] {
  const [x, y, , h] = cel
  const v = py - y
  return [px - x + k * (v - h / 2.0), v]
}

export function envolvente(cels: number[][], k: number): [number, number, number, number] {
  const pts = cels.flatMap(c => poligono(c, k))
  if (!pts.length) return [0, 0, 0, 0]
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  return [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))]
}

/** Com células manuais, a área do campo passa a ser a envolvente delas. */
export function ajustarRoi(campo: CampoDisplay) {
  if (!ehManual(campo)) return
  const [x0, y0, x1, y1] = envolvente(celulasAbs(campo), fatorK(campo))
  campo.roi = [x0, y0, x1 - x0, y1 - y0]
}

// ----------------------------------------------------------------------------- leitura
/** np.percentile (interpolação linear) de uma imagem 8 bits, pelo histograma. */
function percentil(gray: Mat, q: number): number {
  const dados: Uint8Array = gray.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < dados.length; i++) hist[dados[i]]++
  const n = dados.length
  const pos = (n - 1) * q / 100
  const lo = Math.floor(pos), frac = pos - lo
  const valorEm = (idx: number) => {
    let acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > idx) return v }
    return 255
  }
  const a = valorEm(lo)
  return frac > 0 ? a + (valorEm(Math.min(n - 1, lo + 1)) - a) * frac : a
}

/** Imagem binária com os segmentos acesos em branco (255). Quem chama libera o Mat devolvido. */
export function binarizar(cv: OpenCV, roi: Mat, campo: CampoDisplay, formato: 'BGR' | 'RGBA' | 'GRAY' = 'BGR'): Mat {
  const gray = new cv.Mat()
  if (formato === 'GRAY') roi.copyTo(gray)
  else cv.cvtColor(roi, gray, formato === 'RGBA' ? cv.COLOR_RGBA2GRAY : cv.COLOR_BGR2GRAY)
  if (campo.inverter) cv.bitwise_not(gray, gray)                      // 255 - gray
  cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT)
  const w = gray.cols, h = gray.rows
  const b = new cv.Mat()
  try {
    if (campo.binarizacao === 'fixa') {
      cv.threshold(gray, b, Math.trunc(campo.limiar_fixo), 255, cv.THRESH_BINARY)
    } else {
      // display apagado / sem contraste: evita que o Otsu "invente" segmentos no ruído
      if (percentil(gray, 99) - percentil(gray, 1) < 25) return cv.Mat.zeros(h, w, cv.CV_8UC1)
      if (campo.binarizacao === 'adaptativa') {
        const bloco = Math.max(3, Math.floor(Math.min(w, h) / 2) | 1)
        cv.adaptiveThreshold(gray, b, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, bloco, -5)
      } else {
        cv.threshold(gray, b, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
      }
    }
    // remove pontos isolados (ruído de vídeo/TV) antes de engrossar os segmentos
    const k3 = cv.Mat.ones(3, 3, cv.CV_8U)
    cv.morphologyEx(b, b, cv.MORPH_OPEN, k3)
    if (campo.dilatar > 0) cv.dilate(b, b, k3, new cv.Point(-1, -1), Math.trunc(campo.dilatar))
    k3.delete()
    return b.clone()
  } finally {
    gray.delete(); b.delete()
  }
}

/** Retângulos (x0, y0, x1, y1) de cada segmento, relativos à célula do dígito. */
export function regioesSegmentos(dw: number, h: number, esp: number): [number, number, number, number][] {
  let t = Math.max(1.0, esp * h)
  t = Math.min(t, dw / 3.0)
  const hm = h / 2.0
  const regs: [number, number, number, number][] = [
    [t, 0, dw - t, t],                    // a
    [dw - t, t, dw, hm - t / 2],          // b
    [dw - t, hm + t / 2, dw, h - t],      // c
    [t, h - t, dw - t, h],                // d
    [0, hm + t / 2, t, h - t],            // e
    [0, t, t, hm - t / 2],                // f
    [t, hm - t / 2, dw - t, hm + t / 2],  // g
  ]
  return regs.map(([x0, y0, x1, y1]) => {
    // encolhe 15% nas pontas para não pegar os cantos dos segmentos vizinhos
    if ((x1 - x0) > (y1 - y0)) { const m = 0.15 * (x1 - x0); x0 += m; x1 -= m }
    else { const m = 0.15 * (y1 - y0); y0 += m; y1 -= m }
    return [pyInt(x0), pyInt(y0), Math.max(pyInt(x0) + 1, pyRound(x1)), Math.max(pyInt(y0) + 1, pyRound(y1))]
  })
}

export function interpretar(texto: string, decimais: number): number | null {
  let s = texto.trim()
  if (!s || s.includes('?') || s.includes(' ') || s.slice(1).includes('-')) return null
  const neg = s.startsWith('-')
  s = s.replace(/^-+/, '')
  if (!/^\d+$/.test(s)) return null
  const v = parseInt(s, 10) / 10 ** Math.trunc(decimais)
  return neg ? -v : v
}

/** Lê um campo num quadro (Mat BGR/RGBA). `comRecortes`: guarda a imagem de cada dígito (calibração). */
export function lerCampo(cv: OpenCV, frame: Mat, campo: CampoDisplay, formato: 'BGR' | 'RGBA' = 'BGR', comRecortes = false): ResultadoCampo {
  const res: ResultadoCampo = { texto: '', valor: null, segmentos: [], ...(comRecortes ? { recortes: [] } : {}) }
  const cels = celulasAbs(campo)
  const k = fatorK(campo)
  const H = frame.rows, W = frame.cols
  let [x0, y0, x1, y1] = envolvente(cels, k)
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1)
  if (!cels.length || x1 - x0 < 8 || y1 - y0 < 8) { res.texto = '?'; return res }
  const recorte = frame.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0))
  const b = binarizar(cv, recorte, campo, formato)
  recorte.delete()
  const chars: string[] = []
  const rec = new cv.Mat()
  try {
    for (const [x, y, w, h] of cels) {
      const wi = Math.max(4, pyRound(w)), hi = Math.max(4, pyRound(h))
      // mapa destino (u, v) -> origem: endireita o paralelogramo da célula (matriz float32, como no Python)
      const f = Math.fround
      const M = cv.matFromArray(2, 3, cv.CV_64F, [f(1), f(-k), f(x - x0 + k * hi / 2.0), f(0), f(1), f(y - y0)])
      cv.warpAffine(b, rec, M, new cv.Size(wi, hi), cv.INTER_NEAREST | cv.WARP_INVERSE_MAP, cv.BORDER_CONSTANT, new cv.Scalar(0))
      M.delete()
      const estados: number[] = []
      const info: ResultadoCampo['segmentos'][number] = []
      for (const [sx0, sy0, sx1, sy1] of regioesSegmentos(wi, hi, campo.espessura)) {
        // fatia do NumPy: recorta ao tamanho da imagem
        const ax0 = Math.min(Math.max(sx0, 0), wi), ay0 = Math.min(Math.max(sy0, 0), hi)
        const ax1 = Math.min(Math.max(sx1, 0), wi), ay1 = Math.min(Math.max(sy1, 0), hi)
        const area = Math.max(0, ax1 - ax0) * Math.max(0, ay1 - ay0)
        let acesos = 0
        if (area) {
          const r = rec.roi(new cv.Rect(ax0, ay0, ax1 - ax0, ay1 - ay0))
          acesos = cv.countNonZero(r)
          r.delete()
        }
        const frac = area ? acesos / area : 0.0
        const lig = frac >= campo.limiar_segmento
        estados.push(lig ? 1 : 0)
        info.push([sx0, sy0, sx1, sy1, frac, lig])
      }
      if (res.recortes) res.recortes.push({ largura: rec.cols, altura: rec.rows, dados: new Uint8Array(rec.data) })
      res.segmentos.push(info)
      chars.push(TABELA[estados.join('')] ?? '?')
    }
  } finally {
    rec.delete(); b.delete()
  }
  res.texto = chars.join('')
  res.valor = interpretar(res.texto, campo.decimais)
  return res
}
