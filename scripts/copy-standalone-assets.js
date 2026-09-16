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
