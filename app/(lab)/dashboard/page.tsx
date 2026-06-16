'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Cpu, BookOpen, ClipboardCheck, AlertTriangle, ChevronRight, ArrowRight,
  Calendar, FileText, Settings, ShieldCheck, Clock, GitBranch,
  Timer, Hourglass, BarChart2, Wrench,
} from 'lucide-react'
import { fmt, diasAte } from '@/lib/utils'
import { RELATORIOS_KEY, AGENDA_KEY } from '@/app/cispr15/types'
import { lerTempos, mediaDuracao, formatDuracao, type TempoTrabalho } from '@/lib/tempos'
import { DonutChart, BarChart, HBarChart, ChartCard } from '@/components/Charts'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import type { Checagem } from '@/lib/checagens/tipos'
import type { Norma } from '@/lib/normas/tipos'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const PRAZO_ATRASO_DIAS = 30

type Aba = 'geral' | 'relatorios' | 'equipamentos' | 'qualidade'

function getAno(s?: string): number | null {
  if (!s) return null
  const m = s.match(/(\d{4})/)
  return m ? parseInt(m[1]) : null
}
function getMes(s?: string): number | null {
  if (!s) return null
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return parseInt(m[2])
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return parseInt(m[2])
  return null
}
function parseData(s?: string): Date | null {
  if (!s) return null
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}
function diasEntre(a?: string, b?: string): number | null {
  const da = parseData(a), db = parseData(b)
  if (!da || !db) return null
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

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
  if (href) return (
    <Link href={href} className="stat-card group hover:border-white/15 transition-colors relative">
      {inner}
      <ArrowRight size={12} className="absolute top-3 right-3 text-white/15 group-hover:text-white/50 transition-colors" />
    </Link>
  )
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

const ABAS: { id: Aba; label: string; icon: React.ReactNode }[] = [
  { id: 'geral',        label: 'Geral',        icon: <BarChart2 size={14} /> },
  { id: 'relatorios',   label: 'Relatórios',   icon: <FileText size={14} /> },
  { id: 'equipamentos', label: 'Equipamentos', icon: <Wrench size={14} /> },
  { id: 'qualidade',    label: 'Qualidade',    icon: <ShieldCheck size={14} /> },
]

export default function DashboardPage() {
  const [aba, setAba] = useState<Aba>('geral')
  const [equips,     setEquips]     = useState<EquipamentoEMC[]>([])
  const [checagens,  setChecagens]  = useState<Checagem[]>([])
  const [normas,     setNormas]     = useState<Norma[]>([])
  const [relatorios, setRelatorios] = useState<any[]>([])
  const [agenda,     setAgenda]     = useState<any[]>([])
  const [ano,        setAno]        = useState<number>(new Date().getFullYear())
  const [tempos,     setTempos]     = useState<TempoTrabalho[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/equipamentos').then(r => r.json()),
      fetch('/api/checagens').then(r => r.json()),
      fetch('/api/normas').then(r => r.json()),
    ]).then(([e, c, n]) => {
      setEquips(Array.isArray(e) ? e : [])
      setChecagens(Array.isArray(c) ? c : [])
      setNormas(Array.isArray(n) ? n : [])
    }).catch(() => {})
    loadList('getRelatorios', 'relatorios', RELATORIOS_KEY).then(setRelatorios)
    loadList('getAgenda',     'agenda',     AGENDA_KEY).then(setAgenda)
    setTempos(lerTempos())
  }, [])

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()])
    for (const r of relatorios) { const a = getAno(r.dataEmissao); if (a) set.add(a) }
    return [...set].sort((a, b) => b - a)
  }, [relatorios])

  const relatoriosAno = useMemo(
    () => relatorios.filter(r => getAno(r.dataEmissao) === ano),
    [relatorios, ano],
  )

  const porMes = useMemo(() => {
    const counts = Array(12).fill(0)
    for (const r of relatoriosAno) { const m = getMes(r.dataEmissao); if (m) counts[m - 1]++ }
    return MESES.map((label, i) => ({ label, value: counts[i] }))
  }, [relatoriosAno])

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

  const tempoStats = useMemo(() => {
    const dias: number[] = []
    let atrasos = 0
    for (const r of relatoriosAno) {
      const cfg = r.currentCfg ?? r.cfg ?? {}
      const inicio = cfg.periodoFim || cfg.periodoInicio
      const d = diasEntre(inicio, r.dataEmissao)
      if (d !== null && d >= 0) { dias.push(d); if (d > PRAZO_ATRASO_DIAS) atrasos++ }
    }
    const media = dias.length ? Math.round(dias.reduce((s, x) => s + x, 0) / dias.length) : null
    return { media, atrasos, amostra: dias.length }
  }, [relatoriosAno])

  const trabalhoStats = useMemo(() => {
    const doAno = tempos.filter(t => new Date(t.data).getFullYear() === ano)
    return { emissao: mediaDuracao(doAno, 'emissao'), agendaT: mediaDuracao(doAno, 'agenda') }
  }, [tempos, ano])

  const vencidas        = checagens.filter(c => c.status === 'reprovado').length
  const pendentes       = checagens.filter(c => c.status === 'atencao').length
  const emDia           = checagens.length - vencidas - pendentes
  const agendaPendentes = agenda.filter((a: any) => !a?.numRelatorio).length
  const calVencidas     = equips.filter(e => e.status === 'calibrar')
  const calVencendoLogo = equips.filter(e => {
    if (e.status !== 'ativo') return false
    const d = diasAte(e.proximaCalibracao)
    return typeof d === 'number' && d >= 0 && d <= 30
  })

  const porGrupo = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of equips) { const g = (e as any).grupoId || 'outros'; map[g] = (map[g] ?? 0) + 1 }
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [equips])

  const proximas = [...checagens]
    .sort((a, b) => {
      const da = diasAte(a.proximaChecagem), db = diasAte(b.proximaChecagem)
      return (typeof da === 'number' ? da : 9999) - (typeof db === 'number' ? db : 9999)
    })
    .slice(0, 8)

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">LABELO · EMC</p>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Visão geral da gestão de EMC</p>
      </div>

      {/* Sub-abas */}
      <div className="flex gap-1 mb-6 bg-[#0d1117] border border-white/6 rounded-xl p-1 w-fit">
        {ABAS.map(a => (
          <button key={a.id} type="button" onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-mono transition-all ${
              aba === a.id
                ? 'bg-[#141B28] text-white border border-white/10'
                : 'text-white/35 hover:text-white/60'}`}>
            {a.icon}{a.label}
          </button>
        ))}
      </div>

      {/* ── ABA: GERAL ── */}
      {aba === 'geral' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard href="/cispr15"    icon={<FileText size={18} />}       label={`Relatórios ${ano}`}    value={relatoriosAno.length} color="#9B8CFF" />
            <StatCard href="/agenda"     icon={<Calendar size={18} />}       label="Agenda pendente"        value={agendaPendentes}      color="#4F8EF7" />
            <StatCard href="/checagens"  icon={<ClipboardCheck size={18} />} label="Checagens vencendo"    value={pendentes}            color="#F59E0B" />
            <StatCard href="/checagens"  icon={<AlertTriangle size={18} />}  label="Checagens vencidas"    value={vencidas}             color="#F87171" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatCard href="/equipamentos" icon={<AlertTriangle size={18} />} label="Calibrações vencidas"  value={calVencidas.length}     color="#F87171"
              sub={calVencidas.length ? calVencidas.slice(0,3).map(e=>e.tag).join(', ') + (calVencidas.length>3?'…':'') : 'Todas em dia'} />
            <StatCard href="/equipamentos" icon={<Clock size={18} />}          label="Vencendo em 30 dias"   value={calVencendoLogo.length} color="#F59E0B"
              sub={calVencendoLogo.length ? calVencendoLogo.slice(0,3).map(e=>e.tag).join(', ') + (calVencendoLogo.length>3?'…':'') : 'Nenhuma no prazo'} />
          </div>
          <div>
            <h2 className="font-mono text-[10px] tracking-[2px] uppercase text-white/30 mb-3">Acesso rápido</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <AreaCard href="/agenda"        icon={<Calendar size={18} />}    title="Agenda"        desc="Ensaios agendados e protocolos"   color="#4F8EF7" />
              <AreaCard href="/cispr15"       icon={<FileText size={18} />}    title="Formulários"   desc="Emissão de relatórios CISPR 15"   color="#9B8CFF" />
              <AreaCard href="/checagens"     icon={<ShieldCheck size={18} />} title="Qualidade"     desc="Checagens, equipamentos e normas" color="#34D399" />
              <AreaCard href="/configuracoes" icon={<Settings size={18} />}    title="Configurações" desc="Pastas, senhas e parâmetros"      color="#94A3B8" />
            </div>
          </div>
        </div>
      )}

      {/* ── ABA: RELATÓRIOS ── */}
      {aba === 'relatorios' && (
        <div className="space-y-6">
          {/* Seletor de ano */}
          <div className="flex items-center gap-1.5 bg-navy border border-white/8 rounded-xl p-1 w-fit">
            {anosDisponiveis.map(a => (
              <button key={a} type="button" onClick={() => setAno(a)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-mono transition-all ${
                  ano === a ? 'bg-[#141B28] text-white border border-white/10' : 'text-white/35 hover:text-white/60'}`}>
                {a}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard href="/cispr15" icon={<FileText size={18} />}      label={`Relatórios ${ano}`}    value={relatoriosAno.length}     color="#9B8CFF" />
            <StatCard             icon={<GitBranch size={18} />}     label="Emendas (não conf.)"    value={emendaStats.totalEmendas} color="#F87171"
              sub={`${emendaStats.pct}% dos relatórios`} />
            <StatCard             icon={<Clock size={18} />}         label="Tempo médio de saída"   value={tempoStats.media !== null ? `${tempoStats.media}d` : '—'}
              sub={`base: ${tempoStats.amostra} relatórios`} color="#34D399" />
            <StatCard             icon={<AlertTriangle size={18} />} label={`Atrasos (>${PRAZO_ATRASO_DIAS}d)`} value={tempoStats.atrasos} color="#F59E0B" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard icon={<Timer size={18} />}    label="Tempo médio de emissão"
              value={formatDuracao(trabalhoStats.emissao.mediaMs)}
              sub={trabalhoStats.emissao.n ? `${trabalhoStats.emissao.n} emissão(ões) · do formulário ao PDF` : 'sem dados ainda'}
              color="#9B8CFF" />
            <StatCard icon={<Hourglass size={18} />} label="Tempo médio de cadastro (amostra)"
              value={formatDuracao(trabalhoStats.agendaT.mediaMs)}
              sub={trabalhoStats.agendaT.n ? `${trabalhoStats.agendaT.n} cadastro(s) na agenda` : 'sem dados ainda'}
              color="#34D399" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={`Relatórios por mês · ${ano}`}>
              <BarChart data={porMes} color="#9B8CFF" />
            </ChartCard>
            <ChartCard title={`Emendas — não conformidades · ${ano}`}>
              <DonutChart
                centerTop={`${emendaStats.pct}%`}
                centerSub="com emenda"
                segments={[
                  { label: 'Sem emenda', value: emendaStats.semEmenda, color: '#34D399' },
                  { label: 'Com emenda', value: emendaStats.comEmenda, color: '#F87171' },
                ]}
              />
            </ChartCard>
          </div>
        </div>
      )}

      {/* ── ABA: EQUIPAMENTOS ── */}
      {aba === 'equipamentos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard href="/equipamentos" icon={<Cpu size={18} />}            label="Total de equipamentos"  value={equips.length}          color="#4F8EF7" />
            <StatCard href="/equipamentos" icon={<AlertTriangle size={18} />}  label="Calibrações vencidas"   value={calVencidas.length}     color="#F87171" />
            <StatCard href="/equipamentos" icon={<Clock size={18} />}          label="Vencendo em 30 dias"    value={calVencendoLogo.length} color="#F59E0B" />
            <StatCard href="/equipamentos" icon={<ShieldCheck size={18} />}    label="Em dia"
              value={equips.filter(e => e.status === 'ativo' && !calVencendoLogo.includes(e)).length} color="#34D399" />
          </div>

          {calVencidas.length > 0 && (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-[14px] text-white mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-400" />
                Calibrações vencidas
              </h2>
              <div className="flex flex-wrap gap-2">
                {calVencidas.map(e => (
                  <Link key={e.id} href={`/equipamentos/${e.id}`}
                    className="font-mono text-[11px] px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
                    {e.tag}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {calVencendoLogo.length > 0 && (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-[14px] text-white mb-3 flex items-center gap-2">
                <Clock size={14} className="text-amber-400" />
                Vencendo nos próximos 30 dias
              </h2>
              <div className="flex flex-wrap gap-2">
                {calVencendoLogo.map(e => (
                  <Link key={e.id} href={`/equipamentos/${e.id}`}
                    className="font-mono text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors">
                    {e.tag} <span className="opacity-60">· {diasAte(e.proximaCalibracao)}d</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <ChartCard title="Equipamentos por grupo">
            <HBarChart data={porGrupo} color="#4F8EF7" />
          </ChartCard>
        </div>
      )}

      {/* ── ABA: QUALIDADE ── */}
      {aba === 'qualidade' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard href="/checagens" icon={<ClipboardCheck size={18} />} label="Total de checagens"  value={checagens.length} color="#4F8EF7" />
            <StatCard href="/checagens" icon={<AlertTriangle size={18} />}  label="Checagens vencendo" value={pendentes}        color="#F59E0B" />
            <StatCard href="/checagens" icon={<AlertTriangle size={18} />}  label="Checagens vencidas" value={vencidas}         color="#F87171" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Checagens por status">
              <DonutChart
                centerTop={checagens.length}
                centerSub="checagens"
                segments={[
                  { label: 'Em dia',   value: emDia,     color: '#34D399' },
                  { label: 'Vencendo', value: pendentes, color: '#F59E0B' },
                  { label: 'Vencidas', value: vencidas,  color: '#F87171' },
                ]}
              />
            </ChartCard>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold text-[15px] text-white">Próximas checagens</h2>
                <Link href="/checagens" className="text-[11px] text-white/35 hover:text-white flex items-center gap-1 transition-colors">
                  Ver todas <ChevronRight size={11} />
                </Link>
              </div>
              {proximas.length === 0 ? (
                <p className="text-white/25 text-sm py-6 text-center">Nenhuma checagem registrada.</p>
              ) : (
                <table className="w-full">
                  <thead className="tbl-head">
                    <tr>
                      <th>Equipamento</th>
                      <th>Data</th>
                      <th>Próxima</th>
                      <th>Status</th>
                    </tr>
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
        </div>
      )}
    </div>
  )
}
