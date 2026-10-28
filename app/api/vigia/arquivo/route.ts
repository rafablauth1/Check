import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { caminhoBase } from '@/lib/vigia/server'

// VIGIA-7S no app: GET ?p=<caminho portátil> → imagem da pasta do VIGIA (fotos das leituras, para o Registro).
export const dynamic = 'force-dynamic'

const TIPOS: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.bmp': 'image/bmp' }

export async function GET(req: NextRequest) {
  try {
    const abs = caminhoBase(req.nextUrl.searchParams.get('p') ?? '')
    const tipo = TIPOS[path.extname(abs).toLowerCase()]
    if (!tipo) return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 })
    return new NextResponse(new Uint8Array(await fs.readFile(abs)), { headers: { 'Content-Type': tipo, 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 })
  }
}
