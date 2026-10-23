'use client'

import { useMemo, useState } from 'react'
import { X, CheckCircle2, Lock, AlertTriangle, RotateCcw, Clock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { today, type ClienteDB } from '@/app/cispr15/types'
import { Icone } from '@/lib/taxonomia/icones'
import { ClientePicker } from '@/app/agenda/ClientePicker'
import type { AgendaItemEmc, ConfigEnsaiosEmc, Pergunta, Respostas, TemplateEnsaio } from '@/lib/emc/tipos'
import {
  perguntasVisiveis, perguntasPendentes, ensaiosDoTemplate, montarEnsaios, respostasEfetivas, etiquetas,
} from '@/lib/emc/regras'
import { Label, BadgeEnsaio, ChipEtiqueta, somarSemanas } from '@/app/agenda/emc/comum'

const copiar = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

export function novoItemEmc(): AgendaItemEmc {
  return {
    id: crypto.randomUUID(),
    templateId: '', template: { id: '', nome: '', icone: '', portaria: '', perguntas: [], regras: [] },
    respostas: {}, modoEnsaios: 'completo', ensaios: [],
    protocolo: '', orcamento: '', cliente: '', produto: '',
    dataEntrada: today(), previsaoSaida: '',
    responsavel: '', numRelatorio: '', dataEmissao: '', observacoes: '',
    amostraLacrada: '',
  }
}

/* ─── pergunta do template (sim/não, escolha única, múltipla) ──────────────── */
function CampoPergunta({ p, valor, onChange }: {
  p: Pergunta; valor: string | string[] | undefined; onChange: (v: string | string[]) => void
}) {
  const btn = (ativo: boolean) => cn(
    'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
    ativo ? 'border-teal/40 bg-teal/10 text-teal' : 'border-white/10 text-white/40 hover:border-white/25',
  )
  const opcoes = p.tipo === 'simnao' ? [['sim', 'Sim'], ['nao', 'Não']] : (p.opcoes ?? []).map(o => [o, o])
  const lista = Array.isArray(valor) ? valor : []
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{p.texto}{p.tipo === 'multipla' && <span className="normal-case text-white/20"> (uma ou mais)</span>}</Label>
      <div className="flex gap-1.5 flex-wrap">
        {opcoes.map(([v, rotulo]) => p.tipo === 'multipla' ? (
          <button key={v} type="button" className={btn(lista.includes(v))}
            onClick={() => onChange(lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v])}>{rotulo}</button>
        ) : (
          <button key={v} type="button" className={btn(valor === v)} onClick={() => onChange(v)}>{rotulo}</button>
        ))}
      </div>
    </div>
  )
}

export function ItemModalEmc({ item, isNew, config, clientes, onSave, onClose }: {
  item: AgendaItemEmc
  isNew: boolean
  config: ConfigEnsaiosEmc
  clientes: ClienteDB[]
  onSave: (i: AgendaItemEmc) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<AgendaItemEmc>(copiar(item))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const s = (k: keyof AgendaItemEmc) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  // Cadeia de custódia: campo já registrado (preenchido e salvo) não muda mais.
  const isLocked = (k: keyof AgendaItemEmc) => !isNew && String(item[k] ?? '').trim() !== ''
  function campoTravavel(k: keyof AgendaItemEmc, type: 'text' | 'date', placeholder?: string) {
    if (isLocked(k)) {
      return (
        <div className="relative">
          <input type={type} className="input pr-7 cursor-not-allowed text-white/70"
            value={(form[k] as string) ?? ''} readOnly tabIndex={-1} title="Registrado — não pode ser alterado" />
          <Lock size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30" />
        </div>
      )
    }
    return <input type={type} className="input" value={(form[k] as string) ?? ''} onChange={s(k)} placeholder={placeholder} />
  }

  const temTemplate = !!form.templateId
  const templateAtual = config.templates.find(t => t.id === form.templateId)
  const templateMudou = !isNew && !!templateAtual && JSON.stringify(templateAtual) !== JSON.stringify(form.template)

  function escolherTemplate(t: TemplateEnsaio) {
    setForm(p => ({ ...p, templateId: t.id, template: copiar(t), respostas: {}, modoEnsaios: 'completo', ensaiosEscolhidos: undefined }))
  }

  function responder(id: string, v: string | string[]) {
    setForm(p => ({ ...p, respostas: { ...p.respostas, [id]: v } }))
  }

  const visiveis = useMemo(() => perguntasVisiveis(form.template, form.respostas), [form.template, form.respostas])
  const pendentes = useMemo(() => perguntasPendentes(form.template, form.respostas), [form.template, form.respostas])
  const doTemplate = useMemo(() => ensaiosDoTemplate(form.template, form.respostas), [form.template, form.respostas])
  const ensaiosFinais = useMemo(() => montarEnsaios(form, config.catalogo), [form, config.catalogo])
  const tags = useMemo(() => etiquetas(form.template, form.respostas), [form.template, form.respostas])

  function trocarModo(modo: 'completo' | 'parcial') {
    setForm(p => ({ ...p, modoEnsaios: modo, ensaiosEscolhidos: modo === 'parcial' ? (p.ensaiosEscolhidos ?? doTemplate) : undefined }))
  }
  function alternarEscolhido(id: string) {
    setForm(p => {
      const atual = p.ensaiosEscolhidos ?? doTemplate
      const prox = atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id]
      // mantém a ordem do catálogo
      return { ...p, ensaiosEscolhidos: config.catalogo.map(c => c.id).filter(x => prox.includes(x)) }
    })
  }

  async function salvar() {
    setErro(null)
    if (!temTemplate) { setErro('Escolha o tipo de equipamento.'); return }
    if (pendentes.length) { setErro(`Responda: ${pendentes.map(p => p.texto).join(', ')}`); return }
    if (ensaiosFinais.length === 0) { setErro('Nenhum ensaio para esta amostra — revise o template ou marque em "Parcial".'); return }
    if (form.previsaoSaida && form.previsaoSaida < form.dataEntrada) { setErro('Previsão de saída anterior à data de entrada.'); return }
    const final: AgendaItemEmc = {
      ...form,
      respostas: respostasEfetivas(form.template, form.respostas) as Respostas,
      ensaios: ensaiosFinais,
      // nº informado pela 1ª vez → data de emissão de hoje (usada nos indicadores)
      dataEmissao: form.numRelatorio.trim() && !form.dataEmissao ? today() : form.dataEmissao,
    }
    setSalvando(true)
    try { await onSave(final) } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
    finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-fade-in">

        <div className="flex items-center justify-between">
          <p className="text-white font-bold text-sm">{isNew ? 'Novo item EMC' : 'Editar item EMC'}</p>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors"><X size={16} /></button>
        </div>

        {/* Tipo de equipamento */}
        <div className="space-y-2">
          <Label>Tipo de equipamento</Label>
          {isNew ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {config.templates.map(t => (
                <button key={t.id} type="button" onClick={() => escolherTemplate(t)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all',
                    form.templateId === t.id ? 'border-teal/40 bg-teal/8 text-teal' : 'border-white/8 text-white/50 hover:border-white/20',
                  )}>
                  <Icone name={t.icone} size={16} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold truncate">{t.nome}</span>
                    <span className="block text-[9px] text-white/30 truncate">{t.portaria}</span>
                  </span>
                </button>
              ))}
              {config.templates.length === 0 && (
                <p className="col-span-full text-[11px] text-white/30">Nenhum template cadastrado — crie em <strong>Templates de ensaio</strong>.</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/8 bg-white/[0.015]">
              <Icone name={form.template.icone} size={16} className="text-teal shrink-0" />
              <span className="text-xs font-semibold text-white/80">{form.template.nome}</span>
              <span className="text-[10px] text-white/30">{form.template.portaria}</span>
              {templateMudou && (
                <button type="button" onClick={() => templateAtual && setForm(p => ({ ...p, template: copiar(templateAtual) }))}
                  title="O template foi alterado depois do cadastro. Reaplicar recalcula os ensaios desta amostra (os status já marcados são mantidos)."
                  className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-400/30 bg-amber-400/8 text-amber-300 text-[10px] font-semibold hover:bg-amber-400/15">
                  <RefreshCw size={10} /> Reaplicar template atual
                </button>
              )}
            </div>
          )}
          {form.template.observacao && <p className="text-[10px] text-white/25">{form.template.observacao}</p>}
        </div>

        {/* Perguntas + ensaios */}
        {temTemplate && (
          <div className="p-3 rounded-xl border border-white/6 bg-white/[0.015] space-y-3">
            {visiveis.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {visiveis.map(p => (
                  <CampoPergunta key={p.id} p={p} valor={form.respostas[p.id]} onChange={v => responder(p.id, v)} />
                ))}
              </div>
            )}
            <div className="space-y-2 pt-1 border-t border-white/5">
              <div className="flex items-center gap-2">
                <Label>Ensaios</Label>
                <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/4 border border-white/8 ml-auto">
                  {(['completo', 'parcial'] as const).map(m => (
                    <button key={m} type="button" onClick={() => trocarModo(m)}
                      className={cn('px-2.5 py-1 rounded text-[10px] font-semibold transition-all',
                        form.modoEnsaios === m ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60')}>
                      {m === 'completo' ? 'Completo (template)' : 'Parcial — escolher'}
                    </button>
                  ))}
                </div>
              </div>
              {form.modoEnsaios === 'completo' ? (
                <div className="flex gap-1 flex-wrap">
                  {ensaiosFinais.map(e => <BadgeEnsaio key={e.ensaioId} e={e} />)}
                  {pendentes.length > 0 && <span className="text-[10px] text-white/30">Responda as perguntas para ver todos os ensaios.</span>}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {config.catalogo.map(c => {
                    const marcado = (form.ensaiosEscolhidos ?? doTemplate).includes(c.id)
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-[11px] text-white/60 cursor-pointer select-none">
                        <input type="checkbox" className="accent-teal w-3.5 h-3.5" checked={marcado} onChange={() => alternarEscolhido(c.id)} />
                        <span className="font-mono font-bold text-white/80 w-9">{c.codigo}</span>
                        <span className="truncate">{c.nome}</span>
                        {doTemplate.includes(c.id) && <span className="text-[8px] text-teal/60 font-mono">template</span>}
                      </label>
                    )
                  })}
                </div>
              )}
              {tags.length > 0 && <div className="flex gap-1 flex-wrap">{tags.map(t => <ChipEtiqueta key={t} texto={t} />)}</div>}
              {ensaiosFinais.some(e => e.relogio) && (
                <p className="text-[10px] text-white/30 flex items-center gap-1">
                  <Clock size={9} /> Modo relógio: medição por pulso (início e fim do ensaio) nos ensaios marcados.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Protocolo / datas */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Protocolo LABELO</Label>
            <input className="input" value={form.protocolo} onChange={s('protocolo')} placeholder="Protocolo" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Orçamento LABELO</Label>
            <input className="input" value={form.orcamento} onChange={s('orcamento')} placeholder="Ex: 0887" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Data de Entrada {isLocked('dataEntrada') && <span className="normal-case text-white/20">(registrada)</span>}</Label>
            {campoTravavel('dataEntrada', 'date')}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Previsão de Saída <span className="normal-case text-white/20">(manual)</span></Label>
            <div className="flex gap-1.5">
              <input type="date" className={cn('input flex-1', form.previsaoSaida && form.previsaoSaida < form.dataEntrada && 'border-red-500/50')}
                value={form.previsaoSaida} onChange={s('previsaoSaida')} />
              {form.previsaoSaida && (
                <button type="button" title="Limpar (sem prazo)" onClick={() => setForm(p => ({ ...p, previsaoSaida: '' }))}
                  className="w-8 shrink-0 rounded-lg border border-white/10 text-white/30 hover:text-white/70 flex items-center justify-center">
                  <RotateCcw size={11} />
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(n => (
                <button key={n} type="button" onClick={() => setForm(p => ({ ...p, previsaoSaida: somarSemanas(p.dataEntrada, n) }))}
                  className="px-2 py-0.5 rounded border border-white/10 text-[10px] text-white/40 hover:text-teal hover:border-teal/30 font-mono">
                  +{n} sem
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Responsável</Label>
            <input className="input" value={form.responsavel} onChange={s('responsavel')} placeholder="Nome" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>N° Relatório <span className="normal-case text-white/20">(quando emitido)</span></Label>
            <input className="input" value={form.numRelatorio} onChange={s('numRelatorio')} placeholder="Ex: EMC 1244/2026" />
          </div>
        </div>

        {/* Cliente */}
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Dados do Cliente</p>
          <ClientePicker clientes={clientes} onSelect={c => setForm(p => ({
            ...p, cliente: c.nome, clienteRua: c.rua, clienteCidade: c.cidade, clienteCep: c.cep,
          }))} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label>Nome</Label>
              <input className="input" value={form.cliente} onChange={s('cliente')} placeholder="Nome do cliente" />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label>Endereço <span className="normal-case text-white/20">(opcional)</span></Label>
              <input className="input" value={form.clienteRua ?? ''} onChange={s('clienteRua')} placeholder="Rua, número" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cidade <span className="normal-case text-white/20">(opcional)</span></Label>
              <input className="input" value={form.clienteCidade ?? ''} onChange={s('clienteCidade')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>CEP <span className="normal-case text-white/20">(opcional)</span></Label>
              <input className="input" value={form.clienteCep ?? ''} onChange={s('clienteCep')} placeholder="00000-000" />
            </div>
          </div>
        </div>

        {/* Amostra */}
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Amostra / ESE</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label>Produto / Descrição</Label>
              <input className="input" value={form.produto} onChange={s('produto')} placeholder="Ex: Medidor eletrônico monofásico" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Fabricante</Label>
              <input className="input" value={form.fabricante ?? ''} onChange={s('fabricante')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Modelo</Label>
              <input className="input" value={form.modelo ?? ''} onChange={s('modelo')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>N° de Série</Label>
              <input className="input" value={form.numeroSerie ?? ''} onChange={s('numeroSerie')} />
            </div>
          </div>
        </div>

        {/* Cadeia de custódia (Recebimento ⇄ EMC) */}
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Cadeia de Custódia da Amostra</p>
          <div className="p-3 rounded-xl border border-white/6 bg-white/[0.015] space-y-2">
            <p className="text-[9px] text-teal/60 font-mono uppercase tracking-wider">Recebimento da amostra · Recebimento → EMC</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Entregou <span className="normal-case text-white/20">(Recebimento)</span></Label>
                {campoTravavel('entreguePorRecebimento', 'text', 'Funcionário do Recebimento')}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Recebeu <span className="normal-case text-white/20">(EMC)</span></Label>
                {campoTravavel('recebidoPorEmc', 'text', 'Funcionário EMC')}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Amostra lacrada?</Label>
                {isLocked('amostraLacrada') ? (
                  <div className="flex items-center gap-1.5 text-xs text-white/70">
                    <Lock size={10} className="text-white/30" /> {form.amostraLacrada === 'sim' ? 'Sim' : 'Não'}
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    {(['sim', 'nao'] as const).map(v => (
                      <button key={v} type="button" onClick={() => setForm(p => ({ ...p, amostraLacrada: v }))}
                        className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                          form.amostraLacrada === v ? 'border-teal/40 bg-teal/10 text-teal' : 'border-white/10 text-white/40 hover:border-white/25')}>
                        {v === 'sim' ? 'Sim' : 'Não'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {form.amostraLacrada === 'sim' && (
                <div className="flex flex-col gap-1.5">
                  <Label>N° do lacre <span className="normal-case text-white/20">(opcional)</span></Label>
                  {campoTravavel('numeroLacre', 'text', 'Ex: 123456')}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="accent-teal w-3.5 h-3.5" checked={!!form.recebimentoEmcOk}
                onChange={e => setForm(p => ({ ...p, recebimentoEmcOk: e.target.checked }))} />
              <span className="text-[11px] text-white/60">Confirmo o recebimento da amostra (EMC)</span>
            </label>
          </div>

          {form.numRelatorio.trim() ? (
            <div className="p-3 rounded-xl border border-gold/15 bg-gold/3 space-y-2">
              <p className="text-[9px] text-gold/60 font-mono uppercase tracking-wider">Devolução após emissão · EMC → Recebimento</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 col-span-2">
                  <Label>Data da Devolução</Label>
                  {campoTravavel('dataDevolucao', 'date')}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Entregou <span className="normal-case text-white/20">(EMC)</span></Label>
                  {campoTravavel('devolvidoPorEmc', 'text', 'Funcionário EMC')}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Recebeu <span className="normal-case text-white/20">(Recebimento)</span></Label>
                  {campoTravavel('recebidoPorRecebimento', 'text', 'Funcionário do Recebimento')}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="accent-gold w-3.5 h-3.5" checked={!!form.devolucaoOk}
                  onChange={e => setForm(p => ({ ...p, devolucaoOk: e.target.checked }))} />
                <span className="text-[11px] text-white/60">Confirmo a devolução da amostra (Recebimento)</span>
              </label>
            </div>
          ) : (
            <p className="text-[10px] text-white/25 flex items-center gap-1.5 px-1">
              <Clock size={10} /> Os campos de devolução aparecem após informar o N° do Relatório.
            </p>
          )}
          <p className="text-[9px] text-white/25 flex items-center gap-1 px-1">
            <Lock size={8} /> Datas e nomes registrados ficam bloqueados e não podem ser alterados.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Observações</Label>
          <textarea className="input min-h-[60px] resize-none" value={form.observacoes} onChange={s('observacoes')} placeholder="Anotações livres..." />
        </div>

        {erro && (
          <p className="text-[11px] text-red-400 flex items-center gap-1.5"><AlertTriangle size={11} /> {erro}</p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-all">
            Cancelar
          </button>
          <button type="button" onClick={salvar} disabled={salvando}
            className="btn-primary px-6 py-2 text-sm font-bold flex items-center gap-2 disabled:opacity-50">
            <CheckCircle2 size={13} /> {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
