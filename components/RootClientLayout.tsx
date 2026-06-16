'use client'

import { usePathname } from 'next/navigation'
import LabSidebar from '@/components/LabSidebar'
import { TitleBar } from '@/app/TitleBar'

/* ── Mapa de rotas → título da página ─────────────────────────── */
function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard')            return 'Dashboard'
  if (pathname === '/equipamentos/grupos')  return 'Grupos'
  if (pathname === '/equipamentos/novo')    return 'Novo Equipamento'
  if (pathname === '/checagens/nova')       return 'Nova Checagem'
  if (pathname === '/checagens/templates')  return 'Templates'
  if (pathname === '/normas')               return 'Normas'
  if (pathname === '/equipamentos')         return 'Equipamentos'
  if (pathname === '/checagens')            return 'Checagens'
  if (pathname === '/cispr15')              return 'Relatórios CISPR 15'
  if (pathname === '/agenda')               return 'Agenda'
  if (pathname === '/configuracoes')        return 'Configurações'
  if (pathname === '/grandezas')            return 'Grandezas'
  if (/^\/equipamentos\/[^/]+$/.test(pathname)) return 'Detalhe do Equipamento'
  if (/^\/normas\/[^/]+$/.test(pathname))       return 'Detalhe da Norma'
  if (/^\/checagens\/[^/]+$/.test(pathname))    return 'Detalhe da Checagem'
  const seg = pathname.split('/').filter(Boolean).pop()
  return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : 'LABELO'
}

/* ── Topbar interno ───────────────────────────────────────────── */
function InnerTopbar() {
  const pathname = usePathname()
  const title = getPageTitle(pathname ?? '')

  return (
    <div
      className="no-print"
      style={{
        height: 44,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 24,
        paddingRight: 24,
        background: 'rgba(0,0,0,0.25)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'rgba(var(--accent-rgb,232,185,75),0.45)',
        }}
      >
        LABELO
      </span>
      <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 10 }}>/</span>
      <span
        style={{
          fontFamily: 'var(--font-syne, system-ui)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: 'rgba(255,255,255,0.65)',
        }}
      >
        {title}
      </span>
    </div>
  )
}

/* ── Layout raiz ──────────────────────────────────────────────── */
export function RootClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <LabSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <InnerTopbar />
          <main className="flex-1 min-h-0 overflow-auto dot-grid p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
