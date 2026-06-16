import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { imagemBase64 } = await req.json() as { imagemBase64: string }
    if (!imagemBase64) return NextResponse.json({ error: 'imagemBase64 obrigatório' }, { status: 400 })

    // Tenta usar o Windows OCR via Electron IPC (muito mais rápido)
    // O frontend chama diretamente window.electronAPI.recognizeOcr quando disponível.
    // Esta route server-side usa Tesseract como fallback para browser/dev.
    const { extrairTextoOCR } = await import('@/lib/importacao/ocr')
    const texto = await extrairTextoOCR(imagemBase64)
    return NextResponse.json({ texto })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
