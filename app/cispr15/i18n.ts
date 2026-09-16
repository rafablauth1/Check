/* Textos do relatório de ensaio em português e inglês.
 *
 * Por que um dicionário e não tradução no meio do JSX: o corpo do relatório é
 * documento controlado — frase de acreditação, regra de decisão, isenções de
 * responsabilidade. Espalhar `idioma === 'en' ? ... : ...` por 1500 linhas de
 * JSX faria com que revisar o texto emitido exigisse ler a tela inteira. Aqui,
 * as duas versões ficam lado a lado e a revisão é direta.
 *
 * O que este arquivo NÃO faz: traduzir o que o usuário digita (cliente, endereço
 * do cliente, produto, observações livres). Não existe tradutor embutido, e
 * inventar tradução de dado do cliente num relatório assinado seria pior que
 * deixar no original.
 *
 * Números: em inglês o separador decimal é ponto, não vírgula — por isso as
 * tabelas de limites e de incertezas estão duplicadas em vez de reaproveitadas.
 */

export type Idioma = 'pt' | 'en'

export interface TabelaLimite {
  cols: string[]
  rows: string[][]
  note?: string
}

/** Data no formato do idioma.
 *  pt: 15/10/2026 (dia/mês/ano) · en: 10/15/2026 (mês/dia/ano, padrão americano).
 *  Só dígitos nos dois — nada de mês por extenso. */
export function fmtDataI18n(iso: string, idioma: Idioma): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  return idioma === 'en'
    ? d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : d.toLocaleDateString('pt-BR')
}

/** Junta uma lista com o conectivo do idioma: "127V e 220V" · "127V and 220V". */
export function juntarE(itens: string[], idioma: Idioma): string {
  if (itens.length <= 1) return itens.join('')
  const e = idioma === 'en' ? ' and ' : ' e '
  return itens.slice(0, -1).join(', ') + e + itens[itens.length - 1]
}

const PT = {
  /* ── cabeçalho / rodapé ── */
  universidade: 'Pontifícia Universidade Católica do Rio Grande do Sul',
  labeloNome: 'LABELO - Laboratórios Especializados em Eletroeletrônica',
  labeloSub: 'Calibração e Ensaios',
  rede: 'Rede Brasileira de Laboratórios de Ensaios',
  acreditacaoCabecalho:
    'Laboratório de Ensaio acreditado pela Cgcre de acordo com a ABNT NBR ISO/IEC 17025 sob o número CRL 0075',
  relatorioDeEnsaio: 'Relatório de Ensaio',
  numeroAbrev: 'N°',
  rodapeEndereco:
    'Av. Ipiranga n° 6681, Prédio 30 Bloco A, Sala 210 – Partenon · CEP 90619-900 – Porto Alegre – RS – Brasil',
  rodapeContato: 'Tel.: (51) 3320 3551 · labelo@pucrs.br · www.labelo.com.br',

  /* ── capa ── */
  cancelaSubstitui: 'Cancela e Substitui o Relatório de Ensaio N° ',
  periodoRealizacao: 'Período de realização dos ensaios:',
  periodoAte: 'até',
  dataEmissaoRelatorio: 'Data de emissão do relatório:',
  cabecalhoPeriodo: 'Período:',
  cabecalhoPeriodoA: 'a',
  cabecalhoEmissao: 'Emissão:',

  /* ── Parte 1 ── */
  parte1: 'Parte 1 - Identificação e condições gerais',
  secCliente: '1. Cliente:',
  cep: 'CEP:',
  secObjeto: '2. Objeto ensaiado (amostra):',
  fabricante: 'Fabricante',
  modelo: 'Modelo',
  numeroSerie: 'Número de série',
  lacre: 'Lacre',
  tensaoAlimentacao: 'Tensão de alimentação:',
  potenciaNominal: 'Potência nominal:',
  frequenciaRede: 'Frequência de rede:',
  orcamentoLabelo: 'Orçamento LABELO:',
  protocoloLabelo: 'Protocolo LABELO:',
  protocoloLabeloRotulo: 'Protocolo LABELO',
  acessorioDriver: 'Acessório de Ensaio (Driver):',
  naoIdentificado: 'Não identificado',
  docAcompanha: 'Documentação que acompanha a amostra:',
  observacoes: 'Observações:',

  /* ── conformidade ── */
  ensaioConduzida: 'Perturbações Conduzidas',
  ensaioLoop: 'Perturbações Radiadas – Antena Loop',
  ensaioAnexoB: 'Perturbações Radiadas – Anexo B (30–300 MHz)',
  conformeTexto:
    'Os resultados deste relatório de ensaios apresentam itens conformes. Informações adicionais podem ser acessadas em Parte 2 – Resultados dos ensaios.',
  naoConformePre: 'Os resultados deste relatório de ensaios apresentam itens ',
  naoConformeForte: 'não conformes',
  naoConformeMeio: 'O(s) ensaio(s) de ',
  naoConformePos:
    ' apresentou(aram) resultados não conformes com os limites estabelecidos pela norma. Informações adicionais podem ser acessadas em Parte 2 – Resultados dos ensaios.',

  /* ── documentos normativos ── */
  secNormativos: '3. Documento(s) normativo(s) utilizado(s):',
  portaria62:
    'Portaria INMETRO n°62, de 17 de fevereiro de 2022 - Regulamento Técnico de Qualidade e os Requisitos de Avaliação da Conformidade para Luminárias para a iluminação pública Viária - Consolidado.',
  normaCispr15:
    'Associação Brasileira de Normas Técnicas. NBR IEC/CISPR 15/2014 - Limites e métodos de medição das radioperturbações características dos equipamentos elétricos de iluminação e similares. Rio de Janeiro, RJ, Brasil, 2014.',
  secComplementares: '3.1 Documento(s) complementar(es):',
  complementaresNota:
    'Os documentos complementares abaixo indicados não fazem parte do escopo de acreditação deste laboratório.',
  cispr1642:
    'International Electrotechnical Commission. CISPR 16-4-2 - Second Edition/2011, Specification for radio disturbance and immunity measuring apparatus and methods – Part 4-2: Uncertainties, statistics and limit modeling – Uncertainty in EMC measurements. Geneva, Switzerland.',

  /* ── ambientais e observações ── */
  secAmbientais: '4. Condições ambientais:',
  temperatura: 'Temperatura: 20 °C ± 5 °C',
  umidade: 'Umidade Relativa: 55 % ± 15 %',
  secObservacoes: '5. Observações:',
  regraDecisao:
    'A regra de decisão aplicada para a avaliação da conformidade do item de ensaio foi estabelecida conforme documentos normativos indicados no item 3 deste relatório e previamente contratados.',
  itensNaoSolicitados:
    'Itens dos documentos normativos de referência deste relatório não descritos com resultados não foram solicitados pelo requerente ou não fazem parte do escopo de acreditação do laboratório.',
  luminariaTensoesPre:
    'De acordo com o item 6.1.1.4.1.5 da Portaria INMETRO citada no item 3 da parte 1, o ensaio de interferência eletromagnética e rádio frequência foi conduzido nas tensões nominais de ',
  luminariaTensoesPos: '.',

  /* ── Parte 2 ── */
  parte2: 'Parte 2 – Resultados dos ensaios',
  parte2Titulo: 'Parte 2 – Resultados dos Ensaios',
  metodoConduzidas:
    '1. Método de medição das tensões de perturbação conduzidas (Item 8 da Norma NBR IEC/CISPR 15/2014)',
  conduzidas1: 'A tensão de perturbação foi medida nos terminais de alimentação do sistema de iluminação.',
  conduzidas2:
    'Os terminais de saída da LISN e os terminais do equipamento em ensaio foram interligados por um cabo flexível com 3 condutores para conexão dos terminais de fase, neutro e terra.',
  conduzidas3:
    'A distância entre os terminais de saída da LISN e os terminais do equipamento em ensaio foi ajustada para 0,8 m.',
  conduzidas4: 'As medições foram realizadas tanto no condutor fase como no condutor neutro, um de cada vez.',
  limitesConduzidos: '1.1 Limites (Item 4 da Norma NBR IEC/CISPR 15/2014)',
  termAlimentacao: '1.1.1. Terminais de alimentação (Item 4.3.1 da Norma NBR IEC/CISPR 15/2014):',
  termCarga: '1.1.2. Terminais de carga (Item 4.3.2 da Norma NBR IEC/CISPR 15/2014):',
  termControle: '1.1.3. Terminais de controle (Item 4.3.3 da Norma NBR IEC/CISPR 15/2014):',

  metodoRadiadas9k:
    '2. Método de medição das perturbações eletromagnéticas radiadas na faixa de 9 kHz a 30 MHz (Item 9 da Norma NBR IEC/CISPR 15/2014)',
  radiadas9k1: 'O equipamento a ser medido foi posicionado sobre uma mesa não condutora no centro da antena loop de 2,0 m.',
  radiadas9k2:
    'O receptor de medição foi conectado à antena loop por cabo coaxial blindado e a seleção de cada loop das 3 direções do campo foi efetuada através de uma chave coaxial.',
  radiadas9k3:
    'As medições foram feitas na faixa de frequências de 9 kHz a 30 MHz. As medições de quase pico foram realizadas apenas nas frequências em que as emissões de pico estavam próximas ou ultrapassaram a uma margem de 6 dB abaixo da linha de limite de quase-pico.',
  limitesRadiados9k: '2.1 Limites (Item 4 da Norma NBR IEC/CISPR 15/2014)',
  faixa9k30M: '2.1.1. Faixa de 9 kHz a 30 MHz (Item 4.4.1 da Norma NBR IEC/CISPR 15/2014):',

  metodoRadiadas30M:
    '3. Método de medição das perturbações eletromagnéticas radiadas na faixa de 30 MHz a 300 MHz (Item 9 da Norma NBR IEC/CISPR 15/2014)',
  radiadas30M1:
    'Ensaios na faixa de 30 MHz a 300 MHz podem ser realizados através das especificações do Anexo B e com os limites apresentados abaixo, conforme a norma.',
  radiadas30M2:
    'O equipamento em ensaio foi colocado sobre blocos não condutivos com 10 cm de altura, sobre plano de referência de aterramento (ground plane) com dimensões pelo menos 20 cm maiores que as dimensões do equipamento ensaiado.',
  radiadas30M3:
    'O equipamento foi ligado a uma rede de acoplamento/desacoplamento (CDN), montada sobre placa de metal conectada ao terra.',
  faixa30M300M: '3.1. Faixa de 30 MHz a 300 MHz (Item 4.4.2 da Norma NBR IEC/CISPR 15/2014):',

  /* ── incertezas ── */
  secIncertezas: 'Incertezas de Medição (IM)',
  incerteza1:
    'A incerteza expandida de medição relatada é declarada como a incerteza padrão de medição multiplicada pelo fator de abrangência "k", para uma distribuição de probabilidade tipo t-Student, com graus de liberdade efetivos (veff) correspondentes a um nível de confiança de aproximadamente 95%.',
  incerteza2:
    'A incerteza padrão da medição foi determinada de acordo com o "Guia para Expressão da Incerteza de Medição", Terceira Edição Brasileira.',

  /* ── fotos ── */
  fotosAmostra: 'Fotos da Amostra',
  figura: 'Figura',
  amostraEnsaiada: 'Amostra ensaiada',
  remover: '✕ remover',

  /* ── emenda ── */
  historicoAlteracoes: '6. Histórico de Alterações',
  emendaPre: 'Emenda ',
  emendaEmitidaEm: ' emitida em ',
  emendaReferente: ', referente ao Relatório de Ensaio n° ',
  emendaListadas: '. As alterações identificadas em relação ao documento original são listadas abaixo:',
  colNumero: 'N°',
  colDescricaoAlteracao: 'Descrição da Alteração',

  /* ── observações finais ── */
  observacoesFinais: 'Observações Finais',
  obsCgcre: 'Este relatório de ensaio atende aos requisitos de acreditação da Cgcre, que avaliou a competência do laboratório.',
  obsFornecimento:
    'O fornecimento da amostra pelo cliente isenta o LABELO-PUCRS de responsabilidade quanto à sua representatividade em relação a lotes de fabricação e comercialização.',
  obsExclusivo:
    'O presente relatório de ensaio é medido exclusivamente para a amostra ensaiada, nas condições em que foram realizados os ensaios e não sendo extensivo a quaisquer lotes, mesmo que similares.',
  obsRetirada:
    'A partir do momento em que a amostra é retirada do laboratório, esgota-se a possibilidade de contestação dos resultados ou mesmo de repetição dos ensaios, já que o LABELO deixa de ser responsável pela sua manutenção.',
  obsReproducao:
    'É vedada a reprodução do presente relatório de ensaio, no todo ou em parte, sem prévia autorização do LABELO-PUCRS originada por solicitação formal do contratante.',
  obsIlac: 'A Cgcre é signatária do Acordo de Reconhecimento Mútuo da ILAC (International Laboratory Accreditation Cooperation).',
  obsIaac: 'A Cgcre é signatária do Acordo de Reconhecimento Mútuo da IAAC (InterAmerican Accreditation Cooperation).',
  obsInstalacoes: 'Os ensaios foram realizados nas instalações do LABELO-PUCRS.',

  /* ── assinatura ── */
  signatarioAutorizado: 'Signatário Autorizado',
  assinadoDigitalmentePor: 'Assinado de forma digital por',
  dataAssinatura: 'Dados:',
  certificadoConfigurado: 'Certificado configurado',

  /* ── tabelas ── */
  limCond1: {
    cols: ['Faixa de Frequência (MHz)', 'Limite Quase Pico (dBμV)', 'Limite Médio (dBμV)'],
    rows: [
      ['0,009 a 0,05', '110', '—'], ['0,05 a 0,15', '90 a 80', '—'],
      ['0,15 a 0,5', '66 a 56', '56 a 46'], ['0,5 a 5', '56', '46'], ['5 a 30', '60', '50'],
    ],
    note: '(1) Na freq. de transição, o limite inferior se aplica. (2) O limite decresce linearmente com o logaritmo da frequência nas faixas de 50–150 kHz e 150–500 kHz.',
  } as TabelaLimite,
  limCond2: {
    cols: ['Faixa de Frequência (MHz)', 'Limite Quase Pico (dBμV)', 'Limite Médio (dBμV)'],
    rows: [['0,15 a 0,5', '80', '70'], ['0,5 a 30', '74', '64']],
    note: '(1) Na freq. de transição, o limite inferior se aplica.',
  } as TabelaLimite,
  limCond3: {
    cols: ['Faixa de Frequência (MHz)', 'Limite Quase Pico (dBμV)', 'Limite Médio (dBμV)'],
    rows: [['0,15 a 0,5', '84 a 74', '74 a 64'], ['0,5 a 30', '74', '64']],
    note: '(1) Os limites diminuem linearmente com o logaritmo da frequência na faixa de 0,15 a 0,5 MHz.',
  } as TabelaLimite,
  limRad1: {
    cols: ['Faixa de Frequência (MHz)', 'Limite Antena Loop 2 m (dBμA)'],
    rows: [['0,009 a 0,07', '88'], ['0,07 a 0,15', '88 a 58'], ['0,15 a 3', '58 a 22'], ['3 a 30', '22']],
    note: '(1) Na freq. de transição, o limite inferior se aplica. (2) O limite decresce linearmente com o logaritmo da frequência nas faixas 70–150 kHz e 150 kHz–3 MHz.',
  } as TabelaLimite,
  limRad2: {
    cols: ['Faixa de Frequência (MHz)', 'Limite Quase Pico (dBμV/m)'],
    rows: [['30 a 100', '64 a 54'], ['100 a 230', '54'], ['230 a 300', '61']],
    note: '(1) Na freq. de transição, o limite inferior se aplica. (2) O limite decresce linearmente com o logaritmo da frequência na faixa de 30–100 MHz.',
  } as TabelaLimite,
  tabIncerteza: {
    cols: ['Item da norma', 'Mensurando', 'Faixa ou ponto de medição', 'Incerteza de medição', 'Fator de abrangência (k)'],
    rows: [
      ['4.3.1', 'Distúrbios conduzidos', '9 kHz – 150 kHz', '4,5 dB', '2,00'],
      ['4.3.1', 'Distúrbios conduzidos', '150 kHz – 30,0 MHz', '4,4 dB', '2,00'],
      ['4.4.1', 'Distúrbios radiados', '9 kHz – 30,0 MHz', '4,8 dB', '2,00'],
      ['4.4.2', 'Distúrbios radiados', '30,0 MHz – 300,0 MHz', '3,7 dB', '2,00'],
    ],
  } as TabelaLimite,
}

/* Tradução técnica. Escolhas que valem registro:
   - "Relatório de Ensaio" → "Test Report" (não "Essay/Trial").
   - "Perturbação" → "disturbance", vocabulário de CISPR/IEC, não "interference".
   - "Quase pico" → "quasi-peak"; "Limite médio" → "average limit" (detectores).
   - "Mensurando" → "measurand" (VIM); "Fator de abrangência" → "coverage factor"
     (GUM); "incerteza expandida" → "expanded uncertainty".
   - "Lacre" → "seal"; "Orçamento" → "quotation"; "Protocolo" → "protocol",
     que é como o próprio LABELO identifica a entrada da amostra.
   - Separador decimal vira PONTO nos números (0,8 m → 0.8 m). */
const EN: typeof PT = {
  universidade: 'Pontifical Catholic University of Rio Grande do Sul',
  labeloNome: 'LABELO - Specialized Laboratories in Electrical and Electronic Engineering',
  labeloSub: 'Calibration and Testing',
  rede: 'Brazilian Network of Testing Laboratories',
  acreditacaoCabecalho:
    'Testing Laboratory accredited by Cgcre in accordance with ABNT NBR ISO/IEC 17025 under number CRL 0075',
  relatorioDeEnsaio: 'Test Report',
  numeroAbrev: 'No.',
  rodapeEndereco:
    'Av. Ipiranga 6681, Building 30 Block A, Room 210 – Partenon · ZIP 90619-900 – Porto Alegre – RS – Brazil',
  rodapeContato: 'Phone: +55 51 3320 3551 · labelo@pucrs.br · www.labelo.com.br',

  cancelaSubstitui: 'Cancels and Replaces Test Report No. ',
  periodoRealizacao: 'Testing period:',
  periodoAte: 'to',
  dataEmissaoRelatorio: 'Report issue date:',
  cabecalhoPeriodo: 'Period:',
  cabecalhoPeriodoA: 'to',
  cabecalhoEmissao: 'Issued:',

  parte1: 'Part 1 - Identification and general conditions',
  secCliente: '1. Customer:',
  cep: 'ZIP code:',
  secObjeto: '2. Item under test (sample):',
  fabricante: 'Manufacturer',
  modelo: 'Model',
  numeroSerie: 'Serial number',
  lacre: 'Seal',
  tensaoAlimentacao: 'Supply voltage:',
  potenciaNominal: 'Rated power:',
  frequenciaRede: 'Mains frequency:',
  orcamentoLabelo: 'LABELO quotation:',
  protocoloLabelo: 'LABELO protocol:',
  protocoloLabeloRotulo: 'LABELO protocol',
  acessorioDriver: 'Test accessory (driver):',
  naoIdentificado: 'Not identified',
  docAcompanha: 'Documentation accompanying the sample:',
  observacoes: 'Remarks:',

  ensaioConduzida: 'Conducted disturbances',
  ensaioLoop: 'Radiated disturbances – Loop antenna',
  ensaioAnexoB: 'Radiated disturbances – Annex B (30–300 MHz)',
  conformeTexto:
    'The results in this test report show compliant items. Additional information can be found in Part 2 – Test results.',
  naoConformePre: 'The results in this test report show ',
  naoConformeForte: 'non-compliant',
  naoConformeMeio: ' items. The test(s) of ',
  naoConformePos:
    ' showed results that do not comply with the limits established by the standard. Additional information can be found in Part 2 – Test results.',

  secNormativos: '3. Normative document(s) used:',
  portaria62:
    'INMETRO Ordinance No. 62 of 17 February 2022 - Technical Quality Regulation and Conformity Assessment Requirements for Luminaires for Public Road Lighting - Consolidated.',
  normaCispr15:
    'Brazilian Association of Technical Standards. NBR IEC/CISPR 15/2014 - Limits and methods of measurement of radio disturbance characteristics of electrical lighting and similar equipment. Rio de Janeiro, RJ, Brazil, 2014.',
  secComplementares: '3.1 Supplementary document(s):',
  complementaresNota:
    'The supplementary documents listed below are not part of the accreditation scope of this laboratory.',
  cispr1642:
    'International Electrotechnical Commission. CISPR 16-4-2 - Second Edition/2011, Specification for radio disturbance and immunity measuring apparatus and methods – Part 4-2: Uncertainties, statistics and limit modeling – Uncertainty in EMC measurements. Geneva, Switzerland.',

  secAmbientais: '4. Environmental conditions:',
  temperatura: 'Temperature: 20 °C ± 5 °C',
  umidade: 'Relative humidity: 55 % ± 15 %',
  secObservacoes: '5. Remarks:',
  regraDecisao:
    'The decision rule applied to assess the conformity of the test item was established in accordance with the normative documents indicated in item 3 of this report and previously agreed upon.',
  itensNaoSolicitados:
    'Items of the reference normative documents of this report that are not reported with results were either not requested by the applicant or are not part of the laboratory accreditation scope.',
  luminariaTensoesPre:
    'In accordance with item 6.1.1.4.1.5 of the INMETRO Ordinance cited in item 3 of Part 1, the electromagnetic and radio-frequency interference test was carried out at the rated voltages of ',
  luminariaTensoesPos: '.',

  parte2: 'Part 2 – Test results',
  parte2Titulo: 'Part 2 – Test Results',
  metodoConduzidas:
    '1. Measurement method for conducted disturbance voltages (Clause 8 of NBR IEC/CISPR 15/2014)',
  conduzidas1: 'The disturbance voltage was measured at the supply terminals of the lighting system.',
  conduzidas2:
    'The output terminals of the LISN and the terminals of the equipment under test were connected by a 3-conductor flexible cable for the line, neutral and earth terminals.',
  conduzidas3:
    'The distance between the LISN output terminals and the terminals of the equipment under test was set to 0.8 m.',
  conduzidas4: 'Measurements were carried out on both the line conductor and the neutral conductor, one at a time.',
  limitesConduzidos: '1.1 Limits (Clause 4 of NBR IEC/CISPR 15/2014)',
  termAlimentacao: '1.1.1. Supply terminals (Clause 4.3.1 of NBR IEC/CISPR 15/2014):',
  termCarga: '1.1.2. Load terminals (Clause 4.3.2 of NBR IEC/CISPR 15/2014):',
  termControle: '1.1.3. Control terminals (Clause 4.3.3 of NBR IEC/CISPR 15/2014):',

  metodoRadiadas9k:
    '2. Measurement method for radiated electromagnetic disturbances in the 9 kHz to 30 MHz range (Clause 9 of NBR IEC/CISPR 15/2014)',
  radiadas9k1: 'The equipment under test was placed on a non-conductive table at the centre of the 2.0 m loop antenna.',
  radiadas9k2:
    'The measuring receiver was connected to the loop antenna by a shielded coaxial cable, and the selection of each of the 3 field-direction loops was made by a coaxial switch.',
  radiadas9k3:
    'Measurements were made over the frequency range from 9 kHz to 30 MHz. Quasi-peak measurements were carried out only at frequencies where the peak emissions were close to or exceeded a margin of 6 dB below the quasi-peak limit line.',
  limitesRadiados9k: '2.1 Limits (Clause 4 of NBR IEC/CISPR 15/2014)',
  faixa9k30M: '2.1.1. Range from 9 kHz to 30 MHz (Clause 4.4.1 of NBR IEC/CISPR 15/2014):',

  metodoRadiadas30M:
    '3. Measurement method for radiated electromagnetic disturbances in the 30 MHz to 300 MHz range (Clause 9 of NBR IEC/CISPR 15/2014)',
  radiadas30M1:
    'Tests in the 30 MHz to 300 MHz range may be carried out according to the specifications of Annex B and with the limits presented below, as per the standard.',
  radiadas30M2:
    'The equipment under test was placed on non-conductive blocks 10 cm high, over a ground reference plane with dimensions at least 20 cm larger than the dimensions of the equipment under test.',
  radiadas30M3:
    'The equipment was connected to a coupling/decoupling network (CDN) mounted on a metal plate bonded to earth.',
  faixa30M300M: '3.1. Range from 30 MHz to 300 MHz (Clause 4.4.2 of NBR IEC/CISPR 15/2014):',

  secIncertezas: 'Measurement Uncertainties (MU)',
  incerteza1:
    'The reported expanded measurement uncertainty is stated as the standard measurement uncertainty multiplied by the coverage factor "k", for a t-Student probability distribution with effective degrees of freedom (veff) corresponding to a confidence level of approximately 95%.',
  incerteza2:
    'The standard measurement uncertainty was determined in accordance with the "Guide to the Expression of Uncertainty in Measurement", Third Brazilian Edition.',

  fotosAmostra: 'Photographs of the Sample',
  figura: 'Figure',
  amostraEnsaiada: 'Sample under test',
  remover: '✕ remove',

  historicoAlteracoes: '6. Revision History',
  emendaPre: 'Amendment ',
  emendaEmitidaEm: ' issued on ',
  emendaReferente: ', referring to Test Report No. ',
  emendaListadas: '. The changes identified with respect to the original document are listed below:',
  colNumero: 'No.',
  colDescricaoAlteracao: 'Description of change',

  observacoesFinais: 'Final Remarks',
  obsCgcre: 'This test report meets the accreditation requirements of Cgcre, which assessed the competence of the laboratory.',
  obsFornecimento:
    'The supply of the sample by the customer exempts LABELO-PUCRS from responsibility for its representativeness in relation to manufacturing and commercial lots.',
  obsExclusivo:
    'This test report applies exclusively to the sample tested, under the conditions in which the tests were carried out, and does not extend to any lots, even similar ones.',
  obsRetirada:
    'Once the sample is removed from the laboratory, the possibility of contesting the results or of repeating the tests is no longer available, since LABELO ceases to be responsible for its preservation.',
  obsReproducao:
    'Reproduction of this test report, in whole or in part, is prohibited without prior authorization from LABELO-PUCRS arising from a formal request by the contracting party.',
  obsIlac: 'Cgcre is a signatory to the Mutual Recognition Arrangement of ILAC (International Laboratory Accreditation Cooperation).',
  obsIaac: 'Cgcre is a signatory to the Mutual Recognition Agreement of IAAC (InterAmerican Accreditation Cooperation).',
  obsInstalacoes: 'The tests were carried out at the facilities of LABELO-PUCRS.',

  signatarioAutorizado: 'Authorized Signatory',
  assinadoDigitalmentePor: 'Digitally signed by',
  dataAssinatura: 'Date:',
  certificadoConfigurado: 'Configured certificate',

  limCond1: {
    cols: ['Frequency range (MHz)', 'Quasi-peak limit (dBμV)', 'Average limit (dBμV)'],
    rows: [
      ['0.009 to 0.05', '110', '—'], ['0.05 to 0.15', '90 to 80', '—'],
      ['0.15 to 0.5', '66 to 56', '56 to 46'], ['0.5 to 5', '56', '46'], ['5 to 30', '60', '50'],
    ],
    note: '(1) At the transition frequency, the lower limit applies. (2) The limit decreases linearly with the logarithm of the frequency in the ranges 50–150 kHz and 150–500 kHz.',
  },
  limCond2: {
    cols: ['Frequency range (MHz)', 'Quasi-peak limit (dBμV)', 'Average limit (dBμV)'],
    rows: [['0.15 to 0.5', '80', '70'], ['0.5 to 30', '74', '64']],
    note: '(1) At the transition frequency, the lower limit applies.',
  },
  limCond3: {
    cols: ['Frequency range (MHz)', 'Quasi-peak limit (dBμV)', 'Average limit (dBμV)'],
    rows: [['0.15 to 0.5', '84 to 74', '74 to 64'], ['0.5 to 30', '74', '64']],
    note: '(1) The limits decrease linearly with the logarithm of the frequency in the range 0.15 to 0.5 MHz.',
  },
  limRad1: {
    cols: ['Frequency range (MHz)', 'Loop antenna limit, 2 m (dBμA)'],
    rows: [['0.009 to 0.07', '88'], ['0.07 to 0.15', '88 to 58'], ['0.15 to 3', '58 to 22'], ['3 to 30', '22']],
    note: '(1) At the transition frequency, the lower limit applies. (2) The limit decreases linearly with the logarithm of the frequency in the ranges 70–150 kHz and 150 kHz–3 MHz.',
  },
  limRad2: {
    cols: ['Frequency range (MHz)', 'Quasi-peak limit (dBμV/m)'],
    rows: [['30 to 100', '64 to 54'], ['100 to 230', '54'], ['230 to 300', '61']],
    note: '(1) At the transition frequency, the lower limit applies. (2) The limit decreases linearly with the logarithm of the frequency in the range 30–100 MHz.',
  },
  tabIncerteza: {
    cols: ['Standard clause', 'Measurand', 'Measurement range or point', 'Measurement uncertainty', 'Coverage factor (k)'],
    rows: [
      ['4.3.1', 'Conducted disturbances', '9 kHz – 150 kHz', '4.5 dB', '2.00'],
      ['4.3.1', 'Conducted disturbances', '150 kHz – 30.0 MHz', '4.4 dB', '2.00'],
      ['4.4.1', 'Radiated disturbances', '9 kHz – 30.0 MHz', '4.8 dB', '2.00'],
      ['4.4.2', 'Radiated disturbances', '30.0 MHz – 300.0 MHz', '3.7 dB', '2.00'],
    ],
  },
}

/** Textos do idioma pedido. Sem idioma (ou valor inválido) = português. */
export function textos(idioma?: Idioma): typeof PT {
  return idioma === 'en' ? EN : PT
}

/* ─── glossário do relatório do Radimation (o .docx) ─────────────────────────
 *
 * O arquivo do Radimation já sai quase todo em inglês — "Pass", "Quasi-Peak
 * Limit", "Average Limit", "Peak Number", "Frequency (MHz)", "Status", "LISN",
 * "Line", "Neutral", "Loop A/B/C" vêm assim da origem. O que está em português
 * é um conjunto pequeno e fechado, levantado dos arquivos reais do laboratório:
 * 8 frases distintas, todas geradas por máquina.
 *
 * Por isso aqui é GLOSSÁRIO, não tradução automática: cada regra é uma frase
 * conhecida, e o que não estiver na lista fica em português — visível, para ser
 * reportado e adicionado. Num relatório assinado, deixar uma frase intacta é
 * melhor que traduzir errado um texto que ninguém revisou.
 *
 * As regras capturam os números (tensão e faixa de frequência) em vez de fixá-los,
 * então 127 V, 220 V, 277 V ou uma faixa nova funcionam sem mudança aqui. */
const GLOSSARIO_DOCX: [RegExp, string][] = [
  // Mais específicas primeiro: a de "faixa" contém "Perturbações eletromagnéticas".
  [/Perturbações eletromagnéticas radiadas na faixa de ([\d.,]+)\s*(kHz|MHz|GHz) a ([\d.,]+)\s*(kHz|MHz|GHz) em ([\d.,]+)\s*V/gi,
   'Radiated electromagnetic disturbances in the range $1 $2 to $3 $4 at $5 V'],
  [/Tensões de perturbação conduzidas nos terminais de alimentação em ([\d.,]+)\s*V/gi,
   'Conducted disturbance voltages at the supply terminals at $1 V'],
  [/Nenhum pico detectado\./gi, 'No peak detected.'],
  [/Picos Detectados/gi,        'Detected Peaks'],
]

/** Aplica o glossário a um trecho de TEXTO do docx (nunca a HTML cru: quem
 *  chama percorre os nós de texto, para não haver risco de mexer em atributo
 *  ou quebrar uma tag). Em português devolve o texto intacto. */
export function traduzirTextoDocx(texto: string, idioma: Idioma): string {
  if (idioma !== 'en' || !texto) return texto
  let saida = texto
  for (const [de, para] of GLOSSARIO_DOCX) saida = saida.replace(de, para)
  return saida
}

/** Rótulo do identificador da amostra, por tipo e idioma. */
export function rotuloIdentificador(tipo: 'lampada' | 'luminaria', idioma: Idioma): string {
  if (idioma === 'en') return 'Serial number'
  return tipo === 'lampada' ? 'Número de série' : 'N° de Série'
}
