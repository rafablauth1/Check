// VIGIA-7S no app — planilha FOR EMC38 do Registro (porte de exportar_excel de vigia7s/registro.py, que usa
// openpyxl). Mesmas abas, células, fórmulas, formatação condicional e gráficos erro × frequência de cada bloco.
import ExcelJS from 'exceljs'
import fs from 'fs/promises'
import path from 'path'
import {
  DADOS_CAMPOS, CAB_CAMPOS, BLOCO_CAB, INICIAIS, MODELOS, num, preco_reg, stats_inicial, erro, freq_faixa,
  type Registro, type Cab,
} from '@/lib/vigia/registro'
import { pyRoundN } from '@/lib/vigia/util'
import { inserirGraficos, type GraficoDispersao } from '@/lib/vigia/xlsx-graficos'

type Ws = ExcelJS.Worksheet
type Valor = ExcelJS.CellValue
// cores como o openpyxl grava (aRGB com alfa 00)
const solido = (cor: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: '00' + cor } })
const solidoCf = (cor: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: '00' + cor }, bgColor: { argb: '00' + cor } })
/** str(float) do Python: 1.0 → '1.0' */
const pyFloat = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x))
const f = (formula: string): Valor => ({ formula: formula.replace(/^=/, '') } as ExcelJS.CellFormulaValue)

/** Planilha FOR EMC38 com fórmulas; limite = critério de aprovação do erro (%) para as cores (formatação
 *  condicional como no FOR) e para os gráficos erro × frequência de cada bloco. */
export async function exportarExcel(reg: Registro, caminho: string, limite = 1.0) {
  const verde_cf = solidoCf('C6EFCE'), verm_cf = solidoCf('FFC7CE'), amar_cf = solidoCf('FFF2CC')
  const lim = Number(limite || 0)
  const wb = new ExcelJS.Workbook()
  const fino: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: '009AA0A6' } }
  const borda: Partial<ExcelJS.Borders> = { left: fino, right: fino, top: fino, bottom: fino }
  const cab_fill = solido('D9E2F3'), tit_fill = solido('1F3864')
  const negrito: Partial<ExcelJS.Font> = { bold: true }
  const centro: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }
  const graficos: GraficoDispersao[] = []

  const cel = (ws: Ws, r: number, c: number, v?: Valor) => {
    const x = ws.getCell(r, c)
    if (v !== undefined) x.value = v  // texto vazio também é gravado (como o openpyxl)
    return x
  }
  const titulo = (ws: Ws, linha: number, texto: string, ncols = 8) => {
    cel(ws, linha, 1, texto).font = { bold: true, color: { argb: '00FFFFFF' }, size: 12 }
    for (let c = 1; c <= ncols; c++) cel(ws, linha, c).fill = tit_fill
    ws.mergeCells(linha, 1, linha, ncols)
  }
  const rotulo_valor = (ws: Ws, linha: number, col: number, rot: string, val: Valor, fmt_num?: string) => {
    cel(ws, linha, col, rot).font = negrito
    const c = cel(ws, linha, col + 1, val)
    if (fmt_num) c.numFmt = fmt_num
    return c
  }
  const larguras = (ws: Ws, ls: number[]) => ls.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  const valor = (v: unknown): Valor => { const x = num(v); return x !== null ? x : ((v || null) as Valor) }
  const cabecalhoTab = (ws: Ws, r: number, hs: string[]) => hs.forEach((h, j) => {
    const c = cel(ws, r, j + 1, h)
    c.font = negrito; c.fill = cab_fill; c.alignment = centro; c.border = borda
  })

  // DADOS
  let ws = wb.addWorksheet('DADOS')
  larguras(ws, [32, 40])
  titulo(ws, 1, 'DADOS DA AMOSTRA', 2)
  let preco_ref = ''
  DADOS_CAMPOS.forEach(([k, rot], j) => {
    const i = j + 3
    if (k === 'preco') {  // preço unitário único: todas as abas referenciam esta célula
      rotulo_valor(ws, i, 1, rot, preco_reg(reg), '0.00')
      preco_ref = `DADOS!$B$${i}`
    } else rotulo_valor(ws, i, 1, rot, (reg.dados[k] ?? '') as Valor)
  })
  cel(ws, DADOS_CAMPOS.length + 4, 1, 'Observações:').font = negrito
  cel(ws, DADOS_CAMPOS.length + 5, 1, reg.dados.obs ?? '').alignment = { wrapText: true, vertical: 'top' }

  const cabecalho = (ws: Ws, cab: Cab, linha: number, extras: [string, unknown][] = []) => {
    const itens: [string, unknown][] = [...CAB_CAMPOS.map(([k, rot]) => [rot, cab[k] ?? ''] as [string, unknown]), ...extras]
    itens.forEach(([rot, v], i) => rotulo_valor(ws, linha + Math.floor(i / 2), 1 + (i % 2) * 4, rot, valor(v)))
    return linha + Math.floor((itens.length + 1) / 2) + 1
  }

  // verificações iniciais
  const ref_media: Record<string, string> = {}, num_media: Record<string, number | null> = {}
  for (const nome of INICIAIS) {
    const ini = reg.iniciais[nome]
    ws = wb.addWorksheet(nome.slice(0, 31))
    larguras(ws, [24, 16, 18, 18, 16, 30, 4, 4])
    titulo(ws, 1, `${nome} - Levantamento do erro inicial (e1)`)
    let r = cabecalho(ws, ini.cab, 3)
    rotulo_valor(ws, r, 1, 'Totalizador inicial', valor(ini.tot_ini))
    rotulo_valor(ws, r, 5, 'Totalizador final', valor(ini.tot_fim))
    const preset_cell = `$B$${r + 1}`
    rotulo_valor(ws, r + 1, 1, 'Valor de preset (L)', num(ini.cab.preset))
    r += 3
    cabecalhoTab(ws, r, ['Medida nº', 'Preço unitário (R$)', 'Total a pagar = litros × preço [R$]',
      'Volume entregue (mostrador) [L]', 'Erro calculado (e1) [% L]', 'Obs.'])
    const r0 = r + 1
    ini.linhas.forEach((l, i) => {
      const rr = r0 + i
      cel(ws, rr, 1, l.rotulo)
      cel(ws, rr, 2, f(`=${preco_ref}`)).numFmt = '0.00'
      cel(ws, rr, 3, f(`=IF(OR(D${rr}="",B${rr}=""),"",ROUND(D${rr}*B${rr},2))`)).numFmt = '0.00'
      cel(ws, rr, 4, l.volume).numFmt = '0.000'
      cel(ws, rr, 5, f(`=IF(OR(${preset_cell}="",D${rr}=""),"",((D${rr}-${preset_cell})/${preset_cell})*100)`)).numFmt = '0.000'
      cel(ws, rr, 6, l.obs)
      for (let j = 1; j <= 6; j++) cel(ws, rr, j).border = borda
    })
    const r1 = r0 + ini.linhas.length - 1
    cel(ws, r1 + 1, 1, 'Média calculada').font = negrito
    cel(ws, r1 + 1, 4, f(`=IFERROR(AVERAGE(D${r0}:D${r1}),"")`)).numFmt = '0.0000'
    cel(ws, r1 + 1, 5, f(`=IFERROR(AVERAGE(E${r0}:E${r1}),"")`)).numFmt = '0.000'
    cel(ws, r1 + 2, 1, 'Desvio padrão').font = negrito
    cel(ws, r1 + 2, 4, f(`=IFERROR(STDEV(D${r0}:D${r1}),"")`)).numFmt = '0.0000'
    cel(ws, r1 + 2, 5, f(`=IFERROR(STDEV(E${r0}:E${r1}),"")`)).numFmt = '0.000'
    ref_media[nome] = `'${ws.name}'!$D$${r1 + 1}`
    num_media[nome] = stats_inicial(ini).media
    cel(ws, r1 + 4, 1, 'Observações:').font = negrito
    cel(ws, r1 + 5, 1, ini.obs ?? '')
  }

  // ensaios (só os que têm algum dado)
  for (const [nome, ens] of Object.entries(reg.ensaios)) {
    const tem = ens.blocos.some(b => b.linhas.some(l => l.volume !== null))
      || Object.values(ens.cab).some(v => v && String(v) !== '4' && String(v).trim())
    if (!tem) continue
    const m = MODELOS[nome]
    ws = wb.addWorksheet(nome.trim().slice(0, 31))
    larguras(ws, [18, 16, 18, 18, 16, 34, 13, 14])
    titulo(ws, 1, nome)
    const extras = (m.extras ?? []).map(([k, rot]) => [rot, ens.extras[k] ?? ''] as [string, unknown])
    let r = cabecalho(ws, ens.cab, 3, extras)
    const ref = ref_media[ens.ref]
    cel(ws, r, 1, `Erro calculado em relação à média do volume de '${ens.ref}'`).font = { italic: true }
    r += 2
    for (const b of ens.blocos) {
      if (!b.linhas.some(l => l.volume !== null) && num(b.tot_ini) === null) continue
      titulo(ws, r, b.nome)
      r += 1
      // cabeçalho do bloco (datas, metrologista, condições) — como cada bloco da 4-3 no FOR
      BLOCO_CAB.forEach(([k, rot], i) => rotulo_valor(ws, r + Math.floor(i / 4), 1 + (i % 4) * 2, rot, valor(b[k] ?? '')))
      r += Math.floor((BLOCO_CAB.length + 3) / 4) + 1
      rotulo_valor(ws, r, 1, 'Totalizador inicial', num(b.tot_ini))
      rotulo_valor(ws, r, 5, 'Totalizador final', num(b.tot_fim))
      const linha_tot = r
      r += 2
      const h0 = m.tipo === 'freq' ? 'FreQ. [MHz]' : (nome.includes('D11') ? 'Tensão [V]' : 'Medida')
      cabecalhoTab(ws, r, [h0, 'Preço unitário (R$)', 'Volume entregue (mostrador) [L]', 'Total a pagar = litros × preço [R$]',
        'Erro calculado [% L]', 'Obs.', 'Perturbação aplicada', 'Freq. p/ faixa [MHz]'])
      const r0 = r + 1
      b.linhas.forEach((l, i) => {
        const rr = r0 + i
        cel(ws, rr, 1, m.tipo === 'freq' && num(l.rotulo) !== null ? num(l.rotulo) : l.rotulo)
        cel(ws, rr, 2, f(`=${preco_ref}`)).numFmt = '0.00'
        cel(ws, rr, 3, l.volume).numFmt = '0.000'
        cel(ws, rr, 4, f(`=IF(OR(B${rr}="",C${rr}=""),"",ROUND(C${rr}*B${rr},2))`)).numFmt = '0.00'
        cel(ws, rr, 5, f(`=IF(C${rr}="","",((C${rr}-${ref})/${ref})*100)`)).numFmt = '0.000'
        cel(ws, rr, 6, l.obs)
        // G: "Não" = leitura com a frequência parada no gerador (conta no Σ/Prova, fora do erro máximo)
        cel(ws, rr, 7, l.sem_freq ? 'Não' : 'Sim')
        cel(ws, rr, 8, m.tipo === 'freq' ? freq_faixa(l) : null)
        for (let j = 1; j <= 8; j++) cel(ws, rr, j).border = borda
      })
      const r1 = r0 + Math.max(0, b.linhas.length - 1)
      cel(ws, linha_tot + 1, 1, '∑ volumes lidos').font = negrito
      cel(ws, linha_tot + 1, 2, f(`=SUM(C${r0}:C${r1})`)).numFmt = '0.000'
      cel(ws, linha_tot + 1, 5, 'Prova').font = negrito
      cel(ws, linha_tot + 1, 6, f(`=IF(OR(B${linha_tot}="",F${linha_tot}=""),"",F${linha_tot}-(B${linha_tot}+B${linha_tot + 1}))`)).numFmt = '0.000'
      // formatação condicional (como no FOR): erro ≥ limite vermelho, dentro verde; ponto sem leitura amarelo;
      // Prova ≠ 0 vermelho
      if (lim > 0 && b.linhas.length) {
        ws.addConditionalFormatting({ ref: `E${r0}:E${r1}`, rules: [{ type: 'expression', priority: 1, formulae: [`AND(ISNUMBER(E${r0}),ABS(ROUND(E${r0},3))>=${pyFloat(lim)})`], style: { fill: verm_cf } }] })
        ws.addConditionalFormatting({ ref: `E${r0}:E${r1}`, rules: [{ type: 'expression', priority: 1, formulae: [`AND(ISNUMBER(E${r0}),ABS(ROUND(E${r0},3))<${pyFloat(lim)})`], style: { fill: verde_cf } }] })
        ws.addConditionalFormatting({ ref: `A${r0}:F${r1}`, rules: [{ type: 'expression', priority: 1, formulae: [`AND($A${r0}<>"",$C${r0}="")`], style: { fill: amar_cf } }] })
      }
      ws.addConditionalFormatting({ ref: `F${linha_tot + 1}`, rules: [{ type: 'expression', priority: 1, formulae: [`AND(ISNUMBER(F${linha_tot + 1}),ABS(F${linha_tot + 1})>0.0005)`], style: { fill: verm_cf } }] })
      // gráfico erro × frequência do bloco (dados da exportação em J:K, só leituras com perturbação)
      const pts = b.linhas.filter(l => m.tipo === 'freq' && !l.sem_freq && l.volume !== null && num(l.rotulo))
        .map(l => [num(l.rotulo) as number, erro(l.volume, num_media[ens.ref])] as const)
        .filter((p): p is readonly [number, number] => p[1] !== null)
      if (pts.length) {
        cel(ws, r0 - 1, 10, 'Gráfico: f [MHz]').font = negrito
        cel(ws, r0 - 1, 11, 'Gráfico: erro [%]').font = negrito
        pts.forEach(([fq, e], i) => {
          cel(ws, r0 + i, 10, fq)
          cel(ws, r0 + i, 11, pyRoundN(e, 4)).numFmt = '0.000'
        })
        graficos.push({
          aba: ws.name, titulo: `${b.nome} — erro × frequência`, serie: b.nome,
          x: `'${ws.name}'!$J$${r0}:$J$${r0 + pts.length - 1}`, y: `'${ws.name}'!$K$${r0}:$K$${r0 + pts.length - 1}`,
          xTitulo: 'Frequência [MHz]', yTitulo: 'Erro [% L]', logX: true,
          // ws.add_chart(ch, f"M{linha_tot}"): canto superior esquerdo na coluna M, linha do totalizador
          col: 12, linha: linha_tot - 1, largCm: 16, altCm: 7.5,
        })
      }
      r = r1 + 1
      cel(ws, r, 4, 'Erro máximo').font = negrito
      // maior erro só entre as leituras com perturbação aplicada (G = "Sim"); AGGREGATE ignora os vazios
      cel(ws, r, 5, f(`=IFERROR(_xlfn.AGGREGATE(14,6,E${r0}:E${r1}/(G${r0}:G${r1}="Sim"),1),"")`)).numFmt = '0.000'
      const n_sf = b.linhas.filter(l => l.sem_freq).length
      if (n_sf) {
        cel(ws, r + 1, 1, `${n_sf} leitura(s) com a frequência parada no gerador (Perturbação = Não): `
          + 'somadas ao totalizador (∑), não entram no maior erro.').font = { italic: true }
        r += 1
      }
      r += 2
      if (b.faixas?.length) {
        cabecalhoTab(ws, r, ['Faixa', 'f mín [MHz]', 'f máx [MHz]', 'Inicial', 'Final', 'dif', 'real', 'Prova'])
        b.faixas.forEach((fx, i) => {
          const rr = r + 1 + i
          const op = i === b.faixas.length - 1 ? '<=' : '<'
          const vals: Valor[] = [fx.nome, num(fx.fmin), num(fx.fmax), num(fx.ini), num(fx.fim),
            f(`=IF(OR(D${rr}="",E${rr}=""),"",E${rr}-D${rr})`),
            f(`=SUMIFS(C${r0}:C${r1},H${r0}:H${r1},">="&B${rr},H${r0}:H${r1},"${op}"&C${rr})`),
            f(`=IF(F${rr}="","",G${rr}-F${rr})`)]
          vals.forEach((v, j) => {
            const c = cel(ws, rr, j + 1, v)
            c.border = borda
            if (j + 1 >= 4) c.numFmt = '0.000'
          })
        })
        r += b.faixas.length + 2
      }
      if (b.obs) {
        cel(ws, r, 1, 'Observações do bloco:').font = negrito
        cel(ws, r + 1, 1, b.obs)
        r += 3
      }
    }
    cel(ws, r, 1, 'Observações:').font = negrito
    cel(ws, r + 1, 1, ens.obs ?? '')
  }
  // histórico de atualizações (aba do FOR EMC38, aqui preenchida automaticamente)
  ws = wb.addWorksheet('Registro de atualizações')
  larguras(ws, [20, 16, 110])
  titulo(ws, 1, 'HISTÓRICO DE ATUALIZAÇÃO DE REGISTROS', 3)
  ;['Data', 'Responsável', 'Alteração realizada'].forEach((h, j) => {
    const c = cel(ws, 3, j + 1, h)
    c.font = negrito; c.fill = cab_fill; c.border = borda
  })
  ;(reg.historico ?? []).forEach((h, i) => {
    ;[h.data ?? '', h.usuario ?? '', h.alteracao ?? ''].forEach((v, j) => { cel(ws, i + 4, j + 1, v).border = borda })
  })
  await fs.mkdir(path.dirname(caminho), { recursive: true })
  const buf = Buffer.from(await wb.xlsx.writeBuffer())
  await fs.writeFile(caminho, graficos.length ? await inserirGraficos(buf, graficos) : buf)
}
