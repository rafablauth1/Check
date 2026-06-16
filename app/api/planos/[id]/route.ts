import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { PlanoCalibracao } from '@/lib/planos/tipos'

const ARQUIVO = 'planos.json'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const lista = lerJSON<PlanoCalibracao[]>(ARQUIVO, [])
  const item = lista.find(p => p.id === params.id)
  if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json() as Partial<PlanoCalibracao>
    const lista = lerJSON<PlanoCalibracao[]>(ARQUIVO, [])
    const idx = lista.findIndex(p => p.id === params.id)
    if (idx < 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    lista[idx] = { ...lista[idx], ...body, id: params.id }
    escreverJSON(ARQUIVO, lista)
    return NextResponse.json(lista[idx])
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const lista = lerJSON<PlanoCalibracao[]>(ARQUIVO, [])
  const nova = lista.filter(p => p.id !== params.id)
  if (nova.length === lista.length) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  escreverJSON(ARQUIVO, nova)
  return NextResponse.json({ ok: true })
}
