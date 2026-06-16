'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, X, Loader2, CheckCircle2, AlertTriangle,
  FolderOpen, Upload, ChevronDown, Users,
  Shield, ShieldCheck, ShieldX, Plus, Minus,
  Lightbulb, Lamp, Trash2, CalendarRange, Download,
} from 'lucide-react'
import { cn, normWatts } from '@/lib/utils'
import { iniciarMarcadorSeAusente, finalizarMarcador, registrarTempo } from '@/lib/tempos'
import {
  type LoteAmostra, type LoteConfig, type Cispr15Config, type RelatorioSalvo, type EquipamentoSalvo, type AgendaItem,
  newAmostra, today, LOTE_KEY, RELATORIOS_KEY, CFG_KEY, PHOTOS_KEY, DOCX_HTML_KEY, DOCX_NAME_KEY, EQUIPAMENTOS_KEY, RELATORIO_DOCX_PFX, AGENDA_KEY,
  AUTH_KEY, SETTINGS_KEY, docxTemFail, docxOndeFail,
} from '../types'

/* ─── helpers ─────────────────────────────────────────────────────────────── */
async function resizeToBase64(file: File, maxW = 1024): Promise<{ name: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const obj = URL.createObjectURL(file)
    img.onload = () => {
      const r = Math.min(1, maxW / img.width)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * r)
      canvas.height = Math.round(img.height * r)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      const base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1]
      URL.revokeObjectURL(obj)
      resolve({ name: file.name, base64 })
    }
    img.onerror = reject
    img.src = obj
  })
}

const getNum = (n: string) => parseInt(n.replace(/\.[^/.]+$/, '').replace(/\D/g, ''), 10) || 0

/* ─── sub-componentes ─────────────────────────────────────────────────────── */
function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">{children}</label>
}

function Row({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1.5', span2 && 'col-span-2')}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

/* ─── AmostraCard ─────────────────────────────────────────────────────────── */
function AmostraCard({ index, amostra, expanded, onToggle, onChange, tipoLote, onVerPDF, onDelete, equipamentos }: {
  index: number
  amostra: LoteAmostra
  expanded: boolean
  onToggle: () => void
  onChange: (a: LoteAmostra) => void
  tipoLote: 'lampada' | 'luminaria'
  onVerPDF?: () => void
  onDelete?: () => void
  equipamentos?: EquipamentoSalvo[]
}) {
  const [pastaLoading,  setPastaLoading]  = useState(false)
  const [docxLoading,   setDocxLoading]   = useState(false)
  const [equipSearch,   setEquipSearch]   = useState('')
  const [showEquipPick, setShowEquipPick] = useState(false)

  const set = (k: keyof LoteAmostra) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...amostra, [k]: e.target.value })

  function aplicarEquipamento(eq: EquipamentoSalvo) {
    onChange({
      ...amostra,
      produto: eq.produto, fabricante: eq.fabricante, modelo: eq.modelo,
      potencia: eq.potencia, tensaoAlim: eq.tensaoAlim,
      frequencia: eq.frequencia || amostra.frequencia,
    })
    setShowEquipPick(false)
    setEquipSearch('')
  }

  const labelId = tipoLote === 'lampada' ? 'Código de Barras' : 'Número de Série'

  const borderCls =
    amostra.conformidade === 'reprovado' ? 'border-red/25 bg-red/3' :
    amostra.conformidade === 'conforme'  ? 'border-green/20 bg-green/3' :
    'border-white/8'

  const badge: Record<LoteAmostra['conformidade'], string> = {
    pendente:  'text-white/30 border-white/10',
    conforme:  'text-green-400 border-green/25 bg-green/8',
    reprovado: 'text-red-400 border-red/25 bg-red/8',
  }

  async function handlePhotosFromFiles(files: File[]) {
    const sorted = files.filter(f => f.type.startsWith('image/')).sort((a, b) => getNum(a.name) - getNum(b.name))
    const next: { name: string; base64: string }[] = []
    for (const f of sorted) {
      try { next.push(await resizeToBase64(f)) } catch {}
    }
    onChange({ ...amostra, photos: next })
  }

  async function handleDocxFile(file: File) {
    setDocxLoading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/parse-docx', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onChange({ ...amostra, docxHtml: data.html, docxFilename: file.name })
    } catch (err: any) {
      alert(`Erro ao processar DOCX: ${err.message}`)
    } finally { setDocxLoading(false) }
  }

  async function handlePasta(files: FileList) {
    setPastaLoading(true)
    try {
      const all = Array.from(files)
      const docxFile   = all.find(f => f.name.toLowerCase().endsWith('.docx'))
      const imageFiles = all.filter(f =>
        f.type.startsWith('image/') || /\.(jpe?g|png|gif|bmp|webp|tiff?)$/i.test(f.name)
      ).sort((a, b) => getNum(a.name) - getNum(b.name))

      let updated = { ...amostra }

      if (docxFile) {
        const fd = new FormData(); fd.append('file', docxFile)
        const res  = await fetch('/api/parse-docx', { method: 'POST', body: fd })
        const data = await res.json()
        if (!data.error) updated = { ...updated, docxHtml: data.html, docxFilename: docxFile.name }
      }

      if (imageFiles.length > 0) {
        const photos: { name: string; base64: string }[] = []
        for (const f of imageFiles) {
          try { photos.push(await resizeToBase64(f)) } catch {}
        }
        updated = { ...updated, photos }
      }

      onChange(updated)
    } finally { setPastaLoading(false) }
  }

  return (
    <div className={cn('rounded-xl border transition-all', borderCls)}>

      {/* Header */}
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className="font-mono text-[10px] text-white/30 w-12 shrink-0">#{index + 1}</span>
        <span className="text-sm text-white/70 flex-1 truncate">
          {amostra.produto || <span className="text-white/20 italic">sem produto</span>}
        </span>
        {onVerPDF && (
          <button type="button" onClick={e => { e.stopPropagation(); onVerPDF() }}
            className="text-[10px] font-mono text-teal hover:text-teal/70 bg-teal/8 border border-teal/20 px-2 py-0.5 rounded transition-all shrink-0 flex items-center gap-1">
            <ArrowRight size={8} /> {amostra.numRelatorio ? 'Ver PDF' : 'Preview'}
          </button>
        )}
        {amostra.numRelatorio && (
          <span className="text-[10px] font-mono text-gold shrink-0">{amostra.numRelatorio}</span>
        )}
        {amostra.docxFilename && (
          <span className="text-[9px] font-mono text-teal/60 shrink-0">docx</span>
        )}
        {amostra.photos.length > 0 && (
          <span className="text-[9px] font-mono text-teal/60 shrink-0">{amostra.photos.length}f</span>
        )}
        <span className={cn(
          'px-2 py-0.5 rounded-md text-[9px] font-mono border uppercase tracking-wider shrink-0',
          badge[amostra.conformidade]
        )}>
          {amostra.conformidade}
        </span>
        {onDelete && (
          <button type="button" onClick={e => { e.stopPropagation(); onDelete() }}
            title="Excluir amostra do lote"
            className="text-red-400/50 hover:text-red-400 hover:bg-red/10 rounded p-1 transition-all shrink-0">
            <Trash2 size={12} />
          </button>
        )}
        <ChevronDown size={12} className={cn('text-white/20 transition-transform shrink-0', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-4">

          {/* Equipment picker */}
          {equipamentos && equipamentos.length > 0 && (
            <div className="mb-1">
              {showEquipPick ? (
                <div className="rounded-xl border border-white/10 bg-[#0d1017] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-white/40 font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <Upload size={10} /> Catálogo de Equipamentos
                    </p>
                    <button type="button" onClick={() => setShowEquipPick(false)} className="text-white/25 hover:text-white/60 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                  <input className="input py-1 text-xs w-full" placeholder="Filtrar…"
                    value={equipSearch} onChange={e => setEquipSearch(e.target.value)} autoFocus />
                  <div className="max-h-[120px] overflow-y-auto space-y-0.5">
                    {equipamentos
                      .filter(e => !equipSearch || [e.produto, e.fabricante, e.modelo].some(v => v?.toLowerCase().includes(equipSearch.toLowerCase())))
                      .slice(0, 20).map(e => (
                        <button key={e.id} type="button" onClick={() => aplicarEquipamento(e)}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-white/5 transition-colors">
                          <span className="text-xs text-white/80 font-semibold">{e.produto}</span>
                          {(e.fabricante || e.modelo) && (
                            <span className="text-[10px] text-white/35 ml-1.5">{[e.fabricante, e.modelo].filter(Boolean).join(' · ')}</span>
                          )}
                          {e.potencia && <span className="text-[10px] text-white/25 ml-1">{e.potencia}</span>}
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setShowEquipPick(true)}
                  className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-teal border border-white/8 hover:border-teal/30 px-3 py-1.5 rounded-lg transition-all">
                  <Upload size={10} /> Preencher do catálogo
                </button>
              )}
            </div>
          )}

          {/* Campos de texto */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Row label="Produto / Descrição" span2>
              <input className="input text-sm" value={amostra.produto} onChange={set('produto')} placeholder="Ex: Luminária LED" />
            </Row>
            <Row label="Fabricante">
              <input className="input text-sm" value={amostra.fabricante} onChange={set('fabricante')} />
            </Row>
            <Row label="Modelo">
              <input className="input text-sm" value={amostra.modelo} onChange={set('modelo')} />
            </Row>
            <Row label={labelId}>
              <input className="input text-sm" value={amostra.identificador} onChange={set('identificador')} />
            </Row>
            <Row label="Potência">
              <input className="input text-sm" value={amostra.potencia} onChange={set('potencia')}
                onBlur={e => onChange({ ...amostra, potencia: normWatts(e.target.value) })}
                placeholder="Ex: 60  (W automático)" />
            </Row>
            <Row label="Tensão de Alimentação">
              <input className="input text-sm" value={amostra.tensaoAlim} onChange={set('tensaoAlim')} />
            </Row>
            <Row label="Protocolo LABELO">
              <input className="input text-sm" value={amostra.protocolo} onChange={set('protocolo')} />
            </Row>
            <Row label="Orçamento LABELO">
              <input className="input text-sm" value={amostra.orcamento} onChange={set('orcamento')} />
            </Row>
            <Row label="Período — Início">
              <input className="input text-sm" type="date" value={amostra.periodoInicio} onChange={set('periodoInicio')} />
            </Row>
            <Row label="Período — Fim">
              <input
                className={cn('input text-sm', amostra.periodoFim && amostra.periodoInicio && amostra.periodoFim < amostra.periodoInicio && 'border-red-500/50')}
                type="date" value={amostra.periodoFim} onChange={set('periodoFim')} />
              {amostra.periodoFim && amostra.periodoInicio && amostra.periodoFim < amostra.periodoInicio && (
                <p className="text-[10px] text-red-400 flex items-center gap-1">
                  <AlertTriangle size={9} /> Fim anterior ao início do período
                </p>
              )}
            </Row>
          </div>

          {/* Driver — só para luminária */}
          {tipoLote === 'luminaria' && (
            <div className="border-t border-white/5 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-white/25 font-mono uppercase tracking-wider">Acessório de Ensaio</p>
                <button
                  type="button"
                  onClick={() => onChange({
                    ...amostra,
                    temDriver: !amostra.temDriver,
                    driverOrcamento: amostra.driverOrcamento || 'Não identificado',
                    driverProtocolo: amostra.driverProtocolo || 'Não identificado',
                  })}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-semibold transition-all',
                    amostra.temDriver
                      ? 'border-teal/40 bg-teal/10 text-teal'
                      : 'border-white/10 text-white/30 hover:border-white/25 hover:text-white/55',
                  )}>
                  {amostra.temDriver ? '✓ Driver ativo' : '+ Driver'}
                </button>
              </div>
              {amostra.temDriver && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3 rounded-xl border border-teal/15 bg-teal/3">
                  <Row label="Produto / Descrição" span2>
                    <input className="input text-sm" value={amostra.driverProduto ?? ''} onChange={e => onChange({ ...amostra, driverProduto: e.target.value })} placeholder="Ex: Driver LED" />
                  </Row>
                  <Row label="Fabricante">
                    <input className="input text-sm" value={amostra.driverFabricante ?? ''} onChange={e => onChange({ ...amostra, driverFabricante: e.target.value })} />
                  </Row>
                  <Row label="Modelo">
                    <input className="input text-sm" value={amostra.driverModelo ?? ''} onChange={e => onChange({ ...amostra, driverModelo: e.target.value })} />
                  </Row>
                  <Row label="Número de Série">
                    <input className="input text-sm" value={amostra.driverIdentificador ?? ''} onChange={e => onChange({ ...amostra, driverIdentificador: e.target.value })} />
                  </Row>
                  <Row label="Potência">
                    <input className="input text-sm" value={amostra.driverPotencia ?? ''} onChange={e => onChange({ ...amostra, driverPotencia: e.target.value })}
                      onBlur={e => onChange({ ...amostra, driverPotencia: normWatts(e.target.value) })}
                      placeholder="Ex: 60  (W automático)" />
                  </Row>
                  <Row label="Tensão de Alimentação">
                    <input className="input text-sm" value={amostra.driverTensaoAlim ?? ''} onChange={e => onChange({ ...amostra, driverTensaoAlim: e.target.value })} />
                  </Row>
                  <Row label="Frequência de Rede">
                    <input className="input text-sm" value={amostra.driverFrequencia ?? ''} onChange={e => onChange({ ...amostra, driverFrequencia: e.target.value })} placeholder="60Hz" />
                  </Row>
                  <Row label="Orçamento LABELO">
                    <input className="input text-sm" value={amostra.driverOrcamento ?? 'Não identificado'} onChange={e => onChange({ ...amostra, driverOrcamento: e.target.value })} />
                  </Row>
                  <Row label="Protocolo LABELO">
                    <input className="input text-sm" value={amostra.driverProtocolo ?? 'Não identificado'} onChange={e => onChange({ ...amostra, driverProtocolo: e.target.value })} />
                  </Row>
                </div>
              )}
            </div>
          )}

          {/* Anexos */}
          <div className="border-t border-white/5 pt-3 space-y-3">
            <p className="text-[9px] text-white/25 font-mono uppercase tracking-wider">Anexos</p>

            <label className={cn(
              'flex items-center justify-center gap-2 w-full px-3 py-3 rounded-xl border-2 border-dashed text-xs font-semibold cursor-pointer transition-all',
              pastaLoading
                ? 'border-blue-400/40 bg-blue-500/8 text-blue-400 cursor-wait'
                : (amostra.docxHtml || amostra.photos.length > 0)
                ? 'border-green/30 bg-green/6 text-green-400 hover:border-green/50'
                : 'border-gold/30 bg-gold/4 text-gold hover:border-gold/60 hover:bg-gold/8',
            )}>
              {pastaLoading
                ? <><Loader2 size={13} className="animate-spin" /> Processando…</>
                : <><FolderOpen size={13} /> Carregar Pasta do Ensaio</>}
              <input type="file" className="hidden" disabled={pastaLoading}
                {...{ webkitdirectory: '' } as any}
                onChange={e => { if (e.target.files?.length) handlePasta(e.target.files) }} />
            </label>

            {(amostra.docxHtml || amostra.photos.length > 0) && (
              <div className="flex flex-col gap-1.5">
                {amostra.docxHtml && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green/8 border border-green/20">
                    <CheckCircle2 size={11} className="text-green-400 shrink-0" />
                    <span className="text-green-400 text-[11px] font-mono truncate flex-1">{amostra.docxFilename}</span>
                    <button type="button"
                      onClick={() => onChange({ ...amostra, docxHtml: null, docxFilename: null })}
                      className="text-white/25 hover:text-red-400 transition-colors">
                      <X size={11} />
                    </button>
                  </div>
                )}
                {amostra.photos.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green/8 border border-green/20">
                    <CheckCircle2 size={11} className="text-green-400 shrink-0" />
                    <span className="text-green-400 text-[11px] font-mono flex-1">{amostra.photos.length} foto(s)</span>
                    <button type="button"
                      onClick={() => onChange({ ...amostra, photos: [] })}
                      className="text-white/25 hover:text-red-400 transition-colors">
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {amostra.photos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {amostra.photos.map((ph, i) => (
                  <div key={i} className="relative group">
                    <img src={`data:image/jpeg;base64,${ph.base64}`} alt={`Foto ${i + 1}`}
                      className="w-14 h-10 object-cover rounded-lg border border-white/10" />
                    <button type="button"
                      onClick={() => onChange({ ...amostra, photos: amostra.photos.filter((_, j) => j !== i) })}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500/90 text-white items-center justify-center hidden group-hover:flex">
                      <X size={8} />
                    </button>
                    <span className="text-[8px] text-white/30 block text-center">{i + 1}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-white/40 hover:text-gold hover:border-gold/30 cursor-pointer transition-all">
                <Upload size={10} /> Fotos
                <input type="file" multiple accept="image/*" className="hidden"
                  onChange={e => { if (e.target.files?.length) handlePhotosFromFiles(Array.from(e.target.files)) }} />
              </label>
              {!amostra.docxHtml && !docxLoading && (
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-white/40 hover:text-gold hover:border-gold/30 cursor-pointer transition-all">
                  <Upload size={10} /> Radimation .docx
                  <input type="file" accept=".docx" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleDocxFile(f) }} />
                </label>
              )}
              {docxLoading && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-blue-400">
                  <Loader2 size={10} className="animate-spin" /> Processando…
                </div>
              )}
            </div>
          </div>

          {/* Conformidade */}
          <div className="border-t border-white/5 pt-3">
            <Label>Conformidade</Label>
            <div className="flex gap-2 mt-2">
              {(['pendente', 'conforme', 'reprovado'] as const).map(s => (
                <button key={s} type="button"
                  onClick={() => onChange({ ...amostra, conformidade: s })}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border capitalize transition-all',
                    amostra.conformidade === s
                      ? badge[s]
                      : 'text-white/20 border-white/5 hover:border-white/15 hover:text-white/40'
                  )}>
                  {s === 'conforme'  && <ShieldCheck size={10} />}
                  {s === 'reprovado' && <ShieldX size={10} />}
                  {s === 'pendente'  && <Shield size={10} />}
                  {s}
                </button>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

/* ─── página ──────────────────────────────────────────────────────────────── */
export default function LotePage() {
  const router = useRouter()
  const [lote,        setLote]        = useState<LoteConfig | null>(null)
  const [expanded,    setExpanded]    = useState<number | null>(0)
  const [emitindo,    setEmitindo]    = useState(false)
  const [resultado,   setResultado]   = useState<{ reprovados: { protocolo: string; testes: string[]; trechos: string[] }[]; total: number; checked: boolean } | null>(null)
  const [emitidos,    setEmitidos]    = useState<Record<number, string>>({}) // index → numRelatorio
  const [equipamentos,setEquipamentos] = useState<EquipamentoSalvo[]>([])
  const [emitModal,   setEmitModal]   = useState<{ conformes: number; reprovadosNomes: string[] } | null>(null)
  const [importMae,   setImportMae]   = useState<{ loading: boolean; msg: string } | null>(null)
  const maeRef = useRef<HTMLInputElement>(null)
  const [baixando,    setBaixando]    = useState<{ done: number; total: number; erros: string[] } | null>(null)
  const [gateOpen,    setGateOpen]    = useState(false)
  const [gateInput,   setGateInput]   = useState('')
  const [gateError,   setGateError]   = useState(false)
  const [appPassword, setAppPassword] = useState('')
  const [capsLock,    setCapsLock]    = useState(false)
  const gateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function initGate() {
      let senha = ''
      const api = (window as any).electronAPI
      if (api) {
        try { const s = await api.getSettings(); senha = s.senhaEmissao ?? '' } catch {}
      } else {
        try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) senha = (JSON.parse(raw) as any).senhaEmissao ?? '' } catch {}
      }
      setAppPassword(senha)
      if (senha && !sessionStorage.getItem(AUTH_KEY)) setGateOpen(true)
    }
    initGate()
  }, [])

  useEffect(() => {
    const check = (e: KeyboardEvent) => setCapsLock(e.getModifierState('CapsLock'))
    window.addEventListener('keydown', check)
    window.addEventListener('keyup', check)
    return () => { window.removeEventListener('keydown', check); window.removeEventListener('keyup', check) }
  }, [])

  useEffect(() => {
    iniciarMarcadorSeAusente('emissao') // cronômetro de emissão (vale para lote também)
    // Carrega o lote: no Electron o arquivo é a fonte autoritativa (não sofre com a
    // cota do localStorage); na web, usa o localStorage.
    async function loadLote() {
      const api = (window as any).electronAPI
      if (api?.getLote) {
        try {
          const res = await api.getLote()
          if (res?.ok && res.lote) { setLote(res.lote); return }
        } catch {}
      }
      try {
        const raw = localStorage.getItem(LOTE_KEY)
        if (raw) { setLote(JSON.parse(raw)); return }
      } catch {}
      router.push('/cispr15')
    }
    loadLote()
    // load equipment catalog
    async function loadEquip() {
      const api = (window as any).electronAPI
      if (api) {
        try {
          const res = await api.getEquipamentos()
          if (res.ok && Array.isArray(res.equipamentos)) { setEquipamentos(res.equipamentos); return }
        } catch {}
      }
      try {
        const raw = localStorage.getItem(EQUIPAMENTOS_KEY)
        if (raw) setEquipamentos(JSON.parse(raw))
      } catch {}
    }
    loadEquip()
  }, [])

  function saveLote(next: LoteConfig) {
    setLote(next)
    // Persistência robusta em arquivo (Electron) — não depende da cota do localStorage,
    // então datas/fotos sobrevivem à navegação mesmo com o localStorage cheio.
    const api = (window as any).electronAPI
    if (api?.saveLoteFile) api.saveLoteFile(next).catch(() => {})
    try { localStorage.setItem(LOTE_KEY, JSON.stringify(next)) }
    catch {
      // Quota exceeded: try saving without docxHtml (keep it only in memory)
      try {
        const compact = { ...next, amostras: next.amostras.map(a => ({ ...a, docxHtml: null })) }
        localStorage.setItem(LOTE_KEY, JSON.stringify(compact))
      } catch {
        // No Electron o arquivo acima já guardou tudo; só alerta na web
        if (!api) alert('Armazenamento cheio — reduza o número de fotos.')
      }
    }
  }

  /* Importa uma pasta-mãe contendo subpastas (uma por protocolo). Casa cada
     subpasta com a amostra do lote pelo protocolo e preenche docx + fotos. */
  async function handlePastaMae(files: FileList) {
    if (!lote) return
    const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|bmp|webp|tiff?)$/i.test(f.name)
    setImportMae({ loading: true, msg: '' })
    try {
      // Agrupa arquivos pela 1ª subpasta do caminho relativo
      const grupos: Record<string, File[]> = {}
      for (const f of Array.from(files)) {
        const rel = ((f as any).webkitRelativePath as string) || f.name
        const parts = rel.split('/')
        // parts[0] = pasta-mãe; parts[1] = subpasta (protocolo) quando há subpastas
        const sub = parts.length >= 3 ? parts[1] : parts.length === 2 ? parts[1] : '__root__'
        ;(grupos[sub] ??= []).push(f)
      }

      let casados = 0
      const naoCasados: string[] = []
      const novas = await Promise.all(lote.amostras.map(async (am) => {
        const proto = (am.protocolo || '').replace(/\D/g, '')
        if (!proto) { naoCasados.push(`amostra sem protocolo`); return am }
        const subKey = Object.keys(grupos).find(k => k.replace(/\D/g, '').includes(proto))
        if (!subKey) { naoCasados.push(proto); return am }

        const groupFiles = grupos[subKey]
        const docxFile = groupFiles.find(f => f.name.toLowerCase().endsWith('.docx') && !f.name.startsWith('~'))
        const imageFiles = groupFiles.filter(isImage).sort((a, b) => getNum(a.name) - getNum(b.name))

        let updated = { ...am }
        if (docxFile) {
          try {
            const fd = new FormData(); fd.append('file', docxFile)
            const data = await fetch('/api/parse-docx', { method: 'POST', body: fd }).then(r => r.json())
            if (!data.error) updated = { ...updated, docxHtml: data.html, docxFilename: docxFile.name }
          } catch {}
        }
        if (imageFiles.length > 0) {
          const photos: { name: string; base64: string }[] = []
          for (const f of imageFiles) { try { photos.push(await resizeToBase64(f)) } catch {} }
          updated = { ...updated, photos }
        }
        if (docxFile || imageFiles.length > 0) casados++
        return updated
      }))

      saveLote({ ...lote, amostras: novas })
      const msg = `${casados} amostra(s) preenchida(s)` +
        (naoCasados.length ? ` · ${naoCasados.length} sem pasta correspondente` : '')
      setImportMae({ loading: false, msg })
    } catch (e: any) {
      setImportMae({ loading: false, msg: 'Erro: ' + (e?.message || String(e)) })
    }
  }

  function handleQtd(n: number) {
    if (!lote) return
    const qtd = Math.max(1, Math.min(20, n))
    const amostras = qtd > lote.amostras.length
      ? [...lote.amostras, ...Array.from({ length: qtd - lote.amostras.length }, newAmostra)]
      : lote.amostras.slice(0, qtd)
    saveLote({ ...lote, qtd, amostras })
    setResultado(null)
  }

  function handleTipo(tipo: 'lampada' | 'luminaria') {
    if (!lote) return
    saveLote({ ...lote, tipo })
  }

  // Define o período (início/fim) de TODAS as amostras de uma vez
  function aplicarPeriodoTodos() {
    if (!lote) return
    const bi = lote.bulkInicio ?? '', bf = lote.bulkFim ?? ''
    if (!bi && !bf) { alert('Informe início e/ou fim para aplicar a todos.'); return }
    if (bi && bf && bf < bi) { alert('Fim anterior ao início do período.'); return }
    const amostras = lote.amostras.map(a => ({
      ...a,
      periodoInicio: bi || a.periodoInicio,
      periodoFim:    bf || a.periodoFim,
    }))
    saveLote({ ...lote, amostras })
  }

  function updateAmostra(i: number, a: LoteAmostra) {
    if (!lote) return
    saveLote({ ...lote, amostras: lote.amostras.map((x, j) => j === i ? a : x) })
  }

  function removerAmostra(i: number) {
    if (!lote || lote.amostras.length <= 1) return
    const am = lote.amostras[i]
    const ref = am.protocolo || am.produto || `Amostra ${i + 1}`
    if (!confirm(`Remover a amostra "${ref}" do lote?`)) return
    const novas = lote.amostras.filter((_, j) => j !== i)
    saveLote({ ...lote, qtd: Math.max(1, novas.length), amostras: novas })
    setExpanded(prev => (prev === i ? null : prev !== null && prev > i ? prev - 1 : prev))
  }

  /* Monta um item de agenda a partir de uma amostra do lote (para devolvê-la). */
  function amostraParaAgenda(am: LoteAmostra): AgendaItem {
    return {
      id: crypto.randomUUID(),
      tipo: lote?.tipo ?? 'lampada',
      protocolo: am.protocolo, orcamento: am.orcamento,
      cliente: lote?.cliente ?? '', clienteRua: lote?.clienteRua, clienteCidade: lote?.clienteCidade, clienteCep: lote?.clienteCep,
      produto: am.produto, fabricante: am.fabricante, modelo: am.modelo, identificador: am.identificador,
      potencia: am.potencia, tensaoAlim: am.tensaoAlim, frequencia: am.frequencia,
      documentacao: 'embalagem com especificações',
      temDriver: am.temDriver,
      driverProduto: am.driverProduto, driverFabricante: am.driverFabricante, driverModelo: am.driverModelo,
      driverIdentificador: am.driverIdentificador, driverPotencia: am.driverPotencia,
      driverTensaoAlim: am.driverTensaoAlim, driverFrequencia: am.driverFrequencia,
      driverOrcamento: am.driverOrcamento, driverProtocolo: am.driverProtocolo,
      dataEntrada: am.periodoInicio || today(), previsaoSaida: am.periodoFim || today(),
      dataEmissao: '', numRelatorio: '', responsavel: lote?.responsavel ?? '',
      statusConduzida: 'pendente', statusLoop: 'pendente', statusAnexoB: 'pendente',
      observacoes: '',
    }
  }

  /* Devolve uma amostra reprovada para a agenda (não some dela): marca o ensaio
     onde caiu a reprovação, registra a nota nas observações e zera numRelatorio
     (volta a ficar pendente de re-ensaio). Cria o item se não existir mais. */
  async function retornarReprovadoParaAgenda(am: LoteAmostra, info: ReturnType<typeof docxOndeFail>) {
    try {
      const proto = (am.protocolo || '').trim().toLowerCase()
      if (!proto) return
      const testes  = info?.testes  ?? []
      const trechos = info?.trechos ?? []
      const chaves  = info?.chaves  ?? []
      const api = (window as any).electronAPI
      let lista: AgendaItem[] = []
      if (api) { const r = await api.getAgenda().catch(() => null); if (r?.ok && Array.isArray(r.agenda)) lista = r.agenda }
      if (!lista.length) { const raw = localStorage.getItem(AGENDA_KEY); if (raw) { try { lista = JSON.parse(raw) } catch {} } }

      const nota = `⚠ Reprovado no lote (${new Date().toLocaleDateString('pt-BR')})`
        + (testes.length ? ` — ${testes.join(', ')}` : '')
        + (trechos.length ? `: ${trechos.join(' | ')}` : '')
      const aplicar = (item: AgendaItem): AgendaItem => ({
        ...item,
        numRelatorio: '', dataEmissao: '', pdfPath: undefined,   // volta à agenda (não emitido)
        statusConduzida: chaves.includes('conduzida') ? 'reprovado' : item.statusConduzida,
        statusLoop:      chaves.includes('loop')      ? 'reprovado' : item.statusLoop,
        statusAnexoB:    chaves.includes('anexoB')    ? 'reprovado' : item.statusAnexoB,
        observacoes: [item.observacoes?.trim(), nota].filter(Boolean).join('\n'),
        tags: Array.from(new Set([...(item.tags ?? []), 'reprovado'])),
      })

      const existe = lista.some(it => it.protocolo?.trim().toLowerCase() === proto)
      const updated = existe
        ? lista.map(it => it.protocolo?.trim().toLowerCase() === proto ? aplicar(it) : it)
        : [...lista, aplicar(amostraParaAgenda(am))]

      if (api) await api.saveAgenda(updated).catch(() => null)
      localStorage.setItem(AGENDA_KEY, JSON.stringify(updated))
    } catch {}
  }

  async function verificarConformidade() {
    if (!lote) return
    // Auto-avalia cada amostra que tenha docx: "Fail" no relatório Radimation → reprovado.
    // Amostras sem docx mantêm o valor de conformidade definido manualmente.
    const avaliadas = lote.amostras.map(a =>
      a.docxHtml
        ? { ...a, conformidade: (docxTemFail(a.docxHtml) ? 'reprovado' : 'conforme') as LoteAmostra['conformidade'] }
        : a
    )
    const reprovados = avaliadas
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.conformidade === 'reprovado')

    // Para cada reprovado: descobre onde caiu a reprovação e devolve à agenda
    const detalhes: { protocolo: string; testes: string[]; trechos: string[] }[] = []
    for (const { a } of reprovados) {
      const info = docxOndeFail(a.docxHtml)
      detalhes.push({ protocolo: a.protocolo || '(sem protocolo)', testes: info?.testes ?? [], trechos: info?.trechos ?? [] })
      await retornarReprovadoParaAgenda(a, info)
    }

    setResultado({ reprovados: detalhes, total: avaliadas.length, checked: true })
    // Persiste a avaliação (badges atualizam) e remove reprovados do lote
    const idx = new Set(reprovados.map(({ i }) => i))
    const novas = idx.size > 0 ? avaliadas.filter((_, i) => !idx.has(i)) : avaliadas
    saveLote({ ...lote, qtd: Math.max(1, novas.length), amostras: novas })
  }

  function iniciarEmissao() {
    if (!lote) return
    const reprovadosIdx = lote.amostras
      .map((a, i) => a.conformidade === 'reprovado' ? i : -1)
      .filter(i => i >= 0)
    const conformes = lote.amostras.filter(a => a.conformidade !== 'reprovado')
    if (conformes.length === 0) { alert('Nenhuma amostra para emitir.'); return }
    setEmitModal({
      conformes: conformes.length,
      reprovadosNomes: reprovadosIdx.map(i => `Amostra ${i + 1}`),
    })
  }

  async function salvarRelatorioSalvo(am: LoteAmostra, numRelatorio: string) {
    if (!lote) return
    const cfg: Cispr15Config = {
      tipo: lote.tipo, tensaoConfig: '127_220',
      cliente: lote.cliente, clienteRua: lote.clienteRua ?? '',
      clienteCidade: lote.clienteCidade ?? '', clienteCep: lote.clienteCep ?? '',
      produto: am.produto, fabricante: am.fabricante, modelo: am.modelo,
      identificador: am.identificador, lacre: '',
      tensaoAlim: am.tensaoAlim, potencia: am.potencia, frequencia: am.frequencia,
      temDriver: am.temDriver,
      driverProduto: am.driverProduto, driverFabricante: am.driverFabricante,
      driverModelo: am.driverModelo, driverIdentificador: am.driverIdentificador,
      driverPotencia: am.driverPotencia, driverTensaoAlim: am.driverTensaoAlim,
      driverFrequencia: am.driverFrequencia,
      driverOrcamento: am.driverOrcamento, driverProtocolo: am.driverProtocolo,
      documentacao: 'embalagem com especificações',
      numRelatorio, orcamento: am.orcamento, protocolo: am.protocolo,
      periodoInicio: am.periodoInicio, periodoFim: am.periodoFim, dataEmissao: am.dataEmissao,
      responsavel: lote.responsavel,
      resultadoConduzida: 'pass', resultadoLoop: 'pass', resultadoAnexoB: 'pass',
    }
    const novo: RelatorioSalvo = {
      id: crypto.randomUUID(),
      numRelatorio,
      dataEmissao: am.dataEmissao,
      clienteNome: lote.cliente,
      protocolo: am.protocolo,
      produto: am.produto,
      cfg,
      photos: am.photos,
      docxFilename: am.docxFilename,
      emendas: [],
    }
    // Save docxHtml FIRST (before the larger list save that can push storage over quota)
    if (am.docxHtml) {
      try { localStorage.setItem(RELATORIO_DOCX_PFX + novo.id, am.docxHtml) } catch {}
    }
    const api = (window as any).electronAPI
    let lista: RelatorioSalvo[] = []
    if (api) {
      try { const r = await api.getRelatorios(); if (r.ok && Array.isArray(r.relatorios)) lista = r.relatorios } catch {}
    }
    if (!lista.length) {
      try { const raw = localStorage.getItem(RELATORIOS_KEY); if (raw) lista = JSON.parse(raw) } catch {}
    }
    // For localStorage, strip photos from the list to avoid quota overflow;
    // photos remain in LOTE_KEY so they're still accessible within the session.
    const novoSemFotos = { ...novo, photos: [] as typeof novo.photos }
    const listaSemFotos = [...lista, novoSemFotos]
    if (api) { try { await api.saveRelatorios(listaSemFotos) } catch {} }
    try {
      localStorage.setItem(RELATORIOS_KEY, JSON.stringify(listaSemFotos))
    } catch {
      // Quota: try even without previous entries' photos
      try {
        const listaMini = [...lista.map(r => ({ ...r, photos: [] as typeof r.photos })), novoSemFotos]
        localStorage.setItem(RELATORIOS_KEY, JSON.stringify(listaMini))
      } catch {}
    }
    return novo
  }

  async function sincronizarAgenda(protocolo: string, numRelatorio: string, dataEmissao: string) {
    try {
      const proto = protocolo.trim().toLowerCase()
      const api = (window as any).electronAPI
      let lista: any[] = []
      if (api) {
        const res = await api.getAgenda().catch(() => null)
        if (res?.ok && Array.isArray(res.agenda)) lista = res.agenda
      }
      if (!lista.length) {
        const raw = localStorage.getItem(AGENDA_KEY)
        if (raw) lista = JSON.parse(raw)
      }
      if (!lista.length) return
      const updated = lista.map((item: any) =>
        item.protocolo?.trim().toLowerCase() === proto && !item.numRelatorio
          ? { ...item, numRelatorio, dataEmissao }
          : item
      )
      if (JSON.stringify(updated) === JSON.stringify(lista)) return
      if (api) await api.saveAgenda(updated).catch(() => null)
      localStorage.setItem(AGENDA_KEY, JSON.stringify(updated))
    } catch {}
  }

  async function emitirLote() {
    if (!lote) return
    const paraEmitir = lote.amostras.map((a, i) => ({ a, i })).filter(({ a }) => a.conformidade !== 'reprovado')
    if (paraEmitir.length === 0) { alert('Nenhuma amostra para emitir.'); return }
    setEmitindo(true)
    const novosEmitidos: Record<number, string> = {}
    try {
      let loteCurr = lote
      for (const { a: am, i } of paraEmitir) {
        const res = await fetch('/api/registrar-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente: loteCurr.cliente, produto: am.produto,
            protocolo: am.protocolo, orcamento: am.orcamento,
            responsavel: loteCurr.responsavel,
          }),
        })
        const data = await res.json()
        if (data.error) throw new Error(`Amostra ${i + 1}: ${data.error}`)
        const numRelatorio = data.numRelatorio as string
        const amUpdated = { ...am, numRelatorio, dataEmissao: am.dataEmissao || new Date().toISOString().split('T')[0] }
        const novas = loteCurr.amostras.map((a, j) => j === i ? amUpdated : a)
        loteCurr = { ...loteCurr, amostras: novas }
        saveLote(loteCurr)
        await salvarRelatorioSalvo(amUpdated, numRelatorio)
        await sincronizarAgenda(am.protocolo, numRelatorio, amUpdated.dataEmissao)
        novosEmitidos[i] = numRelatorio
      }
      setEmitidos(prev => ({ ...prev, ...novosEmitidos }))
      // métrica: tempo de emissão do lote (do abrir o lote até emitir).
      // Divide a duração da sessão pelo nº de relatórios emitidos → tempo médio por relatório.
      const emitidosCount = Object.keys(novosEmitidos).length
      const dur = finalizarMarcador('emissao')
      if (dur != null && emitidosCount > 0) {
        const porRel = Math.round(dur / emitidosCount)
        for (const i of Object.keys(novosEmitidos)) {
          registrarTempo({ tipo: 'emissao', protocolo: lote.amostras[Number(i)]?.protocolo, numRelatorio: novosEmitidos[Number(i)], duracaoMs: porRel })
        }
      }
    } catch (err: any) {
      alert(`Erro ao emitir lote: ${err.message}`)
    } finally {
      setEmitindo(false)
    }
  }

  /* Monta o Cispr15Config de uma amostra (para gerar o PDF). */
  function buildCfg(am: LoteAmostra): Cispr15Config {
    return {
      tipo: lote!.tipo, tensaoConfig: '127_220',
      cliente: lote!.cliente, clienteRua: lote!.clienteRua ?? '',
      clienteCidade: lote!.clienteCidade ?? '', clienteCep: lote!.clienteCep ?? '',
      produto: am.produto, fabricante: am.fabricante, modelo: am.modelo,
      identificador: am.identificador, lacre: '',
      tensaoAlim: am.tensaoAlim, potencia: am.potencia, frequencia: am.frequencia,
      temDriver: am.temDriver,
      driverProduto: am.driverProduto, driverFabricante: am.driverFabricante,
      driverModelo: am.driverModelo, driverIdentificador: am.driverIdentificador,
      driverPotencia: am.driverPotencia, driverTensaoAlim: am.driverTensaoAlim,
      driverFrequencia: am.driverFrequencia,
      driverOrcamento: am.driverOrcamento, driverProtocolo: am.driverProtocolo,
      documentacao: 'embalagem com especificações',
      numRelatorio: am.numRelatorio, orcamento: am.orcamento, protocolo: am.protocolo,
      periodoInicio: am.periodoInicio, periodoFim: am.periodoFim, dataEmissao: am.dataEmissao,
      responsavel: lote!.responsavel,
      resultadoConduzida: 'pass', resultadoLoop: 'pass', resultadoAnexoB: 'pass',
    }
  }

  function bufToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf)
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
    return btoa(bin)
  }

  /* Gera o PDF de cada amostra conforme e salva (PDF + DOCX + fotos) numa
     subpasta por protocolo dentro da pasta-mãe escolhida. */
  async function baixarPDFs() {
    if (!lote) return
    const api = (window as any).electronAPI
    if (!api?.saveLotePdf || !api?.browseFolder) { alert('Disponível apenas no aplicativo.'); return }
    const conformes = lote.amostras.filter(a => a.conformidade !== 'reprovado')
    if (!conformes.length) { alert('Nenhuma amostra conforme para gerar PDF.'); return }
    const sel = await api.browseFolder('Selecionar pasta-mãe para os PDFs do lote')
    if (sel?.canceled || !sel?.folderPath) return
    const pastaMae = sel.folderPath
    const erros: string[] = []
    setBaixando({ done: 0, total: conformes.length, erros: [] })
    for (let k = 0; k < conformes.length; k++) {
      const am  = conformes[k]
      const ref = am.protocolo || am.produto || `Amostra ${k + 1}`
      try {
        const cfg = buildCfg(am)
        const res = await fetch('/api/gerar-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cfg, photos: am.photos, docxHtml: am.docxHtml, docxName: am.docxFilename }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          throw new Error(j.error || `HTTP ${res.status}`)
        }
        const b64 = bufToBase64(await res.arrayBuffer())
        const san = (v: string) => (v ?? '').replace(/[/\\:*?"<>|\s]/g, '_').replace(/_+/g, '_')
        const filename = `${san(am.numRelatorio || am.protocolo || 'relatorio')}_${lote.tipo}.pdf`
        const r = await api.saveLotePdf({
          pastaMae, protocolo: am.protocolo, filename, pdfBase64: b64,
          photos: am.photos, docxHtml: am.docxHtml, docxName: am.docxFilename, saveExtras: true,
        })
        if (!r?.ok) throw new Error(r?.error || 'falha ao salvar')
      } catch (e: any) {
        erros.push(`${ref}: ${e?.message || e}`)
      }
      setBaixando({ done: k + 1, total: conformes.length, erros: [...erros] })
    }
    try { api.openPath?.(pastaMae) } catch {}
    if (erros.length) alert(`Concluído com ${erros.length} erro(s):\n` + erros.join('\n'))
    setTimeout(() => setBaixando(null), 6000)
  }

  function verPDFAmostra(i: number) {
    if (!lote) return
    const am = lote.amostras[i]
    const cfg: Cispr15Config = {
      tipo: lote.tipo, tensaoConfig: '127_220',
      cliente: lote.cliente, clienteRua: lote.clienteRua ?? '',
      clienteCidade: lote.clienteCidade ?? '', clienteCep: lote.clienteCep ?? '',
      produto: am.produto, fabricante: am.fabricante, modelo: am.modelo,
      identificador: am.identificador, lacre: '',
      tensaoAlim: am.tensaoAlim, potencia: am.potencia, frequencia: am.frequencia,
      temDriver: am.temDriver,
      driverProduto: am.driverProduto, driverFabricante: am.driverFabricante,
      driverModelo: am.driverModelo, driverIdentificador: am.driverIdentificador,
      driverPotencia: am.driverPotencia, driverTensaoAlim: am.driverTensaoAlim,
      driverFrequencia: am.driverFrequencia,
      driverOrcamento: am.driverOrcamento, driverProtocolo: am.driverProtocolo,
      documentacao: 'embalagem com especificações',
      numRelatorio: am.numRelatorio, orcamento: am.orcamento, protocolo: am.protocolo,
      periodoInicio: am.periodoInicio, periodoFim: am.periodoFim, dataEmissao: am.dataEmissao,
      responsavel: lote.responsavel,
      resultadoConduzida: 'pass', resultadoLoop: 'pass', resultadoAnexoB: 'pass',
    }
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(am.photos))

    // docxHtml: preferir da memória; fallback: buscar no localStorage pelo relatório salvo
    let docxHtml = am.docxHtml
    if (!docxHtml && am.numRelatorio) {
      try {
        const lista: RelatorioSalvo[] = JSON.parse(localStorage.getItem(RELATORIOS_KEY) ?? '[]')
        const rel = lista.find(r => r.numRelatorio === am.numRelatorio && r.protocolo === am.protocolo)
        if (rel) docxHtml = localStorage.getItem(RELATORIO_DOCX_PFX + rel.id)
      } catch {}
    }

    if (docxHtml) {
      sessionStorage.setItem(DOCX_HTML_KEY, docxHtml)
      sessionStorage.setItem(DOCX_NAME_KEY, am.docxFilename ?? '')
    } else {
      sessionStorage.removeItem(DOCX_HTML_KEY)
      sessionStorage.removeItem(DOCX_NAME_KEY)
    }
    router.push('/cispr15/relatorio?from=lote')
  }

  if (!lote) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-white/20" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto pb-10">

      {/* Header */}
      <div className="mb-6">
        <button type="button" onClick={() => router.push('/cispr15')}
          className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors">
          <ArrowLeft size={14} /> Voltar ao formulário
        </button>
        <p className="form-section mb-1">CISPR 15 · EMC</p>
        <h1 className="text-2xl font-display font-bold text-white">Emitir Lote</h1>
        <p className="text-white/40 text-sm mt-1">Configure cada amostra individualmente antes de emitir</p>
      </div>

      {/* Config bar */}
      <div className="card p-4 mb-5 flex flex-wrap items-center gap-6">
        <div className="flex flex-col gap-2">
          <Label>Amostras</Label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => handleQtd(lote.qtd - 1)}
              className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 flex items-center justify-center transition-all">
              <Minus size={12} />
            </button>
            <span className="text-white font-bold font-mono w-8 text-center">{lote.qtd}</span>
            <button type="button" onClick={() => handleQtd(lote.qtd + 1)}
              className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 flex items-center justify-center transition-all">
              <Plus size={12} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Tipo</Label>
          <div className="flex gap-2">
            {(['lampada', 'luminaria'] as const).map(t => (
              <button key={t} type="button" onClick={() => handleTipo(t)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all',
                  lote.tipo === t ? 'border-gold bg-gold/10 text-gold' : 'border-white/8 text-white/35 hover:border-white/20'
                )}>
                {t === 'lampada' ? <Lightbulb size={11} /> : <Lamp size={11} />}
                {t === 'lampada' ? 'Lâmpada' : 'Luminária'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <Label>Cliente</Label>
          <p className="text-sm text-white/50 truncate">
            {lote.cliente || <span className="text-white/20 italic">não definido</span>}
          </p>
        </div>

        {/* Importar pasta-mãe: casa subpastas com os protocolos das amostras */}
        <div className="flex flex-col gap-2">
          <Label>Pasta-mãe</Label>
          <label className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all',
            importMae?.loading
              ? 'border-blue-300/30 bg-blue-500/8 text-blue-400 pointer-events-none'
              : 'border-gold/40 bg-gold/8 text-gold hover:bg-gold/14',
          )}>
            {importMae?.loading ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
            {importMae?.loading ? 'Importando…' : 'Importar Pasta'}
            <input ref={maeRef} type="file" className="hidden"
              disabled={importMae?.loading}
              {...{ webkitdirectory: '' } as any}
              onChange={e => { if (e.target.files?.length) handlePastaMae(e.target.files); e.target.value = '' }} />
          </label>
        </div>
      </div>

      {importMae?.msg && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-white/4 border border-white/8 text-[12px] text-white/60 flex items-center gap-2">
          <CheckCircle2 size={13} className="text-green-400 shrink-0" /> {importMae.msg}
        </div>
      )}

      {/* Período de todas as amostras de uma vez */}
      <div className="card p-4 mb-5 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 text-gold">
          <CalendarRange size={15} />
          <span className="text-sm font-semibold">Período de todos os ensaios</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Início</Label>
          <input className="input text-sm" type="date" value={lote.bulkInicio ?? ''} onChange={e => saveLote({ ...lote, bulkInicio: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Fim</Label>
          <input
            className={cn('input text-sm', lote.bulkInicio && lote.bulkFim && lote.bulkFim < lote.bulkInicio && 'border-red-500/50')}
            type="date" value={lote.bulkFim ?? ''} onChange={e => saveLote({ ...lote, bulkFim: e.target.value })} />
        </div>
        <button type="button" onClick={aplicarPeriodoTodos}
          className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-gold/40 bg-gold/8 text-gold hover:bg-gold/14 transition-all">
          Aplicar a todas ({lote.qtd})
        </button>
        <span className="text-[10px] text-white/30">Preenche início/fim de todas as amostras; campos vazios não sobrescrevem.</span>
      </div>

      {/* Lista de amostras */}
      <div className="space-y-3">
        {lote.amostras.map((am, i) => (
          <AmostraCard key={i} index={i} amostra={am} tipoLote={lote.tipo}
            expanded={expanded === i}
            onToggle={() => setExpanded(expanded === i ? null : i)}
            onChange={a => updateAmostra(i, a)}
            onVerPDF={() => verPDFAmostra(i)}
            onDelete={lote.amostras.length > 1 ? () => removerAmostra(i) : undefined}
            equipamentos={equipamentos}
          />
        ))}
      </div>

      {/* Resultado de conformidade */}
      {resultado?.checked && (
        <div className={cn(
          'mt-4 px-4 py-3 rounded-xl border text-sm',
          resultado.reprovados.length > 0
            ? 'border-red/20 bg-red/8 text-red-400'
            : 'border-green/20 bg-green/8 text-green-400'
        )}>
          {resultado.reprovados.length === 0 ? (
            <span className="flex items-center gap-2">
              <ShieldCheck size={14} /> Todas as amostras estão conformes.
            </span>
          ) : (
            <div className="space-y-2">
              <span className="flex items-center gap-2 font-medium">
                <ShieldX size={14} />
                {resultado.reprovados.length} amostra(s) reprovada(s) removida(s) do lote e devolvida(s) à agenda:
              </span>
              <ul className="space-y-1.5 pl-1">
                {resultado.reprovados.map((r, k) => (
                  <li key={`${r.protocolo}-${k}`} className="border-l-2 border-red/30 pl-2.5">
                    <span className="font-mono font-semibold text-red-300">Protocolo {r.protocolo}</span>
                    {r.testes.length > 0
                      ? <span className="text-red-400/90"> — reprovação em: <b>{r.testes.join(', ')}</b></span>
                      : <span className="text-red-400/60"> — ensaio não identificado automaticamente</span>}
                    {r.trechos.length > 0 && (
                      <div className="text-[11px] text-white/45 mt-0.5 leading-snug">{r.trechos.join('  ·  ')}</div>
                    )}
                  </li>
                ))}
              </ul>
              <span className="text-[11px] text-white/40 block pt-0.5">
                As amostras voltaram à agenda como pendentes, com o ensaio reprovado marcado nas observações.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 mt-6 pt-5 border-t border-white/8 flex-wrap">
        <button type="button" onClick={verificarConformidade}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 text-sm text-white/50 hover:text-white hover:border-white/25 transition-all">
          <Shield size={13} /> Verificar Conformidade
        </button>
        <button type="button" onClick={() => {
          if (!confirm('Limpar todos os dados do lote?')) return
          localStorage.removeItem(LOTE_KEY)
          const api = (window as any).electronAPI
          if (api?.clearLoteFile) api.clearLoteFile().catch(() => {})
          router.push('/cispr15')
        }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red/20 bg-red/8 text-red-400 hover:bg-red/15 transition-all text-sm">
          <Trash2 size={13} /> Limpar Lote
        </button>
        <div className="flex-1" />
        <button type="button" onClick={() => router.push('/cispr15')}
          className="btn-secondary flex items-center gap-2 px-4 py-2.5 text-sm">
          <ArrowLeft size={13} /> Voltar
        </button>
        <button type="button" onClick={baixarPDFs} disabled={!!baixando || emitindo}
          title="Gera o PDF de cada amostra conforme e salva (PDF + DOCX + fotos) na subpasta do protocolo"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-teal/30 bg-teal/8 text-teal hover:bg-teal/14 transition-all text-sm font-semibold disabled:opacity-50">
          {baixando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {baixando ? `Gerando ${baixando.done}/${baixando.total}…` : 'Baixar PDFs'}
        </button>
        <button type="button" onClick={iniciarEmissao} disabled={emitindo}
          className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold">
          {emitindo ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
          {emitindo ? 'Emitindo…' : 'Emitir Lote'}
        </button>
      </div>

      {/* ── Gate de acesso ── */}
      {gateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-sm mx-4 p-7 space-y-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/12 border border-gold/25 flex items-center justify-center shrink-0">
                <Shield size={18} className="text-gold" />
              </div>
              <div>
                <p className="font-bold text-white">Área de Emissão</p>
                <p className="text-[11px] text-white/40">Informe a senha para acessar</p>
              </div>
            </div>
            <input
              ref={gateInputRef}
              type="password"
              value={gateInput}
              autoFocus
              placeholder="Senha"
              className={cn('input w-full', gateError && 'border-red-500/60')}
              onChange={e => { setGateInput(e.target.value); setGateError(false) }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (gateInput === appPassword) {
                    sessionStorage.setItem(AUTH_KEY, '1')
                    setGateOpen(false); setGateInput('')
                  } else { setGateError(true); setGateInput(''); setTimeout(() => gateInputRef.current?.focus(), 0) }
                }
              }}
            />
            {capsLock && <p className="text-[10px] text-amber-400/80">⇪ Caps Lock ativo</p>}
            {gateError && <p className="text-xs text-red-400">Senha incorreta.</p>}
            <div className="flex gap-2 justify-end">
              <button type="button"
                onClick={() => router.push('/cispr15')}
                className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">
                Cancelar
              </button>
              <button type="button"
                onClick={() => {
                  if (gateInput === appPassword) {
                    sessionStorage.setItem(AUTH_KEY, '1')
                    setGateOpen(false); setGateInput('')
                  } else { setGateError(true); setGateInput(''); setTimeout(() => gateInputRef.current?.focus(), 0) }
                }}
                className="btn-primary px-5 py-2 text-sm font-bold">
                Entrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de confirmação de emissão ── */}
      {emitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="card w-full max-w-md mx-4 p-6 space-y-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/12 border border-gold/25 flex items-center justify-center shrink-0">
                <Users size={18} className="text-gold" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">Confirmação de Emissão</p>
                <p className="text-[11px] text-white/40">Verifique o resumo antes de prosseguir</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-3 text-sm">
              <div className="flex items-center gap-2 text-green-400">
                <ShieldCheck size={14} />
                <span><b>{emitModal.conformes}</b> amostra(s) conforme(s) — serão emitidas</span>
              </div>
              {emitModal.reprovadosNomes.length > 0 && (
                <div className="flex items-start gap-2 text-red-400">
                  <ShieldX size={14} className="mt-0.5 shrink-0" />
                  <span>
                    <b>{emitModal.reprovadosNomes.length}</b> reprovada(s) — serão ignoradas:{' '}
                    <span className="font-mono text-[11px]">{emitModal.reprovadosNomes.join(', ')}</span>
                  </span>
                </div>
              )}
              {emitModal.reprovadosNomes.length === 0 && (
                <div className="flex items-center gap-2 text-white/40 text-xs">
                  <Shield size={12} /> Nenhuma amostra reprovada.
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button type="button"
                onClick={() => setEmitModal(null)}
                className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">
                Cancelar
              </button>
              <button type="button"
                onClick={() => { setEmitModal(null); emitirLote() }}
                className="btn-primary px-5 py-2 text-sm font-bold flex items-center gap-2">
                <ArrowRight size={14} /> Confirmar emissão
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
