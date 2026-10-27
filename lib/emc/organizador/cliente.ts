import type {
  ConfigOrganizador, ProtocoloOrigem, LinhaLog, ArquivoVerificado, Finalizado, ResultadoSincronizacao,
} from '@/lib/emc/organizador/tipos'

// Chamadas da aba "Radian" da agenda EMC a /api/emc/organizador.

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `Erro ${res.status}`)
  return body as T
}
const post = async <T>(corpo: object): Promise<T> => json(await fetch('/api/emc/organizador', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
}))

export interface Estrutura {
  config: ConfigOrganizador
  origemOnline: boolean
  destinoOnline: boolean
  estrutura: ProtocoloOrigem[]
}
export interface ComLog { resumo: string; log: LinhaLog[] }

export async function lerEstruturaOrganizador(): Promise<Estrutura> {
  return json(await fetch('/api/emc/organizador?acao=estrutura', { cache: 'no-store' }))
}
export async function listarFinalizadosOrganizador(): Promise<{ itens: Finalizado[]; origemOnline: boolean }> {
  return json(await fetch('/api/emc/organizador?acao=finalizados', { cache: 'no-store' }))
}
export const salvarConfigOrganizador = (config: Partial<ConfigOrganizador>) => post<ConfigOrganizador>({ acao: 'config', config })
export const organizarOrigem = (simular: boolean) => post<ComLog>({ acao: 'organizar', simular })
export const enviarEnsaios = (unidades: string[]) =>
  post<ComLog & { sincronizacao: ResultadoSincronizacao | null }>({ acao: 'enviar', unidades })
export const verificarPastas = (pastas: string[]) => post<{ arquivos: ArquivoVerificado[]; log: LinhaLog[] }>({ acao: 'verificar', pastas })
export const excluirPontosDat = (arquivos: { arquivo: string; pontos: { bloco: number; hash: string }[] }[]) =>
  post<{ novos: { arquivo: string; novo: string | null }[]; log: LinhaLog[] }>({ acao: 'excluir', arquivos })
export const finalizarProtocolos = (pastas: string[]) => post<ComLog>({ acao: 'finalizar', pastas })
export const reabrirProtocolos = (pastas: string[]) => post<ComLog>({ acao: 'reabrir', pastas })
export const sincronizarRadian = (forcar = false) => post<ResultadoSincronizacao>({ acao: 'sincronizar', forcar })

/** Abre a pasta no Explorer (só no app Electron). */
export function abrirNoExplorer(caminho: string) {
  const api = (window as unknown as { electronAPI?: { openPath?: (p: string) => Promise<unknown> } }).electronAPI
  if (api?.openPath) api.openPath(caminho)
  else alert('Abrir pasta só funciona dentro do app.\n\n' + caminho)
}
