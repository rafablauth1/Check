import type { Norma } from '@/lib/normas/tipos'
import { lerJSON } from '@/lib/dados'

const NORMAS_DEFAULT: Norma[] = [
  { id: 'cispr15',     codigo: 'CISPR 15',        titulo: 'Limits and methods of measurement of radio disturbance characteristics of electrical lighting and similar equipment', tipo: 'emissao', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'medidores', descricao: 'Receptor EMI / Analisador de Espectro' }, { grupoId: 'redes-impedancia', descricao: 'LISN 50µH' }, { grupoId: 'antenas', descricao: 'Antena de loop' }] },
  { id: 'cispr11',     codigo: 'CISPR 11',        titulo: 'Industrial, scientific and medical equipment — Radio-frequency disturbance characteristics', tipo: 'emissao', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'medidores', descricao: 'Receptor EMI' }, { grupoId: 'redes-impedancia', descricao: 'LISN 50µH' }, { grupoId: 'antenas', descricao: 'Antenas para ensaios radiados' }] },
  { id: 'cispr32',     codigo: 'CISPR 32',        titulo: 'Electromagnetic compatibility of multimedia equipment — Emission requirements', tipo: 'emissao', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'medidores', descricao: 'Receptor EMI' }, { grupoId: 'redes-impedancia', descricao: 'LISN 50µH' }, { grupoId: 'antenas', descricao: 'Antenas' }] },
  { id: 'iec61000-4-2',  codigo: 'IEC 61000-4-2',  titulo: 'Testing and measurement techniques — Electrostatic discharge immunity test', tipo: 'imunidade', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'geradores', descricao: 'Gerador ESD' }] },
  { id: 'iec61000-4-3',  codigo: 'IEC 61000-4-3',  titulo: 'Testing and measurement techniques — Radiated, radio-frequency, electromagnetic field immunity test', tipo: 'imunidade', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'geradores', descricao: 'Gerador de sinal RF' }, { grupoId: 'antenas', descricao: 'Antena de transmissão' }] },
  { id: 'iec61000-4-4',  codigo: 'IEC 61000-4-4',  titulo: 'Testing and measurement techniques — Electrical fast transient/burst immunity test', tipo: 'imunidade', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'geradores', descricao: 'Gerador EFT/Burst' }] },
  { id: 'iec61000-4-5',  codigo: 'IEC 61000-4-5',  titulo: 'Testing and measurement techniques — Surge immunity test', tipo: 'imunidade', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'geradores', descricao: 'Gerador de surto' }] },
  { id: 'iec61000-4-6',  codigo: 'IEC 61000-4-6',  titulo: 'Testing and measurement techniques — Immunity to conducted disturbances induced by radio-frequency fields', tipo: 'imunidade', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'geradores', descricao: 'Gerador RF' }, { grupoId: 'redes-impedancia', descricao: 'CDN' }] },
  { id: 'iec61000-4-8',  codigo: 'IEC 61000-4-8',  titulo: 'Testing and measurement techniques — Power frequency magnetic field immunity test', tipo: 'imunidade', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'geradores', descricao: 'Gerador de campo magnético' }] },
  { id: 'iec61000-4-11', codigo: 'IEC 61000-4-11', titulo: 'Testing and measurement techniques — Voltage dips, short interruptions and voltage variations immunity tests', tipo: 'imunidade', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'geradores', descricao: 'Gerador de afundamentos' }, { grupoId: 'medidores', descricao: 'Medidor' }] },
  { id: 'nbr15947',     codigo: 'ABNT NBR 15947',  titulo: 'Equipamentos para iluminação elétrica — Limites e métodos de medição de perturbações de radiofrequência', tipo: 'emissao', pdfDisponivel: false, equipamentosNecessarios: [{ grupoId: 'medidores', descricao: 'Receptor EMI' }, { grupoId: 'redes-impedancia', descricao: 'LISN 50µH' }, { grupoId: 'antenas', descricao: 'Antena de loop' }] },
]

export function carregarNormas(): Norma[] {
  return lerJSON<Norma[]>('normas/index.json', NORMAS_DEFAULT)
}

export function carregarNorma(id: string): Norma | null {
  const todas = carregarNormas()
  const base = todas.find(n => n.id === id) ?? null
  if (!base) return null
  const detalhes = lerJSON<Partial<Norma>>(`normas/${id}.json`, {})
  return { ...base, ...detalhes }
}
