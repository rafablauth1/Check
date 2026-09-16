/* ─── Marcadores de tempo de trabalho ──────────────────────────────────────────
   Mede dois indicadores para a análise do dashboard:
   • emissao — do abrir o formulário de emissão até o certificado (PDF) gerado
   • agenda  — tempo de preenchimento dos dados de uma amostra no cadastro da agenda

   Início fica em sessionStorage (não vaza entre sessões/reinícios do app);
   o registro final vai para a PASTA DE REDE.

   Antes ficava no localStorage de cada PC, e isso tornava o indicador inútil:
   o "tempo médio de emissão" media só o que fora emitido naquela máquina, e
   cada uma mostrava um número diferente. É indicador do laboratório.

   Sem Electron (versão web) o localStorage segue como armazenamento — é o
   único que existe ali. */

export interface TempoTrabalho {
  id: string
  tipo: 'emissao' | 'agenda'
  protocolo?: string
  numRelatorio?: string
  duracaoMs: number
  data: string // ISO datetime — usado para filtrar por ano no dashboard
}

export const TEMPOS_KEY = 'cispr15_tempos_v1'
/** Marca que o histórico local deste PC já foi enviado para a rede. */
const MIGRADO_KEY = 'cispr15_tempos_migrados_v1'

type ApiTempos = {
  getTempos?: () => Promise<{ ok?: boolean; tempos?: TempoTrabalho[] }>
  addTempos?: (tempos: TempoTrabalho[]) => Promise<{ ok?: boolean; error?: string }>
}

function api(): ApiTempos | null {
  if (typeof window === 'undefined') return null
  return ((window as unknown as { electronAPI?: ApiTempos }).electronAPI) ?? null
}

function lerLocais(): TempoTrabalho[] {
  try {
    const raw = localStorage.getItem(TEMPOS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function gravarLocal(registro: TempoTrabalho): void {
  try {
    const log = lerLocais()
    log.push(registro)
    localStorage.setItem(TEMPOS_KEY, JSON.stringify(log.slice(-2000)))
  } catch {}
}

/* Manda para a rede o que este PC media antes, uma única vez. O acréscimo
   ignora id repetido, então rodar de novo não duplica. */
async function migrarLocais(a: ApiTempos): Promise<void> {
  try {
    if (localStorage.getItem(MIGRADO_KEY)) return
    const locais = lerLocais()
    if (locais.length && a.addTempos) {
      const res = await a.addTempos(locais)
      if (!res?.ok) return               // falhou: tenta de novo na próxima
    }
    localStorage.setItem(MIGRADO_KEY, new Date().toISOString())
    localStorage.removeItem(TEMPOS_KEY)
  } catch {}
}

export async function lerTempos(): Promise<TempoTrabalho[]> {
  const a = api()
  if (a?.getTempos) {
    try {
      await migrarLocais(a)
      const res = await a.getTempos()
      if (res?.ok && Array.isArray(res.tempos)) return res.tempos
    } catch {}
  }
  return lerLocais()
}

export function registrarTempo(e: Omit<TempoTrabalho, 'id' | 'data'>): void {
  const registro: TempoTrabalho = { ...e, id: crypto.randomUUID(), data: new Date().toISOString() }
  const a = api()
  if (a?.addTempos) {
    // Sem await: medir tempo não pode atrasar a emissão. Falhou, guarda local —
    // a migração leva para a rede na próxima abertura.
    void a.addTempos([registro]).then(res => { if (!res?.ok) gravarLocal(registro) })
      .catch(() => gravarLocal(registro))
    return
  }
  gravarLocal(registro)
}

/* ─── marcadores de início (sessionStorage) ─────────────────────────────────── */
const k = (chave: string) => `cispr15_t0_${chave}`

export function iniciarMarcador(chave: string): void {
  try { sessionStorage.setItem(k(chave), String(Date.now())) } catch {}
}

/** só inicia se ainda não houver marcador ativo (ex.: ao abrir o formulário) */
export function iniciarMarcadorSeAusente(chave: string): void {
  try { if (!sessionStorage.getItem(k(chave))) sessionStorage.setItem(k(chave), String(Date.now())) } catch {}
}

/** encerra o marcador e devolve a duração em ms, descartando se fora da faixa
    (evita ruído de ociosidade / cliques acidentais). null = não registrar. */
export function finalizarMarcador(chave: string, minMs = 10_000, maxMs = 6 * 3_600_000): number | null {
  try {
    const raw = sessionStorage.getItem(k(chave))
    sessionStorage.removeItem(k(chave))
    if (!raw) return null
    const dur = Date.now() - Number(raw)
    if (!Number.isFinite(dur) || dur < minMs || dur > maxMs) return null
    return dur
  } catch { return null }
}

/* ─── agregação / formatação ────────────────────────────────────────────────── */
export function mediaDuracao(tempos: TempoTrabalho[], tipo: TempoTrabalho['tipo']): { mediaMs: number; n: number } {
  const ms = tempos.filter(t => t.tipo === tipo).map(t => t.duracaoMs)
  if (ms.length === 0) return { mediaMs: 0, n: 0 }
  return { mediaMs: ms.reduce((a, b) => a + b, 0) / ms.length, n: ms.length }
}

export function formatDuracao(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${seg}s`
  return `${seg}s`
}
