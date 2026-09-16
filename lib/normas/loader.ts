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
  // Portaria que agrupa os ensaios de imunidade da série IEC 61000-4-x. As
  // normas -4-2, -4-3, -4-4, -4-5, -4-6 e -4-11 seguem existindo acima como
  // normas próprias (é lá que moram limites e seções); aqui elas aparecem como
  // ENSAIOS da portaria, que é o recorte usado para dizer quais padrões o
  // laboratório usa em cada um. Os ensaios nascem sem padrões: o vínculo é
  // feito na tela da norma.
  {
    id: 'portaria-inmetro-221', codigo: 'Portaria Inmetro 221',
    titulo: 'Requisitos de avaliação da conformidade — ensaios de imunidade (série IEC 61000-4-x)',
    tipo: 'imunidade', pdfDisponivel: false, equipamentosNecessarios: [],
    ensaios: [
      { id: 'esd-4-2',                     nome: 'ESD',                    codigo: '4-2',  equipamentoIds: [] },
      { id: 'imunidade-radiada-4-3',       nome: 'Imunidade Radiada',      codigo: '4-3',  equipamentoIds: [] },
      { id: 'burst-4-4',                   nome: 'Burst',                  codigo: '4-4',  equipamentoIds: [] },
      { id: 'surge-4-5',                   nome: 'Surge',                  codigo: '4-5',  equipamentoIds: [] },
      { id: 'imunidade-conduzida-4-6',     nome: 'Imunidade Conduzida',    codigo: '4-6',  equipamentoIds: [] },
      { id: 'dips-4-11',                   nome: 'Dips',                   codigo: '4-11', equipamentoIds: [] },
      { id: 'correntes-diferenciais-4-19', nome: 'Correntes Diferenciais', codigo: '4-19', equipamentoIds: [] },
    ],
  },
]

export async function carregarNormas(): Promise<Norma[]> {
  return lerJSON<Norma[]>('normas/index.json', NORMAS_DEFAULT)
}

export async function carregarNorma(id: string): Promise<Norma | null> {
  const todas = await carregarNormas()
  const base = todas.find(n => n.id === id) ?? null
  if (!base) return null
  const detalhes = await lerJSON<Partial<Norma>>(`normas/${id}.json`, {})
  return { ...base, ...detalhes }
}
