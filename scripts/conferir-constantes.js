/* Garante que as constantes duplicadas entre o processo principal do Electron
 * e o lado servidor do Next continuem IGUAIS.
 *
 * Por que existe uma duplicação, já que duplicar é ruim: tentamos ter fonte
 * única de verdade com `require('./lib/network-paths')` dentro dos módulos
 * TS, e o build do Next passou a estourar a heap — o require de CommonJS dentro
 * de um módulo compilado como ESM arrasta o módulo (e o `crypto` dele) pro
 * grafo do webpack dos dois lados. A cópia voltou, mas com este guarda.
 *
 * O que a duplicação quebra quando diverge, e por isso vale um script:
 *  - caminho de rede diferente → Electron e servidor Next gravam em pastas
 *    diferentes, e os dados "somem" dependendo de qual tela salvou;
 *  - chave de criptografia diferente → um lado grava e o outro não lê, e o
 *    arquivo parece corrompido com os dados intactos dentro.
 *
 * Roda no prebuild e antes do dist. Sai com código 1 se algo divergir.
 */

const fs   = require('fs')
const path = require('path')

const raiz = path.join(__dirname, '..')
const rede   = require(path.join(raiz, 'electron', 'lib', 'network-paths'))
const cripto = require(path.join(raiz, 'electron', 'lib', 'cripto-dados'))

const ler = rel => fs.readFileSync(path.join(raiz, rel), 'utf-8')

// Pega o valor de uma string literal declarada em TS: export const NOME = '...'
function constanteTs(fonte, nome) {
  const re = new RegExp('const\\s+' + nome + "\\s*(?::\\s*string)?\\s*=\\s*\\n?\\s*'([^']*)'")
  const m = fonte.match(re)
  if (!m) return null
  return m[1].split('\\\\').join('\\')   // desescapa as barras invertidas do fonte
}

const problemas = []

// ── 1. caminhos de rede ────────────────────────────────────────────────────
const settingsServer = ler('lib/settings-server.ts')
const caminhos = [
  ['CADASTROS_FOLDER_PADRAO', rede.CADASTROS_FOLDER_PADRAO],
  ['MIRROR_FOLDER_PADRAO',    rede.MIRROR_FOLDER_PADRAO],
]
for (const [nome, esperado] of caminhos) {
  const achado = constanteTs(settingsServer, nome)
  if (achado === null) problemas.push(`lib/settings-server.ts: não achei a constante ${nome}`)
  else if (achado !== esperado) {
    problemas.push(
      `${nome} divergiu:\n  electron/lib/network-paths.js : ${esperado}\n  lib/settings-server.ts  : ${achado}`
    )
  }
}

// ── 2. criptografia ────────────────────────────────────────────────────────
const dadosTs = ler('lib/dados.ts')

const magicTs = constanteTs(dadosTs, 'ENC_MAGIC')
if (magicTs !== cripto.ENC_MAGIC) {
  problemas.push(`ENC_MAGIC divergiu:\n  electron/lib/cripto-dados.js : ${cripto.ENC_MAGIC}\n  lib/dados.ts           : ${magicTs}`)
}

// A chave é derivada por scrypt(senha, sal): compara os dois argumentos, que é
// o que de fato define a chave.
const derivacaoTs = dadosTs.match(/scryptSync\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(\d+)\s*\)/)
const derivacaoJs = ler('electron/lib/cripto-dados.js').match(/scryptSync\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(\d+)\s*\)/)
if (!derivacaoTs || !derivacaoJs) {
  problemas.push('não consegui localizar a derivação scryptSync em um dos arquivos')
} else if (derivacaoTs.slice(1, 4).join('|') !== derivacaoJs.slice(1, 4).join('|')) {
  problemas.push(
    'derivação da chave divergiu:\n' +
    `  electron/lib/cripto-dados.js : scrypt(${derivacaoJs.slice(1, 4).join(', ')})\n` +
    `  lib/dados.ts           : scrypt(${derivacaoTs.slice(1, 4).join(', ')})`
  )
}

// ── resultado ──────────────────────────────────────────────────────────────
if (problemas.length) {
  console.error('\n[conferir-constantes] As cópias saíram de sincronia:\n')
  for (const p of problemas) console.error('  - ' + p + '\n')
  console.error('Alinhe os arquivos antes de buildar.\n')
  process.exit(1)
}

console.log('[conferir-constantes] caminhos de rede e criptografia em sincronia')
