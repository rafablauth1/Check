// VIGIA-7S no app — gráficos de dispersão no .xlsx (o exceljs não cria gráficos). Insere no pacote as mesmas
// partes que o openpyxl grava para ScatterChart (ws.add_chart): xl/charts/chartN.xml, xl/drawings/drawingN.xml,
// os .rels e os tipos em [Content_Types].xml — XML igual ao do openpyxl 3.1 (conferido com o FOR EMC38 do VIGIA).
import JSZip from 'jszip'

export interface GraficoDispersao {
  aba: string; titulo: string; serie: string; x: string; y: string; xTitulo: string; yTitulo: string; logX: boolean
  /** canto superior esquerdo (0 = coluna A / linha 1) e tamanho em cm (chart.width / chart.height) */
  col: number; linha: number; largCm: number; altCm: number
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const textoRico = (t: string) => `<tx><rich><a:bodyPr ${A}/><a:p ${A}><a:pPr><a:defRPr/></a:pPr><a:r><a:t>${esc(t)}</a:t></a:r></a:p></rich></tx>`

function chartXml(g: GraficoDispersao): string {
  return '<chartSpace xmlns="http://schemas.openxmlformats.org/drawingml/2006/chart"><style val="13"/><chart>'
    + `<title>${textoRico(g.titulo)}</title><plotArea><scatterChart>`
    + `<ser><idx val="0"/><order val="0"/><tx><v>${esc(g.serie)}</v></tx>`
    + `<spPr><a:ln ${A}><a:noFill/><a:prstDash val="solid"/></a:ln></spPr>`
    + `<marker><symbol val="circle"/><size val="5"/><spPr><a:ln ${A}><a:prstDash val="solid"/></a:ln></spPr></marker>`
    + `<xVal><numRef><f>${esc(g.x)}</f></numRef></xVal><yVal><numRef><f>${esc(g.y)}</f></numRef></yVal></ser>`
    + '<axId val="10"/><axId val="20"/></scatterChart>'
    + `<valAx><axId val="10"/><scaling>${g.logX ? '<logBase val="10"/>' : ''}<orientation val="minMax"/></scaling><axPos val="l"/><majorGridlines/>`
    + `<title>${textoRico(g.xTitulo)}</title><majorTickMark val="none"/><minorTickMark val="none"/><crossAx val="20"/></valAx>`
    + '<valAx><axId val="20"/><scaling><orientation val="minMax"/></scaling><axPos val="l"/><majorGridlines/>'
    + `<title>${textoRico(g.yTitulo)}</title><majorTickMark val="none"/><minorTickMark val="none"/><crossAx val="10"/></valAx>`
    + '</plotArea><plotVisOnly val="1"/><dispBlanksAs val="gap"/></chart></chartSpace>'
}

const EMU_CM = 360000

function ancora(g: GraficoDispersao, i: number, rid: string): string {
  return `<oneCellAnchor><from><col>${g.col}</col><colOff>0</colOff><row>${g.linha}</row><rowOff>0</rowOff></from>`
    + `<ext cx="${Math.round(g.largCm * EMU_CM)}" cy="${Math.round(g.altCm * EMU_CM)}"/>`
    + `<graphicFrame><nvGraphicFramePr><cNvPr id="${i}" name="Chart ${i}"/><cNvGraphicFramePr/></nvGraphicFramePr><xfrm/>`
    + `<a:graphic ${A}><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">`
    + `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${REL}" r:id="${rid}"/>`
    + '</a:graphicData></a:graphic></graphicFrame><clientData/></oneCellAnchor>'
}

const rels = (itens: [string, string, string][]) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + itens.map(([id, tipo, alvo]) => `<Relationship Id="${id}" Type="${REL}/${tipo}" Target="${alvo}"/>`).join('') + '</Relationships>'

/** Devolve o .xlsx com os gráficos inseridos nas abas indicadas. */
export async function inserirGraficos(xlsx: Buffer, graficos: GraficoDispersao[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(xlsx)
  const ler = async (p: string) => (await zip.file(p)?.async('string')) ?? null
  const wbXml = (await ler('xl/workbook.xml'))!
  const wbRels = (await ler('xl/_rels/workbook.xml.rels'))!
  // nome da aba → arquivo da planilha
  const alvoDe = new Map<string, string>()
  for (const m of wbRels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1], alvo = m[0].match(/Target="([^"]+)"/)?.[1]
    if (id && alvo) alvoDe.set(id, alvo.replace(/^\/?xl\//, '').replace(/^\//, ''))
  }
  const desesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  const arquivoDaAba = new Map<string, string>()
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const nome = m[0].match(/name="([^"]*)"/)?.[1], rid = m[0].match(/r:id="([^"]+)"/)?.[1]
    if (nome !== undefined && rid && alvoDe.has(rid)) arquivoDaAba.set(desesc(nome), 'xl/' + alvoDe.get(rid))
  }
  let tipos = (await ler('[Content_Types].xml'))!
  const porAba = new Map<string, GraficoDispersao[]>()
  for (const g of graficos) porAba.set(g.aba, [...(porAba.get(g.aba) ?? []), g])
  let nChart = 0, nDrawing = 0
  for (const [aba, gs] of porAba) {
    const sheet = arquivoDaAba.get(aba)
    if (!sheet) continue
    nDrawing++
    const drawing = `xl/drawings/drawing${nDrawing}.xml`
    const drRels: [string, string, string][] = []
    const ancoras: string[] = []
    gs.forEach((g, i) => {
      nChart++
      zip.file(`xl/charts/chart${nChart}.xml`, chartXml(g))
      tipos = tipos.replace('</Types>', `<Override PartName="/xl/charts/chart${nChart}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`)
      drRels.push([`rId${i + 1}`, 'chart', `/xl/charts/chart${nChart}.xml`])
      ancoras.push(ancora(g, i + 1, `rId${i + 1}`))
    })
    zip.file(drawing, `<wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">${ancoras.join('')}</wsDr>`)
    zip.file(`xl/drawings/_rels/drawing${nDrawing}.xml.rels`, rels(drRels))
    tipos = tipos.replace('</Types>', `<Override PartName="/${drawing}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`)
    // planilha → desenho
    const relsPath = sheet.replace(/([^/]+)$/, '_rels/$1.rels')
    let sr = await ler(relsPath)
    let rid = 'rIdVigiaDr1'
    if (sr) {
      while (sr.includes(`Id="${rid}"`)) rid += 'x'
      sr = sr.replace('</Relationships>', `<Relationship Id="${rid}" Type="${REL}/drawing" Target="/${drawing}"/></Relationships>`)
    } else sr = rels([[rid, 'drawing', `/${drawing}`]])
    zip.file(relsPath, sr)
    let xml = (await ler(sheet))!
    if (!/xmlns:r=/.test(xml.slice(0, xml.indexOf('>', xml.indexOf('<worksheet'))))) {
      xml = xml.replace('<worksheet', `<worksheet xmlns:r="${REL}"`)
    }
    // ordem do CT_Worksheet: <drawing> vem antes de legacyDrawing/picture/oleObjects/controls/tableParts/extLst
    const tag = `<drawing r:id="${rid}"/>`
    const depois = ['<legacyDrawing', '<legacyDrawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst']
      .map(t => xml.indexOf(t)).filter(i => i >= 0)
    const pos = depois.length ? Math.min(...depois) : xml.lastIndexOf('</worksheet>')
    xml = xml.slice(0, pos) + tag + xml.slice(pos)
    zip.file(sheet, xml)
  }
  zip.file('[Content_Types].xml', tipos)
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}
