'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Upload, X, Loader2, FolderOpen, PenLine, CheckCircle2, Save, AlertTriangle, ShieldCheck, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { finalizarMarcador, registrarTempo } from '@/lib/tempos'
import {
  type Cispr15Config, type EmendaDraft, type RelatorioSalvo,
  getTensoes, CFG_KEY, PHOTOS_KEY, DOCX_HTML_KEY, DOCX_NAME_KEY,
  EMENDA_DRAFT_KEY, formatEmendaNumero, formatNumeroRelatorio,
} from '../types'
import { filterDocxForResult, type ResultKey } from '../docx-filter'
import { loadPhotos } from '@/lib/cispr15/photo-store'
import { carregarRelatorios, salvarRelatorio } from '@/lib/cispr15/relatorios-store'
import { textos, fmtDataI18n, juntarE, rotuloIdentificador, traduzirTextoDocx, type Idioma } from '../i18n'

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


// Extrai o CN (nome do titular) de uma subject DN de certificado, ex.:
// "C=BR, O=ICP-Brasil, ..., CN=FULANO DE TAL:12345678900" → "FULANO DE TAL:12345678900"
function extrairCN(subject: string): string {
  const m = subject.match(/CN=([^,]+)/)
  return m ? m[1].trim() : ''
}

// Formata a data no mesmo padrão do carimbo padrão do Adobe: "AAAA.MM.DD
// HH:MM:SS -03'00'" (o rótulo "Dados:" em vez de "Data:" é assim mesmo no
// Adobe em português — mantido igual de propósito, pra ficar idêntico).
function formatarDataAssinatura(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const offMin = -d.getTimezoneOffset()
  const sinal = offMin >= 0 ? '+' : '-'
  const oh = p(Math.floor(Math.abs(offMin) / 60))
  const om = p(Math.abs(offMin) % 60)
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${sinal}${oh}'${om}'`
}

// O rótulo do identificador da amostra mora em ../i18n (rotuloIdentificador):
// muda com o tipo E com o idioma do relatório.
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

/* Data no idioma do relatório. Mantém a assinatura de um argumento porque a
   maioria das chamadas é em português; o inglês passa o idioma explicitamente. */
function fmtDate(iso: string, idioma: Idioma = 'pt') {
  return fmtDataI18n(iso, idioma)
}

/* ─── rodapé ────────────────────────────────────────────────────────────────── */
function PageFooter({ idioma = 'pt' }: { idioma?: Idioma }) {
  const t = textos(idioma)
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
          {t.rodapeEndereco}<br />
          {t.rodapeContato}
        </div>
        {/* direita: nº de página (print only) */}
        <span className="page-num-label" style={{ whiteSpace: 'nowrap', flexShrink: 0, fontSize: '6.5pt', color: '#444' }} />
      </div>
    </div>
  )
}

/* ─── wrapper de página A4 com margens Word (15 mm topo) ───────────────────── */
function Page({ children, first, flow, idioma = 'pt' }: { children: React.ReactNode; first?: boolean; flow?: boolean; idioma?: Idioma }) {
  return (
    <div className={cn('doc-page', first && 'doc-page-first', flow && 'doc-page-flow')}>
      <div className="doc-page-inner" style={{ padding: '15mm 14mm 14mm', boxSizing: 'border-box' as const }}>
        {children}
      </div>
      <PageFooter idioma={idioma} />
    </div>
  )
}

/* ─── cabeçalho repetido (páginas 2+) — idêntico à faixa cinza da capa ─────── */
/* `dataEmissao` entra por fora porque em modo emenda a data exibida é a DA
   EMENDA, e este componente só recebe o cfg — que guarda a data do relatório
   original. Sem o parâmetro, a capa saía com a data da emenda e o cabeçalho
   das páginas seguintes continuava com a antiga, no mesmo documento. */
function PageHeader({ cfg, numDisplay, dataEmissao }: { cfg: Cispr15Config; numDisplay?: string; dataEmissao?: string }) {
  const amostraParts = [cfg.produto, cfg.modelo, cfg.fabricante].filter(Boolean)
  const idioma: Idioma = cfg.idioma ?? 'pt'
  const t = textos(idioma)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ background: GRAY2, border: '1.5px solid #666', padding: '5px 14px 8px' }}>
        {/* Fora da RBC = fora do escopo acreditado: nenhuma página pode alegar
            acreditação, nem as de continuação. */}
        {!cfg.foraDaRbc && (
          <p style={{ textAlign: 'center', fontSize: '6.5pt', fontStyle: 'italic', color: '#000', margin: '0 0 5px' }}>
            {t.acreditacaoCabecalho}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13pt', fontWeight: 700, color: '#000' }}>{t.relatorioDeEnsaio}</span>
          <span style={{ fontSize: '13pt', fontWeight: 700, color: '#000' }}>{t.numeroAbrev} {(numDisplay ?? cfg.numRelatorio) || '—'}</span>
        </div>
      </div>
      <div style={{ background: '#fff', padding: '3px 14px 4px' }}>
        {amostraParts.length > 0 && (
          <p style={{ textAlign: 'center', fontSize: '8pt', color: '#000', margin: '0 0 1px' }}>
            {amostraParts.join(' · ')}
          </p>
        )}
        <p style={{ textAlign: 'right', fontSize: '7.5pt', color: '#000', margin: 0 }}>
          {t.cabecalhoPeriodo} {fmtDate(cfg.periodoInicio, idioma)} {t.cabecalhoPeriodoA} {fmtDate(cfg.periodoFim, idioma)} · {t.cabecalhoEmissao} {fmtDate(dataEmissao ?? cfg.dataEmissao, idioma)}
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
  const [certNome,     setCertNome]    = useState('')
  const [signState,    setSignState]   = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [signMsg,      setSignMsg]     = useState('')
  const [savingFiles,  setSavingFiles] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  // Carimbo visual de assinatura, no local do "Signatário Autorizado" (última
  // página) — só o visual, no estilo padrão do Adobe. A assinatura criptográfica
  // de verdade continua sendo aplicada via signPdf/pfx por baixo, no PDF já gerado.
  const [carimboVisivel, setCarimboVisivel] = useState(false)

  /* ── Revisão obrigatória: foto da amostra × identificação do cliente ────────
     Ação corretiva: antes de gerar ou imprimir, o técnico confere lado a lado a
     Figura 3 (foto da amostra) e os dados de identificação, e valida a
     correspondência. A aprovação vale para ESTE conjunto de dados: mexeu no
     cliente, na amostra ou na foto, a revisão cai e precisa ser refeita. */
  const [revisaoOk,      setRevisaoOk]      = useState(false)
  const [revisaoAberta,  setRevisaoAberta]  = useState(false)
  const [revisaoMarcada, setRevisaoMarcada] = useState(false)
  /* O caminho web (Puppeteer) abre a página numa sessão NOVA, onde ninguém
     revisou nada. Sem esta marca o bloqueio de impressão entraria no PDF
     legítimo e o estragaria. */
  const [modoImpressaoApi, setModoImpressaoApi] = useState(false)
  const acaoPosRevisao = useRef<null | (() => void)>(null)

  /* Ampliação das fotos da revisão: a conferência exige ler plaqueta e número
     de série, o que é impossível no tamanho do painel. */
  const [zoomFoto,  setZoomFoto]  = useState<{ url: string; nome: string } | null>(null)
  const [zoomNivel, setZoomNivel] = useState(1)
  const [zoomPos,   setZoomPos]   = useState({ x: 0, y: 0 })
  const arrastando = useRef<{ x: number; y: number } | null>(null)

  function abrirZoom(url: string, nome: string) {
    setZoomFoto({ url, nome }); setZoomNivel(1); setZoomPos({ x: 0, y: 0 })
  }
  function ajustarZoom(delta: number) {
    setZoomNivel(z => {
      const novo = Math.min(8, Math.max(1, +(z + delta).toFixed(2)))
      if (novo === 1) setZoomPos({ x: 0, y: 0 })   // voltou ao tamanho: recentraliza
      return novo
    })
  }

  useEffect(() => {
    if (!zoomFoto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomFoto(null)
      if (e.key === '+' || e.key === '=') ajustarZoom(0.5)
      if (e.key === '-' || e.key === '_') ajustarZoom(-0.5)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [zoomFoto])

  const photoRef    = useRef<HTMLInputElement>(null)
  const pastaRef    = useRef<HTMLInputElement>(null)
  const isPrintMode = useRef(false)

  /* Impressão digital do que é conferido na tela de revisão. Mudou qualquer
     coisa que aparece lá, a aprovação anterior não vale mais — senão bastaria
     aprovar e depois trocar o cliente para furar o portão. */
  const assinaturaRevisao = useMemo(() => {
    const f2 = photos[1]
    const f3 = photos[2]
    return JSON.stringify([
      cfg?.cliente, cfg?.clienteRua, cfg?.clienteCidade, cfg?.clienteCep,
      cfg?.produto, cfg?.fabricante, cfg?.modelo, cfg?.identificador, cfg?.lacre,
      cfg?.protocolo, cfg?.orcamento, cfg?.tensaoAlim, cfg?.potencia, cfg?.frequencia,
      f2?.name ?? null, f2?.url.length ?? 0, f2?.url.slice(-48) ?? null,
      f3?.name ?? null, f3?.url.length ?? 0, f3?.url.slice(-48) ?? null,
    ])
  }, [cfg, photos])

  useEffect(() => { setRevisaoOk(false); setRevisaoMarcada(false) }, [assinaturaRevisao])

  /* O PDF oficial sai por printToPDF NESTA janela, então o bloqueio precisa ter
     sumido do DOM antes de gerar (ver confirmarRevisao). No caminho web a
     página é renderizada noutra sessão, que nunca revisou: lá não se aplica. */
  const bloquearImpressao = !revisaoOk && !modoImpressaoApi

  function pedirRevisao(acao: () => void) {
    acaoPosRevisao.current = acao
    setRevisaoMarcada(false)
    setRevisaoAberta(true)
  }

  function comRevisao(acao: () => void | Promise<void>) {
    if (revisaoOk) { void acao(); return }
    pedirRevisao(() => { void acao() })
  }

  function confirmarRevisao() {
    setRevisaoOk(true)
    setRevisaoAberta(false)
    const acao = acaoPosRevisao.current
    acaoPosRevisao.current = null
    /* Dois rAF: o React precisa ter repintado SEM a classe de bloqueio antes de
       o printToPDF capturar a página, senão o PDF sai com o aviso no lugar do
       relatório. */
    if (acao) requestAnimationFrame(() => requestAnimationFrame(acao))
  }

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

      /* Traduz o relatório do Radimation ANTES de fatiar em páginas — um passe
         só, sobre os NÓS DE TEXTO. Nunca sobre o HTML cru: uma troca por regex
         na string poderia atingir um atributo ou partir uma tag, e aqui dentro
         vêm tabelas e imagens em base64. Em português não faz nada.
         O idioma é lido de `cfg` direto porque a variável `idioma` do
         componente é declarada depois deste memo. */
      const idiomaDocx: Idioma = cfg?.idioma ?? 'pt'
      if (idiomaDocx === 'en') {
        const passeio = dom.createTreeWalker(dom.body, NodeFilter.SHOW_TEXT)
        for (let no = passeio.nextNode(); no; no = passeio.nextNode()) {
          const antes = no.nodeValue ?? ''
          const depois = traduzirTextoDocx(antes, idiomaDocx)
          if (depois !== antes) no.nodeValue = depois
        }
      }

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
      // O fallback usa o DOM já traduzido, não a string original — senão um
      // docx sem quebra de página sairia em português mesmo no relatório em inglês.
      return pages.length > 0 ? pages : [sortPeakTables(dom.body.innerHTML)]
    } catch { return [docxHtml] }
  }, [effectiveDocxHtml, cfg?.idioma])

  useEffect(() => {
    photoRef.current?.setAttribute('webkitdirectory', '')
    pastaRef.current?.setAttribute('webkitdirectory', '')
    setFromLote(new URLSearchParams(window.location.search).get('from') === 'lote')
  }, [])

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('print_token')
    if (token) {
      isPrintMode.current = true
      setModoImpressaoApi(true)
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

    // Verifica certificado digital (token/Windows OU .pfx) e extrai o nome (CN)
    // do titular pro carimbo visual da assinatura.
    ;(async () => {
      try {
        const api = (window as any).electronAPI
        if (!api?.getSettings) return
        const s = await api.getSettings()
        setHasCert(!!(s?.certThumbprint || s?.pfxPath))
        if (s?.pfxPath && api?.validatePfx) {
          try {
            // Sem senha: o main usa a da sessão, se já tiver sido informada.
            // Se ainda não foi, isso só falha em silêncio e o carimbo fica sem
            // o nome — a assinatura em si pede a senha na hora.
            const r = await api.validatePfx(s.pfxPath, '')
            if (r?.ok) setCertNome(extrairCN(r.subject))
          } catch {}
        } else if (s?.certThumbprint && api?.listCerts) {
          try {
            const r = await api.listCerts()
            const c = r?.certs?.find((c: any) => c.thumbprint === s.certThumbprint)
            if (c?.subject) setCertNome(extrairCN(c.subject))
          } catch {}
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
    const eutP = sessionStorage.getItem('eutFolderPath')   // pasta do docx → onde salvar o PDF
    if (eutP) setEutFolder(eutP)
    loadPhotos(PHOTOS_KEY).then(arr => {
      if (arr.length) setPhotos(arr.map(ph => ({ url: `data:image/jpeg;base64,${ph.base64}`, name: ph.name })))
    }).catch(() => {})
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

  /* Lembra a pasta onde está o arquivo (docx). No Electron, File.path é o caminho
     absoluto — é nessa pasta (a pasta da EUT) que o "Baixar PDF" deve salvar. */
  function lembrarPastaDoArquivo(file?: File) {
    const p = (file as unknown as { path?: string })?.path
    if (!p) return
    const dir = p.replace(/[\\/][^\\/]*$/, '')
    if (dir) { setEutFolder(dir); try { sessionStorage.setItem('eutFolderPath', dir) } catch {} }
  }

  async function handleDocx(file: File) {
    lembrarPastaDoArquivo(file)
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
    lembrarPastaDoArquivo(file)
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
      // Base: a lista da rede (o cache local só entra na versão web, dentro do
      // carregarRelatorios). Partir do cache deste PC é o que apagava relatórios
      // feitos nos outros.
      const lista = await carregarRelatorios()
      if (!lista.length) return
      const idx = lista.findIndex(r => r.id === draft.relatorioId)
      if (idx < 0) return
      const original = lista[idx]

      /* A emenda é um REGISTRO PRÓPRIO; o original fica intacto.
         O id é determinístico (<id-original>-e<N>) de propósito: a emenda é
         gravada duas vezes — na tela de emenda, antes do PDF, e aqui, depois —
         e com id sorteado cada passagem criaria um registro novo. Assim a
         segunda passagem ATUALIZA a primeira. */
      const idRegistro = `${original.id}-e${draft.emendaNum}`
      const registro: RelatorioSalvo = {
        ...original,
        id: idRegistro,
        // Mantém o número do original: a letra da emenda vem de emendaNum, via
        // formatEmendaNumero. Guardar "0610a/2026" aqui duplicaria essa regra.
        numRelatorio: original.numRelatorio,
        dataEmissao: draft.dataEmenda,
        cfg: currentCfg ?? original.cfg,
        currentCfg: undefined,
        photos: [],
        emendas: [],
        emendaDe: original.id,
        emendaNum: draft.emendaNum,
        alteracoes: draft.alteracoes,
      }
      localStorage.removeItem(EMENDA_DRAFT_KEY)
      // Grava SÓ o registro-emenda (upsert pelo id determinístico). O original
      // fica intacto e a lista inteira não trafega — é o que impede uma lista
      // curta de apagar o resto.
      const res = await salvarRelatorio(registro)
      if (!res.ok) alert('A emenda foi gerada, mas o registro não foi gravado: ' + (res.error ?? ''))
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

  // Fluxo em dois passos: 1º clique revela o carimbo (arrastável) pra
  // posicionar; 2º clique gera o PDF já com o carimbo no lugar, assina de
  // verdade (pfx/token) e publica. Funciona tanto pra emenda quanto relatório normal.
  async function assinarComCarimbo() {
    if (!cfg) return
    if (!hasCert) {
      setSignState('error')
      setSignMsg('Nenhum certificado configurado. Configure em Configurações → Assinatura Digital.')
      return
    }
    if (!carimboVisivel) {
      setCarimboVisivel(true)
      setSignState('idle')
      setSignMsg('')
      return
    }
    // Assinar e publicar também EMITE o PDF — passa pela mesma revisão.
    if (!revisaoOk) { pedirRevisao(() => { void assinarComCarimbo() }); return }
    const eutPath = emendaDraft?.eutFolderPath ?? eutFolder ?? null
    if (!eutPath) {
      setSignState('error')
      setSignMsg('Pasta EUT não associada — carregue a pasta da EUT primeiro.')
      return
    }
    const san = (v: string) => (v ?? '').replace(/[/\\:*?"<>|\s]/g, '_').replace(/_+/g, '_')
    const numParaArquivo = emendaDraft ? formatEmendaNumero(cfg.numRelatorio, emendaDraft.emendaNum, cfg.foraDaRbc) : (displayNum || cfg.numRelatorio)
    const filename = `${san(numParaArquivo || cfg.protocolo)}_${cfg.tipo}_${san(cfg.fabricante)}.pdf`
    const api = (window as any).electronAPI
    if (!api?.salvarPDFNaEut || !api?.signPdf || !api?.publishPdf) return
    setSignState('loading')
    setSignMsg('')
    try {
      // Regera o PDF com o carimbo já no DOM (force: sobrescreve mesmo se já existir)
      const genRes = await api.salvarPDFNaEut(filename, eutPath, true)
      if (!genRes.ok) {
        setSignState('error')
        setSignMsg('Erro ao gerar PDF: ' + (genRes.error ?? 'desconhecido'))
        return
      }
      let signRes = await api.signPdf(eutPath, filename)
      // A senha do .pfx não fica gravada em disco: na primeira assinatura da
      // sessão o main pede aqui. Informada uma vez, o lote inteiro segue sem
      // repetir o prompt (some quando o app fecha).
      if (!signRes.ok && signRes.precisaSenha && api.setPfxPassword) {
        const senha = window.prompt('Senha do certificado (.pfx) para assinar:')
        if (!senha) {
          setSignState('error')
          setSignMsg('Assinatura cancelada — senha não informada.')
          return
        }
        await api.setPfxPassword(senha)
        signRes = await api.signPdf(eutPath, filename)
      }
      if (!signRes.ok) {
        setSignState('error')
        setSignMsg(signRes.error ?? 'Erro ao assinar')
        return
      }
      const ano = (cfg.dataEmissao || '').slice(0, 4)
      const pubRes = await api.publishPdf(eutPath, filename, ano)
      setCarimboVisivel(false)
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
  // Idioma do corpo do relatório (ver app/cispr15/i18n.ts). Só o modelo é
  // traduzido; o que o usuário digita sai como digitado.
  const idioma: Idioma = cfg.idioma ?? 'pt'
  const t = textos(idioma)
  const labelId = rotuloIdentificador(cfg.tipo, idioma)

  /* ── emenda helpers ── */
  function markerFor(campo: string): number | null {
    return emendaDraft?.alteracoes.find(a => a.campo === campo)?.marker ?? null
  }
  const displayNum = emendaDraft
    ? formatEmendaNumero(cfg.numRelatorio, emendaDraft.emendaNum, cfg.foraDaRbc)
    : formatNumeroRelatorio(cfg.numRelatorio, cfg.foraDaRbc)

  /* "Salvar arquivos": VINCULA as fotos + DOCX ao relatório (assets por id), em vez
     de copiar pra pasta da EUT (que duplicava arquivos já existentes). Ao reabrir o
     protocolo, resolverAssets() puxa esses arquivos de volta pra dentro do PDF.
     Sem id de relatório (relatório ainda não salvo), cai no export pra pasta. */
  async function salvarArquivos() {
    if (!cfg) return
    const api = (window as any).electronAPI
    const fotos = photos.map(p => ({ name: p.name, base64: (p.url.split(',')[1] ?? '') }))
    if (!fotos.length && !docx.html) { alert('Sem fotos nem DOCX para salvar.'); return }
    const relId = emendaDraft?.relatorioId
      || (typeof window !== 'undefined' ? sessionStorage.getItem('relatorioAtualId') : null)
    setSavingFiles('loading')
    try {
      if (relId && api?.saveRelatorioAssets) {
        const res = await api.saveRelatorioAssets(relId, fotos, docx.html ?? null)
        if (res?.ok) { setSavingFiles('ok'); setTimeout(() => setSavingFiles('idle'), 4000) }
        else { setSavingFiles('error'); alert('Erro ao vincular arquivos: ' + (res?.error ?? 'desconhecido')) }
        return
      }
      // Fallback (sem id / fora do Electron): exporta pra pasta como antes.
      if (!api?.exportRelatorioFiles) { setSavingFiles('idle'); alert('Disponível apenas no aplicativo.'); return }
      const folderPath = emendaDraft?.eutFolderPath ?? eutFolder ?? null
      const res = await api.exportRelatorioFiles(folderPath, displayNum || cfg.numRelatorio, fotos, docx.html, docx.filename)
      if (res?.ok) { setSavingFiles('ok'); setTimeout(() => setSavingFiles('idle'), 4000) }
      else { setSavingFiles('error'); alert('Erro ao salvar arquivos: ' + (res?.error ?? 'desconhecido')) }
    } catch (e: any) {
      setSavingFiles('error')
      alert('Erro ao salvar arquivos: ' + (e?.message ?? e))
    }
  }

  /* Tabelas de limites CISPR 15: moraram aqui até a versão em inglês existir.
     Agora vêm do dicionário (app/cispr15/i18n.ts) — não só pelo texto das
     colunas e das notas, mas porque o separador decimal muda com o idioma
     (0,009 em português; 0.009 em inglês). */
  const limCond1 = t.limCond1
  const limCond2 = t.limCond2
  const limCond3 = t.limCond3
  const limRad1  = t.limRad1
  const limRad2  = t.limRad2

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
          /* Sem revisão o documento não sai — nem pela impressora, nem por
             Ctrl+P. Os botões do app já barram antes; isto fecha o caminho que
             não passa por eles. */
          .doc-wrapper.nao-revisado > * { display: none !important; }
          .doc-wrapper.nao-revisado::before {
            content: "EMISSAO BLOQUEADA - revisao obrigatoria pendente. Abra o relatorio no app e confira a Figura 3 (foto da amostra) contra os dados de identificacao do cliente antes de gerar ou imprimir.";
            display: block; padding: 40mm 20mm; font-family: Arial, sans-serif;
            font-size: 14pt; line-height: 1.6; color: #000; text-align: center;
          }
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

        {revisaoOk && (
          <span className="flex items-center gap-1 text-[10px] font-mono text-green-400/80 border border-green-400/20 bg-green-400/8 px-2 py-1 rounded shrink-0">
            <ShieldCheck size={10} /> revisão ok
          </span>
        )}

        {savedFile && (
          <span className="text-green-400 text-xs font-mono truncate max-w-[260px]">
            ✓ {savedFile}
          </span>
        )}

        <button
          disabled={gerando}
          onClick={() => comRevisao(async () => {
            if (!cfg) return
            setSavedFile(null)
            setGerando(true)
            const san = (v: string) => (v ?? '').replace(/[/\\:*?"<>|\s]/g, '_').replace(/_+/g, '_')
            const filename = `${san(displayNum || cfg.protocolo)}_${cfg.tipo}_${san(cfg.fabricante)}.pdf`
            try {
              const api = (window as any).electronAPI
              if (api) {
                // Electron: printToPDF direto na pasta do docx (pasta da EUT)
                const folderPath = emendaDraft?.eutFolderPath ?? eutFolder ?? null
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
          })}
          className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60">
          {gerando
            ? <><Loader2 size={14} className="animate-spin" /> Gerando…</>
            : <><Printer size={14} /> Baixar PDF</>}
        </button>

        {/* Vincular fotos + DOCX ao relatório (puxados de volta ao reabrir o protocolo) */}
        <button
          disabled={savingFiles === 'loading'}
          onClick={salvarArquivos}
          title="Vincular as fotos e o DOCX a este relatório — ao reabrir o protocolo eles voltam pra dentro do PDF (sem duplicar arquivos na pasta)"
          className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60">
          {savingFiles === 'loading' ? <Loader2 size={14} className="animate-spin" /> :
           savingFiles === 'ok'      ? <CheckCircle2 size={14} className="text-green-400" /> :
           <Save size={14} />}
          {savingFiles === 'ok' ? 'Arquivos vinculados' : 'Salvar arquivos'}
        </button>

        {/* Assinar e Publicar — pra qualquer relatório com certificado configurado */}
        {hasCert && (
          <button
            onClick={assinarComCarimbo}
            disabled={signState === 'loading'}
            title={signMsg || (signState === 'ok' ? 'Publicado com sucesso' : carimboVisivel
              ? 'Confira o carimbo de assinatura na última página e clique de novo pra confirmar'
              : 'Mostrar prévia do carimbo de assinatura antes de assinar')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-all font-semibold',
              signState === 'ok'      && 'border-green/30 bg-green/8 text-green-400',
              signState === 'error'   && 'border-red-500/30 bg-red-500/8 text-red-400',
              signState === 'loading' && 'border-blue-500/30 bg-blue-500/8 text-blue-400 opacity-70 cursor-wait',
              signState === 'idle'    && 'border-white/12 text-white/50 hover:border-white/25 hover:text-white/80',
            )}>
            {signState === 'loading'
              ? <><Loader2 size={14} className="animate-spin" /> Processando…</>
              : signState === 'ok'
                ? <><CheckCircle2 size={14} /> Publicado</>
                : carimboVisivel
                  ? <><PenLine size={14} /> Confirmar e Assinar</>
                  : <><PenLine size={14} /> Assinar e Publicar</>}
          </button>
        )}
      </div>

      {/* ════════════════════════════════════════════════
          DOCUMENTO — cada <Page> = folha A4 separada
      ════════════════════════════════════════════════ */}
      <div className={cn('doc-wrapper', bloquearImpressao && 'nao-revisado')}>

        {/* ══ PÁGINA 1 — CAPA ══ */}
        <Page first flow idioma={idioma}>
          {/* Cabeçalho da capa — layout Word */}
          <div style={{ border: '1.5px solid #666', marginBottom: 10, overflow: 'hidden' }}>
            {/* Topo branco: logo PUCRS + texto universidade + CRL */}
            <div style={{ display: 'flex', alignItems: 'center', background: '#fff', minHeight: 80, borderBottom: '1px solid #888' }}>
              <div style={{ width: 82, flexShrink: 0, padding: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={PUCRS_LOGO} alt="PUCRS" style={{ width: 66, height: 'auto', display: 'block' }} />
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '6px 8px' }}>
                <p style={{ fontSize: '10pt', fontWeight: 700, color: '#000', margin: '0 0 3px' }}>{t.universidade}</p>
                <p style={{ fontSize: '8.5pt', fontWeight: 700, color: '#000', margin: '0 0 2px' }}>{t.labeloNome}</p>
                <p style={{ fontSize: '8.5pt', fontWeight: 700, color: '#000', margin: '0 0 2px' }}>{t.labeloSub}</p>
                <p style={{ fontSize: '8.5pt', fontWeight: 700, color: '#000', margin: 0 }}>{t.rede}</p>
              </div>
              {/* Etiqueta azul da Cgcre: some no ensaio fora do escopo
                  acreditado. A largura da coluna é mantida pra não deslocar o
                  bloco central do cabeçalho. */}
              <div style={{ width: 90, flexShrink: 0, padding: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {!cfg.foraDaRbc && (
                  <img src={CRL_BADGE} alt="CRL 0075" style={{ height: 74, width: 'auto', display: 'block' }} />
                )}
              </div>
            </div>
            {/* Parte cinza: texto acred + Relatório de Ensaio / Nº */}
            <div style={{ background: GRAY2, borderTop: '1px solid #888', padding: '5px 14px 8px' }}>
              {!cfg.foraDaRbc && (
                <p style={{ textAlign: 'center', fontSize: '6.5pt', fontStyle: 'italic', color: 'rgb(0, 0, 0)', margin: '0 0 5px' }}>
                  {t.acreditacaoCabecalho}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13pt', fontWeight: 700, color: '#000' }}>{t.relatorioDeEnsaio}</span>
                <span style={{ fontSize: '13pt', fontWeight: 700, color: '#000' }}>{t.numeroAbrev} {displayNum || '—'}</span>
              </div>
            </div>
          </div>

          {/* Cancela e Substitui (apenas em modo emenda) */}
          {emendaDraft && (
            <p style={{ textAlign: 'center', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt', fontWeight: 'normal', marginBottom: 10 }}>
              {t.cancelaSubstitui}
              {emendaDraft.emendaNum === 1
                /* A 1ª emenda cancela o relatório ORIGINAL — e ele precisa ser
                   citado como foi emitido. Aqui saía o número cru: num ensaio
                   FORA DA RBC o original é "EMC2990s/2026", mas a frase dizia
                   "EMC 2990/2026", nomeando um documento que não existe com
                   esse número. Da 2ª emenda em diante já estava certo, porque
                   formatEmendaNumero aplica o "s". */
                ? formatNumeroRelatorio(emendaDraft.numRelatorioOriginal, cfg.foraDaRbc)
                : formatEmendaNumero(emendaDraft.numRelatorioOriginal, emendaDraft.emendaNum - 1, cfg.foraDaRbc)}
            </p>
          )}

          {/* Período e emissão — alinhado à direita, fonte menor */}
          <div style={{ textAlign: 'right', marginBottom: 16 }}>
            <p style={{ fontSize: FS.xs, fontWeight: 700, marginBottom: 2 }}>
              {/* Sem marcador de alteração no período: a emenda pode mudar a
                  data sem que isso seja uma correção de conteúdo a sinalizar no
                  corpo. A mudança continua listada no Histórico de Alterações. */}
              {t.periodoRealizacao} {fmtDate(cfg.periodoInicio, idioma)} {t.periodoAte} {fmtDate(cfg.periodoFim, idioma)}
            </p>
            <p style={{ fontSize: FS.xs, fontWeight: 700 }}>
              {/* Em emenda, a data de emissão é a DATA DA EMENDA: o documento
                  que está sendo emitido é a emenda, não o relatório original.
                  Sem marcador de alteração aqui — a mudança de data é inerente
                  a emitir uma emenda, não é uma correção de conteúdo. */}
              {t.dataEmissaoRelatorio} {fmtDate(emendaDraft?.dataEmenda ?? cfg.dataEmissao, idioma)}
            </p>
          </div>

          <SecHeader>{t.parte1}</SecHeader>

          <p style={pTitle}>{t.secCliente}<Sup n={markerFor('cliente')} /></p>
          <p style={{ ...pJ, marginTop: 8 }}><b>{cfg.cliente || '—'}</b></p>
          {cfg.clienteRua    && <p style={pJ}>{cfg.clienteRua}</p>}
          {cfg.clienteCidade && <p style={pJ}>{cfg.clienteCidade}</p>}
          {cfg.clienteCep    && <p style={pJ}>{t.cep} {cfg.clienteCep}</p>}

          <p style={pTitle}>{t.secObjeto}<Sup n={markerFor('amostra')} /><Sup n={markerFor('tecnico')} /><Sup n={markerFor('protocolo')} /></p>
          {(() => {
            const td1: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', width: '44%' }
            const td2: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', fontWeight: 700, width: '30%', whiteSpace: 'nowrap' }
            const td3: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', width: '26%' }
            const lv = (lbl: string, val: string) => <><b>{lbl}:</b> {val}</>
            const rows: [React.ReactNode, string, string][] = cfg.tipo === 'lampada' ? [
              [<b>{cfg.produto || '—'}</b>,                      t.tensaoAlimentacao, cfg.tensaoAlim  || '—'],
              [lv(t.fabricante, cfg.fabricante || '—'),          t.potenciaNominal,   cfg.potencia    || '—'],
              [lv(t.modelo,     cfg.modelo     || '—'),          t.frequenciaRede,    cfg.frequencia  || '—'],
              [lv(t.numeroSerie, cfg.identificador || '—'),      t.orcamentoLabelo,   cfg.orcamento   || '—'],
              [lv(t.lacre, cfg.lacre || '—'),                    t.protocoloLabelo,   cfg.protocolo   || '—'],
            ] : [
              [<b>{cfg.produto || '—'}</b>,                      t.tensaoAlimentacao, cfg.tensaoAlim  || '—'],
              [lv(t.fabricante, cfg.fabricante || '—'),          t.potenciaNominal,   cfg.potencia    || '—'],
              [lv(t.modelo,     cfg.modelo     || '—'),          t.frequenciaRede,    cfg.frequencia  || '—'],
              [lv(labelId,      cfg.identificador || '—'),       t.orcamentoLabelo,   cfg.orcamento   || '—'],
              [lv(t.protocoloLabeloRotulo, cfg.protocolo || '—'), '',                 ''],
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
              <p style={pTitle}>2.1 {t.acessorioDriver}</p>
              {(() => {
                const td1: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', width: '44%' }
                const td2: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', fontWeight: 700, width: '30%', whiteSpace: 'nowrap' }
                const td3: React.CSSProperties = { border: '1px solid #999', padding: '2px 6px', width: '26%' }
                const lv = (lbl: string, val: string) => <><b>{lbl}:</b> {val}</>
                const driverRows: [React.ReactNode, string, string][] = [
                  [<b>{cfg.driverProduto || '—'}</b>,                          t.tensaoAlimentacao, cfg.driverTensaoAlim  || '—'],
                  [lv(t.fabricante, cfg.driverFabricante  || '—'),             t.potenciaNominal,   cfg.driverPotencia    || '—'],
                  [lv(t.modelo,     cfg.driverModelo      || '—'),             t.frequenciaRede,    cfg.driverFrequencia  || '—'],
                  [lv(t.numeroSerie, cfg.driverIdentificador || '—'),          t.orcamentoLabelo,   cfg.driverOrcamento   || t.naoIdentificado],
                  [lv(t.protocoloLabeloRotulo, cfg.driverProtocolo || t.naoIdentificado), '', ''],
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

          <p style={pTitle}>{cfg.temDriver && cfg.tipo === 'luminaria' ? '2.2' : '2.1'} {t.docAcompanha}<Sup n={markerFor('documentacao')} /></p>
          <p style={{ ...pJ, marginTop: 8 }}>{cfg.documentacao || '—'}</p>

          <p style={pTitle}>{cfg.temDriver && cfg.tipo === 'luminaria' ? '2.3' : '2.2'} {t.observacoes}</p>
          {(() => {
            const falhas: string[] = []
            if ((cfg.resultadoConduzida ?? 'pass') === 'fail') falhas.push(t.ensaioConduzida)
            if ((cfg.resultadoLoop      ?? 'pass') === 'fail') falhas.push(t.ensaioLoop)
            if ((cfg.resultadoAnexoB    ?? 'pass') === 'fail') falhas.push(t.ensaioAnexoB)
            if (falhas.length === 0) {
              return <p style={{ ...pJ, marginTop: 8 }}>• {t.conformeTexto}</p>
            }
            return (
              <p style={{ ...pJ, marginTop: 8 }}>
                • {t.naoConformePre}<strong>{t.naoConformeForte}</strong>{t.naoConformeMeio}
                <strong>{falhas.join('; ')}</strong>{t.naoConformePos}
              </p>
            )
          })()}

          <p style={pTitle}>{t.secNormativos}</p>
          {cfg.tipo === 'luminaria' && (
            <p style={{ ...pJ, marginTop: 8 }}>• {t.portaria62}</p>
          )}
          <p style={{ ...pJ, marginTop: cfg.tipo === 'luminaria' ? 0 : 8 }}>• {t.normaCispr15}</p>

        </Page>

        {/* ══ PÁGINA 2 — SEÇÃO 3.1 + 4 + SEÇÃO 5 + INÍCIO PARTE 2 ══ */}
        <Page flow idioma={idioma}>
          <PageHeader cfg={cfg} numDisplay={displayNum} dataEmissao={emendaDraft?.dataEmenda} />

          <p style={pTitle}>{t.secComplementares}</p>
          <p style={{ ...pJ, marginTop: 8 }}>{t.complementaresNota}</p>
          <p style={{ ...pJ, marginLeft: 14 }}>• {t.cispr1642}</p>

          <p style={pTitle}>{t.secAmbientais}</p>
          <p style={{ ...pJ, marginTop: 8 }}>{t.temperatura}</p>
          <p style={pJ}>{t.umidade}</p>

          <p style={pTitle}>{t.secObservacoes}</p>
          <p style={{ ...pJ, marginTop: 8 }}>{t.regraDecisao}</p>
          <p style={pJ}>{t.itensNaoSolicitados}</p>
          {cfg.tipo === 'luminaria' && (
            <p style={pJ}>{t.luminariaTensoesPre}{juntarE(tensoes, idioma)}{t.luminariaTensoesPos}</p>
          )}

          <SecHeader>{t.parte2}<Sup n={markerFor('resultados')} /></SecHeader>

          <p style={pTitle}>{t.metodoConduzidas}</p>
          <p style={{ ...pJ, marginTop: 8 }}>{t.conduzidas1}</p>
          <p style={pJ}>{t.conduzidas2}</p>
          <p style={pJ}>{t.conduzidas3}</p>
          <p style={pJ}>{t.conduzidas4}</p>
        </Page>

        {/* ══ PÁGINA 3 — LIMITES CONDUZIDOS ══ */}
        <Page flow idioma={idioma}>
          <PageHeader cfg={cfg} numDisplay={displayNum} dataEmissao={emendaDraft?.dataEmenda} />

          <p style={pTitle}>{t.limitesConduzidos}</p>
          <p style={{ ...pSub, marginTop: 8 }}>{t.termAlimentacao}</p>
          <LimitTable {...limCond1} />
          <p style={{ ...pSub, marginTop: 6 }}>{t.termCarga}</p>
          <LimitTable {...limCond2} />
          <p style={{ ...pSub, marginTop: 6 }}>{t.termControle}</p>
          <LimitTable {...limCond3} />
        </Page>

        {/* ══ PÁGINA 4 — RADIADAS 9 kHz–300 MHz ══ */}
        <Page flow idioma={idioma}>
          <PageHeader cfg={cfg} numDisplay={displayNum} dataEmissao={emendaDraft?.dataEmenda} />

          <p style={pTitle}>{t.metodoRadiadas9k}</p>
          <p style={{ ...pJ, marginTop: 8 }}>{t.radiadas9k1}</p>
          <p style={pJ}>{t.radiadas9k2}</p>
          <p style={pJ}>{t.radiadas9k3}</p>

          <p style={pTitle}>{t.limitesRadiados9k}</p>
          <p style={{ ...pSub, marginTop: 8 }}>{t.faixa9k30M}</p>
          <LimitTable {...limRad1} />

          <p style={pTitle}>{t.metodoRadiadas30M}</p>
          <p style={{ ...pJ, marginTop: 8 }}>{t.radiadas30M1}</p>
          <p style={pJ}>{t.radiadas30M2}</p>
          <p style={pJ}>{t.radiadas30M3}</p>
          <p style={{ ...pSub, marginTop: 8 }}>{t.faixa30M300M}</p>
          <LimitTable {...limRad2} />
        </Page>

        {/* ══ PÁGINAS — RESULTADOS RADIMATION ══ */}
        {(!docx.html || docx.loading) && (
          <Page flow>
            <PageHeader cfg={cfg} numDisplay={displayNum} dataEmissao={emendaDraft?.dataEmenda} />
            <SecHeader>{t.parte2Titulo}</SecHeader>
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
          <Page key={`docx-${i}`} flow idioma={idioma}>
            <PageHeader cfg={cfg} numDisplay={displayNum} dataEmissao={emendaDraft?.dataEmenda} />
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
                <SecHeader>{t.parte2Titulo}<Sup n={markerFor('resultados')} /></SecHeader>
              </>
            )}
            <div className="doc-content" style={{ fontFamily: 'Arial, sans-serif', fontSize: '11pt' }}
              dangerouslySetInnerHTML={{ __html: pageHtml }} />
          </Page>
        ))}

        {/* ══ PÁGINA — INCERTEZAS ══ */}
        <Page flow idioma={idioma}>
          <PageHeader cfg={cfg} numDisplay={displayNum} dataEmissao={emendaDraft?.dataEmenda} />
          <SecHeader>{t.secIncertezas}</SecHeader>
          <p style={pJ}>{t.incerteza1}</p>
          <p style={pJ}>{t.incerteza2}</p>
          <LimitTable {...t.tabIncerteza} />
        </Page>

        {/* ══ PÁGINAS DE FOTOS — mínimo 2 páginas (4 slots) ══ */}
        {photoPages.map((pair, pi) => {
          // Altura disponível para as 2 fotos (mm): página A4 − margens − header − secHeader(só pg0)
          const slotHeightMm = pi === 0 ? 103 : 116
          // Fotos 1 e 2 mais largas; fotos 3+ ligeiramente menores
          const slotMaxWidthMm = pi === 0 ? photoWidth : Math.max(Math.min(photoWidth, 140), 60)
          return (
            <Page key={`foto-${pi}`} idioma={idioma}>
              <PageHeader cfg={cfg} numDisplay={displayNum} dataEmissao={emendaDraft?.dataEmenda} />
              {pi === 0 && <SecHeader>{t.fotosAmostra}</SecHeader>}
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
                              {t.remover}
                            </button>
                          </div>
                          <img
                            src={ph.url} alt={`${t.figura} ${figNum}`}
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
                            {t.figura} {figNum} – {t.amostraEnsaiada}<Sup n={markerFor(`foto_${figNum}`)} />
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
            <PageHeader cfg={cfg} numDisplay={displayNum} dataEmissao={emendaDraft?.dataEmenda} />
            <SecHeader>{t.historicoAlteracoes}</SecHeader>
            <p style={pJ}>
              {t.emendaPre}<b>{formatEmendaNumero(emendaDraft.numRelatorioOriginal, emendaDraft.emendaNum, cfg.foraDaRbc)}</b>
              {t.emendaEmitidaEm}{fmtDate(emendaDraft.dataEmenda, idioma)}
              {t.emendaReferente}{emendaDraft.numRelatorioOriginal}{t.emendaListadas}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: FS.sm }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '3px 8px', background: GRAY1, width: '8%', textAlign: 'center' }}>{t.colNumero}</th>
                  <th style={{ border: '1px solid #ccc', padding: '3px 8px', background: GRAY1, textAlign: 'left' }}>{t.colDescricaoAlteracao}</th>
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
        <Page flow idioma={idioma}>
          <PageHeader cfg={cfg} numDisplay={displayNum} dataEmissao={emendaDraft?.dataEmenda} />
          <SecHeader>{t.observacoesFinais}</SecHeader>
          {[
            // Os três itens marcados como acreditacao só entram no relatório
            // dentro do escopo da RBC — invocam a Cgcre e os acordos ILAC/IAAC.
            { acreditacao: true,  texto: t.obsCgcre },
            { acreditacao: false, texto: t.obsFornecimento },
            { acreditacao: false, texto: t.obsExclusivo },
            { acreditacao: false, texto: t.obsRetirada },
            { acreditacao: false, texto: t.obsReproducao },
            { acreditacao: true,  texto: t.obsIlac },
            { acreditacao: true,  texto: t.obsIaac },
            { acreditacao: false, texto: t.obsInstalacoes },
          ].filter(o => !(cfg.foraDaRbc && o.acreditacao)).map(({ texto: obs }, i) => (
            <p key={i} style={{ ...pJ, marginLeft: 10 }}>• {obs}</p>
          ))}

          {/* Signatário — em fluxo (margin-top empurra pro fundo). Em fluxo dá
              altura real à página, evitando que o Chromium colapse/descarte a
              última página por ser "fina" (só conteúdo absoluto). */}
          <div style={{ marginTop: carimboVisivel ? '55mm' : '85mm', display: 'flex', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', minWidth: 260 }}>
              {carimboVisivel && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  marginBottom: 10, fontFamily: 'Arial, Helvetica, sans-serif',
                }}>
                  <div style={{ position: 'relative', textAlign: 'right' }}>
                    <p style={{
                      fontSize: '13pt', fontWeight: 700, color: '#111',
                      lineHeight: 1.15, margin: 0, maxWidth: 150, wordBreak: 'break-word',
                    }}>
                      {certNome || t.certificadoConfigurado}
                    </p>
                    {/* rabisco decorativo, simulando a tinta da assinatura do Adobe */}
                    <svg width="160" height="46" viewBox="0 0 160 46"
                      style={{ position: 'absolute', top: -10, right: -6, opacity: 0.55, pointerEvents: 'none' }}>
                      <path d="M8,32 C 25,4 38,44 55,18 S 88,2 102,28 S 132,44 152,12"
                        stroke="#c0405a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ borderLeft: '1px solid #999', paddingLeft: 10, textAlign: 'left', fontSize: '7.3pt', color: '#222', lineHeight: 1.45 }}>
                    <div>{t.assinadoDigitalmentePor}<br />{certNome || t.certificadoConfigurado}</div>
                    <div>{t.dataAssinatura} {formatarDataAssinatura(new Date())}</div>
                  </div>
                </div>
              )}
              <div style={{ borderTop: '1px solid #333', paddingTop: 8 }}>
                <p style={{ fontSize: FS.sm, color: '#333', marginBottom: 2 }}>{t.signatarioAutorizado}</p>
                <p style={{ fontSize: FS.xs, color: '#666' }}>LABELO-PUCRS</p>
              </div>
            </div>
          </div>
        </Page>

      </div>

      {/* ══ Revisão obrigatória: foto da amostra × identificação do cliente ══ */}
      {revisaoAberta && (
        <div className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="card w-full max-w-5xl max-h-[92vh] overflow-auto p-6 space-y-5 animate-fade-in">

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/12 border border-amber-500/20 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-sm">Revisão obrigatória antes da emissão</p>
                <p className="text-[11px] text-white/40">
                  Confira se as fotos da amostra correspondem aos dados de identificação do cliente.
                  Sem esta validação o PDF não é gerado nem impresso.
                </p>
              </div>
              <button onClick={() => { setRevisaoAberta(false); acaoPosRevisao.current = null }}
                className="text-white/25 hover:text-white/70 transition-colors shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Figuras 2 e 3 — são as que mostram a amostra e a identificação
                  dela; é contra elas que os dados ao lado são conferidos. */}
              <div className="space-y-3">
                {[1, 2].map(i => {
                  const ph = photos[i]
                  return (
                    <div key={i} className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-widest font-mono text-white/35">
                        Figura {i + 1} — foto da amostra
                      </p>
                      {ph ? (
                        <>
                          <button type="button" onClick={() => abrirZoom(ph.url, ph.name)}
                            title="Clique para ampliar — dá para ler plaqueta e número de série"
                            className="group relative w-full rounded-lg overflow-hidden border border-white/10 bg-black/30 flex items-center justify-center hover:border-yellow-400/40 transition-colors"
                            style={{ minHeight: 150, cursor: 'zoom-in' }}>
                            <img src={ph.url} alt={'Figura ' + (i + 1) + ' — amostra'}
                              style={{ maxWidth: '100%', maxHeight: '32vh', objectFit: 'contain' }} />
                            <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 text-[9px] font-mono text-white/70 bg-black/70 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                              <Search size={9} /> ampliar
                            </span>
                          </button>
                          <p className="text-[10px] text-white/25 font-mono truncate">{ph.name}</p>
                        </>
                      ) : (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/8 p-4 text-center flex flex-col items-center justify-center" style={{ minHeight: 150 }}>
                          <AlertTriangle size={18} className="text-red-400 mb-1.5" />
                          <p className="text-red-300 text-[12px] font-semibold">Figura {i + 1} não encontrada</p>
                          <p className="text-[10px] text-white/45 mt-1">
                            Este relatório tem {photos.length} foto(s) carregada(s).
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest font-mono text-white/35">
                  Dados de identificação
                </p>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-mono text-white/30 mb-1">Cliente</p>
                    <p className="font-bold text-white text-sm">{cfg?.cliente || '—'}</p>
                    {cfg?.clienteRua    && <p className="text-white/55 text-[12px]">{cfg.clienteRua}</p>}
                    {cfg?.clienteCidade && <p className="text-white/55 text-[12px]">{cfg.clienteCidade}</p>}
                    {cfg?.clienteCep    && <p className="text-white/55 text-[12px]">CEP {cfg.clienteCep}</p>}
                  </div>
                  <div className="border-t border-white/8 pt-3">
                    <p className="text-[10px] uppercase tracking-widest font-mono text-white/30 mb-1.5">Objeto ensaiado</p>
                    <dl className="space-y-1">
                      {([
                        ['Produto',       cfg?.produto],
                        ['Fabricante',    cfg?.fabricante],
                        ['Modelo',        cfg?.modelo],
                        ['Nº série / ID', cfg?.identificador],
                        ['Lacre',         cfg?.lacre],
                        ['Protocolo',     cfg?.protocolo],
                        ['Orçamento',     cfg?.orcamento],
                        ['Tensão alim.',  cfg?.tensaoAlim],
                        ['Potência',      cfg?.potencia],
                        ['Frequência',    cfg?.frequencia],
                      ] as [string, string | undefined][]).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-[12px]">
                          <dt className="text-white/35 w-28 shrink-0">{k}</dt>
                          <dd className="text-white/85 font-medium break-words">{v || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <input type="checkbox" checked={revisaoMarcada}
                onChange={e => setRevisaoMarcada(e.target.checked)}
                className="mt-0.5 accent-yellow-400 cursor-pointer" />
              <span className="text-[12px] text-white/70 leading-relaxed">
                Confirmo que revisei as fotos da amostra e os dados de identificação acima, e que
                <b className="text-white/90"> correspondem ao mesmo item</b>.
              </span>
            </label>

            <div className="flex gap-2 justify-end">
              <button type="button"
                onClick={() => { setRevisaoAberta(false); acaoPosRevisao.current = null }}
                className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">
                Cancelar
              </button>
              <button type="button" disabled={!revisaoMarcada} onClick={confirmarRevisao}
                className="btn-primary px-5 py-2 text-sm font-bold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                <CheckCircle2 size={14} /> Confirmar e emitir
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ══ Visor ampliado de uma foto da revisão ══
          Fica ACIMA da revisão (z maior) para o técnico ampliar sem perder o
          painel de conferência de trás. */}
      {zoomFoto && (
        <div className="no-print fixed inset-0 z-[80] bg-black/95 flex flex-col"
          onClick={() => setZoomFoto(null)}>
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 shrink-0"
            onClick={e => e.stopPropagation()}>
            <p className="text-[11px] font-mono text-white/50 truncate flex-1">{zoomFoto.nome}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={() => ajustarZoom(-0.5)}
                className="w-7 h-7 rounded border border-white/15 text-white/60 hover:text-white hover:border-white/35 transition-colors text-sm leading-none">−</button>
              <span className="text-[11px] font-mono text-white/50 w-12 text-center">{Math.round(zoomNivel * 100)}%</span>
              <button type="button" onClick={() => ajustarZoom(0.5)}
                className="w-7 h-7 rounded border border-white/15 text-white/60 hover:text-white hover:border-white/35 transition-colors text-sm leading-none">+</button>
              <button type="button" onClick={() => { setZoomNivel(1); setZoomPos({ x: 0, y: 0 }) }}
                className="px-2 h-7 rounded border border-white/15 text-white/50 hover:text-white hover:border-white/35 transition-colors text-[10px] font-mono">ajustar</button>
              <button type="button" onClick={() => setZoomFoto(null)}
                className="w-7 h-7 rounded border border-white/15 text-white/60 hover:text-white hover:border-white/35 transition-colors flex items-center justify-center">
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex items-center justify-center"
            onClick={e => e.stopPropagation()}
            onWheel={e => ajustarZoom(e.deltaY < 0 ? 0.3 : -0.3)}
            onPointerDown={e => {
              if (zoomNivel <= 1) return
              arrastando.current = { x: e.clientX - zoomPos.x, y: e.clientY - zoomPos.y }
              ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            }}
            onPointerMove={e => {
              if (!arrastando.current) return
              setZoomPos({ x: e.clientX - arrastando.current.x, y: e.clientY - arrastando.current.y })
            }}
            onPointerUp={() => { arrastando.current = null }}
            onPointerLeave={() => { arrastando.current = null }}
            style={{ cursor: zoomNivel > 1 ? (arrastando.current ? 'grabbing' : 'grab') : 'default' }}>
            <img src={zoomFoto.url} alt={zoomFoto.nome} draggable={false}
              style={{
                maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                transform: 'translate(' + zoomPos.x + 'px, ' + zoomPos.y + 'px) scale(' + zoomNivel + ')',
                transition: arrastando.current ? 'none' : 'transform 90ms ease-out',
                userSelect: 'none',
              }} />
          </div>

          <p className="text-[10px] text-white/30 text-center py-2 shrink-0"
            onClick={e => e.stopPropagation()}>
            roda do mouse ou + / − para ampliar · arraste para mover · Esc ou clique fora para fechar
          </p>
        </div>
      )}
    </>
  )
}
