/// <reference lib="webworker" />
// VIGIA-7S no app — processamento fora da tela: média temporal, perspectiva, zoom digital,
// filtros e leitura dos campos (seg7) com o opencv.js 5.0.0 (mesmo OpenCV do VIGIA em Python).
// O opencv.js vem de /vigia/opencv.js (copiado de node_modules por scripts/copy-opencv.js).
import { lerCampo, campoDe, type CampoDisplay, type ResultadoCampo, type OpenCV, type Mat } from '@/lib/vigia/seg7'
import { ProcessadorCamera } from '@/lib/vigia/camera-proc'

const ctx = self as unknown as DedicatedWorkerGlobalScope & { cv?: OpenCV }
let cv: OpenCV = null
let proc: ProcessadorCamera | null = null
let carregando: Promise<void> | null = null
let ultimo: { f: Mat; t: number } | null = null   // último quadro tratado (camera.obter())

export type PedidoWorker =
  | { tipo: 'iniciar' }
  | { tipo: 'camera'; cfg: Record<string, unknown>; bruto?: boolean }
  | { tipo: 'zerar_media' }
  | {
      tipo: 'quadro'; id: number; t: number; largura: number; altura: number; dados: ArrayBuffer
      campos: Partial<CampoDisplay>[]; recortesDe?: number | null; devolverQuadro?: boolean; soAcumular?: boolean
      /** devolve também o quadro tratado em BGR (para o amostrador ler em outro worker) */
      devolverBgr?: boolean
    }
  /** camera.obter(): lê os campos no ÚLTIMO quadro tratado (captura das leituras do ensaio) */
  | { tipo: 'ler_ultimo'; id: number; campos: Partial<CampoDisplay>[]; devolverQuadro?: boolean }
  /** amostrador: lê os campos num quadro JÁ tratado (BGR) — não mexe na média temporal deste worker */
  | { tipo: 'ler'; seq: number; t: number; largura: number; altura: number; dados: ArrayBuffer; campos: Partial<CampoDisplay>[] }

export type RespostaWorker =
  | { tipo: 'pronto'; versao: string }
  | { tipo: 'erro'; msg: string; id?: number }
  | {
      tipo: 'resultado'; id: number; t: number; resultados: Record<string, ResultadoCampo>
      desvio: number; quadro?: { largura: number; altura: number; dados: ArrayBuffer }
      bgr?: { largura: number; altura: number; dados: ArrayBuffer }
    }
  | { tipo: 'lido'; seq: number; t: number; valores: Record<string, number | null> }

async function carregarCv() {
  if (cv) return
  ctx.importScripts('/vigia/opencv.js')
  let c = ctx.cv
  if (c instanceof Promise) c = await c
  else if (!c.Mat) await new Promise<void>(r => { c.onRuntimeInitialized = () => r() })
  cv = c
  proc = new ProcessadorCamera(cv)
}

ctx.onmessage = async (ev: MessageEvent<PedidoWorker>) => {
  const m = ev.data
  try {
    if (m.tipo === 'iniciar') {
      carregando ??= carregarCv()
      await carregando
      const v = (cv.getBuildInformation?.() as string | undefined)?.match(/Version control:\s*(\S+)/)?.[1] ?? '?'
      ctx.postMessage({ tipo: 'pronto', versao: v } satisfies RespostaWorker)
      return
    }
    if (carregando) await carregando   // pedidos que chegam enquanto o OpenCV carrega esperam
    if (!cv || !proc) throw new Error('OpenCV ainda carregando')
    if (m.tipo === 'camera') { proc.aplicar(m.cfg); proc.bruto = !!m.bruto; return }
    if (m.tipo === 'zerar_media') { proc.zerarMedia(); return }
    if (m.tipo === 'ler') {
      const f = new cv.Mat(m.altura, m.largura, cv.CV_8UC3)
      f.data.set(new Uint8Array(m.dados))
      const valores: Record<string, number | null> = {}
      try {
        for (const c of m.campos) { const campo = campoDe(c); valores[campo.nome] = lerCampo(cv, f, campo, 'BGR').valor }
      } finally { f.delete() }
      ctx.postMessage({ tipo: 'lido', seq: m.seq, t: m.t, valores } satisfies RespostaWorker)
      return
    }
    if (m.tipo === 'ler_ultimo') {
      if (!ultimo) { ctx.postMessage({ tipo: 'resultado', id: m.id, t: -1, resultados: {}, desvio: 0 } satisfies RespostaWorker); return }
      const { resultados, desvio, quadro } = analisar(ultimo.f, m.campos, null, !!m.devolverQuadro)
      ctx.postMessage({ tipo: 'resultado', id: m.id, t: ultimo.t, resultados, desvio, quadro } satisfies RespostaWorker, quadro ? [quadro.dados] : [])
      return
    }
    if (m.tipo === 'quadro') {
      const rgba = new cv.Mat(m.altura, m.largura, cv.CV_8UC4)
      rgba.data.set(new Uint8Array(m.dados))
      const bgr = new cv.Mat()
      cv.cvtColor(rgba, bgr, cv.COLOR_RGBA2BGR)
      rgba.delete()
      // a média temporal acumula em TODO quadro recebido (como a thread da câmera do VIGIA)
      const acumulado = proc.acumular(bgr)
      bgr.delete()
      if (m.soAcumular) { acumulado.delete(); return }
      const f = proc.obter(acumulado)
      acumulado.delete()
      ultimo?.f.delete()
      ultimo = { f: f.clone(), t: m.t }
      const { resultados, desvio, quadro } = analisar(f, m.campos, m.recortesDe ?? null, !!m.devolverQuadro)
      const bgr2 = m.devolverBgr ? { largura: f.cols, altura: f.rows, dados: f.data.slice().buffer as ArrayBuffer } : undefined
      f.delete()
      const resp: RespostaWorker = { tipo: 'resultado', id: m.id, t: m.t, resultados, desvio, quadro, bgr: bgr2 }
      ctx.postMessage(resp, [...(quadro ? [quadro.dados] : []), ...(bgr2 ? [bgr2.dados] : [])])
    }
  } catch (e) {
    ctx.postMessage({ tipo: 'erro', msg: e instanceof Error ? e.message : String(e), id: 'id' in m ? m.id : 'seq' in m ? m.seq : undefined } satisfies RespostaWorker)
  }
}

/** Lê os campos, o desvio-padrão do quadro e (se pedido) devolve o quadro em RGBA. */
function analisar(f: Mat, campos: Partial<CampoDisplay>[], recortesDe: number | null, devolverQuadro: boolean) {
  const resultados: Record<string, ResultadoCampo> = {}
  campos.forEach((c, i) => {
    const campo = campoDe(c)
    resultados[campo.nome] = lerCampo(cv, f, campo, 'BGR', recortesDe === i)
  })
  // desvio-padrão do quadro (q.std() do NumPy, todos os canais): imagem uniforme = sem sinal
  // (o opencv.js não tem reshape: junta média e desvio de cada canal — variância populacional total)
  const media = new cv.Mat(), dp = new cv.Mat()
  cv.meanStdDev(f, media, dp)
  const nc = media.rows * media.cols
  let mu = 0, m2 = 0
  for (let c = 0; c < nc; c++) { mu += media.data64F[c]; m2 += dp.data64F[c] ** 2 + media.data64F[c] ** 2 }
  mu /= nc
  const desvio = Math.sqrt(Math.max(0, m2 / nc - mu * mu))
  media.delete(); dp.delete()
  let quadro: { largura: number; altura: number; dados: ArrayBuffer } | undefined
  if (devolverQuadro) {
    const saida = new cv.Mat()
    cv.cvtColor(f, saida, cv.COLOR_BGR2RGBA)
    quadro = { largura: saida.cols, altura: saida.rows, dados: saida.data.slice().buffer }
    saida.delete()
  }
  return { resultados, desvio, quadro }
}
