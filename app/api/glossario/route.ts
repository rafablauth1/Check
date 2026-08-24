import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import { upsertGlossario, chaveSigla, type ItemGlossario } from '@/lib/glossario'

const ARQUIVO = 'glossario.json'

export async function GET() {
  return NextResponse.json(await lerJSON<ItemGlossario[]>(ARQUIVO, []))
}

// Upsert de uma sigla: { sigla, definicao }. Substitui a definição se a sigla
// já existir; ignora se sigla/definição vierem vazias.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ItemGlossario
    const lista = await lerJSON<ItemGlossario[]>(ARQUIVO, [])
    const nova = upsertGlossario(lista, body)
    if (nova !== lista) await escreverJSON(ARQUIVO, nova)
    return NextResponse.json({ ok: true, sigla: chaveSigla(body.sigla) })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Substitui o glossário inteiro (ex.: edição em massa).
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as ItemGlossario[]
    if (!Array.isArray(body)) return NextResponse.json({ error: 'lista inválida' }, { status: 400 })
    await escreverJSON(ARQUIVO, body)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
