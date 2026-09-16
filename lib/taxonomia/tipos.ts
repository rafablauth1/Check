// Taxonomia configurável do laboratório (camada aditiva — não altera grupoId/
// subgrupoId existentes dos equipamentos).
//
// - Área:   um laboratório/área (ex.: EMC, Luminotécnica). Tem cor.
// - Sigla:  as 3 letras finais da TAG (ex.: "EMC" em "3217EMC"). Cada sigla
//           significa algo e pertence a uma Área. É o que filtra os equipamentos.
// - Tipo:   um tipo de equipamento (ex.: Gerador de sinal) com ícone próprio.
//           Pode pertencer a VÁRIAS áreas.

export interface Area {
  id: string
  nome: string
  cor: string        // chave de GRUPO_CORES (blue/gold/purple/green/coral/gray/teal)
  /* Normas/portarias deste laboratório (ids de lib/normas). É por aqui que a
     cadeia fecha: área → normas → ensaios → padrões, que é o que alimenta o
     filtro por ensaio na tela de equipamentos. Fica na Área (e não na Norma)
     porque é esta tela que grava taxonomia.json — assim o vínculo é salvo no
     mesmo "Salvar tudo", sem precisar gravar cada norma por fora. */
  normaIds?: string[]
}

export interface SiglaTag {
  sigla: string      // 3 letras, maiúsculas (sufixo da TAG)
  significado: string
  areaId: string
}

export interface TipoEquip {
  id: string
  nome: string
  icone: string      // nome do ícone (ver lib/taxonomia/icones)
  areaIds: string[]  // áreas a que este tipo pertence (pode ser mais de uma)
}

export interface Taxonomia {
  areas: Area[]
  siglas: SiglaTag[]
  tipos: TipoEquip[]
}

// Sufixo de 3 letras de uma TAG (ex.: "3217EMC" → "EMC"). Vazio se não houver.
export function siglaDaTag(tag: string): string {
  const m = (tag || '').toUpperCase().match(/([A-Z]{2,4})\s*$/)
  return m ? m[1] : ''
}

// Siglas OFICIAIS de laboratório (as 3 letras finais válidas de uma TAG). Qualquer
// outra trinca de letras NÃO é sigla de lab → não é TAG (ex.: ISO, SOB, RAZ…).
export const SIGLAS_LAB_OFICIAIS = [
  'ADV','AMX','ATX','CMP','COR','DOM','DPC','EMC','FIC','FLA','IPX','ITE','LAV',
  'LIF','LML','LUM','LVM','MIE','MED','MOB','MOT','OMH','ORD','QUI','QUA','REF',
  'VNT','TEL','TNQ','UDM','VBR',
]
const SET_SIGLAS = new Set(SIGLAS_LAB_OFICIAIS)
/** A trinca de letras é uma sigla de laboratório válida? */
export function siglaOficial(s?: string): boolean {
  return !!s && SET_SIGLAS.has(s.toUpperCase())
}

export const TAXONOMIA_DEFAULT: Taxonomia = {
  areas: [
    { id: 'emc', nome: 'EMC — Compatibilidade Eletromagnética', cor: 'teal' },
  ],
  // Todas as siglas oficiais já cadastradas; EMC vinculada à área, as demais
  // ficam sem área (o usuário vincula a cada laboratório depois).
  siglas: SIGLAS_LAB_OFICIAIS.map(s => (
    s === 'EMC'
      ? { sigla: 'EMC', significado: 'Compatibilidade Eletromagnética', areaId: 'emc' }
      : { sigla: s, significado: '', areaId: '' }
  )),
  tipos: [
    { id: 'gerador-sinal-rf',     nome: 'Gerador de sinal RF',       icone: 'Zap',               areaIds: ['emc'] },
    { id: 'analisador-espectro',  nome: 'Analisador de espectro',    icone: 'Activity',          areaIds: ['emc'] },
    { id: 'receptor-emi',         nome: 'Receptor EMI',              icone: 'Radio',             areaIds: ['emc'] },
    { id: 'lisn-50uh',            nome: 'LISN / Rede de impedância', icone: 'Waves',             areaIds: ['emc'] },
    { id: 'antena',               nome: 'Antena',                    icone: 'Antenna',           areaIds: ['emc'] },
    { id: 'atenuador',            nome: 'Atenuador',                 icone: 'SlidersHorizontal', areaIds: ['emc'] },
    { id: 'termoigrometro',       nome: 'Termo-higrômetro',          icone: 'Thermometer',       areaIds: ['emc'] },
  ],
}
