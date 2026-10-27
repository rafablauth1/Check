'use client'
// Aba "Perfil EMC (frequências / etapas)" — porte de App._montar_emc e _gerar_faces (vigia7s/app.py).
import { useMemo, useState } from 'react'
import { useVar, Var } from '@/lib/vigia/tk'
import { App, COR_NEUTRO } from '@/lib/vigia/app'
import { FACES_PADRAO, POLARIZACOES_PADRAO, ORDENS, expandir, duracao, fmtTempo, type Segmento } from '@/lib/vigia/emc'
import { somaPy } from '@/lib/vigia/ciclo'
import { Botao, Check, Entrada, Combo, ComboRO, LabelFrame, Painel, Tabela, type ColunaTabela } from './widgets'

const COLS: ColunaTabela[] = (
  [['#', 35], ['Nome', 140], ['Face', 105], ['Polarização', 85], ['Tipo', 70], ['Início', 85], ['Fim', 85], ['Passo %', 60],
    ['Dwell (s)', 65], ['Extra (s)', 60], ['Passos', 55], ['Duração', 65], ['Aguardar', 65], ['Observação', 180], ['Situação', 75]] as const
).map(([id, largura]) => ({ id, largura, anchor: id === 'Nome' || id === 'Observação' ? 'w' : 'center' }))

const LINHA: [string, string, number][] = [
  ['nome', 'Nome', 22], ['tipo', 'Tipo', 10], ['f_ini', 'F. inicial (MHz)', 9], ['f_fim', 'F. final (MHz)', 9],
  ['passo_pct', 'Passo log (%)', 6], ['dwell_s', 'Dwell (s)', 6], ['extra_s', 'Extra/passo (s)', 6],
  ['duracao_s', 'Duração (s) [etapa por tempo]', 8],
]

export default function AbaEmc({ app }: { app: App }) {
  const nomes = useVar(app.perfisNomes)
  const linhas = useVar(app.linhasSeg)
  const sel = useVar(app.selSeg)
  const total = useVar(app.lbl_total)
  const freqs = useVar(app.txt_freqs)
  const versaoLayout = useVar(app.versaoLayout)
  const [expandida, setExpandida] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--vg-fundo)', margin: -4 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 2, flexWrap: 'wrap' }}>
        <span className="vg-titulo">Perfil / norma:</span>
        <span style={{ margin: '0 6px' }}><ComboRO v={app.v_perfil} valores={nomes} width={60} onSelect={() => app._perfil_escolhido()} /></span>
        <Botao onClick={() => void app._novo_perfil()}>Novo perfil</Botao>
        <Botao onClick={() => app._duplicar_perfil()}>Duplicar perfil</Botao>
        <Botao onClick={() => void app._excluir_perfil()}>Excluir perfil</Botao>
        <Botao onClick={() => void app._salvar_perfis()}>Salvar perfis</Botao>
        <Botao style={{ marginLeft: 12 }} onClick={() => void app._gerar_faces()}>Gerar faces × polarizações…</Botao>
      </div>
      <div style={{ flex: 1, minHeight: 120, display: 'flex', padding: '0 8px' }}>
        <Painel key={versaoLayout} layout={app.layout} chave="perfil_segmentos_freqs" padrao={t => Math.max(40, t - 290)}
          aoGuardar={() => app.salvarLayoutDepois()} esconderSegundo={expandida}
          primeiro={
            <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Tabela colunas={COLS} linhas={linhas} layout={app.layout} chave="perfil_colunas" sel={sel}
                aoSelecionar={ids => app._seg_selecionado(ids)} aoArrastar={(a, b) => app._seg_drag_fim(a, b)} cores={App.CORES_SEG} />
              <Botao className="vg-expandir" style={{ top: 1, right: 2 }} onClick={() => setExpandida(x => !x)}>{expandida ? '⤡ Restaurar' : '⤢ Expandir'}</Botao>
            </div>
          }
          segundo={
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, paddingLeft: 6 }}>
              <span>Frequências do segmento selecionado:</span>
              <div className="vg-text" style={{ flex: 1, minHeight: 0 }}>{freqs}</div>
            </div>
          } />
      </div>
      <div className="vg-titulo" style={{ padding: '4px 8px' }}>{total}</div>
      <LabelFrame text="Editar segmento" style={{ margin: '6px 8px' }}>
        <div style={{ display: 'grid', justifyContent: 'start', alignItems: 'center', gridTemplateColumns: `repeat(${LINHA.length + 1}, auto)` }}>
          {LINHA.map(([k, rot], j) => <div key={k} style={{ gridRow: 1, gridColumn: j + 1, padding: '0 4px' }}>{rot}</div>)}
          {LINHA.map(([k, , w], j) => (
            <div key={k} style={{ gridRow: 2, gridColumn: j + 1, padding: '0 4px' }}>
              {k === 'tipo' ? <ComboRO v={app.v_seg[k]} valores={['varredura', 'tempo']} width={w} /> : <Entrada v={app.v_seg[k]} width={w} />}
            </div>
          ))}
          <div style={{ gridRow: 2, gridColumn: LINHA.length + 1, padding: '0 6px' }}><Check v={app.v_seg_ag}>Aguardar operador para iniciar</Check></div>
          <div style={{ gridRow: 3, gridColumn: 1, padding: '0 4px' }}>Face do EUT</div>
          <div style={{ gridRow: 4, gridColumn: 1, padding: '0 4px' }}><Combo v={app.v_seg.face} valores={['', ...FACES_PADRAO]} width={20} /></div>
          <div style={{ gridRow: 3, gridColumn: 2, padding: '0 4px' }}>Polarização</div>
          <div style={{ gridRow: 4, gridColumn: 2, padding: '0 4px' }}><Combo v={app.v_seg.polarizacao} valores={['', ...POLARIZACOES_PADRAO]} width={10} /></div>
          <div style={{ gridRow: 3, gridColumn: '3 / span 4', padding: '0 4px' }}>Observação (nível, antena, acoplamento…)</div>
          <div style={{ gridRow: 4, gridColumn: '3 / span 4', padding: '0 4px' }}><Entrada v={app.v_seg.obs} width={40} /></div>
          <div style={{ gridRow: 4, gridColumn: '7 / span 3', display: 'flex', gap: 4, paddingLeft: 2 }}>
            <Botao onClick={() => app._seg_add()}>Adicionar</Botao>
            <Botao onClick={() => app._seg_upd()}>Atualizar selecionado</Botao>
            <Botao onClick={() => app._seg_rem()}>Remover</Botao>
            <Botao style={{ width: 30 }} onClick={() => app._seg_mover(-1)}>▲</Botao>
            <Botao style={{ width: 30 }} onClick={() => app._seg_mover(1)}>▼</Botao>
          </div>
        </div>
      </LabelFrame>
      <div style={{ color: COR_NEUTRO, maxWidth: 1350, padding: '0 8px 8px' }}>
        Varredura: f(n+1) = f(n) × (1 + passo/100), permanecendo Dwell + Extra segundos em cada frequência (o &apos;Extra&apos; compensa o tempo que o software do gerador gasta para nivelar cada passo — se o app adiantar/atrasar em relação ao gerador, ajuste o Extra ou use &quot;Sincronizar frequência&quot; na aba Ensaio). Polarização H/V, faces do EUT etc. podem ser adicionadas como segmentos separados. Alterações no perfil valem para o próximo ensaio iniciado.
      </div>
      <DialogoFaces app={app} />
    </div>
  )
}

function DialogoFaces({ app }: { app: App }) {
  const base = useVar(app.dlgFaces)
  if (!base) return null
  return <JanelaFaces app={app} base={base} />
}

function JanelaFaces({ app, base }: { app: App; base: Segmento[] }) {
  const [v] = useState(() => ({
    faces: new Var(FACES_PADRAO.join(', ')),
    pols: new Var(POLARIZACOES_PADRAO.join(', ')),   // Vertical, Horizontal
    ordem: new Var(Object.keys(ORDENS)[0]),           // face → faixa → V/H (bomba)
  }))
  const faces = useVar(v.faces), pols = useVar(v.pols), ordem = useVar(v.ordem)
  const listas = (): [string[], string[]] => [faces.split(',').map(x => x.trim()).filter(Boolean), pols.split(',').map(x => x.trim()).filter(Boolean)]
  const previa = useMemo(() => {
    const [fc, pl] = listas()
    const novos = expandir(base, fc, pl, ordem)
    return `${novos.length} segmentos, perturbação ≈ ${fmtTempo(somaPy(novos.map(duracao)))} (sem contar as trocas). Cada um aguarda o operador, exceto o 1º.`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faces, pols, ordem, base])
  return (
    <div className="vg-dlg-fundo" onKeyDown={e => { if (e.key === 'Escape') app.dlgFaces.set(null) }}>
      <div className="vg-dlg" role="dialog" style={{ maxWidth: 600 }}>
        <div className="tit">Gerar faces × polarizações</div>
        <div style={{ padding: 12, background: 'var(--vg-fundo)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ maxWidth: 520 }}>Faixas base: {base.map(s => s.nome).join(', ')}</span>
          <span style={{ marginTop: 8 }}>Faces do EUT (separadas por vírgula):</span>
          <Entrada v={v.faces} width={55} />
          <span style={{ marginTop: 8 }}>Polarizações (vazio = não repetir):</span>
          <Entrada v={v.pols} width={55} />
          <span style={{ marginTop: 8 }}>Ordem de execução:</span>
          <ComboRO v={v.ordem} valores={Object.keys(ORDENS)} width={52} />
          <span style={{ color: COR_NEUTRO, margin: '6px 0' }}>{previa}</span>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <Botao onClick={() => { const [fc, pl] = listas(); void app._gerar_faces_aplicar(base, fc, pl, ordem) }}>Gerar</Botao>
            <Botao onClick={() => app.dlgFaces.set(null)}>Cancelar</Botao>
          </div>
        </div>
      </div>
    </div>
  )
}
