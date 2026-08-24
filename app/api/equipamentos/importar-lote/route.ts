import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { EquipamentoEMC, GrupoId, SubgrupoId } from '@/lib/equipamentos/tipos'
import type { Certificado } from '@/lib/certificados/tipos'
import { parsearDadosPadrao, parsearMetadadosCertificado, classificarCertificadoLabelo, resolverTag, limparCampo, extrairGrandezasLabelo, ehAnaliseCritica, parsearAnaliseCritica } from '@/lib/certificados/parser'
import type { GrandezaMetrologica } from '@/lib/metrologia/tipos'
import { extrairMetadadosGenerico, extrairAcreditacao, extrairNomeLaboratorio, identificarLaboratorio, overrideDoLab } from '@/lib/certificados/extrair-generico'
import { lerLaboratorios, salvarLaboratorios, nomeDoLab, registrarLab } from '@/lib/laboratorios/registro'
import { parsearCertificadoRBC } from '@/lib/interpolacao'
import { corrigirGrandezasPorLayout } from '@/lib/certificados/layout'
import { grandezasDoCertificado, mesclarGrandezas } from '@/lib/certificados/registrar-grandezas'
import { addM, dmyParaISO } from '@/lib/utils'
import { siglaOficial } from '@/lib/taxonomia/tipos'

const ARQ_EQUIP    = 'equipamentos.json'
const ARQ_CERT     = 'certificados.json'
const ARQ_RASCUNHO = 'rascunho-equipamentos.json'

interface RascunhoItem {
  tag: string; folder: string; motivo: string; certPath?: string; em: string
  lab?: string; acreditacao?: string; equipamento?: string; cadastravel?: boolean
}


interface ItemScan {
  folder: string
  certPath: string | null
  text?: string
  acText?: string   // texto do FOR 6401 (análise crítica), quando é um PDF separado do certificado
  items?: { s: string; x: number; y: number; page?: number }[]
  error?: string
  forcarRascunho?: boolean   // pasta parada há +7 anos → mandar pro rascunho (não cadastrar)
}

// Classificação automática (grupo/subgrupo) por palavras-chave do nome/descrição.
// É só um chute inicial — o usuário reclassifica depois (e a taxonomia por sigla
// da TAG vai refinar isso). Default: medidor / analisador de espectro.
function inferTipo(txt: string): { grupoId: GrupoId; subgrupoId: SubgrupoId } {
  const t = (txt || '').toLowerCase()
  const r = (g: GrupoId, s: SubgrupoId) => ({ grupoId: g, subgrupoId: s })
  if (/gerador.*fun|function gen/.test(t))               return r('geradores', 'gerador-funcoes')
  if (/fonte|power supply|alimenta/.test(t))             return r('geradores', 'fonte-alimentacao-dc')
  if (/gerador|signal gen|sinal/.test(t))                return r('geradores', 'gerador-sinal-rf')
  if (/receptor|receiver|\bemi\b/.test(t))               return r('medidores', 'receptor-emi')
  if (/analisador.*espectro|spectrum/.test(t))           return r('medidores', 'analisador-espectro')
  if (/mult[íi]metro|multimeter|dmm/.test(t))            return r('medidores', 'multimetro')
  if (/lisn|rede.*impedan|impedance/.test(t))            return r('redes-impedancia', 'lisn-50uh')
  if (/antena.*log|log.?per[íi]od/.test(t))              return r('antenas', 'antena-log-periodica')
  if (/antena.*bic|bicon/.test(t))                       return r('antenas', 'antena-biconica')
  if (/antena.*loop|loop/.test(t))                       return r('antenas', 'antena-loop')
  if (/antena/.test(t))                                  return r('antenas', 'antena-log-periodica')
  if (/atenuador|attenuator/.test(t))                    return r('atenuacao', 'atenuador')
  if (/filtro|filter/.test(t))                           return r('atenuacao', 'filtro-rf')
  if (/term[oô]|hygro|higr[oô]|umidade|humid/.test(t))   return r('grandezas-ambientais', 'termoigrometro')
  if (/bar[ôo]metro|press[ãa]o|pressure/.test(t))        return r('grandezas-ambientais', 'barometro')
  return r('medidores', 'analisador-espectro')
}

export async function GET() {
  return NextResponse.json(await lerJSON<RascunhoItem[]>(ARQ_RASCUNHO, []))
}

// Limpa o rascunho: body { all: true } apaga tudo; { folders: [...] } apaga os listados.
export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { all?: boolean; folders?: string[] }
    if (body.all) { await escreverJSON(ARQ_RASCUNHO, []); return NextResponse.json({ ok: true, restantes: 0 }) }
    const alvo = new Set(body.folders ?? [])
    const prev = await lerJSON<RascunhoItem[]>(ARQ_RASCUNHO, [])
    const nova = prev.filter(r => !alvo.has(r.folder) && !alvo.has(r.tag))
    await escreverJSON(ARQ_RASCUNHO, nova)
    return NextResponse.json({ ok: true, restantes: nova.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { itens, modo } = (await req.json()) as { itens: ItemScan[]; modo?: 'certificado' | 'amostra' }
    if (!Array.isArray(itens) || !itens.length) {
      return NextResponse.json({ error: 'Nada para importar.' }, { status: 400 })
    }
    const soAmostra = modo === 'amostra'   // 2ª varredura: cadastra só os dados da amostra (sem cert/grandeza)

    const equipamentos = await lerJSON<EquipamentoEMC[]>(ARQ_EQUIP, [])
    const certificados = await lerJSON<Certificado[]>(ARQ_CERT, [])
    const byTag = new Map(equipamentos.map(e => [e.tag.toUpperCase(), e]))

    const sucessos: string[] = []   // novas TAGs cadastradas
    const atualizados: string[] = [] // TAG já existia → só anexou certificado
    const pulados: { tag: string; motivo: string }[] = []  // não-LABELO / inválido → rascunho
    const erros: { folder: string; motivo: string }[] = [] // sem PDF / ilegível
    const novosCerts: Certificado[] = []
    const rascunho: RascunhoItem[] = []
    const foldersOk = new Set<string>()   // pastas cadastradas nesta rodada (limpa do rascunho)
    const labs = await lerLaboratorios()  // registro CAL → laboratório (auto-descoberta)
    let labsMudou = false
    const agora = new Date().toISOString()
    // Modelo de extração do lab (rótulos por campo) p/ o CAL do certificado — Parte B.
    // overrideDoLab() é compartilhada com o escaneio individual (app/(lab)/equipamentos/novo/page.tsx).

    let seq = Date.now()
    const novoId = () => String(seq++)

    for (const it of itens) {
      // #3.2: pasta parada há +7 anos (provável fora de uso) → rascunho, não cadastra.
      if (it.forcarRascunho) {
        const motivo = 'Parado há +7 anos sem alteração na pasta (provável fora de uso)'
        pulados.push({ tag: it.folder, motivo })
        rascunho.push({ tag: it.folder, folder: it.folder, motivo, certPath: it.certPath || undefined, em: agora, cadastravel: true })
        continue
      }
      if (it.error || !it.text) {
        // Sem PDF/texto: provável escaneado ou pasta vazia → não dá pra cadastrar.
        const motivo = it.certPath ? (it.error || 'PDF sem texto (provável escaneado)') : 'Sem PDF na pasta'
        erros.push({ folder: it.folder, motivo })
        rascunho.push({ tag: '', folder: it.folder, motivo, certPath: it.certPath || undefined, em: agora, cadastravel: false })
        continue
      }
      const dados = parsearDadosPadrao(it.text)
      // TAG solta no texto (último recurso). Só conta se a trinca for SIGLA OFICIAL
      // de laboratório (senão é lixo tipo "623ISO"). Radar de cadastrável = achou uma.
      const tagSolta = (() => {
        for (const m of it.text.matchAll(/\b(\d{2,4})\s*([A-Za-z]{3})\b/g)) {
          if (siglaOficial(m[2])) return (m[1] + m[2]).toUpperCase()
        }
        return ''
      })()
      const temPadraoTag = !!tagSolta

      // FOR 6401 (análise crítica), quando é um PDF separado do certificado na
      // mesma pasta — conferência MANUAL, então serve de reforço/prioridade pra
      // TAG, nome do instrumento, nº do certificado, data e a PERIODICIDADE.
      const ac = it.acText && ehAnaliseCritica(it.acText) ? parsearAnaliseCritica(it.acText) : null

      // TAG: vem do certificado (tem a sigla); FOR 6401 é reforço; pasta é só reserva.
      const tag = ac?.tag || resolverTag(it.folder, dados.tag, it.text)

      // 2ª VARREDURA (modo amostra): cadastra SÓ o equipamento pelos dados da folha
      // (ex.: análise crítica / cert. de terceiros), sem certificado e sem grandeza.
      // Usa extração de TAG mais flexível (rótulos genéricos + padrão solto).
      if (soAmostra) {
        const g = extrairMetadadosGenerico(it.text, overrideDoLab(labs, it.text))
        // #3: se o PDF é um FOR 6401 (análise crítica) — o próprio it.text ou um
        // PDF separado na mesma pasta (it.acText) — usa os dados dele: nome
        // correto, fornecedor (lab), nº do certificado, data e PERIODICIDADE.
        const acFonte = it.acText || it.text
        const ac = ehAnaliseCritica(acFonte) ? parsearAnaliseCritica(acFonte) : null
        const tagA = ac?.tag || tag || resolverTag(it.folder, g.tag, it.text) || tagSolta
        if (!tagA) {
          const motivo = 'Sem TAG identificável (nem pelos dados da amostra)'
          pulados.push({ tag: it.folder, motivo })
          rascunho.push({ tag: it.folder, folder: it.folder, motivo, certPath: it.certPath || undefined, em: agora, cadastravel: false })
          continue
        }
        const nomeA = limparCampo(ac?.nome || g.nome || dados.nome, 80) || ''
        const dcal = (ac?.dataCertificado || g.dataCalibracao || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
        const isoCal = dcal ? `${dcal[3]}-${dcal[2]}-${dcal[1]}` : (dados.ultimaCalibracao || '')
        const intervalo = ac?.periodicidadeMeses || 12
        // já existe: atualiza periodicidade se esta análise crítica for MAIS RECENTE.
        if (byTag.has(tagA)) {
          foldersOk.add(it.folder)
          const ex = byTag.get(tagA)!
          if (ac?.periodicidadeMeses && ac.dataAnalise && (!ex.obs?.includes(ac.dataAnalise))) {
            ex.intervaloCalibracao = intervalo
            if (ex.ultimaCalibracao) ex.proximaCalibracao = addM(ex.ultimaCalibracao, intervalo)
            ex.obs = `Periodicidade pela análise crítica de ${ac.dataAnalise} (${intervalo} meses)`
          }
          atualizados.push(tagA); continue
        }
        // Cadastra mesmo SEM nome (desde que tenha TAG) — o nome fica vazio
        // ("sem nome" na lista) pra você preencher, ou é corrigido pela análise
        // crítica depois. Assim os outros labs identificados não ficam de fora.
        foldersOk.add(it.folder)
        const { grupoId, subgrupoId } = inferTipo(`${nomeA} ${it.folder}`)
        const equipA: EquipamentoEMC = {
          id: novoId(), tag: tagA,
          nome: nomeA,
          grupoId, subgrupoId, status: 'ativo', grandezas: [],
          ultimaCalibracao: isoCal, proximaCalibracao: isoCal ? addM(isoCal, intervalo) : '', intervaloCalibracao: intervalo,
          fabricante: limparCampo(g.fabricante || dados.fabricante, 50),
          modelo: limparCampo(g.modelo || dados.modelo, 40),
          serie: limparCampo(g.serie || dados.serie, 30),
          labCalibracao: ac?.fornecedor || g.laboratorio,
          numeroCertificado: ac?.certificado || undefined,
          obs: ac
            ? `Cadastrado pela análise crítica (FOR 6401)${ac.dataAnalise ? ' de ' + ac.dataAnalise : ''}`
            : 'Cadastrado pela 2ª varredura (dados da amostra, sem certificado)',
        }
        equipamentos.push(equipA); byTag.set(tagA, equipA)
        sucessos.push(tagA)
        continue
      }

      if (!tag) {
        const motivo = 'TAG não encontrada (padrão 1234ABC ausente no certificado)'
        pulados.push({ tag: it.folder, motivo })
        rascunho.push({ tag: it.folder, folder: it.folder, motivo, certPath: it.certPath || undefined, em: agora, cadastravel: temPadraoTag })
        continue
      }

      // Só cadastra se for MESMO certificado do LABELO (nº no padrão, não-formulário).
      const classif = classificarCertificadoLabelo(it.text)
      if (!classif.ok) {
        // Identifica o laboratório emissor pelo CAL (registro) + nome do texto.
        const g = extrairMetadadosGenerico(it.text, overrideDoLab(labs, it.text))
        const nomeGuess = nomeDoLab(labs, g.acreditacao) || extrairNomeLaboratorio(it.text)
        if (g.acreditacao && registrarLab(labs, g.acreditacao, nomeGuess)) labsMudou = true
        const labTxt = nomeGuess || (g.acreditacao ? `Lab ${g.acreditacao}` : '')
        const motivo = labTxt
          ? `Outro laboratório — ${labTxt}`
          : (classif.motivo || 'Não é certificado do LABELO')
        pulados.push({ tag, motivo })
        rascunho.push({
          tag, folder: it.folder, motivo, certPath: it.certPath || undefined, em: agora,
          lab: nomeGuess, acreditacao: g.acreditacao, equipamento: g.nome, cadastravel: true,
        })
        continue
      }

      const meta = parsearMetadadosCertificado(it.text)
      const rbc  = parsearCertificadoRBC(it.text)
      const pontos = it.items?.length ? corrigirGrandezasPorLayout(rbc.pontos, it.items) : rbc.pontos
      // ac (FOR 6401, se houver) já resolvido acima — usado aqui pra data, nome,
      // nº do certificado e periodicidade, com prioridade sobre o OCR do certificado.
      const dataEmissao = dmyParaISO(ac?.dataCertificado) || meta.dataEmissao || dados.ultimaCalibracao || ''
      // Nº do certificado: o padrão LABELO validado (regex forte) vem 1º; FOR 6401
      // (conferência manual) 2º; o resto do OCR só como último fallback.
      const numeroCert  = classif.numero || ac?.certificado || meta.numero || dados.numeroCertificado || ''

      // Equipamento: cria se a TAG é nova; senão reaproveita o existente.
      let equip = byTag.get(tag)
      const isNovo = !equip
      if (!equip) {
        const { grupoId, subgrupoId } = inferTipo(`${ac?.nome || dados.nome || ''} ${it.folder}`)
        const intervalo = ac?.periodicidadeMeses || 12
        equip = {
          id: novoId(),
          // nome NUNCA = TAG; vazio sinaliza "preencher". FOR 6401 é autoritativo
          // (conferido manualmente, sem erro de OCR) — tem prioridade.
          tag,
          nome: limparCampo(ac?.nome || dados.nome, 80) || '',
          grupoId, subgrupoId,
          status: 'ativo',
          grandezas: [],
          ultimaCalibracao: dataEmissao,
          proximaCalibracao: dataEmissao ? addM(dataEmissao, intervalo) : '',
          intervaloCalibracao: intervalo,
          fabricante: limparCampo(dados.fabricante, 50),
          modelo: limparCampo(dados.modelo, 40),
          serie: limparCampo(dados.serie, 30),
          labCalibracao: 'LABELO/PUCRS',
          numeroCertificado: numeroCert,
          procedimentos: dados.procedimentos,
        }
        equipamentos.push(equip)
        byTag.set(tag, equip)
      }

      // Evita certificado duplicado (mesmo número no mesmo equipamento).
      const jaTem = [...certificados, ...novosCerts].some(
        c => c.equipamentoId === equip!.id && numeroCert && c.numero === numeroCert,
      )
      if (!jaTem && pontos.length) {
        const cert: Certificado = {
          id: novoId(),
          equipamentoId: equip.id,
          equipamentoTag: tag,
          numero: numeroCert,
          laboratorio: meta.laboratorio || 'LABELO/PUCRS',
          acreditacao: extrairAcreditacao(it.text),
          dataEmissao,
          dataValidade: dataEmissao ? addM(dataEmissao, equip.intervaloCalibracao || 12) : undefined,
          itens: [],
          grade2D: {
            eixo1Nome: rbc.eixo1Nome, eixo1Unidade: rbc.eixo1Unidade,
            eixo2Nome: rbc.eixo2Nome, eixo2Unidade: rbc.eixo2Unidade,
            pontos,
          },
          pdfPath: it.certPath || undefined,
          pdfNome: it.certPath ? it.certPath.split(/[\\/]/).pop() : undefined,
          criadoEm: new Date().toISOString(),
        }
        novosCerts.push(cert)
        // Grandezas do LABELO: títulos de seção (autoritativos, antes de "Parâmetro:")
        // + as derivadas dos pontos da tabela. Registra no equipamento, em memória.
        const titulosGrand = extrairGrandezasLabelo(it.text).map((nome): GrandezaMetrologica => ({
          id: novoId(), nome, simbolo: '', unidade: '', faixaMin: 0, faixaMax: 0, resolucao: '', incertezaExpandida: '', fatorCobertura: 2,
        }))
        equip.grandezas = mesclarGrandezas(equip.grandezas, [...titulosGrand, ...grandezasDoCertificado(cert)])
      }

      foldersOk.add(it.folder)
      if (isNovo) sucessos.push(tag)
      else atualizados.push(tag)
    }

    // Persistência em UMA escrita por arquivo (rápido mesmo com muitas TAGs).
    await escreverJSON(ARQ_EQUIP, equipamentos)
    await escreverJSON(ARQ_CERT, [...novosCerts, ...certificados])
    if (labsMudou) await salvarLaboratorios(labs)   // novos laboratórios descobertos

    // Rascunho: acumula as não-cadastradas (dedupe por folder), e remove as que
    // acabaram de ser cadastradas com sucesso.
    if (rascunho.length || foldersOk.size) {
      const prev = await lerJSON<RascunhoItem[]>(ARQ_RASCUNHO, [])
      const cadastradas = new Set([...sucessos, ...atualizados])
      const map = new Map<string, RascunhoItem>()
      for (const r of [...prev, ...rascunho]) {
        if (cadastradas.has(r.tag) || foldersOk.has(r.folder)) continue   // já cadastrada
        map.set(r.folder || r.tag, r)
      }
      await escreverJSON(ARQ_RASCUNHO, [...map.values()])
    }

    return NextResponse.json({
      total: itens.length,
      sucessos, atualizados, pulados, erros,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
