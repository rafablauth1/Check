import type { Metadata } from 'next'
import { Syne, Figtree, DM_Mono } from 'next/font/google'
import './globals.css'
import { ErrorBoundary } from './ErrorBoundary'
import { ThemeProvider } from './ThemeProvider'
import { RootClientLayout } from '@/components/RootClientLayout'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['400', '600', '700', '800'],
})

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  weight: ['300', '400', '500', '600'],
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'CISPR 15 — LABELO/PUCRS',
  description: 'Gerador de Relatórios CISPR 15 · LABELO PUCRS',
  icons: { icon: '/favicon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${syne.variable} ${figtree.variable} ${dmMono.variable}`}>
      <head>
        {/* Aplica tema salvo imediatamente (antes da hidratação) para evitar flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = JSON.parse(localStorage.getItem('cispr15_theme_v1') || '{}');
              var h = document.documentElement;
              if (t.accent) h.setAttribute('data-accent', t.accent);
              if (t.bg)     h.setAttribute('data-bg',     t.bg);
              if (t.radius) h.setAttribute('data-radius', t.radius);
              var pat = t.pattern || (t.dotgrid === false ? 'none' : 'dots');
              h.setAttribute('data-pattern', pat);
            } catch(e){}
          })();
        `}} />
        {/* Sidebar: aplica largura imediatamente para evitar flash de hidratação */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var c = JSON.parse(localStorage.getItem('lab_sidebar_collapsed') || 'false');
              document.documentElement.setAttribute('data-sidebar', c ? 'collapsed' : 'expanded');
            } catch(e){}
          })();
        `}} />
        {/* Restaura o foco da janela Electron após confirm/alert nativos fecharem */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            function restoreFocus(){
              setTimeout(function(){
                window.focus();
                document.activeElement && document.activeElement.blur && document.activeElement.blur();
                if(window.electronAPI && window.electronAPI.focusWindow) window.electronAPI.focusWindow();
              }, 80);
            }
            var _c = window.confirm;
            window.confirm = function(m){ var r = _c.call(window,m); restoreFocus(); return r; };
            var _a = window.alert;
            window.alert = function(m){ _a.call(window,m); restoreFocus(); };
          })();
        `}} />
      </head>
      <body className="bg-navy text-white antialiased font-body">
        <ErrorBoundary>
          <RootClientLayout>{children}</RootClientLayout>
        </ErrorBoundary>
        <ThemeProvider />
      </body>
    </html>
  )
}
