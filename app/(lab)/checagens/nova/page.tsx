'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, Upload, ScanText, Save, FileSearch, Grid3x3, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addM } from '@/lib/utils'
import { extrairTextoArquivo } from '@/lib/useOCR'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import type { DocumentoIT, Bloco } from '@/lib/instrucoes/tipos'
import type { ItemChecagem, TipoComparacao, PapelReferencia, ResultadoGeral } from '@/lib/checagens/tipos'
import { TEMPLATES } from '@/lib/checagens/templates'
import { parsearGrandezasIT, parsearMetadadosIT, parsearGrandezasMedidasIT } from '@/lib/checagens/parser-it'
import { type PlanoCalibracao, type PontoPlano, limiteAbsoluto } from '@/lib/planos/tipos'
import { Grade2DCertificado } from '@/components/Grade2DCertificado'
import { interpolarBilinear, type PontoCalibracao2D } from '@/lib/interpolacao'

type Tab = 'manual' | 'excel' | 'ocr' | 'it'

const LABORATORIOS = [
  { grupo: 'Calibração', items: ['Alta Frequência e Telecomunicações','Eletricidade','Eletroacústica','Força, Torque e Dureza','Fotometria','Instrumentos Ópticos','Temperatura e Umidade Relativa','Tempo e Frequência','Volume'] },
  { grupo: 'Ensaios',    items: ['Alta Tecnologia','ATX','Eletrodomésticos','Equip. de Uso Prof. e Infra','Iluminação e Componentes','LAIF','Química'] },
]

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

// Normaliza código de procedimento p/ comparar ("PC R04" ≈ "PCR04" ≈ "pc-r04")
function normCodigo(s: string) { return s.toUpperCase().replace(/[\s\-_.]/g, '') }

// Achata os blocos de uma IT/PC num texto corrido p/ o parser de grandezas
function flattenDoc(doc: DocumentoIT): string {
  const ofBloco = (b: Bloco): string => {
    switch (b.tipo) {
      case 'h1': case 'h2': case 'h3':       return b.texto
      case 'p':                              return b.texto
      case 'destaque':                       return `${b.termo} ${b.texto}`
      case 'ul': case 'ol':                  return b.itens.join(' ')
      case 'img':                            return b.legenda
      case 'tabela':                         return [...b.cabecalho, ...b.linhas.flat()].join(' ')
      case 'definicoes':                     return b.itens.map(i => `${i.sigla} ${i.definicao}`).join(' ')
      default:                               return ''
    }
  }
  return [doc.titulo, ...doc.blocos.map(ofBloco)].join('\n')
}

function emptyItem(ponto: number): ItemChecagem {
  return { id: uid(), ponto, grandeza: '', unidade: '', valorReferencia: '', valorMedido: '', resultado: 'na' }
}

/* Pontos selecionáveis do certificado, vindos de itens (1D) OU da grade 2D (freq×nível).
   Assim, mesmo certificados importados por PDF (que salvam só grade2D) podem ter os
   pontos marcados com caixinha na checagem — sem precisar de OCR de novo. */
export interface CertPonto {
  grandeza: string; parametro: string; freq: string
  vr: string; unidade: string; correcao: string; media: string; mm: string
}
function getPontosCert(c: import('@/lib/certificados/tipos').Certificado | null): CertPonto[] {
  if (!c) return []
  if (c.itens?.length) {
    return c.itens.map(l => ({
      grandeza: l.grandeza || '', parametro: '', freq: '',
      vr: l.valorNominal || '', unidade: l.unidade || '',
      correcao: l.correcao || '', media: l.valorIndicado || '',
      mm: l.valorIndicado || '',   // MM = valor medido/indicado do certificado
    }))
  }
  const g = c.grade2D
  if (g?.pontos?.length) {
    return (g.pontos as any[]).map(p => {
      const vr = p.eixo2, corr = p.correcao
      // MM = valor medido. Se vier no ponto usa direto; senão MM = VR − correção.
      const mm = p.mmVal != null ? p.mmVal : (vr != null && corr != null ? vr - corr : null)
      return {
        grandeza:  p.grandeza || p.tabela || g.eixo2Nome || '',
        parametro: p.tabela || '',
        freq:      p.eixo1 != null ? `${p.eixo1} ${p.eixo1Unidade || g.eixo1Unidade || ''}`.trim() : '',
        vr:        vr != null ? String(vr) : '',
        unidade:   p.eixo2Unidade || g.eixo2Unidade || '',
        correcao:  corr != null ? String(corr) : '',
        media:     '',
        mm:        mm != null ? String(mm) : '',
      }
    })
  }
  return []
}

/* ── Helpers numéricos ── */
function parseN(s: string | undefined): number | null {
  if (!s) return null
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

type Modo = 'direta-gera' | 'direta-mede' | 'indireta'

function getModo(tipo: TipoComparacao, papel: PapelReferencia): Modo {
  if (tipo === 'indireta') return 'indireta'
  return papel === 'gerador' ? 'direta-gera' : 'direta-mede'
}

// Modo do ITEM: usa a config da grandeza (se houver), senão cai no global da checagem.
function modoDoItem(item: ItemChecagem, tipoG: TipoComparacao, papelG: PapelReferencia): Modo {
  return getModo(item.tipoComparacao ?? tipoG, item.papelReferencia ?? papelG)
}

function calcErro(item: ItemChecagem, modo: Modo): number | null {
  if (modo === 'direta-gera') {
    // Ref gera VR, instrumento lê MM → Erro = MM − VR
    const vr = parseN(item.valorReferencia), mm = parseN(item.valorMedido)
    return vr !== null && mm !== null ? mm - vr : null
  }
  if (modo === 'direta-mede') {
    // Instrumento gera VN, ref mede VR → Erro = VN − VR
    const vn = parseN(item.valorNominal), vr = parseN(item.valorReferencia)
    return vn !== null && vr !== null ? vn - vr : null
  }
  // Indireta: caixa preta gera, ref e instrumento lêem
  // Valor verdadeiro = VR + Correção; Erro = MM − VCorrigido
  const mm = parseN(item.valorMedido)
  const vc = parseN(item.valorCorrigido)
  const vr = parseN(item.valorReferencia)
  const base = vc ?? vr
  return mm !== null && base !== null ? mm - base : null
}

function fmtErro(e: number | null, criterioMax?: number) {
  if (e === null) return { text: '—', ok: null as boolean | null }
  const text = (e >= 0 ? '+' : '') + (Math.abs(e) < 0.001 ? e.toExponential(2) : e.toPrecision(4))
  const ok: boolean | null = criterioMax !== undefined ? Math.abs(e) <= criterioMax : null
  return { text, ok }
}

/* Resultado automático: ponto = ok/nok pelo |erro| ≤ critério; geral = satisfatório /
   insatisfatório / parcial (alguns ok, outros nok). 'na' = sem erro/critério. */
function avaliarItem(item: ItemChecagem, modo: Modo): 'ok' | 'nok' | 'na' {
  const erro = calcErro(item, modo)
  if (erro === null || item.criterioMax === undefined) return 'na'
  return Math.abs(erro) <= item.criterioMax ? 'ok' : 'nok'
}
function avaliarGeral(itens: ItemChecagem[], tipoG: TipoComparacao, papelG: PapelReferencia): ResultadoGeral {
  const av = itens.map(i => avaliarItem(i, modoDoItem(i, tipoG, papelG))).filter(r => r !== 'na')
  if (!av.length) return 'pendente'
  const oks = av.filter(r => r === 'ok').length
  if (oks === av.length) return 'satisfatorio'
  if (oks === 0) return 'insatisfatorio'
  return 'parcial'
}

/* ── Componente: Parser de IT ── */
function ITParser({ onAplicar }: {
  onAplicar: (itens: ItemChecagem[], meta: { tag: string; periodicidade: number | null; norma: string }) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [texto,     setTexto]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [detectado, setDetectado] = useState<ItemChecagem[]>([])
  const [err,       setErr]       = useState('')

  async function handleFile(file: File) {
    setLoading(true); setErr('')
    try {
      const t = await extrairTextoArquivo(file)
      setTexto(t); analisar(t)
    } catch(e:unknown) { setErr(String(e)) }
    finally { setLoading(false) }
  }

  function analisar(t: string) {
    const itens = parsearGrandezasIT(t)
    setDetectado(itens)
    setErr(itens.length === 0 ? 'Nenhuma grandeza identificada. Verifique o texto.' : '')
  }

  const meta = texto ? parsearMetadadosIT(texto) : { tag:'', periodicidade:null as null, norma:'' }

  return (
    <div className="card p-5 mb-4 space-y-4">
      <p className="form-section">Importar via IT — Instrução de Trabalho</p>
      <p className="text-[11px] text-white/40">
        Cole o texto da IT ou carregue o arquivo. O sistema detecta grandezas
        (tensão alternada, corrente DC, frequência, etc.) e cria os pontos automaticamente.
      </p>
      <div className="flex items-center gap-3">
        <input ref={fileRef} type="file" accept=".pdf,image/*,.txt" className="hidden"
          onChange={e=>e.target.files?.[0]&&handleFile(e.target.files[0])}/>
        <button type="button" onClick={()=>fileRef.current?.click()} className="btn-secondary text-xs">
          {loading?<Loader2 size={12} className="animate-spin"/>:<Upload size={12}/>}
          {loading?'Lendo…':'Carregar arquivo'}
        </button>
        <span className="text-[10px] text-white/25">ou cole o texto abaixo</span>
      </div>
      <textarea
        className="input font-mono text-xs h-40 resize-none"
        placeholder={'Cole aqui o texto da IT...\nex: "Verificar tensão alternada, corrente alternada e frequência de rede"'}
        value={texto}
        onChange={e=>{ setTexto(e.target.value); if(e.target.value.trim()) analisar(e.target.value) }}
      />
      {err && <p className="text-[12px] text-amber-400">{err}</p>}
      {detectado.length > 0 && (
        <>
          <div className="border border-white/8 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-white/3 flex items-center justify-between">
              <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                {detectado.length} ponto(s) detectado(s)
                {meta.tag && <> · TAG: <span className="text-gold">{meta.tag}</span></>}
                {meta.periodicidade && <> · {meta.periodicidade} meses</>}
              </p>
            </div>
            <table className="w-full">
              <thead className="tbl-head"><tr><th>Pt.</th><th>Grandeza</th><th>Unid.</th><th>VN sugerido</th></tr></thead>
              <tbody>
                {detectado.map(i=>(
                  <tr key={i.id} className="tbl-row">
                    <td className="font-mono text-[11px] text-white/40 text-center">{i.ponto}</td>
                    <td className="text-white/80">{i.grandeza}</td>
                    <td className="font-mono text-[11px]">{i.unidade}</td>
                    <td className="font-mono text-[11px]" style={{color:'var(--teal,#22D3C8)'}}>{i.valorNominal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={()=>onAplicar(detectado, meta)} className="btn-primary">
              <Save size={13}/> Aplicar e ir para tabela
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Linha da tabela ── */
function ItemRow({ item, modo, onChange, onDelete, grade2DAtiva, eixo1Nome, eixo2Nome, hideGrandeza }: {
  item: ItemChecagem; modo: Modo
  onChange: (i: ItemChecagem) => void; onDelete: () => void
  grade2DAtiva?: boolean; eixo1Nome?: string; eixo2Nome?: string; hideGrandeza?: boolean
}) {
  function set(k: keyof ItemChecagem, v: string | number) {
    const next = { ...item, [k]: v }
    // Auto-calcular valorCorrigido no modo indireta
    if (modo === 'indireta' && (k === 'valorReferencia' || k === 'correcaoPadrao')) {
      const vr = parseN(k === 'valorReferencia' ? String(v) : next.valorReferencia)
      const c  = parseN(k === 'correcaoPadrao'  ? String(v) : next.correcaoPadrao)
      if (vr !== null && c !== null)
        next.valorCorrigido = (vr + c).toPrecision(6).replace(/\.?0+$/, '')
    }
    onChange(next)
  }

  const erro = calcErro(item, modo)
  const { text: erroTxt, ok: erroOk } = fmtErro(erro, item.criterioMax)
  const inp = 'input text-[11px] py-1 px-2 h-7'
  const rowCls = item.resultado === 'nok' ? 'bg-red-500/5' : item.resultado === 'ok' ? 'bg-green-500/4' : ''

  return (
    <tr className={cn('tbl-row group/row', rowCls)}>
      <td className="w-10 text-center font-mono text-[11px] text-white/40">{item.ponto}</td>
      {!hideGrandeza && (
        <td>
          <input className={inp} value={item.grandeza} onChange={e => set('grandeza', e.target.value)} placeholder="ex: Tensão DC"/>
          {item.mediaCalibracao && (
            <p className="text-[8px] text-teal/60 font-mono mt-0.5 px-1" title="Média medida na calibração (base da checagem)">
              cal.: {item.mediaCalibracao}
            </p>
          )}
        </td>
      )}
      <td className="w-20"><input className={cn(inp,'font-mono')} value={item.unidade} onChange={e => set('unidade', e.target.value)} placeholder="V"/></td>

      {modo === 'direta-gera' && <>
        {/* Ref gera → VR = valor ajustado na ref, MM = leitura do instrumento */}
        <td className="w-36"><input className={cn(inp,'font-mono')} title={item.valorReferencia} value={item.valorReferencia} onChange={e => set('valorReferencia', e.target.value)} placeholder="VR (ref gera)"/></td>
        <td className="w-36"><input className={cn(inp,'font-mono')} title={item.valorMedido} value={item.valorMedido} onChange={e => set('valorMedido', e.target.value)} placeholder="MM (instrumento lê)"/></td>
      </>}

      {modo === 'direta-mede' && <>
        {/* Instrumento gera → VN = nominal ajustado, VR = o que ref mede */}
        <td className="w-36"><input className={cn(inp,'font-mono')} title={item.valorNominal??''} value={item.valorNominal??''} onChange={e => set('valorNominal', e.target.value)} placeholder="VN (ajustado no inst.)"/></td>
        <td className="w-36"><input className={cn(inp,'font-mono')} title={item.valorReferencia} value={item.valorReferencia} onChange={e => set('valorReferencia', e.target.value)} placeholder="VR (ref mede)"/></td>
      </>}

      {modo === 'indireta' && <>
        {/* Caixa preta gera → ref lê VR, instrumento lê MM */}
        <td className="w-32"><input className={cn(inp,'font-mono')} title={item.valorReferencia} value={item.valorReferencia} onChange={e => set('valorReferencia', e.target.value)} placeholder="VR (padrão)"/></td>
        <td className="w-28">
          <input className={cn(inp,'font-mono')} title={item.correcaoPadrao??''} value={item.correcaoPadrao??''} onChange={e => set('correcaoPadrao', e.target.value)} placeholder="Corr. instr."/>
        </td>
        <td className="w-32">
          <input className={cn(inp,'font-mono text-white/50')} title={item.valorCorrigido??''} value={item.valorCorrigido??''} onChange={e => set('valorCorrigido', e.target.value)} placeholder="auto"/>
        </td>
        <td className="w-32"><input className={cn(inp,'font-mono')} title={item.valorMedido} value={item.valorMedido} onChange={e => set('valorMedido', e.target.value)} placeholder="Leit. Instrumento"/></td>
      </>}

      {/* Colunas de interpolação 2D — só quando grade ativa */}
      {grade2DAtiva && <>
        <td className="w-32">
          <input className={cn(inp,'font-mono')} type="number" title={item.eixo1Valor??''} value={item.eixo1Valor??''}
            onChange={e => set('eixo1Valor', e.target.value)}
            placeholder={eixo1Nome??'Eixo 1'}/>
        </td>
        <td className="w-32">
          <input className={cn(inp,'font-mono')} type="number" title={item.eixo2Valor??''} value={item.eixo2Valor??''}
            onChange={e => set('eixo2Valor', e.target.value)}
            placeholder={eixo2Nome??'Eixo 2'}/>
        </td>
        <td className="w-28">
          <input className={cn(inp,'font-mono text-teal/70')} readOnly
            title={item.correcaoPadrao??''} value={item.correcaoPadrao??''} placeholder="auto"/>
        </td>
      </>}

      {/* Erro calculado */}
      <td className="w-24 text-center">
        <span className={cn('font-mono text-[11px] px-1.5 py-0.5 rounded',
          erroOk === true  && 'text-green-400 bg-green-500/8',
          erroOk === false && 'text-red-400 bg-red-500/8',
          erroOk === null  && 'text-white/25')}>
          {erroTxt}
        </span>
      </td>
      <td className="w-20">
        <input className={cn(inp,'font-mono')} type="number" value={item.criterioMax??''} placeholder="±"
          onChange={e => set('criterioMax', e.target.value ? Number(e.target.value) : '')}/>
      </td>
      <td className="w-28">
        {(() => {
          const r = avaliarItem(item, modo)
          return (
            <span className={cn('font-mono text-[10px] px-2 py-0.5 rounded whitespace-nowrap',
              r === 'ok'  && 'text-green-400 bg-green-500/8',
              r === 'nok' && 'text-red-400 bg-red-500/8',
              r === 'na'  && 'text-white/25')}>
              {r === 'ok' ? 'Satisfatório' : r === 'nok' ? 'Insatisfatório' : '—'}
            </span>
          )
        })()}
      </td>
      <td><input className={inp} value={item.observacoes??''} onChange={e => set('observacoes', e.target.value)} placeholder="Obs."/></td>
      <td className="w-8">
        <button type="button" onClick={onDelete} className="opacity-0 group-hover/row:opacity-100 text-white/25 hover:text-red-400 transition-all p-0.5">
          <Trash2 size={12}/>
        </button>
      </td>
    </tr>
  )
}

/* ── Cabeçalho dinâmico da tabela ── */
function TblHeader({ modo, grade2DAtiva, eixo1Nome, eixo1Unidade, eixo2Nome, eixo2Unidade, hideGrandeza }: {
  modo: Modo
  grade2DAtiva?: boolean
  eixo1Nome?: string; eixo1Unidade?: string
  eixo2Nome?: string; eixo2Unidade?: string
  hideGrandeza?: boolean
}) {
  return (
    <thead className="tbl-head">
      <tr>
        <th className="w-10 text-center">Pt.</th>
        {!hideGrandeza && <th>Grandeza</th>}
        <th className="w-20">Unid.</th>
        {modo === 'direta-gera' && <>
          <th className="w-32">VR — Padrão (fonte)</th>
          <th className="w-32">MM — Instrumento (indicador)</th>
        </>}
        {modo === 'direta-mede' && <>
          <th className="w-32">VN — Instrumento (fonte)</th>
          <th className="w-32">VR — Padrão (indicador)</th>
        </>}
        {modo === 'indireta' && <>
          <th className="w-28">VR — Padrão</th>
          <th className="w-24">Corr. instrumento</th>
          <th className="w-28">Val. corrigido</th>
          <th className="w-28">Leit. Instrumento</th>
        </>}
        {grade2DAtiva && <>
          <th className="w-28">{eixo1Nome||'Eixo 1'} ({eixo1Unidade||'—'})</th>
          <th className="w-28">{eixo2Nome||'Eixo 2'} ({eixo2Unidade||'—'})</th>
          <th className="w-28 text-teal">Corr. interp.</th>
        </>}
        <th className="w-24 text-center">
          {modo === 'direta-gera'  && 'Erro (MM−VR)'}
          {modo === 'direta-mede'  && 'Erro (VN−VR)'}
          {modo === 'indireta'     && 'Erro (MM−Vcorr)'}
        </th>
        <th className="w-20">Critério ±</th>
        <th className="w-28">Resultado</th>
        <th>Obs.</th>
        <th className="w-8"></th>
      </tr>
    </thead>
  )
}

/* ── Seção de uma grandeza: título grande + instrumento + tabela de pontos ── */
interface EquipMin { id: string; tag: string; nome: string }
function GrandezaSection({
  grandeza, items, tipoCompGlobal, papelRefGlobal, eixo1Nome, eixo1Unidade, eixo2Nome, eixo2Unidade,
  equips, instrumentoTag, certNum, grandezaOpcoes, onRename, onPickInstrumento, onAddItem, onChangeItem, onDeleteItem,
  onSetModo, onSetGrade2D,
}: {
  grandeza: string; items: ItemChecagem[]
  tipoCompGlobal: TipoComparacao; papelRefGlobal: PapelReferencia
  eixo1Nome?: string; eixo1Unidade?: string; eixo2Nome?: string; eixo2Unidade?: string
  equips: EquipMin[]; instrumentoTag?: string; certNum?: string; grandezaOpcoes: string[]
  onRename: (oldName: string, newName: string) => void
  onPickInstrumento: (grandeza: string, equipId: string) => void
  onAddItem: (grandeza: string) => void
  onChangeItem: (id: string, i: ItemChecagem) => void
  onDeleteItem: (id: string) => void
  onSetModo: (grandeza: string, m: Modo) => void
  onSetGrade2D: (grandeza: string, on: boolean) => void
}) {
  const equipSel = equips.find(e => e.tag === instrumentoTag)?.id ?? ''
  // Modo e 2D são POR GRANDEZA (config nos itens; cai no global se não definido)
  const modo: Modo = items[0] ? modoDoItem(items[0], tipoCompGlobal, papelRefGlobal) : getModo(tipoCompGlobal, papelRefGlobal)
  const grade2DAtiva = !!items[0]?.grade2D
  return (
    <div className="card overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-white/6 flex items-center gap-3 flex-wrap" style={{ background: 'rgba(212,175,55,0.05)' }}>
        <select
          className="input text-sm font-semibold flex-1 min-w-[180px] cursor-pointer"
          value={grandeza}
          onChange={e => onRename(grandeza, e.target.value)}
          title="Escolha a grandeza (cadastrada no padrão)">
          <option value="">— escolher grandeza —</option>
          {grandezaOpcoes.map(g => <option key={g} value={g}>{g}</option>)}
          {grandeza && !grandezaOpcoes.includes(grandeza) && <option value={grandeza}>{grandeza}</option>}
        </select>
        <span className="text-[10px] font-mono text-white/30 shrink-0">{items.length} ponto(s)</span>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">Instrumento</label>
          <select className="input text-xs py-1 w-auto max-w-[260px] cursor-pointer"
            value={equipSel} onChange={e => onPickInstrumento(grandeza, e.target.value)}>
            <option value="">— escolher —</option>
            {equips.map(eq => <option key={eq.id} value={eq.id}>{eq.tag} · {eq.nome}</option>)}
          </select>
        </div>
        {instrumentoTag && (
          <span className="text-[10px] font-mono text-teal/70 shrink-0" title="Correção vem do certificado deste instrumento">
            corr. ← {instrumentoTag}{certNum ? ` · cert ${certNum}` : ''}
          </span>
        )}
        {/* Método (direta/indireta) e colunas Nível×Frequência — por grandeza */}
        <div className="flex items-center gap-2 shrink-0">
          <select className="input text-xs py-1 w-auto cursor-pointer" value={modo}
            onChange={e => onSetModo(grandeza, e.target.value as Modo)} title="Método de comparação desta grandeza">
            <option value="direta-gera">Direta · padrão gera</option>
            <option value="direta-mede">Direta · padrão mede</option>
            <option value="indireta">Indireta</option>
          </select>
          <label className="flex items-center gap-1.5 text-[10px] font-mono text-white/45 cursor-pointer whitespace-nowrap" title="Mostra as colunas Nível×Frequência (interpolação 2D) — só p/ grandezas com esses eixos">
            <input type="checkbox" checked={grade2DAtiva} onChange={e => onSetGrade2D(grandeza, e.target.checked)} className="accent-gold"/>
            Nível×Freq
          </label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: grade2DAtiva ? 1140 : modo === 'indireta' ? 940 : 660 }}>
          <TblHeader modo={modo} grade2DAtiva={grade2DAtiva} hideGrandeza
            eixo1Nome={eixo1Nome} eixo1Unidade={eixo1Unidade} eixo2Nome={eixo2Nome} eixo2Unidade={eixo2Unidade} />
          <tbody>
            {items.map(it => (
              <ItemRow key={it.id} item={it} modo={modo} hideGrandeza
                grade2DAtiva={grade2DAtiva} eixo1Nome={eixo1Nome} eixo2Nome={eixo2Nome}
                onChange={i => onChangeItem(it.id, i)} onDelete={() => onDeleteItem(it.id)} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-white/5">
        <button type="button" onClick={() => onAddItem(grandeza)} className="btn-ghost text-xs">
          <Plus size={12} /> Ponto nesta grandeza
        </button>
      </div>
    </div>
  )
}

/* ── Cabeçalho sem grade 2D (fechamento do bloco indireta) ── */
// Nota: o bloco acima foi atualizado para incluir colunas grade2D antes de Erro/Critério

/* ── Parser de correções de certificado ── */
function parsearCorrecoesDeCertificado(texto: string): number[] {
  const corrections: number[] = []
  const linhas = texto.split(/\r?\n/)
  for (const linha of linhas) {
    const norm = linha.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
    if (norm.includes('corre')) {
      const nums = linha.match(/([+-]?\s*\d+[,.]?\d*(?:[eE][+-]?\d+)?)/g)
      if (nums) {
        const val = parseFloat(nums[nums.length-1].replace(',','.').replace(/\s/g,''))
        if (!isNaN(val)) corrections.push(val)
      }
    }
  }
  if (corrections.length === 0) {
    for (const linha of linhas) {
      const celulas = linha.split(/\s{2,}|\t/).map(s=>s.trim()).filter(Boolean)
      if (celulas.length >= 3) {
        const nums = celulas.map(c=>parseFloat(c.replace(',','.'))).filter(n=>!isNaN(n))
        if (nums.length >= 3) corrections.push(nums[nums.length-2])
      }
    }
  }
  return corrections
}

/* ── Página ── */
export default function NovaChecagemPage() {
  const router   = useRouter()
  const excelRef = useRef<HTMLInputElement>(null)
  const ocrRef   = useRef<HTMLInputElement>(null)
  const certRef  = useRef<HTMLInputElement>(null)

  const [tab,            setTab]           = useState<Tab>('manual')
  const [equips,         setEquips]        = useState<EquipamentoEMC[]>([])
  const [docsIT,         setDocsIT]        = useState<DocumentoIT[]>([])
  const [equipId,        setEquipId]       = useState('')
  const [nomeInstrumento, setNomeInstrumento] = useState('')
  const [laboratorio,    setLaboratorio]   = useState('')
  const [numeroCert,     setNumeroCert]    = useState('')
  const [dataCalibRef,   setDataCalibRef]  = useState('')
  const [padraoTag,      setPadraoTag]     = useState('')
  const [tipoComp,       setTipoComp]      = useState<TipoComparacao>('direta')
  const [papelRef,       setPapelRef]      = useState<PapelReferencia>('gerador')
  const [resultadoGeral, setResultadoGeral] = useState<ResultadoGeral>('pendente')
  const [data,           setData]          = useState(new Date().toISOString().slice(0,10))
  const [responsavel,    setResponsavel]   = useState('')
  const [periodicidade,  setPeriodicidade] = useState(3)   // em meses
  const [normaRef,       setNormaRef]      = useState('')
  const [obs,            setObs]           = useState('')
  const [itens,          setItens]         = useState<ItemChecagem[]>(Array.from({length:10},(_,i)=>emptyItem(i+1)))
  const [excelItens,     setExcelItens]    = useState<ItemChecagem[]>([])
  const [ocrTexto,       setOcrTexto]      = useState('')
  const [certOCR,        setCertOCR]       = useState('')
  const [certLoading,    setCertLoading]   = useState(false)
  const [certPadrao,     setCertPadrao]    = useState<import('@/lib/certificados/tipos').Certificado|null>(null)
  const [certPadraoMsg,  setCertPadraoMsg] = useState('')
  // Importação de pontos do certificado (clicar nos pontos → vira ponto de checagem)
  const [showCertImport, setShowCertImport] = useState(false)
  const [certSel,        setCertSel]        = useState<Set<number>>(new Set())
  const [loading,        setLoading]       = useState(false)
  const [salvando,       setSalvando]      = useState(false)
  const [editId,         setEditId]        = useState<string | null>(null)
  // Grade 2D de correção (interpolação bilinear)
  const [grade2DAtiva,   setGrade2DAtiva]  = useState(false)
  const [grade2DPontos,  setGrade2DPontos] = useState<PontoCalibracao2D[]>([])
  const [grade2DEixo1Nome,    setGrade2DEixo1Nome]    = useState('Frequência')
  const [grade2DEixo1Unidade, setGrade2DEixo1Unidade] = useState('MHz')
  const [grade2DEixo2Nome,    setGrade2DEixo2Nome]    = useState('Nível')
  const [grade2DEixo2Unidade, setGrade2DEixo2Unidade] = useState('dBm')

  useEffect(() => {
    fetch('/api/equipamentos').then(r=>r.json()).then(e=>setEquips(Array.isArray(e)?e:[])).catch(()=>{})
    fetch('/api/instrucoes').then(r=>r.json()).then(d=>setDocsIT(Array.isArray(d)?d:[])).catch(()=>{})
  }, [])

  // Modo edição: ?id=<checagem> → carrega a checagem existente nos campos (salva com PUT)
  useEffect(() => {
    const eid = new URLSearchParams(window.location.search).get('id')
    if (!eid) return
    setEditId(eid)
    fetch(`/api/checagens/${eid}`).then(r=>r.json()).then((c) => {
      if (!c || c.error) return
      setEquipId(c.equipamentoId || '')
      setNomeInstrumento(c.nomeInstrumento || '')
      setLaboratorio(c.laboratorio || '')
      setNumeroCert(c.numeroCertificado || '')
      setDataCalibRef(c.dataCalibracaoRef || '')
      setPadraoTag(c.padraoTag || '')
      setTipoComp(c.tipoComparacao || 'direta')
      setPapelRef(c.papelReferencia || 'gerador')
      setResultadoGeral(c.resultadoGeral || 'pendente')
      setData(c.data || new Date().toISOString().slice(0,10))
      setResponsavel(c.responsavel || '')
      if (typeof c.periodicidade === 'number') setPeriodicidade(c.periodicidade)
      setNormaRef(c.normaReferencia || '')
      setObs(c.obs || '')
      if (Array.isArray(c.itens) && c.itens.length) setItens(c.itens)
      setTab('manual')   // edição acontece na tabela manual
    }).catch(()=>{})
  }, [])

  async function handleEquipChange(id: string) {
    setEquipId(id)
    const eq = equips.find(e=>e.id===id)
    if (!eq) return
    setNomeInstrumento(eq.nome)
    // Puxa automaticamente o ÚLTIMO certificado vigente do equipamento (nº + data + lab)
    try {
      const certs = await fetch(`/api/certificados?equipamentoId=${encodeURIComponent(eq.id)}`).then(r=>r.json())
      if (Array.isArray(certs) && certs.length) {
        const hoje = new Date().toISOString().slice(0,10)
        const vigentes = certs.filter((c:{dataValidade?:string}) => !c.dataValidade || c.dataValidade >= hoje)
        const escolha = (vigentes.length ? vigentes : certs)
          .sort((a:{dataEmissao?:string}, b:{dataEmissao?:string}) => (b.dataEmissao||'').localeCompare(a.dataEmissao||''))[0]
        if (escolha) {
          if (escolha.numero)      setNumeroCert(escolha.numero)
          if (escolha.dataEmissao) setDataCalibRef(escolha.dataEmissao)
          if (escolha.laboratorio) setLaboratorio(escolha.laboratorio)
        }
      }
    } catch {}
    const tpl = TEMPLATES[eq.subgrupoId]
    if (tpl) {
      setPeriodicidade(Math.round(tpl.periodicidadePadrao / 30))
      setItens(tpl.itens.map((t,i) => ({ ...emptyItem(i+1), grandeza:t.descricao, unidade:t.unidade, criterioMin:t.criterioMin, criterioMax:t.criterioMax })))
    }
  }

  const modo = getModo(tipoComp, papelRef)
  const resultadoGeralAuto = avaliarGeral(itens, tipoComp, papelRef)
  const pontosCert = getPontosCert(certPadrao)
  // Agrupa os pontos por grandeza, preservando o índice original (usado na seleção)
  const gruposCert = (() => {
    const map = new Map<string, { i: number; p: CertPonto }[]>()
    pontosCert.forEach((p, i) => {
      // diferencia por grandeza + parâmetro (o parâmetro é capturado de forma
      // confiável; a grandeza às vezes não, então sozinha agruparia tudo junto)
      const key = [p.grandeza?.trim(), p.parametro?.trim()].filter(Boolean).join(' · ') || 'Sem grandeza'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ i, p })
    })
    return [...map.entries()].map(([grandeza, items]) => ({ grandeza, items }))
  })()

  function addItem() { setItens(p=>[...p, emptyItem(p.length+1)]) }
  function removeItem(id: string) { setItens(p=>p.filter(i=>i.id!==id).map((i,idx)=>({...i,ponto:idx+1}))) }
  function updateItem(id: string, item: ItemChecagem) {
    // Grade 2D POR GRANDEZA: só interpola se a grandeza deste item estiver em modo 2D
    if (item.grade2D && grade2DPontos.length > 0) {
      const e1 = parseFloat(item.eixo1Valor ?? '')
      const e2 = parseFloat(item.eixo2Valor ?? '')
      if (!isNaN(e1) && !isNaN(e2)) {
        const corr = interpolarBilinear(e1, e2, grade2DPontos)
        if (corr !== null) {
          item = { ...item, correcaoPadrao: (corr >= 0 ? '+' : '') + corr.toPrecision(4) }
        }
      }
    }
    setItens(p=>p.map(i=>i.id===id?item:i))
  }

  // Define o MODO (direta gera/mede ou indireta) de todos os itens de uma grandeza
  function setModoGrandeza(grandeza: string, m: Modo) {
    const tipoComparacao: TipoComparacao = m === 'indireta' ? 'indireta' : 'direta'
    const papelReferencia: PapelReferencia = m === 'direta-mede' ? 'medidor' : 'gerador'
    setItens(p => p.map(it => (it.grandeza || '') === grandeza ? { ...it, tipoComparacao, papelReferencia } : it))
  }
  // Liga/desliga as colunas Nível×Frequência (2D) de uma grandeza
  function setGrade2DGrandeza(grandeza: string, on: boolean) {
    setItens(p => p.map(it => (it.grandeza || '') === grandeza ? { ...it, grade2D: on } : it))
  }

  // Itens agrupados por grandeza (preserva a ordem de 1ª aparição)
  const gruposItens = (() => {
    const order: string[] = []
    const map = new Map<string, ItemChecagem[]>()
    itens.forEach(it => {
      const k = it.grandeza || ''
      if (!map.has(k)) { map.set(k, []); order.push(k) }
      map.get(k)!.push(it)
    })
    return order.map(k => ({ key: k || '__sem__', grandeza: k, items: map.get(k)! }))
  })()

  function addItemGrandeza(grandeza: string) {
    setItens(p => [...p, { ...emptyItem(p.length + 1), grandeza }])
  }

  function renomearGrandeza(oldName: string, newName: string) {
    setItens(p => p.map(it => (it.grandeza || '') === oldName ? { ...it, grandeza: newName } : it))
  }

  // Casa a correção do certificado do INSTRUMENTO ao ponto (1D por VR mais próximo; 2D bilinear)
  function matchCorrecaoInstrumento(cert: import('@/lib/certificados/tipos').Certificado, item: ItemChecagem): { correcao: string; incerteza: string } | null {
    if (cert.itens?.length) {
      const vr = parseN(item.valorReferencia)
      let best = cert.itens[0]
      if (vr !== null) {
        best = cert.itens.reduce((a, b) =>
          Math.abs((parseN(b.valorNominal) ?? Infinity) - vr) < Math.abs((parseN(a.valorNominal) ?? Infinity) - vr) ? b : a)
      } else {
        best = cert.itens.find(l => (l.grandeza || '').toLowerCase() === (item.grandeza || '').toLowerCase()) ?? cert.itens[0]
      }
      if (best) return { correcao: best.correcao || '', incerteza: best.incertezaExpandida || '' }
    }
    const g = cert.grade2D
    if (g?.pontos?.length) {
      const e1 = parseN(item.eixo1Valor), e2 = parseN(item.eixo2Valor ?? item.valorReferencia)
      if (e1 !== null && e2 !== null) {
        const corr = interpolarBilinear(e1, e2, g.pontos as unknown as PontoCalibracao2D[])
        if (corr !== null) return { correcao: (corr >= 0 ? '+' : '') + corr.toPrecision(4), incerteza: '' }
      }
    }
    return null
  }

  // Atribui um instrumento (do catálogo) a uma grandeza e preenche a correção dos pontos
  async function aplicarInstrumentoGrandeza(grandeza: string, equipId: string) {
    const eq = equips.find(e => e.id === equipId)
    if (!equipId || !eq) {
      // limpar atribuição
      setItens(prev => prev.map(it => (it.grandeza || '') === grandeza
        ? { ...it, instrumentoTag: undefined, instrumentoCertNum: undefined } : it))
      return
    }
    let cert: import('@/lib/certificados/tipos').Certificado | null = null
    try {
      const certs = await fetch(`/api/certificados?tag=${encodeURIComponent(eq.tag)}`).then(r => r.json())
      if (Array.isArray(certs) && certs.length) cert = certs.sort((a: {dataEmissao?:string}, b: {dataEmissao?:string}) => (b.dataEmissao || '').localeCompare(a.dataEmissao || ''))[0]
    } catch {}
    setItens(prev => prev.map(it => {
      if ((it.grandeza || '') !== grandeza) return it
      const base = { ...it, instrumentoTag: eq.tag, instrumentoCertNum: cert?.numero || '' }
      if (!cert) return base
      const m = matchCorrecaoInstrumento(cert, it)
      if (!m) return base
      const vr = parseN(base.valorReferencia), c = parseN(m.correcao)
      const valorCorrigido = vr !== null && c !== null ? (vr + c).toPrecision(6).replace(/\.?0+$/, '') : base.valorCorrigido
      return { ...base, correcaoPadrao: m.correcao, incertezaInstrumento: m.incerteza, valorCorrigido }
    }))
    if (!cert) alert(`Instrumento ${eq.tag}: nenhum certificado encontrado. Foi atribuído, mas a correção precisa ser digitada manualmente.`)
  }

  // Ao informar TAG do padrão, busca o certificado mais recente válido
  async function handlePadraoTagChange(tag: string) {
    setPadraoTag(tag)
    setCertPadrao(null); setCertPadraoMsg('')
    if (!tag.trim()) return
    try {
      const certs = await fetch(`/api/certificados?tag=${encodeURIComponent(tag)}`).then(r=>r.json())
      if (!Array.isArray(certs) || certs.length === 0) { setCertPadraoMsg('Nenhum certificado encontrado para este TAG.'); return }
      // Pega o mais recente
      const mais = certs.sort((a: {dataEmissao:string}, b: {dataEmissao:string}) => b.dataEmissao.localeCompare(a.dataEmissao))[0]
      setCertPadrao(mais)
      const g = mais.grade2D
      if (g && g.pontos?.length) {
        setGrade2DPontos(g.pontos)
        setGrade2DEixo1Nome(g.eixo1Nome)
        setGrade2DEixo1Unidade(g.eixo1Unidade)
        setGrade2DEixo2Nome(g.eixo2Nome)
        setGrade2DEixo2Unidade(g.eixo2Unidade)
        setGrade2DAtiva(true)
        setCertPadraoMsg(`✓ Certificado ${mais.numero} — grade 2D carregada (${g.pontos.length} pontos, ${g.eixo1Nome} × ${g.eixo2Nome})`)
      } else {
        setCertPadraoMsg(`✓ Certificado ${mais.numero} (${mais.laboratorio}) — ${mais.itens.length} ponto(s)`)
      }
      // Guia o usuário direto pro painel de marcar pontos (itens 1D ou grade 2D)
      if (getPontosCert(mais).length) { setCertSel(new Set()); setShowCertImport(true) }
    } catch { setCertPadraoMsg('Erro ao buscar certificado.') }
  }

  // Aplica correções do certificado do padrão à tabela de itens
  function aplicarCorrecoesDoCertPadrao() {
    if (!certPadrao?.itens?.length) return
    setItens(prev => prev.map((item, i) => {
      const linha = certPadrao.itens[i]
      if (!linha) return item
      const correcaoPadrao = linha.correcao
      const vr = parseN(item.valorReferencia)
      const c  = parseN(correcaoPadrao)
      const valorCorrigido = vr !== null && c !== null ? String((vr+c).toPrecision(6).replace(/\.?0+$/,'')) : undefined
      return { ...item, correcaoPadrao, valorCorrigido }
    }))
  }

  function toggleCertSel(i: number) {
    setCertSel(prev => {
      const n = new Set(prev)
      if (n.has(i)) n.delete(i); else n.add(i)
      return n
    })
  }

  // Marca/desmarca todos os pontos de um grupo (grandeza) de uma vez
  function toggleGrupoCert(indices: number[]) {
    setCertSel(prev => {
      const n = new Set(prev)
      const allSel = indices.length > 0 && indices.every(i => n.has(i))
      indices.forEach(i => { if (allSel) n.delete(i); else n.add(i) })
      return n
    })
  }

  // Importa os pontos marcados do certificado como pontos de checagem.
  // Funciona tanto para itens 1D quanto para grade 2D (freq×nível).
  // grandeza ← grandeza/parâmetro (+ freq); VR ← valor de referência; correção ← correção.
  function importarPontosDoCert() {
    const todos = getPontosCert(certPadrao)
    const selecionados = todos.filter((_, i) => certSel.has(i))
    if (!selecionados.length) { alert('Marque ao menos um ponto do certificado.'); return }
    const novos = selecionados.map((p, idx) => ({
      ...emptyItem(idx + 1),
      grandeza:        [p.grandeza, p.parametro].filter(Boolean).join(' · ') + (p.freq ? ` @ ${p.freq}` : ''),
      unidade:         p.unidade || '',
      valorReferencia: p.vr || '',          // VR — referência do certificado do padrão
      valorMedido:     p.mm || '',          // MM — valor medido do certificado (você ajusta na checagem)
      mediaCalibracao: p.media || '',       // média da calibração (quando 1D)
      // correção NÃO vem do padrão — será preenchida pelo instrumento de cada grandeza
    }))
    setItens(novos)
    // Guarda o nº do certificado do padrão (referência) se ainda não informado
    if (certPadrao?.numero && !numeroCert) setNumeroCert(certPadrao.numero)
    setShowCertImport(false)
    setCertSel(new Set())
    setTab('manual')
  }

  const aplicarCorrecoes = useCallback(() => {
    if (!certOCR) return
    const correcoes = parsearCorrecoesDeCertificado(certOCR)
    if (!correcoes.length) { alert('Nenhuma correção identificada.'); return }
    setItens(prev => prev.map((item,i) => {
      const c = correcoes[i]
      if (c === undefined) return item
      const correcaoPadrao = (c>=0?'+':'')+c
      const vr = parseN(item.valorReferencia)
      const valorCorrigido = vr !== null ? String((vr+c).toPrecision(6).replace(/\.?0+$/,'')) : undefined
      return { ...item, correcaoPadrao, valorCorrigido }
    }))
    alert(`${Math.min(correcoes.length,itens.length)} correções aplicadas.`)
  }, [certOCR, itens.length])

  async function handleCertPDF(file: File) {
    setCertLoading(true)
    try {
      const texto = await extrairTextoArquivo(file)
      setCertOCR(texto)
    } catch(e:unknown) { alert('Erro OCR certificado: '+String(e)) }
    finally { setCertLoading(false) }
  }

  async function salvar(itensFinal: ItemChecagem[]) {
    const eq = equips.find(e=>e.id===equipId)
    if (!eq) { alert('Selecione um equipamento.'); return }
    setSalvando(true)
    const proximaChecagem = addM(data, periodicidade)   // periodicidade já em meses
    const { validarChecagem } = await import('@/lib/checagens/validacao')
    // Resultado calculado automaticamente (ponto a ponto + geral) — modo por grandeza
    const itensAvaliados = itensFinal.map(i => ({ ...i, resultado: avaliarItem(i, modoDoItem(i, tipoComp, papelRef)) }))
    const geral = avaliarGeral(itensFinal, tipoComp, papelRef)
    const status = validarChecagem(itensAvaliados, proximaChecagem, geral)
    try {
      const res = await fetch(editId ? `/api/checagens/${editId}` : '/api/checagens', {
        method: editId ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          equipamentoId:eq.id, equipamentoTag:eq.tag,
          nomeInstrumento, laboratorio, numeroCertificado:numeroCert,
          dataCalibracaoRef:dataCalibRef, padraoTag,
          grupoId:eq.grupoId, subgrupoId:eq.subgrupoId,
          data, responsavel, tipoComparacao:tipoComp, papelReferencia:papelRef,
          resultadoGeral:geral, periodicidade, proximaChecagem, fonte:tab,
          normaReferencia:normaRef||undefined, status, itens:itensAvaliados, obs:obs||undefined,
        }),
      })
      const saved = await res.json()
      if (saved.error) throw new Error(saved.error)
      router.push(`/checagens/${editId ?? saved.id}`)
    } catch(e:unknown) { alert('Erro ao salvar: '+String(e)) }
    finally { setSalvando(false) }
  }

  async function handleExcel(file: File) {
    setLoading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/importacao/excel', { method:'POST', body:fd })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setExcelItens((d.itens??[]).map((item:ItemChecagem,i:number)=>({...item,ponto:i+1,valorReferencia:item.valorReferencia??'',valorMedido:item.valorMedido??''})))
    } catch(e:unknown) { alert('Erro Excel: '+String(e)) }
    finally { setLoading(false) }
  }

  async function handleOCR(file: File) {
    setLoading(true)
    try {
      const texto = await extrairTextoArquivo(file)
      setOcrTexto(texto)
    } catch(e:unknown) { alert('Erro OCR: '+String(e)) }
    finally { setLoading(false) }
  }

  // Importa uma IT de Checagem (CHK): lê a seção "Grandezas medidas" e cria
  // uma seção por grandeza (limpa, sem depender de OCR de tabela).
  async function importarITchk(file: File) {
    setLoading(true)
    try {
      const texto = await extrairTextoArquivo(file)
      const grandezas = parsearGrandezasMedidasIT(texto)
      const meta = parsearMetadadosIT(texto)
      if (!grandezas.length) { alert('Não encontrei a seção "Grandezas medidas" na IT. Confira o arquivo.'); return }
      setItens(grandezas.map((g, i) => ({ ...emptyItem(i + 1), grandeza: g })))
      if (meta.tag && !padraoTag) setPadraoTag(meta.tag)
      if (meta.periodicidade) setPeriodicidade(meta.periodicidade)
      if (meta.norma && !normaRef) setNormaRef(meta.norma)
      setTab('manual')
    } catch (e: unknown) { alert('Erro ao ler IT: ' + String(e)) }
    finally { setLoading(false) }
  }

  // Importa o critério de aprovação do PLANO DE CALIBRAÇÃO do equipamento:
  // casa por grandeza e define o critério (±) de cada ponto da checagem.
  async function importarCriteriosPlano() {
    if (!equip) { alert('Selecione o equipamento primeiro.'); return }
    let planos: PlanoCalibracao[] = []
    try { planos = await fetch(`/api/planos?equipamentoId=${encodeURIComponent(equip.id)}`).then(r => r.json()) } catch {}
    if (!Array.isArray(planos) || !planos.length) { alert('Nenhum plano de calibração cadastrado para este equipamento.'); return }
    const plano = planos[0]   // a API retorna o mais recente primeiro
    // Casa por SOBREPOSIÇÃO DE PALAVRAS (grandeza/parâmetro). Tolera variações de
    // texto entre certificado e plano (ex.: "Exatidão da Frequência Gerada" ↔
    // "Exatidão da Frequência do Sinal Gerado"). Escolhe a linha com maior overlap.
    const sigTokens = (s: string) =>
      new Set((s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4))
    const matchLinha = (itemGrandeza: string): PontoPlano | undefined => {
      const it = sigTokens(itemGrandeza)
      if (!it.size) return undefined
      let best: PontoPlano | undefined; let bestScore = 0
      for (const p of plano.pontos) {
        const pt = sigTokens(p.grandeza)
        if (!pt.size) continue
        let common = 0; pt.forEach(t => { if (it.has(t)) common++ })
        const score = common / Math.min(it.size, pt.size)
        if (common >= 2 && score > bestScore) { bestScore = score; best = p }
      }
      return bestScore >= 0.5 ? best : undefined
    }
    let n = 0
    const novos = itens.map(it => {
      const linha = matchLinha(it.grandeza)
      if (!linha) return it
      const vr = parseFloat((it.valorReferencia || '').replace(',', '.'))
      const lim = limiteAbsoluto(linha, isFinite(vr) ? vr : 0)
      n++
      return {
        ...it,
        criterioMax: lim ?? it.criterioMax,
        observacoes: it.observacoes || (linha.criterioTexto ? `Critério (plano): ${linha.criterioTexto}` : it.observacoes),
      }
    })
    setItens(novos)
    alert(n ? `${n} ponto(s) com critério importado do plano de calibração.` : 'Nenhuma grandeza da checagem casou com o plano.')
  }

  const equip = equips.find(e=>e.id===equipId)

  // Grandezas SELECIONÁVEIS: as cadastradas no padrão (por TAG) e no equipamento,
  // mais as já presentes nos itens. Evita depender do texto do OCR p/ a grandeza.
  const grandezasDisponiveis = (() => {
    const set = new Set<string>()
    const add = (s?: string) => { const v = (s || '').trim(); if (v) set.add(v) }
    const padrao = padraoTag.trim()
      ? equips.find(e => (e.tag || '').trim().toLowerCase() === padraoTag.trim().toLowerCase())
      : undefined
    ;(padrao?.grandezas ?? []).forEach(g => add(g.nome))
    ;(equip?.grandezas ?? []).forEach(g => add(g.nome))
    pontosCert.forEach(p => add(p.grandeza))   // grandezas que estão no certificado carregado
    itens.forEach(it => add(it.grandeza))
    return [...set].sort((a, b) => a.localeCompare(b))
  })()

  // IT/PC cujo código casa com algum procedimento do equipamento selecionado
  const docsCasados = (() => {
    const cods = (equip?.procedimentos ?? []).map(normCodigo)
    if (!cods.length) return []
    return docsIT.filter(d => d.codigo && cods.includes(normCodigo(d.codigo)))
  })()

  // Aplica as grandezas de uma IT/PC à tabela de pontos (reusa o parser de IT)
  function aplicarIT(doc: DocumentoIT) {
    const texto = flattenDoc(doc)
    const novos = parsearGrandezasIT(texto)
    if (!novos.length) { alert('Nenhuma grandeza reconhecida nesta IT/PC.'); return }
    const meta = parsearMetadadosIT(texto)
    setItens(novos)
    if (meta.periodicidade) setPeriodicidade(meta.periodicidade)
    if (meta.norma && !normaRef) setNormaRef(meta.norma)
    setTab('manual')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">FOR 6405 · Rev 01</p>
          <h1 className="page-title">{editId ? 'Editar Checagem Intermediária' : 'Registro de Checagem Intermediária'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {(['manual','ocr'] as Tab[]).map(t => (
            <button key={t} type="button" onClick={()=>setTab(t)}
              className={cn('px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                tab===t?'bg-[#141B28] text-white border border-white/10':'text-white/35 hover:text-white/60')}>
              {t==='manual'?'Manual':'OCR'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cabeçalho FOR 6405 ── */}
      <div className="card p-5 mb-4">
        <p className="form-section mb-4">Identificação do instrumento</p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="col-span-2">
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Equipamento *</label>
            <select className="input" value={equipId} onChange={e=>handleEquipChange(e.target.value)}>
              <option value="">Selecione…</option>
              {equips.map(e=><option key={e.id} value={e.id}>{e.tag} — {e.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">TAG</label>
            <input className="input font-mono" value={equip?.tag??''} readOnly placeholder="Auto"/>
          </div>
        </div>

        {/* IT/PC vinculadas ao equipamento (casadas pelos códigos de procedimento) */}
        {equip && (equip.procedimentos?.length ?? 0) > 0 && (
          <div className="mb-4 rounded-xl border border-gold/20 p-3" style={{ background: 'rgba(232,185,75,0.05)' }}>
            <p className="text-[10px] font-mono uppercase tracking-wider text-gold/80 mb-2">
              Procedimentos do equipamento: {equip.procedimentos!.join(', ')}
            </p>
            {docsCasados.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {docsCasados.map(d => (
                  <div key={d.id} className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-white/70 font-mono">{d.codigo}</span>
                    <span className="text-[11px] text-white/45 flex-1 min-w-0 truncate">{d.titulo}</span>
                    <button type="button" onClick={()=>aplicarIT(d)} className="btn-primary text-[11px] py-1">
                      <FileSearch size={11}/> Aplicar grandezas da IT
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-white/35">Nenhuma IT/PC cadastrada com esse código. Cadastre em Procedimentos · Documentos para vincular.</p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Instrumento de medição</label>
            <input className="input" value={nomeInstrumento} onChange={e=>setNomeInstrumento(e.target.value)} placeholder="Nome / descrição"/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Laboratório</label>
            <select className="input" value={laboratorio} onChange={e=>setLaboratorio(e.target.value)}>
              <option value="">Selecione…</option>
              {LABORATORIOS.map(g=>(
                <optgroup key={g.grupo} label={g.grupo}>
                  {g.items.map(lab=><option key={lab} value={lab}>{lab}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Certificado de calibração n°</label>
            <input className="input font-mono" value={numeroCert} onChange={e=>setNumeroCert(e.target.value)} placeholder="ex: R0042-2025"/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Data calibração (padrão)</label>
            <input type="date" className="input" value={dataCalibRef} onChange={e=>setDataCalibRef(e.target.value)}/>
          </div>
        </div>

        <p className="form-section mb-4">Execução</p>
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">TAG do padrão</label>
            <input className="input font-mono" value={padraoTag}
              onChange={e=>handlePadraoTagChange(e.target.value)} placeholder="ex: 1528EMC"/>
            {certPadraoMsg && (
              <p className={`text-[10px] mt-1 ${certPadrao?'text-green-400':'text-amber-400'}`}>{certPadraoMsg}</p>
            )}
            {certPadrao && (
              <div className="flex flex-col gap-1.5 mt-1.5">
                <button type="button" onClick={aplicarCorrecoesDoCertPadrao}
                  className="btn-primary text-[11px] py-1">
                  <FileSearch size={11}/> Aplicar correções do certificado
                </button>
                {pontosCert.length > 0 && (
                  <button type="button" onClick={() => { setCertSel(new Set()); setShowCertImport(true) }}
                    className="btn-primary text-[11px] py-1">
                    <FileSearch size={11}/> Marcar pontos do certificado ({pontosCert.length})
                  </button>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Data da checagem</label>
            <input type="date" className="input" value={data} onChange={e=>setData(e.target.value)}/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Responsável</label>
            <input className="input" value={responsavel} onChange={e=>setResponsavel(e.target.value)} placeholder="Nome do técnico"/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Periodicidade (meses)</label>
            <input type="number" min={1} max={60} className="input" value={periodicidade} onChange={e=>setPeriodicidade(Number(e.target.value))}/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Norma de referência</label>
            <input className="input" value={normaRef} onChange={e=>setNormaRef(e.target.value)} placeholder="ex: CISPR 15"/>
          </div>
        </div>

        {/* ── Método de comparação ── */}
        <div className="border border-white/8 rounded-xl p-4 space-y-4">
          <p className="text-[10px] font-mono tracking-[2px] uppercase text-white/40">Método de comparação</p>

          {/* Tipo */}
          <div className="flex gap-6">
            {(['direta','indireta'] as TipoComparacao[]).map(t=>(
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="tipoComp" value={t} checked={tipoComp===t} onChange={()=>setTipoComp(t)} className="accent-gold"/>
                <span className="text-sm font-semibold text-white/80">{t==='direta'?'Direta':'Indireta'}</span>
                <span className="text-[11px] text-white/35">
                  {t==='direta' ? '— padrão ou instrumento como fonte do mensurando' : '— fonte auxiliar; padrão e instrumento indicam simultaneamente'}
                </span>
              </label>
            ))}
          </div>

          {/* Papel da referência (só para direta) */}
          {tipoComp === 'direta' && (
            <div className="pl-4 border-l-2 border-gold/30">
              <p className="text-[10px] font-mono text-white/35 mb-2 uppercase tracking-wider">Função do padrão de referência:</p>
              <div className="flex gap-6">
                <label className="flex items-start gap-2 cursor-pointer group">
                  <input type="radio" name="papelRef" value="gerador" checked={papelRef==='gerador'} onChange={()=>setPapelRef('gerador')} className="accent-gold mt-0.5"/>
                  <div>
                    <p className="text-sm text-white/80 font-medium group-hover:text-white">Padrão como fonte</p>
                    <p className="text-[11px] text-white/35">Padrão fornece o mensurando (VR) → instrumento indica (MM). Erro = MM − VR</p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer group">
                  <input type="radio" name="papelRef" value="medidor" checked={papelRef==='medidor'} onChange={()=>setPapelRef('medidor')} className="accent-gold mt-0.5"/>
                  <div>
                    <p className="text-sm text-white/80 font-medium group-hover:text-white">Padrão como receptor</p>
                    <p className="text-[11px] text-white/35">Instrumento fornece o mensurando (VN) → padrão indica (VR). Erro = VN − VR</p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {tipoComp === 'indireta' && (
            <div className="pl-4 border-l-2 border-teal/30 text-[11px] text-white/40">
              Fonte auxiliar (artefato de transferência) fornece o mensurando →
              padrão indica (VR) e instrumento checado indica (MM) simultaneamente.<br/>
              Erro indicação = MM − Valor convencional verdadeiro (VR + correção do certificado)
            </div>
          )}

          {/* Resultado geral — calculado automaticamente dos pontos */}
          <div className="pt-2 border-t border-white/6">
            <p className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 mb-2">Resultado geral <span className="text-white/25 normal-case">(automático)</span></p>
            {(() => {
              const map: Record<ResultadoGeral, [string, string]> = {
                satisfatorio:   ['Satisfatório', 'text-green-400 bg-green-500/8 border-green/25'],
                parcial:        ['Parcialmente Satisfatório', 'text-amber-400 bg-amber-500/8 border-amber-500/30'],
                insatisfatorio: ['Insatisfatório', 'text-red-400 bg-red-500/8 border-red/25'],
                pendente:       ['Pendente — preencha medidas e critérios', 'text-white/40 border-white/10'],
              }
              const [label, cls] = map[resultadoGeralAuto]
              return <span className={cn('inline-flex items-center px-3 py-1.5 rounded-lg border text-sm font-semibold', cls)}>{label}</span>
            })()}
          </div>
        </div>

        {/* ── Certificado PDF → correções automáticas ── */}
        {tipoComp === 'indireta' && (
          <div className="mt-4 pt-4 border-t border-white/6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[10px] font-mono tracking-[2px] uppercase text-white/40">Certificado de calibração — extração de correções</p>
                <p className="text-[11px] text-white/25 mt-0.5">Carregue o PDF para extrair automaticamente as correções por ponto</p>
              </div>
              {certOCR && (
                <button type="button" onClick={aplicarCorrecoes} className="btn-primary text-xs">
                  <FileSearch size={12}/> Aplicar correções
                </button>
              )}
            </div>
            <input ref={certRef} type="file" accept=".pdf,image/*" className="hidden"
              onChange={e=>e.target.files?.[0]&&handleCertPDF(e.target.files[0])}/>
            <div className="flex items-center gap-3">
              <button type="button" onClick={()=>certRef.current?.click()} className="btn-secondary text-xs">
                {certLoading?<Loader2 size={12} className="animate-spin"/>:<Upload size={12}/>}
                {certLoading?'Lendo…':'Carregar PDF do certificado'}
              </button>
              {certOCR && (
                <span className="text-[11px] text-green-400">
                  ✓ {parsearCorrecoesDeCertificado(certOCR).length} correção(ões) identificada(s)
                </span>
              )}
            </div>
            {certOCR && (
              <details className="mt-2">
                <summary className="text-[10px] text-white/25 cursor-pointer hover:text-white/50">Ver texto extraído</summary>
                <pre className="mt-1 p-2 rounded-lg bg-black/20 text-[9px] text-white/35 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">{certOCR}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      {/* ── Grade 2D de correção ── */}
      {tab === 'manual' && (
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-3">
            <button type="button"
              onClick={() => setGrade2DAtiva(v => !v)}
              className={cn('btn-secondary text-xs py-1.5 flex items-center gap-2',
                grade2DAtiva && 'border-teal/40 text-teal')}>
              <Grid3x3 size={13}/>
              {grade2DAtiva ? 'Interpolação 2D ativa' : 'Ativar interpolação 2D'}
            </button>
            {grade2DAtiva && (
              <span className="text-[11px] text-white/35">
                Insira os dois eixos por ponto → correção calculada automaticamente
              </span>
            )}
          </div>
          {grade2DAtiva && (
            <Grade2DCertificado
              eixo1Nome={grade2DEixo1Nome}    eixo1Unidade={grade2DEixo1Unidade}
              eixo2Nome={grade2DEixo2Nome}    eixo2Unidade={grade2DEixo2Unidade}
              pontos={grade2DPontos}
              onChange={setGrade2DPontos}
              onEixoChange={(campo, val) => {
                if (campo === 'eixo1Nome')    setGrade2DEixo1Nome(val)
                if (campo === 'eixo1Unidade') setGrade2DEixo1Unidade(val)
                if (campo === 'eixo2Nome')    setGrade2DEixo2Nome(val)
                if (campo === 'eixo2Unidade') setGrade2DEixo2Unidade(val)
              }}
            />
          )}
        </div>
      )}

      {/* ── Tab Manual — seções por grandeza ── */}
      {tab === 'manual' && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <p className="form-section">Pontos de medição — por grandeza</p>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-white/30">
                correção ← instrumento · referência (VR) ← padrão
              </span>
              <button type="button" onClick={importarCriteriosPlano}
                title="Traz o critério de aprovação do plano de calibração do equipamento"
                className="btn-secondary text-[11px] py-1 flex items-center gap-1.5">
                <FileSearch size={11}/> Importar critérios do plano
              </button>
            </div>
          </div>

          {grandezasDisponiveis.length === 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20 text-amber-300/90 text-[11px] flex items-center gap-2">
              <AlertTriangle size={12} className="shrink-0"/>
              Nenhuma grandeza cadastrada para selecionar. Cadastre as grandezas no equipamento/padrão (ou informe o TAG do padrão) para que apareçam no seletor.
            </div>
          )}

          {gruposItens.length === 0 && (
            <div className="card p-6 text-center text-white/30 text-sm mb-4">
              Nenhum ponto ainda. Escolha um equipamento (carrega o template) ou adicione uma grandeza abaixo.
            </div>
          )}

          {gruposItens.map(g => (
            <GrandezaSection key={g.key} grandeza={g.grandeza} items={g.items}
              tipoCompGlobal={tipoComp} papelRefGlobal={papelRef}
              eixo1Nome={grade2DEixo1Nome} eixo1Unidade={grade2DEixo1Unidade}
              eixo2Nome={grade2DEixo2Nome} eixo2Unidade={grade2DEixo2Unidade}
              equips={equips}
              instrumentoTag={g.items[0]?.instrumentoTag}
              certNum={g.items[0]?.instrumentoCertNum}
              grandezaOpcoes={grandezasDisponiveis}
              onRename={renomearGrandeza}
              onPickInstrumento={aplicarInstrumentoGrandeza}
              onAddItem={addItemGrandeza}
              onChangeItem={updateItem}
              onDeleteItem={removeItem}
              onSetModo={setModoGrandeza}
              onSetGrade2D={setGrade2DGrandeza} />
          ))}

          <div className="card p-4 mb-4 space-y-3">
            <button type="button" onClick={() => addItemGrandeza('')} className="btn-secondary text-xs">
              <Plus size={12}/> Nova grandeza
            </button>
            <div className="flex items-center gap-3 pt-2 border-t border-white/5">
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 flex-shrink-0">Obs. gerais</label>
              <input className="input flex-1 text-sm" value={obs} onChange={e=>setObs(e.target.value)} placeholder="Observações…"/>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={()=>salvar(itens)} disabled={salvando} className="btn-primary">
                {salvando&&<Loader2 size={13} className="animate-spin"/>}
                <Save size={13}/> Registrar checagem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab IT / Instrução de Trabalho ── */}
      {tab==='it'&&<ITParser onAplicar={(novosItens, meta) => {
        setItens(novosItens)
        if (meta.tag && !padraoTag) setPadraoTag(meta.tag)
        if (meta.periodicidade) setPeriodicidade(meta.periodicidade)
        if (meta.norma && !normaRef) setNormaRef(meta.norma)
        setTab('manual')
      }}/>}

      {/* ── Tab Excel ── */}
      {tab==='excel'&&(
        <div className="card p-5 mb-4 space-y-4">
          <p className="form-section">Importar planilha .xlsx</p>
          <p className="text-[11px] text-white/40">A=Grandeza · B=Unidade · C=VR · D=MM · E=Resultado · F=Obs</p>
          <div className="flex gap-3">
            <input ref={excelRef} type="file" accept=".xlsx,.xls,.xltm" className="hidden"
              onChange={e=>e.target.files?.[0]&&handleExcel(e.target.files[0])}/>
            <button type="button" onClick={()=>excelRef.current?.click()} className="btn-secondary">
              {loading?<Loader2 size={13} className="animate-spin"/>:<Upload size={13}/>} Selecionar
            </button>
          </div>
          {excelItens.length>0&&(
            <>
              <div className="overflow-x-auto max-h-56">
                <table className="w-full">
                  <thead className="tbl-head"><tr><th>#</th><th>Grandeza</th><th>Unid.</th><th>VR</th><th>MM</th><th>Resultado</th></tr></thead>
                  <tbody>
                    {excelItens.map(i=>(
                      <tr key={i.id} className="tbl-row">
                        <td className="font-mono text-[11px] text-white/40">{i.ponto}</td>
                        <td>{i.grandeza}</td>
                        <td className="font-mono text-[11px]">{i.unidade}</td>
                        <td className="font-mono text-[11px]">{i.valorReferencia}</td>
                        <td className="font-mono text-[11px]">{i.valorMedido}</td>
                        <td>{i.resultado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={()=>salvar(excelItens)} disabled={salvando} className="btn-primary">
                  {salvando&&<Loader2 size={13} className="animate-spin"/>} Confirmar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab OCR ── */}
      {tab==='ocr'&&(
        <div className="card p-5 mb-4 space-y-4">
          {/* Importar IT de Checagem (CHK) — extrai as grandezas da seção "Grandezas medidas" */}
          <div className="rounded-xl border border-teal/20 p-3" style={{ background: 'rgba(45,212,191,0.05)' }}>
            <p className="text-[11px] text-teal/80 font-semibold mb-1 flex items-center gap-1.5">
              <FileSearch size={12}/> Importar IT de Checagem (CHK)
            </p>
            <p className="text-[10px] text-white/40 mb-2">Lê a seção “Grandezas medidas” da IT e cria uma seção por grandeza na aba Manual.</p>
            <label className="btn-secondary text-xs cursor-pointer inline-flex">
              <Upload size={12}/> Selecionar IT (.pdf)
              <input type="file" accept=".pdf,image/*" className="hidden"
                onChange={e=>{ const f=e.target.files?.[0]; if(f) importarITchk(f); e.currentTarget.value='' }}/>
            </label>
          </div>

          <p className="form-section">Importar via OCR</p>
          <div className="flex gap-3">
            <input ref={ocrRef} type="file" accept="image/*,.pdf" className="hidden"
              onChange={e=>e.target.files?.[0]&&handleOCR(e.target.files[0])}/>
            <button type="button" onClick={()=>ocrRef.current?.click()} className="btn-secondary">
              {loading?<Loader2 size={13} className="animate-spin"/>:<ScanText size={13}/>} Selecionar
            </button>
          </div>
          {ocrTexto&&(
            <>
              <textarea className="input h-40 resize-none font-mono text-xs" value={ocrTexto} onChange={e=>setOcrTexto(e.target.value)}/>
              <div className="flex justify-end">
                <button type="button" className="btn-primary" disabled={salvando}
                  onClick={()=>salvar([{id:uid(),ponto:1,grandeza:'OCR',unidade:'—',valorReferencia:'',valorMedido:ocrTexto,resultado:'na'}])}>
                  {salvando&&<Loader2 size={13} className="animate-spin"/>} Confirmar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modal: importar pontos do certificado ── */}
      {showCertImport && certPadrao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.6)' }}
             onClick={() => setShowCertImport(false)}>
          <div className="card w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
               style={{ background: '#0E1320' }}
               onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between p-4 border-b border-white/8">
              <div>
                <p className="form-section !pt-0 !pb-0">Importar pontos do certificado</p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {certPadrao.numero} · {certPadrao.laboratorio} — clique nos pontos que deseja checar
                </p>
              </div>
              <button type="button" onClick={() => setShowCertImport(false)} className="text-white/30 hover:text-white transition-colors">
                <X size={16}/>
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/6">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setCertSel(new Set(pontosCert.map((_, i) => i)))}
                  className="text-[11px] text-white/50 hover:text-white transition-colors">Todos</button>
                <span className="text-white/15">·</span>
                <button type="button" onClick={() => setCertSel(new Set())}
                  className="text-[11px] text-white/50 hover:text-white transition-colors">Nenhum</button>
              </div>
              <span className="text-[11px] font-mono text-gold">{certSel.size} selecionado(s)</span>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full">
                <thead className="tbl-head sticky top-0 z-10" style={{ background: '#0E1320' }}>
                  <tr>
                    <th className="w-8"></th><th>Pt.</th><th>Grandeza / Parâmetro</th>
                    <th>Freq.</th><th>VR</th><th>Correção</th>
                  </tr>
                </thead>
                {gruposCert.map(g => {
                  const idxs    = g.items.map(it => it.i)
                  const allSel  = idxs.length > 0 && idxs.every(i => certSel.has(i))
                  const someSel = idxs.some(i => certSel.has(i))
                  return (
                    <tbody key={g.grandeza}>
                      {/* Cabeçalho do grupo — clique marca/desmarca a grandeza inteira */}
                      <tr className="cursor-pointer select-none" onClick={() => toggleGrupoCert(idxs)}
                          style={{ background: 'rgba(212,175,55,0.07)' }}>
                        <td className="w-8 text-center">
                          <input type="checkbox" checked={allSel}
                            ref={el => { if (el) el.indeterminate = !allSel && someSel }}
                            readOnly className="accent-gold pointer-events-none"/>
                        </td>
                        <td colSpan={5} className="text-[11px] font-mono uppercase tracking-wider text-gold/80 py-1.5">
                          {g.grandeza} <span className="text-white/30 normal-case">· {g.items.length} ponto(s)</span>
                        </td>
                      </tr>
                      {g.items.map(({ i, p }) => {
                        const sel = certSel.has(i)
                        return (
                          <tr key={i} onClick={() => toggleCertSel(i)}
                              className={cn('tbl-row cursor-pointer', sel && 'bg-gold/8')}>
                            <td className="w-8 text-center">
                              <input type="checkbox" checked={sel} readOnly className="accent-gold pointer-events-none"/>
                            </td>
                            <td className="font-mono text-[11px] text-white/40">{i + 1}</td>
                            <td className="text-white/70 text-[12px] pl-4">
                              {p.parametro && p.parametro !== p.grandeza ? p.parametro : p.grandeza}
                            </td>
                            <td className="font-mono text-[11px] text-white/50">{p.freq || '—'}</td>
                            <td className="font-mono text-[11px]">{p.vr} <span className="text-white/30 text-[10px]">{p.unidade}</span></td>
                            <td className="font-mono text-[11px] text-white/50">{p.correcao}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  )
                })}
              </table>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-white/8">
              <button type="button" onClick={() => setShowCertImport(false)} className="btn-secondary text-sm">Cancelar</button>
              <button type="button" onClick={importarPontosDoCert} className="btn-primary text-sm" disabled={certSel.size === 0}>
                Importar {certSel.size} ponto(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
