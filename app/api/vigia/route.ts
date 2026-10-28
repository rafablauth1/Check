import { NextRequest, NextResponse } from 'next/server'
import {
  lerConfigBruta, salvarConfig, carregarPerfis, salvarPerfis, salvarArquivo, lerVigiaOriginal, pastaVigia,
  ORIGEM_VIGIA_PADRAO, escreverRel, lerRel, existeRel, ensaiosIncompletos, abrirPasta, caminhoRel, resultDir,
  compartilhada, lerRegistroAberto, vigiaAberto,
} from '@/lib/vigia/server'
import { gerarResultadoXlsx } from '@/lib/vigia/excel'
import { completarPerfis } from '@/lib/vigia/emc'

// VIGIA-7S no app.
// GET                         → { config (bruta, o cliente mescla com o padrão), perfis, pasta, compartilhada, origem }
// PUT  { config? , perfis? }  → grava config.json / perfis_emc.json
// POST { acao: 'foto', nome, png, sub? }      → grava em resultados/
// POST { acao: 'importar', pasta? }           → copia a calibração do VIGIA-7S original (só lê o original)
// POST { acao: 'registro' }                   → registro FOR EMC38 aberto no VIGIA (só leitura)

export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function GET() {
  const [config, perfis, orig] = await Promise.all([lerConfigBruta(), carregarPerfis(), lerVigiaOriginal()])
  return NextResponse.json({ config, perfis, pasta: pastaVigia(), compartilhada: compartilhada(), origem: { pasta: orig.pasta, existe: !!orig.config } })
}

export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return erro('Corpo inválido')
  if (b.config !== undefined) {
    if (typeof b.config !== 'object' || Array.isArray(b.config)) return erro('config inválida')
    await salvarConfig(b.config)
  }
  if (b.perfis !== undefined) {
    if (typeof b.perfis !== 'object' || Array.isArray(b.perfis)) return erro('perfis inválidos')
    await salvarPerfis(b.perfis)
  }
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== 'object') return erro('Corpo inválido')
  try {
    if (b.acao === 'foto') {
      if (typeof b.nome !== 'string' || typeof b.png !== 'string') return erro('Foto inválida')
      return NextResponse.json({ caminho: await salvarArquivo(b.nome, Buffer.from(b.png, 'base64'), typeof b.sub === 'string' ? b.sub : '') })
    }
    if (b.acao === 'texto') {
      if (typeof b.nome !== 'string' || typeof b.conteudo !== 'string') return erro('Texto inválido')
      return NextResponse.json({ caminho: await salvarArquivo(b.nome, Buffer.from(b.conteudo, 'utf-8'), typeof b.sub === 'string' ? b.sub : '') })
    }
    // pasta do ensaio (caminhos relativos a resultados/)
    if (b.acao === 'escrever') {
      const dados = typeof b.base64 === 'string' ? Buffer.from(b.base64, 'base64') : Buffer.from(String(b.texto ?? ''), 'utf-8')
      const cab = typeof b.cabecalho === 'string' ? Buffer.from(b.cabecalho, 'utf-8') : undefined
      return NextResponse.json({ caminho: await escreverRel(String(b.rel), dados, { acrescentar: !!b.acrescentar, cabecalho: cab, atomico: !!b.atomico }) })
    }
    if (b.acao === 'ler') {
      const d = await lerRel(String(b.rel))
      return NextResponse.json({ texto: d ? d.toString(b.binario ? 'base64' : 'utf-8') : null })
    }
    if (b.acao === 'existe') return NextResponse.json({ existe: await existeRel(String(b.rel)), caminho: caminhoRel(String(b.rel)) })
    if (b.acao === 'ensaios') {
      const [itens, vigia_aberto] = await Promise.all([ensaiosIncompletos(), vigiaAberto()])
      return NextResponse.json({ itens, base: resultDir(), vigia_aberto })
    }
    if (b.acao === 'abrir') return NextResponse.json({ caminho: await abrirPasta(String(b.rel ?? '')) })
    if (b.acao === 'excel') return NextResponse.json({ caminho: await gerarResultadoXlsx(String(b.rel), b.dados) })
    if (b.acao === 'registro') return NextResponse.json({ registro: await lerRegistroAberto() })
    if (b.acao === 'importar') {
      const orig = await lerVigiaOriginal(typeof b.pasta === 'string' && b.pasta ? b.pasta : ORIGEM_VIGIA_PADRAO)
      if (!orig.config) return erro(`Não encontrei config.json do VIGIA-7S em "${orig.pasta}".`, 404)
      await salvarConfig(orig.config)
      if (orig.perfis) await salvarPerfis(completarPerfis(orig.perfis).perfis)
      return NextResponse.json({ ok: true, pasta: orig.pasta, perfis: !!orig.perfis })
    }
    return erro('Ação desconhecida')
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), 500)
  }
}
