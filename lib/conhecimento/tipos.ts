// Base de Conhecimento: normas e notas do laboratório em arquivos .md, com busca
// local (sem IA, sem internet). Cada documento é um .md com um cabeçalho simples
// (frontmatter) e o texto. As notas são perguntas + respostas escritas pelo
// laboratório — é o que faz a base "ficar inteligente" com o uso.

export type TipoDoc = 'norma' | 'nota'

export interface MetaDoc {
  id: string            // = nome do arquivo sem .md
  titulo: string
  tipo: TipoDoc
  origem?: string       // arquivo de onde veio (ex.: "Portaria 221.pdf")
  fonte?: string        // nota: de onde vem a resposta (ex.: "Portaria 221, item 2.5.2.4")
  pergunta?: string     // nota: a pergunta que ela responde
  tags?: string[]
  criadoEm?: string
  atualizadoEm?: string
}

export interface Documento extends MetaDoc {
  corpo: string         // markdown sem o cabeçalho
}

/** Um pedaço pesquisável de um documento (um item da norma, uma seção, uma nota). */
export interface Trecho {
  docId: string
  titulo: string
  tipo: TipoDoc
  ancora: string        // item/seção para citar e para pular no documento
  texto: string
  contexto?: string     // título da seção em que o item está (entra na busca, não no recorte)
}

export interface ResultadoBusca {
  docId: string
  titulo: string
  tipo: TipoDoc
  ancora: string
  trecho: string                  // recorte exibido
  destaques: [number, number][]   // posições (início, fim) no recorte
  score: number
  pergunta?: string
  fonte?: string
}

export interface PerguntaPendente {
  id: string
  pergunta: string
  vezes: number
  criadoEm: string
  ultimaEm: string
}

export const PASTA_CONHECIMENTO = 'conhecimento'
export const ARQUIVO_PENDENTES = 'conhecimento/_perguntas-sem-resposta.json'
