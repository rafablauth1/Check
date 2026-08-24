'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, X, Save, Upload, ScanText, Loader2, FileText } from 'lucide-react'
import { fmt } from '@/lib/utils'
import { extrairTextoArquivo } from '@/lib/useOCR'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import type { GrandezaMetrologica } from '@/lib/metrologia/tipos'
import type { Checagem } from '@/lib/checagens/tipos'
import type { Certificado, LinhaCertificado } from '@/lib/certificados/tipos'
import { parsearCertificado, parsearMetadadosCertificado } from '@/lib/certificados/parser'

/* ── Status pills ── */
function StatusPill({ status }: { status: string }) {
  if (status === 'ativo')              return <span className="badge-success">Ativo</span>
  if (status === 'calibrar')           return <span className="badge-warning">Calibração vencida</span>
  if (status === 'sem-calibracao')     return <span className="badge" style={{ background:'rgba(148,163,184,0.12)', color:'#94A3B8', border:'1px solid rgba(148,163,184,0.25)' }}>Não requer calibração</span>
  if (status === 'calibrar-antes-uso') return <span className="badge-warning">Calibrar antes do uso</span>
  return <span className="badge-danger">Fora de uso</span>
}
function StatusChecBadge({ status, resultado }: { status: string; resultado?: string }) {
  // Sem resultado (checagem não realizada) → Pendente, nunca "Aprovada".
  if (resultado === 'pendente' || !resultado) return <span className="badge text-white/40">Pendente</span>
  if (status === 'reprovado') return <span className="badge-danger">Reprovada</span>
  if (status === 'atencao')   return <span className="badge-warning">Atenção</span>
  return <span className="badge-success">Aprovada</span>
}

/* ── Modal de grandeza ── */
interface GrandezaForm {
  nome: string; simbolo: string; unidade: string
  faixaMin: number | ''; faixaMax: number | ''
  resolucao: string; incertezaExpandida: string; fatorCobertura: number
}
const G_EMPTY: GrandezaForm = { nome:'', simbolo:'', unidade:'', faixaMin:'', faixaMax:'', resolucao:'', incertezaExpandida:'', fatorCobertura:2 }

function GrandezaModal({ inicial, onSalvar, onFechar }: {
  inicial?: GrandezaMetrologica; onSalvar:(g:GrandezaForm)=>void; onFechar:()=>void
}) {
  const [form, setForm] = useState<GrandezaForm>(inicial ? { ...inicial, faixaMin:inicial.faixaMin, faixaMax:inicial.faixaMax } : G_EMPTY)
  const [err, setErr] = useState('')
  function set<K extends keyof GrandezaForm>(k:K,v:GrandezaForm[K]) { setForm(p=>({...p,[k]:v})) }
  function submit(e:React.FormEvent) { e.preventDefault(); if(!form.nome.trim()){setErr('Nome obrigatório.');return} onSalvar(form) }
  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center" style={{background:'rgba(0,0,0,0.65)'}} onClick={onFechar}>
      <div className="card p-6 w-[520px] max-w-[95vw] max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-display font-bold text-[15px] text-white">{inicial?'Editar grandeza':'Nova grandeza'}</p>
          <button type="button" onClick={onFechar} className="btn-ghost p-1.5"><X size={14}/></button>
        </div>
        <form onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {([['Nome *','text','nome','ex: Tensão DC'],['Unidade *','text','unidade','ex: V, dBµV'],['Faixa mín.','number','faixaMin','0'],['Faixa máx.','number','faixaMax','100'],['Incerteza exp.','text','incertezaExpandida','ex: ± 0,05 V']] as [string,string,keyof GrandezaForm,string][]).map(([label,type,key,ph])=>(
              <div key={key}>
                <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">{label}</label>
                <input type={type} className="input" placeholder={ph} value={String(form[key]??'')}
                  onChange={e=>set(key,type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value as GrandezaForm[typeof key])}/>
              </div>
            ))}
          </div>
          {err && <p className="text-[12px] text-red-400 mb-2">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onFechar} className="btn-secondary">Cancelar</button>
            <button type="submit" className="btn-primary"><Save size={12}/> Salvar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Modal de certificado ── */
function CertificadoModal({ equipamentoId, equipamentoTag, onSalvo, onFechar }: {
  equipamentoId: string; equipamentoTag: string; onSalvo:()=>void; onFechar:()=>void
}) {
  const certRef = useRef<HTMLInputElement>(null)
  const [numero,      setNumero]      = useState('')
  const [laboratorio, setLaboratorio] = useState('')
  const [dataEmissao, setDataEmissao] = useState('')
  const [dataValidade,setDataValidade]= useState('')
  const [norma,       setNorma]       = useState('')
  const [obs,         setObs]         = useState('')
  const [itens,       setItens]       = useState<LinhaCertificado[]>([])
  const [ocrText,     setOcrText]     = useState('')
  const [ocrLoading,  setOcrLoading]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [err,         setErr]         = useState('')
  const [pdfPath,     setPdfPath]     = useState('')
  const [pdfNome,     setPdfNome]     = useState('')

  function uid() { return Math.random().toString(36).slice(2) }

  async function handleOCR(file: File) {
    setOcrLoading(true)
    try {
      // guarda só a REFERÊNCIA do arquivo (caminho original), sem copiar.
      // No Electron, o File expõe .path (caminho real, inclusive de rede).
      setPdfNome(file.name)
      const fpath = (file as unknown as { path?: string }).path
      if (fpath) setPdfPath(fpath)
      const texto = await extrairTextoArquivo(file)
      setOcrText(texto)
      // Auto-preenche campos
      const meta = parsearMetadadosCertificado(texto)
      if (meta.numero)      setNumero(meta.numero)
      if (meta.laboratorio) setLaboratorio(meta.laboratorio)
      if (meta.dataEmissao) setDataEmissao(meta.dataEmissao)
      // Extrai itens
      const linhas = parsearCertificado(texto)
      if (linhas.length > 0) setItens(linhas)
    } catch(e:unknown) { setErr('Erro OCR: '+String(e)) }
    finally { setOcrLoading(false) }
  }

  function addLinha() {
    setItens(p => [...p, { ponto:p.length+1, grandeza:'', unidade:'', valorNominal:'', valorIndicado:'', correcao:'', incertezaExpandida:'', fatorCobertura:2 }])
  }
  function updateLinha(i:number, l:LinhaCertificado) { setItens(p=>p.map((x,j)=>j===i?l:x)) }
  function removeLinha(i:number) { setItens(p=>p.filter((_,j)=>j!==i).map((x,j)=>({...x,ponto:j+1}))) }

  async function salvar() {
    if (!numero.trim()) { setErr('Número do certificado obrigatório.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/certificados', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ equipamentoId, equipamentoTag, numero, laboratorio, dataEmissao, dataValidade: dataValidade||undefined, normaRastreabilidade:norma||undefined, itens, obs:obs||undefined, pdfNome: pdfNome||undefined, pdfPath: pdfPath||undefined }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      onSalvo()
    } catch(e:unknown) { setErr(String(e)) }
    finally { setSaving(false) }
  }

  const inp = 'input text-[11px] py-1 px-2 h-7'

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center" style={{background:'rgba(0,0,0,0.65)'}} onClick={onFechar}>
      <div className="card p-6 w-[780px] max-w-[98vw] max-h-[94vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-display font-bold text-[15px] text-white">Novo certificado de calibração</p>
          <button type="button" onClick={onFechar} className="btn-ghost p-1.5"><X size={14}/></button>
        </div>

        {/* OCR do PDF */}
        <div className="mb-4 p-3 rounded-xl border border-white/8 bg-white/2">
          <p className="text-[10px] font-mono tracking-[2px] uppercase text-white/35 mb-2">Carregar certificado (PDF / imagem → OCR)</p>
          <input ref={certRef} type="file" accept=".pdf,image/*" className="hidden"
            onChange={e=>e.target.files?.[0]&&handleOCR(e.target.files[0])}/>
          <div className="flex items-center gap-3">
            <button type="button" onClick={()=>certRef.current?.click()} className="btn-secondary text-xs">
              {ocrLoading?<Loader2 size={12} className="animate-spin"/>:<ScanText size={12}/>}
              {ocrLoading?'Extraindo…':'Carregar e ler via OCR'}
            </button>
            {itens.length>0 && <span className="text-[11px] text-green-400">✓ {itens.length} linha(s) extraída(s)</span>}
          </div>
          {ocrText && (
            <details className="mt-2">
              <summary className="text-[10px] text-white/25 cursor-pointer hover:text-white/40">Ver texto OCR</summary>
              <pre className="mt-1 p-2 rounded bg-black/20 text-[9px] text-white/30 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">{ocrText}</pre>
            </details>
          )}
        </div>

        {/* Metadados */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Número do certificado *</label>
            <input className="input" value={numero} onChange={e=>setNumero(e.target.value)} placeholder="ex: R0042-2025"/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Laboratório</label>
            <input className="input" value={laboratorio} onChange={e=>setLaboratorio(e.target.value)} placeholder="ex: DARE, CHOMA"/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Data de emissão</label>
            <input type="date" className="input" value={dataEmissao} onChange={e=>setDataEmissao(e.target.value)}/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Data de validade</label>
            <input type="date" className="input" value={dataValidade} onChange={e=>setDataValidade(e.target.value)}/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Norma de rastreabilidade</label>
            <input className="input" value={norma} onChange={e=>setNorma(e.target.value)} placeholder="ex: RBC, BIPM"/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Observações</label>
            <input className="input" value={obs} onChange={e=>setObs(e.target.value)}/>
          </div>
        </div>

        {/* Tabela de itens (correções) */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="form-section">Tabela de correções</p>
            <button type="button" onClick={addLinha} className="btn-ghost text-xs"><Plus size={11}/> Linha</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full">
              <thead className="tbl-head">
                <tr>
                  <th className="w-8 text-center">Pt.</th>
                  <th>Grandeza</th>
                  <th className="w-16">Unid.</th>
                  <th className="w-24">Nominal</th>
                  <th className="w-24">Indicado</th>
                  <th className="w-24">Correção</th>
                  <th className="w-28">Incerteza U (k=2)</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((l,i)=>(
                  <tr key={i} className="tbl-row group/lin">
                    <td className="text-center font-mono text-[11px] text-white/40">{l.ponto}</td>
                    <td><input className={inp} value={l.grandeza} onChange={e=>updateLinha(i,{...l,grandeza:e.target.value})} placeholder="Tensão DC"/></td>
                    <td><input className={inp+' font-mono'} value={l.unidade} onChange={e=>updateLinha(i,{...l,unidade:e.target.value})} placeholder="V"/></td>
                    <td><input className={inp+' font-mono'} value={l.valorNominal} onChange={e=>updateLinha(i,{...l,valorNominal:e.target.value})}/></td>
                    <td><input className={inp+' font-mono'} value={l.valorIndicado} onChange={e=>updateLinha(i,{...l,valorIndicado:e.target.value})}/></td>
                    <td>
                      <input className={inp+' font-mono font-bold'} value={l.correcao} onChange={e=>updateLinha(i,{...l,correcao:e.target.value})}
                        style={{color: l.correcao.startsWith('-') ? '#F87171' : '#22C55E'}}/>
                    </td>
                    <td><input className={inp+' font-mono'} value={l.incertezaExpandida} onChange={e=>updateLinha(i,{...l,incertezaExpandida:e.target.value})} placeholder="±0.005 V"/></td>
                    <td>
                      <button type="button" onClick={()=>removeLinha(i)} className="opacity-0 group-hover/lin:opacity-100 text-white/20 hover:text-red-400 p-0.5">
                        <Trash2 size={11}/>
                      </button>
                    </td>
                  </tr>
                ))}
                {itens.length===0&&(
                  <tr><td colSpan={8} className="py-4 text-center text-white/25 text-xs">
                    Carregue o PDF ou adicione linhas manualmente
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {err && <p className="text-[12px] text-red-400 mb-3">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={salvar} disabled={saving} className="btn-primary">
            {saving&&<Loader2 size={13} className="animate-spin"/>}
            <Save size={13}/> Salvar certificado
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Página principal ── */
type Tab = 'info' | 'grandezas' | 'certificados' | 'checagens'

export default function EquipamentoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const [equip,        setEquip]        = useState<EquipamentoEMC | null>(null)
  const [checagens,    setChecagens]    = useState<Checagem[]>([])
  const [certificados, setCertificados] = useState<Certificado[]>([])
  const [tab,          setTab]          = useState<Tab>('info')
  const [modalG,       setModalG]       = useState<'novo'|'edit'|null>(null)
  const [grandezaAlvo, setGrandezaAlvo] = useState<GrandezaMetrologica|null>(null)
  const [modalCert,    setModalCert]    = useState(false)

  async function carregarEquip() {
    const e = await fetch(`/api/equipamentos/${id}`).then(r=>r.json())
    if (!e.error) setEquip(e)
  }

  useEffect(() => {
    carregarEquip()
    fetch('/api/checagens').then(r=>r.json()).then((cs:Checagem[])=>setChecagens(cs.filter(c=>c.equipamentoId===id))).catch(()=>{})
    fetch(`/api/certificados?equipamentoId=${id}`).then(r=>r.json()).then(cs=>setCertificados(Array.isArray(cs)?cs:[])).catch(()=>{})
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Grandezas ── */
  function uid() { return Math.random().toString(36).slice(2) }

  async function salvarGrandeza(form: { nome:string; simbolo:string; unidade:string; faixaMin:number|''; faixaMax:number|''; resolucao:string; incertezaExpandida:string; fatorCobertura:number }) {
    if (!equip) return
    const nova: GrandezaMetrologica = { id: grandezaAlvo?.id ?? uid(), nome:form.nome, simbolo:form.simbolo, unidade:form.unidade, faixaMin:Number(form.faixaMin)||0, faixaMax:Number(form.faixaMax)||0, resolucao:form.resolucao, incertezaExpandida:form.incertezaExpandida, fatorCobertura:form.fatorCobertura }
    const grandezas = grandezaAlvo
      ? equip.grandezas.map(g=>g.id===grandezaAlvo.id?nova:g)
      : [...equip.grandezas, nova]
    await fetch(`/api/equipamentos/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({grandezas}) })
    setModalG(null); setGrandezaAlvo(null); carregarEquip()
  }

  async function excluirGrandeza(gid: string) {
    if (!equip || !confirm('Excluir grandeza?')) return
    const grandezas = equip.grandezas.filter(g=>g.id!==gid)
    await fetch(`/api/equipamentos/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({grandezas}) })
    carregarEquip()
  }

  if (!equip) return <div className="flex items-center justify-center py-20 text-white/25 text-sm">Carregando...</div>

  // Certificado mais recente COM pdf anexado (pra abrir direto do cabeçalho).
  const ultimoCertPdf = [...certificados].filter(c=>c.pdfPath)
    .sort((a,b)=>(b.dataEmissao||'').localeCompare(a.dataEmissao||''))[0]

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id:'info',         label:'Dados gerais' },
    { id:'grandezas',    label:'Grandezas', badge: equip.grandezas.length },
    { id:'certificados', label:'Certificados', badge: certificados.length },
    { id:'checagens',    label:'Checagens', badge: checagens.length },
  ]

  return (
    <div>
      <div className="page-header flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={()=>router.back()} className="btn-ghost p-2"><ArrowLeft size={15}/></button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="tag-chip">{equip.tag}</span>
              <StatusPill status={equip.status}/>
            </div>
            <h1 className="page-title">{equip.nome}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ultimoCertPdf && (
            <button type="button" title={ultimoCertPdf.pdfNome ? `Abrir ${ultimoCertPdf.pdfNome}` : ultimoCertPdf.pdfPath}
              onClick={async()=>{ const api=(window as any).electronAPI; if(!api?.openPath){alert('Disponível apenas no aplicativo.');return} const r=await api.openPath(ultimoCertPdf.pdfPath); if(r && r.ok===false) alert('Não foi possível abrir:\n'+ultimoCertPdf.pdfPath) }}
              className="btn-secondary flex items-center gap-2 text-sm">
              <FileText size={13}/> Ver PDF
            </button>
          )}
          <button type="button" onClick={()=>router.push(`/equipamentos/novo?edit=${equip.id}`)}
            className="btn-secondary flex items-center gap-2 text-sm">
            <Save size={13}/> Editar
          </button>
          <button type="button"
            onClick={async()=>{ if(!confirm(`Excluir o equipamento "${equip.nome}"?\nEsta ação não pode ser desfeita.`)) return; await fetch(`/api/equipamentos/${equip.id}`,{method:'DELETE'}); router.push('/equipamentos') }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red/20 bg-red/8 text-red-400 hover:bg-red/15 transition-all text-sm">
            <Trash2 size={13}/> Excluir
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-black/20 rounded-xl border border-white/6 w-fit mb-5">
        {TABS.map(t=>(
          <button key={t.id} type="button" onClick={()=>setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5 ${tab===t.id?'bg-[#141B28] text-white border border-white/10':'text-white/35 hover:text-white/60'}`}>
            {t.label}
            {t.badge !== undefined && t.badge > 0 && <span className="font-mono text-[9px] text-white/40">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── Tab: Dados gerais ── */}
      {tab==='info' && (
        <div className="card p-5">
          <p className="form-section mb-4">Dados gerais</p>
          <div className="flex gap-5 items-start flex-wrap">
            <div className="grid grid-cols-2 gap-4 text-sm flex-1 min-w-[260px]">
              {([['Fabricante',equip.fabricante??'—'],['Modelo',equip.modelo??'—'],['Nº de série',equip.serie??'—'],['Lab. de calibração',equip.labCalibracao??'—'],['Nº certificado',equip.numeroCertificado??'—'],['Última calibração',fmt(equip.ultimaCalibracao)],['Próx. calibração',fmt(equip.proximaCalibracao)],['Intervalo',`${equip.intervaloCalibracao} meses`]] as [string,string][]).map(([label,valor])=>(
                <div key={label}>
                  <p className="text-[9px] font-mono tracking-[2px] uppercase text-white/30 mb-0.5">{label}</p>
                  <p className="text-white/75">{valor}</p>
                </div>
              ))}
            </div>
            {equip.foto && (
              <div className="shrink-0">
                <p className="text-[9px] font-mono tracking-[2px] uppercase text-white/30 mb-1">Foto</p>
                <img src={equip.foto} alt={equip.nome} className="w-48 h-48 object-contain rounded-xl border border-white/10 bg-black/20" />
              </div>
            )}
          </div>
          {equip.obs && <div className="mt-4 pt-4 border-t border-white/6"><p className="text-[9px] font-mono tracking-[2px] uppercase text-white/30 mb-1">Observações</p><p className="text-white/60 text-sm">{equip.obs}</p></div>}
        </div>
      )}

      {/* ── Tab: Grandezas ── */}
      {tab==='grandezas' && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <p className="form-section">Grandezas metrológicas</p>
            <button className="btn-ghost text-xs" onClick={()=>{setGrandezaAlvo(null);setModalG('novo')}}>
              <Plus size={12}/> Adicionar
            </button>
          </div>
          {equip.grandezas.length===0?(
            <p className="text-white/25 text-sm py-8 text-center">Nenhuma grandeza cadastrada.</p>
          ):(
            <table className="w-full">
              <thead className="tbl-head"><tr><th>Nome</th><th>Unidade</th><th>Faixa</th><th>Incerteza exp.</th><th></th></tr></thead>
              <tbody>
                {equip.grandezas.map(g=>(
                  <tr key={g.id} className="tbl-row group/g cursor-pointer" onClick={()=>{setGrandezaAlvo(g);setModalG('edit')}}>
                    <td className="font-medium text-white/80">{g.nome}</td>
                    <td className="font-mono text-[11px]">{g.unidade}</td>
                    <td className="font-mono text-[11px]">{g.faixaMin} — {g.faixaMax}</td>
                    <td className="font-mono text-[11px]">{g.incertezaExpandida}</td>
                    <td>
                      <button type="button" onClick={e=>{e.stopPropagation();excluirGrandeza(g.id)}} className="opacity-0 group-hover/g:opacity-100 text-white/25 hover:text-red-400 p-1">
                        <Trash2 size={12}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Certificados ── */}
      {tab==='certificados' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-white/40">Certificados de calibração deste instrumento</p>
            <button className="btn-primary text-xs" onClick={()=>setModalCert(true)}>
              <Plus size={12}/> Novo certificado
            </button>
          </div>
          {certificados.length===0?(
            <div className="card p-10 text-center text-white/25 text-sm">Nenhum certificado cadastrado.</div>
          ):(
            <div className="space-y-3">
              {certificados.map(cert=>(
                <div key={cert.id} className="card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <FileText size={14} className="text-gold flex-shrink-0"/>
                        <span className="font-display font-bold text-[14px] text-white">{cert.numero}</span>
                        {cert.dataValidade && (
                          <span className={`badge text-[9px] ${new Date(cert.dataValidade)<new Date()?'badge-danger':'badge-success'}`}>
                            {new Date(cert.dataValidade)<new Date()?'Vencido':'Válido até '+fmt(cert.dataValidade)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/40">{cert.laboratorio} · Emitido em {fmt(cert.dataEmissao)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {cert.pdfPath && (
                        <button type="button" title={cert.pdfNome ? `Abrir ${cert.pdfNome}` : cert.pdfPath}
                          onClick={async()=>{ const api=(window as any).electronAPI; if(!api?.openPath){alert('Disponível apenas no aplicativo.');return} const r=await api.openPath(cert.pdfPath); if(r && r.ok===false) alert('Não foi possível abrir:\n'+cert.pdfPath) }}
                          className="btn-ghost px-2 py-1.5 text-teal/70 hover:text-teal flex items-center gap-1 text-[11px]">
                          <FileText size={12}/> Abrir PDF
                        </button>
                      )}
                      <button onClick={async()=>{ if(confirm('Excluir certificado?')) { await fetch(`/api/certificados/${cert.id}`,{method:'DELETE'}); setCertificados(p=>p.filter(c=>c.id!==cert.id)) } }} className="btn-ghost p-1.5 hover:text-red-400 text-white/25">
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  </div>
                  {cert.itens.length>0&&(
                    <table className="w-full">
                      <thead className="tbl-head"><tr><th>Pt.</th><th>Grandeza</th><th>Unid.</th><th>Nominal</th><th>Indicado</th><th>Correção</th><th>Incerteza U</th></tr></thead>
                      <tbody>
                        {cert.itens.map((l,i)=>(
                          <tr key={i} className="tbl-row">
                            <td className="font-mono text-[11px] text-white/40 text-center">{l.ponto}</td>
                            <td>{l.grandeza||'—'}</td>
                            <td className="font-mono text-[11px]">{l.unidade}</td>
                            <td className="font-mono text-[11px]">{l.valorNominal}</td>
                            <td className="font-mono text-[11px]">{l.valorIndicado}</td>
                            <td className="font-mono text-[11px] font-bold" style={{color:l.correcao.startsWith('-')?'#F87171':'#22C55E'}}>{l.correcao}</td>
                            <td className="font-mono text-[11px] text-white/40">{l.incertezaExpandida}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Checagens ── */}
      {tab==='checagens' && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/5"><p className="form-section">Histórico de checagens</p></div>
          {checagens.length===0?(
            <p className="text-white/25 text-sm py-8 text-center">Nenhuma checagem registrada.</p>
          ):(
            <table className="w-full">
              <thead className="tbl-head"><tr><th>Data</th><th>Responsável</th><th>Comparação</th><th>Resultado</th><th>Status</th></tr></thead>
              <tbody>
                {checagens.map(c=>(
                  <tr key={c.id} className="tbl-row cursor-pointer hover:bg-white/[0.025]" onClick={()=>router.push(`/checagens/${c.id}`)}>
                    <td className="font-mono text-[11px]">{fmt(c.data)}</td>
                    <td className="text-white/70">{c.responsavel||'—'}</td>
                    <td className="font-mono text-[10px] uppercase text-white/40">{c.tipoComparacao}</td>
                    <td>{c.resultadoGeral==='satisfatorio'?<span className="badge-success">Satisfatório</span>:c.resultadoGeral==='insatisfatorio'?<span className="badge-danger">Insatisfatório</span>:c.resultadoGeral==='parcial'?<span className="badge text-amber-400 border border-amber-500/30 bg-amber-500/8">Parcial</span>:<span className="text-white/30 text-[11px]">Pendente</span>}</td>
                    <td><StatusChecBadge status={c.status} resultado={c.resultadoGeral}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modais */}
      {(modalG==='novo'||modalG==='edit') && (
        <GrandezaModal inicial={modalG==='edit'?grandezaAlvo??undefined:undefined}
          onSalvar={salvarGrandeza} onFechar={()=>{setModalG(null);setGrandezaAlvo(null)}}/>
      )}
      {modalCert && (
        <CertificadoModal equipamentoId={id} equipamentoTag={equip.tag}
          onSalvo={()=>{setModalCert(false);fetch(`/api/certificados?equipamentoId=${id}`).then(r=>r.json()).then(cs=>setCertificados(Array.isArray(cs)?cs:[]))}}
          onFechar={()=>setModalCert(false)}/>
      )}
    </div>
  )
}
