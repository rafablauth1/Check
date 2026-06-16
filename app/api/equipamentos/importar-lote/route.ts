import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'
import type { EquipamentoEMC, GrupoId, SubgrupoId } from '@/lib/equipamentos/tipos'
import type { Certificado } from '@/lib/certificados/tipos'
import { parsearDadosPadrao, parsearMetadadosCertificado, certLabeLoValido, ehFormularioNaoCertificado } from '@/lib/certificados/parser'
import { tagValida } from '@/lib/taxonomia/tipos'
import { parsearCertificadoRBC } from '@/lib/interpolacao'
import { corrigirGrandezasPorLayout } from '@/lib/certificados/layout'
import { grandezasDoCertificado, mesclarGrandezas } from '@/lib/certificados/registrar-grandezas'
import { addM } from '@/lib/utils'

const ARQ_EQUIP = 'equipamentos.json'
const ARQ_CERT  = 'certificados.json'

interface ItemScan {
  folder: string
  certPath: string | null
  text?: string
  items?: { s: string; x: number; y: number; page?: number }[]
  error?: string
}

// Classificação automática (grupo/subgrupo) por palavras-chave do nome/descrição.
// É só um chute inicial — o usuário reclassifica depois (e a taxonomia por sigla
// da TAG vai refinar isso). Default: medidor / analisador de espectro.
function inferTipo(txt: string): { grupoId: GrupoId; subgrupoId: SubgrupoId } {
  const t = (txt || '').toLowerCase()
  const r = (g: GrupoId, s: SubgrupoId) => ({ grupoId: g, subgrupoId: s })
  // Redes de impedância / acoplamento (antes de "gerador" e "filtro" p/ evitar falso-positivo)
  if (/\blisn\b/.test(t))                                return r('redes-impedancia', 'lisn-50uh')
  if (/\blisn.*5\s*[μu]h\b|5\s*[μu]h.*lisn/.test(t))   return r('redes-impedancia', 'lisn-5uh')
  if (/coupling.*decoupling|decoupling.*network|\bcdn\b|rede.*acoplamento|acoplamento.*rede/i.test(t)) return r('redes-impedancia', 'lisn-50uh')
  if (/rede.*impedan|impedance.*network/.test(t))        return r('redes-impedancia', 'lisn-50uh')
  // Atenuação / acopladores (antes de "analisador" p/ evitar confusão)
  if (/atenuador|attenuator/.test(t))                    return r('atenuacao', 'atenuador')
  if (/acoplador|coupler|direcional|directional/.test(t)) return r('atenuacao', 'atenuador')
  if (/divisor.*pot[eê]ncia|power.*split|combiner/.test(t)) return r('atenuacao', 'atenuador')
  if (/filtro|filter/.test(t))                           return r('atenuacao', 'filtro-rf')
  // Antenas
  if (/antena.*log|log.?per[íi]od/.test(t))             return r('antenas', 'antena-log-periodica')
  if (/antena.*bic|bicon/.test(t))                       return r('antenas', 'antena-biconica')
  if (/antena.*loop|loop.*antena/.test(t))               return r('antenas', 'antena-loop')
  if (/\bantena\b|antenna/.test(t))                      return r('antenas', 'antena-log-periodica')
  // Geradores
  if (/gerador.*fun|function gen/.test(t))               return r('geradores', 'gerador-funcoes')
  if (/fonte|power supply|alimenta/.test(t))             return r('geradores', 'fonte-alimentacao-dc')
  if (/gerador|signal gen/.test(t))                      return r('geradores', 'gerador-sinal-rf')
  // Medidores
  if (/receptor|receiver|\bemi\s*receiver/.test(t))      return r('medidores', 'receptor-emi')
  if (/analisador.*espectro|spectrum.*anal/.test(t))     return r('medidores', 'analisador-espectro')
  if (/mult[íi]metro|multimeter|\bdmm\b/.test(t))        return r('medidores', 'multimetro')
  // Grandezas ambientais
  if (/term[oô]|hygro|higr[oô]|umidade|humid/.test(t))  return r('grandezas-ambientais', 'termoigrometro')
  if (/bar[ôo]metro|press[ãa]o|pressure/.test(t))        return r('grandezas-ambientais', 'barometro')
  // Default: medidor genérico (não classifica como espectro para não confundir)
  return r('medidores', 'multimetro')
}

function tagDeFolder(folder: string, dadosTag?: string): string {
  if (dadosTag) return dadosTag.toUpperCase().replace(/\s+/g, '')
  const m = folder.match(/(\d{2,6}\s*[A-Za-z]{2,5})/)
  return (m ? m[1] : folder).toUpperCase().replace(/\s+/g, '')
}

export async function POST(req: NextRequest) {
  try {
    const { itens } = (await req.json()) as { itens: ItemScan[] }
    if (!Array.isArray(itens) || !itens.length) {
      return NextResponse.json({ error: 'Nada para importar.' }, { status: 400 })
    }

    const equipamentos = lerJSON<EquipamentoEMC[]>(ARQ_EQUIP, [])
    const certificados = lerJSON<Certificado[]>(ARQ_CERT, [])
    const byTag = new Map(equipamentos.map(e => [e.tag.toUpperCase(), e]))

    const sucessos: string[] = []   // novas TAGs cadastradas
    const atualizados: string[] = [] // TAG já existia → só anexou certificado
    const pulados: { tag: string; motivo: string }[] = []  // não-LABELO
    const erros: { folder: string; motivo: string }[] = [] // sem PDF / ilegível
    const rascunhos: { folder: string; tag?: string; motivo: string }[] = [] // para aba rascunho
    const novosCerts: Certificado[] = []

    let seq = Date.now()
    const novoId = () => String(seq++)

    for (const it of itens) {
      if (it.error || !it.text) {
        erros.push({ folder: it.folder, motivo: it.error || 'PDF sem texto legível' })
        continue
      }
      // Descarta formulários (FOR 6400/6401) que não são certificados
      if (ehFormularioNaoCertificado(it.text)) {
        erros.push({ folder: it.folder, motivo: 'Documento é formulário (FOR 640x) — não é certificado' })
        continue
      }

      const dados = parsearDadosPadrao(it.text)
      const tag   = tagDeFolder(it.folder, dados.tag)

      // Só cadastra se o certificado for do LABELO; senão, avisa (cadastro manual).
      if (!/LABELO/i.test(it.text)) {
        rascunhos.push({ folder: it.folder, tag, motivo: 'Certificado não é do LABELO — cadastrar manualmente' })
        pulados.push({ tag, motivo: 'Certificado não é do LABELO — cadastrar manualmente' })
        continue
      }

      // TAG deve terminar com exatamente 3 letras
      if (!tagValida(tag)) {
        rascunhos.push({ folder: it.folder, tag, motivo: `TAG "${tag}" inválida — deve terminar com 3 letras (ex.: 3217EMC)` })
        pulados.push({ tag, motivo: `TAG inválida (sem sufixo de 3 letras)` })
        continue
      }

      const meta = parsearMetadadosCertificado(it.text)
      const rbc  = parsearCertificadoRBC(it.text)
      const pontos = it.items?.length ? corrigirGrandezasPorLayout(rbc.pontos, it.items) : rbc.pontos
      const dataEmissao = meta.dataEmissao || dados.ultimaCalibracao || ''
      const numeroCert  = meta.numero || dados.numeroCertificado || rbc.numeroCert || ''

      // Valida formato do número de certificado LABELO
      if (numeroCert && !certLabeLoValido(numeroCert)) {
        rascunhos.push({ folder: it.folder, tag, motivo: `Número "${numeroCert}" não está no formato LABELO (ex.: E1234/2024)` })
        pulados.push({ tag, motivo: `Número de certificado inválido: "${numeroCert}"` })
        continue
      }

      // Equipamento: cria se a TAG é nova; senão reaproveita o existente.
      let equip = byTag.get(tag)
      const isNovo = !equip
      if (!equip) {
        const { grupoId, subgrupoId } = inferTipo(`${dados.nome || ''} ${it.folder}`)
        const intervalo = 12
        equip = {
          id: novoId(),
          tag,
          nome: dados.nome || it.folder,
          grupoId, subgrupoId,
          status: 'ativo',
          grandezas: [],
          ultimaCalibracao: dataEmissao,
          proximaCalibracao: dataEmissao ? addM(dataEmissao, intervalo) : '',
          intervaloCalibracao: intervalo,
          fabricante: dados.fabricante,
          modelo: dados.modelo,
          serie: dados.serie,
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
        // Registra as grandezas do certificado NO equipamento, em memória.
        equip.grandezas = mesclarGrandezas(equip.grandezas, grandezasDoCertificado(cert))
      }

      if (isNovo) sucessos.push(tag)
      else atualizados.push(tag)
    }

    // Persistência em UMA escrita por arquivo (rápido mesmo com muitas TAGs).
    escreverJSON(ARQ_EQUIP, equipamentos)
    escreverJSON(ARQ_CERT, [...novosCerts, ...certificados])

    // Persiste rascunhos (adiciona aos existentes, sem duplicar por folder)
    if (rascunhos.length > 0) {
      const existentes = lerJSON<{ id: string; folder: string; tag?: string; motivo: string; criadoEm: string }[]>('rascunhos.json', [])
      const foldersExist = new Set(existentes.map(r => r.folder))
      const novos = rascunhos.filter(r => !foldersExist.has(r.folder)).map(r => ({
        ...r, id: String(Date.now() + Math.random()), criadoEm: new Date().toISOString()
      }))
      if (novos.length) escreverJSON('rascunhos.json', [...existentes, ...novos])
    }

    return NextResponse.json({
      total: itens.length,
      sucessos, atualizados, pulados, erros, rascunhos: rascunhos.length,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
