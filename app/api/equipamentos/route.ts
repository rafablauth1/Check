import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'

const ARQUIVO = 'equipamentos.json'

const DEFAULTS: EquipamentoEMC[] = [
  { id: '1', tag: '1528EMC', nome: 'Analisador de Espectro R&S', grupoId: 'medidores', subgrupoId: 'analisador-espectro', status: 'ativo', grandezas: [], ultimaCalibracao: '2025-12-01', proximaCalibracao: '2026-12-01', intervaloCalibracao: 12 },
  { id: '2', tag: '1196EMC', nome: 'Receptor EMI', grupoId: 'medidores', subgrupoId: 'receptor-emi', status: 'ativo', grandezas: [], ultimaCalibracao: '2025-11-01', proximaCalibracao: '2026-11-01', intervaloCalibracao: 12 },
  { id: '3', tag: '1429EMC', nome: 'LISN 50µH', grupoId: 'redes-impedancia', subgrupoId: 'lisn-50uh', status: 'ativo', grandezas: [], ultimaCalibracao: '2025-05-03', proximaCalibracao: '2026-05-03', intervaloCalibracao: 12 },
  { id: '4', tag: '1907EMC', nome: 'Antena de Loop Tripla', grupoId: 'antenas', subgrupoId: 'antena-loop', status: 'ativo', grandezas: [], ultimaCalibracao: '2025-07-22', proximaCalibracao: '2026-07-22', intervaloCalibracao: 12 },
  { id: '5', tag: '3055EMC', nome: 'Gerador de Sinal', grupoId: 'geradores', subgrupoId: 'gerador-sinal-rf', status: 'ativo', grandezas: [], ultimaCalibracao: '2025-06-14', proximaCalibracao: '2026-06-14', intervaloCalibracao: 12 },
]

export async function GET(req: NextRequest) {
  const todos = lerJSON<EquipamentoEMC[]>(ARQUIVO, DEFAULTS)

  const { searchParams } = new URL(req.url)
  const busca   = searchParams.get('busca')?.toLowerCase().trim()
  const grupo   = searchParams.get('grupo')
  const status  = searchParams.get('status')
  const pagina  = parseInt(searchParams.get('pagina') || '0', 10)
  const limite  = parseInt(searchParams.get('limite') || '0', 10)

  let lista = todos

  if (busca) {
    lista = lista.filter(e =>
      e.tag.toLowerCase().includes(busca) ||
      (e.nome || '').toLowerCase().includes(busca) ||
      (e.fabricante || '').toLowerCase().includes(busca) ||
      (e.modelo || '').toLowerCase().includes(busca)
    )
  }
  if (grupo)  lista = lista.filter(e => e.grupoId === grupo)
  if (status) lista = lista.filter(e => e.status === status)

  // Paginação opcional — se limite=0 retorna tudo (compatibilidade com código existente)
  const total = lista.length
  if (limite > 0) {
    const offset = pagina * limite
    lista = lista.slice(offset, offset + limite)
    return NextResponse.json({ lista, total, pagina, limite })
  }

  return NextResponse.json(lista)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Omit<EquipamentoEMC, 'id'>
    const lista = lerJSON<EquipamentoEMC[]>(ARQUIVO, DEFAULTS)
    const novo: EquipamentoEMC = { ...body, id: Date.now().toString() }
    escreverJSON(ARQUIVO, [...lista, novo])
    return NextResponse.json(novo, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
