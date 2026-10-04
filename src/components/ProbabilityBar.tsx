import { percent } from '../lib/format'

export default function ProbabilityBar({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <div className="pbar" role="img" aria-label={`${label ?? 'Probability'} ${percent(clamped)}`}>
      <div className="pbar-track">
        <span className="pbar-fill" style={{ width: `${clamped * 100}%` }} />
      </div>
      <span className="pbar-text num">{percent(clamped)}</span>
    </div>
  )
}
