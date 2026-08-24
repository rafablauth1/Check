// Encontra "palavras" verificáveis num texto livre (ignora números, pontuação,
// siglas em caixa alta e códigos como "IT-001"/"PC R04").
export interface Palavra {
  texto: string
  inicio: number
  fim: number // exclusivo
}

const RE_PALAVRA = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g

// Sigla (2+ letras maiúsculas, ex.: "EUT", "CISPR") ou algo com dígito/hífen de
// código — não vale a pena sugerir correção para isso.
function ignoravel(palavra: string): boolean {
  if (palavra.length < 2) return true
  if (/\d/.test(palavra)) return true
  if (palavra === palavra.toUpperCase() && palavra !== palavra.toLowerCase()) return true
  return false
}

export function encontrarPalavras(texto: string): Palavra[] {
  const out: Palavra[] = []
  RE_PALAVRA.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_PALAVRA.exec(texto))) {
    const t = m[0]
    if (!ignoravel(t)) out.push({ texto: t, inicio: m.index, fim: m.index + t.length })
  }
  return out
}

// Palavra sob um índice de caractere (ex.: posição do clique/caret), pra achar
// o alvo do menu de sugestões.
export function palavraNoIndice(texto: string, indice: number): Palavra | null {
  for (const p of encontrarPalavras(texto)) {
    if (indice >= p.inicio && indice <= p.fim) return p
  }
  return null
}
