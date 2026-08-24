import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { Bloco } from '@/lib/instrucoes/tipos'
import { blocosPadraoIT } from '@/lib/instrucoes/template-padrao'

const ARQ = 'it-template.json'

// force-dynamic: senão o build pré-renderiza como estática e o PUT dá 405 no app.
export const dynamic = 'force-dynamic'

interface TemplateIT { blocos: Bloco[] }

export async function GET() {
  const t = await lerJSON<TemplateIT | null>(ARQ, null)
  return NextResponse.json(t && Array.isArray(t.blocos) ? t : { blocos: blocosPadraoIT() })
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as TemplateIT
    if (!body || !Array.isArray(body.blocos)) {
      return NextResponse.json({ error: 'template inválido' }, { status: 400 })
    }
    await escreverJSON(ARQ, { blocos: body.blocos })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
