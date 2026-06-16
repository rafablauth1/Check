import { clsx, type ClassValue } from 'clsx'
import { format, differenceInDays, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Merge de classes Tailwind
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Formatar data DD/MM/YYYY
export function fmt(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return '—'
  }
}

// Dias até uma data
export function diasAte(dateStr?: string | null): number {
  if (!dateStr) return 9999
  return differenceInDays(new Date(dateStr), new Date())
}

// Status de calibração
export function calStatus(dateStr?: string | null) {
  const d = diasAte(dateStr)
  if (d < 0)  return { label: 'VENCIDO',  color: 'danger',  bg: 'bg-danger/10 text-danger' }
  if (d <= 30) return { label: `${d}d`,    color: 'warning', bg: 'bg-warning/10 text-warning' }
  if (d <= 60) return { label: `${d}d`,    color: 'gold',    bg: 'bg-gold/10 text-gold' }
  return              { label: 'EM DIA',   color: 'success', bg: 'bg-success/10 text-success' }
}

// Adicionar meses a uma data
export function addM(dateStr: string, months: number): string {
  try {
    const d = addMonths(new Date(dateStr + 'T12:00:00'), months)
    return format(d, 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

// Converter arquivo para base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // só o base64, sem o prefixo
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Formatar tamanho de arquivo
export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// UID simples (para uso no cliente)
export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Potência: por padrão em W. Se o usuário digitar só o número, anexa "W".
// Mantém intacto se já houver qualquer unidade/letra (kW, mW, etc.).
export function normWatts(v: string): string {
  const t = (v ?? '').trim()
  if (!t) return t
  if (/[a-zA-Z]/.test(t)) return t          // já tem unidade
  if (/^[\d.,]+$/.test(t)) return t + 'W'   // número puro → vira "<n>W"
  return t
}
