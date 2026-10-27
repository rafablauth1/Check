// Leitura de uma norma em PDF NO NAVEGADOR (pdf.js), ao anexar na Base:
// - texto página a página, sem as páginas em francês das IEC bilíngues, sem as
//   marcas de licença e sem a lista de figuras/sumário (linhas com "......");
// - figuras e tabelas: acha a legenda ("Figure 11 – …", "Tabela 9 – …"),
//   recorta a região do desenho/tabela em PNG e, nas tabelas, guarda as linhas
//   com posição para remontar em markdown (lib/conhecimento/tabela-pdf.ts).
// PDF escaneado (sem texto) não tem legenda para achar: aí o app usa o OCR.
// Só roda no cliente (usa canvas e Worker).

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { limparTextoNorma } from '@/lib/conhecimento/importar'
import { remontarTabela, type LinhaPdf } from '@/lib/conhecimento/tabela-pdf'
import { nomeArquivoFigura, ehTabela, type FiguraPdf } from '@/lib/conhecimento/figuras-md'

const ESCALA = 2.5                        // ~180 dpi: dá para ler as cotas dos desenhos

// linhas que não são da norma: licença, cópia, cabeçalho de página
const MOVEL = [/licen[cs]e agreement/i, /^\s*Customer:/i, /Order No\.?:/i, /copyright of IEC/i, /Copyright International Electrotechnical/i,
  /Provided by IHS/i, /No reproduction or networking/i, /Not for Resale/i, /Licensee=/i, /sales@iec\.ch/i,
  /©\s*IEC/i, /^[–-]\s*\d+\s*[–-]$/]
const CODIGO_FIG = /^IEC\s+\d{3,4}\/\d{2}$/          // fica dentro da figura: não é cabeçalho
const SUMARIO = /\.{4,}|…/                          // linha da lista de figuras/tabelas
// "Figure 11 – …", "Table A.1 – …", "Figura 2 - …", "Tabela 9 – …", "Figure B.1a – …", e na 4-11 "Figure 1a) ñ …"
const LEGENDA = /^(Figure|Table|Figura|Tabela)\s+([A-Z]\.\d+[a-z]?|\d+[a-z]?\)?)\s+[–\-ñ]\s+(.+)$/

interface Item { str: string; x: number; y: number; w: number; h: number; fonte: string }
interface Linha { y: number; itens: Item[]; x0: number; x1: number; h: number; texto: string; maxGap: number; movel: boolean; codigo: boolean }

function idioma(t: string) {
  t = ' ' + t.toLowerCase().replace(/\s+/g, ' ') + ' '
  const c = (re: RegExp) => (t.match(re) || []).length
  return {
    en: c(/ (the|and|of|shall|is|are|with|for|test|be|this|which) /g),
    fr: c(/ (le|la|les|des|et|du|est|une|doit|pour|essai|dans|sont|être) /g),
    pt: c(/ (do|da|dos|das|em|para|com|não|deve|ser|ensaio|ensaios|são|pelo|pela) /g),
  }
}

function linhasDe(items: TextItem[]): Linha[] {
  const its: Item[] = items.filter(i => i.str.trim()).map(i => ({
    str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height || 8, fonte: i.fontName,
  })).sort((a, b) => b.y - a.y || a.x - b.x)
  const grupos: { y: number; itens: Item[] }[] = []
  for (const it of its) {
    const g = grupos.find(l => Math.abs(l.y - it.y) < 2)
    if (g) g.itens.push(it); else grupos.push({ y: it.y, itens: [it] })
  }
  return grupos.map(g => {
    const itens = g.itens.sort((a, b) => a.x - b.x)
    let maxGap = 0, txt = ''
    itens.forEach((i, k) => {
      if (k) { const gap = i.x - (itens[k - 1].x + itens[k - 1].w); maxGap = Math.max(maxGap, gap); txt += gap > 1 ? ' ' : '' }
      txt += i.str
    })
    const texto = txt.replace(/\s+/g, ' ').trim()
    return {
      y: g.y, itens, texto, maxGap,
      x0: itens[0].x, x1: Math.max(...itens.map(i => i.x + i.w)), h: Math.max(...itens.map(i => i.h)),
      movel: MOVEL.some(re => re.test(texto)), codigo: CODIGO_FIG.test(texto),
    }
  }).sort((a, b) => b.y - a.y)
}

let workerPronto = false
async function abrirPdf(dados: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist')
  if (!workerPronto) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url))
    workerPronto = true
  }
  return pdfjs.getDocument({ data: dados }).promise
}

type Viewport = ReturnType<PDFPageProxy['getViewport']>

/** Moldura da tabela na página renderizada: a 1ª linha horizontal longa logo abaixo
 *  da legenda (borda de cima) e, a partir da ponta esquerda dela, a borda vertical
 *  descendo até acabar. Devolve o fim da tabela e as laterais (coordenadas do PDF),
 *  ou null quando a tabela não tem moldura. */
function bordaDaTabela(px: ImageData, vp: Viewport, yIniPdf: number, x0Pdf: number, x1Pdf: number, yFimPdf: number, buscaPt = 60):
  { topo: number; base: number; esq: number; dir: number; ateOFim: boolean } | null {
  const yIni = Math.ceil(vp.convertToViewportPoint(0, yIniPdf)[1])
  const yFim = Math.min(px.height - 1, Math.floor(vp.convertToViewportPoint(0, yFimPdf)[1]))
  const xa = Math.max(0, Math.floor(vp.convertToViewportPoint(x0Pdf - 20, 0)[0]))
  const xb = Math.min(px.width - 1, Math.ceil(vp.convertToViewportPoint(x1Pdf + 20, 0)[0]))
  const escuro = (x: number, y: number) => {
    const k = (y * px.width + x) * 4
    return px.data[k + 3] > 0 && px.data[k] * 0.3 + px.data[k + 1] * 0.59 + px.data[k + 2] * 0.11 < 160
  }
  const limiteBusca = Math.min(yFim, yIni + Math.round(buscaPt * ESCALA))   // borda de cima: até ~60 pt abaixo da legenda
  for (let y = yIni; y < limiteBusca; y++) {
    let melhor = 0, ini = 0, mIni = 0, mFim = 0
    for (let x = xa, run = 0; x <= xb; x++) {
      if (escuro(x, y)) { if (!run) ini = x; run++; if (run > melhor) { melhor = run; mIni = ini; mFim = x } } else run = 0
    }
    if (melhor < 0.4 * (xb - xa)) continue
    // desce pela borda esquerda (aceita falha de até 4 px — cruzamento, antisserrilhado)
    let yb = y, falha = 0
    for (let yy = y + 1; yy <= yFim; yy++) {
      let tem = false
      for (let dx = 0; dx <= 3 && !tem; dx++) tem = escuro(mIni + dx, yy)
      if (tem) { yb = yy; falha = 0 } else if (++falha > 4) break
    }
    if (yb - y < 20) return null
    return {
      topo: vp.convertToPdfPoint(0, y - 3)[1],
      base: vp.convertToPdfPoint(0, yb + 3)[1],
      esq: vp.convertToPdfPoint(mIni, 0)[0],
      dir: vp.convertToPdfPoint(mFim, 0)[0],
      ateOFim: yb >= yFim - 8,          // borda foi até o pé da página: a tabela continua na próxima
    }
  }
  return null
}

/** Figura durante a leitura: as tabelas guardam as linhas (para remontar no fim, já
    com as páginas de continuação) e se a moldura foi até o pé da página. */
type FigLida = FiguraPdf & { pequena?: boolean; linhasTab?: LinhaPdf[]; continua?: boolean }

const comNegrito = (pg: PDFPageProxy, itens: Item[]) => itens.map(i => {
  // negrito (cabeçalho das tabelas): o nome da fonte só existe depois de renderizar a página
  let nome = ''
  try { nome = (pg.commonObjs.get(i.fonte) as { name?: string } | undefined)?.name || '' } catch { /* fonte sem nome */ }
  return { s: i.str, x: i.x, w: i.w, b: /bold|black|heavy/i.test(nome) }
})

async function renderizarPagina(pg: PDFPageProxy, vp: Viewport): Promise<HTMLCanvasElement> {
  const cv = document.createElement('canvas')
  cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height)
  await pg.render({ canvasContext: cv.getContext('2d')!, viewport: vp }).promise
  return cv
}

/** Tabela que passou do pé da página: acha a moldura no alto desta página, recorta,
    emenda embaixo da imagem que já existe e junta as linhas. true = continua na próxima. */
async function continuarTabela(pg: PDFPageProxy, fig: FigLida): Promise<boolean> {
  const tc = await pg.getTextContent()
  const linhas = linhasDe(tc.items.filter((i): i is TextItem => 'str' in i))
  const view = pg.view
  const vp = pg.getViewport({ scale: ESCALA })
  const cv = await renderizarPagina(pg, vp)
  const px = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height)
  const rodape = linhas.filter(l => l.movel && l.y < (view[1] + view[3]) / 2)
  const fimPdf = rodape.length ? Math.max(...rodape.map(h => h.y + h.h * 1.2)) : view[1] + 20
  // a borda de cima da continuação fica no alto da página (abaixo do cabeçalho do DOU/IEC)
  const m = bordaDaTabela(px, vp, view[3] - 10, view[0] + 30, view[2] - 30, fimPdf, (view[3] - view[1]) * 0.45)
  if (!m) return false
  // legenda acima da moldura = é outra tabela, não a continuação desta
  if (linhas.some(l => !l.movel && l.y > m.topo && LEGENDA.test(l.texto))) return false
  const [ax, ay] = vp.convertToViewportPoint(m.esq - 6, m.topo)
  const [bx, by] = vp.convertToViewportPoint(m.dir + 6, m.base)
  const x = Math.max(0, Math.floor(Math.min(ax, bx))), y = Math.max(0, Math.floor(Math.min(ay, by)))
  const w = Math.min(cv.width - x, Math.ceil(Math.abs(bx - ax))), h = Math.min(cv.height - y, Math.ceil(Math.abs(by - ay)))
  // emenda: imagem que já existe em cima, o pedaço desta página embaixo
  const antes = new Image()
  antes.src = `data:image/png;base64,${fig.png}`
  await antes.decode()
  const junto = document.createElement('canvas')
  junto.width = Math.max(fig.largura, w); junto.height = fig.altura + h
  const ctx = junto.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, junto.width, junto.height)
  ctx.drawImage(antes, 0, 0)
  ctx.drawImage(cv, x, y, w, h, 0, fig.altura, w, h)
  fig.png = junto.toDataURL('image/png').split(',')[1]
  fig.largura = junto.width; fig.altura = junto.height
  // linhas da continuação ficam "abaixo" das que já existem (y do PDF cresce para cima)
  if (fig.linhasTab) {
    const menor = Math.min(...fig.linhasTab.map(l => l.y))
    const desloc = menor - 20 - m.topo
    fig.linhasTab.push(...linhas.filter(l => !l.movel && !l.codigo && l.y < m.topo && l.y > m.base)
      .map(l => ({ y: l.y + desloc, itens: comNegrito(pg, l.itens) })))
  }
  return m.ateOFim || !linhas.some(l => !l.movel && !l.codigo && l.y < m.base - 2 && !/^\d{1,4}$/.test(l.texto))
}

/** Recorta as figuras/tabelas de uma página (já sabendo que ela tem legenda). */
async function figurasDaPagina(pg: PDFPageProxy, n: number, linhas: Linha[], legendas: Linha[], en: number): Promise<FigLida[]> {
  // página só de desenho (quase sem texto): a língua sai da legenda ("Dessin mécanique d’une cible…")
  if (en < 5 && legendas.some(l => /\b(du|des|les|le|une|sur|dans|et)\b|d’|l’/i.test(l.texto.replace(LEGENDA, '$3')))) return []
  const uteis = linhas.filter(l => !l.movel && !l.codigo)
  const largas = uteis.filter(l => l.texto.length > 40)
  const base0 = largas.length ? largas : uteis
  const colX0 = Math.min(...base0.map(l => l.x0)), colX1 = Math.max(...base0.map(l => l.x1))
  const larg = colX1 - colX0
  // tamanho de letra do corpo: nota em letra menor dentro da figura/tabela não é corpo
  const alturas = largas.map(l => Math.round(l.h * 2) / 2).sort((a, b) => a - b)
  const hCorpo = alturas.length ? alturas[Math.floor(alturas.length * 0.75)] : 10
  const corpo = (l: Linha) => !LEGENDA.test(l.texto) && (l.x1 - l.x0) > 0.62 * larg && l.maxGap < 8 && l.h >= hCorpo * 0.92
    && !/^(NOTE|NOTA|[a-z]\s|\*)/.test(l.texto)
  const titulo = (l: Linha) => /^(\d+(\.\d+)*|[A-Z]\.\d+(\.\d+)*)\s+[A-Z][a-z]/.test(l.texto) && l.h >= hCorpo * 0.92 && l.maxGap < 30
  const cab = linhas.filter(l => l.movel)
  const view = pg.view
  const vp = pg.getViewport({ scale: ESCALA })
  let canvas: HTMLCanvasElement | null = null
  let imagem: ImageData | null = null
  let limitesX: { esq: number; dir: number } | null = null
  const renderizar = async () => (canvas ??= await renderizarPagina(pg, vp))
  const pixels = async () => {
    const cv = await renderizar()
    return imagem ??= cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height)
  }
  const out: FigLida[] = []

  for (const c of legendas) {
    const [, tipo, numero, tituloLeg] = c.texto.match(LEGENDA)!
    const idx = uteis.indexOf(c)
    let topo: number, base: number                       // y do PDF (cresce para cima)
    let pequena = false, continua = false
    if (!ehTabela(tipo as FiguraPdf['tipo'])) {
      // legenda embaixo do desenho: sobe até uma linha de corpo/legenda/cabeçalho
      base = c.y - c.h * 0.45
      const acima = cab.filter(h => h.y > c.y)
      const limite = acima.length ? Math.min(...acima.map(h => h.y - h.h * 0.5)) : view[3] - 20
      topo = limite
      for (let k = idx - 1; k >= 0; k--) {
        const l = uteis[k]
        if (corpo(l) || LEGENDA.test(l.texto)) { topo = l.y - l.h * 0.45; break }
      }
      // só texto entre a legenda e o parágrafo (sub-figuras "B.1a"/"B.1b", chave longa): página de cima até a legenda
      if (topo - base < 150) { pequena = true; topo = limite }
    } else {
      // legenda em cima da tabela. 1º: pela moldura desenhada (borda de cima logo abaixo da
      // legenda, depois a borda esquerda até onde ela acaba) — vale para célula com parágrafo
      // e linha alta. Sem moldura: pelo texto (corpo em 2 linhas, título, vão grande, rodapé)
      topo = c.y + c.h * 1.1
      const abaixo = cab.filter(h => h.y < c.y)
      base = abaixo.length ? Math.max(...abaixo.map(h => h.y + h.h * 1.2)) : view[1] + 20
      const moldura = bordaDaTabela(await pixels(), vp, c.y - c.h * 0.4, colX0, colX1, base)
      if (moldura) {
        base = moldura.base; limitesX = moldura
        // nada de texto depois da tabela nesta página (fora o número da página): ela continua na próxima
        continua = moldura.ateOFim || !uteis.some(l => l.y < moldura.base - 2 && !/^\d{1,4}$/.test(l.texto))
      }
      else {
        for (let k = idx + 1; k < uteis.length; k++) {
          const l = uteis[k], prox = uteis[k + 1], ant = uteis[k - 1]
          if (k > idx + 2 && ant.y - l.y > 26) { base = ant.y - ant.h * 0.7; break }
          if (LEGENDA.test(l.texto) || titulo(l) || (corpo(l) && (!prox || corpo(prox)))) { base = l.y + l.h * 1.1; break }
        }
      }
    }
    if (topo - base < 25) continue
    const linhasReg = uteis.filter(l => l !== c && l.y < topo && l.y > base)
    canvas = await renderizar()
    // largura: a moldura da tabela, ou a coluna de texto alargada pelos rótulos do desenho que passam dela
    const xs = linhasReg.flatMap(l => [l.x0, l.x1])
    const esq = Math.max(view[0] + 4, Math.min(limitesX?.esq ?? colX0, ...xs) - (limitesX ? 6 : 14))
    const dir = Math.min(view[2] - 4, Math.max(limitesX?.dir ?? colX1, ...xs) + (limitesX ? 6 : 8))
    limitesX = null
    const [ax, ay] = vp.convertToViewportPoint(esq, topo)
    const [bx, by] = vp.convertToViewportPoint(dir, base)
    const x = Math.max(0, Math.floor(Math.min(ax, bx))), y = Math.max(0, Math.floor(Math.min(ay, by)))
    const w = Math.min(canvas.width - x, Math.ceil(Math.abs(bx - ax))), h = Math.min(canvas.height - y, Math.ceil(Math.abs(by - ay)))
    const corte = document.createElement('canvas')
    corte.width = w; corte.height = h
    corte.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h)

    const fig: FigLida = {
      tipo: tipo as FiguraPdf['tipo'], numero, titulo: tituloLeg, legenda: c.texto, pagina: n,
      arquivo: nomeArquivoFigura(tipo as FiguraPdf['tipo'], numero),
      png: corte.toDataURL('image/png').split(',')[1], largura: w, altura: h, usar: true, pequena,
    }
    if (ehTabela(fig.tipo)) {
      fig.linhasTab = linhasReg.map(l => ({ y: l.y, itens: comNegrito(pg, l.itens) }))
      fig.continua = continua
    }
    out.push(fig)
  }
  return out
}

export interface NormaLida { texto: string; figuras: FiguraPdf[]; paginas: number; descartadas: number }

/** Lê o PDF de uma norma: texto limpo + figuras/tabelas recortadas. */
export async function lerPdfNorma(arquivo: File, progresso?: (msg: string) => void): Promise<NormaLida> {
  const pdf = await abrirPdf(await arquivo.arrayBuffer())
  const paginas = pdf.numPages
  const textos: string[] = []
  let figuras: FigLida[] = []
  let descartadas = 0
  let pendente: FigLida | null = null      // tabela que passou do pé da página anterior
  let emendas = 0
  for (let n = 1; n <= paginas; n++) {
    progresso?.(`página ${n} de ${paginas}`)
    const pg = await pdf.getPage(n)
    const tc = await pg.getTextContent()
    const linhas = linhasDe(tc.items.filter((i): i is TextItem => 'str' in i))
    const bruto = linhas.map(l => l.texto).join('\n')
    if (/REDLINE VERSION/.test(bruto)) break                 // IEC com versão de revisão anexada: daqui pra frente é repetição
    const { en, fr, pt } = idioma(bruto)
    if (fr > en && fr > pt && fr >= 5) { descartadas++; continue }   // página em francês (IEC bilíngue)
    textos.push(linhas.filter(l => !l.movel && !SUMARIO.test(l.texto)).map(l => l.texto).join('\n'))
    if (pendente) {
      const segue: boolean = await continuarTabela(pg, pendente).catch(() => false)
      pendente = segue && ++emendas < 6 ? pendente : null
    }
    if (linhas.filter(l => SUMARIO.test(l.texto)).length >= 4) continue   // sumário / lista de figuras
    const legendas = linhas.filter(l => !l.movel && LEGENDA.test(l.texto) && !SUMARIO.test(l.texto))
    if (legendas.length) {
      const novas = await figurasDaPagina(pg, n, linhas, legendas, en)
      figuras.push(...novas)
      const ultima = [...novas].reverse().find(f => f.continua)
      if (ultima) { pendente = ultima; emendas = 0 }
    }
    pg.cleanup()
  }
  // tabelas: remonta agora, já com as linhas das páginas de continuação
  for (const f of figuras) {
    if (!f.linhasTab) continue
    const r = remontarTabela(f.linhasTab)
    if ('md' in r) f.md = r.md
  }
  // mesma legenda em duas páginas: fica a primeira; figura "B.1" que é só a soma das sub-figuras B.1a/B.1b: fora
  const vistos = new Set<string>()
  figuras = figuras.filter(f => {
    if (vistos.has(f.arquivo)) return false
    if (f.pequena && figuras.some(o => o !== f && o.tipo === f.tipo && new RegExp(`^${f.numero.replace('.', '\\.')}[a-z]$`).test(o.numero))) return false
    vistos.add(f.arquivo)
    return true
  }).map(({ pequena: _p, linhasTab: _l, continua: _c, ...f }) => f)

  let texto = limparTextoNorma(textos.join('\n\n'))
  // IEC: capa e sumário ficam de fora — começa no FOREWORD (se ele estiver logo no começo)
  const ini = texto.search(/^#*\s*FOREWORD\b/m)
  if (ini > 0 && ini < texto.length * 0.3) texto = texto.slice(ini)
  await pdf.destroy()
  return { texto, figuras, paginas, descartadas }
}
