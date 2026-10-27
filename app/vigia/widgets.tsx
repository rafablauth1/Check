'use client'
// VIGIA-7S no app — widgets equivalentes aos do ttk, ligados às variáveis de lib/vigia/tk.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useVar, dialogo, type Var, type Rotulo } from '@/lib/vigia/tk'
import { fixo, pyRoundN } from '@/lib/vigia/util'

export function Botao({ children, onClick, disabled, className = '', style, title }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; style?: CSSProperties; title?: string
}) {
  return <button type="button" className={`vg-bt ${className}`} onClick={onClick} disabled={disabled} style={style} title={title}>{children}</button>
}

export function Label({ v, className, style, wrap }: { v: Var<Rotulo>; className?: string; style?: CSSProperties; wrap?: number }) {
  const r = useVar(v)
  return <span className={className} style={{ color: r.foreground, maxWidth: wrap, whiteSpace: 'pre-wrap', ...style }}>{r.text}</span>
}

export function Check({ v, children, onChange, disabled }: { v: Var<boolean>; children?: ReactNode; onChange?: () => void; disabled?: boolean }) {
  const val = useVar(v)
  return (
    <label className="vg-check">
      <input type="checkbox" checked={val} disabled={disabled} onChange={e => { v.set(e.target.checked); onChange?.() }} />
      {children}
    </label>
  )
}

export function Radio<T extends string>({ v, valor, children, onChange }: { v: Var<T>; valor: T; children: ReactNode; onChange?: () => void }) {
  const val = useVar(v)
  return (
    <label className="vg-check">
      <input type="radio" checked={val === valor} onChange={() => { v.set(valor); onChange?.() }} />
      {children}
    </label>
  )
}

export function Entrada({ v, width, style, disabled }: { v: Var<string>; width?: number; style?: CSSProperties; disabled?: boolean }) {
  const val = useVar(v)
  return <input className="vg-entry" value={val} disabled={disabled} onChange={e => v.set(e.target.value)} style={{ width: width ? width * 8 + 8 : undefined, ...style }} />
}

/** ttk.Combobox editável (lista + texto livre). */
export function Combo({ v, valores, width, style, onSelect, onEnter }: {
  v: Var<string>; valores: string[]; width?: number; style?: CSSProperties; onSelect?: () => void; onEnter?: () => void
}) {
  const val = useVar(v)
  const id = useRef(`vgc${Math.random().toString(36).slice(2)}`).current
  return (
    <>
      <input className="vg-combo" list={id} value={val} style={{ width: width ? width * 8 + 22 : undefined, ...style }}
        onChange={e => {
          v.set(e.target.value)
          if (valores.includes(e.target.value) && (e.nativeEvent as InputEvent).inputType === undefined) onSelect?.()
        }}
        onKeyDown={e => { if (e.key === 'Enter') onEnter?.() }} />
      <datalist id={id}>{valores.map(o => <option key={o} value={o} />)}</datalist>
    </>
  )
}

/** ttk.Combobox state="readonly". */
export function ComboRO({ v, valores, width, onSelect, style }: { v: Var<string>; valores: string[]; width?: number; onSelect?: () => void; style?: CSSProperties }) {
  const val = useVar(v)
  return (
    <select className="vg-combo" data-ro value={val} style={{ width: width ? width * 8 + 26 : undefined, ...style }}
      onChange={e => { v.set(e.target.value); onSelect?.() }}>
      {!valores.includes(val) && <option value={val}>{val}</option>}
      {valores.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

/** ttk.Spinbox: texto livre (o valor vai como digitado, como no Tk) + setas que somam o incremento. */
export function Spin({ v, de, ate, inc, width = 7 }: { v: Var<string>; de: number; ate: number; inc: number; width?: number }) {
  const val = useVar(v)
  const passo = (d: number) => {
    const atual = Number(String(val).replace(',', '.'))
    const n = Number.isFinite(atual) ? atual + d * inc : de
    const r = Math.min(ate, Math.max(de, Math.round(n / inc) * inc))
    // o Tk mostra o valor com as casas do incremento ("0.87", "4.5", "3")
    const casas = (String(inc).split('.')[1] ?? '').length
    v.set(r.toFixed(casas))
  }
  return (
    <span className="vg-spinbox" style={{ width: width * 8 + 22 }}>
      <input value={val} onChange={e => v.set(e.target.value)} style={{ width: '100%' }}
        onKeyDown={e => { if (e.key === 'ArrowUp') { passo(1); e.preventDefault() } else if (e.key === 'ArrowDown') { passo(-1); e.preventDefault() } }} />
      <div><button type="button" tabIndex={-1} onClick={() => passo(1)}>▲</button><button type="button" tabIndex={-1} onClick={() => passo(-1)}>▼</button></div>
    </span>
  )
}

/** f-string do Python para os rótulos das escalas: "{:.0f}", "{:+.2f}", "{:.1f}×"… */
export function fmtPy(fmt: string, v: number): string {
  const m = fmt.match(/^\{:(\+?)\.(\d)f\}(.*)$/)
  if (!m) return String(v)
  const s = fixo(v, Number(m[2]))
  return (m[1] && !s.startsWith('-') ? '+' : '') + s + m[3]
}

/** slider(): Scale com arredondamento no passo e valor numérico ao lado. */
export function Escala({ v, de, ate, passo, fmt, aoMudar, style }: {
  v: Var<number>; de: number; ate: number; passo: number; fmt: string; aoMudar: () => void; style?: CSSProperties
}) {
  const val = useVar(v)
  return (
    <div className="vg-escala" style={style}>
      <input type="range" min={de} max={ate} step={passo} value={val}
        onChange={e => { v.set(pyRoundN(Math.round(Number(e.target.value) / passo) * passo, 4)); aoMudar() }} />
      <span>{fmtPy(fmt, val)}</span>
    </div>
  )
}

export function LabelFrame({ text, children, style, className = '' }: { text: ReactNode; children: ReactNode; style?: CSSProperties; className?: string }) {
  return <fieldset className={`vg-lf ${className}`} style={style}><legend>{text}</legend>{children}</fieldset>
}

export function Notebook({ abas, v, interno, children, style }: { abas: string[]; v: Var<number>; interno?: boolean; children: ReactNode[]; style?: CSSProperties }) {
  const sel = useVar(v)
  return (
    <div className={`vg-nb ${interno ? 'vg-nb-interno' : ''}`} style={style}>
      <div className="vg-abas">
        {abas.map((a, i) => <button key={i} type="button" className={i === sel ? 'sel' : ''} onClick={() => v.set(i)}>{a}</button>)}
      </div>
      {children.map((c, i) => <div key={i} className="vg-pag" style={{ display: i === sel ? undefined : 'none' }}>{c}</div>)}
    </div>
  )
}

/** painel_ajustavel(): divisória arrastável; a posição fica em layout[chave] (fração). */
export function Painel({ vertical, layout, chave, padrao, primeiro, segundo, minimo = 40, aoGuardar, esconderSegundo }: {
  vertical?: boolean; layout: Record<string, unknown>; chave: string; padrao: (tam: number) => number
  primeiro: ReactNode; segundo: ReactNode; minimo?: number; aoGuardar?: () => void; esconderSegundo?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [tam, setTam] = useState(0)
  const [pos, setPos] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setTam(vertical ? el.clientHeight : el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [vertical])
  const fr = layout[chave]
  const atual = pos ?? (Array.isArray(fr) && tam >= 80 ? tam * Math.min(Math.max(Number(fr[0]), 0.03), 0.97) : padrao(tam))
  const arrastar = (e: React.PointerEvent) => {
    const el = ref.current!
    const r = el.getBoundingClientRect()
    const mover = (ev: PointerEvent) => {
      const p = vertical ? ev.clientY - r.top : ev.clientX - r.left
      setPos(Math.min(Math.max(p, minimo), (vertical ? r.height : r.width) - minimo))
    }
    const soltar = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar)
      const t = vertical ? r.height : r.width
      const p = Math.min(Math.max(vertical ? ev.clientY - r.top : ev.clientX - r.left, minimo), t - minimo)
      layout[chave] = [pyRoundN(p / t, 4)]
      setPos(null)
      aoGuardar?.()
    }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar)
    e.preventDefault()
  }
  const dim = vertical ? 'height' : 'width'
  return (
    <div ref={ref} className={`vg-paned ${vertical ? 'vert' : ''}`}>
      <div style={{ [dim]: esconderSegundo ? '100%' : atual, flex: 'none', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>{primeiro}</div>
      {!esconderSegundo && <div className="vg-sash" onPointerDown={arrastar} />}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: esconderSegundo ? 'none' : 'flex', flexDirection: 'column' }}>{segundo}</div>
    </div>
  )
}

const ICONES = { info: 'ℹ️', aviso: '⚠️', erro: '⛔', simnao: '❓', texto: '' } as const

/** messagebox / simpledialog */
export function Dialogos() {
  const d = useVar(dialogo)
  const [texto, setTexto] = useState('')
  useEffect(() => { if (d?.tipo === 'texto') setTexto(d.inicial) }, [d])
  if (!d) return null
  const fechar = () => (d.tipo === 'simnao' ? d.resp(false) : d.tipo === 'texto' ? d.resp(null) : d.ok())
  return (
    <div className="vg-dlg-fundo" onKeyDown={e => { if (e.key === 'Escape') fechar() }}>
      <div className="vg-dlg" role="dialog">
        <div className="tit">{d.titulo}</div>
        <div className="corpo">
          {ICONES[d.tipo] && <span style={{ fontSize: 26, lineHeight: 1 }}>{ICONES[d.tipo]}</span>}
          <div style={{ flex: 1 }}>
            {d.msg}
            {d.tipo === 'texto' && (
              <input autoFocus className="vg-entry" style={{ display: 'block', width: '100%', marginTop: 8 }} value={texto}
                onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') d.resp(texto) }} />
            )}
          </div>
        </div>
        <div className="rodape">
          {d.tipo === 'simnao' ? (
            <><Botao onClick={() => d.resp(true)}>Sim</Botao><Botao onClick={() => d.resp(false)}>Não</Botao></>
          ) : d.tipo === 'texto' ? (
            <><Botao onClick={() => d.resp(texto)}>OK</Botao><Botao onClick={() => d.resp(null)}>Cancelar</Botao></>
          ) : (
            <Botao onClick={d.ok}>OK</Botao>
          )}
        </div>
      </div>
    </div>
  )
}

export interface ColunaTabela { id: string; largura: number; anchor?: 'w' | 'center' | 'e' }

/** ttk.Treeview (show="headings") + colunas_ajustaveis: larguras guardadas em layout[chave]. */
export function Tabela({ colunas, linhas, layout, chave, sel, aoSelecionar, aoArrastar, aoDuploClique, aoMenu, cores, estilos, altura, verUltimo }: {
  colunas: ColunaTabela[]; linhas: { id: string; valores: ReactNode[]; tag?: string }[]
  layout: Record<string, unknown>; chave: string; sel: string[]; aoSelecionar: (ids: string[]) => void
  /** arrastar uma linha para outra posição (de, para) */
  aoArrastar?: (de: string, para: string) => void
  aoDuploClique?: (id: string) => void
  aoMenu?: (id: string, x: number, y: number) => void
  cores?: Record<string, string>; altura?: number
  /** tag_configure: estilo de cada tag (fundo, cor, negrito) */
  estilos?: Record<string, CSSProperties>
  /** muda a cada linha inserida: rola até a última (tree.see) */
  verUltimo?: number
}) {
  const [, forcar] = useState(0)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => { if (verUltimo !== undefined && caixa.current) caixa.current.scrollTop = caixa.current.scrollHeight }, [verUltimo])
  const salvas = (layout[chave] && typeof layout[chave] === 'object' ? layout[chave] : {}) as Record<string, number>
  const larg = (c: ColunaTabela) => Math.max(30, Number(salvas[c.id] ?? c.largura))
  const arrasto = useRef<{ de: string; para: string | null } | null>(null)
  const redimensionar = (c: ColunaTabela, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = larg(c)
    const mover = (ev: PointerEvent) => {
      const atual = (layout[chave] && typeof layout[chave] === 'object' ? layout[chave] : {}) as Record<string, number>
      layout[chave] = { ...atual, [c.id]: Math.max(30, Math.round(w0 + ev.clientX - x0)) }
      forcar(n => n + 1)
    }
    const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar) }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar)
  }
  const total = colunas.reduce((a, c) => a + larg(c), 0)
  return (
    <div ref={caixa} className="vg-tree" style={{ height: altura }} onPointerUp={() => {
      const a = arrasto.current
      arrasto.current = null
      if (a && a.para && a.para !== a.de) aoArrastar?.(a.de, a.para)
    }}>
      <table style={{ width: total }}>
        <colgroup>{colunas.map(c => <col key={c.id} style={{ width: larg(c) }} />)}</colgroup>
        <thead>
          <tr>{colunas.map(c => (
            <th key={c.id} style={{ position: 'sticky' }}>{c.id}<span className="borda" onPointerDown={e => redimensionar(c, e)} /></th>
          ))}</tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.id} className={sel.includes(l.id) ? 'sel' : ''}
              onPointerDown={e => {
                if (e.button !== 0) return
                if (e.ctrlKey) aoSelecionar(sel.includes(l.id) ? sel.filter(x => x !== l.id) : [...sel, l.id])
                else if (e.shiftKey && sel.length) {
                  const ids = linhas.map(x => x.id), a = ids.indexOf(sel[0]), b = ids.indexOf(l.id)
                  aoSelecionar(ids.slice(Math.min(a, b), Math.max(a, b) + 1))
                }
                else aoSelecionar([l.id])
                arrasto.current = aoArrastar ? { de: l.id, para: null } : null
              }}
              onPointerEnter={() => { if (arrasto.current) { arrasto.current.para = l.id; if (l.id !== arrasto.current.de) aoSelecionar([l.id]) } }}
              onDoubleClick={() => aoDuploClique?.(l.id)}
              onContextMenu={e => { if (aoMenu) { e.preventDefault(); if (!sel.includes(l.id)) aoSelecionar([l.id]); aoMenu(l.id, e.clientX, e.clientY) } }}>
              {l.valores.map((v, i) => (
                <td key={i} style={{ textAlign: colunas[i]?.anchor === 'w' ? 'left' : colunas[i]?.anchor === 'e' ? 'right' : 'center', background: l.tag ? cores?.[l.tag] : undefined, ...(l.tag ? estilos?.[l.tag] : undefined) }}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
