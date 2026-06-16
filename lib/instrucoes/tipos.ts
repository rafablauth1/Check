export type TipoDocumento = 'IT' | 'PC'

export type TipoBloco =
  | 'h1' | 'h2' | 'h3'
  | 'p' | 'destaque'
  | 'ul' | 'ol'
  | 'img' | 'tabela' | 'definicoes'

export interface BlocoH1        { id: string; tipo: 'h1';        numero: string; texto: string }
export interface BlocoH2        { id: string; tipo: 'h2';        numero: string; texto: string }
export interface BlocoH3        { id: string; tipo: 'h3';        numero: string; texto: string }
export interface BlocoP         { id: string; tipo: 'p';         texto: string }
export interface BlocoDestaque  { id: string; tipo: 'destaque';  termo: string; texto: string }
export interface BlocoUL        { id: string; tipo: 'ul';        itens: string[] }
export interface BlocoOL        { id: string; tipo: 'ol';        itens: string[] }
export interface BlocoImg       { id: string; tipo: 'img';       src: string; legenda: string }
export interface BlocoTabela    { id: string; tipo: 'tabela';    cabecalho: string[]; linhas: string[][] }
export interface BlocoDefinicoes { id: string; tipo: 'definicoes'; itens: { sigla: string; definicao: string }[] }

export type Bloco =
  | BlocoH1 | BlocoH2 | BlocoH3
  | BlocoP  | BlocoDestaque
  | BlocoUL | BlocoOL
  | BlocoImg | BlocoTabela | BlocoDefinicoes

export interface DocumentoIT {
  id: string
  tipoDocumento: TipoDocumento
  codigo: string      // ex: "PC R04", "IT-001"
  titulo: string      // ex: "Atenuador"
  revisao: string     // ex: "00"
  dataRevisao: string // YYYY-MM-DD
  revisadoPor: string
  aprovadoPor: string
  blocos: Bloco[]
  criadoEm: string
  atualizadoEm: string
}
