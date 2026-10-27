// VIGIA-7S no app — resultado.xlsx do ensaio (porte de App.exportar_excel, que usa openpyxl).
import ExcelJS from 'exceljs'
import { caminhoRel } from '@/lib/vigia/server'
import fs from 'fs/promises'
import path from 'path'

export interface DadosResultado {
  cab: string[]
  /** linhas já com valores, erro, acumulado e esperado convertidos em número (como o Python faz) */
  linhas: (string | number | null)[][]
  i_status: number
  tot_registros: Record<string, unknown>[]
  resumo: [string, string | number][]
}

const preencher = (cor: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + cor } })

/** largura como o openpyxl calcula aqui: max(len(str(valor))) da coluna */
const larguraMax = (valores: unknown[]) => Math.max(0, ...valores.map(v => String(v ?? '').length))

export async function gerarResultadoXlsx(rel: string, d: DadosResultado): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Leituras', { views: [{ state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2' }] })
  ws.addRow(d.cab)
  ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = preencher('3C4043') })
  const verm = preencher('FCE8E6'), verde = preencher('E6F4EA'), amarelo = preencher('FEF7E0')
  for (const linha of d.linhas) {
    const r = ws.addRow(linha.map(v => (v === null ? null : v)))
    const st = String(linha[d.i_status] ?? '')
    const fill = st === 'OK' ? verde : st === 'OK*' ? amarelo : verm
    for (let c = 1; c <= linha.length; c++) r.getCell(c).fill = fill
  }
  const ncols = Math.max(d.cab.length, ...d.linhas.map(l => l.length))
  for (let c = 1; c <= ncols; c++) {
    const vals = [d.cab[c - 1], ...d.linhas.map(l => l[c - 1])]
    ws.getColumn(c).width = Math.min(60, Math.max(8, larguraMax(vals) + 2))
  }
  if (d.tot_registros.length) {
    const wt = wb.addWorksheet('Totalizador')
    const cab = Object.keys(d.tot_registros[0])
    wt.addRow(cab)
    wt.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = preencher('174EA6') })
    for (const t of d.tot_registros) {
      const r = wt.addRow(cab.map(k => (t[k] ?? null) as ExcelJS.CellValue))
      if (String(t['Situação'] ?? '').includes('DIVERGENTE')) for (let c = 1; c <= cab.length; c++) r.getCell(c).fill = verm
    }
    cab.forEach((k, i) => { wt.getColumn(i + 1).width = Math.max(12, k.length + 2) })
  }
  const res = wb.addWorksheet('Resumo')
  for (const [k, v] of d.resumo) res.addRow([k, v])
  const p = caminhoRel(path.join(rel, 'resultado.xlsx'))
  await fs.mkdir(path.dirname(p), { recursive: true })
  await wb.xlsx.writeFile(p)
  return p
}
