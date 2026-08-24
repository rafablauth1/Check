import { NextRequest, NextResponse } from 'next/server'
import { lerLaboratorios, salvarLaboratorios, type LaboratorioCal } from '@/lib/laboratorios/registro'

// Evita pré-renderização estática (que faria o PUT de laboratórios dar 405 no app).
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await lerLaboratorios())
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as LaboratorioCal[]
    const limparCampos = (c?: LaboratorioCal['campos']): LaboratorioCal['campos'] | undefined => {
      if (!c) return undefined
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(c)) { const s = (v || '').trim(); if (s) out[k] = s }
      return Object.keys(out).length ? out : undefined
    }
    const limpo: LaboratorioCal[] = (Array.isArray(body) ? body : [])
      .map(l => ({
        cal: (l.cal || '').toUpperCase().replace(/\s+/g, ' ').trim(),
        nome: (l.nome || '').trim(),
        modelo: l.modelo?.trim() || undefined,
        campos: limparCampos(l.campos),   // preserva o MODELO DE EXTRAÇÃO por lab
      }))
      // mantém labs sem CAL (Alutal, Keysight, Inmetro… não têm acreditação Cgcre e
      // são identificados só pelo nome) — só descarta linha totalmente vazia.
      .filter(l => l.cal || l.nome)
    await salvarLaboratorios(limpo)
    return NextResponse.json(limpo)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
