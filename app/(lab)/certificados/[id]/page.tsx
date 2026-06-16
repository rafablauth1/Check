'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Save, Loader2, Trash2, ArrowLeft, FileText, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { Certificado } from '@/lib/certificados/tipos'
import { Grade2DCertificado } from '@/components/Grade2DCertificado'
import type { PontoCalibracao2D } from '@/lib/interpolacao'

export default function CertificadoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [cert, setCert] = useState<Certificado | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Campos editáveis
  const [numero,      setNumero]      = useState('')
  const [laboratorio, setLaboratorio] = useState('')
  const [dataEmissao, setDataEmissao] = useState('')
  const [dataValidade,setDataValidade]= useState('')
  const [normaRastr,  setNormaRastr]  = useState('')
  const [obs,         setObs]         = useState('')

  const [pdfAberto, setPdfAberto] = useState(false)
  const [grade2DAtiva,  setGrade2DAtiva]  = useState(false)
  const [grade2DPontos, setGrade2DPontos] = useState<PontoCalibracao2D[]>([])
  const [eixo1Nome,     setEixo1Nome]     = useState('Frequência')
  const [eixo1Unidade,  setEixo1Unidade]  = useState('MHz')
  const [eixo2Nome,     setEixo2Nome]     = useState('Nível')
  const [eixo2Unidade,  setEixo2Unidade]  = useState('dBm')

  useEffect(() => {
    fetch(`/api/certificados/${id}`).then(r => r.json()).then((c: Certificado) => {
      setCert(c)
      setNumero(c.numero ?? '')
      setLaboratorio(c.laboratorio ?? '')
      setDataEmissao(c.dataEmissao ?? '')
      setDataValidade(c.dataValidade ?? '')
      setNormaRastr(c.normaRastreabilidade ?? '')
      setObs(c.obs ?? '')
      if (c.grade2D) {
        setGrade2DAtiva(true)
        setGrade2DPontos(c.grade2D.pontos)
        setEixo1Nome(c.grade2D.eixo1Nome)
        setEixo1Unidade(c.grade2D.eixo1Unidade)
        setEixo2Nome(c.grade2D.eixo2Nome)
        setEixo2Unidade(c.grade2D.eixo2Unidade)
      }
    })
  }, [id])

  function handleEixoChange(campo: 'eixo1Nome'|'eixo1Unidade'|'eixo2Nome'|'eixo2Unidade', val: string) {
    if (campo === 'eixo1Nome')    setEixo1Nome(val)
    if (campo === 'eixo1Unidade') setEixo1Unidade(val)
    if (campo === 'eixo2Nome')    setEixo2Nome(val)
    if (campo === 'eixo2Unidade') setEixo2Unidade(val)
  }

  async function salvar() {
    setSalvando(true)
    try {
      const body = {
        ...cert,
        numero, laboratorio, dataEmissao,
        dataValidade: dataValidade || undefined,
        normaRastreabilidade: normaRastr || undefined,
        obs: obs || undefined,
        grade2D: grade2DAtiva && grade2DPontos.length > 0 ? {
          eixo1Nome, eixo1Unidade, eixo2Nome, eixo2Unidade, pontos: grade2DPontos,
        } : undefined,
      }
      const res = await fetch(`/api/certificados/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const saved = await res.json()
      if (saved.error) throw new Error(saved.error)
      router.push('/certificados')
    } catch (e: unknown) { alert('Erro ao salvar: ' + String(e)) }
    finally { setSalvando(false) }
  }

  async function excluir() {
    if (!confirm('Excluir este certificado?')) return
    await fetch(`/api/certificados/${id}`, { method: 'DELETE' })
    router.push('/certificados')
  }

  if (!cert) return <div className="text-white/30 text-sm p-8">Carregando…</div>

  const inp = 'input text-sm'
  const lbl = 'text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1'

  return (
    <div>
      {/* Painel PDF deslizante */}
      {pdfAberto && cert?.pdfPath && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setPdfAberto(false)}/>
          <div className="w-[55vw] h-full bg-[#0B0E14] border-l border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
              <span className="text-[12px] font-mono text-white/60 truncate">{cert.pdfNome ?? 'PDF'}</span>
              <div className="flex items-center gap-2">
                <button type="button"
                  onClick={() => (window as any).electronAPI?.openPath(cert.pdfPath)}
                  className="text-white/35 hover:text-white text-[11px] flex items-center gap-1 transition-colors">
                  <ExternalLink size={11}/> Abrir no leitor
                </button>
                <button type="button" onClick={() => setPdfAberto(false)}
                  className="text-white/35 hover:text-white transition-colors text-lg leading-none">✕</button>
              </div>
            </div>
            <iframe
              src={`file://${cert.pdfPath.replace(/\\/g, '/')}`}
              className="flex-1 w-full border-0"
              title="PDF do certificado"
            />
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <Link href="/certificados" className="flex items-center gap-1 text-white/40 hover:text-white text-[12px] mb-2 transition-colors">
            <ArrowLeft size={12}/> Certificados
          </Link>
          <p className="page-eyebrow">{cert.equipamentoTag}</p>
          <h1 className="page-title">{cert.numero}</h1>
          <p className="page-sub">{cert.laboratorio}</p>
        </div>
        <div className="flex gap-2">
          {cert.pdfPath && (
            <button type="button" onClick={() => setPdfAberto(v => !v)}
              className="btn-secondary text-sm flex items-center gap-2">
              <FileText size={14}/> {pdfAberto ? 'Fechar PDF' : 'Ver PDF'}
            </button>
          )}
          <button type="button" onClick={excluir}
            className="btn-danger text-sm flex items-center gap-2">
            <Trash2 size={14}/> Excluir
          </button>
          <button type="button" onClick={salvar} disabled={salvando} className="btn-primary">
            {salvando ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
            Salvar
          </button>
        </div>
      </div>

      <div className="card p-5 mb-4">
        <p className="form-section mb-4">Identificação</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Número do certificado</label>
            <input className={inp} value={numero} onChange={e => setNumero(e.target.value)}/>
          </div>
          <div>
            <label className={lbl}>Laboratório</label>
            <input className={inp} value={laboratorio} onChange={e => setLaboratorio(e.target.value)}/>
          </div>
          <div>
            <label className={lbl}>Data de emissão</label>
            <input type="date" className={inp} value={dataEmissao} onChange={e => setDataEmissao(e.target.value)}/>
          </div>
          <div>
            <label className={lbl}>Data de validade</label>
            <input type="date" className={inp} value={dataValidade} onChange={e => setDataValidade(e.target.value)}/>
          </div>
          <div>
            <label className={lbl}>Norma de rastreabilidade</label>
            <input className={inp} value={normaRastr} onChange={e => setNormaRastr(e.target.value)}/>
          </div>
          <div>
            <label className={lbl}>Observações</label>
            <input className={inp} value={obs} onChange={e => setObs(e.target.value)}/>
          </div>
        </div>
      </div>

      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="form-section !pt-0 !pb-0">Grade de correção 2D</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <div className="relative">
              <input type="checkbox" checked={grade2DAtiva} onChange={e => setGrade2DAtiva(e.target.checked)} className="sr-only"/>
              <div className={`w-10 h-5 rounded-full transition-colors ${grade2DAtiva ? 'bg-teal' : 'bg-white/10'}`}/>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${grade2DAtiva ? 'translate-x-5' : ''}`}/>
            </div>
            <span className="text-[12px] text-white/60">{grade2DAtiva ? 'Ativa' : 'Inativa'}</span>
          </label>
        </div>
        {grade2DAtiva ? (
          <Grade2DCertificado
            eixo1Nome={eixo1Nome} eixo1Unidade={eixo1Unidade}
            eixo2Nome={eixo2Nome} eixo2Unidade={eixo2Unidade}
            pontos={grade2DPontos}
            onChange={setGrade2DPontos}
            onEixoChange={handleEixoChange}
          />
        ) : (
          <p className="text-[12px] text-white/25 text-center py-4">
            Ative para cadastrar uma grade de correção com interpolação bilinear.
          </p>
        )}
      </div>
    </div>
  )
}
