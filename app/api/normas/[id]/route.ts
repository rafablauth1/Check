import { NextRequest, NextResponse } from 'next/server'
import { carregarNorma, carregarNormas } from '@/lib/normas/loader'
import { escreverJSON } from '@/lib/dados'
import type { Norma } from '@/lib/normas/tipos'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const norma = carregarNorma(params.id)
  if (!norma) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(norma)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json() as Partial<Norma>
    const normas = carregarNormas()
    const idx = normas.findIndex(n => n.id === params.id)
    if (idx < 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    normas[idx] = { ...normas[idx], ...body, id: params.id }
    escreverJSON('normas/index.json', normas)
    return NextResponse.json(normas[idx])
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const normas = carregarNormas()
  const novas = normas.filter(n => n.id !== params.id)
  if (novas.length === normas.length) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  escreverJSON('normas/index.json', novas)
  return NextResponse.json({ ok: true })
}
