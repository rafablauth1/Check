// Mesmas saídas do emc_py.py, com lib/vigia/emc.ts; compara com o JSON do Python (argv[2]).
import fs from 'fs'
const emc = await import('@/lib/vigia/emc')
const r9 = x => Math.round(x * 1e9) / 1e9
const out = { perfis: {}, fmt_freq: [], fmt_tempo: [], no_tempo: [] }
for (const [nome, segs] of Object.entries(emc.PERFIS_PADRAO)) {
  out.perfis[nome] = segs.map(s => {
    const fs = emc.frequencias(s)
    return { rotulo: emc.rotulo(s), aguardar: s.aguardar, n: fs.length, fs: [...fs.slice(0, 5), ...fs.slice(-3)].map(r9), dur: r9(emc.duracao(s)) }
  })
}
for (const f of [0.0005, 0.15, 0.999, 1, 12.345, 80, 299.995, 999.999, 1000, 2999.99999, 3000]) out.fmt_freq.push(emc.fmtFreq(f))
for (const t of [0, 0.4, 0.5, 1.5, 2.5, 59.5, 60, 3599.5, 3600, 7322.7]) out.fmt_tempo.push(emc.fmtTempo(t))
const s = emc.segmentoDe({ f_ini: 80, f_fim: 1000, passo_pct: 1, dwell_s: 1.37, extra_s: 0.1 })
for (const t of [0, 1.46, 1.47, 10, 100.3, 500, 10000]) out.no_tempo.push(emc.noTempo(s, t))
const py = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
let dif = 0
const cmp = (a, b, onde) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); if (ja !== jb) { dif++; console.log('DIFERENTE', onde, '\n py', jb.slice(0, 300), '\n ts', ja.slice(0, 300)) } }
cmp(Object.keys(out.perfis), Object.keys(py.perfis), 'ordem dos perfis')
for (const k of Object.keys(py.perfis)) cmp(out.perfis[k], py.perfis[k], k)
cmp(out.fmt_freq, py.fmt_freq, 'fmt_freq'); cmp(out.fmt_tempo, py.fmt_tempo, 'fmt_tempo'); cmp(out.no_tempo, py.no_tempo, 'no_tempo')
console.log(dif ? `${dif} diferença(s)` : `TUDO IGUAL — ${Object.keys(py.perfis).length} perfis, ${Object.values(py.perfis).flat().length} segmentos, formatação e passos`)
