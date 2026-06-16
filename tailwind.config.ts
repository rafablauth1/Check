import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy:    { DEFAULT: '#0B0E14', 2: '#111620', 3: '#1A2338', deep: '#060911' },
        gold:    { DEFAULT: '#E8B94B', 2: '#F5D27A', dim: '#C49A2E', light: 'rgba(232,185,75,0.10)' },
        teal:    { DEFAULT: '#22D3C8', dim: '#16A8A0', light: 'rgba(34,211,200,0.08)' },
        accent:  { DEFAULT: '#4F8EF7', light: 'rgba(79,142,247,0.10)' },
        success: { DEFAULT: '#22C55E', light: 'rgba(34,197,94,0.10)' },
        warning: { DEFAULT: '#F59E0B', light: 'rgba(245,158,11,0.10)' },
        danger:  { DEFAULT: '#F87171', light: 'rgba(248,113,113,0.10)' },
      },
      fontFamily: {
        display: ['var(--font-syne)', 'sans-serif'],
        body:    ['var(--font-figtree)', 'sans-serif'],
        mono:    ['var(--font-dm-mono)', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        btn:  '7px',
        pill: '999px',
      },
      boxShadow: {
        card:         '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        modal:        '0 32px 80px rgba(0,0,0,0.8)',
        glow:         '0 0 0 1px rgba(232,185,75,0.4), 0 4px 24px rgba(232,185,75,0.15)',
        'glow-teal':  '0 0 0 1px rgba(34,211,200,0.3), 0 4px 20px rgba(34,211,200,0.1)',
        'inner-sm':   'inset 0 1px 2px rgba(0,0,0,0.3)',
      },
      animation: {
        'fade-in':   'fadeIn 0.18s ease',
        'slide-up':  'slideUp 0.2s ease',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'scan':      'scan 10s linear infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideUp:  { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.4', transform: 'scale(0.8)' } },
        scan:     { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100vh)' } },
      },
      transitionDuration: { '250': '250ms' },
    },
  },
  plugins: [],
}

export default config
