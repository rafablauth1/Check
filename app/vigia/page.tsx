'use client'
// VIGIA-7S — verificação de displays de 7 segmentos em tempo real (porte de vigia7s/app.py).
import { useEffect, useState } from 'react'
import './vigia.css'
import { App } from '@/lib/vigia/app'
import { useVar, messagebox } from '@/lib/vigia/tk'
import { Notebook, Dialogos } from './widgets'
import AbaCalibracao from './AbaCalibracao'

const ABAS = [
  '  Ensaio  ',
  '  Câmera / Calibração do display  ',
  '  Tempo, validação e alarme  ',
  '  Perfil EMC (frequências / etapas)  ',
  '  Registro (FOR EMC38)  ',
]

export default function VigiaPage() {
  const [app] = useState(() => new App())
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') (window as unknown as { __vigia: App }).__vigia = app
  const carregado = useVar(app.carregado)
  const versaoCv = useVar(app.cvPronto)
  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await fetch('/api/vigia', { cache: 'no-store' }).then(x => x.json()).catch(() => null)
      // 1ª vez no app: oferece trazer a calibração e os perfis do VIGIA-7S (o original só é lido)
      if (vivo && r && !r.config && r.origem?.existe
        && await messagebox.askyesno('VIGIA-7S', `Encontrei o VIGIA-7S em:\n${r.origem.pasta}\n\nTrazer a calibração da câmera, os campos e os perfis EMC de lá?\n(o VIGIA-7S original não é alterado)`)) {
        await app.importar_vigia()
      }
      if (vivo) await app.iniciar()
    })()
    const sair = () => app.fechar()
    window.addEventListener('beforeunload', sair)
    return () => { vivo = false; window.removeEventListener('beforeunload', sair); app.fechar() }
  }, [app])

  return (
    <div className="vg" style={{ margin: -24, height: 'calc(100% + 48px)', display: 'flex', flexDirection: 'column', padding: 6 }}>
      {!carregado ? (
        <div style={{ padding: 20 }}>Carregando…</div>
      ) : (
        <Notebook abas={ABAS} v={app.nb} style={{ flex: 1, minHeight: 0 }}>
          <EmBreve texto="Ensaio" />
          <AbaCalibracao app={app} />
          <EmBreve texto="Tempo, validação e alarme" />
          <EmBreve texto="Perfil EMC" />
          <EmBreve texto="Registro (FOR EMC38)" />
        </Notebook>
      )}
      {carregado && !versaoCv && <div style={{ position: 'absolute', bottom: 10, left: 16, color: '#5f6368' }}>Carregando OpenCV…</div>}
      <Dialogos />
    </div>
  )
}

function EmBreve({ texto }: { texto: string }) {
  return <div style={{ padding: 20, color: '#5f6368' }}>Aba “{texto}”: em porte (próxima etapa).</div>
}
