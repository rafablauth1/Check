// Testes da padronização de nomes de equipamento (lib/equipamentos/nomes.ts).
// Rodar:
//   REPO_APP=. node --experimental-transform-types --no-warnings \
//     --import ./scripts/vigia-paridade/loader-alias.mjs scripts/equipamentos/testar-nomes.mjs
import { formatarNome, padronizarNome, planejarPadronizacao, precisaRevisar, chaveNome } from '../../lib/equipamentos/nomes.ts'

let ok = 0, falha = 0
function igual(obtido, esperado, msg) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) { ok++; return }
  falha++; console.log(`✗ ${msg}\n   obtido:   ${JSON.stringify(obtido)}\n   esperado: ${JSON.stringify(esperado)}`)
}

// caixa e preposições
igual(formatarNome('Balão volumétrico'), 'Balão Volumétrico', 'caixa por palavra')
igual(formatarNome('MANÔMETRO DIGITAL'), 'Manômetro Digital', 'tudo maiúsculo')
igual(formatarNome('Acoplador e desacoplador de rede'), 'Acoplador e Desacoplador de Rede', 'preposições minúsculas')
igual(formatarNome('de medição'), 'De Medição', 'primeira palavra sempre maiúscula')
igual(formatarNome('Trena a laser'), 'Trena a Laser', '"a" preposição')
// siglas e unidades
igual(formatarNome('receptor emi'), 'Receptor EMI', 'sigla')
igual(formatarNome('Medidor de pH'), 'Medidor de pH', 'pH')
igual(formatarNome('Balão Volumétrico 100ml'), 'Balão Volumétrico 100 mL', 'mL com espaço')
igual(formatarNome('Atenuador 10dB 100W 50Ω N 2GHz'), 'Atenuador 10 dB 100 W 50 Ω N 2 GHz', 'unidades RF')
igual(formatarNome('Atenuador 10 db'), 'Atenuador 10 dB', 'unidade solta após número')
igual(formatarNome('Limitador de Transiente (9kHz - 200MHz)'), 'Limitador de Transiente (9 kHz a 200 MHz)', 'faixa com traço')
igual(formatarNome('Transferpette Digital 100-1000uL'), 'Transferpette Digital 100-1000 µL', 'faixa µL')
igual(formatarNome('CMW500 radio'), 'CMW500 Radio', 'modelo com dígito mantém')
// grafia
igual(formatarNome('Freqüencímetro Digital'), 'Frequencímetro Digital', 'trema')
igual(formatarNome('Termohigrometro Digital'), 'Termo-Higrômetro Digital', 'termo-higrômetro')
igual(formatarNome('Watimetro Digital'), 'Wattímetro Digital', 'wattímetro')
igual(formatarNome('Micropipeta letrônica'), 'Micropipeta Eletrônica', 'eletrônica')
igual(formatarNome('Manômetro - Digital'), 'Manômetro Digital', 'traço entre palavras')
igual(formatarNome('REGUA GRADUADA ́'), 'Régua Graduada', 'acento órfão do PDF')
igual(formatarNome('GABARITO DE CALIBRAC ̧AO DE MICROSC ̃'), 'Gabarito de Calibração de Microscópio', 'cedilha separada')
// inglês e prefixos
igual(formatarNome('Coupling Decoupling Network'), 'Acoplador e Desacoplador de Rede', 'tradução CDN')
igual(formatarNome('EMI Test Receiver'), 'Receptor EMI', 'tradução receptor')
igual(formatarNome('do Instrumento de medição: Torquímetro digital'), 'Torquímetro Digital', 'prefixo do certificado')
igual(formatarNome('do equipamento qualificado: Ponto de fusão 4.1'), 'Ponto de Fusão', 'prefixo + item')
igual(formatarNome('do Instrumento de medição: Sensor de Campo - LUMILOOP'), 'Sensor de Campo', 'prefixo + modelo')
// lixo
igual(precisaRevisar(''), true, 'vazio revisa')
igual(precisaRevisar('CERTIFICADO'), true, 'CERTIFICADO revisa')
igual(precisaRevisar('LABELO - Laboratório de Ensaios'), true, 'nome do lab revisa')
igual(precisaRevisar('Balão Volumétrico'), false, 'nome normal não revisa')
// apelidos
const dic = { apelidos: { [chaveNome('Proveta')]: 'Proveta Graduada', [chaveNome('Termohigrômetro Digital')]: 'Termohigrômetro Digital' } }
igual(padronizarNome('proveta', dic), 'Proveta Graduada', 'apelido por grafia')
igual(padronizarNome('TERMOHIGRÔMETRO DIGITAL', dic), 'Termohigrômetro Digital', 'apelido preserva escolha do usuário')
igual(padronizarNome('  ', dic), '', 'vazio continua vazio')
igual(padronizarNome(padronizarNome('MANÔMETRO DIGITAL')), 'Manômetro Digital', 'idempotente')

// plano
const plano = planejarPadronizacao([
  { nome: 'Balão Volumétrico', qtd: 453 }, { nome: 'Balão volumétrico', qtd: 136 },
  { nome: 'MANÔMETRO DIGITAL', qtd: 9 }, { nome: 'Manômetro - Digital', qtd: 1 }, { nome: 'Manômetro', qtd: 1 },
  { nome: 'Proveta', qtd: 18 }, { nome: 'Proveta graduada', qtd: 9 },
  { nome: 'Atenuador 10 dB', qtd: 1 }, { nome: 'Atenuador 20 dB', qtd: 1 },
  { nome: 'CERTIFICADO', qtd: 15 }, { nome: '', qtd: 140 },
])
const por = Object.fromEntries(plano.map(p => [p.para, p]))
igual(por['Balão Volumétrico']?.qtd, 589, 'balão junta as duas grafias')
igual(por['Balão Volumétrico']?.muda, true, 'balão muda')
igual(por['Manômetro Digital']?.de.length, 2, 'manômetro digital junta 2 grafias')
igual(por['Proveta']?.parecidos, ['Proveta Graduada'], 'proveta sugere graduada (não junta sozinha)')
igual(por['Atenuador 10 dB']?.parecidos, [], 'atenuadores diferentes não são parecidos')
igual(plano.some(p => p.de.some(v => v.nome === 'CERTIFICADO' || v.nome === '')), false, 'lixo fora do plano')

console.log(`\n${ok} ok, ${falha} falha(s)`)
process.exit(falha ? 1 : 0)
