// Copia o opencv.js (OpenCV 5.0.0 em WebAssembly, o mesmo do cv2 do VIGIA-7S) de
// node_modules para public/vigia/, como asset estático: o worker do VIGIA carrega com
// importScripts em tempo de execução (empacotar 10 MB no webpack só pesaria o build).
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const src = path.join(root, 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js')
const dst = path.join(root, 'public', 'vigia')

if (!fs.existsSync(src)) {
  console.log('[copy-opencv] @techstark/opencv-js ausente; nada a copiar.')
  process.exit(0)
}

fs.mkdirSync(dst, { recursive: true })
fs.copyFileSync(src, path.join(dst, 'opencv.js'))
console.log('[copy-opencv] opencv.js -> public/vigia OK')
