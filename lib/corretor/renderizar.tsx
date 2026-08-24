import type { ReactNode } from 'react'
import type { Palavra } from './tokenizar'

// Texto com sublinhado ondulado vermelho (estilo Word) sob as palavras não
// reconhecidas — usado no overlay "espelho" atrás do campo real.
export function renderComSublinhado(texto: string, erros: Palavra[]): ReactNode {
  if (!erros.length) return texto
  const nodes: ReactNode[] = []
  let cursor = 0
  erros.forEach((e, i) => {
    if (e.inicio > cursor) nodes.push(texto.slice(cursor, e.inicio))
    nodes.push(
      <span key={i} style={{
        textDecorationLine: 'underline',
        textDecorationStyle: 'wavy',
        textDecorationColor: '#f87171',
        textDecorationThickness: '1.5px',
        textUnderlineOffset: '3px',
      }}>
        {texto.slice(e.inicio, e.fim)}
      </span>
    )
    cursor = e.fim
  })
  if (cursor < texto.length) nodes.push(texto.slice(cursor))
  return nodes
}
