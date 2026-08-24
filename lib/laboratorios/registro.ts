import { lerJSON, escreverJSON } from '@/lib/dados'

// Modelo de extração do lab: qual RÓTULO esse laboratório usa para cada campo
// (ex.: Chrompack → nome em "Marca"). O OCR usa isso primeiro p/ esse lab.
export interface CamposModeloLab {
  nome?: string
  fabricante?: string
  modelo?: string
  serie?: string
  tag?: string
  dataCalibracao?: string
  numero?: string
}

export interface LaboratorioCal {
  cal: string        // nº de acreditação Cgcre (ex.: "CAL 0024")
  nome: string       // nome do laboratório
  modelo?: string    // observação do modelo de PDF (layout) — para o OCR
  campos?: CamposModeloLab   // rótulos por campo (modelo de extração do lab)
}

export const ARQ_LABS = 'laboratorios.json'

export const LABS_DEFAULT: LaboratorioCal[] = [
  { cal: 'CAL 0024', nome: 'LABELO/PUCRS', modelo: 'Nº R/F/T…XXXX/AAAA · tabela por coordenadas (OCR pronto)' },
]

const normCal = (c?: string) => c ? `CAL ${(c.match(/\d{3,4}/) || [''])[0]}` : ''

export async function lerLaboratorios(): Promise<LaboratorioCal[]> {
  return lerJSON<LaboratorioCal[]>(ARQ_LABS, LABS_DEFAULT)
}
export async function salvarLaboratorios(labs: LaboratorioCal[]): Promise<void> {
  await escreverJSON(ARQ_LABS, labs)
}
export function nomeDoLab(labs: LaboratorioCal[], cal?: string): string | undefined {
  const k = normCal(cal)
  return k ? labs.find(l => normCal(l.cal) === k)?.nome : undefined
}
/** Garante que o CAL exista no registro (auto-descoberta). Retorna se mudou. */
export function registrarLab(labs: LaboratorioCal[], cal?: string, nomeGuess?: string): boolean {
  const k = normCal(cal)
  if (!k) return false
  if (labs.some(l => normCal(l.cal) === k)) return false
  labs.push({ cal: k, nome: nomeGuess || '', modelo: undefined })
  return true
}
