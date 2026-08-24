import { NextRequest, NextResponse } from 'next/server'
import { createRepo } from '@/lib/repo'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'

const DEFAULTS: EquipamentoEMC[] = [
  { id: '1', tag: '1528EMC', nome: 'Analisador de Espectro R&S', grupoId: 'medidores', subgrupoId: 'analisador-espectro', status: 'ativo', grandezas: [], ultimaCalibracao: '2025-12-01', proximaCalibracao: '2026-12-01', intervaloCalibracao: 12 },
  { id: '2', tag: '1196EMC', nome: 'Receptor EMI', grupoId: 'medidores', subgrupoId: 'receptor-emi', status: 'ativo', grandezas: [], ultimaCalibracao: '2025-11-01', proximaCalibracao: '2026-11-01', intervaloCalibracao: 12 },
  { id: '3', tag: '1429EMC', nome: 'LISN 50µH', grupoId: 'redes-impedancia', subgrupoId: 'lisn-50uh', status: 'ativo', grandezas: [], ultimaCalibracao: '2025-05-03', proximaCalibracao: '2026-05-03', intervaloCalibracao: 12 },
  { id: '4', tag: '1907EMC', nome: 'Antena de Loop Tripla', grupoId: 'antenas', subgrupoId: 'antena-loop', status: 'ativo', grandezas: [], ultimaCalibracao: '2025-07-22', proximaCalibracao: '2026-07-22', intervaloCalibracao: 12 },
  { id: '5', tag: '3055EMC', nome: 'Gerador de Sinal', grupoId: 'geradores', subgrupoId: 'gerador-sinal-rf', status: 'ativo', grandezas: [], ultimaCalibracao: '2025-06-14', proximaCalibracao: '2026-06-14', intervaloCalibracao: 12 },
]

const repo = createRepo<EquipamentoEMC>('equipamentos.json', DEFAULTS)

export async function GET() {
  return NextResponse.json(await repo.all())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Omit<EquipamentoEMC, 'id'>
    return NextResponse.json(await repo.create(body), { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Reatribuição em lote de grupo/subgrupo por NOME (tipo) ou por ids.
// Ex.: { nome: "Barômetro", grupoId: "grandezas-ambientais", subgrupoId: "barometro" }
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { nome?: string; ids?: string[]; grupoId?: string; subgrupoId?: string }
    if (!body.nome && !(Array.isArray(body.ids) && body.ids.length)) {
      return NextResponse.json({ error: 'Informe nome ou ids.' }, { status: 400 })
    }
    const ids = new Set(body.ids ?? [])
    let n = 0
    await repo.update(lista => lista.map(e => {
      const match = (body.nome && e.nome === body.nome) || ids.has(e.id)
      if (!match) return e
      n++
      return {
        ...e,
        grupoId:    (body.grupoId    ?? e.grupoId)    as EquipamentoEMC['grupoId'],
        subgrupoId: (body.subgrupoId ?? e.subgrupoId) as EquipamentoEMC['subgrupoId'],
      }
    }))
    return NextResponse.json({ ok: true, atualizados: n })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Exclusão em lote: { all: true } apaga todos; { ids:[...] } remove os listados.
export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { all?: boolean; ids?: string[] }
    if (body.all) { await repo.clear(); return NextResponse.json({ ok: true, removidos: 'todos' }) }
    if (!Array.isArray(body.ids) || !body.ids.length) {
      return NextResponse.json({ error: 'Informe os ids.' }, { status: 400 })
    }
    const removidos = await repo.remove(body.ids)
    return NextResponse.json({ ok: true, removidos })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
