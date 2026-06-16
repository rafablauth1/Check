'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Trash2, CheckCircle2, AlertTriangle, X, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Norma } from '@/lib/normas/tipos'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'

function TipoBadge({ tipo }: { tipo: string }) {
  if (tipo === 'emissao')   return <span className="badge-gold">Emissão</span>
  if (tipo === 'imunidade') return <span className="badge-accent">Imunidade</span>
  return <span className="badge">Geral</span>
}

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
}

function NovaNormaModal({ onSalvar, onFechar }: { onSalvar: () => void; onFechar: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [titulo, setTitulo] = useState('')
  const [tipo,   setTipo]   = useState<'emissao' | 'imunidade' | 'geral'>('emissao')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!codigo.trim()) { setErr('Código obrigatório.'); return }
    if (!titulo.trim()) { setErr('Título obrigatório.'); return }
    setSaving(true)
    const res = await fetch('/api/normas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: slugify(codigo), codigo, titulo, tipo, equipamentosNecessarios: [], tabelasLimites: [], secoes: [] }),
    })
    const data = await res.json()
    if (data.error) { setErr(data.error); setSaving(false); return }
    onSalvar()
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onFechar}>
      <div className="card p-6 w-[500px] max-w-[95vw]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-display font-bold text-[15px] text-white">Nova norma</p>
          <button type="button" onClick={onFechar} className="btn-ghost p-1.5"><X size={14}/></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Código *</label>
              <input className="input" value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="ex: CISPR 15" />
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Tipo</label>
              <select className="input" value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}>
                <option value="emissao">Emissão</option>
                <option value="imunidade">Imunidade</option>
                <option value="geral">Geral</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Título *</label>
            <input className="input" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título completo da norma" />
          </div>
          {err && <p className="text-[12px] text-red-400">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onFechar} className="btn-secondary">Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={12}/> {saving ? 'Salvando…' : 'Criar norma'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function NormasPage() {
  const [normas,  setNormas]  = useState<Norma[]>([])
  const [equips,  setEquips]  = useState<EquipamentoEMC[]>([])
  const [novaNorma, setNovaNorma] = useState(false)

  async function carregar() {
    const [n, e] = await Promise.all([
      fetch('/api/normas').then(r => r.json()),
      fetch('/api/equipamentos').then(r => r.json()),
    ])
    setNormas(Array.isArray(n) ? n : [])
    setEquips(Array.isArray(e) ? e : [])
  }

  useEffect(() => { carregar() }, [])

  function grupoOk(grupoId: string) {
    return equips.some(e => e.grupoId === grupoId && e.status === 'ativo')
  }

  async function excluir(n: Norma) {
    if (!confirm(`Excluir a norma "${n.codigo}"?`)) return
    await fetch(`/api/normas/${n.id}`, { method: 'DELETE' })
    carregar()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Laboratório · EMC</p>
          <h1 className="page-title">Normas</h1>
          <p className="page-sub">Referências normativas do laboratório</p>
        </div>
        <button className="btn-primary" onClick={() => setNovaNorma(true)}>
          <Plus size={13}/> Nova norma
        </button>
      </div>

      <div className="space-y-3">
        {normas.map(n => (
          <div key={n.id} className="card group/row">
            <div className="flex gap-5 p-5 hover:border-white/15 transition-colors">
              <Link href={`/normas/${n.id}`} className="flex-1 min-w-0 flex gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display font-bold text-[15px]" style={{ color: 'var(--accent,#E8B94B)' }}>{n.codigo}</span>
                    <TipoBadge tipo={n.tipo}/>
                  </div>
                  <p className="text-[12px] text-white/60 leading-relaxed mb-3">{n.titulo}</p>
                  <div className="flex flex-wrap gap-2">
                    {n.equipamentosNecessarios.map(eq => {
                      const ok = grupoOk(eq.grupoId)
                      return (
                        <span key={eq.grupoId} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border"
                          style={{ color: ok ? '#22C55E' : '#F59E0B', background: ok ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)', borderColor: ok ? 'rgba(34,197,94,0.18)' : 'rgba(245,158,11,0.18)' }}>
                          {ok ? <CheckCircle2 size={9}/> : <AlertTriangle size={9}/>}
                          {eq.descricao}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </Link>
              <div className="flex items-start gap-1 flex-shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
                <Link href={`/normas/${n.id}`} className="btn-ghost p-1.5 text-[11px]">Editar</Link>
                <button className="btn-ghost p-1.5 hover:text-red-400" onClick={() => excluir(n)}>
                  <Trash2 size={13}/>
                </button>
              </div>
            </div>
          </div>
        ))}
        {normas.length === 0 && (
          <div className="card p-10 text-center text-white/25 text-sm">Nenhuma norma cadastrada.</div>
        )}
      </div>

      {novaNorma && (
        <NovaNormaModal
          onSalvar={() => { setNovaNorma(false); carregar() }}
          onFechar={() => setNovaNorma(false)}
        />
      )}
    </div>
  )
}
