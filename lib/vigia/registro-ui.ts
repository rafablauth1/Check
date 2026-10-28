// VIGIA-7S no app — aba "Registro (FOR EMC38)": porte de class RegistroUI (vigia7s/registro.py).
// Mesmos métodos e mensagens; a tela fica em app/vigia/AbaRegistro.tsx. O registro aberto é o mesmo do VIGIA-7S
// da área de trabalho (config.registro_arquivo), e o arquivo .json é o mesmo (resultados/registros/).
import { Var, messagebox, simpledialog } from '@/lib/vigia/tk'
import {
  MODELOS, INICIAIS, DADOS_CAMPOS, CAB_CAMPOS, BLOCO_CAB, TEXTOS_OBS, PASSO_LOG_PCT,
  completar, novo_registro, novo_bloco, registrar_historico, stats_inicial, preco_reg, num, fmt, erro, total_calc,
  fora_do_limite, stats_bloco, stats_faixa, indices_faixa, proxima_freq, rotulo_freq, importar, preencher_totalizadores,
  ordenar_leituras, leiturasETotais, montar_por_segmento, bloco_para_leitura, series_grafico, _fmt_mhz,
  type Registro, type Bloco, type Linha, type Inicial, type Ensaio, type EnsaioSalvo,
} from '@/lib/vigia/registro'
import type { LeituraReg, TotReg, VigiaApp } from '@/lib/vigia/ensaio'

const api = (corpo: Record<string, unknown>) =>
  fetch('/api/vigia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j })

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p
const semExt = (p: string) => basename(p).replace(/\.[^.]*$/, '')

/** id(d) do Python: identidade do dicionário, para a chave do histórico */
const ids = new WeakMap<object, number>()
let _proxId = 1
const idDe = (o: object) => { if (!ids.has(o)) ids.set(o, _proxId++); return ids.get(o)! }

export interface LinhaTabela { id: string; valores: string[]; tag?: string | null; marcador?: boolean }

export type JanelaReg =
  | { tipo: 'abrir'; itens: { nome: string; caminho: string; mtime: number }[] }
  | { tipo: 'escolher_ensaio'; itens: { rel: string; nome: string; salvo_em: string; n: number }[]; resolver: (rel: string | null) => void }
  | { tipo: 'importar'; ensaio_sugerido: string | null; leituras: LeituraReg[]; totais: Record<string, TotReg[]>; origem: string }
  | { tipo: 'montar'; lista: EnsaioSalvo[] }
  | { tipo: 'foto'; titulo: string; url: string; arq: string; info: string }
  | { tipo: 'grafico'; titulo: string; series: NonNullable<ReturnType<typeof series_grafico>>['series']; faixas: [string, number, number][] }

export class RegistroUI {
  app: VigiaApp
  /** caminho do registro (portátil, relativo à pasta do VIGIA: resultados/registros/<protocolo>.json) */
  caminho = 'resultados/registros/registro_sem_nome.json'
  reg: Registro = novo_registro()
  rev = new Var(0)                 // muda a cada alteração: a tela redesenha
  nb = new Var(0)                  // aba interna (Dados / Verificação inicial / Ensaios / Histórico)
  v_ini_sel = new Var(INICIAIS[0])
  v_ens_sel = new Var(Object.keys(MODELOS)[0])
  v_bloco = new Var('')
  sel_ini = new Var<string[]>([])
  sel_ens = new Var<string[]>([])
  sel_fx = new Var<string[]>([])
  editar = new Var<{ tabela: 'ini' | 'ens' | 'fx'; i: number; col: string; n: number } | null>(null)
  janela = new Var<JanelaReg | null>(null)
  fotos = new Var<Record<number, string | null>>({})  // linha do bloco → foto (localizar_foto), "ver" na coluna Foto
  usuario = ''
  /** pasta do VIGIA no disco */
  base = ''
  carregado = new Var(false)
  private _salvarTimer: ReturnType<typeof setTimeout> | null = null
  private _io: Promise<unknown> = Promise.resolve()
  private _fotosChave = ''

  constructor(app: VigiaApp) { this.app = app }

  get pasta() { return 'resultados/registros' }
  get layout() { return this.app.layout }
  obter_leituras() { return this.app.leituras_reg }
  obter_limite() { return Number(this.app.cfg.ensaio.limite_erro_pct ?? 1.0) || 0 }
  obter_totais() { return this.app._totais_sessao() }
  mudou() { this.rev.set(this.rev.get() + 1) }

  async iniciar(usuario: string, base = '') {
    this.base = base
    this.usuario = usuario
    const p = this.app.cfg.registro_arquivo
    const r = p ? await api({ acao: 'reg_resolver', caminho: p }).catch(() => null) : null
    this.caminho = r?.caminho || 'resultados/registros/registro_sem_nome.json'
    this.reg = await this._ler(this.caminho)
    this.recarregar_tudo()
    this.carregado.set(true)
  }

  /** o VIGIA da área de trabalho pode ter mudado o arquivo: relê do disco (sem alterações pendentes aqui) */
  async reler() {
    if (this._salvarTimer || !this.carregado.get()) return
    this.reg = await this._ler(this.caminho)
    this.recarregar_tudo()
  }

  // ------------------------------------------------------------------ histórico de atualizações (automático)
  /** Onde fica o dicionário d no registro (para o histórico). */
  _contexto(d: object): string {
    if (d === this.reg.dados) return 'Dados da amostra'
    for (const [n, ini] of Object.entries(this.reg.iniciais)) if (d === ini || d === ini.cab) return `Verificação ${n}`
    for (const [n, ens] of Object.entries(this.reg.ensaios)) {
      if (d === ens || d === ens.cab || d === ens.extras) return n
      for (const b of ens.blocos) if (d === b) return `${n} / ${b.nome}`
    }
    return 'Registro'
  }

  _hist(alteracao: string, chave: string | null = null) { registrar_historico(this.reg, alteracao, chave, this.usuario) }

  // ------------------------------------------------------------------ arquivo
  async _ler(caminho: string): Promise<Registro> {
    const r = await api({ acao: 'reg_ler', caminho }).catch(() => null)
    return r?.reg ? completar(r.reg) : novo_registro()
  }

  /** salvo a cada alteração (agrupa as alterações de 0,4 s numa gravação só) */
  salvar() {
    if (this._salvarTimer) clearTimeout(this._salvarTimer)
    this._salvarTimer = setTimeout(() => { this._salvarTimer = null; void this._gravar() }, 400)
  }

  async salvar_agora() {
    if (this._salvarTimer) { clearTimeout(this._salvarTimer); this._salvarTimer = null }
    await this._gravar()
  }

  private _gravar() {
    const caminho = this.caminho, dados = JSON.stringify(this.reg)
    const p = this._io.then(() => api({ acao: 'reg_salvar', caminho, dados }))
      .catch(ex => messagebox.showerror('Registro', `Não foi possível salvar o registro:\n${ex instanceof Error ? ex.message : ex}`))
    this._io = p
    return p
  }

  async _trocar(caminho: string, reg: Registro) {
    await this.salvar_agora()
    this.caminho = caminho; this.reg = reg
    await this.salvar_agora()
    // ao_mudar_arquivo: config.registro_arquivo = caminho_portatil(p)
    this.app.cfg.registro_arquivo = caminho
    void this.app.salvar_cfg()
    this.recarregar_tudo()
  }

  async novo() {
    const prot = await simpledialog.askstring('Novo registro', 'Protocolo da amostra (ex.: 12345678):')
    if (!prot) return
    const caminho = `${this.pasta}/${prot.trim()}.json`
    const existe = (await api({ acao: 'reg_ler', caminho }).catch(() => null))?.reg
    if (existe && !await messagebox.askyesno('Novo registro', 'Já existe um registro com esse protocolo. Abrir o existente?')) return
    const reg = await this._ler(caminho)
    reg.dados.protocolo = reg.dados.protocolo || prot.trim()
    await this._trocar(caminho, reg)
  }

  async abrir() {
    const r = await api({ acao: 'reg_listar' }).catch(() => ({ itens: [] }))
    this.janela.set({ tipo: 'abrir', itens: r.itens })
  }

  async abrir_arquivo(caminho: string) {
    this.janela.set(null)
    await this._trocar(caminho, await this._ler(caminho))
  }

  async salvar_como() {
    const nome = await simpledialog.askstring('Salvar como', `Nome do registro (em ${this.abs(this.pasta)}):`, `${this.reg.dados.protocolo || 'registro'}.json`)
    if (!nome) return
    const n = basename(nome.trim()).replace(/\.json$/i, '') + '.json'
    await this._trocar(`${this.pasta}/${n}`, this.reg)
  }

  async exportar() {
    const d = this.reg.dados
    const nome = `FOR EMC38 - ${d.protocolo || 'registro'} - ${d.cliente || ''}`.trim().replace(/^[ -]+|[ -]+$/g, '')
    const arq = await simpledialog.askstring('Exportar', `Nome da planilha (em ${this.abs(this.pasta)}):`, nome + '.xlsx')
    if (!arq) return
    const caminho = `${this.pasta}/${basename(arq.trim()).replace(/\.xlsx$/i, '')}.xlsx`
    let r
    try {
      await this.salvar_agora()
      r = await api({ acao: 'reg_excel', caminho, dados: JSON.stringify(this.reg), limite: this.obter_limite() })
    } catch (ex) {  // arquivo aberto no Excel etc.
      await messagebox.showerror('Exportar', `Não foi possível exportar:\n${ex instanceof Error ? ex.message : ex}`)
      return
    }
    if (await messagebox.askyesno('Exportar', `Planilha gerada:\n${r.arquivo}\n\nAbrir agora?`)) await api({ acao: 'abrir_arquivo', caminho })
  }

  async emitir_dialogo() {
    await messagebox.showinfo('Emitir relatório / Draft', 'A emissão do relatório / Draft (Word) ainda está sendo portada para o app.\n\n'
      + 'Por enquanto, emita pelo VIGIA-7S da área de trabalho: o registro é o mesmo arquivo.')
  }

  // ------------------------------------------------------------------ helpers de formulário
  _mudou(d: Record<string, unknown> | null, k: string, valor: string) {
    if (!d) return
    d[k] = valor
    const rot = Object.fromEntries([...DADOS_CAMPOS, ...CAB_CAMPOS, ...BLOCO_CAB, ['tot_ini', 'Totalizador inicial'], ['tot_fim', 'Totalizador final']])[k] ?? k
    this._hist(`${this._contexto(d)}: ${rot} = '${valor}'`, `${idDe(d)}:${k}`)
    this.salvar()
    this.mudou()
  }

  _mudou_texto(d: Record<string, unknown> | null, k: string, texto: string) {
    if (!d) return
    d[k] = texto.trim()
    this._hist(`${this._contexto(d)}: observações editadas`, `${idDe(d)}:${k}`)
    this.salvar()
  }

  // ------------------------------------------------------------------ INICIAL
  _ini(): Inicial { return this.reg.iniciais[this.v_ini_sel.get()] }

  _edit_ini(i: number, col: string, texto: string) {
    const l = this._ini().linhas[i]
    const chave = ({ 'Volume entregue [L]': 'volume', 'Obs.': 'obs' } as Record<string, 'volume' | 'obs'>)[col]
    if (chave === 'obs') l.obs = texto
    else l.volume = num(texto)
    this.salvar()
    this.mudou()
  }

  _aviso_preco(): string {
    const p = preco_reg(this.reg)
    return p !== null ? `Preço unitário: R$ ${fmt(p, 2)} (cadastro em Dados da amostra) · total = litros × preço`
      : '⚠ Preço unitário não cadastrado: preencha em Dados da amostra (vale para todo o registro)'
  }

  tabela_inicial(): { linhas: LinhaTabela[]; resumo: string } {
    const ini = this._ini()
    const st = stats_inicial(ini)
    const p = st.preset, pr = preco_reg(this.reg)
    const linhas = ini.linhas.map((l, i) => ({
      id: String(i),
      valores: [l.rotulo, l.volume !== null ? fmt(pr, 2) : '', fmt(total_calc(l.volume, pr), 2), fmt(l.volume, 3), fmt(erro(l.volume, p), 3), l.obs],
    }))
    const resumo = `Média do volume: ${fmt(st.media, 4)} L   |   desvio padrão: ${fmt(st.desvio, 4)}   |   `
      + `e1 médio: ${fmt(st.e1_media, 3)} %   |   desvio e1: ${fmt(st.e1_desvio, 3)}   (${st.n} medidas)\n` + this._aviso_preco()
    return { linhas, resumo }
  }

  async _ini_da_camera() {
    const leituras = this.obter_leituras().filter(l => l.volume !== null && l.volume !== undefined)
    if (!leituras.length) { await messagebox.showinfo('Verificação inicial', 'Não há leituras de ensaio da câmera nesta sessão.'); return }
    const n = this._ini().linhas.length
    const usar = leituras.slice(-n)
    if (!await messagebox.askyesno('Verificação inicial', `Preencher '${this.v_ini_sel.get()}' com os volumes das últimas ${usar.length} leituras da câmera?`)) return
    this._ini().linhas.forEach((l, i) => { if (i < usar.length) l.volume = (usar[i].volume ?? null) as number | null })
    this.salvar()
    this.mudou()
  }

  // ------------------------------------------------------------------ ENSAIOS
  _ens(): Ensaio { return this.reg.ensaios[this.v_ens_sel.get()] }

  _bloco(): Bloco | null {
    const ens = this._ens()
    const n = this.v_bloco.get()
    return ens.blocos.find(b => b.nome === n) ?? ens.blocos[0] ?? null
  }

  _ref_media() { return stats_inicial(this.reg.iniciais[this._ens().ref]).media }

  _carregar_ensaio() {
    const ens = this._ens()
    if (!ens.blocos.some(b => b.nome === this.v_bloco.get())) this.v_bloco.set(ens.blocos.length ? ens.blocos[0].nome : '')
    this.sel_ens.set([])
    this.mudou()
  }

  async _obs_padrao() {
    // Insere nas observações do ensaio o texto padrão do FOR EMC38 para este ensaio.
    let txt = TEXTOS_OBS[this.v_ens_sel.get()]
    if (!txt) return
    const atual = String(this._ens().obs ?? '').trim()
    if (atual && !atual.includes(txt)) {
      if (!await messagebox.askyesno('Texto padrão', 'Já há observações. Acrescentar o texto padrão no fim?')) return
      txt = atual + '\n' + txt
    } else if (atual) return
    this._ens().obs = txt
    this._hist(`${this.v_ens_sel.get()}: texto padrão inserido nas observações`)
    this.salvar()
    this.mudou()
  }

  async ver_grafico(todos: boolean) {
    // Gráfico erro × frequência do bloco (ou de todos os blocos do ensaio), como no FOR EMC38.
    const g = series_grafico(this.reg, this.v_ens_sel.get(), todos ? null : this._bloco())
    if (!g) {
      await messagebox.showinfo('Gráfico', 'O gráfico erro × frequência é para os ensaios de varredura (4-3 e 4-6) com leituras importadas.')
      return
    }
    this.janela.set({ tipo: 'grafico', titulo: g.titulo, series: g.series, faixas: g.faixas })
  }

  async ver_foto(i: number | null) {
    // Mostra a foto da leitura da câmera que originou a linha i do bloco (para averiguar uma FALHA).
    const b = this._bloco()
    if (b === null || i === null || i >= b.linhas.length) { await messagebox.showinfo('Foto', 'Selecione uma linha do bloco.'); return }
    const l = b.linhas[i]
    const arq = (await api({ acao: 'reg_fotos', linhas: [l] }).catch(() => ({ fotos: [null] }))).fotos[0] as string | null
    if (!arq) {
      await messagebox.showinfo('Foto', 'Não há foto para esta linha.\n\nA câmera grava foto das leituras com FALHA '
        + '(ou de todas, se marcado em Câmera/Calibração). Linhas importadas antes desta '
        + 'versão ou digitadas à mão não têm foto associada.')
      return
    }
    const info = `Linha ${i + 1} do bloco '${b.nome}'  |  freq. ${l.rotulo ?? ''}  |  volume no Registro: `
      + `${fmt(l.volume, 3) || '—'} L` + (l.n ? `  |  leitura nº ${l.n} da câmera` : '') + (l.obs ? `\n${l.obs}` : '') + `\n${arq}`
    this.janela.set({
      tipo: 'foto', titulo: `Foto da leitura — ${l.rotulo ?? ''} MHz · ${fmt(l.volume, 3)} L`,
      url: `/api/vigia/arquivo?p=${encodeURIComponent(arq)}`, arq, info,
    })
  }

  _num_modo(): string { return String(this.layout.reg_numeracao ?? 'faixa') }

  _alternar_numeracao() {
    // Clique no cabeçalho Nº: alterna entre numeração por faixa (antena) e geral.
    this.layout.reg_numeracao = this._num_modo() === 'faixa' ? 'geral' : 'faixa'
    this.app.salvarLayoutDepois()
    this.mudou()
  }

  /** _atualizar_calculos(): tabela do bloco, rótulo do bloco e tabela das faixas */
  calculos() {
    const b = this._bloco()
    const vazio = { linhas: [] as LinhaTabela[], cabNum: 'Nº', lbl: '', lblRuim: false, faixas: [] as LinhaTabela[], preco: this._aviso_preco() }
    if (b === null) return vazio
    const ref = this._ref_media()
    const pr = preco_reg(this.reg)
    const lim = this.obter_limite()
    // Nº por faixa (antena): recomeça em 1 em cada faixa, com um marcador no início de cada uma; ou 1…N geral
    const fx_b = MODELOS[this.v_ens_sel.get()].tipo === 'freq' ? b.faixas ?? [] : []
    const k_fx = indices_faixa(b.linhas, fx_b)
    const varias = fx_b.length > 1
    const por_faixa = varias && this._num_modo() === 'faixa'
    const cont = new Map<number | null, number>()
    const linhas: LinhaTabela[] = []
    const fotos = this.fotos.get()
    b.linhas.forEach((l, i) => {
      const k = k_fx[i]
      if (varias && k !== null && (i === 0 || k_fx[i - 1] !== k)) {
        const n_k = b.linhas.filter((x, j) => k_fx[j] === k && x.volume !== null && !x.sem_freq).length
        linhas.push({ id: `m${i}`, marcador: true, tag: 'marcador',
          valores: ['', `▼ ${fx_b[k].nome} MHz`, '', '', '', '', '', `faixa ${k + 1} de ${fx_b.length} · ${n_k} ponto(s) com leitura`] })
      }
      const e = erro(l.volume, ref)
      let num_txt = ''
      if (l.sem_freq) num_txt = 's/f'
      else if (l.volume !== null) {
        const chave = por_faixa ? k : null
        cont.set(chave, (cont.get(chave) ?? 0) + 1)
        num_txt = String(cont.get(chave))
      }
      const foto = fotos[i] ? 'ver' : ''
      // cores como a formatação condicional do FOR: vermelho = |erro| ≥ limite; verde = dentro;
      // amarelo = ponto ainda sem leitura
      let tag: string | null
      if (l.volume === null) tag = l.rotulo ? 'pendente' : null
      else if (fora_do_limite(e, lim)) tag = 'falha'
      else if (l.sem_freq) tag = null
      else tag = String(l.obs).startsWith('FALHA') ? 'alerta' : 'dentro'
      linhas.push({ id: String(i), tag, valores: [num_txt, l.rotulo, l.volume !== null ? fmt(pr, 2) : '', fmt(l.volume, 3), fmt(total_calc(l.volume, pr), 2), fmt(e, 3), foto, l.obs] })
    })
    const cabNum = varias ? (por_faixa ? 'Nº na faixa ⇄' : 'Nº geral ⇄') : 'Nº'
    const st = stats_bloco(b, ref)
    const sf = st.n_sem_freq ? ` + ${st.n_sem_freq} s/ freq.` : ''
    const prova_ruim = st.prova !== null && Math.abs(st.prova) > 0.0005
    const lbl = `${st.n} pontos importados${sf}  |  ∑ ${fmt(st.soma, 3)} L  |  Prova: `
      + `${fmt(st.prova, 3) || '—'}  |  erro máx. ${fmt(st.erro_max, 3) || '—'} %` + (ref ? '' : '  (sem média inicial!)')
    const fx = b.faixas ?? []
    const faixas = fx.map((x, i) => {
      const s = stats_faixa(b, x, i === fx.length - 1)
      return {
        id: String(i), tag: s.prova !== null && Math.abs(s.prova) > 0.0005 ? 'falha' : null,
        valores: [x.nome, typeof x.fmin !== 'string' ? fmt(x.fmin, 2) : x.fmin, typeof x.fmax !== 'string' ? fmt(x.fmax, 2) : x.fmax,
          x.ini, x.fim, fmt(s.dif, 3), fmt(s.real, 3), fmt(s.prova, 3)],
      }
    })
    return { linhas, cabNum, lbl, lblRuim: prova_ruim, faixas, preco: this._aviso_preco() }
  }

  /** "ver" na coluna Foto: localiza as fotos das linhas do bloco (no servidor) */
  async atualizar_fotos() {
    const b = this._bloco()
    const chave = `${this.caminho}|${this.v_ens_sel.get()}|${b?.nome}|${b?.linhas.map(l => `${l.foto ?? ''}${l.ensaio ?? ''}${l.n ?? ''}`).join(',')}`
    if (chave === this._fotosChave) return
    this._fotosChave = chave
    if (!b || !b.linhas.length) { this.fotos.set({}); return }
    const r = await api({ acao: 'reg_fotos', linhas: b.linhas.map(l => ({ foto: l.foto, ensaio: l.ensaio, n: l.n })) }).catch(() => null)
    if (r && chave === this._fotosChave) this.fotos.set(Object.fromEntries((r.fotos as (string | null)[]).map((f, i) => [i, f])))
  }

  async _mudou_ref(ref: string) {
    this._ens().ref = ref
    this._hist(`${this.v_ens_sel.get()}: erro em relação a '${ref}'`)
    this.salvar()
    this.mudou()
  }

  // ------------------------------------------------------------------ ensaios registrados em pasta própria
  /** resultados\registros\<nome do registro>\ensaios — ensaios já importados para este registro. */
  pasta_ensaios() { return `${this.pasta}/${semExt(this.caminho)}/ensaios` }
  /** caminho completo (para as mensagens, como o Python mostra) */
  abs(p: string) { return this.base ? this.base + '\\' + p.split('/').join('\\') : p }

  /** Move as pastas de ensaio importadas para a pasta do registro (não se misturam com os ensaios ainda não
   *  registrados) e corrige nas linhas do registro o caminho das fotos. Retorna quantas foram movidas. */
  async arquivar_ensaios(pastas: string[]): Promise<number> {
    if (!pastas.length) return 0
    const mapa = await this.app._arquivar_ensaios(pastas, this.pasta_ensaios())
    if (!Object.keys(mapa).length) return 0
    for (const ens of Object.values(this.reg.ensaios)) {
      for (const b of ens.blocos) {
        for (const l of b.linhas) {
          for (const [ant, nova] of Object.entries(mapa)) {
            if (l.ensaio === ant) l.ensaio = nova
            if (l.foto && String(l.foto).startsWith(ant)) l.foto = nova + String(l.foto).slice(ant.length)
          }
        }
      }
    }
    this._hist('Pasta(s) de ensaio movida(s) para a pasta do registro: ' + Object.values(mapa).map(v => basename(v)).join(', '))
    return Object.keys(mapa).length
  }

  _onde() { const b = this._bloco(); return `${this.v_ens_sel.get()} / ${b ? b.nome : '—'}` }

  _edit_ens(i: number, col: string, texto: string) {
    const l = this._bloco()!.linhas[i]
    const chave = ({ 'FreQ./Medida': 'rotulo', 'Volume entregue [L]': 'volume', 'Obs.': 'obs' } as Record<string, 'rotulo' | 'volume' | 'obs'>)[col]
    const antes = l[chave]
    if (chave === 'volume') l.volume = num(texto)
    else l[chave] = texto
    this._hist(`${this._onde()}, linha ${i + 1} (${l.rotulo ?? ''}): ${col} '${chave === 'volume' ? fmt(antes, 3) : antes || ''}' → '${texto}'`)
    this.salvar()
    this.mudou()
  }

  _edit_fx(i: number, col: string, texto: string) {
    const x = this._bloco()!.faixas[i]
    const chave = ({ Faixa: 'nome', 'f mín': 'fmin', 'f máx': 'fmax', Inicial: 'ini', Final: 'fim' } as Record<string, 'nome' | 'fmin' | 'fmax' | 'ini' | 'fim'>)[col]
    if (chave === 'fmin' || chave === 'fmax') x[chave] = num(texto, null) ?? texto
    else x[chave] = texto
    this._hist(`${this._onde()}, faixa ${x.nome ?? ''}: ${col} = '${texto}'`, `fx${idDe(x)}:${chave}`)
    this.salvar()
    this.mudou()
  }

  linha_sel(): number | null {
    const s = this.sel_ens.get()[0]
    return s !== undefined && /^\d+$/.test(s) ? Number(s) : null
  }

  async _linha_add() {
    // Nova linha depois da selecionada (ou no fim). Ensaio por frequência: já vem com a próxima frequência do
    // passo logarítmico de 1 % (anterior × 1,01) e abre a edição do volume.
    const b = this._bloco()
    if (b === null) return
    const i = this.linha_sel()
    let rot = ''
    if (MODELOS[this.v_ens_sel.get()].tipo === 'freq') {
      const f = proxima_freq(b.linhas, i, b.faixas ?? [])
      if (f === null) {
        if (!await messagebox.askyesno('Nova linha', 'A linha anterior já está na frequência final do ensaio.\n\nIncluir uma linha em branco?')) return
      } else rot = rotulo_freq(f)
    }
    const nova: Linha = { rotulo: rot, preco: null, volume: null, total: null, obs: '' }
    const pos = i === null ? b.linhas.length : i + 1
    b.linhas.splice(pos, 0, nova)
    this._hist(`${this._onde()}: linha incluída` + (rot ? ` (${rot} MHz, passo log ${fmt(PASSO_LOG_PCT, 0)} %)` : ''))
    this.salvar()
    this.sel_ens.set([String(pos)])
    this.mudou()
    this.editar.set({ tabela: 'ens', i: pos, col: 'Volume entregue [L]', n: Date.now() })  // digita o volume direto (Enter desce)
  }

  _linha_rem() {
    const i = this.linha_sel()
    if (i === null) return
    const b = this._bloco()!
    const l = b.linhas[i]
    this._hist(`${this._onde()}: linha ${i + 1} removida (${l.rotulo ?? ''}, volume ${fmt(l.volume, 3) || '—'})`)
    b.linhas.splice(i, 1)
    this.salvar()
    this.mudou()
  }

  async _bloco_limpar() {
    const b = this._bloco()
    if (b && await messagebox.askyesno('Limpar', `Apagar preço/volume/total/obs de todas as linhas de '${b.nome}'?`)) {
      const tipo = MODELOS[this.v_ens_sel.get()].tipo
      const n = b.linhas.filter(l => l.volume !== null).length
      if (tipo === 'freq') b.linhas = []
      else for (const l of b.linhas) Object.assign(l, { volume: null, obs: '' })
      this._hist(`${this._onde()}: valores do bloco limpos (${n} leitura(s))`)
      this.salvar()
      this.mudou()
    }
  }

  async _bloco_add() {
    const ens_nome = this.v_ens_sel.get()
    let sug = ''
    if (ens_nome.includes('4-6 (Com)')) sug = `Linhas de comunicação (${this._ens().blocos.length + 1})`  // mais de uma porta de comunicação
    const nome = await simpledialog.askstring('Bloco', 'Nome do novo bloco:', sug)
    if (nome) {
      this._ens().blocos.push(novo_bloco(nome, [], MODELOS[ens_nome].faixas ?? []))
      this.v_bloco.set(nome)
      this._hist(`${ens_nome}: bloco '${nome}' criado`)
      this.salvar()
      this._carregar_ensaio()
    }
  }

  async _bloco_ren() {
    const b = this._bloco()
    const nome = b ? await simpledialog.askstring('Bloco', 'Novo nome:', b.nome) : null
    if (b && nome) {
      this._hist(`${this.v_ens_sel.get()}: bloco '${b.nome}' renomeado para '${nome}'`)
      b.nome = nome
      this.v_bloco.set(nome)
      this.salvar()
      this._carregar_ensaio()
    }
  }

  async _bloco_rem() {
    const b = this._bloco()
    if (b && await messagebox.askyesno('Bloco', `Remover o bloco '${b.nome}' e suas leituras?`)) {
      this._hist(`${this.v_ens_sel.get()}: bloco '${b.nome}' removido (${b.linhas.filter(l => l.volume !== null).length} leitura(s))`)
      const ens = this._ens()
      ens.blocos.splice(ens.blocos.indexOf(b), 1)
      this.v_bloco.set('')
      this.salvar()
      this._carregar_ensaio()
    }
  }

  _fx_add() {
    this._bloco()!.faixas.push({ nome: 'nova', fmin: '', fmax: '', ini: '', fim: '' })
    this.salvar()
    this.mudou()
  }

  _fx_rem() {
    const s = this.sel_fx.get()[0]
    if (s === undefined) return
    this._bloco()!.faixas.splice(Number(s), 1)
    this.salvar()
    this.mudou()
  }

  // ------------------------------------------------------------------ importação
  /** Escolhe uma pasta de ensaio salva (resultados\ensaio_…) e devolve (leituras, nome, totais) do seu estado. */
  async _leituras_de_ensaio_salvo(): Promise<[LeituraReg[] | null, string, Record<string, TotReg[]>]> {
    const lista = await api({ acao: 'reg_ensaios_lista' }).catch(() => ({ itens: [] }))
    const rel = await new Promise<string | null>(resolver => this.janela.set({ tipo: 'escolher_ensaio', itens: lista.itens, resolver }))
    if (!rel) return [null, '', {}]
    let r
    try {
      r = await api({ acao: 'reg_estado', rel })
    } catch (ex) {
      await messagebox.showerror('Importar', `Não foi possível ler o ensaio:\n${ex instanceof Error ? ex.message : ex}`)
      return [null, '', {}]
    }
    const [leituras, totais] = leiturasETotais(r.est, r.pasta)
    return [leituras, String(r.est.nome || basename(r.pasta)), totais]
  }

  async importar_dialogo(ensaio_sugerido: string | null = null) {
    let leituras: LeituraReg[] | null = this.obter_leituras(), origem = 'do último ensaio da câmera'
    let totais = this.obter_totais()
    if (!leituras.length) {
      if (!await messagebox.askyesno('Importar', 'Não há leituras de ensaio da câmera nesta sessão.\n\nImportar de um ensaio salvo (pasta resultados)?')) return
      let nome
      ;[leituras, nome, totais] = await this._leituras_de_ensaio_salvo()
      if (!leituras || !leituras.length) return
      origem = `do ensaio salvo '${nome}'`
    }
    this.janela.set({ tipo: 'importar', ensaio_sugerido, leituras, totais, origem })
  }

  /** ok() do diálogo de importação */
  async importar_ok(v_ens: string, v_bloco: string, v_modo: string, leituras: LeituraReg[], totais: Record<string, TotReg[]>) {
    const alvo = v_bloco.startsWith('(automático') ? null : v_bloco
    const modo = v_modo.startsWith('acrescentar') ? 'acrescentar' : 'preencher'
    const ls = ordenar_leituras(leituras.filter(l => l.volume !== null && l.volume !== undefined))
    const cont = importar(this.reg, v_ens, ls, alvo, modo)
    const n_tot = preencher_totalizadores(this.reg, v_ens, ls, totais, alvo)
    if (n_tot) this._hist(`${v_ens}: ${n_tot} totalizador(es) de bloco/faixa preenchido(s) a partir dos totalizadores registrados no(s) ensaio(s)`)
    const pastas = [...new Set(ls.filter(l => l.ensaio).map(l => String(l.ensaio)))].sort()
    this._hist(`${v_ens}: ${Object.values(cont).reduce((a, b) => a + b, 0)} leitura(s) importada(s) `
      + `(${Object.entries(cont).map(([k, v]) => `${k}: ${v}`).join(', ')})`
      + (pastas.length ? ` — ensaio(s) ${pastas.map(p => basename(p)).join(', ')}` : ''))
    const movidas = await this.arquivar_ensaios(pastas)
    this.salvar()
    this.janela.set(null)
    this.v_ens_sel.set(v_ens)
    this.nb.set(2)
    this._carregar_ensaio()
    await messagebox.showinfo('Importar', 'Leituras colocadas:\n' + Object.entries(cont).map(([k, v]) => `${k}: ${v}`).join('\n')
      + (movidas ? `\n\nPasta(s) do ensaio movida(s) para:\n${this.abs(this.pasta_ensaios())}\n(separadas dos ensaios ainda não registrados)` : ''))
  }

  async montar_dialogo() {
    // Monta o ensaio do formulário escolhendo, segmento por segmento, de qual ensaio salvo vêm as leituras
    // (cada segmento feito — ou refeito até dar certo — num arquivo diferente).
    const r = await api({ acao: 'reg_ensaios_salvos', pastas: ['resultados', this.pasta_ensaios()] }).catch(() => ({ lista: [] }))
    const lista = r.lista as EnsaioSalvo[]
    if (!lista.length) {
      await messagebox.showinfo('Montar por segmento', "Nenhum ensaio salvo com leituras em 'resultados' nem na pasta deste registro.")
      return
    }
    this.janela.set({ tipo: 'montar', lista })
  }

  /** montar() do diálogo de montagem por segmento */
  async montar_ok(ens_nome: string, marcados: { ls: LeituraReg[]; e: EnsaioSalvo; rot: string; bloco: string }[], substituir: boolean) {
    const ordem_b = this.reg.ensaios[ens_nome].blocos.map(b => b.nome)
    const blocos = [...new Set(marcados.map(x => x.bloco))].sort((a, b) => (ordem_b.includes(a) ? ordem_b.indexOf(a) : 99) - (ordem_b.includes(b) ? ordem_b.indexOf(b) : 99))
    const ja = this.reg.ensaios[ens_nome].blocos.filter(b => blocos.includes(b.nome) && b.linhas.some(l => l.volume !== null))
    let msg = `Montar '${ens_nome}' com ${marcados.length} segmento(s) em ${blocos.length} bloco(s):\n` + blocos.map(b => `  • ${b}`).join('\n')
    if (ja.length) msg += '\n\nEsses blocos já têm leituras: ' + (substituir ? 'serão SUBSTITUÍDAS.' : 'as novas serão ACRESCENTADAS.')
    if (!await messagebox.askyesno('Montar por segmento', msg)) return false
    const partes = marcados.map(x => [x.ls, x.e.totais] as [LeituraReg[], Record<string, TotReg[]>])
    const [cont, n_tot, avisos] = montar_por_segmento(this.reg, ens_nome, partes, substituir)
    const origem = [...new Map(marcados.map(x => [`${x.e.nome}\u0000${x.rot}`, [x.e.nome, x.rot] as const])).values()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    this._hist(`${ens_nome}: montado por segmento (${substituir ? 'substituindo' : 'acrescentando'}) — `
      + origem.map(([n, r]) => `${r} ← ${n}`).join('; ')
      + ` | ${Object.values(cont).reduce((a, b) => a + b, 0)} leitura(s); ${n_tot} totalizador(es) preenchido(s)`)
    const pastas = [...new Set(marcados.map(x => x.e.rel))].sort()
    const movidas = await this.arquivar_ensaios(pastas)
    this.salvar()
    this.janela.set(null)
    this.v_ens_sel.set(ens_nome)
    this.nb.set(2)
    this._carregar_ensaio()
    await messagebox.showinfo('Montar por segmento', 'Leituras colocadas:\n' + Object.entries(cont).map(([k, v]) => `${k}: ${v}`).join('\n')
      + (n_tot ? `\n\n${n_tot} totalizador(es) de bloco/faixa preenchido(s).` : '')
      + (avisos.length ? '\n\n' + avisos.join('\n') : '')
      + (movidas ? `\n\nPasta(s) de ensaio movida(s) para ${this.abs(this.pasta_ensaios())}` : ''))
    return true
  }

  // ------------------------------------------------------------------ geral
  recarregar_tudo() {
    if (!(this.v_ini_sel.get() in this.reg.iniciais)) this.v_ini_sel.set(INICIAIS[0])
    this._carregar_ensaio()
    this.mudou()
  }

  /** itens da lista do diálogo "Montar por segmento" (montar_lista do Python) */
  itens_montagem(lista: EnsaioSalvo[], ens_nome: string) {
    const ordem_b = this.reg.ensaios[ens_nome].blocos.map(b => b.nome)
    const itens: { e: EnsaioSalvo; rot: string; ls: LeituraReg[]; bloco: string; fmin: number; fs: number[]; sit: string; falhas: number }[] = []
    for (const e of lista) {
      for (const [rot, ls] of Object.entries(e.segmentos)) {
        const bloco = bloco_para_leitura(ens_nome, ls[0]) || (ordem_b.length ? ordem_b[0] : '—')
        const fs = ls.filter(l => l.freq).map(l => Number(l.freq))
        const [, f_fim] = e.defs[rot] ?? [null, null]
        let sit: string
        if (fs.length && f_fim) sit = Math.max(...fs) >= f_fim * 0.99 ? 'completo' : `parou em ${_fmt_mhz(Math.max(...fs))}`
        else sit = !fs.length ? 'sem frequência' : ''
        const falhas = ls.filter(l => !String(l.status ?? 'OK').startsWith('OK')).length
        itens.push({ e, rot, ls, bloco, fmin: fs.length ? Math.min(...fs) : 0, fs, sit, falhas })
      }
    }
    const ib = (b: string) => (ordem_b.includes(b) ? ordem_b.indexOf(b) : 99)
    const cmpS = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
    itens.sort((x, y) => ib(x.bloco) - ib(y.bloco) || x.fmin - y.fmin || cmpS(x.rot, y.rot) || cmpS(x.e.ordem, y.e.ordem))
    const por_seg = new Map<string, typeof itens>()
    for (const x of itens) por_seg.set(x.rot, [...(por_seg.get(x.rot) ?? []), x])
    const escolhido = new Map([...por_seg].map(([rot, xs]) => [rot, xs.reduce((m, x) =>
      (x.ls.length > m.ls.length || (x.ls.length === m.ls.length && x.e.ordem > m.e.ordem) ? x : m))]))
    return itens.map(x => ({ ...x, repetido: (por_seg.get(x.rot)?.length ?? 0) > 1, usar: escolhido.get(x.rot) === x }))
  }

  /** pintar() do diálogo: resumo dos marcados e aviso de frequências repetidas */
  resumo_montagem(marcados: { rot: string; fs: number[]; ls: LeituraReg[]; bloco: string }[]) {
    let n_l = 0
    const blocos = new Map<string, number>()
    for (const x of marcados) { n_l += x.ls.length; blocos.set(x.bloco, (blocos.get(x.bloco) ?? 0) + x.ls.length) }
    const sobrepostos: string[] = []
    marcados.forEach((a, i) => {
      for (const b of marcados.slice(i + 1)) {
        if (a.rot === b.rot && a.fs.length && b.fs.length
          && Math.max(Math.min(...a.fs), Math.min(...b.fs)) <= Math.min(Math.max(...a.fs), Math.max(...b.fs))) sobrepostos.push(a.rot)
      }
    })
    return {
      ruim: sobrepostos.length > 0,
      texto: `${marcados.length} segmento(s)/arquivo(s) marcados, ${n_l} leituras → ` + [...blocos].map(([k, v]) => `${k}: ${v}`).join('; ')
        + (sobrepostos.length ? `\nATENÇÃO: frequências repetidas no mesmo segmento em dois arquivos: ${[...new Set(sobrepostos)].sort().join(', ')}` : ''),
    }
  }
}
