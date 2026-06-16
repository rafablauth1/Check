'use client'

import React from 'react'

/* ─── Gráficos SVG/flex próprios (sem dependências externas) ───────────────── */

export interface Segment { label: string; value: number; color: string }

/* Donut/rosca — proporção entre categorias */
export function DonutChart({
  segments, size = 132, thickness = 18, centerTop, centerSub,
}: {
  segments: Segment[]
  size?: number
  thickness?: number
  centerTop?: string | number
  centerSub?: string
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r  = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
          {total > 0 && segments.map((s, i) => {
            const dash = (s.value / total) * circ
            const el = (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
                strokeWidth={thickness} strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset} />
            )
            offset += dash
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-bold text-xl text-white leading-none">{centerTop ?? total}</span>
          {centerSub && <span className="text-[8px] text-white/35 font-mono uppercase tracking-wider mt-1">{centerSub}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-white/55 truncate">{s.label}</span>
            <span className="text-white/30 font-mono ml-auto pl-2">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* Barras verticais — séries temporais / categóricas */
export function BarChart({
  data, height = 150, color = '#9B8CFF',
}: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
}) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 h-full">
          <span className="text-[9px] text-white/45 font-mono leading-none">{d.value > 0 ? d.value : ''}</span>
          <div className="w-full rounded-t transition-all duration-300 hover:opacity-80"
               style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 4 : 0, background: color }} />
          <span className="text-[8px] text-white/30 truncate w-full text-center leading-none">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/* Barras horizontais — ranking de categorias */
export function HBarChart({
  data, color = '#4F8EF7',
}: {
  data: { label: string; value: number }[]
  color?: string
}) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div className="flex flex-col gap-2">
      {data.length === 0 && <p className="text-white/20 text-xs py-2">Sem dados.</p>}
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] text-white/45 w-24 truncate flex-shrink-0 text-right">{d.label}</span>
          <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">
            <div className="h-full rounded transition-all duration-300" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
          <span className="text-[10px] text-white/40 font-mono w-6 text-right flex-shrink-0">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

/* Wrapper de card para gráficos */
export function ChartCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-[14px] text-white">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}
