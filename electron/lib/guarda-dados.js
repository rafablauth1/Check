/* Guarda contra gravações que encolhem uma coleção.
 *
 * Motivo real: em 09/09/2026 a lista de relatórios foi de 48 para 32 numa única
 * gravação. Ninguém apagou 17 relatórios — uma tela montou a lista a partir do
 * localStorage deste PC, que estava truncado porque a cota (~5 MB) tinha
 * estourado com fotos em base64, e gravou essa cópia velha por cima do arquivo
 * compartilhado na rede.
 *
 * A assimetria que justifica a guarda: recusar uma gravação legítima custa um
 * clique repetido; aceitar uma gravação envenenada custa trabalho de semanas.
 * Por isso a decisão é conservadora — na dúvida, não grava.
 *
 * Fica em módulo próprio (e não solto no main.js) para poder ser testado sem
 * subir o Electron inteiro.
 */

/** Quanto uma lista pode encolher numa gravação. Excluir um item tira um. */
const QUEDA_MAXIMA_PADRAO = 1

/**
 * Decide se uma gravação deve ser recusada por encolher demais.
 *
 * @param {number} emDisco   quantos itens existem hoje no arquivo
 * @param {number} recebidos quantos itens a gravação traz
 * @param {string} estado    'ok' | 'ausente' | 'corrompido' — como o arquivo foi lido
 * @param {number} [quedaMaxima]
 * @returns {boolean}
 */
function encolheDemais(emDisco, recebidos, estado, quedaMaxima = QUEDA_MAXIMA_PADRAO) {
  // Arquivo corrompido ou ausente não serve de referência: não dá para dizer
  // que a lista nova está errada comparando com algo que não foi lido direito.
  if (estado !== 'ok') return false
  if (!emDisco) return false
  return recebidos < emDisco - quedaMaxima
}

/** Mensagem mostrada ao usuário quando a gravação é recusada. */
function mensagemRecusa(emDisco, recebidos, oQue = 'relatórios') {
  const perdidos = emDisco - recebidos
  return `Gravação recusada: a lista enviada tem ${recebidos} ${oQue}, mas há ` +
         `${emDisco} salvos — ${perdidos} sumiriam de uma vez. Isso indica lista ` +
         `desatualizada, não exclusão. Nada foi alterado; reabra o app para ` +
         `recarregar a lista da rede.`
}

/* ─── gerações de backup ─────────────────────────────────────────────────────
 *
 * Cada arquivo de dados mantém <arquivo>.bak (anterior), .bak2 e .bak3 (mais
 * antigas). Uma geração só não basta: em 09/09/2026 o .bak salvou a lista de
 * relatórios, mas por pouco — mais uma gravação e ele teria sido substituído
 * pela versão ruim, deixando só o backup semanal. Três gerações dão margem
 * para perceber o estrago antes de a última cópia boa ser consumida.
 */
const fs = require('fs')

const GERACOES_BACKUP = 3

/** Caminhos de leitura de um arquivo, do mais novo para o mais antigo. */
function caminhosComBackups(fp) {
  const out = [fp, fp + '.bak']
  for (let i = 2; i <= GERACOES_BACKUP; i++) out.push(`${fp}.bak${i}`)
  return out
}

/**
 * Empurra as gerações para trás antes de o arquivo ser sobrescrito:
 * .bak2 → .bak3, .bak → .bak2, arquivo → .bak.
 *
 * Da mais ANTIGA para a mais nova — na ordem inversa, cada cópia sobrescreveria
 * a geração seguinte antes de ela ter sido preservada, e sobraria uma só.
 * Falhas são engolidas de propósito: não ter conseguido girar um backup nunca
 * pode impedir a gravação do dado novo.
 */
async function rotacionarBackups(fp) {
  for (let i = GERACOES_BACKUP; i >= 2; i--) {
    const de = i === 2 ? `${fp}.bak` : `${fp}.bak${i - 1}`
    try { await fs.promises.copyFile(de, `${fp}.bak${i}`) } catch {}
  }
  try { await fs.promises.copyFile(fp, fp + '.bak') } catch {}
}

module.exports = {
  QUEDA_MAXIMA_PADRAO, encolheDemais, mensagemRecusa,
  GERACOES_BACKUP, caminhosComBackups, rotacionarBackups,
}
