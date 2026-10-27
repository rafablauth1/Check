import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { caminhoDados } from '@/lib/dados'
import { PASTA_CONHECIMENTO } from '@/lib/conhecimento/tipos'

// Figuras e tabelas das normas (recortes dos PDFs) guardadas na Base:
// <conhecimento>/img/<documento>/<arquivo>.png — referenciadas no .md como
// ![legenda](img/<documento>/<arquivo>.png). Só nomes simples: nada de "..".

export const dynamic = 'force-dynamic'

const TIPOS: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

export async function GET(_req: NextRequest, { params }: { params: { doc: string; arquivo: string } }) {
  const { doc, arquivo } = params
  const tipo = TIPOS[path.extname(arquivo).toLowerCase()]
  if (!/^[a-z0-9-]+$/.test(doc) || !/^[A-Za-z0-9-]+\.[a-z]+$/.test(arquivo) || !tipo) {
    return NextResponse.json({ error: 'Nome inválido' }, { status: 400 })
  }
  try {
    const dados = await fs.promises.readFile(await caminhoDados(path.join(PASTA_CONHECIMENTO, 'img', doc, arquivo)))
    return new NextResponse(dados, { headers: { 'Content-Type': tipo, 'Cache-Control': 'private, max-age=3600' } })
  } catch {
    return NextResponse.json({ error: 'Imagem não encontrada' }, { status: 404 })
  }
}
