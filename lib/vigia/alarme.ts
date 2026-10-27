// VIGIA-7S no app — Alarme e Voz (porte das classes de vigia7s/app.py).
// Bipe: tom senoidal na placa de som (o winsound.Beep do Windows 7+ também sai pela placa de som).
// Voz: speechSynthesis do navegador, que no Windows usa as mesmas vozes do SAPI (ex.: Microsoft Maria).
'use client'

export class Alarme {
  private ctx: AudioContext | null = null
  private parar_ = false
  private rodando = false
  ao_disparar: (() => void) | null = null   // chamado sempre que o alarme começa a tocar

  get tocando() { return this.rodando }

  private audio() {
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** winsound.Beep(freq, dur): bloqueia pelo tempo do bipe */
  private async _beep(freq: number, dur: number) {
    try {
      const ctx = this.audio()
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = Math.max(37, Math.min(32767, Math.trunc(freq)))
      const t0 = ctx.currentTime, d = Math.trunc(dur) / 1000
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.004)
      g.gain.setValueAtTime(0.5, t0 + Math.max(0.004, d - 0.004))
      g.gain.linearRampToValueAtTime(0, t0 + d)
      o.connect(g).connect(ctx.destination)
      o.start(t0); o.stop(t0 + d)
    } catch { /* sem áudio */ }
    await esperar(Math.trunc(dur))
  }

  /** atraso_s: espera antes do 1º bipe (deixa a frase falada ser ouvida primeiro). */
  disparar(freq: number, dur: number, continuo: boolean, atraso_s = 0.0) {
    if (this.tocando) return
    this.ao_disparar?.()
    this.parar_ = false
    this.rodando = true
    void (async () => {
      try {
        let n = 0
        if (atraso_s > 0 && await this.esperarParar(atraso_s * 1000)) return
        while (!this.parar_) {
          await this._beep(freq, dur)
          await this._beep(Math.trunc(freq * 0.75), dur)
          n += 1
          if (!continuo && n >= 3) break
          await this.esperarParar(400)
        }
      } finally { this.rodando = false }
    })()
  }

  /** espera ms; true se parar() foi chamado */
  private async esperarParar(ms: number) {
    const fim = performance.now() + ms
    while (!this.parar_ && performance.now() < fim) await esperar(Math.min(50, fim - performance.now()))
    return this.parar_
  }

  aviso() { void (async () => { await this._beep(1200, 150); await this._beep(1600, 150) })() }

  /** n bipes curtos (aviso de erro leve), sem bloquear e sem exigir reconhecimento. */
  bipes(n: number, freq: number, dur: number) {
    void (async () => { for (let i = 0; i < n; i++) { await this._beep(freq, dur); await esperar(120) } })()
  }

  parar() { this.parar_ = true }
}

const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, Math.max(0, ms)))

/** Frases faladas com a voz do Windows (em português quando houver, ex.: Microsoft Maria). Sem voz, apenas não fala. */
export class Voz {
  nome_voz = ''        // "Microsoft Maria - Portuguese (Brazil) | pt-BR"
  falou: string[] = [] // últimas frases (diagnóstico e validação)
  private voz: SpeechSynthesisVoice | null = null

  private _abrir(): boolean {
    if (typeof speechSynthesis === 'undefined') return false
    if (!this.voz) {
      const vozes = speechSynthesis.getVoices()
      this.voz = vozes.find(v => v.lang === 'pt-BR' || v.lang === 'pt_BR') ?? vozes.find(v => v.default) ?? vozes[0] ?? null
      if (this.voz) this.nome_voz = `${this.voz.name} | ${this.voz.lang.replace('_', '-')}`
      else speechSynthesis.onvoiceschanged = () => { this.voz = null; this._abrir() }
    }
    return true
  }

  falar(texto: string): boolean {
    this.falou.push(texto)
    this.falou.splice(0, Math.max(0, this.falou.length - 30))
    if (!this._abrir()) return false
    const u = new SpeechSynthesisUtterance(texto)
    if (this.voz) { u.voice = this.voz; u.lang = this.voz.lang }
    else u.lang = 'pt-BR'
    speechSynthesis.speak(u)
    return true
  }

  calar() { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel() }
  fechar() { this.calar() }
}
