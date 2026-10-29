'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Lock, Plus, Trash2, Save, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SETTINGS_KEY, today } from '@/app/cispr15/types'
import type { ConfigEnsaiosEmc, Respostas, TemplateEnsaio } from '@/lib/emc/tipos'
import { ensaiosComRelogio } from '@/lib/emc/regras'
import { Icone } from '@/lib/taxonomia/icones'
import { EditorCondicoes, novaCondicao } from '@/app/emc/EditorCondicoes'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import { CONFIG_EMC_PADRAO } from '@/lib/emc/padrao'
import { carregarConfigEmc } from '@/lib/emc/cliente'
import type { AcrescimoTempo, ConfigPlanner, Pessoa, Setup, Tarefa, TempoEnsaio, TempoPorTipo } from '@/lib/emc/planner/tipos'
import { JORNADA_PADRAO, CORES_PESSOA } from '@/lib/emc/planner/tipos'
import { carregarPlanner, salvarConfigPlanner } from '@/lib/emc/planner/cliente'
import { fmtDuracao, minutosUteis, tempoGastoMs, tempoDoEnsaio } from '@/lib/emc/planner/logica'
import { Label } from '@/app/agenda/emc/comum'

/* Cadastros do planner da imunidade: pessoas (e o que cada uma é habilitada a
   executar), setups (bancadas/câmaras com os equipamentos), o setup e o tempo de
   cada ensaio do catálogo, e a jornada. Protegido pela senha de emissão das
   Configurações, como os templates de ensaio (conferida de novo na rota). */

const novoId = (base: string) =>
  (base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item')
  + '-' + Math.random().toString(36).slice(2, 6)

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function Minutos({ valor, onChange, placeholder }: { valor?: number; onChange: (v?: number) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-1">
      <input type="number" min={0} step={5} className="input text-xs font-mono w-[70px] py-1" placeholder={placeholder}
        value={valor ?? ''} onChange={e => onChange(e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))} />
      <span className="text-[9px] text-white/25 font-mono w-9">{valor ? fmtDuracao(valor) : ''}</span>
    </div>
  )
}

/* Tempo de um ensaio por tipo de equipamento: montagem, por amostra e com relógio
   próprios, mais acréscimos conforme as respostas do cadastro da amostra (mede
   reativa, aquisição pelo software…). A prévia calcula cada combinação com a
   mesma função do planner (tempoDoEnsaio). */
function PorTipo({ cfg, ensaioId, tempo, templates, onChange }: {
  cfg: ConfigPlanner; ensaioId: string; tempo?: TempoEnsaio; templates: TemplateEnsaio[]
  onChange: (porTipo: Record<string, TempoPorTipo>) => void
}) {
  // só os tipos que fazem este ensaio (ou que já têm tempo próprio para ele)
  const tipos = templates.filter(tp => tp.regras.some(r => r.ensaioId === ensaioId) || tempo?.porTipo?.[tp.id])
  const mudar = (tpId: string, novo: TempoPorTipo) => {
    const porTipo = { ...(tempo?.porTipo ?? {}) }
    const vazio = novo.montagemMin === undefined && novo.ensaioMin === undefined && novo.relogioMin === undefined && !novo.acrescimos?.length
    if (vazio) delete porTipo[tpId]
    else porTipo[tpId] = novo
    onChange(porTipo)
  }
  return (
    <div className="ml-[96px] my-1.5 space-y-1.5">
      <p className="text-[10px] text-white/30">Por tipo de equipamento (vazio = o geral acima). Acréscimos somam ao tempo por amostra (ou ao c/ relógio) quando o cadastro da amostra bate.</p>
      {tipos.length === 0 && <p className="text-[10px] text-white/25 italic">Nenhum tipo de equipamento faz este ensaio.</p>}
      {tipos.length > 0 && (
        <div className="grid grid-cols-[200px_110px_110px_110px] gap-2 px-2 text-[9px] text-white/30 font-mono uppercase tracking-widest">
          <span>Tipo</span><span>Montagem</span><span>Por amostra</span><span>c/ relógio</span>
        </div>
      )}
      {tipos.map(tp => {
        const pt = tempo?.porTipo?.[tp.id] ?? {}
        const temRelogio = tp.perguntas.some(p => p.marcaRelogio?.includes(ensaioId))
        const acrescimos = pt.acrescimos ?? []
        const setAcr = (lista: AcrescimoTempo[]) => mudar(tp.id, { ...pt, acrescimos: lista })
        return (
          <div key={tp.id} className="p-2 rounded-lg bg-white/[0.02] border border-white/6 space-y-1.5">
            <div className="grid grid-cols-[200px_110px_110px_110px] gap-2 items-center">
              <span className="flex items-center gap-1.5 text-[11px] text-white/65 truncate"><Icone name={tp.icone} size={12} className="text-teal/70 shrink-0" />{tp.nome}</span>
              <Minutos valor={pt.montagemMin} onChange={v => mudar(tp.id, { ...pt, montagemMin: v })} placeholder="geral" />
              <Minutos valor={pt.ensaioMin} onChange={v => mudar(tp.id, { ...pt, ensaioMin: v })} placeholder="geral" />
              {temRelogio
                ? <Minutos valor={pt.relogioMin} onChange={v => mudar(tp.id, { ...pt, relogioMin: v })} placeholder="geral" />
                : <span className="text-[9px] text-white/20 font-mono" title="Este tipo não mede este ensaio por relógio">sem relógio</span>}
            </div>
            {acrescimos.map((a, i) => (
              <div key={i} className="flex items-start gap-2 pl-[208px]">
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-white/40 font-mono">+</span>
                  <input type="number" step={5} className="input text-xs font-mono w-[64px] py-0.5" value={a.minutos}
                    onChange={ev => setAcr(acrescimos.map((x, j) => j === i ? { ...x, minutos: Number(ev.target.value) || 0 } : x))} />
                  <span className="text-[10px] text-white/40">min quando</span>
                </div>
                <EditorCondicoes conds={a.quando} perguntas={tp.perguntas} vazio="(escolha a condição)"
                  onChange={c => setAcr(acrescimos.map((x, j) => j === i ? { ...x, quando: c } : x))} />
                <button type="button" title="Tirar acréscimo" onClick={() => setAcr(acrescimos.filter((_, j) => j !== i))}
                  className="text-white/25 hover:text-red-400 pt-0.5"><Trash2 size={11} /></button>
              </div>
            ))}
            {tp.perguntas.length > 0 && (
              <button type="button" className="ml-[208px] text-[10px] text-white/35 hover:text-teal flex items-center gap-1"
                onClick={() => { const c = novaCondicao(tp.perguntas); setAcr([...acrescimos, { quando: c ? [c] : [], minutos: 10 }]) }}>
                <Plus size={9} /> acréscimo por resposta do cadastro
              </button>
            )}
            <PreviaTempo cfg={cfg} ensaioId={ensaioId} tempo={tempo} tp={tp} />
          </div>
        )
      })}
    </div>
  )
}

/** Todas as combinações das perguntas que mexem no tempo deste ensaio (as dos acréscimos e a do relógio). */
function PreviaTempo({ cfg, ensaioId, tempo, tp }: { cfg: ConfigPlanner; ensaioId: string; tempo?: TempoEnsaio; tp: TemplateEnsaio }) {
  if (!tempo?.setupId) return <p className="pl-[208px] text-[10px] text-white/25 italic">Escolha o setup do ensaio para ver os tempos.</p>
  const usadas = new Set<string>()
  tp.perguntas.forEach(p => { if (p.marcaRelogio?.includes(ensaioId)) usadas.add(p.id) })
  tempo.porTipo?.[tp.id]?.acrescimos?.forEach(a => a.quando.forEach(c => usadas.add(c.perguntaId)))
  const perguntas = tp.perguntas.filter(p => usadas.has(p.id) && p.tipo !== 'multipla')
  let combos: Respostas[] = [{}]
  for (const p of perguntas) {
    const vals = p.tipo === 'simnao' ? ['nao', 'sim'] : (p.opcoes ?? [])
    combos = combos.flatMap(c => vals.map(v => ({ ...c, [p.id]: v })))
    if (combos.length > 16) break
  }
  const linhas = combos.slice(0, 16).map(resp => {
    const relogio = ensaiosComRelogio(tp, resp).has(ensaioId)
    const tc = tempoDoEnsaio(cfg, ensaioId, { templateId: tp.id, template: tp, respostas: resp, ensaios: [{ ensaioId, codigo: '', nome: '', status: 'pendente', relogio }] })
    const rotulo = perguntas.map(p => {
      const v = resp[p.id]
      if (p.tipo === 'simnao') return v === 'sim' ? (p.etiqueta || p.texto) : ''
      return String(v ?? '')
    }).filter(Boolean).join(' + ') || 'básico'
    return { rotulo, min: tc?.ensaioMin ?? 0 }
  })
  return (
    <div className="pl-[208px] flex flex-wrap gap-1">
      {linhas.map((l, i) => (
        <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/8 text-white/50">
          {l.rotulo} <span className="text-teal/80">{fmtDuracao(l.min)}</span>
        </span>
      ))}
    </div>
  )
}

export default function PlannerCadastrosPage() {
  const router = useRouter()
  const [cfg,        setCfg]        = useState<ConfigPlanner>({ pessoas: [], setups: [], tempos: [], jornada: JORNADA_PADRAO })
  const [original,   setOriginal]   = useState('')
  const [emc,        setEmc]        = useState<ConfigEnsaiosEmc>(CONFIG_EMC_PADRAO)
  const [equip,      setEquip]      = useState<EquipamentoEMC[]>([])
  const [tarefas,    setTarefas]    = useState<Tarefa[]>([])
  const [usuario,    setUsuario]    = useState('')
  const [aba,        setAba]        = useState<'pessoas' | 'setups' | 'tempos' | 'jornada'>('pessoas')
  const [aberto,     setAberto]     = useState<string | null>(null)
  const [buscaEq,    setBuscaEq]    = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [corrompido, setCorrompido] = useState(false)
  const [status,     setStatus]     = useState<{ kind: 'idle' | 'saving' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' })
  const [senhaApp,   setSenhaApp]   = useState<string | null>(null)
  const [liberado,   setLiberado]   = useState(false)
  const [gateInput,  setGateInput]  = useState('')
  const [gateError,  setGateError]  = useState(false)
  const senhaUsada = useRef('')

  useEffect(() => {
    const api = (window as any).electronAPI
    ;(async () => {
      let senha = ''
      if (api?.getSettings) { try { const s = await api.getSettings(); senha = s.senhaEmissao ?? '' } catch {} }
      else { try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) senha = JSON.parse(raw).senhaEmissao ?? '' } catch {} }
      setSenhaApp(senha)
      if (!senha) setLiberado(true)
    })()
    Promise.all([
      carregarPlanner(), carregarConfigEmc(),
      fetch('/api/equipamentos', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
    ])
      .then(([p, c, eq]) => {
        setCfg(p.cfg); setOriginal(JSON.stringify(p.cfg)); setTarefas(p.tarefas); setUsuario(p.usuario)
        setCorrompido(p.corrompido || !!c.corrompido)
        setEmc({ catalogo: c.catalogo, templates: c.templates })
        setEquip(Array.isArray(eq) ? eq : [])
      })
      .catch(e => setStatus({ kind: 'error', msg: e instanceof Error ? e.message : String(e) }))
      .finally(() => setCarregando(false))
  }, [])

  const alterado = JSON.stringify(cfg) !== original
  const hoje = today()
  const eqMap = useMemo(() => new Map(equip.map(e => [e.id, e])), [equip])

  // tempo real das tarefas concluídas, por ensaio (para comparar com a estimativa)
  const real = useMemo(() => {
    const m = new Map<string, { soma: number; n: number }>()
    for (const t of tarefas) {
      if (t.status !== 'feita' || !t.sessoes.length) continue
      const r = m.get(t.ensaioId) ?? { soma: 0, n: 0 }
      r.soma += tempoGastoMs(t, Date.now()) / 60000; r.n++
      m.set(t.ensaioId, r)
    }
    return m
  }, [tarefas])

  function entrar() {
    if (gateInput === senhaApp) { senhaUsada.current = gateInput; setLiberado(true); setGateInput('') }
    else { setGateError(true); setGateInput('') }
  }

  async function salvar() {
    setStatus({ kind: 'saving' })
    try {
      const salvo = await salvarConfigPlanner(cfg, senhaUsada.current)
      const limpo = { pessoas: salvo.pessoas, setups: salvo.setups, tempos: salvo.tempos, jornada: salvo.jornada, atualizadoEm: salvo.atualizadoEm }
      setCfg(limpo); setOriginal(JSON.stringify(limpo))
      setStatus({ kind: 'ok', msg: 'Salvo na rede.' })
      setTimeout(() => setStatus({ kind: 'idle' }), 3000)
    } catch (e) { setStatus({ kind: 'error', msg: e instanceof Error ? e.message : String(e) }) }
  }

  const setPessoa = (id: string, p: Partial<Pessoa>) => setCfg(c => ({ ...c, pessoas: c.pessoas.map(x => x.id === id ? { ...x, ...p } : x) }))
  const setSetup = (id: string, s: Partial<Setup>) => setCfg(c => ({ ...c, setups: c.setups.map(x => x.id === id ? { ...x, ...s } : x) }))
  function setTempo(ensaioId: string, t: Partial<TempoEnsaio>) {
    setCfg(c => {
      const atual = c.tempos.find(x => x.ensaioId === ensaioId)
      const base: TempoEnsaio = atual ?? { ensaioId, setupId: '', configuracao: '', montagemMin: 0, ensaioMin: 0, acompanhado: true }
      const novo = { ...base, ...t }
      return { ...c, tempos: atual ? c.tempos.map(x => x.ensaioId === ensaioId ? novo : x) : [...c.tempos, novo] }
    })
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => {
          if (alterado && !confirm('Há alterações não salvas. Sair mesmo assim?')) return
          router.push('/agenda')
        }} className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm transition-colors">
          <ArrowLeft size={14} /> Agenda
        </button>
        <div className="flex-1" />
        {status.kind === 'ok' && <span className="text-[11px] text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> {status.msg}</span>}
        {status.kind === 'error' && <span className="text-[11px] text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> {status.msg}</span>}
        <button type="button" onClick={salvar} disabled={!alterado || status.kind === 'saving' || corrompido || !liberado}
          className="btn-primary px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
          {status.kind === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
        </button>
      </div>

      <div className="mb-5">
        <p className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-0.5">Agenda EMC · Planner</p>
        <h1 className="text-xl font-bold text-white">Pessoas, setups e tempos</h1>
        <p className="text-white/35 text-xs mt-0.5">
          O que o &quot;Organizar semana&quot; usa: quem pode fazer cada ensaio, em qual setup ele roda, quanto leva e quanto leva montar.
        </p>
      </div>

      {corrompido && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/8 text-red-300 text-[11px] mb-4">
          <AlertTriangle size={12} /> Um arquivo do planner na rede não pôde ser lido. Salvar está bloqueado para não sobrescrevê-lo.
        </div>
      )}

      <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8 mb-4 w-fit">
        {([['pessoas', 'Pessoas e habilitações'], ['setups', 'Setups'], ['tempos', 'Tempos dos ensaios'], ['jornada', 'Jornada']] as const).map(([a, l]) => (
          <button key={a} type="button" onClick={() => setAba(a)}
            className={cn('px-4 py-1.5 rounded text-xs font-semibold transition-all',
              aba === a ? 'bg-gold/15 border border-gold/25 text-gold' : 'text-white/40 hover:text-white/70')}>{l}</button>
        ))}
      </div>

      {carregando ? (
        <div className="card p-8 text-center text-white/30 text-sm flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
      ) : aba === 'pessoas' ? (
        <div className="space-y-2">
          {cfg.pessoas.map(p => (
            <div key={p.id} className={cn('card p-3 space-y-2', !p.ativo && 'opacity-50')}>
              <div className="flex items-center gap-2">
                <input type="color" value={p.cor} onChange={e => setPessoa(p.id, { cor: e.target.value })}
                  className="w-7 h-7 rounded border border-white/10 bg-transparent cursor-pointer" title="Cor no quadro" />
                <input className="input text-sm font-semibold flex-1" placeholder="Nome" value={p.nome} onChange={e => setPessoa(p.id, { nome: e.target.value })} />
                <input className="input text-xs font-mono w-[160px]" placeholder="usuário do Windows" value={p.usuarioWindows ?? ''}
                  onChange={e => setPessoa(p.id, { usuarioWindows: e.target.value.trim() })} />
                {usuario && p.usuarioWindows !== usuario && (
                  <button type="button" title={`Usar o usuário deste PC (${usuario})`} onClick={() => setPessoa(p.id, { usuarioWindows: usuario })}
                    className="text-white/30 hover:text-teal"><Monitor size={13} /></button>
                )}
                <label className="flex items-center gap-1 text-[11px] text-white/45"><input type="checkbox" className="accent-teal w-3.5 h-3.5" checked={p.ativo} onChange={e => setPessoa(p.id, { ativo: e.target.checked })} /> ativo</label>
                <button type="button" title="Remover" onClick={() => {
                  if (confirm(`Remover ${p.nome || 'esta pessoa'}? As tarefas dela ficam sem pessoa.`)) setCfg(c => ({ ...c, pessoas: c.pessoas.filter(x => x.id !== p.id) }))
                }} className="text-white/25 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
              <div className="flex items-center gap-1 flex-wrap pl-9">
                <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest mr-1">Habilitado(a) em</span>
                {emc.catalogo.map(e => {
                  const on = p.habilitacoes.includes(e.id)
                  return (
                    <button key={e.id} type="button" title={`${e.nome} (${e.norma})`}
                      onClick={() => setPessoa(p.id, { habilitacoes: on ? p.habilitacoes.filter(h => h !== e.id) : [...p.habilitacoes, e.id] })}
                      className={cn('font-mono font-bold text-[10px] px-2 py-0.5 rounded border transition-all',
                        on ? 'border-teal/40 bg-teal/12 text-teal' : 'border-white/10 text-white/30 hover:text-white/60')}>
                      {e.codigo}
                    </button>
                  )
                })}
                <button type="button" onClick={() => setPessoa(p.id, { habilitacoes: p.habilitacoes.length === emc.catalogo.length ? [] : emc.catalogo.map(e => e.id) })}
                  className="text-[10px] text-white/30 hover:text-white/60 ml-1">{p.habilitacoes.length === emc.catalogo.length ? 'nenhum' : 'todos'}</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setCfg(c => ({
            ...c, pessoas: [...c.pessoas, { id: novoId('pessoa'), nome: '', cor: CORES_PESSOA[c.pessoas.length % CORES_PESSOA.length], habilitacoes: [], ativo: true }],
          }))} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-white/12 text-white/35 hover:text-teal hover:border-teal/30 text-xs">
            <Plus size={11} /> Nova pessoa
          </button>
          <p className="text-[10px] text-white/25">O usuário do Windows faz o app saber quem está no PC: o play/pausa fica registrado em nome dela e o filtro &quot;Só eu&quot; funciona. Este PC: <span className="font-mono">{usuario || '—'}</span>.</p>
        </div>
      ) : aba === 'setups' ? (
        <div className="space-y-2">
          {cfg.setups.map(s => {
            const q = (buscaEq[s.id] ?? '').toLowerCase()
            const sugestoes = q ? equip.filter(e => !s.equipamentoIds.includes(e.id) && `${e.tag} ${e.nome} ${e.modelo ?? ''}`.toLowerCase().includes(q)).slice(0, 8) : []
            const usado = cfg.tempos.filter(t => t.setupId === s.id).map(t => emc.catalogo.find(c => c.id === t.ensaioId)?.codigo ?? t.ensaioId)
            return (
              <div key={s.id} className={cn('card p-3 space-y-2', !s.ativo && 'opacity-50')}>
                <div className="flex items-center gap-2">
                  <input className="input text-sm font-semibold flex-1" placeholder="Nome do setup (ex.: Bancada ESD)" value={s.nome} onChange={e => setSetup(s.id, { nome: e.target.value })} />
                  <input className="input text-xs w-[180px]" placeholder="Local (sala, câmara…)" value={s.local ?? ''} onChange={e => setSetup(s.id, { local: e.target.value })} />
                  <label className="flex items-center gap-1 text-[11px] text-white/45"><input type="checkbox" className="accent-teal w-3.5 h-3.5" checked={s.ativo} onChange={e => setSetup(s.id, { ativo: e.target.checked })} /> ativo</label>
                  <button type="button" title="Remover" onClick={() => {
                    if (confirm(`Remover o setup ${s.nome || ''}?${usado.length ? ` Ele é usado por ${usado.join(', ')}.` : ''}`)) setCfg(c => ({ ...c, setups: c.setups.filter(x => x.id !== s.id) }))
                  }} className="text-white/25 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest pt-1.5 w-[90px] shrink-0">Equipamentos</span>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap gap-1">
                      {s.equipamentoIds.map(id => {
                        const e = eqMap.get(id)
                        const vencido = !!e?.proximaCalibracao && e.proximaCalibracao < hoje
                        return (
                          <span key={id} title={e ? `${e.nome}${e.modelo ? ' · ' + e.modelo : ''} · calibração até ${e.proximaCalibracao || '—'}` : 'equipamento não encontrado no cadastro'}
                            className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border',
                              !e ? 'border-red-500/30 text-red-300' : vencido ? 'border-amber-400/35 bg-amber-400/8 text-amber-200' : 'border-white/12 text-white/60')}>
                            {vencido && <AlertTriangle size={9} />}
                            <span className="font-mono font-bold">{e?.tag ?? id}</span> {e?.nome}
                            <button type="button" onClick={() => setSetup(s.id, { equipamentoIds: s.equipamentoIds.filter(x => x !== id) })} className="text-white/30 hover:text-red-400">×</button>
                          </span>
                        )
                      })}
                    </div>
                    <div className="relative max-w-sm">
                      <input className="input text-xs py-1 w-full" placeholder="Adicionar equipamento (tag ou nome)…" value={buscaEq[s.id] ?? ''}
                        onChange={e => setBuscaEq(b => ({ ...b, [s.id]: e.target.value }))} />
                      {sugestoes.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg border border-white/10 bg-[#12161d] shadow-xl">
                          {sugestoes.map(e => (
                            <button key={e.id} type="button" onClick={() => { setSetup(s.id, { equipamentoIds: [...s.equipamentoIds, e.id] }); setBuscaEq(b => ({ ...b, [s.id]: '' })) }}
                              className="w-full text-left px-2 py-1 text-[11px] text-white/60 hover:bg-white/5 hover:text-white">
                              <span className="font-mono font-bold">{e.tag}</span> {e.nome}{e.modelo ? <span className="text-white/30"> · {e.modelo}</span> : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/30">
                  <span className="font-mono uppercase tracking-widest w-[90px]">Ensaios</span>
                  {usado.length ? usado.join(' · ') : <span className="italic">nenhum ensaio usa este setup (aba Tempos dos ensaios)</span>}
                </div>
              </div>
            )
          })}
          <button type="button" onClick={() => setCfg(c => ({ ...c, setups: [...c.setups, { id: novoId('setup'), nome: '', equipamentoIds: [], ativo: true }] }))}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-white/12 text-white/35 hover:text-teal hover:border-teal/30 text-xs">
            <Plus size={11} /> Novo setup
          </button>
        </div>
      ) : aba === 'tempos' ? (
        <div className="card p-4 space-y-1">
          <div className="grid grid-cols-[18px_70px_1fr_170px_130px_110px_110px_110px_70px] gap-2 text-[9px] text-white/30 font-mono uppercase tracking-widest pb-1">
            <span /><span>Ensaio</span><span>Nome</span><span>Setup</span><span>Configuração</span><span>Montagem</span><span>Por amostra</span><span>c/ relógio</span><span title="A pessoa fica presa durante o ensaio">Acomp.</span>
          </div>
          {emc.catalogo.map(e => {
            const t = cfg.tempos.find(x => x.ensaioId === e.id)
            const r = real.get(e.id)
            const exp = aberto === e.id
            return (
              <div key={e.id} className="border-t border-white/5 pt-1">
                <div className="grid grid-cols-[18px_70px_1fr_170px_130px_110px_110px_110px_70px] gap-2 items-center">
                  <button type="button" onClick={() => setAberto(exp ? null : e.id)} className="text-white/30 hover:text-white/70" title="Tempo por tipo de equipamento">
                    {exp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <span className="font-mono font-bold text-teal text-xs">{e.codigo}</span>
                  <span className="text-[11px] text-white/55 truncate" title={e.nome}>
                    {e.nome}
                    {!!Object.keys(t?.porTipo ?? {}).length && (
                      <button type="button" onClick={() => setAberto(exp ? null : e.id)}
                        className="block text-[9px] text-purple-300/70 font-mono hover:text-purple-200">
                        tempo próprio em {Object.keys(t!.porTipo!).length} tipo(s)
                      </button>
                    )}
                    {r && <span className="block text-[9px] text-white/30 font-mono">real: média {fmtDuracao(r.soma / r.n)} em {r.n} ensaio(s)</span>}
                  </span>
                  <select className={cn('input text-xs py-1', !t?.setupId && 'text-white/30')} value={t?.setupId ?? ''} onChange={ev => setTempo(e.id, { setupId: ev.target.value })}>
                    <option value="">— sem setup —</option>
                    {cfg.setups.map(s => <option key={s.id} value={s.id}>{s.nome || '(sem nome)'}</option>)}
                  </select>
                  <input className="input text-xs py-1" placeholder={e.codigo} value={t?.configuracao ?? ''}
                    title="Ensaios com a mesma configuração no mesmo setup seguem sem remontar (ex.: 4-4 e 4-4R)"
                    onChange={ev => setTempo(e.id, { configuracao: ev.target.value })} />
                  <Minutos valor={t?.montagemMin || undefined} onChange={v => setTempo(e.id, { montagemMin: v ?? 0 })} placeholder="min" />
                  <Minutos valor={t?.ensaioMin || undefined} onChange={v => setTempo(e.id, { ensaioMin: v ?? 0 })} placeholder="min" />
                  <Minutos valor={t?.relogioMin} onChange={v => setTempo(e.id, { relogioMin: v })} placeholder="= normal" />
                  <input type="checkbox" className="accent-teal w-3.5 h-3.5" checked={t?.acompanhado ?? true} onChange={ev => setTempo(e.id, { acompanhado: ev.target.checked })} />
                </div>
                {exp && (
                  <PorTipo cfg={cfg} ensaioId={e.id} tempo={t} templates={emc.templates}
                    onChange={porTipo => setTempo(e.id, { porTipo })} />
                )}
              </div>
            )
          })}
          <p className="text-[10px] text-white/25 pt-2">
            Montagem = preparar a configuração no setup (paga uma vez por lote). Por amostra = o ensaio em si. &quot;c/ relógio&quot; substitui o por amostra quando a amostra é medida por relógio.
            Sem &quot;Acomp.&quot;, o ensaio roda sozinho depois de montado e a pessoa fica livre para outro setup.
          </p>
        </div>
      ) : (
        <div className="card p-5 space-y-4 max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            {([['inicio', 'Início'], ['fim', 'Fim'], ['almocoInicio', 'Almoço — início'], ['almocoFim', 'Almoço — fim']] as const).map(([k, l]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <Label>{l}</Label>
                <input type="time" className="input text-sm" value={cfg.jornada[k]} onChange={e => setCfg(c => ({ ...c, jornada: { ...c.jornada, [k]: e.target.value } }))} />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Dias de trabalho</Label>
            <div className="flex gap-1">
              {DIAS.map((d, i) => {
                const on = cfg.jornada.dias.includes(i)
                return (
                  <button key={d} type="button" onClick={() => setCfg(c => ({ ...c, jornada: { ...c.jornada, dias: on ? c.jornada.dias.filter(x => x !== i) : [...c.jornada.dias, i].sort() } }))}
                    className={cn('px-2.5 py-1 rounded border text-xs', on ? 'border-teal/40 bg-teal/12 text-teal' : 'border-white/10 text-white/30')}>{d}</button>
                )
              })}
            </div>
          </div>
          <p className="text-[11px] text-white/35">{fmtDuracao(minutosUteis(cfg.jornada))} úteis por dia e por pessoa. Ensaio que passa do almoço é contado em horas úteis (pausa no almoço).</p>
        </div>
      )}

      {!liberado && senhaApp !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-sm mx-4 p-7 space-y-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gold/12 border border-gold/25 flex items-center justify-center">
                <Lock size={20} className="text-gold" />
              </div>
              <div>
                <p className="font-bold text-white">Pessoas, setups e tempos</p>
                <p className="text-[11px] text-white/40">Informe a senha para editar</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">Senha</label>
              <input type="password" className={cn('input', gateError && 'border-red-500/50')} placeholder="••••••"
                value={gateInput} autoFocus
                onChange={e => { setGateInput(e.target.value); setGateError(false) }}
                onKeyDown={e => { if (e.key === 'Enter') entrar() }} />
              {gateError && <p className="text-[11px] text-red-400">Senha incorreta.</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => router.push('/agenda')}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">Voltar</button>
              <button type="button" onClick={entrar}
                className="btn-primary flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
                <ArrowRight size={14} /> Entrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
