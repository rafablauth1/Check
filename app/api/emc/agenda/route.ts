import { NextRequest, NextResponse } from 'next/server'
import { lerAgendaEmc, criarItemEmc, AgendaEmcIlegivel } from '@/lib/emc/agenda-server'
import type { AgendaItemEmc } from '@/lib/emc/tipos'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { itens, estado } = await lerAgendaEmc()
  return NextResponse.json({ itens, corrompido: estado === 'corrompido' })
}

export async function POST(req: NextRequest) {
  try {
    const item = await criarItemEmc((await req.json()) as AgendaItemEmc)
    return NextResponse.json(item)
  } catch (e: unknown) {
    const status = e instanceof AgendaEmcIlegivel ? 409 : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status })
  }
}
