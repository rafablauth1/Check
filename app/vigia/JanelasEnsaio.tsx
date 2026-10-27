'use client'
// Janelas (Toplevel) da aba Ensaio — porte dos diálogos de vigia7s/app.py.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useVar, messagebox, simpledialog, fmtG, Var } from '@/lib/vigia/tk'
import { VigiaApp, type Janela, type LeituraReg } from '@/lib/vigia/ensaio'
import { App, COR_OK, COR_FALHA, COR_NEUTRO, COR_AVISO } from '@/lib/vigia/app'
import { FACES_PADRAO, POLARIZACOES_PADRAO, fmtFreq, rotulo } from '@/lib/vigia/emc'
import { br, num, sinalBr } from '@/lib/vigia/util'
import { Botao, Check, Entrada, Combo, ComboRO, Spin, Radio, Tabela } from './widgets'

function Jan({ titulo, children, largura, fechar }: { titulo: string; children: ReactNode; largura?: number; fechar?: () => void }) {
  return (
    <div className="vg-dlg-fundo" onKeyDown={e => { if (e.key === 'Escape') fechar?.() }}>
      <div className="vg-jan" role="dialog" style={{ width: largura, maxWidth: 'calc(100vw - 40px)' }}>
        <div className="tit">{titulo}</div>
        <div className="corpo">{children}</div>
      </div>
    </div>
  )
}

const rodape = { display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 8 } as const

/** foto de uma leitura (pasta do ensaio/imagens) como data URL */
function useFoto(app: VigiaApp, img: string) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!img || !app.pastaRel) { setUrl(null); return }
    void fetch('/api/vigia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'ler', rel: `${app.pastaRel}/imagens/${img}`, binario: true }) })
      .then(r => r.json()).then(j => setUrl(j.texto ? `data:image/jpeg;base64,${j.texto}` : null)).catch(() => setUrl(null))
  }, [app, img])
  return url
}

export default function JanelasEnsaio({ app }: { app: VigiaApp }) {
  const j = useVar(app.janela)
  const alerta = useVar(app.alerta)
  return (
    <>
      {alerta && <AlertaVermelho app={app} titulo={alerta.titulo} detalhe={alerta.detalhe} />}
      {j && <Uma app={app} j={j} />}
    </>
  )
}

function Uma({ app, j }: { app: VigiaApp; j: Janela }) {
  switch (j.tipo) {
    case 'totalizador': return <Totalizador app={app} j={j} />
    case 'parecer': return <Parecer app={app} n={j.n} />
    case 'corrigir': return <Corrigir app={app} n={j.n} />
    case 'excluir': return <Excluir app={app} />
    case 'alerta_parada': return <AlertaParada j={j} />
    case 'continuar': return <Continuar app={app} itens={j.itens} />
    case 'escolher': return <Escolher app={app} />
    case 'editar_seg': return <EditarSeg app={app} i={j.i} resolver={j.resolver} />
    case 'trazer': return <Trazer app={app} j={j} />
  }
}

// ------------------------------------------------------------------ totalizador
function Totalizador({ app, j }: { app: VigiaApp; j: Extract<Janela, { tipo: 'totalizador' }> }) {
  const tipo = j.tipoTot
  const [v] = useState(() => ({ tipo: new Var(tipo), val: new Var(''), n: new Var(String(app.n_leitura)) }))
  const vt = useVar(v.tipo), val = useVar(v.val), vn = useVar(v.n)
  const tol = Number(app.cfg.totalizador.tol)
  const ult = app.linhas_lidas().slice(-1)[0]
  let info: { text: string; cor?: string } = { text: '' }
  const x = num(val, null)
  if (tipo !== 'Inicial' && app.tot_inicial !== null && x !== null) {
    const n = Math.trunc(num(vn, app.n_leitura)!)
    const [soma, inval] = app._soma_ate(n)
    const esp = app._tot_base() + soma
    const dif = x - esp
    if (vt === 'Retomada') info = { text: `Esperado: ${br(esp, 2)} L  →  ${sinalBr(dif, 2)} L dispensados com o ensaio parado (serão descontados)`, cor: COR_NEUTRO }
    else info = {
      text: `Esperado: ${br(esp, 2)} L  (inicial ${br(app.tot_inicial, 2)} + ${br(soma, 2)} L lidos)\nDiferença: ${sinalBr(dif, 2)} L  →  ${Math.abs(dif) <= tol ? 'OK' : 'DIVERGENTE'} (tolerância ± ${br(tol, 2)} L)`
        + (inval ? `\nAtenção: ${inval} leitura(s) sem volume válido até aqui.` : ''),
      cor: Math.abs(dif) <= tol ? COR_OK : COR_FALHA,
    }
  }
  const confirmar = () => {
    const vv = num(v.val.get(), null)
    if (vv === null) return
    j.resolver([v.tipo.get(), vv, Math.trunc(num(v.n.get(), app.n_leitura)!)])
  }
  return (
    <Jan titulo={`Totalizador ${tipo.toLowerCase()}`} fechar={() => j.resolver(null)}>
      <div onKeyDown={e => { if (e.key === 'Enter') confirmar() }} style={{ display: 'grid', gridTemplateColumns: 'auto auto', alignItems: 'center', gap: '4px 6px', maxWidth: 460 }}>
        {tipo !== 'Inicial' && (
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8, marginBottom: 6 }}>
            <span>Tipo:</span>
            {(tipo === 'Parcial' ? ['Parcial', 'Final'] : [tipo]).map(t => <Radio key={t} v={v.tipo} valor={t}>{t}</Radio>)}
          </div>
        )}
        <span style={{ fontWeight: 'bold', fontSize: 13 }}>Valor do totalizador da bomba (L):</span>
        <input autoFocus className="vg-entry" style={{ width: 150, fontSize: 16, height: 26 }} value={val} onChange={e => v.val.set(e.target.value)} />
        {tipo !== 'Inicial' && (
          <>
            <span>Inclui até o abastecimento nº:</span>
            <Spin v={v.n} de={0} ate={Math.max(0, app.n_leitura)} inc={1} width={8} />
            <span style={{ gridColumn: 'span 2', color: COR_NEUTRO, whiteSpace: 'pre-wrap' }}>
              {'Se a bomba estiver no meio de um abastecimento que ainda não foi lido, informe o número do ÚLTIMO abastecimento que já aparece na tabela.' + (ult ? `\nÚltimo lido: nº ${ult[0]} às ${ult[1]}.` : '')}
            </span>
          </>
        )}
        <span style={{ gridColumn: 'span 2', whiteSpace: 'pre-wrap', color: info.cor }}>{info.text}</span>
      </div>
      <div style={rodape}>
        <Botao onClick={confirmar}>Registrar</Botao>
        <Botao onClick={() => j.resolver(null)}>{tipo !== 'Parcial' ? 'Pular' : 'Cancelar'}</Botao>
      </div>
    </Jan>
  )
}

// ------------------------------------------------------------------ parecer
function Parecer({ app, n }: { app: VigiaApp; n: number }) {
  const cols = app._colunas()
  const linha = app.linhas.find(l => String(l[0]) === String(n))!
  const campo_vol = app._campo_volume(app.campos_ensaio.length ? app.campos_ensaio : app.campos)
  const i_vol = cols.indexOf(campo_vol)
  const img = linha.length > cols.length ? String(linha[cols.length] ?? '') : ''
  const foto = useFoto(app, img)
  const ant = (app.pareceres[String(n)] ?? {}) as Record<string, string>
  const [v] = useState(() => ({
    dec: new Var(ant.decisao ?? VigiaApp.DECISOES[0]), val: new Var(ant.valor_manual ?? ''),
    resp: new Var(ant.responsavel ?? String((app.cfg as unknown as Record<string, unknown>).ultimo_responsavel ?? '')),
  }))
  const [just, setJust] = useState(ant.justificativa ?? '')
  const fechar = () => app.janela.set(null)
  const salvar = async () => {
    if (!just.trim() || !v.resp.get().trim()) { await messagebox.showwarning('Parecer', 'Preencha a justificativa e o responsável.'); return }
    app.registrar_parecer(n, v.dec.get(), v.val.get().trim(), just.trim(), v.resp.get().trim())
    fechar()
  }
  const info = `Leitura nº ${n} às ${linha[1]}  |  status automático: ${linha[cols.indexOf('Status')]}\n`
    + `Valor lido pela câmera: ${i_vol >= 0 ? linha[i_vol] : '—'}  |  segmento: ${linha[cols.indexOf('Segmento')]} @ ${linha[cols.indexOf('Freq. atual')]}\n`
    + `Observação automática: ${linha[cols.indexOf('Observação')] || '—'}`
  return (
    <Jan titulo={`Parecer sobre a leitura nº ${n}`} fechar={fechar} largura={680}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 6px', alignItems: 'center' }}>
        <div style={{ gridColumn: 'span 2', whiteSpace: 'pre-wrap', maxWidth: 620 }}>{info}</div>
        <div style={{ gridColumn: 'span 2', margin: '6px 0' }}>
          {foto ? <img src={foto} alt="" style={{ maxWidth: 620, maxHeight: 300 }} /> : foto === null ? <span style={{ color: COR_NEUTRO }}>(sem foto salva para esta leitura)</span> : null}
        </div>
        <span>Decisão:</span><ComboRO v={v.dec} valores={VigiaApp.DECISOES} width={62} />
        <span>Valor conferido no mostrador (L):</span><Entrada v={v.val} width={14} />
        <span style={{ alignSelf: 'start' }}>Justificativa:</span>
        <textarea className="vg-textarea" rows={4} style={{ width: 62 * 8 }} value={just} onChange={e => setJust(e.target.value)} />
        <span>Responsável:</span><Entrada v={v.resp} width={30} />
        <div style={{ gridColumn: 'span 2', color: COR_NEUTRO, maxWidth: 620, margin: '4px 0' }}>
          O valor e o status originais NÃO são alterados. O parecer fica registrado com data/hora e responsável (coluna &apos;Parecer do operador&apos;, linha de evento no CSV e no estado do ensaio).
        </div>
      </div>
      <div style={rodape}><Botao onClick={() => void salvar()}>Registrar parecer</Botao><Botao onClick={fechar}>Cancelar</Botao></div>
    </Jan>
  )
}

// ------------------------------------------------------------------ corrigir leitura
function Corrigir({ app, n }: { app: VigiaApp; n: number }) {
  const cols = app._colunas()
  const linha = app.linhas.find(l => String(l[0]) === String(n))!
  const campo_vol = app._campo_volume(app.campos_ensaio.length ? app.campos_ensaio : app.campos)
  const lido = String(linha[cols.indexOf(campo_vol)] ?? '')
  const img = linha.length > cols.length ? String(linha[cols.length] ?? '') : ''
  const foto = useFoto(app, img)
  const [v] = useState(() => ({ val: new Var(lido), resp: new Var(String((app.cfg as unknown as Record<string, unknown>).ultimo_responsavel ?? '')) }))
  const [just, setJust] = useState('Câmera (OCR) leu errado; valor conferido visualmente no mostrador.')
  const val = useVar(v.val)
  const fechar = () => app.janela.set(null)
  const salvar = async () => {
    const novo = num(v.val.get(), null)
    if (novo === null || novo < 0) { await messagebox.showwarning('Corrigir leitura', 'Informe o valor correto (ex.: 4,000).'); return }
    if (!just.trim() || !v.resp.get().trim()) { await messagebox.showwarning('Corrigir leitura', 'Preencha o motivo e o responsável.'); return }
    app.aplicar_correcao(n, novo, just.trim(), v.resp.get().trim())
    fechar()
  }
  return (
    <Jan titulo={`Corrigir a leitura nº ${n}`} fechar={fechar}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 6px', alignItems: 'center', alignContent: 'start' }}>
          <div style={{ gridColumn: 'span 2', whiteSpace: 'pre-wrap', maxWidth: 560 }}>
            {`Leitura nº ${n} às ${linha[1]}  |  ${linha[cols.indexOf('Segmento')]} @ ${linha[cols.indexOf('Freq. atual')]}\nCâmera leu: ${campo_vol} = ${lido || '—'}  |  status: ${linha[cols.indexOf('Status')]}`}
          </div>
          <span style={{ marginTop: 8 }}>Valor CORRETO visto no mostrador ({campo_vol}):</span>
          <input autoFocus className="vg-entry" style={{ width: 130, font: 'bold 16px "Segoe UI"', height: 26, marginTop: 8 }} value={val}
            onFocus={e => e.target.select()} onChange={e => v.val.set(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void salvar() }} />
          <span style={{ alignSelf: 'start' }}>Motivo:</span>
          <textarea className="vg-textarea" rows={3} style={{ width: 400 }} value={just} onChange={e => setJust(e.target.value)} />
          <span>Responsável:</span><Entrada v={v.resp} width={30} />
          <div style={{ gridColumn: 'span 2', color: COR_NEUTRO, maxWidth: 560, margin: '4px 0' }}>
            A leitura passa a usar o valor correto (status, erro, acumulado e totalizador recalculados; vai assim para o Registro). O valor lido pela câmera fica na Observação, numa linha de evento CORREÇÃO e no histórico do ensaio.
          </div>
          <div style={{ gridColumn: 'span 2', ...rodape }}><Botao onClick={() => void salvar()}>Corrigir leitura</Botao><Botao onClick={fechar}>Cancelar</Botao></div>
        </div>
        <div>{foto ? <img src={foto} alt="" style={{ maxWidth: 520, maxHeight: 320 }} /> : foto === null ? <span style={{ color: COR_NEUTRO }}>(sem foto desta leitura)</span> : null}</div>
      </div>
    </Jan>
  )
}

// ------------------------------------------------------------------ excluir / recomeçar / totalizador inicial
function Excluir({ app }: { app: VigiaApp }) {
  const todos = useMemo(() => app._nums_leituras(), [app])
  const sel = useMemo(() => app._nums_selecionados(), [app])
  const [v] = useState(() => ({
    modo: new Var<'sel' | 'desde' | 'tudo' | 'tot'>(sel.length ? 'sel' : todos.length ? 'desde' : 'tot'),
    desde: new Var(String(sel.length ? sel[0] : todos.length ? todos[todos.length - 1] : 1)),
    tot_on: new Var(false),
    tot: new Var(app.tot_inicial !== null ? br(app.tot_inicial, 2) : ''),
    resp: new Var(String((app.cfg as unknown as Record<string, unknown>).ultimo_responsavel ?? '')),
  }))
  const modo = useVar(v.modo), tot_on = useVar(v.tot_on)
  const [mot, setMot] = useState('')
  useEffect(() => { if (modo === 'tudo' || modo === 'tot') v.tot_on.set(true) }, [modo, v])
  const fechar = () => app.janela.set(null)
  const faixa = todos.length ? `nº ${todos[0]} a ${todos[todos.length - 1]}` : 'nenhuma'
  const txt_sel = sel.length ? sel.slice(0, 12).join(', ') + (sel.length > 12 ? '…' : '') : 'nenhuma selecionada'
  const info = {
    sel: 'As leituras seguintes são renumeradas; acumulado e conferências do totalizador são refeitos. Se forem as últimas, a perturbação volta para a frequência da 1ª excluída.',
    desde: "A perturbação volta para a frequência da leitura escolhida: ajuste o gerador nela e clique em 'Iniciar próximo segmento'. Totalizadores parciais/final tomados depois também saem.",
    tudo: 'A tabela fica vazia e o ensaio recomeça no início do segmento da 1ª leitura, com o totalizador inicial informado acima.',
    tot: 'Recalcula o totalizador esperado de todas as leituras e as conferências.',
  }[modo]
  const confirmar = async () => {
    const motivo = mot.trim(), resp = v.resp.get().trim()
    const novo = v.tot_on.get() ? num(v.tot.get(), null) : null
    if (!motivo || !resp) { await messagebox.showwarning('Excluir leituras', 'Preencha o motivo e o responsável.'); return }
    if (v.tot_on.get() && novo === null) { await messagebox.showwarning('Excluir leituras', 'Informe o totalizador inicial (ex.: 14379,73).'); return }
    if (modo === 'tot') {
      if (novo === null) return
      app.alterar_tot_inicial(novo, motivo, resp)
      fechar()
      app._set_status('TOTALIZADOR', COR_AVISO, `Totalizador inicial alterado para ${br(novo, 2)} L; totalizador esperado recalculado.`)
      return
    }
    const atuais = app._nums_leituras()  // pode ter chegado leitura com a janela aberta
    const nums = modo === 'sel' ? sel : modo === 'desde' ? atuais.filter(n => n >= Math.trunc(num(v.desde.get(), 0)!)) : atuais
    if (modo !== 'tudo' && !nums.length) { await messagebox.showwarning('Excluir leituras', 'Nenhuma leitura nesse intervalo.'); return }
    const resumo = modo === 'tudo' ? 'TODAS as leituras e eventos' : `${nums.length} leitura(s): nº ` + (nums.length <= 15 ? nums.join(', ') : `${nums[0]} a ${nums[nums.length - 1]}`)
    if (!await messagebox.askyesno('Excluir leituras', `Excluir ${resumo}?`)) return
    fechar()
    const r = app.excluir_leituras(nums, modo === 'tudo', motivo, resp, novo)
    await app._depois_de_excluir(r, novo !== null)
  }
  return (
    <Jan titulo="Excluir leituras / recomeçar / totalizador inicial" fechar={fechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 660 }}>
        <div style={{ font: 'bold 13px "Segoe UI"', marginBottom: 8 }}>
          {`Ensaio: ${app.nome_ensaio}  |  ${todos.length} leitura(s) (${faixa})  |  totalizador inicial: ${app.tot_inicial !== null ? br(app.tot_inicial, 2) : 'não informado'}`}
        </div>
        <label className="vg-check" style={{ opacity: sel.length ? 1 : 0.5 }}>
          <input type="radio" disabled={!sel.length} checked={modo === 'sel'} onChange={() => v.modo.set('sel')} />Excluir as leituras selecionadas na tabela ({txt_sel})
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label className="vg-check"><input type="radio" disabled={!todos.length} checked={modo === 'desde'} onChange={() => v.modo.set('desde')} />Excluir da leitura nº</label>
          <Spin v={v.desde} de={1} ate={Math.max(1, todos.length ? todos[todos.length - 1] : 1)} inc={1} width={6} />
          <span>até a última  (refazer a partir dela)</span>
        </div>
        <Radio v={v.modo} valor="tudo">Recomeçar do zero: excluir TODAS as leituras e eventos da tabela</Radio>
        <Radio v={v.modo} valor="tot">Não excluir leituras — só alterar o totalizador inicial</Radio>
        <hr style={{ border: 0, borderTop: '1px solid #d0d0d0', margin: '8px 0' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '2px 6px', alignItems: 'center' }}>
          <Check v={v.tot_on}>Totalizador inicial (L):</Check>
          <Entrada v={v.tot} width={16} disabled={!tot_on} style={{ fontSize: 14 }} />
          <span style={{ color: COR_NEUTRO }}>{modo === 'tudo' ? 'valor ATUAL do totalizador da bomba' : tot_on ? 'valor de partida do ensaio' : ''}</span>
          <span style={{ alignSelf: 'start', marginTop: 6 }}>Motivo:</span>
          <textarea className="vg-textarea" rows={3} style={{ gridColumn: 'span 2', width: 450, marginTop: 6 }} value={mot} onChange={e => setMot(e.target.value)} />
          <span>Responsável:</span>
          <span style={{ gridColumn: 'span 2' }}><Entrada v={v.resp} width={30} /></span>
        </div>
        <div style={{ color: COR_NEUTRO, whiteSpace: 'pre-wrap', margin: '6px 0', maxWidth: 620 }}>
          {info + '\nNada é apagado de vez: as linhas excluídas vão para leituras_excluidas.csv e o histórico fica no ensaio; as fotos continuam na pasta imagens.'}
        </div>
      </div>
      <div style={rodape}><Botao className="acao" onClick={() => void confirmar()}>Confirmar</Botao><Botao onClick={fechar}>Cancelar</Botao></div>
    </Jan>
  )
}

// ------------------------------------------------------------------ alertas vermelhos
function AlertaVermelho({ app, titulo, detalhe }: { app: VigiaApp; titulo: string; detalhe: string }) {
  // janela por cima de tudo (não trava o ensaio)
  return (
    <div style={{ position: 'fixed', left: '50%', top: '18%', transform: 'translateX(-50%)', zIndex: 1100, background: COR_FALHA, color: '#fff', textAlign: 'center', padding: '22px 30px 20px', boxShadow: '0 8px 30px rgba(0,0,0,.5)', maxWidth: 820 }}>
      <div style={{ font: 'bold 32px "Segoe UI"', marginBottom: 6 }}>{titulo}</div>
      <div style={{ font: 'bold 17px "Segoe UI"', margin: '4px 0' }}>{detalhe}</div>
      <div style={{ font: '13px "Segoe UI"', margin: '4px 0' }}>O ensaio continua. Confira o mostrador e a foto da leitura (duplo clique na linha).</div>
      <button type="button" style={{ marginTop: 8, background: '#fff', color: '#000', font: 'bold 17px "Segoe UI"', padding: '6px 14px', border: '1px solid #999' }} onClick={() => app.reconhecer_alarme()}>
        Estou ciente (silenciar)
      </button>
    </div>
  )
}

function AlertaParada({ j }: { j: Extract<Janela, { tipo: 'alerta_parada' }> }) {
  return (
    <div className="vg-dlg-fundo" style={{ zIndex: 1200 }}>
      <div style={{ background: COR_FALHA, color: '#fff', textAlign: 'center', padding: '24px 30px', boxShadow: '0 8px 30px rgba(0,0,0,.5)', maxWidth: 820 }}>
        <div style={{ font: 'bold 32px "Segoe UI"', marginBottom: 8 }}>⚠ ENSAIO PARADO AUTOMATICAMENTE</div>
        <div style={{ font: 'bold 20px "Segoe UI"', margin: '4px 0' }}>{j.motivo}</div>
        <div style={{ font: '15px "Segoe UI"', margin: '8px 0', whiteSpace: 'pre-wrap' }}>{j.texto}</div>
        <button type="button" autoFocus style={{ marginTop: 8, background: '#fff', color: '#000', font: 'bold 17px "Segoe UI"', padding: '6px 14px', border: '1px solid #999' }} onClick={j.resolver}>
          Estou ciente (silenciar o alarme)
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ continuar ensaio
function Continuar({ app, itens: inicial }: { app: VigiaApp; itens: { pasta: string; rel: string; est: Record<string, unknown> }[] }) {
  const [itens, setItens] = useState(inicial)
  const [sel, setSel] = useState<string[]>(inicial.length ? [inicial[0].rel] : [])
  const fechar = () => app.janela.set(null)
  const continuar = async (rel?: string) => {
    const p = rel ?? sel[0]
    if (!p) return
    fechar()
    await app.continuar_ensaio(p)
  }
  const outra = async () => {
    const p = await simpledialog.askstring('Continuar', 'Pasta do ensaio (dentro de resultados; contém estado_ensaio.json):')
    if (!p) return
    if (!await app._ler_estado(p.trim())) { await messagebox.showerror('Continuar', 'Essa pasta não tem um ensaio salvo (estado_ensaio.json).'); return }
    await continuar(p.trim())
  }
  const concluir = async () => {
    const p = sel[0]
    if (p && await messagebox.askyesno('Concluir', 'Marcar este ensaio como concluído? Ele sai da lista (os resultados continuam na pasta).')) {
      await app.marcar_concluido(p)
      setItens(itens.filter(x => x.rel !== p))
      setSel([])
    }
  }
  const cols = ([['Ensaio', 210], ['Salvo em', 130], ['Perfil', 220], ['Abastecimentos', 100], ['Falhas', 60], ['Onde parou (última leitura)', 320]] as [string, number][])
    .map(([id, largura]) => ({ id, largura, anchor: (id === 'Perfil' || id.startsWith('Onde') ? 'w' : 'center') as 'w' | 'center' }))
  const linhas = itens.map(({ rel, est }) => ({
    id: rel, valores: [String(est.nome || rel), String(est.salvo_em ?? ''), String(est.perfil ?? ''), `${est.n_leitura ?? 0} / ${est.n_abastecimentos ?? '?'}`, String(est.n_falha ?? 0), VigiaApp._onde_parou(est)],
  }))
  const layout = useMemo(() => ({}), [])
  return (
    <Jan titulo="Continuar ensaio" fechar={fechar} largura={1080}>
      <div style={{ font: 'bold 13px "Segoe UI"' }}>Ensaios não concluídos (escolha um para continuar de onde parou):</div>
      <div style={{ height: 8 * 22 + 30, display: 'flex', margin: '6px 0' }}>
        <Tabela colunas={cols} linhas={linhas} layout={layout} chave="x" sel={sel} aoSelecionar={setSel} aoDuploClique={id => void continuar(id)} />
      </div>
      {!itens.length && <div style={{ color: COR_NEUTRO }}>Nenhum ensaio incompleto encontrado em &apos;resultados&apos;.</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <Botao className="acao" onClick={() => void continuar()}>▶ Continuar este ensaio</Botao>
        <Botao onClick={() => void outra()}>Abrir outra pasta…</Botao>
        <Botao onClick={() => void concluir()}>Marcar como concluído</Botao>
        <span style={{ flex: 1 }} />
        <Botao onClick={fechar}>Cancelar</Botao>
      </div>
    </Jan>
  )
}

// ------------------------------------------------------------------ escolher / editar segmento
function Escolher({ app }: { app: VigiaApp }) {
  const segs = app.cron.segmentos, st = app.seg_status
  const [sel, setSel] = useState<string[]>(() => { const p = app._proximo_pendente(app.cron.idx); return p !== null ? [String(p)] : [] })
  const [, forcar] = useState(0)
  const fechar = () => app.janela.set(null)
  const feitos = st.filter(x => x === 'feito').length
  const ir = async () => {
    if (!sel.length) return
    const i = Number(sel[0])
    if (st[i] === 'feito' && !await messagebox.askyesno('Segmentos', `'${rotulo(segs[i])}' já foi feito. Repetir?`)) return
    app.ir_para_segmento(i)
    fechar()
  }
  const editar = async () => {
    if (!sel.length) return
    await app.dialogo_editar_segmento(Number(sel[0]))
    forcar(n => n + 1)
  }
  const trazer = async () => {
    await app.dialogo_trazer_leituras(sel.length ? Number(sel[0]) : app.cron.idx)
    forcar(n => n + 1)
  }
  const cols = [{ id: '#', largura: 40 }, { id: 'Segmento', largura: 420, anchor: 'w' as const }, { id: 'Situação', largura: 110 }]
  const layout = useMemo(() => ({}), [])
  return (
    <Jan titulo="Escolher segmento" fechar={fechar} largura={640}>
      <div>{feitos} de {segs.length} segmentos feitos  —  verde = feito, amarelo = em andamento, laranja = pulado (pendente)</div>
      <div style={{ height: Math.min(24, segs.length) * 22 + 30, display: 'flex', margin: '6px 0' }}>
        <Tabela colunas={cols} linhas={segs.map((s, i) => ({ id: String(i), valores: [String(i + 1), rotulo(s), st[i]], tag: st[i] }))} layout={layout} chave="x"
          sel={sel} aoSelecionar={setSel} aoDuploClique={() => void ir()} cores={App.CORES_SEG} />
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <Botao onClick={() => void trazer()}>Trazer leituras de outro ensaio…</Botao>
        <span style={{ flex: 1 }} />
        <Botao onClick={fechar}>Fechar</Botao>
        <Botao onClick={() => void editar()}>Editar segmento…</Botao>
        <Botao onClick={() => void ir()}>Fazer este segmento</Botao>
      </div>
    </Jan>
  )
}

function EditarSeg({ app, i, resolver }: { app: VigiaApp; i: number; resolver: (ok: boolean) => void }) {
  const seg = app.cron.segmentos[i] as unknown as Record<string, unknown>
  const FLOAT = new Set(['f_ini', 'f_fim', 'passo_pct', 'dwell_s', 'extra_s', 'duracao_s'])
  const [vs] = useState(() => Object.fromEntries(VigiaApp.CAMPOS_SEG.map(([k]) => {
    const val = seg[k]
    return [k, new Var(FLOAT.has(k) && typeof val === 'number' ? fmtG(val).replace('.', ',') : String(val))]
  })) as Record<string, Var<string>>)
  const [ag] = useState(() => new Var(!!seg.aguardar))
  const [perf] = useState(() => new Var(false))
  const em_and = app.cron.idx === i && (app.cron.estado === 'rodando' || app.cron.estado === 'pausado')
  const salvar = () => {
    const dados: Record<string, string | boolean> = Object.fromEntries(Object.entries(vs).map(([k, v]) => [k, v.get()]))
    dados.aguardar = ag.get()
    resolver(!!app.editar_segmento(i, dados, perf.get()))
  }
  return (
    <Jan titulo={`Editar segmento ${i + 1}`} fechar={() => resolver(false)}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1px 6px', alignItems: 'center' }}>
        {VigiaApp.CAMPOS_SEG.map(([k, rot]) => (
          <FragLinha key={k} rot={rot}>
            {k === 'face' ? <Combo v={vs[k]} valores={FACES_PADRAO} width={30} />
              : k === 'polarizacao' ? <Combo v={vs[k]} valores={POLARIZACOES_PADRAO} width={30} />
              : <Entrada v={vs[k]} width={k === 'nome' || k === 'obs' ? 34 : 14} />}
          </FragLinha>
        ))}
        <span /><Check v={ag}>Aguardar operador para iniciar</Check>
        <div style={{ gridColumn: 'span 2', marginTop: 6 }}><Check v={perf}>Aplicar também ao perfil &apos;{app.cfg.perfil}&apos; (próximos ensaios)</Check></div>
        {em_and && <div style={{ gridColumn: 'span 2', color: COR_AVISO, maxWidth: 420, margin: '4px 0' }}>Este é o segmento em andamento: ao salvar, ele recomeça do início e aguarda &apos;Iniciar próximo segmento&apos;.</div>}
      </div>
      <div style={rodape}><Botao onClick={salvar}>Salvar</Botao><Botao onClick={() => resolver(false)}>Cancelar</Botao></div>
    </Jan>
  )
}

function FragLinha({ rot, children }: { rot: string; children: ReactNode }) {
  return <><span>{rot}:</span><span>{children}</span></>
}

// ------------------------------------------------------------------ trazer leituras de outro ensaio
function Trazer({ app, j }: { app: VigiaApp; j: Extract<Janela, { tipo: 'trazer' }> }) {
  const alvo = j.i_seg >= 0 && j.i_seg < app.cron.segmentos.length ? rotulo(app.cron.segmentos[j.i_seg]) : ''
  const [sel, setSel] = useState<string[]>(alvo in j.grupos ? [alvo] : [])
  const linhas = Object.entries(j.grupos).map(([nome, g]: [string, LeituraReg[]]) => {
    const fs = g.map(l => l.freq).filter((x): x is number => !!x)
    return { id: nome, valores: [nome, String(g.length), fs.length ? `${fmtFreq(Math.min(...fs))} → ${fmtFreq(Math.max(...fs))}` : '—'] }
  })
  const cols = [{ id: 'Segmento', largura: 330, anchor: 'w' as const }, { id: 'Leituras', largura: 70 }, { id: 'Frequências', largura: 190 }]
  const layout = useMemo(() => ({}), [])
  const ok = async () => {
    if (!sel.length) return
    j.resolver()
    await app.trazer_ok(j.i_seg, j.est, j.rel, sel)
  }
  return (
    <Jan titulo={`Trazer leituras de '${String(j.est.nome || j.rel)}'`} fechar={j.resolver} largura={640}>
      <div style={{ maxWidth: 560 }}>Escolha os segmentos cujas leituras já feitas devem entrar neste ensaio (Ctrl+clique para vários). Elas vão para o Registro com os totalizadores daquele ensaio e não entram no totalizador deste.</div>
      <div style={{ height: 10 * 22 + 30, display: 'flex', margin: '6px 0' }}>
        <Tabela colunas={cols} linhas={linhas} layout={layout} chave="x" sel={sel} aoSelecionar={setSel} />
      </div>
      <div style={rodape}><Botao onClick={() => void ok()}>Trazer</Botao><Botao onClick={j.resolver}>Cancelar</Botao></div>
    </Jan>
  )
}
