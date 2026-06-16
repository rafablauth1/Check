import { NextRequest, NextResponse } from 'next/server'
import { lerJSON, escreverJSON } from '@/lib/dados'

const GRUPOS_DEFAULT = [
  { id: 'geradores', nome: 'Geradores', descricao: 'Geradores de sinal e fontes de alimentação calibradas', cor: 'blue',
    subgrupos: [
      { id: 'gerador-sinal-rf',     nome: 'Sinal / RF', numero: '1.1' },
      { id: 'gerador-funcoes',      nome: 'Funções',    numero: '1.2' },
      { id: 'fonte-alimentacao-dc', nome: 'Fonte DC',   numero: '1.3' },
    ] },
  { id: 'medidores', nome: 'Medidores', descricao: 'Analisadores de espectro, receptores EMI e instrumentos de medição', cor: 'gold',
    subgrupos: [
      { id: 'analisador-espectro', nome: 'Analisador de Espectro', numero: '2.1' },
      { id: 'receptor-emi',        nome: 'Receptor EMI',           numero: '2.2' },
      { id: 'multimetro',          nome: 'Multímetro',             numero: '2.3' },
    ] },
  { id: 'redes-impedancia', nome: 'Redes de Impedância', descricao: 'LISNs e redes de estabilização de impedância de linha', cor: 'purple',
    subgrupos: [
      { id: 'lisn-50uh', nome: 'LISN 50µH', numero: '3.1' },
      { id: 'lisn-5uh',  nome: 'LISN 5µH',  numero: '3.2' },
    ] },
  { id: 'antenas', nome: 'Antenas', descricao: 'Antenas de medição para ensaios radiados', cor: 'green',
    subgrupos: [
      { id: 'antena-loop',          nome: 'Loop Tripla',   numero: '4.1' },
      { id: 'antena-log-periodica', nome: 'Log-Periódica', numero: '4.2' },
      { id: 'antena-biconica',      nome: 'Bicônica',      numero: '4.3' },
    ] },
  { id: 'atenuacao', nome: 'Atenuação', descricao: 'Atenuadores, adaptadores e filtros de RF', cor: 'coral',
    subgrupos: [
      { id: 'atenuador', nome: 'Atenuador RF', numero: '5.1' },
      { id: 'filtro-rf', nome: 'Filtro RF',    numero: '5.2' },
    ] },
  { id: 'grandezas-ambientais', nome: 'Grandezas Ambientais', descricao: 'Instrumentos para monitoramento de condições ambientais', cor: 'gray',
    subgrupos: [
      { id: 'termoigrometro', nome: 'Termoigrômetro', numero: '6.1' },
      { id: 'barometro',      nome: 'Barômetro',      numero: '6.2' },
    ] },
]

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function GET() {
  return NextResponse.json(lerJSON('grupos.json', GRUPOS_DEFAULT))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const grupos = lerJSON<typeof GRUPOS_DEFAULT>('grupos.json', GRUPOS_DEFAULT)
    const id = body.id || slugify(body.nome || 'grupo')
    if (grupos.find(g => g.id === id)) {
      return NextResponse.json({ error: 'ID já existe' }, { status: 409 })
    }
    const novo = { id, nome: body.nome, descricao: body.descricao || '', cor: body.cor || 'gray', subgrupos: body.subgrupos || [] }
    escreverJSON('grupos.json', [...grupos, novo])
    return NextResponse.json(novo, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
