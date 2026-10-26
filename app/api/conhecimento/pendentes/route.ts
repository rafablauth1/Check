import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import { senhaConfere } from '@/lib/emc/senha-server'
import { normalizar } from '@/lib/conhecimento/busca'
import { ARQUIVO_PENDENTES, type PerguntaPendente } from '@/lib/conhecimento/tipos'

// Perguntas que a base não soube responder ("Não achei"). Registrar é livre
// (qualquer um pergunta); tirar da lista pede a senha.

export const dynamic = 'force-dynamic'

export async function GET() {
  const lista = await lerJSON<PerguntaPendente[]>(ARQUIVO_PENDENTES, [])
  return NextResponse.json(lista.sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm)))
}

export async function POST(req: NextRequest) {
  const { pergunta } = (await req.json()) as { pergunta?: string }
  const texto = (pergunta || '').trim().slice(0, 300)
  if (!texto) return NextResponse.json({ error: 'Pergunta vazia.' }, { status: 400 })
  const agora = new Date().toISOString()
  const lista = await lerJSON<PerguntaPendente[]>(ARQUIVO_PENDENTES, [])
  const chave = normalizar(texto).replace(/\s+/g, ' ')
  const igual = lista.find(p => normalizar(p.pergunta).replace(/\s+/g, ' ') === chave)
  if (igual) { igual.vezes++; igual.ultimaEm = agora }
  else lista.push({ id: globalThis.crypto.randomUUID(), pergunta: texto, vezes: 1, criadoEm: agora, ultimaEm: agora })
  await escreverJSON(ARQUIVO_PENDENTES, lista)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await senhaConfere(req.headers.get('x-senha')))) return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  const lista = await lerJSON<PerguntaPendente[]>(ARQUIVO_PENDENTES, [])
  await escreverJSON(ARQUIVO_PENDENTES, lista.filter(p => p.id !== id))
  return NextResponse.json({ ok: true })
}
