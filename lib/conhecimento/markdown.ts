import type { Documento, MetaDoc, Trecho } from '@/lib/conhecimento/tipos'

// Leitura/escrita do .md da base e divisão em trechos pesquisáveis. Funções
// puras (sem fs) — usadas no servidor e no navegador.

const CAMPOS: (keyof MetaDoc)[] = ['titulo', 'tipo', 'origem', 'fonte', 'pergunta', 'tags', 'criadoEm', 'atualizadoEm']

/** "---\nchave: valor\n---\ncorpo" → { meta, corpo }. Aceita arquivo sem cabeçalho. */
export function lerMd(id: string, conteudo: string): Documento {
  const texto = conteudo.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = texto.match(/^---\n([\s\S]*?)\n---\n?/)
  const meta: Record<string, string> = {}
  if (m) {
    for (const linha of m[1].split('\n')) {
      const k = linha.indexOf(':')
      if (k > 0) meta[linha.slice(0, k).trim()] = linha.slice(k + 1).trim()
    }
  }
  const corpo = m ? texto.slice(m[0].length) : texto
  const primeiroTitulo = corpo.match(/^#\s+(.+)$/m)?.[1]
  return {
    id,
    titulo: meta.titulo || primeiroTitulo || id,
    tipo: meta.tipo === 'nota' ? 'nota' : 'norma',
    origem: meta.origem || undefined,
    fonte: meta.fonte || undefined,
    pergunta: meta.pergunta || undefined,
    tags: meta.tags ? meta.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    criadoEm: meta.criadoEm || undefined,
    atualizadoEm: meta.atualizadoEm || undefined,
    corpo: corpo.replace(/^\n+/, ''),
  }
}

export function escreverMd(doc: Documento): string {
  const linhas = ['---']
  for (const k of CAMPOS) {
    const v = doc[k]
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue
    // uma linha por campo: quebra de linha no valor viraria outro campo
    linhas.push(`${k}: ${(Array.isArray(v) ? v.join(', ') : String(v)).replace(/\s*\n\s*/g, ' ')}`)
  }
  linhas.push('---', '')
  return linhas.join('\n') + doc.corpo.replace(/\r\n/g, '\n').trimEnd() + '\n'
}

/** Nome de arquivo seguro a partir do título. */
export function slug(titulo: string): string {
  return (titulo || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'documento'
}

// Início de trecho: título markdown, item numerado ("2.5.2.4 ..."), artigo, anexo.
const RE_TITULO = /^(#{1,6})\s+(.+)$/
// "2.5.2.4 …" e também cláusula de número simples das IEC ("9 Evaluation of test results")
// … e itens de anexo ("A.1.2 Calibration …", "B.3 …")
const RE_ITEM = /^(\d+(?:\.\d+)+\.?\s+\S|\d{1,2}\s+[A-Z][a-z]{2,}|[A-J]\.\d+(?:\.\d+)*\s+\S)/
const RE_ARTIGO = /^(Art\.?\s*\d+[ºo°]?|ANEXO\s+[A-Z]\b|Annex\s+[A-Z]\b)/i
const MAX_TRECHO = 1400

const ehTabela = (par: string) => par.split('\n').every(l => l.trim().startsWith('|'))

/* Divide o documento em trechos. Nota = um trecho só (pergunta + resposta).
   Norma = um trecho por item/seção; título solto se junta ao item seguinte;
   item longo é quebrado por parágrafo, mantendo a mesma âncora; tabela grande
   vira um trecho por linha (com o cabeçalho), para a busca achar a linha certa
   em vez de afogá-la num trecho enorme. Cada trecho leva o título da seção em
   que está (contexto) — "1.12.3 Nível de severidade" sabe que é do ESD. */
export function dividirEmTrechos(doc: Documento): Trecho[] {
  const base = { docId: doc.id, titulo: doc.titulo, tipo: doc.tipo }
  if (doc.tipo === 'nota') {
    return [{ ...base, ancora: 'Nota', texto: [doc.pergunta, doc.corpo].filter(Boolean).join('\n\n') }]
  }
  const trechos: Trecho[] = []
  let ancora = doc.titulo
  let secao = ''
  let buf: string[] = []
  const add = (texto: string, a = ancora) => trechos.push({ ...base, ancora: a, texto, ...(secao ? { contexto: secao } : {}) })
  const fechar = () => {
    const texto = buf.join('\n').trim()
    buf = []
    if (!texto) return
    if (texto.length <= MAX_TRECHO) { add(texto); return }
    let atual = ''
    let tituloTabela = ''
    for (const par of texto.split(/\n{2,}/)) {
      if (ehTabela(par) && par.length > MAX_TRECHO / 2) {
        if (atual) { add(atual); atual = '' }
        const linhas = par.split('\n')
        const cab = linhas.slice(0, 2).join('\n')          // cabeçalho + |---|
        const rotulo = tituloTabela.replace(/[*_]/g, '').split('–')[0].trim()
        const item = ancora.match(/^\d+(\.\d+)+/)?.[0]
        const aTabela = rotulo ? (item ? `${rotulo} (item ${item})` : rotulo) : ancora
        for (const linha of linhas.slice(2)) {
          add((tituloTabela ? tituloTabela + '\n\n' : '') + cab + '\n' + linha, aTabela)
        }
        continue
      }
      if (/^\*\*Tabela/.test(par)) tituloTabela = par.split('\n')[0]
      if (atual && (atual + '\n\n' + par).length > MAX_TRECHO) { add(atual); atual = '' }
      atual = atual ? atual + '\n\n' + par : par
    }
    if (atual) add(atual)
  }
  for (const linha of doc.corpo.split('\n')) {
    const t = linha.trim()
    const tit = t.match(RE_TITULO)
    const item = t.match(RE_ITEM)
    const art = t.match(RE_ARTIGO)
    if (tit || item || art) {
      // título sozinho (sem texto ainda) não vira trecho: vira o rótulo do próximo
      const soTitulo = buf.every(l => !l.trim() || RE_TITULO.test(l.trim()))
      if (!soTitulo) fechar()
      if (tit) { secao = tit[2].replace(/[*_`]/g, '').trim(); ancora = secao }
      else ancora = (secao && !item ? secao + ' — ' : '') + (t.length > 90 ? t.slice(0, 90).replace(/\s+\S*$/, '') + '…' : t)
      if (tit && soTitulo) { buf = []; continue }
    }
    buf.push(linha)
  }
  fechar()
  return trechos
}
