import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import { GRUPOS_DEFAULT, slugifyGrupo as slugify, type Grupo } from '@/lib/grupos'

export async function GET() {
  return NextResponse.json(await lerJSON('grupos.json', GRUPOS_DEFAULT))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const grupos = await lerJSON<Grupo[]>('grupos.json', GRUPOS_DEFAULT)
    const id = body.id || slugify(body.nome || 'grupo')
    if (grupos.find(g => g.id === id)) {
      return NextResponse.json({ error: 'ID já existe' }, { status: 409 })
    }
    const novo = { id, nome: body.nome, descricao: body.descricao || '', cor: body.cor || 'gray', subgrupos: body.subgrupos || [] }
    await escreverJSON('grupos.json', [...grupos, novo])
    return NextResponse.json(novo, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
