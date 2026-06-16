import type { SubgrupoId } from '@/lib/equipamentos/tipos'

export interface ItemTemplate {
  descricao: string
  unidade: string
  criterioMin?: number
  criterioMax?: number
  normaId?: string
  secao?: string
}

export interface TemplateChecagem {
  subgrupoId: SubgrupoId
  nome: string
  periodicidadePadrao: number
  itens: ItemTemplate[]
}

export const TEMPLATES: Record<SubgrupoId, TemplateChecagem> = {
  'analisador-espectro': {
    subgrupoId: 'analisador-espectro',
    nome: 'Analisador de Espectro',
    periodicidadePadrao: 90,
    itens: [
      { descricao: 'Piso de ruído (noise floor) @ 1 GHz', unidade: 'dBm', criterioMin: -110, criterioMax: -90, normaId: 'cispr15', secao: '4.3' },
      { descricao: 'Frequência de referência (sinal CW)', unidade: 'ppm', criterioMin: -10, criterioMax: 10 },
      { descricao: 'Linearidade do atenuador interno', unidade: 'dB', criterioMin: -1.5, criterioMax: 1.5 },
    ],
  },
  'receptor-emi': {
    subgrupoId: 'receptor-emi',
    nome: 'Receptor EMI',
    periodicidadePadrao: 90,
    itens: [
      { descricao: 'Piso de ruído @ 150 kHz', unidade: 'dBμV', criterioMax: 0, normaId: 'cispr15', secao: '4.3' },
      { descricao: 'Desvio de frequência de referência', unidade: 'ppm', criterioMin: -5, criterioMax: 5 },
      { descricao: 'Diferença detector QP vs PK @ sinal CW', unidade: 'dB', criterioMin: 5, criterioMax: 7 },
    ],
  },
  'multimetro': {
    subgrupoId: 'multimetro',
    nome: 'Multímetro',
    periodicidadePadrao: 180,
    itens: [
      { descricao: 'Tensão DC (referência 10 V)', unidade: 'mV', criterioMin: -50, criterioMax: 50 },
      { descricao: 'Resistência (referência 100 Ω)', unidade: 'mΩ', criterioMin: -100, criterioMax: 100 },
    ],
  },
  'lisn-50uh': {
    subgrupoId: 'lisn-50uh',
    nome: 'LISN 50µH',
    periodicidadePadrao: 180,
    itens: [
      { descricao: 'Impedância @ 9 kHz', unidade: 'Ω', criterioMin: 40, criterioMax: 60, normaId: 'cispr15', secao: '9.2' },
      { descricao: 'Impedância @ 150 kHz', unidade: 'Ω', criterioMin: 40, criterioMax: 60, normaId: 'cispr15', secao: '9.2' },
      { descricao: 'Impedância @ 30 MHz', unidade: 'Ω', criterioMin: 40, criterioMax: 60, normaId: 'cispr15', secao: '9.2' },
      { descricao: 'Resistência de terra do cabo', unidade: 'Ω', criterioMax: 1 },
    ],
  },
  'lisn-5uh': {
    subgrupoId: 'lisn-5uh',
    nome: 'LISN 5µH',
    periodicidadePadrao: 180,
    itens: [
      { descricao: 'Impedância @ 150 kHz', unidade: 'Ω', criterioMin: 40, criterioMax: 60 },
      { descricao: 'Impedância @ 30 MHz', unidade: 'Ω', criterioMin: 40, criterioMax: 60 },
    ],
  },
  'antena-loop': {
    subgrupoId: 'antena-loop',
    nome: 'Antena de Loop Tripla',
    periodicidadePadrao: 365,
    itens: [
      { descricao: 'Fator de antena @ 9 kHz', unidade: 'dB(1/m)', normaId: 'cispr15', secao: '8.2' },
      { descricao: 'Fator de antena @ 150 kHz', unidade: 'dB(1/m)', normaId: 'cispr15', secao: '8.2' },
      { descricao: 'Continuidade do cabo coaxial', unidade: 'Ω', criterioMax: 1 },
    ],
  },
  'antena-log-periodica': {
    subgrupoId: 'antena-log-periodica',
    nome: 'Antena Log-Periódica',
    periodicidadePadrao: 365,
    itens: [
      { descricao: 'Fator de antena (ponto de verificação)', unidade: 'dB(1/m)' },
      { descricao: 'Continuidade do cabo coaxial', unidade: 'Ω', criterioMax: 1 },
    ],
  },
  'antena-biconica': {
    subgrupoId: 'antena-biconica',
    nome: 'Antena Bicônica',
    periodicidadePadrao: 365,
    itens: [
      { descricao: 'Fator de antena (ponto de verificação)', unidade: 'dB(1/m)' },
      { descricao: 'Continuidade do cabo coaxial', unidade: 'Ω', criterioMax: 1 },
    ],
  },
  'gerador-sinal-rf': {
    subgrupoId: 'gerador-sinal-rf',
    nome: 'Gerador de Sinal RF',
    periodicidadePadrao: 180,
    itens: [
      { descricao: 'Exatidão de frequência (sinal de teste)', unidade: 'ppm', criterioMin: -10, criterioMax: 10 },
      { descricao: 'Nível de saída (potência nominal)', unidade: 'dBm', criterioMin: -1, criterioMax: 1 },
      { descricao: '2ª harmônica @ saída máxima', unidade: 'dBc', criterioMax: -30 },
    ],
  },
  'gerador-funcoes': {
    subgrupoId: 'gerador-funcoes',
    nome: 'Gerador de Funções',
    periodicidadePadrao: 180,
    itens: [
      { descricao: 'Exatidão de frequência', unidade: 'ppm', criterioMin: -50, criterioMax: 50 },
      { descricao: 'Amplitude de saída (sinal senoidal)', unidade: '%', criterioMin: -5, criterioMax: 5 },
    ],
  },
  'fonte-alimentacao-dc': {
    subgrupoId: 'fonte-alimentacao-dc',
    nome: 'Fonte de Alimentação DC',
    periodicidadePadrao: 365,
    itens: [
      { descricao: 'Tensão de saída (ponto nominal)', unidade: 'mV', criterioMin: -100, criterioMax: 100 },
      { descricao: 'Ondulação (ripple) da saída', unidade: 'mVpp', criterioMax: 50 },
    ],
  },
  'atenuador': {
    subgrupoId: 'atenuador',
    nome: 'Atenuador RF',
    periodicidadePadrao: 365,
    itens: [
      { descricao: 'Atenuação nominal @ 1 GHz', unidade: 'dB', criterioMin: -0.5, criterioMax: 0.5 },
      { descricao: 'VSWR @ 1 GHz', unidade: '—', criterioMax: 1.3 },
    ],
  },
  'filtro-rf': {
    subgrupoId: 'filtro-rf',
    nome: 'Filtro RF',
    periodicidadePadrao: 365,
    itens: [
      { descricao: 'Inserção de perda @ frequência de corte', unidade: 'dB', criterioMin: -1, criterioMax: 1 },
    ],
  },
  'termoigrometro': {
    subgrupoId: 'termoigrometro',
    nome: 'Termoigrômetro',
    periodicidadePadrao: 90,
    itens: [
      { descricao: 'Temperatura (referência padrão de temperatura)', unidade: '°C', criterioMin: -0.5, criterioMax: 0.5 },
      { descricao: 'Umidade relativa (referência)', unidade: '%UR', criterioMin: -3, criterioMax: 3 },
    ],
  },
  'barometro': {
    subgrupoId: 'barometro',
    nome: 'Barômetro',
    periodicidadePadrao: 365,
    itens: [
      { descricao: 'Pressão atmosférica (referência)', unidade: 'hPa', criterioMin: -2, criterioMax: 2 },
    ],
  },
}
