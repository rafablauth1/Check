import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'

interface Rascunho {
  id: string
  folder: string
  tag?: string
  motivo: string
  criadoEm: string
}

const ARQ = 'rascunhos.json'

export async function GET() {
  const data = lerJSON<Rascunho[]>(ARQ, [])
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string }
  const data = lerJSON<Rascunho[]>(ARQ, []).filter(r => r.id !== id)
  escreverJSON(ARQ, data)
  return NextResponse.json({ ok: true })
}
