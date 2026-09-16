/* Criptografia em repouso dos arquivos de dados — FONTE ÚNICA.
 *
 * Estava duplicada entre electron/main.js e lib/dados.ts. Duas cópias de uma
 * chave de criptografia é o tipo de duplicação que não avisa quando diverge:
 * ninguém percebe até o dia em que um lado grava e o outro não consegue ler —
 * e aí o arquivo parece "corrompido" com os dados intactos lá dentro.
 *
 * Sobre o que isso protege: os arquivos ficam numa pasta de rede que o
 * laboratório inteiro enxerga, e a criptografia existe pra impedir que alguém
 * abra o .json num editor e bagunce o formato sem querer. A chave sai do
 * próprio código, então NÃO é proteção contra quem quer extraí-la — é barreira
 * contra edição manual acidental, e é assim que deve ser descrita.
 *
 * CommonJS de propósito: usada pelo processo principal do Electron (require) e
 * pelo lado servidor do Next (import).
 */

const crypto = require('crypto')

const ENC_MAGIC = 'CISPR15ENC1:'
const ENC_KEY = crypto.scryptSync('cispr15-labelo-dados-em-repouso', 'cispr15-labelo-salt-fixo', 32)

function encriptar(json) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc = Buffer.concat([cipher.update(json, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_MAGIC + Buffer.concat([iv, tag, enc]).toString('base64')
}

function decriptar(conteudo) {
  const buf = Buffer.from(conteudo.slice(ENC_MAGIC.length), 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const dados = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(dados), decipher.final()]).toString('utf-8')
}

/** Está criptografado, ou é um .json puro de antes desta mudança? */
function estaCriptografado(bruto) {
  return typeof bruto === 'string' && bruto.startsWith(ENC_MAGIC)
}

module.exports = { ENC_MAGIC, ENC_KEY, encriptar, decriptar, estaCriptografado }
