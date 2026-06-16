import * as XLSX from 'xlsx'
import type { ItemChecagem } from '@/lib/checagens/tipos'

export function parsearExcelChecagem(buffer: ArrayBuffer): ItemChecagem[] {
  const wb   = XLSX.read(buffer, { type: 'array' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  const itens: ItemChecagem[] = []

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i] as unknown[]
    const grandeza = String(row[0] ?? '').trim()
    if (!grandeza) continue
    const unidade          = String(row[1] ?? '').trim()
    const valorReferencia  = String(row[2] ?? '').trim()
    const valorMedido      = String(row[3] ?? '').trim()
    const resultadoRaw     = String(row[4] ?? '').trim().toLowerCase()
    const observacoes      = String(row[5] ?? '').trim()
    const resultado: ItemChecagem['resultado'] =
      resultadoRaw.startsWith('ok') || resultadoRaw.startsWith('sat') ? 'ok' :
      resultadoRaw.startsWith('nok') || resultadoRaw.startsWith('ins') ? 'nok' : 'na'
    itens.push({
      id: `excel-${i}`,
      ponto: itens.length + 1,
      grandeza,
      unidade,
      valorReferencia,
      valorMedido,
      resultado,
      observacoes: observacoes || undefined,
    })
  }
  return itens
}
