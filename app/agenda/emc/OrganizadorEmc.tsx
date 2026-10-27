'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, FolderInput, FolderOpen, Send, Archive, ArchiveRestore, SearchCheck, Settings2, X, Loader2,
  ChevronRight, ChevronDown, CheckSquare, Square, AlertTriangle, CheckCircle2, Wifi, WifiOff, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgendaItemEmc } from '@/lib/emc/tipos'
import type { ConfigOrganizador, LinhaLog, ProtocoloOrigem, ArquivoVerificado, Finalizado } from '@/lib/emc/organizador/tipos'
import { analisarSerie, fmt, lerProtocolo, mesmoProtocolo, type AnaliseSerie } from '@/lib/emc/organizador/dat'
import {
  lerEstruturaOrganizador, salvarConfigOrganizador, organizarOrigem, enviarEnsaios, verificarPastas, excluirPontosDat,
  finalizarProtocolos, reabrirProtocolos, listarFinalizadosOrganizador, abrirNoExplorer, type Estrutura,
} from '@/lib/emc/organizador/cliente'
import { BadgeEnsaio, Label } from '@/app/agenda/emc/comum'

/* Aba "Radian" da agenda EMC — o Organizador de ensaios dentro do app.
   Lê o PC do Radian (Origem), organiza os .DAT por protocolo/norma, envia para
   o registro na rede (Destino) e mostra, ao lado de cada protocolo, a amostra
   da agenda com os ensaios — que a sincronização marca sozinha como realizados
   quando aparece .DAT deles. */

const nomeBase = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

const COR_LOG: Record<string, string> = { ok: 'text-green-400/90', aviso: 'text-amber-300/90', erro: 'text-red-400', info: 'text-sky-300/90' }

export function OrganizadorEmc({ itens, onAgendaMudou }: { itens: AgendaItemEmc[]; onAgendaMudou: () => void }) {
  const [dados,     setDados]     = useState<Estrutura | null>(null)
  const [ocupado,   setOcupado]   = useState<string | null>('Lendo pastas da rede…')
  const [status,    setStatus]    = useState('')
  const [log,       setLog]       = useState<LinhaLog[]>([])
  const [marcados,  setMarcados]  = useState<Set<string>>(new Set())
  const [abertos,   setAbertos]   = useState<Set<string>>(new Set())
  const [filtro,    setFiltro]    = useState('')
  const [rascunho,  setRascunho]  = useState<ConfigOrganizador | null>(null)
  const [verif,     setVerif]     = useState<{ pastas: string[]; arquivos: ArquivoVerificado[]; continuar?: () => void } | null>(null)
  const [finalizados, setFinalizados] = useState<Finalizado[] | null>(null)

  const cfg = dados?.config
  const estrutura = dados?.estrutura ?? []

  /** Roda uma ação travando os botões; mostra erro no log. */
  async function rodar<T>(texto: string, fn: () => Promise<T>, limpar = true): Promise<T | undefined> {
    setOcupado(texto)
    if (limpar) setLog([])
    try { return await fn() }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLog(l => [...l, { msg: 'ERRO: ' + msg, tag: 'erro' }]); setStatus('Erro: ' + msg.split('\n')[0])
    } finally { setOcupado(null) }
  }

  async function carregar(manterLog = true) {
    const r = await rodar('Lendo pastas da rede…', lerEstruturaOrganizador, !manterLog)
    if (!r) return
    setDados(r)
    const caminhosValidos = new Set(r.estrutura.flatMap(p => [p.caminho, ...p.filhos.map(c => c.caminho)]))
    setMarcados(m => new Set([...m].filter(x => caminhosValidos.has(x))))
    if (!r.origemOnline) { setStatus(`Origem não encontrada (${r.config.origem}). O PC do Radian está ligado?`); return }
    const faltam = r.estrutura.filter(p => p.dest !== null && p.dest.length !== 1).length
    let txt = `${r.estrutura.length} protocolo(s) em ${r.config.origem}`
    if (!r.destinoOnline) txt += '  |  destino inacessível, não verifiquei as pastas'
    else if (faltam) txt += `  |  ⚠ ${faltam} sem pasta (certa) no destino`
    setStatus(txt)
  }
  useEffect(() => { carregar(false) }, [])

  /* ── amostra da agenda de cada protocolo ── */
  const itemDoProtocolo = useMemo(() => {
    const m = new Map<string, AgendaItemEmc>()
    for (const p of estrutura) {
      const pr = lerProtocolo(p.nome)
      const it = pr && itens.find(i => { const q = lerProtocolo(i.protocolo || ''); return q && mesmoProtocolo(pr, q) })
      if (it) m.set(p.caminho, it)
    }
    return m
  }, [estrutura, itens])

  /* ── marcação (mesma regra do Organizador: marcar o protocolo marca os ensaios) ── */
  const visiveis = estrutura.filter(p => !filtro.trim() || p.nome.toLowerCase().includes(filtro.trim().toLowerCase()))

  function alternar(p: ProtocoloOrigem, filho?: string) {
    setMarcados(atual => {
      const m = new Set(atual)
      if (filho) {
        m.has(filho) ? m.delete(filho) : m.add(filho)
        if (p.filhos.every(c => m.has(c.caminho))) m.add(p.caminho); else m.delete(p.caminho)
      } else {
        const novo = !m.has(p.caminho)
        for (const x of [p.caminho, ...p.filhos.map(c => c.caminho)]) novo ? m.add(x) : m.delete(x)
      }
      return m
    })
  }
  function marcarVisiveis(v: boolean) {
    setMarcados(atual => {
      const m = new Set(atual)
      for (const p of visiveis) for (const x of [p.caminho, ...p.filhos.map(c => c.caminho)]) v ? m.add(x) : m.delete(x)
      return m
    })
  }

  /** Pastas de ensaio marcadas, ou o protocolo inteiro se ele não tiver subpasta. */
  const unidades = useMemo(() => estrutura.flatMap(p => !p.filhos.length
    ? (marcados.has(p.caminho) ? [p.caminho] : [])
    : p.filhos.filter(c => marcados.has(c.caminho)).map(c => c.caminho)), [estrutura, marcados])

  const protocolosMarcados = estrutura.filter(p => marcados.has(p.caminho) || p.filhos.some(c => marcados.has(c.caminho)))

  /* ── ações ── */
  async function organizar(simular: boolean) {
    const r = await rodar(simular ? 'Simulando…' : 'Organizando…', () => organizarOrigem(simular))
    if (!r) return
    setLog(r.log); setStatus(r.resumo)
    if (!simular) carregar()
  }

  async function enviar() {
    if (!cfg) return
    if (!unidades.length) { alert('Nenhum protocolo marcado.\nMarca na lista o que vai ser enviado.'); return }
    if (cfg.verificarAoEnviar) { verificar(unidades, () => confirmarEnvio()); return }
    confirmarEnvio()
  }

  async function confirmarEnvio() {
    if (!cfg) return
    if (!confirm(`Enviar ${unidades.length} ensaio(s) para:\n${cfg.destino}\n\nVai para <protocolo>\\Radian\\ e os .DAT enviados\nficam renomeados com _Enviado na origem.`)) return
    const r = await rodar('Enviando…', () => enviarEnsaios(unidades))
    if (!r) return
    setLog(r.log); setStatus(r.resumo); setMarcados(new Set())
    const n = r.sincronizacao?.atualizados.length ?? 0
    if (n) { setLog(l => [...l, { msg: `Agenda: ${n} amostra(s) com ensaio marcado como realizado`, tag: 'info' }]); onAgendaMudou() }
    carregar()
  }

  async function verificar(pastas: string[], continuar?: () => void) {
    const r = await rodar('Lendo os .DAT…', () => verificarPastas(pastas))
    if (!r) return
    setLog([{ msg: `VERIFICANDO pontos dos .DAT em ${pastas.length} pasta(s)`, tag: 'info' }, ...r.log])
    if (!r.arquivos.length) {
      setLog(l => [...l, { msg: 'Nenhum .DAT com medições pra verificar.', tag: 'aviso' }])
      continuar?.()
      return
    }
    const limite = cfg?.limiteDesvio ?? 1
    const total = r.arquivos.reduce((a, f) => a + f.series.reduce((b, s) => b + analisarSerie(s, limite).destoantes.length, 0), 0)
    if (continuar && !total) { setStatus(`Nenhum ponto destoante em ${r.arquivos.length} arquivo(s).`); continuar(); return }
    setVerif({ pastas, arquivos: r.arquivos, continuar })
  }

  async function finalizar() {
    if (!protocolosMarcados.length) { alert('Marca na lista os protocolos que terminaram.'); return }
    const pend = protocolosMarcados.filter(p => p.dat > p.env).map(p => p.nome)
    let msg = `Finalizar ${protocolosMarcados.length} protocolo(s)?\n\n` + protocolosMarcados.slice(0, 15).map(p => '  • ' + p.nome).join('\n')
      + (protocolosMarcados.length > 15 ? '\n  ...' : '') + '\n\nAs pastas vão para _Finalizados\\ e saem da lista.'
    if (pend.length) msg += '\n\n⚠ Ainda têm .DAT NÃO enviados:\n' + pend.slice(0, 10).map(n => '  • ' + n).join('\n') + (pend.length > 10 ? '\n  ...' : '')
    if (!confirm(msg)) return
    const r = await rodar('Finalizando…', () => finalizarProtocolos(protocolosMarcados.map(p => p.caminho)))
    if (!r) return
    setLog(r.log); setStatus(r.resumo); setMarcados(new Set()); carregar()
  }

  async function abrirFinalizados() {
    const r = await rodar('Lendo finalizados…', listarFinalizadosOrganizador, false)
    if (!r) return
    if (!r.itens.length) { alert('Nenhum protocolo finalizado ainda.'); return }
    setFinalizados(r.itens)
  }

  async function salvarConfig(parcial: Partial<ConfigOrganizador>) {
    const novo = await rodar('Salvando…', () => salvarConfigOrganizador(parcial), false)
    if (novo) { setDados(d => d && { ...d, config: novo }); return novo }
  }

  /* ── tela ── */
  const botao = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-40'
  const neutro = 'border-white/10 text-white/55 hover:text-white hover:border-white/25'

  return (
    <div className="space-y-3">
      {/* Origem / Destino */}
      <div className="card p-3 space-y-1.5">
        {([['Origem', 'PC do Radian', cfg?.origem, dados?.origemOnline], ['Destino', 'registro na rede', cfg?.destino, dados?.destinoOnline]] as const)
          .map(([rot, desc, cam, on]) => (
            <div key={rot} className="flex items-center gap-2 text-[11px] min-w-0">
              {on ? <Wifi size={11} className="text-green-400 shrink-0" /> : <WifiOff size={11} className={cn('shrink-0', dados ? 'text-red-400' : 'text-white/25')} />}
              <span className="text-white/35 font-mono uppercase text-[9px] tracking-widest w-14 shrink-0">{rot}</span>
              <span className="font-mono text-white/70 truncate" title={cam}>{cam ?? '…'}</span>
              <span className="text-white/25 shrink-0">· {desc}{dados && !on ? ' — inacessível' : ''}</span>
              {cam && on && (
                <button type="button" onClick={() => abrirNoExplorer(cam)} title="Abrir no Explorer" className="text-white/30 hover:text-teal shrink-0">
                  <FolderOpen size={11} />
                </button>
              )}
            </div>
          ))}
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={() => cfg && setRascunho(cfg)} disabled={!cfg} className={cn(botao, neutro, 'py-1 text-[11px]')}>
            <Settings2 size={11} /> Pastas
          </button>
          <label className="flex items-center gap-1.5 text-[11px] text-white/45 cursor-pointer select-none">
            <input type="checkbox" className="accent-gold" checked={!!cfg?.verificarAoEnviar} disabled={!cfg}
              onChange={e => salvarConfig({ verificarAoEnviar: e.target.checked })} />
            Verificar pontos antes de enviar
          </label>
          <span className="flex-1" />
          <span className="text-[10px] text-white/25">A agenda marca sozinha os ensaios com .DAT (origem ou destino).</span>
        </div>
      </div>

      {/* Barra */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => organizar(true)} disabled={!!ocupado || !dados?.origemOnline} className={cn(botao, neutro)}>
          <FolderInput size={11} /> Simular
        </button>
        <button type="button" onClick={() => { if (confirm('Mover os .DAT soltos para <protocolo>\\<norma>\\ no PC do Radian?')) organizar(false) }}
          disabled={!!ocupado || !dados?.origemOnline} className={cn(botao, neutro)}>
          <FolderInput size={11} /> Organizar
        </button>
        <button type="button" onClick={() => carregar()} disabled={!!ocupado} className={cn(botao, neutro)}>
          <RefreshCw size={11} className={ocupado === 'Lendo pastas da rede…' ? 'animate-spin' : ''} /> Atualizar
        </button>
        <input className="input py-1 text-xs w-44" placeholder="Filtrar protocolo…" value={filtro} onChange={e => setFiltro(e.target.value)} />
        <span className="flex-1" />
        <button type="button" onClick={() => marcarVisiveis(true)} className="text-[11px] text-white/40 hover:text-white/70">Todos</button>
        <button type="button" onClick={() => marcarVisiveis(false)} className="text-[11px] text-white/40 hover:text-white/70">Nenhum</button>
      </div>

      {/* Lista */}
      <div className="card p-1.5 max-h-[46vh] overflow-y-auto">
        {!dados ? (
          <p className="p-6 text-center text-white/30 text-sm flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" /> Lendo pastas da rede…</p>
        ) : !dados.origemOnline ? (
          <p className="p-6 text-center text-white/35 text-sm">
            Não consegui abrir <span className="font-mono text-white/55">{cfg?.origem}</span>.<br />
            <span className="text-[11px] text-white/25">O PC do Radian precisa estar ligado e com a pasta compartilhada. A agenda continua sendo atualizada pelo que já está no destino.</span>
          </p>
        ) : !visiveis.length ? (
          <p className="p-6 text-center text-white/30 text-sm">{estrutura.length ? 'Nenhum protocolo com esse filtro.' : 'Nenhum protocolo na origem.'}</p>
        ) : visiveis.map(p => {
          const aberto = abertos.has(p.caminho)
          const item = itemDoProtocolo.get(p.caminho)
          return (
            <div key={p.caminho}>
              <div className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-white/[0.04] group">
                <button type="button" onClick={() => setAbertos(a => { const n = new Set(a); n.has(p.caminho) ? n.delete(p.caminho) : n.add(p.caminho); return n })}
                  className={cn('text-white/30 hover:text-white/70', !p.filhos.length && 'invisible')}>
                  {aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <button type="button" onClick={() => alternar(p)} className="text-white/45 hover:text-gold">
                  {marcados.has(p.caminho) ? <CheckSquare size={13} className="text-gold" /> : <Square size={13} />}
                </button>
                <span className="font-mono text-xs font-bold text-white w-[170px] truncate shrink-0" title={p.nome}>{p.nome}</span>
                <span className="text-[10px] text-white/30 shrink-0">{p.filhos.length} ensaio(s)</span>
                <MarcaEnvio dat={p.dat} env={p.env} />
                {p.dest !== null && p.dest.length === 0 && (
                  <span className="text-[10px] text-orange-400 flex items-center gap-1 shrink-0"><AlertTriangle size={10} /> sem pasta no destino</span>
                )}
                {p.dest !== null && p.dest.length > 1 && (
                  <span className="text-[10px] text-orange-400 flex items-center gap-1 truncate" title={p.dest.join('\n')}>
                    <AlertTriangle size={10} /> mais de uma pasta no destino: {p.dest.map(nomeBase).join(' | ')}
                  </span>
                )}
                <span className="flex-1" />
                {item ? (
                  <span className="flex items-center gap-1 min-w-0" title={`Agenda: ${item.protocolo} · ${item.cliente}`}>
                    <span className="text-[10px] text-white/35 truncate max-w-[140px]">{item.cliente}</span>
                    <span className="flex gap-0.5 flex-wrap justify-end">{item.ensaios.map(e => <BadgeEnsaio key={e.ensaioId} e={e} small />)}</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-white/20 italic shrink-0">fora da agenda EMC</span>
                )}
                <button type="button" onClick={() => abrirNoExplorer(p.caminho)} title="Abrir no Explorer"
                  className="text-white/25 hover:text-teal opacity-0 group-hover:opacity-100 shrink-0"><FolderOpen size={11} /></button>
                <button type="button" onClick={() => verificar([p.caminho])} title="Verificar pontos destoantes"
                  className="text-white/25 hover:text-teal opacity-0 group-hover:opacity-100 shrink-0"><SearchCheck size={11} /></button>
              </div>
              {aberto && p.filhos.map(c => (
                <div key={c.caminho} className="flex items-center gap-1.5 pl-9 pr-1.5 py-0.5 rounded hover:bg-white/[0.04] group">
                  <button type="button" onClick={() => alternar(p, c.caminho)} className="text-white/45 hover:text-gold">
                    {marcados.has(c.caminho) ? <CheckSquare size={12} className="text-gold" /> : <Square size={12} />}
                  </button>
                  <span className="font-mono text-[11px] text-white/70">{c.nome}</span>
                  <span className="text-[10px] text-white/25">{c.dat} .DAT</span>
                  <MarcaEnvio dat={c.dat} env={c.env} />
                  <span className="flex-1" />
                  <button type="button" onClick={() => abrirNoExplorer(c.caminho)} title="Abrir no Explorer"
                    className="text-white/25 hover:text-teal opacity-0 group-hover:opacity-100"><FolderOpen size={10} /></button>
                  <button type="button" onClick={() => verificar([c.caminho])} title="Verificar pontos destoantes"
                    className="text-white/25 hover:text-teal opacity-0 group-hover:opacity-100"><SearchCheck size={10} /></button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Log */}
      <div className="rounded-lg bg-[#121212] border border-white/8 px-3 py-2 h-28 overflow-y-auto font-mono text-[10.5px] leading-relaxed">
        {log.length ? log.map((l, i) => <div key={i} className={cn('whitespace-pre', l.tag ? COR_LOG[l.tag] : 'text-white/60')}>{l.msg}</div>)
          : <span className="text-white/20">Sem mensagens.</span>}
      </div>
      <p className="text-[10px] text-white/35 flex items-center gap-1.5 min-h-[14px]">
        {ocupado && <Loader2 size={10} className="animate-spin" />}{ocupado ?? status}
      </p>

      {/* Ações */}
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={finalizar} disabled={!!ocupado || !dados?.origemOnline} className={cn(botao, neutro)}>
          <Archive size={11} /> Finalizar selecionados
        </button>
        <button type="button" onClick={abrirFinalizados} disabled={!!ocupado || !dados?.origemOnline} className={cn(botao, neutro)}>
          <ArchiveRestore size={11} /> Finalizados…
        </button>
        <button type="button" disabled={!!ocupado || !dados?.origemOnline}
          onClick={() => { if (unidades.length) verificar(unidades); else alert('Marca na lista (ou use a lupa) o ensaio que quer verificar.') }}
          className={cn(botao, neutro)}>
          <SearchCheck size={11} /> Verificar leituras
        </button>
        <span className="flex-1" />
        <button type="button" onClick={enviar} disabled={!!ocupado || !dados?.origemOnline} className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-40">
          <Send size={12} /> Enviar selecionados ({unidades.length})
        </button>
      </div>

      {rascunho && (
        <ModalPastas cfg={rascunho} onFechar={() => setRascunho(null)}
          onSalvar={async c => { if (await salvarConfig(c)) { setRascunho(null); carregar() } }} />
      )}
      {verif && cfg && (
        <ModalVerificacao arquivosIniciais={verif.arquivos} limiteInicial={cfg.limiteDesvio} continuar={verif.continuar}
          onLimite={v => salvarConfig({ limiteDesvio: v })}
          onExcluiu={linhas => setLog(l => [...l, ...linhas])}
          recarregarArquivos={async () => (await verificarPastas(verif.pastas)).arquivos}
          onFechar={(mudou, seguir) => { setVerif(null); if (seguir) seguir(); else if (mudou) carregar() }} />
      )}
      {finalizados && (
        <ModalFinalizados itens={finalizados} onFechar={() => setFinalizados(null)} raiz={cfg?.origem ?? ''}
          onReabrir={async sel => {
            setFinalizados(null)
            const r = await rodar('Reabrindo…', () => reabrirProtocolos(sel))
            if (r) { setLog(r.log); setStatus(r.resumo); carregar() }
          }} />
      )}
    </div>
  )
}

function MarcaEnvio({ dat, env }: { dat: number; env: number }) {
  if (!dat || !env) return null
  return env === dat
    ? <span className="text-[10px] text-green-400/90 flex items-center gap-0.5 shrink-0"><CheckCircle2 size={9} /> enviado</span>
    : <span className="text-[10px] text-sky-400/90 shrink-0">◐ {env} de {dat} enviados</span>
}

/* ── pastas (origem / destino) ──────────────────────────────────────────── */
function ModalPastas({ cfg, onSalvar, onFechar }: { cfg: ConfigOrganizador; onSalvar: (c: ConfigOrganizador) => void; onFechar: () => void }) {
  const [c, setC] = useState(cfg)
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="card w-full max-w-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center"><p className="text-sm font-semibold text-white flex-1">Pastas do Organizador</p>
          <button type="button" onClick={onFechar} className="text-white/40 hover:text-white"><X size={14} /></button></div>
        <div className="space-y-1">
          <Label>Origem — PC do Radian</Label>
          <input className="input w-full font-mono text-xs" value={c.origem} onChange={e => setC({ ...c, origem: e.target.value })} />
          <p className="text-[10px] text-white/30">Ex.: Y:\ ou \\10.30.35.191\RR-PCSuite (o caminho de rede funciona em qualquer PC, mesmo sem a unidade Y:).</p>
        </div>
        <div className="space-y-1">
          <Label>Destino — registros de ensaio na rede</Label>
          <input className="input w-full font-mono text-xs" value={c.destino} onChange={e => setC({ ...c, destino: e.target.value })} />
          <p className="text-[10px] text-white/30">Pasta com uma pasta por protocolo (ML - 2026). Vale para todos os PCs.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="px-4 py-1.5 rounded-lg border border-white/10 text-white/50 text-xs">Cancelar</button>
          <button type="button" onClick={() => onSalvar(c)} className="btn-primary px-4 py-1.5 text-xs">Salvar</button>
        </div>
      </div>
    </div>
  )
}

/* ── pontos destoantes ──────────────────────────────────────────────────── */
interface ArquivoAnalisado extends ArquivoVerificado { analise: AnaliseSerie[]; qtd: number }

function analisar(arquivos: ArquivoVerificado[], limite: number): ArquivoAnalisado[] {
  return arquivos.map(a => {
    const analise = a.series.map(s => analisarSerie(s, limite))
    return { ...a, analise, qtd: analise.reduce((n, x) => n + x.destoantes.length, 0) }
  })
}

const hora = (iso: string | null, comData = false) => {
  if (!iso) return ''
  const [d, h] = iso.split('T')
  return comData ? `${d.slice(8, 10)}/${d.slice(5, 7)} ${h}` : h.slice(0, 5)
}

function ModalVerificacao({ arquivosIniciais, limiteInicial, continuar, onLimite, onExcluiu, recarregarArquivos, onFechar }: {
  arquivosIniciais: ArquivoVerificado[]
  limiteInicial: number
  continuar?: () => void
  onLimite: (v: number) => void
  onExcluiu: (linhas: LinhaLog[]) => void
  recarregarArquivos: () => Promise<ArquivoVerificado[]>
  onFechar: (mudou: boolean, seguir?: () => void) => void
}) {
  const [arquivos, setArquivos] = useState(arquivosIniciais)
  const [limiteTxt, setLimiteTxt] = useState(String(limiteInicial).replace('.', ','))
  const [limite, setLimite] = useState(limiteInicial)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [mudou, setMudou] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const itens = useMemo(() => analisar(arquivos, limite)
    .sort((a, b) => Number(a.qtd === 0) - Number(b.qtd === 0) || a.arquivo.toLowerCase().localeCompare(b.arquivo.toLowerCase())), [arquivos, limite])
  const total = itens.reduce((n, i) => n + i.qtd, 0)
  const chave = (arq: string, bloco: number) => `${arq}#${bloco}`

  function recalcular() {
    const v = Number(limiteTxt.replace(',', '.'))
    if (!(v > 0)) { alert('Limite inválido.'); return }
    setLimite(v); onLimite(v)
  }

  function marcarTodos(arq: ArquivoAnalisado, serie?: AnaliseSerie) {
    const ks = (serie ? [serie] : arq.analise).flatMap(a => a.destoantes.map(d => chave(arq.arquivo, d.ponto.bloco)))
    setSel(s => { const n = new Set(s); const todos = ks.every(k => n.has(k)); ks.forEach(k => todos ? n.delete(k) : n.add(k)); return n })
  }

  async function excluir() {
    if (!sel.size) { alert('Marca os pontos em vermelho que quer excluir.'); return }
    const porArq = new Map<string, { bloco: number; hash: string }[]>()
    for (const it of itens) for (const a of it.analise) for (const d of a.destoantes) {
      if (sel.has(chave(it.arquivo, d.ponto.bloco))) {
        porArq.set(it.arquivo, [...(porArq.get(it.arquivo) ?? []), { bloco: d.ponto.bloco, hash: d.ponto.hash }])
      }
    }
    if (!confirm(`Excluir ${sel.size} ponto(s) de ${porArq.size} arquivo(s)?\n\nO .DAT original fica guardado no backup (pasta de dados da rede).\nMédia/desvio que o Radian gravou nas outras linhas não são recalculados.`)) return
    setOcupado(true)
    try {
      const r = await excluirPontosDat([...porArq.entries()].map(([arquivo, pontos]) => ({ arquivo, pontos })))
      onExcluiu(r.log)
      setSel(new Set()); setMudou(true)
      setArquivos(await recarregarArquivos())
    } catch (e) { alert('Não foi possível excluir: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setOcupado(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="card w-full max-w-5xl max-h-[88vh] flex flex-col p-4 gap-3">
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-white/55">
          <p className="text-sm font-semibold text-white mr-3">Pontos destoantes</p>
          Destoa se ficar a mais de
          <input className="input py-0.5 w-16 text-xs text-center" value={limiteTxt} onChange={e => setLimiteTxt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') recalcular() }} />
          % da mediana da série
          <button type="button" onClick={recalcular} className="px-2.5 py-1 rounded border border-white/12 text-white/60 hover:text-white">Recalcular</button>
          <span className="flex-1" />
          <span className={total ? 'text-red-400' : 'text-green-400'}>
            {total ? `${total} destoante(s) em ${itens.filter(i => i.qtd).length} de ${itens.length} arquivo(s)` : `Nenhum ponto destoante em ${itens.length} arquivo(s).`}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto border border-white/8 rounded-lg">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#1a1a1a] text-white/35 text-[10px] uppercase font-mono">
              <tr><th className="text-left px-2 py-1.5">Arquivo / série</th><th className="text-left px-2">Hora</th><th className="text-left px-2">Run</th><th className="text-left px-2">%Error</th><th className="text-left px-2"></th></tr>
            </thead>
            <tbody>
              {itens.map(it => {
                const nPts = it.series.reduce((n, s) => n + s.length, 0)
                return [
                  <tr key={it.arquivo} className="border-t border-white/6">
                    <td className={cn('px-2 py-1 font-mono', it.qtd ? 'text-red-400' : 'text-green-400/90')} title={it.arquivo}>
                      {it.qtd > 0 && (
                        <button type="button" onClick={() => marcarTodos(it)} className="mr-1 align-middle text-white/40 hover:text-gold" title="Marcar todos os destoantes do arquivo">
                          <CheckSquare size={11} />
                        </button>
                      )}
                      {nomeBase(it.arquivo)} <span className="text-white/30">({nPts} pontos)</span>
                    </td>
                    <td /><td /><td />
                    <td className={cn('px-2', it.qtd ? 'text-red-400' : 'text-green-400/90')}>
                      {it.qtd ? `⚠ ${it.qtd} destoante(s)` : '✔ OK'}
                      <button type="button" onClick={() => abrirNoExplorer(it.arquivo.replace(/[\\/][^\\/]+$/, ''))} className="ml-2 text-white/30 hover:text-teal align-middle" title="Abrir pasta"><FolderOpen size={10} /></button>
                    </td>
                  </tr>,
                  ...it.analise.flatMap((a, si) => {
                    const horas = it.series[si].map(p => p.quando).filter((q): q is string => !!q).sort()
                    return [
                      <tr key={`${it.arquivo}#s${si}`} className="text-white/45">
                        <td className={cn('pl-6 pr-2 py-0.5', a.destoantes.length && 'text-red-400/90')}>
                          {a.destoantes.length > 0 && (
                            <button type="button" onClick={() => marcarTodos(it, a)} className="mr-1 align-middle text-white/40 hover:text-gold" title="Marcar destoantes da série">
                              <CheckSquare size={10} />
                            </button>
                          )}
                          Série {si + 1}: {a.n} pontos
                        </td>
                        <td className="px-2 font-mono">{horas.length ? `${hora(horas[0])} - ${hora(horas[horas.length - 1])}` : ''}</td>
                        <td />
                        <td className="px-2 font-mono">mediana {fmt(a.mediana)}</td>
                        <td className="px-2 font-mono">média {fmt(a.media)}{a.destoantes.length ? `  →  sem destoantes ${fmt(a.mediaSem)}` : ''}</td>
                      </tr>,
                      ...a.destoantes.map(d => {
                        const k = chave(it.arquivo, d.ponto.bloco)
                        return (
                          <tr key={k} onClick={() => setSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })}
                            className={cn('text-red-400 cursor-pointer hover:bg-red-500/8', sel.has(k) && 'bg-red-500/12')}>
                            <td className="pl-10 pr-2 py-0.5">{sel.has(k) ? <CheckSquare size={11} className="inline text-gold" /> : <Square size={11} className="inline" />} ⚠</td>
                            <td className="px-2 font-mono">{hora(d.ponto.quando, true)}</td>
                            <td className="px-2 font-mono">{d.ponto.run ?? ''}</td>
                            <td className="px-2 font-mono">{fmt(d.ponto.erro)}</td>
                            <td className="px-2">{d.motivo}</td>
                          </tr>
                        )
                      }),
                    ]
                  }),
                ]
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={excluir} disabled={ocupado || !sel.size}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs font-semibold disabled:opacity-40">
            {ocupado ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Excluir selecionados ({sel.size})
          </button>
          <span className="text-[10px] text-white/30">O original vai para o backup antes de excluir.</span>
          <span className="flex-1" />
          {continuar ? (<>
            <button type="button" onClick={() => onFechar(mudou)} className="px-4 py-1.5 rounded-lg border border-white/10 text-white/50 text-xs">Cancelar envio</button>
            <button type="button" onClick={() => onFechar(mudou, continuar)} className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs"><Send size={11} /> Enviar</button>
          </>) : (
            <button type="button" onClick={() => onFechar(mudou)} className="px-4 py-1.5 rounded-lg border border-white/10 text-white/60 text-xs">Fechar</button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── finalizados ────────────────────────────────────────────────────────── */
function ModalFinalizados({ itens, raiz, onReabrir, onFechar }: {
  itens: Finalizado[]; raiz: string; onReabrir: (caminhos: string[]) => void; onFechar: () => void
}) {
  const [f, setF] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const visiveis = itens.filter(i => !f.trim() || i.nome.toLowerCase().includes(f.trim().toLowerCase()))
  function reabrir(lista = [...sel]) {
    if (!lista.length) { alert('Seleciona na lista.'); return }
    if (confirm(`Voltar ${lista.length} protocolo(s) para a lista?`)) onReabrir(lista)
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="card w-full max-w-md max-h-[80vh] flex flex-col p-4 gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center"><p className="text-sm font-semibold text-white flex-1">Finalizados</p>
          <button type="button" onClick={onFechar} className="text-white/40 hover:text-white"><X size={14} /></button></div>
        <input className="input text-xs" autoFocus placeholder="Filtrar…" value={f} onChange={e => setF(e.target.value)} />
        <div className="flex-1 overflow-y-auto border border-white/8 rounded-lg">
          {visiveis.map(i => (
            <div key={i.caminho} onClick={() => setSel(s => { const n = new Set(s); n.has(i.caminho) ? n.delete(i.caminho) : n.add(i.caminho); return n })}
              onDoubleClick={() => reabrir([i.caminho])}
              className={cn('flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-white/5', sel.has(i.caminho) && 'bg-gold/10')}>
              {sel.has(i.caminho) ? <CheckSquare size={12} className="text-gold" /> : <Square size={12} className="text-white/35" />}
              <span className="font-mono text-white/80 flex-1 truncate">{i.nome}</span>
              <span className="text-[10px] text-white/30">{i.mtime ? new Date(i.mtime).toLocaleDateString('pt-BR') : ''}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => abrirNoExplorer(raiz.replace(/[\\/]+$/, '') + '\\_Finalizados')} className="px-3 py-1.5 rounded-lg border border-white/10 text-white/50 text-xs flex items-center gap-1"><FolderOpen size={11} /> Abrir no Explorer</button>
          <span className="flex-1" />
          <button type="button" onClick={() => reabrir()} className="btn-primary px-4 py-1.5 text-xs">Voltar pra lista ({sel.size})</button>
        </div>
      </div>
    </div>
  )
}
