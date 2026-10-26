import { NextRequest, NextResponse } from 'next/server'
import { senhaConfere } from '@/lib/emc/senha-server'
import { lerDocumento, salvarDocumento, removerDocumento } from '@/lib/conhecimento/arquivos-server'
import type { Documento } from '@/lib/conhecimento/tipos'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const doc = await lerDocumento(params.id)
  return doc ? NextResponse.json(doc) : NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await senhaConfere(req.headers.get('x-senha')))) return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 })
  try {
    if (!(await lerDocumento(params.id))) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    const body = (await req.json()) as Documento
    return NextResponse.json(await salvarDocumento({ ...body, id: params.id, tipo: body.tipo === 'nota' ? 'nota' : 'norma' }))
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await senhaConfere(req.headers.get('x-senha')))) return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 })
  return (await removerDocumento(params.id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
}
