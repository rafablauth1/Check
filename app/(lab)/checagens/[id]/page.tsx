'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Pencil, Trash2 } from 'lucide-react'
import { fmt } from '@/lib/utils'
import type { Checagem } from '@/lib/checagens/tipos'

function StatusBadge({ status }: { status: string }) {
  if (status === 'reprovado') return <span className="badge-danger">REPROVADA</span>
  if (status === 'atencao')   return <span className="badge-warning">ATENÇÃO</span>
  return <span className="badge-success">APROVADA</span>
}

function ResultadoBadge({ r }: { r: string }) {
  if (r === 'ok')  return <span className="badge-success text-[9px]">Satisfatório</span>
  if (r === 'nok') return <span className="badge-danger text-[9px]">Insatisfatório</span>
  return <span className="text-[9px] font-mono text-white/25">—</span>
}

function ResultGeralBadge({ r }: { r: string }) {
  if (r === 'satisfatorio')   return <span className="badge-success">Satisfatório</span>
  if (r === 'insatisfatorio') return <span className="badge-danger">Insatisfatório</span>
  if (r === 'parcial')        return <span className="badge text-amber-400 border border-amber-500/30 bg-amber-500/8">Parcialmente Satisfatório</span>
  return <span className="badge text-white/40">Pendente</span>
}

export default function CheckagemDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const [checagem, setChecagem] = useState<Checagem | null>(null)

  useEffect(() => {
    fetch(`/api/checagens/${id}`).then(r => r.json()).then(c => {
      if (!c.error) setChecagem(c)
    }).catch(() => {})
  }, [id])

  if (!checagem) return (
    <div className="flex items-center justify-center py-20 text-white/25 text-sm">Carregando...</div>
  )

  async function excluir() {
    if (!confirm(`Excluir a checagem de "${checagem?.nomeInstrumento || checagem?.equipamentoTag}"?\n\nEsta ação não pode ser desfeita.`)) return
    try {
      const res = await fetch(`/api/checagens/${id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (d?.error) throw new Error(d.error)
      router.push('/checagens')
    } catch (e: any) { alert('Erro ao excluir: ' + (e?.message ?? e)) }
  }

  const indireta = checagem.tipoComparacao === 'indireta'

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost p-2"><ArrowLeft size={15}/></button>
          <div>
            <p className="text-[9px] font-mono tracking-[2px] uppercase text-white/30 mb-0.5">FOR 6405 · Checagem Intermediária</p>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="tag-chip">{checagem.equipamentoTag}</span>
              <StatusBadge status={checagem.status}/>
              <ResultGeralBadge r={checagem.resultadoGeral ?? 'pendente'}/>
            </div>
            <h1 className="page-title">{checagem.nomeInstrumento || checagem.equipamentoTag}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push(`/checagens/nova?id=${checagem.id}`)} className="btn-secondary">
            <Pencil size={13}/> Editar
          </button>
          <button onClick={excluir}
            className="btn-ghost px-3 py-2 text-red-400/80 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-lg">
            <Trash2 size={13}/> Excluir
          </button>
          <button onClick={() => { console.log('TODO: gerar PDF', checagem.id) }} className="btn-secondary">
            <FileText size={13}/> Gerar PDF
          </button>
        </div>
      </div>

      {/* Cabeçalho do formulário */}
      <div className="card p-5 mb-5">
        <p className="form-section mb-4">Identificação do instrumento</p>
        <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
          {[
            ['Instrumento de medição', checagem.nomeInstrumento || '—'],
            ['TAG',                    checagem.equipamentoTag],
            ['Laboratório',            checagem.laboratorio || '—'],
            ['Certificado de calibração n°', checagem.numeroCertificado || '—'],
            ['Data da calibração (padrão)',   fmt(checagem.dataCalibracaoRef)],
            ['TAG do padrão',          checagem.padraoTag || '—'],
            ['Data da checagem',        fmt(checagem.data)],
            ['Responsável',            checagem.responsavel || '—'],
            ['Periodicidade',          `${checagem.periodicidade} meses`],
            ['Próxima checagem',        fmt(checagem.proximaChecagem)],
            ['Norma de referência',    checagem.normaReferencia || '—'],
            ['Tipo de comparação',     checagem.tipoComparacao === 'indireta' ? 'Indireta' : 'Direta'],
          ].map(([label, valor]) => (
            <div key={label}>
              <p className="text-[9px] font-mono tracking-[2px] uppercase text-white/30 mb-0.5">{label}</p>
              <p className="text-white/75">{valor}</p>
            </div>
          ))}
        </div>
        {checagem.obs && (
          <div className="mt-4 pt-4 border-t border-white/6">
            <p className="text-[9px] font-mono tracking-[2px] uppercase text-white/30 mb-1">Observações</p>
            <p className="text-white/60 text-sm">{checagem.obs}</p>
          </div>
        )}
      </div>

      {/* Tabela de pontos */}
      <div className="card overflow-hidden mb-5">
        <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
          <p className="form-section">Pontos de medição</p>
          <span className="text-[10px] font-mono text-white/30">
            {checagem.tipoComparacao === 'indireta' ? 'Comparação indireta' : 'Comparação direta'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: indireta ? 860 : 620 }}>
            <thead className="tbl-head">
              <tr>
                <th className="w-10 text-center">Pt.</th>
                <th>Grandeza verificada</th>
                <th className="w-20">Unid.</th>
                <th className="w-28">VR — Padrão</th>
                {indireta && <>
                  <th className="w-28">Transferência</th>
                  <th className="w-24">Correção</th>
                  <th className="w-28">Val. corrigido</th>
                </>}
                <th className="w-28">MM — Instrumento</th>
                <th className="w-28">Resultado</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>
              {checagem.itens.map(item => (
                <tr key={item.id} className={
                  item.resultado === 'nok' ? 'tbl-row bg-red-500/5' :
                  item.resultado === 'ok'  ? 'tbl-row bg-green-500/4' : 'tbl-row'
                }>
                  <td className="text-center font-mono text-[11px] text-white/40">{item.ponto}</td>
                  <td className="font-medium text-white/80">{item.grandeza || '—'}</td>
                  <td className="font-mono text-[11px]">{item.unidade}</td>
                  <td className="font-mono text-[11px]">{item.valorReferencia || '—'}</td>
                  {indireta && <>
                    <td className="font-mono text-[11px]">{item.valorTransferencia || '—'}</td>
                    <td className="font-mono text-[11px]">{item.correcaoPadrao || '—'}</td>
                    <td className="font-mono text-[11px]">{item.valorCorrigido || '—'}</td>
                  </>}
                  <td className="font-mono text-[11px]">{item.valorMedido || '—'}</td>
                  <td><ResultadoBadge r={item.resultado}/></td>
                  <td className="text-[11px] text-white/40">{item.observacoes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Resultado geral */}
        <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-[2px] uppercase text-white/30">Resultado da checagem intermediária:</span>
          <ResultGeralBadge r={checagem.resultadoGeral ?? 'pendente'}/>
        </div>
      </div>
    </div>
  )
}
