import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import { boardPadrao, type BoardCheck } from '@/lib/check/tipos'

const ARQUIVO = 'check.json'

// Sem isto, o build empacotado pré-renderiza a rota como ESTÁTICA e o PUT
// (salvar o board) retorna 405 — funciona no `next dev`, mas não no app.
export const dynamic = 'force-dynamic'

export async function GET() {
  // null → primeira execução: devolve o board padrão (seed) sem persistir.
  // Persiste no primeiro PUT (quando o usuário mexe em algo).
  const b = await lerJSON<BoardCheck | null>(ARQUIVO, null)
  return NextResponse.json(b ?? boardPadrao())
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as BoardCheck
    if (!body || !Array.isArray(body.tarefas) || typeof body.categorias !== 'object') {
      return NextResponse.json({ error: 'board inválido' }, { status: 400 })
    }
    await escreverJSON(ARQUIVO, body)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
