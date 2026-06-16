'use client'

import { useState } from 'react'
import { History, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type RelatorioSalvo, formatEmendaNumero } from './types'

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

interface Props {
  relatorios: RelatorioSalvo[]
  onCarregarRelatorio: (r: RelatorioSalvo) => void
  onDeleteEmenda: (relatorioId: string, emendaNum: number) => void
}

interface EmendaFlat {
  relatorio: RelatorioSalvo
  numero: number
  dataEmenda: string
  numFormatado: string
  alteracoes: { marker: number; campo: string; descricao: string }[]
}

export function EmendasTab({ relatorios, onCarregarRelatorio, onDeleteEmenda }: Props) {
  const [busca,    setBusca]    = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const todasEmendas: EmendaFlat[] = relatorios.flatMap(r =>
    (r.emendas ?? []).map(e => ({
      relatorio: r,
      numero: e.numero,
      dataEmenda: e.dataEmenda,
      numFormatado: formatEmendaNumero(r.numRelatorio, e.numero),
      alteracoes: e.alteracoes,
    }))
  ).sort((a, b) => b.dataEmenda.localeCompare(a.dataEmenda))

  const filtradas = busca.trim()
    ? todasEmendas.filter(e =>
        e.numFormatado.toLowerCase().includes(busca.toLowerCase()) ||
        e.relatorio.clienteNome?.toLowerCase().includes(busca.toLowerCase()) ||
        e.relatorio.protocolo?.toLowerCase().includes(busca.toLowerCase()) ||
        e.relatorio.produto?.toLowerCase().includes(busca.toLowerCase())
      )
    : todasEmendas

  if (todasEmendas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-white/20">
        <History size={36} strokeWidth={1} />
        <p className="text-sm">Nenhuma emenda gerada ainda.</p>
        <p className="text-xs text-white/15">
          As emendas são criadas a partir de relatórios já emitidos.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <input
        className="input text-sm w-full"
        placeholder="Buscar por N° emenda, cliente, protocolo ou produto…"
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />

      <p className="text-[10px] text-white/25 font-mono">
        {filtradas.length} emenda{filtradas.length !== 1 ? 's' : ''} encontrada{filtradas.length !== 1 ? 's' : ''}
        {' '}em {relatorios.filter(r => r.emendas.length > 0).length} relatório{relatorios.filter(r => r.emendas.length > 0).length !== 1 ? 's' : ''}
      </p>

      {filtradas.length === 0 ? (
        <p className="text-center py-8 text-white/20 text-sm">Nenhuma emenda encontrada.</p>
      ) : (
        <div className="space-y-2">
          {filtradas.map((e, idx) => {
            const key = `${e.relatorio.id}-${e.numero}`
            const isOpen = expanded === key
            return (
              <div key={key} className="card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-amber-400 font-mono">
                        {e.numFormatado}
                      </span>
                      <span className="text-[9px] font-mono text-white/30 border border-white/10 px-1.5 py-0.5 rounded">
                        Emenda {e.numero}
                      </span>
                      <span className={cn(
                        'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border',
                        e.relatorio.cfg.tipo === 'lampada'
                          ? 'text-amber-400/70 border-amber-400/20 bg-amber-400/5'
                          : 'text-teal/70 border-teal/20 bg-teal/5'
                      )}>
                        {e.relatorio.cfg.tipo === 'lampada' ? 'Lâmpada' : 'Luminária'}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/60 mt-0.5 truncate">
                      {e.relatorio.clienteNome || '—'}
                    </p>
                    <p className="text-[10px] text-white/30 font-mono truncate">
                      Rel. {e.relatorio.numRelatorio} · {e.relatorio.produto || '—'} · {fmtDate(e.dataEmenda)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onCarregarRelatorio(e.relatorio)}
                      title="Carregar relatório original no formulário"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal/8 border border-teal/20 text-teal text-[11px] font-semibold hover:bg-teal/15 transition-all">
                      Relatório
                    </button>
                    <button
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="w-7 h-7 rounded-lg border border-white/10 text-white/30 hover:text-white/60 flex items-center justify-center transition-all">
                      {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <button
                      onClick={() => onDeleteEmenda(e.relatorio.id, e.numero)}
                      title="Excluir esta emenda (pede senha)"
                      className="w-7 h-7 rounded-lg border border-white/10 text-white/30 hover:text-red-400 hover:border-red-400/30 flex items-center justify-center transition-all">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-white/5 px-4 py-3 bg-navy/40 space-y-3">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                      <div>
                        <span className="text-white/25 font-mono uppercase tracking-wider text-[9px]">Relatório original: </span>
                        <span className="text-white/60">{e.relatorio.numRelatorio}</span>
                      </div>
                      <div>
                        <span className="text-white/25 font-mono uppercase tracking-wider text-[9px]">Data da emenda: </span>
                        <span className="text-white/60">{fmtDate(e.dataEmenda)}</span>
                      </div>
                      <div>
                        <span className="text-white/25 font-mono uppercase tracking-wider text-[9px]">Cliente: </span>
                        <span className="text-white/60">{e.relatorio.clienteNome}</span>
                      </div>
                      <div>
                        <span className="text-white/25 font-mono uppercase tracking-wider text-[9px]">Protocolo: </span>
                        <span className="text-white/60">{e.relatorio.protocolo}</span>
                      </div>
                    </div>
                    {e.alteracoes.length > 0 && (
                      <div>
                        <p className="text-[9px] text-white/25 font-mono uppercase tracking-wider mb-2">
                          Alterações ({e.alteracoes.length})
                        </p>
                        <ul className="space-y-1">
                          {e.alteracoes.map(a => (
                            <li key={a.campo} className="flex items-center gap-2 text-[11px] text-amber-300/70">
                              <span className="font-mono font-bold text-amber-400/80 w-4 text-center shrink-0">
                                {a.marker}
                              </span>
                              {a.descricao}
                            </li>
                          ))}
                        </ul>
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
