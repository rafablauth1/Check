import type { AgendaItemEmc } from '@/lib/emc/tipos'
import type { ConfigPlanner, Jornada, Pessoa, Tarefa, TempoEnsaio } from '@/lib/emc/planner/tipos'

// Lógica do planner — funções puras, usadas pelo quadro (cronograma de cada dia)
// e pelo botão "Organizar semana".
//
// O tempo do dia é contado em MINUTOS ÚTEIS (jornada menos almoço): um ensaio de
// 3 h que começa às 10:00 com almoço 12–13 termina às 14:00. O cronograma segue
// a ordem das tarefas e respeita três recursos, cada um fazendo uma coisa por vez:
//   - o setup (bancada/câmara): montagem + ensaio;
//   - a amostra (não está em dois setups ao mesmo tempo): montagem + ensaio;
//   - a pessoa: montagem + ensaio, ou só a montagem quando o ensaio roda sozinho.
// A montagem só entra quando a configuração montada no setup é outra — o setup
// continua montado de um dia para o outro.

/* ─── relógio ─────────────────────────────────────────────────────────────── */

export const minDe = (hhmm: string): number => {
  const [h, m] = (hhmm || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const hhmm = (min: number): string => {
  const m = Math.round(min)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const almoco = (j: Jornada) => Math.max(0, minDe(j.almocoFim) - minDe(j.almocoInicio))

/** Minutos úteis do dia. */
export function minutosUteis(j: Jornada): number {
  return Math.max(0, minDe(j.fim) - minDe(j.inicio) - almoco(j))
}

/** Minuto útil → hora do relógio. `fim`: um fim exatamente no começo do almoço mostra 12:00, não 13:00. */
export function relogioDe(m: number, j: Jornada, fim = false): string {
  const t = minDe(j.inicio) + m
  const passou = fim ? t > minDe(j.almocoInicio) : t >= minDe(j.almocoInicio)
  return hhmm(passou ? t + almoco(j) : t)
}

/** Hora do relógio → minuto útil (antes da jornada = 0, no almoço = começo do almoço). */
export function minutoUtilDe(relogio: number, j: Jornada): number {
  const ini = minDe(j.inicio), ai = minDe(j.almocoInicio), af = minDe(j.almocoFim)
  let m: number
  if (relogio <= ini) m = 0
  else if (relogio <= ai) m = relogio - ini
  else if (relogio <= af) m = ai - ini
  else m = relogio - ini - almoco(j)
  return Math.min(Math.max(0, m), minutosUteis(j))
}

export function fmtDuracao(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`
}

/* ─── datas ───────────────────────────────────────────────────────────────── */

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function somarDias(dia: string, n: number): string {
  const d = new Date(dia + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoLocal(d)
}

/** Segunda-feira da semana do dia. */
export function segundaDe(dia: string): string {
  const d = new Date(dia + 'T12:00:00')
  return somarDias(dia, -((d.getDay() + 6) % 7))
}

/** Dias de trabalho da semana (pela jornada), a partir da segunda. */
export function diasDaSemana(segunda: string, j: Jornada): string[] {
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i))
    .filter(d => j.dias.includes(new Date(d + 'T12:00:00').getDay()))
}

/* ─── tempos ──────────────────────────────────────────────────────────────── */

export interface TempoCalculado {
  tempo: TempoEnsaio
  ensaioMin: number
  montagemMin: number
  configuracao: string
  relogio: boolean
}

/** Tempo de um ensaio para esta amostra: medição por relógio e tempo próprio do tipo de equipamento. */
export function tempoDoEnsaio(cfg: ConfigPlanner, ensaioId: string, item?: AgendaItemEmc): TempoCalculado | null {
  const tempo = cfg.tempos.find(t => t.ensaioId === ensaioId)
  if (!tempo || !tempo.setupId) return null
  const relogio = !!item?.ensaios.find(e => e.ensaioId === ensaioId)?.relogio
  const pt = item ? tempo.porTipo?.[item.templateId] : undefined
  const normal = pt?.ensaioMin ?? tempo.ensaioMin
  const ensaioMin = relogio ? (pt?.relogioMin ?? tempo.relogioMin ?? normal) : normal
  return {
    tempo, ensaioMin: Math.max(0, ensaioMin || 0), montagemMin: Math.max(0, tempo.montagemMin || 0),
    configuracao: tempo.configuracao || ensaioId, relogio,
  }
}

/** Tempo real gasto (ms), somando as sessões; a sessão aberta conta até agora. */
export function tempoGastoMs(t: Pick<Tarefa, 'sessoes'>, agoraMs: number): number {
  return t.sessoes.reduce((s, x) => {
    const ini = Date.parse(x.inicio)
    const fim = x.fim ? Date.parse(x.fim) : agoraMs
    return s + (Number.isFinite(ini) && Number.isFinite(fim) ? Math.max(0, fim - ini) : 0)
  }, 0)
}

export const habilitada = (p: Pessoa, ensaioId: string) => p.ativo && p.habilitacoes.includes(ensaioId)

/** Mais urgente primeiro: prazo (sem prazo por último), depois a entrada. */
export function chavePrioridade(item: AgendaItemEmc): string {
  return `${item.previsaoSaida || '9999-12-31'}|${item.dataEntrada || '9999-12-31'}|${item.protocolo}`
}

/* ─── cronograma ──────────────────────────────────────────────────────────── */

export interface Bloco {
  tarefaId: string
  inicioMin: number
  fimMin: number
  inicio: string                // 'HH:MM' ('' para feita / sem tempo)
  fim: string
  montagemMin: number
  ensaioMin: number
  pessoaMin: number             // quanto a pessoa fica presa
  estimativaMin: number         // montagem + ensaio
  relogio: boolean
  semTempo: boolean             // ensaio sem setup/tempo cadastrado
  foraDoHorario: boolean        // passa do fim da jornada
}

/** Recursos ocupados num dia (minuto útil em que cada um fica livre). */
interface EstadoDia {
  cursor: number
  setup: Map<string, number>
  amostra: Map<string, number>
  pessoa: Map<string, number>
  carga: Map<string, number>            // minutos de cada pessoa no dia
  montado: Map<string, string>          // setupId → configuração montada
}

const livre = (m: Map<string, number>, k: string, cursor: number) => Math.max(cursor, m.get(k) ?? 0)

function novoEstado(cursor: number, montado: Map<string, string>): EstadoDia {
  return { cursor, setup: new Map(), amostra: new Map(), pessoa: new Map(), carga: new Map(), montado }
}

interface Trabalho {
  itemId: string
  setupId: string
  configuracao: string
  montagemMin: number
  ensaioMin: number
  acompanhado: boolean
}

/** Ensaio que roda sozinho ainda prende a pessoa o tempo de dar a partida. */
export const PARTIDA_MIN = 10

/** Quando o trabalho começaria com esta pessoa e quanto dura, sem mexer no estado. */
function simular(e: EstadoDia, w: Trabalho, pessoaId: string, jaGastoMin = 0) {
  const montagem = e.montado.get(w.setupId) === w.configuracao ? 0 : w.montagemMin
  // tarefa já iniciada: a montagem foi feita, sobra o restante do ensaio
  const total = jaGastoMin > 0 ? Math.max(5, montagem + w.ensaioMin - jaGastoMin) : montagem + w.ensaioMin
  const inicio = Math.max(
    livre(e.setup, w.setupId, e.cursor),
    livre(e.amostra, w.itemId, e.cursor),
    pessoaId ? livre(e.pessoa, pessoaId, e.cursor) : e.cursor,
  )
  const pessoaMin = jaGastoMin > 0 ? (w.acompanhado ? total : 0)
    : montagem + (w.acompanhado ? w.ensaioMin : Math.min(PARTIDA_MIN, w.ensaioMin))
  return { inicio, fim: inicio + total, montagem, ensaio: total - montagem, pessoaMin }
}

function ocupar(e: EstadoDia, w: Trabalho, pessoaId: string, s: ReturnType<typeof simular>) {
  e.setup.set(w.setupId, s.fim)
  e.amostra.set(w.itemId, s.fim)
  if (pessoaId) {
    e.pessoa.set(pessoaId, s.inicio + s.pessoaMin)
    e.carga.set(pessoaId, (e.carga.get(pessoaId) ?? 0) + s.pessoaMin)
  }
  e.montado.set(w.setupId, w.configuracao)
}

function trabalhoDe(cfg: ConfigPlanner, t: Pick<Tarefa, 'itemId' | 'ensaioId' | 'setupId'>, item?: AgendaItemEmc): Trabalho | null {
  const tc = tempoDoEnsaio(cfg, t.ensaioId, item)
  if (!tc) return null
  return {
    itemId: t.itemId, setupId: t.setupId || tc.tempo.setupId, configuracao: tc.configuracao,
    montagemMin: tc.montagemMin, ensaioMin: tc.ensaioMin, acompanhado: tc.tempo.acompanhado,
  }
}

export interface Cronograma {
  blocos: Map<string, Bloco>
  /** Por dia: minutos de cada pessoa (para a barra de carga). */
  carga: Map<string, Map<string, number>>
}

/**
 * Cronograma da semana na ordem em que as tarefas estão: horário previsto de
 * cada uma, montagem e carga de cada pessoa por dia. `agora` (minuto útil de
 * hoje) faz o dia de hoje começar do momento atual.
 */
export function cronogramaSemana(
  cfg: ConfigPlanner, tarefas: Tarefa[], itens: Map<string, AgendaItemEmc>, dias: string[],
  hoje: string, agoraMin: number, agoraMs: number,
): Cronograma {
  const W = minutosUteis(cfg.jornada)
  const blocos = new Map<string, Bloco>()
  const carga = new Map<string, Map<string, number>>()
  const montado = new Map<string, string>()
  for (const dia of [...dias].sort()) {
    const e = novoEstado(dia === hoje ? agoraMin : 0, montado)
    const doDia = tarefas.filter(t => t.dia === dia).sort((a, b) => a.ordem - b.ordem)
    for (const t of doDia) {
      const item = itens.get(t.itemId)
      const w = trabalhoDe(cfg, t, item)
      const tc = tempoDoEnsaio(cfg, t.ensaioId, item)
      const vazio: Bloco = {
        tarefaId: t.id, inicioMin: 0, fimMin: 0, inicio: '', fim: '', montagemMin: 0, ensaioMin: 0, pessoaMin: 0,
        estimativaMin: 0, relogio: !!tc?.relogio, semTempo: !w, foraDoHorario: false,
      }
      if (!w) { blocos.set(t.id, vazio); continue }
      if (t.status === 'feita') {
        // já foi: não ocupa ninguém daqui para a frente, mas deixa o setup montado
        e.montado.set(w.setupId, w.configuracao)
        blocos.set(t.id, { ...vazio, estimativaMin: w.ensaioMin, ensaioMin: w.ensaioMin })
        continue
      }
      const gasto = t.status === 'afazer' ? 0 : tempoGastoMs(t, agoraMs) / 60000
      const s = simular(e, w, t.pessoaId, gasto)
      ocupar(e, w, t.pessoaId, s)
      blocos.set(t.id, {
        ...vazio,
        inicioMin: s.inicio, fimMin: s.fim,
        inicio: relogioDe(s.inicio, cfg.jornada), fim: relogioDe(s.fim, cfg.jornada, true),
        montagemMin: s.montagem, ensaioMin: s.ensaio, pessoaMin: s.pessoaMin,
        estimativaMin: s.montagem + s.ensaio, foraDoHorario: s.fim > W,
      })
    }
    carga.set(dia, e.carga)
  }
  return { blocos, carga }
}

/* ─── organizar a semana ──────────────────────────────────────────────────── */

export interface Alocacao {
  id?: string                   // tarefa existente (reaproveitada)
  itemId: string
  ensaioId: string
  pessoaId: string
  setupId: string
  dia: string
  ordem: number
}

export interface NaoAlocado { itemId: string; ensaioId: string; motivo: string }

export interface Proposta {
  alocacoes: Alocacao[]
  naoAlocados: NaoAlocado[]
}

interface Pendente extends Trabalho {
  id?: string
  ensaioId: string
  prioridade: string
  candidatos: Pessoa[]
}

/**
 * Distribui os ensaios pendentes da agenda EMC pelos dias da semana:
 *   1. Ficam onde estão as tarefas em execução, pausadas ou fixadas à mão.
 *   2. Cada setup trabalha em LOTES da mesma configuração (monta uma vez, passa
 *      todas as amostras): primeiro a configuração que já está montada; depois,
 *      a da amostra mais urgente (prazo, depois entrada).
 *   3. Dentro do lote, vai a amostra que pode começar mais cedo (ela pode estar
 *      ocupada em outro setup); entre setups, o que começa mais cedo.
 *   4. A pessoa é a habilitada que fica livre mais cedo; empate → a menos carregada no dia.
 *   5. Um ensaio só entra no dia se terminar dentro da jornada (um ensaio maior
 *      que o dia inteiro entra sozinho, começando no início do dia).
 */
export function organizarSemana(
  cfg: ConfigPlanner, itens: AgendaItemEmc[], tarefas: Tarefa[], dias: string[],
  hoje: string, agoraMin: number, agoraMs: number,
): Proposta {
  const W = minutosUteis(cfg.jornada)
  const semana = new Set(dias)
  const ultimo = [...dias].sort().at(-1) ?? hoje
  const setupsAtivos = new Set(cfg.setups.filter(s => s.ativo).map(s => s.id))
  const naoAlocados: NaoAlocado[] = []
  const pendentes: Pendente[] = []
  const fixas: Tarefa[] = []

  for (const t of tarefas) {
    if (t.status === 'feita') continue
    if (semana.has(t.dia) && (t.status !== 'afazer' || t.fixada)) fixas.push(t)
  }
  const fixasIds = new Set(fixas.map(t => t.id))

  for (const item of itens) {
    if (item.numRelatorio) continue
    for (const e of item.ensaios) {
      if (e.status !== 'pendente') continue
      const existe = tarefas.find(t => t.itemId === item.id && t.ensaioId === e.ensaioId)
      if (existe && (existe.status !== 'afazer' || existe.fixada || fixasIds.has(existe.id))) continue
      if (existe && existe.dia > ultimo) continue                      // já planejada numa semana seguinte
      const tc = tempoDoEnsaio(cfg, e.ensaioId, item)
      if (!tc) { naoAlocados.push({ itemId: item.id, ensaioId: e.ensaioId, motivo: 'sem setup/tempo cadastrado para o ensaio' }); continue }
      if (!setupsAtivos.has(tc.tempo.setupId)) { naoAlocados.push({ itemId: item.id, ensaioId: e.ensaioId, motivo: 'setup do ensaio inativo' }); continue }
      const candidatos = cfg.pessoas.filter(p => habilitada(p, e.ensaioId))
      if (!candidatos.length) { naoAlocados.push({ itemId: item.id, ensaioId: e.ensaioId, motivo: 'ninguém habilitado para o ensaio' }); continue }
      pendentes.push({
        id: existe?.id, itemId: item.id, ensaioId: e.ensaioId, setupId: tc.tempo.setupId, configuracao: tc.configuracao,
        montagemMin: tc.montagemMin, ensaioMin: tc.ensaioMin, acompanhado: tc.tempo.acompanhado,
        prioridade: chavePrioridade(item), candidatos,
      })
    }
  }

  const porItem = new Map(itens.map(i => [i.id, i]))
  const alocacoes: Alocacao[] = []
  const montado = new Map<string, string>()
  const restantes = new Set(pendentes)

  for (const dia of [...dias].sort()) {
    if (dia < hoje) continue
    const e = novoEstado(dia === hoje ? agoraMin : 0, montado)
    let ordem = 0

    // 1. as fixas, na ordem em que estão
    for (const t of fixas.filter(x => x.dia === dia).sort((a, b) => a.ordem - b.ordem)) {
      const w = trabalhoDe(cfg, t, porItem.get(t.itemId))
      if (w) {
        const gasto = t.status === 'afazer' ? 0 : tempoGastoMs(t, agoraMs) / 60000
        ocupar(e, w, t.pessoaId, simular(e, w, t.pessoaId, gasto))
      }
      alocacoes.push({ id: t.id, itemId: t.itemId, ensaioId: t.ensaioId, pessoaId: t.pessoaId, setupId: t.setupId, dia, ordem: ordem++ })
    }

    // 2–5. as pendentes
    type Escolha = { p: Pendente; pessoa: Pessoa; s: ReturnType<typeof simular> }
    for (;;) {
      let melhor = null as Escolha | null
      const porSetup = new Map<string, Pendente[]>()
      for (const p of restantes) porSetup.set(p.setupId, [...(porSetup.get(p.setupId) ?? []), p])

      for (const [setupId, lista] of porSetup) {
        // lotes de configuração: a montada primeiro, depois por urgência
        const ordemCfg: string[] = []
        const montada = e.montado.get(setupId)
        if (montada && lista.some(p => p.configuracao === montada)) ordemCfg.push(montada)
        for (const p of [...lista].sort((a, b) => a.prioridade.localeCompare(b.prioridade))) {
          if (!ordemCfg.includes(p.configuracao)) ordemCfg.push(p.configuracao)
        }
        let doSetup = null as Escolha | null
        for (const c of ordemCfg) {
          for (const p of lista.filter(x => x.configuracao === c)) {
            for (const pessoa of p.candidatos) {
              const s = simular(e, p, pessoa.id)
              const cabe = s.fim <= W || (s.fim - s.inicio > W && s.inicio === e.cursor && e.cursor === 0)
              if (!cabe) continue
              const carga = (x: Pessoa) => e.carga.get(x.id) ?? 0
              if (!doSetup || s.inicio < doSetup.s.inicio
                || (s.inicio === doSetup.s.inicio && (p.prioridade < doSetup.p.prioridade
                  || (p === doSetup.p && carga(pessoa) < carga(doSetup.pessoa))))) {
                doSetup = { p, pessoa, s }
              }
            }
          }
          if (doSetup) break                                              // achou neste lote
        }
        if (doSetup && (!melhor || doSetup.s.inicio < melhor.s.inicio
          || (doSetup.s.inicio === melhor.s.inicio && doSetup.p.prioridade < melhor.p.prioridade))) {
          melhor = doSetup
        }
      }
      if (!melhor) break
      ocupar(e, melhor.p, melhor.pessoa.id, melhor.s)
      restantes.delete(melhor.p)
      alocacoes.push({
        id: melhor.p.id, itemId: melhor.p.itemId, ensaioId: melhor.p.ensaioId,
        pessoaId: melhor.pessoa.id, setupId: melhor.p.setupId, dia, ordem: ordem++,
      })
    }
  }

  for (const p of restantes) naoAlocados.push({ itemId: p.itemId, ensaioId: p.ensaioId, motivo: 'não coube na semana' })
  return { alocacoes, naoAlocados }
}
