'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Cpu, BookOpen, ClipboardCheck, AlertTriangle, ChevronRight, ArrowRight,
  Calendar, FileText, Settings, ShieldCheck, Clock, GitBranch,
  Timer, Hourglass,
} from 'lucide-react'
import { fmt, diasAte } from '@/lib/utils'
import { RELATORIOS_KEY, AGENDA_KEY } from '@/app/cispr15/types'
import { lerTempos, mediaDuracao, formatDuracao, type TempoTrabalho } from '@/lib/tempos'
import { DonutChart, BarChart, HBarChart, ChartCard } from '@/components/Charts'
import { FilterDropdown } from '@/components/FilterDropdown'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import type { Checagem } from '@/lib/checagens/tipos'
import type { Norma } from '@/lib/normas/tipos'
import type { Taxonomia } from '@/lib/taxonomia/tipos'
import { siglaDaTag } from '@/lib/taxonomia/tipos'
import { GRUPO_CORES } from '@/lib/grupos-icons'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/* Extrai ano de uma data em dd/mm/yyyy ou yyyy-mm-dd */
function getAno(s?: string): number | null {
  if (!s) return null
  const m = s.match(/(\d{4})/)
  return m ? parseInt(m[1]) : null
}
/* Extrai mês (1-12) */
function getMes(s?: string): number | null {
  if (!s) return null
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return parseInt(m[2])
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return parseInt(m[2])
  return null
}
/* Converte dd/mm/yyyy ou yyyy-mm-dd em Date */
function parseData(s?: string): Date | null {
  if (!s) return null
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}
/* Dias entre duas datas (b - a), ou null */
function diasEntre(a?: string, b?: string): number | null {
  const da = parseData(a), db = parseData(b)
  if (!da || !db) return null
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

const PRAZO_ATRASO_DIAS = 30  // limite de dias do fim do ensaio até a emissão

function StatusBadge({ status }: { status: string }) {
  if (status === 'reprovado') return <span className="badge-danger">VENCIDA</span>
  if (status === 'atencao')   return <span className="badge-warning">VENCENDO</span>
  return <span className="badge-success">EM DIA</span>
}

function StatCard({ icon, label, value, color, sub, href }: {
  icon: React.ReactNode; label: string; value: number | string; color: string; sub?: string; href?: string
}) {
  const inner = (
    <>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
           style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[8.5px] tracking-[2px] uppercase text-white/35">{label}</p>
        <p className="font-display font-bold text-2xl text-white leading-tight">{value}</p>
        {sub && <p className="text-[9px] text-white/30 font-mono mt-0.5">{sub}</p>}
      </div>
    </>
  )
  if (href) {
    return (
      <Link href={href} className="stat-card group hover:border-white/15 transition-colors relative">
        {inner}
        <ArrowRight size={12} className="absolute top-3 right-3 text-white/15 group-hover:text-white/50 transition-colors" />
      </Link>
    )
  }
  return <div className="stat-card">{inner}</div>
}

function AreaCard({ href, icon, title, desc, color }: {
  href: string; icon: React.ReactNode; title: string; desc: string; color: string
}) {
  return (
    <Link href={href} className="card p-4 group flex items-start gap-3 hover:border-white/15 transition-colors">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
           style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display font-semibold text-[13px] text-white">{title}</h3>
          <ArrowRight size={13} className="text-white/20 group-hover:text-white/60 transition-colors" />
        </div>
        <p className="text-[10.5px] text-white/40 mt-0.5 leading-snug">{desc}</p>
      </div>
    </Link>
  )
}

async function loadList(method: 'getAgenda' | 'getRelatorios', prop: 'agenda' | 'relatorios', key: string): Promise<any[]> {
  const api = (window as any).electronAPI
  if (api?.[method]) {
    try {
      const res = await api[method]()
      if (res?.ok && Array.isArray(res[prop])) return res[prop]
    } catch {}
  }
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw) } catch {}
  return []
}

export default function DashboardPage() {
  const [equips,    setEquips]    = useState<EquipamentoEMC[]>([])
  const [checagens, setChecagens] = useState<Checagem[]>([])
  const [normas,    setNormas]    = useState<Norma[]>([])
  const [relatorios, setRelatorios] = useState<any[]>([])
  const [agenda,     setAgenda]     = useState<any[]>([])
  const [ano,        setAno]        = useState<number>(new Date().getFullYear())
  const [tempos,     setTempos]     = useState<TempoTrabalho[]>([])
  const [tax,        setTax]        = useState<Taxonomia>({ areas: [], siglas: [], tipos: [] })
  const [qSiglas,    setQSiglas]    = useState<string[]>([])
  const [aba,        setAba]        = useState<'cispr15' | 'qualidade' | 'atalhos'>('cispr15')

  useEffect(() => {
    Promise.all([
      fetch('/api/equipamentos').then(r => r.json()),
      fetch('/api/checagens').then(r => r.json()),
      fetch('/api/normas').then(r => r.json()),
      fetch('/api/taxonomia').then(r => r.json()),
    ]).then(([e, c, n, t]) => {
      setEquips(Array.isArray(e) ? e : [])
      setChecagens(Array.isArray(c) ? c : [])
      setNormas(Array.isArray(n) ? n : [])
      if (t && !t.error) setTax({ areas: t.areas ?? [], siglas: t.siglas ?? [], tipos: t.tipos ?? [] })
    }).catch(() => {})

    loadList('getRelatorios', 'relatorios', RELATORIOS_KEY).then(setRelatorios)
    loadList('getAgenda',     'agenda',     AGENDA_KEY).then(setAgenda)
    setTempos(lerTempos())
  }, [])

  // Anos disponíveis (dos relatórios) + ano atual, ordenados desc
  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()])
    for (const r of relatorios) { const a = getAno(r.dataEmissao); if (a) set.add(a) }
    return [...set].sort((a, b) => b - a)
  }, [relatorios])

  const relatoriosAno = useMemo(
    () => relatorios.filter(r => getAno(r.dataEmissao) === ano),
    [relatorios, ano],
  )

  // Relatórios por mês do ano selecionado
  const porMes = useMemo(() => {
    const counts = Array(12).fill(0)
    for (const r of relatoriosAno) { const m = getMes(r.dataEmissao); if (m) counts[m - 1]++ }
    return MESES.map((label, i) => ({ label, value: counts[i] }))
  }, [relatoriosAno])

  // Emendas = não conformidades dos relatórios do ano
  const emendaStats = useMemo(() => {
    let totalEmendas = 0, comEmenda = 0
    for (const r of relatoriosAno) {
      const n = r.emendas?.length ?? 0
      totalEmendas += n
      if (n > 0) comEmenda++
    }
    const pct = relatoriosAno.length ? Math.round((comEmenda / relatoriosAno.length) * 100) : 0
    return { totalEmendas, comEmenda, semEmenda: relatoriosAno.length - comEmenda, pct }
  }, [relatoriosAno])

  // Tempo de saída (fim do ensaio → emissão) e atrasos
  const tempoStats = useMemo(() => {
    const dias: number[] = []
    let atrasos = 0
    for (const r of relatoriosAno) {
      const cfg = r.currentCfg ?? r.cfg ?? {}
      const inicio = cfg.periodoFim || cfg.periodoInicio
      const d = diasEntre(inicio, r.dataEmissao)
      if (d !== null && d >= 0) {
        dias.push(d)
        if (d > PRAZO_ATRASO_DIAS) atrasos++
      }
    }
    const media = dias.length ? Math.round(dias.reduce((s, x) => s + x, 0) / dias.length) : null
    return { media, atrasos, amostra: dias.length }
  }, [relatoriosAno])

  // Tempos de trabalho do ano: emissão (form → PDF) e cadastro de amostra na agenda
  const trabalhoStats = useMemo(() => {
    const doAno = tempos.filter(t => new Date(t.data).getFullYear() === ano)
    // "emissão" só conta se o relatório ainda existir na base — um registro de
    // tempo de um relatório apagado depois não deve inflar a contagem/média.
    const numsAtuais = new Set(relatorios.map(r => (r.numRelatorio || '').trim().toLowerCase()).filter(Boolean))
    const emissaoValidos = doAno.filter(t =>
      t.tipo !== 'emissao' || (!!t.numRelatorio && numsAtuais.has(t.numRelatorio.trim().toLowerCase())),
    )
    const emissao = mediaDuracao(emissaoValidos, 'emissao')
    const agendaT = mediaDuracao(doAno, 'agenda')
    return { emissao, agendaT }
  }, [tempos, ano, relatorios])

  // Filtro por TAG (sigla) da aba Qualidade — escopa checagens e equipamentos
  const checagensQ = qSiglas.length ? checagens.filter(c => qSiglas.includes(siglaDaTag(c.equipamentoTag))) : checagens
  const equipsQ    = qSiglas.length ? equips.filter(e => qSiglas.includes(siglaDaTag(e.tag))) : equips

  const vencidas  = checagensQ.filter(c => c.status === 'reprovado').length
  const pendentes = checagensQ.filter(c => c.status === 'atencao').length
  const emDia     = checagensQ.length - vencidas - pendentes
  const agendaPendentes = agenda.filter((a: any) => !a?.numRelatorio).length

  // Siglas disponíveis no filtro da Qualidade (com significado/cor da área)
  const siglasDash = (() => {
    const cont = new Map<string, number>()
    for (const e of equips) { const s = siglaDaTag(e.tag); if (s) cont.set(s, (cont.get(s) ?? 0) + 1) }
    return [...cont.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sigla, n]) => {
      const def = tax.siglas.find(x => x.sigla === sigla)
      const area = def ? tax.areas.find(a => a.id === def.areaId) : undefined
      return { id: sigla, label: def?.significado ? `${sigla} · ${def.significado}` : sigla, count: n, color: area ? GRUPO_CORES[area.cor] : '#94A3B8' }
    })
  })()
  // Agenda de execução — ensaios ainda não emitidos, ordenados pela previsão de saída
  const agendaProximos = [...agenda]
    .filter((a: any) => !a?.numRelatorio)
    .sort((a: any, b: any) => {
      const da = parseData(a?.previsaoSaida)?.getTime() ?? Infinity
      const db = parseData(b?.previsaoSaida)?.getTime() ?? Infinity
      return da - db
    })
    .slice(0, 6)

  // Equipamentos por grupo (respeita o filtro de TAG da Qualidade)
  const porGrupo = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of equipsQ) { const g = (e as any).grupoId || 'outros'; map[g] = (map[g] ?? 0) + 1 }
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [equipsQ])

  const proximas = [...checagensQ]
    .sort((a, b) => {
      const da = diasAte(a.proximaChecagem)
      const db = diasAte(b.proximaChecagem)
      return (typeof da === 'number' ? da : 9999) - (typeof db === 'number' ? db : 9999)
    })
    .slice(0, 5)

  return (
    <div>
      <div className="page-header flex items-start justify-between gap-4">
        <div>
          <p className="page-eyebrow">LABELO · EMC</p>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Visão geral da gestão de EMC</p>
        </div>
        {/* Seletor de ano */}
        <div className="flex items-center gap-1.5 bg-navy border border-white/8 rounded-xl p-1 flex-wrap">
          {anosDisponiveis.map(a => (
            <button key={a} type="button" onClick={() => setAno(a)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-mono transition-all ${
                ano === a ? 'bg-[#141B28] text-white border border-white/10' : 'text-white/35 hover:text-white/60'}`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-abas clicáveis — tudo na mesma tela */}
      {(() => {
        const abas = [
          { id: 'cispr15'   as const, label: 'CISPR 15',      icon: FileText },
          { id: 'qualidade' as const, label: 'Qualidade',     icon: ShieldCheck },
          { id: 'atalhos'   as const, label: 'Acesso rápido', icon: ArrowRight },
        ]
        return (
          <div className="flex items-center gap-1 border-b border-white/8 mb-5">
            {abas.map(t => (
              <button key={t.id} type="button" onClick={() => setAba(t.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium rounded-t-lg transition-all border-b-2 -mb-px ${
                  aba === t.id ? 'text-white border-gold' : 'text-white/40 border-transparent hover:text-white/70'}`}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        )
      })()}

      {/* ── CISPR 15 — relatórios + agenda de execução ─────────────────── */}
      {aba === 'cispr15' && (
        <div className="space-y-6">
          <div>
            <p className="font-display font-semibold text-[11px] text-white/45 uppercase tracking-[2px] mb-2.5">Produção de relatórios · {ano}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard href="/cispr15" icon={<FileText size={18} />} label={`Relatórios ${ano}`} value={relatoriosAno.length} color="#9B8CFF" />
              <StatCard href="/cispr15" icon={<GitBranch size={18} />} label="Emendas (não conf.)" value={emendaStats.totalEmendas}
                sub={`${emendaStats.pct}% dos relatórios`} color="#F87171" />
              <StatCard icon={<Clock size={18} />} label="Tempo médio de saída"
                value={tempoStats.media !== null ? `${tempoStats.media}d` : '—'} sub={`base: ${tempoStats.amostra} relatórios`} color="#34D399" />
              <StatCard icon={<AlertTriangle size={18} />} label={`Atrasos (>${PRAZO_ATRASO_DIAS}d)`} value={tempoStats.atrasos} color="#F59E0B" />
              <StatCard icon={<Timer size={18} />} label="Tempo médio de emissão"
                value={formatDuracao(trabalhoStats.emissao.mediaMs)}
                sub={trabalhoStats.emissao.n ? `${trabalhoStats.emissao.n} emissão(ões)` : 'sem dados ainda'} color="#9B8CFF" />
              <StatCard href="/agenda" icon={<Calendar size={18} />} label="Agenda pendente" value={agendaPendentes}
                sub="ensaios a emitir" color="#4F8EF7" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={`Relatórios por mês · ${ano}`}>
              <BarChart data={porMes} color="#9B8CFF" />
            </ChartCard>
            <ChartCard title={`Emendas — não conformidades · ${ano}`}>
              <DonutChart centerTop={`${emendaStats.pct}%`} centerSub="com emenda"
                segments={[
                  { label: 'Sem emenda', value: emendaStats.semEmenda, color: '#34D399' },
                  { label: 'Com emenda', value: emendaStats.comEmenda, color: '#F87171' },
                ]} />
            </ChartCard>
          </div>

          {/* Agenda de execução */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-[13px] text-white flex items-center gap-2">
                <Calendar size={15} className="text-blue-400"/> Agenda de execução
              </h2>
              <Link href="/agenda" className="text-[11px] text-white/35 hover:text-white flex items-center gap-1 transition-colors">
                Ver agenda <ChevronRight size={11} />
              </Link>
            </div>
            {agendaProximos.length === 0 ? (
              <p className="text-white/25 text-sm py-6 text-center">Nenhum ensaio pendente na agenda.</p>
            ) : (
              <table className="w-full">
                <thead className="tbl-head">
                  <tr><th>Protocolo</th><th>Cliente / Produto</th><th>Entrada</th><th>Previsão saída</th></tr>
                </thead>
                <tbody>
                  {agendaProximos.map((a: any) => (
                    <tr key={a.id} className="tbl-row">
                      <td><span className="tag-chip mr-2">{a.protocolo || '—'}</span></td>
                      <td className="text-white/70">{a.cliente || '—'}<span className="text-white/35"> · {a.produto || a.tipo || ''}</span></td>
                      <td className="font-mono text-[11px]">{fmt(a.dataEntrada)}</td>
                      <td className="font-mono text-[11px]">{fmt(a.previsaoSaida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Qualidade — checagens + equipamentos ───────────────────────── */}
      {aba === 'qualidade' && (
        <div className="space-y-6">
          {siglasDash.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-white/40">Filtrar por TAG:</span>
              <FilterDropdown label="Siglas" selected={qSiglas} onChange={setQSiglas} options={siglasDash} />
              {qSiglas.length > 0 && (
                <button type="button" onClick={() => setQSiglas([])} className="text-[11px] text-white/40 hover:text-white px-2 py-1 rounded-lg border border-white/10 hover:border-white/25 transition-all">Limpar</button>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard href="/checagens"    icon={<ClipboardCheck size={18} />} label="Checagens vencendo" value={pendentes}       color="#F59E0B" />
            <StatCard href="/checagens"    icon={<AlertTriangle size={18} />}  label="Checagens vencidas" value={vencidas}        color="#F87171" />
            <StatCard href="/equipamentos" icon={<Cpu size={18} />}            label="Equipamentos"       value={equipsQ.length}  color="#4F8EF7" />
            <StatCard href="/normas"       icon={<BookOpen size={18} />}       label="Normas"             value={normas.length}   color="#9B8CFF" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Checagens por status">
              <DonutChart centerTop={checagensQ.length} centerSub="checagens"
                segments={[
                  { label: 'Em dia',   value: emDia,     color: '#34D399' },
                  { label: 'Vencendo', value: pendentes, color: '#F59E0B' },
                  { label: 'Vencidas', value: vencidas,  color: '#F87171' },
                ]} />
            </ChartCard>
            <ChartCard title="Equipamentos por grupo">
              <HBarChart data={porGrupo} color="#4F8EF7" />
            </ChartCard>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-[13px] text-white">Próximas checagens</h2>
              <Link href="/checagens" className="text-[11px] text-white/35 hover:text-white flex items-center gap-1 transition-colors">
                Ver todas <ChevronRight size={11} />
              </Link>
            </div>
            {proximas.length === 0 ? (
              <p className="text-white/25 text-sm py-6 text-center">Nenhuma checagem registrada.</p>
            ) : (
              <table className="w-full">
                <thead className="tbl-head">
                  <tr><th>Equipamento</th><th>Data</th><th>Próxima</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {proximas.map(c => (
                    <tr key={c.id} className="tbl-row">
                      <td><span className="tag-chip mr-2">{c.equipamentoTag}</span></td>
                      <td>{fmt(c.data)}</td>
                      <td>{fmt(c.proximaChecagem)}</td>
                      <td><StatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Acesso rápido ──────────────────────────────────────────────── */}
      {aba === 'atalhos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <AreaCard href="/agenda"        icon={<Calendar size={18} />}    title="Agenda"        desc="Ensaios agendados e protocolos"   color="#4F8EF7" />
          <AreaCard href="/cispr15"       icon={<FileText size={18} />}    title="Formulários"   desc="Emissão de relatórios CISPR 15"   color="#9B8CFF" />
          <AreaCard href="/checagens"     icon={<ShieldCheck size={18} />} title="Qualidade"     desc="Checagens, equipamentos e normas" color="#34D399" />
          <AreaCard href="/configuracoes" icon={<Settings size={18} />}    title="Configurações" desc="Pastas, senhas e parâmetros"      color="#94A3B8" />
        </div>
      )}
    </div>
  )
}
