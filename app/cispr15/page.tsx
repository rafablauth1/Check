'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Lightbulb, Lamp, ArrowRight, Upload, X, Loader2,
  Trash2, CheckCircle2, FileText, FolderOpen, Users, Database, History,
  BookOpen, AlertTriangle, Lock, Settings, ScanText, RefreshCw, Plus, ChevronDown, Search,
  Shield, ShieldCheck, ShieldX,
} from 'lucide-react'
import { cn, normWatts } from '@/lib/utils'
import {
  type Cispr15Config, type LoteConfig, type ClienteDB, type RelatorioSalvo,
  DEFAULTS,
  CFG_KEY, PHOTOS_KEY, DOCX_HTML_KEY, DOCX_NAME_KEY, LOTE_KEY, CLIENTES_KEY,
  RELATORIOS_KEY, RELATORIO_DOCX_PFX, EMENDA_DRAFT_KEY, LOCKED_KEY, formatEmendaNumero,
  AGENDA_KEY, SETTINGS_KEY, SESSION_KEY, AUTH_KEY,
  newAmostra, docxTemFail,
} from './types'
import { ClientesTab }     from './ClientesTab'
import { RelatoriosTab }   from './RelatoriosTab'
import { EmendasTab }      from './EmendasTab'
import { iniciarMarcador, iniciarMarcadorSeAusente } from '@/lib/tempos'

/* ─── helpers ─────────────────────────────────────────────────────────────── */
async function resizeToBase64(file: File, maxW = 1024): Promise<{ base64: string; url: string }> {
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
      resolve({ base64, url: `data:image/jpeg;base64,${base64}` })
    }
    img.onerror = reject
    img.src = obj
  })
}


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

interface VoltData { loading: boolean; html: string | null; filename: string | null }
interface Photo    { url: string; name: string; base64: string }

interface AiSugestao {
  produto: string; fabricante: string; modelo: string; identificador: string
  potencia: string; tensaoAlim: string; frequencia: string
}

/* ─── página ──────────────────────────────────────────────────────────────── */
export default function Cispr15ConfigPage() {
  const router = useRouter()
  const [cfg,    setCfg]    = useState<Cispr15Config>(DEFAULTS)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [docx,   setDocx]   = useState<VoltData>({ loading: false, html: null, filename: null })
  const [confResult, setConfResult] = useState<'conforme' | 'reprovado' | null>(null)
  const [flash,        setFlash]       = useState<string | null>(null)
  const [pastaLoading, setPastaLoading] = useState(false)
  const [gerandoRel,   setGerandoRel]  = useState(false)
  const [locked,       setLocked]      = useState(false)
  const [showPwdModal, setShowPwdModal] = useState(false)
  const [pwdInput,     setPwdInput]    = useState('')
  const [pwdError,     setPwdError]    = useState(false)
  const pwdInputRef = useRef<HTMLInputElement>(null)
  const [gateOpen,     setGateOpen]    = useState(false)
  const [capsLock,     setCapsLock]    = useState(false)
  const [cepStatus,    setCepStatus]   = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [gateInput,    setGateInput]   = useState('')
  const [gateError,    setGateError]   = useState(false)
  const [appPassword,  setAppPassword] = useState('')
  // Exclusão de emenda protegida por senha
  const [emendaDel,    setEmendaDel]    = useState<{ relatorioId: string; emendaNum: number } | null>(null)
  const [emendaDelPwd, setEmendaDelPwd] = useState('')
  const [emendaDelErr, setEmendaDelErr] = useState(false)
  const gateInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'formulario' | 'clientes' | 'emendas' | 'relatorios'>('formulario')
  const [loteAtivo, setLoteAtivo] = useState(0) // amostras não emitidas no lote em andamento
  const [relatoriosList, setRelatoriosList] = useState<RelatorioSalvo[]>([])
  const [isElectron,   setIsElectron]  = useState(false)
  const [eutFolder,    setEutFolder]   = useState<string | null>(null)
  const [analisando,    setAnalisando]   = useState(false)
  const [aiSugestao,    setAiSugestao]  = useState<AiSugestao | null>(null)
  const [ocrTexto,      setOcrTexto]    = useState<string | null>(null)
  const [ocrExpanded,   setOcrExpanded] = useState(false)
  const [clientes,      setClientes]     = useState<ClienteDB[]>([])
  const [clienteQ,      setClienteQ]     = useState('')
  const [clienteOpen,   setClienteOpen]  = useState(false)
  const photoRef  = useRef<HTMLInputElement>(null)
  const pastaRef  = useRef<HTMLInputElement>(null)
  const cfgLoaded = useRef(false)
  const trocarRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    photoRef.current?.setAttribute('webkitdirectory', '')
    pastaRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  useEffect(() => {
    const check = (e: KeyboardEvent) => setCapsLock(e.getModifierState('CapsLock'))
    window.addEventListener('keydown', check)
    window.addEventListener('keyup', check)
    return () => { window.removeEventListener('keydown', check); window.removeEventListener('keyup', check) }
  }, [])

  useEffect(() => {
    // Marca abertura do formulário de emissão (métrica de tempo até gerar o PDF)
    iniciarMarcadorSeAusente('emissao')
    // Detecta lote em andamento (amostras ainda não emitidas)
    try {
      const raw = localStorage.getItem(LOTE_KEY)
      const lote = raw ? JSON.parse(raw) : null
      setLoteAtivo(Array.isArray(lote?.amostras) ? lote.amostras.filter((a: any) => !a?.numRelatorio).length : 0)
    } catch { setLoteAtivo(0) }
    // Sessão nova: limpa o formulário ao reiniciar o app
    const isFresh = !sessionStorage.getItem(SESSION_KEY)
    if (isFresh) {
      sessionStorage.setItem(SESSION_KEY, '1')
      ;[CFG_KEY, PHOTOS_KEY, LOCKED_KEY].forEach(k => localStorage.removeItem(k))
      ;[DOCX_HTML_KEY, DOCX_NAME_KEY].forEach(k => sessionStorage.removeItem(k))
    } else {
      try {
        const raw = localStorage.getItem(CFG_KEY)
        if (raw) setCfg({ ...DEFAULTS, ...JSON.parse(raw) })
      } catch {}
      try {
        const rawP = localStorage.getItem(PHOTOS_KEY)
        if (rawP) {
          const arr: { name: string; base64: string }[] = JSON.parse(rawP)
          setPhotos(arr.map(p => ({ ...p, url: `data:image/jpeg;base64,${p.base64}` })))
        }
      } catch {}
      const dHtml = sessionStorage.getItem(DOCX_HTML_KEY)
      const dName = sessionStorage.getItem(DOCX_NAME_KEY)
      if (dHtml) setDocx({ loading: false, html: dHtml, filename: dName })
      if (localStorage.getItem(LOCKED_KEY)) {
        try {
          const rawCfg = localStorage.getItem(CFG_KEY)
          const cfgParsed = rawCfg ? JSON.parse(rawCfg) : null
          if (cfgParsed?.numRelatorio) setLocked(true)
          else localStorage.removeItem(LOCKED_KEY)
        } catch { localStorage.removeItem(LOCKED_KEY) }
      }
    }

    // Carregar configurações e verificar senha
    async function initSettings() {
      let senha = ''
      const api = (window as any).electronAPI
      if (api) {
        setIsElectron(true)
        try { const s = await api.getSettings(); senha = s.senhaEmissao ?? '' } catch {}
        const stored = sessionStorage.getItem('eutFolderPath')
        if (stored) {
          setEutFolder(stored)
          const folderName = stored.split(/[/\\]/).pop() ?? ''
          applyFolderProtocolo(folderName)
        }
      } else {
        try {
          const raw = localStorage.getItem(SETTINGS_KEY)
          if (raw) senha = (JSON.parse(raw) as any).senhaEmissao ?? ''
        } catch {}
      }
      setAppPassword(senha)
      if (senha && !sessionStorage.getItem(AUTH_KEY)) setGateOpen(true)
    }
    initSettings()
    loadRelatorios()
    loadClientesLocal()
  }, [])

  // Extrai protocolo e orçamento do nome da pasta: "26041953_0887" ou "O26041953_887"
  function applyFolderProtocolo(folderName: string) {
    const m = folderName.match(/[A-Za-z]?(\d{6,8})[_\-](\d{3,6})/)
    if (m) setCfg(prev => ({ ...prev, protocolo: m[1], orcamento: m[2] }))
  }

  async function loadRelatorios() {
    const api = (window as any).electronAPI
    if (api) {
      try {
        const res = await api.getRelatorios()
        if (res.ok && Array.isArray(res.relatorios) && res.relatorios.length > 0) {
          setRelatoriosList(res.relatorios); return
        }
        try {
          const raw = localStorage.getItem(RELATORIOS_KEY)
          if (raw) {
            const migrated = JSON.parse(raw)
            if (Array.isArray(migrated) && migrated.length > 0) {
              await api.saveRelatorios(migrated)
              setRelatoriosList(migrated); return
            }
          }
        } catch {}
        if (res.ok) { setRelatoriosList([]); return }
      } catch {}
    }
    try {
      const raw = localStorage.getItem(RELATORIOS_KEY)
      if (raw) setRelatoriosList(JSON.parse(raw))
    } catch {}
  }

  async function loadClientesLocal() {
    const api = (window as any).electronAPI
    if (api) {
      try {
        const res = await api.getClientes()
        if (res.ok && Array.isArray(res.clientes) && res.clientes.length > 0) { setClientes(res.clientes); return }
        try {
          const raw = localStorage.getItem(CLIENTES_KEY)
          if (raw) {
            const migrated = JSON.parse(raw)
            if (Array.isArray(migrated) && migrated.length > 0) {
              await api.saveClientes(migrated)
              setClientes(migrated); return
            }
          }
        } catch {}
        if (res.ok) { setClientes([]); return }
      } catch {}
    }
    try {
      const raw = localStorage.getItem(CLIENTES_KEY)
      if (raw) setClientes(JSON.parse(raw))
    } catch {}
  }

  async function preencherDaAgenda(protocolo: string) {
    const proto = protocolo.trim().toLowerCase()
    if (!proto) return
    let lista: any[] = []
    const api = (window as any).electronAPI
    if (api) {
      try { const r = await api.getAgenda(); if (r.ok && Array.isArray(r.agenda)) lista = r.agenda } catch {}
    }
    if (!lista.length) {
      try { const raw = localStorage.getItem(AGENDA_KEY); if (raw) lista = JSON.parse(raw) } catch {}
    }
    const item = lista.find((a: any) => a.protocolo?.trim().toLowerCase() === proto)
    if (!item) return
    const temDados = item.fabricante || item.modelo || item.potencia || item.tensaoAlim || item.produto
    if (!temDados) return
    setCfg(prev => ({
      ...prev,
      tipo: item.tipo ?? prev.tipo,
      cliente: item.cliente || prev.cliente,
      clienteRua: item.clienteRua || prev.clienteRua,
      clienteCidade: item.clienteCidade || prev.clienteCidade,
      clienteCep: item.clienteCep || prev.clienteCep,
      produto: item.produto || prev.produto,
      fabricante: item.fabricante || prev.fabricante,
      modelo: item.modelo || prev.modelo,
      identificador: item.identificador || prev.identificador,
      potencia: item.potencia || prev.potencia,
      tensaoAlim: item.tensaoAlim || prev.tensaoAlim,
      frequencia: item.frequencia || prev.frequencia,
      documentacao: item.documentacao || prev.documentacao,
      orcamento: item.orcamento || prev.orcamento,
      responsavel: item.responsavel || prev.responsavel,
    }))
    flash4(`Dados pré-carregados da agenda — protocolo ${item.protocolo}`)
  }

  function preencherClienteDoOrcamento(orcamento: string) {
    const orc = orcamento.trim()
    if (!orc) return
    const match = relatoriosList.find(r => r.cfg.orcamento?.trim() === orc && r.clienteNome)
    if (!match) return
    setCfg(prev => ({
      ...prev,
      cliente: match.clienteNome,
      clienteRua: match.cfg.clienteRua  || prev.clienteRua,
      clienteCidade: match.cfg.clienteCidade || prev.clienteCidade,
      clienteCep: match.cfg.clienteCep  || prev.clienteCep,
    }))
    flash4(`Cliente "${match.clienteNome}" associado ao orçamento ${orc}`)
  }

  useEffect(() => {
    // skip the very first run (cfg = DEFAULTS) — wait for the load effect to finish first
    if (!cfgLoaded.current) { cfgLoaded.current = true; return }
    // debounce: não bloqueia a digitação com I/O síncrona a cada tecla
    const t = setTimeout(() => localStorage.setItem(CFG_KEY, JSON.stringify(cfg)), 400)
    return () => clearTimeout(t)
  }, [cfg])

  function flash4(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(null), 4000)
  }

  /* ── handlers cfg ── */
  // Cache de handlers por campo: identidade estável entre renders (não recria
  // 40+ closures a cada tecla, evita churn de re-render no formulário grande).
  const setHandlers = useRef<Partial<Record<keyof Cispr15Config,
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void>>>({})
  const set = (k: keyof Cispr15Config) => {
    const cache = setHandlers.current
    if (!cache[k]) cache[k] = (e) => setCfg(prev => ({ ...prev, [k]: e.target.value }))
    return cache[k]!
  }

  function setTipo(t: 'lampada' | 'luminaria') {
    setCfg(prev => ({ ...prev, tipo: t, tensaoConfig: '127_220' }))
  }

  async function handleCep(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
    setCfg(prev => ({ ...prev, clienteCep: formatted }))
    if (digits.length < 8) { setCepStatus('idle'); return }
    setCepStatus('loading')
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setCfg(prev => ({ ...prev, clienteCep: formatted, clienteCidade: `${data.localidade} - ${data.uf}` }))
        setCepStatus('ok')
      } else {
        setCepStatus('error')
      }
    } catch {
      setCepStatus('error')
    }
  }

  function novoRelatorio() {
    if (!confirm('Fechar formulário atual e iniciar um novo em branco?')) return
    ;[CFG_KEY, PHOTOS_KEY, LOCKED_KEY].forEach(k => localStorage.removeItem(k))
    ;[DOCX_HTML_KEY, DOCX_NAME_KEY].forEach(k => sessionStorage.removeItem(k))
    setCfg(DEFAULTS)
    setPhotos([])
    setDocx({ loading: false, html: null, filename: null })
    setLocked(false)
    iniciarMarcador('emissao') // reinicia o cronômetro para a nova emissão
  }

  function limparDados() {
    if (!confirm('Limpar TODOS os dados do formulário e anexos?')) return
    ;[CFG_KEY, PHOTOS_KEY, LOCKED_KEY].forEach(k => localStorage.removeItem(k))
    ;[DOCX_HTML_KEY, DOCX_NAME_KEY].forEach(k => sessionStorage.removeItem(k))
    setCfg(DEFAULTS)
    setPhotos([])
    setDocx({ loading: false, html: null, filename: null })
    setLocked(false)
    setFlash(null)
  }

  /* ── fotos ── */
  async function handlePhotosFromFiles(files: File[]) {
    const next: Photo[] = []
    for (const f of files) {
      try { next.push({ ...(await resizeToBase64(f)), name: f.name }) } catch {}
    }
    setPhotos(next)
    try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(next.map(({ name, base64 }) => ({ name, base64 })))) }
    catch { alert('Armazenamento cheio — reduza o número de fotos.') }
  }

  async function handlePhotos(files: FileList) {
    const getNum = (n: string) => parseInt(n.replace(/\.[^/.]+$/, '').replace(/\D/g, ''), 10) || 0
    const sorted = Array.from(files).filter(f => f.type.startsWith('image/')).sort((a, b) => getNum(a.name) - getNum(b.name))
    await handlePhotosFromFiles(sorted)
  }

  async function handlePastaCompleta(files: FileList) {
    setPastaLoading(true)
    try {
      const all = Array.from(files)
      const getNum = (n: string) => parseInt(n.replace(/\.[^/.]+$/, '').replace(/\D/g, ''), 10) || 0
      // Detecção robusta: type pode vir vazio em pastas — também aceita por extensão
      const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|bmp|gif|webp|tiff?)$/i.test(f.name)
      const docxFile   = all.find(f => f.name.toLowerCase().endsWith('.docx'))
      const imageFiles = all.filter(isImage).sort((a, b) => getNum(a.name) - getNum(b.name))
      if (!docxFile && imageFiles.length === 0) {
        alert('Pasta inválida — certifique-se de que contém um .docx e uma subpasta de fotos.')
        return
      }
      await Promise.all([
        docxFile              ? handleDocx(docxFile)              : Promise.resolve(),
        imageFiles.length > 0 ? handlePhotosFromFiles(imageFiles) : Promise.resolve(),
      ])
    } finally { setPastaLoading(false) }
  }

  async function handleAbrirPastaEut() {
    setPastaLoading(true)
    try {
      const api = (window as any).electronAPI
      const res = await api.abrirPastaEut()
      if (res.canceled) return
      setEutFolder(res.folderPath)
      sessionStorage.setItem('eutFolderPath', res.folderPath)
      applyFolderProtocolo(res.folderName)
      if (res.docxBuffer) {
        setDocx({ loading: true, html: null, filename: null })
        try {
          const blob = new Blob([new Uint8Array(res.docxBuffer)], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          })
          const fd = new FormData()
          fd.append('file', new File([blob], res.docxName || 'ensaio.docx', { type: blob.type }))
          const resp = await fetch('/api/parse-docx', { method: 'POST', body: fd })
          const result = await resp.json()
          if (result.html) {
            const erros = validarSecoesDocx(result.html)
            if (erros.length > 0) {
              alert(`DOCX com medições repetidas — corrija no Radimation e reenvie:\n\n• ${erros.join('\n• ')}`)
              setDocx({ loading: false, html: null, filename: null })
            } else {
              setDocx({ loading: false, html: result.html, filename: res.docxName })
              sessionStorage.setItem(DOCX_HTML_KEY, result.html)
              sessionStorage.setItem(DOCX_NAME_KEY, res.docxName)
            }
          } else {
            setDocx({ loading: false, html: null, filename: null })
            alert('Erro ao processar DOCX: ' + (result.error ?? 'desconhecido'))
          }
        } catch (e: any) {
          setDocx({ loading: false, html: null, filename: null })
          alert('Erro ao processar DOCX: ' + e.message)
        }
      }
      if (res.images?.length > 0) {
        const next: Photo[] = res.images.map((img: any) => ({
          name: img.name,
          base64: img.base64,
          url: `data:image/${img.ext === 'png' ? 'png' : 'jpeg'};base64,${img.base64}`,
        }))
        setPhotos(next)
        try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(next.map(p => ({ name: p.name, base64: p.base64 })))) }
        catch { alert('Armazenamento cheio — reduza o número de fotos.') }
      }
      flash4(`Pasta carregada: ${res.folderName}`)
    } catch (e: any) {
      alert('Erro ao abrir pasta: ' + e.message)
    } finally {
      setPastaLoading(false)
    }
  }

  function removePhoto(i: number) {
    const updated = photos.filter((_, j) => j !== i)
    setPhotos(updated)
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(updated.map(({ name, base64 }) => ({ name, base64 }))))
  }

  async function replacePhoto(i: number, file: File) {
    try {
      const ph = { ...(await resizeToBase64(file)), name: file.name }
      const updated = photos.map((p, j) => j === i ? ph : p)
      setPhotos(updated)
      localStorage.setItem(PHOTOS_KEY, JSON.stringify(updated.map(({ name, base64 }) => ({ name, base64 }))))
    } catch {}
  }

  async function adicionarFotos(files: FileList) {
    const getNum = (n: string) => parseInt(n.replace(/\.[^/.]+$/, '').replace(/\D/g, ''), 10) || 0
    const sorted = Array.from(files).filter(f => f.type.startsWith('image/')).sort((a, b) => getNum(a.name) - getNum(b.name))
    const extras: Photo[] = []
    for (const f of sorted) {
      try { extras.push({ ...(await resizeToBase64(f)), name: f.name }) } catch {}
    }
    const updated = [...photos, ...extras]
    setPhotos(updated)
    try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(updated.map(({ name, base64 }) => ({ name, base64 })))) }
    catch { alert('Armazenamento cheio — reduza o número de fotos.') }
  }

  function parsearOCR(text: string, tipo: 'lampada' | 'luminaria'): AiSugestao {
    // normaliza para NFC (Windows OCR pode retornar NFD em alguns campos)
    const t  = text.normalize('NFC')
    // versão ascii-fold para buscas de rótulos com diacríticos
    const tn = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

    // ── Potência ──────────────────────────────────────────────────────────────
    const potM = t.match(/(\d+(?:[,\.]\d+)?)\s*[Ww](?=[\s,;\n\r]|$)/m)
    const potencia = potM ? potM[1].replace(',', '.') + 'W' : ''

    // ── Tensão ────────────────────────────────────────────────────────────────
    // Estratégia: se houver rótulo "Tensão:/Voltage:", usa ele.
    // Senão: acha linhas que contenham "VAC" ou "AC" e extrai os números 2-4 dígitos
    // que estiverem nessa linha — voltagens válidas ficam entre 85 e 480V.
    let tensaoAlim = ''
    const tensLabelM = tn.match(/(?:tens[aã]o|voltage|input|alimenta[cç][aã]o)\s*[:\-]?\s*([\d][^\n\r]{3,25})/)
    if (tensLabelM) {
      tensaoAlim = tensLabelM[1].trim().split(/[\n\r]/)[0].replace(/\s+/g, ' ').trim()
    } else {
      const acLines = t.split(/\r?\n/).filter(l => /V\s*AC|VAC|\bAC[~\s]/i.test(l))
      for (const line of acLines) {
        const nums = [...line.matchAll(/\b(\d{2,4})\b/g)]
          .map(m => parseInt(m[1]))
          .filter(v => v >= 85 && v <= 480)
        if (nums.length >= 2) { tensaoAlim = nums.join('-') + 'VAC'; break }
        if (nums.length === 1) { tensaoAlim = nums[0] + 'VAC'; break }
      }
      if (!tensaoAlim) {
        const tr = t.match(/\b\d{2,3}\s*[Vv]?\s*[-–~]\s*\d{2,3}\s*[Vv][Aa]?[Cc]?[~]?/m)
        tensaoAlim = tr ? tr[0].trim() : ''
      }
    }

    // ── Frequência ────────────────────────────────────────────────────────────
    const freqM = t.match(/\d{2}\s*[\/\\]\s*\d{2}\s*[Hh][Zz]|\d{2,3}\s*[Hh][Zz]/m)
    const frequencia = freqM ? freqM[0].replace(/\s+/g, '') : ''

    // ── Modelo: rótulo explícito primeiro, depois fallback alfanum estrito ────
    // fallback só aceita padrão tipo "AGN7150D4": 3+ letras maiúsculas + 3+ dígitos
    const modeloM  = t.match(/(?:Mod(?:elo)?\.?|Model(?:o)?|M[\/\.]N\.?|MN\.?|Part(?:\.?[Nn]o)?\.?|P[\/\.]N\.?|[Tt]ipo)\s*[:\-.]?\s*([A-Z0-9][A-Z0-9\-\.\/]{2,30})/i)
    const modeloFb = t.match(/\b([A-Z]{3,6}\d{3,6}[A-Z0-9]{0,6})\b/)
    const modelo   = modeloM?.[1]?.trim().split(/[\n\r;]/)[0].trim()
      ?? modeloFb?.[1]?.trim()
      ?? ''

    // ── Fabricante ────────────────────────────────────────────────────────────
    const fabIdx = tn.search(/fabricante|manufacturer|marca|brand|mfr/)
    let fabricante = ''
    if (fabIdx >= 0) {
      const afterLabel = t.slice(fabIdx).match(/[^\n\r:]{3,12}:\s*([^\n\r]{2,60})/)
      if (afterLabel) {
        fabricante = afterLabel[1].trim().replace(/[\s=|[\]]+$/, '').split(/[;\n\r]/)[0].trim()
      }
    }

    // ── Produto ───────────────────────────────────────────────────────────────
    const prodM = t.match(/(?:L[aâ]mpada|Lumin[aá]ria)[^\n\r]{0,50}/i)
    const produto = prodM?.[0]?.trim() ?? ''

    // ── Identificador ─────────────────────────────────────────────────────────
    // usa tn (ascii-fold) para encontrar o rótulo, mas captura do texto original t
    const serieMatchIdx = tn.search(/(?:serie|n[o°]?\.?\s*(?:de\s+)?serie|s\/n|sn\b|ns\b)/)
    const idSerie = serieMatchIdx >= 0
      ? t.slice(serieMatchIdx).match(/[^:\-.\n\r]{0,15}[:\-.]?\s*([A-Za-z0-9]{3,20})/)
      : null
    const idBarras = t.match(/(?:C[oó]d(?:igo)?\s*(?:de\s*)?[Bb]arras?|EAN|GTIN)\s*[:\-]?\s*(\d{8,20})/i)
    const identificador = tipo === 'lampada'
      ? (idBarras?.[1] ?? t.match(/\b(\d{12,14})\b/m)?.[1] ?? '')
      : (idSerie?.[1]?.trim() ?? '')

    // ── Protocolo e Orçamento: busca linha a linha ───────────────────────────
    // Protocolo: 8 dígitos seguidos de "-N" (ex: "§026041953-1" → "26041953")
    // Orçamento: número curto (3-6 dígitos) em qualquer das 4 linhas seguintes
    return { produto, fabricante, modelo, identificador, potencia, tensaoAlim, frequencia }
  }

  // Converte para grayscale via canvas — remove ruído de cor sem alterar contraste
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

  async function analisarFotos() {
    if (!photos.length) return
    setAnalisando(true)
    setAiSugestao(null)
    setOcrTexto(null)
    try {
      // luminária: só foto 3 (idx 2) — etiqueta lateral/traseira clara
      // lâmpada:   fotos 3 e 4 (idx 2-3) — caixinha com código de barras
      const target = cfg.tipo === 'luminaria'
        ? [photos[2]].filter(Boolean)
        : photos.slice(2, 4).filter(Boolean)
      if (!target.length) {
        alert('Nenhuma foto disponível na posição esperada (foto 3 ou 4). Verifique as fotos carregadas.')
        return
      }
      const gray = await Promise.all(target.map(p => toGrayscale(p.base64)))
      let texts: string[] = []

      // primary: Windows.Media.Ocr via Electron IPC
      const api = (window as any).electronAPI
      if (api?.recognizeOcr) {
        try {
          const res = await api.recognizeOcr(gray.map(b64 => ({ base64: b64 })))
          if (res?.ok && res.texts?.length) {
            texts = (res.texts as string[]).filter(t => t.trim())
          }
        } catch {}
      }

      // fallback: Tesseract.js (browser / no Electron)
      if (!texts.length) {
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker(['por', 'eng'])
        await worker.setParameters({ tessedit_pageseg_mode: '6' } as any)
        for (const b64 of gray) {
          try {
            const { data: { text } } = await worker.recognize(`data:image/jpeg;base64,${b64}`)
            if (text.trim()) texts.push(text.trim())
          } catch {}
        }
        await worker.terminate()
      }

      if (!texts.length) {
        alert('Não foi possível extrair texto das fotos. Tente fotos com maior resolução e texto legível.')
        return
      }
      const allText = texts.join('\n\n')
      setOcrTexto(allText)
      const sugestao = parsearOCR(allText, cfg.tipo)
      const temAlgo = Object.values(sugestao).some(v => v)
      if (!temAlgo) {
        alert('OCR não encontrou campos reconhecíveis. O texto extraído está disponível abaixo para consulta.')
        setAiSugestao(sugestao)
        return
      }
      setAiSugestao(sugestao)
    } catch (e: any) {
      alert('Erro no OCR: ' + e.message)
    } finally {
      setAnalisando(false)
    }
  }

  function aplicarSugestao(campo: keyof AiSugestao) {
    if (!aiSugestao) return
    setCfg(prev => ({ ...prev, [campo]: aiSugestao[campo] }))
  }

  function aplicarTodasSugestoes() {
    if (!aiSugestao) return
    const campos = Object.keys(aiSugestao) as (keyof AiSugestao)[]
    const filled = campos.filter(c => aiSugestao[c])
    setCfg(prev => {
      const next = { ...prev }
      for (const c of filled) (next as any)[c] = aiSugestao[c]
      return next
    })
    setAiSugestao(null)
    flash4('Campos preenchidos pela IA')
  }

  /* ── validação de seções do DOCX (duplicatas Radimation) ── */
  function validarSecoesDocx(html: string): string[] {
    try {
      const dom = new DOMParser().parseFromString(html, 'text/html')
      let conduzida = 0, loop = 0, anexoB = 0
      dom.querySelectorAll('div').forEach(div => {
        if (!(div.getAttribute('style') ?? '').includes('page-break-before')) return
        const text = div.textContent ?? ''
        if (/conduzida|conducted/i.test(text))        conduzida++
        else if (/\bloop\b/i.test(text))              loop++
        else if (/anexo\s*b|annex\s*b/i.test(text))  anexoB++
      })
      if (conduzida === 0 && loop === 0 && anexoB === 0) return []
      const v = cfg.tipo === 'luminaria' ? 1 : cfg.tensaoConfig === '127' ? 1 : cfg.tensaoConfig === '127_220_277' ? 3 : 2
      const erros: string[] = []
      if (conduzida > v * 2) erros.push(`Conduzida (LISN + NEUTRAL): ${conduzida} seções — máx. ${v * 2} (${v} tensão × 2)`)
      if (loop      > v * 3) erros.push(`Loop: ${loop} seções — máx. ${v * 3} (${v} tensão × 3)`)
      if (anexoB    > v)     erros.push(`Anexo B: ${anexoB} seções — máx. ${v} (${v} tensão × 1)`)
      return erros
    } catch { return [] }
  }

  /* ── docx ── */
  async function handleDocx(file: File) {
    setDocx({ loading: true, html: null, filename: null })
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/parse-docx', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const erros = validarSecoesDocx(data.html)
      if (erros.length > 0) {
        alert(`DOCX com medições repetidas — corrija no Radimation e reenvie:\n\n• ${erros.join('\n• ')}`)
        setDocx({ loading: false, html: null, filename: null })
        return
      }
      setDocx({ loading: false, html: data.html, filename: file.name })
      sessionStorage.setItem(DOCX_HTML_KEY, data.html)
      sessionStorage.setItem(DOCX_NAME_KEY, file.name)
    } catch (err: any) {
      alert(`Erro ao processar o arquivo: ${err.message}`)
      setDocx({ loading: false, html: null, filename: null })
    }
  }

  function removeDocx() {
    setDocx({ loading: false, html: null, filename: null })
    sessionStorage.removeItem(DOCX_HTML_KEY)
    sessionStorage.removeItem(DOCX_NAME_KEY)
  }

  /* ── verificar conformidade: busca veredito "Fail" no docx do Radimation ── */
  function verificarConformidadeUnitaria() {
    if (!docx.html) { alert('Carregue o arquivo .docx do Radimation primeiro.'); return }
    const fail = docxTemFail(docx.html)
    setConfResult(fail ? 'reprovado' : 'conforme')
    if (fail) {
      alert('⚠ Veredito "Fail" encontrado no relatório Radimation.\n\nO produto está NÃO CONFORME — revise antes de emitir.')
    } else {
      flash4('✓ Nenhum "Fail" encontrado no relatório — produto conforme.')
    }
  }

  const labelId = cfg.tipo === 'lampada' ? 'Código de Barras' : 'Número de Série'

  /* ── validação ── */
  const validationErrors = useMemo(() => {
    const errs: string[] = []
    if (!cfg.cliente.trim())       errs.push('Nome do cliente')
    else if (!clientes.some(c => c.nome.toLowerCase() === cfg.cliente.trim().toLowerCase()))
      errs.push('Cliente não cadastrado no banco de dados')
    if (!cfg.clienteRua.trim())    errs.push('Endereço do cliente')
    if (!cfg.clienteCidade.trim()) errs.push('Cidade')
    if (!cfg.produto.trim())       errs.push('Produto')
    if (!cfg.fabricante.trim())    errs.push('Fabricante')
    if (!cfg.modelo.trim())        errs.push('Modelo')
    if (!cfg.identificador.trim()) errs.push(labelId)
    if (!cfg.potencia.trim())      errs.push('Potência nominal')
    if (!cfg.tensaoAlim.trim())    errs.push('Tensão de alimentação')
    if (!cfg.protocolo.trim())     errs.push('Protocolo LABELO')
    if (!cfg.responsavel.trim())   errs.push('Responsável técnico')
    if (photos.length === 0)       errs.push('Fotos do ensaio')
    if (!docx.html)                errs.push('Arquivo .docx (Radimation)')
    return errs
  }, [cfg, photos.length, docx.html, labelId, clientes])

  /* ── salvar no histórico local + rede ── */
  async function salvarRelatorioLocal(finalCfg: Cispr15Config) {
    try {
      const raw = localStorage.getItem(RELATORIOS_KEY)
      const list: RelatorioSalvo[] = raw ? JSON.parse(raw) : []
      const existingIdx = list.findIndex(r =>
        finalCfg.numRelatorio && r.numRelatorio === finalCfg.numRelatorio
      )
      const id = existingIdx >= 0 ? list[existingIdx].id : Date.now().toString()
      const entry: RelatorioSalvo = {
        id,
        numRelatorio: finalCfg.numRelatorio,
        dataEmissao:  finalCfg.dataEmissao,
        clienteNome:  finalCfg.cliente,
        protocolo:    finalCfg.protocolo,
        produto:      finalCfg.produto,
        cfg:          finalCfg,
        photos:       photos.map(p => ({ name: p.name, base64: p.base64 })),
        docxFilename: docx.filename,
        emendas:      existingIdx >= 0 ? list[existingIdx].emendas : [],
        eutFolderPath: eutFolder ?? undefined,
      }
      if (existingIdx >= 0) list[existingIdx] = entry
      else list.unshift(entry)
      setRelatoriosList(list)

      // 1) Salvar no sistema/rede PRIMEIRO — índice leve (sem fotos/docxHtml) + assets
      //    pesados por id. Roda independente do localStorage: assim uma cota local cheia
      //    não impede o salvamento das fotos/DOCX no sistema (senão o relatório reabria vazio).
      const api = (window as any).electronAPI
      if (api) {
        try {
          const netEntry: RelatorioSalvo = { ...entry, photos: [], }
          const netList = list.map(r => r.id === id ? netEntry : { ...r, photos: [] })
          await api.saveRelatorios(netList)
        } catch {}
        try {
          if (api.saveRelatorioAssets) {
            await api.saveRelatorioAssets(id, entry.photos, docx.html ?? null)
          }
        } catch {}
      }

      // 2) Cache local (best-effort) — pode estourar a cota sem comprometer o save acima.
      try {
        localStorage.setItem(RELATORIOS_KEY, JSON.stringify(list))
        if (docx.html) localStorage.setItem(RELATORIO_DOCX_PFX + id, docx.html)
      } catch (e: any) {
        const msg = String(e)
        const quota = msg.includes('Quota') || msg.includes('quota') || msg.includes('QUOTA')
        // No Electron os assets já foram salvos no sistema acima; só alerta na versão web.
        if (quota && !api) {
          alert('Aviso: armazenamento local cheio — fotos não salvas no histórico. O relatório foi registrado normalmente na planilha.')
        }
      }
    } catch (e: any) {
      const msg = String(e)
      if (msg.includes('QuotaExceeded') || msg.includes('quota') || msg.includes('QUOTA')) {
        alert('Aviso: armazenamento local cheio — fotos não salvas no histórico. O relatório foi registrado normalmente na planilha.')
      }
    }
  }

  /* Resolve fotos + DOCX de um relatório: tenta local (PC que gerou) e, se faltar,
     busca os assets na rede — assim qualquer PC reabre o relatório completo. */
  async function resolverAssets(entry: RelatorioSalvo): Promise<{ photos: { name: string; base64: string }[]; docxHtml: string | null }> {
    let photos = entry.photos ?? []
    let docxHtml = localStorage.getItem(RELATORIO_DOCX_PFX + entry.id)
    // Fallback local: lista completa no localStorage deste PC (com fotos base64)
    if (!photos.length) {
      try {
        const raw = localStorage.getItem(RELATORIOS_KEY)
        if (raw) { const found = (JSON.parse(raw) as RelatorioSalvo[]).find(r => r.id === entry.id); if (found?.photos?.length) photos = found.photos }
      } catch {}
    }
    // Fallback rede: assets por id (outro PC)
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
    return { photos, docxHtml: docxHtml || null }
  }

  /* ── carregar relatório salvo ── */
  async function handleCarregarRelatorio(entry: RelatorioSalvo) {
    const { photos: relPhotos, docxHtml } = await resolverAssets(entry)
    setCfg(entry.cfg)
    setPhotos(relPhotos.map(p => ({ ...p, url: `data:image/jpeg;base64,${p.base64}` })))
    setDocx({ loading: false, html: docxHtml, filename: entry.docxFilename })
    localStorage.setItem(CFG_KEY, JSON.stringify(entry.cfg))
    try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(relPhotos)) } catch {}
    localStorage.setItem(LOCKED_KEY, '1')
    localStorage.removeItem(EMENDA_DRAFT_KEY)
    if (docxHtml) sessionStorage.setItem(DOCX_HTML_KEY, docxHtml)
    else sessionStorage.removeItem(DOCX_HTML_KEY)
    sessionStorage.setItem(DOCX_NAME_KEY, entry.docxFilename ?? '')
    if (entry.eutFolderPath) {
      setEutFolder(entry.eutFolderPath)
      sessionStorage.setItem('eutFolderPath', entry.eutFolderPath)
    }
    setLocked(true)
    setTab('formulario')
    flash4(`Relatório "${entry.numRelatorio}" carregado`)
  }

  /* ── excluir emenda ── */
  // Gate de senha antes de excluir emenda (modal — prompt() não funciona no Electron)
  function handleDeleteEmenda(relatorioId: string, emendaNum: number) {
    if (appPassword) {
      setEmendaDel({ relatorioId, emendaNum }); setEmendaDelPwd(''); setEmendaDelErr(false)
      return
    }
    if (!confirm('Excluir esta emenda? Esta ação não pode ser desfeita.')) return
    doDeleteEmenda(relatorioId, emendaNum)
  }

  function confirmarExclusaoEmenda() {
    if (!emendaDel) return
    if (emendaDelPwd !== appPassword) { setEmendaDelErr(true); return }
    const { relatorioId, emendaNum } = emendaDel
    setEmendaDel(null)
    doDeleteEmenda(relatorioId, emendaNum)
  }

  async function doDeleteEmenda(relatorioId: string, emendaNum: number) {
    try {
      const raw = localStorage.getItem(RELATORIOS_KEY)
      if (!raw) return
      const lista: RelatorioSalvo[] = JSON.parse(raw)
      const idx = lista.findIndex(r => r.id === relatorioId)
      if (idx < 0) return
      const rel = lista[idx]

      // Tentar excluir PDF da pasta de cópias
      const san = (v: string) => (v ?? '').replace(/[/\\:*?"<>|\s]/g, '_').replace(/_+/g, '_')
      const emendaDisplayNum = formatEmendaNumero(rel.numRelatorio, emendaNum)
      const pdfFilename = `${san(emendaDisplayNum || rel.protocolo)}_${rel.cfg.tipo}_${san(rel.cfg.fabricante)}.pdf`
      try {
        const api = (window as any).electronAPI
        if (api) await api.deletePdfCopy(pdfFilename)
      } catch {}

      // Remover emenda e recalcular currentCfg
      const newEmendas = rel.emendas.filter(e => e.numero !== emendaNum)
      const lastEmenda = [...newEmendas].sort((a, b) => b.numero - a.numero)[0]
      const newCurrentCfg = lastEmenda?.cfgSnapshot

      lista[idx] = { ...rel, emendas: newEmendas, currentCfg: newCurrentCfg }
      localStorage.setItem(RELATORIOS_KEY, JSON.stringify(lista))
      setRelatoriosList(lista)

      const api2 = (window as any).electronAPI
      if (api2) {
        try { await api2.saveRelatorios(lista.map(r => ({ ...r, photos: [] }))) } catch {}
      }
    } catch (err) {
      alert('Erro ao excluir emenda: ' + String(err))
    }
  }

  /* ── ver PDF de relatório salvo ── */
  async function handleVerPDFRelatorio(entry: RelatorioSalvo) {
    const { photos: relPhotos, docxHtml } = await resolverAssets(entry)
    setCfg(entry.cfg)
    setPhotos(relPhotos.map(p => ({ ...p, url: `data:image/jpeg;base64,${p.base64}` })))
    setDocx({ loading: false, html: docxHtml, filename: entry.docxFilename })
    localStorage.setItem(CFG_KEY, JSON.stringify(entry.cfg))
    try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(relPhotos)) } catch {}
    localStorage.setItem(LOCKED_KEY, '1')
    localStorage.removeItem(EMENDA_DRAFT_KEY)
    if (docxHtml) sessionStorage.setItem(DOCX_HTML_KEY, docxHtml)
    else sessionStorage.removeItem(DOCX_HTML_KEY)
    sessionStorage.setItem(DOCX_NAME_KEY, entry.docxFilename ?? '')
    setLocked(true)
    router.push('/cispr15/relatorio')
  }

  /* ── gerar relatório ── */
  async function gerarRelatorio() {
    if (validationErrors.length > 0) {
      alert(`Preencha os campos obrigatórios antes de gerar:\n\n• ${validationErrors.join('\n• ')}`)
      return
    }
    setGerandoRel(true)
    try {
      // Verificar protocolo duplicado (somente para novos relatórios)
      if (!cfg.numRelatorio && cfg.protocolo.trim()) {
        // Verificar localmente primeiro
        const localRaw = localStorage.getItem(RELATORIOS_KEY)
        if (localRaw) {
          const localList: RelatorioSalvo[] = JSON.parse(localRaw)
          const dup = localList.find(r => r.protocolo.trim().toLowerCase() === cfg.protocolo.trim().toLowerCase())
          if (dup) {
            const ok = confirm(
              `⚠ Protocolo "${cfg.protocolo}" já possui o relatório "${dup.numRelatorio}" no histórico local.\n\nDeseja continuar e criar um novo registro mesmo assim?`
            )
            if (!ok) { setGerandoRel(false); return }
          }
        }
        // Verificar na planilha Excel
        try {
          const checkRes = await fetch(`/api/registrar-excel?checkProtocolo=${encodeURIComponent(cfg.protocolo.trim())}`)
          const checkData = await checkRes.json()
          if (checkData.exists) {
            const ok = confirm(
              `⚠ Protocolo "${cfg.protocolo}" já está registrado na planilha${checkData.numRelatorio ? ` (${checkData.numRelatorio})` : ''}.\n\nDeseja continuar e criar um novo registro mesmo assim?`
            )
            if (!ok) { setGerandoRel(false); return }
          }
        } catch {}
      }

      let finalCfg = cfg
      if (!cfg.numRelatorio) {
        const res = await fetch('/api/registrar-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente: cfg.cliente, produto: cfg.produto,
            protocolo: cfg.protocolo, orcamento: cfg.orcamento,
            responsavel: cfg.responsavel,
          }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        finalCfg = { ...cfg, numRelatorio: data.numRelatorio }
        setCfg(finalCfg)
        localStorage.setItem(CFG_KEY, JSON.stringify(finalCfg))
      }

      // Salvar no histórico local e bloquear o formulário
      await salvarRelatorioLocal(finalCfg)
      localStorage.setItem(LOCKED_KEY, '1')
      setLocked(true)
      sincronizarAgenda(finalCfg.protocolo, finalCfg.numRelatorio, finalCfg.dataEmissao)

      flash4(`Registrado: ${finalCfg.numRelatorio}`)
      router.push('/cispr15/relatorio')
    } catch (err: any) {
      alert(`Erro ao registrar no Excel: ${err.message}`)
    } finally {
      setGerandoRel(false)
    }
  }

  /* ── clientes DB ── */
  function handleUsarCliente(c: ClienteDB) {
    setCfg(prev => ({
      ...prev,
      cliente: c.nome,
      clienteRua: c.rua,
      clienteCidade: c.cidade,
      clienteCep: c.cep,
    }))
    setTab('formulario')
    flash4(`Cliente "${c.nome}" carregado`)
  }

  function handleSalvarCliente() {
    if (!cfg.cliente.trim()) { alert('Preencha o nome do cliente primeiro.'); return }
    try {
      const raw = localStorage.getItem(CLIENTES_KEY)
      const lista: ClienteDB[] = raw ? JSON.parse(raw) : []
      const existente = lista.find(c => c.nome.toLowerCase() === cfg.cliente.toLowerCase())
      if (existente) {
        if (!confirm(`Atualizar os dados de "${cfg.cliente}"?`)) return
        const updated = lista.map(c => c.id === existente.id
          ? { ...c, rua: cfg.clienteRua, cidade: cfg.clienteCidade, cep: cfg.clienteCep }
          : c)
        localStorage.setItem(CLIENTES_KEY, JSON.stringify(updated))
      } else {
        const novo: ClienteDB = {
          id: Date.now().toString(),
          nome: cfg.cliente, rua: cfg.clienteRua,
          cidade: cfg.clienteCidade, cep: cfg.clienteCep, cnpj: '',
        }
        localStorage.setItem(CLIENTES_KEY, JSON.stringify([...lista, novo]))
      }
      flash4('Cliente salvo no banco de dados')
    } catch { alert('Erro ao salvar cliente') }
  }

  /* ── sync agenda: quando emite relatório, atualiza item com mesmo protocolo ── */
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
      if (api) {
        await api.saveAgenda(updated).catch(() => null)
      }
      localStorage.setItem(AGENDA_KEY, JSON.stringify(updated))
    } catch {}
  }

  /* ── abrir lote ── */
  async function openLote() {
    const api = (window as any).electronAPI
    // Lote existente? prioriza o arquivo (Electron) e o localStorage
    let temLote = !!localStorage.getItem(LOTE_KEY)
    if (!temLote && api?.getLote) {
      try { const r = await api.getLote(); if (r?.ok && r.lote) temLote = true } catch {}
    }
    if (!temLote) {
      const config: LoteConfig = {
        tipo: cfg.tipo,
        qtd: 3,
        cliente: cfg.cliente,
        clienteRua: cfg.clienteRua,
        clienteCidade: cfg.clienteCidade,
        clienteCep: cfg.clienteCep,
        responsavel: cfg.responsavel,
        amostras: Array.from({ length: 3 }, newAmostra),
      }
      localStorage.setItem(LOTE_KEY, JSON.stringify(config))
      // grava o arquivo também (sobrescreve qualquer lote antigo do arquivo)
      if (api?.saveLoteFile) { try { await api.saveLoteFile(config) } catch {} }
    }
    router.push('/cispr15/lote')
  }

  const TENSAO_OPTS = [
    { value: '127',         label: '127 V',                sub: 'apenas' },
    { value: '127_220',     label: '127 V + 220 V',        sub: 'padrão' },
    { value: '127_220_277', label: '127 V + 220 V + 277 V', sub: 'internacional' },
  ] as const

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="form-section mb-1">Formulários de Ensaio · EMC</p>
          <h1 className="text-2xl font-display font-bold text-white">CISPR 15</h1>
          <p className="text-white/40 text-sm mt-1">
            Equipamentos de iluminação elétrica — Limites e métodos de medição de perturbações radiadas
          </p>
        </div>
      </div>

      {/* ── Abas ── */}
      <div className="flex items-center gap-1 mb-5">
        <div className="flex gap-1 p-1 bg-navy rounded-xl border border-white/6 flex-1 flex-wrap">
          {([
            { id: 'formulario',   label: 'Formulário',   icon: null },
            { id: 'clientes',     label: 'Clientes',     icon: <Database size={13} /> },
            { id: 'emendas',      label: 'Emendas',      icon: <History size={13} /> },
            { id: 'relatorios',   label: 'Relatórios',   icon: <FileText size={13} /> },
          ] as const).map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.id
                  ? 'bg-[#141B28] text-white border border-white/10 shadow-sm'
                  : 'text-white/35 hover:text-white/60'
              )}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => router.push('/configuracoes')}
          title="Configurações"
          className="ml-2 w-9 h-9 rounded-xl border border-white/10 text-white/30 hover:text-gold hover:border-gold/30 flex items-center justify-center transition-all shrink-0">
          <Settings size={15} />
        </button>
      </div>

      {tab === 'clientes'     && <ClientesTab     onUsar={handleUsarCliente} />}
      {tab === 'emendas'      && <EmendasTab    relatorios={relatoriosList} onCarregarRelatorio={handleCarregarRelatorio} onDeleteEmenda={handleDeleteEmenda} />}
      {tab === 'relatorios'   && <RelatoriosTab onCarregar={handleCarregarRelatorio} onVerPDF={handleVerPDFRelatorio} />}

      {tab === 'formulario' && <div className="space-y-5">

        {/* ── Botão Novo Relatório (quando não bloqueado e já há dados) ── */}
        {!locked && (cfg.protocolo || cfg.produto || cfg.cliente) && (
          <div className="flex justify-end">
            <button type="button" onClick={novoRelatorio}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/30 hover:text-white/60 hover:border-white/20 text-xs transition-all">
              <Plus size={11} /> Novo Relatório
            </button>
          </div>
        )}

        {/* ── Banner de lock ── */}
        {locked && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-amber-400">
            <Lock size={16} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Relatório emitido — somente leitura</p>
              <p className="text-[11px] text-amber-400/70">
                {cfg.numRelatorio ? `Nº ${cfg.numRelatorio} · ` : ''}Para alterar, use Gerar Emenda.
              </p>
            </div>
            <button
              type="button"
              onClick={novoRelatorio}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-semibold transition-all shrink-0">
              <Plus size={12} /> Novo
            </button>
          </div>
        )}

        {/* cards do formulário — bloqueados quando locked */}
        <div className={cn(locked && 'opacity-55 pointer-events-none select-none')}>
        <div className="space-y-5">

        {/* ── Tipo de DUT ── */}
        <div className="card p-5">
          <p className="form-section mb-4">Tipo de DUT</p>
          <div className="grid grid-cols-2 gap-3">
            {(['lampada', 'luminaria'] as const).map(t => (
              <button key={t} type="button" onClick={() => !locked && setTipo(t)}
                disabled={locked}
                className={cn(
                  'flex flex-col items-center gap-3 p-5 rounded-xl border transition-all duration-150',
                  cfg.tipo === t
                    ? 'border-gold bg-gold/8 text-gold'
                    : 'border-white/8 bg-navy/60 text-white/40 hover:border-white/20 hover:text-white/60',
                  locked && 'opacity-60 cursor-not-allowed',
                )}>
                {t === 'lampada' ? <Lightbulb size={26} strokeWidth={1.5} /> : <Lamp size={26} strokeWidth={1.5} />}
                <div className="text-center">
                  <p className="font-bold text-sm tracking-wide uppercase font-mono">
                    {t === 'lampada' ? 'Lâmpada' : 'Luminária'}
                  </p>
                  <p className="text-[10px] opacity-50 mt-0.5">
                    {t === 'lampada' ? '127V + 220V · Cód. Barras' : '220V (fixo) · N° Série'}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {cfg.tipo === 'lampada' && (
            <div className="mt-4 space-y-1.5">
              <p className="text-[10px] text-white/35 uppercase tracking-widest font-mono mb-2">Tensão(ões) de ensaio</p>
              {TENSAO_OPTS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="radio" name="tensaoConfig" value={opt.value}
                    checked={cfg.tensaoConfig === opt.value}
                    onChange={() => setCfg(prev => ({ ...prev, tensaoConfig: opt.value }))}
                    disabled={locked}
                    className="w-4 h-4 accent-gold cursor-pointer disabled:cursor-not-allowed" />
                  <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                    <span className="font-semibold text-white/90">{opt.label}</span>
                    <span className="text-white/30 text-xs ml-1.5">— {opt.sub}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-teal/6 border border-teal/15 text-sm">
            <span className="font-mono text-[10px] text-teal/60 uppercase tracking-wider">Tensões</span>
            <span className="text-teal font-bold">
              {cfg.tipo === 'luminaria' ? '220 V' : TENSAO_OPTS.find(o => o.value === cfg.tensaoConfig)?.label ?? '127 V + 220 V'}
            </span>
            <span className="text-white/15">·</span>
            <span className="font-mono text-[10px] text-teal/60 uppercase tracking-wider">ID</span>
            <span className="text-teal font-bold">{labelId}</span>
          </div>
        </div>

        {/* ── Cliente ── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="form-section">Cliente</p>
            <button type="button" onClick={handleSalvarCliente}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-white/50 hover:text-teal border border-white/10 hover:border-teal/30 rounded-lg transition-all">
              <Database size={11} /> Salvar no banco
            </button>
          </div>

          {/* Buscador rápido de clientes cadastrados */}
          {clientes.length > 0 && (
            <div className="relative mb-4">
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                <input
                  className="input pl-7 text-xs"
                  placeholder="Buscar cliente cadastrado…"
                  value={clienteQ}
                  onChange={e => { setClienteQ(e.target.value); setClienteOpen(true) }}
                  onFocus={() => setClienteOpen(true)}
                  onBlur={() => setTimeout(() => setClienteOpen(false), 150)}
                />
              </div>
              {clienteOpen && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-xl border border-white/10 bg-[#0d1017] shadow-xl max-h-[180px] overflow-y-auto">
                  {clientes
                    .filter(c => !clienteQ || c.nome?.toLowerCase().includes(clienteQ.toLowerCase()))
                    .slice(0, 20)
                    .map(c => (
                      <button key={c.id} type="button"
                        onMouseDown={() => {
                          setCfg(p => ({ ...p, cliente: c.nome, clienteRua: c.rua, clienteCidade: c.cidade, clienteCep: c.cep }))
                          setClienteQ(''); setClienteOpen(false)
                        }}
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
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Row label="Nome do Cliente" span2>
              <input className="input" value={cfg.cliente} onChange={set('cliente')}
                placeholder="Ex: CEB Iluminação Pública e Serviços S.A." />
              {cfg.cliente.trim() && !clientes.some(c => c.nome.toLowerCase() === cfg.cliente.trim().toLowerCase()) && (
                <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
                  <AlertTriangle size={9} /> Cliente não cadastrado — use a busca acima ou a aba <strong>Clientes</strong> para cadastrá-lo primeiro.
                </p>
              )}
            </Row>
            <Row label="Rua – Número – Bairro" span2>
              <input className="input" value={cfg.clienteRua} onChange={set('clienteRua')}
                placeholder="Ex: SGAN Quadra 601, Bloco H, Asa Norte" />
            </Row>
            <Row label="Cidade – Estado">
              <input className="input" value={cfg.clienteCidade} onChange={set('clienteCidade')}
                placeholder="Preenchido automaticamente pelo CEP" />
            </Row>
            <Row label="CEP">
              <div className="flex flex-col gap-1">
                <input className={cn('input', cepStatus === 'error' && 'border-red-500/50', cepStatus === 'ok' && 'border-green-500/40')}
                  value={cfg.clienteCep}
                  onChange={e => handleCep(e.target.value)}
                  placeholder="Ex: 70830-010"
                  maxLength={9} inputMode="numeric" />
                {cepStatus === 'loading' && <span className="text-[10px] text-white/40 flex items-center gap-1"><Loader2 size={9} className="animate-spin" /> Buscando...</span>}
                {cepStatus === 'ok'      && <span className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle2 size={9} /> Cidade preenchida automaticamente</span>}
                {cepStatus === 'error'   && <span className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle size={9} /> CEP não localizado</span>}
              </div>
            </Row>
          </div>
        </div>

        {/* ── Objeto Ensaiado ── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="form-section">Objeto Ensaiado</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={analisarFotos} disabled={analisando || !photos.length}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-teal/70 hover:text-teal border border-teal/20 hover:border-teal/40 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                {analisando ? <Loader2 size={11} className="animate-spin" /> : <ScanText size={11} />}
                {analisando ? 'Lendo fotos…' : 'Ler Fotos (OCR)'}
              </button>
            </div>
          </div>

          {/* Sugestões do OCR */}
          {(aiSugestao || ocrTexto) && (
            <div className="mb-4 p-3 rounded-xl border border-teal/20 bg-teal/4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-teal/70 flex items-center gap-1.5">
                  <ScanText size={10} /> OCR — clique para aplicar individualmente
                </span>
                <div className="flex items-center gap-2">
                  {aiSugestao && Object.values(aiSugestao).some(v => v) && (
                    <button type="button" onClick={aplicarTodasSugestoes}
                      className="text-[10px] font-mono uppercase tracking-wider text-teal border border-teal/30 hover:border-teal/50 rounded px-2 py-1 transition-all">
                      Aplicar todas
                    </button>
                  )}
                  <button type="button" onClick={() => { setAiSugestao(null); setOcrTexto(null) }}
                    className="text-white/25 hover:text-white/60 transition-colors">
                    <X size={12} />
                  </button>
                </div>
              </div>

              {aiSugestao && (
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.entries(aiSugestao) as [keyof AiSugestao, string][])
                    .filter(([, v]) => v)
                    .map(([campo, valor]) => {
                      const labels: Record<keyof AiSugestao, string> = {
                        produto: 'Produto', fabricante: 'Fabricante', modelo: 'Modelo',
                        identificador: labelId, potencia: 'Potência', tensaoAlim: 'Tensão', frequencia: 'Freq.',
                      }
                      return (
                        <button key={campo} type="button" onClick={() => aplicarSugestao(campo)}
                          className="flex flex-col items-start px-2 py-1.5 rounded-lg border border-teal/20 hover:border-teal/40 hover:bg-teal/8 transition-all text-left">
                          <span className="text-[8px] text-teal/50 font-mono uppercase">{labels[campo]}</span>
                          <span className="text-[11px] text-teal-200 truncate w-full">{valor}</span>
                        </button>
                      )
                    })}
                </div>
              )}

              {/* Texto bruto do OCR — recolhível */}
              {ocrTexto && (
                <div className="border-t border-teal/10 pt-2">
                  <button type="button"
                    onClick={() => setOcrExpanded(v => !v)}
                    className="flex items-center gap-1.5 text-[9px] font-mono text-white/25 hover:text-white/50 transition-colors">
                    <ChevronDown size={10} className={cn('transition-transform', ocrExpanded && 'rotate-180')} />
                    Texto extraído das fotos
                  </button>
                  {ocrExpanded && (
                    <pre className="mt-2 p-2 rounded-lg bg-black/20 text-[9px] text-white/40 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {ocrTexto}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Row label="Produto / Descrição" span2>
              <input className="input" value={cfg.produto} onChange={set('produto')} placeholder="Ex: Luminária LED" />
            </Row>
            <Row label="Fabricante">
              <input className="input" value={cfg.fabricante} onChange={set('fabricante')} placeholder="Labelo" />
            </Row>
            <Row label="Modelo">
              <input className="input" value={cfg.modelo} onChange={set('modelo')} placeholder="Ex: AGN7120D4" />
            </Row>
            <Row label={labelId}>
              <input className="input" value={cfg.identificador} onChange={set('identificador')}
                placeholder="N° de série" />
            </Row>
            {cfg.tipo === 'lampada' && (
              <Row label="Lacre">
                <input className="input" value={cfg.lacre ?? ''} onChange={set('lacre')}
                  placeholder="Ex: 123456" />
              </Row>
            )}
            <Row label="Potência Nominal">
              <input className="input" value={cfg.potencia} onChange={set('potencia')}
                onBlur={e => setCfg(prev => ({ ...prev, potencia: normWatts(e.target.value) }))}
                placeholder="Ex: 120  (W automático)" />
            </Row>
            <Row label="Tensão de Alimentação">
              <input className="input" value={cfg.tensaoAlim} onChange={set('tensaoAlim')} placeholder="Ex: 90 a 305VAC" />
            </Row>
            <Row label="Frequência de Rede">
              <input className="input" value={cfg.frequencia} onChange={set('frequencia')} placeholder="Ex: 60Hz" />
            </Row>
          </div>
        </div>

        {/* ── Driver (acessório de ensaio — só luminária) ── */}
        {cfg.tipo === 'luminaria' && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="form-section">Acessório de Ensaio</p>
              <button
                type="button"
                onClick={() => setCfg(prev => ({
                  ...prev,
                  temDriver: !prev.temDriver,
                  driverOrcamento: prev.driverOrcamento || 'Não identificado',
                  driverProtocolo: prev.driverProtocolo || 'Não identificado',
                }))}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all',
                  cfg.temDriver
                    ? 'border-teal/40 bg-teal/10 text-teal'
                    : 'border-white/10 text-white/35 hover:border-white/25 hover:text-white/60',
                )}>
                {cfg.temDriver ? '✓ Driver ativo' : '+ Incluir Driver'}
              </button>
            </div>

            {!cfg.temDriver && (
              <p className="text-[11px] text-white/25 font-mono">
                Ative para incluir os dados do driver (luminária) como acessório de ensaio no relatório (seção 2.1).
              </p>
            )}

            {cfg.temDriver && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Row label="Produto / Descrição do Driver" span2>
                  <input className="input" value={cfg.driverProduto ?? ''} onChange={set('driverProduto')} placeholder="Ex: Driver LED" />
                </Row>
                <Row label="Fabricante">
                  <input className="input" value={cfg.driverFabricante ?? ''} onChange={set('driverFabricante')} placeholder="Ex: Meanwell" />
                </Row>
                <Row label="Modelo">
                  <input className="input" value={cfg.driverModelo ?? ''} onChange={set('driverModelo')} placeholder="Ex: HLG-100H-24A" />
                </Row>
                <Row label="Número de Série">
                  <input className="input" value={cfg.driverIdentificador ?? ''} onChange={set('driverIdentificador')} placeholder="N° de série do driver" />
                </Row>
                <Row label="Potência Nominal">
                  <input className="input" value={cfg.driverPotencia ?? ''} onChange={set('driverPotencia')}
                    onBlur={e => setCfg(prev => ({ ...prev, driverPotencia: normWatts(e.target.value) }))}
                    placeholder="Ex: 100  (W automático)" />
                </Row>
                <Row label="Tensão de Alimentação">
                  <input className="input" value={cfg.driverTensaoAlim ?? ''} onChange={set('driverTensaoAlim')} placeholder="Ex: 90 a 305VAC" />
                </Row>
                <Row label="Frequência de Rede">
                  <input className="input" value={cfg.driverFrequencia ?? ''} onChange={set('driverFrequencia')} placeholder="Ex: 60Hz" />
                </Row>
                <Row label="Orçamento LABELO">
                  <input className="input" value={cfg.driverOrcamento ?? 'Não identificado'} onChange={set('driverOrcamento')} placeholder="Não identificado" />
                </Row>
                <Row label="Protocolo LABELO">
                  <input className="input" value={cfg.driverProtocolo ?? 'Não identificado'} onChange={set('driverProtocolo')} placeholder="Não identificado" />
                </Row>
              </div>
            )}
          </div>
        )}

        {/* ── Dados do Relatório ── */}
        <div className="card p-5">
          <p className="form-section mb-4">Dados do Relatório</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Row label="N° do Relatório">
              <input className="input" value={cfg.numRelatorio} onChange={set('numRelatorio')}
                placeholder="Auto ao gerar relatório" />
            </Row>
            <Row label="Responsável Técnico">
              <input className="input" value={cfg.responsavel} onChange={set('responsavel')}
                placeholder="Dionata Blauth" />
            </Row>
            <Row label="Orçamento LABELO">
              <input className="input" value={cfg.orcamento} onChange={set('orcamento')} placeholder="Orçamento" inputMode="numeric"
                onBlur={e => preencherClienteDoOrcamento(e.target.value)} />
            </Row>
            <Row label="Protocolo LABELO">
              <input className="input" value={cfg.protocolo} onChange={set('protocolo')}
                placeholder="Protocolo" inputMode="numeric"
                onBlur={e => preencherDaAgenda(e.target.value)} />
            </Row>
            <Row label="Período — Início">
              <input className="input" type="date" value={cfg.periodoInicio} onChange={set('periodoInicio')} />
            </Row>
            <Row label="Período — Fim">
              <input
                className={cn('input', cfg.periodoFim && cfg.periodoInicio && cfg.periodoFim < cfg.periodoInicio && 'border-red-500/50')}
                type="date" value={cfg.periodoFim} onChange={set('periodoFim')} />
              {cfg.periodoFim && cfg.periodoInicio && cfg.periodoFim < cfg.periodoInicio && (
                <p className="text-[10px] text-red-400 flex items-center gap-1">
                  <AlertTriangle size={9} /> Fim anterior ao início do período
                </p>
              )}
            </Row>
            <Row label="Data de Emissão" span2>
              <input className="input" type="date" value={cfg.dataEmissao} onChange={set('dataEmissao')} />
            </Row>
          </div>

          {/* Resultado dos ensaios */}
          <p className="text-[10px] text-white/35 uppercase tracking-widest font-mono mt-5 mb-2">Resultado dos ensaios</p>
          <div className="grid grid-cols-3 gap-3">
            {([
              ['resultadoConduzida', 'Conduzida'],
              ['resultadoLoop',      'Loop'],
              ['resultadoAnexoB',    'Anexo B'],
            ] as const).map(([k, label]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <p className="text-[10px] text-white/40 font-mono">{label}</p>
                <div className="flex gap-1">
                  {(['pass', 'fail'] as const).map(v => (
                    <button key={v} type="button"
                      onClick={() => setCfg(p => ({ ...p, [k]: v }))}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all',
                        cfg[k] === v
                          ? v === 'pass'
                            ? 'border-green/40 bg-green/10 text-green-400'
                            : 'border-red-500/40 bg-red-500/10 text-red-400'
                          : 'border-white/8 text-white/25 hover:border-white/20',
                      )}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Anexos ── */}
        <div className="card p-5">
          <p className="form-section mb-4">Anexos</p>

          {isElectron ? (
            <button type="button" onClick={handleAbrirPastaEut} disabled={pastaLoading}
              className={cn(
                'flex items-center justify-center gap-2.5 w-full px-4 py-4 rounded-xl border-2 border-dashed text-sm font-semibold transition-all mb-4',
                pastaLoading
                  ? 'border-blue-400/40 bg-blue-500/8 text-blue-400 cursor-wait'
                  : (docx.html || photos.length > 0)
                  ? 'border-green/30 bg-green/6 text-green-400 hover:border-green/50'
                  : 'border-gold/30 bg-gold/4 text-gold hover:border-gold/60 hover:bg-gold/8',
              )}>
              {pastaLoading
                ? <><Loader2 size={16} className="animate-spin" /> Processando pasta…</>
                : <><FolderOpen size={16} /> Selecionar Pasta do Ensaio</>}
            </button>
          ) : (
            <label className={cn(
              'flex items-center justify-center gap-2.5 w-full px-4 py-4 rounded-xl border-2 border-dashed text-sm font-semibold cursor-pointer transition-all mb-4',
              pastaLoading
                ? 'border-blue-400/40 bg-blue-500/8 text-blue-400 cursor-wait'
                : (docx.html || photos.length > 0)
                ? 'border-green/30 bg-green/6 text-green-400 hover:border-green/50'
                : 'border-gold/30 bg-gold/4 text-gold hover:border-gold/60 hover:bg-gold/8',
            )}>
              {pastaLoading
                ? <><Loader2 size={16} className="animate-spin" /> Processando pasta…</>
                : <><FolderOpen size={16} /> Carregar Pasta do Ensaio</>}
              <input ref={pastaRef} type="file" className="hidden" disabled={pastaLoading}
                {...{ webkitdirectory: '' } as any}
                onChange={e => { if (e.target.files?.length) handlePastaCompleta(e.target.files) }} />
            </label>
          )}

          {isElectron && eutFolder && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal/8 border border-teal/20 mb-3">
              <FolderOpen size={11} className="text-teal shrink-0" />
              <span className="text-teal text-[10px] font-mono truncate flex-1">{eutFolder}</span>
              <button type="button" onClick={async () => {
                sessionStorage.removeItem('eutFolderPath')
                setEutFolder(null)
                await (window as any).electronAPI?.limparPastaEut()
              }} className="text-white/25 hover:text-red-400 transition-colors shrink-0">
                <X size={11} />
              </button>
            </div>
          )}

          <p className="text-[10px] text-white/25 font-mono text-center mb-4 -mt-2">
            A pasta deve conter: <span className="text-white/40">1 arquivo .docx</span> na raiz +{' '}
            <span className="text-white/40">subpasta de fotos</span> (1.png, 2.png…)
          </p>

          {(docx.html || photos.length > 0) && (
            <div className="flex flex-col gap-2 mb-4">
              {docx.html && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green/8 border border-green/20">
                  <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" />
                  <span className="text-green-400 text-[11px] font-mono truncate flex-1">{docx.filename}</span>
                  <button onClick={removeDocx} className="text-white/25 hover:text-red-400 transition-colors flex-shrink-0">
                    <X size={12} />
                  </button>
                </div>
              )}
              {photos.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green/8 border border-green/20">
                  <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" />
                  <span className="text-green-400 text-[11px] font-mono flex-1">{photos.length} foto(s) carregada(s)</span>
                  <button onClick={() => { setPhotos([]); localStorage.removeItem(PHOTOS_KEY) }}
                    className="text-white/25 hover:text-red-400 transition-colors flex-shrink-0">
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Verificar Conformidade — busca "Fail" no docx do Radimation */}
              {docx.html && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={verificarConformidadeUnitaria}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-[12px] text-white/50 hover:text-white hover:border-white/25 transition-all flex-1">
                    <Shield size={13} /> Verificar Conformidade
                  </button>
                  {confResult === 'conforme' && (
                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green/8 border border-green/20 text-green-400 text-[11px] font-mono uppercase tracking-wider shrink-0">
                      <ShieldCheck size={12} /> Conforme
                    </span>
                  )}
                  {confResult === 'reprovado' && (
                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red/8 border border-red/20 text-red-400 text-[11px] font-mono uppercase tracking-wider shrink-0">
                      <ShieldX size={12} /> Reprovado
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {photos.map((ph, i) => (
                <div key={i} className="relative group">
                  <img src={ph.url} alt={`Foto ${i + 1}`}
                    className="w-16 h-12 object-cover rounded-lg border border-white/10" />
                  {/* Botões: trocar (esquerda) e remover (direita) */}
                  <button
                    onClick={() => trocarRefs.current[i]?.click()}
                    className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-blue-500/90 text-white items-center justify-center hidden group-hover:flex transition-all"
                    title="Trocar foto">
                    <RefreshCw size={9} />
                  </button>
                  <button onClick={() => removePhoto(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/90 text-white items-center justify-center hidden group-hover:flex transition-all"
                    title="Remover foto">
                    <X size={10} />
                  </button>
                  <input
                    ref={el => { trocarRefs.current[i] = el }}
                    type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) replacePhoto(i, f); e.target.value = '' }}
                  />
                  <span className="text-[8px] text-white/30 block text-center mt-0.5">{i + 1}</span>
                </div>
              ))}
              {/* Botão de adicionar mais fotos */}
              <label className="flex flex-col items-center justify-center w-16 h-12 rounded-lg border border-dashed border-white/15 hover:border-white/30 cursor-pointer transition-all text-white/25 hover:text-white/50">
                <Plus size={14} />
                <span className="text-[7px] mt-0.5 font-mono">+ foto</span>
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={e => { if (e.target.files?.length) adicionarFotos(e.target.files) }} />
              </label>
            </div>
          )}

          <div className="border-t border-white/5 pt-4 space-y-3">
            <p className="text-[9px] text-white/20 font-mono uppercase tracking-wider">Ou carregue separadamente</p>
            <div className="flex gap-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-white/40 hover:text-gold hover:border-gold/30 cursor-pointer transition-all">
                <Upload size={11} /> Pasta de Fotos
                <input ref={photoRef} type="file" className="hidden"
                  onChange={e => { if (e.target.files?.length) handlePhotos(e.target.files) }} />
              </label>
              {!docx.html && !docx.loading && (
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-white/40 hover:text-gold hover:border-gold/30 cursor-pointer transition-all">
                  <Upload size={11} /> Radimation .docx
                  <input type="file" accept=".docx" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleDocx(f) }} />
                </label>
              )}
              {docx.loading && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-blue-400">
                  <Loader2 size={11} className="animate-spin" /> Processando…
                </div>
              )}
            </div>
          </div>
        </div>

        </div>{/* /space-y-5 inner */}
        </div>{/* /locked wrapper */}

        {/* ── Status de validação ── */}
        {validationErrors.length > 0 ? (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/6 border border-amber-500/15 text-amber-400/80 text-[11px]">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">Pendente: </span>
              {validationErrors.join(' · ')}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green/6 border border-green/15 text-green-400/80 text-[11px]">
            <CheckCircle2 size={12} />
            <span>Pronto — todos os campos obrigatórios preenchidos</span>
          </div>
        )}

        {/* ── Ações ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={limparDados}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red/20 bg-red/8 text-red-400 hover:bg-red/15 transition-all text-sm font-medium">
            <Trash2 size={14} /> Limpar
          </button>

          <button type="button"
            onClick={() => window.open('/cispr15/instrucao', '_blank')}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/8 text-white/30 hover:text-white/60 hover:border-white/20 transition-all text-xs">
            <BookOpen size={13} /> Manual
          </button>

          <div className="flex-1" />

          <button type="button" onClick={openLote}
            className={cn('btn-secondary flex items-center gap-2 px-4 py-2.5 text-sm',
              loteAtivo > 0 && 'border-gold/40 bg-gold/8 text-gold')}>
            <Users size={14} /> {loteAtivo > 0 ? `Continuar Lote (${loteAtivo})` : 'Emitir Lote'}
          </button>

          <button type="button"
            onClick={() => locked ? setShowPwdModal(true) : router.push('/cispr15/emenda')}
            className="btn-secondary flex items-center gap-2 px-4 py-2.5 text-sm">
            {locked ? <Lock size={14} /> : <History size={14} />}
            Gerar Emenda
          </button>

          <button type="button" onClick={() => router.push('/cispr15/relatorio')}
            className="btn-secondary flex items-center gap-2 px-4 py-2.5 text-sm">
            <FileText size={14} /> Ver PDF
          </button>

          {locked ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green/10 border border-green/20 text-green-400 text-sm font-semibold">
                <CheckCircle2 size={15} /> Relatório Emitido
              </div>
              <button type="button" onClick={novoRelatorio}
                className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold">
                <Plus size={14} /> Novo Relatório
              </button>
            </div>
          ) : (
            <button type="button" onClick={gerarRelatorio} disabled={gerandoRel}
              className={cn(
                'btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold',
                validationErrors.length > 0 && 'opacity-50 cursor-not-allowed',
              )}>
              {gerandoRel ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={15} />}
              {gerandoRel ? 'Registrando…' : 'Gerar Relatório'}
            </button>
          )}
        </div>

        {flash && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green/10 border border-green/20 text-green-400 text-sm animate-fade-in">
            <CheckCircle2 size={15} /> {flash}
          </div>
        )}

      </div>}

      {/* ── Gate de acesso à emissão ── */}
      {gateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-sm mx-4 p-7 space-y-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gold/12 border border-gold/25 flex items-center justify-center">
                <Lock size={20} className="text-gold" />
              </div>
              <div>
                <p className="font-bold text-white">Área de Emissão</p>
                <p className="text-[11px] text-white/40">Informe a senha para acessar</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">Senha</label>
              <input
                ref={gateInputRef}
                type="password"
                className={cn('input', gateError && 'border-red-500/50')}
                placeholder="••••••"
                value={gateInput}
                autoFocus
                onChange={e => { setGateInput(e.target.value); setGateError(false) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (gateInput === appPassword) {
                      sessionStorage.setItem(AUTH_KEY, '1')
                      setGateOpen(false); setGateInput('')
                    } else {
                      setGateError(true); setGateInput('')
                      setTimeout(() => gateInputRef.current?.focus(), 0)
                    }
                  }
                }}
              />
              {gateError && <p className="text-[11px] text-red-400">Senha incorreta.</p>}
              {capsLock && <p className="text-[10px] text-amber-400/80 flex items-center gap-1">⇪ Caps Lock ativo</p>}
            </div>
            <button
              type="button"
              onClick={() => {
                if (gateInput === appPassword) {
                  sessionStorage.setItem(AUTH_KEY, '1')
                  setGateOpen(false); setGateInput('')
                } else {
                  setGateError(true); setGateInput('')
                  setTimeout(() => gateInputRef.current?.focus(), 0)
                }
              }}
              className="btn-primary w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2">
              <ArrowRight size={14} /> Entrar
            </button>
          </div>
        </div>
      )}

      {/* ── Modal de senha para Emenda ── */}
      {showPwdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-sm mx-4 p-6 space-y-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/12 border border-amber-500/20 flex items-center justify-center">
                <Lock size={18} className="text-amber-400" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">Autenticação necessária</p>
                <p className="text-[11px] text-white/40">Formulário bloqueado — informe a senha para continuar</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">Senha</label>
              <input
                ref={pwdInputRef}
                type="password"
                className={cn('input', pwdError && 'border-red-500/50')}
                placeholder="••••••"
                value={pwdInput}
                onChange={e => { setPwdInput(e.target.value); setPwdError(false) }}
                onKeyDown={e => {
                  const correta = appPassword || '123'
                  if (e.key === 'Enter') {
                    if (pwdInput === correta) {
                      setShowPwdModal(false); setPwdInput(''); setPwdError(false)
                      router.push('/cispr15/emenda')
                    } else {
                      setPwdError(true); setPwdInput('')
                      setTimeout(() => pwdInputRef.current?.focus(), 0)
                    }
                  }
                  if (e.key === 'Escape') { setShowPwdModal(false); setPwdInput(''); setPwdError(false) }
                }}
                autoFocus
              />
              {pwdError && <p className="text-[11px] text-red-400">Senha incorreta.</p>}
              {capsLock && <p className="text-[10px] text-amber-400/80 flex items-center gap-1">⇪ Caps Lock ativo</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button"
                onClick={() => { setShowPwdModal(false); setPwdInput(''); setPwdError(false) }}
                className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">
                Cancelar
              </button>
              <button type="button"
                onClick={() => {
                  const correta = appPassword || '123'
                  if (pwdInput === correta) {
                    setShowPwdModal(false); setPwdInput(''); setPwdError(false)
                    router.push('/cispr15/emenda')
                  } else {
                    setPwdError(true); setPwdInput('')
                    setTimeout(() => pwdInputRef.current?.focus(), 0)
                  }
                }}
                className="btn-primary px-5 py-2 text-sm font-bold flex items-center gap-2">
                <ArrowRight size={14} /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: senha para excluir emenda ── */}
      {emendaDel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.6)' }}
             onClick={() => setEmendaDel(null)}>
          <div className="card w-full max-w-sm p-5" style={{ background: '#0E1320' }}
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1 text-red-400">
              <Lock size={15} />
              <p className="font-display font-semibold text-[14px]">Excluir emenda</p>
            </div>
            <p className="text-[11px] text-white/40 mb-3">
              Esta ação não pode ser desfeita. Digite a senha para confirmar.
            </p>
            <input
              type="password"
              autoFocus
              value={emendaDelPwd}
              onChange={e => { setEmendaDelPwd(e.target.value); setEmendaDelErr(false) }}
              onKeyDown={e => { if (e.key === 'Enter') confirmarExclusaoEmenda() }}
              placeholder="Senha"
              className={cn('input w-full', emendaDelErr && 'border-red-400/60')}
            />
            {emendaDelErr && <p className="text-[10px] text-red-400 mt-1">Senha incorreta.</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setEmendaDel(null)} className="btn-secondary text-sm">Cancelar</button>
              <button type="button" onClick={confirmarExclusaoEmenda}
                className="btn-primary text-sm flex items-center gap-1.5"
                style={{ background: '#F87171', borderColor: '#F87171' }}>
                <Trash2 size={13} /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
