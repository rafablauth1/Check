'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Hunspell } from 'hunspell-asm'
import { carregarCorretor, adicionarAoDicionario } from './motor'
import { encontrarPalavras, type Palavra } from './tokenizar'

interface UseCorretor {
  pronto: boolean
  /** Palavras (com posição) do texto que não foram reconhecidas pelo dicionário. */
  erros: (texto: string) => Palavra[]
  sugerir: (palavra: string) => string[]
  adicionar: (palavra: string) => void
}

// Carrega o corretor uma vez (o singleton mora em lib/corretor/motor.ts) e
// expõe helpers síncronos para os componentes de campo de texto.
export function useCorretor(): UseCorretor {
  const [pronto, setPronto] = useState(false)
  const ref = useRef<Hunspell | null>(null)

  useEffect(() => {
    let ativo = true
    carregarCorretor().then(c => {
      if (!ativo) return
      ref.current = c
      setPronto(true)
    })
    return () => { ativo = false }
  }, [])

  const erros = useCallback((texto: string) => {
    const c = ref.current
    if (!c || !texto) return []
    return encontrarPalavras(texto).filter(p => !c.spell(p.texto))
  }, [])

  const sugerir = useCallback((palavra: string) => {
    const c = ref.current
    return c ? c.suggest(palavra) : []
  }, [])

  const adicionar = useCallback((palavra: string) => {
    const c = ref.current
    if (c) adicionarAoDicionario(c, palavra)
  }, [])

  return { pronto, erros, sugerir, adicionar }
}
