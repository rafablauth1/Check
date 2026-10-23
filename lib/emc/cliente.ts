import type { AgendaItemEmc, ConfigEnsaiosEmc } from '@/lib/emc/tipos'

// Chamadas da tela às rotas /api/emc/* (servidor Next → pasta de cadastros na rede).

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `Erro ${res.status}`)
  return body as T
}

export async function carregarConfigEmc(): Promise<ConfigEnsaiosEmc & { corrompido?: boolean }> {
  return json(await fetch('/api/emc/config', { cache: 'no-store' }))
}

export async function salvarConfigEmc(cfg: ConfigEnsaiosEmc, senha: string): Promise<ConfigEnsaiosEmc> {
  return json(await fetch('/api/emc/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-senha-emc': senha },
    body: JSON.stringify(cfg),
  }))
}

export async function listarAgendaEmc(): Promise<{ itens: AgendaItemEmc[]; corrompido: boolean }> {
  return json(await fetch('/api/emc/agenda', { cache: 'no-store' }))
}

export async function criarItemAgendaEmc(item: AgendaItemEmc): Promise<AgendaItemEmc> {
  return json(await fetch('/api/emc/agenda', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item),
  }))
}

export async function atualizarItemAgendaEmc(id: string, parcial: Partial<AgendaItemEmc>): Promise<AgendaItemEmc> {
  return json(await fetch(`/api/emc/agenda/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parcial),
  }))
}

export async function removerItemAgendaEmc(id: string): Promise<void> {
  await json(await fetch(`/api/emc/agenda/${encodeURIComponent(id)}`, { method: 'DELETE' }))
}
