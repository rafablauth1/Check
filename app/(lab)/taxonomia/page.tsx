'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GRUPO_CORES } from '@/lib/grupos-icons'
import { ICONES, ICON_NAMES, Icone } from '@/lib/taxonomia/icones'
import type { Taxonomia, Area, SiglaTag, TipoEquip } from '@/lib/taxonomia/tipos'

const CORES = Object.keys(GRUPO_CORES)
function uid() { return Math.random().toString(36).slice(2, 9) }

export default function TaxonomiaPage() {
  const [tax, setTax] = useState<Taxonomia>({ areas: [], siglas: [], tipos: [] })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [iconePicker, setIconePicker] = useState<string | null>(null) // tipoId aberto

  useEffect(() => {
    fetch('/api/taxonomia').then(r => r.json()).then((t: Taxonomia) => {
      setTax({ areas: t.areas ?? [], siglas: t.siglas ?? [], tipos: t.tipos ?? [] })
    }).catch(() => {}).finally(() => setCarregando(false))
  }, [])

  function marcarAlterado() { setSalvo(false) }

  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch('/api/taxonomia', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tax),
      })
      if (r.ok) { setSalvo(true); setTimeout(() => setSalvo(false), 2500) }
      else alert('Falha ao salvar.')
    } finally { setSalvando(false) }
  }

  // ── Áreas ──────────────────────────────────────────────────────────────
  const addArea = () => { setTax(t => ({ ...t, areas: [...t.areas, { id: uid(), nome: '', cor: 'teal' }] })); marcarAlterado() }
  const setArea = (id: string, campo: keyof Area, val: string) => {
    setTax(t => ({ ...t, areas: t.areas.map(a => a.id === id ? { ...a, [campo]: val } : a) })); marcarAlterado()
  }
  const delArea = (id: string) => {
    setTax(t => ({
      ...t,
      areas: t.areas.filter(a => a.id !== id),
      siglas: t.siglas.map(s => s.areaId === id ? { ...s, areaId: '' } : s),
      tipos: t.tipos.map(tp => ({ ...tp, areaIds: tp.areaIds.filter(x => x !== id) })),
    })); marcarAlterado()
  }

  // ── Siglas ─────────────────────────────────────────────────────────────
  const addSigla = () => { setTax(t => ({ ...t, siglas: [...t.siglas, { sigla: '', significado: '', areaId: t.areas[0]?.id ?? '' }] })); marcarAlterado() }
  const setSigla = (idx: number, campo: keyof SiglaTag, val: string) => {
    setTax(t => ({ ...t, siglas: t.siglas.map((s, i) => i === idx ? { ...s, [campo]: campo === 'sigla' ? val.toUpperCase().slice(0, 4) : val } : s) })); marcarAlterado()
  }
  const delSigla = (idx: number) => { setTax(t => ({ ...t, siglas: t.siglas.filter((_, i) => i !== idx) })); marcarAlterado() }

  // ── Tipos ──────────────────────────────────────────────────────────────
  const addTipo = () => { setTax(t => ({ ...t, tipos: [...t.tipos, { id: uid(), nome: '', icone: 'Gauge', areaIds: [] }] })); marcarAlterado() }
  const setTipo = (id: string, campo: keyof TipoEquip, val: string) => {
    setTax(t => ({ ...t, tipos: t.tipos.map(tp => tp.id === id ? { ...tp, [campo]: val } : tp) })); marcarAlterado()
  }
  const toggleTipoArea = (id: string, areaId: string) => {
    setTax(t => ({ ...t, tipos: t.tipos.map(tp => tp.id === id
      ? { ...tp, areaIds: tp.areaIds.includes(areaId) ? tp.areaIds.filter(x => x !== areaId) : [...tp.areaIds, areaId] }
      : tp) })); marcarAlterado()
  }
  const delTipo = (id: string) => { setTax(t => ({ ...t, tipos: t.tipos.filter(tp => tp.id !== id) })); marcarAlterado() }

  const corDe = (c: string) => GRUPO_CORES[c] ?? '#94A3B8'
  const areaNome = (id: string) => tax.areas.find(a => a.id === id)?.nome ?? '—'

  if (carregando) return <div className="card p-10 text-center text-white/30 text-sm"><Loader2 className="animate-spin inline mr-2" size={16}/> Carregando…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Laboratório · EMC</p>
          <h1 className="page-title">Áreas, Siglas e Tipos</h1>
          <p className="page-sub">Configure o significado das siglas das TAGs, as áreas e os tipos de equipamento</p>
        </div>
        <button type="button" onClick={salvar} disabled={salvando} className="btn-primary">
          {salvando ? <Loader2 size={13} className="animate-spin"/> : salvo ? <Check size={13}/> : <Save size={13}/>}
          {salvando ? 'Salvando…' : salvo ? 'Salvo' : 'Salvar tudo'}
        </button>
      </div>

      <div className="space-y-8">
        {/* ÁREAS */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-[13px] text-white/60 uppercase tracking-widest">Áreas / Laboratórios</h2>
            <button type="button" onClick={addArea} className="btn-ghost text-xs py-1"><Plus size={12}/> Área</button>
          </div>
          <div className="card divide-y divide-white/5">
            {tax.areas.length === 0 && <div className="p-6 text-center text-white/25 text-sm">Nenhuma área. Adicione uma.</div>}
            {tax.areas.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: corDe(a.cor) }}/>
                <input className="input text-[12px] py-1 flex-1" placeholder="Nome da área (ex.: EMC)"
                  value={a.nome} onChange={e => setArea(a.id, 'nome', e.target.value)} />
                <div className="flex gap-1">
                  {CORES.map(c => (
                    <button key={c} type="button" title={c} onClick={() => setArea(a.id, 'cor', c)}
                      className={cn('w-5 h-5 rounded-full transition-all', a.cor === c ? 'ring-2 ring-white/60 scale-110' : 'opacity-50 hover:opacity-100')}
                      style={{ background: corDe(c) }} />
                  ))}
                </div>
                <button type="button" onClick={() => delArea(a.id)} className="text-white/25 hover:text-red-400 p-1"><Trash2 size={13}/></button>
              </div>
            ))}
          </div>
        </section>

        {/* SIGLAS */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-[13px] text-white/60 uppercase tracking-widest">Siglas das TAGs (3 letras finais)</h2>
            <button type="button" onClick={addSigla} className="btn-ghost text-xs py-1"><Plus size={12}/> Sigla</button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="tbl-head"><tr><th className="w-24">Sigla</th><th>Significado</th><th className="w-64">Área</th><th className="w-10"></th></tr></thead>
              <tbody>
                {tax.siglas.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-white/25 text-sm">Nenhuma sigla cadastrada.</td></tr>}
                {tax.siglas.map((s, i) => (
                  <tr key={i} className="tbl-row">
                    <td><input className="input font-mono text-[12px] py-1 w-20 text-center uppercase" placeholder="EMC" value={s.sigla} onChange={e => setSigla(i, 'sigla', e.target.value)} /></td>
                    <td><input className="input text-[12px] py-1 w-full" placeholder="Compatibilidade Eletromagnética" value={s.significado} onChange={e => setSigla(i, 'significado', e.target.value)} /></td>
                    <td>
                      <select className="input text-[12px] py-1 w-full" value={s.areaId} onChange={e => setSigla(i, 'areaId', e.target.value)}>
                        <option value="">— Área —</option>
                        {tax.areas.map(a => <option key={a.id} value={a.id}>{a.nome || '(sem nome)'}</option>)}
                      </select>
                    </td>
                    <td><button type="button" onClick={() => delSigla(i)} className="text-white/25 hover:text-red-400 p-1"><Trash2 size={13}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* TIPOS */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-[13px] text-white/60 uppercase tracking-widest">Tipos de equipamento</h2>
            <button type="button" onClick={addTipo} className="btn-ghost text-xs py-1"><Plus size={12}/> Tipo</button>
          </div>
          <div className="space-y-2">
            {tax.tipos.length === 0 && <div className="card p-6 text-center text-white/25 text-sm">Nenhum tipo. Adicione um.</div>}
            {tax.tipos.map(tp => (
              <div key={tp.id} className="card p-3">
                <div className="flex items-center gap-3">
                  {/* Ícone (clique para trocar) */}
                  <div className="relative">
                    <button type="button" onClick={() => setIconePicker(iconePicker === tp.id ? null : tp.id)}
                      className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:border-teal/40 transition-all">
                      <Icone name={tp.icone} size={18} className="text-teal" />
                    </button>
                    {iconePicker === tp.id && (
                      <div className="absolute z-30 top-12 left-0 card p-2 grid grid-cols-8 gap-1 w-72 max-h-56 overflow-y-auto shadow-2xl">
                        {ICON_NAMES.map(n => {
                          const C = ICONES[n]
                          return (
                            <button key={n} type="button" title={n}
                              onClick={() => { setTipo(tp.id, 'icone', n); setIconePicker(null) }}
                              className={cn('w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10', tp.icone === n && 'bg-teal/20 ring-1 ring-teal/50')}>
                              <C size={15} className="text-white/70" />
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <input className="input text-[12px] py-1 flex-1" placeholder="Nome do tipo (ex.: Gerador de sinal RF)"
                    value={tp.nome} onChange={e => setTipo(tp.id, 'nome', e.target.value)} />
                  <button type="button" onClick={() => delTipo(tp.id)} className="text-white/25 hover:text-red-400 p-1"><Trash2 size={13}/></button>
                </div>
                {/* Áreas a que pertence (multi) */}
                <div className="flex flex-wrap gap-1.5 mt-2 pl-13">
                  <span className="text-[10px] text-white/30 self-center mr-1">Áreas:</span>
                  {tax.areas.length === 0 && <span className="text-[10px] text-white/25">cadastre áreas acima</span>}
                  {tax.areas.map(a => {
                    const on = tp.areaIds.includes(a.id)
                    return (
                      <button key={a.id} type="button" onClick={() => toggleTipoArea(tp.id, a.id)}
                        className="badge font-mono transition-all" style={{
                          background: on ? `${corDe(a.cor)}28` : 'transparent',
                          color: on ? corDe(a.cor) : 'rgba(255,255,255,0.35)',
                          border: `1px solid ${on ? corDe(a.cor) + '66' : 'rgba(255,255,255,0.12)'}`, fontSize: 10,
                        }}>
                        {a.nome || '(sem nome)'}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
