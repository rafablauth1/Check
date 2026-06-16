import { NextRequest, NextResponse } from 'next/server'
import { carregarNormas } from '@/lib/normas/loader'
import { escreverJSON } from '@/lib/dados'
import type { Norma } from '@/lib/normas/tipos'

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function GET() {
  return NextResponse.json(carregarNormas())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<Norma>
    const normas = carregarNormas()
    const id = body.id || slugify(body.codigo || body.titulo || 'norma')
    if (normas.find(n => n.id === id)) {
      return NextResponse.json({ error: 'ID já existe' }, { status: 409 })
    }
    const nova: Norma = {
      id,
      codigo: body.codigo || '',
      titulo: body.titulo || '',
      tipo: body.tipo || 'emissao',
      pdfDisponivel: body.pdfDisponivel ?? false,
      equipamentosNecessarios: body.equipamentosNecessarios || [],
      tabelasLimites: body.tabelasLimites || [],
      secoes: body.secoes || [],
    }
    escreverJSON('normas/index.json', [...normas, nova])
    return NextResponse.json(nova, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
