import type { GrandezaMetrologica } from '@/lib/metrologia/tipos'

export type GrupoId =
  | 'geradores'
  | 'medidores'
  | 'redes-impedancia'
  | 'antenas'
  | 'atenuacao'
  | 'grandezas-ambientais'

export type SubgrupoId =
  | 'gerador-sinal-rf'
  | 'gerador-funcoes'
  | 'fonte-alimentacao-dc'
  | 'analisador-espectro'
  | 'receptor-emi'
  | 'multimetro'
  | 'lisn-50uh'
  | 'lisn-5uh'
  | 'antena-loop'
  | 'antena-log-periodica'
  | 'antena-biconica'
  | 'atenuador'
  | 'filtro-rf'
  | 'termoigrometro'
  | 'barometro'

export type StatusEquipamento =
  | 'ativo'              // em uso, calibração em dia
  | 'calibrar'           // calibração vencida
  | 'fora'               // fora de uso
  | 'sem-calibracao'     // não requer calibração
  | 'calibrar-antes-uso' // calibrar antes do uso

export const STATUS_EQUIP: { id: StatusEquipamento; label: string }[] = [
  { id: 'ativo',              label: 'Ativo' },
  { id: 'calibrar',          label: 'Calibração vencida' },
  { id: 'fora',               label: 'Fora de uso' },
  { id: 'sem-calibracao',    label: 'Não requer calibração' },
  { id: 'calibrar-antes-uso', label: 'Calibrar antes do uso' },
]

export interface EquipamentoEMC {
  id: string
  tag: string
  nome: string
  grupoId: GrupoId
  subgrupoId: SubgrupoId
  status: StatusEquipamento
  grandezas: GrandezaMetrologica[]
  ultimaCalibracao: string
  proximaCalibracao: string
  intervaloCalibracao: number
  fabricante?: string
  modelo?: string
  serie?: string
  labCalibracao?: string
  numeroCertificado?: string
  procedimentos?: string[]   // códigos da IT/PC de calibração (ex.: "PC R04") — casam com DocumentoIT.codigo
  obs?: string
  foto?: string              // imagem do equipamento (data URL base64)
  pastaRede?: string         // caminho da pasta de rede deste equipamento (ex: \\servidor\labelo\1528EMC)
  certsPendentes?: string[]  // caminhos de PDFs descobertos na rede mas ainda não processados (sem OCR)
}
