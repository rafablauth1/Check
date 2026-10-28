'use client'
// Janelas (Toplevel) da aba Registro — porte dos diálogos de RegistroUI (vigia7s/registro.py).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVar, messagebox } from '@/lib/vigia/tk'
import type { RegistroUI, JanelaReg } from '@/lib/vigia/registro-ui'
import { MODELOS, _fmt_mhz, type EnsaioSalvo } from '@/lib/vigia/registro'
import type { LeituraReg, TotReg } from '@/lib/vigia/ensaio'
import { grafico_erro_frequencia } from '@/lib/vigia/grafico'
import { Botao } from './widgets'

const CINZA = '#5f6368'
const rodape = { display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 8 } as const

function Jan({ titulo, children, largura, altura, fechar }: { titulo: string; children: ReactNode; largura?: number | string; altura?: number | string; fechar?: () => void }) {
  return (
    <div className="vg-dlg-fundo" onKeyDown={e => { if (e.key === 'Escape') fechar?.() }}>
      <div className="vg-jan" role="dialog" style={{ width: largura, height: altura, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}>
        <div className="tit">{titulo}</div>
        <div className="corpo" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </div>
  )
}

export default function JanelasRegistro({ ui }: { ui: RegistroUI }) {
  const j = useVar(ui.janela)
  if (!j) return null
  return <Uma ui={ui} j={j} />
}

function Uma({ ui, j }: { ui: RegistroUI; j: JanelaReg }) {
  const fechar = () => ui.janela.set(null)
  switch (j.tipo) {
    case 'abrir': return <Abrir ui={ui} itens={j.itens} fechar={fechar} />
    case 'escolher_ensaio': return <EscolherEnsaio itens={j.itens} resolver={rel => { ui.janela.set(null); j.resolver(rel) }} />
    case 'importar': return <Importar ui={ui} j={j} fechar={fechar} />
    case 'montar': return <Montar ui={ui} lista={j.lista} fechar={fechar} />
    case 'foto': return <Foto j={j} fechar={fechar} />
    case 'grafico': return <Grafico ui={ui} j={j} fechar={fechar} />
  }
}

// ------------------------------------------------------------------ abrir (filedialog.askopenfilename)
function Abrir({ ui, itens, fechar }: { ui: RegistroUI; itens: { nome: string; caminho: string; mtime: number }[]; fechar: () => void }) {
  const [sel, setSel] = useState<string | null>(null)
  return (
    <Jan titulo="Abrir registro" largura={560} fechar={fechar}>
      <div style={{ color: CINZA, marginBottom: 4 }}>Registros em {ui.abs(ui.pasta)}:</div>
      <div className="vg-tree" style={{ height: 300 }}>
        <table style={{ width: '100%' }}>
          <colgroup><col /><col style={{ width: 140 }} /></colgroup>
          <thead><tr><th style={{ position: 'sticky' }}>Registro</th><th style={{ position: 'sticky' }}>Alterado em</th></tr></thead>
          <tbody>
            {itens.map(r => (
              <tr key={r.caminho} className={sel === r.caminho ? 'sel' : ''} onPointerDown={() => setSel(r.caminho)} onDoubleClick={() => void ui.abrir_arquivo(r.caminho)}>
                <td style={{ textAlign: 'left' }}>{r.nome}</td><td>{new Date(r.mtime).toLocaleString('pt-BR').slice(0, 17)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={rodape}>
        <Botao disabled={!sel} onClick={() => sel && void ui.abrir_arquivo(sel)}>Abrir</Botao>
        <Botao onClick={fechar}>Cancelar</Botao>
      </div>
    </Jan>
  )
}

// ------------------------------------------------------------------ escolher o estado_ensaio.json de um ensaio salvo
function EscolherEnsaio({ itens, resolver }: { itens: { rel: string; nome: string; salvo_em: string; n: number }[]; resolver: (rel: string | null) => void }) {
  const [sel, setSel] = useState<string | null>(null)
  return (
    <Jan titulo="Escolha o estado_ensaio.json do ensaio" largura={900} fechar={() => resolver(null)}>
      <div className="vg-tree" style={{ height: 380 }}>
        <table style={{ width: '100%' }}>
          <colgroup><col style={{ width: 330 }} /><col /><col style={{ width: 140 }} /><col style={{ width: 70 }} /></colgroup>
          <thead><tr>{['Ensaio', 'Pasta', 'Salvo em', 'Leituras'].map(h => <th key={h} style={{ position: 'sticky' }}>{h}</th>)}</tr></thead>
          <tbody>
            {itens.map(e => (
              <tr key={e.rel} className={sel === e.rel ? 'sel' : ''} onPointerDown={() => setSel(e.rel)} onDoubleClick={() => resolver(e.rel)}>
                <td style={{ textAlign: 'left' }}>{e.nome}</td><td style={{ textAlign: 'left' }} title={e.rel}>{e.rel}</td><td>{e.salvo_em}</td><td>{e.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={rodape}>
        <Botao disabled={!sel} onClick={() => resolver(sel)}>Abrir</Botao>
        <Botao onClick={() => resolver(null)}>Cancelar</Botao>
      </div>
    </Jan>
  )
}

// ------------------------------------------------------------------ importar leituras para o registro
function Importar({ ui, j, fechar }: { ui: RegistroUI; j: Extract<JanelaReg, { tipo: 'importar' }>; fechar: () => void }) {
  const [estado, setEstado] = useState({ leituras: j.leituras, totais: j.totais, origem: j.origem })
  const [v_ens, setEns] = useState(j.ensaio_sugerido && j.ensaio_sugerido in MODELOS ? j.ensaio_sugerido : ui.v_ens_sel.get())
  const m = MODELOS[v_ens]
  const nomes = ui.reg.ensaios[v_ens].blocos.map(b => b.nome)
  const auto = v_ens === '1.2 - IEC 61000-4-3'
  const valores = [...(auto ? ['(automático pela face/polarização)'] : []), ...nomes]
  const [v_bloco, setBloco] = useState(valores[0] ?? '')
  const [v_modo, setModo] = useState(m.tipo === 'freq' ? 'acrescentar novas linhas' : 'preencher as linhas vazias em ordem')
  const atualizar = (ens: string) => {  // atualizar(): ao trocar o ensaio do formulário
    const mm = MODELOS[ens]
    const vs = [...(ens === '1.2 - IEC 61000-4-3' ? ['(automático pela face/polarização)'] : []), ...ui.reg.ensaios[ens].blocos.map(b => b.nome)]
    setEns(ens)
    if (!vs.includes(v_bloco)) setBloco(vs[0] ?? '')
    setModo(mm.tipo === 'freq' ? 'acrescentar novas linhas' : 'preencher as linhas vazias em ordem')
  }
  const outro_ensaio = async () => {
    const [ls, nome, tt] = await ui._leituras_de_ensaio_salvo()
    if (ls && ls.length) {
      ui.janela.set({ ...j, leituras: ls, totais: tt, origem: `do ensaio salvo '${nome}'` })
      setEstado({ leituras: ls, totais: tt, origem: `do ensaio salvo '${nome}'` })
    } else ui.janela.set({ ...j, ...estado })
  }
  const ls = estado.leituras
  const sel = (valor: string, vs: string[], set: (v: string) => void, larg: number) => (
    <select className="vg-combo" data-ro value={valor} style={{ width: larg * 8 + 26 }} onChange={e => set(e.target.value)}>
      {vs.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  return (
    <Jan titulo="Importar leituras para o registro" largura={640} fechar={fechar}>
      <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 8px', alignItems: 'center' }}>
        <span>{ls.length} leituras {estado.origem} ({ls.filter(l => l.volume !== null && l.volume !== undefined).length} com volume).</span>
        <span style={{ justifySelf: 'end' }}><Botao onClick={() => void outro_ensaio()}>Outro ensaio salvo…</Botao></span>
        <span style={{ marginTop: 8 }}>Ensaio do formulário:</span>
        <span style={{ marginTop: 8 }}>{sel(v_ens, Object.keys(MODELOS), atualizar, 34)}</span>
        <span>Bloco de destino:</span>{sel(v_bloco, valores, setBloco, 44)}
        <span>Como colocar:</span>{sel(v_modo, ['acrescentar novas linhas', 'preencher as linhas vazias em ordem'], setModo, 44)}
        <span style={{ gridColumn: 'span 2', color: CINZA, maxWidth: 480, margin: '6px 0' }}>
          {m.tipo === 'freq' ? 'Cada leitura vira uma linha com a frequência aplicada naquele momento.'
            : 'As leituras ocupam, em ordem, as linhas do formulário ainda vazias (ex.: Antes, Positivo, Negativo, Após). Confira depois.'}
        </span>
      </div>
      <div style={rodape}>
        <Botao onClick={() => void ui.importar_ok(v_ens, v_bloco, v_modo, ls as LeituraReg[], estado.totais as Record<string, TotReg[]>)}>Importar</Botao>
        <Botao onClick={fechar}>Cancelar</Botao>
      </div>
    </Jan>
  )
}

// ------------------------------------------------------------------ montar o registro por segmento
function Montar({ ui, lista, fechar }: { ui: RegistroUI; lista: EnsaioSalvo[]; fechar: () => void }) {
  const inicial = MODELOS[ui.v_ens_sel.get()].tipo === 'freq' ? ui.v_ens_sel.get() : '1.2 - IEC 61000-4-3'
  const [v_ens, setEns] = useState(inicial)
  const [subst, setSubst] = useState(true)
  const itens = useMemo(() => ui.itens_montagem(lista, v_ens), [ui, lista, v_ens])
  const [usar, setUsar] = useState<boolean[]>(() => itens.map(x => x.usar))
  const [sel, setSel] = useState<number | null>(null)
  useEffect(() => { setUsar(itens.map(x => x.usar)) }, [itens])
  const marcados = itens.filter((_, i) => usar[i])
  const res = ui.resumo_montagem(marcados)
  const cols: [string, number][] = [['Usar', 50], ['Bloco do formulário', 210], ['Segmento', 260], ['Arquivo do ensaio', 260], ['Data', 85],
    ['Leituras', 65], ['Frequências', 170], ['Falhas', 55], ['Situação', 120]]
  const montar = async () => {
    if (!marcados.length) { await messagebox.showwarning('Montar', 'Marque ao menos um segmento.'); return }
    await ui.montar_ok(v_ens, marcados, subst)
  }
  return (
    <Jan titulo="Montar o registro por segmento" largura={1250} altura={620} fechar={fechar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>Ensaio do formulário:</span>
        <select className="vg-combo" data-ro value={v_ens} style={{ width: 30 * 8 + 26 }} onChange={e => setEns(e.target.value)}>
          {Object.keys(MODELOS).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <label className="vg-check" style={{ marginLeft: 12 }}>
          <input type="checkbox" checked={subst} onChange={e => setSubst(e.target.checked)} />
          Substituir as leituras dos blocos envolvidos (limpa antes de montar)
        </label>
      </div>
      <div style={{ color: CINZA, margin: '6px 0 4px', maxWidth: 1200 }}>
        Cada linha é um segmento dentro de um arquivo de ensaio. Marque em &quot;Usar&quot; (clique) qual arquivo vale para cada segmento — em
        amarelo, segmentos que aparecem em mais de um arquivo. Já vem marcado o arquivo com mais leituras daquele segmento (empate: o mais
        recente). Pode marcar mais de um arquivo para o mesmo segmento (ex.: metade feita num dia, o resto no outro). Dentro de cada bloco
        as linhas ficam em ordem de frequência.
      </div>
      <div className="vg-tree" tabIndex={0} style={{ flex: 1, minHeight: 0 }}
        onKeyDown={e => { if (e.key === ' ' && sel !== null) { e.preventDefault(); setUsar(u => u.map((v, i) => (i === sel ? !v : v))) } }}>
        <table style={{ width: cols.reduce((a, [, w]) => a + w, 0) }}>
          <colgroup>{cols.map(([c, w]) => <col key={c} style={{ width: w }} />)}</colgroup>
          <thead><tr>{cols.map(([c]) => <th key={c} style={{ position: 'sticky' }}>{c}</th>)}</tr></thead>
          <tbody>
            {itens.map((x, i) => {
              const faixa = x.fs.length ? `${_fmt_mhz(Math.min(...x.fs))} a ${_fmt_mhz(Math.max(...x.fs))}` : '—'
              const estilo = { ...(x.repetido ? { background: '#fff3c4' } : {}), ...(x.falhas ? { color: '#8b0000' } : {}) }
              const vals = [usar[i] ? '☑' : '☐', x.bloco, x.rot, x.e.nome, x.e.quando, String(x.ls.length), faixa, x.falhas ? String(x.falhas) : '', x.sit]
              return (
                <tr key={i} className={sel === i ? 'sel' : ''} onPointerDown={() => setSel(i)}>
                  {vals.map((v, k) => (
                    <td key={k} style={{ ...estilo, textAlign: [0, 4, 5, 7].includes(k) ? 'center' : 'left' }}
                      onClick={k === 0 ? () => setUsar(u => u.map((b, j) => (j === i ? !b : b))) : undefined}>{v}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ font: 'bold 13px "Segoe UI"', color: res.ruim ? '#8b0000' : '#174ea6', whiteSpace: 'pre-wrap', margin: '4px 0' }}>{res.texto}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <Botao onClick={() => setUsar(itens.map(() => true))}>Marcar tudo</Botao>
        <Botao onClick={() => setUsar(itens.map(() => false))}>Desmarcar tudo</Botao>
        <span style={{ flex: 1 }} />
        <Botao onClick={() => void montar()}>🧩 Montar no registro</Botao>
        <Botao onClick={fechar}>Cancelar</Botao>
      </div>
    </Jan>
  )
}

// ------------------------------------------------------------------ foto da leitura
function Foto({ j, fechar }: { j: Extract<JanelaReg, { tipo: 'foto' }>; fechar: () => void }) {
  return (
    <Jan titulo={j.titulo} largura={1140} altura="92vh" fechar={fechar}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={j.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ whiteSpace: 'pre-wrap', padding: '0 8px', maxWidth: 1080 }}>{j.info}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: 8 }}>
        <Botao onClick={() => void fetch('/api/vigia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'abrir_arquivo', caminho: j.arq }) })}>
          Abrir no visualizador do Windows
        </Botao>
        <Botao onClick={fechar}>Fechar</Botao>
      </div>
      <div style={{ color: CINZA, textAlign: 'center', marginBottom: 8 }}>
        Se o mostrador na foto não confere com o volume, corrija o valor na coluna Volume (duplo clique) e registre o motivo em Obs.
      </div>
    </Jan>
  )
}

// ------------------------------------------------------------------ gráfico erro × frequência
function Grafico({ ui, j, fechar }: { ui: RegistroUI; j: Extract<JanelaReg, { tipo: 'grafico' }>; fechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const cv = useMemo(() => grafico_erro_frequencia(j.series, ui.obter_limite(), j.titulo, j.faixas), [j, ui])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    cv.style.maxWidth = '100%'; cv.style.maxHeight = '100%'; cv.style.objectFit = 'contain'
    el.replaceChildren(cv)
  }, [cv])
  const salvar = () => {
    const a = document.createElement('a')
    a.href = cv.toDataURL('image/png')
    a.download = `${j.titulo}.png`.replace(/\//g, '-')
    a.click()
  }
  return (
    <Jan titulo={j.titulo} largura={1290} altura="88vh" fechar={fechar}>
      <div ref={ref} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }} />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
        <Botao onClick={salvar}>Salvar imagem…</Botao>
        <Botao onClick={fechar}>Fechar</Botao>
      </div>
    </Jan>
  )
}
