export type ResultKey = 'conduzida' | 'loop' | 'anexoB'

const RESULT_MATCH: Record<ResultKey, RegExp> = {
  conduzida: /conduzida|conducted/i,
  loop:      /\bloop\b/i,
  anexoB:    /anexo\s*b|annex\s*b/i,
}
const ALL_RESULT_PATTERNS = Object.values(RESULT_MATCH)

export function filterDocxForResult(html: string, key: ResultKey): string {
  try {
    const parser = new DOMParser()
    const dom    = parser.parseFromString(html, 'text/html')
    const nodes  = Array.from(dom.body.children)

    const sections: string[] = []
    let cur = ''
    for (const child of nodes) {
      const el    = child as HTMLElement
      const style = el.getAttribute('style') ?? ''
      if (el.tagName === 'DIV' && /page-break-before\s*:\s*always/i.test(style)) {
        if (cur.trim()) sections.push(cur)
        cur = el.outerHTML
      } else {
        cur += el.outerHTML
      }
    }
    if (cur.trim()) sections.push(cur)

    const filtered = sections.filter(sec => {
      const text = sec.replace(/<[^>]+>/g, ' ')
      const matchesTarget  = RESULT_MATCH[key].test(text)
      const matchesAnyTest = ALL_RESULT_PATTERNS.some(p => p.test(text))
      return matchesTarget || !matchesAnyTest
    })

    return filtered.length > 0 ? filtered.join('\n') : html
  } catch {
    return html
  }
}
