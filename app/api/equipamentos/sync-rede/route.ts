import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { EquipamentoEMC, GrupoId, SubgrupoId } from '@/lib/equipamentos/tipos'
import { tagValida } from '@/lib/taxonomia/tipos'
import { addM } from '@/lib/utils'

const ARQ_EQUIP = 'equipamentos.json'

interface ItemScan {
  folder: string
  pasta: string
  certPath: string | null
}

// Extrai TAG do nome da pasta (mesmo critério do importar-lote)
function tagDeFolder(folder: string): string {
  const m = folder.match(/(\d{2,6}\s*[A-Za-z]{2,5})/)
  return (m ? m[1] : folder).toUpperCase().replace(/\s+/g, '')
}

// Inferência básica de tipo pelo nome da pasta
function inferTipo(txt: string): { grupoId: GrupoId; subgrupoId: SubgrupoId } {
  const t = (txt || '').toLowerCase()
  const r = (g: GrupoId, s: SubgrupoId) => ({ grupoId: g, subgrupoId: s })
  if (/\blisn\b/.test(t))                   return r('redes-impedancia', 'lisn-50uh')
  if (/\bcdn\b|coupling.*decoupling|rede.*acoplamento/i.test(t)) return r('redes-impedancia', 'lisn-50uh')
  if (/atenuador|attenuator/.test(t))        return r('atenuacao', 'atenuador')
  if (/acoplador|coupler|direcional/.test(t)) return r('atenuacao', 'atenuador')
  if (/filtro|filter/.test(t))               return r('atenuacao', 'filtro-rf')
  if (/antena.*log|log.?per/.test(t))        return r('antenas', 'antena-log-periodica')
  if (/antena.*bic|bicon/.test(t))           return r('antenas', 'antena-biconica')
  if (/antena.*loop|loop/.test(t))           return r('antenas', 'antena-loop')
  if (/\bantena\b|antenna/.test(t))          return r('antenas', 'antena-log-periodica')
  if (/gerador|signal gen/.test(t))          return r('geradores', 'gerador-sinal-rf')
  if (/fonte|power supply/.test(t))          return r('geradores', 'fonte-alimentacao-dc')
  if (/receptor|receiver|\bemi\s*receiver/.test(t)) return r('medidores', 'receptor-emi')
  if (/analisador.*espectro|spectrum.*anal/.test(t)) return r('medidores', 'analisador-espectro')
  if (/term[oô]|hygro|umidade|humid/.test(t)) return r('grandezas-ambientais', 'termoigrometro')
  return r('medidores', 'multimetro')
}

export async function POST(req: NextRequest) {
  try {
    const { itens } = (await req.json()) as { itens: ItemScan[] }
    if (!Array.isArray(itens) || !itens.length)
      return NextResponse.json({ error: 'Nada para sincronizar.' }, { status: 400 })

    const equipamentos = lerJSON<EquipamentoEMC[]>(ARQ_EQUIP, [])
    const byTag = new Map(equipamentos.map(e => [e.tag.toUpperCase(), e]))

    let novos = 0, atualizados = 0, ignorados = 0
    let seq = Date.now()

    for (const it of itens) {
      const tag = tagDeFolder(it.folder)
      if (!tagValida(tag)) { ignorados++; continue }

      const existente = byTag.get(tag)

      if (existente) {
        // Já cadastrado — apenas atualiza pastaRede e certsPendentes se o PDF é novo
        existente.pastaRede = existente.pastaRede || it.pasta
        if (it.certPath) {
          const pendentes = existente.certsPendentes || []
          if (!pendentes.includes(it.certPath)) {
            existente.certsPendentes = [...pendentes, it.certPath]
          }
        }
        atualizados++
      } else {
        // Novo equipamento — skeleton mínimo, sem dados de calibração ainda
        const { grupoId, subgrupoId } = inferTipo(it.folder)
        const novo: EquipamentoEMC = {
          id: String(seq++),
          tag,
          nome: it.folder,
          grupoId, subgrupoId,
          status: 'ativo',
          grandezas: [],
          ultimaCalibracao: '',
          proximaCalibracao: '',
          intervaloCalibracao: 12,
          pastaRede: it.pasta,
          certsPendentes: it.certPath ? [it.certPath] : [],
        }
        equipamentos.push(novo)
        byTag.set(tag, novo)
        novos++
      }
    }

    escreverJSON(ARQ_EQUIP, equipamentos)

    return NextResponse.json({ total: itens.length, novos, atualizados, ignorados })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
