'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Wand2, Check, AlertTriangle, Link2, ListChecks, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { chaveNome, type Proposta } from '@/lib/equipamentos/nomes'

interface EquipResumo { id: string; tag: string; fabricante: string; modelo: string }
interface Revisar extends EquipResumo { nome: string }
interface GrupoMuda { grupoId: string; subId: string; nome: string; novo: string }
interface Plano {
  totalEquip: number; totalNomes: number
  propostas: Proposta[]; revisar: Revisar[]; grupos: GrupoMuda[]
  equipsPorNome: Record<string, EquipResumo[]>
}

type Filtro = 'muda' | 'parecidos' | 'todos'

const MOTIVO: Record<string, { label: string; cls: string }> = {
  grafia:   { label: 'grafia',   cls: 'badge-teal' },
  traducao: { label: 'inglês → português', cls: 'badge-accent' },
  prefixo:  { label: 'texto do certificado', cls: 'badge-warning' },
  apelido:  { label: 'já vinculado', cls: 'badge-gold' },
}

export default function PadronizarNomesPage() {
  const [plano, setPlano] = useState<Plano | null>(null)
  const [erro, setErro] = useState('')
  // por proposta (chave = nome padrão sugerido): destino e se entra na aplicação
  const [para, setPara] = useState<Record<string, string>>({})
  const [marcado, setMarcado] = useState<Record<string, boolean>>({})
  const [umAUm, setUmAUm] = useState<Set<string>>(new Set())   // propostas mandadas p/ correção individual
  const [porId, setPorId] = useState<Record<string, string>>({})
  const [grupoNovo, setGrupoNovo] = useState<Record<string, string>>({})
  const [grupoMarcado, setGrupoMarcado] = useState<Record<string, boolean>>({})
  const [filtro, setFiltro] = useState<Filtro>('muda')
  const [busca, setBusca] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState('')

  async function carregar() {
    setErro('')
    try {
      const r = await fetch('/api/equipamentos/padronizar', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) { setErro(j.error || `HTTP ${r.status}`); return }
      const p = j as Plano
      setPlano(p)
      setPara(Object.fromEntries(p.propostas.map(x => [x.para, x.para])))
      setMarcado(Object.fromEntries(p.propostas.map(x => [x.para, x.muda])))
      setUmAUm(new Set()); setPorId({})
      setGrupoNovo(Object.fromEntries(p.grupos.map(g => [g.grupoId + '/' + g.subId, g.novo])))
      setGrupoMarcado(Object.fromEntries(p.grupos.map(g => [g.grupoId + '/' + g.subId, true])))
    } catch (e) { setErro(String(e)) }
  }
  useEffect(() => { carregar() }, [])

  const props = plano?.propostas ?? []
  const nomesPadrao = useMemo(() => [...new Set(props.map(p => para[p.para] ?? p.para))].sort((a, b) => a.localeCompare(b, 'pt')), [props, para])

  // Quantas propostas apontam para o mesmo destino (→ serão juntadas).
  const destinos = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of props) {
      if (umAUm.has(p.para)) continue
      const k = chaveNome(para[p.para] ?? p.para)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [props, para, umAUm])

  const visiveis = useMemo(() => {
    const q = chaveNome(busca)
    return props.filter(p => {
      if (umAUm.has(p.para)) return false
      const editado = (para[p.para] ?? p.para) !== p.para
      if (filtro === 'muda' && !(p.muda || editado)) return false
      if (filtro === 'parecidos' && !p.parecidos.length) return false
      if (q && !chaveNome([p.para, ...p.de.map(v => v.nome)].join(' ')).includes(q)) return false
      return true
    })
  }, [props, para, filtro, busca, umAUm])

  const revisar: Revisar[] = useMemo(() => {
    const extra = props.filter(p => umAUm.has(p.para))
      .flatMap(p => p.de.flatMap(v => (plano?.equipsPorNome[v.nome] ?? []).map(e => ({ ...e, nome: v.nome }))))
    return [...extra, ...(plano?.revisar ?? [])]
  }, [props, umAUm, plano])

  // Resumo do que será gravado
  const { renomear, nEquip } = useMemo(() => {
    const ren: { de: string[]; para: string }[] = []
    let n = 0
    for (const p of props) {
      if (umAUm.has(p.para) || !marcado[p.para]) continue
      const destino = (para[p.para] ?? p.para).trim()
      if (!destino) continue
      ren.push({ de: p.de.map(v => v.nome), para: destino })
      n += p.de.filter(v => v.nome !== destino).reduce((s, v) => s + v.qtd, 0)
    }
    return { renomear: ren, nEquip: n }
  }, [props, para, marcado, umAUm])
  const nPorId = Object.values(porId).filter(v => v.trim()).length
  const gruposAplicar = (plano?.grupos ?? []).filter(g => grupoMarcado[g.grupoId + '/' + g.subId])

  function mudarPara(chave: string, valor: string) {
    setPara(s => ({ ...s, [chave]: valor }))
    setMarcado(s => ({ ...s, [chave]: true }))
  }

  async function aplicar() {
    const total = nEquip + nPorId
    if (!total && !gruposAplicar.length) { alert('Nada marcado para alterar.'); return }
    if (!confirm(`Renomear ${total} equipamento(s)${gruposAplicar.length ? ` e ${gruposAplicar.length} grupo(s)/subgrupo(s)` : ''}?\n\nAntes de gravar é feita uma cópia do cadastro (pasta backups). As grafias antigas ficam vinculadas ao nome novo — cadastros e importações futuras já saem no padrão.`)) return
    setAplicando(true); setResultado('')
    try {
      const r = await fetch('/api/equipamentos/padronizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          renomear,
          porId: Object.entries(porId).filter(([, v]) => v.trim()).map(([id, nome]) => ({ id, nome })),
          grupos: gruposAplicar.map(g => ({ grupoId: g.grupoId, subId: g.subId, novo: grupoNovo[g.grupoId + '/' + g.subId] ?? g.novo })),
        }),
      })
      const j = await r.json()
      if (!r.ok) { alert(j.error || `Erro HTTP ${r.status}`); return }
      setResultado(`${j.alterados} equipamento(s) renomeado(s)${j.gruposAlterados ? `, ${j.gruposAlterados} grupo(s)/subgrupo(s)` : ''}. Cópia anterior: ${j.backup}`)
      await carregar()
    } catch (e) { alert('Erro ao aplicar: ' + String(e)) }
    finally { setAplicando(false) }
  }

  const nMuda = props.filter(p => p.muda).length
  const nParecidos = props.filter(p => p.parecidos.length).length

  return (
    <div>
      <datalist id="nomes-padrao">{nomesPadrao.map(n => <option key={n} value={n} />)}</datalist>

      <div className="page-header">
        <div>
          <p className="page-eyebrow">Configuração · Equipamentos</p>
          <h1 className="page-title">Padronizar nomes</h1>
          <p className="page-sub">
            Cada palavra com inicial maiúscula (preposições e siglas à parte), grafia corrigida e nomes em inglês em português.
            Grafias diferentes do mesmo equipamento viram um nome só.
          </p>
        </div>
        <Link href="/equipamentos/grupos" className="btn-secondary"><ArrowLeft size={13}/> Grupos</Link>
      </div>

      {erro && <div className="card p-4 mb-3 text-[12px] text-red-400">{erro}</div>}
      {!plano && !erro && <div className="text-white/25 text-sm py-10 text-center">Carregando...</div>}

      {plano && (
        <>
          <div className="card p-4 mb-3 flex items-center gap-4 flex-wrap">
            <div className="text-[12px] text-white/60">
              <span className="text-white font-semibold">{plano.totalNomes}</span> nomes diferentes em {plano.totalEquip} equipamentos →
              {' '}<span className="text-teal font-semibold">{destinos.size}</span> nomes padrão
              {revisar.length > 0 && <> · <span className="text-amber-400 font-semibold">{revisar.length}</span> para corrigir um a um</>}
            </div>
            <div className="flex-1" />
            <span className="text-[11px] text-white/40">{nEquip + nPorId} equipamento(s) serão renomeados</span>
            <button className="btn-primary" disabled={aplicando} onClick={aplicar}>
              <Wand2 size={13}/> {aplicando ? 'Aplicando…' : 'Aplicar'}
            </button>
          </div>
          {resultado && <div className="card p-3 mb-3 text-[12px] text-emerald-400 flex items-center gap-2"><Check size={14}/> {resultado}</div>}

          {/* Propostas por nome padrão */}
          <div className="card p-5 mb-3">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <ListChecks size={15} className="text-teal" />
              <h2 className="font-display font-bold text-[14px] text-white">Nomes</h2>
              <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8 ml-2">
                {([['muda', `Com alteração (${nMuda})`], ['parecidos', `Parecidos (${nParecidos})`], ['todos', `Todos (${props.length})`]] as [Filtro, string][]).map(([f, l]) => (
                  <button key={f} type="button" onClick={() => setFiltro(f)}
                    className={cn('px-2 py-0.5 rounded text-[10px] font-semibold transition-all',
                      filtro === f ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60')}>{l}</button>
                ))}
              </div>
              <div className="flex-1" />
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="buscar…" className="input text-[11px] py-1 pl-6 w-44" />
              </div>
            </div>
            <p className="text-[11px] text-white/35 mb-3">
              O campo da esquerda é o nome que fica. Para juntar dois tipos, escreva (ou escolha) o mesmo nome nos dois — ou use “juntar com”.
              Marque só o que quiser aplicar.
            </p>

            <div className="space-y-1">
              {visiveis.length === 0 && <p className="text-[11px] text-white/25 italic py-2">Nada aqui.</p>}
              {visiveis.map(p => {
                const destino = para[p.para] ?? p.para
                const junta = (destinos.get(chaveNome(destino)) ?? 0) > 1
                return (
                  <div key={p.para} className={cn('rounded-lg px-2 py-2 border', marcado[p.para] ? 'border-teal/20 bg-teal/[0.03]' : 'border-transparent hover:bg-white/[0.02]')}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="accent-teal w-3.5 h-3.5 shrink-0" checked={!!marcado[p.para]}
                        onChange={e => setMarcado(s => ({ ...s, [p.para]: e.target.checked }))} />
                      <input list="nomes-padrao" value={destino} onChange={e => mudarPara(p.para, e.target.value)}
                        className="input text-[12px] py-1 w-80 shrink-0 font-semibold" />
                      <span className="text-[10px] font-mono text-white/30 w-12 text-right shrink-0">{p.qtd}×</span>
                      {junta && <span className="badge-gold shrink-0"><Link2 size={10}/> junta</span>}
                      {p.motivo.map(m => <span key={m} className={cn(MOTIVO[m]?.cls, 'shrink-0')}>{MOTIVO[m]?.label ?? m}</span>)}
                      <div className="flex-1" />
                      <button type="button" className="btn-ghost text-[10px] py-0.5 px-1.5 shrink-0" title="Os equipamentos destas grafias não são todos do mesmo tipo — corrigir cada um"
                        onClick={() => setUmAUm(s => new Set(s).add(p.para))}>corrigir um a um</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 pl-6">
                      {p.de.map(v => (
                        <span key={v.nome} className={cn('text-[11px] px-1.5 py-0.5 rounded border',
                          v.nome === destino ? 'border-white/8 text-white/35' : 'border-amber-400/25 text-amber-200/80 bg-amber-400/[0.05]')}
                          title={(plano.equipsPorNome[v.nome] ?? []).slice(0, 12).map(e => `${e.tag} ${e.fabricante} ${e.modelo}`).join('\n')}>
                          {v.nome || '(vazio)'} <span className="text-white/30">{v.qtd}×</span>
                        </span>
                      ))}
                      {[...new Set(p.parecidos.map(x => para[x] ?? x))]
                        .filter(alvo => chaveNome(alvo) !== chaveNome(destino))
                        .map(alvo => (
                          <button key={alvo} type="button" onClick={() => mudarPara(p.para, alvo)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-white/15 text-white/45 hover:text-teal hover:border-teal/40">
                            juntar com “{alvo}”
                          </button>
                        ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Correção individual */}
          {revisar.length > 0 && (
            <div className="card p-5 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={15} className="text-amber-400" />
                <h2 className="font-display font-bold text-[14px] text-white">Corrigir um a um</h2>
                <span className="text-[10px] font-mono text-white/30">{revisar.length}</span>
              </div>
              <p className="text-[11px] text-white/35 mb-3">
                O nome destes cadastros não é um tipo de equipamento (veio vazio, “CERTIFICADO”, nome do laboratório…). Escreva o nome certo de cada um; em branco fica como está.
              </p>
              <div className="max-h-[480px] overflow-y-auto pr-1 space-y-1">
                {revisar.map(e => (
                  <div key={e.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.02]">
                    <Link href={`/equipamentos/${e.id}`} target="_blank" className="font-mono text-[11px] text-teal w-20 shrink-0 hover:underline">{e.tag}</Link>
                    <span className="text-[11px] text-white/45 w-64 shrink-0 truncate" title={`${e.fabricante} ${e.modelo}`}>{[e.fabricante, e.modelo].filter(Boolean).join(' · ') || '—'}</span>
                    <span className="text-[11px] text-white/30 w-48 shrink-0 truncate line-through decoration-white/20" title={e.nome}>{e.nome || '(vazio)'}</span>
                    <input list="nomes-padrao" value={porId[e.id] ?? ''} onChange={ev => setPorId(s => ({ ...s, [e.id]: ev.target.value }))}
                      placeholder="nome do equipamento" className="input text-[11px] py-1 flex-1 min-w-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grupos e subgrupos */}
          {plano.grupos.length > 0 && (
            <div className="card p-5 mb-3">
              <h2 className="font-display font-bold text-[14px] text-white mb-3">Grupos e subgrupos</h2>
              <div className="space-y-1">
                {plano.grupos.map(g => {
                  const k = g.grupoId + '/' + g.subId
                  return (
                    <div key={k} className="flex items-center gap-2 px-2 py-1">
                      <input type="checkbox" className="accent-teal w-3.5 h-3.5" checked={!!grupoMarcado[k]}
                        onChange={e => setGrupoMarcado(s => ({ ...s, [k]: e.target.checked }))} />
                      <span className="text-[11px] text-white/40 w-56 truncate">{g.subId ? 'subgrupo' : 'grupo'} · {g.nome}</span>
                      <span className="text-white/25">→</span>
                      <input value={grupoNovo[k] ?? g.novo} onChange={e => setGrupoNovo(s => ({ ...s, [k]: e.target.value }))}
                        className="input text-[12px] py-1 w-72" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
