/* ─── Marcadores de tempo de trabalho ──────────────────────────────────────────
   Mede dois indicadores para a análise do dashboard:
   • emissao — do abrir o formulário de emissão até o certificado (PDF) gerado
   • agenda  — tempo de preenchimento dos dados de uma amostra no cadastro da agenda

   Início fica em sessionStorage (não vaza entre sessões/reinícios do app);
   o registro final vai para localStorage (persiste no userData do Electron). */

export interface TempoTrabalho {
  id: string
  tipo: 'emissao' | 'agenda'
  protocolo?: string
  numRelatorio?: string
  duracaoMs: number
  data: string // ISO datetime — usado para filtrar por ano no dashboard
}

export const TEMPOS_KEY = 'cispr15_tempos_v1'

export function lerTempos(): TempoTrabalho[] {
  try {
    const raw = localStorage.getItem(TEMPOS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

export function registrarTempo(e: Omit<TempoTrabalho, 'id' | 'data'>): void {
  try {
    const log = lerTempos()
    log.push({ ...e, id: crypto.randomUUID(), data: new Date().toISOString() })
    const trimmed = log.slice(-2000) // mantém histórico recente
    localStorage.setItem(TEMPOS_KEY, JSON.stringify(trimmed))
  } catch {}
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
