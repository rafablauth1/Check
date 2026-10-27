import { NextRequest, NextResponse } from 'next/server'
import { indiceAtual } from '@/lib/conhecimento/arquivos-server'
import { buscaHibrida, aquecer } from '@/lib/conhecimento/semantica-server'

// Busca na Base de Conhecimento: significado (modelo local) + palavras.
// ?aquecer=1 carrega o modelo e os vetores sem buscar nada (tela abrindo).

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { indice, documentos } = await indiceAtual()
  if (req.nextUrl.searchParams.get('aquecer')) {
    return NextResponse.json({ pronto: await aquecer(indice), documentos, trechos: indice.docs.length })
  }
  const q = (req.nextUrl.searchParams.get('q') || '').slice(0, 300)
  if (!q.trim()) return NextResponse.json({ resultados: [], semantica: false, documentos, trechos: indice.docs.length })
  const r = await buscaHibrida(indice, q, 15)
  return NextResponse.json({ ...r, documentos, trechos: indice.docs.length })
}
