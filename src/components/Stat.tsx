import type { ReactNode } from 'react'

type Tone = 'default' | 'positive' | 'negative' | 'warning'

export default function Stat({
  label,
  value,
  delta,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  delta?: ReactNode
  hint?: ReactNode
  tone?: Tone
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value tone-${tone}`}>{value}</div>
      {delta !== undefined && <div className="stat-delta num">{delta}</div>}
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}
