'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Lock, Plus, Trash2, Copy, Save, Loader2, CheckCircle2, AlertTriangle, X, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SETTINGS_KEY } from '@/app/cispr15/types'
import { Icone, ICON_NAMES } from '@/lib/taxonomia/icones'
import type {
  ConfigEnsaiosEmc, TemplateEnsaio, Pergunta, Condicao, RegraEnsaio, EnsaioCatalogo, Respostas, Operador, TipoPergunta,
} from '@/lib/emc/tipos'
import { CONFIG_EMC_PADRAO } from '@/lib/emc/padrao'
import { carregarConfigEmc, salvarConfigEmc } from '@/lib/emc/cliente'
import { perguntasVisiveis, montarEnsaios, etiquetas } from '@/lib/emc/regras'
import { Label, BadgeEnsaio, ChipEtiqueta } from '@/app/agenda/emc/comum'
import { EditorCondicoes, valoresDe } from '@/app/emc/EditorCondicoes'

/* Templates de ensaio da agenda EMC: o catálogo de ensaios do laboratório e, por
   tipo de equipamento, as perguntas do cadastro e as regras "ensaio X entra
   quando…". Protegido pela senha de emissão das Configurações (conferida de novo
   na rota /api/emc/config). As amostras já cadastradas guardam a sua cópia —
   mudar aqui não altera a agenda existente. */

const novoId = (base: string) =>
  (base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item')
  + '-' + Math.random().toString(36).slice(2, 6)

const TIPOS_PERGUNTA: [TipoPergunta, string][] = [['simnao', 'Sim / Não'], ['unica', 'Escolha única'], ['multipla', 'Múltipla escolha']]

/* ─── prévia: responde as perguntas e mostra os ensaios que saem ────────────── */
function Previa({ t, catalogo }: { t: TemplateEnsaio; catalogo: EnsaioCatalogo[] }) {
  const [resp, setResp] = useState<Respostas>({})
  const visiveis = perguntasVisiveis(t, resp)
  const ensaios = montarEnsaios({ template: t, respostas: resp, modoEnsaios: 'completo', ensaios: [] }, catalogo)
  const tags = etiquetas(t, resp)
  const btn = (ativo: boolean) => cn('px-2 py-1 rounded border text-[10px] font-semibold',
    ativo ? 'border-teal/40 bg-teal/10 text-teal' : 'border-white/10 text-white/40 hover:border-white/25')
  return (
    <div className="p-3 rounded-xl border border-teal/15 bg-teal/[0.03] space-y-2">
      <p className="text-[9px] text-teal/60 font-mono uppercase tracking-wider flex items-center gap-1"><Eye size={10} /> Prévia — marque respostas de teste</p>
      {visiveis.map(p => {
        const v = resp[p.id]
        const lista = Array.isArray(v) ? v : []
        return (
          <div key={p.id} className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-white/50 min-w-[140px]">{p.texto}</span>
            {valoresDe(p).map(o => p.tipo === 'multipla' ? (
              <button key={o} type="button" className={btn(lista.includes(o))}
                onClick={() => setResp(r => ({ ...r, [p.id]: lista.includes(o) ? lista.filter(x => x !== o) : [...lista, o] }))}>{o}</button>
            ) : (
              <button key={o} type="button" className={btn(v === o)} onClick={() => setResp(r => ({ ...r, [p.id]: o }))}>
                {o === 'sim' ? 'Sim' : o === 'nao' ? 'Não' : o}
              </button>
            ))}
          </div>
        )
      })}
      <div className="flex gap-1 flex-wrap items-center">
        {ensaios.length ? ensaios.map(e => <BadgeEnsaio key={e.ensaioId} e={e} />) : <span className="text-[10px] text-white/30">Nenhum ensaio com estas respostas.</span>}
        {tags.map(x => <ChipEtiqueta key={x} texto={x} />)}
      </div>
    </div>
  )
}

/* ─── editor de um template ────────────────────────────────────────────────── */
function EditorTemplate({ t, catalogo, onChange, onRemove, onDuplicate }: {
  t: TemplateEnsaio; catalogo: EnsaioCatalogo[]
  onChange: (t: TemplateEnsaio) => void; onRemove: () => void; onDuplicate: () => void
}) {
  const [iconeAberto, setIconeAberto] = useState(false)
  const set = (parcial: Partial<TemplateEnsaio>) => onChange({ ...t, ...parcial })
  const setPergunta = (i: number, parcial: Partial<Pergunta>) =>
    set({ perguntas: t.perguntas.map((p, j) => j === i ? { ...p, ...parcial } : p) })
  const setRegra = (i: number, parcial: Partial<RegraEnsaio>) =>
    set({ regras: t.regras.map((r, j) => j === i ? { ...r, ...parcial } : r) })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[auto_1fr_1fr] gap-3 items-end">
        <div className="relative">
          <Label>Ícone</Label>
          <button type="button" onClick={() => setIconeAberto(a => !a)}
            className="mt-1.5 w-10 h-10 rounded-xl border border-teal/30 bg-teal/8 text-teal flex items-center justify-center">
            <Icone name={t.icone} size={18} />
          </button>
          {iconeAberto && (
            <div className="absolute z-40 top-full mt-1 left-0 w-[280px] p-2 rounded-xl border border-white/10 bg-[#0d1017] shadow-xl grid grid-cols-8 gap-1">
              {ICON_NAMES.map(n => (
                <button key={n} type="button" title={n} onClick={() => { set({ icone: n }); setIconeAberto(false) }}
                  className={cn('w-7 h-7 rounded flex items-center justify-center', t.icone === n ? 'bg-teal/20 text-teal' : 'text-white/50 hover:bg-white/8')}>
                  <Icone name={n} size={14} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Tipo de equipamento</Label>
          <input className="input" value={t.nome} onChange={e => set({ nome: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Portaria / norma</Label>
          <input className="input" value={t.portaria} onChange={e => set({ portaria: e.target.value })} placeholder="Portaria Inmetro …" />
        </div>
        <div className="flex flex-col gap-1.5 col-span-3">
          <Label>Observação <span className="normal-case text-white/20">(aparece no cadastro)</span></Label>
          <input className="input" value={t.observacao ?? ''} onChange={e => set({ observacao: e.target.value })} />
        </div>
      </div>

      {/* Perguntas */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Perguntas do cadastro</p>
          <button type="button" onClick={() => set({ perguntas: [...t.perguntas, { id: novoId('pergunta'), texto: '', tipo: 'simnao', mostrarEtiqueta: false }] })}
            className="text-[10px] text-white/40 hover:text-teal flex items-center gap-1"><Plus size={10} /> pergunta</button>
        </div>
        {t.perguntas.length === 0 && <p className="text-[11px] text-white/25">Sem perguntas — todos os ensaios com regra "sempre".</p>}
        {t.perguntas.map((p, i) => (
          <div key={p.id} className="p-3 rounded-xl border border-white/6 bg-white/[0.015] space-y-2">
            <div className="flex items-center gap-2">
              <input className="input flex-1 text-xs" value={p.texto} placeholder="Ex: Mede energia reativa?"
                onChange={e => setPergunta(i, { texto: e.target.value })} />
              <select className="input w-auto text-xs" value={p.tipo}
                onChange={e => setPergunta(i, { tipo: e.target.value as TipoPergunta, opcoes: e.target.value === 'simnao' ? undefined : (p.opcoes ?? []) })}>
                {TIPOS_PERGUNTA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button type="button" title="Remover pergunta" onClick={() => set({ perguntas: t.perguntas.filter((_, j) => j !== i) })}
                className="text-white/25 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
            {p.tipo !== 'simnao' && (
              <div className="flex flex-col gap-1">
                <Label>Opções <span className="normal-case text-white/20">(separadas por vírgula)</span></Label>
                <input className="input text-xs" defaultValue={(p.opcoes ?? []).join(', ')}
                  onBlur={e => setPergunta(i, { opcoes: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} />
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 text-[11px] text-white/50 cursor-pointer select-none">
                <input type="checkbox" className="accent-teal w-3.5 h-3.5" checked={!!p.mostrarEtiqueta}
                  onChange={e => setPergunta(i, { mostrarEtiqueta: e.target.checked })} />
                Mostrar como etiqueta na agenda
              </label>
              {p.mostrarEtiqueta && (
                <input className="input text-xs w-40 py-1" value={p.etiqueta ?? ''} placeholder={p.tipo === 'simnao' ? 'Ex: Reativa' : 'vazio = valor'}
                  onChange={e => setPergunta(i, { etiqueta: e.target.value })} />
              )}
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-[10px] text-white/35 font-mono uppercase tracking-wider pt-1 w-28 shrink-0">Mostrar quando</span>
              <EditorCondicoes conds={p.mostrarQuando ?? []} perguntas={t.perguntas.filter(x => x.id !== p.id)}
                vazio="sempre" onChange={c => setPergunta(i, { mostrarQuando: c.length ? c : undefined })} />
            </div>
            {p.tipo === 'simnao' && (
              <div className="flex gap-2 items-start">
                <span className="text-[10px] text-white/35 font-mono uppercase tracking-wider pt-1 w-28 shrink-0">"Sim" marca relógio em</span>
                <div className="flex gap-1 flex-wrap">
                  {catalogo.map(c => {
                    const on = (p.marcaRelogio ?? []).includes(c.id)
                    return (
                      <button key={c.id} type="button"
                        onClick={() => setPergunta(i, { marcaRelogio: on ? (p.marcaRelogio ?? []).filter(x => x !== c.id) : [...(p.marcaRelogio ?? []), c.id] })}
                        className={cn('px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold',
                          on ? 'border-purple-400/40 bg-purple-400/10 text-purple-300' : 'border-white/8 text-white/25 hover:border-white/20')}>
                        {c.codigo}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Regras */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Ensaios e quando entram</p>
          <button type="button" onClick={() => catalogo[0] && set({ regras: [...t.regras, { ensaioId: catalogo[0].id, quando: [] }] })}
            className="text-[10px] text-white/40 hover:text-teal flex items-center gap-1"><Plus size={10} /> ensaio</button>
        </div>
        <p className="text-[10px] text-white/25">Todas as condições de uma linha precisam valer (E). Para “OU”, repita o ensaio em outra linha.</p>
        {t.regras.map((r, i) => (
          <div key={i} className="flex gap-2 items-start p-2 rounded-lg border border-white/6 bg-white/[0.015]">
            <select className="input w-auto text-xs font-mono" value={r.ensaioId} onChange={e => setRegra(i, { ensaioId: e.target.value })}>
              {catalogo.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)}
              {!catalogo.some(c => c.id === r.ensaioId) && <option value={r.ensaioId}>{r.ensaioId} (fora do catálogo)</option>}
            </select>
            <div className="flex-1 pt-0.5">
              <EditorCondicoes conds={r.quando} perguntas={t.perguntas} vazio="sempre" onChange={c => setRegra(i, { quando: c })} />
            </div>
            <button type="button" onClick={() => set({ regras: t.regras.filter((_, j) => j !== i) })}
              className="text-white/25 hover:text-red-400 pt-1"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>

      <Previa key={JSON.stringify(t.perguntas)} t={t} catalogo={catalogo} />

      <div className="flex gap-2 pt-2 border-t border-white/6">
        <button type="button" onClick={onDuplicate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/45 hover:text-white/80 text-xs">
          <Copy size={11} /> Duplicar
        </button>
        <button type="button" onClick={onRemove}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400/70 hover:text-red-400 text-xs">
          <Trash2 size={11} /> Excluir template
        </button>
      </div>
    </div>
  )
}

/* ─── página ───────────────────────────────────────────────────────────────── */
export default function TemplatesEmcPage() {
  const router = useRouter()
  const [cfg,        setCfg]        = useState<ConfigEnsaiosEmc>(CONFIG_EMC_PADRAO)
  const [original,   setOriginal]   = useState('')
  const [aba,        setAba]        = useState<'templates' | 'catalogo'>('templates')
  const [selId,      setSelId]      = useState('')
  const [carregando, setCarregando] = useState(true)
  const [corrompido, setCorrompido] = useState(false)
  const [status,     setStatus]     = useState<{ kind: 'idle' | 'saving' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' })
  // senha: a mesma "Senha de acesso à emissão" das Configurações
  const [senhaApp,   setSenhaApp]   = useState<string | null>(null)
  const [liberado,   setLiberado]   = useState(false)
  const [gateInput,  setGateInput]  = useState('')
  const [gateError,  setGateError]  = useState(false)
  const senhaUsada = useRef('')

  useEffect(() => {
    const api = (window as any).electronAPI
    ;(async () => {
      let senha = ''
      if (api?.getSettings) { try { const s = await api.getSettings(); senha = s.senhaEmissao ?? '' } catch {} }
      else { try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) senha = JSON.parse(raw).senhaEmissao ?? '' } catch {} }
      setSenhaApp(senha)
      if (!senha) setLiberado(true)
    })()
    carregarConfigEmc()
      .then(c => {
        const limpo = { catalogo: c.catalogo, templates: c.templates }
        setCfg(limpo); setOriginal(JSON.stringify(limpo)); setCorrompido(!!c.corrompido)
        setSelId(c.templates[0]?.id ?? '')
      })
      .catch(e => setStatus({ kind: 'error', msg: String(e instanceof Error ? e.message : e) }))
      .finally(() => setCarregando(false))
  }, [])

  const alterado = JSON.stringify(cfg) !== original
  const sel = cfg.templates.find(t => t.id === selId)
  const usoPorEnsaio = useMemo(() => {
    const m = new Map<string, number>()
    cfg.templates.forEach(t => new Set(t.regras.map(r => r.ensaioId)).forEach(id => m.set(id, (m.get(id) ?? 0) + 1)))
    return m
  }, [cfg])

  function entrar() {
    if (gateInput === senhaApp) { senhaUsada.current = gateInput; setLiberado(true); setGateInput('') }
    else { setGateError(true); setGateInput('') }
  }

  async function salvar() {
    setStatus({ kind: 'saving' })
    try {
      const salvo = await salvarConfigEmc(cfg, senhaUsada.current)
      const limpo = { catalogo: salvo.catalogo, templates: salvo.templates }
      setCfg(limpo); setOriginal(JSON.stringify(limpo))
      setStatus({ kind: 'ok', msg: 'Templates salvos na rede.' })
      setTimeout(() => setStatus({ kind: 'idle' }), 3000)
    } catch (e) { setStatus({ kind: 'error', msg: e instanceof Error ? e.message : String(e) }) }
  }

  function setTemplate(t: TemplateEnsaio) { setCfg(c => ({ ...c, templates: c.templates.map(x => x.id === t.id ? t : x) })) }
  function novoTemplate() {
    const t: TemplateEnsaio = { id: novoId('tipo'), nome: 'Novo tipo', icone: 'Gauge', portaria: '', perguntas: [], regras: [] }
    setCfg(c => ({ ...c, templates: [...c.templates, t] })); setSelId(t.id)
  }
  function duplicar(t: TemplateEnsaio) {
    const copia = { ...JSON.parse(JSON.stringify(t)), id: novoId(t.nome), nome: t.nome + ' (cópia)' }
    setCfg(c => ({ ...c, templates: [...c.templates, copia] })); setSelId(copia.id)
  }
  function remover(t: TemplateEnsaio) {
    if (!confirm(`Excluir o template "${t.nome}"? As amostras já cadastradas mantêm a cópia delas.`)) return
    setCfg(c => ({ ...c, templates: c.templates.filter(x => x.id !== t.id) }))
    setSelId(cfg.templates.find(x => x.id !== t.id)?.id ?? '')
  }
  function setEnsaio(i: number, parcial: Partial<EnsaioCatalogo>) {
    setCfg(c => ({ ...c, catalogo: c.catalogo.map((e, j) => j === i ? { ...e, ...parcial } : e) }))
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => {
          if (alterado && !confirm('Há alterações não salvas. Sair mesmo assim?')) return
          router.push('/agenda')
        }} className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm transition-colors">
          <ArrowLeft size={14} /> Agenda
        </button>
        <div className="flex-1" />
        {status.kind === 'ok' && <span className="text-[11px] text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> {status.msg}</span>}
        {status.kind === 'error' && <span className="text-[11px] text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> {status.msg}</span>}
        <button type="button" onClick={salvar} disabled={!alterado || status.kind === 'saving' || corrompido || !liberado}
          className="btn-primary px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
          {status.kind === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
        </button>
      </div>

      <div className="mb-5">
        <p className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-0.5">Agenda EMC</p>
        <h1 className="text-xl font-bold text-white">Templates de ensaio</h1>
        <p className="text-white/35 text-xs mt-0.5">
          Quais ensaios cada tipo de equipamento faz. Amostras já cadastradas guardam a sua cópia — mudar aqui não altera a agenda.
        </p>
      </div>

      {corrompido && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/8 text-red-300 text-[11px] mb-4">
          <AlertTriangle size={12} /> O arquivo de templates na rede não pôde ser lido. Salvar está bloqueado para não sobrescrevê-lo.
        </div>
      )}

      <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8 mb-4 w-fit">
        {([['templates', 'Tipos de equipamento'], ['catalogo', 'Catálogo de ensaios']] as const).map(([a, l]) => (
          <button key={a} type="button" onClick={() => setAba(a)}
            className={cn('px-4 py-1.5 rounded text-xs font-semibold transition-all',
              aba === a ? 'bg-gold/15 border border-gold/25 text-gold' : 'text-white/40 hover:text-white/70')}>{l}</button>
        ))}
      </div>

      {carregando ? (
        <div className="card p-8 text-center text-white/30 text-sm flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
      ) : aba === 'templates' ? (
        <div className="grid grid-cols-[220px_1fr] gap-4">
          <div className="space-y-1">
            {cfg.templates.map(t => (
              <button key={t.id} type="button" onClick={() => setSelId(t.id)}
                className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all',
                  selId === t.id ? 'border-teal/35 bg-teal/8 text-teal' : 'border-white/6 text-white/55 hover:border-white/15')}>
                <Icone name={t.icone} size={14} className="shrink-0" />
                <span className="text-xs font-semibold truncate">{t.nome || '(sem nome)'}</span>
              </button>
            ))}
            <button type="button" onClick={novoTemplate}
              className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-white/12 text-white/35 hover:text-teal hover:border-teal/30 text-xs">
              <Plus size={11} /> Novo tipo
            </button>
          </div>
          <div className="card p-5">
            {sel
              ? <EditorTemplate key={sel.id} t={sel} catalogo={cfg.catalogo} onChange={setTemplate} onRemove={() => remover(sel)} onDuplicate={() => duplicar(sel)} />
              : <p className="text-sm text-white/30">Selecione ou crie um tipo de equipamento.</p>}
          </div>
        </div>
      ) : (
        <div className="card p-5 space-y-2">
          <div className="grid grid-cols-[90px_1fr_200px_60px_24px] gap-2 text-[10px] text-white/30 font-mono uppercase tracking-widest">
            <span>Código</span><span>Nome</span><span>Norma</span><span>Uso</span><span />
          </div>
          {cfg.catalogo.map((e, i) => (
            <div key={e.id} className="grid grid-cols-[90px_1fr_200px_60px_24px] gap-2 items-center">
              <input className="input text-xs font-mono font-bold" value={e.codigo} onChange={ev => setEnsaio(i, { codigo: ev.target.value })} />
              <input className="input text-xs" value={e.nome} onChange={ev => setEnsaio(i, { nome: ev.target.value })} />
              <input className="input text-xs" value={e.norma} onChange={ev => setEnsaio(i, { norma: ev.target.value })} />
              <span className="text-[10px] text-white/30 font-mono">{usoPorEnsaio.get(e.id) ?? 0} tipo(s)</span>
              <button type="button" title="Remover do catálogo"
                onClick={() => {
                  const uso = usoPorEnsaio.get(e.id) ?? 0
                  if (uso && !confirm(`"${e.codigo}" é usado em ${uso} template(s). Remover mesmo assim?`)) return
                  setCfg(c => ({ ...c, catalogo: c.catalogo.filter(x => x.id !== e.id) }))
                }}
                className="text-white/25 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          ))}
          <button type="button"
            onClick={() => setCfg(c => ({ ...c, catalogo: [...c.catalogo, { id: novoId('ensaio'), codigo: '', nome: '', norma: '' }] }))}
            className="text-[11px] text-white/40 hover:text-teal flex items-center gap-1 pt-1"><Plus size={10} /> Novo ensaio</button>
        </div>
      )}

      {/* ── Gate de senha (mesma senha da emissão) ── */}
      {!liberado && senhaApp !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-sm mx-4 p-7 space-y-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gold/12 border border-gold/25 flex items-center justify-center">
                <Lock size={20} className="text-gold" />
              </div>
              <div>
                <p className="font-bold text-white">Templates de ensaio</p>
                <p className="text-[11px] text-white/40">Informe a senha para editar</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">Senha</label>
              <input type="password" className={cn('input', gateError && 'border-red-500/50')} placeholder="••••••"
                value={gateInput} autoFocus
                onChange={e => { setGateInput(e.target.value); setGateError(false) }}
                onKeyDown={e => { if (e.key === 'Enter') entrar() }} />
              {gateError && <p className="text-[11px] text-red-400">Senha incorreta.</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => router.push('/agenda')}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">Voltar</button>
              <button type="button" onClick={entrar}
                className="btn-primary flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
                <ArrowRight size={14} /> Entrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
