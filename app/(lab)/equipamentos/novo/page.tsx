'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, ScanText, Loader2, Image as ImageIcon, X } from 'lucide-react'
import type { GrupoId, SubgrupoId, StatusEquipamento } from '@/lib/equipamentos/tipos'
import { STATUS_EQUIP } from '@/lib/equipamentos/tipos'
import { parsearDadosPadrao } from '@/lib/certificados/parser'
import { fileToBase64 } from '@/lib/utils'

// Redimensiona uma imagem para caber bem (máx. 900px) e retorna data URL
function resizeImg(file: File, maxDim = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const obj = URL.createObjectURL(file)
    img.onload = () => {
      const r = Math.min(1, maxDim / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(obj)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = obj
  })
}

interface Subgrupo {
  id: SubgrupoId
  nome: string
  numero: string
}

interface Grupo {
  id: GrupoId
  nome: string
  cor: string
  subgrupos: Subgrupo[]
}

interface FormState {
  tag: string
  nome: string
  grupoId: GrupoId | ''
  subgrupoId: SubgrupoId | ''
  fabricante: string
  modelo: string
  serie: string
  labCalibracao: string
  numeroCertificado: string
  procedimentos: string   // códigos IT/PC separados por vírgula (ex.: "PC R04, PC E02")
  ultimaCalibracao: string
  intervaloCalibracao: number
  status: StatusEquipamento
  foto: string
  obs: string
}

const EMPTY: FormState = {
  tag: '',
  nome: '',
  grupoId: '',
  subgrupoId: '',
  fabricante: '',
  modelo: '',
  serie: '',
  labCalibracao: '',
  numeroCertificado: '',
  procedimentos: '',
  ultimaCalibracao: '',
  intervaloCalibracao: 12,
  status: 'ativo',
  foto: '',
  obs: '',
}

function addMonths(dateStr: string, months: number): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export default function NovoEquipamentoPage() {
  const router = useRouter()
  const [grupos, setGrupos]   = useState<Grupo[]>([])
  const [form,   setForm]     = useState<FormState>(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [erro,   setErro]     = useState('')
  const [editId, setEditId]   = useState<string | null>(null)

  // Modo edição: ?edit=<id> → carrega o equipamento e preenche o formulário
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('edit')
    if (!id) return
    setEditId(id)
    fetch(`/api/equipamentos/${id}`).then(r => r.json()).then((e: any) => {
      if (!e || e.error) return
      setForm({
        tag: e.tag ?? '', nome: e.nome ?? '',
        grupoId: e.grupoId ?? '', subgrupoId: e.subgrupoId ?? '',
        fabricante: e.fabricante ?? '', modelo: e.modelo ?? '', serie: e.serie ?? '',
        labCalibracao: e.labCalibracao ?? '', numeroCertificado: e.numeroCertificado ?? '',
        procedimentos: Array.isArray(e.procedimentos) ? e.procedimentos.join(', ') : '',
        ultimaCalibracao: e.ultimaCalibracao ?? '', intervaloCalibracao: e.intervaloCalibracao ?? 12,
        status: e.status ?? 'ativo', foto: e.foto ?? '', obs: e.obs ?? '',
      })
    }).catch(() => {})
  }, [])
  const [scanning, setScanning] = useState(false)
  const [scanMsg,  setScanMsg]  = useState('')
  const certRef = useRef<HTMLInputElement>(null)
  const fotoRef = useRef<HTMLInputElement>(null)

  async function escanearCertificado(file: File) {
    const api = (window as any).electronAPI
    if (!api?.extractPdfPage1) { setScanMsg('Disponível apenas no app desktop.'); return }
    setScanning(true); setScanMsg('')
    try {
      const base64 = await fileToBase64(file)
      const res = await api.extractPdfPage1(base64)
      if (!res?.ok || !res.text) { setScanMsg('Não foi possível ler a 1ª página do certificado.'); return }
      const d = parsearDadosPadrao(res.text)
      setForm(prev => ({
        ...prev,
        tag:               d.tag || prev.tag,
        nome:              d.nome || prev.nome,
        fabricante:        d.fabricante || prev.fabricante,
        modelo:            d.modelo || prev.modelo,
        serie:             d.serie || prev.serie,
        labCalibracao:     d.labCalibracao || prev.labCalibracao,
        numeroCertificado: d.numeroCertificado || prev.numeroCertificado,
        procedimentos:     d.procedimentos?.length ? d.procedimentos.join(', ') : prev.procedimentos,
        ultimaCalibracao:  d.ultimaCalibracao || prev.ultimaCalibracao,
      }))
      const campos = [d.nome && 'nome', d.fabricante && 'fabricante', d.modelo && 'modelo', d.serie && 'série', d.tag && 'tag', d.procedimentos?.length && 'procedimento(s)', d.ultimaCalibracao && 'última calib.'].filter(Boolean)
      setScanMsg(campos.length
        ? `✓ Preenchido: ${campos.join(', ')}. Confira os dados e selecione grupo/subgrupo.`
        : 'Nenhum campo reconhecido — preencha manualmente.')
    } catch (e: any) {
      setScanMsg('Erro ao ler certificado: ' + e.message)
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    fetch('/api/grupos').then(r => r.json()).then((g: Grupo[]) => {
      setGrupos(Array.isArray(g) ? g : [])
    }).catch(() => {})
  }, [])

  const subgrupos: Subgrupo[] = form.grupoId
    ? (grupos.find(g => g.id === form.grupoId)?.subgrupos ?? [])
    : []

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleGrupoChange(grupoId: GrupoId | '') {
    setForm(prev => ({ ...prev, grupoId, subgrupoId: '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (!form.tag.trim())        { setErro('Tag é obrigatória.'); return }
    if (!form.nome.trim())       { setErro('Nome é obrigatório.'); return }
    if (!form.grupoId)           { setErro('Selecione o grupo.'); return }
    if (!form.subgrupoId)        { setErro('Selecione o subgrupo.'); return }

    const proximaCalibracao = form.ultimaCalibracao
      ? addMonths(form.ultimaCalibracao, form.intervaloCalibracao)
      : ''

    const payload = {
      tag:                form.tag.trim().toUpperCase(),
      nome:               form.nome.trim(),
      grupoId:            form.grupoId as GrupoId,
      subgrupoId:         form.subgrupoId as SubgrupoId,
      status:             form.status,
      foto:               form.foto || undefined,
      grandezas:          [],
      ultimaCalibracao:   form.ultimaCalibracao,
      proximaCalibracao,
      intervaloCalibracao: form.intervaloCalibracao,
      fabricante:         form.fabricante.trim() || undefined,
      modelo:             form.modelo.trim()     || undefined,
      serie:              form.serie.trim()      || undefined,
      labCalibracao:      form.labCalibracao.trim() || undefined,
      numeroCertificado:  form.numeroCertificado.trim() || undefined,
      procedimentos:      (() => { const p = form.procedimentos.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean); return p.length ? p : undefined })(),
      obs:                form.obs.trim() || undefined,
    }

    setSaving(true)
    try {
      const res = await fetch(editId ? `/api/equipamentos/${editId}` : '/api/equipamentos', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErro(body.error ?? `Erro ${res.status}`)
      } else {
        router.push('/equipamentos')
      }
    } catch (err) {
      setErro(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} className="btn-ghost p-2">
            <ArrowLeft size={15} />
          </button>
          <div>
            <p className="page-eyebrow">Laboratório · EMC</p>
            <h1 className="page-title">{editId ? 'Editar Equipamento' : 'Novo Equipamento'}</h1>
            <p className="page-sub">{editId ? 'Altere os dados do instrumento' : 'Preencha os dados do instrumento'}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Escanear certificado (1ª página → dados do padrão) */}
        <div className="card p-4 mb-5 border border-teal/15" style={{ background: 'rgba(34,211,200,0.04)' }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <p className="text-[12px] text-teal/90 font-semibold flex items-center gap-1.5">
                <ScanText size={13} /> Preencher pelo certificado
              </p>
              <p className="text-[10px] text-white/35 mt-0.5">
                Selecione o PDF do certificado — leio a <b>1ª página</b> e preencho Nome, Fabricante, Modelo, Série, TAG e a calibração.
              </p>
            </div>
            <input ref={certRef} type="file" accept="application/pdf,.pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) escanearCertificado(f); e.target.value = '' }} />
            <button type="button" onClick={() => certRef.current?.click()} disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-teal/30 text-teal text-sm hover:bg-teal/10 transition-all disabled:opacity-50">
              {scanning ? <Loader2 size={13} className="animate-spin" /> : <ScanText size={13} />}
              {scanning ? 'Lendo…' : 'Escanear certificado'}
            </button>
          </div>
          {scanMsg && <p className="text-[11px] text-white/55 mt-2">{scanMsg}</p>}
        </div>

        {/* Identificação */}
        <div className="card p-5 mb-5">
          <p className="form-section mb-4">Identificação</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Tag *
              </label>
              <input
                className="input"
                placeholder="ex: 1528EMC"
                value={form.tag}
                onChange={e => set('tag', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Nome *
              </label>
              <input
                className="input"
                placeholder="Nome do equipamento"
                value={form.nome}
                onChange={e => set('nome', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Grupo *
              </label>
              <select
                className="input"
                value={form.grupoId}
                onChange={e => handleGrupoChange(e.target.value as GrupoId | '')}
              >
                <option value="">Selecione o grupo…</option>
                {grupos.map(g => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Subgrupo *
              </label>
              <select
                className="input"
                value={form.subgrupoId}
                onChange={e => set('subgrupoId', e.target.value as SubgrupoId | '')}
                disabled={subgrupos.length === 0}
              >
                <option value="">
                  {form.grupoId ? 'Selecione o subgrupo…' : 'Selecione o grupo primeiro'}
                </option>
                {subgrupos.map(s => (
                  <option key={s.id} value={s.id}>{s.numero} — {s.nome}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Dados gerais: status + foto */}
        <div className="card p-5 mb-5">
          <p className="form-section mb-4">Dados gerais</p>
          <div className="grid grid-cols-[1fr_auto] gap-6 items-start">
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value as StatusEquipamento)}>
                {STATUS_EQUIP.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <p className="text-[10px] text-white/30 mt-2">
                Use os marcadores para sinalizar “fora de uso”, “não requer calibração” ou “calibrar antes do uso”.
              </p>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 self-start">Foto</label>
              <input ref={fotoRef} type="file" accept="image/*" className="hidden"
                onChange={async e => { const f = e.target.files?.[0]; if (f) { try { set('foto', await resizeImg(f)) } catch {} } e.target.value = '' }} />
              {form.foto ? (
                <div className="relative">
                  <img src={form.foto} alt="Equipamento" className="w-44 h-44 object-contain rounded-xl border border-white/10 bg-black/20" />
                  <button type="button" onClick={() => set('foto', '')}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:bg-red-600">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fotoRef.current?.click()}
                  className="w-44 h-44 rounded-xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-2 text-white/35 hover:text-teal hover:border-teal/30 transition-all">
                  <ImageIcon size={26} />
                  <span className="text-[11px]">Adicionar foto</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Fabricante / Modelo */}
        <div className="card p-5 mb-5">
          <p className="form-section mb-4">Dados do fabricante</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Fabricante
              </label>
              <input
                className="input"
                placeholder="ex: Rohde &amp; Schwarz"
                value={form.fabricante}
                onChange={e => set('fabricante', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Modelo
              </label>
              <input
                className="input"
                placeholder="ex: FSH4"
                value={form.modelo}
                onChange={e => set('modelo', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Nº de série
              </label>
              <input
                className="input"
                placeholder="Número de série"
                value={form.serie}
                onChange={e => set('serie', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Calibração */}
        <div className="card p-5 mb-5">
          <p className="form-section mb-4">Calibração</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Lab. de calibração
              </label>
              <input
                className="input"
                placeholder="Nome do laboratório"
                value={form.labCalibracao}
                onChange={e => set('labCalibracao', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Nº do certificado
              </label>
              <input
                className="input"
                placeholder="Número do certificado"
                value={form.numeroCertificado}
                onChange={e => set('numeroCertificado', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Procedimentos (IT/PC)
              </label>
              <input
                className="input font-mono"
                placeholder="ex: PC R04, PC E02 — casa com a IT/PC na checagem"
                value={form.procedimentos}
                onChange={e => set('procedimentos', e.target.value)}
              />
              <p className="text-[10px] text-white/30 mt-1">Códigos do certificado, separados por vírgula. Usados na checagem para sugerir a IT/PC correspondente.</p>
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Última calibração
              </label>
              <input
                type="date"
                className="input"
                value={form.ultimaCalibracao}
                onChange={e => set('ultimaCalibracao', e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono tracking-[2px] uppercase text-white/40 block mb-1">
                Intervalo (meses)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                className="input"
                value={form.intervaloCalibracao}
                onChange={e => set('intervaloCalibracao', Number(e.target.value))}
              />
            </div>
          </div>
          {form.ultimaCalibracao && (
            <p className="mt-3 text-[11px] text-white/35 font-mono">
              Próxima calibração calculada:{' '}
              <span style={{ color: 'var(--accent,#E8B94B)' }}>
                {addMonths(form.ultimaCalibracao, form.intervaloCalibracao)}
              </span>
            </p>
          )}
        </div>

        {/* Observações */}
        <div className="card p-5 mb-6">
          <p className="form-section mb-4">Observações</p>
          <textarea
            className="input"
            rows={3}
            placeholder="Informações adicionais, restrições, histórico…"
            value={form.obs}
            onChange={e => set('obs', e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Erro */}
        {erro && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm"
               style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#F87171' }}>
            {erro}
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            <Save size={13} />
            {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Salvar equipamento'}
          </button>
        </div>
      </form>
    </div>
  )
}
