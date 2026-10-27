// uso: node pagina.js <repo-app> <arquivo.pdf> <n> <saida.png> — página inteira em PNG
const fs = require('fs'), path = require('path')
const [, , repo, pdf, n, saida] = process.argv
const puppeteer = require(path.join(repo, 'node_modules/puppeteer-core'))
const { pathToFileURL } = require('url')
;(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files'] })
  const p = await b.newPage()
  await p.goto(pathToFileURL(path.join(__dirname, 'render.html')).href)
  fs.writeFileSync(saida, Buffer.from(await p.evaluate((u, k) => renderPagina(u, k, 1.2), pathToFileURL(pdf).href, Number(n)), 'base64'))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
