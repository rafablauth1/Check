import { lerJSON, escreverJSON } from '@/lib/dados'

// Repositório genérico de uma coleção (array de itens com `id`) sobre um arquivo
// JSON. Centraliza o ciclo ler→mutar→gravar (que estava copiado em cada rota) e
// usa a escrita atômica (assíncrona) de lib/dados.ts por baixo. A API HTTP das
// rotas não muda — só os call sites precisam de `await` agora.

export interface Repo<T extends { id: string }> {
  /** Lista completa (com os defaults se o arquivo não existir). */
  all(): Promise<T[]>
  /** Busca por id. */
  byId(id: string): Promise<T | undefined>
  /** Transação: lê, aplica o mutator e grava (atômico). É a primitiva. */
  update(mutator: (lista: T[]) => T[]): Promise<T[]>
  /** Cria um item gerando id único; devolve o item criado. */
  create(item: Omit<T, 'id'>): Promise<T>
  /** Edita um item por id; devolve o atualizado ou undefined se não achar. */
  patch(id: string, partial: Partial<Omit<T, 'id'>>): Promise<T | undefined>
  /** Remove os ids informados; devolve quantos saíram. */
  remove(ids: string[]): Promise<number>
  /** Esvazia a coleção. */
  clear(): Promise<void>
}

/** UUID quando disponível (evita colisão de Date.now() em lote/multiusuário). */
function novoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createRepo<T extends { id: string }>(arquivo: string, defaults: T[] = []): Repo<T> {
  const ler = () => lerJSON<T[]>(arquivo, defaults)

  async function update(mutator: (lista: T[]) => T[]): Promise<T[]> {
    const proxima = mutator(await ler())
    await escreverJSON(arquivo, proxima)
    return proxima
  }

  return {
    all: ler,
    byId: async (id) => (await ler()).find((x) => x.id === id),
    update,
    async create(item) {
      const novo = { ...(item as object), id: novoId() } as T
      await update((lista) => [...lista, novo])
      return novo
    },
    async patch(id, partial) {
      let achou: T | undefined
      await update((lista) => lista.map((x) => {
        if (x.id !== id) return x
        achou = { ...x, ...partial, id: x.id } as T
        return achou
      }))
      return achou
    },
    async remove(ids) {
      const set = new Set(ids)
      let n = 0
      await update((lista) => lista.filter((x) => (set.has(x.id) ? (n++, false) : true)))
      return n
    },
    async clear() { await update(() => []) },
  }
}
