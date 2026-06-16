import type { Checagem } from '@/lib/checagens/tipos'
import { diasAte } from '@/lib/utils'

export interface AlertasChecagem {
  vencidas: Checagem[]
  vencendo: Checagem[]
  emDia: Checagem[]
}

export function classificarChecagens(checagens: Checagem[]): AlertasChecagem {
  const vencidas: Checagem[] = []
  const vencendo: Checagem[] = []
  const emDia: Checagem[] = []

  for (const c of checagens) {
    const dias = diasAte(c.proximaChecagem)
    if (typeof dias !== 'number') { emDia.push(c); continue }
    if (dias < 0) vencidas.push(c)
    else if (dias <= 30) vencendo.push(c)
    else emDia.push(c)
  }

  return { vencidas, vencendo, emDia }
}
