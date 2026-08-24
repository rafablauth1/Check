'use client'

import { useRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { useSpellOverlay } from '@/lib/corretor/useSpellOverlay'
import { renderComSublinhado } from '@/lib/corretor/renderizar'
import { MenuSugestoesCorretor } from './MenuSugestoesCorretor'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (valor: string) => void
}

// Input de linha única com corretor ortográfico pt-BR embutido — mesma ideia
// do TextareaCorretor, ver ali para o porquê de não usar o spellcheck nativo.
export function InputCorretor({ value, onChange, className, ...rest }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const { errosAtuais, menu, abrirMenu, fecharMenu, adicionar } = useSpellOverlay(value)

  function sincronizarScroll() {
    if (inputRef.current && mirrorRef.current) {
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft
    }
  }

  function handleContextMenu(e: React.MouseEvent<HTMLInputElement>) {
    const el = inputRef.current
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
        className={cn(className, 'absolute inset-0 z-0 overflow-hidden whitespace-pre pointer-events-none select-none')}
        style={{ color: 'transparent', background: 'transparent', borderColor: 'transparent', boxShadow: 'none' }}>
        {renderComSublinhado(value, errosAtuais)}
      </div>
      <input
        {...rest}
        ref={inputRef}
        className={cn(className, 'relative z-10 bg-transparent')}
        value={value}
        onChange={e => { onChange(e.target.value); sincronizarScroll() }}
        onScroll={sincronizarScroll}
        onKeyUp={sincronizarScroll}
        onContextMenu={handleContextMenu}
      />
      {menu && (
        <MenuSugestoesCorretor menu={menu} onEscolher={escolherSugestao}
          onAdicionar={adicionarAoDicionario} onFechar={fecharMenu} />
      )}
    </div>
  )
}
