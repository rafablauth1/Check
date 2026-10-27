// Organizador de ensaios EMC (porte do Organizador.pyw) — parte sem disco:
// nomes de protocolo/norma, leitura e padronização dos .DAT do Radian e a
// análise de pontos destoantes. Usada pelo servidor e pela tela (recalcular o
// limite sem ir ao servidor de novo).

export const EXTENSOES = new Set(['.dat'])
export const PASTA_RADIAN = 'Radian'
export const PASTA_FINALIZADOS = '_Finalizados'   // dentro da Origem; não tem nome de protocolo, some da lista
export const SUFIXO_ENVIADO = '_Enviado'
export const RE_ENVIADO = /_Enviado(?:_\d+)?$/i         // X_Enviado / X_Enviado_2

// Nome do arquivo (grupo 1 = protocolo, 2 = norma): PROTOCOLO[-AMOSTRA] + (- ou _) + NORMA (4-5, 4-6_COM...) no fim, podendo ter _L1 etc. depois
//   O26072324-1-4-5   -> protocolo O26072324-1, norma 4-5
//   O26072324_4-6_COM -> protocolo O26072324,   norma 4-6_COM
export const PADRAO = /^(.+)[-_](\d+-\d+(?:_[A-Za-z]+(?=$|[-_ .]))?)(?:[-_ .].*)?$/
// Protocolo no começo do nome (grupo 1 = texto, 2 = número, 3 = amostra): O opcional + 5 ou mais dígitos + amostra opcional (-1, -2...)
const RE_PROTOCOLO = /^\s*([Oo]?\s*0*(\d{5,})(?:-(\d+))?)(?=$|[^0-9])/
const INVALIDOS = '<>:"/\\|?*'

// Ponto destoante: %Error longe da mediana da série. Tem que passar dos DOIS limites:
// limite (pontos percentuais) E Z_ROBUSTO desvios "robustos" (MAD) da série.
export const LIMITE_DESVIO = 1.0
const Z_ROBUSTO = 5
const INTERVALO_SERIE = 600   // segundos sem medição = outra série (arquivos sem Run #)
export const SEPARADOR_DAT = /(^\s*-{5,}\s*$)/m
const CAMPOS_PADRAO = ['Serial Number', 'DUT Kh', '%Reg', '%Error']   // o que fica no .DAT enviado (além de data/hora)

export interface Protocolo { num: string; amostra: string | null; txt: string }

/** 'O26072324-1_Landis_TRI' → { num: '26072324', amostra: '1', txt: 'O26072324-1' }; sem cara de protocolo → null. */
export function lerProtocolo(nome: string): Protocolo | null {
  const m = nome.match(RE_PROTOCOLO)
  if (!m) return null
  return { num: m[2], amostra: m[3] ?? null, txt: m[1].replace(/ /g, '') }
}

/** Mesmo protocolo? Casa pelo número; a amostra (-1, -2…) só desempata — lado sem amostra serve para qualquer uma. */
export function mesmoProtocolo(a: Protocolo, b: Protocolo): boolean {
  return a.num === b.num && (a.amostra === null || b.amostra === null || a.amostra === b.amostra)
}

export function limparNome(s: string): string {
  return [...s].filter(c => !INVALIDOS.includes(c) && c.charCodeAt(0) >= 32).join('').replace(/^[ .]+|[ .]+$/g, '')
}

/* ── .DAT do Radian ─────────────────────────────────────────────────────────
   Blocos separados por "-----------"; em cada bloco, duas linhas soltas (data
   e hora) e campos "Chave=valor". Lido/gravado em latin1. */

export function camposBloco(bloco: string): { campos: Record<string, string>; soltas: string[] } {
  const campos: Record<string, string> = {}
  const soltas: string[] = []
  for (const bruta of bloco.split(/\r?\n|\r/)) {
    const linha = bruta.trim()
    if (linha.includes('=')) {
      const i = linha.indexOf('=')
      campos[linha.slice(0, i).trim()] = linha.slice(i + 1).trim()
    } else if (linha) soltas.push(linha)
  }
  return { campos, soltas }
}

/** Layout enxuto: em cada medição só data, hora e os CAMPOS_PADRAO. */
export function padronizarDat(texto: string): string {
  const nl = texto.includes('\r\r\n') ? '\r\r\n' : texto.includes('\r\n') ? '\r\n' : '\n'
  const linhas: string[] = []
  texto.split(SEPARADOR_DAT).forEach((bloco, i) => {
    if (i % 2) return                     // separador
    const { campos, soltas } = camposBloco(bloco)
    if (!('%Error' in campos)) return
    linhas.push('-----------', ...soltas.slice(0, 2), ...CAMPOS_PADRAO.filter(k => k in campos).map(k => `${k}=${campos[k]}`))
  })
  return linhas.map(l => l + nl).join('')
}

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) ? n : null
}

/** Hash curto do texto do bloco: a exclusão confere que o arquivo não mudou desde a leitura. */
export function hashBloco(texto: string): string {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36) + ':' + texto.length
}

export interface Ponto {
  run: number | null
  quando: string | null       // ISO local "2026-10-22T14:11:10"
  erro: number
  pulsos: string | null
  bloco: number               // posição no split do arquivo
  hash: string
}

function parseQuando(soltas: string[]): string | null {
  const m = soltas.slice(0, 2).join(' ').match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null
}

/** Texto de um .DAT do Radian → séries; cada série é a lista de pontos na ordem do arquivo. */
export function lerDat(texto: string): Ponto[][] {
  const partes = texto.split(SEPARADOR_DAT)   // [antes, ---, bloco, ---, bloco, ...]
  const pontos: (Ponto & { chave: string })[] = []
  for (let i = 0; i < partes.length; i += 2) {
    const { campos, soltas } = camposBloco(partes[i])
    const erro = num(campos['%Error'])
    if (erro === null) continue
    const run = num(campos['Run #'])
    pontos.push({
      run: run === null ? null : Math.trunc(run), quando: parseQuando(soltas), erro,
      pulsos: campos['Standard Pulses'] ?? null, bloco: i, hash: hashBloco(partes[i]),
      chave: JSON.stringify([campos['Serial Number'], campos['Test'], campos['DUT Kh']]),
    })
  }
  const series: (Ponto & { chave: string })[][] = []
  for (const p of pontos) {
    const s = series[series.length - 1]
    const a = s?.[s.length - 1]
    let nova = !a || p.chave !== a.chave
    if (!nova && p.quando && a!.quando) {
      nova = Math.abs(new Date(p.quando).getTime() - new Date(a!.quando).getTime()) / 1000 > INTERVALO_SERIE
    }
    if (!nova && p.run !== null && a!.run !== null) {
      // Run # anda sempre no mesmo sentido dentro da série; voltou/repetiu = recomeçou
      const passo = p.run - a!.run
      const direcao = s.length > 1 && s[0].run !== null && s[1].run !== null ? s[1].run - s[0].run : passo
      nova = passo === 0 || (passo > 0) !== (direcao > 0)
    }
    if (nova) series.push([])
    series[series.length - 1].push(p)
  }
  return series.map(s => s.map(({ chave: _, ...p }) => p))
}

export function mediana(v: number[]): number | null {
  const s = [...v].sort((a, b) => a - b)
  const n = s.length
  return n ? (s[Math.floor(n / 2)] + s[Math.floor((n - 1) / 2)]) / 2 : null
}

export interface AnaliseSerie {
  n: number
  mediana: number
  media: number
  mediaSem: number | null       // média sem os destoantes
  destoantes: { ponto: Ponto; motivo: string }[]
}

export function fmt(x: number | null | undefined, sinal = false): string {
  if (x === null || x === undefined) return '-'
  return ((sinal && x >= 0 ? '+' : '') + x.toFixed(3)).replace('.', ',')
}

export function analisarSerie(serie: Ponto[], limite: number): AnaliseSerie {
  const erros = serie.map(p => p.erro)
  const med = mediana(erros)!
  const mad = 1.4826 * mediana(erros.map(e => Math.abs(e - med)))!
  const contagem = new Map<string | null, number>()
  serie.forEach(p => contagem.set(p.pulsos, (contagem.get(p.pulsos) ?? 0) + 1))
  const pulsos = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0]   // o mais comum (empate: o primeiro)
  const destoantes: AnaliseSerie['destoantes'] = []
  for (const p of serie) {
    const motivos: string[] = []
    const d = p.erro - med
    if (serie.length >= 5 && Math.abs(d) > limite && Math.abs(d) > Z_ROBUSTO * mad) motivos.push(`${fmt(d, true)} da mediana`)
    if (p.pulsos !== pulsos) motivos.push(`pulsos do padrão ${p.pulsos} (normal ${pulsos})`)
    if (motivos.length) destoantes.push({ ponto: p, motivo: motivos.join('; ') })
  }
  const ruins = new Set(destoantes.map(d => d.ponto))
  const bons = serie.filter(p => !ruins.has(p)).map(p => p.erro)
  return {
    n: serie.length, mediana: med, media: erros.reduce((a, b) => a + b, 0) / erros.length,
    mediaSem: bons.length ? bons.reduce((a, b) => a + b, 0) / bons.length : null, destoantes,
  }
}

/* ── ensaio da agenda a partir do nome da pasta/arquivo ─────────────────────
   "4-4", "4-4_COM", "4-19_PM" → código base; reativa ("REA", "Rea", "RTV",
   "reativa") no 4-4 vira 4-4R (o catálogo separa ativa e reativa no burst). */
export function codigoDoEnsaio(nomePasta: string, nomeArquivo = ''): string | null {
  const m = nomePasta.match(/^(\d+-\d+)/) ?? nomeArquivo.match(PADRAO)?.[2]?.match(/^(\d+-\d+)/)
  if (!m) return null
  const base = m[1]
  const reativa = /(^|[^a-z])(rea|reat|reativa|rtv)(?![a-z])/i.test(`${nomePasta} ${nomeArquivo}`.replace(/\.dat$/i, ''))
  return base === '4-4' && reativa ? '4-4R' : base
}
