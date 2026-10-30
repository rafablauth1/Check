// Média temporal: ProcessadorCamera.acumular (lib/vigia/camera-proc.ts) × cv2.accumulateWeighted (media_py.py).
// Uso: REPO_APP=... node --experimental-transform-types --no-warnings --import ./loader-alias.mjs media_ts.mjs quadros.bin media_py.bin
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { ProcessadorCamera } = await import('@/lib/vigia/camera-proc')
let cv = require(path.join(process.env.REPO_APP, 'node_modules/@techstark/opencv-js'))
if (cv instanceof Promise) cv = await cv
else if (!cv.Mat) await new Promise(r => { cv.onRuntimeInitialized = r })

const [quadrosF, pyF] = process.argv.slice(2)
const H = 180, W = 320, N = H * W * 3
const fr = fs.readFileSync(quadrosF), py = fs.readFileSync(pyF)
let off = 0, falha = 0
for (const n of [2, 3, 5, 7]) {
  const proc = new ProcessadorCamera(cv)
  proc.aplicar({ filtros: { media_n: n } })
  let saida = null
  for (let k = 0; k < 12; k++) {
    const f = new cv.Mat(H, W, cv.CV_8UC3)
    f.data.set(fr.subarray(k * N, (k + 1) * N))
    saida?.delete()
    saida = proc.acumular(f)
    f.delete()
  }
  const media = proc['media'].data32F
  const pyM = new Float32Array(py.buffer.slice(py.byteOffset + off, py.byteOffset + off + N * 4)); off += N * 4
  const pyU = py.subarray(off, off + N); off += N
  let difF = 0, difU = 0
  for (let i = 0; i < N; i++) { if (media[i] !== pyM[i]) difF++; if (saida.data[i] !== pyU[i]) difU++ }
  console.log(`média de ${n} quadros: float32 diferentes ${difF}/${N}, quadro (uint8) diferentes ${difU}/${N}`)
  if (difF || difU) falha++
  saida.delete(); proc.liberar()
}
console.log(falha ? `${falha} caso(s) DIFERENTE(S)` : 'IGUAL ao cv2 em todos os casos')
process.exit(falha ? 1 : 0)
