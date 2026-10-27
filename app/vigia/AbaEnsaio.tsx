'use client'
// Aba "Ensaio" — porte de App._montar_ensaio (vigia7s/app.py).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useVar } from '@/lib/vigia/tk'
import type { VigiaApp } from '@/lib/vigia/ensaio'
import { COR_OK, COR_FALHA } from '@/lib/vigia/app'
import { Botao, LabelFrame, Painel, Tabela, type ColunaTabela } from './widgets'

const LARG: Record<string, number> = {
  '#': 45, Hora: 75, Tempo: 65, Status: 105, Segmento: 150, 'Freq. atual': 105, 'Erro [% L]': 80, 'Acumulado (L)': 95,
  'Totalizador esperado': 130, 'Faixa varrida desde a leitura anterior': 280, 'Observação': 320, 'Parecer do operador': 300,
}
const TEXTO = new Set(['Observação', 'Faixa varrida desde a leitura anterior', 'Parecer do operador'])
export const ESTILOS_TREE: Record<string, CSSProperties> = {
  ok: { background: '#e6f4ea' },
  // reprovação bem visível: vermelho forte
  falha: { background: '#f8b4b0', color: '#8b0000', fontWeight: 'bold' },
  aviso: { background: '#fef7e0', color: '#8a5300' },
  tot: { background: '#e8f0fe', color: '#174ea6' },
  rebatida: { background: '#f3e8fd', color: '#681da8' },
}

export default function AbaEnsaio({ app }: { app: VigiaApp }) {
  const versaoLayout = useVar(app.versaoLayout)
  const [expandida, setExpandida] = useState<'' | 'imagem' | 'tabela'>('')
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandida('') }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
  // painéis divididos: arraste as divisórias (as posições ficam salvas para a próxima vez)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {expandida === 'tabela' ? <TabelaEnsaio app={app} expandida alternar={() => setExpandida('')} /> : (
        <Painel key={versaoLayout} vertical layout={app.layout} chave="ensaio_imagem_tabela" padrao={t => Math.round(t * 0.72)}
          aoGuardar={() => app.salvarLayoutDepois()} esconderSegundo={expandida === 'imagem'}
          primeiro={
            <Painel layout={app.layout} chave="ensaio_imagem_painel" padrao={t => Math.max(40, t - 480 - 5)}
              aoGuardar={() => app.salvarLayoutDepois()} esconderSegundo={expandida === 'imagem'}
              primeiro={<Visor app={app} expandida={expandida === 'imagem'} alternar={() => setExpandida(x => (x ? '' : 'imagem'))} />}
              segundo={<Lado app={app} />} />
          }
          segundo={<TabelaEnsaio app={app} expandida={false} alternar={() => setExpandida('tabela')} />} />
      )}
    </div>
  )
}

function Visor({ app, expandida, alternar }: { app: VigiaApp; expandida: boolean; alternar: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const sem = useVar(app.semImagem)
  useEffect(() => { app.canvasEnsaio = ref.current; return () => { app.canvasEnsaio = null } }, [app])
  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <canvas ref={ref} className="vg-canvas" />
      {sem && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6b6b', font: 'bold 27px "Segoe UI"', pointerEvents: 'none' }}>
          SEM IMAGEM DA CÂMERA
        </div>
      )}
      <Botao className="vg-expandir" onClick={alternar}>{expandida ? '⤡ Restaurar' : '⤢ Expandir'}</Botao>
    </div>
  )
}

function Lado({ app }: { app: VigiaApp }) {
  const status = useVar(app.lbl_status)
  const det = useVar(app.lbl_status_det)
  const abast = useVar(app.lbl_abast), ok = useVar(app.lbl_ok), falha = useVar(app.lbl_falha)
  const prox = useVar(app.lbl_prox), tempo = useVar(app.lbl_tempo), tot = useVar(app.lbl_tot), ciclo = useVar(app.lbl_ciclo)
  const iniciar = useVar(app.bt_iniciar), pausar = useVar(app.bt_pausar), parar = useVar(app.bt_parar), freq = useVar(app.bt_freq)
  const perfil = useVar(app.lbl_perfil), seg = useVar(app.lbl_seg), lfreq = useVar(app.lbl_freq), passo = useVar(app.lbl_passo)
  const pb = useVar(app.pb_seg), prox_seg = useVar(app.bt_prox_seg)
  const g3: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, margin: '4px 0' }
  const quebra: CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
  return (
    // painel lateral com rolagem: com a janela menor, os botões de baixo continuam alcançáveis
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 4px 0 6px', background: 'var(--vg-fundo)' }}>
      <div style={{ background: status.bg, color: '#fff', font: 'bold 29px "Segoe UI"', textAlign: 'center', padding: '4px 0' }}>{status.text}</div>
      <div className="vg-info" style={{ ...quebra, margin: '2px 0 4px' }}>{det}</div>
      <div className="vg-titulo">{abast}</div>
      <div style={{ display: 'flex', gap: 20 }}>
        <span style={{ font: 'bold 16px "Segoe UI"', color: COR_OK }}>{ok}</span>
        <span style={{ font: 'bold 16px "Segoe UI"', color: COR_FALHA }}>{falha}</span>
      </div>
      <div className="vg-info">{prox}</div>
      <div className="vg-info">{tempo}</div>
      <div className="vg-info" style={quebra}>{tot}</div>
      <div style={{ font: 'bold 15px "Segoe UI"', color: '#1a73e8' }}>{ciclo}</div>

      <div style={g3}>
        <Botao className="acao" disabled={!iniciar} onClick={() => void app.iniciar_ensaio()}>▶ INICIAR ENSAIO</Botao>
        <Botao className="acao" disabled={!pausar.on} onClick={() => void app.pausar_retomar()}>{pausar.text}</Botao>
        <Botao className="acao" disabled={!parar} onClick={() => void app.parar_ensaio()}>⏹ Parar</Botao>
        <Botao onClick={() => app.disparar_leitura(true)}>Ler agora</Botao>
        <Botao onClick={() => app.ressincronizar_leituras()}>Fim do abast. AGORA</Botao>
        <Botao onClick={() => void app.continuar_dialogo()}>↻ Continuar ensaio…</Botao>
        <button type="button" className="vg-bt" style={{ gridColumn: 'span 3', background: '#fce8e6', font: 'bold 13px "Segoe UI"', height: 28 }}
          onClick={() => app.reconhecer_alarme()}>🔕 RECONHECER ALARME</button>
        <Botao onClick={() => void app.abrir_pasta()}>Abrir pasta</Botao>
        <Botao onClick={() => void app.exportar_excel()}>Exportar Excel</Botao>
        <Botao onClick={() => void app.totalizador_manual()}>Totalizador…</Botao>
        <Botao style={{ whiteSpace: 'normal', height: 'auto', minHeight: 23 }} onClick={() => void app.corrigir_leitura()}>✏ Corrigir leitura (câmera leu errado)</Botao>
        <Botao style={{ gridColumn: 'span 2', whiteSpace: 'normal', height: 'auto', minHeight: 23 }} onClick={() => void app.rebater_leitura()}>📝 Parecer sobre reprovação (rebater)… (ou duplo clique)</Botao>
        <button type="button" className="vg-bt" disabled={!freq.on} style={{ gridColumn: 'span 3', background: freq.on ? freq.bg : undefined, font: 'bold 12px "Segoe UI"', whiteSpace: 'normal', height: 'auto', minHeight: 23 }}
          onClick={() => void app.parar_retomar_frequencia()}>{freq.text}</button>
        <Botao style={{ gridColumn: 'span 3' }} onClick={() => void app.excluir_dialogo()}>🗑 Excluir leituras / recomeçar do zero / alterar totalizador inicial…</Botao>
      </div>

      <LabelFrame text="Perturbação EMC" style={{ margin: '4px 0' }}>
        <div className="vg-info" style={{ ...quebra, padding: '0 6px' }}>{perfil}</div>
        <div className="vg-titulo" style={{ ...quebra, padding: '0 6px' }}>{seg}</div>
        <div className="vg-freq" style={{ padding: '0 6px' }}>{lfreq}</div>
        <div className="vg-info" style={{ ...quebra, padding: '0 6px' }}>{passo}</div>
        <div style={{ margin: '4px 6px', height: 16, border: '1px solid #bcbcbc', background: '#e6e6e6' }}>
          <div style={{ width: `${Math.min(100, pb / 10)}%`, height: '100%', background: '#06b025' }} />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '0 4px 6px' }}>
          <Botao disabled={!prox_seg.on} onClick={() => app.iniciar_prox_seg()}>{prox_seg.text}</Botao>
          <Botao onClick={() => void app.sincronizar_freq()}>Sincronizar frequência…</Botao>
          <Botao onClick={() => void app.pular_seg()}>Pular segmento</Botao>
          <Botao onClick={() => void app.escolher_segmento()}>Escolher segmento…</Botao>
        </div>
      </LabelFrame>
    </div>
  )
}

function TabelaEnsaio({ app, expandida, alternar }: { app: VigiaApp; expandida: boolean; alternar: () => void }) {
  const cols = useVar(app.colunasTab)
  const linhas = useVar(app.tree)
  const sel = useVar(app.selTab)
  const ver = useVar(app.verUltimo)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!menu) return
    const fechar = () => setMenu(null)
    window.addEventListener('pointerdown', fechar)
    return () => window.removeEventListener('pointerdown', fechar)
  }, [menu])
  const colunas: ColunaTabela[] = cols.map(c => ({ id: c, largura: LARG[c] ?? 90, anchor: TEXTO.has(c) ? 'w' : 'center' }))
  const item = (texto: string, f: () => void) => (
    <div className="vg-menu-item" onPointerDown={e => { e.stopPropagation(); setMenu(null); f() }}>{texto}</div>
  )
  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Tabela colunas={colunas} linhas={linhas} layout={app.layout} chave="ensaio_colunas" sel={sel} estilos={ESTILOS_TREE} verUltimo={ver}
        aoSelecionar={ids => app.selTab.set(ids)} aoDuploClique={() => void app.rebater_leitura()}
        aoMenu={(_, x, y) => setMenu({ x, y })} />
      <Botao className="vg-expandir" style={{ top: 1, right: 20 }} onClick={alternar}>{expandida ? '⤡ Restaurar' : '⤢ Expandir'}</Botao>
      {menu && (
        <div className="vg-menu" style={{ left: menu.x, top: menu.y }}>
          {item('✏ Corrigir leitura (câmera leu errado)…', () => void app.corrigir_leitura())}
          {item('📝 Parecer sobre reprovação (rebater)…', () => void app.rebater_leitura())}
          <div className="vg-menu-sep" />
          {item('🗑 Excluir leitura(s) selecionada(s)…', () => void app.excluir_dialogo())}
        </div>
      )}
    </div>
  )
}
