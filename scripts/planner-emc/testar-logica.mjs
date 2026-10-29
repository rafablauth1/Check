// Testes da lógica do planner (lib/emc/planner/logica.ts) — cenários montados à mão.
// Na raiz do repo (PowerShell):
//   $env:REPO_APP = (Get-Location).Path
//   node --experimental-transform-types --no-warnings --import ./scripts/vigia-paridade/loader-alias.mjs scripts/planner-emc/testar-logica.mjs
const L = await import('@/lib/emc/planner/logica')

let ok = 0, falhas = 0
const checar = (nome, cond, extra = '') => {
  if (cond) ok++
  else { falhas++; console.log('FALHOU:', nome, extra) }
}

const jornada = { inicio: '08:00', fim: '17:00', almocoInicio: '12:00', almocoFim: '13:00', dias: [1, 2, 3, 4, 5] }
const cfg = {
  jornada,
  setups: [
    { id: 'S_ESD', nome: 'Bancada ESD', equipamentoIds: [], ativo: true },
    { id: 'S_BURST', nome: 'Gerador burst', equipamentoIds: [], ativo: true },
    { id: 'S_CAM', nome: 'Câmara', equipamentoIds: [], ativo: true },
  ],
  tempos: [
    { ensaioId: 'esd', setupId: 'S_ESD', configuracao: 'esd', montagemMin: 30, ensaioMin: 60, relogioMin: 120, acompanhado: true },
    { ensaioId: 'burst', setupId: 'S_BURST', configuracao: 'burst', montagemMin: 40, ensaioMin: 50, acompanhado: true },
    { ensaioId: 'burstR', setupId: 'S_BURST', configuracao: 'burst', montagemMin: 40, ensaioMin: 30, acompanhado: true },
    { ensaioId: 'rad', setupId: 'S_CAM', configuracao: 'rad', montagemMin: 60, ensaioMin: 180, acompanhado: false,
      porTipo: { radar: { ensaioMin: 240 } } },
  ],
  pessoas: [
    { id: 'ana', nome: 'Ana', cor: '#fff', habilitacoes: ['esd', 'burst', 'burstR'], ativo: true },
    { id: 'bia', nome: 'Bia', cor: '#fff', habilitacoes: ['rad', 'burst'], ativo: true },
    { id: 'caio', nome: 'Caio', cor: '#fff', habilitacoes: ['esd', 'rad', 'burst', 'burstR'], ativo: false },
  ],
}
const ens = (id, extra = {}) => ({ ensaioId: id, codigo: id, nome: id, status: 'pendente', ...extra })
const item = (id, previsaoSaida, ensaios, extra = {}) => ({
  id, protocolo: id + '_EMC', cliente: 'c', produto: 'p', templateId: 'medidor', template: { nome: 'Medidor' },
  dataEntrada: '2026-10-20', previsaoSaida, numRelatorio: '', ensaios, respostas: {}, ...extra,
})
const itens = [
  item('A', '2026-11-05', [ens('esd', { relogio: true }), ens('burst'), ens('burstR'), ens('rad')]),
  item('B', '2026-11-03', [ens('esd'), ens('burst'), ens('rad')]),
  item('C', '', [ens('esd'), ens('burst'), ens('rad')]),
  item('D', '2026-11-01', [ens('esd')], { numRelatorio: 'R-1' }),                 // emitido: fora
  item('E', '2026-11-04', [ens('x419'), ens('esd', { status: 'realizado' })]),    // 4-19 sem tempo
  item('F', '2026-11-10', [ens('rad')], { templateId: 'radar' }),                 // tempo próprio do tipo
]
const itensMap = new Map(itens.map(i => [i.id, i]))
const hoje = '2026-11-02'
const dias = L.diasDaSemana(L.segundaDe(hoje), jornada)

/* relógio e datas */
checar('W', L.minutosUteis(jornada) === 480)
checar('relógio início no almoço vai para 13:00', L.relogioDe(240, jornada) === '13:00')
checar('relógio fim no almoço fica 12:00', L.relogioDe(240, jornada, true) === '12:00')
checar('relógio 300', L.relogioDe(300, jornada) === '14:00')
checar('minuto útil 12:30 = 240', L.minutoUtilDe(12 * 60 + 30, jornada) === 240)
checar('minuto útil 14:00 = 300', L.minutoUtilDe(14 * 60, jornada) === 300)
checar('segunda de quarta', L.segundaDe('2026-11-04') === '2026-11-02')
checar('segunda de domingo', L.segundaDe('2026-11-08') === '2026-11-02')
checar('dias úteis', JSON.stringify(dias) === JSON.stringify(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']), dias)
checar('fmtDuracao', L.fmtDuracao(90) === '1h30' && L.fmtDuracao(45) === '45 min' && L.fmtDuracao(120) === '2h')

/* tempos */
checar('relógio usa relogioMin', L.tempoDoEnsaio(cfg, 'esd', itensMap.get('A')).ensaioMin === 120)
checar('normal usa ensaioMin', L.tempoDoEnsaio(cfg, 'esd', itensMap.get('B')).ensaioMin === 60)
checar('tempo por tipo', L.tempoDoEnsaio(cfg, 'rad', itensMap.get('F')).ensaioMin === 240)
checar('sem tempo = null', L.tempoDoEnsaio(cfg, 'x419', itensMap.get('E')) === null)

/* tempo por tipo com acréscimos pelas respostas do cadastro (medidor: reativa, aquisição) */
const tplMedidor = {
  id: 'medidor', nome: 'Medidor', perguntas: [
    { id: 'reativa', texto: 'Mede reativa?', tipo: 'simnao' },
    { id: 'relogio', texto: 'Modo relógio?', tipo: 'simnao', marcaRelogio: ['esd'] },
    { id: 'aquisicao', texto: 'Aquisição', tipo: 'unica', opcoes: ['Display', 'Software'] },
    { id: 'so-fixo', texto: 'Oculta', tipo: 'simnao', mostrarQuando: [{ perguntaId: 'reativa', operador: 'eh', valor: 'nao' }] },
  ], regras: [],
}
const cfgTipo = { ...cfg, tempos: cfg.tempos.map(t => t.ensaioId !== 'esd' ? t : { ...t, porTipo: { medidor: {
  montagemMin: 40, ensaioMin: 70, relogioMin: 100, acrescimos: [
    { quando: [{ perguntaId: 'reativa', operador: 'eh', valor: 'sim' }], minutos: 20 },
    { quando: [{ perguntaId: 'aquisicao', operador: 'eh', valor: 'Software' }], minutos: 15 },
    { quando: [{ perguntaId: 'so-fixo', operador: 'eh', valor: 'sim' }], minutos: 500 },
    { quando: [], minutos: 999 },                                   // sem condição: não vale
  ] } } }) }
const med = (respostas, relogio = false) => ({ templateId: 'medidor', template: tplMedidor, respostas, ensaios: [ens('esd', relogio ? { relogio: true } : {})] })
const tt = (r, rel) => L.tempoDoEnsaio(cfgTipo, 'esd', med(r, rel))
checar('tipo: base', tt({ reativa: 'nao', aquisicao: 'Display' }).ensaioMin === 70, tt({ reativa: 'nao', aquisicao: 'Display' }).ensaioMin)
checar('tipo: reativa +20', tt({ reativa: 'sim', aquisicao: 'Display' }).ensaioMin === 90)
checar('tipo: software +15', tt({ reativa: 'nao', aquisicao: 'Software' }).ensaioMin === 85)
checar('tipo: relógio + reativa + software', tt({ reativa: 'sim', aquisicao: 'Software' }, true).ensaioMin === 135)
checar('tipo: montagem própria', tt({}).montagemMin === 40)
checar('tipo: pergunta oculta não conta', tt({ reativa: 'sim', 'so-fixo': 'sim' }).ensaioMin === 90)
checar('tipo: pergunta visível conta', tt({ reativa: 'nao', 'so-fixo': 'sim' }).ensaioMin === 570)
checar('outro tipo usa o geral', L.tempoDoEnsaio(cfgTipo, 'esd', { ...med({ reativa: 'sim' }), templateId: 'agua' }).ensaioMin === 60)
checar('tempoGastoMs', L.tempoGastoMs({ sessoes: [
  { inicio: '2026-11-02T10:00:00Z', fim: '2026-11-02T10:30:00Z' },
  { inicio: '2026-11-02T11:00:00Z' },
] }, Date.parse('2026-11-02T11:15:00Z')) === 45 * 60000)

/* organizar com uma tarefa fixada: C/rad com a Bia na quarta */
const fixada = { id: 'T-fix', itemId: 'C', ensaioId: 'rad', pessoaId: 'bia', setupId: 'S_CAM', dia: '2026-11-04', ordem: 0, fixada: true, status: 'afazer', sessoes: [] }
const prop = L.organizarSemana(cfg, itens, [fixada], dias, hoje, 0, Date.parse('2026-11-02T08:00:00'))

const chave = a => `${a.itemId}|${a.ensaioId}`
const aloc = new Map(prop.alocacoes.map(a => [chave(a), a]))
checar('D emitido fora', ![...aloc.keys()].some(k => k.startsWith('D|')))
checar('E 4-19 sem tempo', prop.naoAlocados.some(n => n.itemId === 'E' && n.ensaioId === 'x419' && /sem setup/.test(n.motivo)), JSON.stringify(prop.naoAlocados))
checar('E esd realizado não entra', !aloc.has('E|esd'))
checar('fixada continua na quarta com a Bia', aloc.get('C|rad')?.dia === '2026-11-04' && aloc.get('C|rad')?.pessoaId === 'bia' && aloc.get('C|rad')?.id === 'T-fix')
const esperado = ['A|esd', 'A|burst', 'A|burstR', 'A|rad', 'B|esd', 'B|burst', 'B|rad', 'C|esd', 'C|burst', 'C|rad', 'F|rad']
checar('todos os pendentes alocados', esperado.every(k => aloc.has(k)) && prop.naoAlocados.length === 1, JSON.stringify(prop.naoAlocados))
for (const a of prop.alocacoes) {
  const p = cfg.pessoas.find(x => x.id === a.pessoaId)
  checar(`habilitada ${chave(a)}`, p && L.habilitada(p, a.ensaioId), a.pessoaId)
}

// cronograma da proposta: sem sobreposição de setup, pessoa e amostra
const tarefas = prop.alocacoes.map((a, i) => ({ ...a, id: a.id ?? `n${i}`, status: 'afazer', sessoes: [], fixada: a.id === 'T-fix' }))
const cr = L.cronogramaSemana(cfg, tarefas, itensMap, dias, hoje, 0, 0)
const sobrepoe = (lista) => {
  const s = [...lista].sort((x, y) => x[0] - y[0])
  for (let i = 1; i < s.length; i++) if (s[i][0] < s[i - 1][1]) return true
  return false
}
for (const d of dias) {
  const doDia = tarefas.filter(t => t.dia === d).map(t => ({ t, b: cr.blocos.get(t.id) }))
  const grupos = (f, intervalo) => {
    const m = new Map()
    for (const x of doDia) { const k = f(x.t); if (!k) continue; m.set(k, [...(m.get(k) ?? []), intervalo(x)]) }
    return [...m.values()]
  }
  checar(`setup sem sobreposição ${d}`, grupos(t => t.setupId, x => [x.b.inicioMin, x.b.fimMin]).every(l => !sobrepoe(l)))
  checar(`amostra sem sobreposição ${d}`, grupos(t => t.itemId, x => [x.b.inicioMin, x.b.fimMin]).every(l => !sobrepoe(l)))
  checar(`pessoa sem sobreposição ${d}`, grupos(t => t.pessoaId, x => [x.b.inicioMin, x.b.inicioMin + x.b.pessoaMin]).every(l => !sobrepoe(l.filter(i => i[1] > i[0]))))
  for (const x of doDia) {
    checar(`dentro da jornada ${x.t.id}`, !x.b.foraDoHorario, JSON.stringify(x.b))
    checar(`não começa no almoço ${x.t.id}`, !(x.b.inicio >= '12:00' && x.b.inicio < '13:00'), x.b.inicio)
  }
}
// lote: 4-4 e 4-4R na mesma configuração → no gerador de burst a montagem só aparece uma vez na semana
const montBurst = tarefas.filter(t => t.setupId === 'S_BURST' && cr.blocos.get(t.id).montagemMin > 0)
checar('burst monta uma vez só', montBurst.length === 1, montBurst.map(t => t.id))
// ESD: B (prazo 03/11) antes de A (05/11) antes de C (sem prazo) — mesma configuração, então vai por urgência
const esd = tarefas.filter(t => t.setupId === 'S_ESD').sort((x, y) => x.dia.localeCompare(y.dia) || cr.blocos.get(x.id).inicioMin - cr.blocos.get(y.id).inicioMin).map(t => t.itemId)
checar('ESD começa pela mais urgente', esd[0] === 'B', esd)
// A está na câmara (09:30–14:30): o ESD não fica parado esperando, passa a C na frente
const blocoDe = (i, e) => cr.blocos.get(tarefas.find(t => t.itemId === i && t.ensaioId === e).id)
checar('setup não espera amostra ocupada', JSON.stringify(esd) === JSON.stringify(['B', 'C', 'A'])
  && blocoDe('C', 'esd').inicioMin < blocoDe('A', 'rad').fimMin && blocoDe('A', 'esd').inicioMin >= blocoDe('A', 'rad').fimMin, esd)
// relógio: A no ESD dura 120 min
const aEsd = tarefas.find(t => t.itemId === 'A' && t.ensaioId === 'esd')
checar('A esd 120 min', cr.blocos.get(aEsd.id).ensaioMin === 120)
// câmara não acompanhada: a Bia só fica presa na montagem (60)
const rads = tarefas.filter(t => t.setupId === 'S_CAM').map(t => cr.blocos.get(t.id))
checar('câmara: pessoa só na montagem + partida', rads.every(b => b.pessoaMin === b.montagemMin + L.PARTIDA_MIN), rads.map(b => b.pessoaMin))

/* cronograma com tarefa em execução hoje: começa de agora e conta o restante */
const exec = [{ id: 'X', itemId: 'B', ensaioId: 'esd', pessoaId: 'ana', setupId: 'S_ESD', dia: hoje, ordem: 0, status: 'execucao',
  sessoes: [{ inicio: '2026-11-02T09:00:00', pessoaId: 'ana' }] }]
const agoraMs = Date.parse('2026-11-02T09:40:00')
const cr2 = L.cronogramaSemana(cfg, exec, itensMap, dias, hoje, 100, agoraMs)
const bx = cr2.blocos.get('X')
checar('em execução: restante = 30+60-40', bx.inicioMin === 100 && bx.fimMin === 150, JSON.stringify(bx))

/* não cabe: ensaio de 10 h entra sozinho no começo do dia */
const cfgLongo = { ...cfg, tempos: cfg.tempos.map(t => t.ensaioId === 'rad' ? { ...t, ensaioMin: 600 } : t) }
const p3 = L.organizarSemana(cfgLongo, [item('G', '', [ens('rad')])], [], dias, hoje, 0, 0)
checar('ensaio maior que o dia entra no começo', p3.alocacoes.length === 1 && p3.alocacoes[0].dia === hoje, JSON.stringify(p3))
/* hoje já no fim do dia: vai para amanhã */
const p4 = L.organizarSemana(cfg, [item('H', '', [ens('esd')])], [], dias, hoje, 470, 0)
checar('fim do dia → amanhã', p4.alocacoes[0]?.dia === '2026-11-03', JSON.stringify(p4))
/* ninguém habilitado */
const p5 = L.organizarSemana({ ...cfg, pessoas: cfg.pessoas.filter(p => p.id !== 'bia') }, [item('I', '', [ens('rad')])], [], dias, hoje, 0, 0)
checar('ninguém habilitado', p5.naoAlocados[0]?.motivo === 'ninguém habilitado para o ensaio', JSON.stringify(p5))
/* tarefa já planejada numa semana seguinte não é puxada */
const futura = { id: 'FUT', itemId: 'J', ensaioId: 'esd', pessoaId: 'ana', setupId: 'S_ESD', dia: '2026-11-12', ordem: 0, status: 'afazer', sessoes: [] }
const p6 = L.organizarSemana(cfg, [item('J', '', [ens('esd')])], [futura], dias, hoje, 0, 0)
checar('futura fica', p6.alocacoes.length === 0 && p6.naoAlocados.length === 0, JSON.stringify(p6))
/* tarefa atrasada (dia passado, a fazer) é replanejada */
const atrasada = { ...futura, id: 'ATR', dia: '2026-10-28' }
const p7 = L.organizarSemana(cfg, [item('J', '', [ens('esd')])], [atrasada], dias, hoje, 0, 0)
checar('atrasada replanejada', p7.alocacoes[0]?.id === 'ATR' && p7.alocacoes[0]?.dia === hoje, JSON.stringify(p7))

console.log('\n' + prop.alocacoes.map(a => {
  const t = tarefas.find(x => (x.id === a.id) || (x.itemId === a.itemId && x.ensaioId === a.ensaioId))
  const b = cr.blocos.get(t.id)
  return `${a.dia} ${b.inicio}-${b.fim} ${a.setupId.padEnd(8)} ${a.itemId} ${a.ensaioId.padEnd(6)} ${a.pessoaId.padEnd(4)} mont=${b.montagemMin}`
}).join('\n'))
console.log(`\n${ok} ok, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
