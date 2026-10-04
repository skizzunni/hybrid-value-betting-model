export default function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`disclaimer ${compact ? 'compact' : ''}`.trim()} aria-label="Disclaimer">
      <strong>Not financial advice.</strong>{' '}
      Model probabilities are estimates, not guarantees. Multi-leg tickets have very low hit rates and
      a built-in house edge; treat them as entertainment and never stake more than you can afford to lose.
    </aside>
  )
}
