// VIGIA-7S no app — arquivos do VIGIA (só no servidor): config.json, perfis_emc.json e resultados/,
// numa pasta própria do app (userData/vigia). O VIGIA-7S original só é LIDO (importar), nunca alterado.
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { getUserDataDir } from '@/lib/settings-server'
import { completarPerfis, type Segmento } from '@/lib/vigia/emc'

export const pastaVigia = () => path.join(getUserDataDir(), 'vigia')
export const cfgPath = () => path.join(pastaVigia(), 'config.json')
export const perfisPath = () => path.join(pastaVigia(), 'perfis_emc.json')
export const resultDir = () => path.join(pastaVigia(), 'resultados')

/** Pasta do VIGIA-7S original (para importar a calibração). */
export const ORIGEM_VIGIA_PADRAO = path.join(os.homedir(), 'Desktop', 'Ensaio via Cam')

async function lerJson<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')) as T } catch { return null }
}

/** json.dump(..., ensure_ascii=False, indent=2) */
async function gravarJson(p: string, dados: unknown) {
  await fs.mkdir(path.dirname(p), { recursive: true })
  const tmp = p + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(dados, null, 2), 'utf-8')
  await fs.rename(tmp, p)
}

export const lerConfigBruta = () => lerJson<Record<string, unknown>>(cfgPath())
export const salvarConfig = (cfg: unknown) => gravarJson(cfgPath(), cfg)

/** carregar_perfis(): salvos + perfis padrão novos (sem mexer nos editados). */
export async function carregarPerfis(): Promise<Record<string, Segmento[]>> {
  const { perfis, novos } = completarPerfis(await lerJson(perfisPath()))
  if (novos) await gravarJson(perfisPath(), perfis)
  return perfis
}
export const salvarPerfis = (perfis: Record<string, Segmento[]>) => gravarJson(perfisPath(), perfis)

/** Salva um arquivo em resultados/ (sub = subpasta); devolve o caminho. */
export async function salvarArquivo(nome: string, dados: Buffer, sub = ''): Promise<string> {
  const dir = path.resolve(resultDir(), sub)
  if (dir !== path.resolve(resultDir()) && !dir.startsWith(path.resolve(resultDir()) + path.sep)) throw new Error('Pasta inválida')
  await fs.mkdir(dir, { recursive: true })
  const p = path.join(dir, path.basename(nome))
  await fs.writeFile(p, dados)
  return p
}

/** Lê (sem alterar) config.json e perfis_emc.json do VIGIA-7S original. */
export async function lerVigiaOriginal(pasta = ORIGEM_VIGIA_PADRAO) {
  const [config, perfis] = await Promise.all([
    lerJson<Record<string, unknown>>(path.join(pasta, 'config.json')),
    lerJson<Record<string, Partial<Segmento>[]>>(path.join(pasta, 'perfis_emc.json')),
  ])
  return { pasta, config, perfis }
}

// ----------------------------------------------------------------------------- pasta do ensaio (resultados/)
/** Caminho absoluto de um caminho relativo a resultados/ (recusa sair da pasta). */
export function caminhoRel(rel: string): string {
  const base = path.resolve(resultDir())
  const p = path.resolve(base, rel || '.')
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error('Caminho fora de resultados')
  return p
}

/** Grava (ou acrescenta) um arquivo. cabecalho: escrito antes quando o arquivo ainda não existe (CSV).
 *  atomico: grava num .tmp e troca (nunca deixa o arquivo pela metade). */
export async function escreverRel(rel: string, dados: Buffer, op: { acrescentar?: boolean; cabecalho?: Buffer; atomico?: boolean } = {}) {
  const p = caminhoRel(rel)
  await fs.mkdir(path.dirname(p), { recursive: true })
  if (op.acrescentar) {
    const existe = await fs.stat(p).then(() => true, () => false)
    await fs.appendFile(p, existe || !op.cabecalho ? dados : Buffer.concat([op.cabecalho, dados]))
  } else if (op.atomico) {
    await fs.writeFile(p + '.tmp', dados)
    await fs.rename(p + '.tmp', p)
  } else {
    await fs.writeFile(p, dados)
  }
  return p
}

export async function lerRel(rel: string): Promise<Buffer | null> {
  try { return await fs.readFile(caminhoRel(rel)) } catch { return null }
}

export async function existeRel(rel: string) {
  return fs.stat(caminhoRel(rel)).then(() => true, () => false)
}

/** _ensaios_incompletos(): pastas ensaio_* com estado_ensaio.json não concluído, mais recentes primeiro. */
export async function ensaiosIncompletos(): Promise<{ pasta: string; rel: string; est: Record<string, unknown> }[]> {
  const base = resultDir()
  const nomes = await fs.readdir(base).catch(() => [] as string[])
  const saida: { pasta: string; rel: string; est: Record<string, unknown> }[] = []
  for (const nome of nomes.sort().reverse()) {
    if (!nome.startsWith('ensaio_')) continue
    const p = path.join(base, nome)
    const est = await lerJson<Record<string, unknown>>(path.join(p, 'estado_ensaio.json'))
    if (est && !est.concluido) saida.push({ pasta: p, rel: nome, est })
  }
  return saida
}

/** os.startfile(pasta) */
export async function abrirPasta(rel: string) {
  const p = caminhoRel(rel)
  await fs.mkdir(p, { recursive: true })
  const { spawn } = await import('child_process')
  spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref()
  return p
}
