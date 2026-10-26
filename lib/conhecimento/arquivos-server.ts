import fs from 'fs'
import path from 'path'
import { caminhoDados, lerJSON } from '@/lib/dados'
import { readSettings } from '@/lib/settings-server'
import { lerMd, escreverMd, dividirEmTrechos, slug } from '@/lib/conhecimento/markdown'
import { construirIndice, normalizar, type Indice } from '@/lib/conhecimento/busca'
import { PASTA_CONHECIMENTO, type Documento, type MetaDoc } from '@/lib/conhecimento/tipos'
import type { ItemGlossario } from '@/lib/glossario'

/* Arquivos da Base de Conhecimento: um .md por documento na pasta
   "conhecimento" dos cadastros (rede).

   Diferente do resto dos dados (lib/dados.ts grava criptografado), aqui o .md
   fica em TEXTO PURO de propósito: a base é para ser lida, conferida e até
   corrigida fora do app (Bloco de Notas). A escrita segue o mesmo cuidado:
   .tmp + rename (atômico), .bak da versão anterior e cópia no espelho. */

async function pasta(): Promise<string> {
  return caminhoDados(PASTA_CONHECIMENTO)
}

async function arquivosMd(): Promise<{ id: string; caminho: string; mtime: number; size: number }[]> {
  const dir = await pasta()
  let nomes: string[] = []
  try { nomes = await fs.promises.readdir(dir) } catch { return [] }
  const out = []
  for (const n of nomes) {
    if (!n.toLowerCase().endsWith('.md') || n.startsWith('_')) continue
    const caminho = path.join(dir, n)
    try {
      const st = await fs.promises.stat(caminho)
      if (st.isFile()) out.push({ id: n.slice(0, -3), caminho, mtime: st.mtimeMs, size: st.size })
    } catch {}
  }
  return out
}

export async function lerDocumento(id: string): Promise<Documento | null> {
  if (!/^[a-z0-9-]+$/i.test(id)) return null      // nada de "..\" no nome
  try {
    return lerMd(id, await fs.promises.readFile(path.join(await pasta(), id + '.md'), 'utf-8'))
  } catch { return null }
}

export async function listarDocumentos(): Promise<MetaDoc[]> {
  const out: MetaDoc[] = []
  for (const a of await arquivosMd()) {
    try {
      const { corpo: _corpo, ...meta } = lerMd(a.id, await fs.promises.readFile(a.caminho, 'utf-8'))
      out.push(meta)
    } catch {}
  }
  return out.sort((x, y) => (x.tipo === y.tipo ? x.titulo.localeCompare(y.titulo, 'pt-BR') : x.tipo === 'nota' ? -1 : 1))
}

async function gravarTexto(caminho: string, conteudo: string, relativo: string) {
  await fs.promises.mkdir(path.dirname(caminho), { recursive: true })
  try { await fs.promises.copyFile(caminho, caminho + '.bak') } catch {}
  const tmp = `${caminho}.tmp.${process.pid}.${Date.now()}`
  try {
    await fs.promises.writeFile(tmp, conteudo, 'utf-8')
    await fs.promises.rename(tmp, caminho)
  } catch {
    try { await fs.promises.unlink(tmp) } catch {}
    await fs.promises.writeFile(caminho, conteudo, 'utf-8')
  }
  // espelho best-effort (mesma regra de lib/dados.ts)
  const { mirrorFolder } = await readSettings()
  if (mirrorFolder) {
    const mp = path.join(mirrorFolder, relativo)
    fs.promises.mkdir(path.dirname(mp), { recursive: true })
      .then(() => fs.promises.writeFile(mp, conteudo, 'utf-8')).catch(() => {})
  }
}

/** Id livre a partir do título (acrescenta -2, -3… se já existir). */
export async function idLivre(titulo: string): Promise<string> {
  const existentes = new Set((await arquivosMd()).map(a => a.id))
  const base = slug(titulo)
  let id = base, n = 2
  while (existentes.has(id)) id = `${base}-${n++}`
  return id
}

export async function salvarDocumento(doc: Documento): Promise<Documento> {
  if (!/^[a-z0-9-]+$/i.test(doc.id)) throw new Error('Identificador inválido.')
  const agora = new Date().toISOString()
  const antigo = await lerDocumento(doc.id)
  const final: Documento = { ...doc, criadoEm: antigo?.criadoEm ?? doc.criadoEm ?? agora, atualizadoEm: agora }
  await gravarTexto(path.join(await pasta(), doc.id + '.md'), escreverMd(final), `${PASTA_CONHECIMENTO}/${doc.id}.md`)
  return final
}

export async function removerDocumento(id: string): Promise<boolean> {
  if (!/^[a-z0-9-]+$/i.test(id)) return false
  const caminho = path.join(await pasta(), id + '.md')
  try {
    // guarda uma cópia antes de apagar — removido por engano dá para recuperar
    await fs.promises.copyFile(caminho, caminho + '.removido-' + Date.now())
    await fs.promises.unlink(caminho)
    return true
  } catch { return false }
}

/* ─── índice de busca em memória ──────────────────────────────────────────────
   Refeito só quando algum .md (ou o glossário) muda: a "assinatura" é a lista de
   arquivos com data e tamanho. */
let cache: { assinatura: string; indice: Indice; documentos: number } | null = null

export async function indiceAtual(): Promise<{ indice: Indice; documentos: number }> {
  const arquivos = await arquivosMd()
  const glossario = await lerJSON<ItemGlossario[]>('glossario.json', [])
  const assinatura = arquivos.map(a => `${a.id}:${a.mtime}:${a.size}`).join('|') + '#' + glossario.length + ':' +
    glossario.map(g => g.sigla).join(',')
  if (cache && cache.assinatura === assinatura) return cache

  const trechos = []
  for (const a of arquivos) {
    try { trechos.push(...dividirEmTrechos(lerMd(a.id, await fs.promises.readFile(a.caminho, 'utf-8')))) } catch {}
  }
  // glossário do app: sigla ↔ definição viram sinônimos
  const doGlossario = glossario
    .filter(g => g.sigla && g.definicao && g.definicao.length <= 80)
    .map(g => [normalizar(g.sigla), normalizar(g.definicao)])
  cache = { assinatura, indice: construirIndice(trechos, doGlossario), documentos: arquivos.length }
  return cache
}
