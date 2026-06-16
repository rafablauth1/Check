import type { ItemChecagem } from '@/lib/checagens/tipos'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

interface GrandezaDetectada {
  grandeza: string
  unidade: string
  pontos: string[]  // valores nominais sugeridos
}

// ── Mapa de grandezas reconhecidas ────────────────────────────────────────────
const GRANDEZAS: { padroes: RegExp[]; grandeza: string; unidade: string; pontos: string[] }[] = [
  {
    padroes: [/tens[aã]o\s*(alternada|ac|ca|rms)/i, /\bVAC\b/, /\bVCA\b/],
    grandeza: 'Tensão alternada (AC)',
    unidade: 'V',
    pontos: ['1', '10', '100', '230'],
  },
  {
    padroes: [/tens[aã]o\s*(cont[ií]nua|dc|cc)/i, /\bVDC\b/, /\bVCC\b/],
    grandeza: 'Tensão contínua (DC)',
    unidade: 'V',
    pontos: ['1', '10', '100'],
  },
  {
    padroes: [/\btens[aã]o\b(?!\s*(alternada|cont))/i],
    grandeza: 'Tensão',
    unidade: 'V',
    pontos: ['1', '10', '100'],
  },
  {
    padroes: [/corrente\s*(alternada|ac|ca|rms)/i, /\bAAC\b/, /\bACA\b/],
    grandeza: 'Corrente alternada (AC)',
    unidade: 'A',
    pontos: ['0.1', '1', '10'],
  },
  {
    padroes: [/corrente\s*(cont[ií]nua|dc|cc)/i, /\bADC\b/, /\bACC\b/],
    grandeza: 'Corrente contínua (DC)',
    unidade: 'A',
    pontos: ['0.1', '1', '10'],
  },
  {
    padroes: [/\bcorrente\b(?!\s*(alternada|cont))/i],
    grandeza: 'Corrente',
    unidade: 'A',
    pontos: ['0.1', '1', '10'],
  },
  {
    padroes: [/\bfrequ[eê]ncia\b/i, /\bHz\b/, /\bKHz\b/i, /\bMHz\b/i],
    grandeza: 'Frequência',
    unidade: 'Hz',
    pontos: ['100', '1000', '10000'],
  },
  {
    padroes: [/\bpot[eê]ncia\s*(RF|r\.f\.)/i, /\bsinal RF\b/i],
    grandeza: 'Potência RF',
    unidade: 'dBm',
    pontos: ['-30', '-10', '0', '+10'],
  },
  {
    padroes: [/\batenu[aã]o\b/i],
    grandeza: 'Atenuação',
    unidade: 'dB',
    pontos: ['0', '10', '20', '30'],
  },
  {
    padroes: [/\bimpedância\b/i, /\bohm/i, /\bΩ\b/],
    grandeza: 'Impedância/Resistência',
    unidade: 'Ω',
    pontos: ['10', '100', '1000'],
  },
  {
    padroes: [/\btemperatura\b/i, /\b°C\b/, /\bgraus?\s*celsius\b/i],
    grandeza: 'Temperatura',
    unidade: '°C',
    pontos: ['0', '25', '50', '100'],
  },
  {
    padroes: [/\bumidade\b/i, /\b%\s*UR\b/i, /\bumidade\s*relativa\b/i],
    grandeza: 'Umidade relativa',
    unidade: '% UR',
    pontos: ['30', '50', '75'],
  },
  {
    padroes: [/\bpress[aã]o\b/i, /\bhPa\b/, /\bmbar\b/i],
    grandeza: 'Pressão atmosférica',
    unidade: 'hPa',
    pontos: ['900', '1000', '1100'],
  },
  {
    padroes: [/\bcapacitância\b/i, /\bfF\b/, /\bpF\b/, /\bnF\b/, /\bµF\b/],
    grandeza: 'Capacitância',
    unidade: 'F',
    pontos: ['1p', '100p', '1n', '100n'],
  },
  {
    padroes: [/\bindutância\b/i, /\bnH\b/, /\bµH\b/, /\bmH\b/],
    grandeza: 'Indutância',
    unidade: 'H',
    pontos: ['100n', '1µ', '100µ'],
  },
  {
    padroes: [/\bfator\s*(de\s*)?pot[eê]ncia\b/i, /\bcos\s*φ\b/i],
    grandeza: 'Fator de potência',
    unidade: 'cos φ',
    pontos: ['0.5', '0.8', '1.0'],
  },
]

/**
 * Analisa texto de uma IT e detecta grandezas, retornando ItemChecagem prontos.
 */
export function parsearGrandezasIT(texto: string): ItemChecagem[] {
  const detectadas: GrandezaDetectada[] = []
  const usadas = new Set<string>()

  for (const def of GRANDEZAS) {
    const match = def.padroes.some(re => re.test(texto))
    if (match && !usadas.has(def.grandeza)) {
      usadas.add(def.grandeza)
      detectadas.push({ grandeza: def.grandeza, unidade: def.unidade, pontos: def.pontos })
    }
  }

  // Gera itens: um por ponto nominal por grandeza detectada
  const itens: ItemChecagem[] = []
  let ponto = 1
  for (const d of detectadas) {
    for (const vn of d.pontos) {
      itens.push({
        id: uid(),
        ponto: ponto++,
        grandeza: d.grandeza,
        unidade: d.unidade,
        valorNominal: vn,
        valorReferencia: '',
        valorMedido: '',
        resultado: 'na',
      })
    }
  }

  return itens
}

/**
 * Extrai a lista de grandezas da seção "3.2 Grandezas medidas" de uma IT CHK.
 * É a fonte limpa/autoritativa (ex.: "Corrente Alternada, Frequência, Resistência
 * Elétrica, Tensão Contínua…"), melhor que adivinhar por padrões no texto todo.
 */
export function parsearGrandezasMedidasIT(texto: string): string[] {
  const idx = texto.search(/grandezas\s+medidas/i)
  if (idx < 0) return []
  let rest = texto.slice(idx).replace(/grandezas\s+medidas\s*[:\-]?/i, '')
  // corta na próxima seção (ex.: "3.3", "Avaliação", "Self-Test", "Descrição do processo")
  const stop = rest.search(/\n\s*\d+\.\d+\s|\bavalia[çc][aã]o\b|\bself[\s-]?test\b|\bdescri[çc][aã]o\s+do\s+processo\b/i)
  if (stop > 0) rest = rest.slice(0, stop)
  return rest
    .split(/[,;\n]+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s && /[a-zA-Zà-ÿÀ-ÿ]{3,}/.test(s) && !/^[\d(]/.test(s))
}

/**
 * Extrai também metadados básicos da IT (TAG, periodicidade, norma).
 */
export function parsearMetadadosIT(texto: string): {
  tag: string; periodicidade: number | null; norma: string
} {
  const norm = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

  const tagM = texto.match(/\b([0-9]{3,4}EMC)\b/i)
  const tag = tagM ? tagM[1].toUpperCase() : ''

  const periM = norm.match(/(\d+)\s*(mes(?:es)?|month)/i)
    ?? norm.match(/periodicidade[^0-9]*(\d+)/i)
  const periodicidade = periM ? parseInt(periM[1]) : null

  const normaM = texto.match(/CISPR\s*\d+|IEC\s*[\d-]+|ISO\s*[\d-]+|ABNT[^.]{0,40}/i)
  const norma = normaM ? normaM[0].trim() : ''

  return { tag, periodicidade, norma }
}
