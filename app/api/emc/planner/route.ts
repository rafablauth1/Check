import os from 'os'
import { NextRequest, NextResponse } from 'next/server'
import { senhaConfere } from '@/lib/emc/senha-server'
import { AgendaEmcIlegivel } from '@/lib/emc/agenda-server'
import {
  lerConfigPlanner, salvarConfigPlanner, lerTarefas, criarTarefa, atualizarTarefa, removerTarefa, acaoTarefa,
  aplicarOrganizacao, PlannerIlegivel,
} from '@/lib/emc/planner/server'
import type { ConfigPlanner } from '@/lib/emc/planner/tipos'

// Planner da imunidade. GET devolve cadastros + tarefas + o usuário do Windows
// deste PC; POST faz uma ação numa tarefa; PUT grava os cadastros (pessoas,
// setups, tempos, jornada) e exige a senha de emissão no header x-senha-emc.

export const dynamic = 'force-dynamic'

const usuarioWindows = () => process.env.USERNAME || process.env.USER || os.userInfo().username

function erro(e: unknown) {
  const status = e instanceof PlannerIlegivel || e instanceof AgendaEmcIlegivel ? 409 : 500
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status })
}

export async function GET() {
  try {
    const [{ cfg, estado: ec }, { tarefas, estado: et }] = await Promise.all([lerConfigPlanner(), lerTarefas()])
    return NextResponse.json({
      cfg, tarefas, usuario: usuarioWindows(), corrompido: ec === 'corrompido' || et === 'corrompido',
    })
  } catch (e) { return erro(e) }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    switch (b?.acao) {
      case 'criar':
        if (!b.itemId || !b.ensaioId) return NextResponse.json({ error: 'itemId e ensaioId são obrigatórios' }, { status: 400 })
        return NextResponse.json({ tarefa: await criarTarefa(b) })
      case 'atualizar': {
        const tarefa = await atualizarTarefa(String(b.id), b)
        return tarefa ? NextResponse.json({ tarefa }) : NextResponse.json({ error: 'Não encontrada' }, { status: 404 })
      }
      case 'remover':
        return NextResponse.json({ ok: await removerTarefa(String(b.id)) })
      case 'iniciar': case 'pausar': case 'concluir': case 'reabrir': {
        const r = await acaoTarefa(String(b.id), b.acao, b.pessoaId ? String(b.pessoaId) : undefined)
        return r.tarefa ? NextResponse.json(r) : NextResponse.json({ error: 'Não encontrada' }, { status: 404 })
      }
      case 'aplicar':
        return NextResponse.json({ tarefas: await aplicarOrganizacao(Array.isArray(b.alocacoes) ? b.alocacoes : []) })
    }
    return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
  } catch (e) { return erro(e) }
}

export async function PUT(req: NextRequest) {
  if (!(await senhaConfere(req.headers.get('x-senha-emc')))) {
    return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 })
  }
  try {
    return NextResponse.json(await salvarConfigPlanner((await req.json()) as ConfigPlanner))
  } catch (e) { return erro(e) }
}
