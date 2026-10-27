'use client'
// Aba "Tempo, validação e alarme" — porte de App._montar_config (vigia7s/app.py).
import type { CSSProperties, ReactNode } from 'react'
import { useVar, type Var } from '@/lib/vigia/tk'
import { COR_NEUTRO, type App } from '@/lib/vigia/app'
import { Botao, Label, Check, Radio, Entrada, Combo, ComboRO, Spin, LabelFrame } from './widgets'

/** célula de grid do Tk: row/column (base 0), spans, sticky "w"/"e" */
function G({ r, c, rs = 1, cs = 1, e, pad, children, style }: {
  r: number; c: number; rs?: number; cs?: number; e?: boolean; pad?: string; children: ReactNode; style?: CSSProperties
}) {
  return (
    <div style={{ gridRow: `${r + 1} / span ${rs}`, gridColumn: `${c + 1} / span ${cs}`, justifySelf: e ? 'end' : 'start', padding: pad, display: 'flex', alignItems: 'center', ...style }}>
      {children}
    </div>
  )
}
const grid: CSSProperties = { display: 'grid', justifyContent: 'start', alignItems: 'center', columnGap: 0 }

const ITENS: [string, string][] = [
  ['intervalo_s', '[Por tempo] Ler 1 abastecimento a cada (s) — conta da saída do valor congelado'],
  ['n_abastecimentos', 'Número de abastecimentos do ensaio (n)'],
  ['quadros', 'Quadros capturados por leitura (votação)'],
  ['janela_s', 'Janela de captura de cada leitura (s)'],
  ['concordancia', 'Concordância mínima entre quadros (0–1)  — abaixo disso = INSTÁVEL'],
  ['limite_erro_pct', 'REPROVAR (linha vermelha + alarme) leitura com |erro| a partir de (%)  (0 = não)'],
  ['erro_grave_pct', '… erro LEVE até (%): 3 bipes curtos; acima disso: alarme CONTÍNUO'],
  ['parar_erros_n', 'PARAR após N leituras SEGUIDAS com erro (0 = não)'],
  ['parar_erro_pct', '… erro maior que (%) em relação ao valor esperado'],
]

export default function AbaConfig({ app }: { app: App }) {
  const nomes = useVar(app.nomesCampos)
  // pack(fill="x"): ocupa a largura toda, mas nunca menos que o conteúdo (rola na horizontal, como o Tk corta)
  const lf: CSSProperties = { margin: '8px 10px', width: 'max-content', minWidth: 'calc(100% - 20px)' }
  return (
    <div style={{ overflow: 'auto', flex: 1, minHeight: 0, background: 'var(--vg-fundo)', margin: -4 }}>
      <LabelFrame text="Tempo das leituras (cada leitura = 1 abastecimento)" style={lf}>
        <div style={{ ...grid, gridTemplateColumns: 'max-content auto max-content' }}>
          {ITENS.map(([k, rot], i) => (
            <Linha key={k} i={i} rot={rot} v={app.v_ens[k]} />
          ))}
          <G r={0} c={2} rs={9} pad="0 6px 0 30px" style={{ alignSelf: 'start' }}><QuandoLer app={app} /></G>
          <G r={9} c={0} cs={2} pad="0 6px"><Check v={app.v_parar_n}>Encerrar o ensaio automaticamente ao atingir n abastecimentos</Check></G>
          <G r={10} c={0} cs={2} pad="0 6px"><Check v={app.v_pausa_aguard}>Não fazer leituras enquanto aguarda o operador iniciar o próximo segmento EMC</Check></G>
          <G r={11} c={0} cs={2} pad="0 6px">
            <Check v={app.v_confirmar}>Confirmar falha com uma 2ª leitura após</Check>
            <span style={{ margin: '0 2px' }}><Entrada v={app.v_confirmar_s} width={5} /></span>
            <span>s  (evita alarme falso por ruído no vídeo/TV; se a 2ª der OK, fica &apos;OK*&apos; em amarelo)</span>
          </G>
          <G r={12} c={0} cs={2} pad="0 6px">
            <Check v={app.v_disparo}>Perturbação começa a contar na 1ª SAÍDA do valor congelado (sincroniza com a bomba; vale também para cada novo segmento)</Check>
          </G>
        </div>
      </LabelFrame>

      <LabelFrame text="Verificação de consistência (Total = Litros × Preço)" style={lf}>
        <div style={grid}>
          <G r={0} c={0} pad="0 6px"><Check v={app.v_cons_on}>Ativar</Check></G>
          {([['Volume:', app.v_cons_vol], ['Preço:', app.v_cons_pre], ['Total:', app.v_cons_tot]] as const).map(([rot, v], j) => (
            <Celulas key={rot} c={1 + 2 * j} rot={rot}><ComboRO v={v} valores={nomes} width={12} /></Celulas>
          ))}
          <Celulas c={7} rot="Tolerância:"><Entrada v={app.v_cons_tol} width={8} /></Celulas>
        </div>
      </LabelFrame>

      <LabelFrame text="Alarme e avisos (bipe e/ou voz)" style={lf}>
        <div style={grid}>
          <G r={0} c={0} pad="0 6px"><Check v={app.v_al_on}>Tocar alarme em falha</Check></G>
          <G r={0} c={1} e pad="0 2px 0 12px">Frequência (Hz):</G>
          <G r={0} c={2}><Entrada v={app.v_al_freq} width={7} /></G>
          <G r={0} c={3} e pad="0 2px 0 12px">Duração do bipe (ms):</G>
          <G r={0} c={4}><Entrada v={app.v_al_dur} width={7} /></G>
          <G r={0} c={5} pad="0 12px"><Botao onClick={() => app._testar_alarme()}>Testar alarme</Botao></G>
          <G r={1} c={0} cs={3} pad="0 6px"><Check v={app.v_al_cont}>Tocar sem parar até o operador reconhecer</Check></G>
          <G r={2} c={0} cs={5} pad="0 6px"><Check v={app.v_al_seg}>Bipe curto de aviso quando um segmento EMC termina (troca de antena)</Check></G>
          <G r={3} c={0} pad="6px 6px 0">Avisos:</G>
          <G r={3} c={1} cs={2} pad="6px 0 0"><ComboRO v={app.v_al_modo} valores={['bipe e voz', 'voz', 'bipe']} width={12} /></G>
          <G r={3} c={3} pad="6px 0 0"><Botao onClick={() => app._testar_voz()}>Testar voz</Botao></G>
          <G r={3} c={4} cs={4} pad="6px 6px 0" style={{ color: COR_NEUTRO }}>
            voz = frases faladas (&quot;erro elevado…&quot;, &quot;faltam 3 pontos…&quot;); erro acima do limite grave: janela vermelha + frase repetida e/ou buzzer até reconhecer
          </G>
          <G r={4} c={0} pad="4px 6px 6px">Avisar quando faltarem</G>
          <G r={4} c={1} pad="4px 0 6px"><Entrada v={app.v_al_falta} width={5} /></G>
          <G r={4} c={2} cs={3} pad="4px 0 6px">pontos para terminar o segmento / o ensaio (0 = não avisa)</G>
          <G r={4} c={5} e pad="4px 2px 6px 12px">Avisar mostrador parado há (s):</G>
          <G r={4} c={6} pad="4px 0 6px"><Entrada v={app.v_al_trav} width={6} /></G>
          <G r={4} c={7} pad="4px 4px 6px" style={{ color: COR_NEUTRO }}>(antes da parada automática; 0 = não avisa)</G>
        </div>
      </LabelFrame>

      <LabelFrame text="Totalizador da bomba (inicial / parciais / final × soma dos volumes lidos)" style={lf}>
        <div style={grid}>
          <G r={0} c={0} pad="0 6px">Campo com o volume de cada abastecimento:</G>
          <G r={0} c={1}><ComboRO v={app.v_tot_campo} valores={nomes} width={12} /></G>
          <G r={0} c={2} e pad="0 2px 0 12px">Tolerância (L):</G>
          <G r={0} c={3}><Entrada v={app.v_tot_tol} width={8} /></G>
          <G r={0} c={4} pad="0 12px"><Check v={app.v_tot_ini}>Pedir o totalizador inicial ao iniciar</Check></G>
          <G r={0} c={5}><Check v={app.v_tot_fim}>Pedir o final ao encerrar</Check></G>
        </div>
      </LabelFrame>

      <LabelFrame text="Imagens" style={lf}>
        <div style={grid}>
          <G r={0} c={0} pad="0 6px"><Check v={app.v_img_falha}>Salvar foto do display nas falhas</Check></G>
          <G r={0} c={1} pad="0 6px"><Check v={app.v_img_todas}>Salvar foto de TODAS as leituras</Check></G>
        </div>
      </LabelFrame>

      <div style={{ display: 'flex', alignItems: 'center', padding: 10 }}>
        <Botao className="acao" onClick={() => void app._salvar_cfg_msg()}>Salvar configuração</Botao>
        <Botao style={{ marginLeft: 12 }} onClick={() => void app._restaurar_layout()}>Restaurar tamanhos das áreas e colunas</Botao>
      </div>
      <div style={{ color: COR_NEUTRO, maxWidth: 1100, padding: '0 10px 10px' }}>
        Dica: ajuste o intervalo para a duração exata de um ciclo da bomba (abastecer + pausa) e a primeira leitura para o momento em que o display já mostra o valor final do 1º abastecimento. Se as leituras saírem de fase com a bomba, clique em &quot;Fim do abastecimento AGORA&quot; na aba Ensaio no instante em que um abastecimento termina.
      </div>
    </div>
  )
}

function Linha({ i, rot, v }: { i: number; rot: string; v: Var<string> }) {
  return (
    <>
      <G r={i} c={0} pad="2px 6px">{rot}:</G>
      <G r={i} c={1}><Entrada v={v} width={10} /></G>
    </>
  )
}

function Celulas({ c, rot, children }: { c: number; rot: string; children: ReactNode }) {
  return (
    <>
      <G r={0} c={c} e pad="0 2px 0 12px">{rot}</G>
      <G r={0} c={c + 1}>{children}</G>
    </>
  )
}

function QuandoLer({ app }: { app: App }) {
  const medir = useVar(app.bt_medir)
  const aplicar = useVar(app.bt_med_aplicar)
  const dwell = useVar(app.bt_dwell)
  return (
    <LabelFrame text="Quando fazer a leitura">
      <div style={{ ...grid, gridTemplateColumns: 'max-content auto' }}>
        <G r={0} c={0} cs={2} pad="0 4px"><Radio v={app.v_modo_leit} valor="congelado">AUTOMÁTICO: quando o valor do display CONGELA (fase de validação da bomba)</Radio></G>
        {([['congelado_s', '   Valor parado há pelo menos (s):'], ['intervalo_min_s', '   Intervalo mínimo entre leituras (s):'],
          ['travado_s', '   PARAR o ensaio se o display ficar travado por (s, 0 = não):']] as const).map(([k, rot], i) => (
          <Par key={k} r={1 + i} rot={rot}><Entrada v={app.v_ens[k]} width={7} /></Par>
        ))}
        <G r={4} c={0} cs={2} pad="6px 4px 0"><Radio v={app.v_modo_leit} valor="tempo">POR TEMPO: 1º congelamento após o início; depois 1 abastecimento a cada &apos;intervalo&apos; (dwell)</Radio></G>
        <G r={5} c={0} cs={2} pad="4px" style={{ color: COR_NEUTRO, maxWidth: 520 }}>
          No automático o app acompanha o display o tempo todo: números mudando = abastecendo; parados = congelado para validação → lê nesse momento. Cada ciclo se sincroniza sozinho.
        </G>
        <G r={6} c={0} cs={2} pad="2px 4px 4px" style={{ justifySelf: 'stretch', display: 'block' }}>
          <LabelFrame text="Medir o ciclo da bomba (tempo entre saídas do valor congelado)">
            <div style={{ display: 'flex', alignItems: 'center', padding: '2px 4px', flexWrap: 'wrap', rowGap: 2 }}>
              <Botao onClick={() => void app.medir_ciclo()}>{medir}</Botao>
              <span style={{ margin: '0 2px 0 8px' }}>ciclos válidos:</span>
              <Spin v={app.v_med_n} de={1} ate={20} inc={1} width={4} />
              <span style={{ margin: '0 2px 0 8px' }}>valor congelado:</span>
              <Combo v={app.v_med_ref} valores={['auto', '4', '4,000']} width={7} />
              <Botao style={{ marginLeft: 8 }} disabled={!aplicar} onClick={() => void app._aplicar_ciclo()}>Aplicar ao ensaio</Botao>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
              <Label v={app.lbl_med_media} style={{ fontSize: 24, fontWeight: 'bold' }} />
              <Botao style={{ marginLeft: 10 }} disabled={!dwell} onClick={() => void app._ciclo_para_dwell()}>Usar ciclo + offset como dwell no perfil EMC</Botao>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '2px 4px 0' }}>
              <span>Offset por ciclo (s, + ou −):</span>
              <span style={{ margin: '0 6px 0 2px' }}><Entrada v={app.v_ens.ciclo_offset_s} width={8} /></span>
              <Botao onClick={() => void app._offset_inteiro()}>Arredondar p/ segundo inteiro</Botao>
              <Botao style={{ marginLeft: 4 }} onClick={() => app.v_ens.ciclo_offset_s.set('0,000')}>Zerar</Botao>
              <span style={{ marginLeft: 8 }}><Label v={app.lbl_ciclo_off} style={{ fontSize: 15, fontWeight: 'bold' }} /></span>
            </div>
            <div style={{ padding: '0 4px 4px' }}><Label v={app.lbl_med} wrap={520} /></div>
          </LabelFrame>
        </G>
      </div>
    </LabelFrame>
  )
}

function Par({ r, rot, children }: { r: number; rot: string; children: ReactNode }) {
  return (
    <>
      <G r={r} c={0} pad="0 4px" style={{ whiteSpace: 'pre' }}>{rot}</G>
      <G r={r} c={1}>{children}</G>
    </>
  )
}
