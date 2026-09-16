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

/* Um ensaio previsto pela norma/portaria — ex.: "ESD", seção "4-2".
 *
 * Os padrões são vinculados por ID do equipamento, NUNCA pela TAG. A TAG é
 * editável no cadastro; se o vínculo fosse por ela, renomear um padrão o
 * desligaria do ensaio em silêncio, e o filtro passaria a esconder equipamento
 * que na verdade continua sendo usado no ensaio. O ID não muda. */
export interface Ensaio {
  id: string
  nome: string             // "ESD", "Imunidade Radiada", "Correntes Diferenciais"
  codigo: string           // "4-2", "4-3", "4-19" — a seção da série IEC 61000-4-x
  equipamentoIds: string[] // padrões usados no ensaio (ver acima: por ID)
  /** Aparelhos auxiliares do ensaio (acopladores, redes de desacoplamento,
   *  fontes…): entram no ensaio mas não são o padrão que dá rastreabilidade.
   *  Lista separada por isso — mas vinculada por ID pelo mesmo motivo.
   *  Opcional: ensaios criados antes deste campo continuam válidos. */
  auxiliaresIds?: string[]
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
  /** Ensaios desta norma/portaria, cada um com seus padrões. */
  ensaios?: Ensaio[]
}
