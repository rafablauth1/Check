// postbuild: o Next com output:'standalone' NÃO copia .next/static nem public
// para .next/standalone. Sem isso, rodar via `electron .` (fora do instalador)
// serve o app sem CSS/JS — "todo zuado". Este script copia os dois após o build.
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const standalone = path.join(root, '.next', 'standalone')

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.log('[copy-standalone-assets] .next/standalone ausente; nada a copiar.')
  process.exit(0)
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

/* O rastreador do Next não leva TUDO de .next/server para o standalone: já
   ficaram de fora chunks de servidor (ex.: um chunk do date-fns exigido pelo
   _document) e o font-manifest.json. Falta um arquivo desses e o servidor
   empacotado morre no primeiro request com "Cannot find module ./chunks/NNNN.js"
   — o app abre e fica numa tela de erro, sem pista nenhuma na interface.
   Aqui completamos o que faltar: copiar a mais é inofensivo, faltar não é. */
function copiarFaltantes(src, dst) {
  if (!fs.existsSync(src)) return 0
  fs.mkdirSync(dst, { recursive: true })
  let copiados = 0
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copiados += copiarFaltantes(s, d)
    else if (!fs.existsSync(d)) { fs.copyFileSync(s, d); copiados++ }
  }
  return copiados
}

const serverSrc = path.join(root, '.next', 'server')
const serverDst = path.join(standalone, '.next', 'server')
const faltavam = copiarFaltantes(serverSrc, serverDst)
console.log(`[copy-standalone-assets] .next/server: ${faltavam} arquivo(s) que faltavam no standalone`)

/* Busca por significado da Base de Conhecimento: o @huggingface/transformers é
   carregado com import() dinâmico e o onnxruntime-node acha o binário por um
   caminho montado em tempo de execução — o rastreador do Next não vê nenhum
   dos dois. Sem eles o app empacotado volta, calado, à busca só por palavras.
   Leva só o necessário no Windows x64 (~40 MB em vez de ~350 MB). */
const DEPS_BUSCA = [
  ['@huggingface/transformers', ['package.json', 'dist/transformers.node.mjs', 'dist/transformers.node.cjs']],
  ['onnxruntime-node', ['package.json', 'dist', 'bin/napi-v3/win32/x64']],
  ['onnxruntime-common', ['package.json', 'dist']],
]
for (const [pacote, partes] of DEPS_BUSCA) {
  const de = path.join(root, 'node_modules', pacote)
  const para = path.join(standalone, 'node_modules', pacote)
  if (!fs.existsSync(de)) { console.log(`[copy-standalone-assets] ${pacote} ausente em node_modules`); continue }
  for (const p of partes) {
    const s = path.join(de, p), d = path.join(para, p)
    if (!fs.existsSync(s)) throw new Error(`[copy-standalone-assets] falta ${pacote}/${p}`)
    if (fs.statSync(s).isDirectory()) copyDir(s, d)
    else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d) }
  }
}
console.log('[copy-standalone-assets] busca por significado (transformers + onnxruntime) -> standalone OK')

const staticSrc = path.join(root, '.next', 'static')
if (fs.existsSync(staticSrc)) {
  copyDir(staticSrc, path.join(standalone, '.next', 'static'))
  console.log('[copy-standalone-assets] .next/static -> standalone OK')
}

const publicSrc = path.join(root, 'public')
if (fs.existsSync(publicSrc)) {
  fs.rmSync(path.join(standalone, 'public'), { recursive: true, force: true })
  copyDir(publicSrc, path.join(standalone, 'public'))
  console.log('[copy-standalone-assets] public -> standalone OK')
}
