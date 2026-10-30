import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, lerJSONComEstado, escreverJSON } from '@/lib/dados'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import {
  chaveNome, formatarNome, limparTexto, padronizarNome, planejarPadronizacao, precisaRevisar,
} from '@/lib/equipamentos/nomes'
import { lerDicionarioNomes, salvarDicionarioNomes } from '@/lib/equipamentos/nomes-server'

const ARQ_EQUIP  = 'equipamentos.json'
const ARQ_GRUPOS = 'grupos.json'

interface Grupo { id: string; nome: string; subgrupos?: { id: string; nome: string }[] }

// Plano de padronização: nomes agrupados pelo nome padrão, cadastros cujo nome
// não é um tipo de equipamento (para corrigir um a um) e nomes de grupos.
export async function GET() {
  const { dados: lista, estado } = await lerJSONComEstado<EquipamentoEMC[]>(ARQ_EQUIP, [])
  if (estado === 'corrompido') return NextResponse.json({ error: 'Cadastro de equipamentos ilegível.' }, { status: 409 })
  const dic = await lerDicionarioNomes()
  const cont = new Map<string, number>()
  for (const e of lista) { const n = (e.nome || '').trim(); cont.set(n, (cont.get(n) ?? 0) + 1) }
  const propostas = planejarPadronizacao([...cont].map(([nome, qtd]) => ({ nome, qtd })), dic)
  const revisar = lista
    .filter(e => precisaRevisar(e.nome || ''))
    .map(e => ({ id: e.id, tag: e.tag, nome: e.nome || '', fabricante: e.fabricante || '', modelo: e.modelo || '' }))
  const grupos = (await lerJSON<Grupo[]>(ARQ_GRUPOS, [])).flatMap(g => [
    { grupoId: g.id, subId: '', nome: g.nome, novo: formatarNome(g.nome) },
    ...(g.subgrupos ?? []).map(s => ({ grupoId: g.id, subId: s.id, nome: s.nome, novo: formatarNome(s.nome) })),
  ]).filter(x => x.nome !== x.novo)
  // Para a tela mostrar quem são os equipamentos de cada grafia (tag/fabricante/modelo).
  const equipsPorNome: Record<string, { id: string; tag: string; fabricante: string; modelo: string }[]> = {}
  for (const e of lista) {
    const n = (e.nome || '').trim()
    ;(equipsPorNome[n] ??= []).push({ id: e.id, tag: e.tag, fabricante: e.fabricante || '', modelo: e.modelo || '' })
  }
  return NextResponse.json({
    totalEquip: lista.length, totalNomes: cont.size, propostas, revisar, grupos, equipsPorNome,
  })
}

interface Corpo {
  renomear?: { de: string[]; para: string }[]
  porId?: { id: string; nome: string }[]
  grupos?: { grupoId: string; subId: string; novo: string }[]
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Corpo
    const { dados: lista, estado } = await lerJSONComEstado<EquipamentoEMC[]>(ARQ_EQUIP, [])
    if (estado !== 'ok') return NextResponse.json({ error: 'Não consegui ler o cadastro de equipamentos — nada foi alterado.' }, { status: 409 })

    const mapa = new Map<string, string>()
    for (const r of body.renomear ?? []) {
      const para = limparTexto(r.para || '')
      if (!para) continue
      for (const d of r.de ?? []) mapa.set(d.trim(), para)
    }
    // Nome digitado na correção um a um passa pela regra (e pelos apelidos desta
    // mesma aplicação): "medidor de vazão" → "Medidor de Vazão".
    const dicAntes = await lerDicionarioNomes()
    const apelidosAgora = { ...dicAntes.apelidos }
    for (const [de, para] of mapa) apelidosAgora[chaveNome(de)] = para
    const porId = new Map((body.porId ?? []).filter(x => x.nome?.trim())
      .map(x => [x.id, padronizarNome(x.nome, { apelidos: apelidosAgora })]))

    // Cópia do cadastro antes da troca — desfazer é restaurar este arquivo.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await escreverJSON(`backups/equipamentos-antes-padronizar-${stamp}.json`, lista)

    let alterados = 0
    const nova = lista.map(e => {
      const atual = (e.nome || '').trim()
      const novo = porId.get(e.id) ?? mapa.get(atual)
      if (novo === undefined || novo === e.nome) return e
      alterados++
      return { ...e, nome: novo }
    })
    await escreverJSON(ARQ_EQUIP, nova)

    // Apelidos: cada grafia passa a virar o nome escolhido em cadastros e
    // importações futuras. Só grava o que a regra sozinha não resolveria.
    for (const [de, para] of mapa) {
      if (formatarNome(de) !== para) dicAntes.apelidos[chaveNome(de)] = para
      if (formatarNome(para) !== para) dicAntes.apelidos[chaveNome(para)] = para
    }
    await salvarDicionarioNomes(dicAntes)

    let gruposAlterados = 0
    if (body.grupos?.length) {
      const gs = await lerJSON<Grupo[]>(ARQ_GRUPOS, [])
      for (const t of body.grupos) {
        const g = gs.find(x => x.id === t.grupoId); if (!g || !t.novo?.trim()) continue
        if (!t.subId) { g.nome = t.novo.trim(); gruposAlterados++; continue }
        const s = g.subgrupos?.find(x => x.id === t.subId)
        if (s) { s.nome = t.novo.trim(); gruposAlterados++ }
      }
      if (gruposAlterados) await escreverJSON(ARQ_GRUPOS, gs)
    }

    return NextResponse.json({ ok: true, alterados, gruposAlterados, backup: `backups/equipamentos-antes-padronizar-${stamp}.json` })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
