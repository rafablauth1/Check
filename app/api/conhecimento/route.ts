import { NextRequest, NextResponse } from 'next/server'
import { senhaConfere } from '@/lib/emc/senha-server'
import { listarDocumentos, salvarDocumento, idLivre } from '@/lib/conhecimento/arquivos-server'
import type { Documento } from '@/lib/conhecimento/tipos'

// Base de Conhecimento: lista (livre) e cria documento (senha de emissão em x-senha).

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await listarDocumentos())
}

export async function POST(req: NextRequest) {
  if (!(await senhaConfere(req.headers.get('x-senha')))) return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 })
  try {
    const body = (await req.json()) as Documento
    if (!body.titulo?.trim() || !body.corpo?.trim()) return NextResponse.json({ error: 'Título e texto são obrigatórios.' }, { status: 400 })
    const doc = await salvarDocumento({ ...body, tipo: body.tipo === 'nota' ? 'nota' : 'norma', id: await idLivre(body.titulo) })
    return NextResponse.json(doc)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
