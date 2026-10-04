import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/Card'
import DataTable, { type Column } from '../components/DataTable'
import Disclaimer from '../components/Disclaimer'
import EmptyState from '../components/EmptyState'
import LineChart from '../components/LineChart'
import PageHeader from '../components/PageHeader'
import Stat from '../components/Stat'
import { clearLedger, getLedgerSummary, loadLedger, type LedgerEntry } from '../engine/ledger'
import { currency, percent, probability, signedCurrency, signedPercent } from '../lib/format'

const columns: Column<LedgerEntry>[] = [
  { key: 'date', header: 'Date', render: (e) => (Number.isFinite(e.timestamp) ? new Date(e.timestamp).toLocaleDateString() : '—') },
  { key: 'ticket', header: 'Ticket', render: (e) => e.ticketName },
  { key: 'legs', header: 'Legs', align: 'right', render: (e) => e.legCount },
  { key: 'p', header: 'Model prob', align: 'right', render: (e) => (typeof e.combinedProbability === 'number' ? probability(e.combinedProbability) : '—') },
  { key: 'stake', header: 'Stake', align: 'right', render: (e) => currency(e.stake) },
  { key: 'result', header: 'Result', render: (e) => <span className={e.hit ? 'tone-positive' : 'tone-negative'}>{e.hit ? 'Hit' : 'Miss'}</span> },
  { key: 'pl', header: 'P/L', align: 'right', render: (e) => <span className={e.payout - e.stake >= 0 ? 'tone-positive' : 'tone-negative'}>{signedCurrency(e.payout - e.stake)}</span> },
  { key: 'clv', header: 'CLV', align: 'right', render: (e) => (typeof e.clv === 'number' ? signedPercent(e.clv, 2) : '—') },
]

export default function Analytics() {
  const [entries, setEntries] = useState<LedgerEntry[]>(() => loadLedger())
  const summary = useMemo(() => getLedgerSummary(), [entries])
  const sorted = useMemo(() => [...entries].sort((a, b) => b.timestamp - a.timestamp), [entries])
  const curve = useMemo(() => {
    const out = [0]
    for (const e of [...entries].sort((a, b) => a.timestamp - b.timestamp)) out.push(out[out.length - 1] + (e.payout - e.stake))
    return out
  }, [entries])

  function clear() {
    if (window.confirm('Clear all logged results from this browser?')) {
      clearLedger()
      setEntries([])
    }
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Performance of tickets you've logged. Results are stored locally in this browser."
        actions={entries.length > 0 && <button type="button" className="btn" onClick={clear}>Clear ledger</button>}
      />
      {entries.length === 0 ? (
        <EmptyState
          title="No results logged yet"
          description="Analytics are computed only from tickets you log. Use “Log result” on a ticket once it settles."
          action={<Link to="/tickets" className="btn btn-primary">Go to tickets</Link>}
        />
      ) : (
        <div className="stack-lg">
          <div className="grid-stats">
            <Stat label="Tickets logged" value={summary.totalTickets} delta={`${summary.hits} hits / ${summary.losses} misses`} />
            <Stat label="Hit rate" value={percent(summary.hitRate)} />
            <Stat label="ROI" value={signedPercent(summary.roi)} tone={summary.roi >= 0 ? 'positive' : 'negative'} />
            <Stat
              label="Average CLV"
              value={summary.averageCLV === undefined ? '—' : signedPercent(summary.averageCLV, 2)}
              hint={summary.averageCLV === undefined ? 'No CLV recorded' : undefined}
            />
          </div>
          {curve.length >= 2 && (
            <Card title="Cumulative profit">
              <LineChart values={curve} label="Cumulative profit from logged tickets" />
            </Card>
          )}
          <Card title="Results" padded={false}>
            <DataTable columns={columns} rows={sorted} rowKey={(e) => e.id} caption="Logged results" />
          </Card>
        </div>
      )}
      <Disclaimer />
    </>
  )
}
