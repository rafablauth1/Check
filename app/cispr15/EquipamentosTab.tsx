'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, Check, X, Wifi, WifiOff, Lightbulb, Lamp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type EquipamentoSalvo, EQUIPAMENTOS_KEY } from './types'

function emptyEquip(): EquipamentoSalvo {
  return {
    id: Date.now().toString(),
    tipo: 'lampada',
    produto: '', fabricante: '', modelo: '',
    potencia: '', tensaoAlim: '', frequencia: '50/60Hz',
    observacoes: '',
  }
}

function Field({ label, value, onChange, placeholder, span2 }: {
  label: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; span2?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', span2 && 'col-span-2')}>
      <label className="text-[10px] text-white/35 uppercase tracking-widest font-mono">{label}</label>
      <input className="input text-sm" value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  )
}

export function EquipamentosTab({ onUpdate }: { onUpdate?: (list: EquipamentoSalvo[]) => void }) {
  const [equipamentos, setEquipamentos] = useState<EquipamentoSalvo[]>([])
  const [fromNetwork,  setFromNetwork]  = useState(false)
  const [editando,     setEditando]     = useState<string | null>(null)
  const [adding,       setAdding]       = useState(false)
  const [draft,        setDraft]        = useState<EquipamentoSalvo>(emptyEquip())
  const [busca,        setBusca]        = useState('')
  const isElectron = useRef(false)

  useEffect(() => {
    async function load() {
      const api = (window as any).electronAPI
      if (api) {
        isElectron.current = true
        try {
          const res = await api.getEquipamentos()
          if (res.ok && Array.isArray(res.equipamentos)) {
            setEquipamentos(res.equipamentos)
            setFromNetwork(res.fromNetwork ?? false)
            return
          }
        } catch {}
      }
      try {
        const raw = localStorage.getItem(EQUIPAMENTOS_KEY)
        if (raw) setEquipamentos(JSON.parse(raw))
      } catch {}
    }
    load()
  }, [])

  async function persist(list: EquipamentoSalvo[]) {
    setEquipamentos(list)
    onUpdate?.(list)
    localStorage.setItem(EQUIPAMENTOS_KEY, JSON.stringify(list))
    const api = (window as any).electronAPI
    if (api) {
      try { await api.saveEquipamentos(list) } catch {}
    }
  }

  function startAdd()           { setDraft(emptyEquip()); setAdding(true); setEditando(null) }
  function startEdit(e: EquipamentoSalvo) { setDraft({ ...e }); setEditando(e.id); setAdding(false) }
  function cancelForm()         { setAdding(false); setEditando(null) }

  async function confirmSave() {
    if (!draft.produto.trim()) return
    if (adding) {
      await persist([...equipamentos, { ...draft, id: Date.now().toString() }])
    } else if (editando) {
      await persist(equipamentos.map(e => e.id === editando ? draft : e))
    }
    cancelForm()
  }

  async function remove(id: string) {
    if (!confirm('Remover este equipamento do catálogo?')) return
    await persist(equipamentos.filter(e => e.id !== id))
    if (editando === id) cancelForm()
  }

  const sd = (k: keyof EquipamentoSalvo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(prev => ({ ...prev, [k]: e.target.value }))

  const filtrados = busca.trim()
    ? equipamentos.filter(e =>
        e.produto?.toLowerCase().includes(busca.toLowerCase()) ||
        e.fabricante?.toLowerCase().includes(busca.toLowerCase()) ||
        e.modelo?.toLowerCase().includes(busca.toLowerCase())
      )
    : equipamentos

  return (
    <div className="space-y-4">

      <div className={cn(
        'flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded-lg w-fit',
        fromNetwork
          ? 'text-teal/70 bg-teal/6 border border-teal/15'
          : 'text-white/25 bg-white/3 border border-white/8'
      )}>
        {fromNetwork ? <Wifi size={10} /> : <WifiOff size={10} />}
        {fromNetwork ? 'Dados da rede compartilhada' : 'Dados locais (configure a pasta de rede em Configurações)'}
      </div>

      <div className="flex items-center gap-3">
        <input
          className="input text-sm flex-1"
          placeholder="Buscar por produto, fabricante ou modelo…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <button type="button" onClick={startAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gold/10 border border-gold/20 text-gold text-xs font-semibold hover:bg-gold/20 transition-all shrink-0">
          <Plus size={12} /> Novo
        </button>
      </div>

      {(adding || editando !== null) && (
        <div className="card p-4 space-y-3 border-gold/20 bg-gold/2">
          <p className="text-[10px] font-mono text-gold/60 uppercase tracking-wider">
            {adding ? 'Novo equipamento' : 'Editar equipamento'}
          </p>

          {/* Tipo */}
          <div className="flex gap-2">
            {(['lampada', 'luminaria'] as const).map(t => (
              <button key={t} type="button"
                onClick={() => setDraft(p => ({ ...p, tipo: t }))}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                  draft.tipo === t
                    ? 'bg-teal/15 border-teal/30 text-teal'
                    : 'border-white/10 text-white/30 hover:border-white/20'
                )}>
                {t === 'lampada' ? <Lightbulb size={11} /> : <Lamp size={11} />}
                {t === 'lampada' ? 'Lâmpada' : 'Luminária'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Produto / Descrição" value={draft.produto} onChange={sd('produto')}
              placeholder="Ex: Lâmpada LED Bulbo 9W" span2 />
            <Field label="Fabricante" value={draft.fabricante} onChange={sd('fabricante')}
              placeholder="Labelo" />
            <Field label="Modelo" value={draft.modelo} onChange={sd('modelo')}
              placeholder="Ex: CorePro LEDbulb" />
            <Field label="Potência" value={draft.potencia} onChange={sd('potencia')}
              placeholder="Ex: 9 W" />
            <Field label="Tensão de Alimentação" value={draft.tensaoAlim} onChange={sd('tensaoAlim')}
              placeholder="Ex: 127 V / 220 V" />
            <Field label="Frequência" value={draft.frequencia} onChange={sd('frequencia')}
              placeholder="Ex: 50/60 Hz" />
            <Field label="Observações" value={draft.observacoes ?? ''} onChange={sd('observacoes')}
              placeholder="Opcional" span2 />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={confirmSave} disabled={!draft.produto.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green/10 border border-green/20 text-green-400 text-xs font-semibold hover:bg-green/20 disabled:opacity-30 transition-all">
              <Check size={12} /> Salvar
            </button>
            <button type="button" onClick={cancelForm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/40 text-xs hover:border-white/20 transition-all">
              <X size={12} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {filtrados.length === 0 ? (
        <div className="text-center py-12 text-white/20 text-sm">
          {busca ? 'Nenhum equipamento encontrado.' : 'Nenhum equipamento salvo ainda. Adicione lâmpadas e luminárias ao catálogo para preencher formulários rapidamente.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(e => (
            <div key={e.id}
              className={cn(
                'card px-4 py-3 flex items-start gap-4 transition-opacity',
                editando === e.id && 'opacity-30 pointer-events-none'
              )}>
              <div className="mt-0.5 text-white/20 shrink-0">
                {e.tipo === 'lampada' ? <Lightbulb size={14} /> : <Lamp size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{e.produto}</p>
                {(e.fabricante || e.modelo) && (
                  <p className="text-[11px] text-white/40 mt-0.5 truncate">
                    {[e.fabricante, e.modelo].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="flex gap-3 mt-1 flex-wrap">
                  {e.potencia    && <span className="text-[10px] font-mono text-white/30">{e.potencia}</span>}
                  {e.tensaoAlim  && <span className="text-[10px] font-mono text-white/30">{e.tensaoAlim}</span>}
                  {e.frequencia  && <span className="text-[10px] font-mono text-white/30">{e.frequencia}</span>}
                </div>
                {e.observacoes && (
                  <p className="text-[10px] text-white/25 mt-0.5 truncate">{e.observacoes}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                <button type="button" onClick={() => startEdit(e)}
                  className="w-7 h-7 rounded-lg border border-white/10 text-white/30 hover:text-gold hover:border-gold/30 flex items-center justify-center transition-all">
                  <Pencil size={11} />
                </button>
                <button type="button" onClick={() => remove(e.id)}
                  className="w-7 h-7 rounded-lg border border-white/10 text-white/30 hover:text-red-400 hover:border-red/30 flex items-center justify-center transition-all">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
