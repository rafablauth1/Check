'use client'
// Aba "Registro (FOR EMC38)": o Registro ainda está em teste no VIGIA-7S, então fica no VIGIA da área de trabalho.
// Os dados são os mesmos (config, perfis, resultados/ e resultados/registros/): aqui só se vê o registro aberto lá,
// de onde vêm o preço e o preset usados nas leituras do ensaio.
import { useVar } from '@/lib/vigia/tk'
import type { VigiaApp } from '@/lib/vigia/ensaio'
import { precoReg, presetReg } from '@/lib/vigia/registro'
import { fixo } from '@/lib/vigia/util'
import { COR_NEUTRO } from '@/lib/vigia/app'
import { Botao, LabelFrame } from './widgets'

export default function AbaRegistro({ app, pasta, compartilhada }: { app: VigiaApp; pasta: string; compartilhada: boolean }) {
  const r = useVar(app.registro)
  const preco = r ? precoReg(r.reg) : null
  const preset = r ? presetReg(r.reg) : null
  const abrir = (rel: string) => fetch('/api/vigia', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'abrir', rel }),
  })
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 820 }}>
      <div className="vg-titulo">Registro (FOR EMC38) — em teste no VIGIA-7S</div>
      <div className="vg-info" style={{ whiteSpace: 'pre-wrap' }}>
        {compartilhada
          ? 'O Registro fica no VIGIA-7S da área de trabalho enquanto está em teste. Os dados são os mesmos dos dois: ' +
            'calibração, perfis EMC, ensaios e registros. Um ensaio feito aqui aparece lá para importar, e o que mudar ' +
            "lá vale aqui.\n\nPara registrar: abra o VIGIA-7S → aba Registro (FOR EMC38) → '⬇ Importar leituras do ensaio da câmera…' → " +
            "'Outro ensaio salvo…'."
          : 'O VIGIA-7S não foi encontrado na área de trabalho: os dados deste VIGIA estão numa pasta própria do app ' +
            'e não são compartilhados.'}
      </div>
      <div className="vg-info" style={{ color: COR_NEUTRO }}>Pasta dos dados: {pasta}</div>

      <LabelFrame text="Registro aberto no VIGIA-7S">
        <div style={{ padding: '4px 8px 8px', display: 'grid', gridTemplateColumns: 'max-content auto', gap: '4px 12px' }}>
          {r ? (
            <>
              <span>Arquivo:</span><span style={{ overflowWrap: 'anywhere' }}>{r.arquivo}</span>
              <span>Preço unitário:</span><span>{preco === null ? '—' : fixo(preco, 3).replace('.', ',')}</span>
              <span>Preset (verificação INICIAL):</span><span>{preset === null ? '—' : String(preset).replace('.', ',')}</span>
            </>
          ) : (
            <span style={{ gridColumn: 'span 2', color: COR_NEUTRO }}>Nenhum registro aberto no VIGIA-7S.</span>
          )}
        </div>
        <div className="vg-info" style={{ padding: '0 8px 8px', color: COR_NEUTRO }}>
          O preço e o preset entram nas leituras do ensaio (total calculado e erro do volume), como no VIGIA-7S.
        </div>
      </LabelFrame>

      <div style={{ display: 'flex', gap: 6 }}>
        <Botao onClick={() => void app.carregar_registro()}>Atualizar</Botao>
        <Botao onClick={() => void abrir('registros')}>Abrir pasta dos registros</Botao>
        <Botao onClick={() => void abrir('')}>Abrir pasta resultados</Botao>
      </div>
    </div>
  )
}
