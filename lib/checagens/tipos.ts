import type { GrupoId, SubgrupoId } from '@/lib/equipamentos/tipos'

export type StatusChecagem  = 'aprovado' | 'atencao' | 'reprovado'
export type FonteImportacao = 'manual' | 'excel' | 'ocr'
export type TipoComparacao  = 'direta' | 'indireta'
export type PapelReferencia = 'gerador' | 'medidor'  // só para comparação direta
export type ResultadoGeral  = 'satisfatorio' | 'insatisfatorio' | 'pendente' | 'parcial'

export interface ItemChecagem {
  id: string
  ponto: number
  grandeza: string
  unidade: string
  // Direta (ref=gerador): VR = valor gerado pela ref, MM = leitura do instrumento
  // Direta (ref=medidor): VN = nominal ajustado no instrumento, VR = leitura da ref
  // Indireta: VR = leitura da referência, MM = leitura do instrumento checado
  valorNominal?: string      // Direta ref=medidor: o que foi ajustado no instrumento
  valorReferencia: string    // O que a referência diz (gera ou lê)
  valorMedido: string        // O que o instrumento checado diz (lê ou gera)
  // Correção ATIVA aplicada ao ponto. Agora vem do INSTRUMENTO de medição usado
  // (não do padrão checado). Mantém o nome do campo p/ compatibilidade do cálculo.
  correcaoPadrao?: string
  valorCorrigido?: string    // valorReferencia + correcaoPadrao
  // Instrumento de medição usado nesta grandeza (origem da correção)
  instrumentoTag?: string
  instrumentoCertNum?: string
  incertezaInstrumento?: string
  // Importado do certificado: média (valor indicado) medida na calibração — base da checagem
  mediaCalibracao?: string
  // Legado
  valorTransferencia?: string
  // Interpolação 2D — valores dos eixos para buscar correção na grade do certificado
  eixo1Valor?: string   // ex: frequência em MHz
  eixo2Valor?: string   // ex: nível em dBm
  // Resultado
  resultado: 'ok' | 'nok' | 'na'
  observacoes?: string
  criterioMin?: number
  criterioMax?: number
  normaId?: string
  secao?: string
  // Configuração POR GRANDEZA (todos os itens de uma grandeza compartilham):
  tipoComparacao?: TipoComparacao   // direta/indireta desta grandeza (sobrepõe o global)
  papelReferencia?: PapelReferencia // gerador/medidor (direta)
  grade2D?: boolean                 // mostra colunas Nível×Frequência (só se a grandeza for 2D)
}

export interface Checagem {
  id: string
  // Identificação do instrumento
  equipamentoId: string
  equipamentoTag: string
  nomeInstrumento: string
  laboratorio: string
  numeroCertificado: string      // certificado de calibração do padrão
  dataCalibracaoRef: string      // data da calibração do padrão
  // Classificação
  grupoId: GrupoId
  subgrupoId: SubgrupoId
  // Execução
  data: string                   // data da checagem
  responsavel: string
  tipoComparacao: TipoComparacao
  papelReferencia: PapelReferencia   // direta: ref gera ou ref mede?
  // Padrão(ões) utilizado(s) (TAG dos padrões usados)
  padraoTag: string
  // Periodicidade
  periodicidade: number          // em dias
  proximaChecagem: string
  // Resultado
  resultadoGeral: ResultadoGeral
  status: StatusChecagem
  // Importação
  fonte: FonteImportacao
  normaReferencia?: string
  // Itens de medição
  itens: ItemChecagem[]
  obs?: string
  criadoEm: string
}
