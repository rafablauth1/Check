'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight, Zap, Gauge, Waves, Radio, SlidersHorizontal, Thermometer,
         FolderInput, Loader2, CheckCircle2, AlertTriangle, XCircle, ChevronsUpDown,
         ChevronUp, ChevronDown, FileWarning, Trash2, RefreshCw } from 'lucide-react'
import { fmt } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { EquipamentoEMC, GrupoId } from '@/lib/equipamentos/tipos'
import { GRUPO_CORES } from '@/lib/grupos-icons'
import type { Taxonomia } from '@/lib/taxonomia/tipos'
import { siglaDaTag } from '@/lib/taxonomia/tipos'

interface Grupo {
  id: GrupoId
  nome: string
  cor: string
  subgrupos: { id: string; nome: string; numero: string }[]
}

interface RelatorioImport {
  total: number
  sucessos: string[]
  atualizados: string[]
  pulados: { tag: string; motivo: string }[]
  erros: { folder: string; motivo: string }[]
  rascunhos?: number
}

interface ScanResult {
  ok: boolean
  error?: string
  resultados?: { folder: string; certPath: string | null; text?: string; items?: unknown[]; error?: string }[]
}
interface ScanRapidoResult {
  ok: boolean
  error?: string
  total?: number
  resultados?: { folder: string; pasta: string; certPath: string | null }[]
}
interface SyncRedeResult {
  total: number; novos: number; atualizados: number; ignorados: number
}
type LabAPI = {
  scanCertificados?: (p: string) => Promise<ScanResult>
  scanRapido?: (p: string) => Promise<ScanRapidoResult>
  browseFolder?: (t: string) => Promise<{ canceled?: boolean; folderPath?: string }>
}

const ICONES: Record<string, React.ElementType> = {
  'geradores':            Zap,
  'medidores':            Gauge,
  'redes-impedancia':     Waves,
  'antenas':              Radio,
  'atenuacao':            SlidersHorizontal,
  'grandezas-ambientais': Thermometer,
}

function StatusPill({ status }: { status: string }) {
  if (status === 'ativo')    return <span className="badge-success">Ativo</span>
  if (status === 'calibrar') return <span className="badge-warning">Calibrar</span>
  return <span className="badge-danger">Fora</span>
}

function camposFaltando(e: EquipamentoEMC): string[] {
  const f: string[] = []
  if (!e.fabricante) f.push('Fabricante')
  if (!e.modelo)     f.push('Modelo')
  if (!e.serie)      f.push('Nº de série')
  if (!e.ultimaCalibracao) f.push('Última calibração')
  if (!e.numeroCertificado) f.push('Nº certificado')
  return f
}

type SortField = 'tag' | 'nome' | 'proxCal' | 'status'

interface FiltroState {
  siglas: string[]
  grupos: string[]
  subgrupos: string[]
  busca: string
}
const FILTRO_VAZIO: FiltroState = { siglas: [], grupos: [], subgrupos: [], busca: '' }

interface Rascunho {
  id: string
  folder: string
  tag?: string
  motivo: string
  criadoEm: string
}

type Aba = 'equipamentos' | 'rascunho'

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: 'asc' | 'desc' }) {
  if (sortBy !== field) return <ChevronsUpDown size={10} className="opacity-30"/>
  return sortDir === 'asc' ? <ChevronUp size={10} className="text-gold"/> : <ChevronDown size={10} className="text-gold"/>
}

export default function EquipamentosPage() {
  const [equips, setEquips] = useState<EquipamentoEMC[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [tax, setTax] = useState<Taxonomia>({ areas: [], siglas: [], tipos: [] })
  const [filtros, setFiltros] = useState<FiltroState>(FILTRO_VAZIO)
  const [sortBy, setSortBy] = useState<SortField>('tag')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [aba, setAba] = useState<Aba>('equipamentos')
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([])
  const [impProgresso, setImpProgresso] = useState<string | null>(null)
  const [impRelatorio, setImpRelatorio] = useState<RelatorioImport | null>(null)
  const [syncProgresso, setSyncProgresso] = useState<string | null>(null)
  const [syncRelatorio, setSyncRelatorio] = useState<SyncRedeResult | null>(null)

  // Restaura filtros e sort do sessionStorage ao montar
  useEffect(() => {
    try {
      const sf = sessionStorage.getItem('eq-filtros')
      if (sf) setFiltros(JSON.parse(sf))
      const ss = sessionStorage.getItem('eq-sort')
      if (ss) { const { by, dir } = JSON.parse(ss); setSortBy(by); setSortDir(dir) }
    } catch {}
  }, [])

  // Persiste filtros ao mudar
  useEffect(() => {
    sessionStorage.setItem('eq-filtros', JSON.stringify(filtros))
  }, [filtros])
  useEffect(() => {
    sessionStorage.setItem('eq-sort', JSON.stringify({ by: sortBy, dir: sortDir }))
  }, [sortBy, sortDir])

  async function importarPastaMae() {
    const api = (window as unknown as { electronAPI?: LabAPI }).electronAPI
    if (!api?.scanCertificados || !api?.browseFolder) {
      alert('Disponível apenas no aplicativo (Electron).')
      return
    }
    const sel = await api.browseFolder('Pasta-mãe — uma subpasta por TAG, cada uma com o …Certificado.pdf')
    if (!sel || sel.canceled || !sel.folderPath) return
    try {
      setImpProgresso('Lendo os certificados das pastas…')
      const scan = await api.scanCertificados(sel.folderPath)
      if (!scan.ok || !scan.resultados) { setImpProgresso(null); alert(scan.error || 'Falha ao ler a pasta-mãe.'); return }
      setImpProgresso(`Cadastrando ${scan.resultados.length} TAG(s)…`)
      const r = await fetch('/api/equipamentos/importar-lote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: scan.resultados }),
      })
      const rel = await r.json()
      if (!r.ok) { setImpProgresso(null); alert(rel.error || 'Falha na importação.'); return }
      setImpRelatorio(rel as RelatorioImport)
      fetch('/api/equipamentos').then(x => x.json()).then(e => setEquips(Array.isArray(e) ? e : [])).catch(() => {})
      fetch('/api/rascunhos').then(x => x.json()).then(d => setRascunhos(Array.isArray(d) ? d : [])).catch(() => {})
    } catch (e) {
      alert('Erro: ' + String(e))
    } finally {
      setImpProgresso(null)
    }
  }

  async function sincronizarRede() {
    const api = (window as unknown as { electronAPI?: LabAPI }).electronAPI
    if (!api?.scanRapido || !api?.browseFolder) {
      alert('Disponível apenas no aplicativo (Electron).')
      return
    }
    const sel = await api.browseFolder('Pasta-mãe da rede — uma subpasta por TAG (scan sem OCR)')
    if (!sel || sel.canceled || !sel.folderPath) return
    setSyncRelatorio(null)
    try {
      setSyncProgresso('Lendo estrutura de pastas…')
      const scan = await api.scanRapido(sel.folderPath)
      if (!scan.ok || !scan.resultados) {
        setSyncProgresso(null)
        alert(scan.error || 'Falha ao ler a pasta.')
        return
      }
      setSyncProgresso(`Sincronizando ${scan.total} pasta(s)…`)
      const r = await fetch('/api/equipamentos/sync-rede', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: scan.resultados }),
      })
      const rel = await r.json() as SyncRedeResult
      if (!r.ok) { setSyncProgresso(null); alert((rel as any).error || 'Falha na sincronização.'); return }
      setSyncRelatorio(rel)
      fetch('/api/equipamentos').then(x => x.json()).then(e => setEquips(Array.isArray(e) ? e : [])).catch(() => {})
    } catch (e) {
      alert('Erro: ' + String(e))
    } finally {
      setSyncProgresso(null)
    }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/equipamentos').then(r => r.json()),
      fetch('/api/grupos').then(r => r.json()),
      fetch('/api/taxonomia').then(r => r.json()),
      fetch('/api/rascunhos').then(r => r.json()),
    ]).then(([e, g, t, rasc]) => {
      setEquips(Array.isArray(e) ? e : [])
      setGrupos(Array.isArray(g) ? g : [])
      if (t && !t.error) setTax({ areas: t.areas ?? [], siglas: t.siglas ?? [], tipos: t.tipos ?? [] })
      setRascunhos(Array.isArray(rasc) ? rasc : [])
    }).catch(() => {})
  }, [])

  // ── Filtros ────────────────────────────────────────────────────────────────
  function toggleSigla(id: string) {
    setFiltros(f => ({ ...f, siglas: f.siglas.includes(id) ? f.siglas.filter(s => s !== id) : [...f.siglas, id] }))
  }
  function toggleGrupo(id: string) {
    setFiltros(f => ({ ...f, grupos: f.grupos.includes(id) ? f.grupos.filter(s => s !== id) : [...f.grupos, id] }))
  }
  function toggleSubgrupo(id: string) {
    setFiltros(f => ({ ...f, subgrupos: f.subgrupos.includes(id) ? f.subgrupos.filter(s => s !== id) : [...f.subgrupos, id] }))
  }
  function limparFiltros() { setFiltros(FILTRO_VAZIO) }

  const temFiltro = filtros.siglas.length > 0 || filtros.grupos.length > 0 || filtros.subgrupos.length > 0 || !!filtros.busca

  // ── Sort ───────────────────────────────────────────────────────────────────
  function toggleSort(field: SortField) {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  // ── Lista filtrada e ordenada ──────────────────────────────────────────────
  const equipsFiltrados = useMemo(() => {
    const result = equips.filter(e => {
      const siglaOk = filtros.siglas.length === 0 || filtros.siglas.includes(siglaDaTag(e.tag))
      const grupoOk = filtros.grupos.length === 0 || filtros.grupos.includes(e.grupoId)
      const subOk   = filtros.subgrupos.length === 0 || filtros.subgrupos.includes(e.subgrupoId)
      const buscaOk = !filtros.busca || [e.tag, e.nome].some(v => v?.toLowerCase().includes(filtros.busca.toLowerCase()))
      return siglaOk && grupoOk && subOk && buscaOk
    })
    return [...result].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'tag')     cmp = a.tag.localeCompare(b.tag)
      else if (sortBy === 'nome')    cmp = (a.nome || '').localeCompare(b.nome || '')
      else if (sortBy === 'proxCal') cmp = (a.proximaCalibracao || '').localeCompare(b.proximaCalibracao || '')
      else if (sortBy === 'status') {
        const o = { ativo: 0, calibrar: 1, fora: 2, 'sem-calibracao': 3, 'calibrar-antes-uso': 4 }
        cmp = (o[a.status as keyof typeof o] ?? 9) - (o[b.status as keyof typeof o] ?? 9)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [equips, filtros, sortBy, sortDir])

  // ── Siglas presentes ───────────────────────────────────────────────────────
  const siglasPresentes = useMemo(() => {
    const cont = new Map<string, number>()
    for (const e of equips) { const s = siglaDaTag(e.tag); if (s) cont.set(s, (cont.get(s) ?? 0) + 1) }
    return [...cont.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sigla, n]) => {
      const def  = tax.siglas.find(x => x.sigla === sigla)
      const area = def ? tax.areas.find(a => a.id === def.areaId) : undefined
      return { sigla, n, significado: def?.significado, cor: area ? GRUPO_CORES[area.cor] : '#94A3B8' }
    })
  }, [equips, tax])

  async function deletarRascunho(id: string) {
    await fetch('/api/rascunhos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setRascunhos(r => r.filter(x => x.id !== id))
  }

  const thCls = 'cursor-pointer select-none hover:text-white/80 transition-colors'

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Laboratório · EMC</p>
          <h1 className="page-title">Equipamentos</h1>
          <p className="page-sub">Por grupo e subgrupo</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/equipamentos/novo" className="btn-primary">
            <Plus size={13}/> Novo Equipamento
          </Link>
          <button type="button" onClick={sincronizarRede} disabled={!!syncProgresso || !!impProgresso}
            className="btn-secondary" title="Scan rápido da rede — cria registros sem OCR, processa certificados por equipamento depois">
            {syncProgresso ? <Loader2 size={13} className="animate-spin"/> : <RefreshCw size={13}/>}
            {syncProgresso || 'Sincronizar rede'}
          </button>
          <button type="button" onClick={importarPastaMae} disabled={!!impProgresso || !!syncProgresso} className="btn-secondary">
            {impProgresso ? <Loader2 size={13} className="animate-spin"/> : <FolderInput size={13}/>}
            {impProgresso ? 'Importando…' : 'Importar pasta-mãe'}
          </button>
          <Link href="/checagens/nova" className="btn-secondary">
            <Plus size={13}/> Nova Checagem
          </Link>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 mb-6 border-b border-white/8">
        <button type="button" onClick={() => setAba('equipamentos')}
          className={cn('px-4 py-2 text-[12px] font-mono transition-all border-b-2 -mb-px',
            aba === 'equipamentos' ? 'border-gold text-gold' : 'border-transparent text-white/40 hover:text-white/70')}>
          Equipamentos <span className="opacity-50 ml-1">{equips.length}</span>
        </button>
        <button type="button" onClick={() => setAba('rascunho')}
          className={cn('px-4 py-2 text-[12px] font-mono transition-all border-b-2 -mb-px flex items-center gap-1.5',
            aba === 'rascunho' ? 'border-amber-400 text-amber-400' : 'border-transparent text-white/40 hover:text-white/70')}>
          <FileWarning size={12}/> Rascunho
          {rascunhos.length > 0 && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-mono',
              aba === 'rascunho' ? 'bg-amber-400/20 text-amber-400' : 'bg-white/10 text-white/40')}>
              {rascunhos.length}
            </span>
          )}
        </button>
      </div>

      {impProgresso && (
        <div className="mb-4 card px-4 py-2.5 flex items-center gap-2 text-[12px] text-white/70">
          <Loader2 size={14} className="animate-spin text-teal"/> {impProgresso}
        </div>
      )}

      {impRelatorio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setImpRelatorio(null)}>
          <div className="card w-full max-w-lg max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-[15px] text-white mb-1">Importação concluída</h3>
            <p className="text-[11px] text-white/40 mb-4">{impRelatorio.total} pasta(s) processada(s)</p>
            <div className="space-y-3 text-[12px]">
              {impRelatorio.sucessos.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-green-400 font-medium mb-1"><CheckCircle2 size={14}/> Cadastrados ({impRelatorio.sucessos.length})</p>
                  <div className="flex flex-wrap gap-1">{impRelatorio.sucessos.map(t => <span key={t} className="tag-chip">{t}</span>)}</div>
                </div>
              )}
              {impRelatorio.atualizados.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-teal font-medium mb-1"><CheckCircle2 size={14}/> Já existiam — certificado anexado ({impRelatorio.atualizados.length})</p>
                  <div className="flex flex-wrap gap-1">{impRelatorio.atualizados.map(t => <span key={t} className="tag-chip">{t}</span>)}</div>
                </div>
              )}
              {impRelatorio.pulados.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-amber-400 font-medium mb-1">
                    <AlertTriangle size={14}/> Não cadastrados — salvos no Rascunho ({impRelatorio.pulados.length})
                  </p>
                  <ul className="space-y-0.5">{impRelatorio.pulados.map((p, i) => <li key={i} className="text-white/60"><b className="text-amber-300/80">{p.tag}</b> — {p.motivo}</li>)}</ul>
                </div>
              )}
              {impRelatorio.erros.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-red-400 font-medium mb-1"><XCircle size={14}/> Falhas ({impRelatorio.erros.length})</p>
                  <ul className="space-y-0.5">{impRelatorio.erros.map((e, i) => <li key={i} className="text-white/60"><b className="text-red-300/80">{e.folder}</b> — {e.motivo}</li>)}</ul>
                </div>
              )}
            </div>
            <div className="flex justify-end mt-5">
              <button type="button" onClick={() => setImpRelatorio(null)} className="btn-primary">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESULTADO DA SINCRONIZAÇÃO ────────────────────────────────────── */}
      {syncRelatorio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSyncRelatorio(null)}>
          <div className="card w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-[15px] text-white mb-1">Sincronização concluída</h3>
            <p className="text-[11px] text-white/40 mb-4">{syncRelatorio.total} pasta(s) encontrada(s)</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 size={14}/> <span><b>{syncRelatorio.novos}</b> novo(s) equipamento(s) criado(s)</span>
              </div>
              <div className="flex items-center gap-2 text-teal">
                <RefreshCw size={14}/> <span><b>{syncRelatorio.atualizados}</b> equipamento(s) atualizado(s)</span>
              </div>
              {syncRelatorio.ignorados > 0 && (
                <div className="flex items-center gap-2 text-white/40">
                  <AlertTriangle size={14}/> <span><b>{syncRelatorio.ignorados}</b> pasta(s) ignorada(s) (TAG inválida)</span>
                </div>
              )}
              <p className="text-[11px] text-white/30 pt-2">
                Certificados pendentes: abra cada equipamento para processar os PDFs da rede.
              </p>
            </div>
            <div className="flex justify-end mt-5">
              <button type="button" onClick={() => setSyncRelatorio(null)} className="btn-primary">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA RASCUNHO ─────────────────────────────────────────────────── */}
      {aba === 'rascunho' && (
        <div>
          {rascunhos.length === 0 ? (
            <div className="card p-12 text-center">
              <FileWarning size={36} className="mx-auto mb-4 text-white/15"/>
              <p className="text-white/40 text-sm">Nenhum rascunho pendente.</p>
              <p className="text-white/25 text-[12px] mt-1">Tags não cadastradas durante importações aparecem aqui.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rascunhos.map(r => (
                <div key={r.id} className="card px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {r.tag && <span className="tag-chip">{r.tag}</span>}
                      <span className="text-[11px] text-white/50 truncate">{r.folder}</span>
                    </div>
                    <p className="text-[11px] text-amber-400/80">{r.motivo}</p>
                    <p className="text-[10px] text-white/25 font-mono">{r.criadoEm?.split('T')[0]}</p>
                  </div>
                  <button type="button" onClick={() => deletarRascunho(r.id)}
                    className="text-white/25 hover:text-red-400 p-1.5 rounded transition-colors flex-shrink-0">
                    <Trash2 size={14}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ABA EQUIPAMENTOS ─────────────────────────────────────────────── */}
      {aba === 'equipamentos' && (
        <>
          {/* Filtros: Siglas */}
          {siglasPresentes.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/30 w-14 flex-shrink-0">Siglas</span>
              {siglasPresentes.map(s => {
                const ativo = filtros.siglas.includes(s.sigla)
                return (
                  <button key={s.sigla} type="button" onClick={() => toggleSigla(s.sigla)}
                    title={s.significado || 'Sigla não cadastrada em Áreas & Siglas'}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all"
                    style={{
                      background: ativo ? `${s.cor}22` : 'rgba(255,255,255,0.03)',
                      color: ativo ? s.cor : 'rgba(255,255,255,0.55)',
                      border: `1px solid ${ativo ? s.cor + '66' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.cor }}/>
                    {s.sigla}
                    <span className="opacity-50">{s.n}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Filtros: Grupos como chips */}
          {grupos.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/30 w-14 flex-shrink-0">Grupos</span>
              {grupos.map(g => {
                const cor   = GRUPO_CORES[g.cor] ?? '#94A3B8'
                const ativo = filtros.grupos.includes(g.id)
                const Icon  = ICONES[g.id] ?? Gauge
                const total = equips.filter(e => e.grupoId === g.id).length
                return (
                  <button key={g.id} type="button" onClick={() => toggleGrupo(g.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all"
                    style={{
                      background: ativo ? `${cor}22` : 'rgba(255,255,255,0.03)',
                      color: ativo ? cor : 'rgba(255,255,255,0.55)',
                      border: `1px solid ${ativo ? cor + '66' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    <Icon size={11} style={{ color: ativo ? cor : 'rgba(255,255,255,0.4)' }}/>
                    {g.nome}
                    <span className="opacity-50">{total}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Grupos como cards (com subgrupos) */}
          {grupos.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-8">
                {grupos.map(g => {
                  const cor       = GRUPO_CORES[g.cor] ?? '#94A3B8'
                  const Icon      = ICONES[g.id] ?? Gauge
                  const total     = equips.filter(e => e.grupoId === g.id).length
                  const grupoAtivo = filtros.grupos.includes(g.id)
                  return (
                    <div key={g.id}
                      className={cn('card p-4 transition-all', grupoAtivo ? 'ring-1' : 'hover:border-white/15')}
                      style={grupoAtivo ? { borderColor: `${cor}66`, boxShadow: `0 0 0 1px ${cor}66`, background: `${cor}0A` } : undefined}>
                      <button type="button" onClick={() => toggleGrupo(g.id)}
                        className="w-full flex items-center gap-3 mb-3 text-left">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                             style={{ background: `${cor}18`, border: `1px solid ${cor}28` }}>
                          <Icon size={18} style={{ color: cor }}/>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[13px] text-white truncate">{g.nome}</p>
                          <p className="text-[10px] text-white/35 font-mono flex items-center gap-1.5">
                            {total} equipamento{total !== 1 ? 's' : ''}
                            {(() => { const inc = equips.filter(eq => eq.grupoId === g.id && camposFaltando(eq).length > 0).length; return inc > 0 ? <span className="text-amber-400">· {inc} incompleto{inc>1?'s':''}</span> : null })()}
                          </p>
                        </div>
                      </button>
                      <div className="flex flex-wrap gap-1">
                        {g.subgrupos.map(s => {
                          const subAtivo = filtros.subgrupos.includes(s.id)
                          return (
                            <button key={s.id} type="button"
                              onClick={() => toggleSubgrupo(s.id)}
                              className="badge font-mono transition-all hover:brightness-125"
                              style={{
                                background: subAtivo ? `${cor}30` : `${cor}12`,
                                color: cor,
                                border: `1px solid ${cor}${subAtivo ? '66' : '22'}`,
                                fontSize: 9,
                              }}>
                              {s.numero} {s.nome}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              <hr className="border-white/6 mb-8"/>
            </>
          )}

          {/* Busca + filtros ativos + contagem */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <input
                className="input h-8 text-[12px] w-48"
                value={filtros.busca}
                onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
                placeholder="Buscar TAG ou nome…"
              />
              {/* Chips de filtros ativos */}
              {filtros.siglas.map(s => (
                <button key={'s-' + s} type="button" onClick={() => toggleSigla(s)}
                  className="flex items-center gap-1 text-[11px] font-mono text-white/60 hover:text-white px-2 py-0.5 rounded-lg border border-white/10 hover:border-white/25 transition-all">
                  Sigla: {s} <span className="text-white/35">✕</span>
                </button>
              ))}
              {filtros.grupos.map(id => {
                const g = grupos.find(x => x.id === id)
                return (
                  <button key={'g-' + id} type="button" onClick={() => toggleGrupo(id)}
                    className="flex items-center gap-1 text-[11px] font-mono text-white/60 hover:text-white px-2 py-0.5 rounded-lg border border-white/10 hover:border-white/25 transition-all">
                    {g?.nome ?? id} <span className="text-white/35">✕</span>
                  </button>
                )
              })}
              {filtros.subgrupos.map(id => {
                let label = id
                for (const g of grupos) { const s = g.subgrupos.find(x => x.id === id); if (s) { label = `${s.numero} ${s.nome}`; break } }
                return (
                  <button key={'sub-' + id} type="button" onClick={() => toggleSubgrupo(id)}
                    className="flex items-center gap-1 text-[11px] font-mono text-white/60 hover:text-white px-2 py-0.5 rounded-lg border border-white/10 hover:border-white/25 transition-all">
                    {label} <span className="text-white/35">✕</span>
                  </button>
                )
              })}
              {temFiltro && (
                <button type="button" onClick={limparFiltros}
                  className="text-[11px] font-mono text-white/35 hover:text-white/60 px-2 py-0.5 transition-all">
                  Limpar tudo
                </button>
              )}
            </div>
            <span className="text-[11px] text-white/30 font-mono flex-shrink-0">
              {temFiltro ? `${equipsFiltrados.length} de ${equips.length}` : `${equips.length} total`}
            </span>
          </div>

          {equips.length === 0 ? (
            <div className="card p-10 text-center text-white/25 text-sm">Nenhum equipamento cadastrado.</div>
          ) : equipsFiltrados.length === 0 ? (
            <div className="card p-10 text-center text-white/25 text-sm">Nenhum equipamento neste filtro.</div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead className="tbl-head">
                  <tr>
                    <th onClick={() => toggleSort('tag')} className={thCls}>
                      <span className="flex items-center gap-1">Tag <SortIcon field="tag" sortBy={sortBy} sortDir={sortDir}/></span>
                    </th>
                    <th onClick={() => toggleSort('nome')} className={thCls}>
                      <span className="flex items-center gap-1">Nome <SortIcon field="nome" sortBy={sortBy} sortDir={sortDir}/></span>
                    </th>
                    <th>Grupo</th>
                    <th>Subgrupo</th>
                    <th onClick={() => toggleSort('proxCal')} className={thCls}>
                      <span className="flex items-center gap-1">Próx. Calibração <SortIcon field="proxCal" sortBy={sortBy} sortDir={sortDir}/></span>
                    </th>
                    <th onClick={() => toggleSort('status')} className={thCls}>
                      <span className="flex items-center gap-1">Status <SortIcon field="status" sortBy={sortBy} sortDir={sortDir}/></span>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {equipsFiltrados.map(e => {
                    const Icon = ICONES[e.grupoId] ?? Gauge
                    const g    = grupos.find(g => g.id === e.grupoId)
                    const cor  = GRUPO_CORES[g?.cor ?? 'gray']
                    return (
                      <tr key={e.id} className="tbl-row">
                        <td>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="tag-chip">{e.tag}</span>
                            {(() => { const f = camposFaltando(e); return f.length > 0 ? (
                              <span title={`Incompleto: ${f.join(', ')}`}
                                className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"/>
                            ) : null })()}
                          </span>
                        </td>
                        <td className="font-medium text-white/80">{e.nome}</td>
                        <td>
                          <span className="inline-flex items-center gap-1.5">
                            <Icon size={12} style={{ color: cor }}/>
                            <span className="text-[11px] text-white/50">{g?.nome ?? e.grupoId}</span>
                          </span>
                        </td>
                        <td><span className="text-[10px] text-white/40 font-mono">{e.subgrupoId}</span></td>
                        <td className="font-mono text-[11px]">{fmt(e.proximaCalibracao)}</td>
                        <td><StatusPill status={e.status}/></td>
                        <td>
                          <Link href={`/equipamentos/${e.id}`} className="text-white/25 hover:text-white transition-colors">
                            <ChevronRight size={14}/>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
