'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import type { ClienteDB } from '@/app/cispr15/types'

/* ─── seletor de cliente ──────────────────────────────────────────────────── */
// Compartilhado pelas agendas LUM (CISPR 15) e EMC.
export function ClientePicker({ clientes, onSelect }: {
  clientes: ClienteDB[]
  onSelect: (c: ClienteDB) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const filtrados = clientes.filter(c =>
    !q || c.nome?.toLowerCase().includes(q.toLowerCase()) || c.cnpj?.includes(q)
  )
  if (clientes.length === 0) return null
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
          <input
            className="input pl-7 text-xs"
            placeholder="Buscar cliente cadastrado…"
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        </div>
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-xl border border-white/10 bg-[#0d1017] shadow-xl max-h-[180px] overflow-y-auto">
          {filtrados.length === 0
            ? <p className="text-[11px] text-white/25 px-3 py-2">Nenhum cliente encontrado.</p>
            : filtrados.slice(0, 20).map(c => (
                <button key={c.id} type="button" onMouseDown={() => { onSelect(c); setQ(''); setOpen(false) }}
                  className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors border-b border-white/4 last:border-0">
                  <p className="text-xs text-white/80 font-semibold">{c.nome}</p>
                  {(c.cidade || c.cep) && (
                    <p className="text-[10px] text-white/35">{[c.cidade, c.cep].filter(Boolean).join(' · ')}</p>
                  )}
                </button>
              ))
          }
        </div>
      )}
    </div>
  )
}
