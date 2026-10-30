// Padronização dos NOMES de equipamento (o "tipo": Balão Volumétrico, Multímetro
// Digital…). O nome é texto livre em cada cadastro, e a importação de
// certificados trouxe a mesma coisa escrita de vários jeitos — "Balão
// Volumétrico" e "Balão volumétrico", "MANÔMETRO DIGITAL" e "Manômetro -
// Digital", nomes em inglês. A tela de Grupos agrupa por nome exato, então cada
// grafia virava um tipo separado.
//
// Regra: cada palavra com a primeira letra maiúscula e o resto minúsculo, exceto
// preposições/artigos (de, da, e…) no meio do nome, siglas (RF, EMI, LISN…) e
// unidades (mL, dB, GHz…). Erros de grafia conhecidos são corrigidos, nomes em
// inglês traduzidos. O que o usuário decidir na tela de padronização vira
// APELIDO (grafia → nome padrão) e passa a valer em todo cadastro e importação.
//
// Funções puras — sem I/O — para servirem ao servidor, à tela e aos testes.

export const ARQUIVO_NOMES_EQUIP = 'equipamentos-nomes.json'

/** chave(grafia) → nome padrão. Gravado quando o usuário aplica a padronização. */
export interface DicionarioNomes {
  apelidos: Record<string, string>
  atualizadoEm?: string
}

/** Comparação tolerante: sem acento, sem caixa, pontuação vira espaço. */
export function chaveNome(s: string): string {
  return limparTexto(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9µω]+/g, ' ').trim()
}

function chavePalavra(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Conserta acentos soltos de PDF ("CALIBRAC ̧AO" → "CALIBRAÇAO") e espaços. */
export function limparTexto(s: string): string {
  return (s || '')
    .replace(/\s[̀-ͯ]+(?=\s|$)/g, '')   // acento órfão no fim de palavra: lixo
    .replace(/\s([̀-ͯ])/g, '$1')         // acento separado da letra: cola
    .normalize('NFC')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const MINUSCULAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'com', 'para',
  'por', 'sem', 'sob', 'a', 'o', 'as', 'os', 'à', 'às', 'ao', 'aos', 'ou',
])

const SIGLAS: Record<string, string> = Object.fromEntries([
  'RF', 'EMI', 'EMC', 'ESD', 'LISN', 'CDN', 'DC', 'AC', 'CA', 'CC', 'UV', 'RLC', 'DTV', 'ISDB',
  'TV', 'USB', 'HDMI', 'LCD', 'LED', 'GPS', 'PUC', 'RS', 'IR', 'PCB', 'GTEM', 'TEM', 'LABELO',
].map(s => [s.toLowerCase(), s]).concat([['ph', 'pH']]))

const UNIDADES: Record<string, string> = {
  ml: 'mL', l: 'L', ul: 'µL', 'µl': 'µL', 'μl': 'µL', db: 'dB', dbm: 'dBm', dbuv: 'dBµV',
  hz: 'Hz', khz: 'kHz', mhz: 'MHz', ghz: 'GHz', w: 'W', kw: 'kW', mw: 'mW', v: 'V', kv: 'kV',
  mv: 'mV', a: 'A', ma: 'mA', ka: 'kA', 'ω': 'Ω', ohm: 'Ω', ohms: 'Ω', uh: 'µH', 'µh': 'µH',
  'μh': 'µH', watt: 'W', watts: 'W', mm: 'mm', cm: 'cm', m: 'm', kg: 'kg', g: 'g', mg: 'mg', n: 'N', nm: 'N·m',
  pa: 'Pa', kpa: 'kPa', mpa: 'MPa', bar: 'bar', mbar: 'mbar', s: 's', ms: 'ms', '°c': '°C',
}

// Grafias erradas/sem acento → forma correta (em minúsculas; a caixa vem depois).
const CORRECOES: Record<string, string> = {
  'analisador': 'analisador', 'letronica': 'eletrônica', 'eletronica': 'eletrônica',
  'eletronico': 'eletrônico', 'analogico': 'analógico', 'analogica': 'analógica',
  'watimetro': 'wattímetro', 'wattimetro': 'wattímetro', 'miliomimetro': 'miliohmímetro',
  'densimetro': 'densímetro', 'extensometro': 'extensômetro', 'manovacuometro': 'manovacuômetro',
  'vacuometro': 'vacuômetro', 'regua': 'régua', 'maquina': 'máquina', 'frequencimetro': 'frequencímetro',
  'freqüencimetro': 'frequencímetro', 'termohigrometro': 'termo-higrômetro',
  'termoigrometro': 'termo-higrômetro', 'termo-higrometro': 'termo-higrômetro',
  'tri-fasico': 'trifásico', 'trifasico': 'trifásico', 'monofasico': 'monofásico',
  'microondas': 'micro-ondas', 'calibracao': 'calibração', 'calibraçao': 'calibração',
  'petroleo': 'petróleo', 'liquidos': 'líquidos', 'especifica': 'específica',
  'termometro': 'termômetro', 'manometro': 'manômetro', 'barometro': 'barômetro',
  'micrometro': 'micrômetro', 'paquimetro': 'paquímetro', 'cronometro': 'cronômetro',
  'tacometro': 'tacômetro', 'luximetro': 'luxímetro', 'multimetro': 'multímetro',
  'amperimetro': 'amperímetro', 'voltimetro': 'voltímetro', 'dinamometro': 'dinamômetro',
  'torquimetro': 'torquímetro', 'condutivimetro': 'condutivímetro', 'picnometro': 'picnômetro',
  'osciloscopio': 'osciloscópio', 'microscopio': 'microscópio', 'pirometro': 'pirômetro',
  'megohmetro': 'megôhmetro', 'microhmimetro': 'microhmímetro', 'higrometro': 'higrômetro',
  'anemometro': 'anemômetro', 'fluxometro': 'fluxômetro', 'durometro': 'durômetro',
  'polarimetro': 'polarímetro', 'calorimetro': 'calorímetro', 'acelerometro': 'acelerômetro',
  'medicao': 'medição', 'pressao': 'pressão', 'tensao': 'tensão', 'potencia': 'potência',
  'frequencia': 'frequência', 'balao': 'balão', 'volumetrico': 'volumétrico',
  'eletrica': 'elétrica', 'eletrico': 'elétrico', 'camara': 'câmara', 'padrao': 'padrão',
  'balanca': 'balança', 'receiver': 'receptor', 'eletro-mecanica': 'eletromecânica',
  'eletromecanica': 'eletromecânica', 'eletro-mecanico': 'eletromecânico', 'analise': 'análise', 'termica': 'térmica', 'termico': 'térmico',
}

// Nomes inteiros (pela chave) — inglês, marcas no lugar do tipo, frases do PDF.
const TRADUCOES: Record<string, string> = {
  'coupling decoupling network': 'Acoplador e Desacoplador de Rede',
  'power line decoupling network': 'Acoplador e Desacoplador de Rede',
  'emi test receiver': 'Receptor EMI',
  'electrical safety compliance analyzer': 'Analisador de Segurança Elétrica',
  'power analyzer': 'Analisador de Potência',
  'power divider': 'Divisor de Potência',
  'differential probe': 'Ponteira Diferencial',
  'avg power sensor': 'Sensor de Potência Média',
  'digital broadcast signal analyzer': 'Analisador de Sinais de TV Digital',
  'dtv signal generator isdb': 'Gerador de Sinais de TV Digital (ISDB)',
  'interference signal generator': 'Gerador de Sinais de Interferência',
  'radio communication analyzer': 'Analisador de Radiocomunicação',
  'wideband radio communication tester': 'Testador de Radiocomunicação Banda Larga',
  'cmw500 wideb radio comm tester': 'Testador de Radiocomunicação Banda Larga',
  'precision temperature scanner': 'Scanner de Temperatura',
  'scanning thermometer': 'Scanner de Temperatura',
  'xytronic single phase reference standard': 'Padrão de Referência Monofásico',
  'airmeter': 'Medidor de Qualidade do Ar',
  'degreec': 'Sensor de Velocidade do Ar',
  'accusense': 'Sensor de Velocidade do Ar',
  'hipot': 'Testador de Rigidez Dielétrica (Hipot)',
  'plataforma de teste comunicacao wirelles 2g 3g': 'Plataforma de Teste de Comunicação sem Fio',
  'plataforma de testes comunicacao wireless': 'Plataforma de Teste de Comunicação sem Fio',
  'camera climatica 1000l': 'Câmara Climática 1000 L',
  'gabarito de calibracao de microsc': 'Gabarito de Calibração de Microscópio',
  'milli q advantage': 'Sistema de Purificação de Água',
  'densimetro massa especifica': 'Densímetro de Massa Específica',
  'densimetro para petroleo e seus derivados liquidos': 'Densímetro para Petróleo e Derivados',
  'analisador de potencia tri fasico': 'Analisador de Potência Trifásico',
}

// Textos do certificado que caíram no campo nome — não dá para adivinhar o tipo.
const NAO_EH_NOME = new Set([
  '', 'certificado', 'certificado ou valor relativo', 'caracteristica', 'caracteristica mm',
  'valor', 'incerteza de medicao', 'dos padroes', 'do', 'description', 'instrument',
  'medicao de 0 2 n', 'datum y',
])

/** O nome é lixo de importação (vazio, rótulo do certificado, nome do laboratório)? */
export function precisaRevisar(nome: string): boolean {
  const k = chaveNome(nome)
  if (NAO_EH_NOME.has(k)) return true
  return /\b(labelo|pontificia|laboratorio|laboratorios|universidade)\b/.test(k)
}

// "do Instrumento de medição: Torquímetro digital" → "Torquímetro digital"
const PREFIXOS = /^(da peça|do equipamento qualificado|do equipamento|equipamento|do instrumento de medição|do instrumento|de medição de força de uso em geral -)\s*:?\s*/i

function tirarPrefixo(s: string): string {
  const m = s.match(PREFIXOS)
  if (!m) return s
  return s.slice(m[0].length)
    .replace(/\s+\d+\.\d+$/, '')                 // " 4.1" do item do relatório
    .replace(/\s+número do catálogo:.*$/i, '')
    .replace(/\s+-\s+.*$/, '')                   // " - PA18G-HÁ" (modelo)
    .replace(/\s*\(.*\)$/, '')                   // "(Pulsator tester PT-VI)"
    .trim()
}

function caixaPalavra(p: string, primeira: boolean): string {
  if (!p) return p
  const k = chavePalavra(p)
  if (SIGLAS[k]) return SIGLAS[k]
  if (!primeira && MINUSCULAS.has(p.toLowerCase())) return p.toLowerCase()
  if (/^[a-z]$/i.test(p)) return p.toUpperCase()          // "Tipo N", "Datum-Y"
  const baixa = p.toLowerCase()
  return baixa.charAt(0).toUpperCase() + baixa.slice(1)
}

const RE_NUM_UNID = /^([\d.,]+(?:-[\d.,]+)?)([a-zµμω°]+)$/i

function formatarToken(tok: string, primeira: boolean): string {
  // pontuação colada: "(9kHz" → "(" + "9kHz"
  const m = tok.match(/^([(\[“"]*)(.*?)([)\],;:”"]*)$/)
  const [, ini, meio, fim] = m ?? ['', '', tok, '']
  if (!meio) return tok
  let corpo = meio
  const nu = corpo.match(RE_NUM_UNID)
  if (nu && UNIDADES[nu[2].toLowerCase()]) return `${ini}${nu[1]} ${UNIDADES[nu[2].toLowerCase()]}${fim}`
  if (/\d/.test(corpo)) return `${ini}${corpo.toUpperCase()}${fim}`   // CMW500, 2G/3G, RJ45
  const corr = CORRECOES[chavePalavra(corpo)] ?? CORRECOES[corpo.toLowerCase()]
  if (corr) corpo = corr
  // "Termo-Higrômetro", "Controlador/Indicador"
  const partes = corpo.split(/([-/])/)
  const out = partes.map((p, i) => (p === '-' || p === '/') ? p : caixaPalavra(p, primeira && i === 0)).join('')
  return `${ini}${out}${fim}`
}

/** Aplica a regra de escrita a um nome (sem consultar apelidos). */
export function formatarNome(bruto: string): string {
  let s = tirarPrefixo(limparTexto(bruto))
  const trad = TRADUCOES[chaveNome(s)]
  if (trad) return trad
  // "Manômetro - Digital" → "Manômetro Digital"; entre valores é faixa: "9kHz - 200MHz" → "9 kHz a 200 MHz"
  s = s.replace(/(\S+)\s+-\s+/g, (_, a: string) => /\d/.test(a) ? `${a} a ` : `${a} `)
  const toks = s.split(' ').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    const ant = out[out.length - 1]
    // unidade solta depois de número: "10 dB", "50 ml"
    if (ant && /\d$/.test(ant) && UNIDADES[t.toLowerCase()]) { out.push(UNIDADES[t.toLowerCase()]); continue }
    out.push(formatarToken(t, i === 0))
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/** Nome padrão: apelido gravado pelo usuário, senão a regra de escrita. */
export function padronizarNome(bruto: string, dic?: DicionarioNomes | null): string {
  if (!bruto || !bruto.trim()) return ''
  const ap = dic?.apelidos ?? {}
  const direto = ap[chaveNome(bruto)]
  if (direto) return direto
  const f = formatarNome(bruto)
  return ap[chaveNome(f)] ?? f
}

/* ── plano de padronização (tela) ─────────────────────────────────────────── */

export interface Variante { nome: string; qtd: number }

export interface Proposta {
  para: string
  de: Variante[]
  qtd: number
  muda: boolean                // alguma grafia muda
  motivo: ('grafia' | 'traducao' | 'apelido' | 'prefixo')[]
  parecidos: string[]          // outros nomes padrão com a mesma "raiz"
}

// Palavras que distinguem pouco: "Proveta" ≈ "Proveta Graduada", "Termômetro" ≈ "Termômetro Digital".
// Números e unidades contam — "Atenuador 10 dB" e "Atenuador 20 dB" são coisas diferentes.
const QUALIFICADORES = new Set([
  'digital', 'analogico', 'analogica', 'graduada', 'graduado', 'eletronica', 'eletronico',
  'de', 'vidro', 'bancada', 'portatil', 'automatica', 'automatico',
])

function raiz(nome: string): string {
  return chaveNome(nome).split(' ')
    .filter(w => w && !QUALIFICADORES.has(w))
    .join(' ')
}

/**
 * Junta as grafias de `nomes` pelo nome padrão. Variantes que caem na mesma
 * chave ficam com a grafia padrão mais usada — assim "Manômetro - Digital" e
 * "MANÔMETRO DIGITAL" convergem mesmo que a regra produza textos diferentes.
 */
export function planejarPadronizacao(nomes: Variante[], dic?: DicionarioNomes | null): Proposta[] {
  const porChave = new Map<string, { variantes: Variante[]; votos: Map<string, number>; motivos: Set<Proposta['motivo'][number]> }>()
  const ap = dic?.apelidos ?? {}
  for (const v of nomes) {
    if (precisaRevisar(v.nome)) continue
    const p = padronizarNome(v.nome, dic)
    if (!p) continue
    const k = chaveNome(p)
    let g = porChave.get(k)
    if (!g) { g = { variantes: [], votos: new Map(), motivos: new Set() }; porChave.set(k, g) }
    g.variantes.push(v)
    g.votos.set(p, (g.votos.get(p) ?? 0) + v.qtd)
    if (ap[chaveNome(v.nome)]) g.motivos.add('apelido')
    else if (TRADUCOES[chaveNome(tirarPrefixo(limparTexto(v.nome)))]) g.motivos.add('traducao')
    else if (PREFIXOS.test(limparTexto(v.nome))) g.motivos.add('prefixo')
    else if (v.nome !== p) g.motivos.add('grafia')
  }
  const props: Proposta[] = []
  for (const g of porChave.values()) {
    const para = [...g.votos].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    const de = g.variantes.sort((a, b) => b.qtd - a.qtd)
    props.push({
      para, de, qtd: de.reduce((n, v) => n + v.qtd, 0),
      muda: de.some(v => v.nome !== para), motivo: [...g.motivos], parecidos: [],
    })
  }
  const porRaiz = new Map<string, string[]>()
  for (const p of props) {
    const r = raiz(p.para); if (!r) continue
    porRaiz.set(r, [...(porRaiz.get(r) ?? []), p.para])
  }
  for (const p of props) {
    p.parecidos = (porRaiz.get(raiz(p.para)) ?? []).filter(x => x !== p.para)
  }
  return props.sort((a, b) => a.para.localeCompare(b.para, 'pt'))
}
