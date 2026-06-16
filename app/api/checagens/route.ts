import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { Checagem } from '@/lib/checagens/tipos'
import { validarChecagem } from '@/lib/checagens/validacao'

const ARQUIVO = 'checagens.json'

export async function GET() {
  return NextResponse.json(lerJSON<Checagem[]>(ARQUIVO, []))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Omit<Checagem, 'id' | 'status' | 'criadoEm'>
    const lista = lerJSON<Checagem[]>(ARQUIVO, [])
    const status = validarChecagem(body.itens ?? [], body.proximaChecagem ?? '')
    const nova: Checagem = {
      ...body,
      id: Date.now().toString(),
      status,
      criadoEm: new Date().toISOString(),
    }
    escreverJSON(ARQUIVO, [nova, ...lista])
    return NextResponse.json(nova, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
