// VIGIA-7S no app — aba "Ensaio": controle do ensaio, leituras, totalizador, segmentos, salvar/continuar
// (porte da parte de vigia7s/app.py que vai de iniciar_ensaio a _registrar e do _tick). Os nomes seguem o Python.
'use client'
import { campoDe, formatar, legivel, type CampoDisplay, type ResultadoCampo } from '@/lib/vigia/seg7'
import {
  Cronograma, fmtFreq, fmtTempo, frequencias, tempoPasso, rotulo, segmentoDe, chaveSegmento, monotonic,
  type Segmento, type StatusCron,
} from '@/lib/vigia/emc'
import { DetectorCiclo } from '@/lib/vigia/ciclo'
import { br, num, fixo, pyRoundN, erroPct, fmtErro, falaNum, falaFreq, strftime, sinalBr, csvLinha } from '@/lib/vigia/util'
import { Var, rotulo as rot, messagebox, simpledialog, fmtG } from '@/lib/vigia/tk'
import { desenharCampos, semAcento } from '@/lib/vigia/desenho'
import { App, COR_OK, COR_FALHA, COR_NEUTRO, COR_AVISO, NOME_APP, DESCRICAO_APP } from '@/lib/vigia/app'
import { leiturasETotais } from '@/lib/vigia/registro'

export type Linha = (string | number)[]
export interface LinhaTabela { id: string; valores: (string | number)[]; tag: string }
type Quadro = { largura: number; altura: number; dados: ArrayBuffer }
export interface LeituraReg {
  n?: number; hora?: string; data?: string; status?: string; segmento?: string; face?: string; polarizacao?: string
  freq?: number | null; sem_freq?: boolean; freq_ref?: number | null; preco?: number | null; total?: number | null
  volume?: number | null; obs?: string; ensaio?: string; erro?: number | null; foto?: string; importada?: boolean; origem?: string
  [k: string]: unknown
}
export type TotReg = Record<string, string | number | null>
interface Ctx {
  em_ensaio: boolean; evento?: boolean; emc: StatusCron; faixa: string; hora: Date; tempo: number
  parado_s?: number | null; instantanea?: boolean
  status: string; obs: string; valores: Record<string, number | null>; quadro: Quadro | null
  resultados: Record<string, ResultadoCampo>; campos: CampoDisplay[]
  quadro_suspeito?: Quadro | null; res_suspeito?: Record<string, ResultadoCampo>
}

/** Janelas (Toplevel do Python) que a tela mostra; resolvem a Promise de quem abriu. */
export type Janela =
  | { tipo: 'totalizador'; tipoTot: string; resolver: (r: [string, number, number] | null) => void }
  | { tipo: 'parecer'; n: number }
  | { tipo: 'corrigir'; n: number }
  | { tipo: 'excluir' }
  | { tipo: 'alerta_parada'; motivo: string; texto: string; resolver: () => void }
  | { tipo: 'continuar'; itens: { pasta: string; rel: string; est: Record<string, unknown> }[] }
  | { tipo: 'escolher' }
  | { tipo: 'editar_seg'; i: number; resolver: (ok: boolean) => void }
  | { tipo: 'trazer'; i_seg: number; est: Record<string, unknown>; rel: string; grupos: Record<string, LeituraReg[]>; resolver: () => void }

const api = (corpo: Record<string, unknown>) =>
  fetch('/api/vigia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j })

const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, Math.max(0, ms)))

export class VigiaApp extends App {
  static DECISOES = [
    'Falha confirmada (indicação do mostrador incorreta)',
    'Leitura incorreta da câmera — falso alarme (mostrador correto)',
    'Falha real da bomba (EUT) — registrar no relatório',
    'Outro (descrever na justificativa)',
  ]
  static ARQ_ESTADO = 'estado_ensaio.json'
  static CAMPOS_SEG: [keyof Segmento, string][] = [
    ['nome', 'Nome'], ['f_ini', 'F. inicial (MHz)'], ['f_fim', 'F. final (MHz)'], ['passo_pct', 'Passo log (%)'],
    ['dwell_s', 'Dwell (s)'], ['extra_s', 'Extra/passo (s)'], ['duracao_s', 'Duração (s) [etapa por tempo]'],
    ['face', 'Face do EUT'], ['polarizacao', 'Polarização'], ['obs', 'Observação'],
  ]

  // ------------------------------------------------------------------ estado do ensaio
  cron = new Cronograma([])
  pasta: string | null = null       // caminho completo (mensagens)
  pastaRel: string | null = null    // relativo a resultados/ (gravação)
  linhas: Linha[] = []
  leituras_reg: LeituraReg[] = []
  n_leitura = 0
  n_ok = 0
  n_falha = 0
  freq_parada = false   // "parar só a frequência": gerador parado, bomba contando
  n_sem_freq = 0
  prox_leitura: number | null = null
  t_inicio: number | null = null
  pausa_ini: number | null = null
  t_pausado = 0.0
  t_fim_ensaio = 0.0
  lendo = false
  ult_quadro: Ctx | null = null
  tot_inicial: number | null = null
  acum: [number, number][] = [[0.0, 0]]   // [(soma dos volumes lidos, leituras sem volume)] após cada abastecimento
  tot_registros: TotReg[] = []
  n_tot_div = 0
  tot_ajuste = 0.0   // volume dispensado com o ensaio parado (retomadas)
  _concluido = false
  pareceres: Record<string, Record<string, unknown>> = {}   // por nº de leitura (trilha de auditoria)
  correcoes: Record<string, Record<string, unknown>[]> = {}
  exclusoes: Record<string, unknown>[] = []
  tot_importados: Record<string, TotReg[]> = {}
  nome_ensaio = ''
  det_disparo: DetectorCiclo | null = null
  erros_seguidos = 0
  pos_ult_leitura: Record<string, unknown> | null = null
  det_ensaio: DetectorCiclo | null = null
  ciclo_obs: number | null = null
  amostras_freq: [string, number | null][] = []
  fila: Ctx[] = []
  armado = false
  t_ult_leitura = 0.0
  t_ult_ciclo = 0.0
  t_ult_mudanca = 0.0
  t_inicio_abast: number | null = null
  _vis: { val: number | null; cand?: number | null; n: number; ult?: number | null; t_ult?: number; t_1a_dif?: number } = { val: null, cand: null, n: 0 }
  _mudou_desde_leitura = false
  _t_ativou = 0.0
  _cron_ativo_antes = false
  _motivo_parada: string | null = null
  _avisou_faltando = new Set<string>()
  _avisou_travado = false
  _seg_idx_ant: number | null = null
  _parado_na_leitura: number | null = null
  _captura_inst = false
  _apos_leitura: string | null = null
  _freq_parada_em = 0
  _n_sf_ini = 0
  _fechando = false
  _frase_alerta: string | null = null
  private _rep_id: ReturnType<typeof setTimeout> | null = null
  private _io: Promise<unknown> = Promise.resolve()

  // ------------------------------------------------------------------ tela da aba Ensaio
  lbl_status = new Var<{ text: string; bg: string }>({ text: 'PARADO', bg: COR_NEUTRO })
  lbl_status_det = new Var('')
  lbl_abast = new Var('Abastecimento 0 / 0')
  lbl_ok = new Var('OK: 0')
  lbl_falha = new Var('Falhas: 0')
  lbl_prox = new Var('Próxima leitura: —')
  lbl_tempo = new Var('Tempo de ensaio: 00:00')
  lbl_tot = new Var('')
  lbl_ciclo = new Var('')
  bt_iniciar = new Var(true)
  bt_pausar = new Var({ text: '⏸ Pausar', on: false })
  bt_parar = new Var(false)
  bt_freq = new Var({ text: '⏸ PARAR SÓ A FREQUÊNCIA  (gerador parado — bomba segue p/ o totalizador)', bg: '#fef7e0', on: false })
  bt_prox_seg = new Var({ text: '▶ Iniciar próximo segmento', on: false })
  lbl_perfil = new Var('')
  lbl_seg = new Var('')
  lbl_freq = new Var('—')
  lbl_passo = new Var('')
  pb_seg = new Var(0)
  colunasTab = new Var<string[]>([])
  tree = new Var<LinhaTabela[]>([])
  selTab = new Var<string[]>([])
  verUltimo = new Var(0)
  semImagem = new Var(false)
  janela = new Var<Janela | null>(null)
  alerta = new Var<{ titulo: string; detalhe: string } | null>(null)
  private _iid = 0

  // ================================================================== infraestrutura
  /** grava na pasta do ensaio, na ordem (como as escritas síncronas do Python) */
  io<T>(f: () => Promise<T>): Promise<T> {
    const p = this._io.then(f, f)
    this._io = p.catch(() => undefined)
    return p
  }

  private rel(...partes: string[]) { return [this.pastaRel, ...partes].filter(Boolean).join('/') }

  /** caminho_portatil(): relativo à pasta do app (aqui: resultados/…) */
  caminhoPortatil(...partes: string[]) { return ['resultados', this.pastaRel, ...partes].filter(Boolean).join('/') }

  private treeInsert(valores: (string | number)[], tag: string) {
    const id = String(++this._iid)
    this.tree.set([...this.tree.get(), { id, valores, tag }])
    this.verUltimo.set(this.verUltimo.get() + 1)
    return id
  }

  // ================================================================== montagem
  async iniciar() {
    await super.iniciar()
    this._configurar_colunas()
    this._atualizar_lbl_perfil()
    this.alarme.ao_disparar = () => { /* restaurar_expandidas: a tela da aba Ensaio já fica inteira */ }
    setTimeout(() => void this._verificar_interrompido(), 1500)
  }

  _colunas(): string[] {
    return ['#', 'Hora', 'Tempo', ...this.campos.map(c => c.nome), 'Erro [% L]', 'Acumulado (L)', 'Totalizador esperado',
      'Status', 'Segmento', 'Freq. atual', 'Faixa varrida desde a leitura anterior', 'Observação', 'Parecer do operador']
  }

  _configurar_colunas() { this.colunasTab.set(this._colunas()) }

  _atualizar_lbl_perfil() {
    const nome = this.estado !== 'parado' ? this.nome_ensaio : ''
    this.lbl_perfil.set((nome ? `Ensaio: ${nome}\n` : '') + 'Perfil: ' + this.cfg.perfil)
    if (typeof document !== 'undefined') document.title = NOME_APP + (nome ? ` — ${nome}` : ` — ${DESCRICAO_APP}`)
  }

  _recarregar_segmentos(sel: number | null = null) {
    this.cron_segmentos = this.cron.segmentos
    super._recarregar_segmentos(sel)
  }

  _pintar_segmentos() {
    this.cron_segmentos = this.cron?.segmentos ?? []
    super._pintar_segmentos()
  }

  _set_status(txt: string, cor: string, det: string | null = null) {
    this.lbl_status.set({ text: txt, bg: cor })
    if (det !== null) this.lbl_status_det.set(det)
  }

  // ================================================================== CONTROLE DO ENSAIO
  async iniciar_ensaio() {
    if (this.estado !== 'parado') return
    if (!this.campos.length) { await messagebox.showerror('Ensaio', 'Configure ao menos um campo do display na aba de calibração.'); return }
    if (!this.camera.ativa || !(await this.proc?.lerUltimo([], false))) {
      if (!await messagebox.askyesno('Ensaio', 'A câmera não está enviando imagens. Iniciar mesmo assim?')) return
    }
    await this.salvar_cfg()
    const e = this.cfg.ensaio
    const segs = this.perfis[this.cfg.perfil] ?? []
    // nome do ensaio (vai para a pasta, o painel, a lista de retomada e os registros)
    const cod = this.cfg.perfil.match(/61000-4-\d+|D11/)
    const sugestao = `${cod ? cod[0] : 'Ensaio'} - ${strftime(new Date(), '%d-%m-%Y %H%M')}`
    let nome_ensaio = await simpledialog.askstring('Nome do ensaio', 'Dê um nome para este ensaio\n(ex.: 4-3 Face 1 Vertical 80-300 / amostra 12345678):', sugestao)
    if (!nome_ensaio || !nome_ensaio.trim()) return
    nome_ensaio = nome_ensaio.trim()
    const quando = e.modo_leitura === 'congelado'
      ? `Leitura AUTOMÁTICA quando o valor congelar (parado ≥ ${br(e.congelado_s, 1)} s)`
      : `Por tempo: 1ª leitura no 1º congelamento após o início; depois 1 abastecimento a cada ${br(e.intervalo_s, 1)} s (contados da saída do valor congelado)`
    // totalizador inicial ANTES do "Sim", para não atrasar o início junto com o gerador/bomba
    this.tot_inicial = null
    this.acum = [[0.0, 0]]
    let tot_ini: number | null = null
    if (this.cfg.totalizador.pedir_inicial) {
      const r = await this._dialogo_totalizador('Inicial')
      if (r) tot_ini = r[1]
    }
    const disparo = e.disparo_saida ?? true
    const instrucao = disparo
      ? 'Clique em Sim e ligue a bomba: a contagem da perturbação (dwell) começa sozinha no instante em que o display SAIR do valor congelado.'
      : 'Inicie a perturbação (software do gerador) e a bomba AO MESMO TEMPO que clicar em Sim.'
    const resumo = `Ensaio: ${nome_ensaio}\nPerfil EMC: ${this.cfg.perfil}\nAbastecimentos: ${e.n_abastecimentos}\n${quando}\n`
      + `Totalizador inicial: ${tot_ini !== null ? br(tot_ini, 2) + ' L' : 'não informado'}\n\n` + instrucao
    if (!await messagebox.askyesno('Iniciar ensaio', resumo)) return

    const slug = nome_ensaio.replace(/[^\p{L}\p{N}_\-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60)
    const nome = strftime(new Date(), 'ensaio_%Y%m%d_%H%M%S') + (slug ? `_${slug}` : '')
    this.nome_ensaio = nome_ensaio
    this.pastaRel = nome
    const r1 = await api({ acao: 'escrever', rel: `${nome}/configuracao.json`, texto: JSON.stringify({ config: this.cfg, perfil_emc: segs }, null, 2) })
    this.pasta = String(r1.caminho).replace(/[\\/]configuracao\.json$/, '')
    await api({ acao: 'escrever', rel: `${nome}/imagens/.vigia`, texto: '' }).catch(() => undefined)
    await api({ acao: 'escrever', rel: `${nome}/leituras.csv`, texto: '﻿' + csvLinha([...this._colunas(), 'Imagem']) })

    this.campos_ensaio = this.campos.map(c => campoDe(JSON.parse(JSON.stringify(c))))
    this.leituras_reg = []
    this._configurar_colunas()
    this.tree.set([])
    this.linhas = []
    this.n_leitura = this.n_ok = this.n_falha = 0
    this.n_sem_freq = 0
    this.freq_parada = false
    this.amostras_freq = []
    this.tot_ajuste = 0.0
    this.pos_ult_leitura = null
    this._concluido = false
    this.pareceres = {}
    this.correcoes = {}
    this.exclusoes = []
    this.tot_importados = {}
    this._preparar_execucao(segs, 0.0)
    this.estado = 'rodando'
    if (disparo) {
      this.cron.posicionar(0, 0.0)  // aguardando: começa na 1ª saída do valor congelado
      this._armar_disparo()
    } else {
      this.cron.iniciar()
    }
    this._iniciar_amostrador()
    this._atualizar_lbl_perfil()
    if (!disparo) this._set_status('EM ENSAIO', COR_OK, 'Aguardando a primeira leitura…')
    this.tot_registros = []
    this.n_tot_div = 0
    if (tot_ini !== null) this._registrar_totalizador('Inicial', tot_ini, 0)
    this.bt_iniciar.set(false)
    this.bt_pausar.set({ on: true, text: '⏸ Pausar' })
    this.bt_parar.set(true)
  }

  /** Relógio, leitura programada, detectores e cronograma EMC (início novo ou retomada). */
  _preparar_execucao(segs: Segmento[], tempo_ja: number) {
    const agora = monotonic()
    this.t_inicio = agora - tempo_ja
    this.t_pausado = 0.0
    // por tempo: o 1º abastecimento após o início já é lido (sem atraso); o intervalo conta das saídas
    this.prox_leitura = -Infinity
    this.det_ensaio = null
    this.ciclo_obs = null
    if (this.ciclo_medido) {
      // ciclo medido: acompanha o período de cada ciclo durante o ensaio (painel)
      this.det_ensaio = new DetectorCiclo(this.ciclo_medido.ref, this.ciclo_medido.decimais, this._estavel_s())
      delete this.ciclo_medido.saida_ensaio
    }
    this.armado = false
    this.t_ult_leitura = 0.0
    this.t_ult_ciclo = agora
    this.cron = new Cronograma(segs)
    this.cron_segmentos = this.cron.segmentos
    // situação de cada segmento: pendente | atual | feito | pulado
    this.seg_status = this.cron.segmentos.map(() => 'pendente')
    this._seg_idx_ant = null
    // disparo da perturbação na saída do valor congelado + vigia de display travado + erros seguidos
    this.det_disparo = null
    this.t_ult_mudanca = agora
    this._vis = { val: null, cand: null, n: 0 }
    this._mudou_desde_leitura = false  // valor mudou (abastecimento) desde a última validação
    this.t_inicio_abast = null         // saída do valor congelado que iniciou o abastecimento atual
    this._t_ativou = agora             // p/ o vigia de travamento: só conta com a perturbação ativa
    this._cron_ativo_antes = false
    this.erros_seguidos = 0
    this._motivo_parada = null
    this._avisou_faltando = new Set()  // avisos "faltam N pontos" já dados (por segmento e do ensaio)
    this._avisou_travado = false       // aviso de mostrador parado já dado (volta a valer quando o valor mudar)
  }

  // ------------------------------------------------------------------ avisos (bipe / voz) e alerta grave
  _modo_aviso() { return String(this.cfg.alarme.modo_aviso ?? 'bipe e voz') }

  /** Aviso curto, sem exigir reconhecimento: bipes e/ou frase falada, conforme a configuração. */
  _avisar(frase: string, bipes: [number, number, number] | null = [3, 1800, 160]) {
    if (!(this.cfg.alarme.ativo ?? true)) return
    const modo = this._modo_aviso()
    const com_bipe = modo.includes('bipe') && !!bipes
    if (com_bipe && !this.alarme.tocando) this.alarme.bipes(...bipes!)
    if (modo.includes('voz') && frase) {
      if (com_bipe) setTimeout(() => this.voz.falar(frase), 900)  // depois dos bipes
      else this.voz.falar(frase)
    }
  }

  /** Erro muito elevado ou leitura impossível: janela vermelha na frente, frase falada repetida e/ou buzzer
   *  contínuo até o operador reconhecer. */
  _alerta_grave(frase: string, titulo: string, detalhe: string) {
    const a = this.cfg.alarme
    if (!(a.ativo ?? true)) return
    const modo = this._modo_aviso()
    if (modo.includes('bipe')) this.alarme.disparar(a.freq_hz, a.dur_ms, a.continuo, modo.includes('voz') ? 4.0 : 0.0)
    if (modo.includes('voz')) { this.voz.falar(frase); this._repetir_frase(frase) }
    this._piscar_barra()
    this._janela_alerta(titulo, detalhe)
  }

  /** Repete a frase de alerta até o operador reconhecer (no máximo 'vezes'). */
  _repetir_frase(frase: string, intervalo_ms = 15000, vezes = 8) {
    this._frase_alerta = frase
    if (this._rep_id) clearTimeout(this._rep_id)
    let n = 0
    const rep = () => {
      this._rep_id = null
      if (this._frase_alerta && n < vezes) {
        n += 1
        this.voz.falar(this._frase_alerta)
        this._rep_id = setTimeout(rep, intervalo_ms)
      }
    }
    this._rep_id = setTimeout(rep, intervalo_ms)
  }

  /** Janela vermelha por cima de tudo (não trava o ensaio); 'Estou ciente' silencia o alarme e a voz. */
  _janela_alerta(titulo: string, detalhe: string) {
    this._trazer_para_frente()
    this.alerta.set({ titulo, detalhe: `${strftime(new Date(), '%H:%M:%S')}  —  ${detalhe}` })
  }

  /** Para buzzer, voz e repetição da frase e fecha a janela de alerta. */
  _silenciar() {
    this.alarme.parar()
    this._frase_alerta = null
    if (this._rep_id) { clearTimeout(this._rep_id); this._rep_id = null }
    this.voz.calar()
    this.alerta.set(null)
  }

  /** Aviso quando faltarem N pontos para terminar o segmento (troca de antena/polarização) ou o ensaio. */
  _avisar_faltando(emc: StatusCron) {
    const n = Math.trunc(num(this.cfg.alarme.avisar_faltando ?? 3, 0) || 0)
    if (n <= 0) return
    const e = this.cfg.ensaio
    const ja = this._avisou_faltando
    let msg: string | null = null
    const restamEnsaio = e.parar_ao_atingir ? Math.trunc(e.n_abastecimentos) - this._n_com_freq() : null
    if (restamEnsaio !== null && restamEnsaio > 0 && restamEnsaio <= n && !ja.has('ensaio')) {
      ja.add('ensaio')
      msg = `falta${restamEnsaio > 1 ? 'm' : ''} ${restamEnsaio} ponto${restamEnsaio > 1 ? 's' : ''} para terminar o ensaio`
    } else if ((emc.estado === 'rodando' || emc.estado === 'pausado') && emc.n_passos && !emc.sem_freq) {
      const restam = Math.trunc(emc.n_passos) - Math.trunc(emc.passo || 0)
      const chave = `seg|${emc.idx}`
      if (restam > 0 && restam <= n && !ja.has(chave)) {
        ja.add(chave)
        msg = `falta${restam > 1 ? 'm' : ''} ${restam} ponto${restam > 1 ? 's' : ''} para terminar o segmento`
      }
    }
    if (msg) {
      this.lbl_status_det.set(`${this.lbl_status_det.get()}\n⚑ ${msg[0].toUpperCase() + msg.slice(1)}.` + (msg.includes('segmento') ? ` (${emc.nome})` : ''))
      this._avisar(`Atenção: ${msg}.`, [2, 1000, 250])
    }
  }

  /** traz o app para a frente (o Electron mostra a janela; o alerta já fica por cima da tela) */
  _trazer_para_frente() { try { window.focus() } catch { /* */ } }
  _piscar_barra() { /* a barra de tarefas pisca pelo Electron quando a janela não tem foco (alerta na tela) */ }

  // ------------------------------------------------------------------ tabela
  _esperado_volume(cv: CampoDisplay | null | undefined): number | null {
    if (cv && cv.esperado) return cv.esperado
    return this.registro_preset?.() ?? null
  }
  /** preset da verificação INICIAL do Registro (aba Registro FOR EMC38) */
  registro_preset: (() => number | null) | null = null
  /** preço unitário cadastrado no Registro (Dados da amostra) */
  registro_preco: (() => number | null) | null = null

  _recarregar_tabela() {
    const cols = this._colunas()
    const n_cols = cols.length, i_st = cols.indexOf('Status'), i_par = cols.indexOf('Parecer do operador')
    const rows: LinhaTabela[] = this.linhas.map(l => {
      const st = l.length > i_st ? String(l[i_st]) : ''
      let tag: string
      if (l[0] === '—' || l[0] === 'imp') tag = st.includes('DIVERG') || st.includes('PARADA AUTOM') ? 'falha' : 'tot'
      else tag = st.includes('corrigido') || (l.length > i_par && l[i_par]) ? 'rebatida' : st === 'OK*' ? 'aviso' : st.startsWith('OK') ? 'ok' : 'falha'
      return { id: String(++this._iid), valores: l.slice(0, n_cols), tag }
    })
    this.tree.set(rows)
    this.verUltimo.set(this.verUltimo.get() + 1)
  }

  _nums_selecionados(): number[] {
    const sel = new Set(this.selTab.get())
    return this.tree.get().filter(r => sel.has(r.id) && /^\d+$/.test(String(r.valores[0]))).map(r => Number(r.valores[0])).sort((a, b) => a - b)
  }

  _nums_leituras() { return this.linhas.filter(l => /^\d+$/.test(String(l[0]))).map(l => Number(l[0])) }

  _atualizar_contadores_tela() {
    this.lbl_ok.set(`OK: ${this.n_ok}`)
    this.lbl_falha.set(`Falhas: ${this.n_falha}`)
    this.lbl_abast.set(`Abastecimento ${this.n_leitura} / ${this.cfg.ensaio.n_abastecimentos}`)
    this._pintar_segmentos()
  }

  // ------------------------------------------------------------------ disparo, vigia e parada automática
  /** Arma o início do segmento EMC: a contagem começa no quadro em que o display sair do valor congelado. */
  _armar_disparo() {
    const campo = this._campo_vol_obj()
    const ref_txt = String(this.cfg.ensaio.ciclo_ref ?? 'auto')
    const ref = ref_txt.toLowerCase() === 'auto' ? null : num(ref_txt, null)
    this.det_disparo = new DetectorCiclo(ref, campo ? campo.decimais : 3, this._estavel_s())
    this._iniciar_amostrador()
    const alvo = ref === null ? 'do valor congelado' : `de ${br(ref, campo ? campo.decimais : 3)}`
    this.bt_prox_seg.set({ ...this.bt_prox_seg.get(), text: '▶ Iniciar AGORA (manual)' })
    this._set_status('ARMADO', COR_AVISO, `Ligue a bomba: a perturbação começa a contar no instante em que o display sair ${alvo}. (Se precisar, 'Iniciar AGORA (manual)'.)`)
  }

  /** Inicia o segmento EMC no instante t (monotônico) e registra o horário com milissegundos. */
  _disparar_emc(t: number, origem: string) {
    this.det_disparo = null
    this.bt_prox_seg.set({ ...this.bt_prox_seg.get(), text: '▶ Iniciar próximo segmento' })
    this.cron.iniciarProximo(t)
    this._t_ativou = monotonic()
    const quando = new Date(Date.now() - Math.max(0.0, monotonic() - t) * 1000)
    const ms = String(quando.getMilliseconds()).padStart(3, '0')
    const st = this.cron.status()
    this._linha_evento('INÍCIO EMC', `${st.nome} iniciado às ${strftime(quando, '%H:%M:%S')}.${ms} (${origem})`)
    this._set_status('EM ENSAIO', COR_OK, `Perturbação iniciada (${origem}) às ${strftime(quando, '%H:%M:%S')}.${ms}: ${st.nome}`)
    this._salvar_estado()
  }

  /** Display "vivo" = o valor exibido mudou (2 quadros legíveis seguidos diferentes do valor parado). */
  _vigiar_display(t: number, valor: number | null) {
    const v = this._vis
    if (valor === null) return
    // instante do 1º quadro (consecutivo) em que o valor deste quadro apareceu
    if (v.ult === undefined || v.ult === null || Math.abs(valor - v.ult) > 1e-9) { v.ult = valor; v.t_ult = t }
    if (v.val !== null && Math.abs(valor - v.val) <= 1e-9) { v.n = 0; return }
    v.n += 1
    if (v.n === 1) v.t_1a_dif = t  // 1º quadro diferente do valor parado (candidato a saída)
    if (v.val === null) {  // 1º valor visto: referência inicial, não conta como mudança
      v.val = valor; v.n = 0
      this.t_ult_mudanca = t
    } else if (v.n >= 2) {
      // mudança confirmada; o valor atual começou no 1º quadro em que ELE apareceu
      const t_saida = v.t_1a_dif ?? t
      const parado_antes = t_saida - this.t_ult_mudanca  // quanto tempo o valor anterior ficou parado
      v.val = valor; v.n = 0
      this.t_ult_mudanca = v.t_ult!
      if (!this._mudou_desde_leitura || parado_antes >= Number(this.cfg.ensaio.congelado_s)) {
        // saída de um valor CONGELADO = início de um abastecimento: a leitura dele leva a frequência deste instante
        this.t_inicio_abast = t_saida
      }
      this._mudou_desde_leitura = true
    }
  }

  /** Parada automática: display travado por mais de N s (com a perturbação ativa). */
  _checar_parada(agora: number) {
    const e = this.cfg.ensaio
    const ativo = this.cron.ativo() || this.freq_parada  // frequência parada: a bomba continua e deve mudar
    if (ativo && !this._cron_ativo_antes) this._t_ativou = Math.max(this._t_ativou, agora)
    this._cron_ativo_antes = ativo
    const lim = Number(e.travado_s ?? 60.0)
    const parado_ha = agora - Math.max(this.t_ult_mudanca, this._t_ativou)
    const aviso = Number(num(this.cfg.alarme.travado_aviso_s ?? 30.0, 0) || 0)
    if (!ativo || parado_ha < aviso) {
      this._avisou_travado = false  // o mostrador voltou a mudar: vale um novo aviso
    } else if (aviso > 0 && (lim <= 0 || aviso < lim) && !this._avisou_travado) {
      this._avisou_travado = true
      const v = this._vis.val
      this._set_status('MOSTRADOR PARADO?', COR_AVISO, `O valor do mostrador não muda há ${fixo(aviso, 0)} s`
        + (v !== null ? ` (exibindo ${br(v, 3)})` : '') + '. Confira a bomba e o display.' + (lim > 0 ? ` Parada automática com ${fixo(lim, 0)} s.` : ''))
      this._avisar(`Atenção: mostrador parado há ${fixo(aviso, 0)} segundos. Confira a bomba.`, [4, 1400, 220])
      this._piscar_barra()
    }
    if (ativo && lim > 0 && parado_ha > lim) {
      const v = this._vis.val
      void this._parada_automatica(`Display travado há mais de ${fixo(lim, 0)} s` + (v !== null ? ` (exibindo ${br(v, 3)})` : ' (sem leitura legível)'))
    }
  }

  async _parada_automatica(motivo: string) {
    if (this.estado === 'parado') return
    this._motivo_parada = motivo
    this._linha_evento('PARADA AUTOMÁTICA', motivo)
    // nunca parar sem avisar: buzzer contínuo (mesmo com o alarme desligado na config) até o operador reconhecer
    const a = this.cfg.alarme
    this.alarme.parar()
    for (let i = 0; i < 40 && this.alarme.tocando; i++) await esperar(50)
    const voz = this._modo_aviso().includes('voz')
    this.alarme.disparar(a.freq_hz ?? 2500, a.dur_ms ?? 400, true, voz ? 5.0 : 0.0)
    if (voz) {  // frase repetida até o operador clicar em "Estou ciente"
      const frase = `Atenção! Ensaio parado automaticamente. ${motivo}.`
      this.voz.falar(frase)
      this._repetir_frase(frase)
    }
    await this.parar_ensaio(false, motivo)
  }

  /** Aviso em destaque de que o ensaio PAROU sozinho; o buzzer toca até o operador clicar em 'Estou ciente'. */
  _alerta_parada(motivo: string): Promise<void> {
    this._trazer_para_frente()
    const st = this.cron.status()
    const ult = [...this.linhas].reverse().find(l => l[0] !== '—')
    const cols = this._colunas()
    const onde = ult ? `Última leitura: nº ${ult[0]} às ${ult[1]} — ${ult[cols.indexOf('Freq. atual')]}` : 'Nenhuma leitura registrada'
    const texto = `${strftime(new Date(), '%d/%m/%Y %H:%M:%S')}  |  ${onde}  |  segmento ${st.nome || '—'}\n\n`
      + "Confira a bomba e o gerador. Para continuar depois de onde parou: '↻ Continuar ensaio…'."
    return new Promise(r => this.janela.set({ tipo: 'alerta_parada', motivo, texto, resolver: () => { this._silenciar(); this.janela.set(null); r() } }))
  }

  // ------------------------------------------------------------------ salvar / continuar ensaio
  /** Grava tudo o que é preciso para continuar o ensaio depois (a cada leitura e a cada 10 s). */
  _salvar_estado(interrompido = false) {
    if (!this.pastaRel || !this.campos_ensaio.length) return
    const st = this.cron.status()
    let cm: Record<string, unknown> | null = null
    if (this.ciclo_medido) { cm = { ...this.ciclo_medido }; delete cm.saida_ensaio }
    const est = {
      versao: 1, salvo_em: strftime(new Date(), '%d/%m/%Y %H:%M:%S'),
      nome: this.nome_ensaio, pareceres: this.pareceres, correcoes: this.correcoes, exclusoes: this.exclusoes,
      tot_importados: this.tot_importados, motivo_parada: this._motivo_parada,
      estado: this.estado, concluido: this._concluido, interrompido,
      perfil: this.cfg.perfil, segmentos: this.cron.segmentos,
      cron: { idx: this.cron.idx, estado: this.cron.estado, t_seg: st.t_seg, nome: st.nome, freq: st.freq, passo: st.passo },
      pos_ultima_leitura: this.pos_ult_leitura, tempo_ensaio: this._tempo_ensaio(),
      n_abastecimentos: this.cfg.ensaio.n_abastecimentos, modo_leitura: this.cfg.ensaio.modo_leitura,
      n_leitura: this.n_leitura, n_ok: this.n_ok, n_falha: this.n_falha, n_tot_div: this.n_tot_div,
      n_sem_freq: this.n_sem_freq, freq_parada: this.freq_parada, seg_status: this.seg_status,
      acum: this.acum, tot_inicial: this.tot_inicial, tot_ajuste: this.tot_ajuste,
      tot_registros: this.tot_registros, linhas: this.linhas, leituras_reg: this.leituras_reg,
      campos: this.campos_ensaio.map(c => c.nome), colunas: this._colunas(), ciclo_medido: cm,
    }
    const texto = JSON.stringify(est)
    const rel = this.rel(VigiaApp.ARQ_ESTADO)
    void this.io(() => api({ acao: 'escrever', rel, texto, atomico: true })).catch(ex => {
      this.lbl_status_det.set(`Aviso: não foi possível salvar o estado do ensaio (${ex instanceof Error ? ex.message : ex})`)
    })
  }

  static _onde_parou(est: Record<string, unknown>) {
    const pos = (est.pos_ultima_leitura || est.cron || {}) as Record<string, unknown>
    let txt = String(pos.nome || '—')
    if (pos.freq) txt += ` @ ${fmtFreq(Number(pos.freq))}`
    return txt
  }

  async _ensaios_incompletos() {
    const r = await api({ acao: 'ensaios' })
    return r.itens as { pasta: string; rel: string; est: Record<string, unknown> }[]
  }

  async continuar_dialogo() {
    if (this.estado !== 'parado') { await messagebox.showinfo('Continuar', 'Encerre o ensaio atual antes de continuar outro.'); return }
    this.janela.set({ tipo: 'continuar', itens: await this._ensaios_incompletos() })
  }

  async _ler_estado(rel: string): Promise<Record<string, unknown> | null> {
    const r = await api({ acao: 'ler', rel: `${rel}/${VigiaApp.ARQ_ESTADO}` }).catch(() => null)
    try { return r?.texto ? JSON.parse(r.texto) : null } catch { return null }
  }

  async marcar_concluido(rel: string) {
    const est = await this._ler_estado(rel)
    if (!est) return
    est.concluido = true
    await api({ acao: 'escrever', rel: `${rel}/${VigiaApp.ARQ_ESTADO}`, texto: JSON.stringify(est) })
  }

  /** pedir_tot=false: não pede o totalizador de retomada (ex.: acabou de informar o inicial ao recomeçar). */
  async continuar_ensaio(rel: string, pedir_tot = true) {
    if (this.estado !== 'parado') { await messagebox.showinfo('Continuar', 'Já há um ensaio em andamento.'); return }
    const est = await this._ler_estado(rel)
    if (!est) { await messagebox.showerror('Continuar', 'Não foi possível ler o estado salvo desse ensaio.'); return }
    if (!this.campos.length) { await messagebox.showerror('Continuar', 'Configure os campos do display antes de continuar.'); return }
    const nomes_agora = this.campos.map(c => c.nome)
    const campos_est = (est.campos as string[] | undefined) ?? []
    let aviso_campos = ''
    if (JSON.stringify(nomes_agora) !== JSON.stringify(campos_est)) {
      aviso_campos = `\n\nATENÇÃO: os campos do display mudaram (${campos_est.join(', ')} → ${nomes_agora.join(', ')}). As colunas novas podem não bater com as antigas.`
    }
    const segs = ((est.segmentos as Partial<Segmento>[]) ?? []).map(s => segmentoDe(s))
    const pos = (est.pos_ultima_leitura || est.cron || { idx: 0, t_seg: 0.0 }) as Record<string, number>
    const cron_tmp = new Cronograma(segs)
    cron_tmp.posicionar(pos.idx ?? 0, pos.t_seg ?? 0.0)
    const [passo, freq] = cron_tmp.tRetomada()
    const seg = cron_tmp.atual
    const onde = seg ? rotulo(seg) + (freq ? ` — passo ${passo}/${frequencias(seg).length}, ${fmtFreq(freq)}` : '') : 'perfil EMC já concluído'
    const base = rel.split('/').pop()
    if (!await messagebox.askyesno('Continuar ensaio', `${base}  (salvo em ${est.salvo_em ?? '?'})\nPerfil: ${est.perfil}\n`
      + `Abastecimentos: ${est.n_leitura} / ${est.n_abastecimentos}  |  falhas: ${est.n_falha}\n\n`
      + `A perturbação recomeça em:\n${onde}\n(ponto da última leitura validada)\n\n`
      + "Ajuste o gerador nesse ponto e clique 'Iniciar próximo segmento' junto com ele." + aviso_campos)) return

    // restaura o ensaio
    const ex = await api({ acao: 'existe', rel })
    this.pastaRel = rel
    this.pasta = ex.caminho
    this.cfg.perfil = String(est.perfil ?? this.cfg.perfil)
    this.cfg.ensaio.n_abastecimentos = Number(est.n_abastecimentos ?? this.cfg.ensaio.n_abastecimentos)
    this.cfg.ensaio.modo_leitura = (est.modo_leitura as 'congelado' | 'tempo') ?? this.cfg.ensaio.modo_leitura
    this.v_ens.n_abastecimentos?.set(String(this.cfg.ensaio.n_abastecimentos))
    this.v_modo_leit.set(this.cfg.ensaio.modo_leitura)
    this.campos_ensaio = this.campos.map(c => campoDe(JSON.parse(JSON.stringify(c))))
    this.n_leitura = Number(est.n_leitura ?? 0); this.n_ok = Number(est.n_ok ?? 0); this.n_falha = Number(est.n_falha ?? 0)
    this.n_tot_div = Number(est.n_tot_div ?? 0)
    this.n_sem_freq = Number(est.n_sem_freq ?? 0)
    this.freq_parada = false  // a retomada sempre recomeça aguardando o operador (frequência a aplicar)
    const acum = (est.acum as [number, number][] | undefined) ?? [[0.0, 0]]
    this.acum = acum.length ? acum.map(x => [x[0], x[1]]) : [[0.0, 0]]
    this.tot_inicial = (est.tot_inicial as number | null) ?? null
    this.tot_ajuste = Number(est.tot_ajuste ?? 0.0)
    this.tot_registros = (est.tot_registros as TotReg[]) ?? []
    this.linhas = (est.linhas as Linha[]) ?? []
    this.leituras_reg = (est.leituras_reg as LeituraReg[]) ?? []
    this.pos_ult_leitura = (est.pos_ultima_leitura as Record<string, unknown>) ?? null
    this.nome_ensaio = String(est.nome || base)
    this.pareceres = (est.pareceres as Record<string, Record<string, unknown>>) ?? {}
    this.correcoes = (est.correcoes as Record<string, Record<string, unknown>[]>) ?? {}
    this.exclusoes = (est.exclusoes as Record<string, unknown>[]) ?? []
    this.tot_importados = (est.tot_importados as Record<string, TotReg[]>) ?? {}
    this._concluido = false
    if (est.ciclo_medido && !this.ciclo_medido) {
      this.ciclo_medido = { ...(est.ciclo_medido as NonNullable<App['ciclo_medido']>), ultima_saida: -1e9 }  // fase do ciclo antigo não vale mais
    }
    this.amostras_freq = []
    this._configurar_colunas()
    const cols = this._colunas()
    const i_st = cols.indexOf('Status'), i_par = cols.indexOf('Parecer do operador')
    this.tree.set(this.linhas.map(l => {
      const stt = l.length > i_st ? String(l[i_st]) : ''
      // linhas de evento (—) e leituras trazidas de outro ensaio (imp) são informativas, salvo divergência/parada
      const informativo = ((l[0] === '—' || l[0] === 'imp') && !stt.includes('DIVERG') && !stt.includes('PARADA'))
        || (stt.startsWith('TOTALIZ.') && !stt.includes('DIVERG'))
      const tag = informativo ? 'tot' : l.length > i_par && l[i_par] ? 'rebatida' : stt === 'OK*' ? 'aviso' : stt.startsWith('OK') ? 'ok' : 'falha'
      return { id: String(++this._iid), valores: l.slice(0, cols.length), tag }
    }))
    this.verUltimo.set(this.verUltimo.get() + 1)

    this._preparar_execucao(segs, Number(est.tempo_ensaio ?? 0.0))
    const ss = (est.seg_status as string[] | undefined) ?? []
    if (ss.length === this.cron.segmentos.length) {
      // situação dos segmentos ao parar; o que estava em andamento continua pendente (será refeito do ponto)
      this.seg_status = ss.map(v => (v === 'atual' ? 'pulado' : v))
    }
    this.cron.posicionar(pos.idx ?? 0, pos.t_seg ?? 0.0)
    this._seg_idx_ant = this.cron.idx
    this.estado = 'rodando'
    this._iniciar_amostrador()
    this._atualizar_lbl_perfil()
    this.bt_iniciar.set(false)
    this.bt_pausar.set({ on: true, text: '⏸ Pausar' })
    this.bt_parar.set(true)
    this.bt_prox_seg.set({ ...this.bt_prox_seg.get(), on: true })
    this._linha_evento('RETOMADA', `Ensaio retomado; perturbação recomeça em ${onde}`)
    if (this.tot_inicial !== null && pedir_tot) {
      const r = await this._dialogo_totalizador('Retomada')
      if (r) this._registrar_totalizador('Retomada', r[1], this.n_leitura)
    }
    this._set_status('RETOMADO', COR_AVISO, `Ajuste o gerador em: ${onde}\ne clique em 'Iniciar próximo segmento' junto com ele. Leituras continuam a partir do nº ${this.n_leitura + 1}.`)
    this._salvar_estado()
    // ao abrir um ensaio salvo: escolher qual segmento ensaiar agora (ou alterar algum)
    if (this.cron.segmentos.length > 1) setTimeout(() => void this.escolher_segmento(), 300)
  }

  /** Linha informativa na tabela/CSV (não conta como abastecimento).
   *  seg/freq: de uma leitura anterior (parecer/correção), para saber a que ponto o evento se refere. */
  _linha_evento(status: string, obs: string, seg: string | null = null, freq = '') {
    const st = this.cron.status()
    const linha: Linha = ['—', strftime(new Date(), '%H:%M:%S'), fmtTempo(this._tempo_ensaio()), ...this.campos_ensaio.map(() => ''),
      '', br(this.acum[this.acum.length - 1][0], 2), '', status, seg === null ? st.nome : seg, freq, '', obs, '', '']
    this.linhas.push(linha)
    this._csv_acrescentar(linha)
    this.treeInsert(linha.slice(0, -1), 'tot')
  }

  /** Acrescenta uma linha ao leituras.csv (recria pasta e cabeçalho se tiverem sumido). */
  _csv_acrescentar(linha: Linha) {
    if (!this.pastaRel) return
    const rel = this.rel('leituras.csv')
    const cab = '﻿' + csvLinha([...this._colunas(), 'Imagem'])
    void this.io(() => api({ acao: 'escrever', rel, texto: csvLinha(linha), acrescentar: true, cabecalho: cab })).catch(ex => {
      this.lbl_status_det.set(`ERRO ao gravar CSV (arquivo aberto no Excel?): ${ex instanceof Error ? ex.message : ex}`)
    })
  }

  /** Regrava o leituras.csv com as linhas atuais (troca atômica). */
  _reescrever_csv() {
    if (!this.pastaRel) return
    const texto = '﻿' + csvLinha([...this._colunas(), 'Imagem']) + this.linhas.map(csvLinha).join('')
    void this.io(() => api({ acao: 'escrever', rel: this.rel('leituras.csv'), texto, atomico: true })).catch(ex => {
      this.lbl_status_det.set(`ERRO ao regravar o CSV (arquivo aberto no Excel?): ${ex instanceof Error ? ex.message : ex}`)
    })
  }

  /** Ao abrir o app: oferece continuar um ensaio que ficou no meio (app fechado/travado). */
  async _verificar_interrompido() {
    if (this.estado !== 'parado') return
    for (const { rel, est } of (await this._ensaios_incompletos().catch(() => [])).slice(0, 1)) {
      if (est.interrompido || est.estado === 'rodando' || est.estado === 'pausado') {
        if (await messagebox.askyesno('Ensaio interrompido', `O ensaio ${rel} ficou no meio (${est.n_leitura}/${est.n_abastecimentos} abastecimentos, salvo em ${est.salvo_em}).\n\nDeseja continuar de onde parou?`)) {
          await this.continuar_ensaio(rel)
        } else {
          est.interrompido = false
          est.estado = 'parado'
          await api({ acao: 'escrever', rel: `${rel}/${VigiaApp.ARQ_ESTADO}`, texto: JSON.stringify(est) }).catch(() => undefined)
        }
      }
    }
  }

  // ------------------------------------------------------------------ frequência parada / pausar / parar
  /** Para só a contagem da frequência (gerador parado); a bomba segue e as leituras continuam valendo para o
   *  totalizador, validadas contra o valor esperado (inicial), marcadas "sem frequência". */
  async parar_retomar_frequencia() {
    if (this.estado !== 'rodando') return
    const st = this.cron.status()
    const onde = st.freq ? `${st.nome} @ ${fmtFreq(st.freq)}` : st.nome
    if (!this.freq_parada) {
      if (this.cron.estado !== 'rodando') {
        await messagebox.showinfo('Frequência', 'A perturbação não está correndo agora (aguardando o operador ou perfil concluído): as leituras já ficam sem frequência.')
        return
      }
      this.cron.pausar()
      this.freq_parada = true
      this._freq_parada_em = monotonic()
      this._n_sf_ini = this.n_sem_freq
      this._linha_evento('FREQ. PARADA', `Gerador parado em ${onde}. Bomba segue: leituras sem frequência, validadas e somadas ao totalizador.`)
      this.bt_freq.set({ ...this.bt_freq.get(), text: '▶ RETOMAR A FREQUÊNCIA  (gerador voltou a aplicar)', bg: '#fce8e6' })
      this._set_status('FREQ. PARADA', COR_AVISO, `Frequência parada em ${onde}. As leituras continuam (só totalizador) até você retomar.`)
    } else {
      this.cron.retomar()
      this.freq_parada = false
      const dt = monotonic() - (this._freq_parada_em || monotonic())
      const n = this.n_sem_freq - this._n_sf_ini
      this._linha_evento('FREQ. RETOMADA', `Frequência retomada em ${onde} após ${fmtTempo(dt)}; ${n} leitura(s) sem frequência nesse intervalo.`)
      this.bt_freq.set({ ...this.bt_freq.get(), text: '⏸ PARAR SÓ A FREQUÊNCIA  (gerador parado — bomba segue p/ o totalizador)', bg: '#fef7e0' })
      this._set_status('EM ENSAIO', COR_OK, `Frequência retomada em ${onde}.`)
    }
    this._salvar_estado()
  }

  _n_com_freq() { return this.n_leitura - this.n_sem_freq }

  /** Estado EMC. t_ref = instante da saída do valor congelado que iniciou o abastecimento: a leitura leva a
   *  frequência aplicada no início do abastecimento, e não a do instante da validação. */
  _status_emc(t_ref: number | null = null): StatusCron & { no_inicio_abast?: boolean } {
    let st: StatusCron & { no_inicio_abast?: boolean } = this.cron.status()
    if (t_ref !== null && this.cron.estado === 'rodando' && !this.freq_parada) {
      const t_seg = t_ref - this.cron.t0!
      if (t_seg >= -0.5 && t_seg <= st.t_seg) {  // mesmo segmento, sem pausa no meio
        st = this.cron.status(Math.max(0.0, t_seg))
        st.no_inicio_abast = true
      }
    }
    st.sem_freq = this.freq_parada
    return st
  }

  /** Ao pausar/parar: oferece ler AGORA o valor exibido como leitura do abastecimento atual. true = a ação espera a leitura. */
  async _oferecer_captura(acao: 'pausar' | 'parar'): Promise<boolean> {
    if (this.estado !== 'rodando' || this.lendo) return false
    const v = this._vis.val
    const campo = this._campo_vol_obj()
    const mostrador = campo && v !== null ? formatar(campo, v) : 'ilegível'
    const info = this._mudou_desde_leitura
      ? `O display mostra ${mostrador} (parado há ${br(Math.max(0.0, monotonic() - this.t_ult_mudanca), 1)} s) e este abastecimento ainda NÃO foi lido.`
      : `O display mostra ${mostrador}, valor JÁ validado na leitura nº ${this.n_leitura} (uma nova captura repete esse abastecimento).`
    if (!await messagebox.askyesno('Captura instantânea', `Antes de ${acao}, deseja fazer uma captura instantânea da última leitura?\n\n${info}\n\n`
      + "Sim = lê agora e registra como leitura (marcada 'CAPTURA INSTANTÂNEA') e depois "
      + `${acao === 'pausar' ? 'pausa' : 'encerra'}.\nNão = só ` + (acao === 'pausar' ? 'pausa.' : 'encerra.'))) return false
    this._parado_na_leitura = Math.max(0.0, monotonic() - this.t_ult_mudanca)
    this._mudou_desde_leitura = false  // este abastecimento não é lido de novo ao retomar
    this.armado = false
    this._captura_inst = true
    this._apos_leitura = acao
    this.disparar_leitura()
    this._set_status('LENDO', COR_AVISO, `Captura instantânea… depois o ensaio será ${acao === 'pausar' ? 'pausado' : 'encerrado'}.`)
    return true
  }

  async pausar_retomar(oferecer = true) {
    if (this.estado === 'rodando' && oferecer && await this._oferecer_captura('pausar')) return  // pausa quando a captura terminar
    if (this.estado === 'rodando') {
      this.estado = 'pausado'
      this.pausa_ini = monotonic()
      this.cron.pausar()
      this.bt_pausar.set({ on: true, text: '▶ Retomar' })
      this._set_status('PAUSADO', COR_AVISO, 'Ensaio pausado (leituras e cronograma EMC parados).')
    } else if (this.estado === 'pausado') {
      const dt = monotonic() - this.pausa_ini!
      this.t_pausado += dt
      this.prox_leitura = (this.prox_leitura ?? 0) + dt
      this.estado = 'rodando'
      if (!this.freq_parada) this.cron.retomar()  // frequência parada pelo operador continua parada
      this.bt_pausar.set({ on: true, text: '⏸ Pausar' })
      this._set_status('EM ENSAIO', COR_OK, 'Ensaio retomado.')
    }
  }

  /** alerta: motivo da parada automática — mostra o aviso em destaque (com buzzer) antes dos diálogos. */
  async parar_ensaio(perguntar = true, alerta: string | null = null) {
    if (this.estado === 'parado') return
    if (perguntar && !await messagebox.askyesno('Parar', 'Encerrar o ensaio?')) return
    if (perguntar && await this._oferecer_captura('parar')) return  // encerra quando a captura terminar
    this.t_fim_ensaio = this._tempo_ensaio()
    this.estado = 'parado'
    this.cron.parar()
    this.freq_parada = false
    this.bt_freq.set({ on: false, bg: '#fef7e0', text: '⏸ PARAR SÓ A FREQUÊNCIA  (gerador parado — bomba segue p/ o totalizador)' })
    this.bt_iniciar.set(true)
    this.bt_pausar.set({ on: false, text: '⏸ Pausar' })
    this.bt_parar.set(false)
    this.bt_prox_seg.set({ ...this.bt_prox_seg.get(), on: false })
    this._set_status(alerta ? 'PARADO AUTOMATICAMENTE' : 'ENCERRANDO', alerta ? COR_FALHA : COR_AVISO, alerta || '')
    if (alerta && !this._fechando) {
      await this._alerta_parada(alerta)  // espera o operador reconhecer (buzzer até lá)
    } else if (!perguntar && !this._fechando) {
      this._trazer_para_frente()  // encerrou sozinho (ex.: n atingido): app na frente para o totalizador final
      this.alarme.aviso()
    }
    if (this.tot_inicial !== null && this.cfg.totalizador.pedir_final && !this._fechando) {
      const r = await this._dialogo_totalizador('Final')
      if (r) this._registrar_totalizador('Final', r[1], r[2])
    }
    const xl = await this.exportar_excel(true)
    const n_alvo = Math.trunc(this.cfg.ensaio.n_abastecimentos)
    this._concluido = this._n_com_freq() >= n_alvo
    this._salvar_estado(this._fechando)
    const cor = this.n_falha === 0 && this.n_tot_div === 0 ? COR_OK : COR_FALHA
    this._set_status(this._concluido ? 'CONCLUÍDO' : 'ENCERRADO (incompleto)', cor, `${this.n_leitura} leituras: ${this.n_ok} OK, ${this.n_falha} falha(s).`)
    if (this._fechando) return
    const incompleto = this._concluido ? '' : `\n\nEnsaio incompleto (${this._n_com_freq()}/${n_alvo}). Para continuar depois de onde parou: botão '↻ Continuar ensaio…'.`
    await messagebox.showinfo('Ensaio encerrado', `Leituras: ${this.n_leitura}\nOK: ${this.n_ok}\nFalhas: ${this.n_falha}\n${this._resumo_totalizador()}\n\n`
      + `Resultados em:\n${this.pasta}` + (xl ? `\n\nExcel: ${xl.split(/[\\/]/).pop()}` : '') + incompleto)
    if (this.leituras_reg.length && !this._fechando && await messagebox.askyesno('Registro (FOR EMC38)', 'Enviar as leituras deste ensaio para o Registro (FOR EMC38)?')) {
      const p = this.cfg.perfil
      const sugestao = ([['4-3', '1.2 - IEC 61000-4-3'], ['4-6', '1.3 - IEC 61000-4-6 (Alim)'], ['4-2', '1.4 - IEC 61000-4-2'],
        ['4-4', '1.5 - IEC 61000-4-4'], ['D11', '1.6 - OIML D11'], ['4-11', '1.7 - IEC 61000-4-11']] as const).find(([k]) => p.includes(k))?.[1] ?? null
      this.nb.set(4)
      this.registro_importar?.(sugestao)
    }
  }
  /** aba Registro: importar_dialogo(sugestão) */
  registro_importar: ((sugestao: string | null) => void) | null = null

  // ------------------------------------------------------------------ totalizador
  _tot_base() { return (this.tot_inicial ?? 0.0) + this.tot_ajuste }

  /** (soma dos volumes lidos, nº de leituras sem volume válido) até o abastecimento n. */
  _soma_ate(n: number): [number, number] { return this.acum[Math.max(0, Math.min(n, this.acum.length - 1))] }

  /** Pede o valor do totalizador. Retorna [tipo, valor, até_abastecimento_n] ou null. */
  _dialogo_totalizador(tipo: string): Promise<[string, number, number] | null> {
    return new Promise(r => this.janela.set({ tipo: 'totalizador', tipoTot: tipo, resolver: x => { this.janela.set(null); r(x) } }))
  }

  linhas_lidas() { return this.linhas.filter(l => l[0] !== '—') }

  async totalizador_manual() {
    if (this.estado === 'parado') { await messagebox.showinfo('Totalizador', 'O totalizador é registrado durante um ensaio (inicial, parciais e final).'); return }
    const r = await this._dialogo_totalizador(this.tot_inicial !== null ? 'Parcial' : 'Inicial')
    if (r) this._registrar_totalizador(...r)
  }

  _registrar_totalizador(tipo: string, valor: number, n: number) {
    const tol = Number(this.cfg.totalizador.tol)
    const [soma, inval] = this._soma_ate(tipo !== 'Inicial' ? n : 0)
    const hora = new Date()
    let esp: number | null = null, dif: number | null = null, status: string, obs: string, ok: boolean
    if (tipo === 'Inicial') {
      this.tot_inicial = valor
      status = 'TOTALIZ. INICIAL'
      obs = `Totalizador inicial: ${br(valor, 2)} L`
      ok = true
    } else {
      esp = this._tot_base() + soma
      dif = valor - esp
      ;[status, obs, ok] = this._conferencia_tot(tipo, valor, esp, soma, n, inval, this.tot_ajuste, tol)
      if (tipo === 'Retomada') this.tot_ajuste += dif
    }
    const st = this.cron.status()
    const aplicando = st.estado === 'rodando' || st.estado === 'pausado'
    const seg = aplicando ? st.nome : '—'
    const freq = aplicando && st.freq ? fmtFreq(st.freq) : '—'
    const linha: Linha = ['—', strftime(hora, '%H:%M:%S'), fmtTempo(this._tempo_ensaio()), ...this.campos_ensaio.map(() => ''),
      '', br(soma, 2), br(esp !== null ? esp : valor, 2), status, seg, freq, tipo !== 'Inicial' ? `até o abastecimento nº ${n}` : '', obs, '', '']
    this.linhas.push(linha)
    this._csv_acrescentar(linha)
    this.treeInsert(linha.slice(0, -1), ok ? 'tot' : 'falha')
    this.tot_registros.push({
      Tipo: tipo, Hora: strftime(hora, '%H:%M:%S'), 'Tempo de ensaio': linha[2] as string, 'Até abastecimento nº': n,
      'Totalizador lido (L)': valor, 'Soma lida (L)': soma, 'Esperado (L)': esp, 'Diferença (L)': dif, 'Situação': status, 'Leituras sem volume': inval,
    })
    this._salvar_estado()
    if (!ok) {
      this.n_tot_div += 1
      this._set_status('TOTALIZADOR DIVERGENTE', COR_FALHA, obs)
      const a = this.cfg.alarme
      if (a.ativo) this.alarme.disparar(a.freq_hz, a.dur_ms, a.continuo)
    }
  }

  /** [status, observação, ok] de um totalizador parcial/final/retomada comparado com o esperado. */
  _conferencia_tot(tipo: string, valor: number, esp: number, soma: number, n: number, inval: number, ajuste: number, tol: number): [string, string, boolean] {
    const dif = valor - esp
    if (tipo === 'Retomada') {
      // ensaio retomado: o que a bomba dispensou com o ensaio parado não entra na comparação
      return ['TOTALIZ. RETOMADA', `Retomada: lido ${br(valor, 2)} L | esperado ${br(esp, 2)} L | ${sinalBr(dif, 2)} L dispensados com o ensaio parado (descontados das próximas conferências)`, true]
    }
    const ok = Math.abs(dif) <= tol
    const txt_aj = ajuste ? ` + ajuste de retomada ${br(ajuste, 2)}` : ''
    return [`TOTALIZ. ${ok ? 'OK' : 'DIVERGENTE'}`,
      `${tipo}: lido ${br(valor, 2)} L | esperado ${br(esp, 2)} L (inicial ${br(this.tot_inicial!, 2)}${txt_aj} + ${br(soma, 2)} L lidos em ${n} abastecimento(s)) | diferença ${sinalBr(dif, 2)} L`
      + (inval ? ` | ${inval} leitura(s) sem volume válido` : ''), ok]
  }

  _resumo_totalizador() {
    if (this.tot_inicial === null) return 'Totalizador: não informado'
    const fim = [...this.tot_registros].reverse().find(t => t.Tipo === 'Final')
    const soma = this.acum[this.acum.length - 1][0]
    if (!fim) return `Totalizador inicial ${br(this.tot_inicial, 2)} L; soma lida ${br(soma, 2)} L; esperado no fim ${br(this._tot_base() + soma, 2)} L (final não informado)`
    const lido = Number(fim['Totalizador lido (L)'])
    return `Totalizador: inicial ${br(this.tot_inicial, 2)} L → final ${br(lido, 2)} L (Δ ${br(lido - this.tot_inicial, 2)} L)\n`
      + `Soma das leituras: ${br(Number(fim['Soma lida (L)']), 2)} L  |  diferença ${sinalBr(Number(fim['Diferença (L)']), 2)} L → ${fim['Situação']}`
  }

  // ------------------------------------------------------------------ segmentos
  iniciar_prox_seg() {
    if (!this.cron.estado.endsWith('aguardando')) return
    if (this.det_disparo !== null) this._disparar_emc(monotonic(), 'início manual pelo operador')  // já armado: força o início
    else if ((this.cfg.ensaio.disparo_saida ?? true) && this.estado === 'rodando') this._armar_disparo()
    else this._disparar_emc(monotonic(), 'início manual pelo operador')
  }

  async pular_seg() {
    if (this.estado === 'parado') return
    if (await messagebox.askyesno('Pular', 'Encerrar o segmento EMC atual e ir para o próximo?')) {
      const i = this.cron.idx
      if (i >= 0 && i < this.seg_status.length && this.seg_status[i] !== 'feito') this.seg_status[i] = 'pulado'
      this._evento_cron(this.cron.pular())
    }
  }

  _proximo_pendente(a_partir: number): number | null {
    const st = this.seg_status
    const n = st.length
    for (const k of [...Array.from({ length: Math.max(0, n - a_partir) }, (_, i) => a_partir + i), ...Array.from({ length: Math.min(a_partir, n) }, (_, i) => i)]) {
      if (st[k] === 'pendente' || st[k] === 'pulado') return k
    }
    return null
  }

  /** Atualiza a situação dos segmentos: o que estava em andamento e terminou vira 'feito'. */
  _acompanhar_segmentos() {
    const st = this.seg_status
    if (!st.length || this.estado === 'parado') return
    const idx = this.cron.idx, ant = this._seg_idx_ant
    if (ant !== null && ant !== idx && ant >= 0 && ant < st.length && st[ant] === 'atual') st[ant] = 'feito'
    if (this.cron.estado === 'concluido') {
      st.forEach((v, k) => { if (v === 'atual') st[k] = 'feito' })
    } else if ((this.cron.estado === 'rodando' || this.cron.estado === 'pausado') && idx >= 0 && idx < st.length) {
      st[idx] = 'atual'
    }
    this._seg_idx_ant = idx
  }

  async escolher_segmento() {
    if (this.estado === 'parado' || !this.cron.segmentos.length) { await messagebox.showinfo('Segmentos', 'Inicie (ou continue) um ensaio para escolher o segmento.'); return }
    this._acompanhar_segmentos()
    this.janela.set({ tipo: 'escolher' })
  }

  /** Posiciona o segmento i na frequência seguinte à 'freq' (já feita em outro ensaio), aguardando o operador. */
  continuar_segmento_apos(i: number, freq: number) {
    const seg = this.cron.segmentos[i]
    const fs = frequencias(seg)
    let k = fs.findIndex(f => f > freq * (1 + 1e-9))
    if (k < 0) k = fs.length - 1
    this.ir_para_segmento(i)
    this.cron.posicionar(i, k * tempoPasso(seg))
    this._set_status('AGUARDANDO', COR_AVISO, `"${rotulo(seg)}" continua em ${fmtFreq(fs[k])} (passo ${k + 1}), após as leituras trazidas. Ajuste o gerador e clique em 'Iniciar próximo segmento'.`)
    return fs[k]
  }

  /** Altera o segmento i do ensaio em andamento (cronograma) e, se pedido, o segmento igual do perfil. */
  editar_segmento(i: number, dados: Record<string, string | boolean>, no_perfil = false): string {
    const seg = this.cron.segmentos[i] as unknown as Record<string, unknown>
    const antes = { ...seg }
    const chave_antes = chaveSegmento(this.cron.segmentos[i])
    for (const [k, v] of Object.entries(dados)) {
      const atual = seg[k]
      if (typeof atual === 'boolean') seg[k] = !!v
      else if (typeof atual === 'number') seg[k] = num(v, atual)
      else seg[k] = String(v).trim()
    }
    // str() do Python: float inteiro sai "28.0", bool "True"
    const FLOAT = new Set(['f_ini', 'f_fim', 'passo_pct', 'dwell_s', 'extra_s', 'duracao_s'])
    const pyStr = (k: string, x: unknown) => typeof x === 'boolean' ? (x ? 'True' : 'False')
      : typeof x === 'number' && FLOAT.has(k) && Number.isInteger(x) ? `${x}.0` : String(x)
    const mud = Object.keys(dados).filter(k => antes[k] !== seg[k]).map(k => `${k}: ${pyStr(k, antes[k])} → ${pyStr(k, seg[k])}`)
    if (!mud.length) return ''
    const s = this.cron.segmentos[i]
    if (no_perfil) {
      for (const p of this.perfis[this.cfg.perfil] ?? []) {
        if (chaveSegmento(p) === chave_antes) for (const k of Object.keys(dados)) (p as unknown as Record<string, unknown>)[k] = seg[k]
      }
      void this.salvar_perfis_arquivo().catch(() => undefined)
      this._recarregar_segmentos()
    }
    const em_andamento = this.cron.idx === i && (this.cron.estado === 'rodando' || this.cron.estado === 'pausado')
    if (em_andamento) {
      this.cron.posicionar(i, 0.0)  // recomeça o segmento alterado do início, aguardando o operador
      this._seg_idx_ant = i
      this.bt_prox_seg.set({ on: true, text: '▶ Iniciar próximo segmento' })
    }
    const texto = `Segmento ${i + 1} alterado (${rotulo(s)}): ` + mud.join('; ') + (no_perfil ? ' — também no perfil' : '')
    this._linha_evento('SEGMENTO ALTERADO', texto, rotulo(s), '')
    if (em_andamento) this._set_status('AGUARDANDO', COR_AVISO, "Segmento alterado: recomeça do início. Ajuste o gerador e clique em 'Iniciar próximo segmento'.")
    this._salvar_estado()
    return texto
  }

  dialogo_editar_segmento(i: number): Promise<boolean> {
    return new Promise(r => this.janela.set({ tipo: 'editar_seg', i, resolver: ok => { this.janela.set({ tipo: 'escolher' }); r(ok) } }))
  }

  /** Deixa o ensaio aguardando no segmento i (escolhido pelo operador). */
  ir_para_segmento(i: number) {
    const segs = this.cron.segmentos, st = this.seg_status
    const atual = this.cron.idx
    if ((this.cron.estado === 'rodando' || this.cron.estado === 'pausado') && atual !== i && atual >= 0 && atual < st.length && st[atual] === 'atual') {
      st[atual] = 'pulado'  // interrompido no meio: continua pendente
    }
    this.freq_parada = false
    this.det_disparo = null
    this.cron.posicionar(i, 0.0)
    this._seg_idx_ant = i
    this._linha_evento('SEGMENTO ESCOLHIDO', `Operador escolheu o segmento ${i + 1}: ${rotulo(segs[i])}`, rotulo(segs[i]), '')
    this.bt_prox_seg.set({ on: true, text: '▶ Iniciar próximo segmento' })
    this._set_status('AGUARDANDO', COR_AVISO, `Prepare "${rotulo(segs[i])}" (mesa / polarização / antena) e clique em 'Iniciar próximo segmento' junto com o gerador.`)
    this._pintar_segmentos()
    this._salvar_estado()
  }

  async sincronizar_freq() {
    if (this.estado === 'parado' || this.cron.atual === null) return
    if (this.cron.atual.tipo !== 'varredura') { await messagebox.showinfo('Sincronizar', 'O segmento atual não é uma varredura de frequência.'); return }
    const t = await simpledialog.askstring('Sincronizar frequência', 'Frequência que o gerador está aplicando AGORA (MHz):')
    const f = t === null ? null : num(t, null)
    if (f && f >= 0.001) this.cron.sincronizar(f)
  }

  ressincronizar_leituras() {
    if (this.estado !== 'rodando') return
    this.disparar_leitura(false)
  }

  reconhecer_alarme() {
    this._silenciar()
    if (this.estado === 'rodando') this._set_status('EM ENSAIO', COR_OK, this.lbl_status_det.get())
  }

  _evento_cron(ev: string | null) {
    const st = this.seg_status
    if ((ev === 'proximo' || ev === 'aguardando') && st.length && this.cron.idx >= 0 && this.cron.idx < st.length && st[this.cron.idx] === 'feito') {
      // o próximo da fila já foi feito (o operador escolheu a ordem): vai para o próximo pendente
      this._acompanhar_segmentos()
      const j = this._proximo_pendente(this.cron.idx)
      if (j === null) { this.cron.estado = 'concluido'; ev = 'concluido' }
      else { this.cron.posicionar(j, 0.0); ev = 'aguardando' }
    }
    if (ev === 'aguardando') {
      const seg = this.cron.atual!
      if (this.cfg.alarme.aviso_segmento) {
        if (this._modo_aviso().includes('bipe')) this.alarme.aviso()
        if (this._modo_aviso().includes('voz')) this.voz.falar('Segmento concluído. Prepare o próximo: ' + [seg.face, seg.polarizacao].filter(Boolean).join(' ') + '.')
      }
      this.bt_prox_seg.set({ ...this.bt_prox_seg.get(), on: true })
      this.lbl_status_det.set(`Segmento EMC concluído. Prepare "${rotulo(seg)}" (gire a mesa / troque polarização ou antena) e clique em 'Iniciar próximo segmento' junto com o gerador.`)
    } else if (ev === 'concluido') {
      if (this.cfg.alarme.aviso_segmento) {
        if (this._modo_aviso().includes('bipe')) this.alarme.aviso()
        if (this._modo_aviso().includes('voz')) this.voz.falar('Perfil de perturbação concluído.')
      }
      this.lbl_status_det.set('Perfil EMC concluído. As leituras continuam até o fim dos abastecimentos.')
    }
  }

  // ================================================================== leituras
  disparar_leitura(manual = false) {
    if (this.lendo) return
    if (manual && !this.camera.ativa) { this.lbl_status_det.set('Sem imagem da câmera!'); return }
    // em ensaio a leitura acontece mesmo sem imagem: o abastecimento fica registrado como SEM VÍDEO
    const em_ensaio = (this.estado === 'rodando' || this.estado === 'pausado') && !manual
    const campos = (em_ensaio ? this.campos_ensaio : this.campos).map(c => campoDe(JSON.parse(JSON.stringify(c))))
    // frequência da leitura = a aplicada na saída do valor congelado que iniciou este abastecimento (meio da contagem)
    let t_ref = em_ensaio ? this.t_inicio_abast : null
    if (t_ref !== null && this.t_ult_mudanca > t_ref) t_ref = (t_ref + this.t_ult_mudanca) / 2
    if (em_ensaio) this.t_inicio_abast = null
    const ctx = {
      em_ensaio, emc: this._status_emc(t_ref), faixa: this._faixa_varrida(), hora: new Date(), tempo: this._tempo_ensaio(),
      parado_s: em_ensaio ? this._parado_na_leitura : null, instantanea: em_ensaio && this._captura_inst,
    } as Ctx
    this._parado_na_leitura = null
    this._captura_inst = false
    if (em_ensaio) this.amostras_freq = []
    this.lendo = true
    void this._executar_leitura(campos, ctx)
  }

  async _capturar(campos: CampoDisplay[]) {
    const e = this.cfg.ensaio
    const k = Math.max(1, Math.trunc(e.quadros))
    const pausa = Math.max(0.0, Number(e.janela_s)) / k
    const leituras: Record<string, ResultadoCampo>[] = [], quadros: Quadro[] = [], desvios: number[] = []
    for (let i = 0; i < k; i++) {
      const f = this.camera.ativa ? await this.proc?.lerUltimo(campos, true) : null
      if (f && f.quadro) {
        quadros.push(f.quadro)
        desvios.push(f.desvio)
        leituras.push(f.resultados)
      }
      if (i < k - 1) await esperar(pausa * 1000)
    }
    return this._avaliar(campos, leituras, quadros, desvios)
  }

  async _executar_leitura(campos: CampoDisplay[], ctx: Ctx) {
    try {
      const e = this.cfg.ensaio
      let r = await this._capturar(campos)
      if (r.status !== 'OK' && e.confirmar_falha && ctx.em_ensaio) {
        // 2ª leitura: separa ruído momentâneo no vídeo/TV de falha real do display
        let espera = Math.max(0.0, Number(e.confirmar_apos_s ?? 3.0))
        if (e.modo_leitura === 'congelado') espera = Math.min(espera, 0.5)  // a 2ª leitura precisa cair ainda na fase congelada
        await esperar(espera * 1000)
        const r2 = await this._capturar(campos)
        if (r2.status === 'OK') {
          r2.status = 'OK*'
          r2.obs = `1ª leitura: ${r.status} (${r.obs}); OK na 2ª leitura — provável ruído no vídeo, conferir a foto`
          r2.quadro_suspeito = r.quadro; r2.res_suspeito = r.resultados
        } else {
          r2.obs = `${r2.obs} | confirmada na 2ª leitura`
        }
        r = r2
      }
      Object.assign(ctx, r)
    } catch (ex) {  // nunca deixar a leitura morrer em silêncio
      Object.assign(ctx, { status: 'ERRO', obs: `Erro na leitura: ${ex instanceof Error ? ex.message : ex}`, valores: {}, quadro: null, resultados: {} })
    }
    this.fila.push(ctx)
  }

  /** Critério de aprovação do volume: |erro| ≥ limite_erro_pct. Retorna o motivo da reprovação, ou "". */
  _excede_limite(campos: CampoDisplay[], valores: Record<string, number | null>) {
    const lim = Number(this.cfg.ensaio.limite_erro_pct || 0)
    const nome = this._campo_volume(campos)
    const cv = campos.find(c => c.nome === nome)
    if (lim <= 0 || !cv) return ''
    const e = erroPct(valores[nome], this._esperado_volume(cv))
    // |erro| (com as 3 casas exibidas) ≥ limite reprova: com limite 1 %, um erro de 1,000 % já é vermelho
    if (e === null || Math.abs(pyRoundN(e, 3)) < lim - 1e-9) return ''
    return `${nome}: erro ${br(e, 3)} % atinge o limite de ±${br(lim, 2)} %`
  }

  _avaliar(campos: CampoDisplay[], leituras: Record<string, ResultadoCampo>[], quadros: Quadro[], desvios: number[]) {
    const conc_min = Number(this.cfg.ensaio.concordancia)
    const valores: Record<string, number | null> = {}, problemas: string[] = []
    let status = 'OK'
    const consenso: Record<string, string> = {}
    // imagem ausente/travada, ou uniforme (TV sem sinal, tela azul/preta): não é falha do display
    if (!quadros.length || desvios.every(d => d < 6.0)) {
      const motivo = !quadros.length ? 'sem imagem (vídeo perdido ou travado)' : 'imagem uniforme (TV sem sinal?)'
      return { status: 'SEM VÍDEO', obs: motivo, valores: Object.fromEntries(campos.map(c => [c.nome, null])), quadro: quadros[quadros.length - 1] ?? null, resultados: {}, campos } as Partial<Ctx> & { status: string; obs: string; quadro: Quadro | null; resultados: Record<string, ResultadoCampo> }
    }
    for (const c of campos) {
      const textos = leituras.map(l => l[c.nome].texto)
      // Counter.most_common(1): mais frequente; empate = o que apareceu primeiro
      const cont = new Map<string, number>()
      for (const t of textos) cont.set(t, (cont.get(t) ?? 0) + 1)
      let txt = textos[0], n = 0
      for (const [t, q] of cont) if (q > n) { txt = t; n = q }
      consenso[c.nome] = txt
      const conc = n / textos.length
      const res = leituras.find(l => l[c.nome].texto === txt)![c.nome]
      valores[c.nome] = res.valor
      if (conc < conc_min) {
        problemas.push(`${c.nome}: display instável (${fixo(conc * 100, 0)}% dos quadros iguais)`)
        if (status === 'OK') status = 'INSTÁVEL'
      }
      if (res.valor === null) {
        problemas.push(`${c.nome}: ilegível ('${txt.trim() || 'apagado'}')`)
        if (status === 'OK' || status === 'INSTÁVEL') status = 'ILEGÍVEL'
      } else if (c.validar && Math.abs(res.valor - c.esperado) > c.tolerancia + 1e-9) {
        problemas.push(`${c.nome}: ${formatar(c, res.valor)} fora de ${formatar(c, c.esperado)} ± ${formatar(c, c.tolerancia)}`)
        status = 'FALHA'
      }
    }
    const motivo = this._excede_limite(campos, valores)
    if (motivo) {
      problemas.push(motivo)
      if (status === 'OK' || status === 'INSTÁVEL') status = 'FALHA'
    }
    const cs = this.cfg.consistencia
    if (cs.ativo) {
      const vol = valores[cs.volume] ?? null, tot = valores[cs.total] ?? null
      let pre = valores[cs.preco] ?? null
      if (pre === null) pre = this.registro_preco?.() ?? null  // preço unitário único cadastrado no Registro
      if (vol !== null && pre !== null && tot !== null) {
        const calc = pyRoundN(vol * pre + 1e-9, 2)  // total a pagar = litros × preço, em centavos
        if (Math.abs(calc - tot) > Number(cs.tol) + 1e-9) {
          problemas.push(`Inconsistência: ${br(vol, 3)} × ${br(pre, 3)} = ${br(calc, 2)} ≠ ${br(tot, 2)}`)
          status = 'FALHA'
        }
      }
    }
    // quadro representativo: o que bate com o consenso em todos os campos
    let idx = quadros.length - 1
    for (let i = 0; i < leituras.length; i++) {
      if (Object.entries(consenso).every(([nm, t]) => leituras[i][nm].texto === t)) { idx = i; break }
    }
    return { status, obs: problemas.join('; '), valores, quadro: quadros[idx] ?? null, resultados: leituras[idx] ?? {}, campos } as Partial<Ctx> & { status: string; obs: string; quadro: Quadro | null; resultados: Record<string, ResultadoCampo> }
  }

  /** Modo automático: valida os litros quando o valor ficar CONGELADO por congelado_s (padrão 3 s) ou mais. */
  _monitorar_congelamento(agora: number, bloqueado: boolean) {
    const e = this.cfg.ensaio
    if (this._vis.val === null) return
    if (this._mudou_desde_leitura) this.armado = true  // houve abastecimento (valor mudou) desde a última validação
    const parado = agora - this.t_ult_mudanca
    if (this.armado && parado >= Number(e.congelado_s) && !this.lendo && !bloqueado && agora - this.t_ult_leitura >= Number(e.intervalo_min_s)) {
      this.armado = false
      this._mudou_desde_leitura = false
      this.t_ult_leitura = agora
      this.t_ult_ciclo = agora
      this._parado_na_leitura = parado
      this.disparar_leitura()
    }
  }

  /** Resumo das frequências/etapas aplicadas desde a leitura anterior. */
  _faixa_varrida() {
    const grupos: [string, number | null, number | null][] = []
    for (const [nome, f] of this.amostras_freq) {
      const g = grupos[grupos.length - 1]
      if (!g || g[0] !== nome) grupos.push([nome, f, f])
      else if (f !== null) { g[1] = g[1] === null ? f : Math.min(g[1], f); g[2] = g[2] === null ? f : Math.max(g[2], f) }
    }
    const partes = grupos.map(([nome, fmin, fmax]) => (fmin === null ? nome : `${nome}: ${fmtFreq(fmin)} → ${fmtFreq(fmax)}`))
    return partes.length ? partes.join(' | ') : 'sem perturbação'
  }

  _tempo_ensaio() {
    if (this.t_inicio === null) return 0.0
    if (this.estado === 'parado') return this.t_fim_ensaio  // mantém o tempo final após encerrar
    const fim = this.estado === 'pausado' ? this.pausa_ini! : monotonic()
    return fim - this.t_inicio - this.t_pausado
  }

  /** Grava a foto com a leitura sobreposta (jpg). Nunca interrompe o registro: se falhar, devolve "". */
  private async _salvar_img(quadro: Quadro, resultados: Record<string, ResultadoCampo>, campos: CampoDisplay[], nome: string, txt: string) {
    try {
      const c = document.createElement('canvas')
      c.width = quadro.largura; c.height = quadro.altura
      const ctx = c.getContext('2d')!
      ctx.putImageData(new ImageData(new Uint8ClampedArray(quadro.dados.slice(0)), quadro.largura, quadro.altura), 0, 0)
      desenharCampos(ctx, quadro.altura, campos, resultados)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, quadro.altura - 34, quadro.largura, 34)
      ctx.fillStyle = '#fff'
      ctx.font = `${Math.round(30 * 0.7)}px Arial, sans-serif`
      ctx.fillText(semAcento(txt.replace(/–/g, '-').replace(/−/g, '-')), 8, quadro.altura - 10)
      const b64 = c.toDataURL('image/jpeg', 0.95).split(',')[1]
      await this.io(() => api({ acao: 'escrever', rel: this.rel('imagens', nome), base64: b64 }))
      return nome
    } catch {
      return ''
    }
  }

  async _registrar(r: Ctx) {
    const campos = r.campos ?? this.campos
    if (!r.em_ensaio) {
      // leitura manual: só mostra
      const vals = campos.map(c => `${c.nome} = ${formatar(c, r.valores[c.nome])}`).join(', ')
      this._set_status(r.status, r.status === 'OK' ? COR_OK : COR_FALHA, `Leitura manual: ${vals}` + (r.obs ? `\n${r.obs}` : ''))
      this.ult_quadro = r
      return
    }
    if (this.estado === 'parado') return
    const evento = !!r.evento  // ex.: SEM CICLO — não conta como abastecimento
    if (!evento) this.n_leitura += 1
    const ok = r.status.startsWith('OK')  // "OK*" = falhou na 1ª e passou na 2ª leitura
    if (ok) this.n_ok += 1
    else this.n_falha += 1
    const emc = r.emc
    const sem_freq = !!emc.sem_freq && emc.estado === 'pausado'  // gerador parado pelo operador
    if (sem_freq && !evento) this.n_sem_freq += 1
    const aplicandoEst = emc.estado === 'rodando' || emc.estado === 'pausado'
    const seg = sem_freq ? `(freq. parada) ${emc.nome}` : aplicandoEst ? emc.nome : emc.estado.endsWith('aguardando') ? `(aguardando) ${emc.nome}` : '—'
    const freq = sem_freq ? '—' : aplicandoEst && emc.freq ? fmtFreq(emc.freq) : '—'
    const vals = campos.map(c => formatar(c, r.valores[c.nome]))
    // totalizador: soma dos volumes lidos até este abastecimento
    let [soma, inval] = this.acum[this.acum.length - 1]
    if (!evento) {
      const vol = r.valores[this._campo_volume(campos)] ?? null
      if (vol === null) inval += 1
      else soma += vol
      this.acum.push([soma, inval])
      // leitura estruturada para o Registro (FOR EMC38)
      const cs = this.cfg.consistencia
      const aplicando = aplicandoEst && !sem_freq
      let obs_reg = r.status === 'OK' ? '' : `${r.status}: ${r.obs}`
      if (sem_freq) obs_reg = 'Frequência parada no gerador (só totalizador)' + (obs_reg ? `; ${obs_reg}` : '')
      this.leituras_reg.push({
        n: this.n_leitura, hora: strftime(r.hora, '%H:%M:%S'), data: strftime(r.hora, '%d/%m/%Y'), status: r.status,
        segmento: emc.nome, face: emc.face ?? '', polarizacao: emc.polarizacao ?? '',
        freq: aplicando ? emc.freq : null, sem_freq, freq_ref: sem_freq ? emc.freq : null,
        preco: r.valores[cs.preco] ?? null, total: r.valores[cs.total] ?? null, volume: vol,
        obs: obs_reg, ensaio: this.pastaRel ? this.caminhoPortatil() : '',
      })
      // ponto de retomada = posição EMC no início desta leitura (o trecho depois dela ainda não foi validado)
      if (aplicando) this.pos_ult_leitura = { idx: emc.idx, t_seg: emc.t_seg, nome: emc.nome, freq: emc.freq, passo: emc.passo }
    }
    const acum_txt = br(soma, 2)
    const esp_txt = this.tot_inicial !== null ? br(this._tot_base() + soma, 2) : '—'
    let obs = r.obs
    if (r.parado_s !== null && r.parado_s !== undefined) obs = `congelado há ${br(r.parado_s, 1)} s` + (obs ? `; ${obs}` : '')
    if (sem_freq && !evento) obs = 'SEM FREQUÊNCIA (gerador parado) – conta p/ totalizador' + (obs ? `; ${obs}` : '')
    if (r.instantanea) obs = 'CAPTURA INSTANTÂNEA (operador, ao pausar/parar)' + (obs ? `; ${obs}` : '')
    // erro da leitura em relação ao valor esperado (preset) do campo de volume
    const cvol = campos.find(c => c.nome === this._campo_volume(campos)) ?? null
    const e_pct = evento ? null : erroPct(r.valores[this._campo_volume(campos)], this._esperado_volume(cvol))
    if (!evento && this.leituras_reg.length) this.leituras_reg[this.leituras_reg.length - 1].erro = e_pct
    const linha: Linha = [evento ? '—' : this.n_leitura, strftime(r.hora, '%H:%M:%S'), fmtTempo(r.tempo), ...vals,
      fmtErro(e_pct), acum_txt, esp_txt, r.status, seg, freq, r.faixa, obs, '']

    const nomeImg = (rotuloImg: string) => evento ? `evento_${strftime(r.hora, '%H%M%S')}_${rotuloImg}.jpg` : `leitura_${String(this.n_leitura).padStart(4, '0')}_${rotuloImg}.jpg`
    const txtImg = (rotuloImg: string) => `#${this.n_leitura} ${strftime(r.hora, '%d/%m/%Y %H:%M:%S')}  ${rotuloImg}  ${seg}  ${freq}`
    let img_nome = ''
    const im = this.cfg.imagens
    const suspeita = r.status === 'OK*'
    const n_esta = this.n_leitura
    const fotos: Promise<string>[] = []
    if (r.quadro && ((!ok && im.salvar_falhas) || im.salvar_todas)) {
      const rt = suspeita ? 'OK' : r.status.replace(/ /g, '_')
      img_nome = nomeImg(rt)
      fotos.push(this._salvar_img(r.quadro, r.resultados, campos, img_nome, txtImg(rt)))
    }
    if (suspeita && r.quadro_suspeito && (im.salvar_falhas || im.salvar_todas)) {
      img_nome = nomeImg('SUSPEITA_1a_leitura')
      fotos.push(this._salvar_img(r.quadro_suspeito, r.res_suspeito ?? {}, campos, img_nome, txtImg('SUSPEITA_1a_leitura')))
    }
    if (img_nome && !evento && this.leituras_reg.length) {
      // foto acessível pelo Registro (caminho relativo à pasta do app)
      this.leituras_reg[this.leituras_reg.length - 1].foto = this.caminhoPortatil('imagens', img_nome)
    }
    void Promise.all(fotos).then(rs => { if (rs.some(x => !x)) this.lbl_status_det.set(`Aviso: não foi possível salvar a foto da leitura nº ${n_esta}.`) })

    this.linhas.push([...linha, img_nome])
    this._csv_acrescentar([...linha, img_nome])
    this.treeInsert(linha, suspeita ? 'aviso' : ok ? 'ok' : 'falha')

    if (ok) {
      if (!this.alarme.tocando) {
        this._set_status(suspeita ? 'OK*' : 'OK', suspeita ? COR_AVISO : COR_OK, `Abastecimento ${this.n_leitura}: `
          + campos.map((c, i) => `${c.nome} = ${vals[i]}`).join(', ') + (suspeita ? `\n${r.obs}` : ''))
      }
    } else {
      const onde = freq !== '—' ? `${seg} @ ${freq}` : seg
      this._set_status(`FALHA – ${r.status}`, COR_FALHA, `Abastecimento ${this.n_leitura} — ${onde}\nFaixa desde a leitura anterior: ${r.faixa}\n${r.obs}`)
      const a = this.cfg.alarme
      const grave = Number(this.cfg.ensaio.erro_grave_pct ?? 5.0) || 0
      const leve = r.status === 'FALHA' && e_pct !== null && grave > 0 && Math.abs(e_pct) <= grave + 1e-9
      const em = freq !== '—' && emc.freq ? `, em ${falaFreq(emc.freq)}` : ''
      if (a.ativo && leve) {
        // erro leve: bipes curtos e/ou frase falada — chama o olho para a TV sem exigir "Reconhecer"
        this._avisar(`Atenção: erro elevado, ${falaNum(e_pct!, 2)} por cento${em}. Leitura ${this.n_leitura}.`)
        this._piscar_barra()
      } else if (a.ativo) {
        let frase: string, titulo: string
        if (e_pct !== null) {
          frase = `Atenção! Erro muito elevado: ${falaNum(e_pct, 1)} por cento${em}. Leitura ${this.n_leitura}.`
          titulo = '⚠ ERRO MUITO ELEVADO'
        } else {
          frase = `Atenção! Falha na leitura ${this.n_leitura}: ${r.status.toLowerCase()}${em}.`
          titulo = `⚠ FALHA NA LEITURA — ${r.status}`
        }
        this._alerta_grave(frase, titulo, `Leitura nº ${this.n_leitura}: ` + campos.map((c, i) => `${c.nome} = ${vals[i]}`).join(', ')
          + (e_pct !== null ? `  |  erro ${fmtErro(e_pct)} %` : '') + `  |  ${onde}`)
      }
    }
    this.ult_quadro = r
    if (!evento) this._avisar_faltando(emc)
    this._salvar_estado()

    // parada automática: N leituras SEGUIDAS com |erro| > X % do valor esperado do campo de volume
    if (!evento) {
      const e = this.cfg.ensaio
      const cv = cvol
      const vol = cv ? r.valores[cv.nome] ?? null : null
      const e_rel = erroPct(vol, this._esperado_volume(cv))  // mesmo cálculo da coluna "Erro [% L]"
      if (e_rel !== null) this.erros_seguidos = Math.abs(e_rel) > Number(e.parar_erro_pct) ? this.erros_seguidos + 1 : 0
      const n_lim = Math.trunc(e.parar_erros_n ?? 0)
      if (n_lim > 0 && this.erros_seguidos >= n_lim) {
        await this._parada_automatica(`${this.erros_seguidos} leituras seguidas com erro maior que ${br(Number(e.parar_erro_pct), 2)} % (última: ${cv ? formatar(cv, vol) : '—'})`)
        return
      }
    }
    // n do ensaio = abastecimentos COM perturbação (os sem frequência só entram no totalizador)
    if (this.cfg.ensaio.parar_ao_atingir && this._n_com_freq() >= this.cfg.ensaio.n_abastecimentos) await this.parar_ensaio(false)
  }

  async exportar_excel(silencioso = false): Promise<string | null> {
    if (!this.pastaRel || !this.linhas.length) {
      if (!silencioso) await messagebox.showinfo('Excel', 'Ainda não há leituras de um ensaio para exportar.')
      return null
    }
    const cab = [...this._colunas(), 'Imagem']
    const i_status = cab.indexOf('Status')
    const n_campos = this.campos_ensaio.length
    const linhas = this.linhas.map(linha => {
      const row: (string | number | null)[] = [...linha]
      for (let j = 3; j < 3 + n_campos + 3; j++) {  // valores, erro, acumulado e esperado como número no Excel
        const v = row[j] !== '---' ? num(row[j], null) : null
        if (v !== null) row[j] = v
      }
      return row
    })
    const resumo: [string, string | number][] = [
      ['Perfil EMC', this.cfg.perfil], ['Leituras', this.n_leitura], ['OK', this.n_ok], ['Falhas', this.n_falha],
      ['Totalizador', this._resumo_totalizador().replace(/\n/g, ' | ')],
      ['Soma dos volumes lidos (L)', pyRoundN(this.acum[this.acum.length - 1][0], 3)],
      ['Leituras sem volume válido', this.acum[this.acum.length - 1][1]],
      ['Gerado em', strftime(new Date(), '%d/%m/%Y %H:%M:%S')],
    ]
    try {
      const r = await this.io(() => api({ acao: 'excel', rel: this.pastaRel, dados: { cab, linhas, i_status, tot_registros: this.tot_registros, resumo } }))
      if (!silencioso) await messagebox.showinfo('Excel', `Exportado:\n${r.caminho}`)
      return r.caminho
    } catch (ex) {
      if (!silencioso) await messagebox.showerror('Excel', `Não foi possível salvar (arquivo aberto?):\n${ex instanceof Error ? ex.message : ex}`)
      return null
    }
  }

  async abrir_pasta() { await api({ acao: 'abrir', rel: this.pastaRel ?? '' }).catch(() => undefined) }

  // ================================================================== LOOP (partes do _tick)
  protected _tick_ensaio_inicio() {
    // cronograma EMC
    if (this.estado !== 'parado') {
      this._evento_cron(this.cron.atualizar())
      this._acompanhar_segmentos()
      if (this._tick_n % 25 === 0) this._pintar_segmentos()
      const st = this.cron.status()
      if (this.cron.ativo()) {
        this.amostras_freq.push([st.nome, st.freq])
        if (this.amostras_freq.length > 20000) this.amostras_freq = this.amostras_freq.slice(-20000)
      }
      const bp = this.bt_prox_seg.get(), on = st.estado.endsWith('aguardando')
      if (bp.on !== on) this.bt_prox_seg.set({ ...bp, on })
      const bf = this.bt_freq.get(), onf = this.estado === 'rodando' && (st.estado === 'rodando' || this.freq_parada)
      if (bf.on !== onf) this.bt_freq.set({ ...bf, on: onf })
    }
  }

  protected _amostra(t: number, valor: number | null) {
    super._amostra(t, valor)
    if (this.estado === 'rodando') {
      this._vigiar_display(t, valor)
      if (this.det_disparo !== null) {
        const ev = this.det_disparo.passo(t, valor)
        if (ev && ev[0] === 'saida') this._disparar_emc(ev[1], 'saída do valor congelado')
      }
    }
    if (this.estado === 'rodando' && this.det_ensaio !== null && this.ciclo_medido) {
      const ev = this.det_ensaio.passo(t, valor)
      if (ev && ev[0] === 'saida') {
        const ant = this.ciclo_medido.saida_ensaio
        if (ant) this.ciclo_obs = ev[1] - ant
        this.ciclo_medido.saida_ensaio = ev[1]
      }
    }
  }

  protected _tick_ensaio_meio() {
    // leitura programada
    const e = this.cfg.ensaio
    const agora = monotonic()
    const bloqueado = this.cron.estado.endsWith('aguardando') && e.pausar_leituras_aguardando
    if (e.modo_leitura === 'congelado') {
      if (this.estado === 'rodando') this._monitorar_congelamento(agora, bloqueado)
    } else if (this.estado === 'rodando' && !this.lendo && !bloqueado) {
      // por tempo: lê o abastecimento cuja SAÍDA do valor congelado (início) for ≥ prox_leitura, quando o
      // valor final estiver CONGELADO há >= congelado_s; depois o intervalo (dwell) conta da saída do lido
      const t_ab = this.t_inicio_abast
      if (this._vis.val !== null && this._mudou_desde_leitura && t_ab !== null && t_ab >= this.prox_leitura!
        && agora - this.t_ult_mudanca >= Number(e.congelado_s)) {
        // tolerância de 25 % do intervalo: com intervalo = ciclo, o abastecimento seguinte sempre conta
        this.prox_leitura = t_ab + 0.75 * Number(e.intervalo_s)
        this._mudou_desde_leitura = false
        this._parado_na_leitura = agora - this.t_ult_mudanca
        this.disparar_leitura()
      }
    }
    // resultados das leituras
    while (this.fila.length) {
      const r = this.fila.shift()!
      this.lendo = false
      void this._registrar(r).catch(ex => {  // nunca perder uma leitura em silêncio
        this._set_status('ERRO AO REGISTRAR', COR_FALHA, `Erro interno ao registrar a leitura nº ${this.n_leitura}: ${ex instanceof Error ? ex.message : ex}. Confira o mostrador e a tabela; o ensaio continua.`)
        const a = this.cfg.alarme
        this.alarme.disparar(a.freq_hz ?? 2500, a.dur_ms ?? 400, true)
      }).then(() => {
        const acao = this._apos_leitura
        this._apos_leitura = null
        if (acao === 'pausar' && this.estado === 'rodando') void this.pausar_retomar(false)
        else if (acao === 'parar' && this.estado !== 'parado') void this.parar_ensaio(false)
      })
    }
  }

  protected _tick_ensaio_fim() {
    const sem = !this.camera.ativa || this.proc === null || performance.now() / 1000 - this.proc.ultimoT > 2.0
    if (this._tick_n % 25 === 0 && this.semImagem.get() !== sem) this.semImagem.set(sem)
    if (this.camera.erro && this._tick_n % 25 === 0 && this.estado === 'rodando') this.lbl_status_det.set('ATENÇÃO: ' + this.camera.erro)
    if (this.estado === 'rodando') this._checar_parada(monotonic())
    // estado do ensaio salvo a cada ~10 s (posição na varredura), para poder continuar depois
    if (this.estado !== 'parado' && this._tick_n % 250 === 0) this._salvar_estado()
    if (this._tick_n % 5 === 0) this._atualizar_painel()
  }

  _atualizar_painel() {
    const e = this.cfg.ensaio
    this.lbl_abast.set(`Abastecimento ${this._n_com_freq()} / ${e.n_abastecimentos}` + (this.n_sem_freq ? `  (+${this.n_sem_freq} sem frequência)` : ''))
    this.lbl_ok.set(`OK: ${this.n_ok}`)
    this.lbl_falha.set(`Falhas: ${this.n_falha}`)
    this.lbl_tempo.set(`Tempo de ensaio: ${fmtTempo(this._tempo_ensaio())}`)
    const c = this.ciclo_medido
    if (this.medicao !== null) this.lbl_ciclo.set(this.lbl_med_media.get().text)
    else if (c) this.lbl_ciclo.set(`Tempo médio do ciclo: ${br(c.periodo, 3)} s (desvio ${br(c.desvio ?? 0, 3)} s)` + (this.ciclo_obs ? ` | ciclo atual ${br(this.ciclo_obs, 3)} s` : ''))
    const [soma, inval] = this.acum[this.acum.length - 1]
    if (this.tot_inicial !== null) {
      this.lbl_tot.set(`Totalizador: inicial ${br(this.tot_inicial, 2)} + lido ${br(soma, 2)} L = esperado agora ${br(this._tot_base() + soma, 2)} L` + (inval ? `  (${inval} sem volume)` : ''))
    } else {
      this.lbl_tot.set(this.estado !== 'parado' ? `Volume acumulado lido: ${br(soma, 2)} L  (totalizador inicial não informado)` : '')
    }
    if (this.estado === 'rodando' && e.modo_leitura === 'congelado') {
      const fase = this.lendo ? 'lendo valor congelado…' : this.armado ? 'abastecendo (valor mudando) → lê quando congelar' : 'aguardando novo abastecimento'
      this.lbl_prox.set(`Próxima leitura: ${fase}`)
    } else if (this.estado === 'rodando' && this.prox_leitura !== null) {
      const falta = this.prox_leitura - monotonic()
      let txt = this.lendo ? 'lendo…'
        : this.prox_leitura === -Infinity ? '1º abastecimento após o início (quando o valor congelar)'
        : falta > 0 ? `abastecimento que começar daqui a ≥ ${fixo(falta, 0)} s` : 'próximo abastecimento (quando o valor congelar)'
      if (this.ciclo_obs) txt += `  | último ciclo ${br(this.ciclo_obs, 2)} s`
      this.lbl_prox.set(`Próxima leitura: ${txt}`)
    } else if (this.estado === 'pausado') {
      this.lbl_prox.set('Próxima leitura: (pausado)')
    } else {
      this.lbl_prox.set('Próxima leitura: —')
    }

    if (this.estado === 'parado') {
      const segs = this.perfis[this.cfg.perfil] ?? []
      this.lbl_seg.set(`${segs.length} segmento(s) no perfil`)
      this.lbl_freq.set('—')
      this.lbl_passo.set('')
      this.pb_seg.set(0)
      return
    }
    const st = this.cron.status()
    const nomes: Record<string, string> = { rodando: '', pausado: ' (PAUSADO)', aguardando: ' — AGUARDANDO OPERADOR', pausado_aguardando: ' — AGUARDANDO OPERADOR', concluido: '', parado: '' }
    if (st.estado === 'concluido') {
      this.lbl_seg.set('Perfil EMC concluído')
      this.lbl_freq.set('—')
      this.lbl_passo.set('')
      this.pb_seg.set(1000)
      return
    }
    const suf = this.freq_parada ? ' — FREQUÊNCIA PARADA (bomba segue p/ totalizador)' : nomes[st.estado] ?? ''
    this.lbl_seg.set(`Segmento ${st.idx + 1}/${st.n_seg}: ${st.nome}${suf}`)
    if (st.estado.endsWith('aguardando')) {
      this.lbl_freq.set('aguardando')
      this.lbl_passo.set(st.obs)
      this.pb_seg.set(0)
      return
    }
    if (st.tipo === 'varredura') {
      this.lbl_freq.set(fmtFreq(st.freq))
      this.lbl_passo.set(`Passo ${st.passo}/${st.n_passos}  |  segmento ${fmtTempo(st.t_seg)} / ${fmtTempo(st.dur_seg)}  |  perturbação restante ≈ ${fmtTempo(st.restante_total)}` + (st.obs ? `\n${st.obs}` : ''))
    } else {
      this.lbl_freq.set(fmtTempo(st.t_seg) + ' / ' + fmtTempo(st.dur_seg))
      this.lbl_passo.set(`Etapa por tempo  |  restante ≈ ${fmtTempo(st.restante_total)}` + (st.obs ? `\n${st.obs}` : ''))
    }
    this.pb_seg.set(st.dur_seg ? 1000 * st.t_seg / st.dur_seg : 0)
  }

  // ================================================================== parecer do operador (rebater leitura)
  private _n_selecionada(): number | null | undefined {
    const sel = this.selTab.get()
    if (!sel.length) return undefined
    const row = this.tree.get().find(r => r.id === sel[0])
    return row && /^\d+$/.test(String(row.valores[0])) ? Number(row.valores[0]) : null
  }

  /** Parecer sobre uma leitura: a original é mantida; o parecer é acrescentado (trilha de auditoria). */
  async rebater_leitura() {
    const n = this._n_selecionada()
    if (n === undefined) { await messagebox.showinfo('Parecer', 'Selecione na tabela a leitura a rebater (ou dê duplo clique nela).'); return }
    if (n === null) { await messagebox.showinfo('Parecer', 'Selecione uma linha de leitura (com número), não um evento.'); return }
    if (!this.linhas.some(l => String(l[0]) === String(n))) return
    this.janela.set({ tipo: 'parecer', n })
  }

  registrar_parecer(n: number, decisao: string, valor_manual: string, justificativa: string, responsavel: string) {
    const cols = this._colunas()
    const i_par = cols.indexOf('Parecer do operador')
    const agora = new Date()
    const par: Record<string, unknown> = { decisao, valor_manual, justificativa, responsavel, data_hora: strftime(agora, '%d/%m/%Y %H:%M:%S') }
    let hist = (this.pareceres[String(n)]?.historico as Record<string, unknown>[] | undefined) ?? []
    if (String(n) in this.pareceres) {
      const ant = { ...this.pareceres[String(n)] }
      delete ant.historico
      hist = [...hist, ant]
    }
    par.historico = hist  // pareceres anteriores da mesma leitura são mantidos
    this.pareceres[String(n)] = par
    ;(this.cfg as unknown as Record<string, unknown>).ultimo_responsavel = responsavel
    const resumo = `${decisao.split(' (')[0].split(' —')[0]}` + (valor_manual ? `; mostrador: ${valor_manual} L` : '') + `; ${responsavel} ${par.data_hora}`
    for (const l of this.linhas) if (String(l[0]) === String(n)) l[i_par] = resumo
    this.tree.set(this.tree.get().map(r => {
      if (!r.valores.length || String(r.valores[0]) !== String(n)) return r
      const v = [...r.valores]; v[i_par] = resumo
      return { ...r, valores: v, tag: 'rebatida' }
    }))
    for (const lr of this.leituras_reg) {
      if (lr.n === n && !lr.importada) lr.obs = `${lr.obs ?? ''} | Parecer: ${resumo} — ${justificativa}`.replace(/^[ |]+|[ |]+$/g, '')
    }
    const cols_l = this.linhas.find(l => String(l[0]) === String(n))
    const seg = cols_l ? String(cols_l[cols.indexOf('Segmento')]) : null
    const frq = cols_l ? String(cols_l[cols.indexOf('Freq. atual')]) : ''
    this._linha_evento(`PARECER leit. #${n}`, `Parecer sobre a leitura #${n} (${cols_l ? cols_l[1] : ''}, ${frq}): ${decisao} | valor conferido: ${valor_manual || '—'} | justificativa: ${justificativa} | ${responsavel}`, seg, frq)
    this._salvar_estado()
    if (this.estado === 'parado' && this.pastaRel) void this.exportar_excel(true)  // ensaio já encerrado: atualiza o Excel
  }

  // ------------------------------------------------------------------ correção de leitura (OCR errado)
  /** O operador viu no mostrador que a câmera leu errado: corrige o valor (o original fica registrado). */
  async corrigir_leitura() {
    const n = this._n_selecionada()
    if (n === undefined) { await messagebox.showinfo('Corrigir leitura', 'Selecione na tabela a leitura que a câmera leu errado.'); return }
    if (n === null) { await messagebox.showinfo('Corrigir leitura', 'Selecione uma linha de leitura (com número), não um evento.'); return }
    const cols = this._colunas()
    const linha = this.linhas.find(l => String(l[0]) === String(n))
    const campo_vol = this._campo_volume(this.campos_ensaio.length ? this.campos_ensaio : this.campos)
    if (!linha || !cols.includes(campo_vol)) { await messagebox.showinfo('Corrigir leitura', `Campo de volume '${campo_vol}' não encontrado nesta tabela.`); return }
    this.janela.set({ tipo: 'corrigir', n })
  }

  /** Troca o volume da leitura n pelo valor visto no mostrador e recalcula status, erro, acumulado e totalizador
   *  dessa leitura e das seguintes (trilha: valor da câmera na Observação, evento CORREÇÃO e self.correcoes). */
  aplicar_correcao(n: number, novo: number, justificativa: string, responsavel: string): boolean {
    const cols = this._colunas()
    const campos = this.campos_ensaio.length ? this.campos_ensaio : this.campos
    const campo_vol = this._campo_volume(campos)
    const cv = campos.find(c => c.nome === campo_vol)
    const i_lin = this.linhas.findIndex(l => String(l[0]) === String(n))
    if (!cv || i_lin < 0 || !cols.includes(campo_vol)) return false
    const ix = Object.fromEntries(['Status', 'Erro [% L]', 'Acumulado (L)', 'Totalizador esperado', 'Observação', 'Parecer do operador', 'Segmento', 'Freq. atual'].map(k => [k, cols.indexOf(k)]))
    const i_vol = cols.indexOf(campo_vol)
    const linha = this.linhas[i_lin]
    const txt_ant = String(linha[i_vol] ?? ''), st_ant = String(linha[ix['Status']])
    const numBr = (x: unknown) => num(String(x).replace(/\./g, '').replace(',', '.'), null)
    const ant = !['', '—'].includes(txt_ant) ? numBr(txt_ant) : null
    novo = pyRoundN(novo, cv.decimais)
    let st_novo = (!cv.validar || Math.abs(novo - cv.esperado) <= cv.tolerancia + 1e-9) && !this._excede_limite(campos, { [cv.nome]: novo }) ? 'OK' : 'FALHA'
    st_novo += ' (corrigido)'
    const e_pct = erroPct(novo, this._esperado_volume(cv))
    const agora = new Date()
    // contadores OK/falha
    if (st_ant.startsWith('OK') !== st_novo.startsWith('OK')) {
      const d_ok = st_novo.startsWith('OK') ? 1 : -1
      this.n_ok += d_ok
      this.n_falha -= d_ok
    }
    // acumulado / totalizador desta leitura em diante
    const delta = novo - (ant ?? 0.0)
    const d_inv = ant === null ? -1 : 0
    for (let k = n; k < this.acum.length; k++) {
      const [s, inv] = this.acum[k]
      this.acum[k] = [s + delta, Math.max(0, inv + d_inv)]
    }
    for (const l of this.linhas.slice(i_lin)) {
      for (const col of ['Acumulado (L)', 'Totalizador esperado']) {
        if (col === 'Totalizador esperado' && l[0] === '—') continue  // em eventos de totalizador esta coluna é o valor lido
        const v = !['', '—'].includes(String(l[ix[col]])) ? numBr(l[ix[col]]) : null
        if (v !== null) l[ix[col]] = br(v + delta, 2)
      }
    }
    linha[i_vol] = formatar(cv, novo)
    linha[ix['Status']] = st_novo
    linha[ix['Erro [% L]']] = fmtErro(e_pct)
    linha[ix['Observação']] = `CORRIGIDO: câmera leu ${txt_ant || '—'} (${st_ant})` + (linha[ix['Observação']] ? `; ${linha[ix['Observação']]}` : '')
    linha[ix['Parecer do operador']] = `Correção: ${txt_ant || '—'} → ${formatar(cv, novo)} L; ${responsavel} ${strftime(agora, '%d/%m/%Y %H:%M:%S')}`
    for (const lr of this.leituras_reg) {
      if (lr.n === n && !lr.importada) {
        Object.assign(lr, { volume: novo, status: st_novo, erro: e_pct })
        lr.obs = `Corrigido pelo operador: câmera ${txt_ant || '—'} → ${formatar(cv, novo)} L (${justificativa})` + (lr.obs ? ` | ${lr.obs}` : '')
      }
    }
    ;(this.correcoes[String(n)] ??= []).push({
      lido_camera: txt_ant, status_camera: st_ant, corrigido: novo, justificativa, responsavel, data_hora: strftime(agora, '%d/%m/%Y %H:%M:%S'),
    })
    ;(this.cfg as unknown as Record<string, unknown>).ultimo_responsavel = responsavel
    this._recarregar_tabela()
    const frq = String(linha[ix['Freq. atual']])
    this._linha_evento(`CORREÇÃO leit. #${n}`, `Leitura #${n} (${linha[1]}, ${frq}): câmera ${txt_ant || '—'} → correto ${formatar(cv, novo)} L | ${justificativa} | ${responsavel}`, String(linha[ix['Segmento']]), frq)
    this._salvar_estado()
    if (this.estado === 'parado' && this.pastaRel) void this.exportar_excel(true)
    return true
  }

  // ------------------------------------------------------------------ excluir leituras / recomeçar / totalizador inicial
  /** Posição EMC (segmento e passo) em que começou o abastecimento de uma leitura — para refazer dali. */
  _pos_da_leitura(lr: LeituraReg): Record<string, unknown> | null {
    const segs = this.cron.segmentos
    const nome = String(lr.segmento ?? '')
    const i = segs.findIndex(s => rotulo(s) === nome)
    if (i < 0) return null
    const seg = segs[i]
    const f = lr.freq || lr.freq_ref
    const fs = frequencias(seg)
    if (f && fs.length) {
      let k = 0
      for (let j = 1; j < fs.length; j++) if (Math.abs(Math.log(fs[j] / f)) < Math.abs(Math.log(fs[k] / f))) k = j
      return { idx: i, t_seg: k * tempoPasso(seg), nome: rotulo(seg), freq: fs[k], passo: k + 1 }
    }
    return { idx: i, t_seg: 0.0, nome: rotulo(seg), freq: fs.length ? fs[0] : null, passo: 1 }
  }

  /** Refaz acumulado, totalizador esperado e as conferências do totalizador a partir das leituras que ficaram. */
  _recalcular_linhas() {
    const cols = this._colunas()
    const [i_ac, i_esp, i_st, i_obs] = ['Acumulado (L)', 'Totalizador esperado', 'Status', 'Observação'].map(c => cols.indexOf(c))
    const tol = Number(this.cfg.totalizador.tol)
    const vols = new Map(this.leituras_reg.filter(lr => !lr.importada).map(lr => [lr.n, lr.volume ?? null]))
    let ri = 0  // linhas "TOTALIZ." e registros do totalizador estão na mesma ordem
    let soma = 0.0, inval = 0, ajuste = 0.0, n_div = 0
    const acum: [number, number][] = [[0.0, 0]]
    const tem_tot = this.tot_inicial !== null
    for (const l of this.linhas) {
      if (l[0] === 'imp') continue
      if (/^\d+$/.test(String(l[0]))) {
        const v = vols.get(Number(l[0])) ?? null
        if (v === null) inval += 1
        else soma += v
        acum.push([soma, inval])
        l[i_ac] = br(soma, 2)
        l[i_esp] = tem_tot ? br(this.tot_inicial! + ajuste + soma, 2) : '—'
        continue
      }
      const st = String(l[i_st])
      if (!st.startsWith('TOTALIZ.')) { l[i_ac] = br(soma, 2); continue }
      const t = this.tot_registros[ri++]
      if (!t || t.Tipo === 'Inicial' || !tem_tot) {
        if (t && t.Tipo === 'Inicial' && tem_tot) l[i_esp] = br(this.tot_inicial!, 2)
        continue
      }
      const n = Math.trunc(Number(t['Até abastecimento nº']))
      const [s_n, inv_n] = acum[Math.max(0, Math.min(n, acum.length - 1))]
      const esp = this.tot_inicial! + ajuste + s_n
      const valor = Number(t['Totalizador lido (L)'])
      const [status, obs, ok] = this._conferencia_tot(String(t.Tipo), valor, esp, s_n, n, inv_n, ajuste, tol)
      Object.assign(t, { 'Soma lida (L)': s_n, 'Esperado (L)': esp, 'Diferença (L)': valor - esp, 'Situação': status, 'Leituras sem volume': inv_n })
      l[i_ac] = br(s_n, 2); l[i_esp] = br(esp, 2); l[i_st] = status; l[i_obs] = obs
      if (t.Tipo === 'Retomada') ajuste += valor - esp
      else if (!ok) n_div += 1
    }
    this.acum = acum
    this.tot_ajuste = ajuste
    this.n_tot_div = n_div
  }

  /** As linhas excluídas não somem: vão para leituras_excluidas.csv (com data, motivo e responsável). */
  _guardar_excluidas(linhas: Linha[], motivo: string, responsavel: string, quando: string) {
    if (!this.pastaRel || !linhas.length) return
    const cab = '﻿' + csvLinha([...this._colunas(), 'Imagem', 'Excluída em', 'Motivo', 'Responsável'])
    const texto = linhas.map(l => csvLinha([...l, quando, motivo, responsavel])).join('')
    void this.io(() => api({ acao: 'escrever', rel: this.rel('leituras_excluidas.csv'), texto, acrescentar: true, cabecalho: cab })).catch(ex => {
      this.lbl_status_det.set(`Aviso: não foi possível gravar leituras_excluidas.csv (${ex instanceof Error ? ex.message : ex})`)
    })
  }

  /** Exclui leituras do ensaio (nums) ou TUDO (recomeçar do zero). Renumera as que ficam, refaz acumulado e
   *  conferências do totalizador e, quando as excluídas são as últimas (ou tudo), volta a perturbação para o ponto
   *  da 1ª excluída. novo_tot: totalizador inicial novo. */
  excluir_leituras(nums: number[] | null, tudo = false, motivo = '', responsavel = '', novo_tot: number | null = null) {
    const agora = new Date()
    const quando = strftime(agora, '%d/%m/%Y %H:%M:%S')
    const todos = this._nums_leituras()
    const dele = [...(tudo ? new Set(todos) : new Set((nums ?? []).map(Math.trunc).filter(n => todos.includes(n))))].sort((a, b) => a - b)
    if (!dele.length && !tudo) return null
    const restantes = todos.filter(n => !dele.includes(n))
    const cauda = tudo || !restantes.length || Math.max(...restantes) < Math.min(...dele)
    const lr_por_n = new Map(this.leituras_reg.filter(lr => !lr.importada).map(lr => [lr.n, lr]))
    const primeira = dele.length ? lr_por_n.get(dele[0]) : undefined
    const pos = cauda && primeira ? this._pos_da_leitura(primeira) : null
    if (tudo && pos) Object.assign(pos, { t_seg: 0.0, passo: 1, freq: frequencias(this.cron.segmentos[pos.idx as number])[0] ?? null })
    const cols = this._colunas()
    const i_st = cols.indexOf('Status')
    // segmentos com leituras excluídas deixam de estar "feitos"
    const segs_afetados = new Set(dele.filter(n => lr_por_n.has(n)).map(n => lr_por_n.get(n)!.segmento))
    const registro: Record<string, unknown> = {
      data_hora: quando, responsavel, motivo,
      modo: tudo ? 'recomeçar do zero' : cauda && dele.length > 1 ? `da nº ${dele[0]} em diante` : 'selecionadas',
      leituras: dele, tot_inicial_antes: this.tot_inicial, tot_inicial_depois: novo_tot,
    }
    const tot_antigo = this.tot_inicial
    const ehNum = (l: Linha) => /^\d+$/.test(String(l[0]))
    if (tudo) {
      const removidas = [...this.linhas]
      registro.pareceres = this.pareceres; registro.correcoes = this.correcoes
      this._guardar_excluidas(removidas, motivo, responsavel, quando)
      this.linhas = []; this.leituras_reg = []; this.tot_registros = []
      this.pareceres = {}; this.correcoes = {}; this.tot_importados = {}
      this.acum = [[0.0, 0]]
      this.n_leitura = this.n_ok = this.n_falha = this.n_sem_freq = this.n_tot_div = 0
      this.tot_ajuste = 0.0
      this.tot_inicial = null  // registrado de novo logo abaixo (o informado ou o anterior)
    } else {
      const sel = new Set(dele)
      const ok_del = this.linhas.filter(l => ehNum(l) && sel.has(Number(l[0])) && String(l[i_st]).startsWith('OK')).length
      const sf_del = dele.filter(n => lr_por_n.get(n)?.sem_freq).length
      let removidas = this.linhas.filter(l => ehNum(l) && sel.has(Number(l[0])))
      // nas exclusões das últimas leituras, os totalizadores parciais/final tomados depois delas também saem
      if (cauda) {
        const lim = dele[0]
        const pares: [Linha, TotReg | undefined][] = []
        let ri = 0
        for (const l of this.linhas) if (l[0] === '—' && String(l[i_st]).startsWith('TOTALIZ.')) pares.push([l, this.tot_registros[ri++]])
        const fora = pares.filter(([, t]) => t && (t.Tipo === 'Parcial' || t.Tipo === 'Final') && Math.trunc(Number(t['Até abastecimento nº'])) >= lim)
        removidas = [...removidas, ...fora.map(([l]) => l)]
        const lfora = new Set(fora.map(([l]) => l)), tfora = new Set(fora.map(([, t]) => t))
        this.linhas = this.linhas.filter(l => !lfora.has(l))
        this.tot_registros = this.tot_registros.filter(t => !tfora.has(t))
      }
      this._guardar_excluidas(removidas, motivo, responsavel, quando)
      const dig = (k: string) => /^\d+$/.test(k)
      registro.pareceres = Object.fromEntries(Object.entries(this.pareceres).filter(([k]) => dig(k) && sel.has(Number(k))))
      registro.correcoes = Object.fromEntries(Object.entries(this.correcoes).filter(([k]) => dig(k) && sel.has(Number(k))))
      this.linhas = this.linhas.filter(l => !(ehNum(l) && sel.has(Number(l[0]))))
      this.leituras_reg = this.leituras_reg.filter(lr => lr.importada || !sel.has(lr.n as number))
      // renumera as que ficam (1, 2, 3…) e tudo o que aponta para elas
      const novo_n = new Map(restantes.map((old, k) => [old, k + 1]))
      for (const l of this.linhas) if (ehNum(l)) l[0] = novo_n.get(Number(l[0]))!
      for (const lr of this.leituras_reg) if (!lr.importada && novo_n.has(lr.n as number)) lr.n = novo_n.get(lr.n as number)
      const renum = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o)
        .filter(([k]) => !(dig(k) && sel.has(Number(k))))
        .map(([k, v]) => [dig(k) && novo_n.has(Number(k)) ? String(novo_n.get(Number(k))) : k, v]))
      this.pareceres = renum(this.pareceres)
      this.correcoes = renum(this.correcoes)
      for (const t of this.tot_registros) {
        const ate = Math.trunc(Number(t['Até abastecimento nº'] || 0))
        t['Até abastecimento nº'] = restantes.filter(n => n <= ate).length
      }
      this.n_leitura = restantes.length
      this.n_ok -= ok_del
      this.n_falha -= dele.length - ok_del
      this.n_sem_freq = Math.max(0, this.n_sem_freq - sf_del)
    }
    this.exclusoes.push(registro)
    this.erros_seguidos = 0
    this._avisou_faltando.clear()  // pontos a refazer: os avisos de "faltam N" voltam a valer
    this._concluido = false
    this._motivo_parada = null
    this.cron.segmentos.forEach((s, i) => {
      if (segs_afetados.has(rotulo(s)) && i < this.seg_status.length && (this.seg_status[i] === 'feito' || this.seg_status[i] === 'pulado')) {
        const ainda = this.leituras_reg.some(lr => lr.segmento === rotulo(s) && !lr.importada)
        this.seg_status[i] = ainda ? 'pulado' : 'pendente'  // incompleto (laranja) ou a fazer
      }
    })
    if (pos) {
      this.pos_ult_leitura = pos
      if (this.estado !== 'parado') {
        this.det_disparo = null
        this.bt_prox_seg.set({ on: true, text: '▶ Iniciar próximo segmento' })
        this.cron.posicionar(pos.idx as number, pos.t_seg as number)
        if (this.estado === 'pausado') this.cron.pausar()  // volta a "aguardando" ao retomar
      }
    } else if (tudo) {
      this.pos_ult_leitura = null
    }
    const onde = pos && pos.freq ? `${pos.nome} @ ${fmtFreq(pos.freq as number)}` : String((pos ?? {}).nome ?? '')
    if (tudo) {
      const txt = `Recomeço do zero: ${dele.length} leitura(s) e os eventos anteriores excluídos (guardados em leituras_excluidas.csv) | motivo: ${motivo} | ${responsavel}`
      this._recarregar_tabela()
      this._linha_evento('RECOMEÇO DO ZERO', txt, onde || null)
      const v_ini = novo_tot !== null ? novo_tot : tot_antigo
      if (v_ini !== null) this._registrar_totalizador('Inicial', v_ini, 0)
    } else {
      if (novo_tot !== null && novo_tot !== this.tot_inicial) this._trocar_tot_inicial(novo_tot, motivo, responsavel, false)
      this._recalcular_linhas()
      this._recarregar_tabela()
      const faixa = dele.length === 1 ? `nº ${dele[0]}` : cauda ? `nº ${dele[0]} a ${dele[dele.length - 1]}` : 'nº ' + dele.join(', ')
      let txt = `Excluída(s) a(s) leitura(s) ${faixa} (guardadas em leituras_excluidas.csv); as seguintes foram renumeradas | motivo: ${motivo} | ${responsavel}`
      if (cauda && onde) txt += ` | refazer a partir de ${onde}`
      this._linha_evento('EXCLUSÃO DE LEITURAS', txt)
    }
    ;(this.cfg as unknown as Record<string, unknown>).ultimo_responsavel = responsavel
    this._reescrever_csv()
    this._salvar_estado()
    if (this.estado === 'parado' && this.pastaRel && this.linhas.length) void this.exportar_excel(true)
    this._atualizar_contadores_tela()
    return { excluidas: dele, cauda, pos, onde }
  }

  /** Corrige o totalizador inicial do ensaio (valor anterior fica na observação e no histórico). */
  _trocar_tot_inicial(novo: number, motivo: string, responsavel: string, recalcular = true) {
    const cols = this._colunas()
    const i_st = cols.indexOf('Status'), i_esp = cols.indexOf('Totalizador esperado'), i_obs = cols.indexOf('Observação')
    const antes = this.tot_inicial
    if (antes === null || !this.tot_registros.some(t => t.Tipo === 'Inicial')) {
      this._registrar_totalizador('Inicial', novo, 0)
    } else {
      this.tot_inicial = novo
      const t = this.tot_registros.find(t => t.Tipo === 'Inicial')!
      t['Totalizador lido (L)'] = novo
      const linha = this.linhas.find(l => l[0] === '—' && String(l[i_st]) === 'TOTALIZ. INICIAL')
      if (linha) {
        linha[i_esp] = br(novo, 2)
        linha[i_obs] = `Totalizador inicial: ${br(novo, 2)} L (alterado de ${br(antes, 2)} L em ${strftime(new Date(), '%d/%m/%Y %H:%M')} — ${motivo}; ${responsavel})`
      }
    }
    this._linha_evento('TOT. INICIAL ALTERADO', `Totalizador inicial ${antes !== null ? br(antes, 2) : '—'} → ${br(novo, 2)} L | motivo: ${motivo} | ${responsavel}`)
    if (recalcular) { this._recalcular_linhas(); this._recarregar_tabela() }
  }

  alterar_tot_inicial(novo: number, motivo: string, responsavel: string) {
    this.exclusoes.push({ data_hora: strftime(new Date(), '%d/%m/%Y %H:%M:%S'), responsavel, motivo, modo: 'alterar totalizador inicial', leituras: [], tot_inicial_antes: this.tot_inicial, tot_inicial_depois: novo })
    ;(this.cfg as unknown as Record<string, unknown>).ultimo_responsavel = responsavel
    this._trocar_tot_inicial(novo, motivo, responsavel)
    this._reescrever_csv()
    this._salvar_estado()
    if (this.estado === 'parado' && this.pastaRel && this.linhas.length) void this.exportar_excel(true)
    this._atualizar_contadores_tela()
  }

  async excluir_dialogo() {
    if (!this.linhas.length) {
      await messagebox.showinfo('Excluir leituras', "Não há leituras de ensaio na tabela.\nPara mexer num ensaio salvo, abra-o antes com '↻ Continuar ensaio…'.")
      return
    }
    if (this.estado === 'rodando' && this.cron.ativo()) {
      await messagebox.showinfo('Excluir leituras', 'Pause o ensaio (⏸ Pausar) antes de excluir leituras ou alterar o totalizador inicial.')
      return
    }
    this.janela.set({ tipo: 'excluir' })
  }

  /** Mensagem e próximo passo depois de excluir (continuar o ensaio / conferir o totalizador). */
  async _depois_de_excluir(r: ReturnType<VigiaApp['excluir_leituras']>, tot_novo = false) {
    if (!r) return
    const onde = r.onde || ''
    if (this.estado === 'parado') {
      if (this.pastaRel && await messagebox.askyesno('Leituras excluídas', `${r.excluidas.length} leitura(s) excluída(s).` + (onde ? `\nRefazer a partir de: ${onde}` : '') + '\n\nContinuar este ensaio agora?')) {
        await this.continuar_ensaio(this.pastaRel, !tot_novo)
      }
      return
    }
    if (this.tot_inicial !== null && !tot_novo && r.excluidas.length) {
      // a bomba já dispensou os abastecimentos excluídos: totalizador atual como retomada (desconta a diferença)
      const t = await this._dialogo_totalizador('Retomada')
      if (t) { this._registrar_totalizador('Retomada', t[1], this.n_leitura); this._reescrever_csv() }
    }
    this._set_status(r.pos ? 'AGUARDANDO' : this.estado === 'pausado' ? 'PAUSADO' : 'EM ENSAIO', COR_AVISO,
      `${r.excluidas.length} leitura(s) excluída(s). ` + (onde ? `Ajuste o gerador em ${onde} e clique em 'Iniciar próximo segmento'` + (this.estado === 'pausado' ? ' depois de retomar.' : '.') : ''))
  }

  // ------------------------------------------------------------------ trazer leituras e totalizadores de outro ensaio
  /** Traz para o ensaio atual as leituras de outro ensaio salvo, dos segmentos escolhidos (rótulos), com os
   *  totalizadores daquele ensaio (para o Registro). Não entram no acumulado/totalizador do ensaio atual. */
  importar_leituras_de_ensaio(est: Record<string, unknown>, rel: string, segmentos: Set<string>): [number, Record<string, number>] {
    const [ls, totais] = leiturasETotais(est, 'resultados/' + rel)
    const origem = String(est.nome || rel.split('/').pop())
    const cols = this._colunas()
    const campos = this.campos_ensaio.length ? this.campos_ensaio : this.campos
    const cv = this._campo_volume(campos)
    const ultima: Record<string, number> = {}
    let n = 0
    for (const l of ls) {
      if (!segmentos.has(String(l.segmento)) || l.volume === null || l.volume === undefined) continue
      this.leituras_reg.push({ ...l, importada: true, origem })
      n += 1
      if (l.freq) ultima[String(l.segmento)] = Math.max(ultima[String(l.segmento)] ?? 0, l.freq)
      let linha: Linha = ['imp', l.hora ?? '', '', ...campos.map(() => ''), ...Array(9).fill('')]
      if (cols.includes(cv)) linha[cols.indexOf(cv)] = br(l.volume, 3)
      linha[cols.indexOf('Erro [% L]')] = fmtErro(l.erro ?? null)
      linha[cols.indexOf('Status')] = 'IMPORTADA'
      linha[cols.indexOf('Segmento')] = l.segmento ?? ''
      linha[cols.indexOf('Freq. atual')] = l.freq ? fmtFreq(l.freq) : '—'
      linha[cols.indexOf('Observação')] = `leitura #${l.n} de ${l.data ?? ''} do ensaio '${origem}' (${l.status ?? ''}) — não entra no totalizador deste ensaio`
      linha = [...linha.slice(0, cols.length), '']
      this.linhas.push(linha)
      this._csv_acrescentar(linha)
      this.treeInsert(linha.slice(0, cols.length), 'tot')
    }
    for (const [k, regs] of Object.entries(totais)) {  // totalizadores do outro ensaio (inicial, parciais, final) → Registro
      if (this.leituras_reg.some(x => x.ensaio === k && x.importada)) this.tot_importados[k] = regs
    }
    if (n) {
      this._linha_evento('LEITURAS IMPORTADAS', `${n} leitura(s) do ensaio '${origem}' (${[...segmentos].sort().join(', ')}) com os totalizadores dele`)
      this._salvar_estado()
    }
    return [n, ultima]
  }

  async dialogo_trazer_leituras(i_seg: number) {
    const itens = await this._ensaios_incompletos().catch(() => [])
    const rel = await simpledialog.askstring('Trazer leituras', 'Pasta do ensaio com as leituras já feitas (dentro de resultados):\n'
      + (itens.length ? 'Ensaios salvos: ' + itens.slice(0, 8).map(x => x.rel).join(', ') : ''), itens[0]?.rel ?? '')
    if (!rel) return
    const est = await this._ler_estado(rel.trim())
    if (!est) { await messagebox.showerror('Trazer leituras', `Não foi possível ler o ensaio:\n${rel}`); return }
    const grupos: Record<string, LeituraReg[]> = {}
    for (const l of (est.leituras_reg as LeituraReg[] | undefined) ?? []) {
      if (l.volume !== null && l.volume !== undefined) (grupos[String(l.segmento ?? '')] ??= []).push(l)
    }
    if (!Object.keys(grupos).length) { await messagebox.showinfo('Trazer leituras', 'Esse ensaio não tem leituras.'); return }
    await new Promise<void>(r => this.janela.set({ tipo: 'trazer', i_seg, est, rel: rel.trim(), grupos, resolver: () => { this.janela.set({ tipo: 'escolher' }); r() } }))
  }

  async trazer_ok(i_seg: number, est: Record<string, unknown>, rel: string, sel: string[]) {
    const alvo = i_seg >= 0 && i_seg < this.cron.segmentos.length ? rotulo(this.cron.segmentos[i_seg]) : ''
    const [n, ultima] = this.importar_leituras_de_ensaio(est, rel, new Set(sel))
    const msg = `${n} leitura(s) trazida(s).`
    if (alvo in ultima && await messagebox.askyesno('Trazer leituras', msg + `\n\nContinuar "${alvo}" a partir da frequência seguinte à última trazida (${fmtFreq(ultima[alvo])})?`)) {
      this.continuar_segmento_apos(i_seg, ultima[alvo])
    } else if (n) {
      await messagebox.showinfo('Trazer leituras', msg)
    }
  }

  fechar() {
    if (this.estado !== 'parado') {
      // fechar com o ensaio em andamento: grava o estado como interrompido (continua ao reabrir)
      this._fechando = true
      void this.parar_ensaio(false)
    }
    super.fechar()
  }
}

export { COR_OK, COR_FALHA, COR_NEUTRO, COR_AVISO }
