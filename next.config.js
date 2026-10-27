/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // bibliotecas com binário nativo (busca por significado da Base de Conhecimento) ficam fora do webpack
    serverComponentsExternalPackages: ['mammoth', 'puppeteer-core', '@huggingface/transformers', 'onnxruntime-node'],
  },
}

module.exports = nextConfig
