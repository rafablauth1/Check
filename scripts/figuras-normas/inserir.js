// uso: node inserir.js <pasta-out> <pasta-base> <pasta-saida>
// Coloca figuras/tabelas (out/<doc>/meta.json + PNGs) no .md de cada norma, antes da legenda.
// Idempotente: imagem que já está no .md não entra de novo. Grava em <pasta-saida> (prévia).
const fs = require('fs'), path = require('path')
const [, , out, base, saida] = process.argv
fs.mkdirSync(saida, { recursive: true })

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const limpa = s => s.replace(/\s+ñ\s+/g, ' – ').replace(/\s+/g, ' ').trim()    // 4-11: travessão vem como "ñ"

for (const doc of fs.readdirSync(out)) {
  const arqMd = path.join(base, doc + '.md')
  if (!fs.existsSync(arqMd)) { console.log(`${doc}: sem .md na base`); continue }
  let md = fs.readFileSync(arqMd, 'utf8')
  const meta = JSON.parse(fs.readFileSync(path.join(out, doc, 'meta.json'), 'utf8'))
  const inicioCorpo = md.indexOf('\n---', 4) + 4                 // depois do cabeçalho (frontmatter)
  const posicoes = []                                             // [índice, bloco]
  const semLugar = []
  const conta = { legenda: 0, titulo: 0, principal: 0, depois: 0, fim: 0, ja: 0 }
  let anterior = -1                                               // onde ficou a figura/tabela anterior (ordem das páginas)

  for (const m of meta) {
    const ref = `img/${doc}/${m.arquivo}`
    if (md.includes(`](${ref})`)) { conta.ja++; continue }
    const legenda = limpa(m.legenda)
    let bloco = `![${legenda}](${ref})`
    if (m.tipo === 'Table' && m.md) {
      bloco += `\n\n**${legenda}** — transcrição automática do PDF; confira os valores na imagem acima.\n\n${m.md}`
    }
    const achar = re => { re.lastIndex = inicioCorpo; const r = re.exec(md); return r ? r.index : -1 }
    // 1) a própria legenda "Figure 11 – " (não a citação "see Figure 11")
    let i = achar(new RegExp(`${m.tipo}\\s+${esc(m.numero)}\\s+[–\\-ñ]\\s`, 'g'))
    if (i >= 0) conta.legenda++
    // 2) legenda quebrada na conversão: pelo começo do título
    if (i < 0 && m.titulo.length > 12) {
      i = achar(new RegExp(esc(limpa(m.titulo).slice(0, 35)).replace(/\\? /g, '\\s+'), 'g'))
      if (i >= 0) conta.titulo++
    }
    // 3) sub-figura (A.1a, 1b)): junto da legenda da figura principal
    const princ = m.numero.match(/^(.+?\d)[a-z]\)?$/)
    if (i < 0 && princ) {
      i = achar(new RegExp(`${m.tipo}\\s+${esc(princ[1])}\\s+[–\\-ñ]\\s`, 'g'))
      if (i >= 0) conta.principal++
    }
    // 4) legenda sumiu do texto (a conversão tirou linhas repetidas 3×: sumário, legenda, versão
    //    redline). Item de anexo (C.1): no começo do anexo, depois do que já foi posto nele;
    //    senão logo depois da figura/tabela anterior, no fim do parágrafo da legenda dela
    const anexo = m.numero.match(/^([A-J])\./)
    if (i < 0 && anexo) {
      const ini = achar(new RegExp(`Annex\\s+${anexo[1]}\\b`, 'g'))
      if (ini >= 0) {
        const ref = Math.max(ini, anterior)
        const fimPar = md.indexOf('\n\n', ref)
        i = fimPar < 0 ? md.length : fimPar
        conta.depois++
      }
    }
    if (i < 0 && anterior >= 0) {
      const fimPar = md.indexOf('\n\n', anterior)
      i = fimPar < 0 ? md.length : fimPar
      conta.depois++
    }
    if (i < 0) { semLugar.push(bloco); conta.fim++; continue }
    posicoes.push([i, bloco])
    anterior = i
  }

  // de trás para frente, para os índices continuarem valendo; mesma posição mantém a ordem
  posicoes.map((p, k) => [...p, k]).sort((a, b) => b[0] - a[0] || b[2] - a[2])
    .forEach(([i, bloco]) => { md = md.slice(0, i).replace(/[ \t]+$/, '') + `\n\n${bloco}\n\n` + md.slice(i) })
  if (semLugar.length) md = md.trimEnd() + '\n\n## Figuras e tabelas (sem lugar certo no texto)\n\n' + semLugar.join('\n\n') + '\n'
  md = md.replace(/\n{3,}/g, '\n\n')
  fs.writeFileSync(path.join(saida, doc + '.md'), md, 'utf8')
  console.log(`${doc.padEnd(32)} ${meta.length} itens → pela legenda ${conta.legenda}, pelo título ${conta.titulo}, junto da principal ${conta.principal}, no fim ${conta.fim}, já estavam ${conta.ja}`)
}
