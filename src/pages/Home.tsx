import { Link } from 'react-router-dom'
import Badge from '../components/Badge'
import Card from '../components/Card'
import Disclaimer from '../components/Disclaimer'
import PageHeader from '../components/PageHeader'
import Stat from '../components/Stat'
import { SkeletonCards } from '../components/Skeleton'
import { getLedgerSummary } from '../engine/ledger'
import { MIN_PROBABILITY, useSlate } from '../lib/slate'
import dailyPicks from '../generated/picks.json'
import trackingReport from '../../data/report.json'
import { dailyStatus } from '../lib/dailyStatus'
import { percent, probability, signedPercent, oneInN } from '../lib/format'

export default function Home() {
  const slate = useSlate()
  const ledger = getLedgerSummary()
  const qualifying = slate.legs.filter((leg) => leg.modelProbability >= MIN_PROBABILITY).length
  const best = slate.tickets.reduce<(typeof slate.tickets)[number] | null>(
    (top, t) => (t.legs.length > 0 && (!top || t.combinedProbability > top.combinedProbability) ? t : top),
    null,
  )
  const loading = slate.status === 'loading'
  const daily = dailyStatus(dailyPicks, trackingReport)
  const sourceLabel = slate.source === 'live' ? 'Live odds' : 'Demo data'

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Today's slate, priced against the market."
        actions={!loading && <Badge kind={slate.source === 'live' ? 'live' : 'demo'} />}
      />

      <section className="hero" aria-labelledby="hero-title">
        <h2 id="hero-title">Price every leg. Report the real odds.</h2>
        <p>
          Hybrid Value turns market odds into no-vig probabilities, filters legs by a probability floor,
          and assembles tickets with honest combined odds, never inflated hit rates.
        </p>
        <div className="row">
          <Link to="/tickets" className="btn btn-primary">View today's tickets</Link>
          <Link to="/simulator" className="btn">Run simulator</Link>
        </div>
      </section>

      {loading ? (
        <SkeletonCards count={3} height={110} />
      ) : (
        <div className="grid-stats">
          <Stat
            label="Qualifying legs today"
            value={qualifying}
            hint={`Legs at or above ${percent(MIN_PROBABILITY, 0)} model probability (${sourceLabel})`}
          />
          <Stat
            label="Best ticket combined probability"
            value={best ? probability(best.combinedProbability) : '—'}
            hint={best ? `${best.name}, ${oneInN(best.combinedProbability)}` : 'No tickets could be built'}
          />
          <Stat
            label="Ledger ROI"
            value={ledger.totalTickets > 0 ? signedPercent(ledger.roi) : 'No results logged yet'}
            tone={ledger.totalTickets > 0 ? (ledger.roi >= 0 ? 'positive' : 'negative') : 'default'}
            hint={ledger.totalTickets > 0 ? `${ledger.totalTickets} logged tickets` : 'Log results on the Tickets page'}
          />
          <Stat
            label="Ledger hit rate"
            value={ledger.totalTickets > 0 ? percent(ledger.hitRate) : '—'}
            hint={ledger.totalTickets > 0 ? `${ledger.hits} hits, ${ledger.losses} misses` : 'No results logged yet'}
          />
        </div>
      )}

      <h2 className="section-title">How the model works</h2>
      <div className="grid-2 even">
        <Card title="Method">
          <ol className="how-list">
            <li><strong>No-vig baseline.</strong> Each outcome's implied probability is normalised across its market to remove the bookmaker's margin.</li>
            <li><strong>Probability floor.</strong> Legs below {percent(MIN_PROBABILITY, 0)} model probability are never included in a ticket.</li>
            <li><strong>Correlation caps.</strong> Limits per game and per team, and contradictory legs are rejected.</li>
            <li><strong>Two ticket tiers.</strong> Winnable tickets are short and aim for a meaningful hit chance; lottery tickets are long shots.</li>
          </ol>
          <p className="muted" style={{ marginTop: 'var(--sp-3)', fontSize: 12 }}>
            The default probability model uses the no-vig market price, so edges are zero unless you plug in your own model.
          </p>
        </Card>

        <Card title="Daily 25-leg slate">
          <dl className="kv">
            <dt>Status</dt>
            <dd>{daily.state === 'live' ? 'Live' : daily.state === 'stale' ? 'Stale' : 'Sample (no generated picks yet)'}</dd>
            <dt>Legs</dt>
            <dd className="num">{daily.legs}</dd>
            <dt>Generated</dt>
            <dd>{daily.generatedAt ?? '—'}</dd>
            <dt>Graded / pending</dt>
            <dd className="num">{daily.graded} / {daily.pending}</dd>
          </dl>
          {daily.state === 'stale' && (
            <p className="tone-warning" style={{ marginTop: 'var(--sp-3)' }}>The last daily run is more than 36 hours old; check the daily-picks workflow.</p>
          )}
          <p className="muted" style={{ marginTop: 'var(--sp-3)', fontSize: 12 }}>
            Outputs are not guaranteed. Parlays are high variance; 25-leg tickets almost never hit.
          </p>
        </Card>
        <Card title="Data source">
          <dl className="kv">
            <dt>Status</dt>
            <dd>{loading ? 'Loading…' : <Badge kind={slate.source === 'live' ? 'live' : 'demo'} />}</dd>
            <dt>Odds API key</dt>
            <dd>{slate.keyConfigured ? 'Configured' : 'Not configured'}</dd>
            <dt>Legs loaded</dt>
            <dd className="num">{loading ? '—' : slate.legs.length}</dd>
            <dt>Tickets built</dt>
            <dd className="num">{loading ? '—' : slate.tickets.length}</dd>
          </dl>
          {slate.status === 'error' && <p className="tone-negative" style={{ marginTop: 'var(--sp-3)' }}>Failed to load odds: {slate.error}</p>}
          {slate.liveUnavailable && (
            <p className="tone-warning" style={{ marginTop: 'var(--sp-3)' }}>
              An API key is set, but no live odds were returned. Showing sample picks.
            </p>
          )}
          {!slate.keyConfigured && (
            <p className="muted" style={{ marginTop: 'var(--sp-3)', fontSize: 12 }}>
              Showing the repository's sample picks. Set VITE_ODDS_API_KEY at build time to load live odds.
            </p>
          )}
        </Card>
      </div>
      <Disclaimer />
    </>
  )
}
