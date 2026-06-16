import fs from 'fs'
import path from 'path'
import { readSettings } from '@/lib/settings-server'

function getDadosDir(): string {
  const { dataFolder } = readSettings()
  return dataFolder || path.join(process.cwd(), 'dados')
}

// Cache em memória: evita re-leitura de disco quando o arquivo não mudou.
// Chave = caminho absoluto; valor = dados parseados + mtime no momento da leitura.
// escreverJSON invalida a entrada correspondente após a escrita.
const _cache = new Map<string, { data: unknown; mtime: number }>()

export function lerJSON<T>(arquivo: string, padrao: T): T {
  try {
    const p = path.join(getDadosDir(), arquivo)
    if (!fs.existsSync(p)) return padrao
    const mtime = fs.statSync(p).mtimeMs
    const hit = _cache.get(p)
    if (hit && hit.mtime === mtime) return hit.data as T
    const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as T
    _cache.set(p, { data, mtime })
    return data
  } catch {
    return padrao
  }
}

export function escreverJSON(arquivo: string, dados: unknown): void {
  const p = path.join(getDadosDir(), arquivo)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(dados), 'utf-8')
  try {
    const mtime = fs.statSync(p).mtimeMs
    _cache.set(p, { data: dados, mtime })
  } catch {}
}
