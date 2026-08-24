'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  Save, Plus, Trash2, ChevronUp, ChevronDown,
  Eye, EyeOff, Image as ImageIcon, Check, Download, BookPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { chaveSigla, type ItemGlossario } from '@/lib/glossario'
import type { CSSProperties } from 'react'
import {
  FONTES_DISPONIVEIS,
  type DocumentoIT, type Bloco, type TipoBloco,
  type BlocoH1, type BlocoH2, type BlocoH3, type BlocoP, type BlocoDestaque,
  type BlocoUL, type BlocoOL, type BlocoImg, type BlocoTabela, type BlocoDefinicoes, type BlocoDiagrama,
} from '@/lib/instrucoes/tipos'
import { documentoITtoHTML } from '@/lib/instrucoes/html'
import { DiagramaEditor } from '@/components/DiagramaEditor'
import { diagramaParaSVG, DIAGRAMA_W, DIAGRAMA_H } from '@/lib/instrucoes/diagrama'
import { InputCorretor } from '@/components/corretor/InputCorretor'
import { TextareaCorretor } from '@/components/corretor/TextareaCorretor'

// Estilo de fonte/tamanho do bloco aplicado na pré-visualização do editor.
function estiloBloco(b: Bloco, base?: CSSProperties): CSSProperties {
  const s: CSSProperties = { ...base }
  if (b.fonte) s.fontFamily = b.fonte
  if (b.tamanho) s.fontSize = `${b.tamanho}pt`
  return s
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function blocoVazio(tipo: TipoBloco): Bloco {
  switch (tipo) {
    case 'h1': return { id: uid(), tipo: 'h1', numero: '', texto: '' }
    case 'h2': return { id: uid(), tipo: 'h2', numero: '', texto: '' }
    case 'h3': return { id: uid(), tipo: 'h3', numero: '', texto: '' }
    case 'p':  return { id: uid(), tipo: 'p', texto: '' }
    case 'destaque': return { id: uid(), tipo: 'destaque', termo: '', texto: '' }
    case 'ul': return { id: uid(), tipo: 'ul', itens: [''] }
    case 'ol': return { id: uid(), tipo: 'ol', itens: [''] }
    case 'img': return { id: uid(), tipo: 'img', src: '', legenda: '' }
    case 'tabela': return { id: uid(), tipo: 'tabela', cabecalho: ['Coluna 1', 'Coluna 2'], linhas: [['', '']] }
    case 'definicoes': return { id: uid(), tipo: 'definicoes', itens: [{ sigla: '', definicao: '' }] }
    case 'diagrama': return { id: uid(), tipo: 'diagrama', formas: [], w: DIAGRAMA_W, h: DIAGRAMA_H, legenda: '' }
  }
}

const TIPOS_BLOCO: { tipo: TipoBloco; label: string; icon: string }[] = [
  { tipo: 'h1',        label: 'Seção (H1)',            icon: '1.' },
  { tipo: 'h2',        label: 'Subseção (H2)',          icon: '1.1' },
  { tipo: 'h3',        label: 'Sub-subseção (H3)',      icon: '1.1.1' },
  { tipo: 'p',         label: 'Parágrafo',              icon: '¶' },
  { tipo: 'destaque',  label: 'Parágrafo com destaque', icon: 'B–' },
  { tipo: 'ul',        label: 'Lista com marcadores',   icon: '•' },
  { tipo: 'ol',        label: 'Lista numerada',         icon: '1)' },
  { tipo: 'img',       label: 'Imagem',                 icon: '🖼' },
  { tipo: 'tabela',    label: 'Tabela',                 icon: '⊞' },
  { tipo: 'definicoes',label: 'Definições / Siglas',    icon: '📖' },
  { tipo: 'diagrama',  label: 'Diagrama / esquema',     icon: '✎' },
]

// ─── Block Render (view mode) ────────────────────────────────────────────────

function RenderBloco({ bloco }: { bloco: Bloco }) {
  switch (bloco.tipo) {
    case 'h1': return (
      <p className="font-bold text-[14px] text-white/95 mt-1" style={estiloBloco(bloco)}>
        {bloco.numero && <span className="mr-2">{bloco.numero}</span>}{bloco.texto || <span className="text-white/20 italic">Seção sem título</span>}
      </p>
    )
    case 'h2': return (
      <p className="font-bold text-[13px] text-white/90" style={estiloBloco(bloco)}>
        {bloco.numero && <span className="mr-2">{bloco.numero}</span>}{bloco.texto || <span className="text-white/20 italic">Subseção sem título</span>}
      </p>
    )
    case 'h3': return (
      <p className="font-semibold text-[12px] text-white/80 ml-4" style={estiloBloco(bloco)}>
        {bloco.numero && <span className="mr-2">{bloco.numero}</span>}{bloco.texto || <span className="text-white/20 italic">Sub-subseção sem título</span>}
      </p>
    )
    case 'p': return (
      <p className="text-[12px] text-white/70 leading-relaxed" style={estiloBloco(bloco, { textAlign: 'justify' })}>
        {bloco.texto || <span className="text-white/20 italic">Parágrafo vazio</span>}
      </p>
    )
    case 'destaque': return (
      <p className="text-[12px] text-white/70 leading-relaxed ml-4" style={estiloBloco(bloco, { textAlign: 'justify' })}>
        {bloco.termo && <strong className="text-white/90">{bloco.termo} – </strong>}
        {bloco.texto || <span className="text-white/20 italic">Texto vazio</span>}
      </p>
    )
    case 'ul': return (
      <ul className="ml-6 space-y-1" style={estiloBloco(bloco)}>
        {bloco.itens.map((item, i) => (
          <li key={i} className="text-[12px] text-white/70 flex gap-2">
            <span className="flex-shrink-0 text-white/40">•</span>
            <span>{item || <span className="text-white/20 italic">Item vazio</span>}</span>
          </li>
        ))}
      </ul>
    )
    case 'ol': return (
      <ol className="ml-6 space-y-1" style={estiloBloco(bloco)}>
        {bloco.itens.map((item, i) => (
          <li key={i} className="text-[12px] text-white/70 flex gap-2">
            <span className="flex-shrink-0 text-white/40 font-mono">{i + 1})</span>
            <span>{item || <span className="text-white/20 italic">Passo vazio</span>}</span>
          </li>
        ))}
      </ol>
    )
    case 'img': return (
      <div className="flex flex-col items-center gap-2 my-2">
        {bloco.src
          ? <img src={bloco.src} alt={bloco.legenda} className="max-w-full max-h-64 rounded-lg border border-white/10 object-contain" />
          : <div className="w-full h-32 rounded-lg border border-dashed border-white/15 flex items-center justify-center text-white/20 text-sm">
              Nenhuma imagem
            </div>
        }
        {bloco.legenda && (
          <p className="text-[11px] text-white/45 text-center italic">{bloco.legenda}</p>
        )}
      </div>
    )
    case 'tabela': return (
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse" style={estiloBloco(bloco)}>
          {bloco.cabecalho.length > 0 && bloco.cabecalho.some(Boolean) && (
            <thead>
              <tr>
                {bloco.cabecalho.map((h, i) => (
                  <th key={i} className="border border-white/15 px-3 py-1.5 text-left text-white/60 bg-white/[0.04] font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {bloco.linhas.map((linha, r) => (
              <tr key={r}>
                {linha.map((cel, c) => (
                  <td key={c} className="border border-white/10 px-3 py-1.5 text-white/65">
                    {cel}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    case 'definicoes': return (
      <div className="space-y-1 ml-2" style={estiloBloco(bloco)}>
        {bloco.itens.map((item, i) => (
          <p key={i} className="text-[11px] text-white/65 font-mono">
            <span className="text-white/80 font-semibold">{item.sigla}</span>
            {item.sigla && item.definicao ? ' – ' : ''}
            <span className="font-sans text-white/55">{item.definicao}</span>
          </p>
        ))}
      </div>
    )
    case 'diagrama': return (
      <div className="flex flex-col items-center gap-2 my-2">
        {bloco.formas.length === 0
          ? <div className="w-full h-24 rounded-lg border border-dashed border-white/15 flex items-center justify-center text-white/20 text-sm">Diagrama vazio</div>
          : <div className="max-w-full overflow-auto rounded-lg" dangerouslySetInnerHTML={{ __html: diagramaParaSVG(bloco) }} />}
        {bloco.legenda && <p className="text-[11px] text-white/45 text-center italic">{bloco.legenda}</p>}
      </div>
    )
  }
}

// ─── Block Edit Forms ────────────────────────────────────────────────────────

function EditH({ bloco, onChange }: { bloco: BlocoH1 | BlocoH2 | BlocoH3; onChange: (b: Bloco) => void }) {
  return (
    <div className="flex gap-2">
      <input className="input text-[11px] w-24 flex-shrink-0" placeholder="Nº (ex: 5.2)"
        value={bloco.numero} onChange={e => onChange({ ...bloco, numero: e.target.value })} />
      <InputCorretor className="input text-[11px] flex-1" placeholder="Título da seção"
        value={bloco.texto} onChange={v => onChange({ ...bloco, texto: v })} />
    </div>
  )
}

function EditP({ bloco, onChange }: { bloco: BlocoP; onChange: (b: Bloco) => void }) {
  return (
    <TextareaCorretor className="input text-[11px] min-h-[80px] resize-y leading-relaxed"
      placeholder="Texto do parágrafo..."
      value={bloco.texto} onChange={v => onChange({ ...bloco, texto: v })} />
  )
}

function EditDestaque({ bloco, onChange }: { bloco: BlocoDestaque; onChange: (b: Bloco) => void }) {
  return (
    <div className="space-y-2">
      <InputCorretor className="input text-[11px]" placeholder="Termo em negrito (ex: Impedância)"
        value={bloco.termo} onChange={v => onChange({ ...bloco, termo: v })} />
      <TextareaCorretor className="input text-[11px] min-h-[60px] resize-y"
        placeholder="Texto do parágrafo após o termo..."
        value={bloco.texto} onChange={v => onChange({ ...bloco, texto: v })} />
    </div>
  )
}

function EditLista({ bloco, onChange }: { bloco: BlocoUL | BlocoOL; onChange: (b: Bloco) => void }) {
  function setItem(i: number, v: string) {
    const itens = [...bloco.itens]
    itens[i] = v
    onChange({ ...bloco, itens })
  }
  function addItem() { onChange({ ...bloco, itens: [...bloco.itens, ''] }) }
  function removeItem(i: number) {
    if (bloco.itens.length <= 1) return
    onChange({ ...bloco, itens: bloco.itens.filter((_, idx) => idx !== i) })
  }
  return (
    <div className="space-y-1.5">
      {bloco.itens.map((item, i) => (
        <div key={i} className="flex gap-2 items-center">
          <span className="text-[11px] text-white/30 font-mono w-5 flex-shrink-0">
            {bloco.tipo === 'ol' ? `${i+1})` : '•'}
          </span>
          <InputCorretor className="input text-[11px] flex-1" value={item}
            placeholder={bloco.tipo === 'ol' ? `Passo ${i + 1}` : `Item ${i + 1}`}
            onChange={v => setItem(i, v)} />
          <button type="button" onClick={() => removeItem(i)}
            className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0">
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      <button type="button" onClick={addItem}
        className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors mt-1">
        <Plus size={11} /> Adicionar item
      </button>
    </div>
  )
}

function EditImg({ bloco, onChange }: { bloco: BlocoImg; onChange: (b: Bloco) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => onChange({ ...bloco, src: e.target?.result as string })
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="btn-secondary text-[11px] gap-1.5">
          <ImageIcon size={11} /> {bloco.src ? 'Trocar imagem' : 'Selecionar imagem'}
        </button>
        {bloco.src && (
          <button type="button" onClick={() => onChange({ ...bloco, src: '' })}
            className="text-[11px] text-white/30 hover:text-red-400 transition-colors">
            Remover
          </button>
        )}
      </div>
      {bloco.src && (
        <img src={bloco.src} alt="" className="max-h-40 rounded-lg border border-white/10 object-contain" />
      )}
      <InputCorretor className="input text-[11px]" placeholder="Legenda da figura (ex: Figura 1 - Exemplo...)"
        value={bloco.legenda} onChange={v => onChange({ ...bloco, legenda: v })} />
    </div>
  )
}

function EditTabela({ bloco, onChange }: { bloco: BlocoTabela; onChange: (b: Bloco) => void }) {
  function setCabecalho(i: number, v: string) {
    const c = [...bloco.cabecalho]; c[i] = v
    onChange({ ...bloco, cabecalho: c })
  }
  function setCell(r: number, c: number, v: string) {
    const linhas = bloco.linhas.map(l => [...l])
    linhas[r][c] = v
    onChange({ ...bloco, linhas })
  }
  function addCol() {
    onChange({ ...bloco, cabecalho: [...bloco.cabecalho, ''], linhas: bloco.linhas.map(l => [...l, '']) })
  }
  function addRow() {
    onChange({ ...bloco, linhas: [...bloco.linhas, bloco.cabecalho.map(() => '')] })
  }
  function removeRow(r: number) {
    if (bloco.linhas.length <= 1) return
    onChange({ ...bloco, linhas: bloco.linhas.filter((_, i) => i !== r) })
  }
  function removeCol(c: number) {
    if (bloco.cabecalho.length <= 1) return
    onChange({ ...bloco, cabecalho: bloco.cabecalho.filter((_, i) => i !== c), linhas: bloco.linhas.map(l => l.filter((_, i) => i !== c)) })
  }

  return (
    <div className="space-y-2 overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr>
            {bloco.cabecalho.map((h, c) => (
              <th key={c} className="border border-white/15 bg-white/[0.04] p-1">
                <div className="flex items-center gap-1">
                  <input className="input text-[10px] py-0.5 h-6 font-semibold bg-transparent border-0 text-white/70 flex-1"
                    value={h} placeholder={`Col ${c+1}`} onChange={e => setCabecalho(c, e.target.value)} />
                  <button type="button" onClick={() => removeCol(c)}
                    className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 size={9} />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bloco.linhas.map((linha, r) => (
            <tr key={r}>
              {linha.map((cel, c) => (
                <td key={c} className="border border-white/10 p-1">
                  <InputCorretor className="input text-[10px] py-0.5 h-6 bg-transparent border-0 text-white/60 w-full"
                    value={cel} placeholder="—" onChange={v => setCell(r, c, v)} />
                </td>
              ))}
              <td className="pl-1">
                <button type="button" onClick={() => removeRow(r)}
                  className="text-white/20 hover:text-red-400 transition-colors">
                  <Trash2 size={10} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2">
        <button type="button" onClick={addRow} className="btn-secondary text-[10px] gap-1"><Plus size={9} />Linha</button>
        <button type="button" onClick={addCol} className="btn-secondary text-[10px] gap-1"><Plus size={9} />Coluna</button>
      </div>
    </div>
  )
}

function EditDefinicoes({ bloco, onChange, glossario, onUpsertGlossario }: {
  bloco: BlocoDefinicoes; onChange: (b: Bloco) => void
  glossario: ItemGlossario[]; onUpsertGlossario: (sigla: string, definicao: string) => void
}) {
  // Mapa sigla→definição do glossário, para puxar automaticamente.
  const mapa = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of glossario) m.set(chaveSigla(g.sigla), g.definicao)
    return m
  }, [glossario])
  const listId = useRef('gloss-' + Math.random().toString(36).slice(2)).current

  function setSigla(i: number, v: string) {
    const def = mapa.get(chaveSigla(v))
    const itens = bloco.itens.map((item, idx) => {
      if (idx !== i) return item
      // Sigla já no glossário e definição em branco → puxa automaticamente.
      const definicao = def && !item.definicao.trim() ? def : item.definicao
      return { ...item, sigla: v, definicao }
    })
    onChange({ ...bloco, itens })
  }
  function setDef(i: number, v: string) {
    onChange({ ...bloco, itens: bloco.itens.map((item, idx) => idx === i ? { ...item, definicao: v } : item) })
  }
  function add() { onChange({ ...bloco, itens: [...bloco.itens, { sigla: '', definicao: '' }] }) }
  function remove(i: number) {
    if (bloco.itens.length <= 1) return
    onChange({ ...bloco, itens: bloco.itens.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-1.5">
      <datalist id={listId}>
        {glossario.map(g => <option key={g.sigla} value={g.sigla}>{g.definicao}</option>)}
      </datalist>
      {bloco.itens.map((item, i) => {
        const noGlossario = mapa.get(chaveSigla(item.sigla))
        // Pode gravar/atualizar no glossário se tem sigla+definição e ainda não
        // está idêntico ao registrado.
        const podeSalvar = !!chaveSigla(item.sigla) && !!item.definicao.trim() && noGlossario !== item.definicao.trim()
        return (
          <div key={i} className="flex gap-2 items-center">
            <input className="input text-[11px] w-28 flex-shrink-0 font-mono font-semibold uppercase"
              placeholder="SIGLA" list={listId} value={item.sigla} onChange={e => setSigla(i, e.target.value)} />
            <span className="text-white/30 flex-shrink-0">–</span>
            <InputCorretor className="input text-[11px] flex-1"
              placeholder="Definição completa" value={item.definicao} onChange={v => setDef(i, v)} />
            {podeSalvar ? (
              <button type="button" title="Salvar/atualizar no glossário"
                onClick={() => onUpsertGlossario(item.sigla, item.definicao)}
                className="text-white/30 hover:text-teal transition-colors flex-shrink-0">
                <BookPlus size={12} />
              </button>
            ) : noGlossario !== undefined ? (
              <span title="Definição puxada do glossário" className="text-teal/70 flex-shrink-0"><Check size={12} /></span>
            ) : (
              <span className="w-3 flex-shrink-0" />
            )}
            <button type="button" onClick={() => remove(i)}
              className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0">
              <Trash2 size={11} />
            </button>
          </div>
        )
      })}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors">
        <Plus size={11} /> Adicionar sigla
      </button>
      <p className="text-[10px] text-white/25">Digite uma sigla já usada e a definição é puxada do glossário. Use <BookPlus size={9} className="inline" /> para cadastrar uma nova.</p>
    </div>
  )
}

function EditDiagrama({ bloco, onChange }: { bloco: BlocoDiagrama; onChange: (b: Bloco) => void }) {
  return (
    <div className="space-y-2">
      <DiagramaEditor
        formas={bloco.formas} w={bloco.w || DIAGRAMA_W} h={bloco.h || DIAGRAMA_H}
        onChange={formas => onChange({ ...bloco, formas })} />
      <InputCorretor className="input text-[11px] py-1" placeholder="Legenda do diagrama (ex: Figura 1 – Esquema de ligação)"
        value={bloco.legenda ?? ''} onChange={v => onChange({ ...bloco, legenda: v })} />
    </div>
  )
}

// ─── Controle de fonte/tamanho do bloco ──────────────────────────────────────

function FonteControl({ bloco, onChange }: { bloco: Bloco; onChange: (b: Bloco) => void }) {
  return (
    <div className="flex items-center gap-2 pb-1.5 mb-1 border-b border-white/5">
      <span className="text-[9px] font-mono uppercase tracking-wider text-white/25">Fonte</span>
      <select
        className="input text-[10px] py-0.5 h-6 w-auto cursor-pointer"
        value={bloco.fonte ?? ''}
        onChange={e => onChange({ ...bloco, fonte: e.target.value || undefined })}
        title="Família da fonte deste bloco">
        <option value="">Padrão</option>
        {FONTES_DISPONIVEIS.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <input
        type="number" min={6} max={48} step={0.5}
        className="input text-[10px] py-0.5 h-6 w-16 font-mono"
        placeholder="pt"
        value={bloco.tamanho ?? ''}
        onChange={e => onChange({ ...bloco, tamanho: e.target.value ? Number(e.target.value) : undefined })}
        title="Tamanho da fonte em pt" />
      {(bloco.fonte || bloco.tamanho) && (
        <button type="button" onClick={() => onChange({ ...bloco, fonte: undefined, tamanho: undefined })}
          className="text-[10px] text-white/30 hover:text-white/60 transition-colors">
          limpar
        </button>
      )}
    </div>
  )
}

// ─── BlocoCard ───────────────────────────────────────────────────────────────

interface BlocoCardProps {
  bloco: Bloco
  isFirst: boolean; isLast: boolean
  onUpdate: (b: Bloco) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  glossario: ItemGlossario[]
  onUpsertGlossario: (sigla: string, definicao: string) => void
}

function BlocoCard({ bloco, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown, glossario, onUpsertGlossario }: BlocoCardProps) {
  const [editing, setEditing] = useState(false)
  const tipoInfo = TIPOS_BLOCO.find(t => t.tipo === bloco.tipo)

  function renderEdit() {
    switch (bloco.tipo) {
      case 'h1': case 'h2': case 'h3': return <EditH bloco={bloco} onChange={onUpdate} />
      case 'p':  return <EditP bloco={bloco} onChange={onUpdate} />
      case 'destaque': return <EditDestaque bloco={bloco} onChange={onUpdate} />
      case 'ul': case 'ol': return <EditLista bloco={bloco} onChange={onUpdate} />
      case 'img': return <EditImg bloco={bloco} onChange={onUpdate} />
      case 'tabela': return <EditTabela bloco={bloco} onChange={onUpdate} />
      case 'definicoes': return <EditDefinicoes bloco={bloco} onChange={onUpdate} glossario={glossario} onUpsertGlossario={onUpsertGlossario} />
      case 'diagrama': return <EditDiagrama bloco={bloco} onChange={onUpdate} />
    }
  }

  return (
    <div className={cn(
      'group/bloco relative border rounded-xl transition-colors',
      editing ? 'border-brand/30 bg-white/[0.02]' : 'border-transparent hover:border-white/8'
    )}>
      {/* Controls overlay */}
      <div className={cn(
        'absolute right-2 top-2 flex items-center gap-1 z-10 transition-opacity',
        editing ? 'opacity-100' : 'opacity-0 group-hover/bloco:opacity-100'
      )}>
        <span className="text-[9px] font-mono text-white/20 mr-1">{tipoInfo?.icon}</span>
        <button type="button" onClick={onMoveUp} disabled={isFirst}
          className="w-5 h-5 flex items-center justify-center text-white/25 hover:text-white/70 disabled:opacity-20 rounded transition-colors">
          <ChevronUp size={11} />
        </button>
        <button type="button" onClick={onMoveDown} disabled={isLast}
          className="w-5 h-5 flex items-center justify-center text-white/25 hover:text-white/70 disabled:opacity-20 rounded transition-colors">
          <ChevronDown size={11} />
        </button>
        <button type="button" onClick={() => setEditing(!editing)}
          className={cn(
            'px-2 h-5 rounded text-[9px] font-medium transition-colors',
            editing ? 'bg-brand/20 text-brand' : 'bg-white/5 text-white/40 hover:text-white/70'
          )}>
          {editing ? 'OK' : 'Editar'}
        </button>
        <button type="button" onClick={onDelete}
          className="w-5 h-5 flex items-center justify-center text-white/20 hover:text-red-400 rounded transition-colors">
          <Trash2 size={10} />
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-2.5 pr-36">
        {editing ? (
          <div className="space-y-2">
            <p className="text-[9px] font-mono uppercase tracking-widest text-white/25 mb-2">
              {tipoInfo?.label}
            </p>
            <FonteControl bloco={bloco} onChange={onUpdate} />
            {renderEdit()}
          </div>
        ) : (
          <div onClick={() => setEditing(true)} className="cursor-text">
            <RenderBloco bloco={bloco} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── AddBlockMenu ────────────────────────────────────────────────────────────

function AddBlockMenu({ onAdd }: { onAdd: (tipo: TipoBloco) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-white/15 text-[11px] text-white/30 hover:text-white/60 hover:border-white/25 transition-colors">
        <Plus size={12} /> Adicionar bloco
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 z-50 rounded-xl border border-white/10 overflow-hidden shadow-2xl"
          style={{ background: '#111520', minWidth: '220px' }}>
          {TIPOS_BLOCO.map(({ tipo, label, icon }) => (
            <button key={tipo} type="button"
              onClick={() => { onAdd(tipo); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-white/60 hover:bg-white/[0.05] hover:text-white/90 transition-colors text-left">
              <span className="w-7 text-center font-mono text-[10px] text-white/30">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

interface SubgrupoTax { id: string; nome: string; numero?: string }
interface GrupoTax { id: string; nome: string; subgrupos?: SubgrupoTax[] }

const META_VAZIO: Omit<DocumentoIT, 'id' | 'blocos' | 'criadoEm' | 'atualizadoEm'> = {
  tipoDocumento: 'IT', codigo: '', titulo: '', revisao: '00', dataRevisao: '', revisadoPor: '', aprovadoPor: '',
}

export default function EditorInstrucaoPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  // Edição do MODELO PADRÃO de IT (carrega/salva via /api/instrucoes/template).
  const ehModelo = id === 'modelo-padrao'

  const [doc, setDoc] = useState<DocumentoIT | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState(false)
  const [erro, setErro] = useState('')
  const [baixando, setBaixando] = useState(false)
  const [grupos, setGrupos] = useState<GrupoTax[]>([])
  const [glossario, setGlossario] = useState<ItemGlossario[]>([])
  // Há alterações não salvas? Bloqueia sair sem salvar.
  const [alterado, setAlterado] = useState(false)

  useEffect(() => {
    if (ehModelo) {
      // Modelo padrão: só tem blocos; embrulha num DocumentoIT p/ reusar o editor.
      fetch('/api/instrucoes/template', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(t => {
          const blocos = Array.isArray(t?.blocos) ? t.blocos : []
          setDoc({
            id: 'modelo-padrao', tipoDocumento: 'IT', codigo: 'MODELO PADRÃO',
            titulo: 'Modelo padrão de IT (checagem)', revisao: '', dataRevisao: '',
            revisadoPor: '', aprovadoPor: '', blocos, criadoEm: '', atualizadoEm: '',
          })
          setAlterado(false)
        })
        .catch(() => {})
    } else {
      fetch(`/api/instrucoes/${id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) { setDoc(d); setAlterado(false) } })
        .catch(() => {})
    }
    fetch('/api/grupos').then(r => r.json()).then(g => setGrupos(Array.isArray(g) ? g : [])).catch(() => {})
    fetch('/api/glossario').then(r => r.json()).then(g => setGlossario(Array.isArray(g) ? g : [])).catch(() => {})
  }, [id])

  // Grava/atualiza uma sigla no glossário compartilhado (otimista + persiste).
  const upsertGlossario = useCallback((sigla: string, definicao: string) => {
    const s = chaveSigla(sigla); const d = definicao.trim()
    if (!s || !d) return
    setGlossario(prev => {
      const i = prev.findIndex(x => chaveSigla(x.sigla) === s)
      if (i < 0) return [...prev, { sigla: s, definicao: d }]
      const c = [...prev]; c[i] = { sigla: s, definicao: d }; return c
    })
    fetch('/api/glossario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sigla: s, definicao: d }),
    }).catch(() => {})
  }, [])

  // Avisa ao fechar/recarregar a janela (e ao fechar o app) se houver pendência.
  useEffect(() => {
    if (!alterado) return
    function aviso(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [alterado])

  // Navega só se não houver pendência (ou se o usuário confirmar descartar).
  function sairSeguro(href: string) {
    if (alterado && !confirm('Deseja retornar sem salvar os dados?')) return
    router.push(href)
  }

  const updateMeta = useCallback((patch: Partial<DocumentoIT>) => {
    setDoc(prev => prev ? { ...prev, ...patch } : prev)
    setSaved(false); setAlterado(true)
  }, [])

  const updateBlocos = useCallback((blocos: Bloco[]) => {
    setDoc(prev => prev ? { ...prev, blocos } : prev)
    setSaved(false); setAlterado(true)
  }, [])

  function addBloco(tipo: TipoBloco, afterIdx?: number) {
    const novo = blocoVazio(tipo)
    setDoc(prev => {
      if (!prev) return prev
      const blocos = [...prev.blocos]
      const idx = afterIdx !== undefined ? afterIdx + 1 : blocos.length
      blocos.splice(idx, 0, novo)
      return { ...prev, blocos }
    })
    setSaved(false); setAlterado(true)
  }

  function updateBloco(i: number, bloco: Bloco) {
    setDoc(prev => {
      if (!prev) return prev
      const blocos = [...prev.blocos]
      blocos[i] = bloco
      return { ...prev, blocos }
    })
    setSaved(false); setAlterado(true)
  }

  function deleteBloco(i: number) {
    setDoc(prev => {
      if (!prev) return prev
      return { ...prev, blocos: prev.blocos.filter((_, idx) => idx !== i) }
    })
    setSaved(false); setAlterado(true)
  }

  function moveBloco(i: number, dir: -1 | 1) {
    setDoc(prev => {
      if (!prev) return prev
      const blocos = [...prev.blocos]
      const j = i + dir
      if (j < 0 || j >= blocos.length) return prev
      ;[blocos[i], blocos[j]] = [blocos[j], blocos[i]]
      return { ...prev, blocos }
    })
    setSaved(false); setAlterado(true)
  }

  async function salvar() {
    if (!doc) return
    setSaving(true); setErro('')
    try {
      const res = ehModelo
        ? await fetch('/api/instrucoes/template', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocos: doc.blocos }),
          })
        : await fetch(`/api/instrucoes/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(doc),
          })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true); setAlterado(false)
    } catch (e: unknown) {
      setErro(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function baixarPDF() {
    if (!doc) return
    setBaixando(true); setErro('')
    try {
      const html = documentoITtoHTML(doc)
      const base = [doc.tipoDocumento, doc.codigo, doc.titulo].filter(Boolean).join(' ') || 'instrucao'
      const filename = base.replace(/[\\/:"*?<>|]+/g, '_').replace(/\s+/g, '_') + '.pdf'
      const api = (window as any).electronAPI
      // Preferir diálogo "Salvar como" (build novo); cair no followup se indisponível.
      const gerar = api?.salvarPdfHtml ?? api?.saveFollowupPdf
      if (!gerar) {
        setErro('Geração de PDF disponível apenas no aplicativo (desktop).')
        return
      }
      const r = await gerar(html, filename, false)
      if (r && r.ok === false && !r.canceled) setErro(r.error || 'Falha ao gerar PDF.')
    } catch (e: unknown) {
      setErro(String(e))
    } finally {
      setBaixando(false)
    }
  }

  if (!doc) return (
    <div className="flex items-center justify-center h-64 text-white/25 text-sm">
      Carregando documento…
    </div>
  )

  return (
    <div className="max-w-4xl space-y-4 pb-16">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={() => sairSeguro('/procedimentos/instrucoes')}
          className="btn-secondary text-[11px]">← Lista</button>

        <div className="flex-1 min-w-0" />

        <button type="button" onClick={() => setPreview(!preview)}
          className={cn('btn-secondary text-[11px] gap-1.5', preview && 'bg-brand/15 border-brand/30 text-brand')}>
          {preview ? <EyeOff size={12} /> : <Eye size={12} />}
          {preview ? 'Editar' : 'Visualizar'}
        </button>

        <button type="button" onClick={baixarPDF} disabled={baixando}
          className="btn-secondary text-[11px] gap-1.5" title="Gerar PDF da instrução de trabalho">
          {baixando ? <span className="animate-spin text-[12px] inline-block">⟳</span> : <Download size={12} />}
          {baixando ? 'Gerando…' : 'Baixar PDF'}
        </button>

        {saved && !saving && (
          <span className="flex items-center gap-1 text-[11px] text-green-400">
            <Check size={11} /> Salvo
          </span>
        )}
        {erro && <span className="text-[11px] text-red-400">{erro}</span>}

        <button type="button" onClick={salvar} disabled={saving}
          className="btn-primary gap-1.5">
          {saving ? <span className="animate-spin text-[12px] inline-block">⟳</span> : <Save size={13} />}
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {preview ? (
        /* ── Preview Mode ── visualização = MESMO HTML do PDF (A4), em iframe
           isolado. Robusto e idêntico ao que sai impresso. */
        <iframe
          title="Visualização da IT"
          srcDoc={documentoITtoHTML(doc)}
          className="w-full bg-white rounded-xl border border-white/10"
          style={{ height: '82vh' }}
        />
      ) : (
        <>
          {/* ── Metadados ── */}
          <div className="card p-5 space-y-4">
            <p className="form-section">Cabeçalho do documento</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Tipo</label>
                <div className="flex gap-2 mt-1">
                  {(['IT', 'PC'] as const).map(t => (
                    <button key={t} type="button" onClick={() => updateMeta({ tipoDocumento: t })}
                      className={cn('px-4 py-2 rounded-lg text-[11px] font-medium border transition-colors',
                        doc.tipoDocumento === t ? 'bg-brand/15 border-brand/35 text-brand' : 'border-white/10 text-white/35 hover:text-white/60')}>
                      {t === 'IT' ? 'IT — Instrução de Trabalho' : 'PC — Procedimento de Calibração'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label">Código</label>
                <input className="input" value={doc.codigo} placeholder="ex: PC R04, IT-001"
                  onChange={e => updateMeta({ codigo: e.target.value })} />
              </div>

              <div className="col-span-2">
                <label className="form-label">Título</label>
                <InputCorretor className="input" value={doc.titulo} placeholder="ex: Atenuador, Medição de Atenuação"
                  onChange={v => updateMeta({ titulo: v })} />
              </div>

              <div>
                <label className="form-label">Revisão</label>
                <input className="input" value={doc.revisao} placeholder="ex: 00"
                  onChange={e => updateMeta({ revisao: e.target.value })} />
              </div>

              <div>
                <label className="form-label">Data da revisão</label>
                <input type="date" className="input" value={doc.dataRevisao}
                  onChange={e => updateMeta({ dataRevisao: e.target.value })} />
              </div>

              <div>
                <label className="form-label">Revisado por</label>
                <InputCorretor className="input" value={doc.revisadoPor} placeholder="Nome do revisor"
                  onChange={v => updateMeta({ revisadoPor: v })} />
              </div>

              <div>
                <label className="form-label">Aprovado por</label>
                <InputCorretor className="input" value={doc.aprovadoPor} placeholder="Nome do aprovador"
                  onChange={v => updateMeta({ aprovadoPor: v })} />
              </div>

              <div>
                <label className="form-label">Grupo de equipamento</label>
                <select className="input cursor-pointer" value={doc.grupoId ?? ''}
                  onChange={e => updateMeta({ grupoId: e.target.value || undefined, subgrupoId: undefined })}>
                  <option value="">— nenhum —</option>
                  {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Subgrupo <span className="text-white/25 normal-case">(p/ consulta na checagem)</span></label>
                <select className="input cursor-pointer" value={doc.subgrupoId ?? ''}
                  onChange={e => updateMeta({ subgrupoId: e.target.value || undefined })}
                  disabled={!doc.grupoId}>
                  <option value="">— nenhum —</option>
                  {grupos.find(g => g.id === doc.grupoId)?.subgrupos?.map(s => (
                    <option key={s.id} value={s.id}>{s.numero ? `${s.numero} · ` : ''}{s.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Editor de blocos ── */}
          <div className="card p-4 space-y-1">
            <div className="flex items-center justify-between px-1 mb-3">
              <p className="text-[9px] font-mono uppercase tracking-[2.5px] text-white/25">
                Conteúdo — {doc.blocos.length} bloco{doc.blocos.length !== 1 ? 's' : ''}
              </p>
            </div>

            {doc.blocos.length === 0 && (
              <p className="text-center text-white/20 text-sm py-8">
                Nenhum bloco adicionado.<br />
                <span className="text-[11px]">Use o botão abaixo para adicionar conteúdo.</span>
              </p>
            )}

            <div className="space-y-0.5">
              {doc.blocos.map((bloco, i) => (
                <BlocoCard
                  key={bloco.id}
                  bloco={bloco}
                  isFirst={i === 0}
                  isLast={i === doc.blocos.length - 1}
                  onUpdate={b => updateBloco(i, b)}
                  onDelete={() => deleteBloco(i)}
                  onMoveUp={() => moveBloco(i, -1)}
                  onMoveDown={() => moveBloco(i, 1)}
                  glossario={glossario}
                  onUpsertGlossario={upsertGlossario}
                />
              ))}
            </div>

            <div className="pt-3 pb-1 flex justify-center">
              <AddBlockMenu onAdd={tipo => addBloco(tipo)} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
