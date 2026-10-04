import { useMemo, useState, type FormEvent } from 'react'
import Badge from '../components/Badge'
import Card from '../components/Card'
import DataTable, { type Column } from '../components/DataTable'
import Disclaimer from '../components/Disclaimer'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import ProbabilityBar from '../components/ProbabilityBar'
import { SkeletonCards } from '../components/Skeleton'
import { saveTicketResult } from '../engine/ledger'
import { fetchLatestScores, recordLegOutcome, resolveLeg, settleTicket, type LegResult } from '../engine/postmortem/results'
import { saveLegSnapshots } from '../engine/postmortem/snapshot'
import { recommendStakeForTicket, tierForLeg } from '../engine/staking'
import type { Leg, Ticket } from '../engine/ticketBuilder'
import { classifyLeg, filterByEdgeOnly, isHighValue, legEdge, sideMixOf, topUnderdogValue, type Side } from '../engine/underdog'
import { americanOdds, currency, multiplier, oneInN, probability, signedCurrency, signedPercent, sportLabel } from '../lib/format'
import { correlationSummary, edgeVsNoVig, riskRating, ticketEV } from '../lib/metrics'
import { useSlate } from '../lib/slate'

type SortKey = 'probability' | 'ev' | 'payout' | 'legs'
type TierFilter = 'all' | 'winnable' | 'lottery'
type ViewMode = 'all' | 'parlays' | 'straights' | 'underdogs'

const MODES: { value: ViewMode; label: string }[] = [
  { value: 'all', label: 'All bets' },
  { value: 'parlays', label: 'Parlays only' },
  { value: 'straights', label: 'Straights only' },
  { value: 'underdogs', label: 'Underdogs only' },
]

const AMBER = '#f59e0b'
const sideMixText = (mix: { favorite: number; underdog: number; neutral: number }) =>
  `${mix.underdog} underdogs, ${mix.favorite} favorites, ${mix.neutral} neutral`

function straightTicketOf(leg: Leg): Ticket {
  return {
    id: `straight-${leg.id}`,
    name: leg.selection,
    strategy: 'highestProbability',
    tier: 'straight',
    betType: 'straight',
    sideMix: sideMixOf([leg]),
    legs: [leg],
    targetLegs: 1,
    combinedProbability: leg.modelProbability,
    payoutDecimal: 1 + (leg.americanOdds > 0 ? leg.americanOdds / 100 : 100 / Math.abs(leg.americanOdds)),
    notes: [],
  }
}

const SORTS: Record<SortKey, { label: string; value: (t: Ticket) => number }> = {
  probability: { label: 'Combined probability', value: (t) => t.combinedProbability },
  ev: { label: 'Expected value', value: ticketEV },
  payout: { label: 'Payout', value: (t) => t.payoutDecimal },
  legs: { label: 'Leg count', value: (t) => t.legs.length },
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const csvCell = (value: string | number) => {
  const text = String(value)
  const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function LogResultForm({ ticket, suggestedStake, dataSource, onDone }: { ticket: Ticket; suggestedStake: number; dataSource: 'live' | 'demo'; onDone: () => void }) {
  const [stake, setStake] = useState(String(suggestedStake > 0 ? suggestedStake : 1))
  const [payout, setPayout] = useState('')
  const [saved, setSaved] = useState(false)
  const [side, setSide] = useState<Side>(ticket.legs.length === 1 ? classifyLeg(ticket.legs[0]) : 'neutral')
  const [outcomes, setOutcomes] = useState<Record<string, LegResult>>({})
  const [autoResolved, setAutoResolved] = useState<Set<string>>(new Set())
  const [scoreStatus, setScoreStatus] = useState('')
  const [fetchingScores, setFetchingScores] = useState(false)
  const [snapshotTicketId] = useState(() => `${ticket.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const id = `${ticket.id}-${ticket.tier}`

  async function autoResolve() {
    setFetchingScores(true)
    setScoreStatus('')
    const snapshots = saveLegSnapshots(ticket, dataSource, Date.now(), snapshotTicketId)
    const result = await fetchLatestScores([...new Set(snapshots.map((snapshot) => snapshot.sport))])
    if (result.error) setScoreStatus(result.error)
    const byGame = new Map(result.scores.map((score) => [`${score.sport}:${score.gameId}`, score]))
    const next: Record<string, LegResult> = {}
    const resolved = new Set<string>()
    for (const snapshot of snapshots) {
      const score = byGame.get(`${snapshot.sport}:${snapshot.gameId}`)
      if (!score) continue
      const outcome = resolveLeg(snapshot, score)
      next[snapshot.legId.slice(`${snapshotTicketId}:`.length)] = outcome
      if (outcome !== 'unknown') resolved.add(snapshot.legId)
    }
    setOutcomes((previous) => ({ ...previous, ...next }))
    setAutoResolved(resolved)
    setScoreStatus(result.error ?? (resolved.size ? `Resolved ${resolved.size} of ${snapshots.length} legs from final scores.` : 'No matching completed game scores were found.'))
    setFetchingScores(false)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const stakeNum = Number(stake)
    if (!(stakeNum > 0)) return
    const legResults = ticket.legs.map((leg) => outcomes[leg.id] ?? 'unknown')
    if (legResults.some((outcome) => outcome === 'unknown')) return
    const snapshots = saveLegSnapshots(ticket, dataSource, Date.now(), snapshotTicketId)
    const settlement = settleTicket(snapshots, legResults, stakeNum)
    const payoutNum = payout === '' ? settlement.payout : Number(payout)
    const single = ticket.legs.length === 1 ? ticket.legs[0] : undefined
    for (const snapshot of snapshots) {
      const result = outcomes[snapshot.legId.slice(`${snapshotTicketId}:`.length)]
      if (result === 'win' || result === 'loss' || result === 'push') {
        recordLegOutcome(snapshot.legId, result, autoResolved.has(snapshot.legId) ? 'scores' : 'manual')
      }
    }
    saveTicketResult(ticket, stakeNum, settlement.result === 'win', Number.isFinite(payoutNum) ? payoutNum : 0, undefined, {
      side,
      legs: ticket.legs.map((leg) => ({
        side: single ? side : classifyLeg(leg),
        americanOdds: leg.americanOdds,
        modelProbability: leg.modelProbability,
        hit: outcomes[leg.id] === 'win',
      })),
      legsHit: settlement.legsHit,
      takenEdge: single ? legEdge(single) : undefined,
      outcome: settlement.result === 'unknown' ? undefined : settlement.result,
      snapshotTicketId,
    })
    setSaved(true)
  }

  if (saved) {
    return (
      <div className="log-form" role="status">
        <span className="ok-text">Result saved to your local ledger (this browser only).</span>
        <button type="button" className="btn btn-sm" onClick={onDone}>Close</button>
      </div>
    )
  }

  return (
    <form className="log-form" onSubmit={submit} aria-label={`Log result for ${ticket.name}`}>
      <label className="field" htmlFor={`${id}-stake`}>
        Stake ($)
        <input id={`${id}-stake`} className="input" type="number" min="0" step="0.01" value={stake} onChange={(e) => setStake(e.target.value)} required />
      </label>
      <label className="field" htmlFor={`${id}-side`}>
        Side
        <select id={`${id}-side`} className="input" value={side} onChange={(e) => setSide(e.target.value as Side)}>
          <option value="favorite">Favorite</option>
          <option value="underdog">Underdog</option>
          <option value="neutral">Neutral</option>
        </select>
      </label>
      <button type="button" className="btn btn-sm" disabled={fetchingScores} onClick={() => void autoResolve()}>
        {fetchingScores ? 'Checking scores…' : 'Auto-resolve from scores'}
      </button>
      {scoreStatus && <div role="status" className="leg-sub">{scoreStatus}</div>}
      <div className="stack-sm">
        {ticket.legs.map((leg) => (
          <label className="field" key={leg.id} htmlFor={`${id}-outcome-${leg.id}`}>
            {leg.selection} outcome
            <select
              id={`${id}-outcome-${leg.id}`}
              className="input"
              value={outcomes[leg.id] ?? 'unknown'}
              onChange={(event) => {
                setOutcomes((current) => ({ ...current, [leg.id]: event.target.value as LegResult }))
                setAutoResolved((current) => {
                  const next = new Set(current)
                  next.delete(`${snapshotTicketId}:${leg.id}`)
                  return next
                })
              }}
            >
              <option value="unknown">Unknown — choose result</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="push">Push</option>
            </select>
          </label>
        ))}
      </div>
      {!ticket.legs.some((leg) => outcomes[leg.id] === 'loss' || outcomes[leg.id] === 'unknown') && (
        <label className="field" htmlFor={`${id}-payout`}>
          Total return ($, blank = push-adjusted odds)
          <input id={`${id}-payout`} className="input" type="number" min="0" step="0.01" value={payout} onChange={(e) => setPayout(e.target.value)} />
        </label>
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary btn-sm" disabled={ticket.legs.some((leg) => !outcomes[leg.id] || outcomes[leg.id] === 'unknown')}>Save result</button>
        <button type="button" className="btn btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

const legColumns: Column<Leg>[] = [
  {
    key: 'sel',
    header: 'Selection',
    render: (l) => (
      <>
        <div className="leg-title">{l.selection}</div>
        <div className="leg-sub">{l.teams.join(' vs ')} · {l.market}</div>
      </>
    ),
  },
  { key: 'odds', header: 'Odds', align: 'right', mono: true, render: (l) => americanOdds(l.americanOdds) },
  { key: 'p', header: 'Model prob', align: 'right', render: (l) => probability(l.modelProbability) },
]

function TicketCard({ ticket, bankroll, dataSource }: { ticket: Ticket; bankroll: number; dataSource: 'live' | 'demo' }) {
  const [open, setOpen] = useState(false)
  const [logging, setLogging] = useState(false)
  const stake = recommendStakeForTicket(ticket, bankroll)
  const ev = ticketEV(ticket)
  const risk = riskRating(ticket.combinedProbability)
  const legsId = `${ticket.id}-${ticket.tier}-legs`

  return (
    <article className="card hoverable">
      <div className="card-body">
        <div className="ticket-top">
          <div>
            <h3 className="ticket-name">{ticket.name}</h3>
            <div className="ticket-meta">
              <Badge kind={ticket.tier} />
              <span>{ticket.legs.length} leg{ticket.legs.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
        <div className="ticket-prob">{probability(ticket.combinedProbability)}</div>
        <div className="ticket-sub">combined probability · {oneInN(ticket.combinedProbability)}</div>

        <div className="leg-sub">Side mix: {sideMixText(ticket.sideMix)}</div>

        <div className="metrics">
          <div><div className="metric-label">Combined odds</div><div className="metric-value">{multiplier(ticket.payoutDecimal)}</div></div>
          <div><div className="metric-label">EV per $1</div><div className={`metric-value ${ev >= 0 ? 'tone-positive' : 'tone-negative'}`}>{signedCurrency(ev)}</div></div>
          <div><div className="metric-label">$1 pays</div><div className="metric-value">{currency(ticket.payoutDecimal)}</div></div>
          <div><div className="metric-label">$10 pays</div><div className="metric-value">{currency(ticket.payoutDecimal * 10)}</div></div>
          <div><div className="metric-label">Risk</div><div className={`metric-value ${risk === 'Low' ? 'tone-positive' : risk === 'Medium' ? '' : 'tone-warning'}`}>{risk}</div></div>
          <div><div className="metric-label">Correlation</div><div className="leg-sub">{correlationSummary(ticket.legs)}</div></div>
        </div>

        <div className="stake-box">
          <strong>Recommended stake: {currency(stake.dollarStake)}</strong> ({stake.units.toFixed(2)} units)
          <div>{stake.rationale}</div>
          {stake.warning && <div className="tone-warning">{stake.warning}</div>}
        </div>

        {ticket.notes.length > 0 && (
          <ul className="leg-sub" style={{ margin: 'var(--sp-3) 0 0', paddingLeft: 16 }}>
            {ticket.notes.map((note, i) => <li key={i}>{note}</li>)}
          </ul>
        )}

        <div className="expander">
          <button type="button" className="btn btn-sm expander-btn" aria-expanded={open} aria-controls={legsId} onClick={() => setOpen((v) => !v)}>
            <span>{open ? 'Hide' : 'Show'} {ticket.legs.length} legs</span>
            <span aria-hidden="true">{open ? '−' : '+'}</span>
          </button>
          {open && (
            <div id={legsId} style={{ marginTop: 'var(--sp-2)' }}>
              <DataTable columns={legColumns} rows={ticket.legs} rowKey={(l) => l.id} caption={`Legs of ${ticket.name}`} />
            </div>
          )}
        </div>

        {logging ? (
          <LogResultForm ticket={ticket} suggestedStake={stake.dollarStake} dataSource={dataSource} onDone={() => setLogging(false)} />
        ) : (
          <button type="button" className="btn btn-sm" style={{ marginTop: 'var(--sp-3)' }} onClick={() => setLogging(true)} disabled={ticket.legs.length === 0}>
            Log result
          </button>
        )}
      </div>
    </article>
  )
}

export default function TicketsPage() {
  const slate = useSlate()
  const [bankroll, setBankroll] = useState(1000)
  const [sport, setSport] = useState('all')
  const [tier, setTier] = useState<TierFilter>('all')
  const [sort, setSort] = useState<SortKey>('probability')
  const [mode, setMode] = useState<ViewMode>('all')
  const [loggingLeg, setLoggingLeg] = useState<Leg | null>(null)

  const sports = useMemo(() => [...new Set(slate.legs.map((l) => l.sport))].sort(), [slate.legs])

  const visibleTickets = useMemo(
    () =>
      slate.tickets
        .filter((t) => t.legs.length > 0 && (sport === 'all' || t.legs.some((l) => l.sport === sport)) && (tier === 'all' || t.tier === tier))
        .sort((a, b) => SORTS[sort].value(b) - SORTS[sort].value(a)),
    [slate.tickets, sport, tier, sort],
  )
  const visibleStraight = slate.straightPlays.filter((l) => sport === 'all' || l.sport === sport)
  const showParlays = mode === 'all' || mode === 'parlays'
  const showStraights = mode === 'all' || mode === 'straights'
  const showUnderdogSection = mode !== 'parlays'
  const edgeLegs = useMemo(() => filterByEdgeOnly(slate.legs).filter((l) => sport === 'all' || l.sport === sport), [slate.legs, sport])
  const underdogRows = useMemo(
    () => (mode === 'straights' ? [...edgeLegs].sort((a, b) => legEdge(b) - legEdge(a)).slice(0, 10) : topUnderdogValue(edgeLegs, 10)),
    [edgeLegs, mode],
  )
  const groups: Array<{ tier: 'winnable' | 'lottery'; title: string; items: Ticket[] }> = [
    { tier: 'winnable', title: 'Winnable tickets', items: visibleTickets.filter((t) => t.tier === 'winnable') },
    { tier: 'lottery', title: 'Lottery tickets', items: visibleTickets.filter((t) => t.tier === 'lottery') },
  ]

  function exportCSV() {
    const headers = ['ticket', 'tier', 'sport', 'selection', 'odds', 'probability'] as const
    const rows = visibleTickets.flatMap((t) =>
      t.legs.map((l) => ({ ticket: t.name, tier: t.tier, sport: l.sport, selection: l.selection, odds: l.americanOdds, probability: l.modelProbability })),
    )
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\n')
    download('tickets.csv', csv, 'text/csv;charset=utf-8')
  }

  function exportJSON() {
    download(
      'tickets.json',
      JSON.stringify({ dataSource: slate.source, tickets: visibleTickets, straightPlays: visibleStraight, exportedAt: new Date().toISOString() }, null, 2),
      'application/json',
    )
  }

  const straightColumns: Column<Leg>[] = [
    {
      key: 'sel',
      header: 'Selection',
      render: (l) => (
        <>
          <div className="leg-title">{l.selection}</div>
          <div className="leg-sub">{l.teams.join(' vs ')} · {sportLabel(l.sport)}</div>
        </>
      ),
    },
    { key: 'market', header: 'Market', render: (l) => l.market },
    { key: 'odds', header: 'Odds', align: 'right', mono: true, render: (l) => americanOdds(l.americanOdds) },
    { key: 'p', header: 'Model prob', render: (l) => <ProbabilityBar value={l.modelProbability} label={`Model probability for ${l.selection}`} /> },
    {
      key: 'edge',
      header: 'Edge vs no-vig',
      align: 'right',
      render: (l) => {
        const edge = edgeVsNoVig(l, slate.legs)
        return edge === null ? '—' : <span className={edge > 0 ? 'tone-positive' : edge < 0 ? 'tone-negative' : ''}>{signedPercent(edge)}</span>
      },
    },
    { key: 'tier', header: 'Tier', render: (l) => <Badge kind={tierForLeg(l)} /> },
    {
      key: 'units',
      header: 'Units',
      align: 'right',
      render: (l) =>
        recommendStakeForTicket({ tier: 'straight', legs: [l], combinedProbability: l.modelProbability }, bankroll).units.toFixed(2),
    },
  ]

  const underdogColumns: Column<Leg>[] = [
    {
      key: 'sel',
      header: 'Selection',
      render: (l) => (
        <>
          <div className="leg-title">{l.selection}</div>
          <div className="leg-sub">{l.teams.join(' vs ')} · {sportLabel(l.sport)}</div>
        </>
      ),
    },
    { key: 'odds', header: 'Odds', align: 'right', mono: true, render: (l) => americanOdds(l.americanOdds) },
    { key: 'p', header: 'Model prob', align: 'right', render: (l) => probability(l.modelProbability) },
    {
      key: 'edge',
      header: 'Edge',
      align: 'right',
      render: (l) => (
        <>
          <strong>{signedPercent(legEdge(l), 2)}</strong>
          {isHighValue(l) && <> <Badge kind="high-value" >High value</Badge></>}
        </>
      ),
    },
    { key: 'tier', header: 'Tier', render: (l) => <Badge kind={tierForLeg(l)} /> },
    {
      key: 'units',
      header: 'Units',
      align: 'right',
      render: (l) => recommendStakeForTicket({ tier: 'straight', legs: [l], combinedProbability: l.modelProbability }, bankroll).units.toFixed(2),
    },
    {
      key: 'type',
      header: 'Type',
      render: (l) => {
        const side = classifyLeg(l)
        return <strong style={{ color: side === 'underdog' ? AMBER : undefined }}>{side === 'underdog' ? 'UNDERDOG' : side === 'favorite' ? 'FAVORITE' : 'NEUTRAL'}</strong>
      },
    },
    { key: 'log', header: '', render: (l) => <button type="button" className="btn btn-sm" onClick={() => setLoggingLeg(l)}>Log result</button> },
  ]

  return (
    <>
      <PageHeader
        title="Tickets"
        subtitle="Straight plays and multi-leg tickets built from today's slate."
        actions={
          <>
            {slate.status === 'ready' && slate.source === 'demo' && <Badge kind="demo" />}
            <button type="button" className="btn" onClick={exportCSV} disabled={visibleTickets.length === 0}>Export CSV</button>
            <button type="button" className="btn" onClick={exportJSON} disabled={visibleTickets.length === 0}>Export JSON</button>
          </>
        }
      />
      {slate.learningEnabled && <p className="notice" role="status">Evidence-supported probability adjustments are enabled; displayed ticket probabilities reflect the current learned factors.</p>}
      <Disclaimer compact />

      {slate.status === 'loading' && <SkeletonCards count={4} />}

      {slate.status === 'error' && (
        <EmptyState
          tone="error"
          title="Couldn't load odds"
          description={slate.error ?? 'Something went wrong while loading the slate.'}
          action={<button type="button" className="btn" onClick={slate.reload}>Try again</button>}
        />
      )}

      {slate.status === 'ready' && (
        <>
          {slate.liveUnavailable && (
            <div className="notice" role="alert">
              An odds API key is configured but no live odds came back (request failed or no games). Showing sample picks instead.
            </div>
          )}

          <div className="toolbar">
            <label className="field" htmlFor="bankroll">
              Bankroll ($)
              <input id="bankroll" className="input" type="number" min="0" value={bankroll} onChange={(e) => setBankroll(Math.max(0, Number(e.target.value)))} />
            </label>
            <label className="field" htmlFor="sort">
              Sort by
              <select id="sort" className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(SORTS) as SortKey[]).map((key) => <option key={key} value={key}>{SORTS[key].label}</option>)}
              </select>
            </label>
            <div className="toolbar-group" role="group" aria-label="Filter by sport">
              Sport
              <div className="chips">
                {['all', ...sports].map((s) => (
                  <button key={s} type="button" className="chip" aria-pressed={sport === s} onClick={() => setSport(s)}>
                    {s === 'all' ? 'All' : sportLabel(s)}
                  </button>
                ))}
              </div>
            </div>
            <div className="toolbar-group" role="group" aria-label="Filter by tier">
              Tier
              <div className="chips">
                {(['all', 'winnable', 'lottery'] as TierFilter[]).map((t) => (
                  <button key={t} type="button" className="chip" aria-pressed={tier === t} onClick={() => setTier(t)}>
                    {t === 'all' ? 'All' : t === 'winnable' ? 'Winnable' : 'Lottery'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="toolbar-group" role="radiogroup" aria-label="Bet mode">
            Mode
            <div className="chips">
              {MODES.map((m) => (
                <label key={m.value} className="chip" style={{ cursor: 'pointer' }}>
                  <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} /> {m.label}
                </label>
              ))}
            </div>
          </div>

          {showUnderdogSection && (
            <section aria-labelledby="underdog-h">
              <h2 className="section-title" id="underdog-h" style={{ color: AMBER }}>Underdog value</h2>
              <p className="leg-sub">
                Straights are chosen by edge (model probability minus implied probability), not win rate. No probability floor applies.
              </p>
              {underdogRows.length === 0 ? (
                <EmptyState title="No value found" description="No leg has a positive edge at the offered price." />
              ) : (
                <Card padded={false}>
                  <DataTable columns={underdogColumns} rows={underdogRows} rowKey={(l) => l.id} caption="Underdog value" />
                </Card>
              )}
              {loggingLeg && (
                <LogResultForm
                  key={loggingLeg.id}
                  ticket={straightTicketOf(loggingLeg)}
                  suggestedStake={recommendStakeForTicket({ tier: 'straight', legs: [loggingLeg], combinedProbability: loggingLeg.modelProbability }, bankroll).dollarStake}
                  dataSource={slate.source}
                  onDone={() => setLoggingLeg(null)}
                />
              )}
            </section>
          )}

          {showStraights && (
            <>
              <h2 className="section-title">Straight plays</h2>
              {visibleStraight.length === 0 ? (
                <EmptyState title="No straight plays" description="No legs clear the probability floor for this filter." />
              ) : (
                <Card padded={false}>
                  <DataTable columns={straightColumns} rows={visibleStraight} rowKey={(l) => l.id} caption="Straight plays" />
                </Card>
              )}
            </>
          )}

          {showParlays && groups.map((group) => (
            <section key={group.tier} aria-labelledby={`${group.tier}-h`}>
              <h2 className="section-title" id={`${group.tier}-h`}>{group.title}</h2>
              {group.items.length === 0 ? (
                <EmptyState title={`No ${group.tier} tickets`} description="Nothing matches the current filters." />
              ) : (
                <div className="grid-cards">
                  {group.items.map((t) => <TicketCard key={t.id + t.tier} ticket={t} bankroll={bankroll} dataSource={slate.source} />)}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </>
  )
}
