import { NextRequest, NextResponse } from 'next/server'
import {
  lerConfigBruta, salvarConfig, carregarPerfis, salvarPerfis, salvarFoto, lerVigiaOriginal, pastaVigia,
  ORIGEM_VIGIA_PADRAO,
} from '@/lib/vigia/server'
import { completarPerfis } from '@/lib/vigia/emc'

// VIGIA-7S no app.
// GET                         → { config (bruta, o cliente mescla com o padrão), perfis, pasta, origem }
// PUT  { config? , perfis? }  → grava config.json / perfis_emc.json
// POST { acao: 'foto', nome, png, sub? }      → grava em resultados/
// POST { acao: 'importar', pasta? }           → copia a calibração do VIGIA-7S original (só lê o original)

export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function GET() {
  const [config, perfis, orig] = await Promise.all([lerConfigBruta(), carregarPerfis(), lerVigiaOriginal()])
  return NextResponse.json({ config, perfis, pasta: pastaVigia(), origem: { pasta: orig.pasta, existe: !!orig.config } })
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
      return NextResponse.json({ caminho: await salvarFoto(b.nome, b.png, typeof b.sub === 'string' ? b.sub : '') })
    }
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
