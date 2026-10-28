import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const REPO = process.env.REPO_APP

function comExtensao(base) {
  for (const c of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  return null
}

export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) {
    const f = comExtensao(path.join(REPO, spec.slice(2)))
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true, format: 'module' }
  }
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:') && !ctx.parentURL.includes('/node_modules/')) {
    const f = comExtensao(path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec))
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true, format: 'module' }
  }
  return next(spec, ctx)
}

export async function load(url, ctx, next) {
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const r = await next(url, { ...ctx, format: 'module-typescript' })
    return { ...r, format: 'module-typescript' }
  }
  return next(url, ctx)
}
