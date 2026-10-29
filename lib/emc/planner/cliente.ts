import type { ConfigPlanner, Tarefa } from '@/lib/emc/planner/tipos'
import type { Alocacao } from '@/lib/emc/planner/logica'

// Chamadas da tela à rota /api/emc/planner.

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `Erro ${res.status}`)
  return body as T
}

const post = <T>(corpo: object) => fetch('/api/emc/planner', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
}).then(r => json<T>(r))

export async function carregarPlanner(): Promise<{ cfg: ConfigPlanner; tarefas: Tarefa[]; usuario: string; corrompido: boolean }> {
  return json(await fetch('/api/emc/planner', { cache: 'no-store' }))
}

export async function salvarConfigPlanner(cfg: ConfigPlanner, senha: string): Promise<ConfigPlanner> {
  return json(await fetch('/api/emc/planner', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-senha-emc': senha }, body: JSON.stringify(cfg),
  }))
}

export const criarTarefa = (t: Partial<Tarefa> & Pick<Tarefa, 'itemId' | 'ensaioId'>) =>
  post<{ tarefa: Tarefa }>({ acao: 'criar', ...t }).then(r => r.tarefa)

export const atualizarTarefa = (id: string, parcial: Partial<Tarefa>) =>
  post<{ tarefa: Tarefa }>({ acao: 'atualizar', ...parcial, id }).then(r => r.tarefa)

export const removerTarefa = (id: string) => post<{ ok: boolean }>({ acao: 'remover', id })

export const acaoTarefa = (id: string, acao: 'iniciar' | 'pausar' | 'concluir' | 'reabrir', pessoaId?: string) =>
  post<{ tarefa: Tarefa; tarefas: Tarefa[] }>({ acao, id, pessoaId })

export const aplicarOrganizacao = (alocacoes: Alocacao[]) =>
  post<{ tarefas: Tarefa[] }>({ acao: 'aplicar', alocacoes }).then(r => r.tarefas)
