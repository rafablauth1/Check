'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { fmt, diasAte } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Checagem } from '@/lib/checagens/tipos'

function PrazoBadge({ proxima }: { proxima: string }) {
  const d = diasAte(proxima)
  if (typeof d !== 'number') return null
  if (d < 0)    return <span className="badge-danger">{Math.abs(d)}d vencida</span>
  if (d <= 30)  return <span className="badge-warning">{d}d restantes</span>
  return <span className="badge-success">{d}d restantes</span>
}

function CheckRow({ c }: { c: Checagem }) {
  return (
    <Link href={`/checagens/${c.id}`} className={cn(
      'flex items-center gap-4 px-4 py-3 border-b border-white/5 hover:bg-white/[0.025] transition-colors',
      c.status === 'reprovado' && 'border-l-2 border-l-red-500/60',
      c.status === 'atencao'  && 'border-l-2 border-l-amber-500/60',
    )}>
      <span className="tag-chip flex-shrink-0">{c.equipamentoTag}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white/75 font-medium truncate">{c.subgrupoId}</p>
        <p className="text-[10px] text-white/30 font-mono">{c.normaReferencia ?? '—'}</p>
      </div>
      <span className="text-[11px] text-white/40 font-mono flex-shrink-0">{fmt(c.data)}</span>
      <PrazoBadge proxima={c.proximaChecagem} />
    </Link>
  )
}

function Section({ title, items }: { title: string; items: Checagem[] }) {
  if (items.length === 0) return null
  return (
    <div className="mb-6">
      <h2 className="font-mono text-[8.5px] tracking-[3px] uppercase text-white/35 mb-2 px-1">{title}</h2>
      <div className="card overflow-hidden">
        {items.map(c => <CheckRow key={c.id} c={c} />)}
      </div>
    </div>
  )
}

export default function CheckagensPage() {
  const [checagens, setChecagens] = useState<Checagem[]>([])

  useEffect(() => {
    fetch('/api/checagens').then(r => r.json()).then(c => {
      setChecagens(Array.isArray(c) ? c : [])
    }).catch(() => {})
  }, [])

  const vencidas  = checagens.filter(c => c.status === 'reprovado')
  const vencendo  = checagens.filter(c => c.status === 'atencao')
  const emDia     = checagens.filter(c => c.status === 'aprovado')

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Laboratório · EMC</p>
          <h1 className="page-title">Checagens intermediárias</h1>
          <p className="page-sub">Controle de conformidade dos instrumentos</p>
        </div>
        <Link href="/checagens/nova" className="btn-primary">
          <Plus size={13} /> Nova
        </Link>
      </div>

      {checagens.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-white/25 text-sm mb-3">Nenhuma checagem registrada ainda.</p>
          <Link href="/checagens/nova" className="btn-primary inline-flex">
            <Plus size={13} /> Criar primeira checagem
          </Link>
        </div>
      ) : (
        <>
          <Section title="Vencidas"                      items={vencidas} />
          <Section title="Vencendo nos próximos 30 dias" items={vencendo} />
          <Section title="Em dia"                        items={emDia} />
        </>
      )}
    </div>
  )
}
