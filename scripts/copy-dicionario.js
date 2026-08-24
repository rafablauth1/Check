// Copia o dicionário pt-BR (hunspell) de node_modules/dictionary-pt para public/,
// assim ele vira asset estático servido pelo próprio app (offline, sem depender
// do corretor nativo do Chromium/Electron — ver electron/main.js: spellcheck:false).
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const src = path.join(root, 'node_modules', 'dictionary-pt')
const dst = path.join(root, 'public', 'dicionario')

if (!fs.existsSync(src)) {
  console.log('[copy-dicionario] node_modules/dictionary-pt ausente; nada a copiar.')
  process.exit(0)
}

fs.mkdirSync(dst, { recursive: true })
fs.copyFileSync(path.join(src, 'index.aff'), path.join(dst, 'pt-br.aff'))
fs.copyFileSync(path.join(src, 'index.dic'), path.join(dst, 'pt-br.dic'))
console.log('[copy-dicionario] dictionary-pt -> public/dicionario OK')
