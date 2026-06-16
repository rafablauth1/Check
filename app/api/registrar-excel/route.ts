import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { readSettings } from '@/lib/settings-server'

// xlsx-populate preserva toda a formatação do Excel ao escrever
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XlsxPopulate = require('xlsx-populate')

function getExcelPath(): string {
  const settings = readSettings()
  if (settings.excelPath) return path.normalize(settings.excelPath)
  return path.normalize('C:/Users/Notla/OneDrive/Área de Trabalho/Compatibilidade eletromagnética_2026.xlsx')
}

function readRows(): { rows: any[][]; excelPath: string } {
  const excelPath = getExcelPath()
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Planilha não encontrada: ${excelPath}\n\nConfigure o caminho em Configurações.`)
  }
  const buf = fs.readFileSync(excelPath)
  const wb  = XLSX.read(buf, { type: 'buffer' })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
  return { rows, excelPath }
}

async function patchCells(
  excelPath: string,
  patches: Array<{ cell: string; value?: any; numberFormat?: string; clear?: boolean }>,
) {
  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const wb   = await XlsxPopulate.fromFileAsync(excelPath)
      const sheet = wb.sheet(0)
      for (const p of patches) {
        const cell = sheet.cell(p.cell)
        if (p.clear) {
          cell.value(null)
        } else {
          cell.value(p.value)
          if (p.numberFormat) cell.style('numberFormat', p.numberFormat)
        }
      }
      await wb.toFileAsync(excelPath)
      return
    } catch (err: any) {
      lastErr = err
      if (attempt < 4) await new Promise(r => setTimeout(r, 400 * attempt))
    }
  }
  throw lastErr
}

function findNextEmptyRow(rows: any[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][1] === 'EMC' && rows[i][4] === '' && rows[i][5] === '' && rows[i][6] === '') {
      return i
    }
  }
  return -1
}

export async function GET(request: NextRequest) {
  const checkProtocolo = request.nextUrl.searchParams.get('checkProtocolo')
  try {
    const { rows } = readRows()

    if (checkProtocolo !== null) {
      const needle = checkProtocolo.trim().toLowerCase()
      for (const row of rows) {
        const cell = String(row[6] ?? '').trim().toLowerCase()
        if (cell && cell === needle) {
          const num  = row[2]
          const year = new Date().getFullYear()
          return NextResponse.json({ exists: true, numRelatorio: num ? `EMC ${num}/${year}` : undefined })
        }
      }
      return NextResponse.json({ exists: false })
    }

    const idx = findNextEmptyRow(rows)
    if (idx === -1) return NextResponse.json({ error: 'Sem linhas disponíveis' }, { status: 400 })
    const num  = parseInt(String(rows[idx][2]), 10)
    const year = new Date().getFullYear()
    return NextResponse.json({ proximoNumero: num, relatorio: `EMC ${num}/${year}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { numRelatorio } = await request.json()
    const match = String(numRelatorio ?? '').match(/(\d+)/)
    if (!match) return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
    const num = parseInt(match[1], 10)

    const { rows, excelPath } = readRows()
    const idx = rows.findIndex(row => parseInt(String(row[2]), 10) === num)
    if (idx < 0) return NextResponse.json({ error: 'Número não encontrado' }, { status: 404 })

    const row1 = idx + 1
    await patchCells(excelPath, [
      { cell: `E${row1}`, value: 'CANCELADO' },
      { cell: `F${row1}`, clear: true },
      { cell: `G${row1}`, clear: true },
      { cell: `H${row1}`, clear: true },
      { cell: `I${row1}`, clear: true },
      { cell: `J${row1}`, clear: true },
    ])

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { cliente = '', produto = '', protocolo = '', orcamento = '', responsavel = '' } = await request.json()

    const { rows, excelPath } = readRows()
    const idx = findNextEmptyRow(rows)
    if (idx === -1) return NextResponse.json({ error: 'Sem linhas disponíveis na planilha' }, { status: 400 })

    const num    = parseInt(String(rows[idx][2]), 10)
    const row1   = idx + 1
    const orcNum = Number(orcamento)

    await patchCells(excelPath, [
      { cell: `E${row1}`, value: cliente },
      { cell: `F${row1}`, value: produto },
      { cell: `G${row1}`, value: protocolo },
      { cell: `H${row1}`, value: isNaN(orcNum) ? orcamento : orcNum },
      { cell: `I${row1}`, value: new Date(), numberFormat: 'dd/mm/yyyy' },
      { cell: `J${row1}`, value: responsavel },
    ])

    const year = new Date().getFullYear()
    return NextResponse.json({ numero: num, numRelatorio: `EMC ${num}/${year}` })
  } catch (err: any) {
    const msg  = err.message ?? String(err)
    const hint = msg.includes('EBUSY') || msg.includes('lock') ||
      msg.includes('EPERM') || msg.includes('EACCES') || msg.includes('ENOENT')
      ? ' — verifique se a planilha está fechada e tente novamente'
      : ''
    return NextResponse.json({ error: msg + hint }, { status: 500 })
  }
}
