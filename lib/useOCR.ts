'use client'

import { fileToBase64 } from '@/lib/utils'

/**
 * Extrai texto de uma imagem/PDF.
 * Usa o OCR nativo do Windows via Electron IPC (rápido).
 * Não usa Tesseract.js — é lento demais para uso interativo.
 */
type ElectronAPI = {
  recognizeOcr?: (imgs: { base64: string }[]) => Promise<{ ok: boolean; texts: string[] }>
  extractPdfText?: (base64: string) => Promise<{ ok: boolean; text: string; error?: string }>
}

function getElectronAPI(): ElectronAPI | null {
  if (typeof window === 'undefined') return null
  return (window as Window & typeof globalThis & { electronAPI?: ElectronAPI }).electronAPI ?? null
}

export async function extrairTextoArquivo(file: File): Promise<string> {
  if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Erro ao ler arquivo de texto.'))
      reader.readAsText(file)
    })
  }

  const base64 = await fileToBase64(file)
  const api = getElectronAPI()

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    if (!api?.extractPdfText) throw new Error('Extração de PDF não disponível.')
    const res = await api.extractPdfText(base64)
    if (!res?.ok || !res.text?.trim()) throw new Error(res?.error ?? 'Nenhum texto extraído do PDF.')
    return res.text
  }

  if (api?.recognizeOcr) {
    const res = await api.recognizeOcr([{ base64 }])
    if (res?.ok && res.texts?.length) {
      const texto = res.texts.filter((t: string) => t.trim()).join('\n')
      if (texto.trim()) return texto
    }
    throw new Error('OCR não retornou texto. Verifique se a imagem é legível.')
  }

  throw new Error('OCR nativo não disponível. Use a opção de colar texto manualmente.')
}
