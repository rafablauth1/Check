// Roda lib/vigia/seg7.ts (opencv.js 5.0.0) nos casos gravados pelo Python e compara.
// Uso: REPO_APP=... node --experimental-transform-types --import ../loader-alias.mjs comparar_seg7.mjs <pasta-casos>
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pasta = process.argv[2]
const seg7 = await import('@/lib/vigia/seg7')
let cv = require(path.join(process.env.REPO_APP, 'node_modules/@techstark/opencv-js'))
if (cv instanceof Promise) cv = await cv
else if (!cv.Mat) await new Promise(r => { cv.onRuntimeInitialized = r })

const casos = JSON.parse(fs.readFileSync(path.join(pasta, 'casos.json'), 'utf8'))
let iguaisTexto = 0, iguaisSeg = 0, maxDifFrac = 0
const difs = []
const t0 = Date.now()
for (const c of casos) {
  const bgr = fs.readFileSync(path.join(pasta, c.nome + '.bin'))
  const img = new cv.Mat(c.h, c.w, cv.CV_8UC3)
  img.data.set(bgr)
  const r = seg7.lerCampo(cv, img, seg7.campoDe(c.campo), 'BGR')
  img.delete()
  const okTexto = r.texto === c.py.texto && (r.valor === c.py.valor || (r.valor !== null && c.py.valor !== null && Math.abs(r.valor - c.py.valor) < 1e-12))
  let okSeg = r.segmentos.length === c.py.segmentos.length
  r.segmentos.forEach((d, i) => d.forEach((s, j) => {
    const p = c.py.segmentos[i]?.[j]
    if (!p) { okSeg = false; return }
    for (let k = 0; k < 4; k++) if (s[k] !== p[k]) okSeg = false
    const df = Math.abs(s[4] - p[4]); maxDifFrac = Math.max(maxDifFrac, df)
    if (df > 1e-12 || s[5] !== p[5]) okSeg = false
  }))
  if (okTexto) iguaisTexto++
  if (okSeg) iguaisSeg++
  if (!okTexto || !okSeg) difs.push(`${c.nome} (${c.campo.binarizacao}, dilatar ${c.campo.dilatar}, inclin ${c.campo.inclinacao.toFixed(2)}): py '${c.py.texto}' ts '${r.texto}'${okSeg ? '' : ' | segmentos diferentes'}`)
}
console.log(`${casos.length} casos em ${Date.now() - t0} ms`)
console.log(`texto+valor iguais: ${iguaisTexto}/${casos.length}`)
console.log(`segmentos (retângulos, frações, aceso) idênticos: ${iguaisSeg}/${casos.length} — maior diferença de fração ${maxDifFrac}`)
difs.slice(0, 15).forEach(d => console.log('  ' + d))
