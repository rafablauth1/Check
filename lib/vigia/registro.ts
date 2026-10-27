// VIGIA-7S no app — Registro (FOR EMC38): porte de vigia7s/registro.py (em andamento).
import { num, pyRoundN } from '@/lib/vigia/util'
import type { LeituraReg, TotReg } from '@/lib/vigia/ensaio'

/** Preço unitário cadastrado uma vez em Dados da amostra (vale para todos os pontos e ensaios). */
export function precoReg(reg: { dados: Record<string, unknown> }): number | null {
  return num(reg.dados.preco, null)
}

/** Total a pagar = litros × preço, em centavos (como o mostrador). */
export function totalCalc(volume: number | null | undefined, preco: number | null | undefined): number | null {
  if (volume === null || volume === undefined || preco === null || preco === undefined) return null
  return pyRoundN(volume * preco + 1e-9, 2)
}

/** Leituras (leituras_reg) e totalizadores de um estado_ensaio.json salvo, prontos para importar.
 *  totais = {valor de 'ensaio' das leituras: tot_registros} — inclui os de leituras trazidas de outros ensaios. */
export function leiturasETotais(est: Record<string, unknown>, pasta: string): [LeituraReg[], Record<string, TotReg[]>] {
  const leituras = ((est.leituras_reg as LeituraReg[] | undefined) ?? []).map(l => ({ ...l }))
  const m = pasta.split(/[\/]/).pop()!.match(/ensaio_(\d{4})(\d{2})(\d{2})_/)
  const data_pasta = m ? `${m[3]}/${m[2]}/${m[1]}` : ''
  for (const l of leituras) {  // ensaios antigos: a pasta e a data não estavam gravadas em cada leitura
    if (l.ensaio === undefined) l.ensaio = pasta
    if (data_pasta && l.data === undefined) l.data = data_pasta
  }
  const totais: Record<string, TotReg[]> = { ...((est.tot_importados as Record<string, TotReg[]>) ?? {}) }
  for (const l of leituras) {
    if (!l.importada && !(String(l.ensaio) in totais)) totais[String(l.ensaio)] = (est.tot_registros as TotReg[]) ?? []
  }
  return [leituras, totais]
}
