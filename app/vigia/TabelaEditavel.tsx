'use client'
// TabelaEditavel (vigia7s/registro.py): Treeview com edição por duplo clique (Enter confirma e desce para a linha
// de baixo). As colunas podem ser alargadas arrastando a borda do cabeçalho (barra de rolagem horizontal quando
// passam da largura); esticar distribui a sobra da largura entre todas as colunas.
import { useEffect, useRef, useState, type CSSProperties } from 'react'

export interface ColunaEd { id: string; largura: number; titulo?: string; aoClicar?: () => void }
export interface LinhaEd { id: string; valores: string[]; tag?: string | null; marcador?: boolean }

export const ESTILOS_REG: Record<string, CSSProperties> = {
  alerta: { background: '#fce8e6' },
  falha: { background: '#f8b4b0', color: '#8b0000' },
  dentro: { background: '#e6f4ea' },
  pendente: { background: '#fff8e1' },
  // marcador (ex.: início de cada faixa/antena): linha só de leitura, fora da numeração dos dados
  marcador: { background: '#d9e2f3', color: '#1f3864', fontWeight: 'bold' },
}

export default function TabelaEditavel({ colunas, linhas, editaveis, aoEditar, aoDuplo, layout, chave, sel, aoSelecionar, esticar, editar, aoMudarLayout }: {
  colunas: ColunaEd[]; linhas: LinhaEd[]; editaveis: string[]
  aoEditar: (i: number, col: string, texto: string) => void
  /** duplo clique numa coluna NÃO editável (ex.: abrir a foto da leitura) */
  aoDuplo?: (i: number, col: string) => void
  layout: Record<string, unknown>; chave: string; sel: string[]; aoSelecionar: (ids: string[]) => void
  esticar?: boolean
  /** pedido de edição vindo do código (ex.: "+ linha" abre a edição do volume) */
  editar?: { i: number; col: string; n: number } | null
  aoMudarLayout?: () => void
}) {
  const [, forcar] = useState(0)
  const [ed, setEd] = useState<{ id: string; col: string; valor: string; texto: string } | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const edRef = useRef<typeof ed>(null)  // a edição em curso (Enter e o blur não confirmam duas vezes)
  edRef.current = ed
  const salvas = (layout[chave] && typeof layout[chave] === 'object' ? layout[chave] : {}) as Record<string, number>
  const larg = (c: ColunaEd) => Math.max(30, Number(salvas[c.id] ?? c.largura))
  const dados = linhas.filter(l => !l.marcador)

  const abrir = (id: string, col: string) => {
    const l = linhas.find(x => x.id === id)
    if (!l || l.marcador) return
    const v = l.valores[colunas.findIndex(c => c.id === col)] ?? ''
    aoSelecionar([id])
    setEd({ id, col, valor: v, texto: v })
  }
  useEffect(() => { if (editar) abrir(String(editar.i), editar.col) }, [editar?.n])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ed || !caixa.current) return
    const td = caixa.current.querySelector(`[data-cel="${ed.id}|${ed.col}"]`) as HTMLElement | null
    td?.scrollIntoView({ block: 'nearest' })
  }, [ed?.id, ed?.col])  // eslint-disable-line react-hooks/exhaustive-deps

  const confirmar = (descer: boolean) => {
    const atual = edRef.current
    if (!atual) return
    edRef.current = null
    const { id, col, valor, texto } = atual
    setEd(null)
    if (texto.trim() !== String(valor).trim()) aoEditar(Number(id), col, texto)  // sem mudança: nada a gravar nem a registrar no histórico
    if (descer) {
      const k = dados.findIndex(l => l.id === id)
      const prox = dados[k + 1]
      if (prox) setTimeout(() => abrir(prox.id, col), 0)
    }
  }

  const redimensionar = (c: ColunaEd, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = larg(c)
    const mover = (ev: PointerEvent) => {
      const atual = (layout[chave] && typeof layout[chave] === 'object' ? layout[chave] : {}) as Record<string, number>
      layout[chave] = { ...atual, [c.id]: Math.max(30, Math.round(w0 + ev.clientX - x0)) }
      forcar(n => n + 1)
    }
    const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); aoMudarLayout?.() }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar)
  }
  const total = colunas.reduce((a, c) => a + larg(c), 0)
  return (
    <div ref={caixa} className="vg-tree" tabIndex={0}
      onKeyDown={e => {
        if (ed || e.key !== 'Enter' || !sel[0] || !editaveis.length) return
        abrir(sel[0], editaveis[0])
      }}>
      <table style={{ width: esticar ? `max(100%, ${total}px)` : total }}>
        <colgroup>{colunas.map(c => <col key={c.id} style={{ width: larg(c) }} />)}</colgroup>
        <thead>
          <tr>{colunas.map(c => (
            <th key={c.id} style={{ position: 'sticky' }} onClick={c.aoClicar}>{c.titulo ?? c.id}<span className="borda" onPointerDown={e => redimensionar(c, e)} /></th>
          ))}</tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.id} className={sel.includes(l.id) && !l.marcador ? 'sel' : ''}
              onPointerDown={e => { if (e.button === 0 && !l.marcador) aoSelecionar([l.id]) }}>
              {l.valores.map((v, i) => {
                const col = colunas[i]?.id ?? ''
                const editando = ed && ed.id === l.id && ed.col === col
                return (
                  <td key={i} data-cel={`${l.id}|${col}`}
                    style={{ textAlign: col === 'Obs.' ? 'left' : 'center', position: editando ? 'relative' : undefined, ...(l.tag ? ESTILOS_REG[l.tag] : undefined) }}
                    onDoubleClick={() => {
                      if (l.marcador) return
                      if (editaveis.includes(col)) abrir(l.id, col)
                      else aoDuplo?.(Number(l.id), col)
                    }}>
                    {editando ? (
                      <input autoFocus className="vg-entry" value={ed.texto}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', boxSizing: 'border-box', textAlign: 'left' }}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => { const n = { ...ed, texto: e.target.value }; edRef.current = n; setEd(n) }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); confirmar(true) }
                          else if (e.key === 'Tab') { e.preventDefault(); confirmar(false) }
                          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); edRef.current = null; setEd(null) }
                        }}
                        onBlur={() => confirmar(false)} />
                    ) : v}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
