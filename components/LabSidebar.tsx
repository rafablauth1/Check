'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, FileText, Cpu, BookOpen, Calendar,
  ClipboardCheck, Network, Ruler, Settings, Award, FlaskConical, Layers, Target, Tags,
} from 'lucide-react'
import { LOTE_KEY } from '@/app/cispr15/types'

interface NavItem { href: string; icon: React.ElementType; label: string }
interface NavGroup { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: 'GERAL',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/agenda',    icon: Calendar,         label: 'Agenda' },
    ],
  },
  {
    label: 'FORMULÁRIOS',
    items: [
      { href: '/cispr15', icon: FileText, label: 'Relatórios CISPR 15' },
    ],
  },
  {
    label: 'QUALIDADE',
    items: [
      { href: '/checagens',           icon: ClipboardCheck, label: 'Checagens' },
      { href: '/equipamentos',        icon: Cpu,            label: 'Equipamentos' },
      { href: '/normas',              icon: BookOpen,       label: 'Normas' },
      { href: '/procedimentos',       icon: FlaskConical,   label: 'Procedimentos' },
      { href: '/certificados',        icon: Award,          label: 'Certificados' },
      { href: '/planos-calibracao',   icon: Target,         label: 'Planos de Calibração' },
      { href: '/equipamentos/grupos', icon: Network,        label: 'Grupos' },
      { href: '/taxonomia',           icon: Tags,           label: 'Áreas & Siglas' },
      { href: '/grandezas',           icon: Ruler,          label: 'Grandezas' },
    ],
  },
]

function NavLink({ href, icon: Icon, label, active }: NavItem & { active: boolean }) {
  return (
    <Link href={href} className={cn('nav-item w-full', active && 'active')}>
      <Icon size={14} className="nav-icon flex-shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

interface Props { checagensVencidas?: number }

export default function LabSidebar({ checagensVencidas = 0 }: Props) {
  const pathname = usePathname()

  // Lote em andamento: nº de amostras ainda não emitidas no LOTE_KEY.
  // Reavalia a cada navegação (pathname) — assim some/aparece ao entrar/sair.
  const [loteAtivo, setLoteAtivo] = useState(0)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOTE_KEY)
      if (!raw) { setLoteAtivo(0); return }
      const lote = JSON.parse(raw)
      const pend = Array.isArray(lote?.amostras) ? lote.amostras.filter((a: any) => !a?.numRelatorio).length : 0
      setLoteAtivo(pend)
    } catch { setLoteAtivo(0) }
  }, [pathname])

  // Href ativo = o match mais específico (mais longo) para a rota atual,
  // evitando destacar /equipamentos junto de /equipamentos/grupos.
  const activeHref = NAV
    .flatMap(g => g.items.map(i => i.href))
    .filter(h => pathname === h || pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]

  // Inicializa do data-sidebar attribute (já setado pelo script do <head>)
  // Fallback para localStorage se o atributo não estiver disponível
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    // Lê do atributo setado pelo script do <head> (antes da hidratação)
    const attr = document.documentElement.getAttribute('data-sidebar')
    if (attr) return attr === 'collapsed'
    try { return JSON.parse(localStorage.getItem('lab_sidebar_collapsed') ?? 'false') } catch { return false }
  })

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('lab_sidebar_collapsed', JSON.stringify(next))
    // Atualiza o atributo no <html> para manter consistência com o CSS
    document.documentElement.setAttribute('data-sidebar', next ? 'collapsed' : 'expanded')
  }

  return (
    /* lab-sidebar: largura controlada via CSS + data-sidebar no <html> — sem flash de hidratação */
    <aside
      className="lab-sidebar flex flex-col h-full border-r border-white/5 flex-shrink-0 overflow-hidden transition-[width] duration-200"
      style={{ background: '#070A10' }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/5 min-h-[57px]">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg, var(--accent-2,#F5D27A), var(--accent-dim,#C49A2E))' }}>
              <div className="w-2 h-2 rounded-sm" style={{ background: 'rgba(6,9,17,0.9)' }} />
            </div>
            <span className="font-display font-bold text-[13px] tracking-wide text-white">
              LAB<span style={{ color: 'var(--accent,#E8B94B)' }}>EMC</span>
            </span>
          </div>
        )}
        <button onClick={toggle}
          className="w-6 h-6 flex items-center justify-center text-white/25 hover:text-white hover:bg-white/6 rounded-lg transition-all flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            {collapsed
              ? <path d="M2 3h8M2 6h8M2 9h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              : <path d="M2 3h8M2 6h5M2 9h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>}
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {/* Lote em andamento — atalho para retomar de onde parou */}
        {loteAtivo > 0 && (
          <div className="relative group/nav">
            <Link href="/cispr15/lote"
              className={cn(
                'nav-item w-full border border-gold/25 bg-gold/8 text-gold hover:bg-gold/15',
                collapsed ? 'justify-center px-0 py-2.5' : '',
                pathname === '/cispr15/lote' && 'active',
              )}>
              <Layers size={14} className="nav-icon flex-shrink-0" />
              {!collapsed && <span className="truncate">Lote em andamento</span>}
              {!collapsed && (
                <span className="ml-auto badge text-[9px] px-1.5 py-0.5 rounded-md bg-gold/20 text-gold border border-gold/30">
                  {loteAtivo}
                </span>
              )}
              {collapsed && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-gold" />}
            </Link>
            {collapsed && (
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50
                              px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white whitespace-nowrap
                              opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150"
                   style={{ background: 'rgba(20,22,32,0.97)', boxShadow: '0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}>
                Lote em andamento ({loteAtivo})
              </div>
            )}
          </div>
        )}
        {NAV.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2 pb-1.5 text-[8px] font-bold tracking-[1.8px] uppercase font-mono"
                 style={{ color: 'rgba(var(--accent-rgb,232,185,75),0.45)' }}>
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => {
                const active = item.href === activeHref
                if (collapsed) {
                  return (
                    <div key={item.href} className="relative group/nav">
                      <Link href={item.href}
                        className={cn('nav-item justify-center px-0 py-2.5 w-full', active && 'active')}>
                        <item.icon size={14} className="nav-icon" />
                        {item.label === 'Checagens' && checagensVencidas > 0 && (
                          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                        )}
                      </Link>
                      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50
                                      px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white whitespace-nowrap
                                      opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150"
                           style={{ background: 'rgba(20,22,32,0.97)', boxShadow: '0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}>
                        {item.label}
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={item.href} className="relative">
                    <NavLink {...item} active={active} />
                    {item.label === 'Checagens' && checagensVencidas > 0 && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 badge-danger text-[9px] px-1.5 py-0.5">
                        {checagensVencidas}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/5 p-2">
        {collapsed ? (
          <Link href="/configuracoes"
            className={cn('nav-item justify-center px-0 py-2 w-full', pathname === '/configuracoes' && 'active')}>
            <Settings size={13} className="nav-icon" />
          </Link>
        ) : (
          <Link href="/configuracoes"
            className={cn('nav-item w-full', pathname === '/configuracoes' && 'active')}>
            <Settings size={13} className="nav-icon flex-shrink-0" />
            <span className="text-[11px]">Configurações</span>
          </Link>
        )}
      </div>
    </aside>
  )
}
