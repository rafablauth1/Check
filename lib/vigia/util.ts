// VIGIA-7S no app — números e formatos (porte de funções de vigia7s/app.py).
// Os números têm de sair IGUAIS aos do VIGIA em Python: f"{v:.3f}" e round(v, 3) do Python
// arredondam o ".5" exato para o PAR; toFixed do JavaScript arredonda para cima. Daí fixo().

/** f"{v:.{casas}f}" do Python (meio exato → par). */
export function fixo(v: number, casas: number): string {
  const s = v.toFixed(casas)
  // empate só existe quando v é exatamente representável com casas+1 dígitos terminando em 5
  const mais = v.toFixed(Math.min(100, casas + 25))
  const m = mais.match(/^(-?\d+)\.?(\d*)$/)
  if (!m) return s
  const frac = m[2]
  const resto = frac.slice(casas)
  if (resto.length && resto[0] === '5' && /^5?0*$/.test(resto)) {
    // empate exato: escolhe o par
    const truncado = `${m[1]}${casas ? '.' + frac.slice(0, casas) : ''}`
    const ultimo = Number((casas ? frac[casas - 1] : m[1].slice(-1)) ?? '0')
    if (ultimo % 2 === 0) return truncado.replace(/^-(0\.?0*)$/, '-$1')
  }
  return s
}

/** round(v, casas) do Python (meio exato → par). */
export const pyRoundN = (v: number, casas: number) => Number(fixo(v, casas))

/** num() do VIGIA: aceita vírgula e o sinal de menos tipográfico. */
export function num(s: unknown, padrao: number | null = 0.0): number | null {
  const t = String(s ?? '').replace(',', '.').replace('−', '-').trim()
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) && !/^[+-]?(inf|infinity|nan)$/i.test(t)) return padrao
  return Number(t)
}

/** br(): número com vírgula; nunca "-0,000". */
export function br(v: number, casas = 2): string {
  if (Math.abs(v) < 0.5 * 10 ** -casas) v = 0.0
  return fixo(v, casas).replace('.', ',')
}

/** Erro da indicação em relação ao esperado: (V − V_esp) / V_esp × 100 [%]. null se não houver como calcular. */
export function erroPct(valor: number | null | undefined, esperado: number | null | undefined): number | null {
  if (valor === null || valor === undefined || !esperado) return null
  return (valor - esperado) / esperado * 100.0
}

/** Erro com 3 casas; zero aparece como "0,000" (nunca em branco ou "-0,000"); sem cálculo = "—". */
export const fmtErro = (e: number | null) => e === null ? '—' : br(e, 3)

/** Offset que leva o ciclo médio ao segundo inteiro mais próximo (ex.: 20,370 → −0,370; 20,600 → +0,400). */
export const offsetInteiro = (media: number) => pyRoundN(Math.floor(media + 0.5) - media, 3)

/** Ciclo usado como dwell = tempo médio medido + offset (s, 3 casas). */
export const cicloComOffset = (media: number, offset: number) => pyRoundN(media + offset, 3)

/** mesclar(): configuração padrão + a salva (recursivo nos objetos). */
export function mesclar<T>(padrao: T, atual: unknown): T {
  const out = structuredClone(padrao) as Record<string, unknown>
  for (const [k, v] of Object.entries((atual ?? {}) as Record<string, unknown>)) {
    const p = out[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && p && typeof p === 'object' && !Array.isArray(p) ? mesclar(p, v) : v
  }
  return out as T
}

/** Número para a voz: f"{v:.{casas}f}" com vírgula (a voz do Windows lê "2,5" como "dois vírgula cinco"). */
export const falaNum = (v: number, casas = 1) => fixo(v, casas).replace('.', ',')

/** Frequência para falar (ex.: '1,074 gigahertz', '86,6 megahertz'). */
export function falaFreq(mhz: number | null | undefined): string {
  if (!mhz) return ''
  return mhz >= 1000 ? `${falaNum(mhz / 1000, 3)} gigahertz` : `${falaNum(mhz, 1)} megahertz`
}

/** datetime.strftime com %d %m %Y %H %M %S */
export function strftime(d: Date, fmt: string): string {
  const p2 = (x: number) => String(x).padStart(2, '0')
  return fmt.replace(/%([dmYHMS])/g, (_, k: string) => ({
    d: p2(d.getDate()), m: p2(d.getMonth() + 1), Y: String(d.getFullYear()), H: p2(d.getHours()), M: p2(d.getMinutes()), S: p2(d.getSeconds()),
  } as Record<string, string>)[k])
}

/** f"{v:+.{casas}f}" com vírgula (ex.: "+0,12") */
export const sinalBr = (v: number, casas = 2) => { const s = fixo(v, casas); return (s.startsWith('-') ? s : '+' + s).replace('.', ',') }

/** str() do Python para um valor de célula do CSV */
function strPy(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  return String(v)
}

/** uma linha do csv.writer(delimiter=";") do Python (QUOTE_MINIMAL, fim de linha \r\n) */
export function csvLinha(vals: unknown[]): string {
  return vals.map(v => {
    const s = strPy(v)
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }).join(';') + '\r\n'
}
