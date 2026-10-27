import type { Documento, MetaDoc, PerguntaPendente, ResultadoBusca } from '@/lib/conhecimento/tipos'

// Chamadas da tela às rotas /api/conhecimento/*.

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `Erro ${res.status}`)
  return body as T
}
const comSenha = (senha: string) => ({ 'Content-Type': 'application/json', 'x-senha': senha })

export async function listarDocs(): Promise<MetaDoc[]> {
  return json(await fetch('/api/conhecimento', { cache: 'no-store' }))
}
export async function lerDoc(id: string): Promise<Documento> {
  return json(await fetch(`/api/conhecimento/${encodeURIComponent(id)}`, { cache: 'no-store' }))
}
export async function criarDoc(doc: Omit<Documento, 'id'>, senha: string): Promise<Documento> {
  return json(await fetch('/api/conhecimento', { method: 'POST', headers: comSenha(senha), body: JSON.stringify(doc) }))
}
export async function salvarDoc(doc: Documento, senha: string): Promise<Documento> {
  return json(await fetch(`/api/conhecimento/${encodeURIComponent(doc.id)}`, { method: 'PUT', headers: comSenha(senha), body: JSON.stringify(doc) }))
}
export async function removerDoc(id: string, senha: string): Promise<void> {
  await json(await fetch(`/api/conhecimento/${encodeURIComponent(id)}`, { method: 'DELETE', headers: comSenha(senha) }))
}
/** `docs`: só nesses documentos (ex.: o texto de uma norma, na tela de Normas). */
export async function buscarNaBase(q: string, docs?: string[]): Promise<{
  resultados: ResultadoBusca[]; semantica: boolean; documentos: number; trechos: number
}> {
  const filtro = docs?.length ? `&docs=${encodeURIComponent(docs.join(','))}` : ''
  return json(await fetch(`/api/conhecimento/buscar?q=${encodeURIComponent(q)}${filtro}`, { cache: 'no-store' }))
}
/** Carrega o modelo de busca e os vetores em segundo plano (tela abrindo). */
export function aquecerBusca(): void {
  fetch('/api/conhecimento/buscar?aquecer=1', { cache: 'no-store' }).catch(() => {})
}

export async function listarPendentes(): Promise<PerguntaPendente[]> {
  return json(await fetch('/api/conhecimento/pendentes', { cache: 'no-store' }))
}
export async function registrarPendente(pergunta: string): Promise<void> {
  await json(await fetch('/api/conhecimento/pendentes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pergunta }) }))
}
export async function removerPendente(id: string, senha: string): Promise<void> {
  await json(await fetch(`/api/conhecimento/pendentes?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: comSenha(senha) }))
}
export async function converterDocx(arquivo: File): Promise<string> {
  const fd = new FormData()
  fd.append('arquivo', arquivo)
  return (await json<{ texto: string }>(await fetch('/api/conhecimento/converter', { method: 'POST', body: fd }))).texto
}
