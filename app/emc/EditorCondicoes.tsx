'use client'

import { Plus, X } from 'lucide-react'
import type { Condicao, Operador, Pergunta } from '@/lib/emc/tipos'

// Editor de condições sobre as perguntas de um template ("pergunta é / não é /
// inclui valor", combinadas com E). Usado nas regras dos templates de ensaio e
// nos acréscimos de tempo do planner.

export function valoresDe(p: Pergunta | undefined): string[] {
  if (!p) return []
  return p.tipo === 'simnao' ? ['sim', 'nao'] : (p.opcoes ?? [])
}
export function operadoresDe(p: Pergunta | undefined): [Operador, string][] {
  return p?.tipo === 'multipla' ? [['inclui', 'inclui'], ['naoInclui', 'não inclui']] : [['eh', 'é'], ['naoEh', 'não é']]
}
export function novaCondicao(perguntas: Pergunta[]): Condicao | null {
  const p = perguntas[0]
  if (!p) return null
  return { perguntaId: p.id, operador: operadoresDe(p)[0][0], valor: valoresDe(p)[0] ?? '' }
}

export function EditorCondicoes({ conds, perguntas, onChange, vazio }: {
  conds: Condicao[]; perguntas: Pergunta[]; onChange: (c: Condicao[]) => void; vazio: string
}) {
  return (
    <div className="flex flex-col gap-1">
      {conds.length === 0 && <span className="text-[10px] text-white/30 italic">{vazio}</span>}
      {conds.map((c, i) => {
        const p = perguntas.find(x => x.id === c.perguntaId)
        const set = (parcial: Partial<Condicao>) => onChange(conds.map((x, j) => j === i ? { ...x, ...parcial } : x))
        return (
          <div key={i} className="flex items-center gap-1 flex-wrap">
            {i > 0 && <span className="text-[9px] font-mono text-teal/60">E</span>}
            <select className="input py-0.5 text-[11px] w-auto max-w-[200px]" value={c.perguntaId}
              onChange={e => {
                const np = perguntas.find(x => x.id === e.target.value)
                set({ perguntaId: e.target.value, operador: operadoresDe(np)[0][0], valor: valoresDe(np)[0] ?? '' })
              }}>
              {perguntas.map(x => <option key={x.id} value={x.id}>{x.texto || x.id}</option>)}
            </select>
            <select className="input py-0.5 text-[11px] w-auto" value={c.operador} onChange={e => set({ operador: e.target.value as Operador })}>
              {operadoresDe(p).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="input py-0.5 text-[11px] w-auto" value={c.valor} onChange={e => set({ valor: e.target.value })}>
              {valoresDe(p).map(v => <option key={v} value={v}>{v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : v}</option>)}
            </select>
            <button type="button" onClick={() => onChange(conds.filter((_, j) => j !== i))}
              className="text-white/25 hover:text-red-400"><X size={11} /></button>
          </div>
        )
      })}
      {perguntas.length > 0 && (
        <button type="button" onClick={() => { const n = novaCondicao(perguntas); if (n) onChange([...conds, n]) }}
          className="text-[10px] text-white/35 hover:text-teal w-fit flex items-center gap-1"><Plus size={9} /> condição</button>
      )}
    </div>
  )
}
