// uso: node tabelas.js <pasta-out> [docId tab-1 …] — remonta as tabelas (linhas com posição x) em markdown
// e grava em meta.json (campo "md"; "mdMotivo" quando não deu para remontar com confiança).
const fs = require('fs'), path = require('path')
const [, , out, soDoc, ...soTabs] = process.argv

// "NOTE …", "a Level x …" (notas usam a, b, c… — "x" é nível de ensaio, não nota): vira texto abaixo da tabela
const RODAPE = /^(NOTE\b|[a-h]\s|\*)/

function intervalos(itens) {
  const iv = itens.map(i => [i.x, i.x + Math.max(i.w, 2)]).sort((a, b) => a[0] - b[0])
  const out = []
  for (const [a, b] of iv) {
    const u = out[out.length - 1]
    if (u && a <= u[1] + 3) u[1] = Math.max(u[1], b); else out.push([a, b])
  }
  return out
}

/** Linha que é frase (nota embaixo da tabela): muitas palavras soltas com espaço normal entre elas. */
function prosa(r, largura) {
  // frase num pedaço só ("Measures should be taken to ensure …") que ocupa boa parte da tabela
  if (r.itens.length === 1) return r.txt.split(' ').length >= 7 && r.itens[0].w > 0.45 * largura
  if (r.itens.length < 6) return false
  const gaps = r.itens.slice(1).map((i, k) => i.x - (r.itens[k].x + r.itens[k].w)).sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)] < 8
}

function remontar(linhas) {
  // linhas de cima para baixo, sem lixo de marca d'água ("--`,,```,,")
  const rows = linhas.map(l => {
    const itens = l.itens.filter(i => i.s.trim() && !/^[-`,.'´"]+$/.test(i.s.trim())).sort((a, b) => a.x - b.x)
    return {
      y: l.y, itens, txt: itens.map(i => i.s).join(' ').replace(/\s+/g, ' ').trim(),
      negrito: itens.length ? itens.filter(i => i.b).length / itens.length : 0,
    }
  }).filter(r => r.itens.length && !r.itens.every(i => /^[a-z]$/.test(i.s.trim())))   // linha só de "a" sobrescrito
    .sort((a, b) => b.y - a.y)
  // a tabela acaba na primeira frase/nota; o resto vira texto abaixo dela
  const todos = rows.flatMap(r => r.itens)
  const largura = Math.max(...todos.map(i => i.x + i.w)) - Math.min(...todos.map(i => i.x))
  const corte = rows.findIndex((r, k) => k > 1 && (prosa(r, largura) || RODAPE.test(r.txt)))
  const notas = corte > 0 ? rows.splice(corte).map(r => r.txt) : []
  // índice de nota solto ("a" sobrescrito) colado no fim
  while (rows.length && /^[a-z]$/.test(rows[rows.length - 1].txt)) rows.pop()
  if (rows.length < 2) return { motivo: 'poucas linhas' }

  // colunas: pelas linhas "de dados" (as com mais pedaços, maioria)
  const cont = rows.map(r => intervalos(r.itens).length)
  const max = Math.max(...cont)
  if (max < 2) return { motivo: 'uma coluna só' }
  const dados = rows.filter((r, k) => cont[k] >= Math.max(2, max - 1))
  let cols = intervalos(dados.flatMap(r => r.itens))
  if (cols.length > 12) return { motivo: `colunas demais (${cols.length})` }
  if (cols.length < 2) return { motivo: 'colunas não separam' }

  const colDe = i => {
    const a = i.x, b = i.x + Math.max(i.w, 2)
    let melhor = 0, sobre = -Infinity
    cols.forEach(([c0, c1], k) => {
      const s = Math.min(b, c1) - Math.max(a, c0) - (Math.abs((a + b) / 2 - (c0 + c1) / 2) / 1000)
      if (s > sobre) { sobre = s; melhor = k }
    })
    return melhor
  }
  const grade = rows.map(r => {
    const cel = cols.map(() => [])
    for (const i of r.itens) cel[colDe(i)].push(i.s.trim())
    return cel.map(c => c.join(' ').replace(/\s+/g, ' ').trim())
  })

  // cabeçalho: linhas até a primeira linha cheia COM número ("1 | 0,5 | 5 or 100");
  // tabela só de texto: até a primeira linha cheia
  // Nas tabelas IEC o cabeçalho é em negrito: quando o PDF diz isso, vale o negrito.
  const cheia = c => c.filter(Boolean).length >= Math.ceil(cols.length * 0.75)
  let ini
  if (rows.some(r => r.negrito > 0.5) && rows.some(r => r.negrito < 0.5)) {
    ini = rows.findIndex(r => r.negrito < 0.5)
  } else {
    ini = grade.findIndex(c => cheia(c) && c.some(v => /\d/.test(v)))
    if (ini < 0) ini = grade.findIndex(cheia)
    if (ini === 0 && grade.length > 1) ini = grade.findIndex((c, k) => k > 0 && cheia(c))   // 1ª linha cheia é o próprio cabeçalho
  }
  if (ini < 0) return { motivo: 'nenhuma linha de dados cheia' }
  // linha só de unidades logo abaixo do cabeçalho ("kV | kHz | %") também é cabeçalho
  const UNIDADE = /^(\(?[kMmµ]?(V|A|Hz|W|s|Ω|F|H)\)?|%|dB\S*|V\/m|A\/m|°C|m)$/
  while (ini > 0 && ini < grade.length - 1 && grade[ini].some(Boolean) && grade[ini].every(v => !v || UNIDADE.test(v))) ini++
  let cab = cols.map((_, k) => grade.slice(0, ini).map(c => c[k]).filter(Boolean).join(' '))
  // linhas de dados; continuação de texto quebrado vai para a linha de cima:
  // 1ª coluna vazia com poucas células, ou células começando em minúscula/"("
  const corpo = []
  for (const c of grade.slice(ini)) {
    const cheias = c.filter(Boolean).length
    const ant = corpo[corpo.length - 1]
    const continua = ant && (
      (!c[0] && cheias <= Math.max(1, Math.floor(cols.length / 2))) ||
      // palavra em minúscula ou "(" — mas não um "x" sozinho (nível de ensaio "x")
      /^([a-z]{2,}|\()/.test(c[0] || (cheias < cols.length ? c.find(Boolean) ?? '' : '')))
    if (continua) c.forEach((v, k) => { if (v) ant[k] = (ant[k] + ' ' + v).trim() })
    else corpo.push([...c])
  }
  // coluna vazia em todas as linhas (índice/subscrito solto, ex.: o "p" de Vp): junta à vizinha
  for (let k = cols.length - 1; k >= 0 && cols.length > 2; k--) {
    if (corpo.some(c => c[k])) continue
    const viz = k > 0 ? k - 1 : k + 1
    cab[viz] = [k > 0 ? cab[viz] : cab[k], k > 0 ? cab[k] : cab[viz]].filter(Boolean).join(' ')
    cab.splice(k, 1); cols.splice(k, 1); corpo.forEach(c => c.splice(k, 1))
  }
  const vazias = corpo.flat().filter(v => !v).length / (corpo.length * cols.length)
  if (vazias > 0.45) return { motivo: `muitas células vazias (${Math.round(vazias * 100)}%)` }

  const esc = v => v.replace(/\|/g, '/')
  const temCab = cab.some(Boolean)
  const cabec = temCab ? cab : corpo.shift()
  const md = [
    `| ${cabec.map(esc).join(' | ')} |`,
    `| ${cols.map(() => '---').join(' | ')} |`,
    ...corpo.map(c => `| ${c.map(esc).join(' | ')} |`),
  ].join('\n')
  return { md, notas, colunas: cols.length, linhas: corpo.length }
}

for (const doc of fs.readdirSync(out)) {
  if (soDoc && doc !== soDoc) continue
  const f = path.join(out, doc, 'meta.json')
  const meta = JSON.parse(fs.readFileSync(f, 'utf8'))
  let ok = 0, nao = 0
  for (const m of meta) {
    if (m.tipo !== 'Table') continue
    if (soTabs.length && !soTabs.includes(m.arquivo.replace('.png', ''))) continue
    const r = remontar(m.linhas || [])
    delete m.md; delete m.mdMotivo; delete m.mdNotas
    if (r.md) { m.md = r.md; m.mdNotas = r.notas; ok++ } else { m.mdMotivo = r.motivo; nao++ }
    if (soTabs.length) console.log(`\n### ${doc} ${m.legenda}\n${r.md ?? '(não remontou: ' + r.motivo + ')'}${r.notas?.length ? '\n' + r.notas.join('\n') : ''}`)
  }
  fs.writeFileSync(f, JSON.stringify(meta, null, 1))
  if (!soTabs.length) console.log(`${doc.padEnd(32)} tabelas remontadas ${ok}, só imagem ${nao}` +
    (nao ? `  (${meta.filter(m => m.mdMotivo).map(m => m.arquivo.replace('.png', '') + ': ' + m.mdMotivo).join('; ')})` : ''))
}
