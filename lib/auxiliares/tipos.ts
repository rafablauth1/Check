/* Aparelhos auxiliares de ensaio.
 *
 * Cadastro SEPARADO do de equipamentos, de propósito. Auxiliar é o acessório
 * que compõe a montagem — acoplador, rede de desacoplamento, fonte, cabo
 * especial — e que NÃO dá rastreabilidade: não tem certificado, não tem data de
 * calibração e não vence. Se fosse guardado junto dos equipamentos, cada
 * acessório viraria uma pendência eterna no controle de vencimentos.
 *
 * Foi o que apareceu na prática: no quadro de padrões do laboratório existem
 * itens como "A1062 - Acoplador Burst" e "A1062 - Acoplador Surge" que não
 * estavam no cadastro de equipamentos justamente por não serem padrões.
 *
 * O vínculo com o ensaio é sempre por `id` (ver lib/normas/tipos.ts): a TAG é
 * editável e o vínculo tem que sobreviver a renomeações.
 */

export interface AparelhoAuxiliar {
  id: string
  tag: string          // identificação usada no laboratório (ex.: "A1062-AB")
  nome: string         // "Acoplador Burst"
  fabricante?: string
  modelo?: string
  serie?: string
  observacao?: string
}

export const AUXILIARES_DEFAULT: AparelhoAuxiliar[] = []
