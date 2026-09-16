'use client'

/* Acesso à lista de relatórios — ponto único para as telas.
 *
 * Regra que este módulo existe para impor: o arquivo da rede é a única fonte de
 * verdade, e o localStorage é um cache de leitura. Nenhuma gravação para a rede
 * pode ser montada a partir do cache.
 *
 * O motivo é concreto. Em 09/09/2026 e de novo em 11/09/2026, uma tela leu a
 * lista do localStorage — truncada, porque o HTML dos .docx tinha estourado a
 * cota de ~5 MB e toda escrita local passara a falhar em silêncio — e mandou
 * essa lista curta para o arquivo compartilhado. Da primeira vez 17 relatórios
 * sumiram; da segunda a guarda do processo principal recusou a gravação.
 *
 * Por isso as gravações aqui são por INTENÇÃO (`salvarRelatorio`,
 * `removerRelatorio`): o processo principal lê o arquivo bom, aplica a mudança
 * e grava. A tela nunca mais compõe a lista inteira, então uma lista curta não
 * tem por onde entrar.
 */

import type { RelatorioSalvo } from '@/app/cispr15/types'
import { RELATORIOS_KEY } from '@/app/cispr15/types'

type Api = {
  getRelatorios?: () => Promise<{ ok?: boolean; relatorios?: RelatorioSalvo[]; corrompido?: boolean }>
  upsertRelatorio?: (r: RelatorioSalvo) => Promise<{ ok?: boolean; error?: string }>
  removerRelatorio?: (id: string) => Promise<{ ok?: boolean; error?: string }>
}

function getApi(): Api | null {
  if (typeof window === 'undefined') return null
  return (window as any).electronAPI ?? null
}

/** Índice leve: sem fotos. É o que o cache local pode conter. */
const leve = (r: RelatorioSalvo): RelatorioSalvo => ({ ...r, photos: [] })

/** Cache local — best-effort e sempre leve. Nunca é fonte para gravar na rede. */
export function gravarCacheLeve(lista: RelatorioSalvo[]): void {
  try {
    localStorage.setItem(RELATORIOS_KEY, JSON.stringify(lista.map(leve)))
  } catch {
    // Cota cheia: o cache é dispensável (a rede tem a versão boa), mas um cache
    // truncado é perigoso se alguém voltar a lê-lo. Melhor não ter nenhum.
    try { localStorage.removeItem(RELATORIOS_KEY) } catch {}
  }
}

function lerCache(): RelatorioSalvo[] {
  try {
    const raw = localStorage.getItem(RELATORIOS_KEY)
    const lista = raw ? JSON.parse(raw) : []
    return Array.isArray(lista) ? lista : []
  } catch { return [] }
}

/**
 * Lista atual. Com Electron vem da rede e o cache é atualizado de tabela; sem
 * Electron (versão web) o cache é a única fonte que existe.
 */
export async function carregarRelatorios(): Promise<RelatorioSalvo[]> {
  const api = getApi()
  if (api?.getRelatorios) {
    try {
      const res = await api.getRelatorios()
      if (res?.ok && Array.isArray(res.relatorios)) {
        gravarCacheLeve(res.relatorios)
        return res.relatorios
      }
    } catch {}
  }
  return lerCache()
}

/** Cria ou atualiza UM relatório. */
export async function salvarRelatorio(entry: RelatorioSalvo): Promise<{ ok: boolean; error?: string }> {
  const api = getApi()
  if (api?.upsertRelatorio) {
    const res = await api.upsertRelatorio(leve(entry)).catch(e => ({ ok: false, error: String(e) }))
    if (!res?.ok) return { ok: false, error: res?.error ?? 'Falha ao gravar o relatório na rede.' }
    atualizarNoCache(entry)
    return { ok: true }
  }
  // Versão web: sem processo principal, o cache é o armazenamento.
  atualizarNoCache(entry)
  return { ok: true }
}

/** Remove UM relatório (ou registro-emenda) pelo id. */
export async function removerRelatorio(id: string): Promise<{ ok: boolean; error?: string }> {
  const api = getApi()
  if (api?.removerRelatorio) {
    const res = await api.removerRelatorio(id).catch(e => ({ ok: false, error: String(e) }))
    if (!res?.ok) return { ok: false, error: res?.error ?? 'Falha ao remover o relatório na rede.' }
  }
  gravarCacheLeve(lerCache().filter(r => r.id !== id))
  return { ok: true }
}

function atualizarNoCache(entry: RelatorioSalvo): void {
  const lista = lerCache()
  const i = lista.findIndex(r => r.id === entry.id)
  if (i >= 0) lista[i] = leve(entry)
  else lista.unshift(leve(entry))
  gravarCacheLeve(lista)
}
