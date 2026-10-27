'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Search, Loader2, MessageSquareText, ArrowRight, Library } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Norma } from '@/lib/normas/tipos'
import type { Documento, MetaDoc, ResultadoBusca } from '@/lib/conhecimento/tipos'
import { listarDocs, lerDoc, buscarNaBase } from '@/lib/conhecimento/cliente'
import { docsDaNorma, notasDaNorma } from '@/lib/normas/vinculo'
import { VisualizadorDoc, Sumario } from '@/components/conhecimento/VisualizadorDoc'

/* Ficha da norma ↔ Base de Conhecimento: o texto da norma (sumário, busca só
   nela, leitura) e as notas do laboratório sobre ela, dentro da tela de Normas.
   O vínculo é pelo código da norma (lib/normas/vinculo.ts). */

function Destacado({ texto, destaques }: { texto: string; destaques: [number, number][] }) {
  const partes: React.ReactNode[] = []
  let pos = 0
  destaques.forEach(([a, b], i) => {
    if (a > pos) partes.push(texto.slice(pos, a))
    partes.push(<mark key={i} className="bg-gold/25 text-gold rounded px-0.5">{texto.slice(a, b)}</mark>)
    pos = b
  })
  partes.push(texto.slice(pos))
  return <>{partes}</>
}

export function TextoNaBase({ norma }: { norma: Norma }) {
  const [docs, setDocs] = useState<MetaDoc[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ativo, setAtivo] = useState<Documento | null>(null)       // texto cujo sumário aparece
  const [viewer, setViewer] = useState<{ doc: Documento; alvo?: string } | null>(null)
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultado, setResultado] = useState<{ q: string; itens: ResultadoBusca[] } | null>(null)

  useEffect(() => {
    listarDocs().then(setDocs).catch(e => setErro(e instanceof Error ? e.message : String(e)))
  }, [])

  const textos = useMemo(() => docs ? docsDaNorma(norma, docs) : [], [docs, norma])
  const notas = useMemo(() => docs ? notasDaNorma(norma, docs) : [], [docs, norma])

  useEffect(() => {
    if (textos.length) lerDoc(textos[0].id).then(setAtivo).catch(() => {})
  }, [textos])

  async function abrir(docId: string, alvo?: string) {
    try {
      const doc = ativo?.id === docId ? ativo : await lerDoc(docId)
      setViewer({ doc, alvo })
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
  }

  async function pesquisar() {
    const pergunta = q.trim()
    if (!pergunta || !textos.length) return
    setBuscando(true)
    try {
      const r = await buscarNaBase(pergunta, [...textos, ...notas].map(d => d.id))
      setResultado({ q: pergunta, itens: r.resultados.slice(0, 8) })
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
    finally { setBuscando(false) }
  }

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Library size={13} className="text-teal/80" />
        <p className="form-section !mb-0">Texto da norma · Base de Conhecimento</p>
        <span className="flex-1" />
        {textos.map(t => (
          <button key={t.id} type="button" onClick={() => lerDoc(t.id).then(setAtivo).catch(() => {})}
            className={cn('text-[10px] px-2 py-0.5 rounded border font-mono',
              ativo?.id === t.id ? 'border-gold/40 text-gold bg-gold/10' : 'border-white/10 text-white/40 hover:text-white/70')}
            title={t.titulo}>
            {t.titulo.split('—')[0].trim()}
          </button>
        ))}
      </div>

      {erro && <p className="text-[11px] text-red-400 mb-2">{erro}</p>}

      {docs === null ? (
        <p className="text-[11px] text-white/30 flex items-center gap-2"><Loader2 size={11} className="animate-spin" /> Lendo a Base de Conhecimento…</p>
      ) : !textos.length ? (
        <div className="flex items-center gap-3 text-[12px] text-white/40">
          <BookOpen size={14} className="text-white/25 shrink-0" />
          <span className="flex-1">O texto desta norma ainda não está na Base de Conhecimento.</span>
          <Link href="/conhecimento" className="text-teal hover:underline text-[11px] shrink-0">Anexar na Base de Conhecimento →</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* busca só nesta norma */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input className="input pl-9 pr-24 text-sm py-2" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') pesquisar() }}
              placeholder={`Pesquisar no texto da ${norma.codigo} — ex.: distância do acoplamento, nível de ensaio…`} />
            <button type="button" onClick={pesquisar} disabled={buscando || !q.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary px-3 py-1 text-xs font-bold flex items-center gap-1 disabled:opacity-40">
              {buscando ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />} Buscar
            </button>
          </div>

          {resultado && (
            <div className="space-y-1.5">
              {!resultado.itens.length && <p className="text-[11px] text-white/35">Nada sobre "{resultado.q}" no texto desta norma.</p>}
              {resultado.itens.map((r, i) => (
                <button key={r.docId + r.ancora + i} type="button" onClick={() => abrir(r.docId, r.ancora)}
                  className="block w-full text-left px-3 py-2 rounded-lg border border-white/8 bg-white/[0.02] hover:bg-white/[0.05] hover:border-gold/25">
                  <p className="text-[11px] font-semibold text-gold/90 truncate">
                    {r.tipo === 'nota' && <MessageSquareText size={10} className="inline mr-1 text-teal" />}{r.tipo === 'nota' ? r.titulo : r.ancora}
                  </p>
                  <p className="text-[11px] text-white/55 leading-relaxed line-clamp-3"><Destacado texto={r.trecho} destaques={r.destaques} /></p>
                </button>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-[1fr_280px] gap-4">
            <div className="max-h-72 overflow-y-auto pr-2 border border-white/6 rounded-lg p-2">
              {ativo ? <Sumario doc={ativo} onIr={a => abrir(ativo.id, a)} />
                : <p className="text-[11px] text-white/30 flex items-center gap-2"><Loader2 size={11} className="animate-spin" /> Montando o sumário…</p>}
            </div>
            <div className="space-y-2">
              <button type="button" onClick={() => abrir(textos[0].id)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gold/30 text-gold hover:bg-gold/10 text-xs font-semibold">
                <BookOpen size={12} /> Abrir texto completo
              </button>
              <p className="text-[9px] text-white/30 font-mono uppercase tracking-widest pt-1">Notas do laboratório</p>
              {notas.length ? notas.map(n => (
                <button key={n.id} type="button" onClick={() => abrir(n.id)}
                  className="block w-full text-left text-[11px] text-white/60 hover:text-teal truncate" title={n.pergunta || n.titulo}>
                  <MessageSquareText size={10} className="inline mr-1 text-teal/70" />{n.titulo}
                </button>
              )) : <p className="text-[11px] text-white/25 italic">Nenhuma nota sobre esta norma.</p>}
              <Link href={`/conhecimento?q=${encodeURIComponent(norma.codigo)}`} className="block text-[10px] text-white/30 hover:text-teal pt-1">
                Perguntar na Base de Conhecimento →
              </Link>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <VisualizadorDoc doc={viewer.doc} alvo={viewer.alvo} onFechar={() => setViewer(null)}
          lateral={viewer.doc.tipo === 'norma' && <Sumario doc={viewer.doc} atual={viewer.alvo} onIr={a => setViewer(v => v && { ...v, alvo: a })} />} />
      )}
    </div>
  )
}
