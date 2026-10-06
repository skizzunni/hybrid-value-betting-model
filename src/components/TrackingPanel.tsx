import Card from './Card'
import DataTable, { type Column } from './DataTable'
import Stat from './Stat'
import analyticsJson from '../../data/analytics.json'
import statusJson from '../../data/status.json'

type Coverage = { tracked: number; resolved: number; unresolved: number; stale: number; pct_resolved: number | null }
type RunInfo = { at: string; ok: boolean } | null
type Status = {
  data_mode?: string
  last_pick_run?: RunInfo
  last_results_run?: RunInfo
  last_evening_results_run?: RunInfo
  last_successful_pick_run?: string
  last_successful_results_run?: string
  errors?: Array<{ message: string }>
}
type Analytics = { coverage?: { overall: Coverage; by_sport: Record<string, Coverage> } }

const STALE_AFTER_MS = 36 * 3600_000
const status = statusJson as unknown as Status
const analytics = analyticsJson as unknown as Analytics

function fmt(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString() : 'never'
}

type Row = { sport: string } & Coverage

const columns: Column<Row>[] = [
  { key: 'sport', header: 'Sport', render: (r) => r.sport },
  { key: 'tracked', header: 'Tracked', align: 'right', render: (r) => r.tracked },
  { key: 'resolved', header: 'Resolved', align: 'right', render: (r) => r.resolved },
  { key: 'unresolved', header: 'Unresolved', align: 'right', render: (r) => r.unresolved },
  { key: 'stale', header: 'Stale', align: 'right', render: (r) => r.stale },
  { key: 'pct', header: 'Coverage', align: 'right', render: (r) => (r.pct_resolved === null ? '—' : `${(r.pct_resolved * 100).toFixed(0)}%`) },
]

export default function TrackingPanel() {
  const overall = analytics.coverage?.overall
  const lastResults = status.last_successful_results_run
  const mode = status.data_mode !== 'live' || !overall || overall.tracked === 0
    ? 'sample'
    : lastResults && Date.now() - Date.parse(lastResults) > STALE_AFTER_MS ? 'stale' : 'live'
  const failed = [status.last_pick_run, status.last_results_run, status.last_evening_results_run].some((r) => r && !r.ok)
  const rows: Row[] = Object.entries(analytics.coverage?.by_sport ?? {}).map(([sport, c]) => ({ sport, ...c }))

  return (
    <Card title={`Game tracking (${mode} data)`}>
      <p className="leg-sub">
        {mode === 'sample' && 'No tracked games yet: the scheduled workflow has not produced live data. Figures below are empty, not estimated.'}
        {mode === 'stale' && 'Results have not refreshed in over 36 hours. Check the workflow status.'}
        {mode === 'live' && 'Committed by the scheduled workflows. Tracking measures performance; it does not guarantee future profit.'}
      </p>
      {failed && <p className="notice" role="alert">The last pipeline run reported a failure{status.errors?.[0] ? `: ${status.errors[0].message}` : ''}.</p>}
      <div className="grid-stats">
        <Stat label="Tracked games" value={overall?.tracked ?? 0} />
        <Stat label="Resolved" value={overall?.resolved ?? 0} />
        <Stat label="Unresolved / stale" value={`${overall?.unresolved ?? 0} / ${overall?.stale ?? 0}`} />
        <Stat label="Last picks run" value={fmt(status.last_successful_pick_run)} />
        <Stat label="Last results refresh" value={fmt(lastResults)} />
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.sport} caption="Per-sport game tracking coverage" />
    </Card>
  )
}
