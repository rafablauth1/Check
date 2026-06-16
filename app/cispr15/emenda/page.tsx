'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, History, CheckCircle2, AlertCircle, ChevronDown,
  Upload, X, Loader2, Plus, ImageOff, RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type Cispr15Config, type RelatorioSalvo, type AmendmentChange, type EmendaDraft,
  DEFAULTS, CFG_KEY, PHOTOS_KEY, DOCX_HTML_KEY, DOCX_NAME_KEY,
  RELATORIOS_KEY, EMENDA_DRAFT_KEY, RELATORIO_DOCX_PFX, today, formatEmendaNumero,
} from '../types'
import { filterDocxForResult } from '../docx-filter'

/* ─── resize helper ───────────────────────────────────────────────────────── */
async function resizeToBase64(file: File, maxW = 1000, maxH = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      let { width: w, height: h } = img
      if (w > maxW || h > maxH) {
        const r = Math.min(maxW / w, maxH / h)
        w = Math.round(w * r); h = Math.round(h * r)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = url
  })
}

/* ─── diff engine ─────────────────────────────────────────────────────────── */
type PhotoEntry = { name: string; base64: string }

function detectChanges(
  original: Cispr15Config,
  amended: Cispr15Config,
  photosAlteradas: boolean[],
  photosNovas: (PhotoEntry | null | undefined)[],
  originalPhotosLen: number,
  resultadosAlterados: { conduzida: boolean; loop: boolean; anexoB: boolean },
): AmendmentChange[] {
  const changes: AmendmentChange[] = []
  let m = 1

  const fieldLabel: Partial<Record<keyof Cispr15Config, string>> = {
    cliente: 'Cliente', clienteRua: 'Endereço', clienteCidade: 'Cidade', clienteCep: 'CEP',
    produto: 'Produto', fabricante: 'Fabricante', modelo: 'Modelo', identificador: 'Identificador',
    tensaoAlim: 'Tensão de Alimentação', potencia: 'Potência', frequencia: 'Frequência',
    periodoInicio: 'Início do Período', periodoFim: 'Fim do Período', dataEmissao: 'Data de Emissão',
    documentacao: 'Documentação', protocolo: 'Protocolo', orcamento: 'Orçamento',
  }
  const diffCampos = (keys: (keyof Cispr15Config)[]) =>
    keys.filter(k => String(original[k] ?? '') !== String(amended[k] ?? ''))
      .map(k => fieldLabel[k] ?? String(k))

  const clienteCampos = diffCampos(['cliente', 'clienteRua', 'clienteCidade', 'clienteCep'])
  if (clienteCampos.length > 0)
    changes.push({ marker: m++, campo: 'cliente', descricao: 'Alteração nos dados do cliente', campos: clienteCampos })

  const amostraCampos = diffCampos(['produto', 'fabricante', 'modelo', 'identificador'])
  if (amostraCampos.length > 0)
    changes.push({ marker: m++, campo: 'amostra', descricao: 'Alteração nos dados da amostra', campos: amostraCampos })

  const tecnicoCampos = diffCampos(['tensaoAlim', 'potencia', 'frequencia'])
  if (tecnicoCampos.length > 0)
    changes.push({ marker: m++, campo: 'tecnico', descricao: 'Alteração nos dados técnicos da amostra', campos: tecnicoCampos })

  const periodoCampos = diffCampos(['periodoInicio', 'periodoFim', 'dataEmissao'])
  if (periodoCampos.length > 0)
    changes.push({ marker: m++, campo: 'periodo', descricao: 'Alteração no período de realização dos ensaios', campos: periodoCampos })

  const docCampos = diffCampos(['documentacao'])
  if (docCampos.length > 0)
    changes.push({ marker: m++, campo: 'documentacao', descricao: 'Alteração na documentação que acompanha a amostra' })

  const protoCampos = diffCampos(['protocolo', 'orcamento'])
  if (protoCampos.length > 0)
    changes.push({ marker: m++, campo: 'protocolo', descricao: 'Alteração nos dados de protocolo', campos: protoCampos })

  if (resultadosAlterados.conduzida)
    changes.push({ marker: m++, campo: 'resultados_conduzida', descricao: 'Alteração nos resultados — Perturbações Conduzidas' })
  if (resultadosAlterados.loop)
    changes.push({ marker: m++, campo: 'resultados_loop', descricao: 'Alteração nos resultados — Perturbações Radiadas (Loop 9 kHz–30 MHz)' })
  if (resultadosAlterados.anexoB)
    changes.push({ marker: m++, campo: 'resultados_anexoB', descricao: 'Alteração nos resultados — Perturbações Radiadas (Anexo B 30–300 MHz)' })
  photosAlteradas.forEach((changed, i) => {
    if (!changed) return
    const entry = photosNovas[i]
    const isNew = i >= originalPhotosLen && entry != null
    const isRemoved = entry === null
    const descricao = isRemoved
      ? `Remoção da Figura ${i + 1} – Amostra ensaiada`
      : isNew
        ? `Adição de Figura ${i + 1} – Amostra ensaiada`
        : `Substituição da Figura ${i + 1} – Amostra ensaiada`
    changes.push({ marker: m++, campo: `foto_${i + 1}`, descricao })
  })
  return changes
}

/* ─── helpers de campo ────────────────────────────────────────────────────── */
function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">{children}</label>
}

function Field({
  label, value, original, onChange, type = 'text',
}: {
  label: string; value: string; original: string
  onChange: (v: string) => void; type?: string
}) {
  const changed = value !== original
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        {changed && (
          <span className="text-[9px] font-mono text-amber-400 border border-amber-500/30 rounded px-1 py-0.5">alterado</span>
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'input text-sm',
          changed && 'border-amber-500/50 focus:border-amber-400 ring-amber-400/20',
        )}
      />
      {changed && (
        <p className="text-[9px] text-white/25 font-mono">Original: {original || '—'}</p>
      )}
    </div>
  )
}

/* ─── página ──────────────────────────────────────────────────────────────── */
export default function EmendaPage() {
  const router = useRouter()
  const [relatorios,  setRelatorios]  = useState<RelatorioSalvo[]>([])
  const [selectedId,  setSelectedId]  = useState<string>('')
  const [cfg,         setCfg]         = useState<Cispr15Config>(DEFAULTS)
  const [dataEmenda,  setDataEmenda]  = useState(today())
  const [photosNovas, setPhotosNovas] = useState<(PhotoEntry | null | undefined)[]>([])
  const [selectedDocxHtml, setSelectedDocxHtml] = useState<string | null>(null)

  type ResultSlot = { checked: boolean; html: string | null; name: string | null; loading: boolean }
  const emptySlot = (): ResultSlot => ({ checked: false, html: null, name: null, loading: false })
  const [resultados, setResultados] = useState<{ conduzida: ResultSlot; loop: ResultSlot; anexoB: ResultSlot }>({
    conduzida: emptySlot(), loop: emptySlot(), anexoB: emptySlot(),
  })

  useEffect(() => {
    async function load() {
      const api = (window as any).electronAPI
      let lista: RelatorioSalvo[] = []
      // Lista vem da rede (índice compartilhado); fallback no localStorage deste PC
      if (api?.getRelatorios) {
        try {
          const res = await api.getRelatorios()
          if (res?.ok && Array.isArray(res.relatorios) && res.relatorios.length) lista = res.relatorios
        } catch {}
      }
      if (!lista.length) {
        try { const raw = localStorage.getItem(RELATORIOS_KEY); if (raw) lista = JSON.parse(raw) } catch {}
      }
      setRelatorios(lista)
      if (lista.length > 0) {
        const last = lista[lista.length - 1]
        setSelectedId(last.id)
        setCfg({ ...(last.currentCfg ?? last.cfg) })
        carregarAssets(last)
      }
    }
    load()
  }, [])

  /* Resolve fotos + DOCX do relatório (local → rede) e injeta as fotos no item da
     lista, para a emenda mostrar/mesclar os originais mesmo em outro PC. */
  async function carregarAssets(entry: RelatorioSalvo) {
    let photos = entry.photos ?? []
    let docxHtml = localStorage.getItem(RELATORIO_DOCX_PFX + entry.id)
    if (!photos.length) {
      try {
        const raw = localStorage.getItem(RELATORIOS_KEY)
        if (raw) { const f = (JSON.parse(raw) as RelatorioSalvo[]).find(r => r.id === entry.id); if (f?.photos?.length) photos = f.photos }
      } catch {}
    }
    if (!photos.length || !docxHtml) {
      const api = (window as any).electronAPI
      if (api?.getRelatorioAssets) {
        try {
          const res = await api.getRelatorioAssets(entry.id)
          if (res?.ok) {
            if (!photos.length && Array.isArray(res.photos)) photos = res.photos
            if (!docxHtml && res.docxHtml) docxHtml = res.docxHtml
          }
        } catch {}
      }
    }
    setSelectedDocxHtml(docxHtml || null)
    if (photos.length) setRelatorios(prev => prev.map(r => r.id === entry.id ? { ...r, photos } : r))
  }

  const selected = useMemo(
    () => relatorios.find(r => r.id === selectedId) ?? null,
    [relatorios, selectedId],
  )

  const numFotos   = Math.max(selected?.photos.length ?? 2, 4)
  const totalFotos = Math.max(numFotos, photosNovas.length)

  const photosAlteradas = useMemo(
    () => Array.from({ length: totalFotos }, (_, i) => photosNovas[i] !== undefined),
    [totalFotos, photosNovas],
  )

  function selectReport(id: string) {
    setSelectedId(id)
    const r = relatorios.find(r => r.id === id)
    if (r) {
      setCfg({ ...(r.currentCfg ?? r.cfg) })
      setPhotosNovas([])
      setSelectedDocxHtml(null)
      setResultados({ conduzida: emptySlot(), loop: emptySlot(), anexoB: emptySlot() })
      carregarAssets(r)
    }
  }

  async function handlePhotoUpload(file: File, index: number) {
    const full   = await resizeToBase64(file)
    const base64 = full.replace(/^data:image\/\w+;base64,/, '')
    setPhotosNovas(prev => {
      const next = [...prev]
      while (next.length <= index) next.push(undefined)
      next[index] = { name: file.name, base64 }
      return next
    })
  }

  function handlePhotoRemove(index: number) {
    const hasOriginal = !!selected?.photos[index]
    setPhotosNovas(prev => {
      const next = [...prev]
      while (next.length <= index) next.push(undefined)
      if (hasOriginal) {
        next[index] = null
      } else {
        next[index] = undefined
        while (next.length > 0 && next[next.length - 1] === undefined) next.pop()
      }
      return next
    })
  }

  function handlePhotoRestore(index: number) {
    setPhotosNovas(prev => {
      const next = [...prev]
      next[index] = undefined
      while (next.length > 0 && next[next.length - 1] === undefined) next.pop()
      return next
    })
  }

  async function handleNovoDocx(file: File, key: keyof typeof resultados) {
    setResultados(prev => ({ ...prev, [key]: { ...prev[key], loading: true } }))
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/parse-docx', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResultados(prev => ({ ...prev, [key]: { ...prev[key], html: data.html, name: file.name, loading: false } }))
    } catch (err: any) {
      alert(`Erro ao processar .docx: ${err.message}`)
      setResultados(prev => ({ ...prev, [key]: { ...prev[key], loading: false } }))
    }
  }

  const set = (k: keyof Cispr15Config) => (v: string) =>
    setCfg(prev => ({ ...prev, [k]: v }))

  const alteracoes = useMemo(
    () => selected ? detectChanges(
      selected.cfg, cfg, photosAlteradas, photosNovas,
      selected.photos.length,
      {
        conduzida: resultados.conduzida.checked,
        loop:      resultados.loop.checked,
        anexoB:    resultados.anexoB.checked,
      },
    ) : [],
    [selected, cfg, photosAlteradas, photosNovas, resultados],
  )

  function gerarEmenda() {
    if (!selected) return
    if (alteracoes.length === 0) {
      alert('Nenhuma alteração detectada. Edite pelo menos um campo.')
      return
    }
    const emendaNum = (selected.emendas.length || 0) + 1
    const draft: EmendaDraft = {
      relatorioId: selected.id,
      numRelatorioOriginal: selected.numRelatorio,
      emendaNum,
      dataEmenda,
      alteracoes,
      cfgOriginal: selected.cfg,
      photoNamesOriginal: selected.photos.map(p => p.name),
      docxFilenameOriginal: selected.docxFilename,
      eutFolderPath: selected.eutFolderPath,
    }
    localStorage.setItem(EMENDA_DRAFT_KEY, JSON.stringify(draft))
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg))

    // Commit emenda imediatamente para que apareça na aba de emendas antes do PDF.
    // Usa o estado (que vem da rede) — funciona mesmo num PC sem cache local.
    try {
      const base: RelatorioSalvo[] = relatorios.length
        ? relatorios
        : (() => { try { return JSON.parse(localStorage.getItem(RELATORIOS_KEY) || '[]') } catch { return [] } })()
      const lista: RelatorioSalvo[] = base.map(r => ({ ...r }))
      const idx = lista.findIndex(r => r.id === selected.id)
      if (idx >= 0) {
        const emendas = [...(lista[idx].emendas ?? [])]
        if (!emendas.find(e => e.numero === emendaNum)) {
          emendas.push({ numero: emendaNum, dataEmenda, alteracoes })
        }
        lista[idx] = { ...lista[idx], emendas, currentCfg: cfg }
        setRelatorios(lista)
        const api = (window as any).electronAPI
        if (api?.saveRelatorios) {
          try { api.saveRelatorios(lista.map((r: RelatorioSalvo) => ({ ...r, photos: [] }))).catch(() => {}) } catch {}
        }
        // Cache local: atualiza só a entrada deste id, preservando as fotos locais
        try {
          const rawLocal = localStorage.getItem(RELATORIOS_KEY)
          if (rawLocal) {
            const localList: RelatorioSalvo[] = JSON.parse(rawLocal)
            const li = localList.findIndex(r => r.id === selected.id)
            if (li >= 0) {
              localList[li] = { ...localList[li], emendas, currentCfg: cfg }
              localStorage.setItem(RELATORIOS_KEY, JSON.stringify(localList))
            }
          }
        } catch {}
      }
    } catch {}

    // Build merged photos: originals overridden/extended by photosNovas
    const mergedPhotos: PhotoEntry[] = []
    for (let i = 0; i < totalFotos; i++) {
      const entry = photosNovas[i]
      if (entry === null) continue          // removed
      if (entry !== undefined) {
        mergedPhotos.push(entry)            // new / replaced
      } else if (selected.photos[i]) {
        mergedPhotos.push(selected.photos[i]) // original unchanged
      }
    }
    try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(mergedPhotos)) } catch {}

    const htmlParts: string[] = []
    const nameParts: string[] = []
    if (resultados.conduzida.checked && resultados.conduzida.html) {
      htmlParts.push(filterDocxForResult(resultados.conduzida.html, 'conduzida'))
      if (resultados.conduzida.name) nameParts.push(resultados.conduzida.name)
    }
    if (resultados.loop.checked && resultados.loop.html) {
      htmlParts.push(filterDocxForResult(resultados.loop.html, 'loop'))
      if (resultados.loop.name) nameParts.push(resultados.loop.name)
    }
    if (resultados.anexoB.checked && resultados.anexoB.html) {
      htmlParts.push(filterDocxForResult(resultados.anexoB.html, 'anexoB'))
      if (resultados.anexoB.name) nameParts.push(resultados.anexoB.name)
    }
    let finalDocxHtml: string | null
    if (htmlParts.length > 0) {
      finalDocxHtml = htmlParts.join('\n')
      sessionStorage.setItem(DOCX_HTML_KEY, finalDocxHtml)
      sessionStorage.setItem(DOCX_NAME_KEY, nameParts.join(' + '))
    } else {
      finalDocxHtml = selectedDocxHtml ?? localStorage.getItem(RELATORIO_DOCX_PFX + selected.id)
      if (finalDocxHtml) sessionStorage.setItem(DOCX_HTML_KEY, finalDocxHtml)
      else sessionStorage.removeItem(DOCX_HTML_KEY)
      sessionStorage.setItem(DOCX_NAME_KEY, selected.docxFilename ?? '')
    }

    // Atualiza os assets na rede com as fotos mescladas e o docx final,
    // para o relatório emendado reabrir completo em qualquer PC.
    const api2 = (window as any).electronAPI
    if (api2?.saveRelatorioAssets) {
      try { api2.saveRelatorioAssets(selected.id, mergedPhotos, finalDocxHtml).catch(() => {}) } catch {}
    }

    router.push('/cispr15/relatorio')
  }

  if (relatorios.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm mb-8">
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="card p-8 text-center">
          <History size={36} className="text-white/15 mx-auto mb-4" />
          <p className="text-white/50 text-sm mb-2">Nenhum relatório salvo</p>
          <p className="text-white/25 text-xs">
            Gere e baixe um PDF primeiro para criar uma emenda.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm mb-6">
        <ArrowLeft size={14} /> Voltar
      </button>

      <div className="mb-6">
        <p className="form-section mb-1">Formulários de Ensaio · EMC · CISPR 15</p>
        <h1 className="text-2xl font-display font-bold text-white">Gerar Emenda</h1>
        <p className="text-white/40 text-sm mt-1">Edite os campos alterados — diferenças são detectadas automaticamente</p>
      </div>

      {/* Seleção do relatório */}
      <div className="card p-5 mb-4">
        <p className="form-section mb-3">Relatório original</p>
        <div className="relative">
          <select
            value={selectedId}
            onChange={e => selectReport(e.target.value)}
            className="input w-full appearance-none pr-8 text-sm"
          >
            {relatorios.map(r => (
              <option key={r.id} value={r.id}>
                {r.numRelatorio} — {r.clienteNome} — {r.dataEmissao}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
        </div>
        {selected && (
          <p className="text-[10px] text-white/25 font-mono mt-2">
            Emendas anteriores: {selected.emendas.length === 0 ? 'nenhuma' : selected.emendas.map(e => formatEmendaNumero(selected.numRelatorio, e.numero)).join(', ')} ·
            Próxima: {formatEmendaNumero(selected.numRelatorio, (selected.emendas.length || 0) + 1)}
          </p>
        )}
      </div>

      {/* Data da emenda */}
      <div className="card p-5 mb-4">
        <p className="form-section mb-3">Data da Emenda</p>
        <input
          type="date" value={dataEmenda}
          onChange={e => setDataEmenda(e.target.value)}
          className="input w-48 text-sm"
        />
      </div>

      {/* ── Cliente ── */}
      <div className="card p-5 mb-4">
        <p className="form-section mb-4">Cliente</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <div className="col-span-2">
            <Field label="Nome do Cliente" value={cfg.cliente} original={selected?.cfg.cliente ?? ''} onChange={set('cliente')} />
          </div>
          <div className="col-span-2">
            <Field label="Rua – Número – Bairro" value={cfg.clienteRua} original={selected?.cfg.clienteRua ?? ''} onChange={set('clienteRua')} />
          </div>
          <Field label="Cidade – Estado" value={cfg.clienteCidade} original={selected?.cfg.clienteCidade ?? ''} onChange={set('clienteCidade')} />
          <Field label="CEP" value={cfg.clienteCep} original={selected?.cfg.clienteCep ?? ''} onChange={set('clienteCep')} />
        </div>
      </div>

      {/* ── Objeto Ensaiado ── */}
      <div className="card p-5 mb-4">
        <p className="form-section mb-4">Objeto Ensaiado</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <div className="col-span-2">
            <Field label="Produto / Descrição" value={cfg.produto} original={selected?.cfg.produto ?? ''} onChange={set('produto')} />
          </div>
          <Field label="Fabricante" value={cfg.fabricante} original={selected?.cfg.fabricante ?? ''} onChange={set('fabricante')} />
          <Field label="Modelo" value={cfg.modelo} original={selected?.cfg.modelo ?? ''} onChange={set('modelo')} />
          <Field label="Código de Barras / N° Série" value={cfg.identificador} original={selected?.cfg.identificador ?? ''} onChange={set('identificador')} />
          <Field label="Potência Nominal" value={cfg.potencia} original={selected?.cfg.potencia ?? ''} onChange={set('potencia')} />
          <Field label="Tensão de Alimentação" value={cfg.tensaoAlim} original={selected?.cfg.tensaoAlim ?? ''} onChange={set('tensaoAlim')} />
          <Field label="Frequência de Rede" value={cfg.frequencia} original={selected?.cfg.frequencia ?? ''} onChange={set('frequencia')} />
        </div>
      </div>

      {/* ── Documentação ── */}
      <div className="card p-5 mb-4">
        <p className="form-section mb-4">Documentação / Período</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <div className="col-span-2">
            <Field label="Documentação que acompanha a amostra" value={cfg.documentacao} original={selected?.cfg.documentacao ?? ''} onChange={set('documentacao')} />
          </div>
          <Field label="Protocolo LABELO" value={cfg.protocolo} original={selected?.cfg.protocolo ?? ''} onChange={set('protocolo')} />
          <Field label="Orçamento LABELO" value={cfg.orcamento} original={selected?.cfg.orcamento ?? ''} onChange={set('orcamento')} />
          <Field label="Período — Início" value={cfg.periodoInicio} original={selected?.cfg.periodoInicio ?? ''} onChange={set('periodoInicio')} type="date" />
          <Field label="Período — Fim" value={cfg.periodoFim} original={selected?.cfg.periodoFim ?? ''} onChange={set('periodoFim')} type="date" />
          <div className="col-span-2">
            <Field label="Data de Emissão" value={cfg.dataEmissao} original={selected?.cfg.dataEmissao ?? ''} onChange={set('dataEmissao')} type="date" />
          </div>
        </div>
      </div>

      {/* ── Fotos ── */}
      <div className="card p-5 mb-4">
        <p className="form-section mb-1">Fotos da amostra</p>
        <p className="text-[10px] text-white/25 font-mono mb-4">
          Passe o mouse sobre a foto para substituir ou remover · clique em "+" para adicionar
        </p>

        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: totalFotos }, (_, i) => {
            const origPhoto    = selected?.photos[i]
            const newEntry     = photosNovas[i]
            const isChanged    = newEntry !== undefined
            const isRemoved    = newEntry === null
            const displayPhoto = isRemoved ? null : (newEntry ?? origPhoto ?? null)

            return (
              <div key={i} className={cn(
                'rounded-xl border overflow-hidden',
                isChanged ? 'border-amber-500/35' : 'border-white/8',
              )}>
                {/* Thumbnail */}
                <div className="h-28 relative bg-white/2 flex items-center justify-center overflow-hidden">
                  {displayPhoto ? (
                    <>
                      <img
                        src={`data:image/jpeg;base64,${displayPhoto.base64}`}
                        className="w-full h-full object-cover"
                        alt={`Figura ${i + 1}`}
                      />
                      <div className="absolute inset-0 bg-black/65 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="cursor-pointer flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-[11px] text-white transition-all">
                          <Upload size={10} /> Substituir
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f, i) }} />
                        </label>
                        <button
                          type="button"
                          onClick={() => handlePhotoRemove(i)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/25 hover:bg-red-500/45 text-[11px] text-red-300 transition-all">
                          <X size={10} /> Remover
                        </button>
                      </div>
                    </>
                  ) : isRemoved ? (
                    <div className="flex flex-col items-center gap-1.5 text-red-400/50">
                      <ImageOff size={22} />
                      <span className="text-[10px] font-mono">Removida</span>
                      {origPhoto && (
                        <button
                          type="button"
                          onClick={() => handlePhotoRestore(i)}
                          className="flex items-center gap-1 text-[10px] text-white/35 hover:text-white/70 mt-1 px-2 py-1 rounded border border-white/10 transition-all">
                          <RotateCcw size={9} /> Restaurar
                        </button>
                      )}
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center gap-1.5 text-white/20 hover:text-teal/60 transition-colors w-full h-full justify-center">
                      <Upload size={20} />
                      <span className="text-[10px] font-mono">Adicionar</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f, i) }} />
                    </label>
                  )}
                </div>

                {/* Footer */}
                <div className={cn(
                  'px-2.5 py-1.5 flex items-center gap-1.5',
                  isChanged ? 'bg-amber-500/8' : '',
                )}>
                  <span className="text-[10px] font-mono text-white/35 shrink-0">Fig. {i + 1}</span>
                  {isChanged && !isRemoved && (
                    <span className="text-[9px] font-mono text-amber-400 border border-amber-500/30 rounded px-1 leading-tight">alterada</span>
                  )}
                  {isRemoved && (
                    <span className="text-[9px] font-mono text-red-400 border border-red-500/30 rounded px-1 leading-tight">removida</span>
                  )}
                  {displayPhoto?.name && (
                    <span className="text-[9px] font-mono text-white/20 truncate flex-1 text-right">{displayPhoto.name}</span>
                  )}
                </div>
              </div>
            )
          })}

          {/* Add new photo */}
          <label className="rounded-xl border border-dashed border-white/12 hover:border-teal/35 hover:bg-teal/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 h-36 text-white/20 hover:text-teal/60">
            <Plus size={20} />
            <span className="text-[10px] font-mono">Nova foto</span>
            <input type="file" accept="image/*" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handlePhotoUpload(f, Math.max(numFotos, photosNovas.length))
              }} />
          </label>
        </div>
      </div>

      {/* ── Resultados dos ensaios ── */}
      <div className="card p-5 mb-4">
        <p className="form-section mb-3">Resultados dos Ensaios</p>
        <p className="text-[10px] text-white/30 font-mono mb-3">
          Marque e carregue um novo .docx para substituir os resultados
        </p>
        <div className="space-y-3">
          {(
            [
              { key: 'conduzida' as const, label: 'Perturbações Conduzidas' },
              { key: 'loop'      as const, label: 'Perturbações Radiadas – Loop (9 kHz–30 MHz)' },
              { key: 'anexoB'    as const, label: 'Perturbações Radiadas – Anexo B (30–300 MHz)' },
            ] as const
          ).map(({ key, label }) => {
            const slot = resultados[key]
            return (
              <div key={key}>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={slot.checked}
                    onChange={e => {
                      const checked = e.target.checked
                      setResultados(prev => ({
                        ...prev,
                        [key]: { ...prev[key], checked, ...(checked ? {} : { html: null, name: null }) },
                      }))
                    }}
                    className="w-4 h-4 rounded accent-amber-400 cursor-pointer"
                  />
                  <span className="text-sm text-white/60 group-hover:text-white/80">{label}</span>
                </label>
                {slot.checked && (
                  <div className="ml-7 mt-1.5">
                    {slot.html ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
                        <CheckCircle2 size={12} className="text-amber-400 flex-shrink-0" />
                        <span className="text-amber-300 text-[11px] font-mono truncate flex-1">{slot.name}</span>
                        <button type="button"
                          onClick={() => setResultados(prev => ({ ...prev, [key]: { ...prev[key], html: null, name: null } }))}
                          className="text-white/25 hover:text-red-400 transition-colors flex-shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                    ) : slot.loading ? (
                      <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-blue-400">
                        <Loader2 size={11} className="animate-spin" /> Processando…
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-amber-500/30 text-amber-400/70 hover:border-amber-400/50 hover:text-amber-400 cursor-pointer transition-all text-[11px]">
                        <Upload size={11} /> Carregar .docx de substituição (opcional)
                        <input type="file" accept=".docx" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleNovoDocx(f, key) }} />
                      </label>
                    )}
                    <p className="text-[9px] text-white/20 font-mono mt-1">
                      Se não carregar um arquivo, o .docx original será mantido para este ensaio.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Resumo das alterações ── */}
      <div className={cn(
        'card p-5 mb-6 border',
        alteracoes.length > 0
          ? 'border-amber-500/25 bg-amber-500/5'
          : 'border-white/5',
      )}>
        <div className="flex items-center gap-2 mb-3">
          {alteracoes.length > 0
            ? <AlertCircle size={14} className="text-amber-400" />
            : <CheckCircle2 size={14} className="text-white/20" />}
          <p className="text-sm font-medium text-white/70">
            {alteracoes.length === 0
              ? 'Nenhuma alteração detectada'
              : `${alteracoes.length} alteração(ões) detectada(s)`}
          </p>
        </div>
        {alteracoes.length > 0 && (
          <ul className="space-y-1.5">
            {alteracoes.map(a => (
              <li key={a.campo} className="flex items-start gap-2 text-xs text-amber-300/80">
                <span className="font-mono font-bold text-amber-400 w-4 text-center shrink-0">{a.marker}</span>
                <span>
                  {a.descricao}
                  {a.campos && a.campos.length > 0 && (
                    <span className="text-amber-400/60"> — {a.campos.join(', ')}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="btn-secondary flex items-center gap-2 px-4 py-2.5 text-sm">
          Cancelar
        </button>
        <div className="flex-1" />
        <button
          onClick={gerarEmenda}
          disabled={alteracoes.length === 0}
          className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold disabled:opacity-40">
          <History size={14} /> Gerar {selected ? formatEmendaNumero(selected.numRelatorio, (selected.emendas.length || 0) + 1) : 'Emenda'}
        </button>
      </div>
    </div>
  )
}
