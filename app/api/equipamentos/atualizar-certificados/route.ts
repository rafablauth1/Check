import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import {
  parsearDadosPadrao, parsearMetadadosCertificado, resolverTag,
  ehAnaliseCritica, parsearAnaliseCritica,
} from '@/lib/certificados/parser'
import { addM, dmyParaISO } from '@/lib/utils'

// Evita pré-renderização estática (senão o POST daria 405 no app empacotado).
export const dynamic = 'force-dynamic'

const ARQ = 'equipamentos.json'

// `acText` = texto do FOR 6401 (análise crítica), quando a pasta tem um SEPARADO
// do certificado — sem isso, uma pasta com os dois PDFs só devolvia o texto do
// certificado e os dados do FOR 6401 nunca eram lidos (ver electron/main.js).
interface ItemScan { folder: string; text?: string; acText?: string; certPath?: string | null }

// SOMENTE ATUALIZA equipamentos existentes quando aparece um certificado/análise
// crítica MAIS NOVO na pasta. Nunca cria, apaga ou toca em qualquer arquivo da
// pasta-mãe — recebe o texto já lido (a varredura é read-only no Electron).
export async function POST(req: NextRequest) {
  try {
    const { itens } = (await req.json()) as { itens?: ItemScan[] }
    if (!Array.isArray(itens)) return NextResponse.json({ error: 'Informe itens.' }, { status: 400 })

    const lista = await lerJSON<EquipamentoEMC[]>(ARQ, [])
    const byTag = new Map(lista.map(e => [e.tag.toUpperCase(), e]))
    const atualizados: { tag: string; oque: string; de: string; para: string }[] = []
    let mudou = false

    for (const it of itens) {
      const text = it.text || ''
      const acTexto = it.acText || text   // FOR 6401 separado, senão tenta o próprio texto
      if (!text.trim() && !acTexto.trim()) continue

      const ac = ehAnaliseCritica(acTexto) ? parsearAnaliseCritica(acTexto) : null
      const dados = parsearDadosPadrao(text)
      const meta = parsearMetadadosCertificado(text)
      const tag = (ac?.tag || resolverTag(it.folder, dados.tag, text) || '').toUpperCase()
      if (!tag) continue

      const eq = byTag.get(tag)
      if (!eq) continue   // NUNCA cria — só atualiza existente

      // 1) Análise crítica mais nova → periodicidade (recalcula próxima calibração).
      if (ac?.periodicidadeMeses && ac.dataAnalise && !(eq.obs ?? '').includes(ac.dataAnalise)) {
        const antes = `${eq.intervaloCalibracao} meses`
        eq.intervaloCalibracao = ac.periodicidadeMeses
        if (eq.ultimaCalibracao) eq.proximaCalibracao = addM(eq.ultimaCalibracao, ac.periodicidadeMeses)
        eq.obs = `Periodicidade pela análise crítica de ${ac.dataAnalise} (${ac.periodicidadeMeses} meses)`
        atualizados.push({ tag, oque: 'periodicidade', de: antes, para: `${ac.periodicidadeMeses} meses` })
        mudou = true
      }

      // 1b) Nome do instrumento na análise crítica é conferido manualmente no FOR
      // 6401 (autoritativo — sem erro de OCR) → corrige o nome se vier diferente.
      if (ac?.nome && ac.nome.trim() && ac.nome.trim() !== eq.nome) {
        const antes = eq.nome || '—'
        eq.nome = ac.nome.trim()
        atualizados.push({ tag, oque: 'nome', de: antes, para: eq.nome })
        mudou = true
      }

      // 2) Certificado mais novo → última/próxima calibração + nº do certificado.
      // O FOR 6401 (ac) é uma conferência manual do certificado → tem prioridade
      // sobre o que o OCR extraiu direto do PDF do certificado.
      const novaCal = dmyParaISO(ac?.dataCertificado || meta.dataEmissao || dados.ultimaCalibracao)
      if (novaCal && (!eq.ultimaCalibracao || novaCal > eq.ultimaCalibracao)) {
        const antes = eq.ultimaCalibracao || '—'
        eq.ultimaCalibracao = novaCal
        eq.proximaCalibracao = addM(novaCal, eq.intervaloCalibracao || 12)
        const num = ac?.certificado || meta.numero || dados.numeroCertificado
        if (num) eq.numeroCertificado = num
        if (eq.status === 'calibrar' || eq.status === 'calibrar-antes-uso') eq.status = 'ativo'
        atualizados.push({ tag, oque: 'calibração', de: antes, para: novaCal })
        mudou = true
      }
    }

    if (mudou) await escreverJSON(ARQ, lista)
    return NextResponse.json({ ok: true, atualizados, total: atualizados.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
