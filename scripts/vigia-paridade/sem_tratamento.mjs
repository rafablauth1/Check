// semTratamento() (camera-proc.ts) diz quando a tela pode mostrar o vídeo direto, sem o quadro voltar do
// worker. Confere com o próprio ProcessadorCamera: quando ela diz true, obter(acumular(f)) tem de ser
// byte a byte igual a f; e cada filtro ligado tem de mudar o quadro (senão a regra está larga demais).
// Uso: REPO_APP=... node --experimental-transform-types --no-warnings --import ./loader-alias.mjs sem_tratamento.mjs
import path from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { ProcessadorCamera, semTratamento } = await import('@/lib/vigia/camera-proc')
let cv = require(path.join(process.env.REPO_APP, 'node_modules/@techstark/opencv-js'))
if (cv instanceof Promise) cv = await cv
else if (!cv.Mat) await new Promise(r => { cv.onRuntimeInitialized = r })

const W = 320, H = 180
const f = new cv.Mat(H, W, cv.CV_8UC3)
for (let i = 0; i < f.data.length; i++) f.data[i] = (i * 2654435761) >>> 24
const casos = [
  [{}, false, true],
  [{ filtros: { media_n: 1, mediana: 0, desfoque: 0, contraste: 1, brilho: 0, nitidez: 0, clahe: false, perspectiva: [] } }, false, true],
  [{ zoom_digital: 1.0005, filtros: { contraste: 1.005, brilho: 0.4, nitidez: 0.005, mediana: 2, desfoque: 2 } }, false, true],
  [{ filtros: { perspectiva: [[1, 1], [300, 2]] } }, false, true],   // perspectiva incompleta não vale
  [{ zoom_digital: 2 }, true, true],                                   // modo bruto ignora zoom e filtros
  [{ filtros: { nitidez: 0.5 } }, true, true],
  [{ filtros: { media_n: 3 } }, true, false],                          // a média vale até no bruto
  [{ filtros: { media_n: 3 } }, false, false],
  [{ zoom_digital: 1.5 }, false, false],
  [{ filtros: { mediana: 3 } }, false, false],
  [{ filtros: { desfoque: 3 } }, false, false],
  [{ filtros: { contraste: 1.2 } }, false, false],
  [{ filtros: { brilho: 10 } }, false, false],
  [{ filtros: { nitidez: 0.3 } }, false, false],
  [{ filtros: { clahe: true } }, false, false],
  [{ filtros: { perspectiva: [[10, 10], [300, 5], [310, 170], [5, 175]] } }, false, false],
]
let ok = 0, falha = 0
for (const [cfg, bruto, esperado] of casos) {
  const proc = new ProcessadorCamera(cv)
  proc.aplicar(cfg); proc.bruto = bruto
  const st = semTratamento(cfg, bruto)
  // 2 quadros: a média temporal só altera a partir do 2º
  // cópia de verdade: no opencv.js 5.0.0 o Mat.clone() COMPARTILHA os pixels com o original
  const g = new cv.Mat(H, W, cv.CV_8UC3); g.data.set(f.data)
  for (let i = 0; i < g.data.length; i += 7) g.data[i] ^= 0x55
  proc.acumular(f).delete()
  const a = proc.acumular(g), r = proc.obter(a)
  const rd = r.data, gd = g.data
  const igual = r.rows === g.rows && r.cols === g.cols && rd.length === gd.length && rd.every((v, i) => v === gd[i])
  a.delete(); r.delete(); g.delete(); proc.liberar()
  const certo = st === esperado && (st ? igual : !igual)
  if (certo) ok++
  else { falha++; console.log('✗', JSON.stringify(cfg), 'bruto', bruto, '| semTratamento', st, '| quadro igual', igual) }
}
f.delete()
console.log(`${ok} ok, ${falha} falha(s)`)
process.exit(falha ? 1 : 0)
