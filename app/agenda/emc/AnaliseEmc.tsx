'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { today } from '@/app/cispr15/types'
import { Icone } from '@/lib/taxonomia/icones'
import type { AgendaItemEmc, EnsaioCatalogo } from '@/lib/emc/tipos'
import { daysUntil, diasEntre, fmtDate } from '@/app/agenda/emc/comum'

/* Aba Análise da agenda EMC — mesmos indicadores da agenda LUM, mais a visão
   por tipo de equipamento e por ensaio (pendentes, realizados, reprovação). */

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const emitido = (a: AgendaItemEmc) => !!a.numRelatorio
const media = (xs: number[]) => xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null

function Card({ valor, label, cor }: { valor: number | string; label: string; cor?: string }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <span className={cn('text-2xl font-bold font-mono', cor ?? 'text-white')}>{valor}</span>
      <span className="text-[10px] uppercase tracking-widest font-mono text-white/35">{label}</span>
    </div>
  )
}

function Barra({ partes, total }: { partes: { valor: number; cor: string }[]; total: number }) {
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5 flex-1">
      {total > 0 && partes.filter(p => p.valor > 0).map((p, i) => (
        <div key={i} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} />
      ))}
    </div>
  )
}

export function AnaliseEmc({ itens, catalogo }: { itens: AgendaItemEmc[]; catalogo: EnsaioCatalogo[] }) {
  const [periodo, setPeriodo] = useState<'7' | '30' | '90' | '180' | 'all'>('all')

  const a = useMemo(() => {
    const hoje = today()
    const corte = periodo === 'all' ? null : (() => {
      const d = new Date(); d.setDate(d.getDate() - Number(periodo)); return d.toISOString().split('T')[0]
    })()
    const base = corte ? itens.filter(i => !i.dataEntrada || i.dataEntrada >= corte) : itens
    const andamento = base.filter(i => !emitido(i))
    const concluidos = base.filter(emitido)
    const comPrazo = andamento.filter(i => i.previsaoSaida)
    const vencidos = comPrazo.filter(i => i.previsaoSaida < hoje)
    const urgentes = comPrazo.filter(i => { const d = daysUntil(i.previsaoSaida); return d >= 0 && d <= 3 })

    const tempos = concluidos.filter(i => i.dataEntrada && i.dataEmissao).map(i => diasEntre(i.dataEntrada, i.dataEmissao))
    const conclComPrazo = concluidos.filter(i => i.dataEmissao && i.previsaoSaida)
    const pontuais = conclComPrazo.filter(i => i.dataEmissao <= i.previsaoSaida).length
    const d90 = new Date(); d90.setDate(d90.getDate() - 90)
    const recentes = concluidos.filter(i => i.dataEmissao && new Date(i.dataEmissao + 'T12:00:00') >= d90)

    // entradas × emissões nos últimos 6 meses
    const meses: { chave: string; label: string; entradas: number; emitidos: number }[] = []
    for (let k = 5; k >= 0; k--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k)
      const chave = d.toISOString().substring(0, 7)
      meses.push({
        chave, label: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        entradas: base.filter(i => i.dataEntrada?.startsWith(chave)).length,
        emitidos: concluidos.filter(i => i.dataEmissao?.startsWith(chave)).length,
      })
    }

    // por tipo de equipamento
    const tipos = new Map<string, { nome: string; icone: string; total: number; andamento: number; concluidos: number; tempos: number[] }>()
    for (const i of base) {
      const t = tipos.get(i.templateId) ?? { nome: i.template.nome, icone: i.template.icone, total: 0, andamento: 0, concluidos: 0, tempos: [] }
      t.total++
      if (emitido(i)) {
        t.concluidos++
        if (i.dataEntrada && i.dataEmissao) t.tempos.push(diasEntre(i.dataEntrada, i.dataEmissao))
      } else t.andamento++
      tipos.set(i.templateId, t)
    }

    // por ensaio: andamento (pendente/realizado/reprovado) e reprovação histórica
    const ensaios = new Map<string, { codigo: string; nome: string; pend: number; real: number; repr: number; histReal: number; histRepr: number }>()
    for (const i of base) {
      for (const e of i.ensaios) {
        const cat = catalogo.find(c => c.id === e.ensaioId)
        const x = ensaios.get(e.ensaioId) ?? { codigo: cat?.codigo ?? e.codigo, nome: cat?.nome ?? e.nome, pend: 0, real: 0, repr: 0, histReal: 0, histRepr: 0 }
        if (!emitido(i)) {
          if (e.status === 'pendente') x.pend++
          else if (e.status === 'realizado') x.real++
          else x.repr++
        }
        if (e.status === 'realizado') x.histReal++
        if (e.status === 'reprovado') x.histRepr++
        ensaios.set(e.ensaioId, x)
      }
    }
    const ordemCat = (id: string) => { const k = catalogo.findIndex(c => c.id === id); return k < 0 ? 999 : k }

    const clientes: Record<string, number> = {}
    base.forEach(i => { if (i.cliente) clientes[i.cliente] = (clientes[i.cliente] ?? 0) + 1 })

    const resp: Record<string, { label: string; andamento: number; vencidos: number }> = {}
    andamento.forEach(i => {
      const raw = i.responsavel?.trim() || '—'
      const k = raw.toLowerCase()
      resp[k] ??= { label: raw, andamento: 0, vencidos: 0 }
      resp[k].andamento++
      if (i.previsaoSaida && i.previsaoSaida < hoje) resp[k].vencidos++
    })

    return {
      total: base.length, andamento: andamento.length, concluidos: concluidos.length,
      vencidos, urgentes, semPrazo: andamento.length - comPrazo.length,
      tempoMedio: media(tempos),
      pontualidade: conclComPrazo.length ? Math.round((pontuais / conclComPrazo.length) * 100) : null,
      pontuais, conclComPrazo: conclComPrazo.length,
      throughput: Math.round((recentes.length / 3) * 10) / 10,
      mediaAberto: media(andamento.filter(i => i.dataEntrada).map(i => diasEntre(i.dataEntrada, hoje))),
      meses, maxMes: Math.max(1, ...meses.map(m => Math.max(m.entradas, m.emitidos))),
      tipos: [...tipos.values()].sort((x, y) => y.total - x.total),
      ensaios: [...ensaios.entries()].sort((x, y) => ordemCat(x[0]) - ordemCat(y[0])).map(([, v]) => v),
      topClientes: Object.entries(clientes).sort((x, y) => y[1] - x[1]).slice(0, 6),
      backlog: Object.values(resp).sort((x, y) => y.andamento - x.andamento).slice(0, 5),
    }
  }, [itens, catalogo, periodo])

  const maxCliente = Math.max(1, ...a.topClientes.map(c => c[1]))
  const maxBacklog = Math.max(1, ...a.backlog.map(b => b.andamento))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest shrink-0">Período:</span>
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8">
          {([['7', 'Semana'], ['30', '30d'], ['90', '90d'], ['180', '180d'], ['all', 'Tudo']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setPeriodo(v)}
              className={cn('px-2.5 py-1 rounded text-[10px] font-semibold transition-all',
                periodo === v ? 'bg-gold/15 border border-gold/25 text-gold' : 'text-white/35 hover:text-white/60')}>{l}</button>
          ))}
        </div>
        {periodo !== 'all' && <span className="text-[10px] text-white/20 font-mono">{a.total} {a.total === 1 ? 'item' : 'itens'} no período</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card valor={a.total} label="Total" />
        <Card valor={a.andamento} label="Em andamento" cor="text-white/70" />
        <Card valor={a.concluidos} label="Emitidos" cor="text-green-400" />
        <Card valor={a.urgentes.length} label="Vence em 3 dias" cor="text-amber-400" />
        <Card valor={a.vencidos.length} label="Vencidos" cor="text-red-400" />
        <Card valor={a.semPrazo} label="Sem prazo" cor="text-white/40" />
      </div>

      {a.total > 0 && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Indicadores de Desempenho</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              ['Tempo médio de ensaio', a.tempoMedio !== null ? `${a.tempoMedio}d` : '—', 'entrada → emissão'],
              ['Pontualidade', a.pontualidade !== null ? `${a.pontualidade}%` : '—', `${a.pontuais}/${a.conclComPrazo} emitidos no prazo`],
              ['Emissões por mês', String(a.throughput), 'média dos últimos 90 dias'],
              ['Dias em aberto', a.mediaAberto !== null ? `${a.mediaAberto}d` : '—', 'média dos itens em andamento'],
            ] as const).map(([l, v, sub]) => (
              <div key={l} className="flex flex-col gap-0.5">
                <span className="text-xl font-bold font-mono text-white">{v}</span>
                <span className="text-[10px] text-white/45 font-semibold">{l}</span>
                <span className="text-[9px] text-white/25">{sub}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* por tipo de equipamento */}
        <div className="card p-4 space-y-2">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-1">Por tipo de equipamento</p>
          {a.tipos.length === 0 && <p className="text-[11px] text-white/25">Sem itens no período.</p>}
          {a.tipos.map(t => (
            <div key={t.nome} className="flex items-center gap-2 text-[11px]">
              <Icone name={t.icone} size={13} className="text-teal/70 shrink-0" />
              <span className="text-white/70 flex-1 truncate">{t.nome}</span>
              <span className="font-mono text-white/40 w-16 text-right">{t.andamento} and.</span>
              <span className="font-mono text-green-400/70 w-16 text-right">{t.concluidos} emit.</span>
              <span className="font-mono text-white/30 w-20 text-right">{media(t.tempos) !== null ? `${media(t.tempos)}d médio` : '—'}</span>
            </div>
          ))}
        </div>

        {/* por ensaio */}
        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Ensaios em andamento</p>
            <div className="flex gap-3 text-[9px] font-mono text-white/30">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-400/60" />realizado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400/60" />reprovado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-white/15" />pendente</span>
            </div>
          </div>
          {a.ensaios.length === 0 && <p className="text-[11px] text-white/25">Sem ensaios no período.</p>}
          {a.ensaios.map(e => {
            const tot = e.pend + e.real + e.repr
            const hist = e.histReal + e.histRepr
            return (
              <div key={e.codigo} className="flex items-center gap-2" title={e.nome}>
                <span className="font-mono font-bold text-[10px] text-white/70 w-10 shrink-0">{e.codigo}</span>
                <Barra total={tot} partes={[
                  { valor: e.real, cor: 'rgba(74,222,128,0.6)' },
                  { valor: e.repr, cor: 'rgba(248,113,113,0.6)' },
                  { valor: e.pend, cor: 'rgba(255,255,255,0.12)' },
                ]} />
                <span className="font-mono text-[10px] text-white/40 w-16 text-right shrink-0">{e.pend} pend.</span>
                <span className={cn('font-mono text-[10px] w-20 text-right shrink-0', e.histRepr ? 'text-red-400/80' : 'text-white/25')}
                  title="reprovados / (realizados + reprovados), no período">
                  {hist ? `${Math.round((e.histRepr / hist) * 100)}% reprov.` : '—'}
                </span>
              </div>
            )
          })}
        </div>

        {/* entradas × emissões */}
        <div className="card p-4">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-3">Entradas × emissões (6 meses)</p>
          <div className="flex items-end gap-3 h-28">
            {a.meses.map(m => (
              <div key={m.chave} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex items-end gap-0.5 h-20 w-full justify-center">
                  <div className="w-3 rounded-t bg-teal/50" style={{ height: `${(m.entradas / a.maxMes) * 100}%` }} title={`${m.entradas} entradas`} />
                  <div className="w-3 rounded-t bg-green-400/50" style={{ height: `${(m.emitidos / a.maxMes) * 100}%` }} title={`${m.emitidos} emitidos`} />
                </div>
                <span className="text-[9px] font-mono text-white/30">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-[9px] font-mono text-white/30 mt-2">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-teal/50" />entradas</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-400/50" />emitidos</span>
          </div>
        </div>

        {/* clientes + responsáveis */}
        <div className="card p-4 space-y-4">
          <div className="space-y-1.5">
            <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Principais clientes</p>
            {a.topClientes.length === 0 && <p className="text-[11px] text-white/25">—</p>}
            {a.topClientes.map(([c, n]) => (
              <div key={c} className="flex items-center gap-2 text-[11px]">
                <span className="text-white/60 w-40 truncate">{c}</span>
                <Barra total={maxCliente} partes={[{ valor: n, cor: 'rgba(45,212,191,0.5)' }]} />
                <span className="font-mono text-white/40 w-6 text-right">{n}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Em andamento por responsável</p>
            {a.backlog.length === 0 && <p className="text-[11px] text-white/25">—</p>}
            {a.backlog.map(b => (
              <div key={b.label} className="flex items-center gap-2 text-[11px]">
                <span className="text-white/60 w-40 truncate">{b.label}</span>
                <Barra total={maxBacklog} partes={[
                  { valor: b.andamento - b.vencidos, cor: 'rgba(255,255,255,0.2)' },
                  { valor: b.vencidos, cor: 'rgba(248,113,113,0.6)' },
                ]} />
                <span className="font-mono text-white/40 w-14 text-right">{b.andamento}{b.vencidos ? <span className="text-red-400/80"> ({b.vencidos})</span> : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {a.vencidos.length > 0 && (
        <div className="card p-4 border-red-500/20">
          <p className="text-[10px] text-red-400/70 font-mono uppercase tracking-widest mb-2">Vencidos</p>
          <div className="space-y-1">
            {a.vencidos.slice(0, 10).map(i => (
              <div key={i.id} className="flex items-center gap-2 text-[11px]">
                <Icone name={i.template.icone} size={11} className="text-teal/60" />
                <span className="font-mono text-white/80 w-36 truncate">{i.protocolo || '—'}</span>
                <span className="text-white/45 flex-1 truncate">{i.cliente || '—'}</span>
                <span className="font-mono text-red-400/80">{fmtDate(i.previsaoSaida)} ({Math.abs(daysUntil(i.previsaoSaida))}d)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
