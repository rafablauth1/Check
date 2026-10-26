'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, BookOpen, MessageSquareText, HelpCircle, Plus, Upload, Edit2, Trash2, X, Lock, ArrowRight,
  Loader2, CheckCircle2, AlertTriangle, FileText, Sparkles, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SETTINGS_KEY } from '@/app/cispr15/types'
import { extrairTextoArquivo } from '@/lib/useOCR'
import { limparTextoNorma } from '@/lib/conhecimento/importar'
import { dividirEmTrechos } from '@/lib/conhecimento/markdown'
import type { Documento, MetaDoc, PerguntaPendente, ResultadoBusca, TipoDoc } from '@/lib/conhecimento/tipos'
import {
  listarDocs, lerDoc, criarDoc, salvarDoc, removerDoc, buscarNaBase, listarPendentes, registrarPendente,
  removerPendente, converterDocx,
} from '@/lib/conhecimento/cliente'

/* Base de Conhecimento: normas e notas do laboratório em .md, com busca local
   (sem IA, sem internet). Perguntar é livre; anexar, editar e excluir pedem a
   senha de emissão das Configurações (a rota confere de novo). */

const Label = ({ children }: { children: React.ReactNode }) =>
  <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">{children}</label>

/* ─── texto com destaques ─────────────────────────────────────────────────── */
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

/* ─── markdown mínimo (títulos, tabelas, listas, negrito) ──────────────────── */
function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') ? <strong key={i} className="text-white/90">{p.slice(2, -2)}</strong>
      : p.startsWith('`') ? <code key={i} className="font-mono text-[11px] text-teal/80">{p.slice(1, -1)}</code>
      : p.startsWith('*') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em>
      : p)
}

function MdView({ md, alvo }: { md: string; alvo?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const blocos = useMemo(() => md.replace(/\r\n/g, '\n').split(/\n{2,}/), [md])
  useEffect(() => {
    if (!alvo || !ref.current) return
    const chave = alvo.replace(/[…*]/g, '').replace(/^Tabela \d+ \(item ([\d.]+)\)$/, '$1').slice(0, 40).trim()
    const el = [...ref.current.querySelectorAll<HTMLElement>('[data-bloco]')].find(e => (e.dataset.bloco || '').includes(chave))
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('ring-1', 'ring-gold/50', 'bg-gold/5') }
  }, [alvo, blocos])
  return (
    <div ref={ref} className="space-y-3 text-[13px] leading-relaxed text-white/70">
      {blocos.map((b, i) => {
        const t = b.trim()
        if (!t) return null
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
    </div>
  )
}

/* ─── senha (a mesma da emissão) ──────────────────────────────────────────── */
function useSenha() {
  const [senhaApp, setSenhaApp] = useState<string | null>(null)
  const [liberada, setLiberada] = useState<string | null>(null)   // senha digitada e conferida
  const [pedido, setPedido] = useState<null | ((s: string) => void)>(null)
  const [entrada, setEntrada] = useState('')
  const [erro, setErro] = useState(false)
  useEffect(() => {
    const api = (window as any).electronAPI
    ;(async () => {
      let s = ''
      if (api?.getSettings) { try { s = (await api.getSettings()).senhaEmissao ?? '' } catch {} }
      else { try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) s = JSON.parse(raw).senhaEmissao ?? '' } catch {} }
      setSenhaApp(s)
    })()
  }, [])
  /** Roda a ação com a senha (pede uma vez por sessão; sem senha configurada, vai direto). */
  function comSenha(acao: (senha: string) => void) {
    if (senhaApp === '') return acao('')
    if (liberada !== null) return acao(liberada)
    setEntrada(''); setErro(false); setPedido(() => acao)
  }
  function confirmar() {
    if (entrada !== senhaApp) { setErro(true); setEntrada(''); return }
    setLiberada(entrada)
    const acao = pedido
    setPedido(null)
    acao?.(entrada)
  }
  const modal = pedido && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="card w-full max-w-sm mx-4 p-7 space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gold/12 border border-gold/25 flex items-center justify-center"><Lock size={20} className="text-gold" /></div>
          <div>
            <p className="font-bold text-white">Base de Conhecimento</p>
            <p className="text-[11px] text-white/40">Informe a senha para alterar a base</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Senha</Label>
          <input type="password" autoFocus className={cn('input', erro && 'border-red-500/50')} value={entrada} placeholder="••••••"
            onChange={e => { setEntrada(e.target.value); setErro(false) }} onKeyDown={e => { if (e.key === 'Enter') confirmar() }} />
          {erro && <p className="text-[11px] text-red-400">Senha incorreta.</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPedido(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/40 hover:text-white/70 text-sm">Cancelar</button>
          <button type="button" onClick={confirmar} className="btn-primary flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-2"><ArrowRight size={14} /> Entrar</button>
        </div>
      </div>
    </div>
  )
  return { comSenha, modal }
}

/* ─── editor de documento/nota ────────────────────────────────────────────── */
type Rascunho = Omit<Documento, 'id'> & { id?: string }

function Editor({ inicial, onSalvar, onFechar }: {
  inicial: Rascunho; onSalvar: (d: Rascunho) => Promise<void>; onFechar: () => void
}) {
  const [d, setD] = useState<Rascunho>(inicial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [previa, setPrevia] = useState(false)
  const nota = d.tipo === 'nota'
  const nTrechos = useMemo(() => dividirEmTrechos({ ...d, id: 'x' } as Documento).length, [d])
  async function salvar() {
    if (!d.titulo.trim()) { setErro('Informe o título.'); return }
    if (!d.corpo.trim()) { setErro(nota ? 'Escreva a resposta.' : 'O texto está vazio.'); return }
    setSalvando(true); setErro(null)
    try { await onSalvar(d) } catch (e) { setErro(e instanceof Error ? e.message : String(e)) } finally { setSalvando(false) }
  }
  const set = (k: keyof Rascunho) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-4xl max-h-[92vh] flex flex-col p-6 gap-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <p className="text-white font-bold text-sm">{d.id ? 'Editar' : 'Novo'} {nota ? 'nota' : 'documento'}</p>
          <button onClick={onFechar} className="text-white/30 hover:text-white/70"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label>Título</Label>
            <input className="input" value={d.titulo} onChange={set('titulo')} placeholder={nota ? 'Ex: Modo relógio no medidor de energia' : 'Ex: Portaria Inmetro 227/2022 — Bombas medidoras'} />
          </div>
          {nota ? (<>
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label>Pergunta que a nota responde</Label>
              <input className="input" value={d.pergunta ?? ''} onChange={set('pergunta')} placeholder="Ex: O que é o modo relógio?" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Fonte</Label>
              <input className="input" value={d.fonte ?? ''} onChange={set('fonte')} placeholder="Ex: Portaria 221/2022, item 2.5.2.4" />
            </div>
          </>) : (
            <div className="flex flex-col gap-1.5">
              <Label>Origem</Label>
              <input className="input" value={d.origem ?? ''} onChange={set('origem')} placeholder="Arquivo ou publicação de origem" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Palavras-chave <span className="normal-case text-white/20">(separadas por vírgula)</span></Label>
            <input className="input" value={(d.tags ?? []).join(', ')}
              onChange={e => setD(p => ({ ...p, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label>{nota ? 'Resposta' : 'Texto (markdown)'}</Label>
          <span className="text-[10px] text-white/25 font-mono">{nTrechos} trecho(s) pesquisável(is)</span>
          <button type="button" onClick={() => setPrevia(p => !p)} className="ml-auto text-[10px] text-white/40 hover:text-teal flex items-center gap-1">
            <Eye size={10} /> {previa ? 'Editar' : 'Prévia'}
          </button>
        </div>
        <div className="flex-1 min-h-[280px] overflow-y-auto">
          {previa
            ? <div className="p-3 rounded-lg border border-white/8"><MdView md={d.corpo} /></div>
            : <textarea className="input w-full h-full min-h-[280px] font-mono text-[12px] leading-relaxed resize-none" value={d.corpo} onChange={set('corpo')}
                placeholder={nota ? 'Escreva a resposta. Pode usar **negrito**, listas com "- " e tabelas.' : 'Texto da norma. Itens numerados ("2.5.2.4 …") e títulos ("## …") viram trechos pesquisáveis.'} />}
        </div>
        {!nota && (
          <p className="text-[10px] text-white/30">
            Confira o texto convertido: tabelas que eram imagem no PDF não viram texto — copie-as à mão como tabela markdown (| coluna | coluna |).
          </p>
        )}
        {erro && <p className="text-[11px] text-red-400 flex items-center gap-1.5"><AlertTriangle size={11} /> {erro}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onFechar} className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} className="btn-primary px-6 py-2 text-sm font-bold flex items-center gap-2 disabled:opacity-50">
            <CheckCircle2 size={13} /> {salvando ? 'Salvando…' : 'Salvar na base'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── página ───────────────────────────────────────────────────────────────── */
export default function ConhecimentoPage() {
  const { comSenha, modal } = useSenha()
  const [aba, setAba] = useState<'perguntar' | 'documentos' | 'pendentes'>('perguntar')
  const [docs, setDocs] = useState<MetaDoc[]>([])
  const [pendentes, setPendentes] = useState<PerguntaPendente[]>([])
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultado, setResultado] = useState<{ q: string; itens: ResultadoBusca[] } | null>(null)
  const [registrada, setRegistrada] = useState(false)
  const [viewer, setViewer] = useState<{ doc: Documento; alvo?: string } | null>(null)
  const [editor, setEditor] = useState<{ rascunho: Rascunho; aoSalvar?: () => void } | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<'' | TipoDoc>('')
  const [filtroTexto, setFiltroTexto] = useState('')
  const [importando, setImportando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null)

  async function recarregar() {
    try { setDocs(await listarDocs()); setPendentes(await listarPendentes()) }
    catch (e) { setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) }) }
  }
  useEffect(() => { recarregar() }, [])
  useEffect(() => { if (aviso?.ok) { const t = setTimeout(() => setAviso(null), 3500); return () => clearTimeout(t) } }, [aviso])

  async function perguntar(texto = q) {
    const pergunta = texto.trim()
    if (!pergunta) return
    setBuscando(true); setRegistrada(false)
    try { const r = await buscarNaBase(pergunta); setResultado({ q: pergunta, itens: r.resultados }) }
    catch (e) { setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) }) }
    finally { setBuscando(false) }
  }

  async function naoAchei() {
    if (!resultado) return
    await registrarPendente(resultado.q)
    setRegistrada(true)
    setPendentes(await listarPendentes())
  }

  async function abrir(docId: string, alvo?: string) {
    try { setViewer({ doc: await lerDoc(docId), alvo }) }
    catch (e) { setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) }) }
  }

  function novaNota(base?: Partial<Rascunho>, aoSalvar?: () => void) {
    comSenha(() => setEditor({ rascunho: { titulo: '', tipo: 'nota', corpo: '', ...base }, aoSalvar }))
  }

  function editar(m: MetaDoc) {
    comSenha(async () => { const d = await lerDoc(m.id); setEditor({ rascunho: d }) })
  }

  function excluir(m: MetaDoc) {
    if (!confirm(`Excluir "${m.titulo}" da base? (fica uma cópia de segurança na pasta)`)) return
    comSenha(async senha => {
      try { await removerDoc(m.id, senha); await recarregar(); setAviso({ ok: true, msg: 'Documento excluído.' }) }
      catch (e) { setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) }) }
    })
  }

  async function salvarEditor(d: Rascunho, senha: string) {
    const salvo = d.id ? await salvarDoc(d as Documento, senha) : await criarDoc(d, senha)
    editor?.aoSalvar?.()
    setEditor(null)
    await recarregar()
    setAviso({ ok: true, msg: `"${salvo.titulo}" salvo na base.` })
  }

  function anexar(arquivo: File) {
    comSenha(async () => {
      setImportando(arquivo.name)
      try {
        const nome = arquivo.name.toLowerCase()
        let texto: string
        if (nome.endsWith('.md')) texto = await arquivo.text()
        else if (nome.endsWith('.docx')) texto = limparTextoNorma(await converterDocx(arquivo))
        else texto = limparTextoNorma(await extrairTextoArquivo(arquivo))   // pdf, txt, imagem (OCR)
        const titulo = arquivo.name.replace(/\.[^.]+$/, '')
        setEditor({ rascunho: { titulo, tipo: 'norma', origem: arquivo.name, corpo: nome.endsWith('.md') ? texto : `# ${titulo}\n\n${texto}` } })
      } catch (e) {
        setAviso({ ok: false, msg: `Não foi possível ler ${arquivo.name}: ${e instanceof Error ? e.message : String(e)}` })
      } finally { setImportando(null) }
    })
  }

  // documentos que vêm prontos (public/conhecimento-semente) — só os que ainda não estão na base
  function carregarIniciais() {
    comSenha(async senha => {
      setImportando('documentos iniciais')
      try {
        const lista: string[] = await (await fetch('/conhecimento-semente/index.json', { cache: 'no-store' })).json()
        const { lerMd } = await import('@/lib/conhecimento/markdown')
        const existentes = new Set(docs.map(d => d.titulo))
        let n = 0
        for (const arq of lista) {
          const d = lerMd(arq.replace(/\.md$/, ''), await (await fetch('/conhecimento-semente/' + arq, { cache: 'no-store' })).text())
          if (existentes.has(d.titulo)) continue
          const { id: _id, ...sem } = d
          await criarDoc(sem, senha); n++
        }
        await recarregar()
        setAviso({ ok: true, msg: n ? `${n} documento(s) inicial(is) adicionados à base.` : 'Os documentos iniciais já estavam na base.' })
      } catch (e) { setAviso({ ok: false, msg: e instanceof Error ? e.message : String(e) }) }
      finally { setImportando(null) }
    })
  }

  // notas: só as que chegam perto da melhor resposta (uma nota que cita "medidor"
  // de passagem não deve empurrar o item certo da norma para baixo)
  const topo = resultado?.itens[0]?.score ?? 0
  const notas = (resultado?.itens.filter(r => r.tipo === 'nota' && r.score >= topo * 0.5) ?? []).slice(0, 3)
  const trechos = (resultado?.itens.filter(r => r.tipo === 'norma') ?? []).slice(0, 8)
  const docsFiltrados = docs.filter(d => (!filtroTipo || d.tipo === filtroTipo) &&
    (!filtroTexto || (d.titulo + ' ' + (d.pergunta ?? '') + ' ' + (d.tags ?? []).join(' ')).toLowerCase().includes(filtroTexto.toLowerCase())))
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-5">
        <p className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-0.5">LABELO · PUCRS</p>
        <h1 className="text-xl font-bold text-white">Base de Conhecimento</h1>
        <p className="text-white/35 text-xs mt-0.5">
          Normas e notas do laboratório. A busca roda no próprio app — quanto mais normas e notas, melhores as respostas.
        </p>
      </div>

      {aviso && (
        <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] mb-4',
          aviso.ok ? 'border-green/25 bg-green/8 text-green-400' : 'border-red-500/30 bg-red-500/8 text-red-300')}>
          {aviso.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {aviso.msg}
          <button onClick={() => setAviso(null)} className="ml-auto opacity-50 hover:opacity-100"><X size={11} /></button>
        </div>
      )}

      <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8 mb-4 w-fit">
        {([
          ['perguntar', 'Perguntar', <Search key="p" size={11} />],
          ['documentos', `Documentos (${docs.length})`, <BookOpen key="d" size={11} />],
          ['pendentes', `Sem resposta (${pendentes.length})`, <HelpCircle key="s" size={11} />],
        ] as const).map(([a, l, icon]) => (
          <button key={a} type="button" onClick={() => setAba(a)}
            className={cn('flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold transition-all',
              aba === a ? 'bg-gold/15 border border-gold/25 text-gold' : 'text-white/40 hover:text-white/70')}>
            {icon}{l}
          </button>
        ))}
      </div>

      {docs.length === 0 && (
        <div className="card p-4 mb-4 flex items-center gap-3 border-teal/20">
          <Sparkles size={16} className="text-teal shrink-0" />
          <p className="text-xs text-white/60 flex-1">
            A base está vazia. Comece pelos documentos iniciais: Portarias 221, 158, 295 e 157 e as notas sobre os ensaios de EMC.
          </p>
          <button type="button" onClick={carregarIniciais} disabled={!!importando}
            className="btn-primary px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
            {importando ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Carregar documentos iniciais
          </button>
        </div>
      )}

      {/* ── Perguntar ── */}
      {aba === 'perguntar' && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input className="input pl-9 pr-24 text-sm py-2.5" autoFocus value={q}
              placeholder="Pergunte, ex.: qual norma do ensaio de surto no medidor de energia?"
              onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') perguntar() }} />
            <button type="button" onClick={() => perguntar()} disabled={buscando || !q.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary px-3 py-1 text-xs font-bold flex items-center gap-1 disabled:opacity-40">
              {buscando ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />} Buscar
            </button>
          </div>

          {resultado && resultado.itens.length === 0 && (
            <div className="card p-6 text-center space-y-3">
              <p className="text-sm text-white/40">Nada na base sobre <strong className="text-white/60">"{resultado.q}"</strong>.</p>
              <div className="flex gap-2 justify-center">
                <button type="button" onClick={naoAchei} disabled={registrada}
                  className="px-3 py-1.5 rounded-lg border border-amber-400/30 text-amber-300 text-xs disabled:opacity-50">
                  {registrada ? 'Pergunta registrada em "Sem resposta"' : 'Registrar a pergunta para alguém responder'}
                </button>
                <button type="button" onClick={() => novaNota({ pergunta: resultado.q, titulo: resultado.q })}
                  className="px-3 py-1.5 rounded-lg border border-teal/30 text-teal text-xs">Responder agora (nova nota)</button>
              </div>
            </div>
          )}

          {notas.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-teal/70 font-mono uppercase tracking-widest flex items-center gap-1"><MessageSquareText size={10} /> Notas do laboratório</p>
              {notas.map(r => (
                <div key={r.docId} className="card p-4 border-teal/20 space-y-2">
                  <p className="text-sm font-semibold text-white">{r.titulo}</p>
                  <p className="text-[12px] text-white/60 leading-relaxed"><Destacado texto={r.trecho} destaques={r.destaques} /></p>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => abrir(r.docId)} className="text-[11px] text-teal hover:underline">Ver nota completa</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {trechos.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-white/35 font-mono uppercase tracking-widest flex items-center gap-1"><FileText size={10} /> Nas normas</p>
              {trechos.map((r, i) => (
                <div key={r.docId + r.ancora + i} className="card p-4 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-white/40 truncate">{r.titulo}</p>
                      <p className="text-xs font-semibold text-gold/90">{r.ancora}</p>
                    </div>
                  </div>
                  <p className="text-[12px] text-white/60 leading-relaxed whitespace-pre-wrap"><Destacado texto={r.trecho} destaques={r.destaques} /></p>
                  <div className="flex items-center gap-3 pt-1">
                    <button type="button" onClick={() => abrir(r.docId, r.ancora)} className="text-[11px] text-teal hover:underline">Abrir na norma</button>
                    <button type="button"
                      onClick={() => novaNota({
                        titulo: resultado!.q, pergunta: resultado!.q,
                        corpo: r.trecho.replace(/^… |\s…$/g, ''),
                        fonte: `${r.titulo.split('—')[0].trim()} — ${r.ancora}`,
                      })}
                      className="text-[11px] text-white/45 hover:text-teal">Virar nota</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {resultado && resultado.itens.length > 0 && (
            <div className="text-center">
              <button type="button" onClick={naoAchei} disabled={registrada}
                className="text-[11px] text-white/30 hover:text-amber-300 disabled:text-amber-300/70">
                {registrada ? '✓ Pergunta registrada em "Sem resposta"' : 'Não achei a resposta — registrar a pergunta'}
              </button>
            </div>
          )}

          {!resultado && (
            <div className="card p-6 text-[12px] text-white/35 space-y-1">
              <p className="text-white/50 font-semibold mb-2">Exemplos</p>
              {['qual norma do ensaio de surto no medidor de energia?', 'o que é modo relógio', 'radar fixo faz descarga eletrostática?', 'limite de transientes em energia reativa classe B']
                .map(ex => <button key={ex} type="button" onClick={() => { setQ(ex); perguntar(ex) }} className="block hover:text-teal">→ {ex}</button>)}
            </div>
          )}
        </div>
      )}

      {/* ── Documentos ── */}
      {aba === 'documentos' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8">
              {([['', 'Todos'], ['norma', 'Normas'], ['nota', 'Notas']] as const).map(([t, l]) => (
                <button key={t} type="button" onClick={() => setFiltroTipo(t)}
                  className={cn('px-2.5 py-1 rounded text-[11px] font-semibold', filtroTipo === t ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60')}>{l}</button>
              ))}
            </div>
            <input className="input py-1 text-xs max-w-[220px]" placeholder="Filtrar por título…" value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)} />
            <div className="flex-1" />
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) anexar(f); e.target.value = '' }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!importando}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal/30 bg-teal/8 text-teal hover:bg-teal/14 text-xs font-semibold disabled:opacity-50">
              {importando ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} {importando ? `Lendo ${importando}…` : 'Anexar norma'}
            </button>
            <button type="button" onClick={() => novaNota()} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"><Plus size={11} /> Nova nota</button>
          </div>
          {docs.length > 0 && (
            <div className="flex justify-end">
              <button type="button" onClick={carregarIniciais} className="text-[10px] text-white/25 hover:text-teal">Recarregar documentos iniciais que faltam</button>
            </div>
          )}
          {docsFiltrados.length === 0
            ? <div className="card p-8 text-center text-white/25 text-sm">Nenhum documento.</div>
            : (
              <div className="space-y-px">
                {docsFiltrados.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.025] border border-white/[0.07] hover:bg-white/[0.04] group">
                    {d.tipo === 'nota' ? <MessageSquareText size={13} className="text-teal/70 shrink-0" /> : <FileText size={13} className="text-gold/70 shrink-0" />}
                    <button type="button" onClick={() => abrir(d.id)} className="flex-1 min-w-0 text-left">
                      <p className="text-xs text-white/80 font-semibold truncate">{d.titulo}</p>
                      <p className="text-[10px] text-white/30 truncate">{d.tipo === 'nota' ? (d.fonte || d.pergunta) : d.origem}</p>
                    </button>
                    <span className="text-[10px] text-white/20 font-mono shrink-0">{d.atualizadoEm ? new Date(d.atualizadoEm).toLocaleDateString('pt-BR') : ''}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" title="Editar" onClick={() => editar(d)} className="w-6 h-6 rounded border border-white/8 text-white/30 hover:text-white/70 flex items-center justify-center"><Edit2 size={10} /></button>
                      <button type="button" title="Excluir" onClick={() => excluir(d)} className="w-6 h-6 rounded border border-white/8 text-white/30 hover:text-red-400 flex items-center justify-center"><Trash2 size={10} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* ── Sem resposta ── */}
      {aba === 'pendentes' && (
        <div className="space-y-2">
          <p className="text-[11px] text-white/35">Perguntas que a base não soube responder. Responda criando uma nota — na próxima vez ela aparece primeiro.</p>
          {pendentes.length === 0 && <div className="card p-8 text-center text-white/25 text-sm">Nenhuma pergunta pendente. 🎉</div>}
          {pendentes.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.025] border border-white/[0.07]">
              <HelpCircle size={13} className="text-amber-300/70 shrink-0" />
              <span className="flex-1 text-xs text-white/75">{p.pergunta}</span>
              <span className="text-[10px] text-white/30 font-mono">{p.vezes}× · {new Date(p.ultimaEm).toLocaleDateString('pt-BR')}</span>
              <button type="button"
                onClick={() => novaNota({ titulo: p.pergunta, pergunta: p.pergunta }, () => comSenha(async s => { await removerPendente(p.id, s); setPendentes(await listarPendentes()) }))}
                className="px-2.5 py-1 rounded-lg border border-teal/30 text-teal text-[11px]">Responder</button>
              <button type="button" title="Descartar"
                onClick={() => comSenha(async s => { await removerPendente(p.id, s); setPendentes(await listarPendentes()) })}
                className="text-white/25 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {/* visualizador */}
      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="card w-full max-w-4xl max-h-[92vh] flex flex-col p-6 gap-3 animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">{viewer.doc.titulo}</p>
                <p className="text-[10px] text-white/30">
                  {viewer.doc.tipo === 'nota' ? viewer.doc.fonte : viewer.doc.origem}
                  {viewer.doc.atualizadoEm && ` · atualizado em ${new Date(viewer.doc.atualizadoEm).toLocaleDateString('pt-BR')}`}
                </p>
              </div>
              <button onClick={() => setViewer(null)} className="text-white/30 hover:text-white/70"><X size={16} /></button>
            </div>
            {viewer.doc.pergunta && <p className="text-sm text-teal/90 font-semibold">{viewer.doc.pergunta}</p>}
            <div className="flex-1 overflow-y-auto pr-2"><MdView md={viewer.doc.corpo} alvo={viewer.alvo} /></div>
          </div>
        </div>
      )}

      {editor && (
        <Editor inicial={editor.rascunho} onFechar={() => setEditor(null)}
          onSalvar={d => new Promise<void>((ok, falha) => comSenha(senha => salvarEditor(d, senha).then(ok, falha)))} />
      )}
      {modal}
    </div>
  )
}
