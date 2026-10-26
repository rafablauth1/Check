'use client'

import { useMemo, useState } from 'react'
import { Printer, X, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Icone } from '@/lib/taxonomia/icones'
import type { AgendaItemEmc, EnsaioCatalogo } from '@/lib/emc/tipos'
import { daysUntil, diasNoLab, fmtDate, BadgeEnsaio } from '@/app/agenda/emc/comum'

/* Aba Follow-up da agenda EMC: situação dos ensaios dos itens em andamento,
   por tipo de equipamento, com PDF para mandar ao comercial/cliente — mesmo
   formato do follow-up da agenda LUM (api.saveFollowupPdf no Electron). */

type FiltroEnsaio = 'todos' | 'algum_pend' | 'todos_ok' | `pend:${string}`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const todosOk = (i: AgendaItemEmc) => i.ensaios.length > 0 && i.ensaios.every(e => e.status === 'realizado')

interface StatsTipo {
  nome: string; icone: string; total: number; andamento: number; concluidos: number
  porEnsaio: { codigo: string; feitos: number; total: number }[]
}

export function FollowupEmc({ itens, catalogo }: { itens: AgendaItemEmc[]; catalogo: EnsaioCatalogo[] }) {
  const [fuCliente, setFuCliente] = useState('')
  const [fuTipo,    setFuTipo]    = useState('')
  const [fuEnsaio,  setFuEnsaio]  = useState<FiltroEnsaio>('todos')
  const [pdfModo,   setPdfModo]   = useState<'lista' | 'cliente'>('lista')

  const emAndamento = useMemo(() => itens.filter(i => !i.numRelatorio)
    .sort((a, b) => (a.previsaoSaida || '9999').localeCompare(b.previsaoSaida || '9999')), [itens])
  const clientes = useMemo(() => [...new Set(emAndamento.map(i => i.cliente).filter(Boolean))].sort(), [emAndamento])
  const tipos = useMemo(() => {
    const m = new Map<string, { nome: string; icone: string }>()
    itens.forEach(i => m.set(i.templateId, { nome: i.template.nome, icone: i.template.icone }))
    return [...m.entries()]
  }, [itens])
  const codigosEmUso = useMemo(() => {
    const ids = new Set(emAndamento.flatMap(i => i.ensaios.map(e => e.ensaioId)))
    return catalogo.filter(c => ids.has(c.id))
  }, [emAndamento, catalogo])

  const lista = emAndamento
    .filter(i => !fuCliente || i.cliente === fuCliente)
    .filter(i => !fuTipo || i.templateId === fuTipo)
    .filter(i => {
      if (fuEnsaio === 'todos') return true
      if (fuEnsaio === 'algum_pend') return i.ensaios.some(e => e.status === 'pendente')
      if (fuEnsaio === 'todos_ok') return todosOk(i)
      const id = fuEnsaio.slice(5)
      return i.ensaios.some(e => e.ensaioId === id && e.status === 'pendente')
    })

  // cards por tipo (respeitam o filtro de cliente)
  const stats: StatsTipo[] = useMemo(() => {
    const base = itens.filter(i => !fuCliente || i.cliente === fuCliente).filter(i => !fuTipo || i.templateId === fuTipo)
    const m = new Map<string, StatsTipo>()
    for (const i of base) {
      const s = m.get(i.templateId) ?? { nome: i.template.nome, icone: i.template.icone, total: 0, andamento: 0, concluidos: 0, porEnsaio: [] }
      s.total++
      if (i.numRelatorio) { s.concluidos++ } else {
        s.andamento++
        for (const e of i.ensaios) {
          let pe = s.porEnsaio.find(x => x.codigo === e.codigo)
          if (!pe) { pe = { codigo: e.codigo, feitos: 0, total: 0 }; s.porEnsaio.push(pe) }
          pe.total++
          if (e.status === 'realizado') pe.feitos++
        }
      }
      m.set(i.templateId, s)
    }
    const ordem = (c: string) => { const k = catalogo.findIndex(x => x.codigo === c); return k < 0 ? 999 : k }
    return [...m.values()].map(s => ({ ...s, porEnsaio: s.porEnsaio.sort((a, b) => ordem(a.codigo) - ordem(b.codigo)) }))
  }, [itens, fuCliente, fuTipo, catalogo])

  function htmlRelatorio(): string {
    const NAVY = '#1F3864'
    const dataLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    const filtro = [
      fuTipo ? tipos.find(t => t[0] === fuTipo)?.[1].nome ?? '' : '',
      fuCliente,
      fuEnsaio === 'algum_pend' ? 'Algum ensaio pendente'
        : fuEnsaio === 'todos_ok' ? 'Aguardando emissão'
        : fuEnsaio.startsWith('pend:') ? `${catalogo.find(c => c.id === fuEnsaio.slice(5))?.codigo ?? ''} pendente` : '',
    ].filter(Boolean).join(' · ')

    const card = (s: StatsTipo) => `<div class="sum-card">
      <div class="sum-title">${esc(s.nome)}</div>
      <div class="sum-row"><span>Total</span><span class="val">${s.total}</span></div>
      <div class="sum-row"><span>Em andamento</span><span class="val" style="color:#b45309">${s.andamento}</span></div>
      <div class="sum-row"><span>Emitidos</span><span class="val" style="color:#16a34a">${s.concluidos}</span></div>
      ${s.porEnsaio.length ? `<div class="prog-wrap">${s.porEnsaio.map(p => {
        const pct = p.total ? Math.round((p.feitos / p.total) * 100) : 0
        return `<div class="prog-row"><div class="prog-label"><span>${esc(p.codigo)}</span><span>${p.feitos}/${p.total} — ${pct}%</span></div>
          <div class="prog-bg"><div class="prog-fill" style="width:${pct}%;background:${pct === 100 ? '#16a34a' : '#4ade80'}"></div></div></div>`
      }).join('')}</div>` : ''}
    </div>`

    const ensaiosCell = (i: AgendaItemEmc) => i.ensaios.map(e => {
      const cls = e.status === 'realizado' ? 'e-ok' : e.status === 'reprovado' ? 'e-fail' : 'e-pend'
      const sim = e.status === 'realizado' ? '&#10003;' : e.status === 'reprovado' ? '&#10007;' : '&#9675;'
      return `<span class="ens ${cls}">${sim} ${esc(e.codigo)}</span>`
    }).join(' ')

    const prazoCell = (i: AgendaItemEmc) => {
      if (!i.previsaoSaida) return `<td class="r" style="color:#999">sem prazo${todosOk(i) ? '<div class="ag">AG. EMISSÃO</div>' : ''}</td>`
      const d = daysUntil(i.previsaoSaida)
      const badge = d < 0 ? `<span class="pb late">${d}d</span>` : d <= 3 ? `<span class="pb warn">+${d}d</span>` : `<span class="pb ok2">+${d}d</span>`
      return `<td class="r ${d < 0 ? 'late' : d <= 3 ? 'warn' : ''}">${fmtDate(i.previsaoSaida)} ${badge}${todosOk(i) ? '<div class="ag">AG. EMISSÃO</div>' : ''}</td>`
    }

    const cab = `<thead><tr><th>Tipo</th><th>Protocolo</th><th>Cliente</th><th>Produto / Série</th><th>Ensaios</th><th class="r">No lab</th><th class="r">Previsão / Prazo</th></tr></thead>`
    const linha = (i: AgendaItemEmc, k: number) => `<tr class="${k % 2 ? 'alt' : ''}">
      <td class="tipo">${esc(i.template.nome)}</td>
      <td class="mono">${esc(i.protocolo || '—')}</td>
      <td>${esc(i.cliente || '—')}</td>
      <td>${esc(i.produto || '—')}${i.numeroSerie ? `<div class="sub2">S/N ${esc(i.numeroSerie)}</div>` : ''}</td>
      <td>${ensaiosCell(i)}</td>
      <td class="r lab">${diasNoLab(i.dataEntrada)}d</td>
      ${prazoCell(i)}
    </tr>`

    let tabela = ''
    if (lista.length === 0) tabela = '<p style="color:#999;padding:24px 0;text-align:center">Nenhum item em andamento.</p>'
    else if (pdfModo === 'cliente') {
      tabela = [...new Set(lista.map(i => i.cliente || '—'))].sort().map(c => {
        const its = lista.filter(i => (i.cliente || '—') === c)
        return `<div class="grupo"><div class="grupo-t">${esc(c)} <span class="grupo-n">${its.length} ${its.length === 1 ? 'item' : 'itens'}</span></div>
          <table>${cab}<tbody>${its.map(linha).join('')}</tbody></table></div>`
      }).join('')
    } else {
      tabela = `<div class="sec">Em andamento — ${lista.length} ${lista.length === 1 ? 'item' : 'itens'}</div><table>${cab}<tbody>${lista.map(linha).join('')}</tbody></table>`
    }

    const atrasados = lista.filter(i => i.previsaoSaida && daysUntil(i.previsaoSaida) < 0)
    const alerta = atrasados.length ? `<div class="alerta"><strong>&#9888; ${atrasados.length} ${atrasados.length === 1 ? 'item atrasado' : 'itens atrasados'}:</strong>
      ${atrasados.map(i => `<span class="al-i">${esc(i.protocolo || i.produto || '—')} (${esc(i.cliente || '—')}, ${Math.abs(daysUntil(i.previsaoSaida))}d)</span>`).join('')}</div>` : ''

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Follow-up EMC — LABELO PUCRS</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1a1a1a;background:#fff;padding:28px 32px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid ${NAVY};padding-bottom:14px;margin-bottom:20px}
.hdr h1{font-size:15px;font-weight:bold;color:${NAVY}}.hdr .sub{font-size:10px;color:#666;margin-top:3px}
.hdr-r{text-align:right}.hdr-r .lab{font-size:11px;font-weight:bold;color:${NAVY}}.hdr-r .dt{font-size:10px;color:#888;margin-top:3px}
.filtro{display:inline-block;margin-bottom:16px;background:#f0f4ff;border:1px solid #bdd7ee;border-radius:4px;padding:4px 10px;font-size:10px;color:${NAVY}}
.summary{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:22px}
.sum-card{flex:1;min-width:180px;border:1px solid #ddd;border-radius:6px;padding:14px}
.sum-title{font-size:10px;font-weight:bold;color:${NAVY};text-transform:uppercase;letter-spacing:.06em;margin-bottom:9px}
.sum-row{display:flex;justify-content:space-between;padding:2px 0;font-size:11px}.val{font-weight:bold;font-family:monospace}
.prog-wrap{margin-top:10px;border-top:1px solid #eee;padding-top:8px}.prog-row{margin-bottom:5px}
.prog-label{display:flex;justify-content:space-between;font-size:10px;color:#666;margin-bottom:3px}
.prog-bg{background:#e5e7eb;border-radius:3px;height:7px;overflow:hidden}.prog-fill{height:100%;border-radius:3px}
.sec{font-size:10px;font-weight:bold;color:${NAVY};text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.alerta{background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:10px;color:#b91c1c;display:flex;flex-wrap:wrap;gap:6px}
.al-i{background:#fee2e2;border-radius:3px;padding:1px 6px;white-space:nowrap}
.grupo{margin-bottom:20px}.grupo-t{font-size:11px;font-weight:bold;color:${NAVY};border-bottom:1px solid ${NAVY};padding-bottom:5px;margin-bottom:8px}
.grupo-n{font-size:10px;font-weight:normal;color:#666;margin-left:6px}
table{width:100%;border-collapse:collapse;font-size:11px}thead tr{background:${NAVY}}
thead th{color:#fff;text-align:left;padding:7px 10px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
tbody tr{border-bottom:1px solid #e9ecef}tbody tr.alt{background:#f8f9fa}tbody td{padding:6px 10px;vertical-align:middle}
td.mono{font-family:monospace;font-size:10px;color:#555;white-space:nowrap}td.tipo{font-size:10px;color:#555}
td.lab{color:#888}.sub2{font-size:9px;color:#888}
.r{text-align:right;font-family:monospace;font-size:10px;white-space:nowrap}
.ens{display:inline-block;font-family:monospace;font-size:9px;font-weight:bold;border-radius:3px;padding:1px 4px;margin:1px 0;white-space:nowrap}
.e-ok{background:#dcfce7;color:#15803d}.e-fail{background:#fee2e2;color:#dc2626}.e-pend{background:#f3f4f6;color:#9ca3af}
.pb{display:inline-block;border-radius:3px;padding:0 4px;font-size:9px;font-weight:bold;margin-left:3px}
.pb.late{background:#fee2e2;color:#dc2626}.pb.warn{background:#fef3c7;color:#d97706}.pb.ok2{background:#f0fdf4;color:#16a34a}
td.warn{color:#d97706;font-weight:bold}td.late{color:#dc2626;font-weight:bold}
.ag{font-size:8px;color:#16a34a;font-weight:bold;letter-spacing:.04em}
.footer{margin-top:28px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#aaa}
@media print{body{padding:0}@page{size:A4 landscape;margin:10mm 12mm}}
</style></head><body>
<div class="hdr"><div><h1>Situação dos Ensaios — Follow-up</h1><div class="sub">EMC · Ensaios de Imunidade (IEC 61000-4-x)</div></div>
<div class="hdr-r"><div class="lab">LABELO · PUCRS</div><div class="dt">${dataLabel}</div></div></div>
${filtro ? `<div class="filtro">Filtro: ${esc(filtro)}</div>` : ''}
<div class="summary">${stats.map(card).join('')}</div>
${alerta}
${tabela}
<div class="footer"><span>Gerado em ${new Date().toLocaleString('pt-BR')}</span><span>Documento interno · LABELO PUCRS · Confidencial</span></div>
</body></html>`
  }

  function imprimir() {
    const iso = new Date().toISOString().split('T')[0]
    const tipoNome = fuTipo ? tipos.find(t => t[0] === fuTipo)?.[1].nome ?? '' : ''
    const cli = fuCliente ? fuCliente.slice(0, 30).replace(/[/\\:"*?<>|]/g, '') : ''
    const nome = ['Follow-up EMC', tipoNome, cli || 'Geral', pdfModo === 'cliente' ? 'PorCliente' : '', iso]
      .filter(Boolean).join(' ').replace(/[/\\:"*?<>|]/g, '') + '.pdf'
    const html = htmlRelatorio()
    const api = (window as any).electronAPI
    if (api?.saveFollowupPdf) {
      api.saveFollowupPdf(html, nome, true).then((r: any) => { if (!r.ok) alert('Erro ao gerar PDF: ' + r.error) })
      return
    }
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html); win.document.close()
    setTimeout(() => { win.print(); win.addEventListener('afterprint', () => win.close(), { once: true }) }, 400)
  }

  const filtrando = fuCliente || fuTipo || fuEnsaio !== 'todos'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select className="input py-1 text-xs max-w-[170px]" value={fuTipo} onChange={e => setFuTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {tipos.map(([id, t]) => <option key={id} value={id}>{t.nome}</option>)}
        </select>
        <select className="input py-1 text-xs max-w-[190px]" value={fuCliente} onChange={e => setFuCliente(e.target.value)}>
          <option value="">Todos os clientes</option>
          {clientes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input py-1 text-xs max-w-[190px]" value={fuEnsaio} onChange={e => setFuEnsaio(e.target.value as FiltroEnsaio)}>
          <option value="todos">Todos os ensaios</option>
          <option value="algum_pend">Algum ensaio pendente</option>
          <option value="todos_ok">Aguardando emissão (tudo realizado)</option>
          {codigosEmUso.map(c => <option key={c.id} value={`pend:${c.id}`}>{c.codigo} pendente</option>)}
        </select>
        {filtrando && (
          <button type="button" onClick={() => { setFuCliente(''); setFuTipo(''); setFuEnsaio('todos') }}
            className="text-[10px] text-white/35 hover:text-white/70 flex items-center gap-1"><X size={10} /> limpar</button>
        )}
        <div className="flex-1" />
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8">
          {([['lista', 'Lista'], ['cliente', 'Por cliente']] as const).map(([m, l]) => (
            <button key={m} type="button" onClick={() => setPdfModo(m)}
              className={cn('px-2.5 py-1 rounded text-[10px] font-semibold', pdfModo === m ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60')}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={imprimir}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold/30 bg-gold/8 text-gold hover:bg-gold/14 text-xs font-semibold">
          <Printer size={11} /> Gerar PDF
        </button>
      </div>

      {/* cards por tipo */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.length === 0 && <div className="card p-6 text-center text-white/25 text-sm col-span-full">Nenhum item.</div>}
        {stats.map(s => (
          <div key={s.nome} className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Icone name={s.icone} size={14} className="text-teal/70" />
              <span className="text-sm font-bold text-white truncate">{s.nome}</span>
              <span className="ml-auto text-[10px] font-mono text-white/30">{s.andamento} and. · {s.concluidos} emit.</span>
            </div>
            {s.porEnsaio.length === 0
              ? <p className="text-[10px] text-white/25">Nada em andamento.</p>
              : s.porEnsaio.map(p => {
                  const pct = p.total ? (p.feitos / p.total) * 100 : 0
                  return (
                    <div key={p.codigo} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-white/50 w-9">{p.codigo}</span>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? 'rgba(74,222,128,0.7)' : 'rgba(74,222,128,0.45)' }} />
                      </div>
                      <span className={cn('text-[10px] font-mono w-10 text-right', pct === 100 ? 'text-green-400' : 'text-white/40')}>{p.feitos}/{p.total}</span>
                    </div>
                  )
                })}
          </div>
        ))}
      </div>

      {/* tabela dos itens em andamento */}
      {lista.length === 0 ? (
        <div className="card p-8 text-center text-white/25 text-sm">
          {emAndamento.length === 0 ? 'Nenhum item em andamento no momento.' : 'Nenhum item corresponde aos filtros.'}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-white/30 font-mono uppercase tracking-wider border-b border-white/6">
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Protocolo</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Produto</th>
                <th className="px-3 py-2 text-left">Ensaios</th>
                <th className="px-3 py-2 text-right">No lab</th>
                <th className="px-3 py-2 text-right">Previsão</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(i => {
                const d = daysUntil(i.previsaoSaida)
                const ok = todosOk(i)
                return (
                  <tr key={i.id} className="border-b border-white/4 hover:bg-white/[0.02]">
                    <td className="px-3 py-2"><Icone name={i.template.icone} size={12} className="text-teal/70" /></td>
                    <td className="px-3 py-2 font-mono text-white/70 whitespace-nowrap">{i.protocolo || '—'}</td>
                    <td className="px-3 py-2 text-white/50 max-w-[150px] truncate">{i.cliente || '—'}</td>
                    <td className="px-3 py-2 text-white/40 max-w-[150px] truncate">{i.produto || '—'}</td>
                    <td className="px-3 py-2"><div className="flex gap-0.5 flex-wrap">{i.ensaios.map(e => <BadgeEnsaio key={e.ensaioId} e={e} small />)}</div></td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-white/30">{diasNoLab(i.dataEntrada)}d</td>
                    <td className={cn('px-3 py-2 text-right font-mono text-[11px] whitespace-nowrap',
                      !i.previsaoSaida ? 'text-white/25' : d < 0 ? 'text-red-400' : d <= 3 ? 'text-amber-400' : 'text-white/40')}>
                      {i.previsaoSaida ? <>{fmtDate(i.previsaoSaida)} <span className="text-[9px]">{d < 0 ? `${d}d` : `+${d}d`}</span></> : 'sem prazo'}
                      {ok && (
                        <div className="text-[9px] font-sans font-semibold text-green-400/80 uppercase mt-0.5 flex items-center gap-1 justify-end">
                          <CheckCircle2 size={9} /> Ag. emissão
                        </div>
                      )}
                      {i.ensaios.some(e => e.status === 'reprovado') && (
                        <div className="text-[9px] font-sans font-semibold text-red-400/80 uppercase mt-0.5 flex items-center gap-1 justify-end">
                          <XCircle size={9} /> Reprovação
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
