'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Documento } from '@/lib/conhecimento/tipos'
import { sumarioDoDoc } from '@/lib/normas/vinculo'

/* Leitura de um documento da Base de Conhecimento (norma ou nota). Usado na
   própria Base e na tela de Normas, que abre o texto da norma sem sair dela. */

/* ─── markdown mínimo (títulos, tabelas, listas, negrito) ──────────────────── */
function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') ? <strong key={i} className="text-white/90">{p.slice(2, -2)}</strong>
      : p.startsWith('`') ? <code key={i} className="font-mono text-[11px] text-teal/80">{p.slice(1, -1)}</code>
      : p.startsWith('*') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em>
      : p)
}

/** "img/<doc>/<arquivo>.png" (relativo à pasta da Base) → rota que entrega a imagem. */
const srcImagem = (s: string) => s.startsWith('img/') ? `/api/conhecimento/imagem/${s.slice(4)}` : s

export function MdView({ md, alvo }: { md: string; alvo?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ampliada, setAmpliada] = useState<{ src: string; legenda: string } | null>(null)
  const blocos = useMemo(() => md.replace(/\r\n/g, '\n').split(/\n{2,}/), [md])
  // figuras acima do ponto carregam depois do pulo e empurram o texto: nos primeiros
  // segundos, cada imagem que termina de carregar recentraliza no alvo
  const pulo = useRef<{ el: HTMLElement; quando: number } | null>(null)
  const aoCarregarImagem = () => {
    if (pulo.current && Date.now() - pulo.current.quando < 3000) pulo.current.el.scrollIntoView({ block: 'center' })
  }
  useEffect(() => {
    if (!alvo || !ref.current) return
    const chave = alvo.replace(/[…*]/g, '').replace(/^Tabela \d+ \(item ([\d.]+)\)$/, '$1').slice(0, 40).trim()
    ref.current.querySelectorAll('.ring-gold\\/50').forEach(e => e.classList.remove('ring-1', 'ring-gold/50', 'bg-gold/5'))
    // o bloco que COMEÇA com a âncora (a legenda "Table 1 – …") vence o que só a cita ("see Table 1")
    const blocosEl = [...ref.current.querySelectorAll<HTMLElement>('[data-bloco]')]
    const el = blocosEl.find(e => (e.dataset.bloco || '').replace(/^\*\*/, '').startsWith(chave))
      ?? blocosEl.find(e => (e.dataset.bloco || '').includes(chave))
    if (el) {
      el.scrollIntoView({ block: 'center' }); el.classList.add('ring-1', 'ring-gold/50', 'bg-gold/5')
      pulo.current = { el, quando: Date.now() }
    }
  }, [alvo, blocos])
  return (
    <div ref={ref} className="space-y-3 text-[13px] leading-relaxed text-white/70">
      {blocos.map((b, i) => {
        const t = b.trim()
        if (!t) return null
        // figura/tabela recortada da norma: ![legenda](img/<doc>/<arquivo>.png)
        const img = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
        if (img) {
          const src = srcImagem(img[2])
          return (
            <figure key={i} data-bloco={img[1]} className="rounded py-1">
              <button type="button" onClick={() => setAmpliada({ src, legenda: img[1] })} title="Ampliar"
                className="block w-full bg-white rounded-lg overflow-hidden border border-white/10 hover:border-gold/40 cursor-zoom-in">
                <img src={src} alt={img[1]} loading="lazy" onLoad={aoCarregarImagem} className="w-full h-auto max-h-[70vh] object-contain" />
              </button>
              <figcaption className="text-[10px] text-white/35 mt-1 text-center">{img[1]}</figcaption>
            </figure>
          )
        }
        const h = t.match(/^(#{1,6})\s+(.+)$/)
        if (h) {
          const cls = h[1].length <= 1 ? 'text-lg' : h[1].length === 2 ? 'text-base' : 'text-sm'
          return <p key={i} data-bloco={h[2]} className={cn('font-bold text-white pt-2 rounded', cls)}>{inline(h[2])}</p>
        }
        const linhas = t.split('\n')
        if (linhas.every(l => l.trim().startsWith('|'))) {
          const cel = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
          const corpo = linhas.filter((_, k) => k !== 1)
          return (
            <div key={i} data-bloco={t.slice(0, 200)} className="overflow-x-auto rounded">
              <table className="w-full text-[11px] border border-white/10">
                <tbody>
                  {corpo.map((l, k) => (
                    <tr key={k} className={k === 0 ? 'bg-white/8 font-semibold text-white/80' : 'border-t border-white/6'}>
                      {cel(l).map((c, m) => <td key={m} className="px-2 py-1 align-top">{inline(c)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (linhas.every(l => /^\s*[-•]\s/.test(l))) {
          return <ul key={i} data-bloco={t.slice(0, 200)} className="list-disc pl-5 space-y-1 rounded">{linhas.map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-•]\s/, ''))}</li>)}</ul>
        }
        return <p key={i} data-bloco={t.slice(0, 200)} className="whitespace-pre-wrap rounded">{inline(t)}</p>
      })}
      {ampliada && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 cursor-zoom-out"
          onClick={e => { e.stopPropagation(); setAmpliada(null) }}>
          <img src={ampliada.src} alt={ampliada.legenda} className="max-w-full max-h-[88vh] object-contain bg-white rounded-lg" />
          <p className="text-xs text-white/60 mt-3">{ampliada.legenda}</p>
        </div>
      )}
    </div>
  )
}

/** Janela de leitura. `cabecalho` entra ao lado do título (ex.: link para a norma no cadastro). */
export function VisualizadorDoc({ doc, alvo, onFechar, cabecalho, lateral }: {
  doc: Documento
  alvo?: string
  onFechar: () => void
  cabecalho?: React.ReactNode
  /** Coluna à esquerda (ex.: sumário da norma). */
  lateral?: React.ReactNode
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div className={cn('card !bg-[var(--bg2,#111620)] shadow-2xl shadow-black/60 w-full max-h-[92vh] flex flex-col p-6 gap-3 animate-fade-in',
        lateral ? 'max-w-6xl' : 'max-w-4xl')} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">{doc.titulo}</p>
            <p className="text-[10px] text-white/30">
              {doc.tipo === 'nota' ? doc.fonte : doc.origem}
              {doc.atualizadoEm && ` · atualizado em ${new Date(doc.atualizadoEm).toLocaleDateString('pt-BR')}`}
            </p>
          </div>
          {cabecalho}
          <button type="button" onClick={onFechar} className="text-white/30 hover:text-white/70"><X size={16} /></button>
        </div>
        {doc.pergunta && <p className="text-sm text-teal/90 font-semibold">{doc.pergunta}</p>}
        <div className="flex-1 min-h-0 flex gap-4">
          {lateral && <div className="w-64 shrink-0 overflow-y-auto pr-2 border-r border-white/8">{lateral}</div>}
          <div className="flex-1 overflow-y-auto pr-2"><MdView md={doc.corpo} alvo={alvo} /></div>
        </div>
      </div>
    </div>
  )
}

/* ─── sumário da norma (cláusulas e anexos; clique leva ao ponto do texto) ── */
export function Sumario({ doc, onIr, atual }: { doc: Documento; onIr: (ancora: string) => void; atual?: string }) {
  const itens = useMemo(() => sumarioDoDoc(doc), [doc])
  if (!itens.length) return <p className="text-[11px] text-white/25 italic">Sem sumário (o texto não tem itens numerados).</p>
  return (
    <div className="space-y-px">
      <p className="text-[9px] text-white/30 font-mono uppercase tracking-widest mb-1.5">Sumário</p>
      {itens.map((it, i) => (
        <button key={i} type="button" onClick={() => onIr(it.ancora)} title={it.titulo}
          className={cn('block w-full text-left truncate rounded px-1.5 py-0.5 text-[11px] hover:bg-white/5 hover:text-gold',
            it.nivel === 0 ? 'mt-2 text-teal/80 font-mono text-[10px] uppercase tracking-wider'
              : it.nivel === 1 ? 'text-white/70 font-semibold' : 'pl-4 text-white/45',
            atual === it.ancora && 'bg-gold/10 text-gold')}>
          {it.titulo}
        </button>
      ))}
    </div>
  )
}
