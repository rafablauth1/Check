'use client'

import { useRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { useSpellOverlay } from '@/lib/corretor/useSpellOverlay'
import { renderComSublinhado } from '@/lib/corretor/renderizar'
import { MenuSugestoesCorretor } from './MenuSugestoesCorretor'

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string
  onChange: (valor: string) => void
}

// Textarea com corretor ortográfico pt-BR embutido (sublinhado ondulado +
// sugestões no botão direito). Roda 100% em JS no renderer — não usa o
// spellcheck nativo do Electron (ver lib/corretor/motor.ts).
export function TextareaCorretor({ value, onChange, className, ...rest }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const { errosAtuais, menu, abrirMenu, fecharMenu, adicionar } = useSpellOverlay(value)

  function sincronizarScroll() {
    if (taRef.current && mirrorRef.current) {
      mirrorRef.current.scrollTop = taRef.current.scrollTop
      mirrorRef.current.scrollLeft = taRef.current.scrollLeft
    }
  }

  function handleContextMenu(e: React.MouseEvent<HTMLTextAreaElement>) {
    const el = taRef.current
    if (!el) return
    const indice = el.selectionStart ?? 0
    if (abrirMenu(e.clientX, e.clientY, indice)) e.preventDefault()
  }

  function escolherSugestao(sugestao: string) {
    if (!menu) return
    onChange(value.slice(0, menu.alvo.inicio) + sugestao + value.slice(menu.alvo.fim))
    fecharMenu()
  }

  function adicionarAoDicionario() {
    if (!menu) return
    adicionar(menu.alvo.texto)
    fecharMenu()
  }

  return (
    <div className="relative">
      <div ref={mirrorRef} aria-hidden
        className={cn(className, 'absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words pointer-events-none select-none')}
        style={{ color: 'transparent', background: 'transparent', borderColor: 'transparent', boxShadow: 'none' }}>
        {renderComSublinhado(value, errosAtuais)}
        {'​'}
      </div>
      <textarea
        {...rest}
        ref={taRef}
        className={cn(className, 'relative z-10 bg-transparent')}
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={sincronizarScroll}
        onContextMenu={handleContextMenu}
      />
      {menu && (
        <MenuSugestoesCorretor menu={menu} onEscolher={escolherSugestao}
          onAdicionar={adicionarAoDicionario} onFechar={fecharMenu} />
      )}
    </div>
  )
}
