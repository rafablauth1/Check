// Limpeza do texto extraído de PDF/DOCX antes de virar .md na base. O texto
// cru do pdf-parse vem com cabeçalho/rodapé repetido em toda página, número de
// página solto e frases quebradas no fim de cada linha. Aqui:
// - some com linhas que se repetem em várias páginas (cabeçalho/rodapé);
// - some com número de página e linhas de assinatura digital do DOU;
// - junta linhas quebradas no meio da frase (e "Utiliza-" + "se");
// - transforma ANEXO e títulos em CAIXA ALTA em títulos markdown.
// O resultado é revisado pelo usuário na tela antes de salvar.

const RE_INICIO_BLOCO = /^(\d+(\.\d+)*\.?\s|[a-z]\)\s|[IVXLC]+\s*[-–]\s|Art\.?\s*\d|§|ANEXO\b|Tabela\s+[\dA-Z]|Parágrafo\s+único|#|\||[-•]\s)/

export function limparTextoNorma(bruto: string): string {
  const linhas = bruto.replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim())

  // linhas curtas que aparecem 3+ vezes = cabeçalho/rodapé de página
  const conta = new Map<string, number>()
  for (const l of linhas) if (l && l.length < 140) conta.set(l, (conta.get(l) ?? 0) + 1)
  const repetida = (l: string) => (conta.get(l) ?? 0) >= 3 && !/^(\d+(\.\d+)*\.?|[a-z]\))\s/.test(l)

  const lixo = (l: string) =>
    /^\d{1,3}$/.test(l) ||                                   // número de página
    /^page \d+$/i.test(l) ||
    /^Documento assinado digitalmente/i.test(l) ||
    /^que institui a Infraestrutura de Chaves/i.test(l) ||
    /^Este documento pode ser verificado/i.test(l) ||
    /autenticidade\.html/i.test(l) ||
    /^,?\s*pelo código \d+/i.test(l) ||
    /^N[º°]\s*\d+,\s*\w+-feira/i.test(l) ||
    /^ISSN\s*$/i.test(l) || /^\d{4}-\d{4}$/.test(l) ||
    /^\d+_MECON_\d+_\d+$/.test(l)                           // marcador de imagem do DOU

  const uteis = linhas.filter(l => !l || !(repetida(l) || lixo(l)))

  const blocos: string[] = []
  let atual = ''
  const fechar = () => { if (atual.trim()) blocos.push(atual.trim()); atual = '' }
  for (const l of uteis) {
    if (!l) { fechar(); continue }
    if (RE_INICIO_BLOCO.test(l) || ehTitulo(l)) {
      fechar()
      atual = ehTitulo(l) ? titulo(l) : l
      if (ehTitulo(l)) fechar()
      continue
    }
    if (!atual) { atual = l; continue }
    // "Utiliza-" + "se", "61000-4-" + "6:2013": junta sem espaço
    atual = /[-–]$/.test(atual) && !/\s[-–]$/.test(atual) ? atual + l : atual + ' ' + l
  }
  fechar()
  return blocos.join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n'
}

export function ehTitulo(l: string): boolean {
  if (/^ANEXO\s+[A-Z]\b/.test(l) && l.length < 20) return true
  // cabeçalho de página das IEC ("– 6 – IEC 61000-4-19:2014 © IEC 2014") e
  // fonte de definição ("[SOURCE: IEC 60050-161…]") não são títulos
  if (/©|^\[|^[–-]\s*\d+\s*[–-]|[–-]\s*\d+\s*[–-]$/.test(l)) return false
  // "1. TERMOS E DEFINIÇÕES", "1.12 ENSAIO DE IMUNIDADE A ..." (texto em caixa alta)
  const semNumero = l.replace(/^\d+(\.\d+)*\.?\s+/, '')
  const letras = semNumero.replace(/[^A-Za-zÀ-ÿ]/g, '')
  if (!(letras.length >= 6 && letras === letras.toUpperCase() && l.length < 160)) return false
  // rótulo de figura ("EUT EUT", "EUT CDN AE", "GSM DCS 1800 DECT"): só siglas
  // curtas ou palavra repetida
  const palavras = semNumero.split(/\s+/)
    .map(p => p.replace(/^[(["']+|[)\]"',.;:–\-/]+$/g, ''))
    .filter(p => /^[A-Za-zÀ-ÿ]+$/.test(p))
  return palavras.some(p => p.length >= 5) && new Set(palavras).size > palavras.length / 2
}

function titulo(l: string): string {
  if (/^ANEXO\b/.test(l)) return '## ' + l
  const nivel = (l.match(/^(\d+(\.\d+)*)/)?.[1].split('.').length ?? 1)
  return (nivel <= 1 ? '## ' : '### ') + l
}
