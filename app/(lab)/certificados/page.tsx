'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Award, Grid3x3, Calendar, Building2, Trash2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Certificado } from '@/lib/certificados/tipos'

export default function CertificadosPage() {
  const [certs, setCerts] = useState<Certificado[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('cert-busca') ?? ''
    return ''
  })

  useEffect(() => {
    fetch('/api/certificados').then(r => r.json()).then(d => {
      setCerts(Array.isArray(d) ? d : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function setAndPersistBusca(v: string) {
    setBusca(v)
    sessionStorage.setItem('cert-busca', v)
  }

  async function deletar(id: string) {
    if (!confirm('Excluir este certificado?')) return
    await fetch(`/api/certificados/${id}`, { method: 'DELETE' })
    setCerts(p => p.filter(c => c.id !== id))
  }

  const filtrados = certs.filter(c =>
    !busca || [c.equipamentoTag, c.numero, c.laboratorio].some(v =>
      v?.toLowerCase().includes(busca.toLowerCase())
    )
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Laboratório · Calibração</p>
          <h1 className="page-title">Certificados de Calibração</h1>
          <p className="page-sub">Gerencie certificados com grades de correção para interpolação</p>
        </div>
        <Link href="/certificados/novo" className="btn-primary">
          <Plus size={14}/> Novo certificado
        </Link>
      </div>

      {/* Busca */}
      <div className="mb-5">
        <input className="input max-w-sm" value={busca} onChange={e => setAndPersistBusca(e.target.value)}
          placeholder="Buscar por TAG, n° certificado, laboratório…"/>
      </div>

      {loading && <p className="text-white/30 text-sm">Carregando…</p>}

      {!loading && filtrados.length === 0 && (
        <div className="card p-12 text-center">
          <Award size={40} className="mx-auto mb-4 text-white/15"/>
          <p className="text-white/40 text-sm mb-1">Nenhum certificado cadastrado.</p>
          <p className="text-white/25 text-[12px]">
            Cadastre certificados de calibração com grades de correção 2D para usar nas checagens.
          </p>
          <Link href="/certificados/novo" className="btn-primary mt-6 inline-flex">
            <Plus size={13}/> Cadastrar primeiro certificado
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {filtrados.map(cert => (
          <div key={cert.id} className="card p-4 flex items-center gap-4 group hover:border-white/14 transition-all">
            {/* Ícone */}
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
              cert.grade2D ? 'bg-teal/10 border border-teal/20' : 'bg-white/5 border border-white/8')}>
              {cert.grade2D ? <Grid3x3 size={18} className="text-teal"/> : <Award size={18} className="text-white/40"/>}
            </div>

            {/* Info principal */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <span className="tag-chip">{cert.equipamentoTag}</span>
                <span className="font-mono text-[12px] text-white/70">{cert.numero}</span>
                {cert.grade2D && (
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal/10 text-teal border border-teal/20">
                    Grade 2D · {cert.grade2D.pontos.length} pontos
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-[11px] text-white/40 flex-wrap">
                <span className="flex items-center gap-1"><Building2 size={10}/> {cert.laboratorio}</span>
                <span className="flex items-center gap-1"><Calendar size={10}/> {cert.dataEmissao}</span>
                {cert.grade2D && (
                  <span className="text-white/30">
                    {cert.grade2D.eixo1Nome} × {cert.grade2D.eixo2Nome}
                  </span>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
              <button type="button" onClick={() => deletar(cert.id)}
                className="text-white/25 hover:text-red-400 p-1.5 rounded transition-colors">
                <Trash2 size={14}/>
              </button>
              <Link href={`/certificados/${cert.id}`}
                className="btn-secondary text-xs py-1 flex items-center gap-1">
                Ver / editar <ChevronRight size={12}/>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
