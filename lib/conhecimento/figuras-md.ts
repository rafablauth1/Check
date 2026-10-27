// Figuras e tabelas recortadas do PDF de uma norma → no texto (.md) dela,
// logo antes da legenda. Usado ao anexar uma norma na Base de Conhecimento.

export interface FiguraPdf {
  tipo: 'Figure' | 'Table' | 'Figura' | 'Tabela'   // como está escrito na legenda
  numero: string           // "11", "A.1", "1a)"
  titulo: string
  legenda: string          // linha inteira: "Figure 11 – Example of a test setup…"
  pagina: number
  arquivo: string          // "fig-11.png", "tab-A-1.png"
  png: string              // base64
  largura: number
  altura: number
  md?: string              // tabela remontada (markdown), quando deu
  usar: boolean            // o usuário pode desmarcar antes de salvar
}

export const ehTabela = (t: FiguraPdf['tipo']) => t === 'Table' || t === 'Tabela'

export function nomeArquivoFigura(tipo: FiguraPdf['tipo'], numero: string): string {
  return `${ehTabela(tipo) ? 'tab' : 'fig'}-${numero.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '')}.png`
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const limparLegenda = (s: string) => s.replace(/\s+ñ\s+/g, ' – ').replace(/\s+/g, ' ').trim()   // 4-11: travessão vem como "ñ"

/** Coloca as figuras/tabelas no texto, antes da legenda de cada uma. Ordem de busca:
 *  a própria legenda "Figure 11 – " → o começo do título → a legenda da figura principal
 *  (sub-figura 1a) → o começo do anexo (item C.1) → logo depois da anterior. Idempotente. */
export function inserirFiguras(corpo: string, docId: string, itens: FiguraPdf[]): string {
  let md = corpo
  const posicoes: [number, string, number][] = []
  const semLugar: string[] = []
  let anterior = -1
  const achar = (re: RegExp) => { const r = re.exec(md); return r ? r.index : -1 }

  itens.forEach((m, ordem) => {
    const ref = `img/${docId}/${m.arquivo}`
    if (md.includes(`](${ref})`)) return
    const legenda = limparLegenda(m.legenda)
    let bloco = `![${legenda}](${ref})`
    if (ehTabela(m.tipo) && m.md) {
      bloco += `\n\n**${legenda}** — transcrição automática do PDF; confira os valores na imagem acima.\n\n${m.md}`
    }
    let i = achar(new RegExp(`${m.tipo}\\s+${esc(m.numero)}\\s+[–\\-ñ]\\s`))
    if (i < 0 && m.titulo.length > 12) i = achar(new RegExp(esc(limparLegenda(m.titulo).slice(0, 35)).replace(/ /g, '\\s+')))
    const princ = m.numero.match(/^(.+?\d)[a-z]\)?$/)
    if (i < 0 && princ) i = achar(new RegExp(`${m.tipo}\\s+${esc(princ[1])}\\s+[–\\-ñ]\\s`))
    const anexo = m.numero.match(/^([A-J])\./)
    if (i < 0 && anexo) {
      const ini = achar(new RegExp(`(Annex|Anexo|ANEXO)\\s+${anexo[1]}\\b`))
      if (ini >= 0) { const f = md.indexOf('\n\n', Math.max(ini, anterior)); i = f < 0 ? md.length : f }
    }
    if (i < 0 && anterior >= 0) { const f = md.indexOf('\n\n', anterior); i = f < 0 ? md.length : f }
    if (i < 0) { semLugar.push(bloco); return }
    posicoes.push([i, bloco, ordem])
    anterior = i
  })

  // de trás para frente, para os índices continuarem valendo; mesma posição mantém a ordem
  posicoes.sort((a, b) => b[0] - a[0] || b[2] - a[2])
    .forEach(([i, bloco]) => { md = md.slice(0, i).replace(/[ \t]+$/, '') + `\n\n${bloco}\n\n` + md.slice(i) })
  if (semLugar.length) md = md.trimEnd() + '\n\n## Figuras e tabelas\n\n' + semLugar.join('\n\n') + '\n'
  return md.replace(/\n{3,}/g, '\n\n')
}
