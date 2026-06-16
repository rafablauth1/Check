'use client'

import { TEMPLATES } from '@/lib/checagens/templates'

export default function TemplatesPage() {
  const lista = Object.values(TEMPLATES)

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Checagens</p>
          <h1 className="page-title">Templates de checagem</h1>
          <p className="page-sub">Por subgrupo de equipamento</p>
        </div>
      </div>

      <div className="space-y-4">
        {lista.map(tpl => (
          <div key={tpl.subgrupoId} className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[14px] text-white">{tpl.nome}</h2>
                <p className="text-[10px] font-mono text-white/30">
                  {tpl.subgrupoId} · Periodicidade padrão: {tpl.periodicidadePadrao} dias
                </p>
              </div>
              <span className="badge font-mono text-[9px]">{tpl.itens.length} iten{tpl.itens.length !== 1 ? 's' : ''}</span>
            </div>
            <table className="w-full">
              <thead className="tbl-head">
                <tr>
                  <th>Descrição</th>
                  <th>Unidade</th>
                  <th>Critério mín.</th>
                  <th>Critério máx.</th>
                  <th>Norma</th>
                </tr>
              </thead>
              <tbody>
                {tpl.itens.map((item, i) => (
                  <tr key={i} className="tbl-row">
                    <td className="text-white/80">{item.descricao}</td>
                    <td className="font-mono text-[11px]">{item.unidade}</td>
                    <td className="font-mono text-[11px] text-white/40">
                      {item.criterioMin !== undefined ? item.criterioMin : '—'}
                    </td>
                    <td className="font-mono text-[11px] text-white/40">
                      {item.criterioMax !== undefined ? item.criterioMax : '—'}
                    </td>
                    <td className="text-[10px] font-mono text-white/35">
                      {item.normaId ? `${item.normaId}${item.secao ? ` §${item.secao}` : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
