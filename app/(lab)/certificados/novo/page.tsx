'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2 } from 'lucide-react'
import { addM } from '@/lib/utils'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import { Grade2DCertificado } from '@/components/Grade2DCertificado'
import type { PontoCalibracao2D } from '@/lib/interpolacao'

export default function NovoCertificadoPage() {
  const router = useRouter()
  const [equips, setEquips] = useState<EquipamentoEMC[]>([])
  const [salvando, setSalvando] = useState(false)
  const [equipId, setEquipId] = useState('')
  const [numero,      setNumero]      = useState('')
  const [laboratorio, setLaboratorio] = useState('')
  const [dataEmissao, setDataEmissao] = useState('')
  const [dataValidade,setDataValidade]= useState('')

  const [grade2DPontos,  setGrade2DPontos]  = useState<PontoCalibracao2D[]>([])
  const [eixo1Nome,      setEixo1Nome]      = useState('Frequência')
  const [eixo1Unidade,   setEixo1Unidade]   = useState('MHz')
  const [eixo2Nome,      setEixo2Nome]      = useState('Nível')
  const [eixo2Unidade,   setEixo2Unidade]   = useState('dBm')

  useEffect(() => {
    fetch('/api/equipamentos').then(r => r.json()).then(d => setEquips(Array.isArray(d) ? d : []))
  }, [])

  const equip = equips.find(e => e.id === equipId)

  // Validade = data da calibração + periodicidade cadastrada do equipamento (meses)
  useEffect(() => {
    if (dataEmissao && equip?.intervaloCalibracao) setDataValidade(addM(dataEmissao, equip.intervaloCalibracao))
  }, [dataEmissao, equipId])  // eslint-disable-line react-hooks/exhaustive-deps

  function handleEixoChange(campo: 'eixo1Nome'|'eixo1Unidade'|'eixo2Nome'|'eixo2Unidade', val: string) {
    if (campo === 'eixo1Nome')    setEixo1Nome(val)
    if (campo === 'eixo1Unidade') setEixo1Unidade(val)
    if (campo === 'eixo2Nome')    setEixo2Nome(val)
    if (campo === 'eixo2Unidade') setEixo2Unidade(val)
  }

  async function salvar() {
    if (!equip) { alert('Selecione o equipamento padrão.'); return }
    if (!grade2DPontos.length) { alert('Adicione ao menos um ponto na grade.'); return }
    setSalvando(true)
    try {
      const body = {
        equipamentoId:  equip.id,
        equipamentoTag: equip.tag,
        numero: numero.trim(),
        laboratorio,
        dataEmissao: dataEmissao || new Date().toISOString().slice(0, 10),
        dataValidade: dataValidade || undefined,
        itens: [],
        grade2D: { eixo1Nome, eixo1Unidade, eixo2Nome, eixo2Unidade, pontos: grade2DPontos },
      }
      const res = await fetch('/api/certificados', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const saved = await res.json()
      if (saved.error) throw new Error(saved.error)
      router.push('/certificados')
    } catch (e: unknown) { alert('Erro ao salvar: ' + String(e)) }
    finally { setSalvando(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Certificados · Novo</p>
          <h1 className="page-title">Novo Certificado de Calibração</h1>
          <p className="page-sub">Defina o padrão e cadastre a grade de correção. Demais dados podem ser preenchidos depois.</p>
        </div>
        <button type="button" onClick={salvar} disabled={salvando} className="btn-primary">
          {salvando ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
          Salvar
        </button>
      </div>

      {/* Equipamento */}
      <div className="card p-5 mb-4">
        <p className="form-section mb-4">Padrão de referência</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Equipamento *</label>
            <select className="input" value={equipId} onChange={e => setEquipId(e.target.value)}>
              <option value="">Selecione…</option>
              {equips.map(e => <option key={e.id} value={e.id}>{e.tag} — {e.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">TAG</label>
            <input className="input font-mono" value={equip?.tag ?? ''} readOnly placeholder="Auto"/>
          </div>
        </div>

        {/* Dados do certificado (preenchidos pela OCR da página 1) */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Nº do certificado</label>
            <input className="input font-mono" value={numero} onChange={e=>setNumero(e.target.value)} placeholder="ex: R0047/2025"/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Laboratório</label>
            <input className="input" value={laboratorio} onChange={e=>setLaboratorio(e.target.value)} placeholder="ex: LABELO/PUCRS"/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Data da calibração</label>
            <input type="date" className="input" value={dataEmissao} onChange={e=>setDataEmissao(e.target.value)}/>
          </div>
          <div>
            <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Validade</label>
            <input type="date" className="input" value={dataValidade} onChange={e=>setDataValidade(e.target.value)}/>
          </div>
        </div>
        <p className="text-[10px] text-white/30 mt-2">Os dados acima são preenchidos automaticamente ao carregar o PDF (página 1 do certificado) — confira/edite.</p>
      </div>

      {/* Grade 2D */}
      <Grade2DCertificado
        eixo1Nome={eixo1Nome} eixo1Unidade={eixo1Unidade}
        eixo2Nome={eixo2Nome} eixo2Unidade={eixo2Unidade}
        pontos={grade2DPontos}
        onChange={setGrade2DPontos}
        onEixoChange={handleEixoChange}
        onMeta={(m) => {
          if (m.numero)      setNumero(m.numero)
          if (m.laboratorio) setLaboratorio(m.laboratorio)
          if (m.dataEmissao) setDataEmissao(m.dataEmissao)
        }}
      />
    </div>
  )
}
