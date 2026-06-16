import type { ItemChecagem, StatusChecagem, ResultadoGeral } from '@/lib/checagens/tipos'
import { diasAte } from '@/lib/utils'

export function validarChecagem(
  itens: ItemChecagem[],
  proximaChecagem: string,
  resultadoGeral?: ResultadoGeral,
): StatusChecagem {
  if (resultadoGeral === 'insatisfatorio') return 'reprovado'

  for (const item of itens) {
    if (item.resultado === 'nok') return 'reprovado'
    if (item.resultado === 'ok' && item.valorMedido !== '') {
      const v = parseFloat(item.valorMedido)
      if (!isNaN(v)) {
        if (item.criterioMin !== undefined && v < item.criterioMin) return 'reprovado'
        if (item.criterioMax !== undefined && v > item.criterioMax) return 'reprovado'
      }
    }
  }

  const dias = diasAte(proximaChecagem)
  if (typeof dias === 'number' && dias <= 30) return 'atencao'
  return 'aprovado'
}
