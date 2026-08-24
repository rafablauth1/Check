import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { Certificado } from '@/lib/certificados/tipos'
import { registrarGrandezasDoCertificado } from '@/lib/certificados/registrar-grandezas'

const ARQUIVO = 'certificados.json'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const equipId = searchParams.get('equipamentoId')
  const tag     = searchParams.get('tag')
  let lista = await lerJSON<Certificado[]>(ARQUIVO, [])
  if (equipId) lista = lista.filter(c => c.equipamentoId === equipId)
  if (tag)     lista = lista.filter(c => c.equipamentoTag.toUpperCase() === tag.toUpperCase())
  return NextResponse.json(lista)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Omit<Certificado, 'id' | 'criadoEm'>
    const lista = await lerJSON<Certificado[]>(ARQUIVO, [])
    const novo: Certificado = { ...body, id: Date.now().toString(), criadoEm: new Date().toISOString() }
    await escreverJSON(ARQUIVO, [novo, ...lista])
    await registrarGrandezasDoCertificado(novo)   // auto-cadastra as grandezas no equipamento (padrão)
    return NextResponse.json(novo, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Exclusão em massa: { all: true } apaga todos; { ids:[...] } apaga os listados.
export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { all?: boolean; ids?: string[] }
    if (body.all) { await escreverJSON(ARQUIVO, []); return NextResponse.json({ ok: true, restantes: 0 }) }
    const set = new Set(body.ids ?? [])
    const lista = await lerJSON<Certificado[]>(ARQUIVO, [])
    const nova = lista.filter(c => !set.has(c.id))
    await escreverJSON(ARQUIVO, nova)
    return NextResponse.json({ ok: true, restantes: nova.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
