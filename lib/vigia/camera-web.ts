// VIGIA-7S no app — câmera pelo navegador (porte de listar_cameras / resolver_fonte / Camera.abrir
// e aplicar de vigia7s/app.py). O quadro bruto vai para o worker (lib/vigia/vigia.worker.ts),
// que faz média temporal, perspectiva, zoom digital, filtros e a leitura.
import type { ConfigCamera } from '@/lib/vigia/config'

export interface CameraListada { indice: number; nome: string; id: string }

/** [(índice, nome)] na ordem do sistema (o navegador só mostra os nomes depois da 1ª permissão). */
export async function listarCameras(): Promise<CameraListada[]> {
  let devs = await navigator.mediaDevices.enumerateDevices()
  if (devs.some(d => d.kind === 'videoinput' && !d.label)) {
    try { (await navigator.mediaDevices.getUserMedia({ video: true })).getTracks().forEach(t => t.stop()) } catch { /* sem permissão */ }
    devs = await navigator.mediaDevices.enumerateDevices()
  }
  return devs.filter(d => d.kind === 'videoinput').map((d, i) => ({ indice: i, nome: d.label || `Câmera ${i}`, id: d.deviceId }))
}

/** Converte 'auto' ou '1 - Logitech StreamCam' na câmera atual.
 *  A câmera é procurada pelo NOME, pois o número muda se o USB trocar de porta.
 *  Retorna [texto para exibir, câmera] — câmera null para arquivo/endereço. */
export async function resolverFonte(fonte: string): Promise<[string, CameraListada | null]> {
  fonte = String(fonte).trim().replace(/^"|"$/g, '')
  const m = fonte.match(/^\s*(\d+)\s*-\s*(.+?)\s*$/)
  if (fonte.toLowerCase() !== '' && fonte.toLowerCase() !== 'auto' && !m && !/^\d+$/.test(fonte)) return [fonte, null]  // arquivo / endereço
  const cams = await listarCameras()
  if (/^\d+$/.test(fonte)) {
    const c = cams[Number(fonte)]
    return c ? [`${c.indice} - ${c.nome}`, c] : [fonte, null]
  }
  if (m) {
    const c = cams.find(x => x.nome === m[2])
    if (c) return [`${c.indice} - ${c.nome}`, c]
    const porIndice = cams[Number(m[1])]
    return [fonte, porIndice ?? null]
  }
  // automático: prefere Logitech, depois qualquer câmera que não seja virtual
  for (const filtro of [(n: string) => n.toLowerCase().includes('logitech'), (n: string) => !n.toLowerCase().includes('virtual'), () => true]) {
    const c = cams.find(x => filtro(x.nome))
    if (c) return [`${c.indice} - ${c.nome}`, c]
  }
  return ['0', null]
}

export const EXT_IMAGEM = ['.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff']

/** Fonte de quadros: câmera (getUserMedia), vídeo de arquivo (em laço) ou imagem parada. */
export class CameraWeb {
  video: HTMLVideoElement | null = null
  imagem: HTMLImageElement | null = null
  stream: MediaStream | null = null
  erro = ''
  fpsReal: number | null = null
  private nFps = 0
  private tFps = 0
  private canvas: OffscreenCanvas | null = null
  private ctx2d: OffscreenCanvasRenderingContext2D | null = null
  private vfcId = 0
  /** chamado a cada quadro NOVO da câmera, com o instante de captura (s, relógio monotônico) */
  aoQuadro: ((t: number) => void) | null = null

  get ativa() { return !!(this.video || this.imagem) }

  async abrir(cfg: ConfigCamera, cam: CameraListada | null, arquivo?: File | null): Promise<boolean> {
    this.fechar()
    this.erro = ''
    try {
      if (arquivo) {
        const url = URL.createObjectURL(arquivo)
        if (arquivo.type.startsWith('image/') || EXT_IMAGEM.some(e => arquivo.name.toLowerCase().endsWith(e))) {
          const img = new Image()
          img.src = url
          await img.decode()
          this.imagem = img
          return true
        }
        const v = document.createElement('video')
        v.src = url; v.loop = true; v.muted = true; v.playsInline = true
        await v.play()
        this.video = v
        this.observarQuadros()
        return true
      }
      if (!cam) { this.erro = `Câmera/vídeo '${cfg.fonte}' não encontrado`; return false }
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: cam.id }, width: { ideal: Number(cfg.largura) }, height: { ideal: Number(cfg.altura) },
          frameRate: { ideal: Number(cfg.fps || 60) },
        },
      })
      const v = document.createElement('video')
      v.srcObject = this.stream; v.muted = true; v.playsInline = true
      await v.play()
      this.video = v
      await this.aplicar(cfg)
      this.observarQuadros()
      return true
    } catch (e) {
      this.erro = `Câmera/vídeo '${cfg.fonte}' não encontrado (${e instanceof Error ? e.message : String(e)})`
      this.fechar()
      return false
    }
  }

  /** Foco, exposição e zoom óptico (o que o driver da câmera deixar o navegador mexer). */
  async aplicar(cfg: ConfigCamera) {
    const track = this.stream?.getVideoTracks()[0]
    if (!track?.getCapabilities) return
    const cap = track.getCapabilities() as MediaTrackCapabilities & Record<string, { min?: number; max?: number } | string[] | undefined>
    const avancado: Record<string, unknown>[] = []
    const dentro = (nome: string, v: number) => {
      const r = cap[nome] as { min?: number; max?: number } | undefined
      return r && typeof r.min === 'number' ? Math.min(r.max ?? v, Math.max(r.min, v)) : null
    }
    const modos = (nome: string) => (cap[nome] as string[] | undefined) ?? []
    if (modos('focusMode').length) {
      if (cfg.autofoco && modos('focusMode').includes('continuous')) avancado.push({ focusMode: 'continuous' })
      else if (modos('focusMode').includes('manual')) {
        const f = dentro('focusDistance', Math.trunc(Number(cfg.foco) / 5) * 5)   // Logitech: múltiplos de 5
        avancado.push(f === null ? { focusMode: 'manual' } : { focusMode: 'manual', focusDistance: f })
      }
    }
    if (modos('exposureMode').length) {
      if (cfg.auto_exposicao && modos('exposureMode').includes('continuous')) avancado.push({ exposureMode: 'continuous' })
      else if (modos('exposureMode').includes('manual')) {
        // exposição do DirectShow: 2^valor segundos (-6 = 15,6 ms); o navegador usa unidades de 100 µs
        const e = dentro('exposureTime', Math.round(2 ** Number(cfg.exposicao) * 10000))
        avancado.push(e === null ? { exposureMode: 'manual' } : { exposureMode: 'manual', exposureTime: e })
      }
    }
    const z = dentro('zoom', Number(cfg.zoom))
    if (z !== null) avancado.push({ zoom: z })
    for (const a of avancado) { try { await track.applyConstraints({ advanced: [a] } as MediaTrackConstraints) } catch { /* driver recusou */ } }
  }

  private observarQuadros() {
    const v = this.video
    if (!v) return
    const passo: VideoFrameRequestCallback = (agora, meta) => {
      if (this.video !== v) return
      // taxa real de quadros (o driver pode entregar menos que o pedido, ex.: pouca luz)
      this.nFps++
      // instante de captura do quadro (câmera) ou de exibição (vídeo), no relógio do performance.now()
      const t = (meta.captureTime ?? meta.expectedDisplayTime ?? agora) / 1000
      if (t - this.tFps >= 2.0) {
        if (this.tFps) this.fpsReal = this.nFps / (t - this.tFps)
        this.tFps = t; this.nFps = 0
      }
      this.aoQuadro?.(t)
      this.vfcId = v.requestVideoFrameCallback(passo)
    }
    this.vfcId = v.requestVideoFrameCallback(passo)
  }

  /** Quadro atual em RGBA (ImageData); null sem imagem. */
  capturar(): ImageData | null {
    const fonte = this.video ?? this.imagem
    if (!fonte) return null
    const w = this.video ? this.video.videoWidth : this.imagem!.naturalWidth
    const h = this.video ? this.video.videoHeight : this.imagem!.naturalHeight
    if (!w || !h) return null
    if (!this.canvas || this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas = new OffscreenCanvas(w, h)
      this.ctx2d = this.canvas.getContext('2d', { willReadFrequently: true })
    }
    this.ctx2d!.drawImage(fonte, 0, 0)
    return this.ctx2d!.getImageData(0, 0, w, h)
  }

  resolucao(): [number, number] {
    if (this.video) return [this.video.videoWidth, this.video.videoHeight]
    if (this.imagem) return [this.imagem.naturalWidth, this.imagem.naturalHeight]
    return [0, 0]
  }

  fechar() {
    if (this.video && this.vfcId) this.video.cancelVideoFrameCallback(this.vfcId)
    this.stream?.getTracks().forEach(t => t.stop())
    if (this.video?.src.startsWith('blob:')) URL.revokeObjectURL(this.video.src)
    if (this.imagem?.src.startsWith('blob:')) URL.revokeObjectURL(this.imagem.src)
    this.video = null; this.imagem = null; this.stream = null
    this.fpsReal = null; this.nFps = 0; this.tFps = 0
  }
}
