'use client'
// Aba "Registro (FOR EMC38)" — porte da interface de RegistroUI (vigia7s/registro.py). O registro aberto é o
// mesmo do VIGIA-7S da área de trabalho (mesmo arquivo, mesma config).
import { useEffect, useState, type CSSProperties } from 'react'
import { useVar } from '@/lib/vigia/tk'
import type { VigiaApp } from '@/lib/vigia/ensaio'
import type { RegistroUI } from '@/lib/vigia/registro-ui'
import { MODELOS, INICIAIS, DADOS_CAMPOS, CAB_CAMPOS, BLOCO_CAB } from '@/lib/vigia/registro'
import { Botao, LabelFrame, Notebook, Painel } from './widgets'
import TabelaEditavel from './TabelaEditavel'
import JanelasRegistro from './JanelasRegistro'

const CINZA = '#5f6368'
const negrito10: CSSProperties = { font: 'bold 13px "Segoe UI"' }
const basename = (p: string) => p.split(/[\\/]/).pop() ?? p

export default function AbaRegistro({ app, vigiaAberto }: { app: VigiaApp; vigiaAberto: boolean }) {
  const ui = app.registro
  useVar(ui.rev)
  const carregado = useVar(ui.carregado)
  const nbApp = useVar(app.nb)
  // ao entrar na aba, relê o arquivo: o VIGIA da área de trabalho pode ter mudado o registro
  useEffect(() => { if (nbApp === 4) void ui.reler() }, [nbApp, ui])
  if (!carregado) return <div style={{ padding: 20 }}>Carregando…</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', flexWrap: 'wrap' }}>
        <span style={negrito10}>Registro:</span>
        <span style={{ margin: '0 6px' }}>{basename(ui.caminho)}</span>
        <Botao onClick={() => void ui.novo()}>Novo…</Botao>
        <Botao onClick={() => void ui.abrir()}>Abrir…</Botao>
        <Botao onClick={() => void ui.salvar_como()}>Salvar como…</Botao>
        <Botao onClick={() => void ui.exportar()}>📊 Exportar planilha (FOR EMC38)</Botao>
        <Botao onClick={() => void ui.emitir_dialogo()}>📄 Emitir relatório / Draft…</Botao>
        <span style={{ color: CINZA, marginLeft: 8 }}>(salvo automaticamente a cada alteração)</span>
      </div>
      {vigiaAberto && (
        <div style={{ margin: '0 6px 4px', padding: '4px 8px', background: '#fef7e0', color: '#8a5300', border: '1px solid #f3d27a' }}>
          O VIGIA-7S da área de trabalho está aberto e usa este mesmo registro: edite em um só dos dois (cada um grava o arquivo inteiro).
        </div>
      )}
      <Notebook abas={[' Dados da amostra ', ' Verificação inicial (e1) ', ' Ensaios ', ' Histórico de atualizações ']} v={ui.nb}
        style={{ flex: 1, minHeight: 0, margin: '0 6px 6px' }}>
        <Dados ui={ui} />
        <Inicial ui={ui} />
        <Ensaios ui={ui} />
        <Historico ui={ui} />
      </Notebook>
      <JanelasRegistro ui={ui} />
    </div>
  )
}

// ------------------------------------------------------------------ helpers de formulário
/** _form(): pares rótulo/entrada ligados ao dicionário alvo (equipamentos: entrada 3× maior, 3 colunas) */
function Form({ ui, campos, porLinha, alvo, larg = 16 }: {
  ui: RegistroUI; campos: [string, string][]; porLinha: number; alvo: Record<string, unknown> | null; larg?: number
}) {
  return (
    // posições do .grid(row=r, column=c) do Tk; "equipamentos" ocupa 3 colunas (columnspan=3)
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${porLinha}, max-content max-content)`, gridAutoColumns: 'max-content', alignItems: 'center', rowGap: 2, padding: '0 2px' }}>
      {campos.map(([k, rot], i) => {
        const eq = k === 'equipamentos'
        const r = Math.floor(i / porLinha) + 1, c = (i % porLinha) * 2 + 1
        return [
          <span key={k + 'r'} style={{ gridRow: r, gridColumn: c, padding: `0 2px 0 ${c === 1 ? 6 : 14}px` }}>{rot}:</span>,
          <input key={k} className="vg-entry" value={String(alvo?.[k] ?? '')} disabled={!alvo}
            style={{ gridRow: r, gridColumn: eq ? `${c + 1} / span 3` : c + 1, width: (eq ? larg * 3 : larg) * 7 + 8, justifySelf: 'start' }}
            onChange={e => ui._mudou(alvo, k, e.target.value)} />,
        ]
      })}
    </div>
  )
}

/** _texto(): observações (o texto guardado vai sem espaços nas pontas) */
function Texto({ ui, alvo, k, linhas = 3, style }: { ui: RegistroUI; alvo: Record<string, unknown> | null; k: string; linhas?: number; style?: CSSProperties }) {
  const [t, setT] = useState(String(alvo?.[k] ?? ''))
  const [dono, setDono] = useState(alvo)
  if (dono !== alvo || (alvo && String(alvo[k] ?? '') !== t.trim())) {
    // outro bloco/ensaio ou texto mudado pelo código (Texto padrão, montagem): recarrega
    setDono(alvo); setT(String(alvo?.[k] ?? ''))
  }
  return (
    <textarea className="vg-texto" rows={linhas} value={t} disabled={!alvo}
      style={{ width: '100%', boxSizing: 'border-box', resize: 'none', font: '12px "Segoe UI"', ...style }}
      onChange={e => { setT(e.target.value); ui._mudou_texto(alvo, k, e.target.value) }} />
  )
}

function Combo({ valor, valores, largura, aoMudar }: { valor: string; valores: string[]; largura: number; aoMudar: (v: string) => void }) {
  return (
    <select className="vg-combo" data-ro value={valor} style={{ width: largura * 8 + 26 }} onChange={e => aoMudar(e.target.value)}>
      {!valores.includes(valor) && <option value={valor}>{valor}</option>}
      {valores.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// ------------------------------------------------------------------ DADOS
function Dados({ ui }: { ui: RegistroUI }) {
  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      <div style={{ font: 'bold 16px "Segoe UI"', padding: 6 }}>DADOS DA AMOSTRA</div>
      <Form ui={ui} campos={DADOS_CAMPOS} porLinha={2} alvo={ui.reg.dados} larg={30} />
      <div style={{ padding: '10px 6px 0' }}>Observações:</div>
      <div style={{ padding: '0 6px' }}><Texto ui={ui} alvo={ui.reg.dados} k="obs" linhas={6} /></div>
    </div>
  )
}

// ------------------------------------------------------------------ INICIAL
function Inicial({ ui }: { ui: RegistroUI }) {
  const sel_nome = useVar(ui.v_ini_sel)
  const sel = useVar(ui.sel_ini)
  const ini = ui._ini()
  const t = ui.tabela_inicial()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}>
        <span style={negrito10}>Verificação:</span>
        <Combo valor={sel_nome} valores={INICIAIS} largura={26} aoMudar={v => { ui.v_ini_sel.set(v); ui.sel_ini.set([]); ui.mudou() }} />
        <Botao style={{ marginLeft: 8 }} onClick={() => void ui._ini_da_camera()}>Preencher com as últimas leituras da câmera</Botao>
        <span style={{ color: CINZA, marginLeft: 8 }}>Duplo clique na célula para editar (Enter desce para a próxima)</span>
      </div>
      <Form ui={ui} campos={CAB_CAMPOS.filter(([k]) => !k.startsWith('patm'))} porLinha={4} alvo={ini.cab} />
      <div style={{ padding: '2px 0' }}>
        <Form ui={ui} campos={[['tot_ini', 'Totalizador inicial'], ['tot_fim', 'Totalizador final']]} porLinha={2} alvo={ini as unknown as Record<string, unknown>} />
      </div>
      <div style={{ flex: 1, minHeight: 120, display: 'flex', flexDirection: 'column', padding: '4px 6px' }}>
        <TabelaEditavel colunas={[{ id: 'Nº', largura: 50 }, { id: 'Preço unitário (R$)', largura: 130 }, { id: 'Total a pagar [R$]', largura: 140 },
          { id: 'Volume entregue [L]', largura: 140 }, { id: 'Erro e1 [% L]', largura: 120 }, { id: 'Obs.', largura: 300 }]}
          linhas={t.linhas} editaveis={['Volume entregue [L]', 'Obs.']}  // preço: cadastro; total: litros × preço
          aoEditar={(i, col, txt) => ui._edit_ini(i, col, txt)} layout={ui.layout} chave="reg_inicial_colunas"
          sel={sel} aoSelecionar={ids => ui.sel_ini.set(ids)} aoMudarLayout={() => ui.app.salvarLayoutDepois()} />
      </div>
      <div style={{ ...negrito10, padding: '0 6px', whiteSpace: 'pre-wrap' }}>{t.resumo}</div>
      <div style={{ padding: '0 6px' }}>Observações:</div>
      <div style={{ padding: '0 6px 6px' }}><Texto ui={ui} alvo={ini as unknown as Record<string, unknown>} k="obs" linhas={3} /></div>
    </div>
  )
}

// ------------------------------------------------------------------ ENSAIOS
function Ensaios({ ui }: { ui: RegistroUI }) {
  const ens_nome = useVar(ui.v_ens_sel)
  useVar(ui.v_bloco)
  const sel = useVar(ui.sel_ens)
  const sel_fx = useVar(ui.sel_fx)
  const editar = useVar(ui.editar)
  useVar(ui.fotos)
  const ens = ui._ens()
  const m = MODELOS[ens_nome]
  const b = ui._bloco()
  const c = ui.calculos()
  useEffect(() => { void ui.atualizar_fotos() })
  const cab = m.tipo === 'freq' ? 'FreQ. [MHz]' : (ens_nome.includes('D11') ? 'Tensão [V]' : 'Medida')
  const varias = m.tipo === 'freq' && (b?.faixas?.length ?? 0) > 1
  const bAlvo = b as unknown as Record<string, unknown> | null

  const leituras = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Nº = contagem dos pontos com volume (leituras importadas/digitadas); "s/f" = sem frequência (só totalizador)
          Foto = "ver" quando há foto da leitura da câmera (duplo clique abre) — para averiguar uma FALHA */}
      <TabelaEditavel
        colunas={[{ id: 'Nº', largura: varias ? 90 : 45, titulo: c.cabNum, aoClicar: () => ui._alternar_numeracao() },
          { id: 'FreQ./Medida', largura: 100, titulo: cab }, { id: 'Preço unitário (R$)', largura: 115 }, { id: 'Volume entregue [L]', largura: 125 },
          { id: 'Total a pagar [R$]', largura: 125 }, { id: 'Erro [% L]', largura: 85 }, { id: 'Foto', largura: 55 }, { id: 'Obs.', largura: 250 }]}
        linhas={c.linhas} editaveis={['FreQ./Medida', 'Volume entregue [L]', 'Obs.']}  // preço: cadastro; total calculado
        aoEditar={(i, col, txt) => ui._edit_ens(i, col, txt)} aoDuplo={i => void ui.ver_foto(i)}
        layout={ui.layout} chave="reg_leituras_colunas" sel={sel} aoSelecionar={ids => ui.sel_ens.set(ids)}
        editar={editar?.tabela === 'ens' ? editar : null} aoMudarLayout={() => ui.app.salvarLayoutDepois()} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 1px', flexWrap: 'wrap' }}>
        <Botao style={{ marginRight: 4 }} onClick={() => void ui.ver_foto(ui.linha_sel())}>Ver foto da linha</Botao>
        <Botao onClick={() => void ui.ver_grafico(false)}>Gráfico do bloco</Botao>
        <Botao style={{ marginRight: 8 }} onClick={() => void ui.ver_grafico(true)}>Gráfico do ensaio</Botao>
        <Botao onClick={() => void ui._linha_add()}>{m.tipo === 'freq' ? '+ linha (próx. freq. +1 %)' : '+ linha'}</Botao>
        <Botao onClick={() => ui._linha_rem()}>− linha</Botao>
        <Botao style={{ marginLeft: 8 }} onClick={() => void ui._bloco_limpar()}>Limpar valores do bloco</Botao>
        <span style={{ color: CINZA, marginLeft: 8 }}>{c.preco}</span>
      </div>
    </div>
  )
  const obsBloco = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ paddingTop: 6 }}>Observações do bloco:</div>
      <Texto ui={ui} alvo={bAlvo} k="obs" style={{ flex: 1, minHeight: 40 }} />
    </div>
  )
  const obsEnsaio = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingTop: 4 }}>
        <span style={{ flex: 1 }}>Observações do ensaio:</span>
        <Botao onClick={() => void ui._obs_padrao()}>Texto padrão</Botao>
      </div>
      <Texto ui={ui} alvo={ens as unknown as Record<string, unknown>} k="obs" style={{ flex: 1, minHeight: 40 }} />
    </div>
  )
  const obs = <Painel vertical layout={ui.layout} chave="reg_obs_app" padrao={t => Math.round(t / 2)} aoGuardar={() => ui.app.salvarLayoutDepois()}
    primeiro={obsBloco} segundo={obsEnsaio} />
  // totalizador por faixa só nos ensaios por frequência
  const direita = m.tipo === 'freq' ? (
    <Painel vertical layout={ui.layout} chave="reg_faixas_obs_app" padrao={t => Math.round(t / 2)} aoGuardar={() => ui.app.salvarLayoutDepois()}
      primeiro={
        <LabelFrame text="Totalizador por faixa (dif = final − inicial; Prova = real − dif)" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 2 }}>
            <TabelaEditavel colunas={['Faixa', 'f mín', 'f máx', 'Inicial', 'Final', 'dif', 'real', 'Prova'].map((id, i) => ({ id, largura: [95, 70, 70, 95, 95, 75, 75, 75][i] }))}
              linhas={c.faixas} editaveis={['Faixa', 'f mín', 'f máx', 'Inicial', 'Final']} aoEditar={(i, col, txt) => ui._edit_fx(i, col, txt)}
              layout={ui.layout} chave="reg_faixas_colunas" sel={sel_fx} aoSelecionar={ids => ui.sel_fx.set(ids)} esticar
              aoMudarLayout={() => ui.app.salvarLayoutDepois()} />
            <div style={{ display: 'flex', gap: 2, paddingTop: 2 }}>
              <Botao onClick={() => ui._fx_add()}>+ faixa</Botao>
              <Botao onClick={() => ui._fx_rem()}>− faixa</Botao>
            </div>
          </div>
        </LabelFrame>
      }
      segundo={obs} />
  ) : obs

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', flexWrap: 'wrap' }}>
        <span style={negrito10}>Ensaio:</span>
        <Combo valor={ens_nome} valores={Object.keys(MODELOS)} largura={28} aoMudar={v => { ui.v_ens_sel.set(v); ui._carregar_ensaio() }} />
        <span style={{ marginLeft: 12 }}>Erro em relação a:</span>
        <Combo valor={ens.ref} valores={INICIAIS} largura={24} aoMudar={v => void ui._mudou_ref(v)} />
        <Botao style={{ marginLeft: 10 }} onClick={() => void ui.importar_dialogo()}>⬇ Importar leituras do ensaio da câmera…</Botao>
        <Botao onClick={() => void ui.montar_dialogo()}>🧩 Montar por segmento (vários ensaios)…</Botao>
      </div>
      <Form ui={ui} campos={CAB_CAMPOS} porLinha={4} alvo={ens.cab} larg={13} />
      {(m.extras ?? []).length > 0 && <Form ui={ui} campos={(m.extras ?? []).map(([k, rot]) => [k, rot])} porLinha={4} alvo={ens.extras} larg={13} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '6px 6px 2px', flexWrap: 'wrap' }}>
        <span style={negrito10}>Bloco:</span>
        <Combo valor={b?.nome ?? ''} valores={ens.blocos.map(x => x.nome)} largura={44} aoMudar={v => { ui.v_bloco.set(v); ui.sel_ens.set([]); ui.mudou() }} />
        <Botao onClick={() => void ui._bloco_add()}>+ bloco</Botao>
        <Botao onClick={() => void ui._bloco_ren()}>renomear</Botao>
        <Botao onClick={() => void ui._bloco_rem()}>− bloco</Botao>
        {([['tot_ini', 'Totalizador inicial'], ['tot_fim', 'final']] as const).map(([k, rot]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ padding: '0 2px 0 12px' }}>{rot}:</span>
            <input className="vg-entry" value={String(bAlvo?.[k] ?? '')} disabled={!b} style={{ width: 11 * 7 + 8 }}
              onChange={e => ui._mudou(bAlvo, k, e.target.value)} />
          </span>
        ))}
        <span style={{ ...negrito10, marginLeft: 10, color: c.lblRuim ? '#c5221f' : undefined }}>{c.lbl}</span>
      </div>
      {/* cabeçalho do bloco: datas (preenchidas na importação), metrologista e condições ambientais */}
      <div style={{ padding: '0 0 2px' }}><Form ui={ui} campos={BLOCO_CAB} porLinha={7} alvo={bAlvo} larg={11} /></div>
      {/* divisórias arrastáveis: leituras | (totalizador por faixa / observações) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: '0 6px' }}>
        <Painel layout={ui.layout} chave="reg_leituras_faixas" padrao={t => Math.round(t * 0.6)} aoGuardar={() => ui.app.salvarLayoutDepois()}
          primeiro={leituras} segundo={direita} />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ HISTÓRICO
function Historico({ ui }: { ui: RegistroUI }) {
  const hist = [...(ui.reg.historico ?? [])].reverse()
  const larg = { Data: 150, Usuário: 120 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ color: CINZA, padding: '4px 6px' }}>
        Toda alteração deste registro fica anotada aqui automaticamente (data/hora, usuário do Windows e o que mudou) — equivale à aba
        {' '}&apos;Registro de atualizações&apos; do FOR EMC38 e vai junto na planilha exportada.
      </div>
      <div className="vg-tree" style={{ margin: '0 6px 6px' }}>
        <table style={{ width: '100%', minWidth: 1170 }}>
          <colgroup><col style={{ width: larg.Data }} /><col style={{ width: larg.Usuário }} /><col /></colgroup>
          <thead><tr><th style={{ position: 'sticky', textAlign: 'left' }}>Data</th><th style={{ position: 'sticky', textAlign: 'left' }}>Usuário</th><th style={{ position: 'sticky', textAlign: 'left' }}>Alteração</th></tr></thead>
          <tbody>
            {hist.map((h, i) => (
              <tr key={i}><td>{h.data ?? ''}</td><td>{h.usuario ?? ''}</td><td title={h.alteracao}>{h.alteracao ?? ''}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
