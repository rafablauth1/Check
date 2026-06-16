import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import fs from 'fs'

/* ─── temp store (token → data, TTL 2 min) ────────────────────────────────── */
const store = new Map<string, { data: unknown; expires: number }>()

function clean() {
  const now = Date.now()
  for (const [k, v] of store) if (v.expires < now) store.delete(k)
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

function findBrowser(): string {
  for (const p of BROWSER_PATHS) if (fs.existsSync(p)) return p
  throw new Error('Chrome/Edge não encontrado — instale o Google Chrome ou Microsoft Edge.')
}

function buildFilename(cfg: any): string {
  const s = (v: string, first?: boolean) => {
    const str = first ? (v || '').split(/\s+/)[0] : (v || '')
    return str.replace(/[/\\:*?"<>|\s]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  }
  const num    = s(cfg.numRelatorio || 'SEM-NUMERO')
  const proto  = s(cfg.protocolo   || 'SEM-PROTOCOLO')
  const client = s(cfg.cliente     || 'SEM-CLIENTE', true)
  const tipo   = cfg.tipo === 'luminaria' ? 'Luminaria' : 'Lampada'
  return `${num}_${proto}_${client}_${tipo}`
}

/* ─── GET — retorna dados pelo token (chamado pela página headless) ─────────── */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'sem token' }, { status: 400 })
  const entry = store.get(token)
  if (!entry || entry.expires < Date.now()) {
    store.delete(token)
    return NextResponse.json({ error: 'token expirado' }, { status: 404 })
  }
  return NextResponse.json(entry.data)
}

/* ─── POST — gera PDF e retorna como download ───────────────────────────────── */
export async function POST(request: NextRequest) {
  clean()
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
  try {
    const body   = await request.json()
    const origin = request.nextUrl.origin

    store.set(token, { data: body, expires: Date.now() + 120_000 })

    const filename = buildFilename(body.cfg) + '.pdf'

    const browser = await puppeteer.launch({
      executablePath: findBrowser(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    let pdf: Uint8Array
    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 794, height: 1123 })
      await page.goto(
        `${origin}/dashboard/formularios/emc/cispr15/relatorio?print_token=${token}`,
        { waitUntil: 'domcontentloaded', timeout: 60_000 },
      )
      await page.waitForFunction('window.__printReady === true', { timeout: 50_000 })
      // garante que fontes/layout assentaram antes de capturar (senão a última página pode ser cortada)
      await page.evaluateHandle('document.fonts.ready')
      await new Promise(r => setTimeout(r, 400))
      const footer = `<div style="font-family:Arial,sans-serif; font-size:8px; color:#333; width:100%; box-sizing:border-box; padding:0 53px;"><div style="border-top:2px solid #3C3C3C; display:flex; align-items:flex-start; padding-top:3px;"><div style="font-weight:bold; color:#000; white-space:nowrap; line-height:1.25; width:55px;">LABELO<br/>PUCRS</div><div style="flex:1; text-align:center; line-height:1.3; color:#444; font-size:7px;">Av. Ipiranga n° 6681, Prédio 30 Bloco A, Sala 210 – Partenon · CEP 90619-900 – Porto Alegre – RS – Brasil<br/>Tel.: (51) 3320 3551 · labelo@pucrs.br · www.labelo.com.br</div><div style="white-space:nowrap; width:95px; text-align:right; color:#444; font-size:7px;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div></div></div>`
      pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0.8in', left: '0' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: footer,
      })
    } finally {
      await browser.close()
      store.delete(token)
    }

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'X-Filename': filename,
      },
    })
  } catch (err: any) {
    store.delete(token)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
