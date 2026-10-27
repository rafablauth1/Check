// VIGIA-7S no app — ciclo da bomba (porte de DetectorCiclo e resumir_ciclos de vigia7s/app.py).

export type EventoCiclo = ['ref', number] | ['chegada', number] | ['saida', number]

/** Marca quando o display SAI do valor de referência (ex.: 4,000 L) e quando VOLTA a ele.
 *
 *  Ciclo = de uma saída do valor de referência até a próxima saída.
 *  Recebe a cada quadro o valor lido do campo de volume (null = ilegível):
 *    - quadro ilegível não confirma nada (nem saída nem chegada);
 *    - saída/chegada só valem depois de `confirmar` quadros legíveis seguidos (ignora erro de leitura);
 *    - o instante da saída é o 1º quadro depois do último que mostrava a referência.
 *  Se `ref` for null, aprende como referência o 1º valor que ficar parado por `estavelS`. */
export class DetectorCiclo {
  ref: number | null
  readonly tol: number
  naRef = false            // display mostrando a referência (congelado)?
  private nFora = 0        // quadros legíveis seguidos fora da referência
  private nDentro = 0      // quadros seguidos na referência
  private tPosRef: number | null = null   // 1º quadro depois do último quadro na referência
  private t1aRef: number | null = null    // 1º quadro da sequência atual na referência
  private runVal: number | null = null
  private runIni: number | null = null

  constructor(ref: number | null, decimais: number, readonly estavelS = 1.0, readonly confirmar = 3) {
    this.ref = ref
    this.tol = 0.5 / 10 ** Math.trunc(decimais)
  }

  get estado(): string {
    if (this.ref === null) return 'aprendendo a referência'
    return this.naRef ? 'congelado na referência' : 'fora da referência (abastecendo)'
  }

  passo(t: number, valor: number | null): EventoCiclo | null {
    if (this.ref === null) {
      if (valor === null) return null
      if (this.runVal === null || Math.abs(valor - this.runVal) > 1e-9) { this.runVal = valor; this.runIni = t }
      else if (t - this.runIni! >= this.estavelS) { this.ref = valor; return ['ref', valor] }
      return null
    }
    if (valor !== null && Math.abs(valor - this.ref) <= this.tol) {
      this.tPosRef = null
      this.nFora = 0
      if (this.nDentro === 0) this.t1aRef = t
      this.nDentro += 1
      if (!this.naRef && this.nDentro >= this.confirmar) { this.naRef = true; return ['chegada', this.t1aRef!] }
      return null
    }
    if (this.tPosRef === null) this.tPosRef = t
    if (valor !== null) { this.nDentro = 0; this.nFora += 1 }
    // saída confirmada: N quadros legíveis fora da referência, ou 0,4 s sem mostrar a referência
    // (com os dígitos correndo, a câmera pode ler quase tudo como ilegível)
    if (this.naRef && (this.nFora >= this.confirmar || t - this.tPosRef >= 0.4)) {
      this.naRef = false
      this.nFora = 0
      return ['saida', this.tPosRef]
    }
    return null
  }
}

export interface Ciclo { periodo: number; enchendo: number | null; congelado: number | null }
type Media = [number, number] | [null, null]

/** Período, tempo abastecendo e tempo congelado de cada ciclo entre saídas consecutivas. */
export function resumirCiclos(saidas: number[], congs: number[]): [Ciclo[], Media, Media, Media] {
  const ciclos: Ciclo[] = []
  for (let i = 0; i + 1 < saidas.length; i++) {
    const a = saidas[i], b = saidas[i + 1]
    const c = congs.find(t => a < t && t < b)
    ciclos.push({ periodo: b - a, enchendo: c === undefined ? null : c - a, congelado: c === undefined ? null : b - c })
  }
  const media = (k: keyof Ciclo): Media => {
    const v = ciclos.map(x => x[k]).filter((x): x is number => x !== null)
    if (!v.length) return [null, null]
    return [somaPy(v) / v.length, v.length > 1 ? (Math.max(...v) - Math.min(...v)) / 2 : 0.0]
  }
  return [ciclos, media('periodo'), media('enchendo'), media('congelado')]
}

/** sum() do Python 3.12+: soma compensada de Neumaier (o resultado pode diferir da soma simples na última casa). */
export function somaPy(v: number[]): number {
  let s = 0, c = 0
  for (const x of v) {
    const t = s + x
    c += Math.abs(s) >= Math.abs(x) ? (s - t) + x : (x - t) + s
    s = t
  }
  return s + c
}

/** statistics.stdev do Python (amostral). */
export function desvioPadrao(v: number[]): number {
  if (v.length < 2) return 0
  const m = v.reduce((s, x) => s + x, 0) / v.length
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1))
}
