// Extratores ESPECÍFICOS por laboratório.
// O pdf-parse embaralha tabelas, então para os layouts mais bagunçados o método
// genérico (extrair-generico.ts) não acha modelo/série/data. Aqui cada lab tem
// uma função que "rastreia" esses campos por âncoras conhecidas do seu PDF.
// Só preenche os campos que o genérico costuma ERRAR — o merge no genérico
// mantém o que já veio certo (overlay: { ...generico, ...especifico-definido }).

export interface CamposLab {
  modelo?: string; serie?: string; dataCalibracao?: string; fabricante?: string; numero?: string
}

const MES: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
}

/** Normaliza qualquer formato de data para dd/mm/aaaa.
 *  Aceita 17/07/2024, 17-07-2024, "05 de outubro de 2022" e "3 Fev 2025". */
export function normData(s?: string): string | undefined {
  if (!s) return undefined
  let m = s.match(/(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})/)
  if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`
  m = s.match(/(\d{1,2})\s*(?:de\s+)?([A-Za-zçãéêíóôõ]{3,12})\.?\s*(?:de\s+)?(\d{4})/i)
  if (m) { const mm = MES[m[2].slice(0, 3).toLowerCase()]; if (mm) return `${m[1].padStart(2, '0')}/${mm}/${m[3]}` }
  return undefined
}

const cap = (t: string, re: RegExp) => { const m = t.match(re); return m ? (m[1] || '').trim() : undefined }

// Chave = nome canônico devolvido por identificarLaboratorio() em extrair-generico.
// IMPORTANTE: a extração do app é por COORDENADAS (pdfTextLayout) e sai LIMPA, com
// colunas separadas por TAB. O extrator GENÉRICO já resolve a grande maioria. Só
// adicione um extrator por lab para o que o genérico realmente NÃO pega no layout
// limpo — caso contrário ele SOBRESCREVE com valor pior (já aconteceu).
export const EXTRATORES_LAB: Record<string, (t: string) => CamposLab> = {
  // Inmetro (lâmpada): modelo vem inline "Modelo/Tipo: 230 V 20 W" (não casa por linha).
  'Inmetro': (t) => ({
    modelo: cap(t, /Modelo\s*\/?\s*Tipo:\s*([^\r\n\t]+?)\s*(?:N[úu]mero|C[óo]digo|N[º°]|$)/im),
  }),
  // ISI (medidor de espessura): série vem na frase "Número de série ... é 7360".
  // (Senai/volumétrico não tem série — fica vazio, correto.)
  'SENAI/CETEMP': (t) => ({
    serie: cap(t, /N[úu]mero\s+de\s+s[ée]rie[^\d]{0,40}(\d{3,6})/i),
  }),
}

/** Aplica o extrator do lab (se houver), devolvendo só os campos NÃO vazios. */
export function aplicarExtratorLab(lab: string | undefined, texto: string): CamposLab {
  if (!lab) return {}
  const fn = EXTRATORES_LAB[lab]
  if (!fn) return {}
  const r = fn(texto || '')
  const out: CamposLab = {}
  for (const k of Object.keys(r) as (keyof CamposLab)[]) {
    const v = r[k]
    if (v && String(v).trim()) out[k] = String(v).trim()
  }
  return out
}
