'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { registrarTempo } from '@/lib/tempos'
import {
  ArrowLeft, ArrowRight, Plus, Search, X, CheckCircle2, XCircle, Clock, Edit2,
  Trash2, ChevronDown, ChevronUp, FileText, Loader2, Download,
  Lightbulb, Lamp, Settings, Layers, RotateCcw, Link2, FileSearch,
  AlertTriangle, Wifi, BarChart2, Tag, TrendingUp, Printer, ScanText, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type AgendaItem, type RelatorioSalvo, type ClienteDB,
  type LoteAmostra, type LoteConfig, type Cispr15Config,
  AGENDA_KEY, RELATORIOS_KEY, CLIENTES_KEY, CFG_KEY, LOTE_KEY, today,
} from '@/app/cispr15/types'

/* ─── tags predefinidas ───────────────────────────────────────────────────── */
const PREDEFINED_TAGS = [
  { id: 'urgente',      label: 'Urgente',             cls: 'border-orange-400/40 bg-orange-400/8 text-orange-300' },
  { id: 'reensaio',     label: 'Reensaio',             cls: 'border-blue-400/40 bg-blue-400/8 text-blue-300' },
  { id: 'reprov_cond',  label: 'Reprov. Conduzida',    cls: 'border-red-400/40 bg-red-400/8 text-red-300' },
  { id: 'reprov_loop',  label: 'Reprov. Loop',         cls: 'border-red-400/40 bg-red-400/8 text-red-300' },
  { id: 'reprov_b',     label: 'Reprov. Anexo B',      cls: 'border-red-400/40 bg-red-400/8 text-red-300' },
] as const

type TagId = typeof PREDEFINED_TAGS[number]['id']

/* ─── tags personalizadas ─────────────────────────────────────────────────── */
const CUSTOM_TAGS_KEY = 'cispr15_custom_tags_v1'

interface CustomTag { id: string; label: string; color: string }

const TAG_COLORS = [
  { id: 'red',    cls: 'border-red-400/40 bg-red-400/8 text-red-300',           dot: '#f87171' },
  { id: 'orange', cls: 'border-orange-400/40 bg-orange-400/8 text-orange-300',  dot: '#fb923c' },
  { id: 'yellow', cls: 'border-yellow-400/40 bg-yellow-400/8 text-yellow-300',  dot: '#facc15' },
  { id: 'green',  cls: 'border-green-400/40 bg-green-400/8 text-green-300',     dot: '#4ade80' },
  { id: 'teal',   cls: 'border-teal/40 bg-teal/8 text-teal',                    dot: '#2dd4bf' },
  { id: 'blue',   cls: 'border-blue-400/40 bg-blue-400/8 text-blue-300',        dot: '#60a5fa' },
  { id: 'purple', cls: 'border-purple-400/40 bg-purple-400/8 text-purple-300',  dot: '#c084fc' },
  { id: 'pink',   cls: 'border-pink-400/40 bg-pink-400/8 text-pink-300',        dot: '#f472b6' },
] as const

// store partilhado para que TagChip funcione sem prop drilling
const customTagsStore = new Map<string, { id: string; label: string; cls: string }>()

function tagInfo(id: string) {
  return PREDEFINED_TAGS.find(t => t.id === id) ?? customTagsStore.get(id) ?? null
}

function updateCustomTagsStore(tags: CustomTag[]) {
  customTagsStore.clear()
  tags.forEach(t => {
    const color = TAG_COLORS.find(c => c.id === t.color) ?? TAG_COLORS[0]
    customTagsStore.set(t.id, { id: t.id, label: t.label, cls: color.cls })
  })
}

function TagChip({ id, small }: { id: string; small?: boolean }) {
  const t = tagInfo(id)
  if (!t) return null
  return (
    <span className={cn(
      'inline-flex items-center rounded border font-semibold leading-none',
      t.cls,
      small ? 'text-[9px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5',
    )}>
      {t.label}
    </span>
  )
}

/* ─── PieChart SVG ─────────────────────────────────────────────────────────── */
function PieChart({ slices, size = 88 }: {
  slices: { value: number; color: string; label: string }[]
  size?: number
}) {
  const total = slices.reduce((s, v) => s + v.value, 0)
  if (total === 0) return (
    <div style={{ width: size, height: size }} className="flex items-center justify-center rounded-full border border-white/8">
      <span className="text-[9px] text-white/20 font-mono">—</span>
    </div>
  )
  const r = 38; const cx = 44; const cy = 44
  let angle = -Math.PI / 2
  const paths: { d: string; color: string }[] = []
  slices.filter(s => s.value > 0).forEach(slice => {
    const frac = slice.value / total
    const start = angle
    const end = angle + frac * 2 * Math.PI
    angle = end
    if (frac >= 1) {
      paths.push({ d: `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx - 0.01},${cy - r} Z`, color: slice.color })
    } else {
      const x1 = cx + r * Math.cos(start); const y1 = cy + r * Math.sin(start)
      const x2 = cx + r * Math.cos(end);   const y2 = cy + r * Math.sin(end)
      paths.push({ d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x2},${y2} Z`, color: slice.color })
    }
  })
  return (
    <svg viewBox="0 0 88 88" width={size} height={size} className="shrink-0">
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      ))}
    </svg>
  )
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function fmtMonth(yyyymm: string) {
  const [y, m] = yyyymm.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m) - 1]} ${y.slice(2)}`
}

function daysUntil(dateStr: string): number {
  if (!dateStr) return 999
  const now = new Date(today() + 'T00:00:00')
  const target = new Date(dateStr + 'T00:00:00')
  return Math.floor((target.getTime() - now.getTime()) / 86400000)
}

function diasNoLab(dataEntrada: string): number {
  if (!dataEntrada) return 0
  const now = new Date(today() + 'T00:00:00')
  const entrada = new Date(dataEntrada + 'T00:00:00')
  return Math.max(0, Math.floor((now.getTime() - entrada.getTime()) / 86400000))
}

function deadlineColor(item: AgendaItem): string {
  if (item.numRelatorio) return 'rgba(255,255,255,0.07)'
  const d = daysUntil(item.previsaoSaida)
  if (d < 0)   return 'rgba(239,68,68,0.55)'
  if (d <= 3)  return 'rgba(251,191,36,0.55)'
  return 'rgba(34,197,94,0.4)'
}

function addBusinessDays(dateStr: string, days: number): string {
  const date = new Date((dateStr || today()) + 'T12:00:00')
  let added = 0
  while (added < days) {
    date.setDate(date.getDate() + 1)
    const dow = date.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return date.toISOString().split('T')[0]
}

function newItem(): AgendaItem {
  const entrada = today()
  return {
    id: crypto.randomUUID(),
    tipo: 'lampada',
    protocolo: '', orcamento: '', cliente: '', produto: '',
    dataEntrada: entrada,
    previsaoSaida: addBusinessDays(entrada, 10),
    dataEmissao: '', numRelatorio: '', responsavel: '',
    statusConduzida: 'pendente', statusLoop: 'pendente', statusAnexoB: 'pendente',
    observacoes: '', pdfPath: '', tags: [],
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">{children}</label>
}

/* ─── seletor de cliente ──────────────────────────────────────────────────── */
function ClientePicker({ clientes, onSelect }: {
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

/* ─── modal item único ────────────────────────────────────────────────────── */
/* ─── OCR helpers ─────────────────────────────────────────────────────────── */
interface OcrSugestao {
  produto: string; fabricante: string; modelo: string; identificador: string
  potencia: string; tensaoAlim: string; frequencia: string
}

function parsearOCR(text: string, tipo: 'lampada' | 'luminaria'): OcrSugestao {
  const t  = text.normalize('NFC')
  const tn = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const potM = t.match(/(\d+(?:[,\.]\d+)?)\s*[Ww](?=[\s,;\n\r]|$)/m)
  const potencia = potM ? potM[1].replace(',', '.') + 'W' : ''
  let tensaoAlim = ''
  const tensLabelM = tn.match(/(?:tens[aã]o|voltage|input|alimenta[cç][aã]o)\s*[:\-]?\s*([\d][^\n\r]{3,25})/)
  if (tensLabelM) {
    tensaoAlim = tensLabelM[1].trim().split(/[\n\r]/)[0].replace(/\s+/g, ' ').trim()
  } else {
    const acLines = t.split(/\r?\n/).filter(l => /V\s*AC|VAC|\bAC[~\s]/i.test(l))
    for (const line of acLines) {
      const nums = [...line.matchAll(/\b(\d{2,4})\b/g)].map(m => parseInt(m[1])).filter(v => v >= 85 && v <= 480)
      if (nums.length >= 2) { tensaoAlim = nums.join('-') + 'VAC'; break }
      if (nums.length === 1) { tensaoAlim = nums[0] + 'VAC'; break }
    }
    if (!tensaoAlim) { const tr = t.match(/\b\d{2,3}\s*[Vv]?\s*[-–~]\s*\d{2,3}\s*[Vv][Aa]?[Cc]?[~]?/m); tensaoAlim = tr ? tr[0].trim() : '' }
  }
  const freqM = t.match(/\d{2}\s*[\/\\]\s*\d{2}\s*[Hh][Zz]|\d{2,3}\s*[Hh][Zz]/m)
  const frequencia = freqM ? freqM[0].replace(/\s+/g, '') : ''
  const modeloM  = t.match(/(?:Mod(?:elo)?\.?|Model(?:o)?|M[\/\.]N\.?|MN\.?|Part(?:\.?[Nn]o)?\.?|P[\/\.]N\.?|[Tt]ipo)\s*[:\-.]?\s*([A-Z0-9][A-Z0-9\-\.\/]{2,30})/i)
  const modeloFb = t.match(/\b([A-Z]{3,6}\d{3,6}[A-Z0-9]{0,6})\b/)
  const modelo   = modeloM?.[1]?.trim().split(/[\n\r;]/)[0].trim() ?? modeloFb?.[1]?.trim() ?? ''
  const fabIdx = tn.search(/fabricante|manufacturer|marca|brand|mfr/)
  let fabricante = ''
  if (fabIdx >= 0) {
    const afterLabel = t.slice(fabIdx).match(/[^\n\r:]{3,12}:\s*([^\n\r]{2,60})/)
    if (afterLabel) fabricante = afterLabel[1].trim().replace(/[\s=|[\]]+$/, '').split(/[;\n\r]/)[0].trim()
  }
  const prodM = t.match(/(?:L[aâ]mpada|Lumin[aá]ria)[^\n\r]{0,50}/i)
  const produto = prodM?.[0]?.trim() ?? ''
  const serieMatchIdx = tn.search(/(?:serie|n[o°]?\.?\s*(?:de\s+)?serie|s\/n|sn\b|ns\b)/)
  const idSerie = serieMatchIdx >= 0 ? t.slice(serieMatchIdx).match(/[^:\-.\n\r]{0,15}[:\-.]?\s*([A-Za-z0-9]{3,20})/) : null
  const idBarras = t.match(/(?:C[oó]d(?:igo)?\s*(?:de\s*)?[Bb]arras?|EAN|GTIN)\s*[:\-]?\s*(\d{8,20})/i)
  const identificador = tipo === 'lampada'
    ? (idBarras?.[1] ?? t.match(/\b(\d{12,14})\b/m)?.[1] ?? '')
    : (idSerie?.[1]?.trim() ?? '')
  return { produto, fabricante, modelo, identificador, potencia, tensaoAlim, frequencia }
}

function toGrayscale(base64: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width; canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.filter = 'grayscale(1)'
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/jpeg', 0.97).split(',')[1])
      } catch { resolve(base64) }
    }
    img.onerror = () => resolve(base64)
    img.src = `data:image/jpeg;base64,${base64}`
  })
}

function ItemModal({ item, isNew, onSave, onClose, clientes, customTags, onCustomTagsChange }: {
  item: AgendaItem; isNew: boolean; onSave: (i: AgendaItem) => void; onClose: () => void
  clientes: ClienteDB[]
  customTags: CustomTag[]
  onCustomTagsChange: (tags: CustomTag[]) => void
}) {
  const [form, setForm] = useState<AgendaItem>({
    fabricante: '', modelo: '', identificador: '', potencia: '', tensaoAlim: '', frequencia: '60Hz',
    clienteRua: '', clienteCidade: '', clienteCep: '', documentacao: '', tags: [],
    entreguePorLum: '', recebidoPorEmc: '', devolvidoPorEmc: '', recebidoPorLum: '', dataDevolucao: '',
    ...item,
  })

  // Cadeia de custódia: um campo já registrado (preenchido e salvo) não pode mais
  // ser alterado. Vale para os nomes e para as datas de entrega/devolução.
  // Em item novo nada trava — trava só a partir da próxima abertura (edição).
  const isLocked = (k: keyof AgendaItem) => !isNew && String(item[k] ?? '').trim() !== ''
  function campoTravavel(k: keyof AgendaItem, type: 'text' | 'date', placeholder?: string) {
    if (isLocked(k)) {
      return (
        <div className="relative">
          <input type={type} className="input pr-7 cursor-not-allowed text-white/70"
            value={(form[k] as string) ?? ''} readOnly tabIndex={-1}
            title="Registrado — não pode ser alterado" />
          <Lock size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30" />
        </div>
      )
    }
    return <input type={type} className="input" value={(form[k] as string) ?? ''} onChange={s(k)} placeholder={placeholder} />
  }
  // métrica: tempo de preenchimento dos dados da amostra no cadastro
  const abertoEm = useRef(Date.now())
  function salvar() {
    const dur = Date.now() - abertoEm.current
    if (dur >= 4_000 && dur <= 2 * 3_600_000) {
      registrarTempo({ tipo: 'agenda', protocolo: form.protocolo, duracaoMs: dur })
    }
    onSave(form)
  }
  const [showDUT, setShowDUT] = useState(
    !!(item.fabricante || item.modelo || item.potencia || item.tensaoAlim)
  )
  const [cepStatus,      setCepStatus]      = useState<'idle'|'loading'|'ok'|'error'>('idle')
  const [ocrLoading,     setOcrLoading]     = useState(false)
  const [ocrSugestao,    setOcrSugestao]    = useState<OcrSugestao | null>(null)
  const [ocrTexto,       setOcrTexto]       = useState<string | null>(null)
  const [showTagManager, setShowTagManager] = useState(false)
  const [newTagLabel,    setNewTagLabel]    = useState('')
  const [newTagColor,    setNewTagColor]    = useState<string>(TAG_COLORS[0].id)

  const s = (k: keyof AgendaItem) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  function handleEntrada(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setForm(prev => ({
      ...prev,
      dataEntrada: v,
      previsaoSaida: prev.previsaoSaida === addBusinessDays(prev.dataEntrada, 10)
        ? addBusinessDays(v, 10)
        : prev.previsaoSaida,
    }))
  }

  function toggleTag(id: string) {
    setForm(p => {
      const tags = p.tags ?? []
      return { ...p, tags: tags.includes(id) ? tags.filter(t => t !== id) : [...tags, id] }
    })
  }

  async function handleOcr(file: File) {
    setOcrLoading(true); setOcrSugestao(null); setOcrTexto(null)
    try {
      const reader = new FileReader()
      const b64raw: string = await new Promise((res, rej) => {
        reader.onload = () => res((reader.result as string).split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      const gray = await toGrayscale(b64raw)
      let texts: string[] = []
      const api = (window as any).electronAPI
      if (api?.recognizeOcr) {
        try {
          const res = await api.recognizeOcr([{ base64: gray }])
          if (res?.ok && res.texts?.length) texts = (res.texts as string[]).filter((t: string) => t.trim())
        } catch {}
      }
      if (!texts.length) {
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker(['por', 'eng'])
        await worker.setParameters({ tessedit_pageseg_mode: '6' } as any)
        try { const { data: { text } } = await worker.recognize(`data:image/jpeg;base64,${gray}`); if (text.trim()) texts.push(text.trim()) } catch {}
        await worker.terminate()
      }
      if (!texts.length) { alert('Não foi possível extrair texto da foto.'); return }
      const allText = texts.join('\n\n')
      setOcrTexto(allText)
      const s = parsearOCR(allText, form.tipo)
      setOcrSugestao(s)
      if (!Object.values(s).some(v => v)) alert('OCR não encontrou campos reconhecíveis. Texto bruto disponível abaixo.')
    } catch (e: any) {
      alert('Erro no OCR: ' + e.message)
    } finally {
      setOcrLoading(false)
    }
  }

  function aplicarOcr(campo: keyof OcrSugestao) {
    if (!ocrSugestao) return
    setForm(p => ({ ...p, [campo]: ocrSugestao[campo] }))
  }

  async function handleCep(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
    setForm(prev => ({ ...prev, clienteCep: formatted }))
    if (digits.length < 8) { setCepStatus('idle'); return }
    setCepStatus('loading')
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(prev => ({ ...prev, clienteCep: formatted, clienteCidade: `${data.localidade} - ${data.uf}` }))
        setCepStatus('ok')
      } else { setCepStatus('error') }
    } catch { setCepStatus('error') }
  }

  const tags = form.tags ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-fade-in">

        <div className="flex items-center justify-between">
          <p className="text-white font-bold text-sm">{item.protocolo ? 'Editar Item' : 'Novo Item'}</p>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tipo */}
        <div className="grid grid-cols-2 gap-3">
          {(['lampada', 'luminaria'] as const).map(t => (
            <button key={t} type="button" onClick={() => setForm(p => ({ ...p, tipo: t }))}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                form.tipo === t ? 'border-gold/40 bg-gold/8 text-gold' : 'border-white/8 text-white/40 hover:border-white/20',
              )}>
              {t === 'lampada' ? <Lightbulb size={15} /> : <Lamp size={15} />}
              {t === 'lampada' ? 'Lâmpada' : 'Luminária'}
            </button>
          ))}
        </div>

        {/* Protocolo / Orçamento / Datas */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Protocolo LABELO</Label>
            <input className="input" value={form.protocolo} onChange={s('protocolo')} placeholder="Protocolo" inputMode="numeric" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Orçamento LABELO</Label>
            <input className="input" value={form.orcamento} onChange={s('orcamento')} placeholder="Ex: 0887" inputMode="numeric" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Data de Entrada {isLocked('dataEntrada') && <span className="normal-case text-white/20">(registrada)</span>}</Label>
            {isLocked('dataEntrada') ? (
              <div className="relative">
                <input type="date" className="input pr-7 cursor-not-allowed text-white/70"
                  value={form.dataEntrada} readOnly tabIndex={-1} title="Registrado — não pode ser alterado" />
                <Lock size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30" />
              </div>
            ) : (
              <input type="date" className="input" value={form.dataEntrada} onChange={handleEntrada} />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Previsão de Saída</Label>
            <div className="flex gap-2">
              <input type="date"
                className={cn('input flex-1', form.previsaoSaida && form.dataEntrada && form.previsaoSaida < form.dataEntrada && 'border-red-500/50')}
                value={form.previsaoSaida} onChange={s('previsaoSaida')} />
              <button type="button" title="Recalcular: +10 dias úteis"
                onClick={() => setForm(p => ({ ...p, previsaoSaida: addBusinessDays(p.dataEntrada, 10) }))}
                className="w-9 shrink-0 rounded-lg border border-white/10 text-white/30 hover:text-teal hover:border-teal/30 flex items-center justify-center transition-all">
                <RotateCcw size={12} />
              </button>
            </div>
            {form.previsaoSaida && form.dataEntrada && form.previsaoSaida < form.dataEntrada && (
              <p className="text-[10px] text-red-400 flex items-center gap-1">
                <AlertTriangle size={9} /> Previsão anterior à data de entrada
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Responsável</Label>
            <input className="input" value={form.responsavel} onChange={s('responsavel')} placeholder="Dionata Blauth" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>N° Relatório <span className="normal-case text-white/20">(quando emitido)</span></Label>
            <input className="input" value={form.numRelatorio} onChange={s('numRelatorio')} placeholder="Ex: EMC 1244/2026" />
          </div>
        </div>

        {/* Cliente */}
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Dados do Cliente</p>
          <ClientePicker clientes={clientes} onSelect={c => setForm(p => ({
            ...p, cliente: c.nome, clienteRua: c.rua, clienteCidade: c.cidade, clienteCep: c.cep,
          }))} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label>Nome</Label>
              <input className="input" value={form.cliente} onChange={s('cliente')} placeholder="Nome do cliente" />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label>Endereço <span className="normal-case text-white/20">(opcional)</span></Label>
              <input className="input" value={form.clienteRua ?? ''} onChange={s('clienteRua')} placeholder="Rua, número" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cidade <span className="normal-case text-white/20">(opcional)</span></Label>
              <input className="input" value={form.clienteCidade ?? ''} onChange={s('clienteCidade')} placeholder="Porto Alegre" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>CEP <span className="normal-case text-white/20">(opcional)</span></Label>
              <div className="relative">
                <input
                  className={cn('input',
                    cepStatus === 'ok'    && 'border-green-500/40',
                    cepStatus === 'error' && 'border-red-500/50',
                  )}
                  value={form.clienteCep ?? ''}
                  onChange={e => handleCep(e.target.value)}
                  placeholder="00000-000"
                  inputMode="numeric"
                  maxLength={9}
                />
                {cepStatus === 'loading' && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <Loader2 size={12} className="animate-spin text-white/30" />
                  </span>
                )}
                {cepStatus === 'ok' && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <CheckCircle2 size={12} className="text-green-400" />
                  </span>
                )}
              </div>
              {cepStatus === 'error' && (
                <p className="text-[10px] text-red-400 flex items-center gap-1">
                  <AlertTriangle size={9} /> CEP não localizado
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Cadeia de Custódia (LUM ⇄ EMC) */}
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Cadeia de Custódia da Amostra</p>

          {/* Entrega: LUM → EMC (data de entrega = "Data de Entrada" acima) */}
          <div className="p-3 rounded-xl border border-white/6 bg-white/[0.015] space-y-2">
            <p className="text-[9px] text-teal/60 font-mono uppercase tracking-wider">Entrega da amostra · LUM → EMC</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Entregou <span className="normal-case text-white/20">(LUM)</span></Label>
                {campoTravavel('entreguePorLum', 'text', 'Funcionário LUM')}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Recebeu <span className="normal-case text-white/20">(EMC)</span></Label>
                {campoTravavel('recebidoPorEmc', 'text', 'Funcionário EMC')}
              </div>
            </div>
          </div>

          {/* Devolução: EMC → LUM (somente após emissão) */}
          {form.numRelatorio?.trim() ? (
            <div className="p-3 rounded-xl border border-gold/15 bg-gold/3 space-y-2">
              <p className="text-[9px] text-gold/60 font-mono uppercase tracking-wider">Devolução após emissão · EMC → LUM</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label>Data da Devolução <span className="normal-case text-white/20">(independente da emissão)</span></Label>
                  {campoTravavel('dataDevolucao', 'date')}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Entregou p/ devolver <span className="normal-case text-white/20">(EMC)</span></Label>
                  {campoTravavel('devolvidoPorEmc', 'text', 'Funcionário EMC')}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Recebeu <span className="normal-case text-white/20">(LUM)</span></Label>
                  {campoTravavel('recebidoPorLum', 'text', 'Funcionário LUM')}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-white/25 flex items-center gap-1.5 px-1">
              <Clock size={10} /> Os campos de devolução (EMC → LUM) aparecem após informar o N° do Relatório.
            </p>
          )}
          <p className="text-[9px] text-white/25 flex items-center gap-1 px-1">
            <Lock size={8} /> Datas e nomes registrados ficam bloqueados e não podem ser alterados.
          </p>
        </div>

        {/* DUT / Amostra (expansível) */}
        <div className="space-y-2">
          <button type="button" onClick={() => setShowDUT(p => !p)}
            className="flex items-center gap-2 text-[10px] text-white/40 font-mono uppercase tracking-widest hover:text-white/60 transition-colors w-full text-left">
            <ChevronDown size={11} className={cn('transition-transform', showDUT && 'rotate-180')} />
            Dados da Amostra / DUT
            <span className="text-white/20 normal-case font-normal tracking-normal">(opcional — preencha para pré-carregar o relatório)</span>
          </button>
          {showDUT && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-white/6 bg-white/[0.015]">
              <div className="flex flex-col gap-1.5 col-span-2">
                <Label>Produto / Descrição</Label>
                <input className="input" value={form.produto} onChange={s('produto')} placeholder="Ex: Luminária LED Pública 100W" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Fabricante</Label>
                <input className="input" value={form.fabricante ?? ''} onChange={s('fabricante')} placeholder="Labelo" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Modelo</Label>
                <input className="input" value={form.modelo ?? ''} onChange={s('modelo')} placeholder="Ex: LD-LED-100W" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{form.tipo === 'lampada' ? 'Código de Barras' : 'N° de Série'}</Label>
                <input className="input" value={form.identificador ?? ''} onChange={s('identificador')} placeholder="Identificador" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Potência</Label>
                <input className="input" value={form.potencia ?? ''} onChange={s('potencia')} placeholder="Ex: 100W" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tensão de Alimentação</Label>
                <input className="input" value={form.tensaoAlim ?? ''} onChange={s('tensaoAlim')} placeholder="Ex: 90 a 305 VAC" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Frequência</Label>
                <input className="input" value={form.frequencia ?? ''} onChange={s('frequencia')} placeholder="60Hz" />
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <Label>Documentação</Label>
                <input className="input" value={form.documentacao ?? ''} onChange={s('documentacao')} placeholder="embalagem com especificações" />
              </div>

              {/* OCR */}
              <div className="col-span-2 pt-1 border-t border-white/5">
                <label className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all w-fit',
                  ocrLoading
                    ? 'border-blue-400/30 bg-blue-500/8 text-blue-400 pointer-events-none'
                    : 'border-white/10 text-white/35 hover:border-teal/35 hover:text-teal/80',
                )}>
                  {ocrLoading ? <Loader2 size={11} className="animate-spin" /> : <ScanText size={11} />}
                  {ocrLoading ? 'Lendo…' : 'Ler Foto (OCR)'}
                  <input type="file" accept="image/*" className="hidden" disabled={ocrLoading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleOcr(f) }} />
                </label>

                {(ocrSugestao || ocrTexto) && (
                  <div className="mt-2 space-y-2">
                    {ocrSugestao && Object.entries(ocrSugestao).some(([, v]) => v) && (
                      <div className="p-2.5 rounded-lg border border-teal/20 bg-teal/4 space-y-1.5">
                        <p className="text-[9px] text-teal/60 font-mono uppercase tracking-wider">
                          Sugestões OCR — clique para aplicar
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(Object.entries(ocrSugestao) as [keyof OcrSugestao, string][])
                            .filter(([, v]) => v)
                            .map(([campo, valor]) => (
                              <button key={campo} type="button" onClick={() => aplicarOcr(campo)}
                                className="flex items-center gap-1 px-2 py-1 rounded border border-teal/25 bg-teal/6 text-teal/80 hover:bg-teal/15 text-[10px] font-mono transition-all">
                                <span className="text-teal/40">{campo}:</span> {valor}
                              </button>
                            ))}
                          <button type="button" onClick={() => setForm(p => {
                            const n = { ...p }
                            for (const [k, v] of Object.entries(ocrSugestao) as [keyof OcrSugestao, string][]) {
                              if (v) (n as any)[k] = v
                            }
                            return n
                          })} className="px-2 py-1 rounded border border-teal/40 bg-teal/10 text-teal text-[10px] font-mono font-semibold hover:bg-teal/20 transition-all">
                            Aplicar todos
                          </button>
                        </div>
                      </div>
                    )}
                    {ocrTexto && (
                      <details className="text-[9px] text-white/20 font-mono">
                        <summary className="cursor-pointer hover:text-white/40">Texto bruto OCR</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-all max-h-24 overflow-y-auto bg-white/3 rounded p-2">{ocrTexto}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>

              {/* Driver — só para luminária */}
              {form.tipo === 'luminaria' && (
                <div className="col-span-2 pt-2 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-white/30 font-mono uppercase tracking-widest">Acessório de Ensaio</p>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({
                        ...p,
                        temDriver: !p.temDriver,
                        driverOrcamento: p.driverOrcamento || 'Não identificado',
                        driverProtocolo: p.driverProtocolo || 'Não identificado',
                      }))}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-semibold transition-all',
                        form.temDriver
                          ? 'border-teal/40 bg-teal/10 text-teal'
                          : 'border-white/10 text-white/30 hover:border-white/25 hover:text-white/55',
                      )}>
                      {form.temDriver ? '✓ Driver ativo' : '+ Driver'}
                    </button>
                  </div>
                  {form.temDriver && (
                    <div className="grid grid-cols-2 gap-3 p-2.5 rounded-xl border border-teal/15 bg-teal/3">
                      <div className="flex flex-col gap-1.5 col-span-2">
                        <Label>Produto / Descrição</Label>
                        <input className="input" value={form.driverProduto ?? ''} onChange={s('driverProduto')} placeholder="Ex: Driver LED" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Fabricante</Label>
                        <input className="input" value={form.driverFabricante ?? ''} onChange={s('driverFabricante')} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Modelo</Label>
                        <input className="input" value={form.driverModelo ?? ''} onChange={s('driverModelo')} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Número de Série</Label>
                        <input className="input" value={form.driverIdentificador ?? ''} onChange={s('driverIdentificador')} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Potência</Label>
                        <input className="input" value={form.driverPotencia ?? ''} onChange={s('driverPotencia')} placeholder="Ex: 100W" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Tensão de Alimentação</Label>
                        <input className="input" value={form.driverTensaoAlim ?? ''} onChange={s('driverTensaoAlim')} placeholder="Ex: 90 a 305 VAC" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Frequência</Label>
                        <input className="input" value={form.driverFrequencia ?? ''} onChange={s('driverFrequencia')} placeholder="60Hz" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Orçamento LABELO</Label>
                        <input className="input" value={form.driverOrcamento ?? 'Não identificado'} onChange={s('driverOrcamento')} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Protocolo LABELO</Label>
                        <input className="input" value={form.driverProtocolo ?? 'Não identificado'} onChange={s('driverProtocolo')} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {!showDUT && (
            <input className="input" value={form.produto} onChange={s('produto')} placeholder="Produto / DUT (opcional)" />
          )}
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Marcadores</Label>
            <button type="button"
              onClick={() => setShowTagManager(p => !p)}
              className="text-[10px] text-white/30 hover:text-teal/80 font-mono transition-colors flex items-center gap-1">
              <Settings size={9} /> {showTagManager ? 'Fechar gerenciador' : 'Gerenciar'}
            </button>
          </div>

          {/* seletor de tags */}
          <div className="flex flex-wrap gap-2">
            {[...PREDEFINED_TAGS, ...customTags.map(t => {
              const color = TAG_COLORS.find(c => c.id === t.color) ?? TAG_COLORS[0]
              return { id: t.id, label: t.label, cls: color.cls }
            })].map(t => (
              <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                  tags.includes(t.id) ? t.cls + ' opacity-100' : 'border-white/8 text-white/30 hover:border-white/20',
                )}>
                <Tag size={10} /> {t.label}
              </button>
            ))}
          </div>

          {/* gerenciador inline */}
          {showTagManager && (
            <div className="p-3 rounded-xl border border-white/8 bg-white/[0.015] space-y-3">
              {/* criar nova tag */}
              <div className="space-y-2">
                <p className="text-[9px] text-white/30 font-mono uppercase tracking-widest">Nova etiqueta</p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-xs"
                    placeholder="Nome da etiqueta…"
                    value={newTagLabel}
                    onChange={e => setNewTagLabel(e.target.value)}
                    maxLength={24}
                  />
                  <button
                    type="button"
                    disabled={!newTagLabel.trim()}
                    onClick={() => {
                      const label = newTagLabel.trim()
                      if (!label) return
                      const id = 'custom_' + Date.now()
                      const updated = [...customTags, { id, label, color: newTagColor }]
                      onCustomTagsChange(updated)
                      setNewTagLabel('')
                    }}
                    className="px-3 py-1.5 rounded-lg border border-teal/30 bg-teal/8 text-teal text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-teal/16 transition-all">
                    Criar
                  </button>
                </div>
                {/* paleta de cores */}
                <div className="flex gap-1.5 flex-wrap">
                  {TAG_COLORS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewTagColor(c.id)}
                      className={cn(
                        'w-5 h-5 rounded-full border-2 transition-all',
                        newTagColor === c.id ? 'border-white/70 scale-110' : 'border-transparent',
                      )}
                      style={{ background: c.dot }}
                      title={c.id}
                    />
                  ))}
                  {/* preview */}
                  {newTagLabel.trim() && (
                    <span className={cn(
                      'inline-flex items-center rounded border font-semibold text-[10px] px-1.5 py-0.5 ml-1',
                      TAG_COLORS.find(c => c.id === newTagColor)?.cls ?? TAG_COLORS[0].cls,
                    )}>
                      {newTagLabel.trim()}
                    </span>
                  )}
                </div>
              </div>

              {/* lista de tags customizadas existentes */}
              {customTags.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] text-white/25 font-mono uppercase tracking-widest">Etiquetas criadas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customTags.map(t => {
                      const color = TAG_COLORS.find(c => c.id === t.color) ?? TAG_COLORS[0]
                      return (
                        <span key={t.id} className={cn(
                          'inline-flex items-center gap-1 rounded border font-semibold text-[10px] px-1.5 py-0.5',
                          color.cls,
                        )}>
                          {t.label}
                          <button
                            type="button"
                            onClick={() => onCustomTagsChange(customTags.filter(ct => ct.id !== t.id))}
                            className="opacity-50 hover:opacity-100 transition-opacity ml-0.5">
                            <X size={9} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status dos ensaios */}
        <div className="space-y-2">
          <Label>Status dos Ensaios</Label>
          <div className="grid grid-cols-3 gap-3">
            {(['statusConduzida', 'statusLoop', 'statusAnexoB'] as const).map((k, i) => (
              <button key={k} type="button"
                onClick={() => setForm(p => ({ ...p, [k]: p[k] === 'pendente' ? 'realizado' : p[k] === 'realizado' ? 'reprovado' : 'pendente' }))}
                className={cn(
                  'flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold transition-all',
                  form[k] === 'realizado'  ? 'border-green/30 bg-green/8 text-green-400' :
                  form[k] === 'reprovado'  ? 'border-red-500/30 bg-red-500/8 text-red-400' :
                  'border-white/10 text-white/35 hover:border-white/20',
                )}>
                {form[k] === 'realizado' ? <CheckCircle2 size={12} /> : form[k] === 'reprovado' ? <XCircle size={12} /> : <Clock size={12} />}
                {['Conduzida', 'Loop', 'Anexo B'][i]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Observações</Label>
          <textarea className="input min-h-[60px] resize-none" value={form.observacoes} onChange={s('observacoes')}
            placeholder="Anotações livres..." />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">
            Cancelar
          </button>
          <button type="button" onClick={salvar}
            className="btn-primary px-6 py-2 text-sm font-bold flex items-center gap-2">
            <CheckCircle2 size={13} /> Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── modal lote ──────────────────────────────────────────────────────────── */
interface LoteForm {
  protocolos: string
  tipo: 'lampada' | 'luminaria'
  orcamento: string
  cliente: string
  clienteRua: string
  clienteCidade: string
  clienteCep: string
  produto: string
  responsavel: string
  dataEntrada: string
  previsaoSaida: string
}

function LoteModal({ onSave, onClose, clientes, agenda }: {
  onSave: (items: AgendaItem[]) => void; onClose: () => void
  clientes: ClienteDB[]; agenda: AgendaItem[]
}) {
  const entrada = today()
  const [form, setForm] = useState<LoteForm>({
    protocolos: '',
    tipo: 'lampada',
    orcamento: '', cliente: '', clienteRua: '', clienteCidade: '', clienteCep: '',
    produto: '', responsavel: '',
    dataEntrada: entrada,
    previsaoSaida: addBusinessDays(entrada, 10),
  })
  const [respTouched, setRespTouched] = useState(false)

  const s = (k: keyof LoteForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  function handleEntrada(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setForm(p => ({
      ...p,
      dataEntrada: v,
      previsaoSaida: p.previsaoSaida === addBusinessDays(p.dataEntrada, 10)
        ? addBusinessDays(v, 10)
        : p.previsaoSaida,
    }))
  }

  const parsed = useMemo(() => {
    return form.protocolos.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
  }, [form.protocolos])

  const duplicates = useMemo(() => {
    const existing = new Set(agenda.map(a => a.protocolo?.trim().toLowerCase()).filter(Boolean))
    return new Set(parsed.filter(p => existing.has(p.trim().toLowerCase())))
  }, [parsed, agenda])

  function handleSave() {
    if (parsed.length === 0) { alert('Informe ao menos um protocolo.'); return }
    if (!form.responsavel.trim()) { setRespTouched(true); return }
    if (form.previsaoSaida && form.dataEntrada && form.previsaoSaida < form.dataEntrada) return
    const items: AgendaItem[] = parsed.map(proto => ({
      id: crypto.randomUUID(),
      tipo: form.tipo,
      protocolo: proto,
      orcamento: form.orcamento,
      cliente: form.cliente,
      clienteRua: form.clienteRua,
      clienteCidade: form.clienteCidade,
      clienteCep: form.clienteCep,
      produto: form.produto,
      dataEntrada: form.dataEntrada,
      previsaoSaida: form.previsaoSaida,
      dataEmissao: '', numRelatorio: '',
      responsavel: form.responsavel,
      statusConduzida: 'pendente', statusLoop: 'pendente', statusAnexoB: 'pendente',
      observacoes: '', pdfPath: '', tags: [],
    }))
    onSave(items)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-gold" />
            <p className="text-white font-bold text-sm">Cadastrar Lote</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Protocolos (um por linha, ou separados por vírgula)</Label>
          <textarea
            className="input min-h-[110px] resize-none font-mono text-sm"
            value={form.protocolos}
            onChange={s('protocolos')}
            placeholder={"Protocolo 1\nProtocolo 2\nProtocolo 3"}
            autoFocus
          />
          {parsed.length > 0 && (
            <p className="text-[11px] text-teal font-mono">
              {parsed.length} protocolo(s): {parsed.slice(0, 5).join(', ')}{parsed.length > 5 ? ` …+${parsed.length - 5}` : ''}
            </p>
          )}
          {duplicates.size > 0 && (
            <p className="text-[11px] text-orange-400/90 flex items-center gap-1 font-mono">
              <AlertTriangle size={9} /> {duplicates.size} já na agenda: {[...duplicates].slice(0, 3).join(', ')}{duplicates.size > 3 ? '…' : ''}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(['lampada', 'luminaria'] as const).map(t => (
            <button key={t} type="button" onClick={() => setForm(p => ({ ...p, tipo: t }))}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                form.tipo === t ? 'border-gold/40 bg-gold/8 text-gold' : 'border-white/8 text-white/40 hover:border-white/20',
              )}>
              {t === 'lampada' ? <Lightbulb size={15} /> : <Lamp size={15} />}
              {t === 'lampada' ? 'Lâmpada' : 'Luminária'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Orçamento LABELO <span className="normal-case text-white/20">(opcional)</span></Label>
            <input className="input" value={form.orcamento} onChange={s('orcamento')} placeholder="Ex: 0887" inputMode="numeric" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono flex items-center gap-1">
              Responsável pelo Preenchimento <span className="text-red-400 normal-case">*</span>
            </label>
            <input
              className={cn('input', respTouched && !form.responsavel.trim() && 'border-red-500/50')}
              value={form.responsavel}
              onChange={e => { setForm(p => ({ ...p, responsavel: e.target.value })); setRespTouched(true) }}
              onBlur={() => setRespTouched(true)}
              placeholder="Dionata Blauth"
            />
            {respTouched && !form.responsavel.trim() && (
              <p className="text-[10px] text-red-400 flex items-center gap-1">
                <AlertTriangle size={9} /> Campo obrigatório
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label>Cliente <span className="normal-case text-white/20">(opcional)</span></Label>
            <ClientePicker clientes={clientes} onSelect={c => setForm(p => ({
              ...p, cliente: c.nome, clienteRua: c.rua, clienteCidade: c.cidade, clienteCep: c.cep,
            }))} />
            <input className="input mt-1" value={form.cliente} onChange={s('cliente')} placeholder="Nome do cliente" />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label>Produto / DUT <span className="normal-case text-white/20">(opcional)</span></Label>
            <input className="input" value={form.produto} onChange={s('produto')} placeholder="Ex: Luminária LED 100W" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Data de Entrada</Label>
            <input type="date" className="input" value={form.dataEntrada} onChange={handleEntrada} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Previsão de Saída</Label>
            <div className="flex gap-2">
              <input type="date"
                className={cn('input flex-1', form.previsaoSaida && form.dataEntrada && form.previsaoSaida < form.dataEntrada && 'border-red-500/50')}
                value={form.previsaoSaida} onChange={s('previsaoSaida')} />
              <button type="button" title="Recalcular: +10 dias úteis"
                onClick={() => setForm(p => ({ ...p, previsaoSaida: addBusinessDays(p.dataEntrada, 10) }))}
                className="w-9 shrink-0 rounded-lg border border-white/10 text-white/30 hover:text-teal hover:border-teal/30 flex items-center justify-center transition-all">
                <RotateCcw size={12} />
              </button>
            </div>
            {form.previsaoSaida && form.dataEntrada && form.previsaoSaida < form.dataEntrada && (
              <p className="text-[10px] text-red-400 flex items-center gap-1">
                <AlertTriangle size={9} /> Previsão anterior à data de entrada
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">
            Cancelar
          </button>
          <button type="button" onClick={handleSave}
            className="btn-primary px-6 py-2 text-sm font-bold flex items-center gap-2">
            <Layers size={13} /> Cadastrar {parsed.length > 0 ? `${parsed.length} item(s)` : 'Lote'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── modal gerar lote ────────────────────────────────────────────────────── */
function GerarLoteModal({ agenda, onConfirm, onClose }: {
  agenda: AgendaItem[]
  onConfirm: (itens: AgendaItem[]) => void
  onClose: () => void
}) {
  const [numLote, setNumLote] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  const itensAndamento = useMemo(() => {
    const q = numLote.trim().toLowerCase()
    if (!q) return []
    return agenda.filter(a => a.orcamento?.trim().toLowerCase() === q && !a.numRelatorio)
  }, [numLote, agenda])

  // Ao encontrar itens, selecionar todos por padrão
  const prevLen = useMemo(() => itensAndamento.length, [itensAndamento])
  useEffect(() => {
    setSelecionados(new Set(itensAndamento.map(a => a.id)))
  }, [prevLen])

  function toggleItem(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleTodos() {
    if (selecionados.size === itensAndamento.length)
      setSelecionados(new Set())
    else
      setSelecionados(new Set(itensAndamento.map(a => a.id)))
  }

  const itensSelecionados = itensAndamento.filter(a => selecionados.has(a.id))

  function handleConfirm() {
    if (itensSelecionados.length === 0) return
    onConfirm(itensSelecionados)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg max-h-[90vh] flex flex-col p-6 gap-5 animate-fade-in">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ArrowRight size={15} className="text-gold" />
            <p className="text-white font-bold text-sm">Emitir Lote</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">
            Número do Lote (Orçamento LABELO)
          </label>
          <input
            className="input text-sm font-mono"
            placeholder="Ex: 0887"
            value={numLote}
            onChange={e => setNumLote(e.target.value)}
            autoFocus
          />
        </div>

        {numLote.trim() && itensAndamento.length === 0 && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/6 px-4 py-3 text-xs text-red-400/70 shrink-0">
            Nenhum item em andamento encontrado para o lote <span className="font-mono font-bold">"{numLote.trim()}"</span>.
          </div>
        )}

        {itensAndamento.length > 0 && (
          <>
            {/* cabeçalho da lista */}
            <div className="flex items-center justify-between shrink-0">
              <p className="text-[10px] text-white/35 uppercase tracking-widest font-mono">
                {itensAndamento.length} em andamento
                {' · '}
                <span className="text-teal">{selecionados.size} selecionado(s)</span>
              </p>
              <button type="button" onClick={toggleTodos}
                className="text-[10px] text-white/40 hover:text-white/70 underline transition-colors">
                {selecionados.size === itensAndamento.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>

            {/* lista com scroll */}
            <div className="overflow-y-auto flex-1 space-y-1 min-h-0">
              {itensAndamento.map(a => {
                const sel = selecionados.has(a.id)
                return (
                  <button key={a.id} type="button" onClick={() => toggleItem(a.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all',
                      sel
                        ? 'border-teal/25 bg-teal/6'
                        : 'border-white/6 bg-white/[0.015] opacity-50 hover:opacity-75',
                    )}>
                    <div className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all',
                      sel ? 'border-teal bg-teal/20' : 'border-white/20',
                    )}>
                      {sel && <CheckCircle2 size={10} className="text-teal" />}
                    </div>
                    <div className={cn('shrink-0', a.tipo === 'lampada' ? 'text-yellow-400/60' : 'text-blue-400/60')}>
                      {a.tipo === 'lampada' ? <Lightbulb size={11} /> : <Lamp size={11} />}
                    </div>
                    <span className="font-mono text-xs text-white/80 w-24 shrink-0 truncate">{a.protocolo || '—'}</span>
                    <span className="flex-1 text-xs text-white/45 truncate min-w-0">
                      {a.produto || a.cliente || '—'}
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="text-[10px] text-white/25 shrink-0">
              Tipo: {itensAndamento[0].tipo === 'lampada' ? 'Lâmpada' : 'Luminária'}
              {' · '}Cliente: {itensAndamento[0].cliente || '—'}
            </p>
          </>
        )}

        <div className="flex gap-2 justify-end shrink-0 pt-1 border-t border-white/6">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">
            Cancelar
          </button>
          <button type="button" onClick={handleConfirm}
            disabled={itensSelecionados.length === 0}
            className="btn-primary px-6 py-2 text-sm font-bold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
            <ArrowRight size={13} /> Abrir Lote ({itensSelecionados.length})
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── página principal ─────────────────────────────────────────────────────── */
export default function AgendaPage() {
  const router = useRouter()
  const [tab,           setTab]           = useState<'agenda' | 'busca' | 'analise' | 'followup'>('agenda')
  const [agenda,        setAgenda]        = useState<AgendaItem[]>([])
  const [busca,         setBusca]         = useState('')
  const [editItem,      setEditItem]      = useState<AgendaItem | null>(null)
  const [showLote,      setShowLote]      = useState(false)
  const [showGerarLote, setShowGerarLote] = useState(false)
  const [updateInfo,    setUpdateInfo]    = useState<{ version: string; installer: string } | null>(null)
  const [updating,      setUpdating]      = useState(false)
  const [filter,        setFilter]        = useState<'andamento' | 'concluidos' | 'todos'>('andamento')
  const [relatorios,    setRelatorios]    = useState<RelatorioSalvo[]>([])
  const [sortKey,       setSortKey]       = useState<'dataEntrada' | 'previsaoSaida' | 'protocolo' | 'orcamento'>('dataEntrada')
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('desc')
  const [search,        setSearch]        = useState('')
  const [filterCliente,   setFilterCliente]   = useState('')
  const [isElectron,    setIsElectron]    = useState(false)
  const [fromNetwork,   setFromNetwork]   = useState<boolean | null>(null)
  const [clientes,      setClientes]      = useState<ClienteDB[]>([])
  const [fuCliente,     setFuCliente]     = useState('')
  const [fuTipo,        setFuTipo]        = useState<'todos' | 'lampada' | 'luminaria'>('todos')
  const [fuEnsaio,      setFuEnsaio]      = useState<'todos' | 'c_pend' | 'l_pend' | 'b_pend' | 'algum_pend' | 'todos_ok'>('todos')
  const [fuPdfMode,     setFuPdfMode]     = useState<'lista' | 'cliente'>('lista')
  const [analisePeriodo, setAnalisePeriodo] = useState<'7' | '30' | '90' | '180' | 'all'>('all')
  const [customTags,     setCustomTags]     = useState<CustomTag[]>([])

  useEffect(() => {
    setIsElectron(!!(window as any).electronAPI)
    loadAgenda()
    loadRelatorios()
    loadClientes()
    try {
      const raw = localStorage.getItem(CUSTOM_TAGS_KEY)
      if (raw) {
        const tags: CustomTag[] = JSON.parse(raw)
        setCustomTags(tags)
        updateCustomTagsStore(tags)
      }
    } catch {}
    // check for updates silently (2s delay para não travar o load inicial)
    const api = (window as any).electronAPI
    if (api?.checkUpdate) {
      setTimeout(() => {
        api.checkUpdate().then((res: any) => {
          if (res?.available) setUpdateInfo({ version: res.version, installer: res.installer })
        }).catch(() => {})
      }, 2000)
    }
  }, [])

  async function loadAgenda() {
    const api = (window as any).electronAPI
    if (api) {
      try {
        const res = await api.getAgenda()
        setFromNetwork(!!res.fromNetwork)
        if (res.ok && Array.isArray(res.agenda) && res.agenda.length > 0) {
          setAgenda(res.agenda); return
        }
        // Arquivo vazio — migra localStorage para disco
        try {
          const raw = localStorage.getItem(AGENDA_KEY)
          if (raw) {
            const migrated = JSON.parse(raw)
            if (Array.isArray(migrated) && migrated.length > 0) {
              await api.saveAgenda(migrated)
              setAgenda(migrated); return
            }
          }
        } catch {}
        if (res.ok) { setAgenda([]); return }
      } catch {}
    }
    try {
      const raw = localStorage.getItem(AGENDA_KEY)
      if (raw) setAgenda(JSON.parse(raw))
    } catch {}
  }

  async function saveAgenda(items: AgendaItem[]) {
    setAgenda(items)
    const api = (window as any).electronAPI
    if (api) {
      try {
        const res = await api.saveAgenda(items)
        if (res?.ok) return
      } catch {}
    }
    localStorage.setItem(AGENDA_KEY, JSON.stringify(items))
  }

  async function loadRelatorios() {
    const api = (window as any).electronAPI
    if (api) {
      try {
        const res = await api.getRelatorios()
        if (res.ok && Array.isArray(res.relatorios)) { setRelatorios(res.relatorios); return }
      } catch {}
    }
    try {
      const raw = localStorage.getItem(RELATORIOS_KEY)
      if (raw) setRelatorios(JSON.parse(raw))
    } catch {}
  }

  async function loadClientes() {
    const api = (window as any).electronAPI
    if (api) {
      try {
        const res = await api.getClientes()
        if (res.ok && res.fromNetwork && Array.isArray(res.clientes)) { setClientes(res.clientes); return }
      } catch {}
    }
    try {
      const raw = localStorage.getItem(CLIENTES_KEY)
      if (raw) setClientes(JSON.parse(raw))
    } catch {}
  }

  function handleCustomTagsChange(tags: CustomTag[]) {
    setCustomTags(tags)
    updateCustomTagsStore(tags)
    try { localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(tags)) } catch {}
  }

  function handleSave(item: AgendaItem) {
    const exists = agenda.some(a => a.id === item.id)
    saveAgenda(exists ? agenda.map(a => a.id === item.id ? item : a) : [...agenda, item])
    setEditItem(null)
  }

  function handleSaveLote(items: AgendaItem[]) {
    saveAgenda([...agenda, ...items])
    setShowLote(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este item da agenda?')) return
    const item = agenda.find(a => a.id === id)
    saveAgenda(agenda.filter(a => a.id !== id))
    if (item?.pdfPath) {
      const api = (window as any).electronAPI
      if (api?.deletePdfCopy) await api.deletePdfCopy(item.pdfPath)
    }
  }

  function retornarParaAndamento(id: string) {
    saveAgenda(agenda.map(a => a.id !== id ? a : { ...a, numRelatorio: '', dataEmissao: '' }))
  }

  async function handleUpdate() {
    if (!updateInfo) return
    setUpdating(true)
    const api = (window as any).electronAPI
    const res = await api.installUpdate(updateInfo.installer)
    if (!res.ok) { alert('Erro ao instalar atualização: ' + res.error); setUpdating(false) }
  }

  function toggleStatus(id: string, field: 'statusConduzida' | 'statusLoop' | 'statusAnexoB') {
    saveAgenda(agenda.map(a => a.id !== id ? a : {
      ...a, [field]: a[field] === 'pendente' ? 'realizado' : a[field] === 'realizado' ? 'reprovado' : 'pendente',
    }))
  }

  function openPDF(pdfPath: string) {
    const api = (window as any).electronAPI
    if (api) api.openPath(pdfPath)
  }

  async function openPdfCopy(item: AgendaItem) {
    const api = (window as any).electronAPI
    if (!api) return
    // busca por numRelatorio primeiro (mais específico), fallback para protocolo
    const query = item.numRelatorio || item.protocolo
    if (!query) return
    const res = await api.findPdfCopy(query)
    if (res?.ok && res.filePaths?.length > 0) {
      if (res.filePaths.length === 1) {
        api.openPath(res.filePaths[0])
      } else {
        // múltiplos PDFs (original + emendas) — abre a pasta para o usuário escolher
        api.openPath(res.folder)
      }
    } else if (res?.folder) {
      api.openPath(res.folder)
    } else {
      alert('PDF não encontrado na pasta de cópias. Configure a pasta em Configurações.')
    }
  }

  function irParaProtocolo(item: AgendaItem) {
    const cfg: Cispr15Config = {
      tipo: item.tipo,
      tensaoConfig: '127_220',
      cliente: item.cliente,
      clienteRua: item.clienteRua ?? '',
      clienteCidade: item.clienteCidade ?? '',
      clienteCep: item.clienteCep ?? '',
      produto: item.produto,
      fabricante: item.fabricante ?? '',
      modelo: item.modelo ?? '',
      identificador: item.identificador ?? '',
      lacre: '',
      tensaoAlim: item.tensaoAlim ?? '',
      potencia: item.potencia ?? '',
      frequencia: item.frequencia ?? '60Hz',
      temDriver: item.temDriver,
      driverProduto: item.driverProduto,
      driverFabricante: item.driverFabricante,
      driverModelo: item.driverModelo,
      driverIdentificador: item.driverIdentificador,
      driverPotencia: item.driverPotencia,
      driverTensaoAlim: item.driverTensaoAlim,
      driverFrequencia: item.driverFrequencia,
      driverOrcamento: item.driverOrcamento,
      driverProtocolo: item.driverProtocolo,
      documentacao: item.documentacao ?? 'embalagem com especificações',
      numRelatorio: '',
      orcamento: item.orcamento,
      protocolo: item.protocolo,
      periodoInicio: today(),
      periodoFim: today(),
      dataEmissao: today(),
      responsavel: item.responsavel,
      resultadoConduzida: 'pass',
      resultadoLoop: 'pass',
      resultadoAnexoB: 'pass',
    }
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
    router.push('/cispr15')
  }

  function confirmarGerarLote(itens: AgendaItem[]) {
    const primeiro = itens[0]
    const amostras: LoteAmostra[] = itens.map(item => ({
      produto: item.produto,
      fabricante: item.fabricante ?? '',
      modelo: item.modelo ?? '',
      identificador: item.identificador ?? '',
      tensaoAlim: item.tensaoAlim ?? '',
      potencia: item.potencia ?? '',
      frequencia: item.frequencia ?? '60Hz',
      protocolo: item.protocolo,
      orcamento: item.orcamento,
      periodoInicio: today(),
      periodoFim: today(),
      dataEmissao: today(),
      conformidade: 'pendente',
      numRelatorio: '',
      photos: [],
      docxHtml: null,
      docxFilename: null,
      temDriver: item.temDriver,
      driverProduto: item.driverProduto,
      driverFabricante: item.driverFabricante,
      driverModelo: item.driverModelo,
      driverIdentificador: item.driverIdentificador,
      driverPotencia: item.driverPotencia,
      driverTensaoAlim: item.driverTensaoAlim,
      driverFrequencia: item.driverFrequencia,
      driverOrcamento: item.driverOrcamento || 'Não identificado',
      driverProtocolo: item.driverProtocolo || 'Não identificado',
    }))
    const lote: LoteConfig = {
      tipo: primeiro.tipo,
      qtd: amostras.length,
      cliente: primeiro.cliente,
      clienteRua: primeiro.clienteRua ?? '',
      clienteCidade: primeiro.clienteCidade ?? '',
      clienteCep: primeiro.clienteCep ?? '',
      responsavel: primeiro.responsavel,
      amostras,
    }
    localStorage.setItem(LOTE_KEY, JSON.stringify(lote))
    router.push('/cispr15/lote')
  }

  const clienteOptions = useMemo(
    () => [...new Set(agenda.map(a => a.cliente).filter(Boolean))].sort(),
    [agenda],
  )

  const filteredItems = useMemo(() => {
    let items = [...agenda]
    if (filter === 'andamento')   items = items.filter(a => !a.numRelatorio)
    else if (filter === 'concluidos') items = items.filter(a => !!a.numRelatorio)
    const q = search.trim().toLowerCase()
    if (q) items = items.filter(a =>
      [a.protocolo, a.orcamento, a.cliente, a.produto, a.numRelatorio, a.responsavel]
        .some(v => v?.toLowerCase().includes(q))
    )
    if (filterCliente) items = items.filter(a => a.cliente === filterCliente)
    items.sort((a, b) => {
      const va = a[sortKey] ?? ''; const vb = b[sortKey] ?? ''
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return items
  }, [agenda, filter, search, filterCliente, sortKey, sortDir])

  const counts = useMemo(() => ({
    andamento: agenda.filter(a => !a.numRelatorio).length,
    concluidos: agenda.filter(a => !!a.numRelatorio).length,
    todos: agenda.length,
  }), [agenda])

  /* ── analytics ── */
  const analytics = useMemo(() => {
    const now = today()

    // filtro de período
    const cutoff = analisePeriodo !== 'all'
      ? (() => { const d = new Date(); d.setDate(d.getDate() - Number(analisePeriodo)); return d.toISOString().split('T')[0] })()
      : null
    const base = cutoff ? agenda.filter(a => !a.dataEntrada || a.dataEntrada >= cutoff) : agenda

    const andamento = base.filter(a => !a.numRelatorio)
    const concluidos = base.filter(a => !!a.numRelatorio)
    const vencidos   = andamento.filter(a => a.previsaoSaida && a.previsaoSaida < now)
    const urgentes   = andamento.filter(a => { const d = daysUntil(a.previsaoSaida); return d >= 0 && d <= 3 })
    const emDia      = andamento.filter(a => daysUntil(a.previsaoSaida) > 3)

    // entradas por mês (últimos 6 meses)
    const months: { key: string; label: string; count: number; concluidos: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
      const key = d.toISOString().substring(0, 7)
      months.push({
        key, label: fmtMonth(key),
        count:      base.filter(a => a.dataEntrada?.startsWith(key)).length,
        concluidos: concluidos.filter(a => a.dataEmissao?.startsWith(key)).length,
      })
    }

    // top clientes
    const clientMap: Record<string, number> = {}
    base.forEach(a => { if (a.cliente) clientMap[a.cliente] = (clientMap[a.cliente] ?? 0) + 1 })
    const topClientes = Object.entries(clientMap).sort((a, b) => b[1] - a[1]).slice(0, 6)

    // contagem de tags
    const tagMap: Record<string, number> = {}
    base.forEach(a => a.tags?.forEach(t => { tagMap[t] = (tagMap[t] ?? 0) + 1 }))

    // ── KPIs de desempenho ──────────────────────────────────────────────────
    const daysBetween = (a: string, b: string) =>
      Math.max(0, Math.floor((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000))

    // Tempo médio de ensaio: entrada → emissão (dias corridos)
    const concluidosDatas = concluidos.filter(a => a.dataEntrada && a.dataEmissao)
    const temposEnsaio = concluidosDatas.map(a => daysBetween(a.dataEntrada, a.dataEmissao))
    const tempoMedioGeral = temposEnsaio.length > 0
      ? Math.round(temposEnsaio.reduce((s, v) => s + v, 0) / temposEnsaio.length) : null

    // Tempo médio por tipo
    const lampDatas = concluidosDatas.filter(a => a.tipo === 'lampada')
    const lumDatas  = concluidosDatas.filter(a => a.tipo === 'luminaria')
    const avgDias = (items: typeof concluidosDatas) =>
      items.length > 0 ? Math.round(items.reduce((s, a) => s + daysBetween(a.dataEntrada, a.dataEmissao), 0) / items.length) : null
    const tempoMedioLamp = avgDias(lampDatas)
    const tempoMedioLum  = avgDias(lumDatas)

    // Taxa de pontualidade histórica (concluídos que saíram até a previsão)
    const conclComPrev  = concluidos.filter(a => a.dataEmissao && a.previsaoSaida)
    const pontualCount  = conclComPrev.filter(a => a.dataEmissao <= a.previsaoSaida).length
    const taxaPontualidade = conclComPrev.length > 0
      ? Math.round((pontualCount / conclComPrev.length) * 100) : null

    // Taxa de atraso atual (% dos em andamento que já venceram)
    const taxaAtrasoAtual = andamento.length > 0
      ? Math.round((vencidos.length / andamento.length) * 100) : null

    // Throughput: relatórios concluídos nos últimos 90 dias → média mensal
    const dt90 = new Date(); dt90.setDate(dt90.getDate() - 90)
    const recentesConcl = concluidos.filter(a => a.dataEmissao && new Date(a.dataEmissao + 'T12:00:00') >= dt90)
    const throughput = Math.round((recentesConcl.length / 3) * 10) / 10

    // Tempo médio em aberto (dias desde entrada para itens em andamento)
    const diasAberto = andamento.filter(a => a.dataEntrada).map(a => daysBetween(a.dataEntrada, now))
    const mediaDiasAberto = diasAberto.length > 0
      ? Math.round(diasAberto.reduce((s, v) => s + v, 0) / diasAberto.length) : null

    // Backlog por responsável (em andamento)
    const respMap: Record<string, { andamento: number; vencidos: number; label: string }> = {}
    andamento.forEach(a => {
      const raw = a.responsavel?.trim() || '—'
      const key = raw.toLowerCase()
      if (!respMap[key]) respMap[key] = { andamento: 0, vencidos: 0, label: raw }
      respMap[key].andamento++
      if (a.previsaoSaida && a.previsaoSaida < now) respMap[key].vencidos++
    })
    const backlogResp = Object.entries(respMap).sort((a, b) => b[1].andamento - a[1].andamento).slice(0, 5)
    const maxBacklog  = Math.max(1, ...backlogResp.map(([, v]) => v.andamento))

    return {
      total: base.length,
      andamento: andamento.length,
      concluidos: concluidos.length,
      vencidos: vencidos.length,
      urgentes: urgentes.length,
      emDia: emDia.length,
      vencidosList: vencidos.slice(0, 6),
      urgentesList: urgentes.slice(0, 6),
      months,
      topClientes,
      tagMap,
      maxMonth: Math.max(1, ...months.map(m => m.count)),
      // KPIs
      tempoMedioGeral, tempoMedioLamp, tempoMedioLum,
      lampDatasCount: lampDatas.length, lumDatasCount: lumDatas.length,
      taxaPontualidade, pontualCount, conclComPrevCount: conclComPrev.length,
      taxaAtrasoAtual,
      throughput, recentesConclCount: recentesConcl.length,
      mediaDiasAberto,
      backlogResp, maxBacklog,
      // pizza
      lampadas: base.filter(a => a.tipo === 'lampada').length,
      luminarias: base.filter(a => a.tipo === 'luminaria').length,
    }
  }, [agenda, analisePeriodo])

  /* ── follow-up comercial ── */
  const followup = useMemo(() => {
    function stats(items: AgendaItem[]) {
      const em = items.filter(a => !a.numRelatorio)
      return {
        total: items.length,
        concluidos: items.filter(a => !!a.numRelatorio).length,
        andamento: em.length,
        conduzida: em.filter(a => a.statusConduzida === 'realizado').length,
        loop:      em.filter(a => a.statusLoop      === 'realizado').length,
        anexoB:    em.filter(a => a.statusAnexoB    === 'realizado').length,
        list: em,
      }
    }
    return {
      lampadas:   stats(agenda.filter(a => a.tipo === 'lampada')),
      luminarias: stats(agenda.filter(a => a.tipo === 'luminaria')),
    }
  }, [agenda])

  function SortBtn({ k, label }: { k: typeof sortKey; label: string }) {
    const active = sortKey === k
    return (
      <button type="button"
        onClick={() => {
          if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
          else { setSortKey(k); setSortDir('desc') }
        }}
        className={cn(
          'flex items-center gap-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors',
          active ? 'text-gold' : 'text-white/30 hover:text-white/60',
        )}>
        {label}
        {active ? (sortDir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />) : null}
      </button>
    )
  }

  const buscaResults = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return { agenda: [], relatorios: [] }
    return {
      agenda: agenda.filter(a =>
        [a.protocolo, a.orcamento, a.cliente, a.produto, a.numRelatorio, a.responsavel]
          .some(v => v?.toLowerCase().includes(q))
      ),
      relatorios: relatorios.filter(r =>
        [r.protocolo, r.numRelatorio, r.clienteNome, r.produto, r.cfg?.fabricante]
          .some(v => v?.toLowerCase().includes(q))
      ),
    }
  }, [busca, agenda, relatorios])

  /* ── stat card helper ── */
  function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
      <div className={cn('card p-4 flex flex-col gap-1', color)}>
        <span className="text-2xl font-bold font-mono">{value}</span>
        <span className="text-[10px] uppercase tracking-widest font-mono opacity-60">{label}</span>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">

      {/* Banner de atualização */}
      {(updateInfo || updating) && (
        <div className={cn(
          'flex items-center gap-3 px-4 py-2.5 rounded-xl border mb-4 animate-fade-in',
          updating ? 'bg-white/4 border-white/10' : 'bg-gold/8 border-gold/20',
        )}>
          {updating
            ? <Loader2 size={14} className="text-gold animate-spin shrink-0" />
            : <Download size={14} className="text-gold shrink-0" />}
          <div className="flex-1 min-w-0">
            {updating
              ? <span className="text-sm text-white/60">Copiando atualização — o app fechará em instantes...</span>
              : <>
                  <span className="text-sm font-semibold text-gold">Nova versão disponível — {updateInfo!.version}</span>
                  <span className="text-[11px] text-white/35 ml-2 hidden sm:inline">O app fecha e reinstala automaticamente</span>
                </>}
          </div>
          {!updating && (
            <button onClick={handleUpdate}
              className="btn-primary text-xs px-4 py-1.5 font-bold flex items-center gap-1.5 shrink-0">
              <Download size={11} /> Atualizar agora
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push('/cispr15')}
          className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm transition-colors">
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="flex-1" />
        <button onClick={() => router.push('/configuracoes')}
          className="w-8 h-8 rounded-xl border border-white/10 text-white/30 hover:text-gold hover:border-gold/30 flex items-center justify-center transition-all">
          <Settings size={14} />
        </button>
      </div>

      <div className="mb-5">
        <p className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-0.5">LABELO · PUCRS</p>
        <h1 className="text-xl font-bold text-white">Agenda de Execução</h1>
        <p className="text-white/35 text-xs mt-0.5">Acompanhamento de protocolos e ensaios</p>
      </div>

      {/* Aviso rede */}
      {isElectron && fromNetwork === false && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20 text-amber-400 text-xs mb-4">
          <AlertTriangle size={12} className="shrink-0" />
          <span>
            Pasta de rede não configurada — dados salvos apenas neste computador.{' '}
            <button onClick={() => router.push('/configuracoes')} className="underline hover:text-amber-300 transition-colors">
              Configurar agora
            </button>
          </span>
        </div>
      )}
      {isElectron && fromNetwork === true && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal/6 border border-teal/15 text-teal/70 text-[10px] font-mono mb-4">
          <Wifi size={11} className="shrink-0" /> Dados sincronizados via pasta de rede
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8 mb-4 w-fit">
        {([
          ['agenda',   'Agenda',    null],
          ['busca',    'Busca',     null],
          ['analise',  'Análise',   <BarChart2 size={11} />],
          ['followup', 'Follow-up', <TrendingUp size={11} />],
        ] as const).map(([t, label, icon]) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold transition-all',
              tab === t ? 'bg-gold/15 border border-gold/25 text-gold' : 'text-white/40 hover:text-white/70',
            )}>
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── ABA AGENDA ── */}
      {tab === 'agenda' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8">
              {([
                ['andamento',  'Em andamento', counts.andamento],
                ['concluidos', 'Concluídos',   counts.concluidos],
                ['todos',      'Todos',         counts.todos],
              ] as const).map(([f, label, count]) => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-all',
                    filter === f ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60',
                  )}>
                  {label}
                  <span className={cn('text-[9px] px-1 rounded-full font-mono', filter === f ? 'text-white/60' : 'text-white/20')}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative min-w-[160px] max-w-[220px]">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                className="input pl-7 py-1 text-xs w-full"
                placeholder="Protocolo, cliente…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  <X size={9} />
                </button>
              )}
            </div>

            {clienteOptions.length > 0 && (
              <select className="input py-1 text-xs max-w-[150px]" value={filterCliente} onChange={e => setFilterCliente(e.target.value)}>
                <option value="">Todos clientes</option>
                {clienteOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            <div className="flex items-center gap-1.5 font-mono ml-1">
              <span className="text-[9px] text-white/20 uppercase">ord</span>
              <SortBtn k="dataEntrada" label="Entrada" />
              <SortBtn k="previsaoSaida" label="Saída" />
              <SortBtn k="protocolo" label="Proto" />
              <SortBtn k="orcamento" label="Orç." />
            </div>

            <div className="flex-1" />
            <span className="text-[10px] text-white/25 font-mono">{filteredItems.length} item(s)</span>
            <button type="button" onClick={() => setShowGerarLote(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold/30 bg-gold/8 text-gold hover:bg-gold/14 text-xs font-semibold transition-all">
              <ArrowRight size={11} /> Emitir Lote
            </button>
            <button type="button" onClick={() => setShowLote(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal/30 bg-teal/8 text-teal hover:bg-teal/14 text-xs font-semibold transition-all">
              <Layers size={11} /> Cadastrar Lote
            </button>
            <button type="button" onClick={() => setEditItem(newItem())}
              className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <Plus size={11} /> Cadastrar
            </button>
          </div>

          {filter !== 'concluidos' && (
            <div className="flex items-center gap-4 text-[10px] font-mono text-white/25">
              <span className="flex items-center gap-1.5"><span className="w-2 h-3 rounded-sm inline-block" style={{ background: 'rgba(34,197,94,0.45)' }} />Em dia</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-3 rounded-sm inline-block" style={{ background: 'rgba(251,191,36,0.55)' }} />Vence em ≤ 3 dias</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-3 rounded-sm inline-block" style={{ background: 'rgba(239,68,68,0.55)' }} />Vencido</span>
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div className="card p-8 text-center text-white/25 text-sm">
              {agenda.length === 0
                ? <>Nenhum item. Clique em <strong className="text-white/40">Novo</strong> ou <strong className="text-white/40">Lote</strong>.</>
                : 'Nenhum item corresponde aos filtros.'}
            </div>
          ) : (
            <div className="space-y-px">
              {filteredItems.map(item => {
                const isConcluido = !!item.numRelatorio
                const d = daysUntil(item.previsaoSaida)
                const color = deadlineColor(item)
                const itemTags = item.tags ?? []
                return (
                  <div key={item.id}
                    style={{ borderLeftColor: color }}
                    className="flex flex-col px-3 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.07] border-l-2 hover:bg-white/[0.04] transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      {/* tipo */}
                      <div className={cn('shrink-0', item.tipo === 'lampada' ? 'text-yellow-400/60' : 'text-blue-400/60')}>
                        {item.tipo === 'lampada' ? <Lightbulb size={11} /> : <Lamp size={11} />}
                      </div>

                      {/* protocolo */}
                      <span className="font-mono font-bold text-white text-xs w-[100px] shrink-0 truncate">
                        {item.protocolo || '—'}
                      </span>

                      {/* orcamento */}
                      {item.orcamento
                        ? <span className="text-[9px] text-white/22 font-mono w-14 shrink-0 truncate">{item.orcamento}</span>
                        : <span className="w-14 shrink-0" />
                      }

                      {/* cliente · produto */}
                      <span className="flex-1 text-white/50 text-xs truncate min-w-0">
                        {item.cliente || '—'}{item.produto ? ` · ${item.produto}` : ''}
                      </span>

                      {/* datas */}
                      <div className="hidden md:flex items-center gap-1 text-[10px] font-mono shrink-0">
                        <span className="text-white/22">{fmtDate(item.dataEntrada)}</span>
                        <span className="text-white/12">→</span>
                        <span className={cn(
                          !isConcluido && d < 0  ? 'text-red-400/80' :
                          !isConcluido && d <= 3 ? 'text-amber-400/80' : 'text-white/22',
                        )}>
                          {fmtDate(item.previsaoSaida)}
                        </span>
                      </div>

                      {/* concluído: numRelatorio link | andamento: badges C/L/B */}
                      {isConcluido ? (
                        <div className="shrink-0">
                          {item.pdfPath ? (
                            <button type="button" onClick={() => openPDF(item.pdfPath!)}
                              title="Abrir PDF do relatório"
                              className="flex items-center gap-1 text-[10px] font-mono text-teal hover:text-teal/70 bg-teal/8 border border-teal/20 px-2 py-0.5 rounded transition-all">
                              <Link2 size={8} /> {item.numRelatorio}
                            </button>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-green-400/75 bg-green/8 border border-green/15 px-2 py-0.5 rounded">
                              <FileText size={8} /> {item.numRelatorio}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex gap-0.5 shrink-0">
                          {(['statusConduzida', 'statusLoop', 'statusAnexoB'] as const).map((k, i) => (
                            <button key={k} type="button" onClick={() => toggleStatus(item.id, k)}
                              title={['Conduzida', 'Loop', 'Anexo B'][i]}
                              className={cn(
                                'w-5 h-5 rounded border text-[9px] font-bold flex items-center justify-center transition-all',
                                item[k] === 'realizado' ? 'border-green/30 bg-green/10 text-green-400' :
                                item[k] === 'reprovado' ? 'border-red-500/30 bg-red-500/10 text-red-400' :
                                'border-white/10 text-white/22 hover:border-white/25 hover:text-white/50',
                              )}>
                              {['C', 'L', 'B'][i]}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* ações hover */}
                      <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isConcluido && (
                          <button type="button" onClick={() => openPdfCopy(item)}
                            title="Abrir PDF do relatório"
                            className="w-6 h-6 rounded border border-white/8 text-white/28 hover:text-teal hover:border-teal/30 flex items-center justify-center transition-all">
                            <FileSearch size={10} />
                          </button>
                        )}
                        {isConcluido && (
                          <button type="button" onClick={() => retornarParaAndamento(item.id)}
                            title="Retornar para andamento"
                            className="w-6 h-6 rounded border border-white/8 text-white/28 hover:text-amber-400 hover:border-amber-400/30 flex items-center justify-center transition-all">
                            <RotateCcw size={10} />
                          </button>
                        )}
                        <button type="button" onClick={() => irParaProtocolo(item)}
                          title="Gerar protocolo"
                          className="w-6 h-6 rounded border border-white/8 text-white/28 hover:text-teal hover:border-teal/30 flex items-center justify-center transition-all">
                          <FileText size={10} />
                        </button>
                        <button type="button" onClick={() => setEditItem(item)}
                          className="w-6 h-6 rounded border border-white/8 text-white/28 hover:text-white/70 hover:border-white/20 flex items-center justify-center transition-all">
                          <Edit2 size={10} />
                        </button>
                        <button type="button" onClick={() => handleDelete(item.id)}
                          className="w-6 h-6 rounded border border-white/8 text-white/28 hover:text-red-400 hover:border-red-400/30 flex items-center justify-center transition-all">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>

                    {/* tags */}
                    {itemTags.length > 0 && (
                      <div className="flex gap-1 mt-1 ml-5 flex-wrap">
                        {itemTags.map(t => <TagChip key={t} id={t} small />)}
                        {item.observacoes && (
                          <span className="text-[9px] text-white/22 italic ml-1 truncate max-w-xs">{item.observacoes}</span>
                        )}
                      </div>
                    )}
                    {/* observação sem tags */}
                    {itemTags.length === 0 && item.observacoes && (
                      <p className="text-[9px] text-white/22 italic mt-0.5 ml-5 truncate">{item.observacoes}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ABA BUSCA ── */}
      {tab === 'busca' && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              className="input pl-9 text-sm"
              placeholder="Protocolo, orçamento, cliente, produto, nº relatório…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              autoFocus
            />
            {busca && (
              <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                <X size={13} />
              </button>
            )}
          </div>

          {!busca && <p className="text-center text-white/25 text-sm py-10">Digite para buscar na agenda e nos relatórios emitidos.</p>}
          {busca && buscaResults.agenda.length === 0 && buscaResults.relatorios.length === 0 && (
            <p className="text-center text-white/25 text-sm py-10">Nenhum resultado para <strong className="text-white/40">"{busca}"</strong>.</p>
          )}

          {buscaResults.agenda.length > 0 && (
            <div className="space-y-px">
              <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-1">Agenda ({buscaResults.agenda.length})</p>
              {buscaResults.agenda.map(item => (
                <div key={item.id}
                  style={{ borderLeftColor: deadlineColor(item) }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.07] border-l-2 cursor-pointer hover:bg-white/[0.04] transition-all"
                  onClick={() => { setEditItem(item); setTab('agenda') }}>
                  <div className={cn('shrink-0', item.tipo === 'lampada' ? 'text-yellow-400/60' : 'text-blue-400/60')}>
                    {item.tipo === 'lampada' ? <Lightbulb size={11} /> : <Lamp size={11} />}
                  </div>
                  <span className="font-bold text-white text-xs font-mono w-[100px] shrink-0">{item.protocolo || '—'}</span>
                  <span className="flex-1 text-white/50 text-xs truncate min-w-0">{item.cliente || '—'}{item.produto ? ` · ${item.produto}` : ''}</span>
                  {item.numRelatorio && <span className="text-[10px] text-green-400/75 font-mono shrink-0">{item.numRelatorio}</span>}
                  <div className="flex gap-1 shrink-0">
                    {(item.tags ?? []).slice(0, 2).map(t => <TagChip key={t} id={t} small />)}
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    {(['statusConduzida', 'statusLoop', 'statusAnexoB'] as const).map((k, i) => (
                      <span key={k} className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center text-[8px] font-bold',
                        item[k] === 'realizado' ? 'border-green/25 bg-green/8 text-green-400' :
                        item[k] === 'reprovado' ? 'border-red-500/25 bg-red-500/8 text-red-400' :
                        'border-white/8 text-white/18',
                      )}>
                        {['C', 'L', 'B'][i]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {buscaResults.relatorios.length > 0 && (
            <div className="space-y-px">
              <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-1">Relatórios Emitidos ({buscaResults.relatorios.length})</p>
              {buscaResults.relatorios.map(rel => (
                <div key={rel.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.025] border border-white/[0.07]">
                  <FileText size={11} className="text-teal/60 shrink-0" />
                  <span className="font-bold text-white text-xs font-mono w-[100px] shrink-0">{rel.numRelatorio || '—'}</span>
                  <span className="flex-1 text-white/50 text-xs truncate min-w-0">{rel.clienteNome} · {rel.produto}</span>
                  <span className="text-[10px] text-white/25 font-mono shrink-0">{fmtDate(rel.dataEmissao)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ABA ANÁLISE ── */}
      {tab === 'analise' && (
        <div className="space-y-6">

          {/* Filtro de período */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest shrink-0">Período:</span>
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8">
              {([['7', 'Semana'], ['30', '30d'], ['90', '90d'], ['180', '180d'], ['all', 'Tudo']] as const).map(([v, lbl]) => (
                <button key={v} type="button" onClick={() => setAnalisePeriodo(v)}
                  className={cn('px-2.5 py-1 rounded text-[10px] font-semibold transition-all',
                    analisePeriodo === v ? 'bg-gold/15 border border-gold/25 text-gold' : 'text-white/35 hover:text-white/60')}>
                  {lbl}
                </button>
              ))}
            </div>
            {analisePeriodo !== 'all' && (
              <span className="text-[10px] text-white/20 font-mono">
                {analytics.total} {analytics.total === 1 ? 'item' : 'itens'} no período
              </span>
            )}
          </div>

          {/* cards de resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="card p-4 flex flex-col gap-1">
              <span className="text-2xl font-bold font-mono text-white">{analytics.total}</span>
              <span className="text-[10px] uppercase tracking-widest font-mono text-white/35">Total</span>
            </div>
            <div className="card p-4 flex flex-col gap-1">
              <span className="text-2xl font-bold font-mono text-white/70">{analytics.andamento}</span>
              <span className="text-[10px] uppercase tracking-widest font-mono text-white/35">Em andamento</span>
            </div>
            <div className="card p-4 flex flex-col gap-1 border-green/15">
              <span className="text-2xl font-bold font-mono text-green-400">{analytics.concluidos}</span>
              <span className="text-[10px] uppercase tracking-widest font-mono text-white/35">Concluídos</span>
            </div>
            <div className="card p-4 flex flex-col gap-1 border-amber-400/20">
              <span className="text-2xl font-bold font-mono text-amber-400">{analytics.urgentes}</span>
              <span className="text-[10px] uppercase tracking-widest font-mono text-white/35">Vence em 3 dias</span>
            </div>
            <div className="card p-4 flex flex-col gap-1 border-red-500/20">
              <span className="text-2xl font-bold font-mono text-red-400">{analytics.vencidos}</span>
              <span className="text-[10px] uppercase tracking-widest font-mono text-white/35">Vencidos</span>
            </div>
          </div>

          {/* ── Indicadores de Desempenho ── */}
          {analytics.total > 0 && (
            <div className="card p-4 space-y-4">
              <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Indicadores de Desempenho</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">

                {/* Tempo Médio de Ensaio */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest font-mono text-white/30">Tempo Médio</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold font-mono text-white">
                      {analytics.tempoMedioGeral ?? '—'}
                    </span>
                    {analytics.tempoMedioGeral !== null && <span className="text-[10px] text-white/40">dias</span>}
                  </div>
                  <div className="space-y-0.5">
                    {analytics.tempoMedioLamp !== null && (
                      <div className="text-[9px] text-white/30 font-mono">
                        Lâmp: <span className="text-white/50">{analytics.tempoMedioLamp}d</span>
                        <span className="text-white/20"> ({analytics.lampDatasCount})</span>
                      </div>
                    )}
                    {analytics.tempoMedioLum !== null && (
                      <div className="text-[9px] text-white/30 font-mono">
                        Lum: <span className="text-white/50">{analytics.tempoMedioLum}d</span>
                        <span className="text-white/20"> ({analytics.lumDatasCount})</span>
                      </div>
                    )}
                    {analytics.tempoMedioGeral === null && (
                      <span className="text-[9px] text-white/20 font-mono">sem dados completos</span>
                    )}
                  </div>
                </div>

                {/* Taxa de Pontualidade */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest font-mono text-white/30">Pontualidade</span>
                  <div className="flex items-baseline gap-1">
                    <span className={cn(
                      'text-2xl font-bold font-mono',
                      analytics.taxaPontualidade === null ? 'text-white/30' :
                      analytics.taxaPontualidade >= 80 ? 'text-green-400' :
                      analytics.taxaPontualidade >= 50 ? 'text-amber-400' : 'text-red-400'
                    )}>
                      {analytics.taxaPontualidade !== null ? `${analytics.taxaPontualidade}%` : '—'}
                    </span>
                  </div>
                  {analytics.conclComPrevCount > 0
                    ? <span className="text-[9px] text-white/25 font-mono">{analytics.pontualCount}/{analytics.conclComPrevCount} no prazo</span>
                    : <span className="text-[9px] text-white/20 font-mono">sem concluídos c/ previsão</span>}
                </div>

                {/* Taxa de Atraso Atual */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest font-mono text-white/30">Atraso Atual</span>
                  <div className="flex items-baseline gap-1">
                    <span className={cn(
                      'text-2xl font-bold font-mono',
                      analytics.taxaAtrasoAtual === null ? 'text-white/30' :
                      analytics.taxaAtrasoAtual === 0   ? 'text-green-400' :
                      analytics.taxaAtrasoAtual <= 20   ? 'text-amber-400' : 'text-red-400'
                    )}>
                      {analytics.taxaAtrasoAtual !== null ? `${analytics.taxaAtrasoAtual}%` : '—'}
                    </span>
                  </div>
                  {analytics.andamento > 0
                    ? <span className="text-[9px] text-white/25 font-mono">{analytics.vencidos}/{analytics.andamento} em andamento</span>
                    : <span className="text-[9px] text-white/20 font-mono">nenhum em andamento</span>}
                </div>

                {/* Throughput */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest font-mono text-white/30">Throughput</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold font-mono text-white">{analytics.throughput}</span>
                    <span className="text-[10px] text-white/40">rel/mês</span>
                  </div>
                  <span className="text-[9px] text-white/25 font-mono">{analytics.recentesConclCount} nos últimos 90d</span>
                </div>

                {/* Dias em Aberto */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest font-mono text-white/30">Dias em Aberto</span>
                  <div className="flex items-baseline gap-1">
                    <span className={cn(
                      'text-2xl font-bold font-mono',
                      analytics.mediaDiasAberto === null ? 'text-white/30' :
                      analytics.mediaDiasAberto > 60    ? 'text-red-400' :
                      analytics.mediaDiasAberto > 30    ? 'text-amber-400' : 'text-white/70'
                    )}>
                      {analytics.mediaDiasAberto ?? '—'}
                    </span>
                    {analytics.mediaDiasAberto !== null && <span className="text-[10px] text-white/40">dias</span>}
                  </div>
                  <span className="text-[9px] text-white/25 font-mono">média (em andamento)</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Gráficos de pizza ── */}
          {analytics.total > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Pizza: status */}
              <div className="card p-4 space-y-3">
                <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Distribuição — Status</p>
                <div className="flex items-center gap-4">
                  <PieChart size={88} slices={[
                    { label: 'Concluídos', value: analytics.concluidos, color: 'rgba(74,222,128,0.7)'  },
                    { label: 'Em dia',     value: analytics.emDia,      color: 'rgba(99,179,237,0.65)' },
                    { label: 'Urgente',    value: analytics.urgentes,   color: 'rgba(251,191,36,0.7)'  },
                    { label: 'Vencido',    value: analytics.vencidos,   color: 'rgba(239,68,68,0.7)'   },
                  ]} />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {[
                      { label: 'Concluídos', value: analytics.concluidos, color: 'rgba(74,222,128,0.7)'  },
                      { label: 'Em dia',     value: analytics.emDia,      color: 'rgba(99,179,237,0.65)' },
                      { label: 'Urgente',    value: analytics.urgentes,   color: 'rgba(251,191,36,0.7)'  },
                      { label: 'Vencido',    value: analytics.vencidos,   color: 'rgba(239,68,68,0.7)'   },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-[10px] text-white/45 flex-1">{s.label}</span>
                        <span className="text-[10px] font-mono text-white/50">{s.value}</span>
                        <span className="text-[9px] font-mono text-white/25 w-8 text-right">
                          {analytics.total > 0 ? Math.round(s.value / analytics.total * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pizza: tipo */}
              <div className="card p-4 space-y-3">
                <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Distribuição — Tipo</p>
                <div className="flex items-center gap-4">
                  <PieChart size={88} slices={[
                    { label: 'Lâmpadas',   value: analytics.lampadas,   color: 'rgba(251,191,36,0.7)' },
                    { label: 'Luminárias', value: analytics.luminarias, color: 'rgba(45,212,191,0.65)' },
                  ]} />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {[
                      { label: 'Lâmpadas',   value: analytics.lampadas,   color: 'rgba(251,191,36,0.7)'  },
                      { label: 'Luminárias', value: analytics.luminarias, color: 'rgba(45,212,191,0.65)' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-[10px] text-white/45 flex-1">{s.label}</span>
                        <span className="text-[10px] font-mono text-white/50">{s.value}</span>
                        <span className="text-[9px] font-mono text-white/25 w-8 text-right">
                          {analytics.total > 0 ? Math.round(s.value / analytics.total * 100) : 0}%
                        </span>
                      </div>
                    ))}
                    {analytics.concluidos > 0 && (
                      <div className="pt-2 mt-1 border-t border-white/6 space-y-1">
                        <p className="text-[9px] text-white/20 font-mono uppercase tracking-wide">Concluídos por tipo</p>
                        {[
                          { label: 'Lâmpadas',   value: analytics.lampadas   > 0 ? Math.round(analytics.lampadas   / analytics.total * analytics.concluidos) : 0 },
                          { label: 'Luminárias', value: analytics.luminarias > 0 ? Math.round(analytics.luminarias / analytics.total * analytics.concluidos) : 0 },
                        ].map(s => (
                          <div key={s.label} className="flex items-center gap-2">
                            <span className="text-[9px] text-white/30 flex-1">{s.label}</span>
                            <span className="text-[9px] font-mono text-white/35">~{s.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Distribuição de status */}
          {analytics.andamento > 0 && (
            <div className="card p-4 space-y-3">
              <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Distribuição — Em andamento</p>
              {[
                { label: 'Em dia',      value: analytics.emDia,    bg: 'rgba(34,197,94,0.5)' },
                { label: 'Urgente (≤3d)', value: analytics.urgentes, bg: 'rgba(251,191,36,0.55)' },
                { label: 'Vencido',     value: analytics.vencidos,  bg: 'rgba(239,68,68,0.55)' },
              ].map(({ label, value, bg }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-[11px] text-white/40 font-mono w-28 shrink-0 text-right">{label}</span>
                  <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${analytics.andamento > 0 ? (value / analytics.andamento) * 100 : 0}%`, background: bg }} />
                  </div>
                  <span className="text-[11px] font-mono text-white/50 w-5 text-right">{value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Entradas por mês */}
            <div className="card p-4 space-y-3">
              <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Entradas por mês (últimos 6)</p>
              <div className="space-y-2">
                {analytics.months.map(m => (
                  <div key={m.key} className="flex items-center gap-3">
                    <span className="text-[10px] text-white/35 font-mono w-12 shrink-0 text-right">{m.label}</span>
                    <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gold/50 transition-all duration-500"
                        style={{ width: `${(m.count / analytics.maxMonth) * 100}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-white/40 w-5 text-right">{m.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top clientes */}
            {analytics.topClientes.length > 0 && (
              <div className="card p-4 space-y-3">
                <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Top Clientes</p>
                <div className="space-y-2">
                  {analytics.topClientes.map(([cliente, count]) => (
                    <div key={cliente} className="flex items-center gap-3">
                      <span className="text-[10px] text-white/45 truncate flex-1">{cliente}</span>
                      <div className="w-24 h-2.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-teal/50 transition-all duration-500"
                          style={{ width: `${(count / (analytics.topClientes[0]?.[1] ?? 1)) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-white/40 w-5 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Backlog por Responsável */}
          {analytics.backlogResp.length > 0 && (
            <div className="card p-4 space-y-3">
              <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Backlog por Responsável — Em andamento</p>
              <div className="space-y-2">
                {analytics.backlogResp.map(([resp, { andamento: cnt, vencidos: venc, label }]) => (
                  <div key={resp} className="flex items-center gap-3">
                    <span className="text-[11px] text-white/45 font-mono w-36 shrink-0 truncate">{label}</span>
                    <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(cnt / analytics.maxBacklog) * 100}%`,
                          background: venc > 0 ? 'rgba(239,68,68,0.5)' : 'rgba(99,179,237,0.5)',
                        }} />
                    </div>
                    <span className="text-[11px] font-mono text-white/50 w-5 text-right">{cnt}</span>
                    {venc > 0 && (
                      <span className="text-[10px] font-mono text-red-400/70 w-20 text-right shrink-0">
                        {venc} vencido{venc > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Atenção: vencidos + urgentes */}
          {(analytics.vencidosList.length > 0 || analytics.urgentesList.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {analytics.vencidosList.length > 0 && (
                <div className="card p-4 space-y-2 border-red-500/20">
                  <p className="text-[10px] text-red-400/70 font-mono uppercase tracking-widest flex items-center gap-1.5">
                    <AlertTriangle size={10} /> Vencidos ({analytics.vencidosList.length})
                  </p>
                  {analytics.vencidosList.map(item => (
                    <div key={item.id} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => { setEditItem(item); setTab('agenda') }}>
                      <span className="font-mono text-xs text-white/70">{item.protocolo || '—'}</span>
                      <span className="text-[10px] text-white/35 truncate flex-1">{item.cliente}</span>
                      <span className="text-[10px] text-red-400 font-mono shrink-0">{fmtDate(item.previsaoSaida)}</span>
                    </div>
                  ))}
                </div>
              )}
              {analytics.urgentesList.length > 0 && (
                <div className="card p-4 space-y-2 border-amber-400/20">
                  <p className="text-[10px] text-amber-400/70 font-mono uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={10} /> Vence em ≤ 3 dias ({analytics.urgentesList.length})
                  </p>
                  {analytics.urgentesList.map(item => (
                    <div key={item.id} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => { setEditItem(item); setTab('agenda') }}>
                      <span className="font-mono text-xs text-white/70">{item.protocolo || '—'}</span>
                      <span className="text-[10px] text-white/35 truncate flex-1">{item.cliente}</span>
                      <span className="text-[10px] text-amber-400 font-mono shrink-0">{fmtDate(item.previsaoSaida)} ({daysUntil(item.previsaoSaida)}d)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tags usadas */}
          {Object.keys(analytics.tagMap).length > 0 && (
            <div className="card p-4 space-y-3">
              <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Marcadores em uso</p>
              <div className="flex flex-wrap gap-2">
                {PREDEFINED_TAGS.filter(t => analytics.tagMap[t.id] > 0).map(t => (
                  <div key={t.id} className="flex items-center gap-2">
                    <TagChip id={t.id} />
                    <span className="text-[11px] text-white/40 font-mono">{analytics.tagMap[t.id]}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analytics.total === 0 && (
            <div className="card p-10 text-center text-white/25 text-sm">
              Nenhum dado na agenda para analisar.
            </div>
          )}
        </div>
      )}

      {/* ── ABA FOLLOW-UP ── */}
      {tab === 'followup' && (() => {
        const allEmBase = [...followup.lampadas.list, ...followup.luminarias.list]
          .sort((a, b) => (a.previsaoSaida || '').localeCompare(b.previsaoSaida || ''))

        const clientesEm = Array.from(new Set(allEmBase.map(a => a.cliente).filter(Boolean))).sort()

        // Stats filtradas por cliente (ou globais se nenhum selecionado)
        function statsFiltered(tipo: 'lampada' | 'luminaria') {
          const items = fuCliente
            ? agenda.filter(a => a.tipo === tipo && a.cliente === fuCliente)
            : agenda.filter(a => a.tipo === tipo)
          const em = items.filter(a => !a.numRelatorio)
          return {
            total: items.length,
            concluidos: items.filter(a => !!a.numRelatorio).length,
            andamento: em.length,
            conduzida: em.filter(a => a.statusConduzida === 'realizado').length,
            loop:      em.filter(a => a.statusLoop      === 'realizado').length,
            anexoB:    em.filter(a => a.statusAnexoB    === 'realizado').length,
            list: em,
          }
        }
        const displayLamp = statsFiltered('lampada')
        const displayLum  = statsFiltered('luminaria')

        const allEm = allEmBase
          .filter(a => fuTipo === 'todos' || a.tipo === fuTipo)
          .filter(a => !fuCliente || a.cliente === fuCliente)
          .filter(a => {
            if (fuEnsaio === 'c_pend')    return a.statusConduzida === 'pendente'
            if (fuEnsaio === 'l_pend')    return a.statusLoop      === 'pendente'
            if (fuEnsaio === 'b_pend')    return a.statusAnexoB    === 'pendente'
            if (fuEnsaio === 'algum_pend') return a.statusConduzida === 'pendente' || a.statusLoop === 'pendente' || a.statusAnexoB === 'pendente'
            if (fuEnsaio === 'todos_ok')  return a.statusConduzida === 'realizado' && a.statusLoop === 'realizado' && a.statusAnexoB === 'realizado'
            return true
          })

        const dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

        function buildReportHtml(landscape: boolean): string {
          const pct = (done: number, total: number) =>
            total > 0 ? Math.round((done / total) * 100) : 0

          const filterLabel = [
            fuTipo !== 'todos' ? (fuTipo === 'lampada' ? 'Lâmpadas' : 'Luminárias') : '',
            fuCliente || '',
            fuEnsaio !== 'todos' ? ({
              c_pend: 'Conduzida pendente', l_pend: 'Loop pendente', b_pend: 'Anexo B pendente',
              algum_pend: 'Algum ensaio pendente', todos_ok: 'Aguardando Emissão',
            } as Record<string, string>)[fuEnsaio] ?? '' : '',
          ].filter(Boolean).join(' · ')

          function summaryCard(label: string, stats: typeof followup.lampadas): string {
            const cp = pct(stats.conduzida, stats.andamento)
            const lp = pct(stats.loop,      stats.andamento)
            const bp = pct(stats.anexoB,    stats.andamento)
            const bar = (name: string, p: number, done: number) =>
              `<div class="prog-row">
                <div class="prog-label"><span>${name}</span><span>${done}/${stats.andamento} — ${p}%</span></div>
                <div class="prog-bg"><div class="prog-fill" style="width:${p}%;background:${p === 100 ? '#16a34a' : '#4ade80'}"></div></div>
              </div>`
            return `<div class="sum-card">
              <div class="sum-title">${label}</div>
              <div class="sum-row"><span>Total</span><span class="val">${stats.total}</span></div>
              <div class="sum-row"><span>Em andamento</span><span class="val" style="color:#b45309">${stats.andamento}</span></div>
              <div class="sum-row"><span>Concluídos</span><span class="val" style="color:#16a34a">${stats.concluidos}</span></div>
              ${stats.andamento > 0 ? `<div class="prog-wrap">${bar('Conduzida', cp, stats.conduzida)}${bar('Loop', lp, stats.loop)}${bar('Anexo B', bp, stats.anexoB)}</div>` : ''}
            </div>`
          }

          const s = (v: string) =>
            v === 'realizado' ? '<span class="ok">&#10003;</span>' :
            v === 'reprovado' ? '<span class="fail">&#10007;</span>' :
            '<span class="pend">&#9675;</span>'

          function prazoCell(item: AgendaItem): string {
            const d = daysUntil(item.previsaoSaida)
            const pc = d < 0 ? 'prazo-late' : d <= 3 ? 'prazo-warn' : ''
            const allOk = item.statusConduzida === 'realizado' && item.statusLoop === 'realizado' && item.statusAnexoB === 'realizado'
            const badge = d < 0
              ? `<span class="prazo-badge late">${d}d</span>`
              : d <= 3
                ? `<span class="prazo-badge warn">+${d}d</span>`
                : `<span class="prazo-badge ok2">+${d}d</span>`
            return `<td class="r ${pc}">
              ${fmtDate(item.previsaoSaida)} ${badge}
              ${allOk ? '<div style="font-size:8px;color:#16a34a;font-weight:bold;letter-spacing:.04em">AG. EMISSÃO</div>' : ''}
            </td>`
          }

          function labCell(item: AgendaItem): string {
            const d = diasNoLab(item.dataEntrada)
            return `<td class="r lab-col">${d}d</td>`
          }

          // Alerta de itens atrasados
          const atrasados = allEm.filter(a => daysUntil(a.previsaoSaida) < 0)
          const alertaHtml = atrasados.length > 0 ? `
<div class="alerta">
  <span class="alerta-icon">&#9888;</span>
  <strong>${atrasados.length} ${atrasados.length === 1 ? 'item atrasado' : 'itens atrasados'}:</strong>
  ${atrasados.map(a => `<span class="alerta-item">${a.protocolo || a.produto || '—'} (${a.cliente || '—'}, ${Math.abs(daysUntil(a.previsaoSaida))}d em atraso)</span>`).join('')}
</div>` : ''

          const tableHeader = `<thead><tr>
            <th>Tipo</th><th>Protocolo</th><th>Cliente</th><th>Produto</th>
            <th class="c">Conduzida</th><th class="c">Loop</th><th class="c">Anexo B</th>
            <th class="r">No lab</th><th class="r">Previsão / Prazo</th>
          </tr></thead>`

          function itemRow(item: AgendaItem, i: number): string {
            return `<tr class="${i % 2 === 1 ? 'alt' : ''}">
              <td class="tipo">${item.tipo === 'lampada' ? 'Lâmpada' : 'Luminária'}</td>
              <td class="mono">${item.protocolo || '—'}</td>
              <td>${item.cliente || '—'}</td>
              <td>${item.produto || '—'}</td>
              <td class="c">${s(item.statusConduzida)}</td>
              <td class="c">${s(item.statusLoop)}</td>
              <td class="c">${s(item.statusAnexoB)}</td>
              ${labCell(item)}
              ${prazoCell(item)}
            </tr>`
          }

          // Modo: lista ou agrupado por cliente
          let tableHtml = ''
          if (allEm.length === 0) {
            tableHtml = '<p style="color:#999;padding:24px 0;text-align:center">Nenhum item em andamento.</p>'
          } else if (fuPdfMode === 'cliente') {
            const grupos = Array.from(new Set(allEm.map(a => a.cliente || '—'))).sort()
            tableHtml = grupos.map(cliente => {
              const itens = allEm.filter(a => (a.cliente || '—') === cliente)
              const rows = itens.map((item, i) => itemRow(item, i)).join('')
              return `<div class="grupo-cliente">
                <div class="grupo-title">${cliente} <span class="grupo-count">${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</span></div>
                <table>${tableHeader}<tbody>${rows}</tbody></table>
              </div>`
            }).join('')
          } else {
            const rows = allEm.map((item, i) => itemRow(item, i)).join('')
            tableHtml = `<div class="sec-title">Em andamento — ${allEm.length} ${allEm.length === 1 ? 'item' : 'itens'}</div>
              <table>${tableHeader}<tbody>${rows}</tbody></table>`
          }

          const now = new Date().toLocaleString('pt-BR')
          const NAVY = '#1F3864'

          return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Follow-up CISPR 15 — LABELO PUCRS</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1a1a1a;background:#fff;padding:28px 32px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid ${NAVY};padding-bottom:14px;margin-bottom:20px}
.hdr h1{font-size:15px;font-weight:bold;color:${NAVY}}
.hdr .sub{font-size:10px;color:#666;margin-top:3px}
.hdr-right{text-align:right}
.hdr-right .lab{font-size:11px;font-weight:bold;color:${NAVY}}
.hdr-right .dt{font-size:10px;color:#888;margin-top:3px}
.filter-badge{display:inline-block;margin-bottom:16px;background:#f0f4ff;border:1px solid #bdd7ee;border-radius:4px;padding:4px 10px;font-size:10px;color:${NAVY}}
.summary{display:flex;gap:14px;margin-bottom:22px}
.sum-card{flex:1;border:1px solid #ddd;border-radius:6px;padding:14px}
.sum-title{font-size:10px;font-weight:bold;color:${NAVY};text-transform:uppercase;letter-spacing:.06em;margin-bottom:9px}
.sum-row{display:flex;justify-content:space-between;padding:2px 0;font-size:11px}
.val{font-weight:bold;font-family:monospace}
.prog-wrap{margin-top:10px;border-top:1px solid #eee;padding-top:8px}
.prog-row{margin-bottom:5px}
.prog-label{display:flex;justify-content:space-between;font-size:10px;color:#666;margin-bottom:3px}
.prog-bg{background:#e5e7eb;border-radius:3px;height:7px;overflow:hidden}
.prog-fill{height:100%;border-radius:3px}
.sec-title{font-size:10px;font-weight:bold;color:${NAVY};text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.alerta{background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:10px;color:#b91c1c;display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}
.alerta-icon{font-size:13px;margin-right:4px}
.alerta-item{background:#fee2e2;border-radius:3px;padding:1px 6px;white-space:nowrap}
.grupo-cliente{margin-bottom:20px}
.grupo-title{font-size:11px;font-weight:bold;color:${NAVY};border-bottom:1px solid ${NAVY};padding-bottom:5px;margin-bottom:8px}
.grupo-count{font-size:10px;font-weight:normal;color:#666;margin-left:6px}
table{width:100%;border-collapse:collapse;font-size:11px}
thead tr{background:${NAVY}}
thead th{color:#fff;text-align:left;padding:7px 10px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
tbody tr{border-bottom:1px solid #e9ecef}
tbody tr.alt{background:#f8f9fa}
tbody td{padding:6px 10px;vertical-align:middle}
td.mono{font-family:monospace;font-size:10px;color:#555}
td.tipo{font-size:10px;color:#555;white-space:nowrap}
td.lab-col{font-family:monospace;font-size:10px;color:#888;text-align:right;white-space:nowrap}
.c{text-align:center}
.r{text-align:right;font-family:monospace;font-size:10px}
.ok{color:#16a34a;font-weight:bold;font-size:13px}
.fail{color:#dc2626;font-weight:bold;font-size:13px}
.pend{color:#ccc}
.prazo-badge{display:inline-block;border-radius:3px;padding:0 4px;font-size:9px;font-weight:bold;margin-left:3px;font-family:monospace}
.prazo-badge.late{background:#fee2e2;color:#dc2626}
.prazo-badge.warn{background:#fef3c7;color:#d97706}
.prazo-badge.ok2{background:#f0fdf4;color:#16a34a}
.prazo-warn{color:#d97706;font-weight:bold}
.prazo-late{color:#dc2626;font-weight:bold}
.footer{margin-top:28px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#aaa}
@media print{body{padding:0}@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:10mm 12mm}}
</style></head>
<body>
<div class="hdr">
  <div><h1>Situação dos Ensaios — Follow-up</h1><div class="sub">CISPR 15 · EMC · Equipamentos de Iluminação</div></div>
  <div class="hdr-right"><div class="lab">LABELO · PUCRS</div><div class="dt">${dateLabel}</div></div>
</div>
${filterLabel ? `<div class="filter-badge">Filtro: ${filterLabel}</div>` : ''}
<div class="summary">${summaryCard('Lâmpadas', displayLamp)}${summaryCard('Luminárias', displayLum)}</div>
${alertaHtml}
${tableHtml}
<div class="footer"><span>Gerado em ${now}</span><span>Documento interno · LABELO PUCRS · Confidencial</span></div>
</body></html>`
        }

        function handlePrint() {
          const landscape = allEm.length > 0
          const isoDate = new Date().toISOString().split('T')[0]
          const tipoLabel = fuTipo === 'lampada' ? 'Lâmpadas' : fuTipo === 'luminaria' ? 'Luminárias' : ''
          const clienteLabel = fuCliente ? fuCliente.slice(0, 30).replace(/[/\\:"*?<>|]/g, '') : ''
          const modeLabel = fuPdfMode === 'cliente' ? 'PorCliente' : ''
          const filename = ['Follow-up', tipoLabel, clienteLabel || 'Geral', modeLabel, isoDate]
            .filter(Boolean).join(' ') + '.pdf'
          const html = buildReportHtml(landscape)

          const api = (window as any).electronAPI
          if (api?.saveFollowupPdf) {
            api.saveFollowupPdf(html, filename, landscape)
              .then((res: any) => { if (!res.ok) alert('Erro ao gerar PDF: ' + res.error) })
            return
          }

          // fallback: nova janela + window.print()
          const win = window.open('', '_blank')
          if (!win) return
          win.document.write(html)
          win.document.close()
          setTimeout(() => {
            win.print()
            win.addEventListener('afterprint', () => win.close(), { once: true })
          }, 400)
        }

        function EnsaioBar({ done, total, label }: { done: number; total: number; label: string }) {
          const pct = total > 0 ? (done / total) * 100 : 0
          const all = done === total && total > 0
          return (
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/40 font-mono w-20 text-right shrink-0">{label}</span>
              <div className="bar-bg flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                <div className="bar-fill h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: all ? 'rgba(74,222,128,0.7)' : 'rgba(74,222,128,0.45)' }} />
              </div>
              <span className={cn('text-[11px] font-mono w-10 text-right shrink-0', all ? 'text-green-400' : 'text-white/40')}>
                {done}/{total}
              </span>
            </div>
          )
        }

        function TypeCard({ label, icon, stats }: { label: string; icon: React.ReactNode; stats: typeof followup.lampadas }) {
          return (
            <div className="card p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">{icon}<span className="text-sm font-bold text-white">{label}</span></div>
                <div className="flex gap-3 text-[11px] font-mono">
                  <span className="text-white/35">{stats.total} total</span>
                  <span className="text-gold/80">{stats.andamento} andamento</span>
                  <span className="text-green-400">{stats.concluidos} concluídos</span>
                </div>
              </div>
              {stats.andamento > 0 ? (
                <div className="space-y-2">
                  <EnsaioBar label="Conduzida" done={stats.conduzida} total={stats.andamento} />
                  <EnsaioBar label="Loop"      done={stats.loop}      total={stats.andamento} />
                  <EnsaioBar label="Anexo B"   done={stats.anexoB}    total={stats.andamento} />
                </div>
              ) : (
                <p className="text-[11px] text-white/25 text-center py-3">Nenhum em andamento</p>
              )}
            </div>
          )
        }

        return (
          <div id="fu-print-area" className="space-y-5">
            {/* Cabeçalho + ações */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-gold" /> Situação dos Ensaios — Follow-up Comercial
                </p>
                <p className="text-[10px] text-white/30 font-mono mt-0.5">{dateLabel}</p>
              </div>
              <div data-noprint className="flex items-center gap-2">
                {/* Toggle modo PDF */}
                <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8">
                  {([['lista','Lista'],['cliente','Por cliente']] as const).map(([v, lbl]) => (
                    <button key={v} type="button" onClick={() => setFuPdfMode(v)}
                      className={cn('px-2.5 py-1 rounded text-[10px] font-semibold transition-all',
                        fuPdfMode === v ? 'bg-gold/15 border border-gold/25 text-gold' : 'text-white/35 hover:text-white/60')}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:bg-white/8 text-xs font-semibold transition-all">
                  <Printer size={12} /> Imprimir
                </button>
              </div>
            </div>

            {/* Cards por tipo */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TypeCard label="Lâmpadas"  icon={<Lightbulb size={15} className="text-amber-400" />} stats={displayLamp} />
              <TypeCard label="Luminárias" icon={<Lamp size={15} className="text-teal-400" />}      stats={displayLum} />
            </div>

            {/* Banner de alertas de prazo */}
            {(() => {
              const atrasados = allEmBase.filter(a => daysUntil(a.previsaoSaida) < 0)
              const urgentes  = allEmBase.filter(a => { const d = daysUntil(a.previsaoSaida); return d >= 0 && d <= 3 })
              if (atrasados.length === 0 && urgentes.length === 0) return null
              return (
                <div className="flex gap-2 flex-wrap">
                  {atrasados.length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                      <AlertTriangle size={11} className="shrink-0" />
                      <span><b>{atrasados.length}</b> {atrasados.length === 1 ? 'item atrasado' : 'itens atrasados'}</span>
                    </div>
                  )}
                  {urgentes.length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                      <AlertTriangle size={11} className="shrink-0" />
                      <span><b>{urgentes.length}</b> {urgentes.length === 1 ? 'item' : 'itens'} vence{urgentes.length === 1 ? '' : 'm'} em ≤ 3 dias</span>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Filtros */}
            {allEmBase.length > 0 && (
              <div data-noprint className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest shrink-0">Filtrar:</span>

                {/* Filtro tipo */}
                <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8">
                  {([['todos','Todos'],['lampada','Lâmpadas'],['luminaria','Luminárias']] as const).map(([v, lbl]) => (
                    <button key={v} type="button" onClick={() => setFuTipo(v)}
                      className={cn('px-2.5 py-1 rounded text-[10px] font-semibold transition-all',
                        fuTipo === v ? 'bg-gold/15 border border-gold/25 text-gold' : 'text-white/35 hover:text-white/60')}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {/* Filtro cliente */}
                <select value={fuCliente} onChange={e => setFuCliente(e.target.value)}
                  className="input text-xs py-1 pr-6 h-7 min-w-0 w-auto max-w-[180px]">
                  <option value="">Todos os clientes</option>
                  {clientesEm.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Filtro ensaio */}
                <select value={fuEnsaio} onChange={e => setFuEnsaio(e.target.value as typeof fuEnsaio)}
                  className="input text-xs py-1 pr-6 h-7 min-w-0 w-auto max-w-[200px]">
                  <option value="todos">Todos os ensaios</option>
                  <option value="c_pend">Conduzida pendente</option>
                  <option value="l_pend">Loop pendente</option>
                  <option value="b_pend">Anexo B pendente</option>
                  <option value="algum_pend">Algum ensaio pendente</option>
                  <option value="todos_ok">Aguardando Emissão</option>
                </select>

                {(fuCliente || fuTipo !== 'todos' || fuEnsaio !== 'todos') && (
                  <button type="button" onClick={() => { setFuCliente(''); setFuTipo('todos'); setFuEnsaio('todos') }}
                    className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors">
                    <X size={10} /> Limpar filtros
                  </button>
                )}

                <span className="text-[10px] text-white/25 font-mono ml-auto">
                  {allEm.length} de {allEmBase.length} itens
                </span>
              </div>
            )}

            {/* Tabela detalhada */}
            {allEm.length > 0 ? (
              <div className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/6 flex items-center justify-between">
                  <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">
                    Em andamento — {allEm.length} {allEm.length === 1 ? 'item' : 'itens'}
                  </p>
                  <div className="flex items-center gap-3 text-[9px] text-white/25 font-mono uppercase">
                    <span className="flex items-center gap-1"><CheckCircle2 size={9} className="text-green-400" /> Realizado</span>
                    <span>○ Pendente</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        {['', 'Protocolo', 'Cliente', 'Produto', 'Conduzida', 'Loop', 'Anexo B', 'No lab', 'Previsão'].map(h => (
                          <th key={h} className={cn(
                            'py-2 px-3 text-[10px] text-white/25 font-mono font-normal',
                            ['Conduzida','Loop','Anexo B'].includes(h) ? 'text-center' : ['No lab','Previsão'].includes(h) ? 'text-right' : 'text-left',
                          )}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allEm.map((item, i) => {
                        const d = daysUntil(item.previsaoSaida)
                        const prazoColor = d < 0 ? 'text-red-400' : d <= 3 ? 'text-amber-400' : 'text-white/35'
                        const allOk = item.statusConduzida === 'realizado' && item.statusLoop === 'realizado' && item.statusAnexoB === 'realizado'
                        const noLab = diasNoLab(item.dataEntrada)
                        return (
                          <tr key={item.id}
                            className={cn('border-b border-white/4 hover:bg-white/3 cursor-pointer transition-colors', i % 2 === 1 && 'bg-white/1')}
                            onClick={() => { setEditItem(item); setTab('agenda') }}>
                            <td className="px-3 py-2">
                              {item.tipo === 'lampada'
                                ? <Lightbulb size={11} className="text-amber-400/70" />
                                : <Lamp      size={11} className="text-teal-400/70" />}
                            </td>
                            <td className="px-3 py-2 font-mono text-white/70 whitespace-nowrap">{item.protocolo || '—'}</td>
                            <td className="px-3 py-2 text-white/50 max-w-[130px] truncate">{item.cliente || '—'}</td>
                            <td className="px-3 py-2 text-white/40 max-w-[130px] truncate">{item.produto || '—'}</td>
                            {([
                              item.statusConduzida,
                              item.statusLoop,
                              item.statusAnexoB,
                            ] as const).map((s, j) => (
                              <td key={j} className="px-3 py-2 text-center">
                                {s === 'realizado' ? <CheckCircle2 size={12} className="text-green-400 mx-auto" /> :
                                 s === 'reprovado' ? <XCircle size={12} className="text-red-400 mx-auto" /> :
                                 <span className="text-white/20 font-mono leading-none">○</span>}
                              </td>
                            ))}
                            {/* Dias no lab */}
                            <td className="px-3 py-2 text-right font-mono text-[11px] text-white/30 whitespace-nowrap">
                              {noLab}d
                            </td>
                            {/* Previsão + badge de prazo */}
                            <td className={cn('px-3 py-2 text-right font-mono text-[11px] whitespace-nowrap', prazoColor)}>
                              <div className="flex items-center justify-end gap-1.5">
                                <span>{fmtDate(item.previsaoSaida)}</span>
                                <span className={cn(
                                  'text-[9px] font-bold px-1 py-0.5 rounded',
                                  d < 0  ? 'bg-red-500/15 text-red-400' :
                                  d <= 3 ? 'bg-amber-500/15 text-amber-400' :
                                           'bg-white/5 text-white/25',
                                )}>
                                  {d < 0 ? `${d}d` : `+${d}d`}
                                </span>
                              </div>
                              {allOk && (
                                <div className="text-[9px] font-sans font-semibold text-green-400/80 tracking-wide mt-0.5 uppercase">
                                  Ag. Emissão
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="card p-8 text-center text-white/25 text-sm">
                {allEmBase.length === 0 ? 'Nenhum item em andamento no momento.' : 'Nenhum item corresponde aos filtros aplicados.'}
              </div>
            )}
          </div>
        )
      })()}

      {editItem && <ItemModal item={editItem} isNew={!agenda.some(a => a.id === editItem.id)} onSave={handleSave} onClose={() => setEditItem(null)} clientes={clientes} customTags={customTags} onCustomTagsChange={handleCustomTagsChange} />}
      {showLote && <LoteModal onSave={handleSaveLote} onClose={() => setShowLote(false)} clientes={clientes} agenda={agenda} />}
      {showGerarLote && (
        <GerarLoteModal
          agenda={agenda}
          onConfirm={itens => { setShowGerarLote(false); confirmarGerarLote(itens) }}
          onClose={() => setShowGerarLote(false)}
        />
      )}
    </div>
  )
}
