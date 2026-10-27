// VIGIA-7S no app — o mínimo do tkinter que as telas usam: variáveis observáveis (StringVar,
// BooleanVar…) com trace, e as caixas messagebox/simpledialog. Assim o código das telas segue o
// app.py quase linha a linha; os componentes React só se ligam às variáveis.
'use client'
import { useSyncExternalStore } from 'react'

export class Var<T> {
  private ouvintes = new Set<() => void>()
  private traces: ((v: T) => void)[] = []
  constructor(private valor: T) {}
  get(): T { return this.valor }
  set(v: T) {
    if (Object.is(v, this.valor) && typeof v !== 'object') return
    this.valor = v
    this.ouvintes.forEach(f => f())
    this.traces.forEach(f => f(v))
  }
  /** trace_add("write", …) */
  trace(f: (v: T) => void) { this.traces.push(f); return this }
  /** só para o React */
  ouvir = (f: () => void) => { this.ouvintes.add(f); return () => { this.ouvintes.delete(f) } }
  /** avisa os componentes sem trocar o valor (lista/objeto mexido no lugar) */
  avisar() { this.ouvintes.forEach(f => f()) }
}

export function useVar<T>(v: Var<T>): T {
  return useSyncExternalStore(v.ouvir, () => v.get(), () => v.get())
}

/** Rótulo (ttk.Label) com texto e cor mudados pelo código. */
export interface Rotulo { text: string; foreground?: string }
export const rotulo = (text = '', foreground?: string) => new Var<Rotulo>({ text, foreground })

// ----------------------------------------------------------------------------- caixas de diálogo
export type Dialogo =
  | { tipo: 'info' | 'aviso' | 'erro'; titulo: string; msg: string; ok: () => void }
  | { tipo: 'simnao'; titulo: string; msg: string; resp: (sim: boolean) => void }
  | { tipo: 'texto'; titulo: string; msg: string; inicial: string; resp: (t: string | null) => void }

export const dialogo = new Var<Dialogo | null>(null)
const fila: (() => void)[] = []

function abrir(d: (fechar: () => void) => Dialogo) {
  const mostrar = () => {
    const fechar = () => { dialogo.set(null); fila.shift()?.() }
    dialogo.set(d(fechar))
  }
  if (dialogo.get()) fila.push(mostrar)
  else mostrar()
}

export const messagebox = {
  showinfo: (titulo: string, msg: string) => new Promise<void>(r => abrir(f => ({ tipo: 'info', titulo, msg, ok: () => { f(); r() } }))),
  showwarning: (titulo: string, msg: string) => new Promise<void>(r => abrir(f => ({ tipo: 'aviso', titulo, msg, ok: () => { f(); r() } }))),
  showerror: (titulo: string, msg: string) => new Promise<void>(r => abrir(f => ({ tipo: 'erro', titulo, msg, ok: () => { f(); r() } }))),
  askyesno: (titulo: string, msg: string) => new Promise<boolean>(r => abrir(f => ({ tipo: 'simnao', titulo, msg, resp: s => { f(); r(s) } }))),
}

export const simpledialog = {
  askstring: (titulo: string, msg: string, inicial = '') =>
    new Promise<string | null>(r => abrir(f => ({ tipo: 'texto', titulo, msg, inicial, resp: t => { f(); r(t) } }))),
}

// ----------------------------------------------------------------------------- formatos do Python
/** f"{v:g}" */
export function fmtG(v: number): string {
  if (!Number.isFinite(v)) return String(v).toLowerCase().replace('infinity', 'inf')
  if (v === 0) return Object.is(v, -0) ? '-0' : '0'
  const exp = Math.floor(Math.log10(Math.abs(Number(v.toPrecision(6)))))
  if (exp < -4 || exp >= 6) {
    const [m, e] = v.toExponential(5).split('e')
    const mm = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m
    const n = Number(e)
    return `${mm}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`
  }
  const s = v.toFixed(Math.max(0, 5 - exp))
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}
