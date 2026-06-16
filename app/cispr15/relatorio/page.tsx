'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Upload, X, Loader2, FolderOpen, PenLine, CheckCircle2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { finalizarMarcador, registrarTempo } from '@/lib/tempos'
import {
  type Cispr15Config, type EmendaDraft, type RelatorioSalvo,
  getTensoes, CFG_KEY, PHOTOS_KEY, DOCX_HTML_KEY, DOCX_NAME_KEY,
  RELATORIOS_KEY, EMENDA_DRAFT_KEY, formatEmendaNumero,
} from '../types'
import { filterDocxForResult, type ResultKey } from '../docx-filter'

/* ─── tipos ────────────────────────────────────────────────────────────────── */
interface DocxState { loading: boolean; html: string | null; filename: string | null }
interface Photo     { url: string; name: string }

const RESULT_KEYS = ['conduzida', 'loop', 'anexoB'] as const
const RESULT_LABEL: Record<ResultKey, string> = {
  conduzida: 'Conduzida',
  loop:      'Loop',
  anexoB:    'Anexo B',
}
interface PerResultDocx { html: string | null; filename: string | null; loading: boolean }
type PerResultState = Record<ResultKey, PerResultDocx>
const emptyPerResult = (): PerResultState => ({
  conduzida: { html: null, filename: null, loading: false },
  loop:      { html: null, filename: null, loading: false },
  anexoB:    { html: null, filename: null, loading: false },
})


const LABEL_ID: Record<string, string> = { lampada: 'Número de série', luminaria: 'N° de Série' }
const BLUE = '#003366'
const PUCRS_LOGO = '/formularios/emc/pucrs-logo.png'
const CRL_BADGE  = '/formularios/emc/crl0075.jpg'

/* ─── estilos de texto base (Arial 11pt) ───────────────────────────────────── */
const FS = { base: '11pt', med: '10pt', sm: '9pt', xs: '8pt', xxs: '7pt' } as const

const GRAY1 = '#C8C8C8'  // cabeçalhos de seção e th de tabela
const GRAY2 = '#E5E5E5'  // sub-títulos e áreas de info

const p:      React.CSSProperties = { marginBottom: 5,  fontSize: FS.base, fontFamily: 'Arial, sans-serif' }
const pJ:     React.CSSProperties = { ...p, textAlign: 'justify' }
const pTitle: React.CSSProperties = { ...p, fontWeight: 700, marginTop: 8,  marginBottom: 12, background: GRAY2, padding: '2px 8px' }
const pSub:   React.CSSProperties = { ...p, fontWeight: 700, background: GRAY2, padding: '2px 8px' }

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

/* ─── rodapé ────────────────────────────────────────────────────────────────── */
function PageFooter() {
  return (
    <div className="page-footer" style={{ flexShrink: 0 }}>
      <div style={{
        borderTop: '3px solid #3C3C3C',
        background: '#EFEFEF',
        display: 'flex',
        alignItems: 'center',
        padding: '5px 14mm',
        gap: 8,
        fontSize: FS.xxs,
        color: '#333',
        lineHeight: 1.5,
      }}>
        {/* esquerda: nome */}
        <div style={{ fontWeight: 700, color: '#000', whiteSpace: 'nowrap', flexShrink: 0 }}>
          LABELO<br />PUCRS
        </div>
        {/* centro: endereço + contatos juntos */}
        <div style={{ flex: 1, textAlign: 'center', fontSize: '6.5pt', color: '#444' }}>
          Av. Ipiranga n° 6681, Prédio 30 Bloco A, Sala 210 – Partenon · CEP 90619-900 – Porto Alegre – RS – Brasil<br />
          Tel.: (51) 3320 3551 · labelo@pucrs.br · www.labelo.com.br
        </div>
        {/* direita: nº de página (print only) */}
        <span className="page-num-label" style={{ whiteSpace: 'nowrap', flexShrink: 0, fontSize: '6.5pt', color: '#444' }} />
      </div>
    </div>
  )
}

/* ─── wrapper de página A4 com margens Word (15 mm topo) ───────────────────── */
function Page({ children, first, flow }: { children: React.ReactNode; first?: boolean; flow?: boolean }) {
  return (
    <div className={cn('doc-page', first && 'doc-page-first', flow && 'doc-page-flow')}>
      <div className="doc-page-inner" style={{ padding: '15mm 14mm 14mm', boxSizing: 'border-box' as const }}>
        {children}
      </div>
      <PageFooter />
    </div>
  )
}

/* ─── cabeçalho repetido (páginas 2+) — idêntico à faixa cinza da capa ─────── */
function PageHeader({ cfg, numDisplay }: { cfg: Cispr15Config; numDisplay?: string }) {
  const amostraParts = [cfg.produto, cfg.modelo, cfg.fabricante].filter(Boolean)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ background: GRAY2, border: '1px solid #999', padding: '5px 14px 8px' }}>
        <p style={{ textAlign: 'center', fontSize: '6.5pt', fontStyle: 'italic', color: '#000', margin: '0 0 5px' }}>
          Laboratório de Ensaio acreditado pela Cgcre de acordo com a ABNT NBR ISO/IEC 17025 sob o número CRL 0075
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13pt', fontWeight: 700, color: '#000' }}>Relatório de Ensaio</span>
          <span style={{ fontSize: '13pt', fontWeight: 700, color: '#000' }}>N° {(numDisplay ?? cfg.numRelatorio) || '—'}</span>
        </div>
      </div>
      <div style={{ background: '#fff', padding: '3px 14px 4px' }}>
        {amostraParts.length > 0 && (
          <p style={{ textAlign: 'center', fontSize: '8pt', color: '#000', margin: '0 0 1px' }}>
            {amostraParts.join(' · ')}
          </p>
        )}
        <p style={{ textAlign: 'right', fontSize: '7.5pt', color: '#000', margin: 0 }}>
          Período: {fmtDate(cfg.periodoInicio)} a {fmtDate(cfg.periodoFim)} · Emissão: {fmtDate(cfg.dataEmissao)}
        </p>
      </div>
    </div>
  )
}

/* ─── barra de seção azul ─────────────────────────────────────────────────── */
function SecHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: GRAY1, color: '#000',
      fontSize: FS.base, fontWeight: 700,
      padding: '4px 10px',
      margin: '8px 0 8px',
    }}>
      {children}
    </div>
  )
}

/* ─── marcador de emenda (superscript vermelho) ─────────────────────────── */
function Sup({ n }: { n: number | null }) {
  if (n === null) return null
  return <sup style={{ fontSize: '7pt', color: '#c00', fontWeight: 700, marginLeft: 2 }}>{n}</sup>
}

/* ─── tabela de limites ───────────────────────────────────────────────────── */
function LimitTable({ cols, rows, note }: { cols: string[]; rows: string[][]; note?: string }) {
  const td: React.CSSProperties = { border: '1px solid #999', padding: '1px 4px', textAlign: 'center', fontSize: FS.sm }
  const th: React.CSSProperties = { ...td, background: GRAY1, color: '#000', fontWeight: 700 }
  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
        <thead><tr>{cols.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f5f8ff' }}>
              {r.map((cell, j) => <td key={j} style={td}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p style={{ fontSize: FS.xxs, color: '#555', marginBottom: 6 }}>{note}</p>}
    </>
  )
}

/* ─── página principal ─────────────────────────────────────────────────────── */
export default function Cispr15RelatorioPage() {
  const router = useRouter()
  const [fromLote,   setFromLote]   = useState(false)
  const [eutFolder,  setEutFolder]  = useState<string | null>(null)
  const [cfg,          setCfg]         = useState<Cispr15Config | null>(null)
  const [docx,         setDocx]        = useState<DocxState>({ loading: false, html: null, filename: null })
  const [wmfErrors,    setWmfErrors]   = useState<string[]>([])
  const [perResult,    setPerResult]   = useState<PerResultState>(emptyPerResult())
  const [photos,       setPhotos]      = useState<Photo[]>([])
  const [photoWidth,   setPhotoWidth]  = useState(160)
  const [pastaLoading, setPastaLoading] = useState(false)
  const [gerando,      setGerando]     = useState(false)
  const [savedFile,    setSavedFile]   = useState<string | null>(null)
  const [emendaDraft,  setEmendaDraft] = useState<EmendaDraft | null>(null)
  const [hasCert,      setHasCert]     = useState(false)
  const [signState,    setSignState]   = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [signMsg,      setSignMsg]     = useState('')
  const [savingFiles,  setSavingFiles] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const photoRef    = useRef<HTMLInputElement>(null)
  const pastaRef    = useRef<HTMLInputElement>(null)
  const isPrintMode = useRef(false)

  const effectiveDocxHtml = useMemo(() => {
    const parts = RESULT_KEYS
      .map(k => perResult[k].html ? filterDocxForResult(perResult[k].html!, k) : null)
      .filter(Boolean) as string[]
    return parts.length > 0 ? parts.join('\n') : docx.html
  }, [perResult, docx.html])

  const docxPages = useMemo(() => {
    if (!effectiveDocxHtml) return []
    const docxHtml = effectiveDocxHtml

    function sortPeakTables(html: string): string {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
        doc.querySelectorAll('table').forEach(table => {
          const firstTh = table.querySelector('thead th, tr th')
          if (!firstTh) return
          const label = firstTh.textContent?.trim().toLowerCase() ?? ''
          if (!label.includes('peak') && !label.includes('pico') && !label.includes('number')) return
          const tbody = table.querySelector('tbody')
          if (!tbody) return
          const rows = Array.from(tbody.querySelectorAll('tr'))
          rows.sort((a, b) => {
            const aVal = parseInt(a.querySelector('td')?.textContent?.trim() ?? '0', 10)
            const bVal = parseInt(b.querySelector('td')?.textContent?.trim() ?? '0', 10)
            return aVal - bVal
          })
          rows.forEach(row => tbody.appendChild(row))
        })
        return doc.querySelector('div')?.innerHTML ?? html
      } catch { return html }
    }

    try {
      const parser = new DOMParser()
      const dom = parser.parseFromString(docxHtml, 'text/html')
      const children = Array.from(dom.body.children)
      const pages: string[] = []
      let current = ''
      for (const child of children) {
        const el = child as HTMLElement
        const style = el.getAttribute('style') ?? ''
        if (el.tagName === 'DIV' && style.includes('page-break-before:always')) {
          if (current.trim()) { pages.push(sortPeakTables(current)); current = '' }
          pages.push(sortPeakTables(el.innerHTML))
        } else {
          current += el.outerHTML
        }
      }
      if (current.trim()) pages.push(sortPeakTables(current))
      return pages.length > 0 ? pages : [sortPeakTables(docxHtml)]
    } catch { return [docxHtml] }
  }, [effectiveDocxHtml])

  useEffect(() => {
    photoRef.current?.setAttribute('webkitdirectory', '')
    pastaRef.current?.setAttribute('webkitdirectory', '')
    setFromLote(new URLSearchParams(window.location.search).get('from') === 'lote')
  }, [])

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('print_token')
    if (token) {
      isPrintMode.current = true
      // Prazo absoluto: se nada funcionar em 25s, força ready para não travar o Puppeteer
      const absoluteDeadline = setTimeout(() => { (window as any).__printReady = true }, 25000)
      fetch(`/api/gerar-pdf?token=${token}`)
        .then(r => r.json())
        .then(data => {
          if (data.error) {
            clearTimeout(absoluteDeadline)
            ;(window as any).__printReady = true
            return
          }
          setCfg(data.cfg)
          if (data.emendaDraft) setEmendaDraft(data.emendaDraft)
          if (data.docxHtml) setDocx({ loading: false, html: data.docxHtml, filename: data.docxName ?? null })
          if (data.photos?.length)
            setPhotos(data.photos.map((p: any) => ({ name: p.name, url: `data:image/jpeg;base64,${p.base64}` })))
          clearTimeout(absoluteDeadline)
          // Safety: se o useEffect de sinalização não rodar em 12s, força ready
          setTimeout(() => { (window as any).__printReady = true }, 12000)
        })
        .catch(() => {
          clearTimeout(absoluteDeadline)
          ;(window as any).__printReady = true
        })
      return
    }

    // Verifica certificado digital
    ;(async () => {
      try {
        const api = (window as any).electronAPI
        if (api?.getSettings) {
          const s = await api.getSettings()
          setHasCert(!!(s?.certThumbprint))
        }
      } catch {}
    })()

    // Modo normal: carrega do localStorage
    const raw = localStorage.getItem(CFG_KEY)
    if (!raw) { router.replace('/cispr15'); return }
    setCfg(JSON.parse(raw))
    try {
      const rawE = localStorage.getItem(EMENDA_DRAFT_KEY)
      if (rawE) setEmendaDraft(JSON.parse(rawE))
    } catch {}
    const dHtml = sessionStorage.getItem(DOCX_HTML_KEY)
    const dName = sessionStorage.getItem(DOCX_NAME_KEY)
    if (dHtml) setDocx({ loading: false, html: dHtml, filename: dName })
    try {
      const rawP = localStorage.getItem(PHOTOS_KEY)
      if (rawP) {
        const arr: { name: string; base64: string }[] = JSON.parse(rawP)
        setPhotos(arr.map(ph => ({ url: `data:image/jpeg;base64,${ph.base64}`, name: ph.name })))
      }
    } catch {}
  }, [router])

  // Sinaliza puppeteer quando o DOM estiver pronto (modo print_token)
  useEffect(() => {
    if (!isPrintMode.current || !cfg) return
    const signalReady = () => {
      const imgs = Array.from(document.querySelectorAll('img'))
      const pending = imgs.filter(img => !img.complete)
      const done = () => {
        const pages = document.querySelectorAll('.doc-page')
        const total = pages.length
        pages.forEach((pg, i) => {
          const lbl = pg.querySelector('.page-num-label')
          if (lbl) lbl.textContent = `Página ${i + 1} de ${total}`
        })
        ;(window as any).__printReady = true
      }
      if (pending.length === 0) { done(); return }
      // Safety timer: se alguma imagem não disparar onload/onerror em 10s, força ready
      const imgTimeout = setTimeout(done, 10000)
      Promise.all(pending.map(img =>
        new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() })
      )).then(() => { clearTimeout(imgTimeout); done() })
    }
    // Dois rAF garantem que React já pintou o DOM antes de checar imagens
    requestAnimationFrame(() => requestAnimationFrame(signalReady))
  }, [cfg])

  // Atualiza marcadores de página na tela (modo normal, não print)
  useEffect(() => {
    if (isPrintMode.current || !cfg) return
    requestAnimationFrame(() => {
      const pages = document.querySelectorAll('.doc-page')
      const total = pages.length
      pages.forEach((pg, i) => {
        const lbl = pg.querySelector('.page-num-label')
        if (lbl) lbl.textContent = `Página ${i + 1} de ${total}`
      })
    })
  })

  async function handleDocx(file: File) {
    setDocx({ loading: true, html: null, filename: null })
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/parse-docx', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDocx({ loading: false, html: data.html, filename: file.name })
      setWmfErrors(data.wmfErrors ?? [])
      sessionStorage.setItem(DOCX_HTML_KEY, data.html)
      sessionStorage.setItem(DOCX_NAME_KEY, file.name)
    } catch (err: any) {
      alert(`Erro ao processar: ${err.message}`)
      setDocx({ loading: false, html: null, filename: null })
    }
  }

  async function handleDocxTodos(file: File) {
    setDocx({ loading: true, html: null, filename: null })
    setPerResult({
      conduzida: { html: null, filename: null, loading: true },
      loop:      { html: null, filename: null, loading: true },
      anexoB:    { html: null, filename: null, loading: true },
    })
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/parse-docx', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const html = data.html as string
      setDocx({ loading: false, html, filename: file.name })
      sessionStorage.setItem(DOCX_HTML_KEY, html)
      sessionStorage.setItem(DOCX_NAME_KEY, file.name)
      // Mark all three result slots with the same docx — each filters its own section on render
      setPerResult({
        conduzida: { html, filename: file.name, loading: false },
        loop:      { html, filename: file.name, loading: false },
        anexoB:    { html, filename: file.name, loading: false },
      })
    } catch (err: any) {
      alert(`Erro ao processar: ${err.message}`)
      setDocx({ loading: false, html: null, filename: null })
      setPerResult(emptyPerResult())
    }
  }

  async function handlePerResultDocx(file: File, key: ResultKey) {
    setPerResult(prev => ({ ...prev, [key]: { ...prev[key], loading: true } }))
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/parse-docx', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPerResult(prev => ({ ...prev, [key]: { html: data.html, filename: file.name, loading: false } }))
    } catch (err: any) {
      alert(`Erro ao processar: ${err.message}`)
      setPerResult(prev => ({ ...prev, [key]: { ...prev[key], loading: false } }))
    }
  }

  function clearPerResult(key: ResultKey) {
    setPerResult(prev => ({ ...prev, [key]: { html: null, filename: null, loading: false } }))
  }

  async function commitEmenda(draft: EmendaDraft, currentCfg?: Cispr15Config) {
    try {
      const raw = localStorage.getItem(RELATORIOS_KEY)
      if (!raw) return
      const lista: RelatorioSalvo[] = JSON.parse(raw)
      const idx = lista.findIndex(r => r.id === draft.relatorioId)
      if (idx < 0) return
      const emendas = [...lista[idx].emendas]
      if (!emendas.find(e => e.numero === draft.emendaNum)) {
        emendas.push({ numero: draft.emendaNum, dataEmenda: draft.dataEmenda, alteracoes: draft.alteracoes })
      }
      emendas[emendas.length - 1] = { ...emendas[emendas.length - 1], ...(currentCfg ? { cfgSnapshot: currentCfg } : {}) }
      lista[idx] = { ...lista[idx], emendas, ...(currentCfg ? { currentCfg } : {}) }
      localStorage.setItem(RELATORIOS_KEY, JSON.stringify(lista))
      localStorage.removeItem(EMENDA_DRAFT_KEY)
      // Sincronizar com pasta de rede
      const api = (window as any).electronAPI
      if (api) {
        const netList = lista.map(r => ({ ...r, photos: [] }))
        await api.saveRelatorios(netList)
      }
    } catch {}
  }

  function handlePhotosFromFiles(files: File[]) {
    const getNum = (name: string) => parseInt(name.replace(/\.[^/.]+$/, '').replace(/\D/g, ''), 10) || 0
    const sorted = [...files].sort((a, b) => getNum(a.name) - getNum(b.name))
    setPhotos(sorted.map(f => ({ url: URL.createObjectURL(f), name: f.name })))
  }

  function handlePhotos(files: FileList) {
    const getNum = (name: string) => parseInt(name.replace(/\.[^/.]+$/, '').replace(/\D/g, ''), 10) || 0
    const sorted = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .sort((a, b) => getNum(a.name) - getNum(b.name))
    handlePhotosFromFiles(sorted)
  }

  async function handlePastaCompleta(files: FileList) {
    setPastaLoading(true)
    try {
      const all = Array.from(files)
      const getNum = (name: string) => parseInt(name.replace(/\.[^/.]+$/, '').replace(/\D/g, ''), 10) || 0
      // Detecção robusta de imagem: type pode vir vazio em pastas (webkitdirectory),
      // então também aceita pela extensão do nome do arquivo.
      const isImage = (f: File) =>
        f.type.startsWith('image/') || /\.(jpe?g|png|bmp|gif|webp|tiff?)$/i.test(f.name)

      const docxFile = all.find(f => f.name.toLowerCase().endsWith('.docx'))
      const imageFiles = all
        .filter(isImage)
        .sort((a, b) => getNum(a.name) - getNum(b.name))

      // Usa handleDocxTodos para popular as 3 seções (conduzida/loop/anexoB),
      // igual ao botão "Docx (todos)" que funciona.
      await Promise.all([
        docxFile              ? handleDocxTodos(docxFile)         : Promise.resolve(),
        imageFiles.length > 0 ? (handlePhotosFromFiles(imageFiles), Promise.resolve()) : Promise.resolve(),
      ])
    } finally {
      setPastaLoading(false)
    }
  }

  async function assinarEPublicarEmenda() {
    if (!cfg || !emendaDraft) return
    if (!hasCert) {
      setSignState('error')
      setSignMsg('Nenhum certificado configurado. Configure em Configurações → Assinatura Digital.')
      return
    }
    const eutPath = emendaDraft.eutFolderPath
    if (!eutPath) {
      setSignState('error')
      setSignMsg('Pasta EUT não associada — carregue a pasta da EUT primeiro.')
      return
    }
    const san = (v: string) => (v ?? '').replace(/[/\\:*?"<>|\s]/g, '_').replace(/_+/g, '_')
    const emNum = emendaDraft ? formatEmendaNumero(cfg.numRelatorio, emendaDraft.emendaNum) : cfg.numRelatorio
    const filename = `${san(emNum || cfg.protocolo)}_${cfg.tipo}_${san(cfg.fabricante)}.pdf`
    const api = (window as any).electronAPI
    if (!api?.signPdf || !api?.publishPdf) return
    setSignState('loading')
    setSignMsg('')
    try {
      const signRes = await api.signPdf(eutPath, filename)
      if (!signRes.ok) {
        setSignState('error')
        setSignMsg(signRes.error ?? 'Erro ao assinar')
        return
      }
      const pubRes = await api.publishPdf(eutPath, filename)
      if (pubRes.ok) {
        setSignState('ok')
        setSignMsg('Assinado e publicado com sucesso')
      } else {
        setSignState('error')
        setSignMsg('Assinado, mas erro ao publicar: ' + (pubRes.error ?? ''))
      }
    } catch (e: any) {
      setSignState('error')
      setSignMsg(e.message)
    }
  }

  if (!cfg) return null

  const printMode = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('print_token')

  const tensoes = getTensoes(cfg)
  const labelId = LABEL_ID[cfg.tipo]

  /* ── emenda helpers ── */
  function markerFor(campo: string): number | null {
    return emendaDraft?.alteracoes.find(a => a.campo === campo)?.marker ?? null
  }
  const displayNum = emendaDraft
    ? formatEmendaNumero(cfg.numRelatorio, emendaDraft.emendaNum)
    : cfg.numRelatorio

  /* Salva fotos + DOCX como arquivos na mesma pasta da EUT do PDF */
  async function salvarArquivos() {
    if (!cfg) return
    const api = (window as any).electronAPI
    if (!api?.exportRelatorioFiles) { alert('Disponível apenas no aplicativo.'); return }
    const fotos = photos.map(p => ({ name: p.name, base64: (p.url.split(',')[1] ?? '') }))
    if (!fotos.length && !docx.html) { alert('Sem fotos nem DOCX para salvar.'); return }
    setSavingFiles('loading')
    try {
      const folderPath = emendaDraft?.eutFolderPath ?? eutFolder ?? null
      const res = await api.exportRelatorioFiles(folderPath, displayNum || cfg.numRelatorio, fotos, docx.html, docx.filename)
      if (res?.ok) {
        setSavingFiles('ok')
        setTimeout(() => setSavingFiles('idle'), 4000)
      } else {
        setSavingFiles('error')
        alert('Erro ao salvar arquivos: ' + (res?.error ?? 'desconhecido'))
      }
    } catch (e: any) {
      setSavingFiles('error')
      alert('Erro ao salvar arquivos: ' + (e?.message ?? e))
    }
  }

  /* ── tabelas de limites CISPR 15 ── */
  const limCond1 = {
    cols: ['Faixa de Frequência (MHz)', 'Limite Quase Pico (dBμV)', 'Limite Médio (dBμV)'],
    rows: [
      ['0,009 a 0,05', '110', '—'], ['0,05 a 0,15', '90 a 80', '—'],
      ['0,15 a 0,5', '66 a 56', '56 a 46'], ['0,5 a 5', '56', '46'], ['5 a 30', '60', '50'],
    ],
    note: '(1) Na freq. de transição, o limite inferior se aplica. (2) O limite decresce linearmente com o logaritmo da frequência nas faixas de 50–150 kHz e 150–500 kHz.',
  }
  const limCond2 = {
    cols: ['Faixa de Frequência (MHz)', 'Limite Quase Pico (dBμV)', 'Limite Médio (dBμV)'],
    rows: [['0,15 a 0,5', '80', '70'], ['0,5 a 30', '74', '64']],
    note: '(1) Na freq. de transição, o limite inferior se aplica.',
  }
  const limCond3 = {
    cols: ['Faixa de Frequência (MHz)', 'Limite Quase Pico (dBμV)', 'Limite Médio (dBμV)'],
    rows: [['0,15 a 0,5', '84 a 74', '74 a 64'], ['0,5 a 30', '74', '64']],
    note: '(1) Os limites diminuem linearmente com o logaritmo da frequência na faixa de 0,15 a 0,5 MHz.',
  }
  const limRad1 = {
    cols: ['Faixa de Frequência (MHz)', 'Limite Antena Loop 2 m (dBμA)'],
    rows: [
      ['0,009 a 0,07', '88'], ['0,07 a 0,15', '88 a 58'],
      ['0,15 a 3', '58 a 22'], ['3 a 30', '22'],
    ],
    note: '(1) Na freq. de transição, o limite inferior se aplica. (2) O limite decresce linearmente com o logaritmo da frequência nas faixas 70–150 kHz e 150 kHz–3 MHz.',
  }
  const limRad2 = {
    cols: ['Faixa de Frequência (MHz)', 'Limite Quase Pico (dBμV/m)'],
    rows: [['30 a 100', '64 a 54'], ['100 a 230', '54'], ['230 a 300', '61']],
    note: '(1) Na freq. de transição, o limite inferior se aplica. (2) O limite decresce linearmente com o logaritmo da frequência na faixa de 30–100 MHz.',
  }

  /* ── páginas de fotos: mínimo 4 slots (2 páginas × 2) ── */
  const slots: (Photo | null)[] = [...photos]
  while (slots.length < 4) slots.push(null)
  const photoPages: (Photo | null)[][] = []
  for (let i = 0; i < slots.length; i += 2) photoPages.push(slots.slice(i, i + 2))

  return (
    <>
      {/* ── estilos globais ── */}
      <style>{`
        @page { size: A4; margin: 0; }

        @media screen {
          .page-num-label { display: inline !important; }
          .doc-wrapper { background: #525659; padding: 24px 16px; min-height: 100vh; }
          .doc-page {
            background: white; width: 210mm; min-height: 297mm;
            margin: 0 auto 16px;
            box-shadow: 0 3px 18px rgba(0,0,0,.6);
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11pt; color: #000; line-height: 1.4;
            position: relative; box-sizing: border-box;
            display: flex; flex-direction: column;
          }
          .doc-page-inner { flex: 1; }
        }

        @media print {
          aside, nav, header, .no-print { display: none !important; }
          body, html { background: white !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
          /* Desfaz o shell de scroll (h-screen/overflow-hidden/overflow-auto) só na
             impressão — senão o printToPDF clipa o fluxo e corta a última página. */
          .h-screen { height: auto !important; }
          .min-h-0 { min-height: 0 !important; }
          .overflow-hidden, .overflow-auto { overflow: visible !important; }
          main { overflow: visible !important; height: auto !important; max-height: none !important; padding: 0 !important; }
          .doc-wrapper { background: white; padding: 0; }
          .doc-page {
            width: 210mm;
            /* min-height = área útil (≈273mm, A4 menos a margem do rodapé nativo).
               O rodapé é margem de página (Chromium), reservada em TODA página —
               igual ao Word, independente do texto. */
            min-height: 273mm;
            box-shadow: none; margin: 0;
            page-break-before: always;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11pt; color: #000; line-height: 1.4;
            position: relative; box-sizing: border-box;
            display: block;
          }
          .doc-page-inner { padding: 6mm 14mm 4mm !important; }
          .doc-page-first { page-break-before: avoid; }
          /* rodapé DOM escondido na impressão — o Chromium desenha o rodapé na margem */
          .page-footer { display: none !important; }
          .page-num-label { display: inline !important; }
          .upload-zone { display: none !important; }
          .doc-content th {
            background-color: ${GRAY1} !important; color: #000 !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          .doc-content tr:nth-child(even) td {
            background-color: #f5f8ff !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          .doc-content table { page-break-inside: avoid !important; }
          /* Gráficos: limita a altura para caber junto com a tabela de picos na mesma página */
          .doc-content img {
            max-width: 165mm !important; max-height: 105mm !important;
            width: auto !important; height: auto !important; object-fit: contain !important;
            display: block !important; margin: 8px auto !important;
            page-break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          /* Mantém o conjunto gráfico + tabela de picos junto na mesma página */
          .doc-content table { font-size: 8.5pt !important; }
        }

        /* estilos do conteúdo Radimation */
        .doc-content table { width:100%; border-collapse:collapse; margin:8px 0; font-size:9pt; font-family:Arial,sans-serif; page-break-inside:avoid; }
        .doc-content td,.doc-content th { border:1px solid #999 !important; padding:2px 5px; text-align:center; }
        .doc-content th { background:${GRAY1}; color:#000; font-weight:700; }
        .doc-content tr:nth-child(even) td { background:#f5f8ff; }
        .doc-content img { max-width:165mm; max-height:105mm; width:auto; height:auto; object-fit:contain; border:1px solid #ddd; display:block; margin:8px auto; page-break-inside:avoid; }
        .doc-content p { margin-bottom:5px; font-size:11pt; font-family:Arial,sans-serif; }
        .doc-content h1,.doc-content h2 { font-size:11pt; font-weight:700; color:#000; margin:12px 0 4px; font-family:Arial,sans-serif; page-break-after:avoid; }
        .doc-content h3,.doc-content h4 { font-size:11pt; font-weight:700; color:#000; margin:8px 0 3px; font-family:Arial,sans-serif; page-break-after:avoid; }
      `}</style>

      {printMode && (
        <style>{`
          body, html { background: white !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
          aside, nav, header, .no-print { display: none !important; }
          /* Desfaz o shell de scroll para o fluxo não ser clipado na impressão */
          .h-screen { height: auto !important; }
          .min-h-0 { min-height: 0 !important; }
          .overflow-hidden, .overflow-auto { overflow: visible !important; }
          main { overflow: visible !important; height: auto !important; max-height: none !important; }
          /* Remove padding do container do dashboard para o .doc-page não ficar deslocado */
          main, main > div { padding: 0 !important; max-width: none !important; margin: 0 !important; }
          .dot-grid { background: white !important; }
          .doc-wrapper { background: white !important; padding: 0 !important; }
          .doc-page {
            margin: 0 !important;
            box-shadow: none !important;
            /* min-height = área útil (≈273mm); rodapé é margem nativa (Chromium) */
            height: auto !important; min-height: 273mm !important; max-height: none !important;
            page-break-before: always !important;
            break-before: page !important;
            position: relative !important;
            display: block !important;
          }
          .doc-page-first {
            page-break-before: avoid !important;
            break-before: avoid !important;
          }
          .doc-page-inner { padding: 6mm 14mm 4mm !important; }
          /* rodapé DOM escondido — Chromium desenha o rodapé na margem da página */
          .page-footer { display: none !important; }
          .page-num-label { display: inline !important; }
          /* Células de tabela compactas */
          .doc-page table td, .doc-page table th { padding: 1px 4px !important; }
          .doc-content td, .doc-content th { padding: 1px 5px !important; }
        `}</style>
      )}

      {/* ── barra de controles (não imprime) ── */}
      <div className="no-print flex flex-wrap items-center gap-2 mb-6">
        <button onClick={() => fromLote ? router.push('/cispr15/lote') : router.back()}
          className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors text-sm mr-1">
          <ArrowLeft size={14} /> {fromLote ? 'Voltar ao Lote' : 'Voltar'}
        </button>

        {emendaDraft && (
          <>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
              MODO EMENDA {emendaDraft.emendaNum} — {emendaDraft.numRelatorioOriginal}
            </span>
            <button
              onClick={() => { localStorage.removeItem(EMENDA_DRAFT_KEY); setEmendaDraft(null) }}
              className="text-xs text-white/30 hover:text-red-400 transition-colors">
              <X size={12} />
            </button>
          </>
        )}

        <span className="text-white/10">|</span>

        {/* ── Botão principal: carregar pasta ── */}
        <label className={cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all',
          pastaLoading
            ? 'border-blue-300/30 bg-blue-500/8 text-blue-400 pointer-events-none'
            : (docx.html || photos.length > 0)
              ? 'border-green/30 bg-green/8 text-green-400 hover:border-green/50 cursor-pointer'
              : 'border-gold/40 bg-gold/8 text-gold hover:bg-gold/14 cursor-pointer',
        )}>
          {pastaLoading ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={13} />}
          {pastaLoading ? 'Processando pasta…' : (docx.html || photos.length > 0) ? 'Trocar Pasta' : 'Carregar Pasta do Ensaio'}
          <input ref={pastaRef} type="file" className="hidden"
            disabled={pastaLoading}
            {...{ webkitdirectory: '' } as any}
            onChange={e => { if (e.target.files?.length) handlePastaCompleta(e.target.files) }} />
        </label>

        {/* Status resumido */}
        {docx.html && (
          <span className="text-[10px] text-white/30 font-mono truncate max-w-[140px]">✓ {docx.filename}</span>
        )}
        {photos.length > 0 && (
          <span className="text-[10px] text-white/30 font-mono">✓ {photos.length} foto(s)</span>
        )}

        <span className="text-white/10">|</span>

        {/* ── Upload docx único que preenche todos os resultados ── */}
        {docx.loading ? (
          <div className="flex items-center gap-1 text-blue-400 text-[11px]">
            <Loader2 size={10} className="animate-spin" /> Processando…
          </div>
        ) : docx.html ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded border border-green/30 bg-green/8 text-[11px] text-green-400">
            <Upload size={10} /> ✓ docx (todos)
            <button type="button" onClick={() => {
              setDocx({ loading: false, html: null, filename: null })
              setPerResult(emptyPerResult())
              sessionStorage.removeItem(DOCX_HTML_KEY)
              sessionStorage.removeItem(DOCX_NAME_KEY)
            }} className="text-white/25 hover:text-red-400 transition-colors ml-0.5">
              <X size={10} />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-1 px-2 py-1 rounded border border-gold/30 bg-gold/6 text-[11px] text-gold hover:bg-gold/12 cursor-pointer transition-all font-semibold">
            <Upload size={10} /> Docx (todos)
            <input type="file" accept=".docx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleDocxTodos(f) }} />
          </label>
        )}

        <span className="text-white/10">|</span>

        {/* Upload por resultado */}
        {RESULT_KEYS.map(key => {
          const slot = perResult[key]
          return slot.loading ? (
            <div key={key} className="flex items-center gap-1 text-blue-400 text-[11px]">
              <Loader2 size={10} className="animate-spin" /> {RESULT_LABEL[key]}…
            </div>
          ) : slot.html ? (
            <div key={key} className="flex items-center gap-1 px-2 py-1 rounded border border-amber-500/30 bg-amber-500/8 text-[11px] text-amber-300">
              ✓ {RESULT_LABEL[key]}
              <button type="button" onClick={() => clearPerResult(key)}
                className="text-white/25 hover:text-red-400 transition-colors ml-0.5">
                <X size={10} />
              </button>
            </div>
          ) : (
            <label key={key} className="flex items-center gap-1 px-2 py-1 rounded border border-white/8 text-[11px] text-white/30 hover:text-white/60 cursor-pointer transition-all">
              <Upload size={10} /> {RESULT_LABEL[key]}
              <input type="file" accept=".docx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePerResultDocx(f, key) }} />
            </label>
          )
        })}

        <label className="flex items-center gap-1 px-2 py-1 rounded border border-white/8 text-[11px] text-white/30 hover:text-white/60 cursor-pointer transition-all">
          <Upload size={10} /> fotos
          <input ref={photoRef} type="file" className="hidden"
            onChange={e => { if (e.target.files?.length) handlePhotos(e.target.files) }} />
        </label>

        {photos.length > 0 && (
          <button onClick={() => setPhotos([])} className="text-white/20 hover:text-red-400 text-xs transition-colors">
            <X size={11} />
          </button>
        )}

        {photos.length > 0 && (
          <div className="flex items-center gap-1.5">
            <input
              type="range" min={60} max={175} step={5} value={photoWidth}
              onChange={e => setPhotoWidth(Number(e.target.value))}
              className="w-20 accent-yellow-400 cursor-pointer"
            />
            <span className="text-white/30 text-[10px] font-mono">{photoWidth}mm</span>
          </div>
        )}

        <div className="flex-1" />

        {savedFile && (
          <span className="text-green-400 text-xs font-mono truncate max-w-[260px]">
            ✓ {savedFile}
          </span>
        )}

        <button
          disabled={gerando}
          onClick={async () => {
            if (!cfg) return
            setSavedFile(null)
            setGerando(true)
            const san = (v: string) => (v ?? '').replace(/[/\\:*?"<>|\s]/g, '_').replace(/_+/g, '_')
            const filename = `${san(displayNum || cfg.protocolo)}_${cfg.tipo}_${san(cfg.fabricante)}.pdf`
            try {
              const api = (window as any).electronAPI
              if (api) {
                // Electron: printToPDF direto na pasta da EUT
                const folderPath = emendaDraft?.eutFolderPath ?? null
                const result = await api.salvarPDFNaEut(filename, folderPath)
                if (result.ok) {
                  setSavedFile(result.filePath ?? filename)
                  const dur = finalizarMarcador('emissao')
                  if (dur != null) registrarTempo({ tipo: 'emissao', protocolo: cfg.protocolo, numRelatorio: displayNum || cfg.numRelatorio, duracaoMs: dur })
                  if (result.usedDocuments) {
                    alert(`A pasta da EUT não foi encontrada.\nO PDF foi salvo em Documentos:\n${result.filePath ?? filename}`)
                  }
                  if (emendaDraft) await commitEmenda(emendaDraft, cfg ?? undefined)
                } else if (!result.canceled) {
                  alert('Erro ao gerar PDF: ' + (result.error ?? 'Erro desconhecido'))
                }
                return
              }
              // Web: Puppeteer via API route
              const res = await fetch('/api/gerar-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  cfg,
                  photos: photos.map(p => ({ name: p.name, base64: p.url.split(',')[1] ?? '' })),
                  docxHtml: docx.html,
                  docxName: docx.filename,
                  emendaDraft,
                }),
              })
              if (!res.ok) {
                const data = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
                throw new Error(data.error || `HTTP ${res.status}`)
              }
              const blob = await res.blob()
              const url  = URL.createObjectURL(blob)
              const a    = document.createElement('a')
              a.href     = url
              a.download = filename
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              setTimeout(() => URL.revokeObjectURL(url), 1000)
              setSavedFile(filename)
              const dur = finalizarMarcador('emissao')
              if (dur != null) registrarTempo({ tipo: 'emissao', protocolo: cfg.protocolo, numRelatorio: displayNum || cfg.numRelatorio, duracaoMs: dur })
              if (emendaDraft) await commitEmenda(emendaDraft, cfg ?? undefined)
            } catch (err: any) {
              const s = (v: string) => (v ?? '').replace(/[/\\:*?"<>|\s]/g, '_').replace(/_+/g, '_')
              const prev = document.title
              document.title = `${s(cfg.numRelatorio)}_${s(cfg.protocolo)}_${s(cfg.fabricante)}`
              window.print()
              setTimeout(() => { document.title = prev }, 1500)
              if (!err.message.includes('Chrome') && !err.message.includes('Edge')) {
                alert(`Erro: ${err.message}`)
              }
            } finally {
              setGerando(false)
            }
          }}
          className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60">
          {gerando
            ? <><Loader2 size={14} className="animate-spin" /> Gerando…</>
            : <><Printer size={14} /> Baixar PDF</>}
        </button>

        {/* Salvar fotos + DOCX na pasta da EUT (ao lado do Baixar PDF) */}
        <button
          disabled={savingFiles === 'loading'}
          onClick={salvarArquivos}
          title="Salvar as fotos e o DOCX na pasta da EUT (junto do PDF)"
          className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60">
          {savingFiles === 'loading' ? <Loader2 size={14} className="animate-spin" /> :
           savingFiles === 'ok'      ? <CheckCircle2 size={14} className="text-green-400" /> :
           <Save size={14} />}
          {savingFiles === 'ok' ? 'Arquivos salvos' : 'Salvar arquivos'}
        </button>

        {/* Assinar e Publicar — apenas em modo emenda */}
        {emendaDraft && (
          <button
            onClick={assinarEPublicarEmenda}
            disabled={signState === 'loading'}
            title={signMsg || (signState === 'ok' ? 'Publicado com sucesso' : 'Assinar digitalmente e publicar o PDF da emenda')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-all font-semibold',
              signState === 'ok'      && 'border-green/30 bg-green/8 text-green-400',
              signState === 'error'   && 'border-red-500/30 bg-red-500/8 text-red-400',
              signState === 'loading' && 'border-blue-500/30 bg-blue-500/8 text-blue-400 opacity-70 cursor-wait',
              (signState === 'idle')  && 'border-white/12 text-white/50 hover:border-white/25 hover:text-white/80',
            )}>
            {signState === 'loading'
              ? <><Loader2 size={14} className="animate-spin" /> Processando…</>
              : signState === 'ok'
                ? <><CheckCircle2 size={14} /> Publicado</>
                : <><PenLine size={14} /> Assinar e Publicar</>}
          </button>
        )}
      </div>

      {/* ════════════════════════════════════════════════
          DOCUMENTO — cada <Page> = folha A4 separada
      ════════════════════════════════════════════════ */}
      <div className="doc-wrapper">

        {/* ══ PÁGINA 1 — CAPA ══ */}
        <Page first flow>
          {/* Cabeçalho da capa — layout Word */}
          <div style={{ border: '1px solid #999', marginBottom: 10, overflow: 'hidden' }}>
            {/* Topo branco: logo PUCRS + texto universidade + CRL */}
            <div style={{ display: 'flex', alignItems: 'center', background: '#fff', minHeight: 80, borderBottom: '1px solid #bbb' }}>
              <div style={{ width: 82, flexShrink: 0, padding: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={PUCRS_LOGO} alt="PUCRS" style={{ width: 66, height: 'auto', display: 'block' }} />
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '6px 8px' }}>
                <p style={{ fontSize: '10pt', fontWeight: 700, color: '#000', margin: '0 0 3px' }}>Pontifícia Universidade Católica do Rio Grande do Sul</p>
                <p style={{ fontSize: '8.5pt', fontWeight: 700, color: '#000', margin: '0 0 2px' }}>LABELO - Laboratórios Especializados em Eletroeletrônica</p>
                <p style={{ fontSize: '8.5pt', fontWeight: 700, color: '#000', margin: '0 0 2px' }}>Calibração e Ensaios</p>
                <p style={{ fontSize: '8.5pt', fontWeight: 700, color: '#000', margin: 0 }}>Rede Brasileira de Laboratórios de Ensaios</p>
              </div>
              <div style={{ width: 90, flexShrink: 0, padding: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={CRL_BADGE} alt="CRL 0075" style={{ height: 74, width: 'auto', display: 'block' }} />
              </div>
            </div>
            {/* Parte cinza: texto acred + Relatório de Ensaio / Nº */}
            <div style={{ background: GRAY2, borderTop: '1px solid #bbb', padding: '5px 14px 8px' }}>
              <p style={{ textAlign: 'center', fontSize: '6.5pt', fontStyle: 'italic', color: 'rgb(0, 0, 0)', margin: '0 0 5px' }}>
                Laboratório de Ensaio acreditado pela Cgcre de acordo com a ABNT NBR ISO/IEC 17025 sob o número CRL 0075
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13pt', fontWeight: 700, color: '#000' }}>Relatório de Ensaio</span>
                <span style={{ fontSize: '13pt', fontWeight: 700, color: '#000' }}>N° {displayNum || '—'}</span>
              </div>
            </div>
          </div>

          {/* Cancela e Substitui (apenas em modo emenda) */}
          {emendaDraft && (
            <p style={{ textAlign: 'center', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt', fontWeight: 'normal', marginBottom: 10 }}>
              {'Cancela e Substitui o Relatório de Ensaio N° '}
              {emendaDraft.emendaNum === 1
                ? emendaDraft.numRelatorioOriginal
                : formatEmendaNumero(emendaDraft.numRelatorioOriginal, emendaDraft.emendaNum - 1)}
            </p>
          )}

          {/* Período e emissão — alinhado à direita, fonte menor */}
          <div style={{ textAlign: 'right', marginBottom: 16 }}>
            <p style={{ fontSize: FS.xs, fontWeight: 700, marginBottom: 2 }}>
              Período de realização dos ensaios: {fmtDate(cfg.periodoInicio)} até {fmtDate(cfg.periodoFim)}<Sup n={markerFor('periodo')} />
            </p>
            <p style={{ fontSize: FS.xs, fontWeight: 700 }}>
              Data de emissão do relatório: {fmtDate(cfg.dataEmissao)}
            </p>
          </div>

          <SecHeader>Parte 1 - Identificação e condições gerais</SecHeader>
             
          <p style={pTitle}>1. Cliente:<Sup n={markerFor('cliente')} /></p>
          <p style={{ ...pJ, marginTop: 8 }}><b>{cfg.cliente || '—'}</b></p>
          {cfg.clienteRua    && <p style={pJ}>{cfg.clienteRua}</p>}
          {cfg.clienteCidade && <p style={pJ}>{cfg.clienteCidade}</p>}
          {cfg.clienteCep    && <p style={pJ}>CEP: {cfg.clienteCep}</p>}

          <p style={pTitle}>2. Objeto ensaiado (amostra):<Sup n={markerFor('amostra')} /><Sup n={markerFor('tecnico')} /><Sup n={markerFor('protocolo')} /></p>
          {(() => {
            const td1: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', width: '44%' }
            const td2: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', fontWeight: 700, width: '30%', whiteSpace: 'nowrap' }
            const td3: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', width: '26%' }
            const lv = (lbl: string, val: string) => <><b>{lbl}:</b> {val}</>
            const rows: [React.ReactNode, string, string][] = cfg.tipo === 'lampada' ? [
              [<b>{cfg.produto || '—'}</b>,                      'Tensão de alimentação:', cfg.tensaoAlim  || '—'],
              [lv('Fabricante', cfg.fabricante || '—'),          'Potência nominal:',      cfg.potencia    || '—'],
              [lv('Modelo',     cfg.modelo     || '—'),          'Frequência de rede:',    cfg.frequencia  || '—'],
              [lv('Número de série', cfg.identificador || '—'),  'Orçamento LABELO:',      cfg.orcamento   || '—'],
              [lv('Lacre', cfg.lacre || '—'),                    'Protocolo LABELO:',      cfg.protocolo   || '—'],
            ] : [
              [<b>{cfg.produto || '—'}</b>,                      'Tensão de alimentação:', cfg.tensaoAlim  || '—'],
              [lv('Fabricante', cfg.fabricante || '—'),          'Potência nominal:',      cfg.potencia    || '—'],
              [lv('Modelo',     cfg.modelo     || '—'),          'Frequência de rede:',    cfg.frequencia  || '—'],
              [lv(labelId,      cfg.identificador || '—'),       'Orçamento LABELO:',      cfg.orcamento   || '—'],
              [lv('Protocolo LABELO', cfg.protocolo || '—'),     '',                       ''],
            ]
            return (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, marginBottom: 6, fontSize: FS.sm }}>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f5f8ff' }}>
                      <td style={td1}>{row[0]}</td>
                      <td style={td2}>{row[1]}</td>
                      <td style={td3}>{row[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}

          {cfg.temDriver && cfg.tipo === 'luminaria' && (
            <>
              <p style={pTitle}>2.1 Acessório de Ensaio (Driver):</p>
              {(() => {
                const td1: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', width: '44%' }
                const td2: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', fontWeight: 700, width: '30%', whiteSpace: 'nowrap' }
                const td3: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', width: '26%' }
                const lv = (lbl: string, val: string) => <><b>{lbl}:</b> {val}</>
                const driverRows: [React.ReactNode, string, string][] = [
                  [<b>{cfg.driverProduto || '—'}</b>,                          'Tensão de alimentação:', cfg.driverTensaoAlim  || '—'],
                  [lv('Fabricante', cfg.driverFabricante  || '—'),             'Potência nominal:',      cfg.driverPotencia    || '—'],
                  [lv('Modelo',     cfg.driverModelo      || '—'),             'Frequência de rede:',    cfg.driverFrequencia  || '—'],
                  [lv('Número de Série', cfg.driverIdentificador || '—'),      'Orçamento LABELO:',      cfg.driverOrcamento   || 'Não identificado'],
                  [lv('Protocolo LABELO', cfg.driverProtocolo || 'Não identificado'), '', ''],
                ]
                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, marginBottom: 6, fontSize: FS.sm }}>
                    <tbody>
                      {driverRows.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f5f8ff' }}>
                          <td style={td1}>{row[0]}</td>
                          <td style={td2}>{row[1]}</td>
                          <td style={td3}>{row[2]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              })()}
            </>
          )}

          <p style={pTitle}>{cfg.temDriver && cfg.tipo === 'luminaria' ? '2.2' : '2.1'} Documentação que acompanha a amostra:<Sup n={markerFor('documentacao')} /></p>
          <p style={{ ...pJ, marginTop: 8 }}>{cfg.documentacao || '—'}</p>

          <p style={pTitle}>{cfg.temDriver && cfg.tipo === 'luminaria' ? '2.3' : '2.2'} Observações:</p>
          {(() => {
            const falhas: string[] = []
            if ((cfg.resultadoConduzida ?? 'pass') === 'fail') falhas.push('Perturbações Conduzidas')
            if ((cfg.resultadoLoop      ?? 'pass') === 'fail') falhas.push('Perturbações Radiadas – Antena Loop')
            if ((cfg.resultadoAnexoB    ?? 'pass') === 'fail') falhas.push('Perturbações Radiadas – Anexo B (30–300 MHz)')
            if (falhas.length === 0) {
              return (
                <p style={{ ...pJ, marginTop: 8 }}>
                  • Os resultados deste relatório de ensaios apresentam itens conformes. Informações adicionais podem ser
                  acessadas em Parte 2 – Resultados dos ensaios.
                </p>
              )
            }
            return (
              <p style={{ ...pJ, marginTop: 8 }}>
                • Os resultados deste relatório de ensaios apresentam itens <strong>não conformes</strong>.
                {' '}O(s) ensaio(s) de <strong>{falhas.join('; ')}</strong> apresentou(aram) resultados não conformes com
                os limites estabelecidos pela norma. Informações adicionais podem ser acessadas em Parte 2 – Resultados dos ensaios.
              </p>
            )
          })()}

          <p style={pTitle}>3. Documento(s) normativo(s) utilizado(s):</p>
          {cfg.tipo === 'luminaria' && (
            <p style={{ ...pJ, marginTop: 8 }}>
              • Portaria INMETRO n°62, de 17 de fevereiro de 2022 - Regulamento Técnico de Qualidade e os Requisitos de Avaliação da Conformidade para Luminárias para a iluminação pública Viária - Consolidado.
            </p>
          )}
          <p style={{ ...pJ, marginTop: cfg.tipo === 'luminaria' ? 0 : 8 }}>
            • Associação Brasileira de Normas Técnicas. NBR IEC/CISPR 15/2014 - Limites e métodos de medição das
            radioperturbações características dos equipamentos elétricos de iluminação e similares. Rio de Janeiro, RJ, Brasil, 2014.
          </p>

        </Page>

        {/* ══ PÁGINA 2 — SEÇÃO 3.1 + 4 + SEÇÃO 5 + INÍCIO PARTE 2 ══ */}
        <Page flow>
          <PageHeader cfg={cfg} numDisplay={displayNum} />

          <p style={pTitle}>3.1 Documento(s) complementar(es):</p>
          <p style={{ ...pJ, marginTop: 8 }}>Os documentos complementares abaixo indicados não fazem parte do escopo de acreditação deste laboratório.</p>
          <p style={{ ...pJ, marginLeft: 14 }}>
            • International Electrotechnical Commission. CISPR 16-4-2 - Second Edition/2011, Specification for radio disturbance and immunity measuring apparatus and
            methods – Part 4-2: Uncertainties, statistics and limit modeling – Uncertainty in EMC measurements. Geneva, Switzerland.
          </p>

          <p style={pTitle}>4. Condições ambientais:</p>
          <p style={{ ...pJ, marginTop: 8 }}>Temperatura: 20 °C ± 5 °C</p>
          <p style={pJ}>Umidade Relativa: 55 % ± 15 %</p>

          <p style={pTitle}>5. Observações:</p>
          <p style={{ ...pJ, marginTop: 8 }}>
            A regra de decisão aplicada para a avaliação da conformidade do item de ensaio foi estabelecida conforme documentos
            normativos indicados no item 3 deste relatório e previamente contratados.
          </p>
          <p style={pJ}>
            Itens dos documentos normativos de referência deste relatório não descritos com resultados não foram solicitados pelo
            requerente ou não fazem parte do escopo de acreditação do laboratório.
          </p>
          {cfg.tipo === 'luminaria' && (
            <p style={pJ}>
              De acordo com o item 6.1.1.4.1.5 da Portaria INMETRO citada no item 3 da parte 1, o ensaio de interferência
              eletromagnética e rádio frequência foi conduzido nas tensões nominais de {tensoes.join(' e ')}.
            </p>
          )}

          <SecHeader>Parte 2 – Resultados dos ensaios<Sup n={markerFor('resultados')} /></SecHeader>

          <p style={pTitle}>
            1. Método de medição das tensões de perturbação conduzidas (Item 8 da Norma NBR IEC/CISPR 15/2014)
          </p>
          <p style={{ ...pJ, marginTop: 8 }}>A tensão de perturbação foi medida nos terminais de alimentação do sistema de iluminação.</p>
          <p style={pJ}>
            Os terminais de saída da LISN e os terminais do equipamento em ensaio foram interligados por um cabo flexível com
            3 condutores para conexão dos terminais de fase, neutro e terra.
          </p>
          <p style={pJ}>
            A distância entre os terminais de saída da LISN e os terminais do equipamento em ensaio foi ajustada para 0,8 m.
          </p>
          <p style={pJ}>As medições foram realizadas tanto no condutor fase como no condutor neutro, um de cada vez.</p>
        </Page>

        {/* ══ PÁGINA 3 — LIMITES CONDUZIDOS ══ */}
        <Page flow>
          <PageHeader cfg={cfg} numDisplay={displayNum} />

          <p style={pTitle}>1.1 Limites (Item 4 da Norma NBR IEC/CISPR 15/2014)</p>
          <p style={{ ...pSub, marginTop: 8 }}>1.1.1. Terminais de alimentação (Item 4.3.1 da Norma NBR IEC/CISPR 15/2014):</p>
          <LimitTable {...limCond1} />
          <p style={{ ...pSub, marginTop: 6 }}>1.1.2. Terminais de carga (Item 4.3.2 da Norma NBR IEC/CISPR 15/2014):</p>
          <LimitTable {...limCond2} />
          <p style={{ ...pSub, marginTop: 6 }}>1.1.3. Terminais de controle (Item 4.3.3 da Norma NBR IEC/CISPR 15/2014):</p>
          <LimitTable {...limCond3} />
        </Page>

        {/* ══ PÁGINA 4 — RADIADAS 9 kHz–300 MHz ══ */}
        <Page flow>
          <PageHeader cfg={cfg} numDisplay={displayNum} />

          <p style={pTitle}>
            2. Método de medição das perturbações eletromagnéticas radiadas na faixa de 9 kHz a 30 MHz (Item 9 da Norma NBR IEC/CISPR 15/2014)
          </p>
          <p style={{ ...pJ, marginTop: 8 }}>
            O equipamento a ser medido foi posicionado sobre uma mesa não condutora no centro da antena loop de 2,0 m.
          </p>
          <p style={pJ}>
            O receptor de medição foi conectado à antena loop por cabo coaxial blindado e a seleção de cada loop
            das 3 direções do campo foi efetuada através de uma chave coaxial.
          </p>
          <p style={pJ}>
            As medições foram feitas na faixa de frequências de 9 kHz a 30 MHz. As medições de quase pico foram realizadas
            apenas nas frequências em que as emissões de pico estavam próximas ou ultrapassaram a uma margem de 6 dB abaixo
            da linha de limite de quase-pico.
          </p>

          <p style={pTitle}>2.1 Limites (Item 4 da Norma NBR IEC/CISPR 15/2014)</p>
          <p style={{ ...pSub, marginTop: 8 }}>2.1.1. Faixa de 9 kHz a 30 MHz (Item 4.4.1 da Norma NBR IEC/CISPR 15/2014):</p>
          <LimitTable {...limRad1} />

          <p style={pTitle}>
            3. Método de medição das perturbações eletromagnéticas radiadas na faixa de 30 MHz a 300 MHz (Item 9 da Norma NBR IEC/CISPR 15/2014)
          </p>
          <p style={{ ...pJ, marginTop: 8 }}>
            Ensaios na faixa de 30 MHz a 300 MHz podem ser realizados através das especificações do Anexo B e com os
            limites apresentados abaixo, conforme a norma.
          </p>
          <p style={pJ}>
            O equipamento em ensaio foi colocado sobre blocos não condutivos com 10 cm de altura, sobre plano de referência
            de aterramento (ground plane) com dimensões pelo menos 20 cm maiores que as dimensões do equipamento ensaiado.
          </p>
          <p style={pJ}>
            O equipamento foi ligado a uma rede de acoplamento/desacoplamento (CDN), montada sobre placa de metal conectada ao terra.
          </p>
          <p style={{ ...pSub, marginTop: 8 }}>3.1. Faixa de 30 MHz a 300 MHz (Item 4.4.2 da Norma NBR IEC/CISPR 15/2014):</p>
          <LimitTable {...limRad2} />
        </Page>

        {/* ══ PÁGINAS — RESULTADOS RADIMATION ══ */}
        {(!docx.html || docx.loading) && (
          <Page flow>
            <PageHeader cfg={cfg} numDisplay={displayNum} />
            <SecHeader>Parte 2 – Resultados dos Ensaios</SecHeader>
            {!docx.html && !docx.loading && (
              <label className="upload-zone no-print flex flex-col items-center gap-2 p-6 mb-4 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 hover:border-yellow-300 cursor-pointer transition-all">
                <Upload size={18} className="text-gray-400" />
                <p className="text-gray-500 text-xs text-center">Carregar arquivo <b className="text-gray-700">.docx</b> do Radimation</p>
                <input type="file" accept=".docx" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDocx(f) }} />
              </label>
            )}
            {docx.loading && (
              <div className="upload-zone no-print flex items-center gap-2 p-4 mb-4 rounded-lg border border-dashed border-blue-200 bg-blue-50">
                <Loader2 size={14} className="animate-spin text-blue-500" />
                <span className="text-blue-600 text-xs">Processando arquivo…</span>
              </div>
            )}
          </Page>
        )}
        {docx.html && docxPages.map((pageHtml, i) => (
          <Page key={`docx-${i}`} flow>
            <PageHeader cfg={cfg} numDisplay={displayNum} />
            {i === 0 && (
              <>
                {wmfErrors.length > 0 && (
                  <div className="upload-zone no-print mb-2 px-3 py-2 rounded-lg border border-amber-400 bg-amber-50 text-amber-900">
                    <p className="text-[11px] font-semibold mb-1">Falha na conversão de gráficos WMF — copie e envie ao suporte:</p>
                    {wmfErrors.map((e, i) => (
                      <pre key={i} className="text-[10px] font-mono whitespace-pre-wrap break-all">{e}</pre>
                    ))}
                  </div>
                )}
                <div className="upload-zone no-print flex items-center justify-between px-3 py-2 mb-2 rounded-lg border border-green-200 bg-green-50">
                  <span className="text-green-700 text-[10px] font-mono truncate">{docx.filename}</span>
                  <button
                    onClick={() => { setDocx({ loading: false, html: null, filename: null }); sessionStorage.removeItem(DOCX_HTML_KEY); sessionStorage.removeItem(DOCX_NAME_KEY) }}
                    className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0">
                    <X size={12} />
                  </button>
                </div>
                <SecHeader>Parte 2 – Resultados dos Ensaios<Sup n={markerFor('resultados')} /></SecHeader>
              </>
            )}
            <div className="doc-content" style={{ fontFamily: 'Arial, sans-serif', fontSize: '11pt' }}
              dangerouslySetInnerHTML={{ __html: pageHtml }} />
          </Page>
        ))}

        {/* ══ PÁGINA — INCERTEZAS ══ */}
        <Page flow>
          <PageHeader cfg={cfg} numDisplay={displayNum} />
          <SecHeader>Incertezas de Medição (IM)</SecHeader>
          <p style={pJ}>
            A incerteza expandida de medição relatada é declarada como a incerteza padrão de medição multiplicada pelo
            fator de abrangência "k", para uma distribuição de probabilidade tipo t-Student, com graus de liberdade efetivos
            (veff) correspondentes a um nível de confiança de aproximadamente 95%.
          </p>
          <p style={pJ}>
            A incerteza padrão da medição foi determinada de acordo com o "Guia para Expressão da Incerteza de Medição",
            Terceira Edição Brasileira.
          </p>
          <LimitTable
            cols={['Item da norma', 'Mensurando', 'Faixa ou ponto de medição', 'Incerteza de medição', 'Fator de abrangência (k)']}
            rows={[
              ['4.3.1', 'Distúrbios conduzidos',  '9 kHz – 150 kHz',      '4,5 dB', '2,00'],
              ['4.3.1', 'Distúrbios conduzidos',  '150 kHz – 30,0 MHz',   '4,4 dB', '2,00'],
              ['4.4.1', 'Distúrbios radiados',    '9 kHz – 30,0 MHz',     '4,8 dB', '2,00'],
              ['4.4.2', 'Distúrbios radiados',    '30,0 MHz – 300,0 MHz', '3,7 dB', '2,00'],
            ]}
          />
        </Page>

        {/* ══ PÁGINAS DE FOTOS — mínimo 2 páginas (4 slots) ══ */}
        {photoPages.map((pair, pi) => {
          // Altura disponível para as 2 fotos (mm): página A4 − margens − header − secHeader(só pg0)
          const slotHeightMm = pi === 0 ? 103 : 116
          // Fotos 1 e 2 mais largas; fotos 3+ ligeiramente menores
          const slotMaxWidthMm = pi === 0 ? photoWidth : Math.max(Math.min(photoWidth, 140), 60)
          return (
            <Page key={`foto-${pi}`}>
              <PageHeader cfg={cfg} numDisplay={displayNum} />
              {pi === 0 && <SecHeader>Fotos da Amostra</SecHeader>}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[0, 1].map(slot => {
                  const ph = pair[slot] ?? null
                  const figNum = pi * 2 + slot + 1
                  return (
                    <div key={slot} style={{
                      height: `${slotHeightMm}mm`,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderBottom: slot === 0 ? '1px dashed #ddd' : 'none',
                      padding: '3mm 8mm',
                      boxSizing: 'border-box',
                      position: 'relative',
                    }}>
                      {ph ? (
                        <>
                          <div className="no-print" style={{ position: 'absolute', top: 4, right: 4 }}>
                            <button
                              onClick={() => setPhotos(prev => prev.filter((_, j) => j !== pi * 2 + slot))}
                              style={{ fontSize: 10, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer' }}>
                              ✕ remover
                            </button>
                          </div>
                          <img
                            src={ph.url} alt={`Figura ${figNum}`}
                            style={{
                              maxWidth: `${slotMaxWidthMm}mm`,
                              maxHeight: `${slotHeightMm - 14}mm`,
                              width: 'auto',
                              height: 'auto',
                              objectFit: 'contain',
                              border: '1px solid #ccc',
                              display: 'block',
                            }}
                          />
                          <p style={{ fontSize: FS.xs, color: '#555', marginTop: 5, textAlign: 'center', flexShrink: 0 }}>
                            Figura {figNum} – Amostra ensaiada<Sup n={markerFor(`foto_${figNum}`)} />
                          </p>
                        </>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </Page>
          )
        })}

        {/* ══ SEÇÃO 6 — HISTÓRICO DE ALTERAÇÕES (só em modo emenda) ══ */}
        {emendaDraft && emendaDraft.alteracoes.length > 0 && (
          <Page flow>
            <PageHeader cfg={cfg} numDisplay={displayNum} />
            <SecHeader>6. Histórico de Alterações</SecHeader>
            <p style={pJ}>
              Emenda <b>{formatEmendaNumero(emendaDraft.numRelatorioOriginal, emendaDraft.emendaNum)}</b> emitida em {fmtDate(emendaDraft.dataEmenda)},
              referente ao Relatório de Ensaio n° {emendaDraft.numRelatorioOriginal}.
              As alterações identificadas em relação ao documento original são listadas abaixo:
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: FS.sm }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '3px 8px', background: GRAY1, width: '8%', textAlign: 'center' }}>N°</th>
                  <th style={{ border: '1px solid #ccc', padding: '3px 8px', background: GRAY1, textAlign: 'left' }}>Descrição da Alteração</th>
                </tr>
              </thead>
              <tbody>
                {emendaDraft.alteracoes.map((a, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f5f8ff' }}>
                    <td style={{ border: '1px solid #ccc', padding: '3px 8px', textAlign: 'center', fontWeight: 700, color: '#c00' }}>{a.marker}</td>
                    <td style={{ border: '1px solid #ccc', padding: '3px 8px' }}>
                      {a.descricao}
                      {a.campos && a.campos.length > 0 && (
                        <span style={{ color: '#666', fontSize: '9pt' }}> — {a.campos.join(', ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Page>
        )}

        {/* ══ ÚLTIMA PÁGINA — OBSERVAÇÕES FINAIS ══ */}
        <Page flow>
          <PageHeader cfg={cfg} numDisplay={displayNum} />
          <SecHeader>Observações Finais</SecHeader>
          {[
            'Este relatório de ensaio atende aos requisitos de acreditação da Cgcre, que avaliou a competência do laboratório.',
            'O fornecimento da amostra pelo cliente isenta o LABELO-PUCRS de responsabilidade quanto à sua representatividade em relação a lotes de fabricação e comercialização.',
            'O presente relatório de ensaio é medido exclusivamente para a amostra ensaiada, nas condições em que foram realizados os ensaios e não sendo extensivo a quaisquer lotes, mesmo que similares.',
            'A partir do momento em que a amostra é retirada do laboratório, esgota-se a possibilidade de contestação dos resultados ou mesmo de repetição dos ensaios, já que o LABELO deixa de ser responsável pela sua manutenção.',
            'É vedada a reprodução do presente relatório de ensaio, no todo ou em parte, sem prévia autorização do LABELO-PUCRS originada por solicitação formal do contratante.',
            'A Cgcre é signatária do Acordo de Reconhecimento Mútuo da ILAC (International Laboratory Accreditation Cooperation).',
            'A Cgcre é signatária do Acordo de Reconhecimento Mútuo da IAAC (InterAmerican Accreditation Cooperation).',
            'Os ensaios foram realizados nas instalações do LABELO-PUCRS.',
          ].map((obs, i) => (
            <p key={i} style={{ ...pJ, marginLeft: 10 }}>• {obs}</p>
          ))}

          {/* Signatário — em fluxo (margin-top empurra pro fundo). Em fluxo dá
              altura real à página, evitando que o Chromium colapse/descarte a
              última página por ser "fina" (só conteúdo absoluto). */}
          <div style={{ marginTop: '85mm', display: 'flex', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', minWidth: 260 }}>
              <div style={{ borderTop: '1px solid #333', paddingTop: 8 }}>
                <p style={{ fontSize: FS.sm, color: '#333', marginBottom: 2 }}>Signatário Autorizado</p>
                <p style={{ fontSize: FS.xs, color: '#666' }}>LABELO-PUCRS</p>
              </div>
            </div>
          </div>
        </Page>

      </div>
    </>
  )
}
