import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/Card'
import DataTable, { type Column } from '../components/DataTable'
import Disclaimer from '../components/Disclaimer'
import EmptyState from '../components/EmptyState'
import LineChart from '../components/LineChart'
import PageHeader from '../components/PageHeader'
import Stat from '../components/Stat'
import { clearLedger, getLedgerSummary, getSideCalibration, getSidedResults, loadLedger, type AnalyticsSide, type CalibrationPoint, type LedgerEntry } from '../engine/ledger'
import { currency, percent, probability, signedCurrency, signedPercent } from '../lib/format'

const columns: Column<LedgerEntry>[] = [
  { key: 'date', header: 'Date', render: (e) => (Number.isFinite(e.timestamp) ? new Date(e.timestamp).toLocaleDateString() : '—') },
  { key: 'ticket', header: 'Ticket', render: (e) => e.ticketName },
  { key: 'legs', header: 'Legs', align: 'right', render: (e) => e.legCount },
  { key: 'p', header: 'Model prob', align: 'right', render: (e) => (typeof e.combinedProbability === 'number' ? probability(e.combinedProbability) : '—') },
  { key: 'stake', header: 'Stake', align: 'right', render: (e) => currency(e.stake) },
  { key: 'result', header: 'Result', render: (e) => <span className={e.outcome === 'push' ? '' : (e.outcome === 'win' || (!e.outcome && e.hit)) ? 'tone-positive' : 'tone-negative'}>{e.outcome ?? (e.hit ? 'win' : 'loss')}</span> },
  { key: 'pl', header: 'P/L', align: 'right', render: (e) => <span className={e.payout - e.stake >= 0 ? 'tone-positive' : 'tone-negative'}>{signedCurrency(e.payout - e.stake)}</span> },
  { key: 'clv', header: 'CLV', align: 'right', render: (e) => (typeof e.clv === 'number' ? signedPercent(e.clv, 2) : '—') },
]

const GREEN = '#34d399'
const AMBER = '#f59e0b'

function SideCard({ title, color, stats }: { title: string; color: string; stats: AnalyticsSide }) {
  return (
    <Card title={title}>
      <div className="grid-stats" style={{ borderTop: `3px solid ${color}` }}>
        <Stat label="Avg odds" value={stats.avgOdds === 0 ? '—' : `${stats.avgOdds > 0 ? '+' : ''}${stats.avgOdds.toFixed(0)}`} />
        <Stat label="ROI" value={signedPercent(stats.roi)} tone={stats.roi >= 0 ? 'positive' : 'negative'} />
        <Stat label="Hit rate" value={percent(stats.hitRate)} />
        <Stat label="Avg edge" value={signedPercent(stats.avgTakenEdge, 2)} />
      </div>
    </Card>
  )
}

function SideChart({ favorite, underdog }: { favorite: CalibrationPoint[]; underdog: CalibrationPoint[] }) {
  const size = 200
  const pad = 24
  const scale = (v: number) => pad + v * (size - 2 * pad)
  const path = (points: CalibrationPoint[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scale(p.predicted)},${size - scale(p.actual)}`).join(' ')
  const dots = (points: CalibrationPoint[], color: string) =>
    points.map((p) => <circle key={`${color}-${p.predicted}`} cx={scale(p.predicted)} cy={size - scale(p.actual)} r={3} fill={color} />)
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Win rate vs predicted probability by side. Favorites green, underdogs amber." style={{ width: '100%', maxWidth: 320 }}>
      <line x1={scale(0)} y1={size - scale(0)} x2={scale(1)} y2={size - scale(1)} stroke="#475569" strokeDasharray="4 3" />
      <path d={path(favorite)} fill="none" stroke={GREEN} strokeWidth={2} />
      <path d={path(underdog)} fill="none" stroke={AMBER} strokeWidth={2} />
      {dots(favorite, GREEN)}
      {dots(underdog, AMBER)}
    </svg>
  )
}

const sideColumns: Column<[string, AnalyticsSide]>[] = [
  { key: 'side', header: 'Side', render: ([name]) => name },
  { key: 'count', header: 'Bets', align: 'right', render: ([, r]) => r.count },
  { key: 'roi', header: 'ROI', align: 'right', render: ([, r]) => signedPercent(r.roi) },
  { key: 'hit', header: 'Hit rate', align: 'right', render: ([, r]) => percent(r.hitRate) },
  { key: 'taken', header: 'Avg taken edge', align: 'right', render: ([, r]) => signedPercent(r.avgTakenEdge, 2) },
  { key: 'closing', header: 'Avg closing edge', align: 'right', render: ([, r]) => signedPercent(r.edgeVsClosing, 2) },
]

export default function Analytics() {
  const [entries, setEntries] = useState<LedgerEntry[]>(() => loadLedger())
  const summary = useMemo(() => getLedgerSummary(entries), [entries])
  const sided = useMemo(() => getSidedResults(entries), [entries])
  const calibration = useMemo(() => getSideCalibration(entries), [entries])
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
            <Stat label="Favorite ROI" value={signedPercent(summary.favoriteStats.roi)} tone={summary.favoriteStats.roi >= 0 ? 'positive' : 'negative'} delta={`${summary.favoriteStats.count} bets`} />
            <Stat label="Underdog ROI" value={signedPercent(summary.underdogStats.roi)} tone={summary.underdogStats.roi >= 0 ? 'positive' : 'negative'} delta={`${summary.underdogStats.count} bets`} />
            <Stat label="Parts won" value={summary.partsWon} hint="Legs that hit within tickets" />
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
          <section aria-labelledby="side-h">
            <h2 className="section-title" id="side-h">Results by side</h2>
            <div className="grid-cards">
              <SideCard title="Favorites" color={GREEN} stats={sided.favorite} />
              <SideCard title="Underdogs" color={AMBER} stats={sided.underdog} />
            </div>
            <Card title="Actual win rate vs predicted (green favorites, amber underdogs)">
              <SideChart favorite={calibration.favorite} underdog={calibration.underdog} />
            </Card>
            <Card padded={false}>
              <DataTable columns={sideColumns} rows={[['Favorite', sided.favorite], ['Underdog', sided.underdog]] as Array<[string, AnalyticsSide]>} rowKey={([name]) => name} caption="Results by side" />
            </Card>
            <p className="leg-sub">Profits come from finding price edges, not from picking winners. Side stats need hundreds of bets to mean anything.</p>
          </section>
          <Card title="Results" padded={false}>
            <DataTable columns={columns} rows={sorted} rowKey={(e) => e.id} caption="Logged results" />
          </Card>
        </div>
      )}
      <Disclaimer />
    </>
  )
}
