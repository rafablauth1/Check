'use client'

import { Clock, CheckCircle2, XCircle, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { today } from '@/app/cispr15/types'
import type { AgendaItemEmc, EnsaioDaAmostra } from '@/lib/emc/tipos'

/* ─── helpers da agenda EMC ───────────────────────────────────────────────── */

export function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

export function daysUntil(dateStr: string): number {
  if (!dateStr) return 999
  const now = new Date(today() + 'T00:00:00')
  const target = new Date(dateStr + 'T00:00:00')
  return Math.floor((target.getTime() - now.getTime()) / 86400000)
}

export function diasNoLab(dataEntrada: string): number {
  if (!dataEntrada) return 0
  const now = new Date(today() + 'T00:00:00')
  const entrada = new Date(dataEntrada + 'T00:00:00')
  return Math.max(0, Math.floor((now.getTime() - entrada.getTime()) / 86400000))
}

export function diasEntre(a: string, b: string): number {
  return Math.max(0, Math.floor((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000))
}

/** Prazo EMC é manual: N semanas a partir da entrada. */
export function somarSemanas(dateStr: string, semanas: number): string {
  const d = new Date((dateStr || today()) + 'T12:00:00')
  d.setDate(d.getDate() + semanas * 7)
  return d.toISOString().split('T')[0]
}

/** Cor da borda do item: emitido = neutro; sem prazo = neutro; vencido/≤3 dias/em dia. */
export function corPrazo(item: AgendaItemEmc): string {
  if (item.numRelatorio || !item.previsaoSaida) return 'rgba(255,255,255,0.07)'
  const d = daysUntil(item.previsaoSaida)
  if (d < 0)  return 'rgba(239,68,68,0.55)'
  if (d <= 3) return 'rgba(251,191,36,0.55)'
  return 'rgba(34,197,94,0.4)'
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">{children}</label>
}

/** Badge de um ensaio: código + status (clique alterna pendente → realizado → reprovado). */
export function BadgeEnsaio({ e, onClick, small }: { e: EnsaioDaAmostra; onClick?: () => void; small?: boolean }) {
  const cls = e.status === 'realizado' ? 'border-green/30 bg-green/10 text-green-400'
    : e.status === 'reprovado' ? 'border-red-500/30 bg-red-500/10 text-red-400'
    : 'border-white/10 text-white/35 hover:border-white/25 hover:text-white/60'
  const origem = e.fonte === 'radian' && e.status === 'realizado' && !e.manual
    ? ` · .DAT do Radian${e.realizadoEm ? ' de ' + fmtDate(e.realizadoEm) : ''}` : ''
  const titulo = `${e.codigo} — ${e.nome} · ${e.status}${origem}${e.relogio ? ' · medição por relógio' : ''}`
  const conteudo = (
    <>
      {e.status === 'realizado' ? <CheckCircle2 size={8} /> : e.status === 'reprovado' ? <XCircle size={8} /> : null}
      {e.codigo}
      {e.relogio && <Timer size={8} className="opacity-60" />}
    </>
  )
  const base = cn('inline-flex items-center gap-0.5 rounded border font-mono font-bold leading-none transition-all',
    small ? 'text-[8px] px-1 py-0.5' : 'text-[9px] px-1.5 py-1', cls)
  return onClick
    ? <button type="button" title={titulo} onClick={onClick} className={base}>{conteudo}</button>
    : <span title={titulo} className={base}>{conteudo}</span>
}

export function ChipEtiqueta({ texto }: { texto: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-purple-400/30 bg-purple-400/8 text-purple-300 text-[9px] px-1.5 py-0.5 font-semibold leading-none">
      {texto === 'Relógio' && <Clock size={8} />}{texto}
    </span>
  )
}
