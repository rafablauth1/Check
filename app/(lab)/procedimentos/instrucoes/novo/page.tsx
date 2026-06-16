'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2 } from 'lucide-react'
import type { TipoDocumento, Bloco } from '@/lib/instrucoes/tipos'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

function templateIT(): Bloco[] {
  return [
    { id: uid(), tipo: 'h1', numero: '1', texto: 'Objetivo' },
    { id: uid(), tipo: 'p',  texto: '' },
    { id: uid(), tipo: 'h1', numero: '2', texto: 'Campo de Aplicação' },
    { id: uid(), tipo: 'p',  texto: '' },
    { id: uid(), tipo: 'h1', numero: '3', texto: 'Documentos de Referência' },
    { id: uid(), tipo: 'ul', itens: [''] },
    { id: uid(), tipo: 'h1', numero: '4', texto: 'Definições e Siglas' },
    { id: uid(), tipo: 'definicoes', itens: [{ sigla: '', definicao: '' }] },
    { id: uid(), tipo: 'h1', numero: '5', texto: 'Equipamentos e Materiais' },
    { id: uid(), tipo: 'ul', itens: [''] },
    { id: uid(), tipo: 'h1', numero: '6', texto: 'Procedimento' },
    { id: uid(), tipo: 'ol', itens: [''] },
    { id: uid(), tipo: 'h1', numero: '7', texto: 'Registros' },
    { id: uid(), tipo: 'p',  texto: '' },
  ]
}

function templatePC(): Bloco[] {
  return [
    { id: uid(), tipo: 'h1', numero: '1', texto: 'Objetivo' },
    { id: uid(), tipo: 'p',  texto: '' },
    { id: uid(), tipo: 'h1', numero: '2', texto: 'Documentos de Referência' },
    { id: uid(), tipo: 'ul', itens: [''] },
    { id: uid(), tipo: 'h1', numero: '3', texto: 'Definições e Siglas' },
    { id: uid(), tipo: 'definicoes', itens: [{ sigla: '', definicao: '' }] },
    { id: uid(), tipo: 'h1', numero: '4', texto: 'Equipamentos de Medição e Referência' },
    { id: uid(), tipo: 'ul', itens: [''] },
    { id: uid(), tipo: 'h1', numero: '5', texto: 'Condições Ambientais' },
    { id: uid(), tipo: 'p',  texto: '' },
    { id: uid(), tipo: 'h1', numero: '6', texto: 'Procedimento de Calibração' },
    { id: uid(), tipo: 'ol', itens: [''] },
    { id: uid(), tipo: 'h1', numero: '7', texto: 'Cálculo de Incerteza' },
    { id: uid(), tipo: 'p',  texto: '' },
    { id: uid(), tipo: 'h1', numero: '8', texto: 'Critério de Aceitação' },
    { id: uid(), tipo: 'p',  texto: '' },
    { id: uid(), tipo: 'h1', numero: '9', texto: 'Registro de Calibração' },
    { id: uid(), tipo: 'p',  texto: '' },
  ]
}

const TIPOS: { tipo: TipoDocumento; label: string; desc: string }[] = [
  { tipo: 'IT', label: 'Instrução de Trabalho', desc: '7 seções: objetivo, campo de aplicação, referências, definições, equipamentos, procedimento, registros.' },
  { tipo: 'PC', label: 'Procedimento de Calibração', desc: '9 seções: objetivo, referências, definições, equipamentos, condições ambientais, procedimento, incerteza, critério, registro.' },
]

export default function NovaInstrucaoPage() {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoDocumento>('IT')
  const [titulo, setTitulo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [criando, setCriando] = useState(false)

  async function criar() {
    setCriando(true)
    try {
      const blocos = tipo === 'IT' ? templateIT() : templatePC()
      const res = await fetch('/api/instrucoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoDocumento: tipo,
          codigo: codigo.trim(),
          titulo: titulo.trim() || 'Novo documento',
          revisao: '00',
          dataRevisao: new Date().toISOString().slice(0, 10),
          revisadoPor: '',
          aprovadoPor: '',
          blocos,
        }),
      })
      const doc = await res.json()
      if (doc.error) throw new Error(doc.error)
      router.replace(`/procedimentos/instrucoes/${doc.id}`)
    } catch (e: unknown) {
      alert('Erro ao criar: ' + String(e))
      setCriando(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Procedimentos · Novo documento</p>
          <h1 className="page-title">Novo IT / PC</h1>
          <p className="page-sub">Escolha o tipo para iniciar com o template padrão</p>
        </div>
      </div>

      {/* Tipo */}
      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-[2.5px] text-white/30 px-1">Tipo de documento</p>
        <div className="grid grid-cols-2 gap-3">
          {TIPOS.map(t => (
            <button
              key={t.tipo}
              type="button"
              onClick={() => setTipo(t.tipo)}
              className={`card p-4 text-left transition-all ${tipo === t.tipo ? 'border-[var(--accent,#E8B94B)]/50 bg-[var(--accent,#E8B94B)]/5' : 'hover:border-white/12'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold
                  ${tipo === t.tipo ? 'bg-[var(--accent,#E8B94B)] text-black' : 'bg-white/8 text-white/50'}`}>
                  {t.tipo}
                </div>
                <span className={`text-[12px] font-semibold ${tipo === t.tipo ? 'text-[var(--accent,#E8B94B)]' : 'text-white/70'}`}>
                  {t.label}
                </span>
              </div>
              <p className="text-[10px] text-white/35 leading-relaxed">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Identificação */}
      <div className="card p-5 space-y-4">
        <p className="text-[10px] font-mono uppercase tracking-[2.5px] text-white/30">Identificação</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Código</label>
            <input className="input font-mono" placeholder={tipo === 'IT' ? 'IT-001' : 'PC R04'}
              value={codigo} onChange={e => setCodigo(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Título</label>
            <input className="input" placeholder={tipo === 'IT' ? 'Ex: Operação do Analisador de Espectro' : 'Ex: Atenuador Coaxial'}
              value={titulo} onChange={e => setTitulo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Cancelar
        </button>
        <button type="button" onClick={criar} disabled={criando} className="btn-primary gap-2">
          {criando ? <Loader2 size={13} className="animate-spin"/> : <FileText size={13}/>}
          Criar documento
        </button>
      </div>
    </div>
  )
}
