import type { GrupoId } from '@/lib/equipamentos/tipos'

export interface EquipamentoNecessario {
  grupoId: GrupoId
  descricao: string
}

export interface LinhaTabela {
  nivel?: string
  frequencia?: string
  valor: string
  condicoes?: string
}

export interface TabelaLimites {
  id: string
  titulo: string
  linhas: LinhaTabela[]
}

export interface SecaoNorma {
  numero: string
  titulo: string
  resumo: string
}

export interface Norma {
  id: string
  codigo: string
  titulo: string
  tipo: 'emissao' | 'imunidade' | 'geral'
  pdfDisponivel: boolean
  pdfPath?: string
  equipamentosNecessarios: EquipamentoNecessario[]
  tabelasLimites?: TabelaLimites[]
  secoes?: SecaoNorma[]
}
