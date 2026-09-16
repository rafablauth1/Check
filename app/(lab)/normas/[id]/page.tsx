'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Pencil, Plus, Trash2, Save, X, Check } from 'lucide-react'
import type { Norma, TabelaLimites, SecaoNorma, LinhaTabela, EquipamentoNecessario, Ensaio } from '@/lib/normas/tipos'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import type { AparelhoAuxiliar } from '@/lib/auxiliares/tipos'
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
  // Cadastro de equipamentos: alimenta o seletor de padrões dos ensaios e a
  // lista impressa. Guardado por id, que é como o vínculo é gravado.
  const [equips,   setEquips]   = useState<EquipamentoEMC[]>([])
  // Aparelhos auxiliares vivem em cadastro próprio (ver lib/auxiliares/tipos.ts).
  const [auxiliares, setAuxiliares] = useState<AparelhoAuxiliar[]>([])
  const [buscaEq,  setBuscaEq]  = useState<Record<string, string>>({})  // ensaioId → texto digitado

  useEffect(() => {
    fetch(`/api/normas/${id}`).then(r => r.json()).then(n => {
      if (!n.error) { setNorma(n); setDraft(JSON.parse(JSON.stringify(n))) }
    })
    fetch('/api/equipamentos').then(r => r.json())
      .then(e => setEquips(Array.isArray(e) ? e : [])).catch(() => {})
    fetch('/api/auxiliares').then(r => r.json())
      .then(a => setAuxiliares(Array.isArray(a) ? a : [])).catch(() => {})
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Ensaios ──────────────────────────────────────────────────────────────
     Os padrões entram/saem por ID do equipamento (ver lib/normas/tipos.ts): a
     TAG é editável e o vínculo tem que sobreviver a renomeações. */
  type CampoEquip = 'equipamentoIds' | 'auxiliaresIds'

  function addEnsaio() {
    const e: Ensaio = { id: uid(), nome: 'Novo ensaio', codigo: '', equipamentoIds: [], auxiliaresIds: [] }
    setDraft(prev => prev ? { ...prev, ensaios: [...(prev.ensaios ?? []), e] } : prev)
  }
  /* Adicionar ensaio SEM precisar achar o botão "Editar" antes: entra no modo
     de edição e já cria a linha. O botão só existia dentro da edição, e por
     isso passava despercebido. */
  function novoEnsaio() {
    if (!editMode) startEdit()
    addEnsaio()
  }
  function updateEnsaio(ei: number, e: Ensaio) {
    setDraft(prev => { if (!prev) return prev; const es = [...(prev.ensaios ?? [])]; es[ei] = e; return { ...prev, ensaios: es } })
  }
  function removeEnsaio(ei: number) {
    setDraft(prev => { if (!prev) return prev; const es = [...(prev.ensaios ?? [])]; es.splice(ei, 1); return { ...prev, ensaios: es } })
  }
  /* Vincula/desvincula um equipamento numa das duas listas do ensaio (padrões
     ou auxiliares). Uma função só para as duas: a regra é idêntica, muda o
     campo — e duplicar isso seria a forma mais fácil de as duas divergirem. */
  function toggleEquip(ei: number, equipId: string, campo: CampoEquip) {
    setDraft(prev => {
      if (!prev) return prev
      const es = [...(prev.ensaios ?? [])]
      const alvo = es[ei]; if (!alvo) return prev
      const atuais = alvo[campo] ?? []
      const tem = atuais.includes(equipId)
      es[ei] = { ...alvo, [campo]: tem ? atuais.filter(x => x !== equipId) : [...atuais, equipId] }
      return { ...prev, ensaios: es }
    })
  }
  /* Resolve um id vinculado nos DOIS cadastros: padrões vêm de equipamentos,
     auxiliares podem vir do cadastro de auxiliares OU de equipamentos (há
     equipamento calibrado que às vezes entra como auxiliar). Procurar só em
     equipamentos faria todo auxiliar do cadastro novo aparecer como "removido". */
  const itemPorId = (eid: string): { tag: string; nome: string } | undefined => {
    const eq = equips.find(e => e.id === eid)
    if (eq) return { tag: eq.tag, nome: eq.nome }
    const ax = auxiliares.find(a => a.id === eid)
    return ax ? { tag: ax.tag, nome: ax.nome } : undefined
  }

  /* Onde cada lista procura ao vincular: padrão só pode ser equipamento
     calibrado; auxiliar pode ser acessório ou equipamento. */
  const poolDe = (campo: CampoEquip): { id: string; tag: string; nome: string }[] =>
    campo === 'equipamentoIds'
      ? equips.map(e => ({ id: e.id, tag: e.tag, nome: e.nome }))
      : [
          ...auxiliares.map(a => ({ id: a.id, tag: a.tag, nome: a.nome })),
          ...equips.map(e => ({ id: e.id, tag: e.tag, nome: e.nome })),
        ]

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

  /* Lista de padrões por ensaio, no mesmo formato do quadro que o laboratório
     já usa: uma coluna por ensaio, os padrões embaixo. Reaproveita o gerador de
     PDF do follow-up da agenda (pdf:followup) em vez de abrir outro caminho de
     impressão; fora do Electron cai numa janela com window.print(). */
  function gerarListaDePadroes() {
    // Padrões primeiro, auxiliares depois e marcados: quem lê o quadro precisa
    // distinguir o que dá rastreabilidade do que só compõe a montagem.
    const itensDoEnsaio = (e: { equipamentoIds: string[]; auxiliaresIds?: string[] }) => [
      ...e.equipamentoIds.map(id => ({ id, aux: false })),
      ...(e.auxiliaresIds ?? []).map(id => ({ id, aux: true })),
    ]
    const lista = (norma?.ensaios ?? []).filter(e => e.nome.trim() || itensDoEnsaio(e).length)
    if (!lista.length) { alert('Nenhum ensaio cadastrado nesta norma.'); return }

    const NAVY = '#1B2A4A'
    const agora = new Date()
    const dataLabel = agora.toLocaleDateString('pt-BR')
    const linhas = Math.max(...lista.map(e => itensDoEnsaio(e).length), 1)

    const celula = (ensaioIdx: number, linha: number) => {
      const item = itensDoEnsaio(lista[ensaioIdx])[linha]
      if (!item) return '<td></td>'
      const eq = itemPorId(item.id)
      // Vinculado que não existe mais no cadastro: sinaliza em vez de sumir da
      // lista sem explicação.
      if (!eq) return `<td class="falta">(equipamento removido)</td>`
      return `<td class="${item.aux ? 'aux' : ''}"><span class="tag">${eq.tag}${item.aux ? '<em> aux.</em>' : ''}</span><span class="nm">${(eq.nome || '').slice(0, 42)}</span></td>`
    }

    const corpo = Array.from({ length: linhas }, (_, l) =>
      `<tr class="${l % 2 ? 'alt' : ''}">${lista.map((_, i) => celula(i, l)).join('')}</tr>`).join('')

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Padrões de Ensaio — ${norma?.codigo ?? ''}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#222;padding:18px}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid ${NAVY};padding-bottom:10px;margin-bottom:16px}
h1{font-size:17px;color:${NAVY};margin:0}
.sub{font-size:11px;color:#666;margin-top:3px}
.lab{font-size:11px;font-weight:bold;color:${NAVY};text-align:right}
.dt{font-size:10px;color:#888;text-align:right}
table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}
thead th{background:#BFD3E6;color:${NAVY};border:1px solid #7A9CC0;padding:7px 6px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.02em}
thead th .cod{display:block;font-weight:normal;font-size:9px;color:#33506F;margin-top:2px}
tbody td{border:1px solid #9DB6D0;padding:5px 6px;vertical-align:top;height:20px}
tbody tr.alt{background:#F2F6FA}
.tag{display:block;font-family:monospace;font-weight:bold;font-size:11px;color:${NAVY}}
.nm{display:block;font-size:9px;color:#667;margin-top:1px}
.falta{color:#B91C1C;font-size:10px;font-style:italic}
td.aux{background:#FBF7EC}
td.aux .tag{color:#8A6D1F}
td.aux .tag em{font-style:normal;font-weight:normal;font-size:8px;letter-spacing:.04em;text-transform:uppercase;color:#A8894A}
.footer{margin-top:22px;padding-top:8px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#aaa}
@media print{body{padding:0}@page{size:A4 landscape;margin:10mm 12mm}}
</style></head>
<body>
<div class="hdr">
  <div><h1>Padrões de Ensaio</h1><div class="sub">${norma?.codigo ?? ''}${norma?.titulo ? ' · ' + norma.titulo : ''}</div></div>
  <div><div class="lab">LABELO · PUCRS</div><div class="dt">${dataLabel}</div></div>
</div>
<table>
  <thead><tr>${lista.map(e => `<th>${e.nome}${e.codigo ? `<span class="cod">${e.codigo}</span>` : ''}</th>`).join('')}</tr></thead>
  <tbody>${corpo}</tbody>
</table>
<div class="footer"><span>Gerado em ${agora.toLocaleString('pt-BR')}</span><span>Documento interno · LABELO PUCRS</span></div>
</body></html>`

    const nomeArq = `Padroes de Ensaio ${(norma?.codigo ?? 'norma').replace(/[/\\:"*?<>|]/g, '-')} ${agora.toISOString().split('T')[0]}.pdf`
    const api = (window as unknown as { electronAPI?: { saveFollowupPdf?: (h: string, f: string, l: boolean) => Promise<{ ok: boolean; error?: string }> } }).electronAPI
    if (api?.saveFollowupPdf) {
      api.saveFollowupPdf(html, nomeArq, true)
        .then(res => { if (!res.ok) alert('Erro ao gerar PDF: ' + res.error) })
        .catch((e: unknown) => alert('Erro ao gerar PDF: ' + String(e)))
      return
    }
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html); win.document.close()
    setTimeout(() => { win.print(); win.addEventListener('afterprint', () => win.close(), { once: true }) }, 400)
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
            <>
              <button onClick={gerarListaDePadroes} className="btn-ghost" title="Gera o quadro de padrões por ensaio em PDF">
                <FileText size={13}/> Lista de padrões
              </button>
              <button onClick={startEdit} className="btn-secondary"><Pencil size={13}/> Editar</button>
            </>
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

      {/* Ensaios da norma + padrões de cada um */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-[13px] text-white/60 uppercase tracking-widest">
            Ensaios e padrões
          </h2>
          <button className="btn-ghost text-xs" onClick={novoEnsaio}><Plus size={11}/> Novo ensaio</button>
        </div>

        {(d.ensaios ?? []).length === 0 && (
          <div className="card p-6 text-center text-white/25 text-sm">
            Nenhum ensaio cadastrado. Clique em &quot;+ Novo ensaio&quot; para adicionar.
          </div>
        )}

        <div className="space-y-2">
          {(d.ensaios ?? []).map((en, ei) => {
            /* Uma lista de equipamentos do ensaio (padrões ou auxiliares).
               As duas se comportam igual — mudam o campo, a cor e o rótulo —,
               então são o mesmo bloco parametrizado. */
            const bloco = (campo: CampoEquip, titulo: string, cor: string, vazio: string, dica: string) => {
              const ids = en[campo] ?? []
              const chave = `${en.id}:${campo}`
              const termo = (buscaEq[chave] ?? '').trim().toLowerCase()
              // Não sugere quem já está em QUALQUER uma das duas listas: o mesmo
              // equipamento ser padrão e auxiliar do mesmo ensaio é contradição.
              const jaUsados = new Set([...(en.equipamentoIds ?? []), ...(en.auxiliaresIds ?? [])])
              const sugestoes = termo
                ? poolDe(campo).filter(eq =>
                    !jaUsados.has(eq.id) &&
                    (eq.tag.toLowerCase().includes(termo) || (eq.nome || '').toLowerCase().includes(termo))
                  ).slice(0, 8)
                : []
              return (
                <div className="mt-3">
                  <p className="text-[9px] font-mono tracking-[1.5px] uppercase text-white/30 mb-1.5">
                    {titulo} <span className="text-white/20">({ids.length})</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ids.length === 0 && <span className="text-[10px] text-white/25">{vazio}</span>}
                    {ids.map(eid => {
                      const eq = itemPorId(eid)
                      return (
                        <span key={eid} className="badge font-mono text-[10px] flex items-center gap-1"
                          style={{
                            background: eq ? `${cor}24` : 'rgba(239,68,68,0.14)',
                            color: eq ? cor : '#F87171',
                            border: `1px solid ${eq ? cor + '66' : 'rgba(239,68,68,0.4)'}`,
                          }}
                          title={eq ? eq.nome : 'Equipamento não encontrado no cadastro'}>
                          {eq ? eq.tag : '(removido)'}
                          {editMode && (
                            <button onClick={() => toggleEquip(ei, eid, campo)} className="hover:text-white ml-0.5"><X size={10}/></button>
                          )}
                        </span>
                      )
                    })}
                  </div>
                  {editMode && (
                    <div className="mt-2">
                      <input className="input text-[12px] py-1 w-full" placeholder={dica}
                        value={buscaEq[chave] ?? ''}
                        onChange={e => setBuscaEq(b => ({ ...b, [chave]: e.target.value }))}/>
                      {sugestoes.length > 0 && (
                        <div className="card mt-1 divide-y divide-white/5 max-h-52 overflow-y-auto">
                          {sugestoes.map(eq => (
                            <button key={eq.id} type="button"
                              onClick={() => { toggleEquip(ei, eq.id, campo); setBuscaEq(b => ({ ...b, [chave]: '' })) }}
                              className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex items-center gap-2">
                              <span className="font-mono text-[11px] text-teal">{eq.tag}</span>
                              <span className="text-[11px] text-white/50 truncate">{eq.nome}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div key={en.id} className="card p-4">
                <div className="flex items-center gap-2">
                  {editMode ? (
                    <>
                      <input className="input text-sm py-1 w-20" placeholder="4-2" value={en.codigo}
                        onChange={e => updateEnsaio(ei, { ...en, codigo: e.target.value })}/>
                      <input className="input text-sm py-1 flex-1" placeholder="Nome do ensaio (ex.: ESD)" value={en.nome}
                        onChange={e => updateEnsaio(ei, { ...en, nome: e.target.value })}/>
                      <button className="btn-ghost p-1.5 hover:text-red-400" onClick={() => removeEnsaio(ei)}><Trash2 size={12}/></button>
                    </>
                  ) : (
                    <>
                      <span className="font-mono font-bold text-[13px]" style={{ color: 'var(--accent,#E8B94B)' }}>{en.codigo || '—'}</span>
                      <span className="font-semibold text-[13px] text-white">{en.nome}</span>
                      <span className="text-[10px] text-white/30 font-mono ml-auto">
                        {en.equipamentoIds.length} padrão(ões) · {(en.auxiliaresIds ?? []).length} auxiliar(es)
                      </span>
                    </>
                  )}
                </div>

                {bloco('equipamentoIds', 'Padrões', '#2DD4BF',
                  'Nenhum padrão vinculado.', 'Buscar padrão por TAG ou nome…')}
                {bloco('auxiliaresIds', 'Aparelhos auxiliares', '#E8B94B',
                  'Nenhum aparelho auxiliar vinculado.', 'Buscar aparelho auxiliar por TAG ou nome…')}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
