// VIGIA-7S no app — Registro (FOR EMC38): partes de vigia7s/registro.py que o ensaio usa.
// O Registro em si (aba, Excel FOR EMC38, relatório) ainda está em teste no VIGIA-7S: fica no VIGIA da área de
// trabalho, que usa os mesmos dados (resultados/registros/). Aqui o registro aberto lá só é lido.
import { num, pyRoundN } from '@/lib/vigia/util'
import type { LeituraReg, TotReg } from '@/lib/vigia/ensaio'

export type Registro = { dados?: Record<string, unknown>; iniciais?: Record<string, { cab?: Record<string, unknown> }> } & Record<string, unknown>

/** num() do registro.py: aceita "1.234,56", "92,11", "4". */
export function numReg(s: unknown, padrao: number | null = null): number | null {
  if (s === null || s === undefined) return padrao
  if (typeof s === 'number') return s
  if (typeof s === 'boolean') return Number(s)
  let t = String(s).trim().replace(/ /g, '')
  if (!t) return padrao
  t = t.includes(',') && t.includes('.') ? t.replace(/\./g, '').replace(/,/g, '.') : t.replace(/,/g, '.')  // 1.234,56
  return num(t, padrao)
}

/** Preço unitário cadastrado uma vez em Dados da amostra (vale para todos os pontos e ensaios). */
export function precoReg(reg: Registro): number | null {
  return numReg(reg.dados?.preco)
}

/** Preset da verificação INICIAL (valor esperado do volume quando o campo não tem um). */
export function presetReg(reg: Registro): number | null {
  return numReg(reg.iniciais?.INICIAL?.cab?.preset, 0) || null
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
