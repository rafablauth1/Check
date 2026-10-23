import type { ConfigEnsaiosEmc, EnsaioCatalogo, RegraEnsaio, TemplateEnsaio } from '@/lib/emc/tipos'

// Catálogo e templates que vêm prontos — levantados das portarias Inmetro e das
// planilhas modelo do laboratório (3.1 - Modelo de planilhas de ensaio). Só valem
// até o primeiro save: depois, o arquivo emc/ensaios-config.json manda e o
// usuário edita tudo na tela EMC → Templates de ensaio.
//
// Os ids dos 7 ensaios da série 61000-4-x são os mesmos da Portaria Inmetro 221
// em lib/normas/loader.ts.

export const CATALOGO_PADRAO: EnsaioCatalogo[] = [
  { id: 'esd-4-2',                     codigo: '4-2',  nome: 'Descargas eletrostáticas (ESD)',                 norma: 'IEC 61000-4-2' },
  { id: 'imunidade-radiada-4-3',       codigo: '4-3',  nome: 'Campos de RF irradiados',                        norma: 'IEC 61000-4-3' },
  { id: 'burst-4-4',                   codigo: '4-4',  nome: 'Transientes elétricos rápidos (burst)',          norma: 'IEC 61000-4-4' },
  { id: 'burst-4-4-reativa',           codigo: '4-4R', nome: 'Transientes elétricos rápidos — energia reativa', norma: 'IEC 61000-4-4' },
  { id: 'surge-4-5',                   codigo: '4-5',  nome: 'Impulso combinado (surto)',                      norma: 'IEC 61000-4-5' },
  { id: 'imunidade-conduzida-4-6',     codigo: '4-6',  nome: 'Campos de RF conduzidos',                        norma: 'IEC 61000-4-6' },
  { id: 'dips-4-11',                   codigo: '4-11', nome: 'Quedas, curtas interrupções e variações de tensão', norma: 'IEC 61000-4-11' },
  { id: 'correntes-diferenciais-4-19', codigo: '4-19', nome: 'Correntes diferenciais conduzidas (2–150 kHz)',  norma: 'IEC 61000-4-19' },
  { id: 'variacao-tensao-d11',         codigo: 'D11',  nome: 'Variação na tensão de alimentação',              norma: 'OIML D11' },
  { id: 'baixa-tensao-bateria',        codigo: 'BAT',  nome: 'Baixa tensão da bateria interna',                norma: 'OIML D11 (14.1)' },
]

const sempre = (...ids: string[]): RegraEnsaio[] => ids.map(ensaioId => ({ ensaioId, quando: [] }))

const SETE_221 = [
  'esd-4-2', 'imunidade-radiada-4-3', 'burst-4-4', 'surge-4-5',
  'imunidade-conduzida-4-6', 'dips-4-11', 'correntes-diferenciais-4-19',
]

// Portaria 221/2022: medidor e SIP têm os mesmos ensaios. Reativa → o 4-4 é
// avaliado também em energia reativa (Tabela 9 tem limite próprio); 4-3 e 4-6
// bastam em ativa (nota 1). Modo relógio = medição por pulso no início e no fim
// do ensaio, em todos menos 4-3 e 4-6, que são feitos à parte.
function template221(id: string, nome: string, icone: string, observacao: string): TemplateEnsaio {
  return {
    id, nome, icone, portaria: 'Portaria Inmetro 221/2022', observacao,
    perguntas: [
      { id: 'reativa', texto: 'Mede energia reativa?', tipo: 'simnao', etiqueta: 'Reativa', mostrarEtiqueta: true },
      {
        id: 'relogio', texto: 'Modo relógio?', tipo: 'simnao', etiqueta: 'Relógio', mostrarEtiqueta: true,
        marcaRelogio: SETE_221.filter(e => e !== 'imunidade-radiada-4-3' && e !== 'imunidade-conduzida-4-6')
          .concat('burst-4-4-reativa'),
      },
    ],
    regras: [
      ...sempre(...SETE_221),
      { ensaioId: 'burst-4-4-reativa', quando: [{ perguntaId: 'reativa', operador: 'eh', valor: 'sim' }] },
    ],
  }
}

export const TEMPLATES_PADRAO: TemplateEnsaio[] = [
  template221('medidor-energia', 'Medidor de energia', 'Zap', 'Tabela 14 (ensaios de EMC) e item 2.5.2.4 (normas).'),
  template221('sip', 'SIP — Sistema de Iluminação Pública', 'UtilityPole',
    'SIP = medidor monofásico de iluminação pública (item 1.2.3); faz os mesmos ensaios de EMC do medidor.'),
  {
    id: 'medidor-agua', nome: 'Medidor de água', icone: 'Droplets', portaria: 'Portaria Inmetro 295/2018',
    observacao: 'Alimentado por bateria (CC). Itens 1.13 a 1.15 do anexo de ensaios.',
    perguntas: [
      { id: 'cabo-sinal', texto: 'Tem cabo de sinal/controle?', tipo: 'simnao', etiqueta: 'Cabo de sinal', mostrarEtiqueta: false },
    ],
    regras: [
      ...sempre('esd-4-2', 'imunidade-radiada-4-3', 'baixa-tensao-bateria'),
      ...['burst-4-4', 'surge-4-5', 'imunidade-conduzida-4-6'].map(ensaioId => ({
        ensaioId, quando: [{ perguntaId: 'cabo-sinal', operador: 'eh' as const, valor: 'sim' }],
      })),
    ],
  },
  {
    id: 'bomba-combustivel', nome: 'Bomba de combustível', icone: 'Fuel', portaria: 'Portaria Inmetro 227/2022',
    observacao: 'Conforme a planilha FOR EMC38 (RTM 559/2016); conferir o Anexo B da 227/2022.',
    perguntas: [],
    regras: sempre('esd-4-2', 'imunidade-radiada-4-3', 'burst-4-4', 'imunidade-conduzida-4-6', 'dips-4-11', 'variacao-tensao-d11'),
  },
  {
    id: 'radar-velocidade', nome: 'Radar de velocidade', icone: 'Radar', portaria: 'Portaria Inmetro 158/2022',
    observacao: 'Anexo C. Ensaios veiculares (ISO 16750/7637) e 4-29 não são feitos pelo laboratório.',
    perguntas: [
      { id: 'instalacao', texto: 'Instalação', tipo: 'unica', opcoes: ['Fixo', 'Estático', 'Portátil', 'Móvel'], mostrarEtiqueta: true },
      { id: 'alimentacao', texto: 'Alimentação', tipo: 'multipla', opcoes: ['CA', 'CC'], mostrarEtiqueta: true },
      {
        id: 'ar-livre', texto: 'Componentes instalados ao ar livre?', tipo: 'simnao', etiqueta: 'Ar livre', mostrarEtiqueta: true,
        mostrarQuando: [{ perguntaId: 'instalacao', operador: 'eh', valor: 'Fixo' }],
      },
      { id: 'cabos', texto: 'Tem cabo de alimentação ou de sinal?', tipo: 'simnao', mostrarEtiqueta: false },
    ],
    regras: [
      { ensaioId: 'esd-4-2', quando: [{ perguntaId: 'instalacao', operador: 'naoEh', valor: 'Fixo' }] },   // 1.12.2
      { ensaioId: 'imunidade-radiada-4-3', quando: [] },
      { ensaioId: 'imunidade-conduzida-4-6', quando: [{ perguntaId: 'cabos', operador: 'eh', valor: 'sim' }] }, // 1.14.2
      { ensaioId: 'burst-4-4', quando: [] },                                                                   // CA e CC
      {
        ensaioId: 'surge-4-5', quando: [                                                                      // 1.15.2
          { perguntaId: 'instalacao', operador: 'eh', valor: 'Fixo' },
          { perguntaId: 'ar-livre', operador: 'eh', valor: 'sim' },
        ],
      },
      { ensaioId: 'dips-4-11', quando: [{ perguntaId: 'alimentacao', operador: 'inclui', valor: 'CA' }] },   // 1.18
      { ensaioId: 'variacao-tensao-d11', quando: [] },                                                         // CA 12.2 / CC 12.1
    ],
  },
  {
    id: 'balanca', nome: 'Balança', icone: 'Scale', portaria: 'Portaria Inmetro 157/2022',
    observacao: 'Tabela 7 da portaria (sem números IEC). 4-5 e 4-6 a confirmar.',
    perguntas: [],
    regras: sempre('esd-4-2', 'imunidade-radiada-4-3', 'burst-4-4', 'dips-4-11'),
  },
]

export const CONFIG_EMC_PADRAO: ConfigEnsaiosEmc = {
  catalogo: CATALOGO_PADRAO,
  templates: TEMPLATES_PADRAO,
}
