import { NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'

const ARQUIVO = 'equipamentos.json'

// Zera as grandezas de TODOS os equipamentos (limpeza geral).
export async function POST() {
  try {
    const lista = await lerJSON<EquipamentoEMC[]>(ARQUIVO, [])
    const nova = lista.map(e => ({ ...e, grandezas: [] }))
    await escreverJSON(ARQUIVO, nova)
    return NextResponse.json({ ok: true, equipamentos: nova.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
