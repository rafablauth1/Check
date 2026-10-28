// VIGIA-7S no app — Registro de ensaio no formato do FOR EMC38 (RTM 559/2016 - BMCL): porte de vigia7s/registro.py.
//
// Reproduz as abas do formulário: DADOS, verificações iniciais (e1) e os ensaios (4-3, 4-6, 4-2, 4-4, OIML D11,
// 4-11), com totalizador, erro calculado, conferência por faixa e observações. Os dados ficam num .json (salvo a
// cada alteração) — o MESMO arquivo do VIGIA-7S da área de trabalho (resultados/registros/) — e podem ser
// exportados para Excel com fórmulas.
import { fixo, num as numVigia, pyRoundN } from '@/lib/vigia/util'
import type { LeituraReg, TotReg } from '@/lib/vigia/ensaio'

/** num() do registro.py: aceita "1.234,56", "92,11", "4". */
export function num(s: unknown, padrao: number | null = null): number | null {
  if (s === null || s === undefined) return padrao
  if (typeof s === 'number') return s
  if (typeof s === 'boolean') return Number(s)
  let t = String(s).trim().replace(/ /g, '')
  if (!t) return padrao
  t = t.includes(',') && t.includes('.') ? t.replace(/\./g, '').replace(/,/g, '.') : t.replace(/,/g, '.')  // 1.234,56
  return numVigia(t, padrao)
}
export const numReg = num

/** fmt(): número com vírgula e `casas` decimais; texto passa direto; zero nunca sai "-0,000". */
export function fmt(v: unknown, casas = 2): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'string') return v
  let x = Number(v)
  if (Math.abs(x) < 0.5 * 10 ** -casas) x = 0.0
  return fixo(x, casas).replace('.', ',')
}

/** f"{v:.{p}g}" do Python. */
export function fmtGp(v: number, p: number): string {
  if (!Number.isFinite(v)) return String(v).toLowerCase().replace('infinity', 'inf')
  if (v === 0) return Object.is(v, -0) ? '-0' : '0'
  const exp = Number(v.toExponential(p - 1).split('e')[1])
  if (exp < -4 || exp >= p) {
    const [m, e] = v.toExponential(p - 1).split('e')
    const mm = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m
    const n = Number(e)
    return `${mm}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`
  }
  const s = fixo(v, Math.max(0, p - 1 - exp))
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

// --------------------------------------------------------------------------- modelo do formulário
export const DADOS_CAMPOS: [string, string][] = [['protocolo', 'Protocolo'], ['orcamento', 'Orçamento'], ['cliente', 'Cliente (razão social)'],
  ['endereco', 'Endereço do cliente'], ['objeto', 'Objeto ensaiado'], ['modelo', 'Modelo'],
  ['fabricante', 'Fabricante'], ['inicio', 'Início dos ensaios'], ['fim', 'Fim dos ensaios'],
  ['relatorio', 'Relatório nº'], ['emissao', 'Data da emissão'],
  ['preco', 'Preço unitário (R$/L) – único p/ todo o registro']]

export const CAB_CAMPOS: [string, string][] = [['metrologista', 'Metrologista executor'], ['data', 'Data do ensaio'],
  ['temp_ini', 'Temperatura inicial [°C]'], ['temp_fim', 'Temperatura final [°C]'],
  ['umid_ini', 'Umidade inicial [%]'], ['umid_fim', 'Umidade final [%]'],
  ['patm_ini', 'P atm inicial [hPa]'], ['patm_fim', 'P atm final [hPa]'],
  ['preset', 'Valor de preset [L]'], ['duracao', 'Duração do ciclo (s)'],
  ['intervalo', 'Intervalo entre ciclos (s)'], ['equipamentos', 'Equipamentos utilizados']]

// cabeçalho de cada bloco (como no FOR EMC38: cada bloco da 4-3 tem data, metrologista e condições próprias)
export const BLOCO_CAB: [string, string][] = [['data_ini', 'Data inicial'], ['data_fim', 'Data final'], ['metrologista', 'Metrologista'],
  ['temp_ini', 'Temp. inicial [°C]'], ['temp_fim', 'Temp. final [°C]'],
  ['umid_ini', 'Umid. inicial [%]'], ['umid_fim', 'Umid. final [%]']]

// observação padrão (redação do FOR EMC38)
const _OBS_ROTULO = 'Durante e após a aplicação do ensaio o ESE não apresentou alteração ou degradação permanente das suas '
  + 'funções e indicações de preço unitário, total a pagar e volume entregue.'
const _OBS_FREQ = 'Durante e após a aplicação do ensaio não foi identificado alteração ou degradação permanente das funções '
  + 'da bomba e indicação de preço unitário.\nOs valores de total a pagar, preço unitário e volume entregue '
  + 'foram registrados a cada abastecimento e os registros do totalizador foram avaliados ao início e final '
  + 'da faixa de frequência'
export const TEXTOS_OBS: Record<string, string> = {
  '1.2 - IEC 61000-4-3': _OBS_FREQ + ' para cada face da bomba medidora e para as duas polarizações da antena '
    + '(vertical e horizontal).',
  '1.3 - IEC 61000-4-6 (Alim)': _OBS_FREQ + '.',
  '1.3 - IEC 61000-4-6 (Com)': _OBS_FREQ + '.',
  '1.4 - IEC 61000-4-2': _OBS_ROTULO,
  '1.5 - IEC 61000-4-4': _OBS_ROTULO,
  '1.6 - OIML D11': 'Durante a realização do ensaio o ESE não apresentou degradação permanente das suas funções e '
    + 'indicações de preço unitário, total a pagar e volume entregue.',
  '1.7 - IEC 61000-4-11': _OBS_ROTULO,
}

export const INICIAIS = ['INICIAL', 'INICIAL (RF-Irradiada)']

export const FACES = ['Face 1 (Vista frontal)', 'Face 2 (Vista lateral esquerda)',
  'Face 3 (Vista posterior)', 'Face 4 (Vista lateral direita)']
// como no formulário: vertical 1→4, horizontal 4→1
export const BLOCOS_4_3 = [...FACES.map(f => `Polaridade Vertical - ${f}`), ...[...FACES].reverse().map(f => `Polaridade Horizontal - ${f}`)]
// nomes de face do perfil EMC do app -> face do formulário
export const FACE_PERFIL: [string, string][] = [['frente', FACES[0]], ['frontal', FACES[0]], ['lateral esquerda', FACES[1]], ['esquerda', FACES[1]],
  ['traseira', FACES[2]], ['posterior', FACES[2]], ['lateral direita', FACES[3]], ['direita', FACES[3]]]

export const NIVEIS_4_11 = ['0% - 0,5 ciclo', '0% - 1 ciclo', '70% - 30 ciclos']
export const ROTULOS_4_11 = ['Antes', ...NIVEIS_4_11.flatMap(n => [1, 2, 3, 4].map(i => `${n} - ${i}`))]

export interface Modelo {
  tipo: 'freq' | 'rotulo'; ref: string; blocos: [string, string[]][]
  faixas?: [string, number, number][]; extras?: [string, string, string][]
}
export const MODELOS: Record<string, Modelo> = {
  '1.2 - IEC 61000-4-3': { tipo: 'freq', ref: 'INICIAL (RF-Irradiada)', blocos: BLOCOS_4_3.map(b => [b, []]),
    faixas: [['80-300', 80, 300], ['300-1000', 300, 1000], ['1000-3000', 1000, 3000]] },
  '1.3 - IEC 61000-4-6 (Alim)': { tipo: 'freq', ref: 'INICIAL (RF-Irradiada)', blocos: [['Linhas de alimentação', []]], faixas: [['0,15-80', 0.15, 80]] },
  '1.3 - IEC 61000-4-6 (Com)': { tipo: 'freq', ref: 'INICIAL (RF-Irradiada)', blocos: [['Linhas de comunicação', []]], faixas: [['0,15-80', 0.15, 80]] },
  '1.4 - IEC 61000-4-2': { tipo: 'rotulo', ref: 'INICIAL (RF-Irradiada)',
    blocos: [['Descargas eletrostáticas', ['Antes', 'Direta', 'P.A.V. F1', 'P.A.V. F2', 'P.A.V. F3', 'P.A.V. F4', 'AR F1', 'AR F2', 'Após']]] },
  '1.5 - IEC 61000-4-4': { tipo: 'rotulo', ref: 'INICIAL',
    blocos: [['Linhas de alimentação', ['Antes', 'Positivo', 'Negativo', 'Após']], ['Linhas de comunicação', ['Antes', 'Positivo', 'Negativo', 'Após']]] },
  '1.6 - OIML D11': { tipo: 'rotulo', ref: 'INICIAL', blocos: [['Variação da tensão de alimentação', ['127', '108', '253']]],
    extras: [['v_min', 'Tensão mínima especificada [V]', '108'], ['v_max', 'Tensão máxima especificada [V]', '253']] },
  '1.7 - IEC 61000-4-11': { tipo: 'rotulo', ref: 'INICIAL', blocos: [['Condição 1', ROTULOS_4_11], ['Condição 2', ROTULOS_4_11]] },
}

export interface Linha {
  rotulo: string; preco?: number | null; volume: number | null; total?: number | null; obs: string
  foto?: string; ensaio?: string; n?: number; sem_freq?: boolean; freq_ref?: number | null
}
export interface Faixa { nome: string; fmin: number | string; fmax: number | string; ini: string; fim: string }
export type Cab = Record<string, string>
export interface Inicial { cab: Cab; tot_ini: string; tot_fim: string; linhas: Linha[]; obs: string }
export interface Bloco {
  nome: string; tot_ini: string; tot_fim: string; linhas: Linha[]; obs: string; faixas: Faixa[]
  data_ini?: string; data_fim?: string; [k: string]: unknown
}
export interface Ensaio { cab: Cab; ref: string; extras: Record<string, string>; obs: string; blocos: Bloco[] }
export interface Historico { data: string; usuario: string; alteracao: string; chave: string }
export interface Registro {
  versao: number; dados: Record<string, string>; iniciais: Record<string, Inicial>
  ensaios: Record<string, Ensaio>; historico: Historico[]
}

const _linhas = (rotulos: string[]): Linha[] => rotulos.map(r => ({ rotulo: r, preco: null, volume: null, total: null, obs: '' }))

function _cab(): Cab {
  const c: Cab = Object.fromEntries(CAB_CAMPOS.map(([k]) => [k, '']))
  c.preset = '4'
  return c
}

export const novo_inicial = (): Inicial => ({ cab: _cab(), tot_ini: '', tot_fim: '', linhas: _linhas(Array.from({ length: 10 }, (_, i) => String(i + 1))), obs: '' })

export function novo_bloco(nome: string, rotulos: string[], faixas: [string, number, number][]): Bloco {
  return {
    ...Object.fromEntries(BLOCO_CAB.map(([k]) => [k, ''])), nome, tot_ini: '', tot_fim: '', linhas: _linhas(rotulos), obs: '',
    faixas: faixas.map(([n, a, b]) => ({ nome: n, fmin: a, fmax: b, ini: '', fim: '' })),
  }
}

/** 'dd/mm/aaaa' → Date (ou null) — strptime(s, "%d/%m/%Y"). */
export function _data(s: unknown): Date | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? d : null
}

const dois = (n: number) => String(n).padStart(2, '0')
export const ddmmaaaa = (d: Date) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`
const agoraTxt = (d = new Date()) => `${ddmmaaaa(d)} ${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`
function lerAgora(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6])) : null
}

/** Histórico de atualizações do registro (aba 'Registro de atualizações' do FOR EMC38), automático.
 *  chave: alterações seguidas no mesmo campo em até 2 min viram uma só linha (digitação). */
export function registrar_historico(reg: Registro, alteracao: string, chave: string | null, usuario: string) {
  const agora = new Date()
  const hist = (reg.historico ??= [])
  const ult = hist[hist.length - 1]
  if (chave && ult && ult.chave === chave) {
    const ant = ult.data ? lerAgora(ult.data) : null
    if (ant && (agora.getTime() - ant.getTime()) / 1000 <= 120) {
      Object.assign(ult, { data: agoraTxt(agora), alteracao })
      return
    }
  }
  hist.push({ data: agoraTxt(agora), usuario, alteracao, chave: chave || '' })
}

export function novo_ensaio(nome: string): Ensaio {
  const m = MODELOS[nome]
  return {
    cab: _cab(), ref: m.ref, extras: Object.fromEntries((m.extras ?? []).map(([k, , v]) => [k, v])), obs: '',
    blocos: m.blocos.map(([b, r]) => novo_bloco(b, r, m.faixas ?? [])),
  }
}

export function novo_registro(): Registro {
  return {
    versao: 1, dados: { ...Object.fromEntries(DADOS_CAMPOS.map(([k]) => [k, ''])), obs: '' },
    iniciais: Object.fromEntries(INICIAIS.map(n => [n, novo_inicial()])),
    ensaios: Object.fromEntries(Object.keys(MODELOS).map(n => [n, novo_ensaio(n)])),
    historico: [],
  }
}

/** Garante que um registro antigo tenha todas as chaves atuais. */
export function completar(r: Partial<Registro>): Registro {
  const reg = r as Registro
  const base = novo_registro() as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(base)) if (!(k in reg)) (reg as unknown as Record<string, unknown>)[k] = v
  for (const n of INICIAIS) if (!(n in reg.iniciais)) reg.iniciais[n] = novo_inicial()
  for (const n of Object.keys(MODELOS)) if (!(n in reg.ensaios)) reg.ensaios[n] = novo_ensaio(n)
  for (const ens of Object.values(reg.ensaios)) {  // registros antigos: cabeçalho por bloco
    for (const b of ens.blocos) for (const [k] of BLOCO_CAB) if (!(k in b)) b[k] = ''
  }
  if (!('historico' in reg)) (reg as Registro).historico = []
  return reg
}

// --------------------------------------------------------------------------- cálculos (iguais às fórmulas do FOR)
/** sum() do Python 3.12+ (Neumaier), para Σ e médias saírem iguais */
export function soma(xs: number[]): number {
  let s = 0.0, c = 0.0
  for (const x of xs) {
    const t = s + x
    c += Math.abs(s) >= Math.abs(x) ? (s - t) + x : (x - t) + s
    s = t
  }
  return s + c
}
const media = (x: number[]) => (x.length ? soma(x) / x.length : null)
/** statistics.stdev (amostral) */
function desvio(x: number[]): number | null {
  if (x.length < 2) return null
  const m = soma(x) / x.length
  return Math.sqrt(soma(x.map(v => (v - m) ** 2)) / (x.length - 1))
}

export function stats_inicial(ini: Inicial) {
  const preset = num(ini.cab.preset)
  const vols = ini.linhas.filter(l => l.volume !== null && l.volume !== undefined).map(l => l.volume as number)
  const e1 = preset ? vols.map(v => (v - preset) / preset * 100) : []
  return { preset, n: vols.length, media: media(vols), desvio: desvio(vols), e1_media: media(e1), e1_desvio: desvio(e1) }
}

/** Preço unitário cadastrado uma vez em Dados da amostra (vale para todos os pontos e ensaios). */
export function preco_reg(reg: { dados?: Record<string, unknown> }): number | null {
  return num(reg.dados?.preco)
}
export const precoReg = preco_reg

/** Preset da verificação INICIAL (valor esperado do volume quando o campo não tem um). */
export function presetReg(reg: { iniciais?: Record<string, { cab?: Record<string, unknown> }> }): number | null {
  return num(reg.iniciais?.INICIAL?.cab?.preset, 0) || null
}

/** Total a pagar = litros × preço, em centavos (como o mostrador). */
export function total_calc(volume: number | null | undefined, preco: number | null | undefined): number | null {
  if (volume === null || volume === undefined || preco === null || preco === undefined) return null
  return pyRoundN(volume * preco + 1e-9, 2)
}
export const totalCalc = total_calc

export function erro(volume: number | null | undefined, ref: number | null | undefined): number | null {
  if (volume === null || volume === undefined || !ref) return null
  return (volume - ref) / ref * 100
}

/** |erro| (com as 3 casas exibidas) ≥ limite de aprovação → reprovado (mesmo critério do ensaio). */
export function fora_do_limite(e: number | null, limite: number): boolean {
  return e !== null && !!limite && Math.abs(pyRoundN(e, 3)) >= Number(limite) - 1e-9
}

export const ROTULO_SEM_FREQ = 's/ freq.'

/** Σ e Prova do totalizador com TODAS as leituras (inclusive as feitas com a frequência parada no gerador);
 *  n e erros máx./mín. só com as leituras com perturbação aplicada. */
export function stats_bloco(bloco: Bloco, ref: number | null) {
  const s = soma(bloco.linhas.filter(l => l.volume !== null).map(l => l.volume as number))
  const vols = bloco.linhas.filter(l => l.volume !== null && !l.sem_freq).map(l => l.volume as number)
  const ini = num(bloco.tot_ini), fim = num(bloco.tot_fim)
  const prova = ini !== null && fim !== null ? fim - (ini + s) : null
  const erros = vols.map(v => erro(v, ref)).filter((e): e is number => e !== null)
  return {
    n: vols.length, soma: s, prova, erro_max: erros.length ? Math.max(...erros) : null,
    erro_min: erros.length ? Math.min(...erros) : null,
    n_sem_freq: bloco.linhas.filter(l => l.sem_freq && l.volume !== null).length,
  }
}

/** Frequência que posiciona a linha nas faixas do totalizador (sem frequência: onde o gerador parou). */
export function freq_faixa(l: Linha): number | null {
  const f = num(l.rotulo)
  return f === null && l.sem_freq ? num(l.freq_ref) : f
}

/** Índice da faixa (antena) de cada linha pela frequência; linha sem frequência fica na faixa da anterior. */
export function indices_faixa(linhas: Linha[], faixas: Faixa[] | undefined): (number | null)[] {
  const lims = (faixas ?? []).map(x => [num(x.fmin), num(x.fmax)] as const)
  const saida: (number | null)[] = []
  let atual: number | null = null
  for (const l of linhas) {
    const f = freq_faixa(l)
    if (f !== null) {
      for (let j = 0; j < lims.length; j++) {
        const [a, z] = lims[j]
        if (a !== null && z !== null && ((a <= f && f < z) || (j === lims.length - 1 && f === z))) { atual = j; break }
      }
    }
    saida.push(atual)
  }
  return saida
}

/** Conferência por faixa: dif = final - inicial; real = soma dos volumes da faixa; prova = real - dif. */
export function stats_faixa(bloco: Bloco, fx: Faixa, ultima: boolean) {
  const a = num(fx.fmin), b = num(fx.fmax)
  let real = 0.0
  for (const l of bloco.linhas) {
    const f = freq_faixa(l)
    if (l.volume === null || f === null || a === null || b === null) continue
    if ((a <= f && f < b) || (ultima && f === b)) real += l.volume
  }
  const ini = num(fx.ini), fim = num(fx.fim)
  const dif = ini !== null && fim !== null ? fim - ini : null
  return { real, dif, prova: dif !== null ? real - dif : null }
}

// --------------------------------------------------------------------------- importação das leituras da câmera
type Leit = LeituraReg

/** Bloco do formulário correspondente a uma leitura (4-3: pela face/polarização do segmento). */
export function bloco_para_leitura(ens_nome: string, leitura: Partial<Leit>): string | null {
  if (ens_nome !== '1.2 - IEC 61000-4-3') return null
  const pol = String(leitura.polarizacao || '').trim().toLowerCase()
  const face = String(leitura.face || '').trim().toLowerCase()
  const face_f = FACE_PERFIL.find(([k]) => k === face)?.[1] ?? FACE_PERFIL.find(([k]) => face.includes(k))?.[1] ?? null
  const pol_f = pol.startsWith('v') ? 'Vertical' : pol.startsWith('h') ? 'Horizontal' : null
  return face_f && pol_f ? `Polaridade ${pol_f} - ${face_f}` : null
}

/** Séries do gráfico erro × frequência de um bloco ou de todos os blocos de um ensaio de varredura (null se não
 *  houver pontos). Erro em relação à média da verificação inicial de referência (como no FOR). */
export function series_grafico(reg: Registro, ens_nome: string, bloco: Bloco | null = null) {
  if (MODELOS[ens_nome]?.tipo !== 'freq') return null
  const ens = reg.ensaios[ens_nome]
  const ref = stats_inicial(reg.iniciais[ens.ref]).media
  const blocos = bloco !== null ? [bloco] : ens.blocos
  const series: { nome: string; pontos: [number, number | null][] }[] = []
  for (const b of blocos) {
    const pts = b.linhas.filter(l => !l.sem_freq && l.volume !== null && num(l.rotulo))
      .map(l => [num(l.rotulo) as number, erro(l.volume, ref)] as [number, number | null])
    if (pts.length) series.push({ nome: b.nome.replace('Polaridade ', ''), pontos: pts })
  }
  if (!series.length) return null
  const faixas = (MODELOS[ens_nome].faixas ?? []).map(([n, a, b]) => [n, a, b] as [string, number, number])
  const titulo = `${ens_nome} — erro × frequência` + (bloco !== null ? ` — ${bloco.nome}` : '')
  return { series, faixas, titulo }
}

export function _tot_txt(v: number): string {
  return fixo(Number(v), 3).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')
}

/** Totalizador lido no ensaio: 'ini' = último registrado até o abastecimento n (inicial, parcial, retomada);
 *  'fim' = primeiro registrado a partir do abastecimento n. regs = tot_registros do ensaio. */
export function _tot_lido(regs: TotReg[] | undefined | null, n: number, lado: 'ini' | 'fim'): number | null {
  const vals = (regs ?? []).filter(r => r['Totalizador lido (L)'] !== null && r['Totalizador lido (L)'] !== undefined)
    .map(r => [Math.trunc(Number(r['Até abastecimento nº'] || 0)), Number(r['Totalizador lido (L)'])] as [number, number])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1])
  if (lado === 'ini') {
    const c = vals.filter(([k]) => k <= n)
    return c.length ? c[c.length - 1][1] : null
  }
  const c = vals.filter(([k]) => k >= n)
  return c.length ? c[0][1] : null
}

const MIN_DATA = -8.64e15  // datetime.min
const chaveTempo = (l: Partial<Leit>) => [(_data(l.data)?.getTime() ?? MIN_DATA), String(l.hora ?? '')] as const
const cmpTempo = (a: readonly [number, string], b: readonly [number, string]) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
const dentroFaixa = (l: Partial<Leit>, a_: number, z_: number, ult: boolean) => {
  const f = (l.freq || l.freq_ref) as number | null | undefined
  return !!f && ((a_ <= f && f < z_) || (ult && f === z_))
}

/** Totalizador inicial/final de cada bloco (e de cada faixa) a partir dos totalizadores registrados nos ensaios
 *  de origem das leituras: inicial = o lido antes da 1ª leitura do bloco; final = o lido na/depois da última.
 *  Leituras de mais de um ensaio (ex.: parte da face feita ontem): inicial do mais antigo, final do mais novo.
 *  totais = {pasta do ensaio (como nas leituras): tot_registros}. Só preenche campos vazios (o final é atualizado
 *  quando o bloco cresce). Retorna quantos campos foram preenchidos. */
export function preencher_totalizadores(reg: Registro, ens_nome: string, leituras: Partial<Leit>[], totais: Record<string, TotReg[]>,
  bloco_destino: string | null = null): number {
  if (!totais || !Object.keys(totais).length) return 0
  const ens = reg.ensaios[ens_nome]
  const por_nome = new Map(ens.blocos.map(b => [b.nome, b]))
  const grupos = new Map<string, Partial<Leit>[]>()
  for (const l of leituras) {
    if (l.volume === null || l.volume === undefined || l.n === null || l.n === undefined || !(String(l.ensaio) in totais)) continue
    const alvo = bloco_destino || bloco_para_leitura(ens_nome, l) || ens.blocos[0].nome
    if (!grupos.has(alvo)) grupos.set(alvo, [])
    grupos.get(alvo)!.push(l)
  }
  const extremos = (ls: Partial<Leit>[]): [number | null, number | null] => {
    const por_ens = new Map<string, Partial<Leit>[]>()
    for (const l of ls) {
      const k = String(l.ensaio)
      if (!por_ens.has(k)) por_ens.set(k, [])
      por_ens.get(k)!.push(l)
    }
    const minT = (g: Partial<Leit>[]) => g.map(chaveTempo).reduce((m, x) => (cmpTempo(x, m) < 0 ? x : m))
    const ordem = [...por_ens.values()].sort((g1, g2) => cmpTempo(minT(g1), minT(g2)))
    const primeiro = ordem[0], ultimo = ordem[ordem.length - 1]
    const ini = _tot_lido(totais[String(primeiro[0].ensaio)], Math.min(...primeiro.map(x => Math.trunc(Number(x.n)))) - 1, 'ini')
    const fim = _tot_lido(totais[String(ultimo[0].ensaio)], Math.max(...ultimo.map(x => Math.trunc(Number(x.n)))), 'fim')
    return [ini, fim]
  }
  let n = 0
  for (const [alvo, ls] of grupos) {
    const b = por_nome.get(alvo)
    if (!b) continue
    const [ini, fim] = extremos(ls)
    if (ini !== null && !String(b.tot_ini ?? '').trim()) { b.tot_ini = _tot_txt(ini); n++ }
    if (fim !== null) { b.tot_fim = _tot_txt(fim); n++ }
    const fx = b.faixas ?? []
    fx.forEach((x, i) => {
      const a_ = num(x.fmin), z_ = num(x.fmax)
      if (a_ === null || z_ === null) return
      const ult = i === fx.length - 1
      const dentro = ls.filter(l => dentroFaixa(l, a_, z_, ult))
      if (!dentro.length) return
      const [fi, ff] = extremos(dentro)
      if (fi !== null && !String(x.ini ?? '').trim()) { x.ini = _tot_txt(fi); n++ }
      if (ff !== null) { x.fim = _tot_txt(ff); n++ }
    })
  }
  return n
}

/** Leituras (leituras_reg) e totalizadores de um estado_ensaio.json salvo, prontos para importar.
 *  totais = {valor de 'ensaio' das leituras: tot_registros} — inclui os de leituras trazidas de outros ensaios. */
export function leiturasETotais(est: Record<string, unknown>, pasta: string): [LeituraReg[], Record<string, TotReg[]>] {
  const leituras = ((est.leituras_reg as LeituraReg[] | undefined) ?? []).map(l => ({ ...l }))
  const m = pasta.split(/[\\/]/).pop()!.match(/ensaio_(\d{4})(\d{2})(\d{2})_/)
  const data_pasta = m ? `${m[3]}/${m[2]}/${m[1]}` : ''
  for (const l of leituras) {  // ensaios antigos: a pasta e a data não estavam gravadas em cada leitura
    if (l.ensaio === undefined) l.ensaio = pasta
    if (data_pasta && l.data === undefined) l.data = data_pasta
  }
  const totais: Record<string, TotReg[]> = { ...((est.tot_importados as Record<string, TotReg[]>) ?? {}) }
  for (const l of leituras) {
    if (!l.importada && !(String(l.ensaio) in totais)) totais[String(l.ensaio)] = (est.tot_registros as TotReg[]) ?? []
  }
  return [leituras, totais]
}
export const leituras_e_totais = leiturasETotais

/** Ordem cronológica (data, hora) — leituras trazidas de ensaios anteriores vêm antes. */
export function ordenar_leituras<T extends Partial<Leit>>(ls: T[]): T[] {
  return [...ls].sort((a, b) => cmpTempo(chaveTempo(a), chaveTempo(b)))
}

/** Coloca as leituras no ensaio. Retorna {bloco: quantidade}.
 *  modo "acrescentar": novas linhas (rótulo = frequência ou segmento);
 *  modo "preencher": ocupa em ordem as linhas vazias (mantém os rótulos do formulário). */
export function importar(reg: Registro, ens_nome: string, leituras: Partial<Leit>[], bloco_destino: string | null = null,
  modo: 'acrescentar' | 'preencher' = 'acrescentar'): Record<string, number> {
  const ens = reg.ensaios[ens_nome]
  const tipo = MODELOS[ens_nome].tipo
  const por_nome = new Map(ens.blocos.map(b => [b.nome, b]))
  const contagem: Record<string, number> = {}
  const destino = (l: Partial<Leit>) => bloco_destino || bloco_para_leitura(ens_nome, l) || ens.blocos[0].nome
  for (const l of leituras) {
    const alvo = destino(l)
    if (!por_nome.has(alvo)) {
      por_nome.set(alvo, novo_bloco(alvo, [], MODELOS[ens_nome].faixas ?? []))
      ens.blocos.push(por_nome.get(alvo)!)
    }
    const bloco = por_nome.get(alvo)!
    const dados: Record<string, unknown> = { volume: l.volume ?? null, obs: l.obs ?? '' }  // preço: cadastro; total: litros × preço
    // rastreabilidade até a leitura da câmera: foto (se houver), pasta do ensaio e nº da leitura
    for (const k of ['foto', 'ensaio', 'n'] as const) if (l[k]) dados[k] = l[k]
    if (l.sem_freq) {
      // frequência parada no gerador e bomba contando: linha própria (não ocupa um ponto do formulário),
      // entra no Σ/Prova do totalizador e na faixa em que o gerador parou; fora dos erros máx./mín.
      bloco.linhas.push({ ...dados, rotulo: ROTULO_SEM_FREQ, sem_freq: true, freq_ref: l.freq_ref ?? null } as Linha)
      contagem[alvo] = (contagem[alvo] ?? 0) + 1
      continue
    }
    if (modo === 'preencher') {
      const vazia = bloco.linhas.find(x => x.volume === null)
      if (vazia) {
        Object.assign(vazia, dados)
        contagem[alvo] = (contagem[alvo] ?? 0) + 1
        continue
      }
    }
    const rot = tipo === 'freq' && l.freq ? fmtGp(Number(l.freq), 6) : String(l.segmento || '')
    bloco.linhas.push({ ...dados, rotulo: rot.replace(/\./g, ',') } as Linha)
    contagem[alvo] = (contagem[alvo] ?? 0) + 1
  }
  // data inicial e final de cada bloco = primeira e última leitura importada (amplia se já havia datas)
  for (const alvo of Object.keys(contagem)) {
    const b = por_nome.get(alvo)!
    const datas = [...leituras.filter(l => destino(l) === alvo).map(l => _data(l.data)), _data(b.data_ini), _data(b.data_fim)]
      .filter((d): d is Date => !!d)
    if (datas.length) {
      b.data_ini = ddmmaaaa(new Date(Math.min(...datas.map(d => d.getTime()))))
      b.data_fim = ddmmaaaa(new Date(Math.max(...datas.map(d => d.getTime()))))
    }
  }
  return contagem
}

export const PASSO_LOG_PCT = 1.0  // passo da varredura logarítmica (IEC 61000-4-3 / 4-6): cada frequência = anterior × 1,01

/** Frequência como rótulo da linha (mesmo formato da importação: 6 algarismos, vírgula). */
export const rotulo_freq = (f: number) => fmtGp(f, 6).replace(/\./g, ',')

/** Frequência da nova linha incluída depois da linha i (null = depois da última): a da linha anterior com
 *  frequência × (1 + passo); sem nenhuma, o início da 1ª faixa. Não passa do fim da faixa (como o gerador, que
 *  termina a faixa exatamente na frequência final). Retorna null se já estiver na frequência final do ensaio. */
export function proxima_freq(linhas: Linha[], i: number | null, faixas: Faixa[] | undefined, passo_pct = PASSO_LOG_PCT): number | null {
  const lims = (faixas ?? []).map(x => [num(x.fmin), num(x.fmax)] as const)
    .filter((x): x is readonly [number, number] => x[0] !== null && x[1] !== null)
  const fim = i !== null ? i : linhas.length - 1
  let base: number | null = null
  for (const l of (fim >= 0 ? linhas.slice(0, fim + 1) : []).reverse()) {
    const f = num(l.rotulo)
    if (f && !l.sem_freq) { base = f; break }
  }
  if (base === null) return lims.length ? lims[0][0] : null
  if (lims.length && base >= Math.max(...lims.map(([, z]) => z)) * (1 - 1e-9)) return null
  const nova = base * (1 + passo_pct / 100.0)
  for (const [a, z] of lims) if (a <= base && base < z * (1 - 1e-9) && nova > z) return z
  return nova
}

// --------------------------------------------------------------------------- montar o registro por segmento
export const _fmt_mhz = (f: number | null | undefined) =>
  !f ? '—' : (f < 1000 ? `${fmtGp(f, 6)} MHz` : `${fmtGp(f / 1000, 4)} GHz`).replace(/\./g, ',')

export interface EnsaioSalvo {
  pasta: string; rel: string; nome: string; quando: string; ordem: string
  segmentos: Record<string, Leit[]>; totais: Record<string, TotReg[]>; defs: Record<string, [number | null, number | null]>
}

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p

/** Monta o ensaio do formulário com os segmentos escolhidos, cada um vindo do ensaio salvo em que ficou certo.
 *  partes: [(leituras do segmento, totais daquele ensaio)]. Dentro de cada bloco as linhas ficam em ordem de
 *  frequência. substituir=true: limpa antes as leituras, datas e totalizadores dos blocos envolvidos.
 *  Totalizador: preenchido por faixa/bloco quando vem de um só ensaio; com vários ensaios na mesma faixa/bloco
 *  (abastecimentos das tentativas descartadas passaram pelo totalizador entre eles) fica em branco e a observação
 *  do bloco lista o totalizador de cada ensaio. Retorna (leituras por bloco, totalizadores preenchidos, avisos). */
export function montar_por_segmento(reg: Registro, ens_nome: string, partes: [Leit[], Record<string, TotReg[]>][], substituir = true):
  [Record<string, number>, number, string[]] {
  const ens = reg.ensaios[ens_nome]
  const tipo = MODELOS[ens_nome].tipo
  let leituras: Leit[] = []
  const totais: Record<string, TotReg[]> = {}
  for (const [ls, tt] of partes) {
    leituras = leituras.concat(ls.filter(l => l.volume !== null && l.volume !== undefined).map(l => ({ ...l })))
    Object.assign(totais, tt)
  }
  if (!leituras.length) return [{}, 0, []]
  const primeiro = ens.blocos.length ? ens.blocos[0].nome : 'Leituras'
  const destino = (l: Partial<Leit>) => bloco_para_leitura(ens_nome, l) || primeiro
  const alvos = new Set(leituras.map(destino))
  if (substituir) {
    for (const b of ens.blocos) {
      if (!alvos.has(b.nome)) continue
      if (tipo === 'freq') b.linhas = []
      else {
        for (const x of b.linhas) {
          Object.assign(x, { volume: null, obs: '' })
          delete x.foto; delete x.ensaio; delete x.n
        }
      }
      b.tot_ini = b.tot_fim = ''; b.data_ini = b.data_fim = ''
      for (const x of b.faixas ?? []) x.ini = x.fim = ''
    }
  }
  const ordem = tipo === 'freq'
    ? [...leituras].sort((a, b) => (Number(a.freq || a.freq_ref || 0) - Number(b.freq || b.freq_ref || 0)) || cmpTempo(chaveTempo(a), chaveTempo(b)))
    : ordenar_leituras(leituras)
  const cont = importar(reg, ens_nome, ordem, null, tipo === 'freq' ? 'acrescentar' : 'preencher')
  let n_tot = preencher_totalizadores(reg, ens_nome, ordem, totais)
  const avisos: string[] = []
  for (const b of ens.blocos) {
    if (!alvos.has(b.nome)) continue
    const ls_b = ordem.filter(l => destino(l) === b.nome)
    const origens = [...new Set(ls_b.map(l => String(l.ensaio)))].sort()
    const fx = b.faixas ?? []
    fx.forEach((x, i) => {
      const a_ = num(x.fmin), z_ = num(x.fmax)
      if (a_ === null || z_ === null) return
      const ult = i === fx.length - 1
      const dentro = new Set(ls_b.filter(l => dentroFaixa(l, a_, z_, ult)).map(l => String(l.ensaio)))
      if (dentro.size > 1) {
        n_tot -= (['ini', 'fim'] as const).filter(k => String(x[k] ?? '').trim()).length
        x.ini = x.fim = ''
      }
    })
    b.obs = String(b.obs ?? '').split('\n').filter(t => !t.startsWith('Montado de ')).join('\n')
    if (origens.length > 1) {
      n_tot -= (['tot_ini', 'tot_fim'] as const).filter(k => String(b[k] ?? '').trim()).length
      b.tot_ini = b.tot_fim = ''
      const partes_txt: string[] = []
      for (const o of origens) {
        const lo = ls_b.filter(l => String(l.ensaio) === o)
        const fs = lo.filter(l => l.freq).map(l => Number(l.freq))
        const ini = lo[0].n ? _tot_lido(totais[o], Math.min(...lo.map(l => Math.trunc(Number(l.n)))) - 1, 'ini') : null
        const fim = lo[0].n ? _tot_lido(totais[o], Math.max(...lo.map(l => Math.trunc(Number(l.n)))), 'fim') : null
        partes_txt.push(`${basename(o)} (${fs.length ? _fmt_mhz(Math.min(...fs)) : '—'} a ${fs.length ? _fmt_mhz(Math.max(...fs)) : '—'}): totalizador `
          + `${ini !== null ? _tot_txt(ini) : '—'} → ${fim !== null ? _tot_txt(fim) : '—'}`)
      }
      const nota = `Montado de ${origens.length} ensaios — ` + partes_txt.join('; ')
      b.obs = (b.obs.trim() ? b.obs + '\n' : '') + nota
      avisos.push(`${b.nome}: ${origens.length} ensaios — totalizador do bloco em branco (conferido por ensaio na observação do bloco)`)
    }
  }
  return [cont, n_tot, avisos]
}
