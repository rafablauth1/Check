/* Caminhos de rede do laboratório — FONTE ÚNICA.
 *
 * Estes caminhos viviam duplicados em electron/main.js e lib/settings-server.ts,
 * com um comentário dizendo "mantida em sincronia com" o outro arquivo — que é
 * a forma educada de dizer que uma hora eles iam divergir. Um `R:` mudado num
 * lado e não no outro faz o processo principal e o servidor Next gravarem em
 * pastas diferentes, e os dados "somem" dependendo de qual tela salvou.
 *
 * CommonJS de propósito: precisa ser consumível pelo processo principal do
 * Electron (require) e pelo lado servidor do Next (import).
 */

/** Pasta única de dados: cadastros, agenda, relatórios, clientes. */
const CADASTROS_FOLDER_PADRAO = 'R:\\Compartilhado\\CISPR15'
const DATA_FOLDER_PADRAO      = 'R:\\Compartilhado\\CISPR15'
const AGENDA_FOLDER_PADRAO    = 'R:\\Compartilhado\\CISPR15\\agenda'

/** Raiz das pastas do EMC na rede (uma subpasta por ano, com as pastas de protocolo). */
const REGISTROS_ENSAIOS_BASE =
  'T:\\Laboratórios\\Alta Tecnologia\\Compatibilidade Eletromagnética\\3 - Planilhas de ensaios\\3.2 - Registros de ensaios'

/** Espelho: cópia automática de todo dado salvo, para os PCs que só enxergam
 *  a pasta de Alta Tecnologia. */
const MIRROR_FOLDER_PADRAO = REGISTROS_ENSAIOS_BASE + '\\CISPR15'

/** Instalador + version.json publicados pelo scripts/publish-update.js. */
const UPDATE_FOLDER_PADRAO = MIRROR_FOLDER_PADRAO + '\\instalador'

/** Backup dos dados. Na rede de propósito: backup que só existe no disco do
 *  próprio PC não protege contra a perda desse disco. */
const BACKUP_FOLDER_PADRAO = MIRROR_FOLDER_PADRAO + '\\backups'

/** Pastas da Iluminação, por tipo de amostra — origem das fotos por protocolo. */
const ILUMINACAO_LAMPADA_BASE   = 'T:\\Laboratórios\\Iluminação\\2 - Lâmpadas\\!Protocolos'
const ILUMINACAO_LUMINARIA_BASE = 'T:\\Laboratórios\\Iluminação\\5 - Luminárias\\!Protocolos'

/** Destino fixo das cópias dos relatórios (uma subpasta por ano). */
const RELATORIOS_COPIA_FOLDER = 'T:\\Relatórios\\Compatibilidade eletromagnética'

module.exports = {
  CADASTROS_FOLDER_PADRAO,
  DATA_FOLDER_PADRAO,
  AGENDA_FOLDER_PADRAO,
  REGISTROS_ENSAIOS_BASE,
  MIRROR_FOLDER_PADRAO,
  UPDATE_FOLDER_PADRAO,
  BACKUP_FOLDER_PADRAO,
  ILUMINACAO_LAMPADA_BASE,
  ILUMINACAO_LUMINARIA_BASE,
  RELATORIOS_COPIA_FOLDER,
}
