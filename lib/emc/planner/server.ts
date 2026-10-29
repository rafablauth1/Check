import { lerJSONComEstado, escreverJSON } from '@/lib/dados'
import { atualizarItemEmc, lerAgendaEmc } from '@/lib/emc/agenda-server'
import {
  ARQUIVO_CONFIG_PLANNER, ARQUIVO_TAREFAS_PLANNER, JORNADA_PADRAO,
  type ConfigPlanner, type Tarefa,
} from '@/lib/emc/planner/tipos'
import type { Alocacao } from '@/lib/emc/planner/logica'

// Planner na pasta de cadastros (rede), ao lado da agenda EMC. Como na agenda:
// cada operação lê → muda → grava (escrita atômica), e arquivo ilegível nunca é
// sobrescrito. O play/pausa usa a hora do servidor deste PC.

export class PlannerIlegivel extends Error {
  constructor() { super('O planner na rede não pôde ser lido — nada foi gravado para não sobrescrever os dados.') }
}

export const CONFIG_PLANNER_VAZIA: ConfigPlanner = { pessoas: [], setups: [], tempos: [], jornada: JORNADA_PADRAO }

export async function lerConfigPlanner() {
  const { dados, estado } = await lerJSONComEstado<ConfigPlanner>(ARQUIVO_CONFIG_PLANNER, CONFIG_PLANNER_VAZIA)
  const cfg: ConfigPlanner = {
    pessoas: Array.isArray(dados?.pessoas) ? dados.pessoas : [],
    setups: Array.isArray(dados?.setups) ? dados.setups : [],
    tempos: Array.isArray(dados?.tempos) ? dados.tempos : [],
    jornada: { ...JORNADA_PADRAO, ...(dados?.jornada ?? {}) },
    ...(dados?.atualizadoEm ? { atualizadoEm: dados.atualizadoEm } : {}),
  }
  return { cfg, estado }
}

export async function salvarConfigPlanner(cfg: ConfigPlanner): Promise<ConfigPlanner> {
  const { estado } = await lerConfigPlanner()
  if (estado === 'corrompido') throw new PlannerIlegivel()
  const limpa: ConfigPlanner = {
    pessoas: (cfg.pessoas ?? []).filter(p => p?.id && p?.nome?.trim())
      .map(p => ({ ...p, nome: p.nome.trim(), habilitacoes: Array.isArray(p.habilitacoes) ? p.habilitacoes : [] })),
    setups: (cfg.setups ?? []).filter(s => s?.id && s?.nome?.trim())
      .map(s => ({ ...s, nome: s.nome.trim(), equipamentoIds: Array.isArray(s.equipamentoIds) ? s.equipamentoIds : [] })),
    tempos: (cfg.tempos ?? []).filter(t => t?.ensaioId),
    jornada: { ...JORNADA_PADRAO, ...(cfg.jornada ?? {}) },
    atualizadoEm: new Date().toISOString(),
  }
  await escreverJSON(ARQUIVO_CONFIG_PLANNER, limpa)
  return limpa
}

export async function lerTarefas() {
  const { dados, estado } = await lerJSONComEstado<Tarefa[]>(ARQUIVO_TAREFAS_PLANNER, [])
  return { tarefas: Array.isArray(dados) ? dados : [], estado }
}

async function mudarTarefas(mutar: (lista: Tarefa[], agora: string) => Tarefa[]) {
  const { tarefas, estado } = await lerTarefas()
  if (estado === 'corrompido') throw new PlannerIlegivel()
  const proxima = mutar(tarefas, new Date().toISOString())
  await escreverJSON(ARQUIVO_TAREFAS_PLANNER, proxima)
  return proxima
}

/** Campos que a tela pode mudar direto (status e sessões só pelas ações de play/pausa). */
type Editavel = Partial<Pick<Tarefa, 'pessoaId' | 'setupId' | 'dia' | 'ordem' | 'fixada' | 'obs'>>
const editavel = (p: Editavel): Editavel => {
  const out: Editavel = {}
  for (const k of ['pessoaId', 'setupId', 'dia', 'ordem', 'fixada', 'obs'] as const) {
    if (p[k] !== undefined) (out as Record<string, unknown>)[k] = p[k]
  }
  return out
}

export async function criarTarefa(t: Pick<Tarefa, 'itemId' | 'ensaioId'> & Editavel): Promise<Tarefa> {
  let nova!: Tarefa
  await mudarTarefas((lista, agora) => {
    // um ensaio de uma amostra = uma tarefa (o que estiver aberto é reaproveitado)
    const existe = lista.find(x => x.itemId === t.itemId && x.ensaioId === t.ensaioId)
    if (existe) {
      nova = { ...existe, ...editavel(t), atualizadoEm: agora }
      return lista.map(x => x.id === existe.id ? nova : x)
    }
    nova = {
      id: globalThis.crypto.randomUUID(), itemId: t.itemId, ensaioId: t.ensaioId,
      pessoaId: '', setupId: '', dia: '', ordem: 0, status: 'afazer', sessoes: [],
      ...editavel(t), criadoEm: agora, atualizadoEm: agora,
    }
    return [...lista, nova]
  })
  return nova
}

export async function atualizarTarefa(id: string, parcial: Editavel): Promise<Tarefa | undefined> {
  let salva: Tarefa | undefined
  await mudarTarefas((lista, agora) => lista.map(x => {
    if (x.id !== id) return x
    salva = { ...x, ...editavel(parcial), atualizadoEm: agora }
    return salva
  }))
  return salva
}

export async function removerTarefa(id: string): Promise<boolean> {
  let achou = false
  await mudarTarefas(lista => lista.filter(x => (x.id === id ? ((achou = true), false) : true)))
  return achou
}

const fecharSessao = (t: Tarefa, agora: string): Tarefa => ({
  ...t, sessoes: t.sessoes.map(s => s.fim ? s : { ...s, fim: agora }),
})

/**
 * Play / pausa / concluir / reabrir. Ao dar play, outra tarefa da mesma pessoa
 * que estiver rodando é pausada (ninguém faz dois ensaios ao mesmo tempo).
 * Concluir marca o ensaio como realizado na agenda EMC, se ainda estava pendente.
 */
export async function acaoTarefa(id: string, acao: 'iniciar' | 'pausar' | 'concluir' | 'reabrir', pessoaId?: string) {
  let alvo: Tarefa | undefined
  const tarefas = await mudarTarefas((lista, agora) => {
    const t = lista.find(x => x.id === id)
    if (!t) return lista
    const quem = pessoaId || t.pessoaId
    return lista.map(x => {
      if (x.id === id) {
        let n: Tarefa = x
        if (acao === 'iniciar' && x.status !== 'execucao') {
          n = { ...x, status: 'execucao', sessoes: [...x.sessoes, { inicio: agora, ...(quem ? { pessoaId: quem } : {}) }] }
        } else if (acao === 'pausar' && x.status === 'execucao') {
          n = { ...fecharSessao(x, agora), status: 'pausada' }
        } else if (acao === 'concluir') {
          n = { ...fecharSessao(x, agora), status: 'feita', concluidaEm: agora }
        } else if (acao === 'reabrir' && x.status === 'feita') {
          const { concluidaEm: _, ...resto } = x
          n = { ...resto, status: x.sessoes.length ? 'pausada' : 'afazer' }
        }
        alvo = { ...n, atualizadoEm: agora }
        return alvo
      }
      // a mesma pessoa largou esta para começar a outra
      if (acao === 'iniciar' && quem && x.status === 'execucao' && x.sessoes.at(-1)?.pessoaId === quem) {
        return { ...fecharSessao(x, agora), status: 'pausada', atualizadoEm: agora }
      }
      return x
    })
  })
  if (alvo && acao === 'concluir') {
    const t = alvo
    const { itens } = await lerAgendaEmc()
    const item = itens.find(i => i.id === t.itemId)
    if (item?.ensaios.some(e => e.ensaioId === t.ensaioId && e.status === 'pendente')) {
      await atualizarItemEmc(item.id, {
        ensaios: item.ensaios.map(e => e.ensaioId === t.ensaioId ? { ...e, status: 'realizado', manual: true } : e),
      })
    }
  }
  return { tarefa: alvo, tarefas }
}

/** Grava a proposta do "Organizar semana" numa escrita só. */
export async function aplicarOrganizacao(alocacoes: Alocacao[]): Promise<Tarefa[]> {
  return mudarTarefas((lista, agora) => {
    const out = [...lista]
    for (const a of alocacoes) {
      const i = out.findIndex(x => (a.id && x.id === a.id) || (x.itemId === a.itemId && x.ensaioId === a.ensaioId))
      const campos = { pessoaId: a.pessoaId, setupId: a.setupId, dia: a.dia, ordem: a.ordem, atualizadoEm: agora }
      if (i >= 0) {
        if (out[i].status === 'feita') continue
        out[i] = { ...out[i], ...campos }
      } else {
        out.push({
          id: globalThis.crypto.randomUUID(), itemId: a.itemId, ensaioId: a.ensaioId,
          status: 'afazer', sessoes: [], criadoEm: agora, ...campos,
        })
      }
    }
    return out
  })
}
