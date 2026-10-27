// VIGIA-7S no app — a classe App de vigia7s/app.py (estado e ações das telas), no navegador.
// Os nomes dos métodos e das variáveis seguem o Python para facilitar a conferência lado a lado.
'use client'
import {
  campoDe, celulasAbs, ajustarRoi, paraCelula, fatorK, ehManual, formatar, legivel,
  type CampoDisplay, type ResultadoCampo,
} from '@/lib/vigia/seg7'
import { CFG_PADRAO, FILTROS_PADRAO, carregarConfig, type ConfigVigia, type ConfigCamera } from '@/lib/vigia/config'
import {
  frequencias, fmtTempo, fmtFreq, duracao, tempoPasso, expandir, chaveSegmento, segmentoDe, type Segmento,
} from '@/lib/vigia/emc'
import { DetectorCiclo, resumirCiclos, desvioPadrao, type Ciclo } from '@/lib/vigia/ciclo'
import { Alarme, Voz } from '@/lib/vigia/alarme'
import { CameraWeb, listarCameras, resolverFonte } from '@/lib/vigia/camera-web'
import { ordenarCantos } from '@/lib/vigia/camera-proc'
import { desenharCampos, desenharPerspectiva, imagemDebug, Visor } from '@/lib/vigia/desenho'
import { br, num, pyRoundN, fixo, offsetInteiro, cicloComOffset } from '@/lib/vigia/util'
import { Var, rotulo, messagebox, simpledialog, fmtG } from '@/lib/vigia/tk'
import type { PedidoWorker, RespostaWorker } from '@/lib/vigia/vigia.worker'

export const NOME_APP = 'VIGIA-7S'
export const DESCRICAO_APP = 'verificação de displays de 7 segmentos em tempo real'
export const COR_OK = '#1e8e3e'
export const COR_FALHA = '#d93025'
export const COR_NEUTRO = '#5f6368'
export const COR_AVISO = '#e37400'

type Tipo = 'str' | 'int' | 'float' | 'combo' | 'bool'
export const ESPECS: [keyof CampoDisplay, string, Tipo, [number, number] | string[] | null][] = [
  ['nome', 'Nome', 'str', null],
  ['digitos', 'Nº de dígitos', 'int', [1, 12]],
  ['decimais', 'Casas decimais', 'int', [0, 6]],
  ['largura_digito', 'Larg. dígito (0–1)', 'float', [0.3, 1.0]],
  ['inclinacao', 'Inclinação (°)', 'float', [-25, 25]],
  ['espessura', 'Espessura seg.', 'float', [0.05, 0.35]],
  ['limiar_segmento', 'Limiar seg. (0–1)', 'float', [0.05, 0.95]],
  ['binarizacao', 'Binarização', 'combo', ['otsu', 'adaptativa', 'fixa']],
  ['limiar_fixo', 'Limiar fixo', 'int', [0, 255]],
  ['dilatar', 'Dilatar', 'int', [0, 5]],
  ['inverter', 'LCD (dígito escuro)', 'bool', null],
]
const FLOATS = new Set(['largura_digito', 'inclinacao', 'espessura', 'limiar_segmento', 'esperado', 'tolerancia'])

export type ChaveFiltro = 'media_n' | 'mediana' | 'desfoque' | 'contraste' | 'brilho' | 'nitidez'

type QuadroBgr = { largura: number; altura: number; dados: ArrayBuffer }

/** Fala com o worker do OpenCV que trata os quadros (média temporal, perspectiva, zoom, filtros) e lê para a tela. */
class Processador {
  worker: Worker
  ocupado = false     // leitura para a tela em andamento (uma por vez)
  emVoo = 0           // quadros do amostrador em processamento
  erro = new Var('')
  private id = 0
  aoResultado: ((r: Extract<RespostaWorker, { tipo: 'resultado' }>) => void) | null = null
  /** quadro tratado (BGR) para o amostrador */
  aoBgr: ((bgr: QuadroBgr, t: number) => void) | null = null

  /** pronto: versão do OpenCV quando carregado */
  constructor(public pronto: Var<string | null>) {
    this.worker = new Worker(new URL('./vigia.worker.ts', import.meta.url))
    this.worker.onmessage = (ev: MessageEvent<RespostaWorker>) => {
      const m = ev.data
      if (m.tipo === 'pronto') { this.pronto.set(m.versao); return }
      if (m.tipo === 'erro') {
        this.erro.set(m.msg)
        if (m.id !== undefined) { if (m.id < 0) this.emVoo--; else this.ocupado = false }
        return
      }
      if (m.tipo === 'resultado') {
        if (m.id < 0) this.emVoo--
        else { this.ocupado = false; this.aoResultado?.(m) }
        if (m.bgr) this.aoBgr?.(m.bgr, m.t)
      }
    }
    this.worker.onerror = e => this.erro.set(e.message || 'Falha ao carregar o OpenCV')
    this.enviar({ tipo: 'iniciar' })
  }
  enviar(m: PedidoWorker, transf: Transferable[] = []) { this.worker.postMessage(m, transf) }
  /** leitura para a tela (com o quadro de volta); bgr: devolve também o quadro tratado ao amostrador */
  ler(img: ImageData, t: number, campos: CampoDisplay[], recortesDe: number | null, bgr = false) {
    this.ocupado = true
    const dados = img.data.buffer as ArrayBuffer
    this.enviar({ tipo: 'quadro', id: ++this.id, t, largura: img.width, altura: img.height, dados, campos, recortesDe, devolverQuadro: true, devolverBgr: bgr }, [dados])
  }
  /** só trata o quadro e devolve em BGR (amostrador) */
  tratar(img: ImageData, t: number) {
    this.emVoo++
    const dados = img.data.buffer as ArrayBuffer
    this.enviar({ tipo: 'quadro', id: -1, t, largura: img.width, altura: img.height, dados, campos: [], devolverBgr: true }, [dados])
  }
  acumular(img: ImageData, t: number) {
    const dados = img.data.buffer as ArrayBuffer
    this.enviar({ tipo: 'quadro', id: -1, t, largura: img.width, altura: img.height, dados, campos: [], soAcumular: true }, [dados])
  }
  fechar() { this.worker.terminate() }
}

/** _iniciar_amostrador(): lê o campo de volume em CADA quadro novo, com o instante de captura do quadro.
 *  O opencv.js é ~4× mais lento que o OpenCV nativo, então a leitura é repartida entre vários workers;
 *  as amostras saem na ordem dos quadros. Sem worker livre, o quadro é pulado (o Python também pula
 *  quadros quando a leitura demora mais que o intervalo entre eles). */
class Amostrador {
  private pool: { w: Worker; livre: boolean }[] = []
  private seq = 0
  private prox = 0
  private prontos = new Map<number, [number, number | null]>()
  aoAmostra: ((t: number, valor: number | null) => void) | null = null

  constructor(n: number) {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./vigia.worker.ts', import.meta.url))
      const item = { w, livre: false }
      w.onmessage = (ev: MessageEvent<RespostaWorker>) => {
        const m = ev.data
        if (m.tipo === 'pronto') { item.livre = true; return }
        if (m.tipo === 'lido') { item.livre = true; this.chegou(m.seq, m.t, Object.values(m.valores)[0] ?? null); return }
        if (m.tipo === 'erro' && m.id !== undefined) { item.livre = true; this.chegou(m.id, NaN, null) }
      }
      w.postMessage({ tipo: 'iniciar' } satisfies PedidoWorker)
      this.pool.push(item)
    }
  }

  /** false = nenhum worker livre (quadro pulado) */
  ler(bgr: QuadroBgr, t: number, campo: CampoDisplay): boolean {
    const item = this.pool.find(p => p.livre)
    if (!item) return false
    item.livre = false
    item.w.postMessage({ tipo: 'ler', seq: this.seq++, t, largura: bgr.largura, altura: bgr.altura, dados: bgr.dados, campos: [campo] } satisfies PedidoWorker, [bgr.dados])
    return true
  }

  private chegou(seq: number, t: number, valor: number | null) {
    this.prontos.set(seq, [t, valor])
    while (this.prontos.has(this.prox)) {
      const [tt, v] = this.prontos.get(this.prox)!
      this.prontos.delete(this.prox++)
      if (!Number.isNaN(tt)) this.aoAmostra?.(tt, v)
    }
  }

  fechar() { this.pool.forEach(p => p.w.terminate()); this.pool = [] }
}

export class App {
  cfg: ConfigVigia = carregarConfig(null)
  campos: CampoDisplay[] = []
  perfis: Record<string, Segmento[]> = {}
  pastaDados = ''
  origemVigia = { pasta: '', existe: false }
  carregado = new Var(false)
  /** muda sempre que a lista de campos (ou um campo) muda: redesenha a lista */
  versaoCampos = new Var(0)

  camera = new CameraWeb()
  proc: Processador | null = null
  amostrador: Amostrador | null = null
  _amostras: [number, number | null][] = []
  alarme = new Alarme()
  voz = new Voz()   // frases faladas (avisos por voz)
  campos_ensaio: CampoDisplay[] = []
  medicao: Medicao | null = null       // medição do ciclo da bomba em andamento
  ciclo_medido: CicloMedido | null = null
  /** nomes dos campos (combos de consistência e totalizador) */
  nomesCampos = new Var<string[]>([])
  versaoLayout = new Var(0)

  // --- aba Tempo, validação e alarme
  v_ens: Record<string, Var<string>> = {}
  v_modo_leit = new Var<'congelado' | 'tempo'>('congelado')
  v_med_n = new Var('10')
  v_med_ref = new Var('auto')
  bt_medir = new Var('▶ Medir ciclo')
  bt_med_aplicar = new Var(false)   // habilitado?
  bt_dwell = new Var(false)
  lbl_med_media = rotulo('Tempo médio do ciclo: —', '#1a73e8')
  lbl_ciclo_off = rotulo('', '#1a73e8')
  lbl_med = rotulo("Com a bomba ciclando e o campo Litros calibrado, digite o valor congelado (ex.: 4) e clique em 'Medir ciclo'. O 1º ciclo é sempre descartado.")
  v_disparo = new Var(true)
  v_parar_n = new Var(true)
  v_pausa_aguard = new Var(false)
  v_confirmar = new Var(true)
  v_confirmar_s = new Var('3')
  v_cons_on = new Var(false)
  v_cons_vol = new Var('')
  v_cons_pre = new Var('')
  v_cons_tot = new Var('')
  v_cons_tol = new Var('')
  v_al_on = new Var(true)
  v_al_freq = new Var('2500')
  v_al_dur = new Var('400')
  v_al_cont = new Var(true)
  v_al_seg = new Var(true)
  v_al_modo = new Var('bipe e voz')
  v_al_falta = new Var('3')
  v_al_trav = new Var('30')
  v_tot_campo = new Var('')
  v_tot_tol = new Var('')
  v_tot_ini = new Var(true)
  v_tot_fim = new Var(true)
  v_img_falha = new Var(true)
  v_img_todas = new Var(false)
  cvPronto = new Var<string | null>(null)
  estado: 'parado' | 'rodando' | 'pausado' = 'parado'

  nb = new Var(0)          // aba principal
  nbCam = new Var(0)       // Câmera | Filtros (imagem de TV)

  // --- calibração: câmera
  v_fonte = new Var('auto')
  cb_fonte_valores = new Var<string[]>([])
  v_larg = new Var('1280')
  v_alt = new Var('720')
  v_fps = new Var('60')
  v_af = new Var(false)
  v_foco = new Var(30)
  v_ae = new Var(true)
  v_exp = new Var(-6)
  v_zoom = new Var(100)
  v_zdig = new Var(1.0)
  v_dx = new Var(0.0)
  v_dy = new Var(0.0)
  v_fil: Record<ChaveFiltro, Var<number>> = {
    media_n: new Var(1), mediana: new Var(0), desfoque: new Var(0), contraste: new Var(1.0), brilho: new Var(0), nitidez: new Var(0),
  }
  v_clahe = new Var(false)
  persp_pts: number[][] = []
  _persp_coletando: number[][] | null = null
  arquivo: File | null = null
  lbl_cam = rotulo('', COR_FALHA)
  lbl_fps = rotulo('', COR_NEUTRO)
  lbl_persp = rotulo('', COR_NEUTRO)

  // --- calibração: campos
  campo_sel = 0
  cel_sel: number | null = null
  v_modo = new Var<'area' | 'digitos'>('area')
  v_campo: Record<string, Var<string | boolean>> = {}
  lst_sel = new Var(0)
  lbl_live = rotulo('—')
  lbl_dica = rotulo('', COR_NEUTRO)
  dbg = new Var<HTMLCanvasElement | null>(null)
  _carregando_campo = false
  _edicao: { j: number; tipo: string; ini: [number, number]; orig: number[] } | null = null
  _arrasto: [number, number] | null = null
  _ret: [number, number, number, number] | null = null
  _enq_ant: string | null = null

  // --- imagem
  visor_cal = new Visor()
  visor_ensaio = new Visor()
  canvasCal: HTMLCanvasElement | null = null
  canvasEnsaio: HTMLCanvasElement | null = null
  ult_res_live: Record<string, ResultadoCampo> = {}
  ult_quadro: ImageData | null = null
  private quadroCanvas: OffscreenCanvas | null = null
  private _tick_n = 0
  private _timer: ReturnType<typeof setInterval> | null = null
  private _ultLeitura = 0
  private _salvarCfgTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    for (const [attr, , tipo] of ESPECS) {
      const v = new Var<string | boolean>(tipo === 'bool' ? false : '')
      v.trace(() => this._campo_alterado(attr, tipo))
      this.v_campo[attr] = v
    }
    for (const [attr, tipo] of [['validar', 'bool'], ['esperado', 'float'], ['tolerancia', 'float']] as const) {
      const v = new Var<string | boolean>(tipo === 'bool' ? false : '')
      v.trace(() => this._campo_alterado(attr, tipo))
      this.v_campo[attr] = v
    }
  }

  // ------------------------------------------------------------------ ciclo de vida
  async iniciar() {
    const r = await fetch('/api/vigia', { cache: 'no-store' }).then(x => x.json())
    this.cfg = carregarConfig(r.config)
    this.perfis = r.perfis
    this.pastaDados = r.pasta
    this.origemVigia = r.origem
    this.campos = this.cfg.campos.map(c => campoDe(c))
    if (!(this.cfg.perfil in this.perfis) && Object.keys(this.perfis).length) this.cfg.perfil = Object.keys(this.perfis)[0]
    this._montar_calibracao()
    this._montar_config()
    this._montar_emc()
    this.proc = new Processador(this.cvPronto)
    this.proc.aoResultado = m => this._resultado(m)
    this.proc.aoBgr = (bgr, t) => this._amostrar(bgr, t)
    this.camera.aoQuadro = t => this._quadro_camera(t)
    this.carregado.set(true)
    void this.conectar_camera()
    this._timer = setInterval(() => this.tick(), 40)
  }

  fechar() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
    this.camera.fechar()
    this.proc?.fechar()
    this.proc = null
    this.amostrador?.fechar()
    this.amostrador = null
    this.alarme.parar()
    this.voz.fechar()
    // só grava o que foi carregado (nunca a config padrão por cima da salva)
    if (this.carregado.get()) void this.salvar_cfg()
    this.carregado.set(false)
  }

  get layout(): Record<string, unknown> {
    if (!this.cfg.layout || typeof this.cfg.layout !== 'object') this.cfg.layout = {}
    return this.cfg.layout
  }

  // ------------------------------------------------------------------ config
  _ler_form_ensaio() {
    if (!Object.keys(this.v_ens).length) return
    const e = this.cfg.ensaio as unknown as Record<string, unknown>
    for (const [k, v] of Object.entries(this.v_ens)) {
      const x = num(v.get(), e[k] as number)!
      e[k] = ['n_abastecimentos', 'quadros', 'parar_erros_n'].includes(k) ? Math.trunc(x) : x
    }
    const en = this.cfg.ensaio
    en.modo_leitura = this.v_modo_leit.get()
    en.ciclo_ref = this.v_med_ref.get().trim() || 'auto'
    en.disparo_saida = this.v_disparo.get()
    en.congelado_s = Math.max(0.3, en.congelado_s)
    en.intervalo_s = Math.max(2.0, en.intervalo_s)
    en.quadros = Math.max(1, en.quadros)
    en.n_abastecimentos = Math.max(1, en.n_abastecimentos)
    en.parar_ao_atingir = this.v_parar_n.get()
    en.pausar_leituras_aguardando = this.v_pausa_aguard.get()
    en.confirmar_falha = this.v_confirmar.get()
    en.confirmar_apos_s = Math.max(0.0, num(this.v_confirmar_s.get(), 3.0)!)
    Object.assign(this.cfg.consistencia, {
      ativo: this.v_cons_on.get(), volume: this.v_cons_vol.get(), preco: this.v_cons_pre.get(), total: this.v_cons_tot.get(),
      tol: num(this.v_cons_tol.get(), 0.01),
    })
    Object.assign(this.cfg.alarme, {
      ativo: this.v_al_on.get(), freq_hz: Math.trunc(num(this.v_al_freq.get(), 2500)!), dur_ms: Math.trunc(num(this.v_al_dur.get(), 400)!),
      continuo: this.v_al_cont.get(), aviso_segmento: this.v_al_seg.get(),
      modo_aviso: this.v_al_modo.get() || 'bipe e voz', avisar_faltando: Math.max(0, Math.trunc(num(this.v_al_falta.get(), 3)!)),
      travado_aviso_s: Math.max(0.0, num(this.v_al_trav.get(), 30.0)!),
    })
    Object.assign(this.cfg.imagens, { salvar_falhas: this.v_img_falha.get(), salvar_todas: this.v_img_todas.get() })
    Object.assign(this.cfg.totalizador, {
      campo: this.v_tot_campo.get(), tol: Math.max(0.0, num(this.v_tot_tol.get(), 0.05)!),
      pedir_inicial: this.v_tot_ini.get(), pedir_final: this.v_tot_fim.get(),
    })
    this._cfg_cam_form()
  }

  async salvar_cfg() {
    this._ler_form_ensaio()
    this._cfg_cam_form()
    this.cfg.campos = this.campos.map(c => ({ ...c, roi: [...c.roi], celulas_manuais: c.celulas_manuais.map(x => [...x]) })) as CampoDisplay[]
    await fetch('/api/vigia', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: this.cfg }), keepalive: true })
  }

  /** layout (divisórias) é salvo sozinho, como o Python faz ao fechar */
  salvarLayoutDepois() {
    if (this._salvarCfgTimer) clearTimeout(this._salvarCfgTimer)
    this._salvarCfgTimer = setTimeout(() => void this.salvar_cfg(), 1500)
  }

  async importar_vigia() {
    const r = await fetch('/api/vigia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'importar' }) })
    const j = await r.json()
    if (!r.ok) { await messagebox.showerror('Importar do VIGIA-7S', j.error); return false }
    await messagebox.showinfo('Importar do VIGIA-7S', `Calibração${j.perfis ? ' e perfis EMC' : ''} copiados de:\n${j.pasta}\n\n(o VIGIA-7S original não foi alterado)`)
    return true
  }

  // ================================================================== ABA CALIBRAÇÃO
  _montar_calibracao() {
    const cc = this.cfg.camera
    this.v_fonte.set(String(cc.fonte))
    this.v_larg.set(String(cc.largura))
    this.v_alt.set(String(cc.altura))
    this.v_af.set(!!cc.autofoco)
    this.v_foco.set(Number(cc.foco))
    this.v_ae.set(!!cc.auto_exposicao)
    this.v_exp.set(Number(cc.exposicao))
    this.v_zoom.set(Number(cc.zoom))
    this.v_zdig.set(Number(cc.zoom_digital))
    this.v_dx.set(Number(cc.desloc_x))
    this.v_dy.set(Number(cc.desloc_y))
    this.v_fps.set(String(cc.fps ?? 60))
    const ft = { ...FILTROS_PADRAO, ...(cc.filtros ?? {}) }
    for (const k of Object.keys(this.v_fil) as ChaveFiltro[]) this.v_fil[k].set(Number(ft[k]))
    this.v_clahe.set(!!ft.clahe)
    this.persp_pts = [...(ft.perspectiva ?? [])]
    this._persp_coletando = null
    this._carregando_campo = false
    this._recarregar_lista()
  }

  async _escolher_arquivo(f: File | null) {
    if (f) {
      this.arquivo = f
      this.v_fonte.set(f.name)
      await this.conectar_camera()
    }
  }

  _cfg_cam_form(): ConfigCamera {
    const cc = this.cfg.camera
    Object.assign(cc, {
      fonte: this.v_fonte.get().trim(), largura: Math.trunc(num(this.v_larg.get(), 1280)!),
      altura: Math.trunc(num(this.v_alt.get(), 720)!), fps: Math.trunc(num(this.v_fps.get(), 60)!),
      autofoco: this.v_af.get(), foco: Math.trunc(this.v_foco.get()),
      auto_exposicao: this.v_ae.get(), exposicao: Math.trunc(this.v_exp.get()),
      zoom: Math.trunc(this.v_zoom.get()), zoom_digital: pyRoundN(this.v_zdig.get(), 2),
      desloc_x: pyRoundN(this.v_dx.get(), 2), desloc_y: pyRoundN(this.v_dy.get(), 2),
    })
    const f: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(this.v_fil)) f[k] = pyRoundN(v.get(), 2)
    for (const k of ['media_n', 'mediana', 'desfoque']) f[k] = Math.trunc(f[k] as number)
    f.clahe = this.v_clahe.get()
    f.perspectiva = this.persp_pts.map(([x, y]) => [pyRoundN(x, 1), pyRoundN(y, 1)])
    cc.filtros = f as unknown as ConfigCamera['filtros']
    return cc
  }

  // ------------------------------------------------------------------ filtros / perspectiva
  /** Ponto de partida para filmar uma TV: tira cintilação, moiré e linhas de varredura. */
  _filtros_tv() {
    // média + mediana tiram ruído/cintilação sem realçá-los; CLAHE/nitidez só se faltar contraste
    for (const [k, v] of Object.entries({ media_n: 4, mediana: 5, desfoque: 0, contraste: 1.0, brilho: 0, nitidez: 0 })) this.v_fil[k as ChaveFiltro].set(v)
    this.v_clahe.set(false)
    this._aplicar_cam()
  }

  _filtros_zerar() {
    for (const [k, v] of Object.entries({ media_n: 1, mediana: 0, desfoque: 0, contraste: 1.0, brilho: 0, nitidez: 0 })) this.v_fil[k as ChaveFiltro].set(v)
    this.v_clahe.set(false)
    this._aplicar_cam()
  }

  _persp_iniciar() {
    this._persp_coletando = []
    this._bruto(true)   // mostra a imagem original para clicar os cantos
    this.nb.set(1)
    this.canvasCal?.focus()
  }

  _persp_remover() {
    this._persp_coletando = null
    this._bruto(false)
    this.persp_pts = []
    this._aplicar_cam()
  }

  _persp_clique(px: number, py: number) {
    this._persp_coletando!.push([px, py])
    if (this._persp_coletando!.length === 4) {
      this.persp_pts = ordenarCantos(this._persp_coletando!).map(p => p.map(Number))
      this._persp_coletando = null
      this._bruto(false)
      this._aplicar_cam()
    }
  }

  private _bruto(b: boolean) {
    this.proc?.enviar({ tipo: 'camera', cfg: this.cfg.camera as unknown as Record<string, unknown>, bruto: b })
    this._brutoAtivo = b
  }
  private _brutoAtivo = false

  _zoom_reset() {
    this.v_zoom.set(100)
    this.v_zdig.set(1.0)
    this.v_dx.set(0.0)
    this.v_dy.set(0.0)
    this._aplicar_cam()
  }

  private _enq(cc: ConfigCamera) {
    return JSON.stringify([cc.zoom, cc.zoom_digital, cc.desloc_x, cc.desloc_y, String(cc.filtros.perspectiva)])
  }

  async conectar_camera() {
    const cc = this._cfg_cam_form()
    let texto: string, cam = null
    const arquivo = this.arquivo && this.arquivo.name === cc.fonte ? this.arquivo : null
    if (arquivo) texto = cc.fonte
    else [texto, cam] = await resolverFonte(cc.fonte)
    this.v_fonte.set(texto)
    cc.fonte = texto
    const ok = await this.camera.abrir(cc, cam, arquivo)
    this.lbl_cam.set({ text: ok ? '' : this.camera.erro, foreground: COR_FALHA })
    this._enq_ant = this._enq(cc)
    this._bruto(this._brutoAtivo)
  }

  async _procurar_cameras() {
    const cams = await listarCameras()
    this.cb_fonte_valores.set(cams.map(c => `${c.indice} - ${c.nome}`))
    if (!cams.length) await messagebox.showwarning('Câmeras', 'Nenhuma câmera encontrada. Verifique o cabo USB.')
    else this.lbl_cam.set({ text: `${cams.length} câmera(s) encontrada(s) — escolha na lista acima.`, foreground: COR_OK })
  }

  _aplicar_cam() {
    const cc = this._cfg_cam_form()
    const enq = this._enq(cc)
    if ((this._enq_ant ?? enq) !== enq) {
      this.lbl_cam.set({ text: 'Zoom/enquadramento mudou: confira (ou marque de novo) as áreas dos campos.', foreground: COR_AVISO })
    }
    this._enq_ant = enq
    void this.camera.aplicar(cc)
    this._bruto(this._brutoAtivo)
  }

  async _salvar_foto() {
    const f = this.ult_quadro
    if (!f) return
    const c = document.createElement('canvas')
    c.width = f.width; c.height = f.height
    c.getContext('2d')!.putImageData(f, 0, 0)
    const png = c.toDataURL('image/png').split(',')[1]
    const d = new Date(), p2 = (n: number) => String(n).padStart(2, '0')
    const nome = `foto_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.png`
    const r = await fetch('/api/vigia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'foto', nome, png }) })
    const j = await r.json()
    if (r.ok) await messagebox.showinfo('Foto', `Foto salva em:\n${j.caminho}`)
    else await messagebox.showerror('Foto', j.error)
  }

  // ------------------------------------------------------------------ campos
  rotuloCampo = (c: CampoDisplay) => `${c.nome}   (${c.digitos} díg., ${c.decimais} dec.)`

  _recarregar_lista() {
    if (this.campos.length) {
      this.campo_sel = Math.min(this.campo_sel, this.campos.length - 1)
      this.lst_sel.set(this.campo_sel)
      this._carregar_campo()
    }
    this.versaoCampos.set(this.versaoCampos.get() + 1)
  }

  _selecionar_campo(i: number) {
    this.campo_sel = i
    this.lst_sel.set(i)
    this.cel_sel = null
    if (this.v_modo.get() === 'digitos') this._garantir_manual(this.campos[this.campo_sel])
    this._carregar_campo()
  }

  _carregar_campo() {
    if (!this.campos.length) return
    const c = this.campos[this.campo_sel] as unknown as Record<string, unknown>
    this._carregando_campo = true
    for (const [attr, v] of Object.entries(this.v_campo)) {
      const val = c[attr]
      if (typeof v.get() === 'boolean') v.set(!!val)
      else if (FLOATS.has(attr) && typeof val === 'number') v.set(fmtG(val))
      else v.set(String(val))
    }
    this._carregando_campo = false
  }

  _campo_alterado(attr: string, tipo: Tipo) {
    if (this._carregando_campo || !this.campos.length) return
    const c = this.campos[this.campo_sel]
    const cr = c as unknown as Record<string, unknown>
    const v = this.v_campo[attr]
    let val: unknown
    if (tipo === 'bool') val = !!v.get()
    else if (tipo === 'int') val = Math.trunc(num(v.get(), cr[attr] as number)!)
    else if (tipo === 'float') val = num(v.get(), cr[attr] as number)
    else val = v.get()
    if (attr === 'nome') {
      if (this.estado !== 'parado') return
      val = String(val).trim() || c.nome
    }
    cr[attr] = val
    if (attr === 'digitos' && c.celulas_manuais.length && c.celulas_manuais.length !== c.digitos) {
      c.celulas_manuais = []  // nº de dígitos mudou: redistribui na área atual
      this.cel_sel = null
      if (this.v_modo.get() === 'digitos') this._garantir_manual(c)
    }
    if (attr === 'inclinacao') ajustarRoi(c)
    if (attr === 'nome' || attr === 'digitos' || attr === 'decimais') {
      this.versaoCampos.set(this.versaoCampos.get() + 1)
      if (attr === 'nome' && this.estado === 'parado') {
        this._configurar_colunas()
        this._atualizar_combos_consistencia()
      }
    }
  }

  _configurar_colunas() { /* tabela da aba Ensaio (próxima etapa) */ }
  _atualizar_combos_consistencia() { this.nomesCampos.set(this.campos.map(c => c.nome)) }

  async _add_campo() {
    if (this.estado !== 'parado') { await messagebox.showwarning('Campos', 'Pare o ensaio para alterar os campos.'); return }
    const nome = await simpledialog.askstring('Novo campo', 'Nome do campo (ex.: Litros, Total R$, Preço/L):')
    if (!nome) return
    if (this.campos.some(c => c.nome === nome)) { await messagebox.showwarning('Campos', 'Já existe um campo com esse nome.'); return }
    const [w, h] = this.camera.resolucao()
    this.campos.push(campoDe({ nome, roi: w ? [Math.trunc(w / 4), Math.trunc(h / 3), Math.trunc(w / 3), Math.trunc(h / 7)] : [50, 50, 300, 100] }))
    this.campo_sel = this.campos.length - 1
    this._recarregar_lista()
    this._configurar_colunas()
    this._atualizar_combos_consistencia()
  }

  async _rem_campo() {
    if (this.estado !== 'parado' || !this.campos.length) return
    const c = this.campos[this.campo_sel]
    if (await messagebox.askyesno('Remover', `Remover o campo '${c.nome}'?`)) {
      this.campos.splice(this.campo_sel, 1)
      this.campo_sel = Math.max(0, this.campo_sel - 1)
      this._recarregar_lista()
      this._configurar_colunas()
      this._atualizar_combos_consistencia()
    }
  }

  async _salvar_cfg_msg() {
    await this.salvar_cfg()
    await messagebox.showinfo('Configuração', 'Configuração salva.')
  }

  // ------------------------------------------------------------------ células dígito a dígito
  /** Converte a divisão automática em células individuais editáveis. */
  _garantir_manual(c: CampoDisplay) {
    if (!ehManual(c)) c.celulas_manuais = celulasAbs(c).map(cel => cel.map(v => pyRoundN(v, 1)))
  }

  _modo_digitos() {
    if (this.campos.length) {
      const c = this.campos[this.campo_sel]
      this._garantir_manual(c)
      this.cel_sel = c.celulas_manuais.length ? 0 : null
      this.canvasCal?.focus()
    }
  }

  _redistribuir() {
    if (!this.campos.length) return
    const c = this.campos[this.campo_sel]
    ajustarRoi(c)
    c.celulas_manuais = []
    if (this.v_modo.get() === 'digitos') this._garantir_manual(c)
  }

  async _igualar() {
    if (!this.campos.length) return
    const c = this.campos[this.campo_sel]
    if (!ehManual(c) || this.cel_sel === null) {
      await messagebox.showinfo('Igualar', "No modo 'Dígito a dígito', clique no dígito que está do tamanho certo e depois em 'Igualar tamanhos'.")
      return
    }
    const [, y, w, h] = c.celulas_manuais[this.cel_sel]
    for (const cel of c.celulas_manuais) { cel[1] = y; cel[2] = w; cel[3] = h }
    ajustarRoi(c)
  }

  _alterar_celula(c: CampoDisplay, j: number, x: number, y: number, w: number, h: number) {
    c.celulas_manuais[j] = [pyRoundN(x, 1), pyRoundN(y, 1), pyRoundN(Math.max(4.0, w), 1), pyRoundN(Math.max(4.0, h), 1)]
    ajustarRoi(c)
  }

  /** true = tecla tratada ("break") */
  _tecla(e: { key: string; shiftKey: boolean }): boolean {
    if (this.v_modo.get() !== 'digitos' || !this.campos.length) return false
    const c = this.campos[this.campo_sel]
    if (!ehManual(c)) return false
    if (e.key === 'Tab') {
      this.cel_sel = this.cel_sel === null ? 0 : (this.cel_sel + 1) % c.celulas_manuais.length
      return true
    }
    const passos: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (!(e.key in passos) || this.cel_sel === null) return false
    const [dx, dy] = passos[e.key]
    const [x, y, w, h] = c.celulas_manuais[this.cel_sel]
    if (e.shiftKey) this._alterar_celula(c, this.cel_sel, x, y, w + dx, h + dy)   // Shift: muda o tamanho
    else this._alterar_celula(c, this.cel_sel, x + dx, y + dy, w, h)
    return true
  }

  /** [índice, bordas] da célula sob o ponto; bordas: combinação de l/r/t/b, ou 'm' (mover). */
  _celula_no_ponto(c: CampoDisplay, px: number, py: number): [number | null, string | null] {
    const cels = c.celulas_manuais
    const ordem = [...(this.cel_sel !== null && this.cel_sel < cels.length ? [this.cel_sel] : []), ...cels.map((_, i) => i)]
    for (const j of ordem) {
      const [u, v] = paraCelula(cels[j], fatorK(c), px, py)
      const w = cels[j][2], h = cels[j][3]
      const tol = Math.min(8 / this.visor_cal.escala, w / 4, h / 4)
      if (-tol <= u && u <= w + tol && -tol <= v && v <= h + tol) {
        const b = (u < tol ? 'l' : u > w - tol ? 'r' : '') + (v < tol ? 't' : v > h - tol ? 'b' : '')
        return [j, b || 'm']
      }
    }
    return [null, null]
  }

  // mouse -> ROI / células (coordenadas do canvas)
  _mouse_ini(ex: number, ey: number) {
    if (this._persp_coletando !== null) { this._persp_clique(...this.visor_cal.paraImagem(ex, ey)); return }
    if (!this.campos.length) return
    this.canvasCal?.focus()
    if (this.v_modo.get() === 'digitos') {
      const c = this.campos[this.campo_sel]
      this._garantir_manual(c)
      const [px, py] = this.visor_cal.paraImagem(ex, ey)
      const [j, tipo] = this._celula_no_ponto(c, px, py)
      this.cel_sel = j
      this._edicao = j === null ? null : { j, tipo: tipo!, ini: [px, py], orig: [...c.celulas_manuais[j]] }
      return
    }
    this._arrasto = [ex, ey]
    this._ret = [ex, ey, ex, ey]
  }

  _mouse_mov(ex: number, ey: number) {
    if (this._edicao) {
      const ed = this._edicao
      const c = this.campos[this.campo_sel]
      const [px, py] = this.visor_cal.paraImagem(ex, ey)
      const dx = px - ed.ini[0], dy = py - ed.ini[1]
      let [x, y, w, h] = ed.orig
      const t = ed.tipo, k = fatorK(c)
      if (t === 'm') { x += dx; y += dy }
      else {
        if (t.includes('l')) { x += dx; w -= dx }
        if (t.includes('r')) w += dx
        if (t.includes('t')) {
          const nh = Math.max(4.0, h - dy)
          ;[x, y, h] = [x + k * (nh - h) / 2, y + (h - nh), nh]   // mantém a base no lugar
        }
        if (t.includes('b')) {
          const nh = Math.max(4.0, h + dy)
          ;[x, h] = [x - k * (nh - h) / 2, nh]                     // mantém o topo no lugar
        }
      }
      this._alterar_celula(c, ed.j, x, y, w, h)
      return
    }
    if (this._arrasto && this._ret) this._ret = [this._arrasto[0], this._arrasto[1], ex, ey]
  }

  _mouse_fim(ex: number, ey: number) {
    this._edicao = null
    if (!this._arrasto) return
    const [x0, y0] = this.visor_cal.paraImagem(...this._arrasto)
    const [x1, y1] = this.visor_cal.paraImagem(ex, ey)
    this._arrasto = null
    this._ret = null
    const x = Math.trunc(Math.min(x0, x1)), y = Math.trunc(Math.min(y0, y1))
    const w = Math.trunc(Math.abs(x1 - x0)), h = Math.trunc(Math.abs(y1 - y0))
    if (w > 8 && h > 8) {
      const c = this.campos[this.campo_sel]
      c.roi = [Math.max(0, x), Math.max(0, y), w, h]
      c.celulas_manuais = []  // nova área: dígitos divididos igualmente de novo
      this.cel_sel = null
    }
  }

  // ================================================================== ABA CONFIG
  _montar_config() {
    const e = this.cfg.ensaio as unknown as Record<string, number | string | boolean>
    this.v_ens = {}
    this.v_modo_leit.set(this.cfg.ensaio.modo_leitura)
    for (const k of ['congelado_s', 'intervalo_min_s', 'travado_s']) this.v_ens[k] = new Var(fmtG(Number(e[k])))
    this.v_med_n.set('10')
    this.v_med_ref.set(String(e.ciclo_ref ?? 'auto'))
    this.v_ens.ciclo_offset_s = new Var(br(Number(e.ciclo_offset_s ?? 0.0), 3))
    this.v_ens.ciclo_offset_s.trace(() => this._mostrar_offset())
    for (const k of ['intervalo_s', 'n_abastecimentos', 'quadros', 'janela_s', 'concordancia', 'limite_erro_pct', 'erro_grave_pct', 'parar_erros_n', 'parar_erro_pct']) {
      this.v_ens[k] = new Var(fmtG(Number(e[k])))
    }
    this.v_disparo.set(e.disparo_saida !== false)
    this.v_parar_n.set(!!e.parar_ao_atingir)
    this.v_pausa_aguard.set(!!e.pausar_leituras_aguardando)
    this.v_confirmar.set(!!e.confirmar_falha)
    this.v_confirmar_s.set(fmtG(Number(e.confirmar_apos_s)))
    const cs = this.cfg.consistencia
    this.v_cons_on.set(!!cs.ativo)
    this.v_cons_vol.set(cs.volume); this.v_cons_pre.set(cs.preco); this.v_cons_tot.set(cs.total)
    this.v_cons_tol.set(fmtG(Number(cs.tol)))
    const a = this.cfg.alarme
    this.v_al_on.set(!!a.ativo)
    this.v_al_freq.set(String(a.freq_hz)); this.v_al_dur.set(String(a.dur_ms))
    this.v_al_cont.set(!!a.continuo); this.v_al_seg.set(!!a.aviso_segmento)
    this.v_al_modo.set(a.modo_aviso ?? 'bipe e voz')
    this.v_al_falta.set(String(a.avisar_faltando ?? 3))
    this.v_al_trav.set(fmtG(Number(a.travado_aviso_s ?? 30.0)))
    const tz = this.cfg.totalizador
    this.v_tot_campo.set(tz.campo); this.v_tot_tol.set(fmtG(Number(tz.tol)))
    this.v_tot_ini.set(!!tz.pedir_inicial); this.v_tot_fim.set(!!tz.pedir_final)
    const im = this.cfg.imagens
    this.v_img_falha.set(!!im.salvar_falhas); this.v_img_todas.set(!!im.salvar_todas)
    this._atualizar_combos_consistencia()
    this._mostrar_offset()
  }

  _testar_alarme() {
    this._ler_form_ensaio()
    const a = this.cfg.alarme
    this.alarme.disparar(a.freq_hz, a.dur_ms, false)
  }

  _testar_voz() {
    const ok = this.voz.falar('Teste de voz do VIGIA. Atenção: erro elevado, 1,3 por cento, em 1,074 gigahertz.')
    setTimeout(() => {
      if (!ok || !this.voz.nome_voz) {
        void messagebox.showwarning('Voz', 'A voz do Windows não respondeu neste PC (sem voz instalada ou PowerShell bloqueado). Use os avisos por bipe.')
      } else if (!this.voz.nome_voz.includes('pt-BR')) {
        void messagebox.showinfo('Voz', `Voz em uso: ${this.voz.nome_voz}. Não há voz em português instalada; instale 'Português (Brasil)' em Configurações > Hora e idioma > Fala.`)
      }
    }, 6000)
  }

  /** Volta divisórias e larguras de colunas de todas as telas ao padrão, na hora. */
  async _restaurar_layout() {
    if (!await messagebox.askyesno('Tamanhos das áreas', 'Voltar as divisórias e as larguras das colunas de todas as telas ao padrão?')) return
    for (const k of Object.keys(this.layout)) delete this.layout[k]   // só um novo arraste grava de novo
    this.versaoLayout.set(this.versaoLayout.get() + 1)
    await this.salvar_cfg()
  }

  // ------------------------------------------------------------------ medição do ciclo
  _estavel_s() { return Math.max(0.3, Math.min(1.0, Number(this.cfg.ensaio.congelado_s))) }

  /** Campo cujo valor (litros) é somado no totalizador.
   *  Se o configurado não existir, usa um campo com "litro" no nome ou, havendo um só campo, ele mesmo. */
  _campo_volume(campos?: CampoDisplay[]): string {
    const nomes = (campos ?? this.campos).map(c => c.nome)
    const cfg = this.cfg.totalizador.campo
    if (nomes.includes(cfg)) return cfg
    return nomes.find(n => n.toLowerCase().includes('litro')) ?? (nomes.length === 1 ? nomes[0] : cfg)
  }

  _campo_vol_obj(): CampoDisplay | null {
    const campos = this.estado !== 'parado' && this.campos_ensaio.length ? this.campos_ensaio : this.campos
    const nome = this._campo_volume(campos)
    return campos.find(c => c.nome === nome) ?? campos[0] ?? null
  }

  /** o amostrador roda durante a medição de ciclo e durante todo o ensaio */
  get amostrando() { return this.medicao !== null || this.estado !== 'parado' }

  _iniciar_amostrador() {
    if (this.amostrador) return
    const n = Math.min(6, Math.max(2, (navigator.hardwareConcurrency || 4) - 2))
    this.amostrador = new Amostrador(n)
    this.amostrador.aoAmostra = (t, v) => { if (this.amostrando) this._amostras.push([t, v]) }
  }

  private _amostrar(bgr: QuadroBgr, t: number) {
    const campo = this._campo_vol_obj()
    if (!this.amostrando || !this.amostrador || !campo) return
    this.amostrador.ler(bgr, t, campo)
  }

  async medir_ciclo() {
    if (this.medicao !== null) { await this._fim_medicao('Medição cancelada.', COR_NEUTRO); return }   // botão vira "Cancelar"
    const campo = this._campo_vol_obj()
    if (!campo) { await messagebox.showinfo('Ciclo', 'Calibre o campo de litros do display antes de medir o ciclo.'); return }
    this._ler_form_ensaio()
    const ref_txt = this.cfg.ensaio.ciclo_ref
    const ref = ref_txt.toLowerCase() === 'auto' ? null : num(ref_txt, null)
    const n = Math.max(1, Math.trunc(num(this.v_med_n.get(), 3)!))
    const log = `medicao_ciclo_${carimbo()}.csv`
    this.medicao = {
      det: new DetectorCiclo(ref, campo.decimais, this._estavel_s()), n, saidas: [], congs: [], t0: performance.now() / 1000,
      log, linhas: [], campo: campo.nome, ult_valor: null,
    }
    this.bt_medir.set('■ Cancelar')
    this.bt_med_aplicar.set(false)
    this.bt_dwell.set(false)
    this.lbl_med_media.set({ text: 'Tempo médio do ciclo: medindo…', foreground: COR_AVISO })
    this.lbl_med.set({ text: `Medindo pelo campo '${campo.nome}'…`, foreground: COR_AVISO })
    this._iniciar_amostrador()
  }

  async _fim_medicao(texto: string, cor: string) {
    const m = this.medicao
    this.medicao = null
    this.bt_medir.set('▶ Medir ciclo')
    if (m && m.linhas.length) {
      const csv = [['t (s)', `valor lido (${m.campo})`, 'estado', 'evento'], ...m.linhas].map(l => l.join(';')).join('\r\n') + '\r\n'
      if (await salvarTexto(m.log, '﻿' + csv)) texto += `\nLog quadro a quadro: ${m.log} (pasta resultados)`
    }
    this.lbl_med.set({ text: texto, foreground: cor })
  }

  _medicao_passo(t: number, valor: number | null) {
    const m = this.medicao!
    const det = m.det
    const ev = det.passo(t, valor)
    let evento = ''
    if (ev) {
      const [tipo, x] = ev
      if (tipo === 'ref') evento = `referência = ${fmtG(x)}`
      else if (tipo === 'saida') { m.saidas.push(x); evento = `SAÍDA (${m.saidas.length}) em t=${fixo(x - m.t0, 3)}` }
      else if (tipo === 'chegada') { if (m.saidas.length) m.congs.push(x); evento = `chegou na referência em t=${fixo(x - m.t0, 3)}` }
    }
    m.ult_valor = valor
    m.linhas.push([fixo(t - m.t0, 3).replace('.', ','), valor === null ? '' : fmtG(valor).replace('.', ','), det.estado, evento])
    const s = m.saidas
    if (s.length >= m.n + 2) {  // n ciclos válidos + o 1º, que é sempre descartado
      const [ciclos, per, ench, cong] = resumirCiclos(s.slice(1), m.congs)
      const pers = ciclos.map(c => c.periodo)
      const dp = pers.length > 1 ? desvioPadrao(pers) : 0.0
      this.ciclo_medido = {
        periodo: per[0]!, enchendo: ench[0], congelado: cong[0], ref: det.ref, decimais: this._campo_vol_obj()!.decimais,
        ultima_saida: s[s.length - 1], ciclos, desvio: dp,
      }
      const detalhes = pers.map(p => br(p, 3)).join(' ')
      const txt = `Referência ${br(det.ref!, 3)} | ${pers.length} ciclos válidos (1º descartado: ${br(s[1] - s[0], 3)} s)\n`
        + `Média ${br(per[0]!, 3)} s | desvio-padrão ${br(dp, 3)} s | mín ${br(Math.min(...pers), 3)} | máx ${br(Math.max(...pers), 3)}\n`
        + `Ciclos (s): ${detalhes}\n`
        + (cong[0] ? `Abastecendo ≈ ${br(ench[0]!, 2)} s  |  congelado em ${br(det.ref!, 3)} ≈ ${br(cong[0], 2)} s` : 'Não foi possível separar abastecendo/congelado.')
      this.lbl_med_media.set({ text: `Tempo médio do ciclo: ${br(per[0]!, 3)} s`, foreground: COR_OK })
      void this._fim_medicao(txt, COR_OK)
      this.bt_med_aplicar.set(true)
      this.bt_dwell.set(true)
      this._mostrar_offset()
      this.alarme.aviso()
      return
    }
    if (performance.now() / 1000 - m.t0 > 900) {
      void this._fim_medicao('Medição cancelada: 15 min sem completar os ciclos. Verifique a calibração (o valor congelado está sendo lido corretamente?).', COR_FALHA)
    }
  }

  _atualizar_lbl_medicao() {
    const m = this.medicao
    if (!m) return
    const det = m.det, s = m.saidas
    const v = m.ult_valor
    const lido = v === null ? 'ilegível' : br(v, 3)
    const ref = det.ref === null ? 'aprendendo…' : br(det.ref, 3)
    const pers = s.slice(1).map((b, i) => b - s[i])
    const validos = pers.slice(1)  // o 1º ciclo é sempre descartado
    const lista = (pers.length ? `1º (descartado) ${br(pers[0], 3)} | ` : '') + validos.map(p => br(p, 3)).join(' ')
    this.lbl_med.set({ text: `Medindo — lendo agora: ${lido} | referência: ${ref} | ${det.estado}\nCiclos válidos: ${validos.length}/${m.n}   ${lista}`, foreground: COR_AVISO })
    if (validos.length) {
      this.lbl_med_media.set({ text: `Tempo médio do ciclo: ${br(validos.reduce((a, b) => a + b, 0) / validos.length, 3)} s (parcial, ${validos.length}/${m.n})`, foreground: '#1a73e8' })
    }
  }

  _offset_atual() { return num(this.v_ens.ciclo_offset_s?.get(), 0.0)! }

  /** Offset que leva o ciclo médio medido ao segundo inteiro mais próximo (software da 4-3 sem decimais). */
  async _offset_inteiro() {
    const c = this.ciclo_medido
    if (!c) { await messagebox.showinfo('Offset do ciclo', "Meça o ciclo primeiro ('▶ Medir ciclo')."); return }
    this.v_ens.ciclo_offset_s.set(br(offsetInteiro(c.periodo), 3))
  }

  _mostrar_offset() {
    const c = this.ciclo_medido
    const off = this._offset_atual()
    if (!c) { this.lbl_ciclo_off.set({ text: off ? `offset ${br(off, 3)} s (meça o ciclo)` : '', foreground: '#1a73e8' }); return }
    const ger = cicloComOffset(c.periodo, off)
    const inteiro = Math.abs(ger - pyRoundN(ger, 0)) < 0.0005
    this.lbl_ciclo_off.set({
      text: `Ciclo p/ o gerador: ${br(c.periodo, 3)} ${off >= 0 ? '+' : '−'} ${br(Math.abs(off), 3)} = ${br(ger, 3)} s` + (inteiro ? '  ✔ segundo inteiro' : '  (com decimais)'),
      foreground: inteiro ? COR_OK : COR_AVISO,
    })
  }

  /** Copia o tempo médio do ciclo + offset para o dwell das varreduras do perfil EMC atual (igual ao gerador). */
  async _ciclo_para_dwell() {
    const c = this.ciclo_medido
    if (!c) return
    const off = this._offset_atual()
    const dwell = cicloComOffset(c.periodo, off)
    if (dwell <= 0) { await messagebox.showerror('Dwell', `Offset ${br(off, 3)} s deixa o ciclo em ${br(dwell, 3)} s.`); return }
    this.cfg.ensaio.ciclo_offset_s = off
    const segs = (this.perfis[this.cfg.perfil] ?? []).filter(s => s.tipo === 'varredura')
    if (!segs.length) { await messagebox.showinfo('Dwell', `O perfil '${this.cfg.perfil}' não tem segmentos de varredura.`); return }
    const passos = segs.reduce((a, s) => a + frequencias(s).length, 0)
    let deriva = ''
    if (off) {
      deriva = `Offset por ciclo: ${br(off, 3)} s → a bomba (ciclo real ${br(c.periodo, 3)} s) ${off > 0 ? 'adianta' : 'atrasa'} ${br(Math.abs(off), 3)} s por frequência em relação ao gerador; `
        + `em ${passos} frequências ≈ ${br(Math.abs(off) * passos, 1)} s acumulados.\nA frequência mostrada pelo app segue o dwell (igual ao gerador).\n\n`
    }
    if (!await messagebox.askyesno('Dwell', `Tempo médio do ciclo: ${br(c.periodo, 3)} s  |  offset ${br(off, 3)} s\n`
      + `Ciclo usado (dwell): ${br(dwell, 3)} s\n\n` + deriva
      + `Usar ${br(dwell, 3)} s como dwell nas ${segs.length} varreduras do perfil\n'${this.cfg.perfil}'?\n`
      + `(${passos} frequências → ≈ ${fmtTempo(passos * dwell)} de perturbação, 1 abastecimento por frequência)\n\n`
      + 'Configure o MESMO dwell no gerador.')) return
    for (const s of segs) s.dwell_s = dwell
    await this.salvar_perfis_arquivo()
    this._recarregar_segmentos()
  }

  async salvar_perfis_arquivo() {
    await fetch('/api/vigia', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ perfis: this.perfis }) })
  }

  async _aplicar_ciclo() {
    const c = this.ciclo_medido
    if (!c) return
    const per = c.periodo, cong = c.congelado
    // o tempo de "valor parado" (regra do ensaio, padrão 3 s) NÃO é alterado pela medição do ciclo;
    // só a janela de captura é ajustada para caber no que sobra da fase congelada depois dele
    const parado = Number(this.cfg.ensaio.congelado_s)
    const sug: Record<string, number> = { intervalo_s: pyRoundN(per, 2) }
    let aviso = ''
    if (cong) {
      const sobra = cong - parado
      if (sobra < 0.5) {
        aviso = `\n\nATENÇÃO: a fase congelada medida (${br(cong, 2)} s) é menor que o tempo de valor parado exigido (${br(parado, 1)} s) + captura. No modo automático a leitura pode não acontecer.`
      } else sug.janela_s = pyRoundN(Math.max(0.3, Math.min(1.5, sobra * 0.5)), 2)
    }
    for (const [k, v] of Object.entries(sug)) this.v_ens[k].set(fmtG(v))
    this._ler_form_ensaio()
    await messagebox.showinfo('Ciclo aplicado', `Intervalo entre leituras = ${br(per, 2)} s\n`
      + `Valida quando o valor ficar parado por ${br(parado, 1)} s (não alterado)\n`
      + ('janela_s' in sug ? `Janela de captura = ${br(sug.janela_s, 2)} s\n` : '')
      + '\nNo modo POR TEMPO o intervalo conta a partir da saída do valor congelado de cada abastecimento lido; o 1º abastecimento após o início é sempre lido.' + aviso)
  }

  // ================================================================== ABA EMC
  static CORES_SEG: Record<string, string> = { feito: '#c8e6c9', atual: '#fff3c4', pulado: '#ffe0b2' }
  v_perfil = new Var('')
  perfisNomes = new Var<string[]>([])
  /** linhas da tabela de segmentos (muda a cada _recarregar_segmentos / _pintar_segmentos) */
  linhasSeg = new Var<{ id: string; valores: string[]; tag?: string }[]>([])
  selSeg = new Var<string[]>([])
  v_seg: Record<string, Var<string>> = Object.fromEntries(
    ['nome', 'tipo', 'f_ini', 'f_fim', 'passo_pct', 'dwell_s', 'extra_s', 'duracao_s', 'obs', 'face', 'polarizacao'].map(k => [k, new Var('')]))
  v_seg_ag = new Var(true)
  txt_freqs = new Var('')
  lbl_total = new Var('')
  /** diálogo "Gerar faces × polarizações" aberto: faixas base */
  dlgFaces = new Var<Segmento[] | null>(null)
  seg_status: string[] = []
  cron_segmentos: Segmento[] = []

  _montar_emc() {
    this.v_perfil.set(this.cfg.perfil)
    this.perfisNomes.set(Object.keys(this.perfis))
    this._recarregar_segmentos()
  }

  _segs(): Segmento[] {
    const k = this.v_perfil.get()
    return (this.perfis[k] ??= [])
  }

  _recarregar_segmentos(sel: number | null = null) {
    let total = 0.0, passos = 0
    const linhas = this._segs().map((s, i) => {
      const vr = s.tipo === 'varredura'
      const n = vr ? frequencias(s).length : 0
      passos += n
      total += duracao(s)
      return {
        id: String(i), valores: [
          String(i + 1), s.nome, s.face, s.polarizacao, s.tipo, vr ? fmtFreq(s.f_ini) : '—', vr ? fmtFreq(s.f_fim) : '—',
          vr ? br(s.passo_pct, 2) : '—', vr ? br(s.dwell_s, 2) : '—', vr ? br(s.extra_s, 2) : '—',
          vr ? String(n) : '—', fmtTempo(duracao(s)), s.aguardar ? 'sim' : 'não', s.obs, '',
        ],
      }
    })
    this.linhasSeg.set(linhas)
    this.lbl_total.set(`Total: ${this._segs().length} segmento(s), ${passos} frequências, tempo de perturbação ≈ ${fmtTempo(total)} (sem contar as pausas para troca de segmento)   |   arraste as linhas para mudar a ordem`)
    if (sel !== null && sel < linhas.length) this.selSeg.set([String(sel)])
    this._pintar_segmentos()
  }

  /** Pinta os segmentos já feitos (verde), o atual (amarelo) e os pulados (laranja). */
  _pintar_segmentos() {
    let mapa: Record<string, string> = {}
    if (this.seg_status.length && this.cron_segmentos.length) {
      mapa = Object.fromEntries(this.cron_segmentos.map((s, i) => [chaveSegmento(s), this.seg_status[i]]))
    }
    const segs = this._segs()
    let mudou = false
    const linhas = this.linhasSeg.get().map(l => {
      const i = Number(l.id)
      const v = i < segs.length ? mapa[chaveSegmento(segs[i])] ?? '' : ''
      const tag = v in App.CORES_SEG ? v : undefined
      const sit = v !== 'pendente' ? v : ''
      if (l.tag === tag && l.valores[14] === sit) return l
      mudou = true
      const valores = [...l.valores]; valores[14] = sit
      return { ...l, valores, tag }
    })
    if (mudou) this.linhasSeg.set(linhas)
  }

  _seg_selecionado(ids: string[]) {
    this.selSeg.set(ids)
    if (!ids.length) return
    const seg = this._segs()[Number(ids[0])]
    if (!seg) return
    const sr = seg as unknown as Record<string, unknown>
    for (const [k, v] of Object.entries(this.v_seg)) {
      const val = sr[k]
      v.set(typeof val === 'number' ? fmtG(val) : String(val))
    }
    this.v_seg_ag.set(seg.aguardar)
    if (seg.tipo === 'varredura') {
      const tp = tempoPasso(seg)
      const linhas = frequencias(seg).map((fr, i) => `${String(i + 1).padStart(4)}  ${fmtTempo(i * tp).padStart(7)}  ${fmtFreq(fr)}`)
      this.txt_freqs.set('passo  tempo   frequência\n' + linhas.join('\n'))
    } else {
      this.txt_freqs.set(`Etapa por tempo: ${fmtTempo(duracao(seg))}`)
    }
  }

  _seg_do_form(): Segmento {
    const g = Object.fromEntries(Object.entries(this.v_seg).map(([k, v]) => [k, v.get()]))
    return segmentoDe({
      nome: g.nome.trim() || 'Segmento', tipo: (g.tipo || 'varredura') as Segmento['tipo'],
      f_ini: num(g.f_ini, 80)!, f_fim: num(g.f_fim, 1000)!, passo_pct: Math.max(0.01, num(g.passo_pct, 1)!),
      dwell_s: Math.max(0.0, num(g.dwell_s, 1)!), extra_s: Math.max(0.0, num(g.extra_s, 0)!),
      duracao_s: Math.max(0.0, num(g.duracao_s, 60)!), aguardar: this.v_seg_ag.get(), obs: g.obs,
      face: g.face.trim(), polarizacao: g.polarizacao.trim(),
    })
  }

  /** Repete as faixas do perfil para cada face do EUT e polarização da antena. */
  async _gerar_faces() {
    const segs = this._segs()
    let base = segs.filter(s => !s.face && !s.polarizacao)
    if (!base.length) {  // perfil já expandido: usa uma cópia de cada faixa distinta
      const vistos = new Set<string>()
      for (const s of segs) {
        const chave = JSON.stringify([s.nome, s.tipo, s.f_ini, s.f_fim, s.passo_pct, s.dwell_s, s.extra_s, s.duracao_s])
        if (!vistos.has(chave)) { vistos.add(chave); base.push(s) }
      }
    }
    if (!base.length) { await messagebox.showinfo('Gerar', 'Adicione antes as faixas (ex.: 80–300 MHz, 300 MHz–1 GHz, 1–3 GHz).'); return }
    base = [...base]
    this.dlgFaces.set(base)
  }

  async _gerar_faces_aplicar(base: Segmento[], faces: string[], pols: string[], ordem: string) {
    const novos = expandir(base, faces, pols, ordem)
    if (await messagebox.askyesno('Gerar', `Substituir os ${this._segs().length} segmento(s) do perfil '${this.v_perfil.get()}' por ${novos.length} segmentos?`)) {
      this.perfis[this.v_perfil.get()] = novos
      this._recarregar_segmentos()
      this.dlgFaces.set(null)
    }
  }

  private _sel1() { const s = this.selSeg.get(); return s.length ? Number(s[0]) : null }

  _seg_add() {
    this._segs().push(this._seg_do_form())
    this._recarregar_segmentos(this._segs().length - 1)
  }

  _seg_upd() {
    const i = this._sel1()
    if (i === null) return
    this._segs()[i] = this._seg_do_form()
    this._recarregar_segmentos(i)
    this._seg_selecionado([String(i)])
  }

  _seg_rem() {
    const i = this._sel1()
    if (i === null) return
    this._segs().splice(i, 1)
    this.selSeg.set([])
    this._recarregar_segmentos()
  }

  _seg_mover(d: number) {
    const i = this._sel1()
    if (i === null) return
    const j = i + d
    const segs = this._segs()
    if (j >= 0 && j < segs.length) {
      ;[segs[i], segs[j]] = [segs[j], segs[i]]
      this._recarregar_segmentos(j)
    }
  }

  /** arrastar segmentos na aba Perfil EMC */
  _seg_drag_fim(ini: string, alvo: string) {
    const i = Number(ini), j = Number(alvo)
    const segs = this._segs()
    segs.splice(j, 0, segs.splice(i, 1)[0])
    this._recarregar_segmentos(j)
    void this.salvar_perfis_arquivo().catch(() => undefined)
  }

  _perfil_escolhido() {
    this.cfg.perfil = this.v_perfil.get()
    this.selSeg.set([])
    this._recarregar_segmentos()
    this._atualizar_lbl_perfil()
  }
  _atualizar_lbl_perfil() { /* aba Ensaio (próxima etapa) */ }

  async _novo_perfil(base: Segmento[] | null = null) {
    const nome = await simpledialog.askstring('Perfil', 'Nome do novo perfil:')
    if (!nome) return
    if (nome in this.perfis) { await messagebox.showwarning('Perfil', 'Já existe um perfil com esse nome.'); return }
    this.perfis[nome] = (base ?? []).map(s => segmentoDe({ ...s }))
    this.perfisNomes.set(Object.keys(this.perfis))
    this.v_perfil.set(nome)
    this._perfil_escolhido()
  }

  _duplicar_perfil() { void this._novo_perfil(this._segs()) }

  async _excluir_perfil() {
    const nome = this.v_perfil.get()
    if (Object.keys(this.perfis).length <= 1 || !await messagebox.askyesno('Perfil', `Excluir o perfil '${nome}'?`)) return
    delete this.perfis[nome]
    this.perfisNomes.set(Object.keys(this.perfis))
    this.v_perfil.set(Object.keys(this.perfis)[0])
    this._perfil_escolhido()
  }

  async _salvar_perfis() {
    await this.salvar_perfis_arquivo()
    await this.salvar_cfg()
    await messagebox.showinfo('Perfis', `Perfis salvos em ${this.pastaDados}\\perfis_emc.json`)
  }

  // ------------------------------------------------------------------ quadros
  /** Cada quadro novo da câmera: entra na média temporal; a cada 40 ms um deles é lido e mostrado;
   *  com o amostrador ligado, todos vão (tratados) para o pool de leitura. */
  private _quadro_camera(t: number) {
    const p = this.proc
    if (!p?.pronto.get()) return
    const aba = this.nb.get()
    const mostrar = (aba === 0 || aba === 1) && !p.ocupado && performance.now() - this._ultLeitura >= 40
    const amostrar = this.amostrando && this.amostrador !== null && p.emVoo < 3
    if (mostrar) {
      const img = this.camera.capturar()
      if (!img) return
      this._ultLeitura = performance.now()
      p.ler(img, t, this.campos, aba === 1 ? this.campo_sel : null, amostrar)
    } else if (amostrar) {
      const img = this.camera.capturar()
      if (img) p.tratar(img, t)
    } else if ((this.cfg.camera.filtros?.media_n ?? 1) > 1) {
      const img = this.camera.capturar()
      if (img) p.acumular(img, t)
    }
  }

  private _resultado(m: Extract<RespostaWorker, { tipo: 'resultado' }>) {
    this.ult_res_live = m.resultados
    if (!m.quadro) return
    const img = new ImageData(new Uint8ClampedArray(m.quadro.dados), m.quadro.largura, m.quadro.altura)
    this.ult_quadro = img
    const aba = this.nb.get()
    if (aba !== 0 && aba !== 1) return
    if (!this.quadroCanvas || this.quadroCanvas.width !== img.width || this.quadroCanvas.height !== img.height) {
      this.quadroCanvas = new OffscreenCanvas(img.width, img.height)
    }
    const ctx = this.quadroCanvas.getContext('2d')!
    ctx.putImageData(img, 0, 0)
    const modo_dig = aba === 1 && this.v_modo.get() === 'digitos'
    desenharCampos(ctx, img.height, this.campos, m.resultados, aba === 1 ? this.campo_sel : null, modo_dig ? this.cel_sel : null)
    if (this._persp_coletando !== null && aba === 1) desenharPerspectiva(ctx, this._persp_coletando)
    if (aba === 1 && this.canvasCal) {
      this.visor_cal.mostrar(this.canvasCal, this.quadroCanvas, img.width, img.height)
      if (this._ret) {
        const c2 = this.canvasCal.getContext('2d')!
        const [a, b, c, d] = this._ret
        c2.save(); c2.strokeStyle = '#ffeb3b'; c2.lineWidth = 2; c2.setLineDash([4, 2])
        c2.strokeRect(a, b, c - a, d - b); c2.restore()
      }
    } else if (aba === 0 && this.canvasEnsaio) {
      this.visor_ensaio.mostrar(this.canvasEnsaio, this.quadroCanvas, img.width, img.height)
    }
  }

  // ------------------------------------------------------------------ tick (a cada 40 ms)
  tick() {
    this._tick_n++
    const aba = this.nb.get()
    // medição do ciclo (o amostrador entrega o valor do campo de litros em cada quadro + instante de captura)
    while (this._amostras.length) {
      const [t, valor] = this._amostras.shift()!
      if (this.medicao !== null) this._medicao_passo(t, valor)
    }
    if (this.medicao !== null && this._tick_n % 5 === 0) this._atualizar_lbl_medicao()
    if (this._tick_n % 25 === 0) {
      const fr = this.camera.fpsReal
      this.lbl_fps.set({
        text: fr
          ? `Câmera entregando ${br(fr, 1)} quadros/s → 1 leitura a cada ${br(1000 / fr, 1)} ms`
            + (fr < 45 && Math.trunc(Number(this.cfg.camera.fps ?? 60)) >= 60 ? '   (pediu 60? pouca luz/auto exposição limita: use exposição manual ≤ -7)' : '')
          : '',
        foreground: COR_NEUTRO,
      })
    }
    // imagem parada (arquivo): não há quadros novos, lê no tick
    const p = this.proc
    if (this.camera.imagem && p?.pronto.get() && (aba === 0 || aba === 1) && !p.ocupado) {
      const img = this.camera.capturar()
      if (img) p.ler(img, performance.now() / 1000, this.campos, aba === 1 ? this.campo_sel : null)
    }
    const temQuadro = this.camera.ativa && !!this.ult_quadro
    if (temQuadro && aba === 1 && this._tick_n % 5 === 0) {
      this.lbl_persp.set({ text: this.persp_pts.length ? 'perspectiva: ativa' : '', foreground: COR_NEUTRO })
      const modo_dig = this.v_modo.get() === 'digitos'
      let dica: string
      if (this._persp_coletando !== null) {
        dica = `PERSPECTIVA: clique nos 4 cantos da tela/display (${this._persp_coletando.length}/4). A imagem será endireitada.`
      } else if (modo_dig) {
        dica = 'Clique num dígito e arraste para MOVER; arraste as bordas/cantos para mudar o TAMANHO. '
          + 'Setas = mover 1 px | Shift+setas = tamanho | Tab = próximo dígito.'
        const c = this.campos[this.campo_sel]
        if (this.cel_sel !== null && c && ehManual(c)) {
          const [, , w, h] = c.celulas_manuais[this.cel_sel]
          dica = `Dígito ${this.cel_sel + 1}: ${w.toFixed(0)} × ${h.toFixed(0)} px.  ` + dica
        }
      } else {
        dica = "Arraste na imagem para marcar a área do campo (dígitos divididos igualmente). Para ajustar cada dígito, escolha 'Dígito a dígito'."
      }
      this.lbl_dica.set({ text: dica + '  Embaixo: verde = segmento aceso, vermelho = apagado.', foreground: COR_NEUTRO })
    }
    if (temQuadro && aba === 1 && this.campos.length && this._tick_n % 3 === 0) {
      const c = this.campos[this.campo_sel]
      const rc = this.ult_res_live[c.nome]
      if (rc) {
        this.lbl_live.set({ text: `'${rc.texto}'  →  ${formatar(c, rc.valor)}`, foreground: legivel(rc) ? COR_OK : COR_FALHA })
        this.dbg.set(imagemDebug(rc, 110))
      }
    }
    if (!this.camera.ativa && this._tick_n % 25 === 0) {
      this.lbl_cam.set({ text: this.camera.erro || 'Sem imagem da câmera', foreground: COR_FALHA })
    }
  }
}

interface Medicao {
  det: DetectorCiclo; n: number; saidas: number[]; congs: number[]; t0: number; log: string
  linhas: string[][]; campo: string; ult_valor: number | null
}
interface CicloMedido {
  periodo: number; enchendo: number | null; congelado: number | null; ref: number | null; decimais: number
  ultima_saida: number; ciclos: Ciclo[]; desvio: number; saida_ensaio?: number
}

/** datetime.now().strftime("%Y%m%d_%H%M%S") */
export function carimbo(d = new Date()) {
  const p2 = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
}

/** grava um arquivo de texto em resultados/ (sub = subpasta) */
export async function salvarTexto(nome: string, conteudo: string, sub = ''): Promise<string | null> {
  const r = await fetch('/api/vigia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'texto', nome, conteudo, sub }) }).catch(() => null)
  if (!r?.ok) return null
  return (await r.json()).caminho
}

export { CFG_PADRAO }
