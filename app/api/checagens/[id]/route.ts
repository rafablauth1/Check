import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { Checagem } from '@/lib/checagens/tipos'
import { validarChecagem } from '@/lib/checagens/validacao'

const ARQUIVO = 'checagens.json'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const lista = lerJSON<Checagem[]>(ARQUIVO, [])
  const item = lista.find(c => c.id === params.id)
  if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json() as Partial<Checagem>
    const lista = lerJSON<Checagem[]>(ARQUIVO, [])
    const idx = lista.findIndex(c => c.id === params.id)
    if (idx < 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    const atualizado: Checagem = { ...lista[idx], ...body, id: params.id }
    atualizado.status = validarChecagem(atualizado.itens, atualizado.proximaChecagem)
    lista[idx] = atualizado
    escreverJSON(ARQUIVO, lista)
    return NextResponse.json(atualizado)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const lista = lerJSON<Checagem[]>(ARQUIVO, [])
  const nova = lista.filter(c => c.id !== params.id)
  if (nova.length === lista.length) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  escreverJSON(ARQUIVO, nova)
  return NextResponse.json({ ok: true })
}
