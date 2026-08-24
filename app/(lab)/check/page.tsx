'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Download, X, Trash2, Pencil, Paperclip, Send, FileText, FileSpreadsheet, Image as ImageIcon,
  Play, ArrowUpRight, GitBranch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  STATUS, PRIO, TIPO, TESTE, CORES_AREA, boardPadrao,
  type BoardCheck, type Tarefa, type StatusTarefa, type StatusTeste, type PrioTarefa, type TipoTarefa, type AnexoTarefa,
} from '@/lib/check/tipos'

const COLS: { st: StatusTarefa; label: string }[] = [
  { st: 'todo', label: 'A fazer' },
  { st: 'doing', label: 'Em andamento' },
  { st: 'done', label: 'Concluído' },
]
const MAX_FILE = 4 * 1024 * 1024

// Área da demanda → rota da tela correspondente (pra "Revisar"). Áreas criadas
// pelo usuário (fora das padrão) não têm rota conhecida — o botão some.
const ROTA_POR_AREA: Record<string, string> = {
  'Instruções de Trabalho': '/procedimentos/instrucoes',
  'Certificados': '/certificados',
  'Grupos': '/equipamentos/grupos',
  'Equipamentos': '/equipamentos',
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const now = () =>
  new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function fmtSize(b: number) {
  return b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB'
}
function FileIcon({ name, type }: { name: string; type: string }) {
  const n = (name || '').toLowerCase()
  if (n.endsWith('.pdf') || type.includes('pdf')) return <FileText size={15} className="text-red-400" />
  if (/\.(xls|xlsx|csv)$/.test(n) || type.includes('sheet') || type.includes('excel') || type.includes('csv'))
    return <FileSpreadsheet size={15} className="text-emerald-400" />
  if (type.startsWith('image/')) return <ImageIcon size={15} className="text-sky-400" />
  return <Paperclip size={15} className="text-white/50" />
}
function readFile(file: File): Promise<AnexoTarefa | null> {
  return new Promise((res) => {
    if (file.size > MAX_FILE) { res(null); return }
    const r = new FileReader()
    r.onload = () => res({ fid: uid(), name: file.name, type: file.type, size: file.size, dataURL: String(r.result) })
    r.onerror = () => res(null)
    r.readAsDataURL(file)
  })
}

interface FormState {
  title: string; desc: string; cat: string; type: TipoTarefa; prio: PrioTarefa; status: StatusTarefa; files: AnexoTarefa[]
}
const FORM_VAZIO: FormState = { title: '', desc: '', cat: 'Geral', type: 'feature', prio: 'media', status: 'todo', files: [] }

export default function CheckPage() {
  const router = useRouter()
  const [board, setBoard] = useState<BoardCheck>({ tarefas: [], categorias: {} })
  const [carregando, setCarregando] = useState(true)
  const [filterCat, setFilterCat] = useState<string>('all')
  const [busca, setBusca] = useState('')
  const [toast, setToast] = useState('')
  const [drag, setDrag] = useState<{ id: string | null; over: StatusTarefa | null }>({ id: null, over: null })

  // modais
  const [form, setForm] = useState<FormState | null>(null) // null = fechado
  const [editId, setEditId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [novaArea, setNovaArea] = useState<{ nome: string; cor: string } | null>(null)
  const [nota, setNota] = useState('')
  const [gitModal, setGitModal] = useState<{ msg: string; enviando: boolean } | null>(null)

  const formFileRef = useRef<HTMLInputElement>(null)
  const detailFileRef = useRef<HTMLInputElement>(null)
  const toastT = useRef<ReturnType<typeof setTimeout>>()
  const busyRef = useRef(false) // true enquanto edita/arrasta → pausa o refresh ao vivo

  const { tarefas, categorias } = board

  // ── carga inicial ──
  useEffect(() => {
    fetch('/api/check')
      .then((r) => r.json())
      .then((b: BoardCheck) => setBoard(b?.tarefas ? b : boardPadrao()))
      .catch(() => setBoard(boardPadrao()))
      .finally(() => setCarregando(false))
  }, [])

  // ── refresh ao vivo ──
  // Recarrega o board a cada 4s para refletir progresso escrito por fora
  // (ex.: eu implementando demandas do DEMANDAS.md via /api/check/progress).
  // Pausa enquanto o usuário edita/arrasta para não atropelar a interação.
  useEffect(() => {
    const iv = setInterval(async () => {
      if (busyRef.current) return
      try {
        const r = await fetch('/api/check', { cache: 'no-store' })
        if (!r.ok) return
        const b: BoardCheck = await r.json()
        setBoard((prev) => (JSON.stringify(prev) === JSON.stringify(b) ? prev : b))
      } catch { /* offline momentâneo */ }
    }, 4000)
    return () => clearInterval(iv)
  }, [])

  const flash = useCallback((m: string) => {
    setToast(m)
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), 2000)
  }, [])

  // grava no servidor e atualiza estado
  const persist = useCallback((next: BoardCheck, msg?: string) => {
    setBoard(next)
    fetch('/api/check', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
    })
      .then((r) => { if (r.ok && msg) flash(msg); else if (!r.ok) flash('Erro ao salvar') })
      .catch(() => flash('Erro ao salvar'))
  }, [flash])

  const setTarefas = (fn: (t: Tarefa[]) => Tarefa[], msg?: string) =>
    persist({ ...board, tarefas: fn(tarefas) }, msg)

  // ── derivados ──
  const total = tarefas.length
  const done = tarefas.filter((t) => t.status === 'done').length
  const doing = tarefas.filter((t) => t.status === 'doing').length
  const todo = total - done - doing
  const pct = total ? Math.round((done / total) * 100) : 0

  const matches = (t: Tarefa) => {
    if (filterCat !== 'all' && t.cat !== filterCat) return false
    if (busca) {
      const s = busca.toLowerCase()
      return (t.title + ' ' + t.desc + ' ' + t.cat).toLowerCase().includes(s)
    }
    return true
  }
  const catCount: Record<string, number> = {}
  tarefas.forEach((t) => { catCount[t.cat] = (catCount[t.cat] || 0) + 1 })

  // ── ações tarefa ──
  function salvarForm() {
    if (!form) return
    const title = form.title.trim()
    if (!title) { flash('Dá um título pra demanda'); return }
    const dados = { title, desc: form.desc.trim(), cat: form.cat, type: form.type, prio: form.prio, status: form.status, files: form.files }
    if (editId) {
      setTarefas((ts) => ts.map((t) => {
        if (t.id !== editId) return t
        const mudouStatus = t.status !== dados.status
        const log = [{ when: now(), what: 'Demanda editada.' }, ...t.log]
        if (mudouStatus) log.unshift({ when: now(), what: `Status → ${STATUS[dados.status].l}.` })
        return { ...t, ...dados, log }
      }), 'Demanda salva ✓')
    } else {
      const nova: Tarefa = {
        id: uid(), created: now(), ...dados,
        log: [{ when: now(), what: dados.files.length ? `Demanda criada com ${dados.files.length} anexo(s).` : 'Demanda criada.' }],
      }
      setTarefas((ts) => [nova, ...ts], 'Demanda criada ✓')
    }
    setForm(null); setEditId(null)
  }

  function mudarStatus(id: string, st: StatusTarefa) {
    setTarefas((ts) => ts.map((t) =>
      t.id === id && t.status !== st
        ? { ...t, status: st, log: [{ when: now(), what: `Status → ${STATUS[st].l}.` }, ...t.log] }
        : t))
  }
  // Marca o ciclo de validação. Clicar no marcador já ativo o limpa (volta a sem teste).
  function marcarTeste(id: string, tt: StatusTeste) {
    setTarefas((ts) => ts.map((t) => {
      if (t.id !== id) return t
      const novo = t.teste === tt ? undefined : tt
      const what = novo ? `${TESTE[novo].emoji} Teste → ${TESTE[novo].l}.` : 'Marcador de teste removido.'
      return { ...t, teste: novo, log: [{ when: now(), what }, ...t.log] }
    }), 'Validação atualizada ✓')
  }
  function excluir(id: string) {
    if (!confirm('Excluir esta demanda? Não dá pra desfazer.')) return
    setTarefas((ts) => ts.filter((t) => t.id !== id), 'Demanda excluída')
    setDetailId(null)
  }
  function addNota(id: string) {
    const v = nota.trim(); if (!v) return
    setTarefas((ts) => ts.map((t) => t.id === id ? { ...t, log: [{ when: now(), what: v }, ...t.log] } : t), 'Anotado ✓')
    setNota('')
  }

  // Abre um terminal novo (visível) já rodando o Claude Code com a demanda como
  // prompt — só disponível no app (Electron) em modo desenvolvimento. A demanda
  // é instruída a reportar o progresso de volta via /api/check/progress, o mesmo
  // endpoint que o refresh "ao vivo" já escuta.
  async function executarNoClaude(t: Tarefa) {
    const api = (window as unknown as { electronAPI?: { executarTarefaClaude?: (p: string, ti: string) => Promise<{ ok: boolean; error?: string }> } }).electronAPI
    if (!api?.executarTarefaClaude) { flash('Disponível só no app, em modo desenvolvimento.'); return }
    const origem = window.location.origin
    const prompt = `Demanda do gerenciador de tarefas do app (Check) — id ${t.id}.

Título: ${t.title}
Área: ${t.cat} · Tipo: ${TIPO[t.type]} · Prioridade: ${PRIO[t.prio]}

Descrição:
${t.desc || '(sem descrição)'}

Ao COMEÇAR a trabalhar nesta demanda, registre o início:
POST ${origem}/api/check/progress   body: {"id":"${t.id}","status":"doing"}

Ao TERMINAR (ou se não der pra concluir), registre o resultado:
POST ${origem}/api/check/progress   body: {"id":"${t.id}","status":"done","note":"<resumo do que foi feito>"}
Se dar erro, poste com "level":"error" e não mude o status.`
    const r = await api.executarTarefaClaude(prompt, t.title)
    if (r?.ok) {
      // status + anotação num único update (evita ler estado desatualizado
      // entre duas chamadas separadas de setTarefas).
      setTarefas((ts) => ts.map((x) => {
        if (x.id !== t.id) return x
        const log = [{ when: now(), what: '▶ Aba aberta no Claude Code (VSCode) — aguardando envio.' }, ...x.log]
        if (x.status !== 'doing') log.unshift({ when: now(), what: `Status → ${STATUS.doing.l}.` })
        return { ...x, status: 'doing', log }
      }), 'Aba aberta no VSCode — confira o prompt e aperte Enter pra enviar ✓')
    } else flash(r?.error || 'Falha ao iniciar')
  }

  // ── Git ──
  function abrirGit() {
    setGitModal({ msg: `Check: atualização ${now()}`, enviando: false })
  }
  async function enviarGit() {
    if (!gitModal) return
    const api = (window as unknown as {
      electronAPI?: { gitPush?: (message: string) => Promise<{ ok: boolean; error?: string; committed?: boolean; output?: string }> }
    }).electronAPI
    if (!api?.gitPush) { flash('Disponível só no app, em modo desenvolvimento.'); return }
    setGitModal({ ...gitModal, enviando: true })
    const r = await api.gitPush(gitModal.msg)
    setGitModal(null)
    if (r?.ok) flash(r.committed ? 'Alterações enviadas pro Git ✓' : 'Já estava tudo enviado ✓')
    else flash(r?.error || 'Falha ao subir pro Git')
  }

  // ── anexos ──
  async function anexarNoForm(files: FileList | null) {
    if (!files || !form) return
    const novos: AnexoTarefa[] = []
    for (const f of Array.from(files)) {
      const m = await readFile(f)
      if (m) novos.push(m); else flash(`"${f.name}" passou de 4 MB`)
    }
    setForm({ ...form, files: [...form.files, ...novos] })
  }
  async function anexarNoDetalhe(id: string, files: FileList | null) {
    if (!files) return
    const novos: AnexoTarefa[] = []
    for (const f of Array.from(files)) {
      const m = await readFile(f)
      if (m) novos.push(m); else flash(`"${f.name}" passou de 4 MB`)
    }
    if (!novos.length) return
    setTarefas((ts) => ts.map((t) => t.id === id
      ? { ...t, files: [...t.files, ...novos], log: [...novos.map((n) => ({ when: now(), what: `Anexou: ${n.name}` })), ...t.log] }
      : t), novos.length > 1 ? `${novos.length} anexos salvos ✓` : 'Anexo salvo ✓')
  }
  function removerAnexoDetalhe(id: string, fid: string) {
    if (!confirm('Remover este anexo?')) return
    setTarefas((ts) => ts.map((t) => t.id === id
      ? { ...t, files: t.files.filter((f) => f.fid !== fid), log: [{ when: now(), what: 'Removeu um anexo.' }, ...t.log] }
      : t))
  }
  function baixarAnexo(a: AnexoTarefa) {
    const link = document.createElement('a'); link.href = a.dataURL; link.download = a.name; link.click()
  }

  // ── áreas ──
  function criarArea() {
    if (!novaArea) return
    const nome = novaArea.nome.trim()
    if (!nome) { flash('Dá um nome pra área'); return }
    if (categorias[nome]) { flash('Já existe uma área com esse nome'); return }
    persist({ ...board, categorias: { ...categorias, [nome]: novaArea.cor } }, 'Área criada ✓')
    setFilterCat(nome); setNovaArea(null)
  }

  // ── exportar DEMANDAS.md ──
  async function exportar() {
    let md = `# Check — Demandas\nrafablauth1/Check · gerado ${now()}\n\n`
    Object.keys(categorias).forEach((c) => {
      const its = tarefas.filter((t) => t.cat === c)
      if (!its.length) return
      md += `## ${c}\n`
      its.forEach((t) => {
        const mark = t.status === 'done' ? 'x' : ' '
        const tst = t.teste ? ` · ${TESTE[t.teste].emoji} ${TESTE[t.teste].l}` : ''
        md += `- [${mark}] **${t.title}** _(${PRIO[t.prio]} · ${TIPO[t.type]} · ${STATUS[t.status].l}${tst})_\n`
        if (t.desc) md += `  - ${t.desc.replace(/\n/g, ' ')}\n`
      })
      md += '\n'
    })
    let gravou = false
    try {
      const r = await fetch('/api/check-export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: md }),
      })
      gravou = r.ok
    } catch { /* só baixa */ }
    const blob = new Blob([md], { type: 'text/markdown' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'check-demandas.md'; a.click()
    flash(gravou ? 'DEMANDAS.md gravado na raiz ✓' : 'Markdown baixado ✓')
  }

  // ── abrir modais ──
  function abrirNova() {
    setEditId(null)
    setForm({ ...FORM_VAZIO, cat: filterCat !== 'all' ? filterCat : 'Geral', files: [] })
  }
  function abrirEdicao(t: Tarefa) {
    setEditId(t.id)
    setForm({ title: t.title, desc: t.desc, cat: t.cat, type: t.type, prio: t.prio, status: t.status, files: [...t.files] })
    setDetailId(null)
  }
  function abrirNovaArea() {
    const usada = new Set(Object.values(categorias))
    setNovaArea({ nome: '', cor: CORES_AREA.find((c) => !usada.has(c)) || CORES_AREA[0] })
  }

  const detalhe = detailId ? tarefas.find((t) => t.id === detailId) : null
  const prioBadge = (p: PrioTarefa) => p === 'alta' ? 'badge-danger' : p === 'media' ? 'badge-warning' : 'badge'
  const temErro = (t: Tarefa) => t.log?.[0]?.what?.startsWith('⚠️')

  // pausa o refresh ao vivo enquanto há modal aberto ou arraste em curso
  busyRef.current = !!form || !!detailId || !!novaArea || !!gitModal || drag.id != null

  return (
    <div className="pb-20">
      {/* HEADER */}
      <header className="card-accent p-5 mb-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              Check · Gerenciador de Demandas
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-normal text-teal/80">
                <span className="w-1.5 h-1.5 rounded-full bg-teal pulse-dot" /> ao vivo
              </span>
            </h1>
            <p className="text-[11px] text-white/35 font-mono mt-0.5">fila interna do projeto · exporta DEMANDAS.md · atualiza sozinho</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="badge bg-white/5 border border-white/10 text-white/70"><b className="text-gold mr-1">{todo}</b> a fazer</span>
            <span className="badge bg-white/5 border border-white/10 text-white/70"><b className="text-gold mr-1">{doing}</b> em andamento</span>
            <span className="badge bg-white/5 border border-white/10 text-white/70"><b className="text-gold mr-1">{done}</b> concluídas</span>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
            <span className="block h-full rounded-full transition-[width] duration-500"
              style={{ width: pct + '%', background: 'linear-gradient(90deg,#22D3C8,#E8B94B)' }} />
          </div>
          <p className="text-[11px] text-white/40 mt-1.5">{done} de {total} concluídas · {pct}% do projeto</p>
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="flex gap-2 flex-wrap items-center mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input className="input pl-9" placeholder="Buscar demanda…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <button className="btn-secondary" onClick={exportar}><Download size={15} /> Exportar</button>
        <button className="btn-secondary" onClick={abrirGit}><GitBranch size={15} /> Subir pro Git</button>
        <button className="btn-primary" onClick={abrirNova}><Plus size={15} /> Nova demanda</button>
      </div>

      {/* CHIPS DE ÁREA */}
      <div className="flex gap-2 flex-wrap mb-5">
        <button onClick={() => setFilterCat('all')}
          className={cn('px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors',
            filterCat === 'all' ? 'bg-white/90 text-navy border-white' : 'bg-white/4 text-white/55 border-white/10 hover:text-white')}>
          Todas <span className="opacity-60">{total}</span>
        </button>
        {Object.keys(categorias).map((c) => (
          <button key={c} onClick={() => setFilterCat(c)}
            className={cn('px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors flex items-center gap-2',
              filterCat === c ? 'bg-white/90 text-navy border-white' : 'bg-white/4 text-white/55 border-white/10 hover:text-white')}>
            <span className="w-2 h-2 rounded-full" style={{ background: categorias[c] }} />
            {c} <span className="opacity-60">{catCount[c] || 0}</span>
          </button>
        ))}
        <button onClick={abrirNovaArea}
          className="px-3 py-1.5 rounded-full text-[12px] font-bold border border-dashed border-white/20 text-white/60 hover:text-white">
          + Nova área
        </button>
      </div>

      {/* BOARD */}
      {carregando ? (
        <div className="text-center text-white/40 py-20 text-sm">Carregando demandas…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLS.map(({ st, label }) => {
            const items = tarefas.filter((t) => matches(t) && t.status === st)
            return (
              <div key={st}
                onDragOver={(e) => { e.preventDefault(); setDrag((d) => ({ ...d, over: st })) }}
                onDragLeave={() => setDrag((d) => ({ ...d, over: d.over === st ? null : d.over }))}
                onDrop={(e) => { e.preventDefault(); if (drag.id) mudarStatus(drag.id, st); setDrag({ id: null, over: null }) }}
                className={cn('rounded-xl border p-3 min-h-[120px] transition-colors',
                  drag.over === st ? 'border-teal/50 bg-teal/5' : 'border-white/8 bg-white/[0.015]')}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS[st].c }} />
                  <h2 className="text-[13px] font-bold text-white/85 flex-1">{label}</h2>
                  <span className="text-[11px] font-bold text-white/40 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">{items.length}</span>
                </div>
                {!items.length && (
                  <div className="text-center text-white/30 text-[12px] py-5 border border-dashed border-white/10 rounded-lg">Nada aqui ainda</div>
                )}
                {items.map((t) => (
                  <article key={t.id} draggable
                    onDragStart={() => setDrag({ id: t.id, over: st })}
                    onDragEnd={() => setDrag({ id: null, over: null })}
                    onClick={() => { setDetailId(t.id); setNota('') }}
                    className={cn('card p-3 mb-2.5 cursor-pointer hover:-translate-y-0.5 transition-transform',
                      drag.id === t.id && 'opacity-50')}
                    style={{ borderLeft: `3px solid ${categorias[t.cat] || '#64748B'}` }}>
                    <h3 className="text-[13px] font-semibold text-white/90 leading-snug flex items-start gap-1.5">
                      {temErro(t) && <span title="Último registro com erro" className="text-red-400 flex-shrink-0">⚠️</span>}
                      <span>{t.title}</span>
                    </h3>
                    {t.desc && <p className="text-[12px] text-white/45 mt-1.5 line-clamp-2">{t.desc}</p>}
                    <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                      {t.teste && (
                        <span className={cn('badge font-semibold', t.teste === 'a-testar' && 'pulse-dot')}
                          title={t.teste === 'a-testar' ? 'Implementado — testar e aprovar/reprovar' : `Teste: ${TESTE[t.teste].l}`}
                          style={{ background: `${TESTE[t.teste].c}22`, color: TESTE[t.teste].c, border: `1px solid ${TESTE[t.teste].c}66` }}>
                          {TESTE[t.teste].emoji} {TESTE[t.teste].l}
                        </span>
                      )}
                      <span className="badge text-white" style={{ background: categorias[t.cat] || '#64748B' }}>{t.cat}</span>
                      <span className="badge bg-white/5 border border-white/10 text-white/55">{TIPO[t.type]}</span>
                      <span className={prioBadge(t.prio)}>{PRIO[t.prio]}</span>
                      <span className="ml-auto flex items-center gap-2 text-[10px] text-white/35">
                        {t.log.length > 1 && <span>📝 {t.log.length - 1}</span>}
                        {t.files.length > 0 && <span>📎 {t.files.length}</span>}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL NOVA/EDITAR */}
      {form && (
        <Overlay onClose={() => { setForm(null); setEditId(null) }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <h2 className="text-[15px] font-bold text-white">{editId ? 'Editar demanda' : 'Nova demanda'}</h2>
            <CloseBtn onClick={() => { setForm(null); setEditId(null) }} />
          </div>
          <div className="p-5 space-y-4">
            <Field label="Título">
              <input className="input" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Salvar tipo de equipamento nos subgrupos" />
            </Field>
            <Field label="Descrição / detalhes">
              <textarea className="input min-h-[72px] resize-y" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })}
                placeholder="O que precisa ser feito, contexto, como reproduzir o bug…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Área">
                <select className="input" value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })}>
                  {Object.keys(categorias).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Tipo">
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TipoTarefa })}>
                  <option value="feature">Funcionalidade</option>
                  <option value="bug">Bug</option>
                  <option value="improvement">Melhoria</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prioridade">
                <select className="input" value={form.prio} onChange={(e) => setForm({ ...form, prio: e.target.value as PrioTarefa })}>
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as StatusTarefa })}>
                  <option value="todo">A fazer</option>
                  <option value="doing">Em andamento</option>
                  <option value="done">Concluído</option>
                </select>
              </Field>
            </div>
            <Field label="Anexos de exemplo">
              <input ref={formFileRef} type="file" accept=".pdf,.xls,.xlsx,.csv,image/*" multiple hidden
                onChange={(e) => { anexarNoForm(e.target.files); e.target.value = '' }} />
              <button type="button" className="btn-secondary" onClick={() => formFileRef.current?.click()}>
                <Paperclip size={14} /> Anexar PDF / Excel / imagem
              </button>
              <span className="text-[11px] text-white/30 ml-2">máx. ~4 MB por arquivo</span>
              <AnexoList files={form.files} onRemove={(fid) => setForm({ ...form, files: form.files.filter((f) => f.fid !== fid) })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/8">
            <button className="btn-ghost" onClick={() => { setForm(null); setEditId(null) }}>Cancelar</button>
            <button className="btn-primary" onClick={salvarForm}>Salvar demanda</button>
          </div>
        </Overlay>
      )}

      {/* MODAL DETALHE */}
      {detalhe && (
        <Overlay onClose={() => setDetailId(null)}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <h2 className="text-[15px] font-bold text-white pr-4">{detalhe.title}</h2>
            <CloseBtn onClick={() => setDetailId(null)} />
          </div>
          <div className="p-5">
            <div className="flex gap-2 flex-wrap mb-4">
              <span className="badge text-white" style={{ background: categorias[detalhe.cat] || '#64748B' }}>{detalhe.cat}</span>
              <span className="badge bg-white/5 border border-white/10 text-white/55">{TIPO[detalhe.type]}</span>
              <span className={prioBadge(detalhe.prio)}>{PRIO[detalhe.prio]} prioridade</span>
            </div>
            <div className="text-[13px] text-white/75 bg-white/[0.03] border border-white/8 rounded-lg p-3 mb-5 whitespace-pre-wrap">
              {detalhe.desc || 'Sem descrição.'}
            </div>

            <p className="mb-2 text-[12px] font-semibold text-white/80">Status</p>
            <div className="flex gap-2 mb-5">
              {COLS.map(({ st, label }) => {
                const on = detalhe.status === st
                return (
                  <button key={st} onClick={() => mudarStatus(detalhe.id, st)}
                    className={cn('flex-1 rounded-lg py-2 text-[12px] font-semibold border transition-colors',
                      on ? 'text-white border-transparent' : 'text-white/50 border-white/10 hover:text-white')}
                    style={on ? { background: STATUS[st].c } : undefined}>
                    {label}
                  </button>
                )
              })}
            </div>

            <p className="mb-2 text-[12px] font-semibold text-white/80">Teste / Validação</p>
            {detalhe.teste === 'a-testar' && (
              <p className="text-[11px] text-gold/90 mb-2">🧪 Implementado — teste e marque <b>Aprovado</b> ou <b>Reprovado</b>.</p>
            )}
            <div className="flex gap-2 mb-5">
              {(['a-testar', 'aprovado', 'reprovado'] as StatusTeste[]).map((tt) => {
                const on = detalhe.teste === tt
                return (
                  <button key={tt} onClick={() => marcarTeste(detalhe.id, tt)}
                    className={cn('flex-1 rounded-lg py-2 text-[12px] font-semibold border transition-colors',
                      on ? 'text-white border-transparent' : 'text-white/50 border-white/10 hover:text-white')}
                    style={on ? { background: TESTE[tt].c } : undefined}>
                    {TESTE[tt].emoji} {TESTE[tt].l}
                  </button>
                )
              })}
            </div>

            <p className="text-[12px] font-semibold text-white/80 mb-2">📎 Anexos</p>
            <AnexoList files={detalhe.files} download onDownload={baixarAnexo}
              onRemove={(fid) => removerAnexoDetalhe(detalhe.id, fid)} />
            <input ref={detailFileRef} type="file" accept=".pdf,.xls,.xlsx,.csv,image/*" multiple hidden
              onChange={(e) => { anexarNoDetalhe(detalhe.id, e.target.files); e.target.value = '' }} />
            <button type="button" className="btn-secondary mt-2.5" onClick={() => detailFileRef.current?.click()}>
              <Paperclip size={14} /> Anexar arquivo
            </button>

            <p className="text-[12px] font-semibold text-white/80 mb-2 mt-6">📝 Progresso &amp; anotações</p>
            <ul className="space-y-0 max-h-[230px] overflow-auto mb-3">
              {detalhe.log.length ? detalhe.log.map((l, i) => {
                const erro = l.what.startsWith('⚠️')
                return (
                  <li key={i} className="relative pl-5 pb-3.5 border-l border-white/10 last:border-transparent">
                    <span className={cn('absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-navy', erro ? 'bg-red-400' : 'bg-teal')} />
                    <div className="text-[11px] text-white/35 font-mono">{l.when}</div>
                    <div className={cn('text-[13px] mt-0.5 whitespace-pre-wrap', erro ? 'text-red-300' : 'text-white/80')}>{l.what}</div>
                  </li>
                )
              }) : <li className="text-white/30 text-[12px]">Sem anotações ainda.</li>}
            </ul>
            <div className="flex gap-2 items-end">
              <textarea className="input min-h-[44px] resize-y flex-1" value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder="Registrar avanço, decisão, observação…" />
              <button className="btn-primary" onClick={() => addNota(detalhe.id)}><Send size={14} /> Anotar</button>
            </div>
          </div>
          <div className="flex justify-between items-center px-5 py-4 border-t border-white/8 gap-2 flex-wrap">
            <button className="btn-danger" onClick={() => excluir(detalhe.id)}><Trash2 size={14} /> Excluir</button>
            <div className="flex gap-2 flex-wrap justify-end">
              {ROTA_POR_AREA[detalhe.cat] && (
                <button className="btn-secondary" onClick={() => router.push(ROTA_POR_AREA[detalhe.cat])}>
                  <ArrowUpRight size={14} /> Revisar em {detalhe.cat}
                </button>
              )}
              <button className="btn-secondary" onClick={() => executarNoClaude(detalhe)} title="Abre um terminal novo já rodando o Claude Code com esta demanda">
                <Play size={14} /> Executar no Claude Code
              </button>
              <button className="btn-secondary" onClick={() => abrirEdicao(detalhe)}><Pencil size={14} /> Editar</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* MODAL NOVA ÁREA */}
      {novaArea && (
        <Overlay onClose={() => setNovaArea(null)} maxW="max-w-[440px]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <h2 className="text-[15px] font-bold text-white">Nova área de demanda</h2>
            <CloseBtn onClick={() => setNovaArea(null)} />
          </div>
          <div className="p-5 space-y-4">
            <Field label="Nome da área">
              <input className="input" autoFocus value={novaArea.nome} onChange={(e) => setNovaArea({ ...novaArea, nome: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') criarArea() }} placeholder="Ex: Relatórios, Dashboard, OCR…" />
            </Field>
            <Field label="Cor da etiqueta">
              <div className="flex gap-2 flex-wrap">
                {CORES_AREA.map((c) => (
                  <button key={c} onClick={() => setNovaArea({ ...novaArea, cor: c })}
                    className={cn('w-7 h-7 rounded-lg transition-transform hover:scale-110',
                      novaArea.cor === c && 'ring-2 ring-white')}
                    style={{ background: c }} />
                ))}
              </div>
            </Field>
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/8">
            <button className="btn-ghost" onClick={() => setNovaArea(null)}>Cancelar</button>
            <button className="btn-primary" onClick={criarArea}>Criar área</button>
          </div>
        </Overlay>
      )}

      {/* MODAL SUBIR PRO GIT */}
      {gitModal && (
        <Overlay onClose={() => { if (!gitModal.enviando) setGitModal(null) }} maxW="max-w-[480px]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <h2 className="text-[15px] font-bold text-white">Subir pro Git</h2>
            <CloseBtn onClick={() => setGitModal(null)} />
          </div>
          <div className="p-5 space-y-4">
            <Field label="Mensagem do commit">
              <textarea className="input min-h-[72px] resize-y" autoFocus value={gitModal.msg}
                onChange={(e) => setGitModal({ ...gitModal, msg: e.target.value })}
                placeholder="Descreva o que mudou…" />
            </Field>
            <p className="text-[11px] text-white/35">Faz commit de tudo que mudou no projeto e dá push pro repositório remoto. Disponível só no app, em modo desenvolvimento.</p>
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/8">
            <button className="btn-ghost" disabled={gitModal.enviando} onClick={() => setGitModal(null)}>Cancelar</button>
            <button className="btn-primary" disabled={gitModal.enviando} onClick={enviarGit}>
              <GitBranch size={14} /> {gitModal.enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </Overlay>
      )}

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[99] px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white shadow-xl"
          style={{ background: 'rgba(20,22,32,0.97)', boxShadow: '0 8px 28px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

/* ── subcomponentes ── */
function Overlay({ children, onClose, maxW = 'max-w-[560px]' }: { children: React.ReactNode; onClose: () => void; maxW?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6 overflow-auto"
      style={{ background: 'rgba(6,9,17,0.7)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={cn('w-full border border-white/10 rounded-2xl shadow-2xl', maxW)}
        style={{ background: '#141B28' }}>
        {children}
      </div>
    </div>
  )
}
function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center">
      <X size={17} />
    </button>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-white/70 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
function AnexoList({ files, download, onRemove, onDownload }: {
  files: AnexoTarefa[]; download?: boolean; onRemove: (fid: string) => void; onDownload?: (a: AnexoTarefa) => void
}) {
  if (!files.length) return download
    ? <p className="text-white/30 text-[12px]">Nenhum anexo.</p>
    : null
  return (
    <ul className="space-y-1.5 mt-2.5">
      {files.map((f) => (
        <li key={f.fid} className="flex items-center gap-2.5 bg-white/[0.03] border border-white/8 rounded-lg px-2.5 py-2">
          <FileIcon name={f.name} type={f.type} />
          {download
            ? <button className="flex-1 min-w-0 text-left text-[13px] font-medium text-white/85 truncate hover:underline" onClick={() => onDownload?.(f)}>{f.name}</button>
            : <span className="flex-1 min-w-0 text-[13px] font-medium text-white/85 truncate">{f.name}</span>}
          <span className="text-[11px] text-white/35 whitespace-nowrap">{fmtSize(f.size)}</span>
          <button className="text-white/40 hover:text-red-400" onClick={() => onRemove(f.fid)}><X size={16} /></button>
        </li>
      ))}
    </ul>
  )
}
