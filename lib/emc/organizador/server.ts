import fs from 'fs'
import path from 'path'
import os from 'os'
import { caminhoDados, lerJSON, escreverJSON } from '@/lib/dados'
import {
  EXTENSOES, PADRAO, PASTA_RADIAN, PASTA_FINALIZADOS, SUFIXO_ENVIADO, RE_ENVIADO, SEPARADOR_DAT,
  lerProtocolo, mesmoProtocolo, limparNome, padronizarDat, lerDat, hashBloco, type Protocolo,
} from '@/lib/emc/organizador/dat'
import {
  ARQUIVO_CONFIG_ORGANIZADOR, CONFIG_ORGANIZADOR_PADRAO, type ConfigOrganizador, type PastaEnsaio,
  type ProtocoloOrigem, type LinhaLog, type TagLog, type ArquivoVerificado, type Finalizado,
} from '@/lib/emc/organizador/tipos'

/* Organizador de ensaios EMC (porte do Organizador.pyw para o app):
   1) organiza os .DAT soltos do PC do Radian em <Origem>\<PROTOCOLO>\<NORMA>\;
   2) lista protocolos/ensaios e envia os marcados para o registro na rede
      (<Destino>\<pasta do protocolo>\Radian\<norma>\), com o .DAT enxuto, e
      renomeia o original para _Enviado;
   3) verifica pontos de %Error destoantes (só mostra; exclui se pedirem, com
      backup do original);
   4) finaliza (move para <Origem>\_Finalizados) e reabre.
   Os logs ficam na pasta de dados da rede (emc/organizador-logs), com quem fez. */

const ARQUIVO_LOGS = 'emc/organizador-logs'
const ARQUIVO_BACKUP = 'emc/organizador-backup'   // .DAT originais antes de excluir pontos

export async function lerConfigOrganizador(): Promise<ConfigOrganizador> {
  return { ...CONFIG_ORGANIZADOR_PADRAO, ...(await lerJSON<Partial<ConfigOrganizador>>(ARQUIVO_CONFIG_ORGANIZADOR, {})) }
}

export async function salvarConfigOrganizador(parcial: Partial<ConfigOrganizador>): Promise<ConfigOrganizador> {
  const atual = await lerConfigOrganizador()
  const limite = Number(parcial.limiteDesvio)
  const novo: ConfigOrganizador = {
    origem: typeof parcial.origem === 'string' && parcial.origem.trim() ? parcial.origem.trim() : atual.origem,
    destino: typeof parcial.destino === 'string' && parcial.destino.trim() ? parcial.destino.trim() : atual.destino,
    verificarAoEnviar: typeof parcial.verificarAoEnviar === 'boolean' ? parcial.verificarAoEnviar : atual.verificarAoEnviar,
    limiteDesvio: Number.isFinite(limite) && limite > 0 ? limite : atual.limiteDesvio,
  }
  await escreverJSON(ARQUIVO_CONFIG_ORGANIZADOR, novo)
  return novo
}

/* ── log ────────────────────────────────────────────────────────────────── */

export class Log {
  linhas: LinhaLog[] = []
  constructor(private tipo?: string) {}
  add(msg: string, tag?: TagLog) { this.linhas.push({ msg, tag }) }
  /** Grava o log na rede (só operações que mexem em arquivo). Falhar aqui não derruba a operação. */
  async gravar() {
    if (!this.tipo || !this.linhas.length) return
    try {
      const agora = new Date()
      const p2 = (n: number) => String(n).padStart(2, '0')
      const ts = `${agora.getFullYear()}${p2(agora.getMonth() + 1)}${p2(agora.getDate())}_${p2(agora.getHours())}${p2(agora.getMinutes())}${p2(agora.getSeconds())}`
      const pasta = path.join(await caminhoDados(ARQUIVO_LOGS), this.tipo)
      await fs.promises.mkdir(pasta, { recursive: true })
      const quem = `${os.userInfo().username} @ ${os.hostname()}`
      await fs.promises.writeFile(path.join(pasta, `log_${this.tipo}_${ts}.txt`),
        [`# ${agora.toLocaleString('pt-BR')} — ${quem}`, ...this.linhas.map(l => l.msg)].join('\r\n') + '\r\n', 'utf8')
    } catch { /* log é extra */ }
  }
}

/* ── utilidades de disco ────────────────────────────────────────────────── */

const ehDat = (nome: string) => EXTENSOES.has(path.extname(nome).toLowerCase())
const rel = (p: string, raiz: string) => path.relative(raiz, p) || '.'
const existe = (p: string) => fs.promises.access(p).then(() => true, () => false)
const norm = (p: string) => path.normalize(p).replace(/[\\/]+$/, '').toLowerCase()

export function mesmoCaminho(a: string, b: string): boolean { return norm(a) === norm(b) }

/** O caminho está dentro da raiz? (a tela manda caminhos; só mexemos dentro da origem/destino configurados) */
export function dentroDe(raiz: string, p: string): boolean {
  const r = norm(raiz), c = norm(p)
  return c === r || c.startsWith(r + path.sep)
}

/** Pasta acessível? Pasta de rede desligada pode travar o acesso por dezenas de segundos — desiste antes. */
export async function pastaAcessivel(p: string, ms = 6000): Promise<boolean> {
  if (!p) return false
  let timer: NodeJS.Timeout | undefined
  const tempo = new Promise<boolean>(res => { timer = setTimeout(() => res(false), ms) })
  const teste = fs.promises.stat(p).then(s => s.isDirectory(), () => false)
  try { return await Promise.race([teste, tempo]) } finally { clearTimeout(timer) }
}

async function listar(pasta: string): Promise<fs.Dirent[]> {
  try { return await fs.promises.readdir(pasta, { withFileTypes: true }) } catch { return [] }
}

async function destinoLivre(pasta: string, nome: string): Promise<string> {
  let alvo = path.join(pasta, nome)
  if (!(await existe(alvo))) return alvo
  const ext = path.extname(nome), base = nome.slice(0, nome.length - ext.length)
  for (let i = 1; ; i++) {
    alvo = path.join(pasta, `${base} (${i})${ext}`)
    if (!(await existe(alvo))) return alvo
  }
}

/** Move arquivo; entre unidades diferentes (EXDEV) copia e apaga. */
async function moverArquivo(de: string, para: string) {
  try { await fs.promises.rename(de, para) }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    await fs.promises.copyFile(de, para)
    const st = await fs.promises.stat(de)
    await fs.promises.utimes(para, st.atime, st.mtime)
    await fs.promises.unlink(de)
  }
}

/** Todas as pastas (com os arquivos de cada uma) abaixo de raiz, como o os.walk. */
async function percorrer(raiz: string): Promise<{ pasta: string; arquivos: string[] }[]> {
  const out: { pasta: string; arquivos: string[] }[] = []
  const pilha = [raiz]
  while (pilha.length) {
    const pasta = pilha.shift()!
    const ents = await listar(pasta)
    out.push({ pasta, arquivos: ents.filter(e => e.isFile()).map(e => e.name) })
    pilha.push(...ents.filter(e => e.isDirectory()).map(e => path.join(pasta, e.name)))
  }
  return out
}

/* ── 1) organizar ───────────────────────────────────────────────────────── */

/** Arquivos soltos na raiz + soltos direto dentro das pastas de protocolo. */
async function arquivosParaOrganizar(raiz: string): Promise<string[]> {
  const arquivos: string[] = []
  for (const e of await listar(raiz)) {
    const p = path.join(raiz, e.name)
    if (e.isFile()) arquivos.push(p)
    else if (e.isDirectory() && lerProtocolo(e.name)) {
      arquivos.push(...(await listar(p)).filter(f => f.isFile()).map(f => path.join(p, f.name)))
    }
  }
  return arquivos.filter(ehDat)
}

export async function organizar(raiz: string, simular: boolean, log: Log): Promise<string> {
  let mov = 0, ok = 0, ign = 0, err = 0
  for (const arq of await arquivosParaOrganizar(raiz)) {
    const nome = path.basename(arq)
    const base = path.basename(nome, path.extname(nome)).replace(RE_ENVIADO, '')
    const m = base.match(PADRAO)
    const pr = m ? lerProtocolo(m[1]) : null
    const prot = pr ? limparNome(pr.txt) : ''
    if (!prot) { log.add(`  ignorado  ${rel(arq, raiz)}`, 'aviso'); ign++; continue }
    const norma = limparNome(m![2].toUpperCase())
    const destDir = path.join(raiz, prot, norma)
    if (mesmoCaminho(path.dirname(arq), destDir)) { ok++; continue }
    const alvo = await destinoLivre(destDir, nome)
    const linha = `  ${rel(arq, raiz)}  ->  ${rel(alvo, raiz)}`
    if (simular) { log.add(linha, 'ok'); mov++; continue }
    try {
      await fs.promises.mkdir(destDir, { recursive: true })
      await moverArquivo(arq, alvo)
      log.add(linha, 'ok'); mov++
    } catch (e) {
      log.add(`  ERRO  ${rel(arq, raiz)}: ${(e as Error).message}`, 'erro'); err++
    }
  }
  return `${mov} ${simular ? 'a mover' : 'movidos'} | ${ok} já no lugar | ${ign} ignorados | ${err} erros`
}

/* ── 2) estrutura (lista da tela) ───────────────────────────────────────── */

/** (total de .DAT, quantos já com _Enviado) direto na pasta. */
async function contarDat(pasta: string): Promise<{ dat: number; env: number }> {
  let dat = 0, env = 0
  for (const f of await listar(pasta)) {
    if (!f.isFile() || !ehDat(f.name)) continue
    dat++
    if (RE_ENVIADO.test(path.basename(f.name, path.extname(f.name)))) env++
  }
  return { dat, env }
}

/** Pastas de protocolo do destino (1º nível; se não achar, olha dentro das que não são protocolo, ex.: "!Parado"). */
export class IndiceDestino {
  private nivel2: { nome: string; caminho: string; pr: Protocolo | null }[] | null = null
  private constructor(private nivel1: { nome: string; caminho: string; pr: Protocolo | null }[]) {}

  static async criar(base: string): Promise<IndiceDestino> {
    return new IndiceDestino(await IndiceDestino.listarPastas(base))
  }

  private static async listarPastas(pasta: string) {
    return (await listar(pasta)).filter(e => e.isDirectory())
      .map(e => ({ nome: e.name, caminho: path.join(pasta, e.name), pr: lerProtocolo(e.name) }))
  }

  /** Casa pelo número do protocolo; a amostra (-1, -2...) só desempata. */
  private static filtrar(lista: { caminho: string; pr: Protocolo | null }[], num: string, amostra: string | null): string[] {
    const mesmos = lista.filter(x => x.pr?.num === num)
    if (amostra === null) return mesmos.map(x => x.caminho)        // origem sem amostra: qualquer pasta desse número
    const exatos = mesmos.filter(x => x.pr!.amostra === amostra)
    if (exatos.length) return exatos.map(x => x.caminho)
    return mesmos.filter(x => x.pr!.amostra === null).map(x => x.caminho)   // destino sem amostra também serve
  }

  async achar(num: string, amostra: string | null): Promise<string[]> {
    const achados = IndiceDestino.filtrar(this.nivel1, num, amostra)
    if (achados.length) return achados
    if (!this.nivel2) {
      this.nivel2 = []
      for (const x of this.nivel1) if (!x.pr) this.nivel2.push(...(await IndiceDestino.listarPastas(x.caminho)))
    }
    return IndiceDestino.filtrar(this.nivel2, num, amostra)
  }

  /** Todas as pastas de protocolo (1º e 2º nível) — para a sincronização com a agenda. */
  async todas(): Promise<{ caminho: string; pr: Protocolo }[]> {
    if (!this.nivel2) await this.achar('\0', null)
    return [...this.nivel1, ...this.nivel2!].filter((x): x is { nome: string; caminho: string; pr: Protocolo } => !!x.pr)
  }
}

export async function lerEstrutura(raiz: string, destino: string): Promise<ProtocoloOrigem[]> {
  const protocolos: ProtocoloOrigem[] = []
  const indice = destino && (await pastaAcessivel(destino)) ? await IndiceDestino.criar(destino) : null
  for (const d of (await listar(raiz)).filter(e => e.isDirectory() && lerProtocolo(e.name))) {
    const caminho = path.join(raiz, d.name)
    let mtime = 0
    let filhos: PastaEnsaio[] = []
    try {
      mtime = (await fs.promises.stat(caminho)).mtimeMs
      const subs = (await listar(caminho)).filter(e => e.isDirectory())
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      filhos = await Promise.all(subs.map(async s => {
        const c = path.join(caminho, s.name)
        return { nome: s.name, caminho: c, ...(await contarDat(c)) }
      }))
    } catch { /* pasta sumiu no meio */ }
    const tot = filhos.length
      ? { dat: filhos.reduce((a, c) => a + c.dat, 0), env: filhos.reduce((a, c) => a + c.env, 0) }
      : await contarDat(caminho)
    const pr = lerProtocolo(d.name)!
    protocolos.push({ nome: d.name, caminho, mtime, filhos, ...tot, dest: indice ? await indice.achar(pr.num, pr.amostra) : null })
  }
  return protocolos.sort((a, b) => b.mtime - a.mtime)
}

/* ── 3) enviar ──────────────────────────────────────────────────────────── */

async function nomeEnviado(pasta: string, nome: string): Promise<string> {
  const ext = path.extname(nome), base = nome.slice(0, nome.length - ext.length)
  let alvo = path.join(pasta, `${base}${SUFIXO_ENVIADO}${ext}`)
  for (let i = 2; await existe(alvo); i++) alvo = path.join(pasta, `${base}${SUFIXO_ENVIADO}_${i}${ext}`)
  return alvo
}

/** Copia origem → destino só o que for mais novo (.DAT padronizado); .DAT enviados viram _Enviado na origem. */
async function enviarEnsaio(origem: string, destino: string, log: Log) {
  const r = { ok: 0, pulou: 0, err: 0 }
  for (const { pasta, arquivos } of await percorrer(origem)) {
    // do mais antigo pro mais novo (versões repetidas: a mais nova vence)
    const comData = await Promise.all(arquivos.map(async n => ({ n, t: (await fs.promises.stat(path.join(pasta, n))).mtimeMs })))
    comData.sort((a, b) => a.t - b.t)
    for (const { n: nome, t: tSrc } of comData) {
      const src = path.join(pasta, nome)
      const ext = path.extname(nome), base = nome.slice(0, nome.length - ext.length)
      const jaEnviado = RE_ENVIADO.test(base)
      const alvoDir = path.normalize(path.join(destino, path.relative(origem, pasta)))
      const alvo = path.join(alvoDir, base.replace(RE_ENVIADO, '') + ext)
      try {
        const stAlvo = await fs.promises.stat(alvo).catch(() => null)
        if (stAlvo && stAlvo.mtimeMs >= tSrc - 2000) r.pulou++      // destino já tem igual ou mais novo: não mexe
        else {
          await fs.promises.mkdir(alvoDir, { recursive: true })
          if (ehDat(nome)) {                                          // .DAT vai padronizado; o original fica completo na origem
            await fs.promises.writeFile(alvo, padronizarDat(await fs.promises.readFile(src, 'latin1')), 'latin1')
          } else {
            await fs.promises.copyFile(src, alvo)
          }
          await fs.promises.utimes(alvo, tSrc / 1000, tSrc / 1000)    // mantém a data de alteração (segundos com fração)
          r.ok++
        }
      } catch (e) {
        log.add(`    ERRO  ${nome}: ${(e as Error).message}`, 'erro'); r.err++
        continue
      }
      if (ehDat(nome) && !jaEnviado) {
        try { await fs.promises.rename(src, await nomeEnviado(pasta, nome)) }
        catch (e) { log.add(`    aviso: copiado, mas não renomeei ${nome} (${(e as Error).message})`, 'aviso') }
      }
    }
  }
  return r
}

/** unidades = pastas de ensaio marcadas (ou o protocolo inteiro, se não tiver subpasta). */
export async function enviar(raiz: string, destino: string, unidades: string[], log: Log): Promise<string> {
  const indice = await IndiceDestino.criar(destino)
  const tot = { ok: 0, pulou: 0, err: 0 }
  const semPasta = new Set<string>()
  log.add(`ENVIANDO ${unidades.length} ensaio(s)  ->  ${destino}`, 'info')
  for (const u of unidades) {
    const ru = rel(u, raiz)
    const protNome = ru.split(/[\\/]/)[0]
    const pr = lerProtocolo(protNome)
    const achados = pr ? await indice.achar(pr.num, pr.amostra) : []
    if (achados.length !== 1) {
      const motivo = !achados.length ? 'não achei a pasta do protocolo'
        : 'mais de uma pasta com esse protocolo: ' + achados.map(a => path.basename(a)).join(', ')
      log.add(`  PULADO  ${ru}: ${motivo}`, 'aviso')
      semPasta.add(protNome); tot.err++
      continue
    }
    const resto = path.relative(path.join(raiz, protNome), u)
    const alvo = resto ? path.join(achados[0], PASTA_RADIAN, resto) : path.join(achados[0], PASTA_RADIAN)
    const r = await enviarEnsaio(u, alvo, log)
    log.add(`  ${ru}  ->  ${rel(alvo, destino)}   ${r.ok} enviados | ${r.pulou} já em dia | ${r.err} erros`, r.err ? 'erro' : 'ok')
    tot.ok += r.ok; tot.pulou += r.pulou; tot.err += r.err
  }
  if (semPasta.size) log.add(`Protocolos sem pasta no destino: ${[...semPasta].sort().join(', ')}`, 'aviso')
  const resumo = `${tot.ok} enviados | ${tot.pulou} já em dia | ${tot.err} erros/pulados`
  log.add(resumo, 'info')
  return resumo
}

/* ── verificar / excluir pontos ─────────────────────────────────────────── */

export async function lerDats(pastas: string[], log: Log): Promise<ArquivoVerificado[]> {
  const out: ArquivoVerificado[] = []
  for (const raiz of pastas) {
    for (const { pasta, arquivos } of await percorrer(raiz)) {
      for (const nome of [...arquivos].sort()) {
        if (!ehDat(nome)) continue
        const arquivo = path.join(pasta, nome)
        try { out.push({ arquivo, series: lerDat(await fs.promises.readFile(arquivo, 'latin1')) }) }
        catch (e) { log.add(`  ERRO lendo ${nome}: ${(e as Error).message}`, 'erro') }
      }
    }
  }
  return out
}

/** Tira do .DAT os blocos desses pontos (guarda o original antes). Devolve o caminho final do arquivo. */
export async function excluirPontos(caminho: string, pontos: { bloco: number; hash: string }[], pastaBackup: string): Promise<string> {
  const partes = (await fs.promises.readFile(caminho, 'latin1')).split(SEPARADOR_DAT)
  const tirar = new Set<number>()
  for (const p of pontos) {
    if (p.bloco >= partes.length || hashBloco(partes[p.bloco]) !== p.hash) {
      throw new Error('o arquivo mudou desde a leitura, verifica de novo')
    }
    tirar.add(p.bloco - 1); tirar.add(p.bloco)     // o bloco e o ----- antes dele
  }
  await fs.promises.mkdir(pastaBackup, { recursive: true })
  await fs.promises.copyFile(caminho, await destinoLivre(pastaBackup, path.basename(caminho)))
  const tmp = caminho + '.tmp'
  await fs.promises.writeFile(tmp, partes.filter((_, i) => !tirar.has(i)).join(''), 'latin1')
  await fs.promises.rename(tmp, caminho)
  // mudou depois de enviado: tira o _Enviado pra aparecer como pendente
  const ext = path.extname(caminho)
  const sem = path.join(path.dirname(caminho), path.basename(caminho, ext).replace(RE_ENVIADO, '') + ext)
  if (sem !== caminho && !(await existe(sem))) {
    await fs.promises.rename(caminho, sem)
    return sem
  }
  return caminho
}

export async function pastaBackupAgora(): Promise<string> {
  const d = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  return path.join(await caminhoDados(ARQUIVO_BACKUP),
    `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`)
}

/* ── 4) finalizar / reabrir ─────────────────────────────────────────────── */

/** Move a pasta inteira. Se o destino já existe, mescla arquivo a arquivo sem sobrescrever. */
async function moverMesclando(origem: string, destino: string) {
  if (!(await existe(destino))) {
    await fs.promises.mkdir(path.dirname(destino), { recursive: true })
    await fs.promises.rename(origem, destino)       // mesma unidade: instantâneo
    return
  }
  const pastas = await percorrer(origem)
  for (const { pasta, arquivos } of pastas) {
    const alvoDir = path.normalize(path.join(destino, path.relative(origem, pasta)))
    await fs.promises.mkdir(alvoDir, { recursive: true })
    for (const nome of arquivos) await moverArquivo(path.join(pasta, nome), await destinoLivre(alvoDir, nome))
  }
  for (const { pasta } of pastas.sort((a, b) => b.pasta.length - a.pasta.length)) {
    await fs.promises.rmdir(pasta).catch(() => {})
  }
}

export async function finalizar(raiz: string, pastas: string[], log: Log): Promise<string> {
  let ok = 0, err = 0
  for (const p of pastas) {
    const nome = path.basename(p)
    try { await moverMesclando(p, path.join(raiz, PASTA_FINALIZADOS, nome)); log.add(`  finalizado  ${nome}`, 'ok'); ok++ }
    catch (e) { log.add(`  ERRO  ${nome}: ${(e as Error).message}`, 'erro'); err++ }
  }
  return `${ok} finalizado(s) | ${err} erros`
}

export async function reabrir(raiz: string, pastas: string[], log: Log): Promise<string> {
  let ok = 0, err = 0
  for (const p of pastas) {
    const nome = path.basename(p)
    try { await moverMesclando(p, path.join(raiz, nome)); log.add(`  reaberto  ${nome}`, 'ok'); ok++ }
    catch (e) { log.add(`  ERRO  ${nome}: ${(e as Error).message}`, 'erro'); err++ }
  }
  return `${ok} reaberto(s) | ${err} erros`
}

export async function listarFinalizados(raiz: string): Promise<Finalizado[]> {
  const base = path.join(raiz, PASTA_FINALIZADOS)
  const itens = await Promise.all((await listar(base)).filter(e => e.isDirectory()).map(async e => {
    const caminho = path.join(base, e.name)
    return { nome: e.name, caminho, mtime: (await fs.promises.stat(caminho).catch(() => null))?.mtimeMs ?? 0 }
  }))
  return itens.sort((a, b) => b.mtime - a.mtime)
}

/* ── dados de ensaio por protocolo (para a agenda) ──────────────────────── */

export interface FonteEnsaios {
  pr: Protocolo
  /** pasta da norma (ou '' para .DAT solto) → arquivos .DAT com data */
  pastas: { pastaNorma: string; arquivo: string; mtime: number; tamanho: number }[]
}

/** .DAT de uma pasta de protocolo: pastaBase\<norma>\…\*.dat e .DAT soltos em pastaBase. */
export async function datsDoProtocolo(pastaBase: string): Promise<FonteEnsaios['pastas']> {
  const out: FonteEnsaios['pastas'] = []
  for (const { pasta, arquivos } of await percorrer(pastaBase)) {
    const relativo = path.relative(pastaBase, pasta)
    const pastaNorma = relativo ? relativo.split(/[\\/]/)[0] : ''
    for (const nome of arquivos.filter(ehDat)) {
      const st = await fs.promises.stat(path.join(pasta, nome)).catch(() => null)
      if (st) out.push({ pastaNorma, arquivo: nome, mtime: st.mtimeMs, tamanho: st.size })
    }
  }
  return out
}

export { lerProtocolo, mesmoProtocolo }
