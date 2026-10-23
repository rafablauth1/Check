import fs from 'fs'
import { getSettingsFilePath } from '@/lib/settings-server'

// Editar os templates de ensaio usa a mesma "Senha de acesso à emissão" das
// Configurações (senhaEmissao, no settings.json que o Electron grava). A tela
// pede a senha, mas a rota confere de novo aqui — sem isso, qualquer fetch
// direto para /api/emc/config trocaria os ensaios do laboratório.
//
// Lê o arquivo a cada chamada (e não o cache de lib/settings-server): quem troca
// a senha é o processo do Electron, e o cache do servidor Next não fica sabendo.

async function senhaConfigurada(): Promise<string> {
  const p = getSettingsFilePath()
  for (const caminho of [p, p + '.bak']) {
    try {
      const s = JSON.parse(await fs.promises.readFile(caminho, 'utf-8'))
      return typeof s.senhaEmissao === 'string' ? s.senhaEmissao : ''
    } catch {}
  }
  return ''
}

/** true se a senha informada confere (ou se não há senha configurada). */
export async function senhaConfere(informada: string | null): Promise<boolean> {
  const senha = await senhaConfigurada()
  return !senha || informada === senha
}
