import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import * as cheerio from 'cheerio'
import { execFile } from 'child_process'
import { writeFile, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

/* Localiza o conversor wmf2png.exe (autocontido, sem porta nem PowerShell).
   - empacotado: <resources>/bin/wmf2png.exe
   - dev:        <projeto>/bin/wmf2png.exe                                   */
function findWmf2Png(): string | null {
  const resourcesPath = (process as any).resourcesPath as string | undefined
  const candidates = [
    process.env.CISPR_WMF2PNG || '',
    resourcesPath ? join(resourcesPath, 'bin', 'wmf2png.exe') : '',
    join(process.cwd(), 'bin', 'wmf2png.exe'),
  ].filter(Boolean)
  for (const p of candidates) { if (existsSync(p)) return p }
  return null
}

/* Converte WMF/EMF → PNG chamando o exe direto. Sem porta, sem PowerShell:
   roda em qualquer PC mesmo com antivírus/ConstrainedLanguage agressivos.  */
function convertWmfToPng(wmfBuf: Buffer): Promise<{ buf: Buffer | null; error: string | null }> {
  return new Promise(async resolve => {
    const exe = findWmf2Png()
    if (!exe) {
      const msg = 'wmf2png.exe não encontrado (bin/)'
      console.error('[wmf→png]', msg)
      resolve({ buf: null, error: msg }); return
    }
    const id      = randomUUID().replace(/-/g, '')
    const wmfPath = join(tmpdir(), `cispr15-${id}.wmf`)
    const pngPath = join(tmpdir(), `cispr15-${id}.png`)
    const cleanup = async () => {
      for (const p of [wmfPath, pngPath]) { try { await unlink(p) } catch {} }
    }
    try {
      await writeFile(wmfPath, wmfBuf)
      await new Promise<void>((res, rej) => {
        execFile(exe, [wmfPath, pngPath], { timeout: 20000 }, (err, _out, stderr) => {
          if (err) { rej(new Error((stderr || '').trim() || err.message)); return }
          res()
        })
      })
      if (existsSync(pngPath)) {
        const png = await readFile(pngPath)
        await cleanup()
        resolve({ buf: png, error: null })
      } else {
        await cleanup()
        resolve({ buf: null, error: 'sem saída PNG' })
      }
    } catch (err: any) {
      await cleanup()
      const msg = (err?.message || String(err)).trim()
      console.error('[wmf→png] conversão falhou:', msg)
      resolve({ buf: null, error: msg })
    }
  })
}

/* ─── SVG placeholder — fallback quando a conversão falha ────────────────── */
function wmfPlaceholder(index: number, type: string): string {
  const label = `Gráfico ${index}`
  const hint  = `(${type} — exporte como PNG no Radimation)`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="180">
    <rect width="520" height="180" fill="#f4f4f4" stroke="#ccc" stroke-width="1.5" rx="4"/>
    <line x1="0" y1="0" x2="520" y2="180" stroke="#ddd" stroke-width="1"/>
    <line x1="520" y1="0" x2="0" y2="180" stroke="#ddd" stroke-width="1"/>
    <text x="260" y="82" text-anchor="middle" font-family="Arial" font-size="15" fill="#666" font-weight="bold">${label}</text>
    <text x="260" y="106" text-anchor="middle" font-family="Arial" font-size="10" fill="#999">${hint}</text>
  </svg>`
  return Buffer.from(svg).toString('base64')
}

/* ─── unidades reconhecidas — ordem importa (mais longa primeiro) ───────────  */
const UNITS = ['dBμV/m', 'dBμA/m', 'dBμV', 'dBμA', 'dBμW', 'dB', 'MHz', 'kHz', 'GHz']
const FREQ_UNITS = new Set(['MHz', 'kHz', 'GHz'])

/* Normaliza os dois codepoints de "micro": µ (U+00B5) → μ (U+03BC) */
function norm(s: string) { return s.replace(/µ/g, 'μ') }

function extractUnit(text: string): { num: string; unit: string } {
  const t = norm(text.trim())
  for (const u of UNITS) {
    const un = norm(u)
    if (t.endsWith(' ' + un) || t.endsWith(un)) {
      const num = t.endsWith(' ' + un)
        ? t.slice(0, -(un.length + 1)).trim()
        : t.slice(0, -un.length).trim()
      if (/^[-−]?[\d,.]+$/.test(num)) return { num, unit: u }
    }
  }
  return { num: t, unit: '' }
}

/* Garante 3 casas decimais — só chamado para colunas de frequência */
function pad3freq(s: string): string {
  const clean = s.replace(/−/g, '-').trim()
  const m = clean.match(/^(-?)(\d+)[,.](\d+)$/)
  if (!m) return clean
  return `${m[1]}${m[2]},${m[3].padEnd(3, '0').slice(0, 3)}`
}

/* Garante ao menos 1 casa decimal — para limites e medições (dB, dBμV…) */
function pad1min(s: string): string {
  const clean = s.replace(/−/g, '-').trim()
  return /^-?\d+$/.test(clean) ? clean + ',0' : clean
}

/* ─── pós-processa tabelas: unidades só no cabeçalho, freq com 3 casas ───── */
function postProcessTables(html: string): string {
  const $ = cheerio.load(html, { xml: { decodeEntities: false } } as any)

  // Remove tabelas de placeholder SQL (Radimation sem picos detectados)
  $('table').toArray().forEach(el => {
    const t = $(el).text()
    if (/SELECT\s+Peak\s+Number/i.test(t) || /FROM\s+Emission\s+Table/i.test(t)) {
      $(el).replaceWith(
        '<p style="text-align:center;color:#888;font-style:italic;padding:6px 0 10px">Nenhum pico detectado.</p>',
      )
    }
  })

  $('table').each(function() {
    const $table = $(this)

    // Se mammoth não gerou <th>, converte a primeira linha em cabeçalho
    if ($table.find('th').length === 0) {
      const firstRow = $table.find('tr').first()
      if (firstRow.length) {
        firstRow.find('td').toArray().forEach(td => {
          $(td).replaceWith($('<th>').html($(td).html() || ''))
        })
      }
    }

    // Cabeçalho branco + negrito
    $table.find('th').each(function() {
      $(this).css({ background: 'white', color: '#000', 'font-weight': 'bold' })
    })

    // Linhas de dados (tr sem th)
    const dataRows = $table.find('tr').filter(function() {
      return $(this).find('th').length === 0
    }).toArray()

    if (dataRows.length === 0) return

    const colCount = $(dataRows[0]).find('td').length
    if (colCount === 0) return

    // Detecta unidade dominante por coluna (≥50% das linhas)
    const colUnits: string[] = Array(colCount).fill('')
    for (let c = 0; c < colCount; c++) {
      const freq: Record<string, number> = {}
      for (const row of dataRows) {
        const { unit } = extractUnit($(row).find('td').eq(c).text())
        if (unit) freq[unit] = (freq[unit] ?? 0) + 1
      }
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]
      if (top && top[1] >= dataRows.length * 0.5) colUnits[c] = top[0]
    }

    // Adiciona unidade ao th correspondente (se ainda não tiver)
    const headers = $table.find('th').toArray()
    for (let c = 0; c < colCount && c < headers.length; c++) {
      if (!colUnits[c]) continue
      const $h = $(headers[c])
      const cur = norm($h.text().trim())
      if (!cur.includes(norm(colUnits[c]))) {
        $h.text(`${$h.text().trim()} (${colUnits[c]})`)
      }
    }

    // Remove unidade das células; pad3 só para frequência, pad1min para resto
    for (const row of dataRows) {
      $(row).find('td').each(function(c) {
        const $td   = $(this)
        const { num, unit } = extractUnit($td.text())
        if (unit && unit === colUnits[c]) {
          const val = FREQ_UNITS.has(unit) ? pad3freq(num) : pad1min(num)
          $td.text(val)
        }
        // Célula sem valor → "-"
        if ($td.text().trim() === '') $td.text('-')
      })
    }
  })

  // Garante negrito nas linhas de título (sobrevive à exportação PDF/Word):
  // envolve o conteúdo de cada <th> em <strong>, além do CSS já aplicado.
  // Se mammoth gerou um <p> interno, o <strong> entra dentro dele (evita
  // aninhar bloco dentro de inline, que alguns motores de PDF rejeitam).
  $('th').each(function() {
    const $th     = $(this)
    const $target = $th.children('p').length === 1 ? $th.children('p').first() : $th
    const html    = $target.html() || ''
    if (html.trim() && !/^\s*<strong[\s>]/i.test(html)) {
      $target.html(`<strong>${html}</strong>`)
    }
  })

  return $.html()
}

/* ─── injeta quebras de página — cada título+gráfico+tabela numa página ─────── */
function injectPageBreaks(html: string): string {
  const $ = cheerio.load(html, { xml: { decodeEntities: false } } as any)

  // Coleta parágrafos com imagem ANTES de qualquer mutação do DOM
  const imgParas = $('p').filter(function() {
    return $(this).find('img').length > 0
  }).toArray()

  for (const el of imgParas) {
    const $p = $(el)

    // Retrocede: coleta elementos anteriores até wrapper já processado ou imagem anterior
    const prevNodes: any[] = []
    let $prev = $p.prev()
    while ($prev.length) {
      const prevStyle = $prev.attr('style') ?? ''
      if ($prev.is('div') && prevStyle.includes('page-break-before')) break
      if ($prev.is('p') && $prev.find('img').length > 0) break
      const raw = $prev.get(0)
      if (raw) prevNodes.unshift(raw)
      $prev = $prev.prev()
    }

    // Avança: imagem + conteúdo imediato até a tabela (ou "Nenhum pico detectado.")
    // Para APÓS incluir a tabela — elementos seguintes são título da próxima seção
    const nodes: any[] = [...prevNodes, el]
    let $cur: any = $p.next()
    while ($cur.length) {
      if ($cur.is('p') && $cur.find('img').length > 0) break
      if ($cur.is('h1,h2,h3,h4,h5,h6')) break
      const isTable   = $cur.is('table')
      const isNoPeaks = $cur.is('p') && /nenhum pico detectado/i.test($cur.text())
      const raw = $cur.get(0)
      if (raw) nodes.push(raw)
      $cur = $cur.next()
      if (isTable || isNoPeaks) break   // fim da seção; próximos = nova seção
    }

    const inner    = nodes.map(n => $.html($(n))).join('')
    const insertEl = prevNodes.length > 0 ? prevNodes[0] : el

    const $wrap = $('<div>')
      .attr('style', 'page-break-before:always;page-break-inside:avoid')
      .html(inner)
    $(insertEl).before($wrap)
    nodes.forEach(n => $(n).remove())
  }

  // Tabelas fora de wrapper: evita quebra interna
  $('table').each(function() {
    if (!$(this).parent().is('div')) {
      $(this).attr('style', 'page-break-inside:avoid')
    }
  })

  return $.html()
}

/* ─── handler ─────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  let imgCounter = 0
  const wmfErrors: string[] = []

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file obrigatório' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    const result = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async function(img) {
          imgCounter++
          const idx  = imgCounter
          const type = img.contentType || 'image/png'
          const raw  = await img.read()
          const buf  = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as any)

          console.log(`[parse-docx] img ${idx}: ${type} (${buf.length} bytes)`)

          const isVector = type.includes('wmf') || type.includes('emf')

          if (isVector || buf.length === 0) {
            console.log(`[parse-docx] img ${idx} é ${type} — convertendo via wmf2png.exe…`)
            const { buf: png, error: convErr } = await convertWmfToPng(buf)

            if (png) {
              console.log(`[parse-docx] img ${idx} convertida: ${png.length} bytes PNG`)
              return {
                src:   `data:image/png;base64,${png.toString('base64')}`,
                style: 'max-width:170mm;width:100%;height:auto;display:block;margin:10px auto;page-break-inside:avoid',
              }
            }

            if (convErr) wmfErrors.push(`Gráfico ${idx}: ${convErr}`)
            console.warn(`[parse-docx] img ${idx} — conversão falhou, usando placeholder`)
            return {
              src:   `data:image/svg+xml;base64,${wmfPlaceholder(idx, type)}`,
              style: 'max-width:170mm;width:100%;height:auto;display:block;margin:10px auto;page-break-inside:avoid',
            }
          }

          return {
            src:   `data:${type};base64,${buf.toString('base64')}`,
            style: 'max-width:170mm;width:auto;height:auto;display:block;margin:10px auto;page-break-inside:avoid',
          }
        }),
      },
    )

    if (result.messages.length > 0) {
      console.log('[parse-docx] avisos:', result.messages.map((m: any) => m.message))
    }

    const processed = postProcessTables(result.value)
    const html = injectPageBreaks(processed)
    return NextResponse.json({
      html,
      warnings: result.messages.map((m: any) => m.message),
      wmfErrors: wmfErrors.length > 0 ? wmfErrors : undefined,
    })
  } catch (err: any) {
    console.error('[parse-docx]', err)
    return NextResponse.json({ error: err.message || 'Erro ao processar DOCX' }, { status: 500 })
  }
}
