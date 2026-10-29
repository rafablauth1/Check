'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, X, Edit2, Trash2, Clock, CheckCircle2, RotateCcw, AlertTriangle, Loader2, Settings2, ChevronDown, ChevronUp,
  BarChart2, TrendingUp, HardDrive, CalendarRange,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { today, CLIENTES_KEY, type ClienteDB } from '@/app/cispr15/types'
import { Icone } from '@/lib/taxonomia/icones'
import type { AgendaItemEmc, ConfigEnsaiosEmc } from '@/lib/emc/tipos'
import { proximoStatus, etiquetas } from '@/lib/emc/regras'
import { CONFIG_EMC_PADRAO } from '@/lib/emc/padrao'
import {
  carregarConfigEmc, listarAgendaEmc, criarItemAgendaEmc, atualizarItemAgendaEmc, removerItemAgendaEmc,
} from '@/lib/emc/cliente'
import { ItemModalEmc, novoItemEmc } from '@/app/agenda/emc/ItemModalEmc'
import { fmtDate, daysUntil, corPrazo, BadgeEnsaio, ChipEtiqueta } from '@/app/agenda/emc/comum'
import { AnaliseEmc } from '@/app/agenda/emc/AnaliseEmc'
import { FollowupEmc } from '@/app/agenda/emc/FollowupEmc'
import { OrganizadorEmc } from '@/app/agenda/emc/OrganizadorEmc'
import { PlannerEmc } from '@/app/agenda/emc/PlannerEmc'
import { sincronizarRadian } from '@/lib/emc/organizador/cliente'

type Filtro = 'andamento' | 'aguardando' | 'concluidos' | 'todos'
type Ordem = 'dataEntrada' | 'previsaoSaida' | 'protocolo'

export function AgendaEmc() {
  const router = useRouter()
  const [aba,        setAba]        = useState<'agenda' | 'planner' | 'analise' | 'followup' | 'radian'>('agenda')
  const [itens,      setItens]      = useState<AgendaItemEmc[]>([])
  const [config,     setConfig]     = useState<ConfigEnsaiosEmc>(CONFIG_EMC_PADRAO)
  const [clientes,   setClientes]   = useState<ClienteDB[]>([])
  const [carregando, setCarregando] = useState(true)
  const [corrompida, setCorrompida] = useState(false)
  const [erro,       setErro]       = useState<string | null>(null)
  const [editItem,   setEditItem]   = useState<AgendaItemEmc | null>(null)
  const [filtro,     setFiltro]     = useState<Filtro>('andamento')
  const [busca,      setBusca]      = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [ordem,      setOrdem]      = useState<Ordem>('dataEntrada')
  const [dir,        setDir]        = useState<'asc' | 'desc'>('desc')

  async function recarregar() {
    try {
      const [ag, cfg] = await Promise.all([listarAgendaEmc(), carregarConfigEmc()])
      setItens(ag.itens); setCorrompida(ag.corrompido || !!cfg.corrompido)
      setConfig({ catalogo: cfg.catalogo, templates: cfg.templates })
      setErro(null)
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
    finally { setCarregando(false) }
  }

  // ensaios com .DAT no PC do Radian / no registro em T: viram realizados sozinhos
  useEffect(() => {
    const sincronizar = () => sincronizarRadian()
      .then(r => { if (r.atualizados.length) recarregar() })
      .catch(() => {})
    sincronizar()
    const t = setInterval(sincronizar, 5 * 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    recarregar()
    // clientes: mesma fonte da agenda LUM (rede via Electron; localStorage fora dele)
    const api = (window as any).electronAPI
    ;(async () => {
      if (api) {
        try {
          const res = await api.getClientes()
          if (res.ok && Array.isArray(res.clientes)) { setClientes(res.clientes); return }
        } catch {}
      }
      try { const raw = localStorage.getItem(CLIENTES_KEY); if (raw) setClientes(JSON.parse(raw)) } catch {}
    })()
  }, [])

  // grava um item e atualiza a lista local com a versão que voltou do servidor
  async function gravar(id: string, parcial: Partial<AgendaItemEmc>) {
    try {
      const salvo = await atualizarItemAgendaEmc(id, parcial)
      setItens(lista => lista.map(x => x.id === id ? salvo : x))
    } catch (e) { alert('Não foi possível salvar: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleSave(item: AgendaItemEmc) {
    const existe = itens.some(x => x.id === item.id)
    const salvo = existe ? await atualizarItemAgendaEmc(item.id, item) : await criarItemAgendaEmc(item)
    setItens(lista => existe ? lista.map(x => x.id === salvo.id ? salvo : x) : [...lista, salvo])
    setEditItem(null)
  }

  async function handleDelete(item: AgendaItemEmc) {
    if (!confirm(`Remover ${item.protocolo || 'este item'} da agenda EMC?`)) return
    try {
      await removerItemAgendaEmc(item.id)
      setItens(lista => lista.filter(x => x.id !== item.id))
    } catch (e) { alert('Não foi possível remover: ' + (e instanceof Error ? e.message : String(e))) }
  }

  function alternarEnsaio(item: AgendaItemEmc, ensaioId: string) {
    gravar(item.id, {
      ensaios: item.ensaios.map(e => e.ensaioId === ensaioId ? { ...e, status: proximoStatus(e.status), manual: true } : e),
    })
  }

  const counts = useMemo(() => ({
    andamento:  itens.filter(a => !a.numRelatorio).length,
    aguardando: itens.filter(a => !!a.numRelatorio && !a.assinadoEm).length,
    concluidos: itens.filter(a => !!a.numRelatorio && !!a.assinadoEm).length,
    todos:      itens.length,
  }), [itens])

  const tiposUsados = useMemo(() => {
    const m = new Map<string, { nome: string; icone: string }>()
    itens.forEach(i => m.set(i.templateId, { nome: i.template.nome, icone: i.template.icone }))
    return [...m.entries()]
  }, [itens])

  const filtrados = useMemo(() => {
    let lista = [...itens]
    if (filtro === 'andamento')       lista = lista.filter(a => !a.numRelatorio)
    else if (filtro === 'aguardando') lista = lista.filter(a => !!a.numRelatorio && !a.assinadoEm)
    else if (filtro === 'concluidos') lista = lista.filter(a => !!a.numRelatorio && !!a.assinadoEm)
    if (filtroTipo) lista = lista.filter(a => a.templateId === filtroTipo)
    const q = busca.trim().toLowerCase()
    if (q) lista = lista.filter(a =>
      [a.protocolo, a.orcamento, a.cliente, a.produto, a.numRelatorio, a.responsavel, a.fabricante, a.modelo, a.numeroSerie, a.template.nome]
        .some(v => v?.toLowerCase().includes(q)))
    lista.sort((a, b) => {
      const va = a[ordem] ?? ''; const vb = b[ordem] ?? ''
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return lista
  }, [itens, filtro, filtroTipo, busca, ordem, dir])

  function BotaoOrdem({ k, label }: { k: Ordem; label: string }) {
    const ativo = ordem === k
    return (
      <button type="button" onClick={() => { if (ativo) setDir(d => d === 'asc' ? 'desc' : 'asc'); else { setOrdem(k); setDir('desc') } }}
        className={cn('flex items-center gap-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors',
          ativo ? 'text-gold' : 'text-white/30 hover:text-white/60')}>
        {label}{ativo ? (dir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />) : null}
      </button>
    )
  }

  return (
    <div className="space-y-3">
      {corrompida && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-500/30 bg-red-500/8 text-[11px]">
          <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
          <span className="text-red-300">
            Um arquivo da agenda EMC na rede não pôde ser lido. Nada será gravado por cima dele — avise o responsável pelo app.
          </span>
        </div>
      )}
      {erro && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/8 text-red-300 text-[11px]">
          <AlertTriangle size={12} /> {erro}
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8 w-fit">
        {([
          ['agenda',   'Agenda',    null],
          ['planner',  'Planner',   <CalendarRange key="p" size={11} />],
          ['analise',  'Análise',   <BarChart2 key="a" size={11} />],
          ['followup', 'Follow-up', <TrendingUp key="f" size={11} />],
          ['radian',   'Radian',    <HardDrive key="r" size={11} />],
        ] as const).map(([t, label, icon]) => (
          <button key={t} type="button" onClick={() => setAba(t)}
            className={cn('flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold transition-all',
              aba === t ? 'bg-gold/15 border border-gold/25 text-gold' : 'text-white/40 hover:text-white/70')}>
            {icon}{label}
          </button>
        ))}
      </div>

      {aba === 'analise' && <AnaliseEmc itens={itens} catalogo={config.catalogo} />}
      {aba === 'followup' && <FollowupEmc itens={itens} catalogo={config.catalogo} />}
      {aba === 'radian' && <OrganizadorEmc itens={itens} onAgendaMudou={recarregar} />}
      {aba === 'planner' && <PlannerEmc itens={itens} catalogo={config.catalogo} onAgendaMudou={recarregar} />}

      {aba === 'agenda' && (<>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8">
          {([
            ['andamento',  'Em andamento',          counts.andamento],
            ['aguardando', 'Aguardando assinatura', counts.aguardando],
            ['concluidos', 'Concluídos',            counts.concluidos],
            ['todos',      'Todos',                 counts.todos],
          ] as const).map(([f, label, n]) => (
            <button key={f} type="button" onClick={() => setFiltro(f)}
              className={cn('flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-all',
                filtro === f ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60')}>
              {label}
              <span className={cn('text-[9px] px-1 rounded-full font-mono', filtro === f ? 'text-white/60' : 'text-white/20')}>{n}</span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[160px] max-w-[220px]">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
          <input className="input pl-7 py-1 text-xs w-full" placeholder="Protocolo, cliente, série…"
            value={busca} onChange={e => setBusca(e.target.value)} />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X size={9} /></button>
          )}
        </div>

        {tiposUsados.length > 0 && (
          <select className="input py-1 text-xs max-w-[170px]" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {tiposUsados.map(([id, t]) => <option key={id} value={id}>{t.nome}</option>)}
          </select>
        )}

        <div className="flex items-center gap-1.5 font-mono ml-1">
          <span className="text-[9px] text-white/20 uppercase">ord</span>
          <BotaoOrdem k="dataEntrada" label="Entrada" />
          <BotaoOrdem k="previsaoSaida" label="Saída" />
          <BotaoOrdem k="protocolo" label="Proto" />
        </div>

        <div className="flex-1" />
        <span className="text-[10px] text-white/25 font-mono">{filtrados.length} item(s)</span>
        <button type="button" onClick={() => router.push('/emc/templates')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-teal hover:border-teal/30 text-xs font-semibold transition-all">
          <Settings2 size={11} /> Templates de ensaio
        </button>
        <button type="button" onClick={() => setEditItem(novoItemEmc())}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
          <Plus size={11} /> Cadastrar
        </button>
      </div>

      {filtro !== 'concluidos' && (
        <div className="flex items-center gap-4 text-[10px] font-mono text-white/25">
          <span className="flex items-center gap-1.5"><span className="w-2 h-3 rounded-sm inline-block" style={{ background: 'rgba(34,197,94,0.45)' }} />Em dia</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-3 rounded-sm inline-block" style={{ background: 'rgba(251,191,36,0.55)' }} />Vence em ≤ 3 dias</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-3 rounded-sm inline-block" style={{ background: 'rgba(239,68,68,0.55)' }} />Vencido</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-3 rounded-sm inline-block bg-white/10" />Sem prazo</span>
        </div>
      )}

      {carregando ? (
        <div className="card p-8 text-center text-white/30 text-sm flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Carregando agenda EMC…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card p-8 text-center text-white/25 text-sm">
          {itens.length === 0
            ? <>Nenhum item na agenda EMC. Clique em <strong className="text-white/40">Cadastrar</strong>.</>
            : 'Nenhum item corresponde aos filtros.'}
        </div>
      ) : (
        <div className="space-y-px">
          {filtrados.map(item => {
            const emitido = !!item.numRelatorio
            const d = daysUntil(item.previsaoSaida)
            const tags = etiquetas(item.template, item.respostas)
            return (
              <div key={item.id} style={{ borderLeftColor: corPrazo(item) }}
                className="flex flex-col px-3 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.07] border-l-2 hover:bg-white/[0.04] transition-all group">
                <div className="flex items-center gap-2">
                  <span title={item.template.nome} className="shrink-0 text-teal/70">
                    <Icone name={item.template.icone} size={12} />
                  </span>
                  {/* protocolo EMC é mais longo que o LUM (26090153-11_EMC) */}
                  <span title={item.protocolo} className="font-mono font-bold text-white text-xs w-[130px] shrink-0 truncate">{item.protocolo || '—'}</span>
                  {item.orcamento
                    ? <span className="text-[9px] text-white/22 font-mono w-14 shrink-0 truncate">{item.orcamento}</span>
                    : <span className="w-14 shrink-0" />}
                  <span className="flex-1 text-white/50 text-xs truncate min-w-0">
                    {item.cliente || '—'}{item.produto ? ` · ${item.produto}` : ` · ${item.template.nome}`}
                  </span>

                  <div className="hidden md:flex items-center gap-1 text-[10px] font-mono shrink-0">
                    <span className="text-white/22">{fmtDate(item.dataEntrada)}</span>
                    <span className="text-white/12">→</span>
                    {item.previsaoSaida ? (
                      <span className={cn(!emitido && d < 0 ? 'text-red-400/80' : !emitido && d <= 3 ? 'text-amber-400/80' : 'text-white/22')}>
                        {fmtDate(item.previsaoSaida)}
                      </span>
                    ) : <span className="text-white/20 italic">sem prazo</span>}
                  </div>

                  {emitido ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-mono text-teal bg-teal/8 border border-teal/20 px-2 py-0.5 rounded">{item.numRelatorio}</span>
                      {item.assinadoEm ? (
                        <button type="button" onClick={() => gravar(item.id, { assinadoEm: '' })}
                          title={`Assinado em ${fmtDate(item.assinadoEm)} — clique para desfazer`}
                          className="flex items-center gap-1 text-[10px] text-green-400 bg-green/8 border border-green/20 px-2 py-0.5 rounded">
                          <CheckCircle2 size={9} /> Assinado {fmtDate(item.assinadoEm)}
                        </button>
                      ) : (
                        <button type="button" onClick={() => gravar(item.id, { assinadoEm: today() })}
                          title="Marcar como assinado → move para Concluído"
                          className="flex items-center gap-1 text-[10px] text-amber-300/90 bg-amber-400/8 border border-amber-400/25 px-2 py-0.5 rounded hover:bg-amber-400/15 transition-all">
                          <Clock size={9} /> Aguardando assinatura
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-0.5 shrink-0 flex-wrap justify-end max-w-[320px]">
                      {item.ensaios.map(e => (
                        <BadgeEnsaio key={e.ensaioId} e={e} small onClick={() => alternarEnsaio(item, e.ensaioId)} />
                      ))}
                    </div>
                  )}

                  <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {emitido && (
                      <button type="button" title="Retornar para andamento"
                        onClick={() => gravar(item.id, { numRelatorio: '', dataEmissao: '', assinadoEm: '' })}
                        className="w-6 h-6 rounded border border-white/8 text-white/28 hover:text-amber-400 hover:border-amber-400/30 flex items-center justify-center transition-all">
                        <RotateCcw size={10} />
                      </button>
                    )}
                    <button type="button" onClick={() => setEditItem(item)} title="Editar"
                      className="w-6 h-6 rounded border border-white/8 text-white/28 hover:text-white/70 hover:border-white/20 flex items-center justify-center transition-all">
                      <Edit2 size={10} />
                    </button>
                    <button type="button" onClick={() => handleDelete(item)} title="Remover"
                      className="w-6 h-6 rounded border border-white/8 text-white/28 hover:text-red-400 hover:border-red-400/30 flex items-center justify-center transition-all">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>

                {(tags.length > 0 || item.observacoes || item.amostraLacrada === 'sim') && (
                  <div className="flex gap-1 mt-1 ml-5 flex-wrap items-center">
                    {tags.map(t => <ChipEtiqueta key={t} texto={t} />)}
                    {item.amostraLacrada === 'sim' && <ChipEtiqueta texto={item.numeroLacre ? `Lacre ${item.numeroLacre}` : 'Lacrada'} />}
                    {item.observacoes && <span className="text-[9px] text-white/22 italic ml-1 truncate max-w-xs">{item.observacoes}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      </>)}

      {editItem && (
        <ItemModalEmc
          item={editItem}
          isNew={!itens.some(x => x.id === editItem.id)}
          config={config}
          clientes={clientes}
          onSave={handleSave}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  )
}
