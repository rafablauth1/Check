'use client'

import { useEffect, useRef } from 'react'
import { BookPlus } from 'lucide-react'
import type { MenuSugestoes } from '@/lib/corretor/useSpellOverlay'

export function MenuSugestoesCorretor({
  menu, onEscolher, onAdicionar, onFechar,
}: {
  menu: MenuSugestoes
  onEscolher: (sugestao: string) => void
  onAdicionar: () => void
  onFechar: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlerClique(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onFechar()
    }
    function handlerEsc(e: KeyboardEvent) { if (e.key === 'Escape') onFechar() }
    document.addEventListener('mousedown', handlerClique)
    document.addEventListener('keydown', handlerEsc)
    return () => {
      document.removeEventListener('mousedown', handlerClique)
      document.removeEventListener('keydown', handlerEsc)
    }
  }, [onFechar])

  // Mantém o menu dentro da viewport.
  const style = {
    left: Math.min(menu.x, window.innerWidth - 200),
    top: Math.min(menu.y, window.innerHeight - 140),
  }

  return (
    <div ref={ref}
      className="fixed z-[999] min-w-[180px] rounded-xl border border-white/10 overflow-hidden shadow-2xl py-1"
      style={{ ...style, background: '#111520' }}>
      {menu.sugestoes.length === 0 && (
        <p className="px-4 py-2 text-[11px] text-white/30 italic">Sem sugestões</p>
      )}
      {menu.sugestoes.slice(0, 6).map(s => (
        <button key={s} type="button" onClick={() => onEscolher(s)}
          className="w-full text-left px-4 py-1.5 text-[12px] text-white/75 hover:bg-white/[0.06] hover:text-white transition-colors">
          {s}
        </button>
      ))}
      <div className="my-1 border-t border-white/8" />
      <button type="button" onClick={onAdicionar}
        className="w-full flex items-center gap-2 text-left px-4 py-1.5 text-[11px] text-white/45 hover:bg-white/[0.06] hover:text-white/80 transition-colors">
        <BookPlus size={11} /> Adicionar &ldquo;{menu.alvo.texto}&rdquo; ao dicionário
      </button>
    </div>
  )
}
