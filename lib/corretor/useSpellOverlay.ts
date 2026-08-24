'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCorretor } from './hook'
import { palavraNoIndice, type Palavra } from './tokenizar'

export interface MenuSugestoes {
  x: number
  y: number
  alvo: Palavra
  sugestoes: string[]
}

const DEBOUNCE_MS = 350

// Verificação SEMPRE debounced e fora do caminho da tecla digitada — essa foi
// a causa do travamento do corretor nativo do Electron (ver
// lib/corretor/motor.ts). Aqui quem digita nunca espera o dicionário.
export function useSpellOverlay(texto: string) {
  const { pronto, erros, sugerir, adicionar } = useCorretor()
  const [errosAtuais, setErrosAtuais] = useState<Palavra[]>([])
  const [menu, setMenu] = useState<MenuSugestoes | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!pronto) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setErrosAtuais(erros(texto)), DEBOUNCE_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [texto, pronto, erros])

  const abrirMenu = useCallback((clientX: number, clientY: number, indice: number) => {
    const alvo = palavraNoIndice(texto, indice)
    if (!alvo) return false
    const errada = errosAtuais.some(e => e.inicio === alvo.inicio && e.fim === alvo.fim)
    if (!errada) return false
    setMenu({ x: clientX, y: clientY, alvo, sugestoes: sugerir(alvo.texto) })
    return true
  }, [texto, errosAtuais, sugerir])

  const fecharMenu = useCallback(() => setMenu(null), [])

  return { errosAtuais, menu, abrirMenu, fecharMenu, adicionar }
}
