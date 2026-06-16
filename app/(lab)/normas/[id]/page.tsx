'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Pencil, Plus, Trash2, Save, X, Check } from 'lucide-react'
import type { Norma, TabelaLimites, SecaoNorma, LinhaTabela, EquipamentoNecessario } from '@/lib/normas/tipos'
import type { GrupoId } from '@/lib/equipamentos/tipos'

function TipoBadge({ tipo }: { tipo: string }) {
  if (tipo === 'emissao')   return <span className="badge-gold">Emissão</span>
  if (tipo === 'imunidade') return <span className="badge-accent">Imunidade</span>
  return <span className="badge">Geral</span>
}

const GRUPOS_OPCOES: { id: GrupoId; label: string }[] = [
  { id: 'geradores',          label: 'Geradores' },
  { id: 'medidores',          label: 'Medidores' },
  { id: 'redes-impedancia',   label: 'Redes de Impedância' },
  { id: 'antenas',            label: 'Antenas' },
  { id: 'atenuacao',          label: 'Atenuação' },
  { id: 'grandezas-ambientais', label: 'Grandezas Ambientais' },
]

function uid() { return Math.random().toString(36).slice(2) }

/* ── Linha editável inline ── */
function LinhaEditor({ linha, onChange, onDelete }: {
  linha: LinhaTabela; onChange: (l: LinhaTabela) => void; onDelete: () => void
}) {
  return (
    <tr className="tbl-row group/lin">
      <td><input className="input text-xs py-1" value={linha.nivel ?? ''} onChange={e => onChange({ ...linha, nivel: e.target.value })} placeholder="Classe A…"/></td>
      <td><input className="input text-xs py-1 font-mono" value={linha.frequencia ?? ''} onChange={e => onChange({ ...linha, frequencia: e.target.value })} placeholder="9–150 kHz"/></td>
      <td><input className="input text-xs py-1 font-mono" value={linha.valor} onChange={e => onChange({ ...linha, valor: e.target.value })} placeholder="56 dBµV"/></td>
      <td><input className="input text-xs py-1" value={linha.condicoes ?? ''} onChange={e => onChange({ ...linha, condicoes: e.target.value })} placeholder="Limite quase-pico"/></td>
      <td>
        <button type="button" onClick={onDelete} className="btn-ghost p-1 hover:text-red-400 opacity-0 group-hover/lin:opacity-100">
          <Trash2 size={11}/>
        </button>
      </td>
    </tr>
  )
}

/* ── Página ── */
export default function NormaDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [norma,    setNorma]    = useState<Norma | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [draft,    setDraft]    = useState<Norma | null>(null)
  const [pdfUrl,   setPdfUrl]   = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    fetch(`/api/normas/${id}`).then(r => r.json()).then(n => {
      if (!n.error) { setNorma(n); setDraft(JSON.parse(JSON.stringify(n))) }
    })
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() { setDraft(JSON.parse(JSON.stringify(norma))); setEditMode(true) }
  function cancelEdit() { setDraft(JSON.parse(JSON.stringify(norma))); setEditMode(false) }

  async function salvar() {
    if (!draft) return
    setSaving(true)
    const res = await fetch(`/api/normas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const saved = await res.json()
    if (!saved.error) { setNorma(saved); setEditMode(false) }
    setSaving(false)
  }

  function setD<K extends keyof Norma>(key: K, val: Norma[K]) {
    setDraft(prev => prev ? { ...prev, [key]: val } : prev)
  }

  /* ── Tabelas ── */
  function addTabela() {
    const t: TabelaLimites = { id: uid(), titulo: 'Nova tabela', linhas: [{ valor: '' }] }
    setDraft(prev => prev ? { ...prev, tabelasLimites: [...(prev.tabelasLimites ?? []), t] } : prev)
  }
  function updateTabela(ti: number, t: TabelaLimites) {
    setDraft(prev => { if (!prev) return prev; const ts = [...(prev.tabelasLimites ?? [])]; ts[ti] = t; return { ...prev, tabelasLimites: ts } })
  }
  function removeTabela(ti: number) {
    setDraft(prev => { if (!prev) return prev; const ts = [...(prev.tabelasLimites ?? [])]; ts.splice(ti,1); return { ...prev, tabelasLimites: ts } })
  }
  function addLinha(ti: number) {
    setDraft(prev => {
      if (!prev) return prev
      const ts = [...(prev.tabelasLimites ?? [])]
      ts[ti] = { ...ts[ti], linhas: [...ts[ti].linhas, { valor: '' }] }
      return { ...prev, tabelasLimites: ts }
    })
  }
  function updateLinha(ti: number, li: number, l: LinhaTabela) {
    setDraft(prev => {
      if (!prev) return prev
      const ts = [...(prev.tabelasLimites ?? [])]
      const ls = [...ts[ti].linhas]; ls[li] = l; ts[ti] = { ...ts[ti], linhas: ls }
      return { ...prev, tabelasLimites: ts }
    })
  }
  function removeLinha(ti: number, li: number) {
    setDraft(prev => {
      if (!prev) return prev
      const ts = [...(prev.tabelasLimites ?? [])]
      const ls = ts[ti].linhas.filter((_, i) => i !== li); ts[ti] = { ...ts[ti], linhas: ls }
      return { ...prev, tabelasLimites: ts }
    })
  }

  /* ── Seções ── */
  function addSecao() {
    const s: SecaoNorma = { numero: '', titulo: '', resumo: '' }
    setDraft(prev => prev ? { ...prev, secoes: [...(prev.secoes ?? []), s] } : prev)
  }
  function updateSecao(si: number, s: SecaoNorma) {
    setDraft(prev => { if (!prev) return prev; const ss = [...(prev.secoes ?? [])]; ss[si] = s; return { ...prev, secoes: ss } })
  }
  function removeSecao(si: number) {
    setDraft(prev => { if (!prev) return prev; const ss = [...(prev.secoes ?? [])]; ss.splice(si,1); return { ...prev, secoes: ss } })
  }

  /* ── Equipamentos necessários ── */
  function addEquip() {
    const eq: EquipamentoNecessario = { grupoId: 'medidores', descricao: '' }
    setDraft(prev => prev ? { ...prev, equipamentosNecessarios: [...prev.equipamentosNecessarios, eq] } : prev)
  }
  function updateEquip(ei: number, eq: EquipamentoNecessario) {
    setDraft(prev => { if (!prev) return prev; const es = [...prev.equipamentosNecessarios]; es[ei] = eq; return { ...prev, equipamentosNecessarios: es } })
  }
  function removeEquip(ei: number) {
    setDraft(prev => { if (!prev) return prev; const es = [...prev.equipamentosNecessarios]; es.splice(ei,1); return { ...prev, equipamentosNecessarios: es } })
  }

  if (!norma) return <div className="flex items-center justify-center py-20 text-white/25 text-sm">Carregando...</div>

  const d = editMode && draft ? draft : norma

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost p-2"><ArrowLeft size={15}/></button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              {editMode ? (
                <input className="input font-display font-bold text-[17px] py-0.5 w-48"
                  style={{ color: 'var(--accent,#E8B94B)' }}
                  value={draft?.codigo ?? ''}
                  onChange={e => setD('codigo', e.target.value)}/>
              ) : (
                <span className="font-display font-bold text-[17px]" style={{ color: 'var(--accent,#E8B94B)' }}>{norma.codigo}</span>
              )}
              <TipoBadge tipo={d.tipo}/>
            </div>
            {editMode ? (
              <input className="input text-[18px] font-bold py-0.5 w-full max-w-xl" value={draft?.titulo ?? ''} onChange={e => setD('titulo', e.target.value)}/>
            ) : (
              <h1 className="page-title">{norma.titulo}</h1>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button onClick={cancelEdit} className="btn-ghost"><X size={13}/> Cancelar</button>
              <button onClick={salvar} disabled={saving} className="btn-primary"><Save size={13}/> {saving ? 'Salvando…' : 'Salvar'}</button>
            </>
          ) : (
            <button onClick={startEdit} className="btn-secondary"><Pencil size={13}/> Editar</button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="card p-5 mb-5 flex flex-wrap items-center gap-6">
        <div>
          <p className="text-[9px] font-mono tracking-[2px] uppercase text-white/30 mb-0.5">Tipo</p>
          {editMode ? (
            <select className="input text-sm py-1" value={draft?.tipo} onChange={e => setD('tipo', e.target.value as Norma['tipo'])}>
              <option value="emissao">Emissão</option>
              <option value="imunidade">Imunidade</option>
              <option value="geral">Geral</option>
            </select>
          ) : (
            <TipoBadge tipo={norma.tipo}/>
          )}
        </div>
        <div>
          <p className="text-[9px] font-mono tracking-[2px] uppercase text-white/30 mb-0.5">PDF disponível</p>
          {editMode ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={draft?.pdfDisponivel ?? false}
                onChange={e => setD('pdfDisponivel', e.target.checked)}
                className="w-4 h-4 accent-gold"/>
              <span className="text-sm text-white/70">Disponível</span>
            </label>
          ) : (
            <p className="text-sm text-white/70">{norma.pdfDisponivel ? 'Sim' : 'Não disponível'}</p>
          )}
        </div>
        {norma.pdfDisponivel && norma.pdfPath && !editMode && (
          <button className="btn-secondary ml-auto" onClick={() => (window as Window & typeof globalThis & { electronAPI?: { openExternal?: (u: string) => void } }).electronAPI?.openExternal?.(norma.pdfPath!) ?? window.open(norma.pdfPath!, '_blank')}>
            <FileText size={13}/> Abrir PDF
          </button>
        )}

        {/* PDF local */}
        <div className="w-full border-t border-white/5 pt-4">
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (!f) return
              if (pdfUrl) URL.revokeObjectURL(pdfUrl)
              setPdfUrl(URL.createObjectURL(f))
            }}/>
          <div className="flex items-center gap-3">
            <button className="btn-secondary text-sm" onClick={() => fileRef.current?.click()}>
              <FileText size={13}/> Carregar PDF localmente
            </button>
            {pdfUrl && (
              <button className="btn-ghost text-sm" onClick={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(null); if (fileRef.current) fileRef.current.value = '' }}>
                <X size={12}/> Remover
              </button>
            )}
          </div>
          {pdfUrl && (
            <iframe src={pdfUrl} className="w-full rounded-xl border border-white/10 mt-4" style={{ height: 600 }}/>
          )}
        </div>
      </div>

      {/* Equipamentos necessários */}
      <div className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="form-section">Equipamentos necessários</p>
          {editMode && (
            <button className="btn-ghost text-xs" onClick={addEquip}><Plus size={11}/> Adicionar</button>
          )}
        </div>
        {d.equipamentosNecessarios.length === 0 ? (
          <p className="text-[11px] text-white/25 italic">Nenhum equipamento vinculado.</p>
        ) : (
          <div className="space-y-2">
            {d.equipamentosNecessarios.map((eq, ei) => (
              <div key={ei} className="flex items-center gap-3">
                {editMode ? (
                  <>
                    <select className="input text-sm py-1 w-48" value={eq.grupoId}
                      onChange={e => updateEquip(ei, { ...eq, grupoId: e.target.value as GrupoId })}>
                      {GRUPOS_OPCOES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                    </select>
                    <input className="input text-sm py-1 flex-1" value={eq.descricao}
                      onChange={e => updateEquip(ei, { ...eq, descricao: e.target.value })}
                      placeholder="Descrição do equipamento necessário"/>
                    <button className="btn-ghost p-1.5 hover:text-red-400" onClick={() => removeEquip(ei)}>
                      <Trash2 size={12}/>
                    </button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded border text-white/60 border-white/10 bg-white/4">
                    <Check size={10} className="text-green-400"/>
                    <span className="text-white/40">{eq.grupoId}</span>
                    <span className="text-white/20">·</span>
                    {eq.descricao}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabelas de limites */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-[13px] text-white/60 uppercase tracking-widest">
            Tabelas de limites
          </h2>
          {editMode && (
            <button className="btn-ghost text-xs" onClick={addTabela}><Plus size={11}/> Nova tabela</button>
          )}
        </div>
        {(d.tabelasLimites ?? []).length === 0 && (
          <div className="card p-6 text-center text-white/25 text-sm">
            {editMode ? 'Clique em "+ Nova tabela" para adicionar.' : 'Nenhuma tabela de limites cadastrada.'}
          </div>
        )}
        {(d.tabelasLimites ?? []).map((t, ti) => (
          <div key={t.id} className="card overflow-hidden mb-3">
            <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
              {editMode ? (
                <>
                  <input className="input text-sm py-0.5 flex-1" value={t.titulo}
                    onChange={e => updateTabela(ti, { ...t, titulo: e.target.value })}/>
                  <button className="btn-ghost p-1 hover:text-red-400" onClick={() => removeTabela(ti)}>
                    <Trash2 size={12}/>
                  </button>
                </>
              ) : (
                <p className="font-semibold text-[13px] text-white">{t.titulo}</p>
              )}
            </div>
            <table className="w-full">
              <thead className="tbl-head">
                <tr>
                  <th>Nível / Classe</th>
                  <th>Faixa de freq.</th>
                  <th>Valor limite</th>
                  <th>Condições / Detector</th>
                  {editMode && <th></th>}
                </tr>
              </thead>
              <tbody>
                {t.linhas.map((l, li) =>
                  editMode ? (
                    <LinhaEditor key={li} linha={l}
                      onChange={nl => updateLinha(ti, li, nl)}
                      onDelete={() => removeLinha(ti, li)}/>
                  ) : (
                    <tr key={li} className="tbl-row">
                      <td>{l.nivel ?? '—'}</td>
                      <td className="font-mono text-[11px]">{l.frequencia ?? '—'}</td>
                      <td className="font-mono text-[11px]">{l.valor}</td>
                      <td className="text-white/50 text-[11px]">{l.condicoes ?? '—'}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
            {editMode && (
              <div className="px-4 py-2 border-t border-white/5">
                <button className="btn-ghost text-xs" onClick={() => addLinha(ti)}>
                  <Plus size={11}/> Adicionar linha
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Seções relevantes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-[13px] text-white/60 uppercase tracking-widest">
            Seções relevantes
          </h2>
          {editMode && (
            <button className="btn-ghost text-xs" onClick={addSecao}><Plus size={11}/> Nova seção</button>
          )}
        </div>
        {(d.secoes ?? []).length === 0 && (
          <div className="card p-6 text-center text-white/25 text-sm">
            {editMode ? 'Clique em "+ Nova seção" para adicionar.' : 'Nenhuma seção cadastrada.'}
          </div>
        )}
        <div className="space-y-2">
          {(d.secoes ?? []).map((s, si) => (
            <div key={si} className="card p-4 flex gap-4">
              {editMode ? (
                <>
                  <div className="flex flex-col gap-2 flex-1">
                    <div className="flex gap-2">
                      <input className="input text-sm py-1 w-24" placeholder="§ número" value={s.numero}
                        onChange={e => updateSecao(si, { ...s, numero: e.target.value })}/>
                      <input className="input text-sm py-1 flex-1" placeholder="Título da seção" value={s.titulo}
                        onChange={e => updateSecao(si, { ...s, titulo: e.target.value })}/>
                    </div>
                    <input className="input text-sm py-1 w-full" placeholder="Resumo / descrição" value={s.resumo}
                      onChange={e => updateSecao(si, { ...s, resumo: e.target.value })}/>
                  </div>
                  <button className="btn-ghost p-1.5 hover:text-red-400 self-start" onClick={() => removeSecao(si)}>
                    <Trash2 size={12}/>
                  </button>
                </>
              ) : (
                <>
                  <span className="font-mono font-bold text-[13px] flex-shrink-0" style={{ color: 'var(--accent,#E8B94B)' }}>
                    {s.numero}
                  </span>
                  <div>
                    <p className="font-semibold text-[13px] text-white mb-0.5">{s.titulo}</p>
                    <p className="text-[12px] text-white/50">{s.resumo}</p>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
