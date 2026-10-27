import { NextRequest, NextResponse } from 'next/server'
import { senhaConfere } from '@/lib/emc/senha-server'
import { gravarImagem, lerDocumento } from '@/lib/conhecimento/arquivos-server'

// Grava figuras/tabelas recortadas do PDF de uma norma (ao anexar na Base).
// POST { imagens: [{ arquivo: "fig-11.png", png: "<base64>" }] } — senha de emissão em x-senha.
// A tela manda em lotes; o documento tem de existir.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await senhaConfere(req.headers.get('x-senha')))) return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 })
  try {
    if (!(await lerDocumento(params.id))) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
    const { imagens } = (await req.json()) as { imagens?: { arquivo: string; png: string }[] }
    if (!Array.isArray(imagens) || !imagens.length) return NextResponse.json({ error: 'Nenhuma imagem.' }, { status: 400 })
    for (const im of imagens) {
      const dados = Buffer.from(String(im.png), 'base64')
      // PNG de verdade (assinatura) e tamanho razoável
      if (dados.length < 8 || dados.readUInt32BE(0) !== 0x89504e47 || dados.length > 15 * 1024 * 1024) {
        return NextResponse.json({ error: `Imagem inválida: ${im.arquivo}` }, { status: 400 })
      }
      await gravarImagem(params.id, im.arquivo, dados)
    }
    return NextResponse.json({ ok: true, gravadas: imagens.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
