import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { Taxonomia } from '@/lib/taxonomia/tipos'
import { TAXONOMIA_DEFAULT, SIGLAS_LAB_OFICIAIS } from '@/lib/taxonomia/tipos'

const ARQUIVO = 'taxonomia.json'

// Evita pré-renderização estática (que faria o PUT de áreas/siglas dar 405 no app).
export const dynamic = 'force-dynamic'

export async function GET() {
  const tax = await lerJSON<Taxonomia>(ARQUIVO, TAXONOMIA_DEFAULT)
  // Garante que as siglas oficiais sempre existam (sem mexer nas já vinculadas).
  const existentes = new Set((tax.siglas || []).map(s => (s.sigla || '').toUpperCase()))
  const faltando = SIGLAS_LAB_OFICIAIS.filter(s => !existentes.has(s))
  if (faltando.length) tax.siglas = [...(tax.siglas || []), ...faltando.map(s => ({ sigla: s, significado: '', areaId: '' }))]
  return NextResponse.json(tax)
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Taxonomia
    const limpa: Taxonomia = {
      areas:  Array.isArray(body.areas)  ? body.areas  : [],
      siglas: Array.isArray(body.siglas) ? body.siglas.map(s => ({ ...s, sigla: (s.sigla || '').toUpperCase().trim() })) : [],
      tipos:  Array.isArray(body.tipos)  ? body.tipos  : [],
    }
    await escreverJSON(ARQUIVO, limpa)
    return NextResponse.json(limpa)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
