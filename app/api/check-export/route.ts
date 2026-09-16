import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { caminhoDados } from '@/lib/dados'

// Ferramenta interna (quadro Check em /check.html).
// Grava na pasta de cadastros, junto do check.json que alimenta o quadro.
// Antes usava process.cwd(): serve no `next dev`, mas no app empacotado o cwd
// é a pasta interna do servidor — o arquivo saía e ninguém achava depois.
export async function POST(req: NextRequest) {
  try {
    const { markdown } = (await req.json()) as { markdown?: string }
    if (typeof markdown !== 'string') {
      return NextResponse.json({ error: 'markdown ausente' }, { status: 400 })
    }
    const destino = await caminhoDados('DEMANDAS.md')
    fs.writeFileSync(destino, markdown, 'utf-8')
    return NextResponse.json({ ok: true, path: destino })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
