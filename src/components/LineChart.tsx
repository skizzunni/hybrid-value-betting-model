import { signedCurrency } from '../lib/format'

/** Dependency-free SVG line chart of cumulative values (e.g. equity curve). */
export default function LineChart({ values, label }: { values: number[]; label: string }) {
  const W = 600
  const H = 220
  const pad = { l: 56, r: 12, t: 12, b: 20 }
  if (values.length < 2) return null
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const x = (i: number) => pad.l + (i / (values.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b)
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values[values.length - 1]
  const ticks = [min, (min + max) / 2, max]
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. Final value ${signedCurrency(last)}`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="chart-tick">{signedCurrency(t)}</text>
        </g>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="chart-zero" />
      <polyline points={points} fill="none" className={last >= 0 ? 'chart-line pos' : 'chart-line neg'} />
    </svg>
  )
}
