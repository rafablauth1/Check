// Resolve "@/x" → <repo>/x(.ts|.tsx|/index.ts) e imports relativos sem extensão, para rodar .ts do app direto no Node.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register('./loader-hooks.mjs', pathToFileURL(import.meta.filename))
