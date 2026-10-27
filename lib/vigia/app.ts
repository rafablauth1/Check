// VIGIA-7S no app — a classe App de vigia7s/app.py (estado e ações das telas), no navegador.
// Os nomes dos métodos e das variáveis seguem o Python para facilitar a conferência lado a lado.
'use client'
import {
  campoDe, celulasAbs, ajustarRoi, paraCelula, fatorK, ehManual, formatar, legivel,
  type CampoDisplay, type ResultadoCampo,
} from '@/lib/vigia/seg7'
import { CFG_PADRAO, FILTROS_PADRAO, carregarConfig, type ConfigVigia, type ConfigCamera } from '@/lib/vigia/config'
import type { Segmento } from '@/lib/vigia/emc'
import { CameraWeb, listarCameras, resolverFonte } from '@/lib/vigia/camera-web'
import { ordenarCantos } from '@/lib/vigia/camera-proc'
import { desenharCampos, desenharPerspectiva, imagemDebug, Visor } from '@/lib/vigia/desenho'
import { br, num, pyRoundN } from '@/lib/vigia/util'
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

/** Fala com o worker do OpenCV (um pedido de leitura por vez; quadros só p/ a média vão no meio). */
class Processador {
  worker: Worker
  erro = new Var('')
  ocupado = false
  pendentes = 0
  private id = 0
  aoResultado: ((r: Extract<RespostaWorker, { tipo: 'resultado' }>) => void) | null = null

  /** pronto: versão do OpenCV quando carregado */
  constructor(public pronto: Var<string | null>) {
    this.worker = new Worker(new URL('./vigia.worker.ts', import.meta.url))
    this.worker.onmessage = (ev: MessageEvent<RespostaWorker>) => {
      const m = ev.data
      if (m.tipo === 'pronto') { this.pronto.set(m.versao); return }
      if (m.tipo === 'erro') { this.erro.set(m.msg); if (m.id !== undefined) { this.ocupado = false; this.pendentes-- } return }
      if (m.tipo === 'resultado') { this.ocupado = false; this.pendentes--; this.aoResultado?.(m) }
    }
    this.worker.onerror = e => this.erro.set(e.message || 'Falha ao carregar o OpenCV')
    this.enviar({ tipo: 'iniciar' })
  }
  enviar(m: PedidoWorker, transf: Transferable[] = []) { this.worker.postMessage(m, transf) }
  ler(img: ImageData, t: number, campos: CampoDisplay[], recortesDe: number | null) {
    this.ocupado = true; this.pendentes++
    this.enviar({ tipo: 'quadro', id: ++this.id, t, largura: img.width, altura: img.height, dados: img.data.buffer as ArrayBuffer, campos, recortesDe, devolverQuadro: true }, [img.data.buffer as ArrayBuffer])
  }
  acumular(img: ImageData, t: number) {
    this.enviar({ tipo: 'quadro', id: -1, t, largura: img.width, altura: img.height, dados: img.data.buffer as ArrayBuffer, campos: [], soAcumular: true }, [img.data.buffer as ArrayBuffer])
  }
  fechar() { this.worker.terminate() }
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
    this.proc = new Processador(this.cvPronto)
    this.proc.aoResultado = m => this._resultado(m)
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
    // só grava o que foi carregado (nunca a config padrão por cima da salva)
    if (this.carregado.get()) void this.salvar_cfg()
    this.carregado.set(false)
  }

  get layout(): Record<string, unknown> {
    if (!this.cfg.layout || typeof this.cfg.layout !== 'object') this.cfg.layout = {}
    return this.cfg.layout
  }

  // ------------------------------------------------------------------ config
  _ler_form_ensaio() { /* aba "Tempo, validação e alarme" (próxima etapa) */ }

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
  _atualizar_combos_consistencia() { /* aba Tempo, validação e alarme (próxima etapa) */ }

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

  // ------------------------------------------------------------------ quadros
  /** Cada quadro novo da câmera: entra na média temporal; a cada 40 ms um deles é lido e mostrado. */
  private _quadro_camera(t: number) {
    const p = this.proc
    if (!p?.pronto.get()) return
    const aba = this.nb.get()
    const ler = (aba === 0 || aba === 1) && !p.ocupado && performance.now() - this._ultLeitura >= 40
    if (ler) {
      const img = this.camera.capturar()
      if (!img) return
      this._ultLeitura = performance.now()
      p.ler(img, t, this.campos, aba === 1 ? this.campo_sel : null)
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

export { CFG_PADRAO }
