'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Trash2, Lightbulb, Lamp, Users, Loader2,
  ShieldCheck, ShieldX, Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { type LoteConfig } from '../types'

function contagem(lote: LoteConfig) {
  const conforme  = lote.amostras.filter(a => a.conformidade === 'conforme').length
  const reprovado = lote.amostras.filter(a => a.conformidade === 'reprovado').length
  const pendente  = lote.amostras.filter(a => a.conformidade === 'pendente').length
  return { conforme, reprovado, pendente }
}

export default function LotesPage() {
  const router = useRouter()
  const [lotes,      setLotes]      = useState<LoteConfig[] | null>(null)
  const [isElectron,  setIsElectron] = useState(false)
  const [excluindo,  setExcluindo]  = useState<string | null>(null)

  useEffect(() => {
    const api = (window as any).electronAPI
    setIsElectron(!!api)
    if (!api?.getLotes) { setLotes([]); return }
    api.getLotes().then((res: any) => {
      setLotes(res?.ok && Array.isArray(res.lotes) ? res.lotes : [])
    }).catch(() => setLotes([]))
  }, [])

  async function excluir(lote: LoteConfig) {
    if (!confirm(`Excluir o lote do orçamento "${lote.orcamento || lote.cliente || 'sem orçamento'}"? Essa ação não pode ser desfeita.`)) return
    const api = (window as any).electronAPI
    if (!api?.saveLotes || !lotes) return
    setExcluindo(lote.id)
    try {
      const atualizados = lotes.filter(l => l.id !== lote.id)
      await api.saveLotes(atualizados)
      setLotes(atualizados)
    } finally {
      setExcluindo(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <button type="button" onClick={() => router.push('/cispr15')}
        className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-6 transition-colors">
        <ArrowLeft size={14} /> Voltar ao formulário
      </button>

      <div className="mb-6">
        <p className="form-section mb-1">CISPR 15 · EMC</p>
        <h1 className="text-2xl font-display font-bold text-white">Lotes em Andamento</h1>
        <p className="text-white/40 text-sm mt-1">
          Ficam salvos na rede — visíveis e continuáveis em qualquer PC configurado com a mesma pasta.
        </p>
      </div>

      {!isElectron && (
        <div className="card p-5 text-sm text-white/50">
          Disponível apenas no aplicativo (Electron) — os lotes são guardados na pasta de rede compartilhada.
        </div>
      )}

      {isElectron && lotes === null && (
        <div className="flex items-center gap-2 text-white/40 text-sm py-8 justify-center">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </div>
      )}

      {isElectron && lotes !== null && lotes.length === 0 && (
        <div className="card p-8 text-center">
          <Users size={32} className="text-white/15 mx-auto mb-3" />
          <p className="text-white/50 text-sm">Nenhum lote em andamento.</p>
          <p className="text-white/25 text-xs mt-1">
            Comece um pela Agenda ("Emitir Lote") ou pelo formulário individual.
          </p>
        </div>
      )}

      {isElectron && lotes !== null && lotes.length > 0 && (
        <div className="space-y-3">
          {lotes.map(lote => {
            const { conforme, reprovado, pendente } = contagem(lote)
            return (
              <div key={lote.id} className="card p-4 flex items-center gap-4">
                <div className={cn('shrink-0', lote.tipo === 'lampada' ? 'text-yellow-400/60' : 'text-blue-400/60')}>
                  {lote.tipo === 'lampada' ? <Lightbulb size={20} /> : <Lamp size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/85 truncate">
                    {lote.orcamento ? `Orçamento ${lote.orcamento}` : <span className="text-white/30 italic">sem orçamento</span>}
                    {lote.cliente && <span className="text-white/40 font-normal"> · {lote.cliente}</span>}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] font-mono">
                    <span className="text-white/30">{lote.amostras.length} amostra(s)</span>
                    {pendente > 0 && (
                      <span className="flex items-center gap-1 text-white/30"><Shield size={9} /> {pendente} pendente(s)</span>
                    )}
                    {conforme > 0 && (
                      <span className="flex items-center gap-1 text-green-400/70"><ShieldCheck size={9} /> {conforme} conforme(s)</span>
                    )}
                    {reprovado > 0 && (
                      <span className="flex items-center gap-1 text-red-400/70"><ShieldX size={9} /> {reprovado} reprovado(s)</span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => excluir(lote)} disabled={excluindo === lote.id}
                  title="Excluir lote"
                  className="text-red-400/40 hover:text-red-400 hover:bg-red/10 rounded-lg p-2 transition-all shrink-0 disabled:opacity-40">
                  {excluindo === lote.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
                <button type="button" onClick={() => router.push(`/cispr15/lote?id=${lote.id}`)}
                  className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs font-bold shrink-0">
                  Continuar <ArrowRight size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
