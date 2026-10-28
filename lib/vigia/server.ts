// VIGIA-7S no app — arquivos do VIGIA (só no servidor): config.json, perfis_emc.json e resultados/.
// São os MESMOS do VIGIA-7S da área de trabalho (pasta "Ensaio via Cam"): calibração, perfis, ensaios e registros
// ficam compartilhados entre os dois. Só os dados — o código do VIGIA-7S (vigia7s/) nunca é tocado.
// Sem o VIGIA-7S no PC: pasta própria do app (userData/vigia). VIGIA_PASTA (variável de ambiente) força outra pasta.
import fs from 'fs/promises'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { getUserDataDir } from '@/lib/settings-server'
import { completarPerfis, type Segmento } from '@/lib/vigia/emc'

/** Pasta do VIGIA-7S original (área de trabalho). */
export const ORIGEM_VIGIA_PADRAO = path.join(os.homedir(), 'Desktop', 'Ensaio via Cam')

/** BASE do VIGIA: config.json, perfis_emc.json e resultados/ ficam nela. */
export function pastaVigia() {
  if (process.env.VIGIA_PASTA) return process.env.VIGIA_PASTA
  if (existsSync(path.join(ORIGEM_VIGIA_PADRAO, 'vigia7s'))) return ORIGEM_VIGIA_PADRAO
  return path.join(getUserDataDir(), 'vigia')
}
export const compartilhada = () => path.resolve(pastaVigia()) === path.resolve(ORIGEM_VIGIA_PADRAO)
export const cfgPath = () => path.join(pastaVigia(), 'config.json')
export const perfisPath = () => path.join(pastaVigia(), 'perfis_emc.json')
export const resultDir = () => path.join(pastaVigia(), 'resultados')

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

/** resolver_caminho(): relativo à BASE; absoluto antigo que não existe mais → mesmo arquivo em resultados/registros. */
export function resolverCaminho(p: string): string | null {
  if (!p) return null
  if (!path.isAbsolute(p)) return path.join(pastaVigia(), p)
  // registro de outra cópia do app (ex.: Desktop → pendrive): usa o desta cópia, se existir
  const alt = path.join(resultDir(), 'registros', path.basename(p))
  const partes = path.normalize(p).toLowerCase().split(path.sep)
  if (partes.slice(-3, -1).join('/') === 'resultados/registros' && existsSync(alt)) return alt
  if (existsSync(p)) return p
  return existsSync(alt) ? alt : null
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

/** O VIGIA-7S da área de trabalho está aberto? (pythonw … vigia7s\app.py) — os dois usam os mesmos ensaios. */
let _aberto = { t: 0, v: false }
export async function vigiaAberto(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  if (Date.now() - _aberto.t < 5000) return _aberto.v
  const { execFile } = await import('child_process')
  const filtro = "CommandLine like '%vigia7s%app.py%' and (Name like 'python%')"
  const v = await new Promise<boolean>(res => execFile('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `@(Get-CimInstance Win32_Process -Filter "${filtro}").Count`],
    { windowsHide: true, timeout: 15000 }, (e, out) => res(!e && Number(String(out).trim()) > 0)))
  _aberto = { t: Date.now(), v }
  return v
}

/** os.startfile(pasta) */
export async function abrirPasta(rel: string) {
  const p = caminhoRel(rel)
  await fs.mkdir(p, { recursive: true })
  const { spawn } = await import('child_process')
  spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref()
  return p
}

// ----------------------------------------------------------------------------- Registro (FOR EMC38)
/** Caminho absoluto de um caminho da BASE do VIGIA (portátil, "resultados/…", ou absoluto dentro dela). */
export function caminhoBase(p: string): string {
  const base = path.resolve(pastaVigia())
  const abs = path.resolve(base, p || '.')
  if (abs.toLowerCase() !== base.toLowerCase() && !abs.toLowerCase().startsWith(base.toLowerCase() + path.sep)) {
    throw new Error('Caminho fora da pasta do VIGIA')
  }
  return abs
}

/** caminho_portatil(): relativo à BASE, com "/" (fora dela: o próprio caminho). */
export function caminhoPortatil(p: string): string {
  if (!p) return ''
  const rel = path.relative(path.resolve(pastaVigia()), path.resolve(p))
  return rel.startsWith('..') || path.isAbsolute(rel) ? p : rel.split(path.sep).join('/')
}

export const pastaRegistros = () => path.join(resultDir(), 'registros')

/** usuário do Windows (getpass.getuser()) */
export const usuarioWindows = () => process.env.USERNAME || process.env.USER || os.userInfo().username

/** Registros (.json) da pasta resultados/registros, mais recentes primeiro. */
export async function listarRegistros() {
  const base = pastaRegistros()
  const nomes = (await fs.readdir(base).catch(() => [] as string[])).filter(n => n.toLowerCase().endsWith('.json'))
  const itens = await Promise.all(nomes.map(async n => {
    const st = await fs.stat(path.join(base, n)).catch(() => null)
    return { nome: n, caminho: caminhoPortatil(path.join(base, n)), mtime: st?.mtimeMs ?? 0 }
  }))
  return itens.sort((a, b) => b.mtime - a.mtime)
}

export async function lerRegistro(p: string): Promise<Record<string, unknown> | null> {
  return lerJson<Record<string, unknown>>(caminhoBase(p))
}

/** json.dump(reg, f, ensure_ascii=False, indent=1); recria a pasta se tiver sido apagada/movida */
export async function salvarRegistro(p: string, reg: unknown) {
  const abs = caminhoBase(p)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, JSON.stringify(reg, null, 1), 'utf-8')
  return abs
}

/** localizar_foto(): foto da leitura da câmera que originou a linha do Registro (caminho portátil ou null).
 *  Usa o caminho gravado na importação; sem ele, procura pela pasta do ensaio e nº da leitura
 *  (imagens/leitura_0031_*.jpg). */
export async function localizarFoto(linha: { foto?: string; ensaio?: string; n?: number }): Promise<string | null> {
  const abs_ = (p: string) => (path.isAbsolute(p) ? p : path.join(pastaVigia(), p))
  if (linha.foto && existsSync(abs_(linha.foto))) return caminhoPortatil(abs_(linha.foto))
  if (linha.ensaio && linha.n) {
    const pasta = path.join(abs_(linha.ensaio), 'imagens')
    const pref = `leitura_${String(Math.trunc(Number(linha.n))).padStart(4, '0')}_`
    let achados = (await fs.readdir(pasta).catch(() => [] as string[])).filter(f => f.startsWith(pref)).sort()
    // se houver a foto da 1ª leitura suspeita e a da leitura final, mostra a final
    const finais = achados.filter(f => !f.includes('SUSPEITA'))
    if (finais.length) achados = finais
    if (achados.length) return caminhoPortatil(path.join(pasta, achados[0]))
  }
  return null
}

/** ensaios_salvos(): ensaios salvos (estado_ensaio.json) nas pastas indicadas, com as leituras PRÓPRIAS de cada um
 *  (sem as trazidas de outro ensaio) agrupadas por segmento. Pasta e fotos das leituras apontam para onde a pasta
 *  do ensaio está agora (ensaios já movidos para a pasta do registro). */
export async function ensaiosSalvos(pastasBusca: string[]) {
  const { leiturasETotais, num } = await import('@/lib/vigia/registro')
  const saida: Record<string, unknown>[] = []
  for (const b of pastasBusca) {
    const base = caminhoBase(b)
    const nomes = await fs.readdir(base).catch(() => null)
    if (!nomes) continue
    for (const nome of nomes.sort()) {
      const pasta = path.join(base, nome)
      const est = nome.startsWith('ensaio_') ? await lerJson<Record<string, unknown>>(path.join(pasta, 'estado_ensaio.json')) : null
      if (!est) continue
      const [leituras, totais] = leiturasETotais(est, pasta)
      const proprias = leituras.filter(l => !l.importada && l.volume !== null && l.volume !== undefined)
      if (!proprias.length) continue
      const atual = caminhoPortatil(pasta)
      const antigos = new Set(proprias.map(l => l.ensaio))
      const regs = [...antigos].map(a => totais[String(a)]).find(t => t) ?? (est.tot_registros as unknown[]) ?? []
      for (const l of proprias) {
        const ant = l.ensaio
        if (l.foto && ant && String(l.foto).startsWith(String(ant))) l.foto = atual + String(l.foto).slice(String(ant).length)
        l.ensaio = atual
      }
      const segs: Record<string, unknown[]> = {}
      for (const l of proprias) (segs[l.segmento || '—'] ??= []).push(l)
      const defs: Record<string, [number | null, number | null]> = {}
      for (const s of (est.segmentos as Record<string, unknown>[]) ?? []) {
        const rot = [s.nome, s.face, s.polarizacao].filter(p => p).join(' | ')
        defs[rot] = [num(s.f_ini), num(s.f_fim)]
      }
      const m = nome.match(/^ensaio_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/)
      const quando = m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : String(est.salvo_em ?? '')
      saida.push({ pasta, rel: atual, nome: est.nome || nome, quando, ordem: nome, segmentos: segs, totais: { [atual]: regs }, defs })
    }
  }
  return saida
}

/** Ensaios salvos para escolher um e importar: pastas ensaio_* com estado_ensaio.json em resultados/ e nas
 *  pastas de registro (no Python: filedialog para escolher o estado_ensaio.json). */
export async function listarEnsaiosSalvos() {
  const saida: { rel: string; nome: string; salvo_em: string; n: number }[] = []
  const varrer = async (dir: string, fundo: number) => {
    for (const nome of await fs.readdir(dir).catch(() => [] as string[])) {
      const p = path.join(dir, nome)
      if (nome.startsWith('ensaio_')) {
        const est = await lerJson<Record<string, unknown>>(path.join(p, 'estado_ensaio.json'))
        if (est) saida.push({ rel: caminhoPortatil(p), nome: String(est.nome || nome), salvo_em: String(est.salvo_em ?? ''),
          n: ((est.leituras_reg as unknown[]) ?? []).length })
      } else if (fundo > 0 && (await fs.stat(p).catch(() => null))?.isDirectory()) await varrer(p, fundo - 1)
    }
  }
  await varrer(resultDir(), 3)  // resultados/ensaio_* e resultados/registros/<reg>/ensaios/ensaio_*
  const base = (r: string) => r.split('/').pop()!
  return saida.sort((a, b) => (base(a.rel) < base(b.rel) ? 1 : base(a.rel) > base(b.rel) ? -1 : 0))
}

/** Estado salvo de um ensaio (para importar): {est, pasta portátil}. */
export async function lerEstadoEnsaio(rel: string) {
  const pasta = caminhoBase(rel)
  const est = await lerJson<Record<string, unknown>>(path.join(pasta, 'estado_ensaio.json'))
  return est ? { est, pasta } : null
}

/** _arquivar_ensaios(): ensaio importado para o Registro sai de resultados\ e vai para a pasta do registro
 *  (resultados\registros\<registro>\ensaios\) — não se mistura com os ensaios ainda não registrados.
 *  emAndamento: pasta (portátil) do ensaio rodando agora, que não é movido. Retorna {caminho gravado: novo}. */
export async function arquivarEnsaios(pastas: string[], destino: string, emAndamento: string | null) {
  const mapa: Record<string, string> = {}
  const regs = path.normalize(pastaRegistros()).toLowerCase()
  const dest = caminhoBase(destino)
  for (const p of pastas) {
    const origem = path.normalize(path.isAbsolute(p) ? p : path.join(pastaVigia(), p))
    const st = await fs.stat(origem).catch(() => null)
    if (!st?.isDirectory() || origem.toLowerCase().startsWith(regs)) continue  // não existe mais ou já está num registro
    if (emAndamento && path.normalize(caminhoBase(emAndamento)).toLowerCase() === origem.toLowerCase()) continue
    let novo = path.join(dest, path.basename(origem))
    if (existsSync(novo)) {
      const d = new Date(), z = (n: number) => String(n).padStart(2, '0')
      novo += `_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`
    }
    try {
      await fs.mkdir(dest, { recursive: true })
      await fs.rename(origem, novo)
    } catch { continue }
    mapa[p] = caminhoPortatil(novo)
  }
  return mapa
}

/** os.startfile(arquivo) */
export async function abrirArquivo(p: string) {
  const abs = caminhoBase(p)
  const { spawn } = await import('child_process')
  spawn('explorer.exe', [abs], { detached: true, stdio: 'ignore' }).unref()  // abre com o programa padrão
  return abs
}
