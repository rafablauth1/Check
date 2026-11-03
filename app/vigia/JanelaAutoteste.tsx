'use client'
// Janela do teste dos dígitos 0–9 (recurso do app, não existe no VIGIA-7S em Python): para cada campo,
// os dígitos montados com os segmentos reais da imagem, a grade dígito × posição lida com os parâmetros
// atuais e com os sugeridos, e o botão para aplicar a sugestão.
import { useEffect, useRef, useState } from 'react'
import { useVar } from '@/lib/vigia/tk'
import { type App, COR_OK, COR_FALHA, COR_NEUTRO, COR_AVISO } from '@/lib/vigia/app'
import type { ResultadoAutoteste, Grade, ParamsLeitura } from '@/lib/vigia/autoteste'
import { Botao } from './widgets'

const pct = (x: number) => `${Math.round(x * 100)}%`
const num2 = (x: number) => x.toFixed(2).replace('.', ',')

export default function JanelaAutoteste({ app }: { app: App }) {
  const st = useVar(app.autoteste)
  if (!st) return null
  const fechar = () => app.autoteste.set(null)
  return (
    <div className="vg-dlg-fundo" onKeyDown={e => { if (e.key === 'Escape') fechar() }}>
      <div className="vg-jan" role="dialog" style={{ width: 860, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}>
        <div className="tit">Testar dígitos 0–9</div>
        <div className="corpo" style={{ overflowY: 'auto', minHeight: 0 }}>
          {st.testando ? (
            <div style={{ padding: 16 }}>Montando os dígitos 0–9 em todas as posições e testando os parâmetros… (alguns segundos por campo)</div>
          ) : (
            <>
              <div style={{ color: COR_NEUTRO, marginBottom: 6 }}>
                Cada dígito foi montado com os segmentos <b>reais</b> da imagem atual (aceso de um dígito, apagado de outro) e lido
                pela mesma leitura do ensaio. O display tem de estar lendo certo agora.
              </div>
              {st.resultados.map(r => <Campo key={r.campo} app={app} r={r} aplicado={st.aplicados.includes(r.campo)} mostra={st.mostra} />)}
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Botao onClick={fechar}>Fechar</Botao>
          </div>
        </div>
      </div>
    </div>
  )
}

function Campo({ app, r, aplicado, mostra }: { app: App; r: ResultadoAutoteste; aplicado: boolean; mostra: Record<string, string> }) {
  return (
    <fieldset className="vg-lf" style={{ marginBottom: 8, padding: 6 }}>
      <legend>{r.campo} — lendo agora: '{r.leitura}'{r.mostra !== undefined ? ` · testado com o valor digitado '${r.mostra}'` : ''}</legend>
      <ValorDisplay app={app} r={r} mostra={mostra} />
      {r.erro ? <div style={{ color: COR_FALHA }}>{r.erro}</div> : (
        <>
          <Amostras r={r} />
          {!!r.substituidos?.length && (
            <div style={{ color: COR_AVISO, margin: '2px 0 4px' }}>
              O display não mostra todos os segmentos nos dois estados; montados com outro segmento da mesma orientação: {r.substituidos.join(', ')}.
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {r.atual && <Bloco titulo="Parâmetros atuais" g={r.atual} params={r.atual.params} />}
            {r.sugerido
              ? <Bloco titulo="Sugeridos" g={r.sugerido} params={r.sugerido.params} antes={r.atual?.params} />
              : <div style={{ color: COR_FALHA }}>Nenhuma combinação de binarização, dilatar e espessura separa aceso de apagado. Confira a área, a inclinação e a imagem.</div>}
          </div>
          {r.sugerido && r.atual && (
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Botao disabled={aplicado || iguais(r.sugerido.params, r.atual.params)} onClick={() => app._aplicar_sugerido(r.campo, r.sugerido!.params)}>
                Aplicar sugeridos em '{r.campo}'
              </Botao>
              {aplicado && <span style={{ color: COR_OK }}>Aplicado e salvo.</span>}
              {!aplicado && iguais(r.sugerido.params, r.atual.params) && <span style={{ color: COR_OK }}>Os parâmetros atuais já são os melhores.</span>}
            </div>
          )}
        </>
      )}
    </fieldset>
  )
}

/** o operador digita o que o display mostra: o teste usa isso no lugar da leitura (que pode estar errada) */
function ValorDisplay({ app, r, mostra }: { app: App; r: ResultadoAutoteste; mostra: Record<string, string> }) {
  const [v, setV] = useState(r.mostra ?? r.leitura.replace(/[^0-9 ]/g, ''))
  const testar = () => app._testar_digitos({ ...mostra, [r.campo]: v.replace(/[.,]/g, '') })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 4px' }}>
      <span>O display mostra:</span>
      <input className="vg-entry" style={{ width: 90, fontFamily: 'Consolas, monospace' }} value={v}
        onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') testar() }} />
      <Botao onClick={testar}>Testar com esse valor</Botao>
      <span style={{ color: COR_NEUTRO }}>(um dígito por posição, sem vírgula; espaço = apagado)</span>
    </div>
  )
}

const iguais = (a: ParamsLeitura, b: ParamsLeitura) =>
  a.binarizacao === b.binarizacao && a.dilatar === b.dilatar && Math.abs(a.espessura - b.espessura) < 1e-9 && Math.abs(a.limiar_segmento - b.limiar_segmento) < 1e-9

function Bloco({ titulo, g, params, antes }: { titulo: string; g: Grade & { folga: number }; params: ParamsLeitura; antes?: ParamsLeitura }) {
  const n = g.ok[0]?.length ?? 0
  const todos = g.ok.every(l => l.every(Boolean))
  const muda = (k: keyof ParamsLeitura, fmt: (v: never) => string) => {
    const v = fmt(params[k] as never)
    return antes && antes[k] !== params[k] ? <b>{fmt(antes[k] as never)} → {v}</b> : v
  }
  return (
    <div>
      <div style={{ fontWeight: 'bold', color: todos ? COR_OK : COR_FALHA }}>{titulo}: {todos ? 'lê todos os dígitos' : 'ERRA dígitos'}</div>
      <div style={{ color: COR_NEUTRO }}>
        Binarização {muda('binarizacao', (v: string) => v)} · Dilatar {muda('dilatar', (v: number) => String(v))} · Espessura {muda('espessura', num2)} · Limiar {muda('limiar_segmento', num2)}
      </div>
      <table style={{ borderCollapse: 'collapse', margin: '3px 0', fontSize: 12 }}>
        <thead>
          <tr><th style={{ padding: '0 6px', textAlign: 'left', fontWeight: 'normal' }}>posição</th>{Array.from({ length: 10 }, (_, d) => <th key={d} style={{ width: 22 }}>{d}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, p) => (
            <tr key={p}>
              <td style={{ padding: '0 6px' }}>{p + 1}</td>
              {g.ok.map((linha, d) => (
                <td key={d} style={{ textAlign: 'center', color: '#fff', background: linha[p] ? COR_OK : COR_FALHA, border: '1px solid #fff' }}>{linha[p] ? '✓' : '✗'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ color: g.folga >= 0.15 ? COR_OK : g.folga > 0 ? COR_AVISO : COR_FALHA }}>
        Segmento aceso mais fraco {pct(g.acesoMin)} · apagado mais forte {pct(g.apagadoMax)} → folga {Math.round(g.folga * 100)} pontos
        {g.folga > 0 && g.folga < 0.15 ? ' (pouca: reflexo ou mudança de luz pode errar)' : ''}
      </div>
      {!!g.erros.length && <div style={{ color: COR_FALHA, maxWidth: 380 }}>Erros: {g.erros.slice(0, 8).join('; ')}{g.erros.length > 8 ? '…' : ''}</div>}
    </div>
  )
}

function Amostras({ r }: { r: ResultadoAutoteste }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.replaceChildren()
    for (const a of r.amostras ?? []) {
      const c = document.createElement('canvas')
      c.width = a.largura; c.height = a.altura
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(a.dados.slice(0)), a.largura, a.altura), 0, 0)
      const alt = 46
      c.style.height = `${alt}px`; c.style.width = `${Math.round(a.largura * alt / a.altura)}px`
      c.title = `montado: ${a.texto}`
      el.appendChild(c)
    }
  }, [r])
  return <div ref={ref} style={{ display: 'flex', flexWrap: 'wrap', gap: 3, background: '#222', padding: 3, margin: '2px 0 4px' }} />
}
