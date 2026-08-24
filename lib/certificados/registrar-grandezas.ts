import { lerJSON, escreverJSON } from '@/lib/dados'
import type { Certificado } from '@/lib/certificados/tipos'
import type { EquipamentoEMC } from '@/lib/equipamentos/tipos'
import type { GrandezaMetrologica } from '@/lib/metrologia/tipos'

const EQUIP_ARQ = 'equipamentos.json'

/* Calcula (sem IO) as grandezas presentes num certificado, com faixa e incerteza
   agregadas. Pura — usada tanto no salvamento individual quanto na importação em
   lote (que registra tudo em memória e grava o arquivo uma vez só). */
export function grandezasDoCertificado(cert: Certificado): GrandezaMetrologica[] {
  type Acc = { nome: string; unidade: string; vals: number[]; incs: number[] }
  const map = new Map<string, Acc>()
  const num = (v: unknown): number => {
    const n = parseFloat(String(v ?? '').replace(/[^\d.,+-]/g, '').replace(',', '.'))
    return isFinite(n) ? n : NaN
  }
  // Rejeita "grandezas" que na verdade são datas/campos administrativos do certificado.
  const ehGrandezaValida = (nome: string): boolean => {
    const x = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    if (x.length < 3) return false
    return !/^(data|emiss|emiti|validade|vencimento|respons|assinatura|protocolo|numero|n[º°]|local|cliente|endere|cnpj|equipamento|fabricante|modelo|tag|serie|recebi|realizada?|aprovad|pagina|certificad|periodo)/.test(x)
  }
  const add = (nome?: string, unidade?: string, val?: number, inc?: number) => {
    const n = (nome || '').trim()
    if (!n || !ehGrandezaValida(n)) return
    const key = n.toLowerCase()
    if (!map.has(key)) map.set(key, { nome: n, unidade: (unidade || '').trim(), vals: [], incs: [] })
    const a = map.get(key)!
    if (!a.unidade && unidade) a.unidade = unidade.trim()
    if (typeof val === 'number' && isFinite(val)) a.vals.push(val)
    if (typeof inc === 'number' && isFinite(inc)) a.incs.push(inc)
  }
  for (const p of (cert.grade2D?.pontos ?? []) as unknown as Array<Record<string, unknown>>) {
    add(p.grandeza as string, (p.eixo2Unidade as string) ?? cert.grade2D?.eixo2Unidade,
        num(p.eixo2 ?? p.vr), num(p.incerteza))
  }
  for (const it of cert.itens ?? []) {
    add(it.grandeza, it.unidade, num(it.valorNominal), num(it.incertezaExpandida))
  }
  return [...map.values()].map(a => ({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    nome: a.nome, simbolo: '', unidade: a.unidade,
    faixaMin: a.vals.length ? Math.min(...a.vals) : 0,
    faixaMax: a.vals.length ? Math.max(...a.vals) : 0,
    resolucao: '', incertezaExpandida: a.incs.length ? String(Math.max(...a.incs)) : '',
    fatorCobertura: 2,
  }))
}

/* Mescla grandezas novas numa lista existente, deduplicando por nome. Muta nada;
   devolve a lista combinada (ou a mesma referência se não houver novidade). */
export function mesclarGrandezas(
  existentes: GrandezaMetrologica[] | undefined,
  novas: GrandezaMetrologica[],
): GrandezaMetrologica[] {
  const atual = existentes ?? []
  const have = new Set(atual.map(g => g.nome.trim().toLowerCase()))
  const add = novas.filter(g => !have.has(g.nome.trim().toLowerCase()))
  return add.length ? [...atual, ...add] : atual
}

/* Ao salvar/atualizar um certificado, registra automaticamente as GRANDEZAS dele
   no equipamento (padrão), para aparecerem no seletor de grandeza da checagem. */
export async function registrarGrandezasDoCertificado(cert: Certificado): Promise<void> {
  try {
    const novas = grandezasDoCertificado(cert)
    if (!novas.length) return
    const equips = await lerJSON<EquipamentoEMC[]>(EQUIP_ARQ, [])
    const idx = equips.findIndex(e =>
      e.id === cert.equipamentoId ||
      (e.tag && cert.equipamentoTag && e.tag.toUpperCase() === cert.equipamentoTag.toUpperCase()))
    if (idx < 0) return
    const merged = mesclarGrandezas(equips[idx].grandezas, novas)
    if (merged === equips[idx].grandezas) return
    equips[idx] = { ...equips[idx], grandezas: merged }
    await escreverJSON(EQUIP_ARQ, equips)
  } catch { /* não bloqueia o salvamento do certificado */ }
}
