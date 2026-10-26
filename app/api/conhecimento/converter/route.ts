import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'

// DOCX → texto para revisar antes de entrar na base. (PDF e imagem são
// convertidos na própria tela, pelo Electron: pdf-parse e OCR do Windows.)

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const arq = form.get('arquivo')
    if (!(arq instanceof Blob)) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await arq.arrayBuffer()) })
    return NextResponse.json({ texto: value })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
