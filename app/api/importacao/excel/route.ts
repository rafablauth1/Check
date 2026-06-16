import { NextRequest, NextResponse } from 'next/server'
import { parsearExcelChecagem } from '@/lib/importacao/excel'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
    const buffer = await file.arrayBuffer()
    const itens = parsearExcelChecagem(buffer)
    return NextResponse.json({ itens })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
