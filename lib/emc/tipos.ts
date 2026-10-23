// Agenda EMC (imunidade — série IEC 61000-4-x e afins) e os templates de ensaio
// que dizem QUAIS ensaios cada amostra faz.
//
// - Catálogo: todos os ensaios que o laboratório executa (código curto + norma).
// - Template: um por tipo de equipamento (medidor de energia, radar…). Tem
//   perguntas (feitas no cadastro da amostra) e regras "ensaio X entra quando…".
// - A amostra guarda uma CÓPIA do template no momento do cadastro: mudar o
//   template depois não altera o que já está na agenda (rastreabilidade). O
//   botão "reaplicar template" atualiza uma amostra de propósito.
//
// As regras são avaliadas em lib/emc/regras.ts; os templates que vêm prontos
// (das portarias Inmetro) estão em lib/emc/padrao.ts.

export interface EnsaioCatalogo {
  id: string
  codigo: string     // badge curto na agenda: "4-2", "4-4R", "D11"
  nome: string
  norma: string      // referência: "IEC 61000-4-2", "OIML D11 (12.2)"
}

export type TipoPergunta = 'simnao' | 'unica' | 'multipla'

/* Uma condição compara a resposta de uma pergunta:
   - simnao:   valor 'sim' | 'nao'          (operador eh / naoEh)
   - unica:    valor = uma das opções       (operador eh / naoEh)
   - multipla: valor = uma das opções       (operador inclui / naoInclui)
   Pergunta sem resposta → condição falsa (o cadastro exige responder). */
export type Operador = 'eh' | 'naoEh' | 'inclui' | 'naoInclui'

export interface Condicao {
  perguntaId: string
  operador: Operador
  valor: string
}

export interface Pergunta {
  id: string
  texto: string
  tipo: TipoPergunta
  opcoes?: string[]            // unica / multipla
  /** Só aparece no cadastro quando TODAS forem verdadeiras (ex.: "ar livre?" só p/ Fixo). */
  mostrarQuando?: Condicao[]
  /** Etiqueta exibida no item da agenda. simnao: aparece quando 'sim'.
   *  unica/multipla: vazio = mostra o(s) valor(es) escolhido(s). */
  etiqueta?: string
  mostrarEtiqueta?: boolean
  /** simnao: com resposta 'sim', estes ensaios ganham a marca de medição por
   *  relógio (pulso no início e no fim do ensaio). */
  marcaRelogio?: string[]
}

/* Regra de um ensaio: entra quando TODAS as condições valem (vazio = sempre).
   Para "OU", o template repete o ensaio em outra linha — basta uma linha valer. */
export interface RegraEnsaio {
  ensaioId: string
  quando: Condicao[]
}

export interface TemplateEnsaio {
  id: string
  nome: string
  icone: string                 // nome em lib/taxonomia/icones (ICONES)
  portaria: string
  observacao?: string
  perguntas: Pergunta[]
  regras: RegraEnsaio[]
}

export interface ConfigEnsaiosEmc {
  catalogo: EnsaioCatalogo[]
  templates: TemplateEnsaio[]
  atualizadoEm?: string
}

export type Respostas = Record<string, string | string[]>

export type StatusEnsaio = 'pendente' | 'realizado' | 'reprovado'

export interface EnsaioDaAmostra {
  ensaioId: string
  codigo: string
  nome: string
  status: StatusEnsaio
  relogio?: boolean             // medido por pulso (modo relógio)
}

export interface AgendaItemEmc {
  id: string
  // tipo de equipamento (cópia do template no cadastro)
  templateId: string
  template: TemplateEnsaio
  respostas: Respostas
  /** 'completo' = os ensaios que o template define; 'parcial' = escolhidos à mão. */
  modoEnsaios: 'completo' | 'parcial'
  ensaiosEscolhidos?: string[]  // ids, quando parcial
  ensaios: EnsaioDaAmostra[]

  protocolo: string
  orcamento: string
  cliente: string
  clienteRua?: string
  clienteCidade?: string
  clienteCep?: string
  produto: string
  fabricante?: string
  modelo?: string
  numeroSerie?: string

  dataEntrada: string
  /** Manual (semanas a partir da entrada ou data fechada). Vazio = sem prazo. */
  previsaoSaida: string
  responsavel: string
  numRelatorio: string
  dataEmissao: string
  assinadoEm?: string
  observacoes: string

  // Recebimento da amostra (Recebimento → EMC) e devolução (EMC → Recebimento)
  entreguePorRecebimento?: string
  recebidoPorEmc?: string
  recebimentoEmcOk?: boolean
  amostraLacrada?: 'sim' | 'nao' | ''
  numeroLacre?: string
  dataDevolucao?: string
  devolvidoPorEmc?: string
  recebidoPorRecebimento?: string
  devolucaoOk?: boolean

  criadoEm?: string
  atualizadoEm?: string
}

/* Campos da cadeia de custódia: uma vez registrados (preenchidos e salvos) não
   mudam mais — a tela trava e a rota de gravação mantém o valor antigo. */
export const CAMPOS_TRAVADOS_EMC = [
  'dataEntrada', 'entreguePorRecebimento', 'recebidoPorEmc', 'amostraLacrada', 'numeroLacre',
  'dataDevolucao', 'devolvidoPorEmc', 'recebidoPorRecebimento',
] as const satisfies readonly (keyof AgendaItemEmc)[]

export const ARQUIVO_CONFIG_EMC = 'emc/ensaios-config.json'
export const ARQUIVO_AGENDA_EMC = 'emc/agenda.json'
