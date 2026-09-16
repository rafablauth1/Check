import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import { AUXILIARES_DEFAULT, type AparelhoAuxiliar } from '@/lib/auxiliares/tipos'

const ARQUIVO = 'auxiliares.json'

// Sem isto o build pré-renderiza a rota como estática e o PUT devolve 405 no
// app empacotado — mesmo motivo documentado em app/api/taxonomia/route.ts.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await lerJSON<AparelhoAuxiliar[]>(ARQUIVO, AUXILIARES_DEFAULT))
}

/* Grava a lista inteira (mesmo modelo da taxonomia): a aba edita uma tabela e
   salva de uma vez. Campos são normalizados aqui e não na tela, para que
   qualquer origem que use esta rota grave no mesmo formato. */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'esperado um array' }, { status: 400 })
    }
    const limpa: AparelhoAuxiliar[] = body.map((a: Partial<AparelhoAuxiliar>) => ({
      id: String(a.id || ''),
      tag: (a.tag || '').toString().trim().toUpperCase(),
      nome: (a.nome || '').toString().trim(),
      fabricante: (a.fabricante || '').toString().trim(),
      modelo: (a.modelo || '').toString().trim(),
      serie: (a.serie || '').toString().trim(),
      observacao: (a.observacao || '').toString().trim(),
    })).filter(a => a.id)
    await escreverJSON(ARQUIVO, limpa)
    return NextResponse.json(limpa)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
