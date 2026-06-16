'use client'

import { useState, useEffect, useMemo } from 'react'
import { FileText, Trash2, FolderOpen, AlertTriangle, ChevronDown, ChevronUp, Wifi, WifiOff, Lock, CheckCircle2, Loader2, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type RelatorioSalvo, RELATORIOS_KEY, RELATORIO_DOCX_PFX } from './types'

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function getAno(dataEmissao: string) {
  return dataEmissao ? dataEmissao.slice(0, 4) : '—'
}

interface Props {
  onCarregar: (entry: RelatorioSalvo) => void
  onVerPDF:   (entry: RelatorioSalvo) => void
}

export function RelatoriosTab({ onCarregar, onVerPDF }: Props) {
  const [lista,        setLista]        = useState<RelatorioSalvo[]>([])
  const [fromNetwork,  setFromNetwork]  = useState(false)
  const [busca,        setBusca]        = useState('')
  const [filtroAno,    setFiltroAno]    = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroTipo,   setFiltroTipo]   = useState('')
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [signState,    setSignState]    = useState<Record<string, 'loading' | 'ok' | 'error'>>({})
  const [signMsg,      setSignMsg]      = useState<Record<string, string>>({})
  const [hasCert,      setHasCert]      = useState(false)

  useEffect(() => {
    async function load() {
      const api = (window as any).electronAPI
      if (api) {
        try {
          const res = await api.getRelatorios()
          if (res.ok && Array.isArray(res.relatorios) && res.relatorios.length > 0) {
            setLista(res.relatorios)
            setFromNetwork(res.fromNetwork)
          } else {
            // Fallback: arquivo vazio ou inacessível — tenta localStorage
            const raw = localStorage.getItem(RELATORIOS_KEY)
            if (raw) {
              const local: RelatorioSalvo[] = JSON.parse(raw)
              if (local.length > 0) {
                setLista(local)
                // Migra para o arquivo de dados
                api.saveRelatorios(local).catch(() => {})
              }
            }
          }
        } catch {}
        // Verifica se há certificado configurado neste PC
        try {
          const s = await api.getSettings()
          setHasCert(!!(s?.certThumbprint))
        } catch {}
        return
      }
      // fallback para localStorage (fora do Electron)
      try {
        const raw = localStorage.getItem(RELATORIOS_KEY)
        if (raw) setLista(JSON.parse(raw))
      } catch {}
    }
    load()
  }, [])

  const san = (v: string) => (v ?? '').replace(/[/\\:*?"<>|\s]/g, '_').replace(/_+/g, '_')

  async function assinarEPublicar(id: string) {
    if (!hasCert) {
      setSignState(p => ({ ...p, [id]: 'error' }))
      setSignMsg(p => ({ ...p, [id]: 'Nenhum certificado configurado. Configure em Configurações → Assinatura Digital de PDF.' }))
      return
    }
    const rel = lista.find(r => r.id === id)
    if (!rel?.eutFolderPath) {
      setSignState(p => ({ ...p, [id]: 'error' }))
      setSignMsg(p => ({ ...p, [id]: 'Pasta EUT não associada — carregue a pasta da EUT primeiro.' }))
      return
    }
    const pdfFilename = `${san(rel.numRelatorio)}_${rel.cfg.tipo}_${san(rel.cfg.fabricante)}.pdf`
    const api = (window as any).electronAPI
    if (!api?.signPdf || !api?.publishPdf) return
    setSignState(p => ({ ...p, [id]: 'loading' }))
    setSignMsg(p => ({ ...p, [id]: '' }))
    try {
      const signRes = await api.signPdf(rel.eutFolderPath, pdfFilename)
      if (!signRes.ok) {
        setSignState(p => ({ ...p, [id]: 'error' }))
        setSignMsg(p => ({ ...p, [id]: signRes.error ?? 'Erro ao assinar' }))
        return
      }
      const pubRes = await api.publishPdf(rel.eutFolderPath, pdfFilename, getAno(rel.dataEmissao))
      if (pubRes.ok) {
        setSignState(p => ({ ...p, [id]: 'ok' }))
        setSignMsg(p => ({ ...p, [id]: 'Assinado e publicado com sucesso' }))
      } else {
        setSignState(p => ({ ...p, [id]: 'error' }))
        setSignMsg(p => ({ ...p, [id]: 'Assinado, mas erro ao publicar: ' + (pubRes.error ?? '') }))
      }
    } catch (e: any) {
      setSignState(p => ({ ...p, [id]: 'error' }))
      setSignMsg(p => ({ ...p, [id]: e.message }))
    }
  }

  async function remover(id: string) {
    const rel = lista.find(r => r.id === id)
    if (!confirm(`Excluir "${rel?.numRelatorio || id}"?\n\nIsso irá:\n• Marcar o número como CANCELADO na planilha Excel\n• Apagar o PDF dos diretórios\n• Remover do histórico`)) return

    const api = (window as any).electronAPI

    if (rel?.numRelatorio) {
      // Cancela na planilha
      try {
        await fetch('/api/registrar-excel', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ numRelatorio: rel.numRelatorio }),
        })
      } catch {}

      // Apaga PDFs
      if (api) {
        const pdfFilename = `${san(rel.numRelatorio)}_${rel.cfg.tipo}_${san(rel.cfg.fabricante)}.pdf`
        try { await api.cancelPdf(rel.eutFolderPath ?? '', pdfFilename) } catch {}
      }
    }

    const updated = lista.filter(r => r.id !== id)
    setLista(updated)
    localStorage.setItem(RELATORIOS_KEY, JSON.stringify(updated))
    localStorage.removeItem(RELATORIO_DOCX_PFX + id)
    if (api && fromNetwork) {
      try { await api.saveRelatorios(updated) } catch {}
    }
    if (api?.deleteRelatorioAssets) {
      try { await api.deleteRelatorioAssets(id) } catch {}
    }
  }

  // Opções únicas para filtros
  const anos = useMemo(() => {
    const s = new Set(lista.map(r => getAno(r.dataEmissao)).filter(Boolean))
    return Array.from(s).sort().reverse()
  }, [lista])

  const clientes = useMemo(() => {
    const s = new Set(lista.map(r => r.clienteNome).filter(Boolean))
    return Array.from(s).sort()
  }, [lista])

  const filtrados = useMemo(() => {
    return lista.filter(r => {
      if (filtroAno     && getAno(r.dataEmissao) !== filtroAno) return false
      if (filtroCliente && r.clienteNome !== filtroCliente) return false
      if (filtroTipo    && r.cfg.tipo !== filtroTipo) return false
      if (!busca.trim()) return true
      const q = busca.toLowerCase()
      return (
        r.numRelatorio?.toLowerCase().includes(q) ||
        r.clienteNome?.toLowerCase().includes(q)  ||
        r.protocolo?.toLowerCase().includes(q)    ||
        r.produto?.toLowerCase().includes(q)
      )
    })
  }, [lista, filtroAno, filtroCliente, filtroTipo, busca])

  if (lista.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-white/20">
        <FileText size={36} strokeWidth={1} />
        <p className="text-sm">Nenhum relatório gerado ainda.</p>
        <p className="text-xs text-white/15">Os relatórios gerados aparecerão aqui automaticamente.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">

      {/* Indicador de fonte dos dados */}
      <div className={cn(
        'flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded-lg w-fit',
        fromNetwork
          ? 'text-teal/70 bg-teal/6 border border-teal/15'
          : 'text-white/25 bg-white/3 border border-white/8'
      )}>
        {fromNetwork ? <Wifi size={10} /> : <WifiOff size={10} />}
        {fromNetwork ? 'Dados da rede compartilhada' : 'Dados locais (configure a pasta de rede em Configurações)'}
      </div>

      {/* Abas por ano */}
      {anos.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap border-b border-white/6 pb-2">
          <button
            type="button"
            onClick={() => setFiltroAno('')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-[12px] font-mono transition-all',
              filtroAno === '' ? 'bg-[#141B28] text-white border border-white/10' : 'text-white/35 hover:text-white/60',
            )}>
            Todos <span className="opacity-50">{lista.length}</span>
          </button>
          {anos.map(a => {
            const n = lista.filter(r => getAno(r.dataEmissao) === a).length
            return (
              <button
                key={a}
                type="button"
                onClick={() => setFiltroAno(a)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[12px] font-mono transition-all',
                  filtroAno === a ? 'bg-[#141B28] text-gold border border-gold/25' : 'text-white/35 hover:text-white/60',
                )}>
                {a} <span className="opacity-50">{n}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Busca */}
      <input
        className="input text-sm w-full"
        placeholder="Buscar por N° relatório, cliente, protocolo ou produto…"
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select
          className="input text-xs py-1.5 pr-7 max-w-[200px]"
          value={filtroCliente}
          onChange={e => setFiltroCliente(e.target.value)}
        >
          <option value="">Todos os clientes</option>
          {clientes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          className="input text-xs py-1.5 pr-7"
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
        >
          <option value="">Lâmpada + Luminária</option>
          <option value="lampada">Lâmpada</option>
          <option value="luminaria">Luminária</option>
        </select>

        {(filtroAno || filtroCliente || filtroTipo || busca) && (
          <button
            onClick={() => { setFiltroAno(''); setFiltroCliente(''); setFiltroTipo(''); setBusca('') }}
            className="text-[10px] font-mono text-white/30 hover:text-white/60 px-2 py-1 rounded border border-white/8 hover:border-white/20 transition-all">
            Limpar filtros
          </button>
        )}
      </div>

      <p className="text-[10px] text-white/25 font-mono">
        {filtrados.length} de {lista.length} relatório{lista.length !== 1 ? 's' : ''}
      </p>

      {filtrados.length === 0 ? (
        <p className="text-center py-8 text-white/20 text-sm">Nenhum resultado encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filtrados.map(r => {
            const isOpen     = expanded === r.id
            const hasDocx    = !!localStorage.getItem(RELATORIO_DOCX_PFX + r.id)
            const semFotos   = (r.photos ?? []).length === 0
            const hasEmendas = (r.emendas ?? []).length > 0
            return (
              <div key={r.id} className="card overflow-hidden">
                {/* linha principal */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gold font-mono">
                        {r.numRelatorio || '—'}
                      </span>
                      <span className={cn(
                        'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border',
                        r.cfg.tipo === 'lampada'
                          ? 'text-amber-400/70 border-amber-400/20 bg-amber-400/5'
                          : 'text-teal/70 border-teal/20 bg-teal/5'
                      )}>
                        {r.cfg.tipo === 'lampada' ? 'Lâmpada' : 'Luminária'}
                      </span>
                      {(r.emendas ?? []).length > 0 && (
                        <span className="text-[9px] font-mono text-amber-400/60 border border-amber-400/20 bg-amber-400/5 px-1.5 py-0.5 rounded">
                          {(r.emendas ?? []).length} emenda{(r.emendas ?? []).length > 1 ? 's' : ''}
                        </span>
                      )}
                      {semFotos && fromNetwork && (
                        <span className="text-[9px] font-mono text-white/25 border border-white/10 px-1.5 py-0.5 rounded">
                          fotos locais
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/60 mt-0.5 truncate">{r.clienteNome || '—'}</p>
                    <p className="text-[10px] text-white/30 font-mono truncate">
                      {r.produto || '—'} · Prot. {r.protocolo || '—'} · {fmtDate(r.dataEmissao)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onVerPDF(r)}
                      title="Ver / Baixar PDF"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gold/8 border border-gold/20 text-gold text-[11px] font-semibold hover:bg-gold/18 transition-all">
                      <FileText size={11} /> PDF
                    </button>
                    {/* Assinar e Publicar — sempre visível */}
                    {(() => {
                      const ss = signState[r.id]
                      const done = ss === 'ok'
                      return (
                        <button
                          onClick={() => !done && ss !== 'loading' && assinarEPublicar(r.id)}
                          disabled={ss === 'loading' || done}
                          title={
                            done           ? signMsg[r.id] :
                            ss === 'error' ? signMsg[r.id] :
                            !hasCert       ? 'Nenhum certificado configurado — clique para ver instruções' :
                            'Assinar digitalmente e publicar o PDF'
                          }
                          className={cn(
                            'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all',
                            done             ? 'border-teal/30 bg-teal/8 text-teal cursor-default' :
                            ss === 'error'   ? 'border-red-400/30 bg-red-400/8 text-red-400' :
                            ss === 'loading' ? 'border-white/10 text-white/30 pointer-events-none' :
                            !hasCert         ? 'border-white/10 bg-white/3 text-white/30 hover:bg-white/6' :
                            'border-blue-400/25 bg-blue-400/6 text-blue-300 hover:bg-blue-400/14',
                          )}>
                          {ss === 'loading' ? <Loader2 size={11} className="animate-spin" /> :
                           done             ? <CheckCircle2 size={11} /> :
                           <PenLine size={11} />}
                          {ss === 'loading' ? 'Processando…' : done ? 'Publicado' : ss === 'error' ? 'Erro' : 'Assinar e Publicar'}
                        </button>
                      )
                    })()}
                    {hasEmendas ? (
                      <div
                        title="Relatório com emenda — edite pela aba Emendas"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/8 text-white/20 text-[11px] font-semibold cursor-not-allowed select-none">
                        <Lock size={11} /> Bloqueado
                      </div>
                    ) : (
                      <button
                        onClick={() => onCarregar(r)}
                        title="Carregar no formulário"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal/8 border border-teal/20 text-teal text-[11px] font-semibold hover:bg-teal/15 transition-all">
                        <FolderOpen size={11} /> Carregar
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="w-7 h-7 rounded-lg border border-white/10 text-white/30 hover:text-white/60 flex items-center justify-center transition-all">
                      {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <button
                      onClick={() => remover(r.id)}
                      className="w-7 h-7 rounded-lg border border-white/10 text-white/30 hover:text-red-400 hover:border-red/30 flex items-center justify-center transition-all">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* feedback assinatura */}
                {signState[r.id] === 'error' && (
                  <div className="px-4 pb-2 flex items-center gap-1.5 text-[10px] text-red-400/80 font-mono">
                    <AlertTriangle size={9} /> {signMsg[r.id]}
                  </div>
                )}




                {/* detalhe expandido */}
                {isOpen && (
                  <div className="border-t border-white/5 px-4 py-3 space-y-2 bg-navy/40">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                      {[
                        ['N° Relatório',  r.numRelatorio],
                        ['Data Emissão',  fmtDate(r.dataEmissao)],
                        ['Cliente',       r.clienteNome],
                        ['Protocolo',     r.protocolo],
                        ['Produto',       r.produto],
                        ['Modelo',        r.cfg.modelo],
                        ['Fabricante',    r.cfg.fabricante],
                        ['Responsável',   r.cfg.responsavel],
                        ['Fotos',         (r.photos ?? []).length ? `${(r.photos ?? []).length} arquivo(s)` : '— (carregar pasta EUT)'],
                        ['DOCX',          r.docxFilename || '—'],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span className="text-white/25 font-mono uppercase tracking-wider text-[9px]">{label}: </span>
                          <span className="text-white/60">{value || '—'}</span>
                        </div>
                      ))}
                    </div>
                    {r.eutFolderPath && (
                      <div className="flex items-center gap-2 text-[10px] text-teal/60 bg-teal/5 border border-teal/15 rounded px-2.5 py-1.5 font-mono">
                        <FolderOpen size={10} />
                        Pasta EUT: {r.eutFolderPath}
                      </div>
                    )}
                    {(!hasDocx || semFotos) && (
                      <div className="flex items-center gap-2 text-[10px] text-amber-400/70 bg-amber-500/6 border border-amber-500/15 rounded px-2.5 py-1.5">
                        <AlertTriangle size={11} />
                        {semFotos && !hasDocx
                          ? 'Fotos e DOCX não disponíveis neste PC — carregue a pasta da EUT para regenerar o PDF.'
                          : !hasDocx
                          ? 'DOCX não disponível — carregue o .docx para regenerar o PDF com resultados.'
                          : 'Fotos não disponíveis — carregue a pasta da EUT.'}
                      </div>
                    )}
                    {(r.emendas ?? []).length > 0 && (
                      <div className="text-[10px] text-white/30 font-mono">
                        {(r.emendas ?? []).map(e => (
                          <span key={e.numero} className="mr-3">
                            Emenda {e.numero}: {fmtDate(e.dataEmenda)} ({(e.alteracoes ?? []).length} alteração{(e.alteracoes ?? []).length !== 1 ? 'ões' : ''})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
