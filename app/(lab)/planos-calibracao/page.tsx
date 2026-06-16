'use client'

import { useEffect, useState } from 'react'
import { Target, Plus, Trash2, Save, Loader2, Pencil, ScanText } from 'lucide-react'
import { cn, fileToBase64 } from '@/lib/utils'
import { extrairTextoArquivo } from '@/lib/useOCR'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import { type PlanoCalibracao, type PontoPlano } from '@/lib/planos/tipos'
import { parsearPlanoOCR, parsearPlanoLayout } from '@/lib/planos/parser'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
function pontoVazio(): PontoPlano {
  return { id: uid(), grandeza: '', unidade: '', pontosTexto: '', tolPercentual: '', tolFixo: '', tolPpm: '', criterioTexto: '', obs: '' }
}

export default function PlanosCalibracaoPage() {
  const [equips,  setEquips]  = useState<EquipamentoEMC[]>([])
  const [planos,  setPlanos]  = useState<PlanoCalibracao[]>([])
  const [editing, setEditing] = useState<PlanoCalibracao | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ocrLoading, setOcrLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [e, p] = await Promise.all([
        fetch('/api/equipamentos').then(r => r.json()),
        fetch('/api/planos').then(r => r.json()),
      ])
      setEquips(Array.isArray(e) ? e : [])
      setPlanos(Array.isArray(p) ? p : [])
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function novo() {
    setEditing({ id: '', equipamentoId: '', equipamentoTag: '', nome: '', pontos: [pontoVazio()], criadoEm: '' })
  }

  async function salvar() {
    if (!editing) return
    if (!editing.equipamentoId) { alert('Selecione o equipamento.'); return }
    setSalvando(true)
    try {
      const body = { ...editing }
      const res = await fetch(editing.id ? `/api/planos/${editing.id}` : '/api/planos', {
        method: editing.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setEditing(null)
      await load()
    } catch (e: unknown) { alert('Erro ao salvar: ' + String(e)) }
    finally { setSalvando(false) }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este plano de calibração?')) return
    await fetch(`/api/planos/${id}`, { method: 'DELETE' })
    setPlanos(p => p.filter(x => x.id !== id))
  }

  // Importa pontos/critérios de um documento de plano (FOR 6400) via OCR — best-effort.
  async function importarOCR(file: File) {
    setOcrLoading(true)
    try {
      const api = (window as unknown as { electronAPI?: { extractPdfLayout?: (b: string) => Promise<{ ok: boolean; items: { s: string; x: number; y: number; page?: number }[] }> } }).electronAPI
      const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
      // 1) Layout por coordenadas (PDF gerado de Excel — FOR 6400): reconstrói a grade fielmente
      if (api?.extractPdfLayout && isPdf) {
        try {
          const b64 = await fileToBase64(file)
          const res = await api.extractPdfLayout(b64)
          if (res?.ok && Array.isArray(res.items) && res.items.length) {
            const { pontos, obs } = parsearPlanoLayout(res.items)
            if (pontos.length) { setEditing(p => p ? { ...p, pontos, obs: obs || p.obs } : p); return }
          }
        } catch {}
      }
      // 2) Fallback: texto linear + heurística por proximidade
      const texto = await extrairTextoArquivo(file)
      const linhas = parsearPlanoOCR(texto)
      if (!linhas.length) { alert('Não identifiquei grandezas/critérios no documento. Revise ou preencha manualmente.'); return }
      setEditing(p => p ? { ...p, pontos: linhas } : p)
    } catch (e: unknown) { alert('Erro no OCR: ' + String(e)) }
    finally { setOcrLoading(false) }
  }

  /* ── Editor ── */
  if (editing) {
    const equip = equips.find(e => e.id === editing.equipamentoId)
    const grandezasEquip = (equip?.grandezas ?? []).map(g => g.nome)
    const set = (patch: Partial<PlanoCalibracao>) => setEditing(p => p ? { ...p, ...patch } : p)
    const setPonto = (id: string, patch: Partial<PontoPlano>) =>
      setEditing(p => p ? { ...p, pontos: p.pontos.map(pt => pt.id === id ? { ...pt, ...patch } : pt) } : p)
    const addPonto = () => setEditing(p => p ? { ...p, pontos: [...p.pontos, pontoVazio()] } : p)
    const delPonto = (id: string) => setEditing(p => p ? { ...p, pontos: p.pontos.filter(pt => pt.id !== id) } : p)
    const inp = 'input text-[11px] py-1 px-2 h-7'

    return (
      <div>
        <div className="page-header">
          <div>
            <p className="page-eyebrow">Planos de Calibração</p>
            <h1 className="page-title">{editing.id ? 'Editar plano' : 'Novo plano de calibração'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <label className={cn('btn-secondary cursor-pointer', ocrLoading && 'opacity-60 pointer-events-none')}>
              {ocrLoading ? <Loader2 size={14} className="animate-spin"/> : <ScanText size={14}/>} Importar (OCR)
              <input type="file" accept=".pdf,image/*,.txt" className="hidden"
                onChange={e=>{ const f=e.target.files?.[0]; if(f) importarOCR(f); e.currentTarget.value='' }}/>
            </label>
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={salvar} disabled={salvando} className="btn-primary">
              {salvando ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar
            </button>
          </div>
        </div>

        {/* Cabeçalho */}
        <div className="card p-5 mb-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Equipamento *</label>
              <select className="input" value={editing.equipamentoId}
                onChange={e => { const eq = equips.find(x => x.id === e.target.value); set({ equipamentoId: e.target.value, equipamentoTag: eq?.tag ?? '' }) }}>
                <option value="">Selecione…</option>
                {equips.map(e => <option key={e.id} value={e.id}>{e.tag} — {e.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Nome do plano (opcional)</label>
              <input className="input" value={editing.nome ?? ''} onChange={e => set({ nome: e.target.value })} placeholder="ex: Plano padrão"/>
            </div>
          </div>
        </div>

        {/* Pontos */}
        <div className="card overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <p className="form-section">Pontos e tolerâncias</p>
            <button type="button" onClick={addPonto} className="btn-ghost text-xs"><Plus size={12}/> Ponto</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: 1040 }}>
              <thead className="tbl-head">
                <tr>
                  <th className="w-10 text-center">#</th>
                  <th className="w-44">Grandeza</th>
                  <th>Pontos de calibração</th>
                  <th className="w-28">Critério</th>
                  <th className="w-16" title="Unidade do critério">Unid.</th>
                  <th className="w-14" title="Percentual da leitura">%</th>
                  <th className="w-20" title="Valor fixo">± fixo</th>
                  <th className="w-14" title="Partes por milhão">ppm</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {editing.pontos.map((pt, i) => (
                  <tr key={pt.id} className="tbl-row group/row">
                    <td className="text-center font-mono text-[11px] text-white/40">{i + 1}</td>
                    <td>
                      <input className={inp} list={`gr-${pt.id}`} value={pt.grandeza}
                        onChange={e => setPonto(pt.id, { grandeza: e.target.value })} placeholder="ex: Exatidão da Frequência"/>
                      <datalist id={`gr-${pt.id}`}>{grandezasEquip.map(g => <option key={g} value={g}/>)}</datalist>
                    </td>
                    <td><input className={cn(inp,'font-mono')} value={pt.pontosTexto} onChange={e => setPonto(pt.id, { pontosTexto: e.target.value })} placeholder="(0,1; 0,5; …) MHz"/></td>
                    <td><input className={cn(inp,'font-mono')} value={pt.criterioTexto ?? ''} onChange={e => setPonto(pt.id, { criterioTexto: e.target.value })} placeholder="± 1 dB"/></td>
                    <td><input className={cn(inp,'font-mono')} value={pt.unidade} onChange={e => setPonto(pt.id, { unidade: e.target.value })} placeholder="dB"/></td>
                    <td><input className={cn(inp,'font-mono')} value={pt.tolPercentual ?? ''} onChange={e => setPonto(pt.id, { tolPercentual: e.target.value })} placeholder="0,5"/></td>
                    <td><input className={cn(inp,'font-mono')} value={pt.tolFixo ?? ''} onChange={e => setPonto(pt.id, { tolFixo: e.target.value })} placeholder="1"/></td>
                    <td><input className={cn(inp,'font-mono')} value={pt.tolPpm ?? ''} onChange={e => setPonto(pt.id, { tolPpm: e.target.value })} placeholder="10"/></td>
                    <td>
                      <button type="button" onClick={() => delPonto(pt.id)}
                        className="opacity-0 group-hover/row:opacity-100 text-white/25 hover:text-red-400 p-0.5 transition-all">
                        <Trash2 size={12}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-white/5 flex items-center gap-3">
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 flex-shrink-0">Obs. gerais</label>
            <input className="input flex-1 text-sm" value={editing.obs ?? ''} onChange={e => set({ obs: e.target.value })} placeholder="Observações…"/>
          </div>
        </div>

        <p className="text-[11px] text-white/30 px-1">
          Critério pode ser texto livre (ex.: “± 1 dB”) e/ou estruturado (% · ± fixo · ppm) p/ o app calcular limites depois.
          O “Importar (OCR)” lê o FOR 6400 — como a tabela do PDF sai fora de ordem, <b>revise as associações</b>.
        </p>
      </div>
    )
  }

  /* ── Lista ── */
  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Qualidade</p>
          <h1 className="page-title flex items-center gap-2"><Target size={20} className="text-gold"/> Planos de Calibração</h1>
          <p className="page-sub">Pontos, especificações e limites que cada certificado de calibração deve conter.</p>
        </div>
        <button type="button" onClick={novo} className="btn-primary"><Plus size={14}/> Novo plano</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 size={22} className="animate-spin text-white/20"/></div>
      ) : planos.length === 0 ? (
        <div className="card p-8 text-center text-white/40 text-sm">
          Nenhum plano de calibração ainda. Clique em “Novo plano”.
        </div>
      ) : (
        <div className="space-y-3">
          {planos.map(p => {
            const equip = equips.find(e => e.id === p.equipamentoId)
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-gold">{p.equipamentoTag || equip?.tag || '—'}</span>
                      <span className="text-[13px] text-white/80 font-semibold">{equip?.nome ?? p.nome ?? 'Plano'}</span>
                      {p.nome && equip?.nome && <span className="text-[11px] text-white/35">· {p.nome}</span>}
                    </div>
                    <p className="text-[11px] text-white/40 mt-0.5">{p.pontos.length} ponto(s) · {[...new Set(p.pontos.map(pt => pt.grandeza).filter(Boolean))].length} grandeza(s)</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditing(p)} className="btn-ghost px-2 py-1.5 text-[11px] flex items-center gap-1"><Pencil size={12}/> Editar</button>
                    <button type="button" onClick={() => excluir(p.id)} className="btn-ghost p-1.5 hover:text-red-400 text-white/25"><Trash2 size={13}/></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set(p.pontos.map(pt => pt.grandeza).filter(Boolean))].map(g => (
                    <span key={g} className="text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 text-white/50">{g}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
