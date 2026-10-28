// Mesmas saídas do registro_py.py com lib/vigia/registro.ts (+ ensaiosSalvos de lib/vigia/server.ts);
// compara com o JSON do Python (argv[2]). VIGIA_PASTA = pasta do VIGIA (só leitura).
//   node --experimental-transform-types --import ./loader-alias.mjs registro_ts.mjs registro_py.json [registro.json]
import fs from 'fs'
import path from 'path'
const R = await import('@/lib/vigia/registro')
const { ensaiosSalvos } = await import('@/lib/vigia/server')

const lista = await ensaiosSalvos(['resultados'])
const out = { ensaios_salvos: [], importar: {}, montar: {}, proxima: [], fmt: [], stats_inicial: null }
for (const e of lista) {
  out.ensaios_salvos.push({ rel: e.rel, nome: e.nome, quando: e.quando, ordem: e.ordem, totais: e.totais, defs: e.defs,
    segmentos: Object.fromEntries(Object.entries(e.segmentos).map(([k, v]) => [k, v.length])) })
}
const resumo = (reg, ens_nome) => {
  const ens = reg.ensaios[ens_nome]
  const ref = R.stats_inicial(reg.iniciais[ens.ref]).media
  return ens.blocos.map(b => {
    const fx = b.faixas ?? []
    return { bloco: b, stats: R.stats_bloco(b, ref), idx: R.indices_faixa(b.linhas, fx),
      faixas: fx.map((x, i) => R.stats_faixa(b, x, i === fx.length - 1)) }
  })
}
const novoComInicial = () => {
  const reg = R.novo_registro()
  reg.iniciais['INICIAL (RF-Irradiada)'].linhas.forEach((l, i) => { l.volume = 4.0 + ((i % 3) - 1) * 0.002 })
  return reg
}
for (const e of lista) {
  const est = JSON.parse(fs.readFileSync(path.join(e.pasta, 'estado_ensaio.json'), 'utf8'))
  let [ls, tt] = R.leiturasETotais(est, e.rel)
  ls = R.ordenar_leituras(ls.filter(l => l.volume !== null && l.volume !== undefined))
  for (const [ens_nome, modo] of [['1.2 - IEC 61000-4-3', 'acrescentar'], ['1.5 - IEC 61000-4-4', 'preencher']]) {
    const reg = novoComInicial()
    reg.dados.preco = '5,79'
    const cont = R.importar(reg, ens_nome, ls, null, modo)
    const n_tot = R.preencher_totalizadores(reg, ens_nome, ls, tt, null)
    out.importar[`${e.rel} | ${ens_nome}`] = { cont, n_tot, blocos: resumo(reg, ens_nome) }
  }
}
{
  const reg = novoComInicial()
  const partes = lista.flatMap(e => Object.values(e.segmentos).map(ls => [structuredClone(ls), e.totais]))
  const [cont, n_tot, avisos] = R.montar_por_segmento(reg, '1.2 - IEC 61000-4-3', partes, true)
  out.montar = { cont, n_tot, avisos, blocos: resumo(reg, '1.2 - IEC 61000-4-3') }
}
const fx43 = R.novo_registro().ensaios['1.2 - IEC 61000-4-3'].blocos[0].faixas
for (const fs_ of [[], [80], [80, 81.5], [299.5], [300], [999], [2990], [3000], [0.15, 79.9]]) {
  const linhas = fs_.map(f => ({ rotulo: R.rotulo_freq(f), volume: null, obs: '' }))
  out.proxima.push([R.proxima_freq(linhas, null, fx43), R.proxima_freq(linhas, linhas.length ? 0 : null, fx43)])
}
for (const v of [null, '', 'x', 0.0, -0.0004, 1.2345, 2.5, 0.125, 1234.5678, -3.14159]) {
  out.fmt.push(typeof v !== 'string' || v ? [R.fmt(v, 2), R.fmt(v, 3)] : [R.fmt(v)])
}
for (const f of [0.15, 80, 80.8, 1000, 1010.0, 2999.99, 3000, null]) out.fmt.push([R._fmt_mhz(f), f ? R.rotulo_freq(f) : ''])
for (const s of ['1.234,56', '92,11', ' 4 ', '', null, 'abc', '1,5e3', 3]) out.fmt.push(R.num(s))
if (process.argv[3]) {
  const reg = R.completar(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')))
  out.stats_inicial = Object.fromEntries(R.INICIAIS.map(n => [n, R.stats_inicial(reg.iniciais[n])]))
}

// comparação (floats com 12 algarismos: statistics.stdev do Python usa frações exatas)
const norm = v => (typeof v === 'number' ? Number(v.toPrecision(12)) : Array.isArray(v) ? v.map(norm)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])])) : v)
const py = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
let dif = 0
const cmp = (a, b, onde) => {
  const ja = JSON.stringify(norm(a)), jb = JSON.stringify(norm(b))
  if (ja !== jb) {
    dif++
    let i = 0
    while (i < ja.length && ja[i] === jb[i]) i++
    console.log('DIFERENTE', onde, '\n py', jb.slice(Math.max(0, i - 150), i + 150), '\n ts', ja.slice(Math.max(0, i - 150), i + 150))
  }
}
cmp(out.ensaios_salvos, py.ensaios_salvos, 'ensaios_salvos')
cmp(Object.keys(out.importar), Object.keys(py.importar), 'importar (chaves)')
for (const k of Object.keys(py.importar)) cmp(out.importar[k], py.importar[k], 'importar ' + k)
cmp(out.montar, py.montar, 'montar por segmento')
cmp(out.proxima, py.proxima, 'proxima_freq'); cmp(out.fmt, py.fmt, 'fmt/num'); cmp(out.stats_inicial, py.stats_inicial, 'stats_inicial')
const nl = Object.values(py.importar).reduce((s, x) => s + x.blocos.reduce((t, b) => t + b.bloco.linhas.length, 0), 0)
console.log(dif ? `${dif} diferença(s)` : `TUDO IGUAL — ${py.ensaios_salvos.length} ensaios salvos, ${Object.keys(py.importar).length} importações (${nl} linhas), `
  + `montagem por segmento (${Object.values(py.montar.cont).reduce((a, b) => a + b, 0)} leituras), próxima freq., formatos`)
