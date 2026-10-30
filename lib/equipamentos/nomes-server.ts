import { lerJSON, escreverJSON } from '@/lib/dados'
import { ARQUIVO_NOMES_EQUIP, padronizarNome, type DicionarioNomes } from './nomes'

export async function lerDicionarioNomes(): Promise<DicionarioNomes> {
  const d = await lerJSON<DicionarioNomes>(ARQUIVO_NOMES_EQUIP, { apelidos: {} })
  return { apelidos: d?.apelidos && typeof d.apelidos === 'object' ? d.apelidos : {}, atualizadoEm: d?.atualizadoEm }
}

export async function salvarDicionarioNomes(d: DicionarioNomes): Promise<void> {
  await escreverJSON(ARQUIVO_NOMES_EQUIP, { apelidos: d.apelidos, atualizadoEm: new Date().toISOString() })
}

/** Nome como deve ser gravado — usado em todo cadastro, edição e importação. */
export async function nomePadrao(nome: string | undefined | null): Promise<string> {
  if (!nome || !nome.trim()) return ''
  return padronizarNome(nome, await lerDicionarioNomes())
}
