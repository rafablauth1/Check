const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:3939'
const OUT  = path.join(require('os').tmpdir(), 'cispr15-shots')
fs.mkdirSync(OUT, { recursive: true })

const routes = [
  ['dashboard',            '/dashboard'],
  ['cispr15-form',         '/cispr15'],
  ['agenda',               '/agenda'],
  ['equipamentos',         '/equipamentos'],
  ['equipamentos-grupos',  '/equipamentos/grupos'],
  ['normas',               '/normas'],
  ['checagens',            '/checagens'],
  ['checagens-templates',  '/checagens/templates'],
  ['procedimentos',        '/procedimentos'],
  ['instrucoes',           '/procedimentos/instrucoes'],
  ['grandezas',            '/grandezas'],
  ['certificados',         '/certificados'],
  ['configuracoes',        '/configuracoes'],
]

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,900', '--hide-scrollbars'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 })

  for (const [name, route] of routes) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 30000 })
      await new Promise(r => setTimeout(r, 1800)) // deixa animar/carregar dados
      const file = path.join(OUT, name + '.png')
      await page.screenshot({ path: file })
      console.log('OK   ' + name + '  ->  ' + file)
    } catch (e) {
      console.log('FAIL ' + name + '  ' + e.message)
    }
  }
  await browser.close()
  console.log('DONE ' + OUT)
})()
