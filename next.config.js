/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['mammoth', 'puppeteer-core'],
  },
}

module.exports = nextConfig
