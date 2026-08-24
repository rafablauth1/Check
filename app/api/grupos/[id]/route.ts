import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import { GRUPOS_DEFAULT, type Grupo } from '@/lib/grupos'

const ARQUIVO = 'grupos.json'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const lista = await lerJSON<Grupo[]>(ARQUIVO, GRUPOS_DEFAULT)
  const item = lista.find(g => g.id === params.id)
  if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    // Fallback = grupos padrão (não []): sem isso, num sistema que ainda não gravou
    // grupos.json, editar um subgrupo de grupo padrão dava 404 e "não salvava".
    const lista = await lerJSON<Grupo[]>(ARQUIVO, GRUPOS_DEFAULT)
    const idx = lista.findIndex(g => g.id === params.id)
    if (idx < 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    lista[idx] = { ...lista[idx], ...body, id: params.id }
    await escreverJSON(ARQUIVO, lista)
    return NextResponse.json(lista[idx])
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const lista = await lerJSON<Grupo[]>(ARQUIVO, GRUPOS_DEFAULT)
  const nova = lista.filter(g => g.id !== params.id)
  if (nova.length === lista.length) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  await escreverJSON(ARQUIVO, nova)
  return NextResponse.json({ ok: true })
}
