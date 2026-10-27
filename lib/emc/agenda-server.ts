import { lerJSONComEstado, escreverJSON } from '@/lib/dados'
import { ARQUIVO_AGENDA_EMC, CAMPOS_TRAVADOS_EMC, type AgendaItemEmc } from '@/lib/emc/tipos'

// Agenda EMC num arquivo próprio (emc/agenda.json na pasta de cadastros), longe
// da agenda LUM/CISPR 15: PCs com versão antiga não enxergam os itens EMC, e
// as rotinas de CISPR 15 (verificar PDFs, organizar resultados) não os tocam.
//
// Cada operação lê → muda UM item → grava (escrita atômica de lib/dados), em vez
// de a tela mandar a lista inteira: dois PCs editando itens diferentes ao mesmo
// tempo não se sobrescrevem.

export class AgendaEmcIlegivel extends Error {
  constructor() { super('A agenda EMC na rede não pôde ser lida — nada foi gravado para não sobrescrever os dados.') }
}

export async function lerAgendaEmc() {
  const { dados, estado } = await lerJSONComEstado<AgendaItemEmc[]>(ARQUIVO_AGENDA_EMC, [])
  return { itens: Array.isArray(dados) ? dados : [], estado }
}

async function mudarAgendaEmc(mutar: (lista: AgendaItemEmc[]) => AgendaItemEmc[]) {
  const { itens, estado } = await lerAgendaEmc()
  if (estado === 'corrompido') throw new AgendaEmcIlegivel()
  const proxima = mutar(itens)
  await escreverJSON(ARQUIVO_AGENDA_EMC, proxima)
  return proxima
}

/** Mantém os campos de custódia já registrados (não vazios) — a tela trava, aqui garante. */
function preservarTravados(antigo: AgendaItemEmc, novo: AgendaItemEmc): AgendaItemEmc {
  const out = { ...novo } as Record<string, unknown>
  for (const k of CAMPOS_TRAVADOS_EMC) {
    const v = antigo[k]
    if (v !== undefined && String(v).trim() !== '') out[k] = v
  }
  return out as unknown as AgendaItemEmc
}

export async function criarItemEmc(item: AgendaItemEmc): Promise<AgendaItemEmc> {
  const agora = new Date().toISOString()
  const novo: AgendaItemEmc = {
    ...item,
    id: item.id || globalThis.crypto.randomUUID(),
    criadoEm: agora,
    atualizadoEm: agora,
  }
  await mudarAgendaEmc(lista => {
    if (lista.some(x => x.id === novo.id)) throw new Error('Item já existe.')
    return [...lista, novo]
  })
  return novo
}

export async function atualizarItemEmc(id: string, parcial: Partial<AgendaItemEmc>): Promise<AgendaItemEmc | undefined> {
  let salvo: AgendaItemEmc | undefined
  await mudarAgendaEmc(lista => lista.map(x => {
    if (x.id !== id) return x
    salvo = preservarTravados(x, { ...x, ...parcial, id, criadoEm: x.criadoEm, atualizadoEm: new Date().toISOString() })
    return salvo
  }))
  return salvo
}

/** Muda vários itens numa gravação só (sincronização com o Radian). `mudar`
    devolve o item novo, ou null para deixar como está. Devolve os alterados. */
export async function atualizarVariosEmc(mudar: (item: AgendaItemEmc) => AgendaItemEmc | null): Promise<AgendaItemEmc[]> {
  const alterados: AgendaItemEmc[] = []
  const { itens, estado } = await lerAgendaEmc()
  if (estado === 'corrompido') throw new AgendaEmcIlegivel()
  const agora = new Date().toISOString()
  const proxima = itens.map(x => {
    const novo = mudar(x)
    if (!novo) return x
    const salvo = preservarTravados(x, { ...novo, id: x.id, criadoEm: x.criadoEm, atualizadoEm: agora })
    alterados.push(salvo)
    return salvo
  })
  if (alterados.length) await escreverJSON(ARQUIVO_AGENDA_EMC, proxima)
  return alterados
}

export async function removerItemEmc(id: string): Promise<boolean> {
  let achou = false
  await mudarAgendaEmc(lista => lista.filter(x => (x.id === id ? ((achou = true), false) : true)))
  return achou
}
