'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight, Zap, Gauge, Waves, Radio, SlidersHorizontal, Thermometer, FolderInput, Loader2, CheckCircle2, AlertTriangle, XCircle, ArrowUpDown, ArrowUp, ArrowDown, FileWarning, X, Search, Trash2, Lock, Cpu, RefreshCw } from 'lucide-react'
import { FilterDropdown } from '@/components/FilterDropdown'
import { Paginacao } from '@/components/Paginacao'
import { fmt, diasAte } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { EquipamentoEMC, GrupoId, StatusEquipamento } from '@/lib/equipamentos/tipos'
import { exigeCalibrarAntesDoUso } from '@/lib/equipamentos/calibracao'
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
}
interface RascunhoItem { tag: string; folder: string; motivo: string; certPath?: string; em: string; lab?: string; acreditacao?: string; equipamento?: string; cadastravel?: boolean }

interface ScanResult {
  ok: boolean
  error?: string
  resultados?: { folder: string; certPath: string | null; text?: string; acText?: string; items?: unknown[]; error?: string }[]
}
type LabAPI = {
  scanCertificados?: (p: string) => Promise<ScanResult>
  listMae?: (p: string) => Promise<{ ok: boolean; error?: string; folders?: { folder: string; dir: string; mtime?: number }[] }>
  scanBatch?: (folders: { folder: string; dir: string }[]) => Promise<ScanResult>
  rescanPendentes?: (itens: { folder: string; certPath?: string }[]) => Promise<ScanResult>
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

type SortKey = 'tag' | 'nome' | 'grupo' | 'sub' | 'prox' | 'status'
const FILTROS_KEY = 'equip_filtros_v1'

// Status sem periodicidade de calibração → não mostra "próxima calibração".
const SEM_PROX_CAL = new Set(['fora', 'sem-calibracao', 'calibrar-antes-uso'])

// Status "ao vivo": se vencido há mais que a periodicidade da análise crítica
// (ver lib/equipamentos/calibracao.ts), escala pra "calibrar antes do uso" —
// mesmo que o campo status salvo ainda esteja em 'ativo'/'calibrar' (não
// depende de reabrir o cadastro pra recalcular; respeita 'fora'/'sem-calibracao').
function statusEfetivo(e: EquipamentoEMC): StatusEquipamento {
  if ((e.status === 'ativo' || e.status === 'calibrar') && exigeCalibrarAntesDoUso(e.proximaCalibracao)) {
    return 'calibrar-antes-uso'
  }
  return e.status
}

function StatusPill({ status }: { status: string }) {
  if (status === 'ativo')              return <span className="badge-success">Ativo</span>
  if (status === 'calibrar')           return <span className="badge-warning">Calibrar</span>
  if (status === 'sem-calibracao')     return <span className="badge" style={{ background:'rgba(148,163,184,0.12)', color:'#94A3B8', border:'1px solid rgba(148,163,184,0.25)' }}>Não requer calibração</span>
  if (status === 'calibrar-antes-uso') return <span className="badge-warning">Calibrar antes do uso</span>
  return <span className="badge-danger">Fora</span>
}

// Campos que faltam no cadastro (marca pendência na lista).
function pendenciasEquip(e: EquipamentoEMC): string[] {
  const p: string[] = []
  if (!e.fabricante)         p.push('fabricante')
  if (!e.modelo)             p.push('modelo')
  if (!e.serie)              p.push('série')
  if (!e.ultimaCalibracao)   p.push('última calibração')
  if (!e.proximaCalibracao)  p.push('próxima calibração')
  return p
}

// Calibração vencida? (status manual ou data de próxima calibração no passado)
function calibVencida(e: EquipamentoEMC): boolean {
  if (e.status === 'calibrar') return true
  const d = diasAte(e.proximaCalibracao)
  return typeof d === 'number' && d < 0
}

// Resumo de pendências do equipamento.
function infoPendencia(e: EquipamentoEMC): { vencido: boolean; faltam: string[]; tem: boolean } {
  const vencido = calibVencida(e)
  const faltam = pendenciasEquip(e)
  return { vencido, faltam, tem: vencido || faltam.length > 0 }
}

// Códigos de pendência (para o filtro granular).
const PEND_OPCOES: { id: string; label: string }[] = [
  { id: 'vencido',    label: 'Vencido' },
  { id: 'fabricante', label: 'Sem fabricante' },
  { id: 'modelo',     label: 'Sem modelo' },
  { id: 'serie',      label: 'Sem série' },
  { id: 'calibracao', label: 'Sem data de calibração' },
]
// Degraus (log-ish) do filtro "vencido há ≥": 0 = qualquer, até 5 anos.
const VENC_DEGRAUS: { meses: number; label: string }[] = [
  { meses: 0,  label: 'qualquer' },
  { meses: 1,  label: '1 mês' },
  { meses: 2,  label: '2 meses' },
  { meses: 3,  label: '3 meses' },
  { meses: 6,  label: '6 meses' },
  { meses: 12, label: '1 ano' },
  { meses: 24, label: '2 anos' },
  { meses: 36, label: '3 anos' },
  { meses: 60, label: '5 anos+' },
]
// Há quantos meses está vencido (0 se não está vencido ou sem data).
function mesesVencido(e: EquipamentoEMC): number {
  const d = diasAte(e.proximaCalibracao)
  return typeof d === 'number' && d < 0 ? Math.floor(-d / 30) : 0
}

function codigosPendencia(e: EquipamentoEMC): string[] {
  const c: string[] = []
  if (calibVencida(e))                                    c.push('vencido')
  if (!e.fabricante)                                      c.push('fabricante')
  if (!e.modelo)                                          c.push('modelo')
  if (!e.serie)                                           c.push('serie')
  if (!e.ultimaCalibracao || !e.proximaCalibracao)       c.push('calibracao')
  return c
}

export default function EquipamentosPage() {
  const [equips, setEquips] = useState<EquipamentoEMC[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [tax, setTax] = useState<Taxonomia>({ areas: [], siglas: [], tipos: [] })

  // Filtros MÚLTIPLOS (combináveis) + ordenação — persistidos entre navegações.
  const [fAreas,  setFAreas]  = useState<string[]>([])
  const [fSiglas, setFSiglas] = useState<string[]>([])
  const [fGrupos, setFGrupos] = useState<string[]>([])
  const [fSubs,   setFSubs]   = useState<string[]>([])
  const [fLabs,   setFLabs]   = useState<string[]>([])            // filtro por laboratório calibrador
  const [busca,   setBusca]   = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('tag')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [fPend, setFPend] = useState<string[]>([])
  const [vencIdx, setVencIdx] = useState(0)   // índice no degrau log de "vencido há ≥ X"
  const [pronto,  setPronto]  = useState(false)

  // Importação em lote
  const [impProgresso, setImpProgresso] = useState<string | null>(null)
  const [impRelatorio, setImpRelatorio] = useState<RelatorioImport | null>(null)
  const [rascunho, setRascunho] = useState<RascunhoItem[]>([])
  const [abaEquip, setAbaEquip] = useState<'lista' | 'rascunho'>('lista')
  const [sel, setSel] = useState<string[]>([])   // ids selecionados p/ exclusão em lote
  const [selRasc, setSelRasc] = useState<string[]>([])  // folders selecionados no rascunho
  const [rascSort, setRascSort] = useState<'asc' | 'desc'>('asc')  // ordenação do rascunho por motivo
  const [fMotivo, setFMotivo] = useState<string[]>([])              // filtro por motivo no rascunho
  const [fSit, setFSit] = useState<string[]>([])                    // filtro por situação (cadastrável)
  const [fLabRasc, setFLabRasc] = useState<string[]>([])            // filtro por laboratório (CAL)
  const [rescanLoading, setRescanLoading] = useState(false)
  const [verificando, setVerificando] = useState(false)   // "verificar certificados novos"
  const [porPagina, setPorPagina] = useState(25)
  const [pagina, setPagina] = useState(1)
  const [porPagRasc, setPorPagRasc] = useState(25)
  const [pagRasc, setPagRasc] = useState(1)
  const [showExcluir, setShowExcluir] = useState(false)   // modal "excluir tudo" (prompt() não funciona no Electron)
  const [senhaExcluir, setSenhaExcluir] = useState('')

  // Carrega filtros salvos (1×, no mount)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTROS_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        setFAreas(s.fAreas ?? [])
        setFSiglas(s.fSiglas ?? []); setFGrupos(s.fGrupos ?? []); setFSubs(s.fSubs ?? [])
        setFPend(Array.isArray(s.fPend) ? s.fPend : [])
        setFLabs(Array.isArray(s.fLabs) ? s.fLabs : [])
        if (s.sortKey) setSortKey(s.sortKey); if (s.sortDir) setSortDir(s.sortDir)
      }
    } catch {}
    setPronto(true)
  }, [])

  // Salva filtros sempre que mudam (após o carregamento inicial)
  useEffect(() => {
    if (!pronto) return
    try { localStorage.setItem(FILTROS_KEY, JSON.stringify({ fAreas, fSiglas, fGrupos, fSubs, sortKey, sortDir, fPend, fLabs })) } catch {}
  }, [pronto, fAreas, fSiglas, fGrupos, fSubs, sortKey, sortDir, fPend, fLabs])

  // Volta pra página 1 quando o filtro/busca/tamanho muda
  useEffect(() => { setPagina(1) }, [busca, fAreas, fSiglas, fGrupos, fSubs, fPend, fLabs, vencIdx, porPagina])

  function carregarRascunho() {
    fetch('/api/equipamentos/importar-lote').then(r => r.json()).then(d => setRascunho(Array.isArray(d) ? d : [])).catch(() => {})
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/equipamentos').then(r => r.json()),
      fetch('/api/grupos').then(r => r.json()),
      fetch('/api/taxonomia').then(r => r.json()),
    ]).then(([e, g, t]) => {
      setEquips(Array.isArray(e) ? e : [])
      setGrupos(Array.isArray(g) ? g : [])
      if (t && !t.error) setTax({ areas: t.areas ?? [], siglas: t.siglas ?? [], tipos: t.tipos ?? [] })
    }).catch(() => {})
    carregarRascunho()
  }, [])

  // Exclusão TOTAL (equipamentos + certificados) — protegida por senha fixa.
  // Usa MODAL próprio: window.prompt() não é suportado no Electron (retorna null).
  function excluirTudo() {
    setSenhaExcluir('')
    setShowExcluir(true)
  }
  async function confirmarExcluirTudo() {
    if (senhaExcluir !== 'EMC2026') { alert('Senha incorreta.'); return }
    try {
      await fetch('/api/equipamentos',  { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
      await fetch('/api/certificados',  { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
      setEquips([]); setSel([]); carregarRascunho()
      setShowExcluir(false)
      alert('Tudo excluído.')
    } catch (e) { alert('Erro: ' + String(e)) }
  }

  async function importarPastaMae() {
    const api = (window as unknown as { electronAPI?: LabAPI }).electronAPI
    if (!api?.browseFolder || !api?.listMae || !api?.scanBatch) { alert('Disponível apenas no aplicativo (Electron).'); return }
    const sel = await api.browseFolder('Pasta-mãe — uma subpasta por TAG, cada uma com o …Certificado.pdf')
    if (!sel || sel.canceled || !sel.folderPath) return
    try {
      setImpProgresso('Listando as pastas…')
      const lista = await api.listMae(sel.folderPath)
      if (!lista.ok || !lista.folders) { setImpProgresso(null); alert(lista.error || 'Falha ao ler a pasta-mãe.'); return }
      let folders = lista.folders
      // #3.2: pastas paradas há +7 anos (sem alteração) → provável fora de uso.
      const CUTOFF_7A = Date.now() - 7 * 365 * 24 * 3600 * 1000
      const antigas = new Set(folders.filter(f => f.mtime && f.mtime < CUTOFF_7A).map(f => f.folder))
      let acaoAntigas: 'cadastrar' | 'rascunho' | 'ignorar' = 'cadastrar'
      if (antigas.size) {
        if (confirm(`${antigas.size} equipamento(s) com mais de 7 anos sem alteração na pasta — provavelmente fora de uso.\n\nDeseja CADASTRAR esses também?`)) {
          acaoAntigas = 'cadastrar'
        } else if (confirm(`Enviar esses ${antigas.size} para o RASCUNHO?\n\nOK = rascunho · Cancelar = ignorar (não importar)`)) {
          acaoAntigas = 'rascunho'
        } else {
          acaoAntigas = 'ignorar'
        }
      }
      if (acaoAntigas === 'ignorar') folders = folders.filter(f => !antigas.has(f.folder))
      const total = folders.length
      // Processa em LOTES: lê os PDFs do lote (Electron) e já cadastra (rota),
      // mostrando progresso. Evita travar a UI e o POST gigante.
      const CHUNK = 25
      const acc: RelatorioImport = { total, sucessos: [], atualizados: [], pulados: [], erros: [] }
      for (let i = 0; i < total; i += CHUNK) {
        const lote = folders.slice(i, i + CHUNK)
        setImpProgresso(`Processando ${Math.min(i + CHUNK, total)}/${total}…`)
        const scan = await api.scanBatch(lote)
        if (!scan.ok || !scan.resultados) continue
        const itens = acaoAntigas === 'rascunho'
          ? scan.resultados.map(r => antigas.has(r.folder) ? { ...r, forcarRascunho: true } : r)
          : scan.resultados
        const r = await fetch('/api/equipamentos/importar-lote', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itens }),
        })
        if (!r.ok) continue
        const rel = await r.json() as RelatorioImport
        acc.sucessos.push(...rel.sucessos)
        acc.atualizados.push(...rel.atualizados)
        acc.pulados.push(...rel.pulados)
        acc.erros.push(...rel.erros)
      }
      setImpRelatorio(acc)
      fetch('/api/equipamentos').then(x => x.json()).then(e => setEquips(Array.isArray(e) ? e : [])).catch(() => {})
      carregarRascunho()
    } catch (e) { alert('Erro: ' + String(e)) }
    finally { setImpProgresso(null) }
  }

  // Verifica se apareceu certificado/análise crítica NOVO nas subpastas (por TAG)
  // da pasta-mãe e atualiza SÓ os equipamentos existentes. É READ-ONLY na pasta:
  // apenas lê os PDFs (scanBatch); nunca cria, move, apaga ou edita arquivos lá.
  async function verificarCertificadosNovos(trocarPasta = false) {
    const api = (window as unknown as { electronAPI?: LabAPI }).electronAPI
    if (!api?.listMae || !api?.scanBatch) { alert('Disponível apenas no aplicativo (Electron).'); return }
    let pasta = trocarPasta ? '' : (localStorage.getItem('pastaMaeCerts') || '')
    if (!pasta) {
      if (!api.browseFolder) { alert('Selecione a pasta dos certificados.'); return }
      const sel = await api.browseFolder('Pasta dos certificados — uma subpasta por TAG do padrão')
      if (!sel || sel.canceled || !sel.folderPath) return
      pasta = sel.folderPath
      try { localStorage.setItem('pastaMaeCerts', pasta) } catch {}
    }
    setVerificando(true)
    try {
      const lista = await api.listMae(pasta)
      if (!lista.ok || !lista.folders) { alert(lista.error || 'Falha ao ler a pasta.'); return }
      const CHUNK = 25
      const scans: { folder: string; text?: string; acText?: string; certPath?: string | null }[] = []
      for (let i = 0; i < lista.folders.length; i += CHUNK) {
        const lote = lista.folders.slice(i, i + CHUNK)
        const scan = await api.scanBatch(lote)
        if (scan.ok && scan.resultados) scans.push(...scan.resultados.map(r => ({ folder: r.folder, text: r.text, acText: r.acText, certPath: r.certPath })))
      }
      const r = await fetch('/api/equipamentos/atualizar-certificados', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens: scans }),
      })
      const j = await r.json()
      if (!r.ok) { alert(j.error || 'Falha ao atualizar.'); return }
      fetch('/api/equipamentos').then(x => x.json()).then(e => setEquips(Array.isArray(e) ? e : [])).catch(() => {})
      alert(j.total
        ? `${j.total} atualização(ões):\n\n` + j.atualizados.map((a: { tag: string; oque: string; de: string; para: string }) => `${a.tag} — ${a.oque}: ${a.de} → ${a.para}`).join('\n')
        : 'Nenhum certificado/análise crítica novo encontrado.')
    } catch (e) { alert('Erro: ' + String(e)) }
    finally { setVerificando(false) }
  }

  const temFiltro = fAreas.length + fSiglas.length + fGrupos.length + fSubs.length + fPend.length + fLabs.length > 0 || !!busca.trim()
  const limpar = () => { setFAreas([]); setFSiglas([]); setFGrupos([]); setFSubs([]); setFPend([]); setFLabs([]); setBusca('') }

  // Área de um equipamento = área da sigla da sua TAG (via taxonomia)
  const areaDoEquip = (e: EquipamentoEMC) =>
    tax.siglas.find(x => x.sigla === siglaDaTag(e.tag))?.areaId ?? ''

  // ── Filtros ENCADEADOS (faceted) ──────────────────────────────────────────
  // Cada dimensão é um predicado independente. Os contadores de cada dropdown
  // são calculados sobre o conjunto filtrado por TODAS as OUTRAS dimensões — só
  // não por si mesmo (senão suas opções colapsariam nas já marcadas). Assim,
  // marcar uma sigla recalcula os contadores de grupos/subgrupos/pendências
  // consequentes do filtro.
  const _q = busca.trim().toLowerCase()
  const passa = {
    area:  (e: EquipamentoEMC) => fAreas.length === 0  || fAreas.includes(areaDoEquip(e)),
    sigla: (e: EquipamentoEMC) => fSiglas.length === 0 || fSiglas.includes(siglaDaTag(e.tag)),
    grupo: (e: EquipamentoEMC) => fGrupos.length === 0 || fGrupos.includes(e.grupoId),
    sub:   (e: EquipamentoEMC) => fSubs.length === 0   || fSubs.includes(e.subgrupoId),
    lab:   (e: EquipamentoEMC) => fLabs.length === 0   || fLabs.includes(e.labCalibracao || ''),
    pend:  (e: EquipamentoEMC) => fPend.length === 0   || fPend.some(t => {
      const cods = codigosPendencia(e)
      if (t === 'vencido') return cods.includes('vencido') && mesesVencido(e) >= VENC_DEGRAUS[vencIdx].meses
      return cods.includes(t)
    }),
    busca: (e: EquipamentoEMC) => !_q || e.tag.toLowerCase().includes(_q) || e.nome.toLowerCase().includes(_q),
  }
  type Dim = keyof typeof passa
  const DIMS = Object.keys(passa) as Dim[]
  // Equipamentos que passam por todas as dimensões, exceto a indicada.
  const filtrarExceto = (exceto: Dim) => equips.filter(e => DIMS.every(d => d === exceto || passa[d](e)))
  const baseArea  = filtrarExceto('area')
  const baseSigla = filtrarExceto('sigla')
  const baseGrupo = filtrarExceto('grupo')
  const baseSub   = filtrarExceto('sub')
  const baseLab   = filtrarExceto('lab')
  const basePend  = filtrarExceto('pend')

  const pendPorTipo = (id: string) => basePend.filter(e => codigosPendencia(e).includes(id)).length

  // Áreas presentes (com pelo menos 1 equipamento no conjunto encadeado)
  const areasPresentes = (() => {
    const cont = new Map<string, number>()
    for (const e of baseArea) { const a = areaDoEquip(e); if (a) cont.set(a, (cont.get(a) ?? 0) + 1) }
    return tax.areas.filter(a => cont.has(a.id) || fAreas.includes(a.id))
      .map(a => ({ id: a.id, nome: a.nome, n: cont.get(a.id) ?? 0, cor: GRUPO_CORES[a.cor] ?? '#94A3B8' }))
  })()

  function clicarSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  // Siglas presentes nas TAGs + significado/área da taxonomia (conjunto encadeado)
  const siglasPresentes = (() => {
    const cont = new Map<string, number>()
    for (const e of baseSigla) { const s = siglaDaTag(e.tag); if (s) cont.set(s, (cont.get(s) ?? 0) + 1) }
    for (const s of fSiglas) if (!cont.has(s)) cont.set(s, 0)   // mantém visíveis as já marcadas
    return [...cont.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sigla, n]) => {
      const def = tax.siglas.find(x => x.sigla === sigla)
      const area = def ? tax.areas.find(a => a.id === def.areaId) : undefined
      return { sigla, n, significado: def?.significado, cor: area ? GRUPO_CORES[area.cor] : '#94A3B8' }
    })
  })()

  // Laboratórios calibradores presentes (conjunto encadeado) — equipamentos sem
  // labCalibracao preenchido não entram na lista de opções.
  const labsPresentes = (() => {
    const cont = new Map<string, number>()
    for (const e of baseLab) { const l = e.labCalibracao; if (l) cont.set(l, (cont.get(l) ?? 0) + 1) }
    for (const l of fLabs) if (!cont.has(l)) cont.set(l, 0)   // mantém visíveis os já marcados
    return [...cont.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt')).map(([lab, n]) => ({ id: lab, label: lab, n }))
  })()

  // Aplica filtros (AND entre dimensões, OR dentro de cada uma) + ordenação
  const grupoNome = (id: string) => grupos.find(g => g.id === id)?.nome ?? id
  const equipsFiltrados = (() => {
    let lista = equips.filter(e => DIMS.every(d => passa[d](e)))
    const dir = sortDir === 'asc' ? 1 : -1
    const val = (e: EquipamentoEMC): string =>
      sortKey === 'tag'   ? e.tag :
      sortKey === 'nome'  ? e.nome :
      sortKey === 'grupo' ? grupoNome(e.grupoId) :
      sortKey === 'sub'   ? e.subgrupoId :
      sortKey === 'prox'  ? (e.proximaCalibracao || '') :
                            statusEfetivo(e)
    lista = [...lista].sort((a, b) => val(a).localeCompare(val(b), 'pt', { numeric: true }) * dir)
    return lista
  })()

  // ── Paginação (usuário escolhe o tamanho) ─────────────────────────
  const totalPaginas = Math.max(1, Math.ceil(equipsFiltrados.length / porPagina))
  const pgAtual = Math.min(pagina, totalPaginas)
  const equipsPagina = equipsFiltrados.slice((pgAtual - 1) * porPagina, pgAtual * porPagina)

  // Filtros do rascunho: motivo, situação (cadastrável) e laboratório (CAL).
  const labRasc = (r: RascunhoItem) => r.lab || r.acreditacao || '—'
  const contagem = (sel: (r: RascunhoItem) => string) => {
    const m = new Map<string, number>()
    for (const r of rascunho) { const k = sel(r); m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, label: id, count: n }))
  }
  const motivosRasc = contagem(r => r.motivo || '—')
  const labsRasc = contagem(labRasc).filter(o => o.id !== '—')
  const sitRasc = [
    { id: 'cadastravel', label: 'Cadastrável', count: rascunho.filter(r => r.cadastravel).length },
    { id: 'nao',         label: 'Sem TAG/PDF', count: rascunho.filter(r => !r.cadastravel).length },
  ].filter(o => o.count > 0)
  const rascFiltrado = rascunho.filter(r =>
    (fMotivo.length === 0 || fMotivo.includes(r.motivo || '—')) &&
    (fSit.length === 0 || fSit.includes(r.cadastravel ? 'cadastravel' : 'nao')) &&
    (fLabRasc.length === 0 || fLabRasc.includes(labRasc(r))),
  )
  const rascOrdenado = [...rascFiltrado].sort((a, b) => (a.motivo || '').localeCompare(b.motivo || '', 'pt') * (rascSort === 'asc' ? 1 : -1))
  const pgRascAtual = Math.min(pagRasc, Math.max(1, Math.ceil(rascOrdenado.length / porPagRasc)))
  const rascPagina = rascOrdenado.slice((pgRascAtual - 1) * porPagRasc, pgRascAtual * porPagRasc)

  // ── Seleção em lote (marca os da PÁGINA atual) ─────────────────────
  const idsVisiveis = equipsPagina.map(e => e.id)
  const todosSelecionados = idsVisiveis.length > 0 && idsVisiveis.every(id => sel.includes(id))
  const toggleSel = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleTodos = () => setSel(todosSelecionados ? sel.filter(id => !idsVisiveis.includes(id)) : [...new Set([...sel, ...idsVisiveis])])
  async function excluirSelecionados() {
    if (!sel.length) return
    if (!confirm(`Excluir ${sel.length} equipamento(s)? Esta ação não pode ser desfeita.`)) return
    const ids = sel
    const r = await fetch('/api/equipamentos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    if (r.ok) { setEquips(prev => prev.filter(e => !ids.includes(e.id))); setSel([]) }
    else alert('Falha ao excluir.')
  }

  // ── Rascunho: seleção + exclusão ──────────────────────────────────
  const keyRasc = (r: RascunhoItem) => r.folder || r.tag
  const rascSelTodos = rascunho.length > 0 && rascunho.every(r => selRasc.includes(keyRasc(r)))
  const toggleSelRasc = (k: string) => setSelRasc(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])
  async function excluirRascunho(all: boolean) {
    const folders = all ? [] : selRasc
    if (!all && !folders.length) return
    if (!confirm(all ? `Excluir TODOS os ${rascunho.length} itens do rascunho?` : `Excluir ${folders.length} item(ns) do rascunho?`)) return
    const r = await fetch('/api/equipamentos/importar-lote', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(all ? { all: true } : { folders }),
    })
    if (r.ok) { setSelRasc([]); carregarRascunho() } else alert('Falha ao limpar rascunho.')
  }

  // Re-varre os PDFs pendentes (com certPath). modo 'amostra' = 2ª varredura,
  // cadastra só os dados do equipamento (sem certificado/grandeza).
  async function rescanRascunho(modo?: 'amostra') {
    const api = (window as unknown as { electronAPI?: LabAPI }).electronAPI
    if (!api?.rescanPendentes) { alert('Disponível apenas no aplicativo.'); return }
    const alvo = rascunho.filter(r => r.certPath)
    if (!alvo.length) { alert('Nenhum item com PDF para varrer.'); return }
    if (modo === 'amostra' && !confirm('Cadastrar os pendentes pelos dados da amostra (sem certificado nem grandeza)?')) return
    setRescanLoading(true)
    try {
      const CHUNK = 25
      for (let i = 0; i < alvo.length; i += CHUNK) {
        const lote = alvo.slice(i, i + CHUNK).map(r => ({ folder: r.folder, certPath: r.certPath }))
        const scan = await api.rescanPendentes(lote)
        if (!scan.ok || !scan.resultados) continue
        await fetch('/api/equipamentos/importar-lote', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itens: scan.resultados, modo: modo || 'certificado' }),
        })
      }
      fetch('/api/equipamentos').then(x => x.json()).then(e => setEquips(Array.isArray(e) ? e : [])).catch(() => {})
      carregarRascunho()
      alert(modo === 'amostra' ? 'Cadastro pela amostra concluído.' : 'Re-varredura concluída.')
    } catch (e) { alert('Erro: ' + String(e)) }
    finally { setRescanLoading(false) }
  }

  const SortTh = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cn('cursor-pointer select-none hover:text-white/80', className)} onClick={() => clicarSort(k)}>
      <span className="inline-flex items-center gap-1">{label}
        {sortKey === k ? (sortDir === 'asc' ? <ArrowUp size={11}/> : <ArrowDown size={11}/>) : <ArrowUpDown size={11} className="opacity-30"/>}
      </span>
    </th>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Laboratório · EMC</p>
          <h1 className="page-title">Equipamentos</h1>
          <p className="page-sub">Filtros combináveis · ordenável</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/equipamentos/novo" className="btn-primary"><Plus size={13}/> Novo Equipamento</Link>
          <button type="button" onClick={importarPastaMae} disabled={!!impProgresso} className="btn-secondary">
            {impProgresso ? <Loader2 size={13} className="animate-spin"/> : <FolderInput size={13}/>}
            {impProgresso ? 'Importando…' : 'Importar pasta-mãe'}
          </button>
          <button type="button" onClick={(e) => verificarCertificadosNovos(e.shiftKey)} disabled={verificando} className="btn-secondary"
            title="Lê a pasta dos certificados (só leitura) e atualiza os vencidos que tiverem certificado/análise crítica novo. Shift+clique = trocar a pasta.">
            {verificando ? <Loader2 size={13} className="animate-spin"/> : <RefreshCw size={13}/>}
            {verificando ? 'Verificando…' : 'Verificar certificados novos'}
          </button>
          <Link href="/checagens/nova" className="btn-secondary"><Plus size={13}/> Nova Checagem</Link>
          <button type="button" onClick={excluirTudo} title="Excluir TODOS os equipamentos e certificados (com senha)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-red-300/80 border border-red-500/30 hover:bg-red-500/15 transition-all">
            <Lock size={12}/> Excluir tudo
          </button>
        </div>
      </div>

      {showExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowExcluir(false)}>
          <div className="card w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2 text-red-300">
              <AlertTriangle size={18}/>
              <h3 className="text-[15px] font-semibold">Excluir TODOS os equipamentos e certificados</h3>
            </div>
            <p className="text-[12px] text-white/60 mb-3">
              Isso apaga <b>todos</b> os equipamentos e certificados cadastrados. Não dá pra desfazer.
              Digite a senha para confirmar.
            </p>
            <input
              type="password" autoFocus value={senhaExcluir}
              onChange={e => setSenhaExcluir(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmarExcluirTudo(); if (e.key === 'Escape') setShowExcluir(false) }}
              placeholder="Senha" className="input w-full mb-3"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowExcluir(false)} className="btn-secondary">Cancelar</button>
              <button type="button" onClick={confirmarExcluirTudo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] bg-red-500/20 text-red-200 border border-red-500/40 hover:bg-red-500/30 transition-all">
                <Trash2 size={13}/> Excluir tudo
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <p className="flex items-center gap-1.5 text-amber-400 font-medium mb-1"><AlertTriangle size={14}/> Não cadastrados — vão pro rascunho ({impRelatorio.pulados.length})</p>
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
            <div className="flex justify-end mt-5"><button type="button" onClick={() => setImpRelatorio(null)} className="btn-primary">Fechar</button></div>
          </div>
        </div>
      )}

      {/* Sub-abas: Equipamentos | Rascunho */}
      <div className="flex items-center gap-1 border-b border-white/8 mb-5">
        {([['lista', 'Equipamentos', equips.length], ['rascunho', 'Rascunho', rascunho.length]] as const).map(([id, label, n]) => (
          <button key={id} type="button" onClick={() => setAbaEquip(id)}
            className={cn('flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium rounded-t-lg transition-all border-b-2 -mb-px',
              abaEquip === id ? 'text-white border-gold' : 'text-white/40 border-transparent hover:text-white/70')}>
            {id === 'rascunho' && <FileWarning size={13} className={abaEquip === id ? 'text-amber-400' : ''}/>}
            {label}
            {n > 0 && <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded-md',
              id === 'rascunho' ? 'bg-amber-400/20 text-amber-300' : 'bg-white/10 text-white/50')}>{n}</span>}
          </button>
        ))}
      </div>

      {/* ══ Aba RASCUNHO — TAGs de pasta não cadastradas ═══════════════════ */}
      {abaEquip === 'rascunho' && (
        rascunho.length === 0 ? (
          <div className="card p-10 text-center text-white/25 text-sm">
            Nenhum rascunho. As pastas que não puderem ser cadastradas na importação aparecem aqui.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2 flex-wrap">
              <FileWarning size={15} className="text-amber-400"/>
              <span className="text-[12px] text-amber-300/90 font-medium">{rascunho.length} não cadastrada(s)</span>
              <FilterDropdown label="Situação" selected={fSit} onChange={setFSit} options={sitRasc} />
              <FilterDropdown label="Motivo" selected={fMotivo} onChange={setFMotivo}
                options={motivosRasc.map(m => ({ id: m.id, label: m.label, count: m.count }))} />
              <FilterDropdown label="Laboratório" selected={fLabRasc} onChange={setFLabRasc} options={labsRasc} />
              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={() => rescanRascunho()} disabled={rescanLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-teal border border-teal/30 hover:bg-teal/10 transition-all disabled:opacity-50">
                  {rescanLoading ? <Loader2 size={12} className="animate-spin"/> : <Search size={12}/>}
                  {rescanLoading ? 'Varrendo…' : 'Varrer novamente'}
                </button>
                <button type="button" onClick={() => rescanRascunho('amostra')} disabled={rescanLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-white/70 border border-white/15 hover:bg-white/8 transition-all disabled:opacity-50"
                  title="2ª varredura: cadastra só os dados da amostra (ex.: pela análise crítica), sem certificado/grandeza">
                  <Cpu size={12}/> Cadastrar pela amostra
                </button>
                {selRasc.length > 0 && (
                  <button type="button" onClick={() => excluirRascunho(false)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25 transition-all">
                    <Trash2 size={12}/> Excluir selecionados ({selRasc.length})
                  </button>
                )}
                <button type="button" onClick={() => excluirRascunho(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-red-300/80 border border-red-500/30 hover:bg-red-500/15 transition-all">
                  <Trash2 size={12}/> Excluir todos
                </button>
              </div>
            </div>
            <table className="w-full text-[12px]">
              <thead className="tbl-head">
                <tr>
                  <th className="w-8 text-center">
                    <input type="checkbox" checked={rascSelTodos}
                      onChange={() => setSelRasc(rascSelTodos ? [] : rascunho.map(keyRasc))}
                      className="accent-teal cursor-pointer" title="Selecionar todos"/>
                  </th>
                  <th className="w-32">TAG / Pasta</th>
                  <th className="cursor-pointer select-none hover:text-white/80" onClick={() => setRascSort(d => d === 'asc' ? 'desc' : 'asc')}>
                    <span className="inline-flex items-center gap-1">Motivo
                      {rascSort === 'asc' ? <ArrowUp size={11}/> : <ArrowDown size={11}/>}
                    </span>
                  </th>
                  <th className="w-44">Laboratório</th>
                  <th className="w-24">Situação</th>
                  <th className="w-24">Quando</th><th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {rascPagina.map((r, i) => (
                  <tr key={i} className={cn('tbl-row', selRasc.includes(keyRasc(r)) && 'bg-teal/5')}>
                    <td className="text-center">
                      <input type="checkbox" checked={selRasc.includes(keyRasc(r))} onChange={() => toggleSelRasc(keyRasc(r))}
                        className="accent-teal cursor-pointer"/>
                    </td>
                    <td><span className="font-mono text-amber-300/80">{r.tag || r.folder}</span></td>
                    <td className="text-white/60">{r.motivo}</td>
                    <td>
                      {r.lab || r.acreditacao ? (
                        <span className="text-[11px] text-white/70">{r.lab || '—'}{r.acreditacao && <span className="text-white/35 font-mono ml-1">{r.acreditacao}</span>}</span>
                      ) : <span className="text-white/20 text-[11px]">—</span>}
                    </td>
                    <td>
                      {r.cadastravel
                        ? <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-teal/15 text-teal border border-teal/30">Cadastrável</span>
                        : <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-white/5 text-white/30 border border-white/10">Sem TAG/PDF</span>}
                    </td>
                    <td className="font-mono text-[10px] text-white/35">{r.em ? fmt(r.em.slice(0, 10)) : '—'}</td>
                    <td>
                      {r.certPath && (
                        <button type="button" title="Abrir o PDF da pasta"
                          onClick={() => (window as unknown as { electronAPI?: { openPath?: (p: string) => void } }).electronAPI?.openPath?.(r.certPath!)}
                          className="text-white/30 hover:text-teal transition-colors text-[11px] underline">PDF</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginacao total={rascOrdenado.length} porPagina={porPagRasc} setPorPagina={setPorPagRasc} pagina={pagRasc} setPagina={setPagRasc}/>
          </div>
        )
      )}

      {/* ══ Aba LISTA ══════════════════════════════════════════════════════ */}
      {abaEquip === 'lista' && (<>
      {/* ── Busca + filtros (dropdowns) ─────────────────────────────────── */}
      <div className="card p-3 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Busca inline */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30"/>
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por TAG ou nome…"
              className="input text-[12px] py-1.5 pl-8 w-full" />
          </div>
          {/* Dropdowns de filtro */}
          <FilterDropdown label="Áreas" selected={fAreas} onChange={setFAreas}
            options={areasPresentes.map(a => ({ id: a.id, label: a.nome, count: a.n, color: a.cor }))} />
          <FilterDropdown label="Siglas" selected={fSiglas} onChange={setFSiglas}
            options={siglasPresentes.map(s => ({ id: s.sigla, label: s.significado ? `${s.sigla} · ${s.significado}` : s.sigla, count: s.n, color: s.cor }))} />
          <FilterDropdown label="Grupos" selected={fGrupos} onChange={setFGrupos}
            options={grupos.map(g => ({ id: g.id, label: g.nome, count: baseGrupo.filter(e => e.grupoId === g.id).length, color: GRUPO_CORES[g.cor] ?? '#94A3B8' })).filter(o => o.count > 0 || fGrupos.includes(o.id))} />
          <FilterDropdown label="Subgrupos" selected={fSubs} onChange={setFSubs}
            options={grupos.flatMap(g => g.subgrupos.map(s => ({ id: s.id, label: s.nome, count: baseSub.filter(e => e.subgrupoId === s.id).length, color: GRUPO_CORES[g.cor] ?? '#94A3B8' }))).filter(o => o.count > 0 || fSubs.includes(o.id))} />
          <FilterDropdown label="Calibrado por" selected={fLabs} onChange={setFLabs}
            options={labsPresentes.map(l => ({ id: l.id, label: l.label, count: l.n }))} />
          <FilterDropdown label="Pendências" selected={fPend} onChange={setFPend} icon={<AlertTriangle size={12}/>}
            options={PEND_OPCOES.map(o => ({ id: o.id, label: o.label, count: pendPorTipo(o.id) })).filter(o => o.count > 0 || fPend.includes(o.id))} />
          {temFiltro && (
            <button type="button" onClick={limpar} className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white px-2 py-1.5 rounded-lg border border-white/10 hover:border-white/25 transition-all">
              <X size={11}/> Limpar
            </button>
          )}
        </div>
        {/* Slider de "vencido há ≥" (só quando o filtro Vencido está ativo) */}
        {fPend.includes('vencido') && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
            <span className="text-[11px] text-white/45 flex-shrink-0">Vencido há ≥</span>
            <input type="range" min={0} max={VENC_DEGRAUS.length - 1} step={1} value={vencIdx}
              onChange={e => setVencIdx(Number(e.target.value))}
              className="flex-1 max-w-xs accent-red-400 cursor-pointer"/>
            <span className="text-[12px] font-mono text-red-300/90 w-20">{VENC_DEGRAUS[vencIdx].label}</span>
          </div>
        )}
      </div>

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="font-display font-semibold text-[13px] text-white/60 uppercase tracking-widest">
          {temFiltro ? 'Filtrado' : 'Todos os equipamentos'}
        </h2>
        <span className="text-[11px] text-white/30 font-mono">
          {temFiltro ? `${equipsFiltrados.length} de ${equips.length}` : `${equips.length} total`}
        </span>
      </div>

      {sel.length > 0 && (
        <div className="card mb-3 px-4 py-2.5 flex items-center gap-3 border-red-500/30 bg-red-500/5">
          <span className="text-[12px] text-white/80 font-medium">{sel.length} selecionado(s)</span>
          <button type="button" onClick={excluirSelecionados}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25 transition-all">
            <Trash2 size={13}/> Excluir selecionados
          </button>
          <button type="button" onClick={() => setSel([])}
            className="text-[11px] text-white/45 hover:text-white px-2 py-1 rounded-lg border border-white/10 hover:border-white/25 transition-all">
            Limpar seleção
          </button>
        </div>
      )}

      {equips.length === 0 ? (
        <div className="card p-10 text-center text-white/25 text-sm">Nenhum equipamento cadastrado.</div>
      ) : equipsFiltrados.length === 0 ? (
        <div className="card p-10 text-center text-white/25 text-sm">Nenhum equipamento neste filtro.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="tbl-head">
              <tr>
                <th className="w-8 text-center">
                  <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos}
                    className="accent-teal cursor-pointer" title="Selecionar todos (visíveis)"/>
                </th>
                <SortTh k="tag" label="Tag"/>
                <SortTh k="nome" label="Nome"/>
                <SortTh k="grupo" label="Grupo"/>
                <SortTh k="sub" label="Subgrupo"/>
                <SortTh k="prox" label="Próx. Calibração"/>
                <SortTh k="status" label="Status"/>
                <th>Pendências</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {equipsPagina.map(e => {
                const Icon = ICONES[e.grupoId] ?? Gauge
                const g    = grupos.find(g => g.id === e.grupoId)
                const cor  = GRUPO_CORES[g?.cor ?? 'gray']
                const p = infoPendencia(e)
                return (
                  <tr key={e.id} className={cn('tbl-row', sel.includes(e.id) && 'bg-teal/5')}>
                    <td className="text-center">
                      <input type="checkbox" checked={sel.includes(e.id)} onChange={() => toggleSel(e.id)}
                        className="accent-teal cursor-pointer"/>
                    </td>
                    <td><span className="tag-chip">{e.tag}</span></td>
                    <td className="font-medium text-white/80">
                      {e.nome && e.nome !== e.tag
                        ? e.nome
                        : <span className="text-white/35 italic font-normal">sem nome</span>}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon size={12} style={{ color: cor }}/>
                        <span className="text-[11px] text-white/50">{g?.nome ?? e.grupoId}</span>
                      </span>
                    </td>
                    <td><span className="text-[10px] text-white/40 font-mono">{e.subgrupoId}</span></td>
                    <td className="font-mono text-[11px]">{SEM_PROX_CAL.has(e.status) ? <span className="text-white/20">—</span> : fmt(e.proximaCalibracao)}</td>
                    <td><StatusPill status={statusEfetivo(e)}/></td>
                    <td>
                      {!p.tem ? (
                        <span className="text-[11px] text-white/20">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {p.vencido && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/30">Vencido</span>
                          )}
                          {p.faltam.map(f => (
                            <span key={f} title={`Falta: ${f}`}
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-amber-400/12 text-amber-300/90 border border-amber-400/25">
                              falta {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
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
          <Paginacao total={equipsFiltrados.length} porPagina={porPagina} setPorPagina={setPorPagina} pagina={pagina} setPagina={setPagina}/>
        </div>
      )}
      </>)}
    </div>
  )
}
