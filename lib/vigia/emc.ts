// VIGIA-7S no app — perfis de ensaio EMC e cronograma (em qual frequência / etapa o ensaio está).
// Porte fiel de vigia7s/emc.py.
//
// Um perfil é uma lista de segmentos:
//   - "varredura": f_ini -> f_fim em passos logarítmicos de passo_pct %,
//     permanecendo dwell_s (+ extra_s de overhead do gerador) em cada frequência.
//   - "tempo": etapa temporizada (ESD, EFT, surto, quedas...), com duração fixa.
// Se "aguardar" estiver marcado, o segmento só começa quando o operador clicar
// "Iniciar próximo segmento" (troca de antena, polarização, acoplamento...).

/** Relógio monotônico em segundos (time.monotonic do Python). */
export const monotonic = () => performance.now() / 1000

export interface Segmento {
  nome: string
  tipo: 'varredura' | 'tempo'
  f_ini: number        // MHz
  f_fim: number        // MHz
  passo_pct: number
  dwell_s: number
  extra_s: number
  duracao_s: number    // usado quando tipo == "tempo"
  aguardar: boolean
  obs: string
  face: string         // face do EUT voltada para a antena (4-3)
  polarizacao: string  // polarização da antena (4-3)
}

export const SEGMENTO_PADRAO: Segmento = {
  nome: 'Segmento', tipo: 'varredura', f_ini: 80.0, f_fim: 1000.0, passo_pct: 1.0, dwell_s: 1.0, extra_s: 0.0,
  duracao_s: 60.0, aguardar: true, obs: '', face: '', polarizacao: '',
}

export function segmentoDe(d: Partial<Segmento>): Segmento {
  const out = { ...SEGMENTO_PADRAO }
  for (const k of Object.keys(SEGMENTO_PADRAO) as (keyof Segmento)[]) {
    if (d[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = d[k]
  }
  return out
}

/** Nome completo exibido no ensaio e gravado nas leituras. */
export const rotulo = (s: Segmento) => [s.nome, s.face, s.polarizacao].filter(Boolean).join(' | ')

const cacheFreq = new WeakMap<Segmento, { chave: string; fs: number[] }>()
export function frequencias(s: Segmento): number[] {
  const chave = `${s.f_ini}|${s.f_fim}|${s.passo_pct}|${s.tipo}`
  const c = cacheFreq.get(s)
  if (c && c.chave === chave) return c.fs
  const fs: number[] = []
  if (s.tipo === 'varredura' && s.f_ini > 0) {
    let f = Number(s.f_ini)
    const fim = Math.max(Number(s.f_fim), f)
    const fator = 1 + Math.max(0.01, Number(s.passo_pct)) / 100.0
    while (f < fim * (1 - 1e-9)) { fs.push(f); f *= fator }
    fs.push(fim)  // último passo limitado à frequência final
  }
  cacheFreq.set(s, { chave, fs })
  return fs
}

export const tempoPasso = (s: Segmento) => Math.max(0.01, Number(s.dwell_s) + Number(s.extra_s))

export function duracao(s: Segmento): number {
  if (s.tipo === 'varredura') return frequencias(s).length * tempoPasso(s)
  return Math.max(0.0, Number(s.duracao_s))
}

/** [índice do passo, frequência em MHz ou null] para t segundos desde o início. */
export function noTempo(s: Segmento, t: number): [number, number | null] {
  if (s.tipo !== 'varredura') return [0, null]
  const fs = frequencias(s)
  const i = Math.min(fs.length - 1, Math.max(0, Math.floor(t / tempoPasso(s))))
  return [i, fs[i]]
}

const virgula = (s: string) => s.replace('.', ',')
export function fmtFreq(mhz: number | null | undefined): string {
  if (mhz === null || mhz === undefined) return '—'
  if (mhz < 1) return virgula(`${(mhz * 1000).toFixed(1)} kHz`)
  if (mhz < 1000) return virgula(`${mhz.toFixed(2)} MHz`)
  return virgula(`${(mhz / 1000).toFixed(4)} GHz`)
}

export function fmtTempo(s: number): string {
  s = Math.max(0, pyRoundInt(s))
  const h = Math.floor(s / 3600), r = s % 3600
  const m = Math.floor(r / 60), ss = r % 60
  const p2 = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${p2(m)}:${p2(ss)}` : `${p2(m)}:${p2(ss)}`
}

/** int(round(x)) do Python (metade vai para o par). */
function pyRoundInt(x: number): number {
  const f = Math.floor(x), d = x - f
  if (d > 0.5) return f + 1
  if (d < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}

export type EstadoCron = 'parado' | 'rodando' | 'pausado' | 'aguardando' | 'pausado_aguardando' | 'concluido'

export interface StatusCron {
  estado: EstadoCron; idx: number; n_seg: number; nome: string; tipo: string; freq: number | null; passo: number
  n_passos: number; t_seg: number; dur_seg: number; restante_total: number; obs: string; face?: string; polarizacao?: string
  sem_freq?: boolean
}

export class Cronograma {
  segmentos: Segmento[]
  idx = 0
  estado: EstadoCron = 'parado'
  t0: number | null = null   // o _status_emc do VIGIA lê cron._t0
  private pausaIni: number | null = null
  private tRetomar = 0.0

  constructor(segmentos: Segmento[]) {
    this.segmentos = segmentos.map(s => segmentoDe({ ...s }))
  }

  get atual(): Segmento | null {
    return this.idx >= 0 && this.idx < this.segmentos.length ? this.segmentos[this.idx] : null
  }

  iniciar() {
    this.idx = 0
    if (!this.segmentos.length) { this.estado = 'concluido'; return }
    this.iniciarSeg()
  }

  private iniciarSeg(tInicio?: number) {
    this.estado = 'rodando'
    // t_inicio: instante (monotônico) do disparo, ex.: quadro em que o display saiu do valor congelado.
    // retomada: o segmento recomeça do ponto (s) em que o ensaio anterior parou
    const t = tInicio === undefined ? monotonic() : tInicio
    this.t0 = t - this.tRetomar
    this.tRetomar = 0.0
    this.pausaIni = null
  }

  /** Retomada de um ensaio salvo: aguarda o operador no segmento idx, a t_seg segundos do início dele. */
  posicionar(idx: number, tSeg: number) {
    this.idx = this.segmentos.length ? Math.max(0, Math.min(Math.trunc(idx), this.segmentos.length - 1)) : 0
    if (!this.segmentos.length) { this.estado = 'concluido'; return }
    const seg = this.atual!
    this.tRetomar = Math.max(0.0, Math.min(Number(tSeg), Math.max(0.0, duracao(seg) - 0.01)))
    this.estado = 'aguardando'
  }

  /** [passo, frequência] em que o segmento aguardando vai começar. */
  tRetomada(): [number, number | null] {
    const seg = this.atual
    if (!seg) return [0, null]
    const [i, f] = noTempo(seg, this.tRetomar)
    return [i + 1, f]
  }

  decorrido(): number {
    if (this.estado === 'rodando') return monotonic() - this.t0!
    if (this.estado === 'pausado') return this.pausaIni! - this.t0!
    return 0.0
  }

  pausar() {
    if (this.estado === 'rodando') { this.estado = 'pausado'; this.pausaIni = monotonic() }
    else if (this.estado === 'aguardando') this.estado = 'pausado_aguardando'
  }

  retomar() {
    if (this.estado === 'pausado') { this.t0! += monotonic() - this.pausaIni!; this.estado = 'rodando' }
    else if (this.estado === 'pausado_aguardando') this.estado = 'aguardando'
  }

  parar() { this.estado = 'parado' }

  /** Chamado periodicamente. Retorna 'aguardando', 'proximo', 'concluido' ou null. */
  atualizar(): 'aguardando' | 'proximo' | 'concluido' | null {
    const seg = this.atual
    if (this.estado !== 'rodando' || !seg) return null
    if (this.decorrido() < duracao(seg)) return null
    return this.avancar()
  }

  private avancar(): 'aguardando' | 'proximo' | 'concluido' {
    this.idx += 1
    if (this.idx >= this.segmentos.length) { this.estado = 'concluido'; return 'concluido' }
    if (this.atual!.aguardar) { this.estado = 'aguardando'; return 'aguardando' }
    this.iniciarSeg()
    return 'proximo'
  }

  iniciarProximo(tInicio?: number) {
    if (this.estado === 'aguardando' || this.estado === 'pausado_aguardando') this.iniciarSeg(tInicio)
  }

  pular() {
    if (['rodando', 'pausado', 'aguardando', 'pausado_aguardando'].includes(this.estado)) return this.avancar()
    return null
  }

  irPara(idx: number) {
    if (idx >= 0 && idx < this.segmentos.length) { this.idx = idx; this.iniciarSeg() }
  }

  /** Ajusta o relógio para que o passo atual seja o da frequência informada. */
  sincronizar(freqMhz: number): boolean {
    const seg = this.atual
    if (!seg || seg.tipo !== 'varredura') return false
    if (this.estado === 'aguardando' || this.estado === 'pausado_aguardando') this.iniciarSeg()
    const fs = frequencias(seg)
    let i = 0
    // min(range(len(fs)), key=...): o primeiro índice de menor distância (no log)
    for (let k = 1; k < fs.length; k++) {
      const dk = freqMhz > 0 ? Math.abs(Math.log(fs[k] / freqMhz)) : 0
      const di = freqMhz > 0 ? Math.abs(Math.log(fs[i] / freqMhz)) : 0
      if (dk < di) i = k
    }
    const agora = monotonic()
    this.t0 = agora - i * tempoPasso(seg)
    if (this.estado === 'pausado') this.pausaIni = agora
    return true
  }

  /** t_seg: avaliar num instante anterior do segmento atual (ex.: início do abastecimento). */
  status(tSeg?: number | null): StatusCron {
    const seg = this.atual
    const st: StatusCron = {
      estado: this.estado, idx: this.idx, n_seg: this.segmentos.length, nome: '', tipo: '', freq: null, passo: 0,
      n_passos: 0, t_seg: 0.0, dur_seg: 0.0, restante_total: 0.0, obs: '',
    }
    if (!seg) return st
    let t = this.estado === 'rodando' || this.estado === 'pausado' ? this.decorrido() : 0.0
    if (tSeg !== undefined && tSeg !== null) t = tSeg
    Object.assign(st, { nome: rotulo(seg), tipo: seg.tipo, obs: seg.obs, t_seg: t, dur_seg: duracao(seg), face: seg.face, polarizacao: seg.polarizacao })
    if (seg.tipo === 'varredura') {
      const [i, f] = noTempo(seg, t)
      Object.assign(st, { freq: f, passo: i + 1, n_passos: frequencias(seg).length })
    }
    st.restante_total = Math.max(0.0, duracao(seg) - t) + this.segmentos.slice(this.idx + 1).reduce((a, s) => a + duracao(s), 0)
    return st
  }

  /** true quando há perturbação sendo aplicada (segmento rodando). */
  ativo() { return this.estado === 'rodando' }
}

export const FACES_PADRAO = ['Frente', 'Lateral direita', 'Traseira', 'Lateral esquerda']
export const POLARIZACOES_PADRAO = ['Vertical', 'Horizontal']   // em cada faixa: vertical, depois horizontal
type Eixo = 'face' | 'faixa' | 'pol'
export const ORDENS: Record<string, [Eixo, Eixo, Eixo]> = {
  // bomba de combustível: em cada face, cada faixa em V e H; troca a antena; depois vira a amostra
  'Face → Faixa → Polarização  (bomba: V→H, troca antena, vira amostra)': ['face', 'faixa', 'pol'],
  'Faixa → Polarização → Face  (menos trocas de antena)': ['faixa', 'pol', 'face'],
  'Faixa → Face → Polarização': ['faixa', 'face', 'pol'],
  'Face → Polarização → Faixa': ['face', 'pol', 'faixa'],
  'Polarização → Faixa → Face': ['pol', 'faixa', 'face'],
}

/** Gera um segmento para cada combinação faixa × polarização × face, na ordem pedida.
 *  O 1º segmento começa junto com o ensaio; os demais aguardam o operador. */
export function expandir(base: Segmento[], faces: string[], polarizacoes: string[], ordem: string): Segmento[] {
  const listas: Record<Eixo, (Segmento | string)[]> = {
    faixa: [...base], pol: polarizacoes.length ? polarizacoes : [''], face: faces.length ? faces : [''],
  }
  const [a, b, c] = ORDENS[ordem]
  const saida: Segmento[] = []
  for (const x of listas[a]) for (const y of listas[b]) for (const z of listas[c]) {
    const comb = { [a]: x, [b]: y, [c]: z } as Record<Eixo, Segmento | string>
    const s = segmentoDe({ ...(comb.faixa as Segmento) })
    s.face = comb.face as string; s.polarizacao = comb.pol as string
    s.aguardar = saida.length > 0
    saida.push(s)
  }
  return saida
}

const _v = (nome: string, f_ini: number, f_fim: number, aguardar = true, obs = '') =>
  segmentoDe({ nome, tipo: 'varredura', f_ini, f_fim, passo_pct: 1.0, dwell_s: 1.0, extra_s: 0.0, aguardar, obs })
const _t = (nome: string, dur: number, aguardar = true, obs = '') => segmentoDe({ nome, tipo: 'tempo', duracao_s: dur, aguardar, obs })

const IRRADIADO = [
  _v('80 MHz – 300 MHz', 80, 300, false, '80% AM 1 kHz - ajustar nível/polarização'),
  _v('300 MHz – 1 GHz', 300, 1000, true, 'trocar antena/amplificador'),
  _v('1 GHz – 3 GHz', 1000, 3000, true, 'trocar antena/amplificador'),
]

/** Perfis que vêm prontos (mesma ordem e nomes do VIGIA-7S). */
export const PERFIS_PADRAO: Record<string, Segmento[]> = {
  'IEC 61000-4-3 - Campo irradiado (câmara semianecoica)': IRRADIADO,
  'IEC 61000-4-3 - 4 faces × H/V': expandir(IRRADIADO, FACES_PADRAO, POLARIZACOES_PADRAO, 'Faixa → Polarização → Face  (menos trocas de antena)'),
  'IEC 61000-4-6 - RF conduzida': [_v('150 kHz – 80 MHz', 0.15, 80, false, '80% AM 1 kHz - ajustar nível')],
  'IEC 61000-4-2 - ESD': [
    _t('Descarga por contato (+)', 300, false), _t('Descarga por contato (−)', 300), _t('Descarga no ar (+)', 300), _t('Descarga no ar (−)', 300),
  ],
  'IEC 61000-4-4 - EFT/Burst': [
    _t('Alimentação (+)', 60, false), _t('Alimentação (−)', 60), _t('Sinais/comunicação (+)', 60), _t('Sinais/comunicação (−)', 60),
  ],
  'IEC 61000-4-5 - Surto': [_t('L-N (+)', 300, false), _t('L-N (−)', 300), _t('L-PE (+)', 300), _t('L-PE (−)', 300)],
  'IEC 61000-4-8 - Campo magnético': [_t('Eixo X', 60, false), _t('Eixo Y', 60), _t('Eixo Z', 60)],
  'IEC 61000-4-11 - Quedas e interrupções': [
    _t('0% - 0,5 ciclo', 60, false), _t('0% - 1 ciclo', 60), _t('70% - 25/30 ciclos', 60), _t('0% - 250/300 ciclos', 60),
  ],
  'Sem perturbação (referência)': [_t('Referência', 3600, false)],
  // ordem ideal para bomba de combustível (face → faixa → V/H)
  'IEC 61000-4-3 - Bomba (face → faixa → V/H)': expandir(IRRADIADO, FACES_PADRAO, POLARIZACOES_PADRAO, Object.keys(ORDENS)[0]),
}

/** Identidade de um segmento (independe da posição na lista — o operador pode reordenar). */
export function chaveSegmento(s: Segmento): string {
  const r6 = (x: number) => Math.round(Number(x) * 1e6) / 1e6
  return JSON.stringify([s.nome, s.tipo, s.face, s.polarizacao, r6(s.f_ini), r6(s.f_fim)])
}

/** Perfis salvos + os padrão que ainda não existem (sem mexer nos que o usuário editou). */
export function completarPerfis(salvos: Record<string, Partial<Segmento>[]> | null): { perfis: Record<string, Segmento[]>; novos: boolean } {
  const perfis: Record<string, Segmento[]> = {}
  for (const [k, v] of Object.entries(salvos ?? {})) if (Array.isArray(v)) perfis[k] = v.map(segmentoDe)
  const novos = Object.keys(PERFIS_PADRAO).filter(k => !(k in perfis))
  for (const k of novos) perfis[k] = PERFIS_PADRAO[k].map(s => segmentoDe({ ...s }))
  return { perfis, novos: novos.length > 0 }
}
