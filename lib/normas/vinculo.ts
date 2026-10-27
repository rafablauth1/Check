import type { Norma } from '@/lib/normas/tipos'
import type { Documento, MetaDoc } from '@/lib/conhecimento/tipos'

/* Normas (cadastro: código, ensaios, padrões) ↔ Base de Conhecimento (o texto
   da norma em .md). O vínculo é pelo CÓDIGO da norma, calculado na hora — nada
   é gravado: cadastrar a norma ou anexar o texto na base já liga os dois.
     "IEC 61000-4-4"        ↔ iec-61000-4-4-2012 (e a emenda iec-61000-4-11-2004-amd1-2017 ↔ 4-11)
     "Portaria Inmetro 221" ↔ portaria-inmetro-221-2022
     "CISPR 15", "ABNT NBR 15947" ↔ cispr-15-…, nbr-15947-… */

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Chave canônica da norma a partir do código, título ou id; null se não reconhecer. */
export function chaveNorma(texto: string): string | null {
  const t = sem(texto).replace(/[_\s]+/g, ' ')
  let m = t.match(/iec[^\d]{0,3}(\d{5})(?:[-. ](\d{1,2}))?(?:[-. ](\d{1,2}))?(?!\d)/)
  if (m) return ['iec', [m[1], m[2], m[3]].filter(Boolean).join('-')].join(' ')
  m = t.match(/cispr[^\d]{0,3}(\d{1,2})(?!\d)/)
  if (m) return `cispr ${Number(m[1])}`
  m = t.match(/nbr[^\d]{0,8}(\d{4,5})(?!\d)/)
  if (m) return `nbr ${m[1]}`
  m = t.match(/portaria[^\d]{0,20}?(\d{2,4})(?!\d)/)
  if (m) return `portaria ${Number(m[1])}`
  return null
}

const chaveDoDoc = (d: MetaDoc) => chaveNorma(d.id) ?? chaveNorma(d.titulo)
const chaveDaNorma = (n: Pick<Norma, 'id' | 'codigo'>) => chaveNorma(n.codigo) ?? chaveNorma(n.id)

/** Textos (documentos tipo norma) da base para esta norma — a edição principal primeiro, emendas depois. */
export function docsDaNorma(norma: Pick<Norma, 'id' | 'codigo'>, docs: MetaDoc[]): MetaDoc[] {
  const k = chaveDaNorma(norma)
  if (!k) return []
  return docs.filter(d => d.tipo === 'norma' && chaveDoDoc(d) === k)
    .sort((a, b) => Number(/amd|emenda/i.test(a.id + a.titulo)) - Number(/amd|emenda/i.test(b.id + b.titulo)) || a.id.localeCompare(b.id))
}

/** Norma do cadastro a que o documento da base pertence. */
export function normaDoDoc(doc: MetaDoc, normas: Norma[]): Norma | null {
  if (doc.tipo !== 'norma') return null
  const k = chaveDoDoc(doc)
  return k ? normas.find(n => chaveDaNorma(n) === k) ?? null : null
}

/** Documentos de norma da base que ainda não têm cadastro em Normas (uma entrada por norma). */
export function docsSemCadastro(docs: MetaDoc[], normas: Norma[]): MetaDoc[] {
  const vistos = new Set<string>()
  return docs.filter(d => {
    if (d.tipo !== 'norma' || normaDoDoc(d, normas)) return false
    const k = chaveDoDoc(d) ?? d.id
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

/** Código curto usado nas notas e etiquetas: "IEC 61000-4-4" → "4-4"; "Portaria Inmetro 221" → "221". */
function codigoCurto(norma: Pick<Norma, 'id' | 'codigo'>): string | null {
  const k = chaveDaNorma(norma)
  const iec = k?.match(/^iec 61000-(\d+-\d+)$/)
  if (iec) return iec[1]
  return k?.split(' ')[1] ?? null
}

/** Notas do laboratório sobre esta norma (pela etiqueta ou pelo código no título/fonte). */
export function notasDaNorma(norma: Pick<Norma, 'id' | 'codigo'>, docs: MetaDoc[]): MetaDoc[] {
  const curto = codigoCurto(norma)
  const k = chaveDaNorma(norma)
  if (!curto && !k) return []
  return docs.filter(d => d.tipo === 'nota' && (
    (curto && (d.tags ?? []).some(t => sem(t).trim() === curto)) ||
    (k && [d.titulo, d.fonte ?? '', ...(d.tags ?? [])].some(t => chaveNorma(t) === k))
  ))
}

/** Dados para a ficha de uma norma do cadastro "Normas" (o que é preciso para cadastrar a partir da base). */
export function rascunhoDeNorma(doc: MetaDoc): Pick<Norma, 'codigo' | 'titulo' | 'tipo'> {
  const [cab, ...resto] = doc.titulo.split('—')
  return {
    codigo: cab.replace(/:\d{4}.*$/, '').replace(/\/\d{4}$/, '').trim(),
    titulo: resto.join('—').trim() || doc.titulo,
    tipo: 'imunidade',
  }
}

/** Item do sumário: `ancora` é o começo da linha no texto (o visualizador pula
    para o bloco que a contém); `titulo` é o que aparece; nível 0 = anexo. */
export interface ItemSumario { ancora: string; titulo: string; nivel: 0 | 1 | 2 }

/** "7.3 Test setup for type tests performed in laboratories" de uma linha que
    segue com o texto do item ("1 Scope This part of…" → "1 Scope"): o título
    acaba na primeira palavra com maiúscula que começa a frase seguinte. */
function tituloCurto(numero: string, resto: string): string {
  const palavras = resto.split(/\s+/)
  const out: string[] = []
  for (const p of palavras) {
    if (out.length && /^[A-ZÀ-Ú][a-zà-ú]/.test(p)) break
    out.push(p)
    if (out.join(' ').length > 70) { out.push('…'); break }
  }
  return `${numero} ${out.join(' ').replace(/[.:;,]$/, '')}`
}

/** Sumário do texto da norma, lido das linhas: anexos, cláusulas de até 2
    níveis ("7", "7.3") e artigos, na ordem do documento. A numeração tem de
    subir (dentro de cada anexo) — linha solta que começa com número ("2 m",
    "50 Ω") não entra. Cada item abre o texto naquele ponto. */
export function sumarioDoDoc(doc: Documento): ItemSumario[] {
  const out: ItemSumario[] = []
  let atual = 0              // cláusula de 1º nível corrente (dentro do anexo)
  let grupo = ''             // anexo corrente: o mesmo título em outro anexo não é repetição
  const vistos = new Set<string>()
  const add = (it: ItemSumario) => {
    const k = `${grupo}|${it.ancora}`
    if (!vistos.has(k)) { vistos.add(k); out.push(it) }
  }

  for (const bruta of doc.corpo.split(/\r?\n/)) {
    const titulo = bruta.match(/^#{1,6}\s+(.+)$/)?.[1].trim()
    const linha = (titulo ?? bruta).trim()
    if (!linha) continue

    const anexo = linha.match(/^(ANEXO|Annex)\s+([A-Z])\b/i)
    if (anexo && linha.length < 60) {
      grupo = linha
      add({ ancora: linha.slice(0, 90), titulo: linha.replace(/\s+/g, ' '), nivel: 0 })
      atual = 0                // a numeração recomeça em cada anexo
      continue
    }
    const art = linha.match(/^(Art\.?\s*\d+[ºo°.]?)\s+(.+)$/)
    if (art && !titulo) { add({ ancora: linha.slice(0, 90), titulo: tituloCurto(art[1], art[2].split(/\s+/).slice(0, 6).join(' ').toLowerCase()), nivel: 1 }); continue }

    const m = linha.match(/^(\d{1,2})(?:\.(\d{1,2}))?\.?\s+(\S.*)$/)
    if (!m || !/^[A-ZÀ-Ú][A-Za-zÀ-ú]{2,}/.test(m[3])) continue
    const n1 = Number(m[1])
    if (m[2] === undefined) {
      if (n1 <= atual || n1 > atual + 3) continue      // tem de subir (e sem saltos grandes)
      atual = n1
      add({ ancora: linha.slice(0, 90), titulo: titulo ? linha : tituloCurto(m[1], m[3]), nivel: 1 })
    } else {
      // 7.3 só debaixo do 7; se o título do 7 não tem número no texto, o 7.x avança sozinho
      if (n1 > atual && n1 <= atual + 3) atual = n1
      if (n1 !== atual) continue
      add({ ancora: linha.slice(0, 90), titulo: titulo ? linha : tituloCurto(`${m[1]}.${m[2]}`, m[3]), nivel: 2 })
    }
  }
  return out
}
