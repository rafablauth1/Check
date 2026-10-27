'use client'
// Aba "Câmera / Calibração do display" — porte de App._montar_calibracao (vigia7s/app.py).
import { useEffect, useRef, useState } from 'react'
import { useVar, messagebox, type Var } from '@/lib/vigia/tk'
import { ESPECS, type App, type ChaveFiltro } from '@/lib/vigia/app'
import { Botao, Label, Check, Radio, Entrada, Combo, ComboRO, Spin, Escala, LabelFrame, Notebook, Painel } from './widgets'

const LINHAS_FILTRO: [ChaveFiltro, string, number, number, number, string][] = [
  ['media_n', 'Média temporal (quadros):', 1, 15, 1, '{:.0f}'],
  ['mediana', 'Mediana (ruído/moiré):', 0, 9, 2, '{:.0f}'],
  ['desfoque', 'Desfoque (linhas da TV):', 0, 15, 2, '{:.0f}'],
  ['contraste', 'Contraste:', 0.5, 3.0, 0.05, '{:.2f}'],
  ['brilho', 'Brilho:', -100, 100, 5, '{:+.0f}'],
  ['nitidez', 'Nitidez:', 0, 3.0, 0.1, '{:.1f}'],
]

export default function AbaCalibracao({ app }: { app: App }) {
  const [expandida, setExpandida] = useState(false)
  const versaoLayout = useVar(app.versaoLayout)   // "Restaurar tamanhos" redesenha com a divisão natural
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandida(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
  return (
    <Painel key={versaoLayout} layout={app.layout} chave="calibracao_imagem_painel" padrao={t => Math.max(40, t - 470 - 5)}
      aoGuardar={() => app.salvarLayoutDepois()} esconderSegundo={expandida}
      primeiro={<Esquerda app={app} expandida={expandida} alternar={() => setExpandida(x => !x)} />}
      segundo={<Lado app={app} />} />
  )
}

function Esquerda({ app, expandida, alternar }: { app: App; expandida: boolean; alternar: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dbgRef = useRef<HTMLDivElement>(null)
  const dbg = useVar(app.dbg)
  useEffect(() => { app.canvasCal = ref.current; return () => { app.canvasCal = null } }, [app])
  useEffect(() => {
    const el = dbgRef.current
    if (!el) return
    el.replaceChildren()
    if (dbg) {
      const maxw = Math.max(100, el.clientWidth - 8)
      dbg.style.imageRendering = 'pixelated'
      if (dbg.width > maxw) { dbg.style.width = `${maxw}px`; dbg.style.height = `${Math.trunc(dbg.height * maxw / dbg.width)}px` }
      el.appendChild(dbg)
    }
  }, [dbg])
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, paddingRight: 6, position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={ref} className="vg-canvas" tabIndex={0}
          onPointerDown={e => { ref.current!.setPointerCapture(e.pointerId); app._mouse_ini(...pos(e)) }}
          onPointerMove={e => { if (e.buttons & 1) app._mouse_mov(...pos(e)) }}
          onPointerUp={e => app._mouse_fim(...pos(e))}
          onKeyDown={e => { if (app._tecla(e)) e.preventDefault() }} />
        <Botao className="vg-expandir" onClick={alternar}>{expandida ? '⤡ Restaurar' : '⤢ Expandir'}</Botao>
      </div>
      <LabelFrame text="Leitura ao vivo do campo selecionado (cada dígito endireitado)" style={{ marginTop: 4, flex: 'none' }}>
        <div style={{ padding: '0 6px' }}><Label v={app.lbl_live} className="vg-live" /></div>
        <div ref={dbgRef} style={{ background: '#222', margin: '2px 4px', minHeight: 20, display: 'flex', justifyContent: 'center' }} />
        <div style={{ padding: '0 6px' }}><Label v={app.lbl_dica} wrap={850} /></div>
      </LabelFrame>
    </div>
  )
}

function Lado({ app }: { app: App }) {
  return (
    <div style={{ width: '100%', overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
      <Notebook abas={[' Câmera ', ' Filtros (imagem de TV) ']} v={app.nbCam} interno>
        <AbaCamera app={app} />
        <AbaFiltros app={app} />
      </Notebook>
      <div style={{ padding: '0 4px' }}><Label v={app.lbl_cam} wrap={455} /></div>
      <Campos app={app} />
    </div>
  )
}

function AbaCamera({ app }: { app: App }) {
  const valores = useVar(app.cb_fonte_valores)
  const arq = useRef<HTMLInputElement>(null)
  const aplicar = () => app._aplicar_cam()
  const g = { display: 'grid', gridTemplateColumns: 'auto auto 1fr', alignItems: 'center', rowGap: 1 } as const
  return (
    <div style={g}>
      <span style={{ padding: '0 4px' }}>Câmera:</span>
      <div style={{ gridColumn: '2 / span 2', display: 'flex', gap: 2 }}>
        <Combo v={app.v_fonte} valores={valores} style={{ flex: 1, minWidth: 0 }} onSelect={() => void app.conectar_camera()} onEnter={() => void app.conectar_camera()} />
        <Botao onClick={() => void app._procurar_cameras()}>Procurar câmeras</Botao>
        <Botao onClick={() => arq.current?.click()}>Arquivo…</Botao>
        <input ref={arq} type="file" hidden accept=".png,.jpg,.jpeg,.bmp,.mp4,.avi,.mov,image/*,video/*"
          onChange={e => { void app._escolher_arquivo(e.target.files?.[0] ?? null); e.target.value = '' }} />
      </div>
      <span style={{ padding: '0 4px' }}><Check v={app.v_af} onChange={aplicar}>Autofoco</Check></span>
      <span style={{ textAlign: 'right' }}>Foco:</span>
      <Escala v={app.v_foco} de={0} ate={255} passo={5} fmt="{:.0f}" aoMudar={aplicar} style={{ padding: '0 4px' }} />
      <span style={{ padding: '0 4px' }}><Check v={app.v_ae} onChange={aplicar}>Auto exposição</Check></span>
      <span style={{ textAlign: 'right' }}>Exposição:</span>
      <Escala v={app.v_exp} de={-13} ate={-1} passo={1} fmt="{:.0f}" aoMudar={aplicar} style={{ padding: '0 4px' }} />
      <span style={{ gridColumn: 'span 2', padding: '0 4px' }}>Zoom da câmera:</span>
      <Escala v={app.v_zoom} de={100} ate={400} passo={10} fmt="{:.0f}" aoMudar={aplicar} style={{ padding: '0 4px' }} />
      <span style={{ gridColumn: 'span 2', padding: '0 4px' }}>Zoom digital (×):</span>
      <Escala v={app.v_zdig} de={1.0} ate={4.0} passo={0.1} fmt="{:.1f}×" aoMudar={aplicar} style={{ padding: '0 4px' }} />
      <span style={{ gridColumn: 'span 2', padding: '0 4px', whiteSpace: 'pre' }}>Enquadrar  X / Y:</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <Escala v={app.v_dx} de={-1} ate={1} passo={0.05} fmt="{:+.2f}" aoMudar={aplicar} style={{ padding: '0 4px' }} />
        <Escala v={app.v_dy} de={-1} ate={1} passo={0.05} fmt="{:+.2f}" aoMudar={aplicar} style={{ padding: '0 4px' }} />
      </div>
      <div style={{ gridColumn: '1 / span 3', display: 'flex', alignItems: 'center', margin: '2px 0', flexWrap: 'wrap', rowGap: 2 }}>
        <span style={{ marginLeft: 4 }}><Combo v={app.v_larg} valores={['640', '1280', '1920']} width={5} /></span>
        <span>x</span>
        <Combo v={app.v_alt} valores={['480', '720', '1080']} width={5} />
        <span style={{ marginLeft: 4 }}><Combo v={app.v_fps} valores={['30', '60']} width={3} /></span>
        <span>q/s</span>
        <Botao style={{ marginLeft: 4 }} onClick={() => app._zoom_reset()}>Zoom 1×</Botao>
        <Botao style={{ marginLeft: 4 }} onClick={() => void app.conectar_camera()}>Conectar</Botao>
        <Botao style={{ marginLeft: 2 }} onClick={() => void messagebox.showinfo('Driver da câmera',
          'No app, a janela de propriedades do driver (DirectShow) não abre pelo navegador.\n\n'
          + 'Foco, exposição e zoom acima vão direto para a câmera quando o driver deixa; '
          + 'o restante (ex.: anti-cintilação 60 Hz) ajuste no VIGIA-7S ou no programa da Logitech — o driver guarda.')}>Driver…</Botao>
        <Botao style={{ marginLeft: 2 }} onClick={() => void app._salvar_foto()}>Foto</Botao>
      </div>
      <div style={{ gridColumn: '1 / span 3', padding: '0 4px' }}><Label v={app.lbl_fps} wrap={455} /></div>
    </div>
  )
}

function AbaFiltros({ app }: { app: App }) {
  const aplicar = () => app._aplicar_cam()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', rowGap: 1 }}>
      {LINHAS_FILTRO.map(([k, rot, de, ate, passo, fmt]) => (
        <FiltroLinha key={k} rot={rot}><Escala v={app.v_fil[k]} de={de} ate={ate} passo={passo} fmt={fmt} aoMudar={aplicar} style={{ padding: '0 4px' }} /></FiltroLinha>
      ))}
      <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', margin: '2px 0', flexWrap: 'wrap', gap: 2 }}>
        <span style={{ margin: '0 4px' }}><Check v={app.v_clahe} onChange={aplicar}>Contraste local (CLAHE)</Check></span>
        <Botao onClick={() => app._persp_iniciar()}>Perspectiva: clicar 4 cantos</Botao>
        <Botao onClick={() => app._persp_remover()}>Sem perspectiva</Botao>
      </div>
      <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 2 }}>
        <Botao style={{ marginLeft: 4 }} onClick={() => app._filtros_tv()}>Sugestão p/ TV</Botao>
        <Botao onClick={() => app._filtros_zerar()}>Zerar filtros</Botao>
        <span style={{ marginLeft: 6 }}><Label v={app.lbl_persp} /></span>
      </div>
    </div>
  )
}

function FiltroLinha({ rot, children }: { rot: string; children: React.ReactNode }) {
  return <><span style={{ padding: '0 4px' }}>{rot}</span>{children}</>
}

function Campos({ app }: { app: App }) {
  useVar(app.versaoCampos)
  const sel = useVar(app.lst_sel)
  return (
    <LabelFrame text="Campos do display (selecione e ARRASTE na imagem)" style={{ margin: '4px 0' }}>
      <div style={{ display: 'flex', padding: '2px 4px', gap: 4 }}>
        <div className="vg-list" style={{ flex: 1, height: 3 * 18 + 4 }}>
          {app.campos.map((c, i) => (
            <div key={i} className={i === sel ? 'sel' : ''} onClick={() => app._selecionar_campo(i)}>{app.rotuloCampo(c)}</div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Botao onClick={() => void app._add_campo()}>Adicionar</Botao>
          <Botao onClick={() => void app._rem_campo()}>Remover</Botao>
          <Botao onClick={() => void app._salvar_cfg_msg()}>Salvar config.</Botao>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '2px 4px 0', gap: 4 }}>
        <span>Arrastar:</span>
        <Radio v={app.v_modo} valor="area">Área</Radio>
        <Radio v={app.v_modo} valor="digitos" onChange={() => app._modo_digitos()}>Dígito a dígito</Radio>
        <Botao style={{ marginLeft: 6 }} onClick={() => app._redistribuir()}>Redistribuir</Botao>
        <Botao onClick={() => void app._igualar()}>Igualar tamanhos</Botao>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto', alignItems: 'center', padding: 4, rowGap: 1 }}>
        {ESPECS.map(([attr, rot, tipo, extra], i) => {
          const v = app.v_campo[attr]
          return (
            <FiltroCampo key={attr} primeiro={i % 2 === 0} rot={rot}>
              {tipo === 'bool' ? <Check v={v as Var<boolean>} />
                : tipo === 'combo' ? <ComboRO v={v as Var<string>} valores={extra as string[]} width={10} />
                : tipo === 'str' ? <Entrada v={v as Var<string>} width={12} />
                : <Spin v={v as Var<string>} de={(extra as number[])[0]} ate={(extra as number[])[1]} inc={tipo === 'int' ? 1 : attr === 'inclinacao' ? 0.5 : 0.01} />}
            </FiltroCampo>
          )
        })}
      </div>
      <LabelFrame text="Validação deste campo" style={{ margin: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Check v={app.v_campo.validar as Var<boolean>}>Validar valor</Check>
          <span style={{ margin: '0 2px 0 10px' }}>Esperado:</span>
          <Entrada v={app.v_campo.esperado as Var<string>} width={10} />
          <span style={{ margin: '0 2px 0 10px' }}>± Tolerância:</span>
          <Entrada v={app.v_campo.tolerancia as Var<string>} width={8} />
        </div>
      </LabelFrame>
    </LabelFrame>
  )
}

function FiltroCampo({ primeiro, rot, children }: { primeiro: boolean; rot: string; children: React.ReactNode }) {
  return (
    <>
      <span style={{ paddingLeft: primeiro ? 0 : 10, paddingRight: 2 }}>{rot}:</span>
      <span>{children}</span>
    </>
  )
}
