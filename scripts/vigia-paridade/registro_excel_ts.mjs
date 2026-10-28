// FOR EMC38 do Registro gerado pelo porte (lib/vigia/registro-excel.ts) a partir de um registro .json:
//   node --experimental-transform-types --import ./loader-alias.mjs registro_excel_ts.mjs reg.json saida.xlsx [limite]
import fs from 'fs'
const { exportarExcel } = await import('@/lib/vigia/registro-excel')
const { completar } = await import('@/lib/vigia/registro')
const reg = completar(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))
await exportarExcel(reg, process.argv[3], Number(process.argv[4] ?? 1.0))
console.log('gerado', process.argv[3])
