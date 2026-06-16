export interface GrandezaMetrologica {
  id: string
  nome: string
  simbolo: string
  unidade: string
  faixaMin: number
  faixaMax: number
  resolucao: string
  incertezaExpandida: string
  fatorCobertura: number
}
