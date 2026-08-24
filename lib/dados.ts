import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { readSettings, getUserDataDir } from '@/lib/settings-server'

async function getDadosDir(): Promise<string> {
  const { cadastrosFolder } = await readSettings()
  // cadastrosFolder já vem com um padrão de rede (ver lib/settings-server.ts).
  // NUNCA usar process.cwd(): no app empacotado é a pasta de instalação
  // (somente leitura) → escrita falha e "não salva" grupos/labs/equipamentos.
  return cadastrosFolder || path.join(getUserDataDir(), 'dados')
}

/** Caminho absoluto de um arquivo de dados. */
export async function caminhoDados(arquivo: string): Promise<string> {
  return path.join(await getDadosDir(), arquivo)
}

// ── criptografia em repouso ────────────────────────────────────────────────
// Os arquivos de dados ficam em pasta de rede compartilhada por todo mundo —
// qualquer pessoa com acesso à pasta poderia abrir o .json num editor e
// bagunçar o formato sem querer. Gravando o conteúdo criptografado, um editor
// de texto comum só mostra bytes ilegíveis; só o app (que tem a chave) lê/edita.
// Não é proteção contra alguém disposto a extrair a chave do próprio app — é
// uma barreira contra edição manual acidental/casual fora do software.
// MESMA lógica duplicada em electron/main.js (arquivos de agenda/relatórios/
// clientes não passam por este módulo).
const ENC_MAGIC = 'CISPR15ENC1:'
const ENC_KEY = crypto.scryptSync('cispr15-labelo-dados-em-repouso', 'cispr15-labelo-salt-fixo', 32)

function encriptar(json: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc = Buffer.concat([cipher.update(json, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_MAGIC + Buffer.concat([iv, tag, enc]).toString('base64')
}

function decriptar(conteudo: string): string {
  const buf = Buffer.from(conteudo.slice(ENC_MAGIC.length), 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const dados = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(dados), decipher.final()]).toString('utf-8')
}

/** Lê o conteúdo de um arquivo já decriptografando-o; arquivos legados
 *  (JSON puro, de antes desta mudança) são devolvidos como estão. */
function lerConteudo(conteudo: string): { texto: string; legado: boolean } {
  if (conteudo.startsWith(ENC_MAGIC)) return { texto: decriptar(conteudo), legado: false }
  return { texto: conteudo, legado: true }
}

// Espelha o arquivo (já criptografado) numa segunda pasta de rede, se
// configurada — best-effort: nunca lança, nunca atrasa/bloqueia o save
// principal (ver lib/settings-server.ts: mirrorFolder).
async function espelhar(arquivo: string, conteudo: string): Promise<void> {
  const { mirrorFolder } = await readSettings()
  if (!mirrorFolder) return
  try {
    const mp = path.join(mirrorFolder, arquivo)
    await fs.promises.mkdir(path.dirname(mp), { recursive: true })
    const tmp = `${mp}.tmp.${process.pid}.${Date.now()}`
    await fs.promises.writeFile(tmp, conteudo, 'utf-8')
    await fs.promises.rename(tmp, mp)
  } catch {}
}

// ASSÍNCRONOS (fs.promises): leitura/escrita síncrona no processo do servidor Next
// congela a janela inteira (inclusive a digitação) durante o I/O — pior em pasta de
// rede (arquivos como instrucoes.json chegam a ~700KB e vivem em SMB). Ver o mesmo
// fix já aplicado em electron/main.js (readDataFile/writeDataFile, readAgendaFile/
// writeAgendaFile).

// Lê um JSON (criptografado em repouso). Se o arquivo principal existir mas
// estiver corrompido/ilegível, tenta o backup .bak antes de cair no padrão —
// assim um arquivo truncado não apaga os dados na próxima leitura. (Arquivo
// ausente → padrão, como antes.) Arquivo legado (JSON puro, de antes da
// criptografia) é lido normalmente e migrado em segundo plano.
export async function lerJSON<T>(arquivo: string, padrao: T): Promise<T> {
  const p = await caminhoDados(arquivo)
  const tentar = async (caminho: string): Promise<T> => {
    const bruto = await fs.promises.readFile(caminho, 'utf-8')
    const { texto, legado } = lerConteudo(bruto)
    const dados = JSON.parse(texto) as T
    if (legado) escreverJSON(arquivo, dados).catch(() => {})
    return dados
  }
  try {
    return await tentar(p)
  } catch {
    try { return await tentar(p + '.bak') } catch {}
  }
  return padrao
}

// Escrita ATÔMICA: grava num .tmp e faz rename (atômico no mesmo volume), mantendo
// um .bak da versão anterior. O arquivo final nunca fica pela metade. Se o rename
// falhar em algum filesystem, cai pra escrita direta — nunca perde a capacidade de salvar.
// Conteúdo vai criptografado em repouso, e uma cópia é espelhada em mirrorFolder (se
// configurada) — ver comentários acima.
export async function escreverJSON(arquivo: string, dados: unknown): Promise<void> {
  const p = await caminhoDados(arquivo)
  await fs.promises.mkdir(path.dirname(p), { recursive: true })
  const conteudo = encriptar(JSON.stringify(dados, null, 2))

  // backup da versão atual antes de sobrescrever
  try { await fs.promises.copyFile(p, p + '.bak') } catch {}

  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`
  try {
    await fs.promises.writeFile(tmp, conteudo, 'utf-8')
    await fs.promises.rename(tmp, p)   // atômico no mesmo volume
  } catch {
    // Fallback robusto: escrita direta (ex.: filesystem sem rename atômico).
    try { await fs.promises.unlink(tmp) } catch {}
    await fs.promises.writeFile(p, conteudo, 'utf-8')
  }

  espelhar(arquivo, conteudo).catch(() => {})
}
