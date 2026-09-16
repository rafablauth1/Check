/* Log de erros do processo principal.
 *
 * Existe por causa de uma caçada concreta: "o Enviar cópia não vai pra pasta"
 * levou horas porque cada falha no caminho morria num `catch {}` mudo — não
 * sobrava rastro nenhum de qual caminho o app tentou nem por que desistiu.
 *
 * Regras:
 *  - NUNCA lança. Log que quebra o app é pior que log nenhum.
 *  - Rotaciona sozinho (um arquivo atual + um anterior), pra não crescer sem
 *    limite numa máquina que fica meses aberta.
 *  - Grava em userData, que é local: escrever log em pasta de rede seria
 *    justamente o I/O que costuma estar falhando quando há o que registrar.
 */

const fs   = require('fs')
const path = require('path')

const LIMITE_BYTES = 2 * 1024 * 1024   // 2MB por arquivo

let arquivoLog = null

/** Chamado uma vez no boot, depois que o userData já está definido
 *  (o modo portátil troca esse caminho — ver app.setPath em main.js). */
function configurarLog(userDataDir) {
  arquivoLog = path.join(userDataDir, 'cispr15.log')
}

function rotacionarSePreciso() {
  try {
    const { size } = fs.statSync(arquivoLog)
    if (size < LIMITE_BYTES) return
    // Mantém só a geração anterior: quem investiga quer o que acabou de
    // acontecer, não o histórico de meses.
    try { fs.rmSync(arquivoLog + '.1', { force: true }) } catch {}
    fs.renameSync(arquivoLog, arquivoLog + '.1')
  } catch { /* arquivo ainda não existe */ }
}

/** Registra uma falha. `dados` é o contexto que faltou nas investigações
 *  passadas: caminhos tentados, protocolo, nº do relatório. */
function logErro(contexto, err, dados) {
  if (!arquivoLog) return
  try {
    rotacionarSePreciso()
    const msg = err && (err.stack || err.message || String(err))
    const extra = dados ? ' ' + JSON.stringify(dados) : ''
    fs.appendFileSync(arquivoLog, `${new Date().toISOString()} [${contexto}]${extra} ${msg ?? ''}\n`, 'utf-8')
  } catch {}
}

/** Para eventos que não são erro mas explicam um resultado — "achei 0 PDFs
 *  nesta pasta", "protocolo sem pasta". É o que responde "por que não foi?". */
function logInfo(contexto, dados) {
  if (!arquivoLog) return
  try {
    rotacionarSePreciso()
    fs.appendFileSync(arquivoLog, `${new Date().toISOString()} [${contexto}] ${JSON.stringify(dados ?? {})}\n`, 'utf-8')
  } catch {}
}

function caminhoDoLog() { return arquivoLog }

module.exports = { configurarLog, logErro, logInfo, caminhoDoLog }
