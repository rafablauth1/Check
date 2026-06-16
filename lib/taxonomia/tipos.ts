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

// Sufixo de exatamente 3 letras de uma TAG (ex.: "3217EMC" → "EMC"). Vazio se não houver.
export function siglaDaTag(tag: string): string {
  const m = (tag || '').toUpperCase().match(/([A-Z]{3})\s*$/)
  return m ? m[1] : ''
}

// Tag válida: dígitos + exatamente 3 letras maiúsculas no final (ex.: "3217EMC")
export function tagValida(tag: string): boolean {
  return /^\d+[A-Z]{3}$/.test((tag || '').toUpperCase().replace(/\s+/g, ''))
}

export const TAXONOMIA_DEFAULT: Taxonomia = {
  areas: [
    { id: 'emc', nome: 'EMC — Compatibilidade Eletromagnética', cor: 'teal' },
  ],
  siglas: [
    { sigla: 'EMC', significado: 'Compatibilidade Eletromagnética', areaId: 'emc' },
  ],
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
