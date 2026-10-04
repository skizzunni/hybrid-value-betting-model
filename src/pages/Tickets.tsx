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
import { recommendStakeForTicket, tierForLeg } from '../engine/staking'
import type { Leg, Ticket } from '../engine/ticketBuilder'
import { americanOdds, currency, multiplier, oneInN, probability, signedCurrency, signedPercent, sportLabel } from '../lib/format'
import { correlationSummary, edgeVsNoVig, riskRating, ticketEV } from '../lib/metrics'
import { useSlate } from '../lib/slate'

type SortKey = 'probability' | 'ev' | 'payout' | 'legs'
type TierFilter = 'all' | 'winnable' | 'lottery'

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

function LogResultForm({ ticket, suggestedStake, onDone }: { ticket: Ticket; suggestedStake: number; onDone: () => void }) {
  const [stake, setStake] = useState(String(suggestedStake > 0 ? suggestedStake : 1))
  const [hit, setHit] = useState(false)
  const [payout, setPayout] = useState('')
  const [saved, setSaved] = useState(false)
  const id = `${ticket.id}-${ticket.tier}`

  function submit(event: FormEvent) {
    event.preventDefault()
    const stakeNum = Number(stake)
    if (!(stakeNum > 0)) return
    const payoutNum = hit ? (payout === '' ? stakeNum * ticket.payoutDecimal : Number(payout)) : 0
    saveTicketResult(ticket, stakeNum, hit, Number.isFinite(payoutNum) ? payoutNum : 0)
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
      <label className="field" htmlFor={`${id}-outcome`}>
        Outcome
        <select id={`${id}-outcome`} className="input" value={hit ? 'hit' : 'miss'} onChange={(e) => setHit(e.target.value === 'hit')}>
          <option value="miss">Miss</option>
          <option value="hit">Hit</option>
        </select>
      </label>
      {hit && (
        <label className="field" htmlFor={`${id}-payout`}>
          Total return ($, blank = stake × odds)
          <input id={`${id}-payout`} className="input" type="number" min="0" step="0.01" value={payout} onChange={(e) => setPayout(e.target.value)} />
        </label>
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary btn-sm">Save result</button>
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

function TicketCard({ ticket, bankroll }: { ticket: Ticket; bankroll: number }) {
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
          <LogResultForm ticket={ticket} suggestedStake={stake.dollarStake} onDone={() => setLogging(false)} />
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

  const sports = useMemo(() => [...new Set(slate.legs.map((l) => l.sport))].sort(), [slate.legs])

  const visibleTickets = useMemo(
    () =>
      slate.tickets
        .filter((t) => t.legs.length > 0 && (sport === 'all' || t.legs.some((l) => l.sport === sport)) && (tier === 'all' || t.tier === tier))
        .sort((a, b) => SORTS[sort].value(b) - SORTS[sort].value(a)),
    [slate.tickets, sport, tier, sort],
  )
  const visibleStraight = slate.straightPlays.filter((l) => sport === 'all' || l.sport === sport)
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

          <h2 className="section-title">Straight plays</h2>
          {visibleStraight.length === 0 ? (
            <EmptyState title="No straight plays" description="No legs clear the probability floor for this filter." />
          ) : (
            <Card padded={false}>
              <DataTable columns={straightColumns} rows={visibleStraight} rowKey={(l) => l.id} caption="Straight plays" />
            </Card>
          )}

          {groups.map((group) => (
            <section key={group.tier} aria-labelledby={`${group.tier}-h`}>
              <h2 className="section-title" id={`${group.tier}-h`}>{group.title}</h2>
              {group.items.length === 0 ? (
                <EmptyState title={`No ${group.tier} tickets`} description="Nothing matches the current filters." />
              ) : (
                <div className="grid-cards">
                  {group.items.map((t) => <TicketCard key={t.id + t.tier} ticket={t} bankroll={bankroll} />)}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </>
  )
}
