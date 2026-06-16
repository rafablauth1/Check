'use client'

import { useState, useEffect, useCallback } from 'react'
import { Palette, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const THEME_KEY = 'cispr15_theme_v1'

export interface ThemeSettings {
  accent:  'gold' | 'teal' | 'blue' | 'green' | 'rose'
  bg:      'navy' | 'black' | 'slate' | 'warm'
  radius:  'rounded' | 'sharp' | 'pill'
  pattern: 'dots' | 'grid' | 'lines' | 'glow' | 'none'
}

export const THEME_DEFAULTS: ThemeSettings = {
  accent: 'gold', bg: 'navy', radius: 'rounded', pattern: 'dots',
}

export function applyTheme(t: ThemeSettings) {
  const h = document.documentElement
  h.setAttribute('data-accent',  t.accent)
  h.setAttribute('data-bg',      t.bg)
  h.setAttribute('data-radius',  t.radius)
  h.setAttribute('data-pattern', t.pattern ?? 'dots')
}

function loadTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      // Migração: dotgrid boolean → pattern string (legado)
      if (!saved.pattern) {
        saved.pattern = saved.dotgrid === false ? 'none' : 'dots'
      }
      return { ...THEME_DEFAULTS, ...saved }
    }
  } catch {}
  return THEME_DEFAULTS
}

const ACCENTS = [
  { id: 'gold'  as const, label: 'Dourado', color: '#E8B94B' },
  { id: 'teal'  as const, label: 'Teal',    color: '#22D3C8' },
  { id: 'blue'  as const, label: 'Azul',    color: '#4F8EF7' },
  { id: 'green' as const, label: 'Verde',   color: '#22C55E' },
  { id: 'rose'  as const, label: 'Rosa',    color: '#FB7185' },
]

const BACKGROUNDS = [
  { id: 'navy'  as const, label: 'Navy',  color: '#0B0E14' },
  { id: 'black' as const, label: 'Black', color: '#040507' },
  { id: 'slate' as const, label: 'Slate', color: '#0E1119' },
  { id: 'warm'  as const, label: 'Warm',  color: '#100E0B' },
]

const RADII = [
  { id: 'rounded' as const, label: 'Redondo', cls: 'rounded-lg' },
  { id: 'sharp'   as const, label: 'Reto',    cls: 'rounded-sm' },
  { id: 'pill'    as const, label: 'Pill',    cls: 'rounded-full' },
]

const PATTERNS = [
  { id: 'dots'  as const, label: 'Pontos', icon: '⣤' },
  { id: 'grid'  as const, label: 'Grade',  icon: '⊞' },
  { id: 'lines' as const, label: 'Linhas', icon: '≡' },
  { id: 'glow'  as const, label: 'Brilho', icon: '◎' },
  { id: 'none'  as const, label: 'Limpo',  icon: '○' },
]

export function ThemeProvider() {
  const [open,  setOpen]  = useState(false)
  const [theme, setTheme] = useState<ThemeSettings>(THEME_DEFAULTS)

  useEffect(() => {
    const t = loadTheme()
    setTheme(t)
    applyTheme(t)
  }, [])

  const update = useCallback(<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => {
    setTheme(prev => {
      const next = { ...prev, [key]: value }
      applyTheme(next)
      localStorage.setItem(THEME_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return (
    <div className="no-print">
      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Personalizar aparência"
        className={cn(
          'fixed bottom-5 right-5 z-[9999] w-9 h-9 rounded-full border flex items-center justify-center transition-all shadow-lg',
          open
            ? 'bg-white/10 border-white/25 text-white/80'
            : 'bg-white/4 border-white/8 text-white/25 hover:text-white/55 hover:border-white/15',
        )}
      >
        <Palette size={15} />
      </button>

      {/* Painel */}
      {open && (
        <>
          {/* Overlay fecha ao clicar fora */}
          <div className="fixed inset-0 z-[9997]" onClick={() => setOpen(false)} />

          <div className={cn(
            'fixed bottom-16 right-5 z-[9998] w-64',
            'rounded-2xl border border-white/8 shadow-2xl overflow-hidden animate-fade-in',
          )}
          style={{ background: 'rgb(10 13 20 / 0.97)', backdropFilter: 'blur(20px)' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
              <p className="text-[9px] font-mono uppercase tracking-[2.5px] text-white/30">Aparência</p>
              <button type="button" onClick={() => setOpen(false)}
                className="text-white/20 hover:text-white/60 transition-colors">
                <X size={12} />
              </button>
            </div>

            <div className="p-4 space-y-5">

              {/* Cor de destaque */}
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[2px] text-white/25 mb-3">Cor de destaque</p>
                <div className="flex items-center gap-2">
                  {ACCENTS.map(a => (
                    <button key={a.id} type="button"
                      onClick={() => update('accent', a.id)}
                      title={a.label}
                      className={cn(
                        'w-6 h-6 rounded-full border-2 transition-all',
                        theme.accent === a.id
                          ? 'border-white/80 scale-115 shadow-md'
                          : 'border-white/0 hover:border-white/35 hover:scale-110',
                      )}
                      style={{ background: a.color }}
                    />
                  ))}
                </div>
                <p className="text-[9px] text-white/20 font-mono mt-1.5">
                  {ACCENTS.find(a => a.id === theme.accent)?.label}
                </p>
              </div>

              {/* Fundo */}
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[2px] text-white/25 mb-3">Fundo</p>
                <div className="flex items-end gap-2.5">
                  {BACKGROUNDS.map(b => (
                    <button key={b.id} type="button"
                      onClick={() => update('bg', b.id)}
                      title={b.label}
                      className="flex flex-col items-center gap-1.5 group">
                      <span
                        className={cn(
                          'w-8 h-8 rounded-xl border-2 transition-all block',
                          theme.bg === b.id
                            ? 'border-white/60 scale-110'
                            : 'border-white/10 group-hover:border-white/25',
                        )}
                        style={{ background: b.color }}
                      />
                      <span className="text-[8px] text-white/25 font-mono">{b.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bordas */}
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[2px] text-white/25 mb-3">Bordas</p>
                <div className="flex gap-1.5">
                  {RADII.map(r => (
                    <button key={r.id} type="button"
                      onClick={() => update('radius', r.id)}
                      className={cn(
                        'flex-1 py-1.5 text-[9px] font-mono border transition-all',
                        r.cls,
                        theme.radius === r.id
                          ? 'border-white/30 text-white/70 bg-white/6'
                          : 'border-white/8 text-white/25 hover:border-white/18 hover:text-white/45',
                      )}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Padrão de fundo */}
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[2px] text-white/25 mb-2.5">Padrão de fundo</p>
                <div className="grid grid-cols-5 gap-1">
                  {PATTERNS.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => update('pattern', p.id)}
                      title={p.label}
                      className={cn(
                        'flex flex-col items-center gap-1 py-2 rounded-lg border transition-all',
                        theme.pattern === p.id
                          ? 'border-white/30 text-white/65 bg-white/6'
                          : 'border-white/8 text-white/22 hover:border-white/18 hover:text-white/45',
                      )}>
                      <span className="text-[13px] leading-none">{p.icon}</span>
                      <span className="text-[7px] font-mono leading-none">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  )
}
