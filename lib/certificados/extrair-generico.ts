// Extração GENÉRICA da 1ª página de certificados de OUTROS laboratórios.
// NÃO altera o OCR do LABELO (parsearDadosPadrao/parsearCertificadoRBC seguem
// intactos). Usa sinônimos de rótulos comuns (PT/EN) e a acreditação CAL XXXX
// (ou a assinatura do nome) para identificar o laboratório emissor.
//
// Padrões de rótulo aprendidos analisando certificados reais de vários labs
// (Chrompack, CTJ, Elus, Holtermann, Inmetro, ISI/SENAI, K&L, Keysight,
// Metroquality, Padrão Balanças, Senai...). Os termos foram generalizados
// para também cobrir laboratórios novos que sigam convenções parecidas.

import { aplicarExtratorLab, normData } from './extratores-lab'
import { siglaOficial } from '@/lib/taxonomia/tipos'
import type { LaboratorioCal } from '@/lib/laboratorios/registro'

// Modelo de extração por lab: rótulo que o lab usa para cada campo (tem prioridade).
export interface OverrideCampos {
  nome?: string; fabricante?: string; modelo?: string; serie?: string; tag?: string; dataCalibracao?: string; numero?: string
}
const escRe = (s?: string) => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const normCalKey = (c?: string) => (c ? `CAL ${(c.match(/\d{3,4}/) || [''])[0]}` : '')

// Rótulos configurados na aba Laboratórios (campos) pro CAL/lab identificado no
// texto. Alguns labs (Alutal, Keysight, Inmetro…) não têm acreditação Cgcre
// (CAL ####) — são identificados só pelo nome (assinatura no texto).
export function overrideDoLab(labs: LaboratorioCal[], texto: string): OverrideCampos {
  const k = normCalKey(extrairAcreditacao(texto))
  const porCal = k ? labs.find(l => normCalKey(l.cal) === k)?.campos : undefined
  if (porCal) return porCal
  const nomeLab = identificarLaboratorio(texto)
  const porNome = nomeLab ? labs.find(l => l.nome.toLowerCase() === nomeLab.toLowerCase())?.campos : undefined
  return porNome || {}
}

// Acreditação (Cgcre) → nome do laboratório. CAL 0024 = LABELO.
// Estes são os já conhecidos; o registro auto-descoberto cobre o resto.
export const LABS_POR_CAL: Record<string, string> = {
  'CAL 0024': 'LABELO/PUCRS',
  'CAL 0013': 'SENAI/CETEMP',     // ISI SIM SENAI CETEMP
  'CAL 0256': 'Chrompack',
  'CAL 0382': 'Holtermann',
  'CAL 0439': 'Elus Instrumentação',
  'CAL 0477': 'CTJ',
  'CAL 291':  'Padrão Balanças',
}

// Assinatura por NOME — pega laboratórios SEM acreditação CGCRE (Inmetro,
// Keysight) e serve de reforço quando o CAL não aparece no texto extraído.
const ASSINATURAS_LAB: { re: RegExp; nome: string }[] = [
  { re: /\binmetro\b|\bdimci\b/i,                       nome: 'Inmetro' },
  { re: /keysight|agilent/i,                            nome: 'Keysight Technologies' },
  { re: /chrompack/i,                                   nome: 'Chrompack' },
  { re: /holtermann/i,                                  nome: 'Holtermann' },
  { re: /\belus\b|precis[ãa]o\s+metrol[óo]gica/i,       nome: 'Elus Instrumentação' },
  { re: /metroquality/i,                                nome: 'Metroquality' },
  { re: /metrosul/i,                                    nome: 'Metrosul' },
  { re: /\bnovus\b/i,                                    nome: 'Novus' },
  { re: /padr[ãa]o\s+balan[çc]as/i,                     nome: 'Padrão Balanças' },
  { re: /cetemp|\bsenai\b/i,                            nome: 'SENAI/CETEMP' },
  { re: /grupo\s*ctj|\bctj\b/i,                         nome: 'CTJ' },
  { re: /\bk\s*&\s*l\b/i,                               nome: 'K&L Metrologia' },
  { re: /alutal|atlas\s+material/i,                     nome: 'Alutal' },
  { re: /\blabelo\b/i,                                  nome: 'LABELO/PUCRS' },
]

const limpa = (s?: string) => (s || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim()

/** Acreditação do laboratório EMISSOR (o "sob o número CAL XXXX"). */
export function extrairAcreditacao(texto: string): string | undefined {
  const t = texto || ''
  const m = t.match(/sob\s+o\s+n[úu]mero\s+(?:CAL\s*)?(\d{3,4})/i) || t.match(/\bCAL\s*(\d{3,4})\b/i)
  return m ? `CAL ${m[1]}` : undefined
}

export function labPorAcreditacao(cal?: string): string | undefined {
  if (!cal) return undefined
  const n = cal.replace(/\D/g, '')
  return LABS_POR_CAL[`CAL ${n}`] || LABS_POR_CAL[`CAL ${n.padStart(4, '0')}`]
}

/** Nome canônico do laboratório: CAL conhecido > assinatura do nome. */
export function identificarLaboratorio(texto: string, cal?: string): string | undefined {
  const porCal = labPorAcreditacao(cal ?? extrairAcreditacao(texto))
  if (porCal) return porCal
  for (const a of ASSINATURAS_LAB) if (a.re.test(texto || '')) return a.nome
  return undefined
}

/** Tenta achar o NOME do laboratório emissor na 1ª página (best-effort). */
export function extrairNomeLaboratorio(texto: string): string | undefined {
  // 1) assinatura conhecida (mais confiável)
  const porAssin = identificarLaboratorio(texto)
  if (porAssin) return porAssin
  // 2) heurística: 1ª linha "de cara" que parece nome de laboratório
  const linhas = (texto || '').split(/[\r\n]+|\s\|\s/).map(l => l.trim()).filter(Boolean).slice(0, 30)
  for (const l of linhas) {
    if (/acreditad|cgcre|iso\/?iec|17025|p[áa]gina|certificad|av\.|telefone|e-?mail|website|cliente/i.test(l)) continue
    if (/(laborat[óo]rio|metrolog|calibra[çc]|instrument|tecnolog|controles)/i.test(l) && l.length >= 4 && l.length <= 80) {
      return l.replace(/\s{2,}.*/, '').replace(/[•\-–:]\s*$/, '').trim()
    }
  }
  return undefined
}

export interface MetaGenerica {
  numero?: string; nome?: string; fabricante?: string; modelo?: string
  serie?: string; tag?: string; acreditacao?: string; laboratorio?: string
  dataCalibracao?: string
}

// Detecta se uma linha é, ela própria, um RÓTULO (e não um valor) — usado para
// não confundir o próximo rótulo com o valor procurado em layouts "em coluna".
const RE_ROTULO = /:\s*$|^(fabricante|marca|manufacturer|make|maker|modelo|model|tipo|type|n[º°o.]*\s*de\s*s[ée]rie|n[º°o.]*\s*s[ée]rie|s[ée]rie|serial|s\/?n|identifica|c[óo]d|tag|patrim|ativo|data|cliente|contratante|solicitante|interessado|endere[çc]o|faixa|resolu|procedimento|temperatura|umidade|press[ãa]o|denomina|objeto|descri|instrumento|item|emiss|valid|pr[óo]xima|local|condi[çc])/i
const ehRotulo = (s: string) => RE_ROTULO.test(s.trim())

// Lixo que às vezes "vaza" como valor logo após um rótulo.
const ehLixo = (v: string) =>
  !v || /^n[º°o.]*$/i.test(v) || /^[-–•:.\s/]+$/.test(v) || /^(o\s+mesmo|determinado)/i.test(v)

// Corta um RÓTULO seguinte que veio colado no valor, na mesma linha
// (ex.: "Não identificado Modelo/Tipo: 230 V" → "Não identificado").
const CUT_INLINE = /\s+(?:Fabricante|Marca|Manufacturer|Modelo|Model|Tipo|Type|N[º°o.]*\s*de\s*S[ée]rie|Serial|S\/?N|C[óo]d(?:igo)?\b|Identifica|Data|Faixa|Resolu|Endere)\b.*$/i

// Mesmo corte, mas pro caso do OCR GRUDAR o rótulo direto no valor, sem espaço
// nenhum entre eles (ex.: "ACE-LDG-S-15-MF001NELIdentificação: 3227LAV" →
// "ACE-LDG-S-15-MF001NEL"). CUT_INLINE não pega esse caso pois exige um \s antes
// do rótulo. Só corta se o rótulo vier em Title Case logo após maiúscula/dígito —
// como rótulo de formulário normalmente aparece — pra não cortar por coincidência
// dentro de um código que já é todo maiúsculo.
const CUT_GLUED = /(?<=[A-Z0-9])(?:Fabricante|Marca|Manufacturer|Modelo|Model|Tipo|Type|Identifica[çc][ãa]o|Data|Faixa|Resolu[çc][ãa]o|Endere[çc]o|Serial|C[óo]digo)\b.*$/

const arruma = (s: string, max: number) => {
  // pdfTextLayout separa COLUNAS por TAB — o valor é a 1ª coluna não-vazia
  // (corta "34970A\tCliente" → "34970A"; "\tACE-LDG…" → "ACE-LDG…").
  const col = (s || '').split('\t').map(c => c.trim()).filter(Boolean)[0] || ''
  const v = limpa(col).replace(CUT_INLINE, '').replace(CUT_GLUED, '').replace(/\s{2,}.*/, '').replace(/[•\-–:\s]+$/, '').trim()
  return v && !ehLixo(v) && !ehRotulo(v) && v.length <= max ? v : undefined
}

// Procura "rótulo: valor" e também "rótulo:" com o valor na PRÓXIMA linha
// (vários labs imprimem rótulo e valor em linhas separadas — Alutal, Keysight, CTJ).
// O \b após o rótulo impede casar como prefixo de palavra maior (Equipamento ≠ Equipamentos).
function campo(texto: string, rotulos: string[], max = 80): string | undefined {
  const linhas = texto.split(/[\r\n]+|\s\|\s/).map(l => l.trim())
  for (const r of rotulos) {
    const re = new RegExp('^(?:' + r + ')(?![A-Za-zÀ-ÿ])\\s*[:\\-–]?\\s*(.*)$', 'i')
    for (let i = 0; i < linhas.length; i++) {
      if (!linhas[i]) continue
      const m = linhas[i].match(re)
      if (!m) continue
      // (a) valor na MESMA linha
      const mesma = arruma(m[1], max)
      if (mesma) return mesma
      // (b) valor na PRÓXIMA linha não-vazia (layout em coluna)
      for (let j = i + 1; j < Math.min(i + 3, linhas.length); j++) {
        if (!linhas[j]) continue
        if (ehRotulo(linhas[j])) break
        const prox = arruma(linhas[j], max)
        if (prox) return prox
        break
      }
    }
  }
  return undefined
}

// Layout em COLUNAS (pdfTextLayout): o rótulo está numa célula (separadas por TAB)
// e o valor na MESMA célula (após ":") ou na PRÓXIMA célula. Cobre linhas tipo
// "Valor de uma Divisão:\t1 cN.m\tNº de série:\t6GX 030371" e
// "Nome do Fabricante\tKn Waagen\tNúmero de Série\t12.079.10".
function campoMultiColuna(texto: string, rotulos: string[], max = 80): string | undefined {
  const linhas = texto.split(/[\r\n]+/)
  for (const r of rotulos) {
    const re = new RegExp('^(?:' + r + ')(?![A-Za-zÀ-ÿ])\\s*[:\\-–]?\\s*(.*)$', 'i')
    for (const linha of linhas) {
      const cells = linha.split('\t').map(c => c.trim()).filter(Boolean)
      for (let i = 0; i < cells.length; i++) {
        const m = cells[i].match(re)
        if (!m) continue
        const mesma = arruma(m[1], max)   // valor na mesma célula (após o rótulo)
        if (mesma) return mesma
        for (let j = i + 1; j < cells.length; j++) {   // senão, próxima célula
          const v = arruma(cells[j], max)
          if (v) return v
        }
      }
    }
  }
  return undefined
}

// TAG = número (2–8 díg.) + 3 letras. As 3 letras DEVEM ser uma sigla oficial de
// laboratório (siglaOficial) — qualquer outra trinca não é TAG (ISO, SOB, RAZ…).
const RE_TAG_VAL = /\b(\d{2,8})\s*([A-Za-z]{3})\b/
const RE_TAG_UP = /\b(\d{2,8})\s*([A-Za-z]{3})\b/g

/** Extrai a TAG do cliente (cada lab usa um rótulo diferente — ver ASSINATURAS). */
export function extrairTag(texto: string, rotuloLab?: string): string | undefined {
  // 1) valor logo após um rótulo de identificação (alta confiança)
  const v = campo(texto, [
    ...(rotuloLab ? [escRe(rotuloLab)] : []),
    'TAG',
    'C[óo]d(?:igo)?\\.?\\s*de\\s*Identifica[çc][ãa]o\\s+do\\s+propriet[áa]rio',
    'C[óo]d(?:igo)?\\.?\\s*de\\s*Identifica[çc][ãa]o',
    'N[úu]mero\\s*de\\s*Identifica[çc][ãa]o',
    'N[º°o.]*\\s*de\\s*Identifica[çc][ãa]o',
    'Identifica[çc][ãa]o\\s+do\\s+Conjunto',
    'Identifica[çc][ãa]o\\s+do\\s+Instrumento',
    'N[úu]mero\\s+do\\s+cliente',
    'Ativo\\s*N[º°o.]*',
    'ID\\s*Code', '\\bID\\b',
    'Identifica[çc][ãa]o', 'Patrim[ôo]nio', 'C[óo]digo',
  ], 30)
  if (v) { const m = v.match(RE_TAG_VAL); if (m && siglaOficial(m[2])) return (m[1] + m[2]).toUpperCase() }
  // 2) fallback: padrão na folha de rosto, aceitando só sigla oficial de lab
  const rosto = (texto || '').slice(0, 4500)
  for (const m of rosto.matchAll(RE_TAG_UP)) {
    if (siglaOficial(m[2])) return (m[1] + m[2]).toUpperCase()
  }
  return undefined
}

/** Data DE CALIBRAÇÃO (genérico). Procura o rótulo (PT/EN, "data" ou "período")
 *  e pega a data logo após; se não achar, usa uma data cuja vizinhança fale de
 *  calibração e NÃO de emissão/validade/recebimento. Normaliza p/ dd/mm/aaaa
 *  (aceita dd/mm/aaaa, "05 de outubro de 2022" e "3 Fev 2025"). */
export function extrairDataCalibracao(texto: string, rotuloLab?: string): string | undefined {
  const t = (texto || '').slice(0, 6000)
  // rótulo específico do lab (modelo de extração) tem prioridade
  if (rotuloLab) { const d = normData(campo(t, [escRe(rotuloLab)], 24)); if (d) return d }
  const reData = /\d{1,2}\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*\d{4}|\d{1,2}\s+(?:de\s+)?[A-Za-zçãéêíóôõ]{3,12}\.?\s+(?:de\s+)?\d{4}/gi
  // 1) rótulo de calibração → data nos ~80 chars seguintes (sem cruzar emissão/validade)
  const reLabel = /(?:data|per[íi]odo)\s*d[aeo]?\s*calibra[çc][ãa]o|calibration\s*date|date\s*of\s*calibration/gi
  let m: RegExpExecArray | null
  while ((m = reLabel.exec(t))) {
    const ini = m.index + m[0].length
    const depois = t.slice(ini, ini + 80)
    const corte = depois.search(/emiss|valid|venc|receb|pr[óo]xim/i)
    const d = normData(corte >= 0 ? depois.slice(0, corte) : depois)
    if (d) return d
  }
  // 2) fallback: data cuja vizinhança fala de "calibra" e não de emissão/validade
  for (const dm of t.matchAll(reData)) {
    const i = dm.index ?? 0
    const ctx = t.slice(Math.max(0, i - 45), i + dm[0].length + 12)
    if (/calibra/i.test(ctx) && !/emiss|valid|venc|receb|pr[óo]xim/i.test(ctx)) {
      const d = normData(dm[0]); if (d) return d
    }
  }
  return undefined
}

// Descarta "nome de equipamento" obviamente inválido: unidade, endereço, lixo curto,
// nome do CLIENTE (não é o equipamento) ou fragmento de frase do corpo do certificado.
function nomeValido(n?: string): string | undefined {
  if (!n) return undefined
  const s = n.trim()
  if (s.length < 4) return undefined
  if (/^[(\d]/.test(s) || /^(av|rua|al|rod)\b/i.test(s) || /^do\b/i.test(s)) return undefined
  if (/uni[ãa]o\s+brasileira|pucrs|educa[çc][ãa]o\s+e\s+assist|\bcliente\b/i.test(s)) return undefined
  if (/calibrad|calibrated|condi[çc][õo]es|resultad/i.test(s)) return undefined
  return s
}

/** Extrai metadados da 1ª página de um certificado de qualquer laboratório.
 *  `ov` = modelo de extração do lab (rótulos específicos) — têm prioridade. */
export function extrairMetadadosGenerico(texto: string, ov: OverrideCampos = {}): MetaGenerica {
  const t = (texto || '').slice(0, 4500)   // foco na folha de rosto
  // Nº do certificado/relatório — letra(s) opcionais + dígitos + 1-2 grupos de
  // separador+dígitos (cobre formatos com 2 OU 3 segmentos: "150.059", "P-7405/24",
  // "31.169/22", "MA 010_06_23"), ou formatos próprios (DIMCI 1068/2025,
  // WO-00936667, L002787/2026). "calibra[a-zà-ÿ]*" (em vez de "calibra\w*") pra
  // casar "Calibração" inteiro — \w não inclui "ç"/"ã", cortava o rótulo no meio.
  const numM =
    t.match(/(?:certificad\w*|certificate|relat[óo]rio)\s*(?:de\s*calibra[a-zà-ÿ]*)?\s*(?:n[º°o.]*)?\s*[:\-]?\s*([A-Z]{0,5}\s?-?\s?\d{1,8}(?:\s?[/._\-]\s?\d{1,8}){1,2})/i) ||
    t.match(/\b(DIMCI\s*\d{1,5}\/\d{2,4})\b/i) ||
    t.match(/\b(WO-\d{6,10})\b/i) ||
    t.match(/\b([A-Z]\d{5,7}\/\d{4})\b/)
  const acred = extrairAcreditacao(texto)
  // Rótulos por campo (reutilizados em campo() e campoMultiColuna()).
  const ROT_NOME = ['Nome', 'Equipamento', 'Descri[çc][ãa]o', 'Denomina[çc][ãa]o', 'Instrumento', 'Measuring\\s*Instrument', 'Equipment', 'Description', 'Instrument', 'Item\\s*calibrad\\w*', 'Item', 'Objeto(?:\\s*calibrad\\w*)?', 'Unidade\\s*sob\\s*teste']
  const ROT_FAB  = ['Fabricante', 'Marca', 'Nome\\s+do\\s+Fabricante', 'Manufacturer', 'Make', 'Maker']
  const ROT_MOD  = ['Modelo(?:\\s*N[º°o.]*)?', 'Model(?:\\s*\\/?\\s*Type)?', 'Tipo', 'Type']
  // aceita "Nº de Série" E "Número de Série" (N[º°o.]* não casa "Número")
  const ROT_SER  = ['N[úu]mero\\s*de\\s*S[ée]rie', 'N[º°o.]*\\s*de\\s*S[ée]rie', 'N[º°o.]*\\s*S[ée]rie', 'S[ée]rie\\s*N[º°o.]*', 'S[ée]rie', 'Serial(?:\\s*N\\w*)?', 'Serial\\s*Number', 'S\\/?N']
  // rótulo do Nº do certificado (com qualificador — "Número" sozinho colide com
  // "Número de Série"/"Número de Identificação" e pegaria o campo errado).
  const ROT_NUM  = ['N[º°o.]*\\s*(?:do\\s*)?Certificado(?:\\s*de\\s*Calibra[çc][ãa]o)?', 'N[úu]mero\\s*do\\s*Certificado', 'N[º°o.]*\\s*(?:do\\s*)?Relat[óo]rio', 'N[úu]mero\\s*do\\s*Relat[óo]rio', 'Certificate\\s*(?:No\\.?|Number)', 'Report\\s*(?:No\\.?|Number)']
  // rótulo do MODELO DO LAB tem prioridade (vai na frente da lista de sinônimos)
  const pre = (label: string | undefined, lista: string[]) => label ? [escRe(label), ...lista] : lista
  // genérico (linha) com fallback MULTI-COLUNA (pdfTextLayout separa colunas por TAB)
  const rNome = pre(ov.nome, ROT_NOME), rFab = pre(ov.fabricante, ROT_FAB)
  const rMod = pre(ov.modelo, ROT_MOD), rSer = pre(ov.serie, ROT_SER)
  const rNum = pre(ov.numero, ROT_NUM)
  const meta: MetaGenerica = {
    // rótulo do lab (ou os genéricos acima) tem prioridade; o regex livre numM
    // (aceita formatos soltos tipo "WO-00936667") é só o último fallback.
    numero:     campo(t, rNum, 40) ?? campoMultiColuna(t, rNum, 40) ?? (numM ? limpa(numM[1]).replace(/\s+/g, '') : undefined),
    nome:       nomeValido(campo(t, rNome) ?? campoMultiColuna(t, rNome)),
    fabricante: campo(t, rFab, 50) ?? campoMultiColuna(t, rFab, 50),
    modelo:     campo(t, rMod, 40) ?? campoMultiColuna(t, rMod, 40),
    serie:      campo(t, rSer, 30) ?? campoMultiColuna(t, rSer, 30),
    tag:        extrairTag(t, ov.tag),
    acreditacao: acred,
    laboratorio: identificarLaboratorio(texto, acred),
    dataCalibracao: extrairDataCalibracao(texto, ov.dataCalibracao),
  }
  // overlay: extrator específico do lab preenche o que o genérico errou/não achou
  return { ...meta, ...aplicarExtratorLab(meta.laboratorio, texto) }
}
