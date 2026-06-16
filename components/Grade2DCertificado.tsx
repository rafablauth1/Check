'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Loader2, Trash2, Plus, ScanText, TableIcon } from 'lucide-react'
import { cn, fileToBase64 } from '@/lib/utils'
import { extrairTextoArquivo } from '@/lib/useOCR'
import { corrigirGrandezasPorLayout } from '@/lib/certificados/layout'
import { parsearMetadadosCertificado, parsearDadosPadrao } from '@/lib/certificados/parser'

export interface CertMeta { numero: string; laboratorio: string; dataEmissao: string; equipamentoTag?: string }
import {
  interpolarBilinear,
  parsearTabelaCertificado2D,
  parsearCertificadoRBC,
  extrairGrade,
  type PontoCalibracao2D,
} from '@/lib/interpolacao'

interface Props {
  eixo1Nome: string
  eixo1Unidade: string
  eixo2Nome: string
  eixo2Unidade: string
  pontos: PontoCalibracao2D[]
  onChange: (pontos: PontoCalibracao2D[]) => void
  onEixoChange: (campo: 'eixo1Nome'|'eixo1Unidade'|'eixo2Nome'|'eixo2Unidade', valor: string) => void
  onPontosAtivos?: (pontos: PontoCalibracao2D[]) => void
  onMeta?: (meta: CertMeta) => void   // dados do certificado (página 1): nº, lab, data, TAG
}

function uid() { return Math.random().toString(36).slice(2) }

/** Converte número para string sem notação científica, preservando casas decimais. */
function fmtN(n: number | undefined, prefix = false, casas?: number): string {
  if (n === undefined || !isFinite(n)) return '—'
  // casas definidas → formata com nº fixo de decimais (alinha MM/correção ao VR)
  if (typeof casas === 'number' && casas >= 0 && casas <= 20) {
    const r = n.toFixed(casas)
    return prefix ? (n >= 0 ? '+' : '') + r : r
  }
  const s = String(n)
  let result = s
  if (s.includes('e')) {
    const neg = s.startsWith('-')
    const abs = s.replace(/^-/, '')
    const [mant, expStr] = abs.split('e')
    const exp = parseInt(expStr)
    if (exp < 0) {
      const mantDec = mant.includes('.') ? mant.split('.')[1].length : 0
      const decimals = Math.abs(exp) + mantDec
      result = n.toFixed(Math.min(decimals, 20))
    }
  }
  return prefix ? (n >= 0 ? '+' : '') + result : result
}

export function Grade2DCertificado({
  eixo1Nome, eixo1Unidade, eixo2Nome, eixo2Unidade,
  pontos, onChange, onEixoChange, onPontosAtivos, onMeta,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading,   setLoading]   = useState(false)
  const [textoOCR,  setTextoOCR]  = useState('')
  const [aba,       setAba]       = useState<'tabela'|'grade'|'ocr'>('tabela')
  const [testE1,       setTestE1]       = useState('')
  const [testE1b,      setTestE1b]      = useState('')
  const [testE2,       setTestE2]       = useState('')
  const [testGrandeza, setTestGrandeza] = useState('')
  const [testParametro, setTestParametro] = useState('')
  const [dragOver,    setDragOver]    = useState(false)
  const [bloqueado,   setBloqueado]   = useState(false)

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFile(file: File) {
    setLoading(true)
    try {
      const api = (window as unknown as { electronAPI?: { extractPdfLayout?: (b: string) => Promise<{ ok: boolean; items: { s: string; x: number; y: number; page?: number }[]; text?: string }> } }).electronAPI
      const isPdf = /\.pdf$/i.test(file.name)
      // PDF no Electron: UMA passada de pdf-parse devolve texto + layout (não trava 2×)
      let texto = ''
      let layoutItems: { s: string; x: number; y: number; page?: number }[] | null = null
      if (api?.extractPdfLayout && isPdf) {
        try {
          const res = await api.extractPdfLayout(await fileToBase64(file))
          if (res?.ok) { texto = res.text || ''; layoutItems = res.items?.length ? res.items : null }
        } catch {}
      }
      if (!texto) texto = await extrairTextoArquivo(file)   // imagem ou fallback
      setTextoOCR(texto)
      // Dados do certificado (página 1: equipamento + certificado) — nº, lab, data, TAG.
      if (onMeta) {
        try {
          const meta = parsearMetadadosCertificado(texto)
          const dados = parsearDadosPadrao(texto)
          onMeta({
            numero: meta.numero || dados.numeroCertificado || '',
            laboratorio: meta.laboratorio || dados.labCalibracao || '',
            dataEmissao: meta.dataEmissao || dados.ultimaCalibracao || '',
            equipamentoTag: dados.tag,
          })
        } catch {}
      }
      const fix = (pts: PontoCalibracao2D[]) => layoutItems ? corrigirGrandezasPorLayout(pts, layoutItems) : pts
      const rbc = parsearCertificadoRBC(texto)
      if (rbc.pontos.length >= 3) {
        onChange(fix(rbc.pontos))
        onEixoChange('eixo1Nome',    rbc.eixo1Nome)
        onEixoChange('eixo1Unidade', rbc.eixo1Unidade)
        onEixoChange('eixo2Nome',    rbc.eixo2Nome)
        onEixoChange('eixo2Unidade', rbc.eixo2Unidade)
        setBloqueado(true); setAba('grade')
      } else {
        const detectados = parsearTabelaCertificado2D(texto)
        if (detectados.length) {
          onChange(fix(detectados))
          setBloqueado(true); setAba('grade')
        } else {
          setAba('ocr')
        }
      }
    } catch(e: unknown) { alert('Erro ao ler arquivo: ' + String(e)) }
    finally { setLoading(false) }
  }

  function aplicarOCR() {
    const rbc = parsearCertificadoRBC(textoOCR)
    if (rbc.pontos.length >= 3) {
      onChange(rbc.pontos)
      onEixoChange('eixo1Nome',    rbc.eixo1Nome)
      onEixoChange('eixo1Unidade', rbc.eixo1Unidade)
      onEixoChange('eixo2Nome',    rbc.eixo2Nome)
      onEixoChange('eixo2Unidade', rbc.eixo2Unidade)
      setBloqueado(true); setAba('grade')
      return
    }
    const detectados = parsearTabelaCertificado2D(textoOCR)
    if (!detectados.length) { alert('Nenhum ponto identificado. Verifique o texto ou edite manualmente.'); return }
    onChange(detectados)
    setBloqueado(true); setAba('grade')
  }

  function addPonto() {
    onChange([...pontos, { eixo1: 0, eixo2: 0, correcao: 0 }])
  }

  function updatePonto(idx: number, campo: keyof PontoCalibracao2D, val: string) {
    const next = pontos.map((p, i) => i === idx ? { ...p, [campo]: parseFloat(val) || 0 } : p)
    onChange(next)
  }

  function removePonto(idx: number) {
    onChange(pontos.filter((_, i) => i !== idx))
  }

  // Grandezas únicas detectadas
  const grandezasDisponiveis = [...new Set(pontos.map(p => p.grandeza ?? '').filter(Boolean))]
  // Parâmetros filtrados pela grandeza selecionada
  const parametrosDisponiveis = [...new Set(
    pontos
      .filter(p => !testGrandeza || p.grandeza === testGrandeza)
      .map(p => p.tabela ?? '').filter(Boolean)
  )]

  const pontosParaTeste = (() => {
    let pts = pontos
    if (testGrandeza)  pts = pts.filter(p => p.grandeza === testGrandeza)
    if (testParametro) pts = pts.filter(p => p.tabela   === testParametro)
    if (testE1b.trim() && pts.some(p => p.eixo1b !== undefined)) {
      const v = parseFloat(testE1b)
      if (isFinite(v)) {
        const valores = [...new Set(pts.filter(p => p.eixo1b !== undefined).map(p => p.eixo1b as number))]
        const nearest = valores.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, valores[0])
        pts = pts.filter(p => p.eixo1b === nearest)
      }
    }
    return pts
  })()

  useEffect(() => { onPontosAtivos?.(pontosParaTeste) }, [pontosParaTeste]) // eslint-disable-line react-hooks/exhaustive-deps
  const testeGrp = pontosParaTeste[0]
  const correcaoTeste = (testE1 && testE2)
    ? interpolarBilinear(parseFloat(testE1), parseFloat(testE2), pontosParaTeste)
    : null

  const { eixo1Vals, eixo2Vals, grade } = extrairGrade(pontos)
  const inp = 'input text-[11px] py-1 px-2 h-7 w-full'

  return (
    <div
      className={cn('card p-4 space-y-4 transition-all', dragOver && 'border-teal/50 bg-teal/3')}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <p className="form-section !pt-0 !pb-0">Grade de correção 2D — Interpolação bilinear</p>
          {bloqueado && <p className="text-[10px] text-teal/60 mt-0.5 font-mono">Importado via OCR — somente leitura · <button type="button" className="underline hover:text-teal" onClick={()=>setBloqueado(false)}>desbloquear</button></p>}
          {dragOver && <p className="text-[11px] text-teal mt-1">Solte o arquivo para processar via OCR</p>}
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".pdf,image/*,.txt" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="btn-secondary text-xs py-1">
            {loading ? <Loader2 size={12} className="animate-spin"/> : <ScanText size={12}/>}
            {loading ? 'Lendo…' : 'OCR / arrastar arquivo'}
          </button>
          {!bloqueado && (
            <button type="button" onClick={addPonto} className="btn-ghost text-xs py-1">
              <Plus size={12}/> Ponto
            </button>
          )}
        </div>
      </div>

      {/* Nomes dos eixos */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: `Eixo 1 — nome`,    val: eixo1Nome,    campo: 'eixo1Nome'    as const },
          { label: `Eixo 1 — unidade`, val: eixo1Unidade, campo: 'eixo1Unidade' as const },
          { label: `Eixo 2 — nome`,    val: eixo2Nome,    campo: 'eixo2Nome'    as const },
          { label: `Eixo 2 — unidade`, val: eixo2Unidade, campo: 'eixo2Unidade' as const },
        ].map(({ label, val, campo }) => (
          <div key={campo}>
            <label className="text-[9px] font-mono uppercase tracking-widest text-white/30 block mb-1">{label}</label>
            <input className={cn('input text-xs py-1', bloqueado && 'opacity-50 cursor-not-allowed')}
              value={val} readOnly={bloqueado}
              onChange={e => !bloqueado && onEixoChange(campo, e.target.value)}
              placeholder={label.includes('nome') ? 'ex: Frequência' : 'ex: MHz'} />
          </div>
        ))}
      </div>

      {/* Abas — sticky no topo do scroll para ficarem acessíveis em tabelas longas */}
      <div className="flex items-center justify-between border-b border-white/6 pb-0 sticky top-0 z-10 -mx-5 px-5 py-2"
           style={{ background: 'rgba(12,16,26,0.92)', backdropFilter: 'blur(8px)' }}>
        <div className="flex gap-1">
          {([['tabela','Tabela de pontos'],['grade','Visualização grade'],['ocr','Texto OCR']] as [typeof aba, string][]).map(([k,l])=>(
            <button key={k} type="button" onClick={()=>setAba(k)}
              className={cn('px-3 py-1.5 text-[11px] rounded-t-lg transition-all',
                aba===k ? 'bg-white/8 text-white border-b-2 border-gold' : 'text-white/35 hover:text-white/60')}>
              {l}
            </button>
          ))}
        </div>
        {pontos.length > 0 && (
          <span className="text-[10px] font-mono text-white/30 pr-1">
            {pontos.length} pts · {[...new Set(pontos.map(p=>p.eixo1))].length} freq × {[...new Set(pontos.map(p=>p.eixo2))].length} VR
          </span>
        )}
      </div>

      {/* Aba: Tabela de pontos */}
      {aba === 'tabela' && (
        <div className="overflow-x-auto max-h-64">
          {pontos.length === 0 ? (
            <p className="text-white/25 text-[12px] text-center py-6">
              Nenhum ponto. Use OCR ou adicione manualmente.
            </p>
          ) : (() => {
            type Grupo = { grandeza: string; nome: string; items: { p: PontoCalibracao2D; i: number }[] }
            const grupos: Grupo[] = []
            const comTabela = pontos.some(p => p.tabela)
            if (comTabela) {
              const params = [...new Set(pontos.map(p => p.tabela ?? ''))]
              for (const nome of params) {
                const items = pontos.map((p, i) => ({ p, i })).filter(({ p }) => p.tabela === nome)
                if (items.length) grupos.push({ grandeza: items[0].p.grandeza ?? '', nome, items })
              }
            } else {
              grupos.push({ grandeza: '', nome: '', items: pontos.map((p, i) => ({ p, i })) })
            }
            let lastGrandeza = ''
            return (
              <div className="space-y-4">
                {grupos.map(({ grandeza, nome, items }) => {
                  const showGrandeza = grandeza && grandeza !== lastGrandeza
                  if (showGrandeza) lastGrandeza = grandeza
                  const firstP  = items[0]?.p
                  const u1      = firstP?.eixo1Unidade  ?? eixo1Unidade
                  const u1b     = firstP?.eixo1bUnidade ?? ''
                  const u2      = firstP?.eixo2Unidade  ?? eixo2Unidade
                  const has1b   = items.some(({ p }) => p.eixo1b !== undefined)
                  const is1DGrp = items.every(({ p }) => p.eixo2 === p.eixo1)
                  const roInp   = cn(inp, bloqueado && 'opacity-50 cursor-not-allowed')
                  return (
                    <div key={nome}>
                      {showGrandeza && (
                        <p className="text-[10px] font-mono uppercase tracking-widest text-gold/60 mb-1 mt-2 border-l-2 border-gold/40 pl-2">{grandeza}</p>
                      )}
                      {nome && (
                        <p className="text-[10px] font-mono tracking-widest text-white/40 mb-1 border-l-2 border-teal/40 pl-2">{nome}</p>
                      )}
                      {items.some(({ p }) => p.minSpec) && (
                        <div className="text-[10px] text-amber-300/80 bg-amber-400/8 border border-amber-400/20 rounded-lg px-2.5 py-1.5 mb-1.5 flex items-start gap-1.5">
                          <span className="shrink-0">ℹ</span>
                          <span>Parâmetro de <b>mínimo</b> (reflexão / perda de retorno): quando <b>MM ≥ VR</b> o equipamento já atende o requisito (<b>Apto</b>). A correção é informada mesmo assim.</span>
                        </div>
                      )}
                      <table className="w-full text-[11px]">
                        <thead className="tbl-head">
                          <tr>
                            {!is1DGrp && <th>{eixo1Nome||'Eixo 1'} ({u1||'—'})</th>}
                            {has1b && <th>{firstP?.eixo1bNome||'Aux'} ({u1b||'—'})</th>}
                            <th>VR ({u2||'—'})</th>
                            <th>MM ({u2||'—'})</th>
                            <th>Correção ({u2||'—'})</th>
                            <th>IM ({u2||'—'})</th>
                            {firstP?.minSpec && <th title="Equipamento atende o mínimo (MM ≥ VR)">Apto</th>}
                            {!bloqueado && <th className="w-8"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(({ p, i }) => {
                            const mmDisp = p.eixo2 - p.correcao
                            return (
                              <tr key={i} className="tbl-row group/row">
                                {!is1DGrp && <td className="font-mono text-[10px] px-2 text-white/60">{fmtN(p.eixo1)}</td>}
                                {has1b && <td className="font-mono text-[10px] px-2 text-amber-400/70">{fmtN(p.eixo1b)}</td>}
                                <td className="font-mono text-[10px] px-2 text-white/60">{fmtN(p.eixo2, false, p.casas)}</td>
                                <td className="font-mono text-[10px] px-2 text-white/50">{fmtN(mmDisp, false, p.casas)}</td>
                                <td className="font-mono text-[10px] px-2 text-teal/70">{fmtN(p.correcao, true, p.casas)}</td>
                                <td className="font-mono text-[10px] px-2 text-white/40">{fmtN(p.incerteza)}</td>
                                {p.minSpec && (
                                  <td className="px-2 text-[10px] font-mono whitespace-nowrap">
                                    {p.apto
                                      ? <span className="text-green-400">Apto ✓</span>
                                      : <span className="text-red-400">Não ✗</span>}
                                  </td>
                                )}
                                {!bloqueado && (
                                  <td>
                                    <button type="button" onClick={()=>removePonto(i)}
                                      className="opacity-0 group-hover/row:opacity-100 text-white/25 hover:text-red-400 p-0.5 transition-all">
                                      <Trash2 size={11}/>
                                    </button>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* Aba: Visualização grade */}
      {aba === 'grade' && (
        <div className="space-y-3">
          {eixo1Vals.length === 0 ? (
            <p className="text-white/25 text-[12px] text-center py-6">Sem pontos para visualizar.</p>
          ) : (() => {
            const grupos: {nome: string, pontos: typeof pontos}[] = []
            const comTabela = pontos.filter(p => p.tabela)
            if (comTabela.length > 0) {
              const nomes = [...new Set(pontos.map(p => p.tabela ?? ''))]
              nomes.forEach(nome => {
                const pts = pontos.filter(p => p.tabela === nome)
                if (pts.length) grupos.push({ nome, pontos: pts })
              })
            } else {
              grupos.push({ nome: '', pontos })
            }
            return (
              <div className="space-y-5">
                {grupos.map(({ nome, pontos: pts }) => (
                  <div key={nome}>
                    {nome && (
                      <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1 border-l-2 border-teal/40 pl-2">
                        {nome}
                      </p>
                    )}
                    <div className="overflow-x-auto">
                      {(() => {
                        const u1  = pts[0]?.eixo1Unidade  ?? eixo1Unidade
                        const u1b = pts[0]?.eixo1bUnidade ?? ''
                        const u2  = pts[0]?.eixo2Unidade  ?? eixo2Unidade
                        const has1b = pts.some(p => p.eixo1b !== undefined)
                        return (
                      <table className="text-[10px] font-mono border-collapse w-full">
                        <thead>
                          <tr className="bg-white/4">
                            <th className="px-3 py-1.5 text-left text-white/40 border border-white/6 whitespace-nowrap">{eixo1Nome||'Freq'} ({u1||'—'})</th>
                            {has1b && <th className="px-3 py-1.5 text-right text-amber-400/60 border border-white/6 whitespace-nowrap">{pts[0]?.eixo1bNome||'Aux'} ({u1b||'—'})</th>}
                            <th className="px-3 py-1.5 text-right text-white/40 border border-white/6 whitespace-nowrap">VR ({u2||'—'})</th>
                            <th className="px-3 py-1.5 text-right text-white/40 border border-white/6 whitespace-nowrap">MM ({u2||'—'})</th>
                            <th className="px-3 py-1.5 text-right text-teal/60 border border-white/6 whitespace-nowrap">Correção ({u2||'—'})</th>
                            <th className="px-3 py-1.5 text-right text-white/30 border border-white/6 whitespace-nowrap">IM ({u2||'—'})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pts.map((p, i) => {
                            const mm = p.eixo2 - p.correcao
                            const corrStr = fmtN(p.correcao, true, p.casas)
                            return (
                              <tr key={i} className="hover:bg-white/3">
                                <td className="px-3 py-1 text-white/70 border border-white/6 whitespace-nowrap">{fmtN(p.eixo1)}</td>
                                {has1b && <td className="px-3 py-1 text-amber-400/70 border border-white/6 text-right">{fmtN(p.eixo1b)}</td>}
                                <td className="px-3 py-1 text-white/50 border border-white/6 text-right">{fmtN(p.eixo2, false, p.casas)}</td>
                                <td className="px-3 py-1 text-white/50 border border-white/6 text-right">{fmtN(mm, false, p.casas)}</td>
                                <td className={cn('px-3 py-1 border border-white/6 text-right font-bold',
                                  p.correcao > 0 ? 'text-green-400' : p.correcao < 0 ? 'text-red-400' : 'text-white/30')}>
                                  {corrStr}
                                </td>
                                <td className="px-3 py-1 text-white/30 border border-white/6 text-right">{fmtN(p.incerteza)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                        )
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()
          }

          {/* Calculadora de interpolação */}
          {pontos.length > 0 && (
            <div className="border border-white/8 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[9px] font-mono uppercase tracking-widest text-white/30 flex-shrink-0">Teste de interpolação</p>
                <div className="flex gap-2 flex-wrap">
                  {grandezasDisponiveis.length > 0 && (
                    <select className="input text-[10px] py-0.5 h-6 w-auto max-w-[200px]"
                      value={testGrandeza}
                      onChange={e => { setTestGrandeza(e.target.value); setTestParametro('') }}>
                      <option value="">— Grandeza —</option>
                      {grandezasDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                  {parametrosDisponiveis.length > 0 && (
                    <select className="input text-[10px] py-0.5 h-6 w-auto max-w-[200px]"
                      value={testParametro}
                      onChange={e => setTestParametro(e.target.value)}>
                      <option value="">— Parâmetro —</option>
                      {parametrosDisponiveis.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-white/50">
                    {testeGrp?.eixo1Unidade ? `Eixo 1 (${testeGrp.eixo1Unidade})` : eixo1Nome||'Eixo 1'}:
                  </label>
                  <input className="input font-mono text-xs py-1 w-28" type="number"
                    value={testE1} onChange={e=>setTestE1(e.target.value)}
                    placeholder={testeGrp?.eixo1Unidade || eixo1Unidade||'valor'} />
                </div>
                {pontosParaTeste.some(p => p.eixo1b !== undefined) && (
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-white/50">
                      {testeGrp?.eixo1bNome||'Aux'} ({testeGrp?.eixo1bUnidade||'—'}):
                    </label>
                    <input className="input font-mono text-xs py-1 w-28" type="number"
                      value={testE1b} onChange={e=>setTestE1b(e.target.value)}
                      placeholder={testeGrp?.eixo1bUnidade||'valor'} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-white/50">
                    {testeGrp?.eixo2Unidade ? `VR (${testeGrp.eixo2Unidade})` : eixo2Nome||'VR'}:
                  </label>
                  <input className="input font-mono text-xs py-1 w-28" type="number"
                    value={testE2} onChange={e=>setTestE2(e.target.value)}
                    placeholder={testeGrp?.eixo2Unidade || eixo2Unidade||'valor'} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-white/50">
                    Correção ({testeGrp?.vrUnidade || testeGrp?.eixo2Unidade || eixo2Unidade||'—'}):
                  </span>
                  <span className={cn('font-mono text-sm font-bold',
                    correcaoTeste !== null ? 'text-teal' : 'text-white/20')}>
                    {correcaoTeste !== null ? fmtN(correcaoTeste, true) : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aba: Texto OCR */}
      {aba === 'ocr' && (
        <div className="space-y-2">
          <textarea
            className="input font-mono text-xs h-40 resize-none"
            placeholder={'Cole o texto do certificado ou carregue via OCR acima...\n\nFormato esperado por linha: eixo1  eixo2  correção  [incerteza]\nEx: 50  -40  +0.12  0.05'}
            value={textoOCR}
            onChange={e => setTextoOCR(e.target.value)}
          />
          <div className="flex justify-end">
            <button type="button" onClick={aplicarOCR} className="btn-primary text-xs">
              <TableIcon size={12}/> Extrair tabela
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
