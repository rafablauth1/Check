'use client'

import Link from 'next/link'
import { Plus, BookOpen, FlaskConical, GitBranch, FileText, ArrowRight } from 'lucide-react'

export default function ProcedimentosPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Laboratório · EMC</p>
          <h1 className="page-title">Procedimentos</h1>
          <p className="page-sub">Checagens de instrumentos e documentação técnica</p>
        </div>
      </div>

      {/* ── Checagens ── */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[2.5px] text-white/30 mb-3 px-1">
          Checagens intermediárias
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(232,185,75,0.12)' }}>
                <BookOpen size={14} style={{ color: 'var(--accent,#E8B94B)' }} />
              </div>
              <h2 className="text-[13px] font-semibold text-white">Do certificado</h2>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">
              Seleciona um ponto já existente no certificado do padrão. VR e incerteza preenchidos automaticamente.
            </p>
          </div>

          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(34,211,200,0.10)' }}>
                <GitBranch size={14} style={{ color: 'var(--teal,#22D3C8)' }} />
              </div>
              <h2 className="text-[13px] font-semibold text-white">Manual com interpolação</h2>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">
              Define ponto não calibrado. O sistema interpola a correção e calcula o VR automaticamente.
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Link href="/procedimentos/novo"
            className="btn-primary gap-2">
            <Plus size={13} /> Nova checagem
          </Link>
        </div>
      </div>

      {/* ── Instruções de Trabalho / PCs ── */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[2.5px] text-white/30 mb-3 px-1">
          Instruções de trabalho e procedimentos de calibração
        </p>
        <div className="card p-5 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(232,185,75,0.10)' }}>
              <FileText size={16} style={{ color: 'var(--accent,#E8B94B)' }} />
            </div>
            <div className="flex-1">
              <h2 className="text-[14px] font-semibold text-white mb-1">Editor de IT / PC</h2>
              <p className="text-[11px] text-white/40 leading-relaxed">
                Crie e edite Instruções de Trabalho e Procedimentos de Calibração no formato LABELO.
                Suporte a seções numeradas, parágrafos, listas, imagens, tabelas, definições e muito mais.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-[10px] text-white/30">
            {[
              ['1.', 'Seções numeradas'],
              ['¶', 'Parágrafos'],
              ['•', 'Listas'],
              ['🖼', 'Imagens'],
              ['⊞', 'Tabelas'],
              ['B–', 'Destaques'],
              ['📖', 'Siglas'],
              ['1)', 'Passos'],
            ].map(([icon, label]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="font-mono text-white/20">{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Link href="/procedimentos/instrucoes/novo"
              className="btn-primary gap-2">
              <Plus size={13} /> Novo documento
            </Link>
            <Link href="/procedimentos/instrucoes"
              className="btn-secondary gap-2 text-[12px]">
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
