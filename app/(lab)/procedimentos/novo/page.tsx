'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, ChevronDown, Save, Check, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import type { Certificado, LinhaCertificado } from '@/lib/certificados/tipos'
import type { GrandezaMetrologica } from '@/lib/metrologia/tipos'
import type { ItemChecagem, TipoComparacao, PapelReferencia } from '@/lib/checagens/tipos'
import { interpolarLinear, interpolarBilinear } from '@/lib/interpolacao'
import type { PontoCalibracaoSimples } from '@/lib/interpolacao'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PadraoEntry { equipId: string; certId: string }

interface PontoBuilder {
  id: string
  modo: 'cert' | 'manual'
  padraoIdx: number
  // cert mode
  certItemIdx: number
  // manual mode
  vnStr: string
  // 2D axes (RF: freq × level)
  eixo1Str: string
  eixo2Str: string
  // measurement (filled during execution)
  mmStr: string
  vrManualStr: string   // when no cert data to interpolate, user enters VR directly
  // derived (computed)
  vrStr: string
  correcaoStr: string
  incertezaStr: string
  // criteria
  criterioMin: string
  criterioMax: string
  obs: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function parseN(s: string | undefined): number | null {
  if (!s?.trim()) return null
  const n = parseFloat(s.trim().replace(',', '.'))
  return isNaN(n) ? null : n
}

function fmtN(n: number): string {
  if (!isFinite(n)) return ''
  if (Math.abs(n) < 0.0001 && n !== 0) return n.toExponential(3)
  const s = parseFloat(n.toPrecision(5)).toString()
  return n >= 0 ? s : s
}

function newPonto(): PontoBuilder {
  return {
    id: uid(), modo: 'cert', padraoIdx: 0, certItemIdx: -1,
    vnStr: '', eixo1Str: '', eixo2Str: '', mmStr: '', vrManualStr: '',
    vrStr: '', correcaoStr: '', incertezaStr: '',
    criterioMin: '', criterioMax: '', obs: '',
  }
}

// Matches grandeza name loosely (handles "Temperatura" vs "Temperatura Ambiente", etc.)
function grandezaMatchesCert(certGrandeza: string | undefined, grandezaNome: string): boolean {
  if (!certGrandeza) return false
  const a = certGrandeza.toLowerCase().trim()
  const b = grandezaNome.toLowerCase().trim()
  return a.includes(b) || b.includes(a)
}

// Dicas e peculiaridades por tipo de grandeza
function getGrandezaInfo(nome: string): { dica?: string; sugestao?: string } {
  const n = nome.toLowerCase()
  if (n.includes('temperatura'))
    return { dica: 'Aguardar estabilização térmica antes de registrar a leitura. Comparação direta — referência gera, instrumento lê.' }
  if (n.includes('umidade') || n.includes('higrometria'))
    return { dica: 'Câmara climática ou gerador de umidade como padrão. Permitir equilíbrio higroscópico.' }
  if (n.includes('pressão') || n.includes('pressao'))
    return { dica: 'Barômetro padrão como referência direta. Isolar de correntes de ar.' }
  if (n.includes('potência') || n.includes('potencia') || n.includes('rf') || n.includes('sinal'))
    return { dica: 'Medição indireta típica: gerador calibrado como fonte, medidor padrão e instrumento medem em paralelo. Dois padrões podem ser necessários.', sugestao: 'indireta' }
  if (n.includes('frequência') || n.includes('frequencia'))
    return { dica: 'Gerador de referência ou contador de frequência como padrão. Comparação direta.' }
  if (n.includes('atenuação') || n.includes('atenuacao'))
    return { dica: 'Medição indireta: VNA ou analisador de espectro + gerador padrão. Corrigir perdas de cabo.', sugestao: 'indireta' }
  if (n.includes('fator de antena') || n.includes('impedância') || n.includes('impedancia'))
    return { dica: 'Medição indireta com VNA calibrado como padrão único, ou gerador + receptor.', sugestao: 'indireta' }
  if (n.includes('tensão') || n.includes('tensao') || n.includes('voltage') || n.includes('corrente'))
    return { dica: 'Calibrador multifunção ou multímetro padrão. Comparação direta.' }
  return {}
}

// ─── GrandezaCard ────────────────────────────────────────────────────────────

interface GrandezaCardProps {
  grandeza: GrandezaMetrologica
  pontos: PontoBuilder[]
  padroes: PadraoEntry[]
  allEquips: EquipamentoEMC[]
  allCerts: Certificado[]
  tipoComp: TipoComparacao
  papel: PapelReferencia
  onChange: (p: PontoBuilder[]) => void
}

function GrandezaCard({ grandeza, pontos, padroes, allEquips, allCerts, tipoComp, papel, onChange }: GrandezaCardProps) {
  const [expanded, setExpanded] = useState(true)

  function getCert(padraoIdx: number): Certificado | undefined {
    const entry = padroes[padraoIdx]
    if (!entry?.equipId) return undefined
    if (entry.certId) return allCerts.find(c => c.id === entry.certId)
    return allCerts
      .filter(c => c.equipamentoId === entry.equipId)
      .sort((a, b) => b.dataEmissao.localeCompare(a.dataEmissao))[0]
  }

  function getCertItems(padraoIdx: number): LinhaCertificado[] {
    const cert = getCert(padraoIdx)
    if (!cert) return []
    return cert.itens.filter(i => grandezaMatchesCert(i.grandeza, grandeza.nome))
  }

  function deriveVR(p: PontoBuilder): Pick<PontoBuilder, 'vrStr' | 'correcaoStr' | 'incertezaStr'> {
    const cert = getCert(p.padraoIdx)
    const certItems = getCertItems(p.padraoIdx)

    if (p.modo === 'cert') {
      if (p.certItemIdx < 0 || p.certItemIdx >= certItems.length)
        return { vrStr: '', correcaoStr: '', incertezaStr: '' }
      const item = certItems[p.certItemIdx]
      const vn = parseN(item.valorNominal), c = parseN(item.correcao)
      if (vn !== null && c !== null)
        return { vrStr: fmtN(vn + c), correcaoStr: item.correcao, incertezaStr: item.incertezaExpandida }
      return { vrStr: item.valorIndicado ?? '', correcaoStr: item.correcao, incertezaStr: item.incertezaExpandida }
    }

    // Manual mode
    const vn = parseN(p.vnStr)
    if (vn === null) return { vrStr: p.vrManualStr, correcaoStr: '', incertezaStr: '' }

    // 2D interpolation (RF: freq × level)
    if (cert?.grade2D && p.eixo1Str && p.eixo2Str) {
      const e1 = parseN(p.eixo1Str), e2 = parseN(p.eixo2Str)
      if (e1 !== null && e2 !== null) {
        const c = interpolarBilinear(e1, e2, cert.grade2D.pontos.map(pt => ({
          eixo1: pt.eixo1, eixo2: pt.eixo2, correcao: pt.correcao,
        })))
        if (c !== null) return { vrStr: fmtN(vn + c), correcaoStr: fmtN(c), incertezaStr: '' }
      }
    }

    // 1D linear interpolation from cert items
    const pts1D: PontoCalibracaoSimples[] = certItems
      .map(i => {
        const v = parseN(i.valorNominal), c = parseN(i.correcao)
        return v !== null && c !== null ? { valorNominal: v, correcao: c } : null
      })
      .filter((x): x is PontoCalibracaoSimples => x !== null)

    if (pts1D.length >= 2) {
      const c = interpolarLinear(vn, pts1D)
      if (c !== null) return { vrStr: fmtN(vn + c), correcaoStr: fmtN(c), incertezaStr: '' }
    }
    if (pts1D.length === 1) {
      const c = pts1D[0].correcao
      return { vrStr: fmtN(vn + c), correcaoStr: fmtN(c), incertezaStr: '' }
    }

    // No cert data — use vrManualStr if filled, otherwise empty
    return { vrStr: p.vrManualStr, correcaoStr: '', incertezaStr: '' }
  }

  function update(idx: number, patch: Partial<PontoBuilder>) {
    const next = [...pontos]
    const merged = { ...next[idx], ...patch }

    // Recalculate derived VR when input changes
    const needsRecalc = ['modo', 'certItemIdx', 'vnStr', 'eixo1Str', 'eixo2Str', 'padraoIdx', 'vrManualStr']
    if (Object.keys(patch).some(k => needsRecalc.includes(k))) {
      Object.assign(merged, deriveVR(merged))
    }

    next[idx] = merged
    onChange(next)
  }

  function add(modo: 'cert' | 'manual') {
    const p = newPonto()
    p.modo = modo
    onChange([...pontos, p])
  }

  const activePadroes = padroes.filter(p => p.equipId)
  const info = getGrandezaInfo(grandeza.nome)

  // Calc erro label based on tipo
  const erroLabel = tipoComp === 'direta' && papel === 'medidor' ? 'Erro (VN − VR)' : 'Erro (MM − VR)'

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button type="button" onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.015] transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0 font-mono text-[10px] px-2 py-1 rounded-md"
            style={{ background: 'rgba(232,185,75,0.12)', color: 'var(--accent,#E8B94B)' }}>
            {grandeza.simbolo || grandeza.nome.slice(0, 3).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white/90 truncate">{grandeza.nome}</p>
            <p className="text-[10px] font-mono text-white/30">
              {grandeza.unidade}
              {grandeza.faixaMin !== undefined && ` · ${grandeza.faixaMin} – ${grandeza.faixaMax}`}
              {grandeza.resolucao && ` · res ${grandeza.resolucao}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {pontos.length > 0 && (
            <span className="text-[10px] text-white/30">
              {pontos.filter(p => p.mmStr).length}/{pontos.length} preenchidos
            </span>
          )}
          <ChevronDown size={13} className={cn('text-white/25 transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-4 py-4 space-y-4">
          {/* Dica contextual */}
          {info.dica && (
            <div className="flex gap-2 text-[10px] text-white/35 leading-relaxed bg-white/[0.02] rounded-lg px-3 py-2">
              <Info size={11} className="flex-shrink-0 mt-0.5 text-white/20" />
              <span>{info.dica}</span>
            </div>
          )}

          {pontos.length === 0 && (
            <p className="text-[11px] text-white/20 py-1">Nenhum ponto adicionado para esta grandeza.</p>
          )}

          {pontos.map((ponto, idx) => {
            const certItems = getCertItems(ponto.padraoIdx)
            const cert = getCert(ponto.padraoIdx)
            const has2D = !!cert?.grade2D

            const mm = tipoComp === 'direta' && papel === 'medidor'
              ? parseN(ponto.vnStr)   // direta-mede: erro = VN − VR
              : parseN(ponto.mmStr)   // direta-gera ou indireta: erro = MM − VR
            const vr = parseN(ponto.vrStr)
            const erro = mm !== null && vr !== null ? mm - vr : null

            const cMax = parseN(ponto.criterioMax)
            const cMin = parseN(ponto.criterioMin)
            const erroOk = erro !== null && (cMax !== null || cMin !== null)
              ? (cMax === null || Math.abs(erro) <= cMax) && (cMin === null || erro >= cMin)
              : null

            const noInterp = ponto.modo === 'manual' && !cert && !ponto.vrManualStr

            return (
              <div key={ponto.id} className={cn(
                'rounded-xl border p-4 space-y-3 transition-colors',
                erroOk === true ? 'border-green-500/20 bg-green-500/[0.03]' :
                erroOk === false ? 'border-red-500/22 bg-red-500/[0.04]' :
                'border-white/8'
              )}>
                {/* Row 1: modo + padrão + delete */}
                <div className="flex items-center gap-2">
                  {/* Modo toggle */}
                  <div className="flex rounded-lg border border-white/10 overflow-hidden text-[10px]">
                    {(['cert', 'manual'] as const).map(m => (
                      <button key={m} type="button"
                        onClick={() => update(idx, { modo: m })}
                        className={cn('px-3 py-1.5 transition-colors',
                          m !== 'cert' && 'border-l border-white/10',
                          ponto.modo === m ? 'text-white/80 bg-white/[0.07]' : 'text-white/30 hover:text-white/55')}>
                        {m === 'cert' ? 'Do certificado' : 'Manual'}
                      </button>
                    ))}
                  </div>

                  {/* Padrão selector (only if multiple active) */}
                  {activePadroes.length > 1 && (
                    <select className="input text-[10px] h-7 py-0 ml-1"
                      value={ponto.padraoIdx}
                      onChange={e => update(idx, { padraoIdx: Number(e.target.value) })}>
                      {padroes.map((p, i) => {
                        const eq = allEquips.find(e => e.id === p.equipId)
                        return eq ? <option key={i} value={i}>{eq.tag}</option> : null
                      })}
                    </select>
                  )}

                  <button type="button" onClick={() => onChange(pontos.filter((_, i) => i !== idx))}
                    className="ml-auto text-white/20 hover:text-red-400/80 transition-colors p-0.5">
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Cert mode: dropdown */}
                {ponto.modo === 'cert' && (
                  <div>
                    <label className="form-label">Ponto do certificado</label>
                    {certItems.length === 0 ? (
                      <p className="text-[11px] text-amber-400/60 italic mt-1">
                        Nenhum ponto encontrado para "{grandeza.nome}" no certificado do padrão.
                        Tente o modo manual ou verifique o certificado.
                      </p>
                    ) : (
                      <select className="input text-[11px]" value={ponto.certItemIdx}
                        onChange={e => update(idx, { certItemIdx: Number(e.target.value) })}>
                        <option value={-1}>— Selecionar ponto —</option>
                        {certItems.map((item, i) => (
                          <option key={i} value={i}>
                            VN = {item.valorNominal} {grandeza.unidade}
                            {item.correcao ? `  ·  C = ${item.correcao}` : ''}
                            {item.incertezaExpandida ? `  ·  U = ${item.incertezaExpandida}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Manual mode: VN + optional 2D axes */}
                {ponto.modo === 'manual' && (
                  <div className="grid grid-cols-2 gap-3">
                    {has2D && cert?.grade2D && (
                      <>
                        <div>
                          <label className="form-label">{cert.grade2D.eixo1Nome} ({cert.grade2D.eixo1Unidade})</label>
                          <input type="number" className="input text-[11px]"
                            value={ponto.eixo1Str} placeholder="ex: 1000"
                            onChange={e => update(idx, { eixo1Str: e.target.value })} />
                        </div>
                        <div>
                          <label className="form-label">{cert.grade2D.eixo2Nome} ({cert.grade2D.eixo2Unidade})</label>
                          <input type="number" className="input text-[11px]"
                            value={ponto.eixo2Str} placeholder="ex: -20"
                            onChange={e => update(idx, { eixo2Str: e.target.value })} />
                        </div>
                      </>
                    )}
                    <div className={has2D ? 'col-span-2' : ''}>
                      <label className="form-label">Valor Nominal (VN) · {grandeza.unidade}</label>
                      <input type="number" className="input text-[11px]"
                        value={ponto.vnStr}
                        placeholder={grandeza.faixaMin !== undefined
                          ? `ex: ${((grandeza.faixaMin + grandeza.faixaMax) / 2).toFixed(1)}`
                          : 'Valor alvo'}
                        onChange={e => update(idx, { vnStr: e.target.value })} />
                    </div>
                  </div>
                )}

                {/* VR / MM / Erro row */}
                <div className="grid grid-cols-3 gap-3">
                  {/* VR */}
                  <div>
                    <label className="form-label flex items-center gap-1.5">
                      Valor de Referência (VR)
                      {ponto.correcaoStr && (
                        <span className="text-[9px] font-mono text-white/25">C={ponto.correcaoStr}</span>
                      )}
                    </label>
                    {/* If no cert data in manual mode, allow user to enter VR directly */}
                    {ponto.modo === 'manual' && !cert && (
                      <input type="number" className="input text-[11px]"
                        value={ponto.vrManualStr} placeholder="Leitura da referência"
                        onChange={e => update(idx, { vrManualStr: e.target.value })} />
                    )}
                    {!(ponto.modo === 'manual' && !cert) && (
                      <div className={cn(
                        'input text-[11px] font-mono cursor-default select-all',
                        ponto.vrStr ? 'text-brand' : 'text-white/20'
                      )}>
                        {ponto.vrStr
                          ? `${ponto.vrStr} ${grandeza.unidade}`
                          : '—'}
                      </div>
                    )}
                  </div>

                  {/* MM (or VN for direta-mede) */}
                  <div>
                    {tipoComp === 'direta' && papel === 'medidor' ? (
                      <>
                        <label className="form-label">Valor Nominal (VN) · {grandeza.unidade}</label>
                        <input type="number" className="input text-[11px]"
                          value={ponto.vnStr} placeholder="Ajustado no instrumento"
                          onChange={e => update(idx, { vnStr: e.target.value })} />
                      </>
                    ) : (
                      <>
                        <label className="form-label">Valor Medido (MM) · {grandeza.unidade}</label>
                        <input type="number" className="input text-[11px]"
                          value={ponto.mmStr} placeholder="Leitura do instrumento"
                          onChange={e => update(idx, { mmStr: e.target.value })} />
                      </>
                    )}
                  </div>

                  {/* Erro */}
                  <div>
                    <label className="form-label">{erroLabel}</label>
                    <div className={cn(
                      'input text-[11px] font-mono cursor-default',
                      erroOk === true ? 'text-green-400' :
                      erroOk === false ? 'text-red-400' : 'text-white/30'
                    )}>
                      {erro !== null
                        ? <>{erro >= 0 ? '+' : ''}{fmtN(erro)} {grandeza.unidade}
                            {erroOk === true && <Check size={10} className="inline ml-1.5" />}
                            {erroOk === false && <AlertTriangle size={10} className="inline ml-1.5" />}
                          </>
                        : '—'}
                    </div>
                  </div>
                </div>

                {/* Incerteza do padrão */}
                {ponto.incertezaStr && (
                  <p className="text-[10px] font-mono text-white/25">
                    Incerteza do padrão: U = {ponto.incertezaStr} (k=2)
                  </p>
                )}

                {/* Critérios */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">EMA mínimo (critério)</label>
                    <input type="number" className="input text-[11px]"
                      value={ponto.criterioMin} placeholder="ex: −0.5"
                      onChange={e => update(idx, { criterioMin: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">EMA máximo (critério)</label>
                    <input type="number" className="input text-[11px]"
                      value={ponto.criterioMax} placeholder="ex: 0.5"
                      onChange={e => update(idx, { criterioMax: e.target.value })} />
                  </div>
                </div>

                {/* Obs */}
                <input type="text" className="input text-[11px]" value={ponto.obs}
                  placeholder="Observações (opcional)"
                  onChange={e => update(idx, { obs: e.target.value })} />
              </div>
            )
          })}

          {/* Add buttons */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => add('cert')}
              className="btn-secondary text-[11px] gap-1.5">
              <Plus size={11} /> Do certificado
            </button>
            <button type="button" onClick={() => add('manual')}
              className="btn-secondary text-[11px] gap-1.5">
              <Plus size={11} /> Manual
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NovoProcedimentoPage() {
  const router = useRouter()
  const [equips, setEquips] = useState<EquipamentoEMC[]>([])
  const [allCerts, setAllCerts] = useState<Certificado[]>([])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  // Cabeçalho
  const [instrId, setInstrId] = useState('')
  const [padroes, setPadroes] = useState<PadraoEntry[]>([{ equipId: '', certId: '' }])
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [responsavel, setResp] = useState('')
  const [tipoComp, setTipo] = useState<TipoComparacao>('direta')
  const [papel, setPapel] = useState<PapelReferencia>('gerador')
  const [periodicidade, setPer] = useState(90)
  const [normaRef, setNormaRef] = useState('')
  const [obsGeral, setObsGeral] = useState('')

  // Pontos por grandeza: Record<grandezaNome, PontoBuilder[]>
  const [pontosGrandeza, setPontosGrandeza] = useState<Record<string, PontoBuilder[]>>({})

  useEffect(() => {
    fetch('/api/equipamentos').then(r => r.json()).then(e => setEquips(Array.isArray(e) ? e : [])).catch(() => {})
    fetch('/api/certificados').then(r => r.json()).then(c => setAllCerts(Array.isArray(c) ? c : [])).catch(() => {})
  }, [])

  const instrumento = equips.find(e => e.id === instrId) ?? null

  // Inicializa pontos quando instrumento muda
  useEffect(() => {
    if (!instrumento) return
    setPontosGrandeza(prev => {
      const next: Record<string, PontoBuilder[]> = {}
      for (const g of instrumento.grandezas) {
        next[g.nome] = prev[g.nome] ?? []
      }
      return next
    })
  }, [instrId]) // eslint-disable-line react-hooks/exhaustive-deps

  const equipsDisponiveis = equips.filter(e => e.id !== instrId)

  function setPadraoField(idx: number, field: keyof PadraoEntry, value: string) {
    const next = [...padroes]
    next[idx] = { ...next[idx], [field]: value }
    if (field === 'equipId' && value) {
      const cert = allCerts
        .filter(c => c.equipamentoId === value)
        .sort((a, b) => b.dataEmissao.localeCompare(a.dataEmissao))[0]
      if (cert) next[idx].certId = cert.id
    }
    setPadroes(next)
  }

  const totalPontos = Object.values(pontosGrandeza).reduce((s, p) => s + p.length, 0)
  const pontosComMM = Object.values(pontosGrandeza).reduce((s, p) => s + p.filter(x => x.mmStr || (tipoComp === 'direta' && papel === 'medidor' && x.vnStr)).length, 0)

  async function salvar() {
    if (!instrumento) { setErro('Selecione um instrumento.'); return }
    if (padroes.every(p => !p.equipId)) { setErro('Selecione ao menos um padrão.'); return }
    if (totalPontos === 0) { setErro('Adicione ao menos um ponto de verificação.'); return }
    setErro(''); setSaving(true)

    try {
      const itens: ItemChecagem[] = []
      let num = 1

      for (const g of instrumento.grandezas) {
        for (const p of (pontosGrandeza[g.nome] ?? [])) {
          const vrN = parseN(p.vrStr)
          const mmN = parseN(p.mmStr)
          const vnN = parseN(p.vnStr)
          const erro_val = tipoComp === 'direta' && papel === 'medidor'
            ? (vnN !== null && vrN !== null ? vnN - vrN : null)
            : (mmN !== null && vrN !== null ? mmN - vrN : null)
          const cMax = parseN(p.criterioMax)
          const cMin = parseN(p.criterioMin)
          const resultado: 'ok' | 'nok' | 'na' = erro_val !== null && (cMax !== null || cMin !== null)
            ? ((cMax === null || Math.abs(erro_val) <= cMax) && (cMin === null || erro_val >= cMin) ? 'ok' : 'nok')
            : 'na'

          const item: ItemChecagem = {
            id: p.id,
            ponto: num++,
            grandeza: g.nome,
            unidade: g.unidade,
            valorReferencia: p.vrStr || p.vrManualStr,
            valorMedido: p.mmStr,
            resultado,
            ...(p.vnStr && { valorNominal: p.vnStr }),
            ...(p.correcaoStr && { correcaoPadrao: p.correcaoStr }),
            ...(p.correcaoStr && p.vrStr && { valorCorrigido: p.vrStr }),
            ...(cMin !== null && { criterioMin: cMin }),
            ...(cMax !== null && { criterioMax: cMax }),
            ...(p.obs && { observacoes: p.obs }),
            ...(p.eixo1Str && { eixo1Valor: p.eixo1Str }),
            ...(p.eixo2Str && { eixo2Valor: p.eixo2Str }),
          }
          itens.push(item)
        }
      }

      const padraoEquip = equips.find(e => e.id === padroes[0]?.equipId)
      const padraoCert = allCerts.find(c => c.id === padroes[0]?.certId)
      const proxima = new Date(data)
      proxima.setDate(proxima.getDate() + periodicidade)

      const body = {
        equipamentoId: instrumento.id,
        equipamentoTag: instrumento.tag,
        nomeInstrumento: instrumento.nome,
        laboratorio: padraoCert?.laboratorio ?? '',
        numeroCertificado: padraoCert?.numero ?? '',
        dataCalibracaoRef: padraoCert?.dataEmissao ?? '',
        grupoId: instrumento.grupoId,
        subgrupoId: instrumento.subgrupoId,
        data,
        responsavel,
        tipoComparacao: tipoComp,
        papelReferencia: papel,
        padraoTag: [padraoEquip?.tag, ...padroes.slice(1).map(p => equips.find(e => e.id === p.equipId)?.tag)].filter(Boolean).join(', '),
        periodicidade,
        proximaChecagem: proxima.toISOString().slice(0, 10),
        resultadoGeral: itens.every(i => i.resultado === 'ok') ? 'satisfatorio'
          : itens.some(i => i.resultado === 'nok') ? 'insatisfatorio' : 'pendente',
        fonte: 'manual' as const,
        ...(normaRef && { normaReferencia: normaRef }),
        itens,
        ...(obsGeral && { obs: obsGeral }),
      }

      const res = await fetch('/api/checagens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const saved = await res.json()
      router.push(`/checagens/${saved.id}`)
    } catch (e: unknown) {
      setErro(String(e))
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-5 pb-16">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Procedimentos · Novo</p>
          <h1 className="page-title">Novo procedimento de checagem</h1>
        </div>
      </div>

      {/* ── Identificação ── */}
      <div className="card p-5 space-y-4">
        <p className="form-section">Identificação</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">Instrumento a verificar (TAG) *</label>
            <select className="input" value={instrId} onChange={e => setInstrId(e.target.value)}>
              <option value="">— Selecionar instrumento —</option>
              {equips.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.tag} — {eq.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Data da checagem *</label>
            <input type="date" className="input" value={data} onChange={e => setData(e.target.value)} />
          </div>

          <div>
            <label className="form-label">Responsável</label>
            <input type="text" className="input" value={responsavel} onChange={e => setResp(e.target.value)} placeholder="Nome do técnico" />
          </div>

          <div>
            <label className="form-label">Periodicidade (dias)</label>
            <input type="number" className="input" value={periodicidade} min={1}
              onChange={e => setPer(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Norma de referência</label>
            <input type="text" className="input" value={normaRef} onChange={e => setNormaRef(e.target.value)}
              placeholder="ex: CISPR 15:2022 §4.3" />
          </div>
        </div>

        {/* Tipo de comparação */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Tipo de comparação</label>
            <div className="flex gap-2 mt-1.5">
              {([['direta', 'Direta'], ['indireta', 'Indireta']] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setTipo(v)}
                  className={cn('px-4 py-2 rounded-lg text-[11px] font-medium border transition-colors',
                    tipoComp === v ? 'bg-brand/15 border-brand/35 text-brand'
                      : 'border-white/10 text-white/35 hover:text-white/60')}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {tipoComp === 'direta' && (
            <div>
              <label className="form-label">Papel da referência</label>
              <div className="flex gap-2 mt-1.5">
                {([['gerador', 'Ref. gera, instr. lê'], ['medidor', 'Instr. gera, ref. mede']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setPapel(v)}
                    className={cn('px-3 py-2 rounded-lg text-[11px] font-medium border transition-colors',
                      papel === v ? 'bg-brand/15 border-brand/35 text-brand'
                        : 'border-white/10 text-white/35 hover:text-white/60')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Padrões ── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="form-section mb-0">Padrão(ões) de medição</p>
          <button type="button" onClick={() => setPadroes([...padroes, { equipId: '', certId: '' }])}
            className="btn-secondary text-[11px] gap-1.5">
            <Plus size={11} /> Adicionar padrão
          </button>
        </div>

        {padroes.map((padrao, idx) => {
          const certsDoEquip = padrao.equipId
            ? allCerts.filter(c => c.equipamentoId === padrao.equipId)
                .sort((a, b) => b.dataEmissao.localeCompare(a.dataEmissao))
            : []
          return (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="form-label">Padrão {idx + 1} *</label>
                <select className="input" value={padrao.equipId}
                  onChange={e => setPadraoField(idx, 'equipId', e.target.value)}>
                  <option value="">— Selecionar —</option>
                  {equipsDisponiveis.map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.tag} — {eq.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Certificado do padrão</label>
                <select className="input" value={padrao.certId}
                  onChange={e => setPadraoField(idx, 'certId', e.target.value)}
                  disabled={certsDoEquip.length === 0}>
                  <option value="">{certsDoEquip.length === 0 ? 'Nenhum certificado' : '— Selecionar —'}</option>
                  {certsDoEquip.map(c => (
                    <option key={c.id} value={c.id}>{c.numero} · {c.laboratorio} ({c.dataEmissao})</option>
                  ))}
                </select>
              </div>

              {padroes.length > 1 && (
                <button type="button" className="text-white/20 hover:text-red-400 transition-colors pb-2"
                  onClick={() => setPadroes(padroes.filter((_, i) => i !== idx))}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Grandezas ── */}
      {instrumento && instrumento.grandezas.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-0.5">
            <p className="text-[9px] font-mono uppercase tracking-[2.5px] text-white/30">
              Grandezas — {instrumento.grandezas.length} cadastrada{instrumento.grandezas.length !== 1 ? 's' : ''}
            </p>
            {totalPontos > 0 && (
              <p className="text-[10px] text-white/30">
                {pontosComMM}/{totalPontos} pontos com leitura
              </p>
            )}
          </div>

          {instrumento.grandezas.map(g => (
            <GrandezaCard
              key={g.nome}
              grandeza={g}
              pontos={pontosGrandeza[g.nome] ?? []}
              padroes={padroes}
              allEquips={equips}
              allCerts={allCerts}
              tipoComp={tipoComp}
              papel={papel}
              onChange={pts => setPontosGrandeza(prev => ({ ...prev, [g.nome]: pts }))}
            />
          ))}
        </div>
      )}

      {instrumento && instrumento.grandezas.length === 0 && (
        <div className="card p-8 text-center space-y-2">
          <p className="text-white/25 text-sm">Este instrumento não possui grandezas metrológicas cadastradas.</p>
          <Link href={`/equipamentos/${instrumento.id}`}
            className="text-[11px] text-brand/70 hover:text-brand underline-offset-2 hover:underline">
            Cadastrar grandezas no instrumento →
          </Link>
        </div>
      )}

      {!instrumento && (
        <div className="card p-10 text-center text-white/20 text-sm">
          Selecione o instrumento para ver as grandezas e adicionar pontos de verificação.
        </div>
      )}

      {/* ── Observações gerais ── */}
      <div className="card p-5">
        <label className="form-label">Observações gerais</label>
        <textarea className="input h-20 resize-none mt-1" value={obsGeral}
          onChange={e => setObsGeral(e.target.value)}
          placeholder="Condições ambientais, anomalias observadas, etc." />
      </div>

      {/* ── Ações ── */}
      {erro && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/8 text-[12px] text-red-300">
          <AlertTriangle size={13} className="flex-shrink-0" />
          {erro}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link href="/procedimentos" className="btn-secondary text-[12px]">Cancelar</Link>
        <button type="button" onClick={salvar}
          disabled={!instrumento || padroes.every(p => !p.equipId) || totalPontos === 0 || saving}
          className="btn-primary">
          {saving
            ? <span className="text-[12px] animate-spin inline-block">⟳</span>
            : <Save size={13} />}
          {saving ? 'Salvando…' : 'Salvar procedimento'}
        </button>
      </div>
    </div>
  )
}
