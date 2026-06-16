'use client'

import { useState, useEffect } from 'react'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import type { Certificado } from '@/lib/certificados/tipos'

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export default function GrandezasPage() {
  const [equips, setEquips] = useState<EquipamentoEMC[]>([])
  const [certs,  setCerts]  = useState<Certificado[]>([])

  useEffect(() => {
    fetch('/api/equipamentos').then(r => r.json()).then(e => setEquips(Array.isArray(e) ? e : [])).catch(() => {})
    fetch('/api/certificados').then(r => r.json()).then(c => setCerts(Array.isArray(c) ? c : [])).catch(() => {})
  }, [])

  // Parâmetros associados a uma grandeza, vindos dos certificados do equipamento.
  function paramsDa(equipId: string, grandezaNome: string): string[] {
    const set = new Set<string>()
    const tg = norm(grandezaNome)
    for (const c of certs.filter(x => x.equipamentoId === equipId)) {
      for (const p of ((c.grade2D?.pontos ?? []) as Array<{ grandeza?: string; tabela?: string }>)) {
        if (norm(p.grandeza || '') === tg && (p.tabela || '').trim()) set.add((p.tabela as string).trim())
      }
    }
    return [...set]
  }

  const comGrandezas = equips.filter(e => e.grandezas.length > 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Laboratório · EMC</p>
          <h1 className="page-title">Grandezas metrológicas</h1>
          <p className="page-sub">Por equipamento cadastrado · com os parâmetros associados</p>
        </div>
      </div>

      {comGrandezas.length === 0 ? (
        <div className="card p-10 text-center text-white/25 text-sm">
          Nenhum equipamento possui grandezas cadastradas ainda.
          Acesse o detalhe de um equipamento para adicionar grandezas.
        </div>
      ) : (
        <div className="space-y-4">
          {comGrandezas.map(eq => (
            <div key={eq.id} className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <span className="tag-chip mr-2">{eq.tag}</span>
                <span className="text-[13px] font-semibold text-white">{eq.nome}</span>
              </div>
              <table className="w-full">
                <thead className="tbl-head">
                  <tr>
                    <th className="w-56">Grandeza</th>
                    <th className="w-24">Unidade</th>
                    <th>Parâmetros associados</th>
                  </tr>
                </thead>
                <tbody>
                  {eq.grandezas.map(g => {
                    const params = paramsDa(eq.id, g.nome)
                    return (
                      <tr key={g.id} className="tbl-row align-top">
                        <td className="font-medium text-white/80">{g.nome}</td>
                        <td className="font-mono text-[11px]">{g.unidade}</td>
                        <td>
                          {params.length ? (
                            <div className="flex flex-wrap gap-1.5 py-1">
                              {params.map(p => (
                                <span key={p} className="text-[10px] font-mono px-2 py-0.5 rounded border border-teal/20 bg-teal/5 text-teal/80">{p}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-white/25">— nenhum parâmetro nos certificados</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
