export interface LinhaCertificado {
  ponto: number
  grandeza: string
  unidade: string
  valorNominal: string
  valorIndicado: string
  correcao: string             // valor da correção (ex: "+0.005")
  incertezaExpandida: string   // U (k=2)
  fatorCobertura: number
}

/** Ponto de correção em grade 2D (ex: frequência × nível) */
export interface PontoCorrecao2D {
  eixo1: number        // ex: 50 (MHz)
  eixo2: number        // ex: -40 (dBm)
  correcao: number     // ex: +0.12 (dB)
  incerteza?: number   // U (k=2)
}

export interface Certificado {
  id: string
  equipamentoId: string
  equipamentoTag: string
  numero: string               // n° do certificado (ex: "R0042-2025")
  laboratorio: string
  dataEmissao: string          // YYYY-MM-DD
  dataValidade?: string        // YYYY-MM-DD (12 ou 24 meses)
  normaRastreabilidade?: string
  itens: LinhaCertificado[]
  // Grade de correções 2D (opcional — para equipamentos com dois eixos)
  grade2D?: {
    eixo1Nome: string      // ex: "Frequência"
    eixo1Unidade: string   // ex: "MHz"
    eixo2Nome: string      // ex: "Nível"
    eixo2Unidade: string   // ex: "dBm"
    pontos: PontoCorrecao2D[]
  }
  obs?: string
  pdfNome?: string             // nome do PDF (exibição)
  pdfPath?: string             // caminho ORIGINAL do PDF (rede/local) — só referência, não copia o arquivo
  criadoEm: string
}
