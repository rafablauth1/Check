// Compara lib/vigia/ciclo.ts e util.ts com a saída do ciclo_py.py (argv[2]).
import fs from 'fs'
const { DetectorCiclo, resumirCiclos } = await import('@/lib/vigia/ciclo')
const u = await import('@/lib/vigia/util')
const py = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
let dif = 0, nEv = 0
const cmp = (a, b, onde) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); if (ja !== jb) { dif++; if (dif < 12) console.log('DIFERENTE', onde, '\n py', jb.slice(0, 260), '\n ts', ja.slice(0, 260)) } }
py.seqs.forEach((s, k) => {
  const det = new DetectorCiclo(s.ref, s.dec, s.estavel, s.conf)
  const eventos = []
  for (const [t, v] of s.valores) { const ev = det.passo(t, v); if (ev) eventos.push([ev[0], ev[1]]) }
  nEv += eventos.length
  cmp(eventos, s.eventos, `seq ${k} eventos`)
  const saidas = eventos.filter(e => e[0] === 'saida').map(e => e[1]), congs = eventos.filter(e => e[0] === 'chegada').map(e => e[1])
  const [ciclos, per, ench, cong] = resumirCiclos(saidas, congs)
  cmp([ciclos.length, per, ench, cong], [s.n_ciclos, s.per, s.ench, s.cong], `seq ${k} médias`)
})
const n = py.nums
cmp(n.map(x => u.br(x, 2)), py.fmt.br2, 'br 2 casas'); cmp(n.map(x => u.br(x, 3)), py.fmt.br3, 'br 3 casas'); cmp(n.map(x => u.br(x, 1)), py.fmt.br1, 'br 1 casa')
cmp(n.map(x => u.fmtErro(u.erroPct(x, 4.0))), py.fmt.erro, 'fmt_erro'); cmp(n.map(u.offsetInteiro), py.fmt.offset, 'offset_inteiro')
cmp(n.map(x => u.cicloComOffset(x, 0.37)), py.fmt.ciclo, 'ciclo_com_offset'); cmp(n.map(x => u.falaNum(x, 2)), py.fmt.fala, 'fala_num')
cmp([0, 86.55, 999.95, 1000, 1074.4, 2999.5].map(u.falaFreq), py.fmt.freq, 'fala_freq')
cmp(['1,5', ' 2.25 ', '−3,5', 'abc', '', '1e3', '4,000'].map(s => u.num(s, null)), py.fmt.num, 'num')
console.log(dif ? `${dif} diferença(s)` : `TUDO IGUAL — ${py.seqs.length} sequências de bomba (${nEv} eventos de ciclo, médias), formatos e arredondamentos`)
