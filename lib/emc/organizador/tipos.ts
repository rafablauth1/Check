import type { Ponto } from '@/lib/emc/organizador/dat'

// Tipos trocados entre a tela do Organizador (aba "Radian" da agenda EMC) e
// /api/emc/organizador.

export interface ConfigOrganizador {
  /** Pasta do PC do Radian (Y:\ = \\10.30.35.191\RR-PCSuite). */
  origem: string
  /** Registros de ensaio na rede (T:\…\ML - 2026): <protocolo>_<cliente>\Radian\<norma>. */
  destino: string
  verificarAoEnviar: boolean
  limiteDesvio: number
}

export const ARQUIVO_CONFIG_ORGANIZADOR = 'emc/organizador-config.json'

export const CONFIG_ORGANIZADOR_PADRAO: ConfigOrganizador = {
  origem: '\\\\10.30.35.191\\RR-PCSuite',
  destino: 'T:\\Laboratórios\\Alta Tecnologia\\Compatibilidade Eletromagnética\\3 - Planilhas de ensaios\\3.2 - Registros de ensaios\\ML - 2026',
  verificarAoEnviar: false,
  limiteDesvio: 1.0,
}

export interface PastaEnsaio {
  nome: string
  caminho: string
  dat: number        // .DAT direto na pasta
  env: number        // quantos já com _Enviado
}

export interface ProtocoloOrigem extends PastaEnsaio {
  mtime: number
  filhos: PastaEnsaio[]
  /** Pastas do protocolo no destino: null = destino inacessível (não sabe). */
  dest: string[] | null
}

export type TagLog = 'ok' | 'aviso' | 'erro' | 'info'
export interface LinhaLog { msg: string; tag?: TagLog }

export interface ArquivoVerificado {
  arquivo: string
  series: Ponto[][]
}

export interface Finalizado { nome: string; caminho: string; mtime: number }

/** Resultado da sincronização com a agenda. */
export interface ResultadoSincronizacao {
  origemOnline: boolean
  destinoOnline: boolean
  atualizados: { protocolo: string; codigos: string[] }[]
}
