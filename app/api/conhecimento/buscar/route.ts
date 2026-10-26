import { NextRequest, NextResponse } from 'next/server'
import { indiceAtual } from '@/lib/conhecimento/arquivos-server'
import { buscar } from '@/lib/conhecimento/busca'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').slice(0, 300)
  const { indice, documentos } = await indiceAtual()
  return NextResponse.json({ resultados: q.trim() ? buscar(indice, q, 15) : [], documentos, trechos: indice.docs.length })
}
