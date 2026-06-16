import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { Taxonomia } from '@/lib/taxonomia/tipos'
import { TAXONOMIA_DEFAULT } from '@/lib/taxonomia/tipos'

const ARQUIVO = 'taxonomia.json'

export async function GET() {
  return NextResponse.json(lerJSON<Taxonomia>(ARQUIVO, TAXONOMIA_DEFAULT))
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Taxonomia
    const limpa: Taxonomia = {
      areas:  Array.isArray(body.areas)  ? body.areas  : [],
      siglas: Array.isArray(body.siglas) ? body.siglas.map(s => ({ ...s, sigla: (s.sigla || '').toUpperCase().trim() })) : [],
      tipos:  Array.isArray(body.tipos)  ? body.tipos  : [],
    }
    escreverJSON(ARQUIVO, limpa)
    return NextResponse.json(limpa)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
