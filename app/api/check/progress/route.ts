import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import { boardPadrao, STATUS, TESTE, type BoardCheck, type StatusTarefa, type StatusTeste } from '@/lib/check/tipos'

const ARQUIVO = 'check.json'

function agora() {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Atualiza o progresso de uma demanda (usado por mim/scripts ao implementar tarefas
// do DEMANDAS.md). Marca status, registra nota e, em erro, prefixa com ⚠️.
// Alvo por `id` ou, na falta, por `title` (case-insensitive).
export async function POST(req: NextRequest) {
  try {
    const { id, title, status, teste, note, level } = (await req.json()) as {
      id?: string; title?: string; status?: StatusTarefa; teste?: StatusTeste; note?: string; level?: 'info' | 'error'
    }
    if (!id && !title) {
      return NextResponse.json({ error: 'informe id ou title' }, { status: 400 })
    }
    const board = (await lerJSON<BoardCheck | null>(ARQUIVO, null)) ?? boardPadrao()
    const alvo = id
      ? board.tarefas.find((t) => t.id === id)
      : board.tarefas.find((t) => t.title.trim().toLowerCase() === String(title).trim().toLowerCase())
    if (!alvo) {
      return NextResponse.json({ error: 'tarefa não encontrada' }, { status: 404 })
    }

    const novas: { when: string; what: string }[] = []
    if (note) novas.push({ when: agora(), what: (level === 'error' ? '⚠️ ' : '') + note })
    if (status && status !== alvo.status && STATUS[status]) {
      alvo.status = status
      novas.push({ when: agora(), what: `Status → ${STATUS[status].l}.` })
    }
    if (teste && teste !== alvo.teste && TESTE[teste]) {
      alvo.teste = teste
      novas.push({ when: agora(), what: `${TESTE[teste].emoji} Teste → ${TESTE[teste].l}.` })
    }
    if (novas.length) alvo.log = [...novas, ...alvo.log]

    await escreverJSON(ARQUIVO, board)
    return NextResponse.json({ ok: true, tarefa: alvo })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
