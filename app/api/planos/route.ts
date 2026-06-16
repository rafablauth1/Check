import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { PlanoCalibracao } from '@/lib/planos/tipos'

const ARQUIVO = 'planos.json'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const equipId = searchParams.get('equipamentoId')
  const tag     = searchParams.get('tag')
  let lista = lerJSON<PlanoCalibracao[]>(ARQUIVO, [])
  if (equipId) lista = lista.filter(p => p.equipamentoId === equipId)
  if (tag)     lista = lista.filter(p => (p.equipamentoTag || '').toUpperCase() === tag.toUpperCase())
  return NextResponse.json(lista)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Omit<PlanoCalibracao, 'id' | 'criadoEm'>
    const lista = lerJSON<PlanoCalibracao[]>(ARQUIVO, [])
    const novo: PlanoCalibracao = { ...body, id: Date.now().toString(), criadoEm: new Date().toISOString() }
    escreverJSON(ARQUIVO, [novo, ...lista])
    return NextResponse.json(novo, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
