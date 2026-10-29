'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Play, Pause, Check, RotateCcw, Wand2, Settings2, AlertTriangle, Loader2, X, Timer, Undo2, Pin,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { today } from '@/app/cispr15/types'
import type { AgendaItemEmc, EnsaioCatalogo } from '@/lib/emc/tipos'
import type { ConfigPlanner, Pessoa, Tarefa } from '@/lib/emc/planner/tipos'
import { JORNADA_PADRAO } from '@/lib/emc/planner/tipos'
import {
  cronogramaSemana, organizarSemana, diasDaSemana, segundaDe, somarDias, minutosUteis, minutoUtilDe, fmtDuracao,
  tempoGastoMs, tempoDoEnsaio, habilitada, chavePrioridade, type Bloco, type Proposta,
} from '@/lib/emc/planner/logica'
import {
  carregarPlanner, criarTarefa, atualizarTarefa, acaoTarefa, aplicarOrganizacao,
} from '@/lib/emc/planner/cliente'
import { fmtDate } from '@/app/agenda/emc/comum'

/* Planner da imunidade: quadro da semana (uma linha por pessoa, uma coluna por
   dia). A fila à esquerda são os ensaios pendentes da agenda EMC ainda sem dia;
   arrastar um cartão para uma célula escala o ensaio para aquela pessoa naquele
   dia (e o fixa: o "Organizar semana" não o tira do lugar). Os horários de cada
   cartão saem do cronograma (lib/emc/planner/logica.ts): ordem do dia, setup,
   montagem e tempo do ensaio. */

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const SEM_PESSOA = ''

type Arrasto = { tipo: 'tarefa'; id: string } | { tipo: 'fila'; itemId: string; ensaioId: string }

const fmtCron = (ms: number) => {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`
}

export function PlannerEmc({ itens, catalogo, onAgendaMudou }: {
  itens: AgendaItemEmc[]; catalogo: EnsaioCatalogo[]; onAgendaMudou: () => void
}) {
  const router = useRouter()
  const [cfg,        setCfg]        = useState<ConfigPlanner>({ pessoas: [], setups: [], tempos: [], jornada: JORNADA_PADRAO })
  const [tarefas,    setTarefas]    = useState<Tarefa[]>([])
  const [usuario,    setUsuario]    = useState('')
  const [carregando, setCarregando] = useState(true)
  const [corrompido, setCorrompido] = useState(false)
  const [erro,       setErro]       = useState<string | null>(null)
  const [segunda,    setSegunda]    = useState(() => segundaDe(today()))
  const [agora,      setAgora]      = useState(() => Date.now())
  const [proposta,   setProposta]   = useState<Proposta | null>(null)
  const [aplicando,  setAplicando]  = useState(false)
  const [soEu,       setSoEu]       = useState(false)
  const [sobre,      setSobre]      = useState<string | null>(null)   // célula com arrasto em cima

  async function recarregar() {
    try {
      const r = await carregarPlanner()
      setCfg(r.cfg); setTarefas(r.tarefas); setUsuario(r.usuario); setCorrompido(r.corrompido); setErro(null)
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
    finally { setCarregando(false) }
  }
  useEffect(() => {
    recarregar()
    const t = setInterval(recarregar, 20_000)        // play/pausa dados em outros PCs
    return () => clearInterval(t)
  }, [])
  const rodando = tarefas.some(t => t.status === 'execucao')
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), rodando ? 1000 : 30_000)
    return () => clearInterval(t)
  }, [rodando])

  const hoje = today()
  const dias = useMemo(() => diasDaSemana(segunda, cfg.jornada), [segunda, cfg.jornada])
  const itensMap = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens])
  const catMap = useMemo(() => new Map(catalogo.map(c => [c.id, c])), [catalogo])
  const setupMap = useMemo(() => new Map(cfg.setups.map(s => [s.id, s])), [cfg.setups])
  const eu = cfg.pessoas.find(p => p.usuarioWindows && p.usuarioWindows.toLowerCase() === usuario.toLowerCase())
  const W = minutosUteis(cfg.jornada)
  const agoraMin = minutoUtilDe(new Date(agora).getHours() * 60 + new Date(agora).getMinutes(), cfg.jornada)

  // tarefas de amostras que ainda existem
  const validas = useMemo(() => tarefas.filter(t => itensMap.has(t.itemId)), [tarefas, itensMap])
  const crono = useMemo(
    () => cronogramaSemana(cfg, validas, itensMap, dias, hoje, agoraMin, agora),
    [cfg, validas, itensMap, dias, hoje, agoraMin, agora],
  )

  // fila: ensaios pendentes de amostras em andamento sem tarefa com dia
  const fila = useMemo(() => {
    const comDia = new Set(validas.filter(t => t.dia).map(t => `${t.itemId}|${t.ensaioId}`))
    return itens
      .filter(i => !i.numRelatorio)
      .sort((a, b) => chavePrioridade(a).localeCompare(chavePrioridade(b)))
      .map(i => ({ item: i, ensaios: i.ensaios.filter(e => e.status === 'pendente' && !comDia.has(`${i.id}|${e.ensaioId}`)) }))
      .filter(g => g.ensaios.length)
  }, [itens, validas])

  const linhas: (Pessoa | null)[] = useMemo(() => {
    const ativas = cfg.pessoas.filter(p => p.ativo && (!soEu || p.id === eu?.id))
    const semPessoa = !soEu && validas.some(t => dias.includes(t.dia) && !t.pessoaId)
    return [...ativas, ...(semPessoa ? [null] : [])]
  }, [cfg.pessoas, soEu, eu, validas, dias])

  const tarefasDaCelula = (pessoaId: string, dia: string) => validas
    .filter(t => t.dia === dia && (t.pessoaId || SEM_PESSOA) === pessoaId)
    .sort((a, b) => a.ordem - b.ordem)

  async function executar<T>(f: () => Promise<T>) {
    try { return await f() }
    catch (e) { alert(e instanceof Error ? e.message : String(e)) }
    finally { recarregar() }
  }

  async function soltar(a: Arrasto, pessoaId: string, dia: string, antesDe?: Tarefa) {
    setSobre(null)
    const ensaioId = a.tipo === 'fila' ? a.ensaioId : tarefas.find(t => t.id === a.id)?.ensaioId
    const pessoa = cfg.pessoas.find(p => p.id === pessoaId)
    if (pessoa && ensaioId && !habilitada(pessoa, ensaioId)) {
      const cod = catMap.get(ensaioId)?.codigo ?? ensaioId
      if (!confirm(`${pessoa.nome} não está habilitado(a) para o ${cod}. Escalar mesmo assim?`)) return
    }
    const doDia = validas.filter(t => t.dia === dia && (a.tipo === 'fila' || t.id !== a.id))
    const ordem = antesDe ? antesDe.ordem - 0.5 : Math.max(0, ...doDia.map(t => t.ordem + 1))
    if (a.tipo === 'fila') {
      const item = itensMap.get(a.itemId)
      const setupId = tempoDoEnsaio(cfg, a.ensaioId, item)?.tempo.setupId ?? ''
      await executar(() => criarTarefa({ itemId: a.itemId, ensaioId: a.ensaioId, pessoaId, dia, ordem, setupId, fixada: true }))
    } else {
      await executar(() => atualizarTarefa(a.id, { pessoaId, dia, ordem, fixada: true }))
    }
  }

  async function voltarParaFila(id: string) {
    const t = tarefas.find(x => x.id === id)
    if (!t) return
    if (t.status !== 'afazer' && !confirm('Esta tarefa já foi iniciada. Tirar do dia mesmo assim? O tempo registrado fica guardado.')) return
    await executar(() => atualizarTarefa(id, { dia: '', fixada: false }))
  }

  async function acao(t: Tarefa, a: 'iniciar' | 'pausar' | 'concluir' | 'reabrir') {
    if (a === 'concluir' && !confirm('Concluir o ensaio? Ele fica como realizado na agenda EMC.')) return
    await executar(async () => {
      await acaoTarefa(t.id, a, eu?.id)
      if (a === 'concluir') onAgendaMudou()
    })
  }

  function organizar() {
    setProposta(organizarSemana(cfg, itens, validas, dias, hoje, agoraMin, agora))
  }
  async function aplicar() {
    if (!proposta) return
    setAplicando(true)
    await executar(() => aplicarOrganizacao(proposta.alocacoes))
    setAplicando(false); setProposta(null)
  }

  const semCadastro = !cfg.pessoas.length || !cfg.setups.length || !cfg.tempos.length

  /* ─── cartão ─── (função, não componente: o relógio re-renderiza a cada
     segundo e um componente definido aqui dentro seria remontado, cortando o arrasto) */
  function cartao(t: Tarefa, b?: Bloco) {
    const item = itensMap.get(t.itemId)!
    const cat = catMap.get(t.ensaioId)
    const setup = setupMap.get(t.setupId)
    const pessoa = cfg.pessoas.find(p => p.id === t.pessoaId)
    const gasto = tempoGastoMs(t, agora)
    const est = b?.estimativaMin ?? 0
    const atrasada = t.status === 'afazer' && t.dia < hoje
    const agendaFeito = item.ensaios.find(e => e.ensaioId === t.ensaioId)?.status
    const pct = est ? Math.min(100, (gasto / 60000 / est) * 100) : 0
    return (
      <div key={t.id} draggable
        onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'tarefa', id: t.id })); e.dataTransfer.effectAllowed = 'move' }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation()
          try { soltar(JSON.parse(e.dataTransfer.getData('text/plain')), t.pessoaId || SEM_PESSOA, t.dia, t) } catch {}
        }}
        style={{ borderLeftColor: pessoa?.cor ?? 'rgba(255,255,255,0.15)' }}
        className={cn('group rounded-md border border-l-[3px] px-2 py-1.5 text-[10px] cursor-grab active:cursor-grabbing select-none',
          t.status === 'execucao' ? 'border-green-400/40 bg-green-400/10'
            : t.status === 'pausada' ? 'border-amber-400/35 bg-amber-400/8'
            : t.status === 'feita' ? 'border-teal/20 bg-teal/5 opacity-60'
            : atrasada ? 'border-red-500/35 bg-red-500/8'
            : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]')}>
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-mono font-bold text-[9px] px-1 rounded border border-white/15 text-teal whitespace-nowrap shrink-0">{cat?.codigo ?? t.ensaioId}</span>
          <span className="font-mono font-bold text-white/85 truncate min-w-0" title={`${item.protocolo} · ${item.cliente}`}>
            {item.protocolo.split('_')[0] || '—'}
          </span>
          {b?.relogio && <Timer size={9} className="text-purple-300 shrink-0" aria-label="medição por relógio" />}
          {t.fixada && <Pin size={8} className="text-white/25 shrink-0" aria-label="fixada à mão" />}
        </div>
        <div className="text-white/40 truncate">{item.produto || item.template.nome}{setup ? ` · ${setup.nome}` : ''}</div>
        <div className="flex items-center gap-1.5 font-mono text-white/45 mt-0.5 min-w-0">
          <span className="truncate min-w-0 flex-1">
          {b?.semTempo ? <span className="text-amber-300/80">sem tempo cadastrado</span>
            : t.status === 'feita' ? <span className="text-teal/80">feito em {fmtCron(gasto)} · est. {fmtDuracao(est)}</span>
            : <>
              {b?.inicio && <span className={cn(b.foraDoHorario && 'text-red-400')} title={b.foraDoHorario ? 'passa do fim da jornada' : undefined}>{b.inicio}–{b.fim} </span>}
              <span title={b?.montagemMin ? `${fmtDuracao(b.ensaioMin)} de ensaio + ${fmtDuracao(b.montagemMin)} de montagem` : undefined}>
                {fmtDuracao(est)}{b?.montagemMin ? '*' : ''}
              </span>
            </>}
          </span>
          {t.status === 'afazer' || t.status === 'pausada' ? (
            <button type="button" title="Iniciar" onClick={() => acao(t, 'iniciar')} className="text-green-400/80 hover:text-green-300"><Play size={11} /></button>
          ) : t.status === 'execucao' ? (
            <button type="button" title="Pausar" onClick={() => acao(t, 'pausar')} className="text-amber-300 hover:text-amber-200"><Pause size={11} /></button>
          ) : (
            <button type="button" title="Reabrir" onClick={() => acao(t, 'reabrir')} className="text-white/30 hover:text-white/70"><RotateCcw size={10} /></button>
          )}
          {t.status !== 'feita' && (
            <button type="button" title="Concluir" onClick={() => acao(t, 'concluir')} className="text-teal/70 hover:text-teal"><Check size={11} /></button>
          )}
          <button type="button" title="Voltar para a fila" onClick={() => voltarParaFila(t.id)}
            className="text-white/20 hover:text-white/60 opacity-0 group-hover:opacity-100"><Undo2 size={10} /></button>
        </div>
        {t.status !== 'afazer' && t.status !== 'feita' && (
          <div className="mt-1">
            <div className="flex justify-between font-mono text-[9px]">
              <span className={t.status === 'execucao' ? 'text-green-300' : 'text-amber-300'}>{fmtCron(gasto)}</span>
              {est > 0 && <span className={cn(gasto / 60000 > est ? 'text-red-400' : 'text-white/30')}>{Math.round(pct)}%</span>}
            </div>
            <div className="h-1 rounded bg-white/8 overflow-hidden">
              <div className={cn('h-full', gasto / 60000 > est ? 'bg-red-400' : t.status === 'execucao' ? 'bg-green-400' : 'bg-amber-400')} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        {agendaFeito && agendaFeito !== 'pendente' && t.status !== 'feita' && (
          <div className="text-[9px] text-teal/70 mt-0.5">já {agendaFeito} na agenda{item.ensaios.find(e => e.ensaioId === t.ensaioId)?.fonte === 'radian' ? ' (Radian)' : ''}</div>
        )}
        {atrasada && <div className="text-[9px] text-red-400/80 mt-0.5">ficou para trás — arraste para outro dia</div>}
      </div>
    )
  }

  const nomeDia = (d: string) => `${DIAS_SEMANA[new Date(d + 'T12:00:00').getDay()]} ${fmtDate(d).slice(0, 5)}`
  const compacto = (d: string) => d < hoje && !validas.some(t => t.dia === d)

  return (
    <div className="space-y-3">
      {(corrompido || erro) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/8 text-red-300 text-[11px]">
          <AlertTriangle size={12} /> {erro ?? 'Um arquivo do planner na rede não pôde ser lido. Nada será gravado por cima dele.'}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setSegunda(s => somarDias(s, -7))} className="w-7 h-7 rounded border border-white/10 text-white/50 hover:text-white flex items-center justify-center"><ChevronLeft size={13} /></button>
          <span className="text-xs font-semibold text-white/80 px-2 min-w-[150px] text-center">
            Semana de {fmtDate(segunda).slice(0, 5)} a {fmtDate(somarDias(segunda, 6)).slice(0, 5)}
          </span>
          <button type="button" onClick={() => setSegunda(s => somarDias(s, 7))} className="w-7 h-7 rounded border border-white/10 text-white/50 hover:text-white flex items-center justify-center"><ChevronRight size={13} /></button>
          {segunda !== segundaDe(hoje) && (
            <button type="button" onClick={() => setSegunda(segundaDe(hoje))} className="text-[11px] text-white/40 hover:text-gold px-2">Hoje</button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-white/45 ml-2" title={eu ? `Você é ${eu.nome} (usuário ${usuario})` : `Usuário do Windows "${usuario}" não está cadastrado no planner`}>
          <input type="checkbox" className="accent-teal w-3.5 h-3.5" checked={soEu} disabled={!eu} onChange={e => setSoEu(e.target.checked)} />
          Só eu{eu ? ` (${eu.nome})` : ''}
        </label>
        <div className="flex-1" />
        <span className="text-[10px] text-white/25 font-mono">jornada {cfg.jornada.inicio}–{cfg.jornada.fim} · {fmtDuracao(W)} úteis</span>
        <button type="button" onClick={() => router.push('/emc/planner')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-teal hover:border-teal/30 text-xs font-semibold transition-all">
          <Settings2 size={11} /> Pessoas, setups e tempos
        </button>
        <button type="button" onClick={organizar} disabled={semCadastro || corrompido}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40">
          <Wand2 size={11} /> Organizar semana
        </button>
      </div>

      {semCadastro && !carregando && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-amber-400/25 bg-amber-400/6 text-[11px] text-amber-200/90">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            Para o planner organizar, cadastre em <button type="button" className="underline" onClick={() => router.push('/emc/planner')}>Pessoas, setups e tempos</button>:
            {!cfg.pessoas.length && ' as pessoas e as habilitações;'}
            {!cfg.setups.length && ' os setups (bancadas/câmaras);'}
            {!cfg.tempos.length && ' o setup e o tempo de cada ensaio.'}
            {' '}Dá para arrastar da fila à mão enquanto isso.
          </span>
        </div>
      )}

      {carregando ? (
        <div className="card p-8 text-center text-white/30 text-sm flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando planner…</div>
      ) : (
        <div className="flex gap-3 items-start">
          {/* Fila */}
          <div className="w-[190px] shrink-0 card p-2 space-y-2 max-h-[75vh] overflow-y-auto"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              try { const a = JSON.parse(e.dataTransfer.getData('text/plain')) as Arrasto; if (a.tipo === 'tarefa') voltarParaFila(a.id) } catch {}
            }}>
            <p className="text-[10px] text-white/35 font-mono uppercase tracking-widest px-1">Fila · {fila.reduce((n, g) => n + g.ensaios.length, 0)} ensaio(s)</p>
            {fila.length === 0 && <p className="text-[11px] text-white/25 px-1">Nenhum ensaio pendente sem dia.</p>}
            {fila.map(({ item, ensaios }) => (
              <div key={item.id} className="rounded-md border border-white/8 bg-white/[0.02] p-1.5">
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="font-mono font-bold text-white/80 truncate">{item.protocolo.split('_')[0] || '—'}</span>
                  <span className="flex-1" />
                  <span className={cn('font-mono text-[9px]', item.previsaoSaida && item.previsaoSaida < hoje ? 'text-red-400' : 'text-white/30')}>
                    {item.previsaoSaida ? fmtDate(item.previsaoSaida).slice(0, 5) : 'sem prazo'}
                  </span>
                </div>
                <div className="text-[9px] text-white/35 truncate mb-1">{item.cliente}{item.produto ? ` · ${item.produto}` : ''}</div>
                <div className="flex flex-wrap gap-0.5">
                  {ensaios.map(e => {
                    const tc = tempoDoEnsaio(cfg, e.ensaioId, item)
                    return (
                      <span key={e.ensaioId} draggable
                        onDragStart={ev => { ev.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'fila', itemId: item.id, ensaioId: e.ensaioId })); ev.dataTransfer.effectAllowed = 'move' }}
                        title={tc ? `${e.nome} · ${fmtDuracao(tc.ensaioMin)}${tc.relogio ? ' (relógio)' : ''} + ${fmtDuracao(tc.montagemMin)} montagem` : `${e.nome} · sem tempo cadastrado`}
                        className={cn('inline-flex items-center gap-0.5 font-mono font-bold text-[9px] px-1.5 py-0.5 rounded border cursor-grab',
                          tc ? 'border-white/15 text-white/60 hover:border-teal/40 hover:text-teal' : 'border-amber-400/30 text-amber-300/70')}>
                        {e.codigo}{e.relogio && <Timer size={8} className="opacity-60" />}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Quadro */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <table className="border-separate border-spacing-1 w-full min-w-[760px] table-fixed">
              {/* dia que já passou sem tarefa fica estreito: o espaço vai para os dias que importam */}
              <colgroup>
                <col style={{ width: 110 }} />
                {dias.map(d => <col key={d} style={compacto(d) ? { width: 58 } : undefined} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="w-[110px]" />
                  {dias.map(d => {
                    const doDia = validas.filter(t => t.dia === d)
                    const feitas = doDia.filter(t => t.status === 'feita').length
                    const pct = doDia.length ? (feitas / doDia.length) * 100 : 0
                    if (compacto(d)) return (
                      <th key={d} className="text-left font-normal px-1.5 py-1 rounded-md bg-white/[0.02]">
                        <div className="text-[10px] text-white/30 capitalize leading-tight whitespace-pre-line">{nomeDia(d).replace(' ', '\n')}</div>
                      </th>
                    )
                    return (
                      <th key={d} className={cn('text-left font-normal px-1.5 py-1 rounded-md', d === hoje ? 'bg-gold/10 border border-gold/25' : 'bg-white/[0.03]')}>
                        <div className={cn('text-[11px] font-semibold capitalize', d === hoje ? 'text-gold' : 'text-white/70')}>{nomeDia(d)}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="flex-1 h-1 rounded bg-white/8 overflow-hidden"><div className="h-full bg-teal/70" style={{ width: `${pct}%` }} /></div>
                          <span className="text-[9px] font-mono text-white/35">{feitas}/{doDia.length}</span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr><td colSpan={dias.length + 1} className="text-center text-[11px] text-white/25 py-8">Nenhuma pessoa ativa cadastrada.</td></tr>
                )}
                {linhas.map(p => {
                  const pid = p?.id ?? SEM_PESSOA
                  return (
                    <tr key={pid || 'sem'}>
                      <td className="align-top px-1.5 py-1.5 rounded-md bg-white/[0.03]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p?.cor ?? 'rgba(255,255,255,0.2)' }} />
                          <span className={cn('text-[11px] font-semibold truncate', p ? 'text-white/80' : 'text-white/35 italic')}>{p?.nome ?? 'Sem pessoa'}</span>
                        </div>
                        {p && <div className="text-[9px] text-white/25 mt-0.5 leading-tight">{p.habilitacoes.map(h => catMap.get(h)?.codigo ?? h).join(' · ') || 'sem habilitação'}</div>}
                      </td>
                      {dias.map(d => {
                        const chave = `${pid}|${d}`
                        const lista = tarefasDaCelula(pid, d)
                        const carga = crono.carga.get(d)?.get(pid) ?? 0
                        const pct = W ? (carga / W) * 100 : 0
                        return (
                          <td key={d}
                            onDragOver={e => { e.preventDefault(); if (sobre !== chave) setSobre(chave) }}
                            onDragLeave={() => setSobre(s => s === chave ? null : s)}
                            onDrop={e => {
                              e.preventDefault()
                              try { soltar(JSON.parse(e.dataTransfer.getData('text/plain')), pid, d) } catch {}
                            }}
                            className={cn('align-top p-1 rounded-md border min-h-[60px] transition-colors',
                              sobre === chave ? 'border-teal/50 bg-teal/8' : d === hoje ? 'border-gold/15 bg-gold/[0.03]' : 'border-white/6 bg-white/[0.015]')}>
                            {p && !compacto(d) && (
                              <div className="flex items-center gap-1 mb-1" title={`${fmtDuracao(carga)} de ${fmtDuracao(W)}`}>
                                <div className="flex-1 h-0.5 rounded bg-white/6 overflow-hidden">
                                  <div className={cn('h-full', pct > 100 ? 'bg-red-400' : pct > 85 ? 'bg-amber-400' : 'bg-white/30')} style={{ width: `${Math.min(100, pct)}%` }} />
                                </div>
                                {carga > 0 && <span className={cn('text-[8px] font-mono', pct > 100 ? 'text-red-400' : 'text-white/25')}>{fmtDuracao(carga)}</span>}
                              </div>
                            )}
                            <div className="space-y-1 min-h-[40px]">
                              {lista.map(t => cartao(t, crono.blocos.get(t.id)))}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Prévia do "Organizar semana" */}
      {proposta && (
        <PreviaOrganizacao proposta={proposta} cfg={cfg} tarefas={validas} itensMap={itensMap} catMap={catMap}
          dias={dias} hoje={hoje} agoraMin={agoraMin} agora={agora} aplicando={aplicando}
          onAplicar={aplicar} onFechar={() => setProposta(null)} nomeDia={nomeDia} />
      )}
    </div>
  )
}

function PreviaOrganizacao({ proposta, cfg, tarefas, itensMap, catMap, dias, hoje, agoraMin, agora, aplicando, onAplicar, onFechar, nomeDia }: {
  proposta: Proposta; cfg: ConfigPlanner; tarefas: Tarefa[]; itensMap: Map<string, AgendaItemEmc>; catMap: Map<string, EnsaioCatalogo>
  dias: string[]; hoje: string; agoraMin: number; agora: number; aplicando: boolean
  onAplicar: () => void; onFechar: () => void; nomeDia: (d: string) => string
}) {
  // tarefas como ficariam, para mostrar os horários da proposta
  const simuladas = useMemo(() => {
    const out = tarefas.map(t => ({ ...t }))
    proposta.alocacoes.forEach((a, i) => {
      const t = out.find(x => (a.id && x.id === a.id) || (x.itemId === a.itemId && x.ensaioId === a.ensaioId))
      if (t) Object.assign(t, { pessoaId: a.pessoaId, setupId: a.setupId, dia: a.dia, ordem: a.ordem })
      else out.push({ id: `nova-${i}`, itemId: a.itemId, ensaioId: a.ensaioId, pessoaId: a.pessoaId, setupId: a.setupId, dia: a.dia, ordem: a.ordem, status: 'afazer', sessoes: [] })
    })
    return out
  }, [proposta, tarefas])
  const crono = useMemo(() => cronogramaSemana(cfg, simuladas, itensMap, dias, hoje, agoraMin, agora), [cfg, simuladas, itensMap, dias, hoje, agoraMin, agora])
  const pessoaNome = (id: string) => cfg.pessoas.find(p => p.id === id)?.nome ?? '—'
  const setupNome = (id: string) => cfg.setups.find(s => s.id === id)?.nome ?? '—'
  const porDia = dias.map(d => ({ d, lista: simuladas.filter(t => t.dia === d && t.status !== 'feita').sort((a, b) => a.ordem - b.ordem) }))
    .filter(x => x.lista.length)
  const montagens = [...crono.blocos.values()].filter(b => b.montagemMin > 0 && simuladas.some(t => t.id === b.tarefaId && dias.includes(t.dia))).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="card w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/8">
          <Wand2 size={14} className="text-gold" />
          <p className="font-bold text-white text-sm">Organizar semana — prévia</p>
          <div className="flex-1" />
          <button type="button" onClick={onFechar} className="text-white/40 hover:text-white"><X size={14} /></button>
        </div>
        <div className="px-5 py-3 overflow-y-auto space-y-4 text-[11px]">
          <p className="text-white/45">
            {proposta.alocacoes.length} tarefa(s) na semana · {montagens} montagem(ns) de setup.
            Tarefas em execução, pausadas ou fixadas à mão ficam onde estão; as demais são redistribuídas por lotes de configuração e prazo.
          </p>
          {porDia.map(({ d, lista }) => (
            <div key={d}>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1 capitalize">{nomeDia(d)}</p>
              <div className="space-y-px">
                {lista.map(t => {
                  const b = crono.blocos.get(t.id)
                  const item = itensMap.get(t.itemId)
                  return (
                    <div key={t.id} className="grid grid-cols-[90px_110px_50px_1fr_140px] gap-2 px-2 py-1 rounded bg-white/[0.03] font-mono">
                      <span className={cn(b?.foraDoHorario ? 'text-red-400' : 'text-white/60')}>{b?.inicio ? `${b.inicio}–${b.fim}` : '—'}</span>
                      <span className="text-white/80 truncate">{item?.protocolo.split('_')[0]}</span>
                      <span className="text-teal font-bold">{catMap.get(t.ensaioId)?.codigo ?? t.ensaioId}</span>
                      <span className="text-white/45 truncate font-sans">{setupNome(t.setupId)}{b?.montagemMin ? ` · +${fmtDuracao(b.montagemMin)} montagem` : ''}</span>
                      <span className="text-white/60 truncate font-sans">{pessoaNome(t.pessoaId)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {proposta.naoAlocados.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-amber-300/70 mb-1">Ficaram na fila ({proposta.naoAlocados.length})</p>
              <div className="space-y-px">
                {proposta.naoAlocados.map((n, i) => (
                  <div key={i} className="grid grid-cols-[110px_50px_1fr] gap-2 px-2 py-1 rounded bg-amber-400/5 font-mono">
                    <span className="text-white/70">{itensMap.get(n.itemId)?.protocolo.split('_')[0]}</span>
                    <span className="text-amber-300 font-bold">{catMap.get(n.ensaioId)?.codigo ?? n.ensaioId}</span>
                    <span className="text-white/45 font-sans">{n.motivo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 py-3 border-t border-white/8">
          <div className="flex-1" />
          <button type="button" onClick={onFechar} className="px-4 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white text-xs">Cancelar</button>
          <button type="button" onClick={onAplicar} disabled={aplicando || !proposta.alocacoes.length}
            className="btn-primary px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40">
            {aplicando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}
