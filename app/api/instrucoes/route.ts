import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { DocumentoIT } from '@/lib/instrucoes/tipos'

const ARQ = 'instrucoes.json'

export async function GET() {
  return NextResponse.json(lerJSON<DocumentoIT[]>(ARQ, []))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Omit<DocumentoIT, 'id' | 'criadoEm' | 'atualizadoEm'>
    const lista = lerJSON<DocumentoIT[]>(ARQ, [])
    const nova: DocumentoIT = {
      ...body,
      id: Date.now().toString(),
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    }
    escreverJSON(ARQ, [nova, ...lista])
    return NextResponse.json(nova, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
