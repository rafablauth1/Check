import type {
  Condicao, Pergunta, Respostas, TemplateEnsaio, EnsaioCatalogo, EnsaioDaAmostra, AgendaItemEmc,
} from '@/lib/emc/tipos'

// Avaliação dos templates de ensaio — funções puras, usadas pelo cadastro da
// amostra (cliente) e pela prévia do editor de templates.

export function respondida(p: Pergunta, respostas: Respostas): boolean {
  const r = respostas[p.id]
  return Array.isArray(r) ? r.length > 0 : !!r
}

export function avaliarCondicao(c: Condicao, respostas: Respostas): boolean {
  const r = respostas[c.perguntaId]
  if (r === undefined || r === '' || (Array.isArray(r) && r.length === 0)) return false
  const lista = Array.isArray(r) ? r : [r]
  switch (c.operador) {
    case 'eh':        return !Array.isArray(r) && r === c.valor
    case 'naoEh':     return !Array.isArray(r) && r !== c.valor
    case 'inclui':    return lista.includes(c.valor)
    case 'naoInclui': return !lista.includes(c.valor)
  }
  return false
}

export function todasValem(conds: Condicao[] | undefined, respostas: Respostas): boolean {
  return (conds ?? []).every(c => avaliarCondicao(c, respostas))
}

/** Perguntas que aparecem no cadastro com as respostas atuais. */
export function perguntasVisiveis(t: TemplateEnsaio, respostas: Respostas): Pergunta[] {
  return t.perguntas.filter(p => todasValem(p.mostrarQuando, respostas))
}

/** Perguntas visíveis ainda sem resposta (o cadastro não salva com pendência). */
export function perguntasPendentes(t: TemplateEnsaio, respostas: Respostas): Pergunta[] {
  return perguntasVisiveis(t, respostas).filter(p => !respondida(p, respostas))
}

/** Respostas de perguntas que ficaram ocultas não contam (ex.: "ar livre" de um radar que deixou de ser fixo). */
export function respostasEfetivas(t: TemplateEnsaio, respostas: Respostas): Respostas {
  const visiveis = new Set(perguntasVisiveis(t, respostas).map(p => p.id))
  return Object.fromEntries(Object.entries(respostas).filter(([k]) => visiveis.has(k)))
}

/** Ids dos ensaios que o template define para estas respostas, na ordem das regras, sem repetição. */
export function ensaiosDoTemplate(t: TemplateEnsaio, respostas: Respostas): string[] {
  const r = respostasEfetivas(t, respostas)
  const ids: string[] = []
  for (const regra of t.regras) {
    if (!ids.includes(regra.ensaioId) && todasValem(regra.quando, r)) ids.push(regra.ensaioId)
  }
  return ids
}

/** Ensaios marcados para medição por relógio (pergunta simnao com marcaRelogio respondida 'sim'). */
export function ensaiosComRelogio(t: TemplateEnsaio, respostas: Respostas): Set<string> {
  const r = respostasEfetivas(t, respostas)
  const set = new Set<string>()
  for (const p of t.perguntas) {
    if (p.tipo === 'simnao' && r[p.id] === 'sim') p.marcaRelogio?.forEach(id => set.add(id))
  }
  return set
}

/** Etiquetas do item na agenda (ex.: "Reativa", "Relógio", "Fixo", "CA"). */
export function etiquetas(t: TemplateEnsaio, respostas: Respostas): string[] {
  const r = respostasEfetivas(t, respostas)
  const out: string[] = []
  for (const p of t.perguntas) {
    if (!p.mostrarEtiqueta) continue
    const v = r[p.id]
    if (p.tipo === 'simnao') { if (v === 'sim') out.push(p.etiqueta || p.texto) }
    else if (Array.isArray(v)) out.push(...(p.etiqueta ? [p.etiqueta + ': ' + v.join('/')] : v))
    else if (v) out.push(p.etiqueta ? `${p.etiqueta}: ${v}` : v)
  }
  return out
}

/* Monta a lista final de ensaios da amostra, preservando o status dos ensaios
   que já existiam (editar respostas ou reaplicar o template não "zera" o que
   já foi realizado/reprovado). */
export function montarEnsaios(
  item: Pick<AgendaItemEmc, 'template' | 'respostas' | 'modoEnsaios' | 'ensaiosEscolhidos' | 'ensaios'>,
  catalogo: EnsaioCatalogo[],
): EnsaioDaAmostra[] {
  const doTemplate = ensaiosDoTemplate(item.template, item.respostas)
  const ids = item.modoEnsaios === 'parcial' ? (item.ensaiosEscolhidos ?? doTemplate) : doTemplate
  const relogio = ensaiosComRelogio(item.template, item.respostas)
  const anteriores = new Map((item.ensaios ?? []).map(e => [e.ensaioId, e]))
  return ids.map(id => {
    const cat = catalogo.find(c => c.id === id)
    const antes = anteriores.get(id)
    return {
      ensaioId: id,
      codigo: cat?.codigo ?? antes?.codigo ?? id,
      nome: cat?.nome ?? antes?.nome ?? id,
      status: antes?.status ?? 'pendente',
      ...(relogio.has(id) ? { relogio: true } : {}),
      // de onde veio o status (sincronização com o Radian / mexido à mão)
      ...(antes?.fonte ? { fonte: antes.fonte } : {}),
      ...(antes?.realizadoEm ? { realizadoEm: antes.realizadoEm } : {}),
      ...(antes?.manual ? { manual: true } : {}),
    }
  })
}

export function proximoStatus(s: EnsaioDaAmostra['status']): EnsaioDaAmostra['status'] {
  return s === 'pendente' ? 'realizado' : s === 'realizado' ? 'reprovado' : 'pendente'
}
