import { NextRequest, NextResponse } from 'next/server'
import { lerJSONComEstado, escreverJSON } from '@/lib/dados'
import { senhaConfere } from '@/lib/emc/senha-server'
import { CONFIG_EMC_PADRAO } from '@/lib/emc/padrao'
import { ARQUIVO_CONFIG_EMC, type ConfigEnsaiosEmc } from '@/lib/emc/tipos'

// Catálogo de ensaios + templates por tipo de equipamento (agenda EMC).
// GET é livre; PUT exige a senha de emissão no header x-senha-emc.

export const dynamic = 'force-dynamic'

export async function GET() {
  const { dados, estado } = await lerJSONComEstado<ConfigEnsaiosEmc>(ARQUIVO_CONFIG_EMC, CONFIG_EMC_PADRAO)
  return NextResponse.json({ ...dados, corrompido: estado === 'corrompido' })
}

export async function PUT(req: NextRequest) {
  if (!(await senhaConfere(req.headers.get('x-senha-emc')))) {
    return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 })
  }
  try {
    // Arquivo existente e ilegível: não grava por cima (perderia os templates do lab).
    const { estado } = await lerJSONComEstado<ConfigEnsaiosEmc>(ARQUIVO_CONFIG_EMC, CONFIG_EMC_PADRAO)
    if (estado === 'corrompido') {
      return NextResponse.json({ error: 'O arquivo de templates na rede não pôde ser lido — nada foi gravado.' }, { status: 409 })
    }
    const body = (await req.json()) as ConfigEnsaiosEmc
    const limpa: ConfigEnsaiosEmc = {
      catalogo: Array.isArray(body.catalogo)
        ? body.catalogo.filter(e => e?.id && e?.codigo).map(e => ({ ...e, codigo: String(e.codigo).trim() }))
        : [],
      templates: Array.isArray(body.templates) ? body.templates.filter(t => t?.id && t?.nome) : [],
      atualizadoEm: new Date().toISOString(),
    }
    await escreverJSON(ARQUIVO_CONFIG_EMC, limpa)
    return NextResponse.json(limpa)
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
