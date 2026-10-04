import { useMemo } from 'react'
import Badge from '../components/Badge'
import Card from '../components/Card'
import Disclaimer from '../components/Disclaimer'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { generateLocalParlays, type Parlay } from '../mockData'
import { currency, multiplier, oneInN, probability, signedCurrency } from '../lib/format'

function evOf(parlay: Parlay): number {
  return parlay.expectedValue ?? parlay.probability * parlay.payoutMultiplier - 1
}

export default function ParlaysPage() {
  const parlays = useMemo(() => generateLocalParlays(4, 10, 0.6, -0.01), [])

  return (
    <>
      <PageHeader
        title="Parlays"
        subtitle="Candidate parlays built from the repository's sample picks."
        actions={<Badge kind="demo">Sample data</Badge>}
      />
      {parlays.length === 0 ? (
        <EmptyState title="No candidates" description="No valid 3–6 leg parlays met the threshold." />
      ) : (
        <div className="grid-cards">
          {parlays.map((parlay, index) => {
            const ev = evOf(parlay)
            const legCount = parlay.legs.length
            return (
              <Card key={`${parlay.id}-${index}`} className="hoverable">
                <h3 className="ticket-name">Candidate #{index + 1} — {legCount} leg{legCount !== 1 ? 's' : ''}</h3>
                <div className="ticket-prob">{probability(parlay.probability)}</div>
                <div className="ticket-sub">estimated probability · {oneInN(parlay.probability)}</div>
                <div className="metrics">
                  <div><div className="metric-label">Payout multiplier</div><div className="metric-value">{multiplier(parlay.payoutMultiplier)}</div></div>
                  <div><div className="metric-label">$10 pays</div><div className="metric-value">{currency(parlay.payoutMultiplier * 10)}</div></div>
                  <div><div className="metric-label">EV per $1</div><div className={`metric-value ${ev >= 0 ? 'tone-positive' : 'tone-negative'}`}>{signedCurrency(ev)}</div></div>
                </div>
                <div className="chips">
                  {parlay.legs.map((leg, i) => (
                    <span key={`${leg.id}-${i}`} className="badge">{leg.title ?? leg.side ?? 'Pick'}</span>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <Disclaimer />
    </>
  )
}
