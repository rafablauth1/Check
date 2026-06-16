'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, Save, GripVertical, Zap, Gauge, Waves, Radio, SlidersHorizontal, Thermometer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GRUPO_CORES } from '@/lib/grupos-icons'

const ICONES: Record<string, React.ElementType> = {
  'geradores':            Zap,
  'medidores':            Gauge,
  'redes-impedancia':     Waves,
  'antenas':              Radio,
  'atenuacao':            SlidersHorizontal,
  'grandezas-ambientais': Thermometer,
}

interface Subgrupo { id: string; nome: string; numero: string }
interface Grupo    { id: string; nome: string; descricao: string; cor: string; subgrupos: Subgrupo[] }

const CORES = [
  { id: 'blue',   hex: '#4F8EF7', label: 'Azul' },
  { id: 'gold',   hex: '#E8B94B', label: 'Dourado' },
  { id: 'purple', hex: '#A855F7', label: 'Roxo' },
  { id: 'green',  hex: '#22C55E', label: 'Verde' },
  { id: 'coral',  hex: '#F87171', label: 'Coral' },
  { id: 'gray',   hex: '#94A3B8', label: 'Cinza' },
  { id: 'teal',   hex: '#22D3C8', label: 'Teal' },
]

function cor(id: string) { return GRUPO_CORES[id] ?? CORES.find(c => c.id === id)?.hex ?? '#94A3B8' }

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
}

/* ── Modal genérico ── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
      <div className="card p-6 w-[480px] max-w-[95vw] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-display font-bold text-[15px] text-white">{title}</p>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5"><X size={14}/></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── Modal de grupo ── */
function GrupoModal({ inicial, onSalvar, onFechar }: {
  inicial?: Grupo; onSalvar: (g: Partial<Grupo>) => void; onFechar: () => void
}) {
  const [nome,     setNome]     = useState(inicial?.nome ?? '')
  const [descricao,setDescricao]= useState(inicial?.descricao ?? '')
  const [corId,    setCorId]    = useState(inicial?.cor ?? 'gray')
  const [err, setErr] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setErr('Nome obrigatório.'); return }
    onSalvar({ nome, descricao, cor: corId })
  }

  return (
    <Modal title={inicial ? 'Editar grupo' : 'Novo grupo'} onClose={onFechar}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Nome *</label>
          <input className="input" value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Geradores" />
        </div>
        <div>
          <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Descrição</label>
          <input className="input" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição do grupo" />
        </div>
        <div>
          <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-2">Cor</label>
          <div className="flex flex-wrap gap-2">
            {CORES.map(c => (
              <button key={c.id} type="button" onClick={() => setCorId(c.id)}
                className={cn('w-8 h-8 rounded-lg border-2 transition-all', corId === c.id ? 'scale-110' : 'border-transparent opacity-60 hover:opacity-100')}
                style={{ background: c.hex, borderColor: corId === c.id ? '#fff' : 'transparent' }}
                title={c.label} />
            ))}
          </div>
        </div>
        {err && <p className="text-[12px] text-red-400">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onFechar} className="btn-secondary">Cancelar</button>
          <button type="submit" className="btn-primary"><Save size={12}/> Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Modal de subgrupo ── */
function SubgrupoModal({ inicial, onSalvar, onFechar }: {
  inicial?: Subgrupo; onSalvar: (s: Subgrupo) => void; onFechar: () => void
}) {
  const [nome,   setNome]   = useState(inicial?.nome ?? '')
  const [numero, setNumero] = useState(inicial?.numero ?? '')
  const [err, setErr] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setErr('Nome obrigatório.'); return }
    onSalvar({ id: inicial?.id ?? slugify(nome), nome, numero })
  }

  return (
    <Modal title={inicial ? 'Editar subgrupo' : 'Novo subgrupo'} onClose={onFechar}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Nome *</label>
          <input className="input" value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Analisador de Espectro" />
        </div>
        <div>
          <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Número (ex: 2.1)</label>
          <input className="input" value={numero} onChange={e => setNumero(e.target.value)} placeholder="2.1" />
        </div>
        {err && <p className="text-[12px] text-red-400">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onFechar} className="btn-secondary">Cancelar</button>
          <button type="submit" className="btn-primary"><Save size={12}/> Salvar</button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Página principal ── */
export default function GruposEditorPage() {
  const [grupos,    setGrupos]    = useState<Grupo[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState<'grupo-novo' | 'grupo-edit' | 'sub-novo' | 'sub-edit' | null>(null)
  const [grupoAlvo, setGrupoAlvo] = useState<Grupo | null>(null)
  const [subAlvo,   setSubAlvo]   = useState<Subgrupo | null>(null)

  async function carregar() {
    setLoading(true)
    const data = await fetch('/api/grupos').then(r => r.json()).catch(() => [])
    setGrupos(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  /* ── CRUD grupos ── */
  async function salvarGrupo(dados: Partial<Grupo>) {
    if (modal === 'grupo-novo') {
      await fetch('/api/grupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
    } else if (grupoAlvo) {
      await fetch(`/api/grupos/${grupoAlvo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
    }
    setModal(null); setGrupoAlvo(null); carregar()
  }

  async function excluirGrupo(g: Grupo) {
    if (!confirm(`Excluir grupo "${g.nome}"? Os equipamentos vinculados ficarão sem grupo.`)) return
    await fetch(`/api/grupos/${g.id}`, { method: 'DELETE' })
    carregar()
  }

  /* ── CRUD subgrupos ── */
  async function salvarSubgrupo(sub: Subgrupo) {
    if (!grupoAlvo) return
    let subs = grupoAlvo.subgrupos
    if (subAlvo) {
      subs = subs.map(s => s.id === subAlvo.id ? sub : s)
    } else {
      if (subs.find(s => s.id === sub.id)) sub.id = sub.id + '-' + Date.now()
      subs = [...subs, sub]
    }
    await fetch(`/api/grupos/${grupoAlvo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subgrupos: subs }),
    })
    setModal(null); setSubAlvo(null)
    setGrupoAlvo(prev => prev ? { ...prev, subgrupos: subs } : null)
    carregar()
  }

  async function excluirSubgrupo(g: Grupo, s: Subgrupo) {
    if (!confirm(`Excluir subgrupo "${s.nome}"?`)) return
    const subs = g.subgrupos.filter(x => x.id !== s.id)
    await fetch(`/api/grupos/${g.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subgrupos: subs }),
    })
    carregar()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Configuração · Lab</p>
          <h1 className="page-title">Grupos de equipamentos</h1>
          <p className="page-sub">Taxonomia de grupos e subgrupos para classificação</p>
        </div>
        <button className="btn-primary" onClick={() => { setGrupoAlvo(null); setModal('grupo-novo') }}>
          <Plus size={13}/> Novo grupo
        </button>
      </div>

      {loading ? (
        <div className="text-white/25 text-sm py-10 text-center">Carregando...</div>
      ) : grupos.length === 0 ? (
        <div className="card p-10 text-center text-white/25 text-sm">Nenhum grupo cadastrado.</div>
      ) : (
        <div className="space-y-3">
          {grupos.map(g => {
            const c    = cor(g.cor)
            const Icon = ICONES[g.id] ?? Gauge
            return (
              <div key={g.id} className="card p-5">
                {/* Cabeçalho do grupo */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: `${c}18`, border: `1px solid ${c}28` }}>
                    <Icon size={17} style={{ color: c }}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-display font-bold text-[15px] text-white">{g.nome}</h2>
                      <span className="text-[9px] font-mono text-white/30">{g.id}</span>
                    </div>
                    {g.descricao && <p className="text-[11px] text-white/35 mt-0.5">{g.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button className="btn-ghost p-1.5" title="Editar grupo"
                      onClick={() => { setGrupoAlvo(g); setModal('grupo-edit') }}>
                      <Pencil size={13}/>
                    </button>
                    <button className="btn-ghost p-1.5 hover:text-red-400" title="Excluir grupo"
                      onClick={() => excluirGrupo(g)}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </div>

                {/* Subgrupos */}
                <div className="border-t border-white/5 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-mono tracking-[2px] uppercase text-white/30">Subgrupos</p>
                    <button className="btn-ghost text-[11px] py-1 px-2"
                      onClick={() => { setGrupoAlvo(g); setSubAlvo(null); setModal('sub-novo') }}>
                      <Plus size={11}/> Adicionar
                    </button>
                  </div>
                  {g.subgrupos.length === 0 ? (
                    <p className="text-[11px] text-white/20 italic">Nenhum subgrupo</p>
                  ) : (
                    <div className="space-y-1.5">
                      {g.subgrupos.map(s => (
                        <div key={s.id} className="flex items-center gap-2 group/sub rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                          <GripVertical size={12} className="text-white/15 flex-shrink-0"/>
                          <span className="font-mono text-[10px] text-white/40 w-8 flex-shrink-0">{s.numero}</span>
                          <span className="text-[12px] text-white/70 flex-1">{s.nome}</span>
                          <span className="text-[9px] font-mono text-white/25">{s.id}</span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                            <button className="btn-ghost p-1" onClick={() => { setGrupoAlvo(g); setSubAlvo(s); setModal('sub-edit') }}>
                              <Pencil size={11}/>
                            </button>
                            <button className="btn-ghost p-1 hover:text-red-400" onClick={() => excluirSubgrupo(g, s)}>
                              <Trash2 size={11}/>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modais */}
      {(modal === 'grupo-novo' || modal === 'grupo-edit') && (
        <GrupoModal
          inicial={modal === 'grupo-edit' ? grupoAlvo ?? undefined : undefined}
          onSalvar={salvarGrupo}
          onFechar={() => { setModal(null); setGrupoAlvo(null) }}
        />
      )}
      {(modal === 'sub-novo' || modal === 'sub-edit') && (
        <SubgrupoModal
          inicial={subAlvo ?? undefined}
          onSalvar={salvarSubgrupo}
          onFechar={() => { setModal(null); setSubAlvo(null) }}
        />
      )}
    </div>
  )
}
