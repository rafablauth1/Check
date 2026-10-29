// Planner da imunidade (agenda EMC): quem faz qual ensaio, em que dia, em qual
// setup — e quanto tempo leva de verdade.
//
// - Pessoa: usuário cadastrado, com as HABILITAÇÕES (ensaios do catálogo que
//   está autorizado a executar — ISO/IEC 17025 6.2). O planner só escala quem é
//   habilitado.
// - Setup: o conjunto físico (bancada, câmara, gerador) com os equipamentos do
//   cadastro. Roda uma amostra por vez.
// - Tempo do ensaio: em qual setup cada ensaio do catálogo roda, a CONFIGURAÇÃO
//   (montagem) que ele usa dentro do setup e quanto leva. Amostras seguidas com
//   a mesma configuração não pagam a montagem de novo — é isso que o organizador
//   aproveita.
// - Tarefa: um ensaio de uma amostra da agenda EMC escalado para uma pessoa num
//   dia. Tem play/pausa: as sessões guardam o tempo real.
//
// A lógica (cronograma do dia e organização da semana) está em
// lib/emc/planner/logica.ts.

import type { Condicao } from '@/lib/emc/tipos'

export interface Pessoa {
  id: string
  nome: string
  cor: string                   // cor do cartão no quadro
  /** Usuário do Windows (o PC onde a pessoa abre o app já sabe quem ela é). */
  usuarioWindows?: string
  habilitacoes: string[]        // ids do catálogo de ensaios
  ativo: boolean
}

export interface Setup {
  id: string
  nome: string                  // "Bancada ESD", "Câmara semianecoica"…
  local?: string
  equipamentoIds: string[]      // cadastro de equipamentos (equipamentos.json)
  ativo: boolean
  obs?: string
}

/** Minutos a mais (ou a menos) quando as respostas do cadastro da amostra batem
    — ex.: medidor que mede reativa, aquisição pelo software. Os que valem somam. */
export interface AcrescimoTempo {
  quando: Condicao[]            // perguntas do template do tipo (E)
  minutos: number
}

/** Tempo de um ensaio para um tipo de equipamento em particular (o 4-3 de um
    radar não leva o mesmo que o de um medidor). Vazio = usa o geral. */
export interface TempoPorTipo {
  montagemMin?: number
  ensaioMin?: number
  relogioMin?: number
  acrescimos?: AcrescimoTempo[]
}

export interface TempoEnsaio {
  ensaioId: string
  setupId: string
  /** Nome da montagem dentro do setup. Ensaios com a mesma configuração (ex.:
      4-4 e 4-4R no mesmo gerador) seguem um atrás do outro sem remontar. */
  configuracao: string
  montagemMin: number
  ensaioMin: number             // por amostra, medição normal
  /** Por amostra, com medição por relógio (pulso no início e no fim). Vazio = ensaioMin. */
  relogioMin?: number
  /** false = depois de montado e iniciado, roda sozinho: a pessoa só fica presa na montagem. */
  acompanhado: boolean
  porTipo?: Record<string, TempoPorTipo>   // templateId → tempo
}

export interface Jornada {
  inicio: string                // 'HH:MM'
  fim: string
  almocoInicio: string
  almocoFim: string
  dias: number[]                // 0 = domingo … 6 = sábado
}

export interface ConfigPlanner {
  pessoas: Pessoa[]
  setups: Setup[]
  tempos: TempoEnsaio[]
  jornada: Jornada
  atualizadoEm?: string
}

export type StatusTarefa = 'afazer' | 'execucao' | 'pausada' | 'feita'

export interface Sessao {
  inicio: string                // ISO
  fim?: string                  // vazio = rodando
  pessoaId?: string             // quem deu o play
}

export interface Tarefa {
  id: string
  itemId: string                // AgendaItemEmc.id
  ensaioId: string
  pessoaId: string              // '' = sem pessoa
  setupId: string
  dia: string                   // aaaa-mm-dd; '' = fila (sem dia)
  ordem: number                 // sequência no dia (o cronograma segue esta ordem)
  /** Posta à mão no quadro: o "Organizar semana" não tira do lugar. */
  fixada?: boolean
  status: StatusTarefa
  sessoes: Sessao[]
  concluidaEm?: string
  obs?: string
  criadoEm?: string
  atualizadoEm?: string
}

export const ARQUIVO_CONFIG_PLANNER  = 'emc/planner-config.json'
export const ARQUIVO_TAREFAS_PLANNER = 'emc/planner-tarefas.json'

export const JORNADA_PADRAO: Jornada = {
  inicio: '08:00', fim: '17:00', almocoInicio: '12:00', almocoFim: '13:00', dias: [1, 2, 3, 4, 5],
}

export const CORES_PESSOA = ['#2dd4bf', '#f59e0b', '#a78bfa', '#f472b6', '#60a5fa', '#34d399', '#fb7185', '#facc15']
