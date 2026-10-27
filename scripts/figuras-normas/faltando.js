// uso: node faltando.js <pasta-out> <pasta-base> — legendas "Figure/Table N –" no .md que não viraram imagem
const fs = require('fs'), path = require('path')
const [, , out, base] = process.argv
for (const doc of fs.readdirSync(out)) {
  const meta = JSON.parse(fs.readFileSync(path.join(out, doc, 'meta.json'), 'utf8'))
  const tem = new Set(meta.map(m => `${m.tipo} ${m.numero}`))
  const md = fs.readFileSync(path.join(base, doc + '.md'), 'utf8')
  const noTexto = new Set([...md.matchAll(/(Figure|Table)\s+([A-Z]\.\d+|\d+[a-z]?\)?)\s+[–\-ñ]\s/g)].map(m => `${m[1]} ${m[2]}`))
  const falta = [...noTexto].filter(x => !tem.has(x))
  const sobra = [...tem].filter(x => !noTexto.has(x))
  const peq = meta.filter(m => m.altura < 220).map(m => `${m.arquivo}(${m.altura}px)`)
  console.log(`${doc.padEnd(32)} ${meta.length} imagens | sem imagem: ${falta.join(', ') || '—'} | não acha no texto: ${sobra.join(', ') || '—'} | pequenas: ${peq.join(', ') || '—'}`)
}
