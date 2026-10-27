// uso: node extrair.js <repo-app> <pasta-saida> <docId>=<arquivo.pdf> ...
// Recorta figuras e tabelas dos PDFs IEC (páginas em inglês) → <saida>/<docId>/{fig|tab}-N.png + meta.json
const fs = require('fs'), path = require('path')
const [, , repo, saida, ...pares] = process.argv
const puppeteer = require(path.join(repo, 'node_modules/puppeteer-core'))
const { pathToFileURL } = require('url')

;(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: 'new',
    args: ['--allow-file-access-from-files'], protocolTimeout: 600000,
  })
  const p = await b.newPage()
  p.on('pageerror', e => console.error('pageerror', String(e)))
  await p.goto(pathToFileURL(path.join(__dirname, 'render.html')).href)
  for (const par of pares) {
    const [docId, pdf] = par.split('=')
    const t0 = Date.now()
    const itens = await p.evaluate((u, e) => processar(u, e), pathToFileURL(pdf).href, 2.5)
    const dir = path.join(saida, docId)
    fs.mkdirSync(dir, { recursive: true })
    const vistos = new Set(), meta = []
    for (const it of itens) {
      // figura "B.1" que é só a soma das sub-figuras B.1a/B.1b já recortadas: não duplica
      if (it.pequena && itens.some(o => o !== it && o.tipo === it.tipo && new RegExp(`^${it.numero.replace('.', '\\.')}[a-z]$`).test(o.numero))) continue
      const nome = `${it.tipo === 'Figure' ? 'fig' : 'tab'}-${it.numero.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '')}.png`
      if (vistos.has(nome)) continue                 // mesma legenda repetida (ex.: página seguinte): fica a primeira
      vistos.add(nome)
      fs.writeFileSync(path.join(dir, nome), Buffer.from(it.png, 'base64'))
      const { png, ...resto } = it
      meta.push({ arquivo: nome, ...resto })
    }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1))
    console.log(`${docId.padEnd(32)} ${meta.filter(m => m.tipo === 'Figure').length} figuras, ${meta.filter(m => m.tipo === 'Table').length} tabelas  (${Math.round((Date.now() - t0) / 1000)} s)`)
  }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
