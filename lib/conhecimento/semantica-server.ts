import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { caminhoDados, lerJSON, escreverJSON } from '@/lib/dados'
import { getUserDataDir } from '@/lib/settings-server'
import {
  pontuarBM25, resultadoDe, textoExibicao, normasCitadas, ehNormaCitada, termosAcionados, type Indice,
} from '@/lib/conhecimento/busca'
import type { ResultadoBusca } from '@/lib/conhecimento/tipos'

/* Busca por SIGNIFICADO na Base de Conhecimento — 100% local, sem internet e
   sem API: um modelo de embeddings pequeno (multilingual-e5-small, ~113 MB,
   português e inglês) roda no próprio servidor do app (onnxruntime, CPU).

   - O modelo fica na rede (cadastros/modelos) e é copiado para o disco local
     no primeiro uso; o app nunca baixa nada da internet.
   - Cada trecho vira um vetor uma única vez; os vetores ficam em cache na rede
     (conhecimento/_vetores.json), indexados pelo hash do texto — editar um
     documento só recalcula os trechos que mudaram.
   - O ranking final combina significado + palavras (fusão por posição), com
     peso extra para a norma citada na pergunta ("setup da 4-4").
   Sem o modelo (pasta ausente/erro), a busca volta a ser só por palavras. */

const MODELO = 'Xenova/multilingual-e5-small'
const ARQUIVO_VETORES = 'conhecimento/_vetores.json'
const ARQUIVOS_MODELO = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx']

type Extrator = (textos: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>
let extrator: Promise<Extrator> | null = null

/** Copia o modelo da rede para %APPDATA% (uma vez; recopia se o tamanho mudar). */
async function pastaModeloLocal(): Promise<string> {
  const rede = path.join(await caminhoDados('modelos'), ...MODELO.split('/'))
  const local = path.join(getUserDataDir(), 'modelos')
  const destino = path.join(local, ...MODELO.split('/'))
  for (const arq of ARQUIVOS_MODELO) {
    const de = path.join(rede, arq), para = path.join(destino, arq)
    const stDe = await fs.promises.stat(de)                       // sem o arquivo na rede → erro → busca só por palavras
    const stPara = await fs.promises.stat(para).catch(() => null)
    if (stPara?.size === stDe.size) continue
    await fs.promises.mkdir(path.dirname(para), { recursive: true })
    await fs.promises.copyFile(de, para + '.tmp')
    await fs.promises.rename(para + '.tmp', para)
  }
  return local
}

function carregarExtrator(): Promise<Extrator> {
  if (!extrator) {
    extrator = (async () => {
      const local = await pastaModeloLocal()
      const { pipeline, env } = await import('@huggingface/transformers')
      env.allowRemoteModels = false        // nunca vai à internet
      env.localModelPath = local + path.sep
      return (await pipeline('feature-extraction', MODELO, { dtype: 'q8' })) as unknown as Extrator
    })()
    extrator.catch(() => { extrator = null })   // tenta de novo na próxima busca
  }
  return extrator
}

async function vetorizar(textos: string[]): Promise<Float32Array[]> {
  const ex = await carregarExtrator()
  const out: Float32Array[] = []
  for (let i = 0; i < textos.length; i += 16) {
    const lote = await ex(textos.slice(i, i + 16), { pooling: 'mean', normalize: true })
    out.push(...lote.tolist().map(v => Float32Array.from(v)))
  }
  return out
}

const hash = (s: string) => crypto.createHash('sha1').update(s).digest('base64').slice(0, 16)
const paraB64 = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64')
const deB64 = (s: string) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) }
const prod = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }

/* Texto que vira vetor: título do documento + seção + âncora + trecho, no
   formato do e5 ("passage: …"). Limitado: o modelo lê ~512 tokens. */
function textoPassagem(indice: Indice, i: number): string {
  const t = indice.docs[i].trecho
  return 'passage: ' + [t.titulo, t.contexto, t.ancora, textoExibicao(t.texto)].filter(Boolean).join('\n').slice(0, 1800)
}

let memo: { indice: Indice; vetores: Float32Array[] } | null = null

/** Vetores de todos os trechos do índice (do cache; calcula só os que faltam). */
async function vetoresDoIndice(indice: Indice): Promise<Float32Array[]> {
  if (memo?.indice === indice) return memo.vetores
  const cache = await lerJSON<Record<string, string>>(ARQUIVO_VETORES, {})
  const textos = indice.docs.map((_, i) => textoPassagem(indice, i))
  const chaves = textos.map(hash)
  const faltam = chaves.map((c, i) => (cache[c] ? -1 : i)).filter(i => i >= 0)
  if (faltam.length) {
    const novos = await vetorizar(faltam.map(i => textos[i]))
    faltam.forEach((i, k) => { cache[chaves[i]] = paraB64(novos[k]) })
    // grava só os vetores em uso (documento apagado/alterado não acumula lixo)
    const usados = new Set(chaves)
    await escreverJSON(ARQUIVO_VETORES, Object.fromEntries(Object.entries(cache).filter(([k]) => usados.has(k))))
  }
  const vetores = chaves.map(c => deB64(cache[c]))
  memo = { indice, vetores }
  return vetores
}

/** `soDocs`: busca só nesses documentos (tela de Normas: "pesquisar nesta norma"). */
export async function buscaHibrida(indice: Indice, pergunta: string, limite = 15, soDocs?: Set<string>):
  Promise<{ resultados: ResultadoBusca[]; semantica: boolean; erro?: string }> {
  const permitido = (r: { i: number }) => !soDocs || soDocs.has(indice.docs[r.i].trecho.docId)
  const todasPalavra = pontuarBM25(indice, pergunta, Infinity).filter(permitido)
  let todasSentido: { i: number; score: number }[] = []
  let vqs: Float32Array[] = []
  let erro: string | undefined
  try {
    const vetores = await vetoresDoIndice(indice)
    // a pergunta vem em português e as normas IEC estão em inglês: além da
    // pergunta, compara também com ela + os termos equivalentes (distância →
    // distance, separation…) e fica com a maior das duas notas
    const extras = termosAcionados(pergunta, indice.sinonimos)
    const consultas = ['query: ' + pergunta, ...(extras.length ? ['query: ' + pergunta + ' (' + extras.join(', ') + ')'] : [])]
    vqs = await vetorizar(consultas)
    todasSentido = vetores.map((v, i) => ({ i, score: Math.max(...vqs.map(q => prod(q, v))) }))
      .filter(permitido).sort((a, b) => b.score - a.score)
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
  }

  // fusão por posição (RRF): quem aparece bem nas duas listas sobe
  const K = 20
  const fundido = new Map<number, number>()
  const somar = (lista: { i: number }[], peso: number) =>
    lista.forEach((r, pos) => fundido.set(r.i, (fundido.get(r.i) ?? 0) + peso / (K + pos)))
  // por significado, cada língua tem a sua lista: o modelo puxa a pergunta em
  // português para os textos em português, e sem isso as normas IEC (inglês)
  // ficariam sempre abaixo das portarias
  const emIngles = (r: { i: number }) => indice.docs[r.i].trecho.docId.startsWith('iec-')
  somar(todasSentido.filter(r => !emIngles(r)).slice(0, 60), 1.2)
  somar(todasSentido.filter(emIngles).slice(0, 60), 1.2)
  somar(todasPalavra.slice(0, 60), 1.0)
  // pergunta cita a norma ("setup da 4-4", "portaria 221"): os melhores trechos
  // DAQUELA norma entram com peso extra, mesmo que outros documentos falem
  // mais do assunto
  const citadas = normasCitadas(pergunta)
  if (citadas.iec.length || citadas.portarias.length) {
    const daNorma = (r: { i: number }) => ehNormaCitada(indice.docs[r.i].trecho.docId, citadas)
    // quem escreve "da 4-6" quer a norma em si: pesa mais que o trecho de portaria que só a cita
    somar(todasSentido.filter(daNorma).slice(0, 30), 1.6)
    somar(todasPalavra.filter(daNorma).slice(0, 30), 2.0)   // palavras + tradução acertam mais dentro da norma
  }
  // tabelas de orçamento de incerteza (anexos das IEC) viram um trecho por linha e
  // repetem a legenda ("Level setting…"): só pesam quando a pergunta é sobre incerteza
  const querIncerteza = /incerteza|uncertaint/i.test(pergunta)
  const deIncerteza = (i: number) => {
    const t = indice.docs[i].trecho
    return /uncertaint/i.test(t.ancora + ' ' + t.texto.slice(0, 300))
  }
  const ordem = [...fundido.entries()]
    .map(([i, s]) => [i, indice.docs[i].trecho.tipo === 'nota' ? s * 1.25 : s] as [number, number])
    .map(([i, s]) => [i, !querIncerteza && deIncerteza(i) ? s * 0.5 : s] as [number, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
  const resultados = ordem.map(([i, s]) => resultadoDe(indice, i, s, pergunta))
  return { resultados, semantica: vqs.length > 0, ...(erro ? { erro } : {}) }
}

/** Carrega o modelo e prepara os vetores em segundo plano (chamado ao abrir a tela). */
export async function aquecer(indice: Indice): Promise<boolean> {
  try { await vetoresDoIndice(indice); return true } catch { return false }
}
