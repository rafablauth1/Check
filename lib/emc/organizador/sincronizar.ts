import fs from 'fs'
import path from 'path'
import { lerAgendaEmc, atualizarVariosEmc } from '@/lib/emc/agenda-server'
import { PASTA_FINALIZADOS, codigoDoEnsaio, lerProtocolo, mesmoProtocolo, type Protocolo } from '@/lib/emc/organizador/dat'
import { lerConfigOrganizador, pastaAcessivel, IndiceDestino, datsDoProtocolo } from '@/lib/emc/organizador/server'
import type { ResultadoSincronizacao } from '@/lib/emc/organizador/tipos'
import type { AgendaItemEmc } from '@/lib/emc/tipos'

/* Agenda EMC ← dados do Radian. Para cada amostra da agenda ainda sem
   relatório, procura .DAT do protocolo:
   - no PC do Radian (Origem): <Origem>\<protocolo>\<norma>\ e _Finalizados;
   - no registro da rede (Destino): <pasta do protocolo>\Radian\<norma>\.
   Ensaio com .DAT e ainda pendente vira "realizado" (fonte: radian, com a data
   do .DAT mais novo). Não mexe em ensaio marcado à mão (manual), em reprovado
   nem em amostra com relatório emitido.
   O PC do Radian pode estar desligado: sem ele, vale só o que já foi enviado. */

const INTERVALO_MIN = 60_000          // a tela chama ao abrir e de tempos em tempos
let ultima: { quando: number; r: ResultadoSincronizacao } | null = null
let emAndamento: Promise<ResultadoSincronizacao> | null = null

async function listarPastas(p: string): Promise<{ nome: string; caminho: string }[]> {
  try {
    return (await fs.promises.readdir(p, { withFileTypes: true }))
      .filter(e => e.isDirectory()).map(e => ({ nome: e.name, caminho: path.join(p, e.name) }))
  } catch { return [] }
}

const dia = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Precisa de sincronização? (amostra sem relatório, com ensaio pendente que não foi mexido à mão) */
function candidato(item: AgendaItemEmc): Protocolo | null {
  if (item.numRelatorio) return null
  if (!item.ensaios.some(e => e.status === 'pendente' && !e.manual)) return null
  return lerProtocolo(item.protocolo || '')
}

async function executar(): Promise<ResultadoSincronizacao> {
  const cfg = await lerConfigOrganizador()
  const [origemOnline, destinoOnline] = await Promise.all([pastaAcessivel(cfg.origem), pastaAcessivel(cfg.destino)])
  const r: ResultadoSincronizacao = { origemOnline, destinoOnline, atualizados: [] }

  const { itens } = await lerAgendaEmc()
  const alvos = itens.map(candidato).filter((p): p is Protocolo => !!p)
  if (!alvos.length || (!origemOnline && !destinoOnline)) return r
  const interessa = (pr: Protocolo | null) => !!pr && alvos.some(a => mesmoProtocolo(a, pr))

  // pastas de dados de cada protocolo que interessa
  const fontes: { pr: Protocolo; base: string }[] = []
  if (origemOnline) {
    for (const raiz of [cfg.origem, path.join(cfg.origem, PASTA_FINALIZADOS)]) {
      for (const d of await listarPastas(raiz)) {
        const pr = lerProtocolo(d.nome)
        if (interessa(pr)) fontes.push({ pr: pr!, base: d.caminho })
      }
    }
  }
  if (destinoOnline) {
    for (const p of await (await IndiceDestino.criar(cfg.destino)).todas()) {
      if (!interessa(p.pr)) continue
      for (const sub of await listarPastas(p.caminho)) {
        if (/^radian/i.test(sub.nome)) fontes.push({ pr: p.pr, base: sub.caminho })   // "Radian" (e o "Radiann" que existe)
      }
    }
  }

  // código do ensaio → data do .DAT mais novo, por fonte
  const achados = await Promise.all(fontes.map(async f => {
    const porCodigo = new Map<string, number>()
    for (const d of await datsDoProtocolo(f.base)) {
      if (!d.tamanho) continue
      const cod = codigoDoEnsaio(d.pastaNorma, d.arquivo)
      if (cod) porCodigo.set(cod.toUpperCase(), Math.max(porCodigo.get(cod.toUpperCase()) ?? 0, d.mtime))
    }
    return { pr: f.pr, porCodigo }
  }))

  const alterados = await atualizarVariosEmc(item => {
    const pr = candidato(item)
    if (!pr) return null
    const codigos = new Map<string, number>()
    for (const a of achados) {
      if (!mesmoProtocolo(pr, a.pr)) continue
      a.porCodigo.forEach((t, c) => codigos.set(c, Math.max(codigos.get(c) ?? 0, t)))
    }
    let mudou = false
    const ensaios = item.ensaios.map(e => {
      const t = codigos.get(e.codigo.toUpperCase())
      if (!t || e.status !== 'pendente' || e.manual) return e
      mudou = true
      return { ...e, status: 'realizado' as const, fonte: 'radian' as const, realizadoEm: dia(t) }
    })
    return mudou ? { ...item, ensaios } : null
  })
  r.atualizados = alterados.map(x => ({
    protocolo: x.protocolo,
    codigos: x.ensaios.filter(e => e.fonte === 'radian' && e.status === 'realizado').map(e => e.codigo),
  }))
  return r
}

/** Sincroniza (no máximo uma por minuto, e uma de cada vez; `forcar` ignora o intervalo). */
export async function sincronizarAgenda(forcar = false): Promise<ResultadoSincronizacao> {
  if (emAndamento) return emAndamento
  if (!forcar && ultima && Date.now() - ultima.quando < INTERVALO_MIN) return { ...ultima.r, atualizados: [] }
  emAndamento = executar()
    .then(r => { ultima = { quando: Date.now(), r }; return r })
    .finally(() => { emAndamento = null })
  return emAndamento
}
