'use client'

import { useEffect, useRef, useState } from 'react'
import { Minus, X, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ─────────────────────────────────────────────────────────────────────────────
   Titlebar customizada para Electron (frame: false)

   IMPORTANTE: NÃO usa -webkit-app-region em nenhum elemento.
   Motivo: no Windows, -webkit-app-region: drag entrega o controle de
   hit-testing para o DWM do sistema, que (com frame:false maximizado)
   trata a janela inteira como área de arrastar — bloqueando todos os cliques.

   Solução: drag implementado 100% em JavaScript via IPC.
   - mousedown na área de drag → api.dragStart() (registra posição inicial)
   - mousemove no document → api.dragMove(dx, dy) via ipcRenderer.send
     (fire-and-forget, sem await, latência mínima)
   - mouseup → api.dragEnd()

   Botões min/max/close usam ipcRenderer.invoke normalmente.
   Duplo-clique na área de drag alterna maximizar/restaurar.
───────────────────────────────────────────────────────────────────────────── */

function WinBtn({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void
  label: string
  danger?: boolean
  children: React.ReactNode
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onMouseDown={e => e.stopPropagation()} // impede o drag ao clicar nos botões
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 46,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hov
          ? danger ? 'rgba(232,17,35,0.9)' : 'rgba(255,255,255,0.10)'
          : 'transparent',
        border: 'none',
        cursor: 'default',
        color: hov && danger ? '#fff' : 'rgba(255,255,255,0.42)',
        transition: 'background 100ms, color 100ms',
        flexShrink: 0,
        outline: 'none',
      }}
    >
      {children}
    </button>
  )
}

export function TitleBar() {
  // Detecta Electron imediatamente (sem useEffect) para evitar layout shift
  const [visible, setVisible] = useState(() =>
    typeof window !== 'undefined' && !!(window as any).electronAPI?.minimizeWindow
  )
  const [maximized, setMaximized] = useState(false)
  const dragging   = useRef(false)
  const startPos   = useRef({ screenX: 0, screenY: 0 })

  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null

  useEffect(() => {
    if (!api?.minimizeWindow) return
    // Confirma visibilidade e carrega estado do maximize
    setVisible(true)
    api.isMaximized?.().then((m: boolean) => setMaximized(!!m)).catch(() => {})

    // Atualiza ícone ao redimensionar / maximizar via snap
    const onResize = () => {
      api.isMaximized?.().then((m: boolean) => setMaximized(!!m)).catch(() => {})
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag handlers no document (capture global) ──────────────────────────
  useEffect(() => {
    if (!visible) return

    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const dx = e.screenX - startPos.current.screenX
      const dy = e.screenY - startPos.current.screenY
      api?.dragMove?.(dx, dy)
    }

    function onUp() {
      if (!dragging.current) return
      dragging.current = false
      api?.dragEnd?.()
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [visible, api])

  if (!visible) return null

  // ── Drag start: apenas botão esquerdo, fora dos botões (stopPropagation acima)
  function handleDragMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    if (maximized) return // janela maximizada não arrasta
    dragging.current = true
    startPos.current = { screenX: e.nativeEvent.screenX, screenY: e.nativeEvent.screenY }
    api?.dragStart?.()
  }

  async function toggleMaximize() {
    await api?.maximizeWindow?.()
    const m = await api?.isMaximized?.()
    if (typeof m === 'boolean') setMaximized(m)
  }

  return (
    <div
      className="no-print"
      onMouseDown={handleDragMouseDown}
      onDoubleClick={toggleMaximize}
      style={{
        position: 'sticky',
        top: 0,
        width: '100%',
        height: 32,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'rgba(4, 6, 12, 0.97)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        userSelect: 'none',
        cursor: maximized ? 'default' : 'grab',
        // SEM -webkit-app-region em lugar nenhum
      }}
    >
      {/* ── Identidade (esquerda) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 14, pointerEvents: 'none' }}>
        {/* Mini logo */}
        <div style={{
          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
          background: 'rgba(var(--accent-rgb,232,185,75),0.18)',
          border:     '1px solid rgba(var(--accent-rgb,232,185,75),0.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 5, height: 5, borderRadius: 1, background: 'rgba(var(--accent-rgb,232,185,75),0.80)' }} />
        </div>

        <span style={{
          fontFamily: 'var(--font-syne, system-ui)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.13em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)',
        }}>LABELO</span>

        <span style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.08)', display: 'block', flexShrink: 0 }} />

        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9.5, letterSpacing: '0.05em',
          color: 'rgba(var(--accent-rgb,232,185,75),0.52)',
        }}>CISPR 15</span>
      </div>

      {/* ── Centro sutil ── */}
      <div style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        fontFamily: 'var(--font-dm-mono, monospace)',
        fontSize: 8.5, letterSpacing: '0.22em',
        color: 'rgba(255,255,255,0.06)', textTransform: 'uppercase',
        pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        PUCRS · EMC LAB
      </div>

      {/* ── Controles (direita) ── */}
      <div style={{ display: 'flex' }}>
        <WinBtn label="Minimizar" onClick={() => api?.minimizeWindow?.()}>
          <Minus size={10} strokeWidth={2} />
        </WinBtn>
        <WinBtn label={maximized ? 'Restaurar' : 'Maximizar'} onClick={toggleMaximize}>
          {maximized ? <Minimize2 size={10} strokeWidth={2} /> : <Maximize2 size={10} strokeWidth={2} />}
        </WinBtn>
        <WinBtn label="Fechar" onClick={() => api?.closeWindow?.()} danger>
          <X size={11} strokeWidth={2} />
        </WinBtn>
      </div>
    </div>
  )
}
