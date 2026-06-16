import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { Certificado } from '@/lib/certificados/tipos'
import { registrarGrandezasDoCertificado } from '@/lib/certificados/registrar-grandezas'

const ARQUIVO = 'certificados.json'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const equipId = searchParams.get('equipamentoId')
  const tag     = searchParams.get('tag')
  let lista = lerJSON<Certificado[]>(ARQUIVO, [])
  if (equipId) lista = lista.filter(c => c.equipamentoId === equipId)
  if (tag)     lista = lista.filter(c => c.equipamentoTag.toUpperCase() === tag.toUpperCase())
  return NextResponse.json(lista)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Omit<Certificado, 'id' | 'criadoEm'>
    const lista = lerJSON<Certificado[]>(ARQUIVO, [])
    const novo: Certificado = { ...body, id: Date.now().toString(), criadoEm: new Date().toISOString() }
    escreverJSON(ARQUIVO, [novo, ...lista])
    registrarGrandezasDoCertificado(novo)   // auto-cadastra as grandezas no equipamento (padrão)
    return NextResponse.json(novo, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
