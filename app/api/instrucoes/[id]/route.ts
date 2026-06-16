import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { DocumentoIT } from '@/lib/instrucoes/tipos'

const ARQ = 'instrucoes.json'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const lista = lerJSON<DocumentoIT[]>(ARQ, [])
  const doc = lista.find(d => d.id === params.id)
  if (!doc) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(doc)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json() as Partial<DocumentoIT>
    const lista = lerJSON<DocumentoIT[]>(ARQ, [])
    const idx = lista.findIndex(d => d.id === params.id)
    if (idx < 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    lista[idx] = { ...lista[idx], ...body, atualizadoEm: new Date().toISOString() }
    escreverJSON(ARQ, lista)
    return NextResponse.json(lista[idx])
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const lista = lerJSON<DocumentoIT[]>(ARQ, [])
  escreverJSON(ARQ, lista.filter(d => d.id !== params.id))
  return NextResponse.json({ ok: true })
}
