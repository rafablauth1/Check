import { NextRequest, NextResponse } from 'next/server'
import { atualizarItemEmc, removerItemEmc, AgendaEmcIlegivel } from '@/lib/emc/agenda-server'
import type { AgendaItemEmc } from '@/lib/emc/tipos'

export const dynamic = 'force-dynamic'

function erro(e: unknown) {
  const status = e instanceof AgendaEmcIlegivel ? 409 : 500
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const item = await atualizarItemEmc(params.id, (await req.json()) as Partial<AgendaItemEmc>)
    if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    return NextResponse.json(item)
  } catch (e: unknown) { return erro(e) }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!(await removerItemEmc(params.id))) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) { return erro(e) }
}
