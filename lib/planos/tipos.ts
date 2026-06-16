// Plano de Calibração (modelo FOR 6400): por equipamento, cada linha é uma
// GRANDEZA com seus pontos de calibração e o critério de aprovação (limite).

export interface PontoPlano {
  id: string
  grandeza: string
  unidade: string          // unidade do critério (dB, %, Hz, V…)
  pontosTexto: string      // lista de pontos/faixa, ex.: "(0,1; 0,3; …; 3000) MHz · Nível: 0 dBm"
  // Critério de aprovação (tolerância flexível). Qualquer combinação:
  //   limite ± = |valor|·(tolPercentual/100) + |tolFixo| + |valor|·(tolPpm/1e6)
  tolPercentual?: string   // % da leitura
  tolFixo?: string         // valor fixo absoluto (na unidade)
  tolPpm?: string          // partes por milhão
  criterioTexto?: string   // critério como aparece no documento (ex.: "± 1 dB"), p/ casos fora do padrão
  obs?: string
}

export interface PlanoCalibracao {
  id: string
  equipamentoId: string
  equipamentoTag: string
  nome?: string
  pontos: PontoPlano[]
  obs?: string
  criadoEm: string
}

const num = (s?: string): number => {
  const n = parseFloat(String(s ?? '').replace(',', '.'))
  return isFinite(n) ? n : 0
}

/** Texto do critério: usa o criterioTexto se houver; senão monta de %/fixo/ppm. */
export function tolTexto(p: PontoPlano): string {
  if (p.criterioTexto?.trim()) return p.criterioTexto.trim()
  const partes: string[] = []
  if (num(p.tolPercentual)) partes.push(`${p.tolPercentual}%`)
  if (num(p.tolPpm))        partes.push(`${p.tolPpm} ppm`)
  if (num(p.tolFixo))       partes.push(`${p.tolFixo}${p.unidade ? ' ' + p.unidade : ''}`)
  if (!partes.length) return '—'
  return partes.length === 1 ? `±${partes[0]}` : `±(${partes.join(' + ')})`
}

/** Limite absoluto (±) para um valor medido, combinando %, fixo e ppm. null se não houver. */
export function limiteAbsoluto(p: PontoPlano, valor: number): number | null {
  const v = Math.abs(valor)
  const lim = v * num(p.tolPercentual) / 100 + Math.abs(num(p.tolFixo)) + v * num(p.tolPpm) / 1e6
  return lim > 0 ? lim : null
}
