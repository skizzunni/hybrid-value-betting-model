import React, { useMemo, useState } from 'react'
import { getLedgerSummary, getSideCalibration, getSidedResults, loadLedger, type AnalyticsSide, type CalibrationPoint } from '../engine/ledger'

const GREEN = '#34d399'
const AMBER = '#f59e0b'
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`
const odds = (v: number) => (v === 0 ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(0)}`)

function SideCard({ title, color, stats }: { title: string; color: string; stats: AnalyticsSide }) {
  return (
    <div className="analytics-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="card-header"><h3 style={{ color }}>{title}</h3></div>
      <div className="data-grid">
        <div><label>Avg odds</label><strong style={{ fontFamily: 'ui-monospace, monospace' }}>{odds(stats.avgOdds)}</strong></div>
        <div><label>ROI</label><strong>{pct(stats.roi)}</strong></div>
        <div><label>Hit rate</label><strong>{pct(stats.hitRate)}</strong></div>
        <div><label>Avg edge</label><strong>{pct(stats.avgTakenEdge, 2)}</strong></div>
      </div>
    </div>
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
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Win rate vs predicted probability by side" style={{ width: '100%', maxWidth: 320 }}>
      <line x1={scale(0)} y1={size - scale(0)} x2={scale(1)} y2={size - scale(1)} stroke="#475569" strokeDasharray="4 3" />
      <path d={path(favorite)} fill="none" stroke={GREEN} strokeWidth={2} />
      <path d={path(underdog)} fill="none" stroke={AMBER} strokeWidth={2} />
      {dots(favorite, GREEN)}
      {dots(underdog, AMBER)}
      <text x={pad} y={12} fontSize={9} fill="#94a3b8">actual win rate vs predicted (dashed = perfect)</text>
    </svg>
  )
}

const makeBars = (labels: string[], values: number[]) => labels.map((label, index) => ({
  label,
  value: values[index] ?? 0,
}))

const makeBacktest = () => {
  const sample = [0.72, 0.66, 0.74, 0.59, 0.71, 0.68, 0.76, 0.63, 0.7, 0.67, 0.75, 0.61, 0.73, 0.64]
  const wins = sample.filter((value) => value >= 0.68).length
  const hitRate = (wins / sample.length) * 100
  const meanEdge = sample.reduce((sum, value) => sum + value, 0) / sample.length

  return {
    hitRate: Number(hitRate.toFixed(1)),
    avgEdge: Number((meanEdge * 100).toFixed(1)),
    roi: Number(((meanEdge - 0.58) * 100).toFixed(1)),
    drawdown: 18.4,
  }
}

export default function Analytics() {
  const [backtest, setBacktest] = useState(makeBacktest())
  const [running, setRunning] = useState(false)
  const ledger = useMemo(() => loadLedger(), [])
  const ledgerSummary = useMemo(() => getLedgerSummary(ledger), [ledger])
  const sided = useMemo(() => getSidedResults(ledger), [ledger])
  const calibration = useMemo(() => getSideCalibration(ledger), [ledger])

  const summary = useMemo(() => [
    { label: 'Total picks', value: '125', accent: 'emerald' },
    { label: 'Avg fair', value: '68.4%', accent: 'sky' },
    { label: 'Avg edge', value: '+6.1%', accent: 'amber' },
    { label: 'Risk band', value: 'Low', accent: 'rose' },
  ], [])

  const distribution = useMemo(
    () => makeBars(['55-60', '60-65', '65-70', '70-75', '75+'], [12, 26, 34, 18, 10]),
    [],
  )

  const runBacktest = () => {
    setRunning(true)
    window.setTimeout(() => {
      setBacktest(makeBacktest())
      setRunning(false)
    }, 400)
  }

  return (
    <div className="container page-space">
      <section className="section-panel board-panel professional-panel">
        <div className="section-head split-head align-bottom">
          <div>
            <div className="eyebrow subtle">Performance</div>
            <h2>Analytics</h2>
          </div>
          <button type="button" className="primary-btn compact" onClick={runBacktest}>
            {running ? 'Running…' : 'Run backtest'}
          </button>
        </div>

        <div className="stats-grid">
          {summary.map((item) => (
            <div key={item.label} className="mini-stat-card">
              <div className="mini-label">{item.label}</div>
              <div className={`mini-value ${item.accent}`}>{item.value}</div>
            </div>
          ))}
        </div>

        <div className="analytics-card wide-card">
          <div className="card-header"><h3>Results by side</h3></div>
          <div className="stats-grid">
            <div className="mini-stat-card"><div className="mini-label">Favorite ROI</div><div className="mini-value emerald">{pct(ledgerSummary.favoriteStats.roi)}</div></div>
            <div className="mini-stat-card"><div className="mini-label">Underdog ROI</div><div className="mini-value amber">{pct(ledgerSummary.underdogStats.roi)}</div></div>
            <div className="mini-stat-card"><div className="mini-label">Parts won</div><div className="mini-value sky">{ledgerSummary.partsWon}</div></div>
          </div>
          {ledger.length === 0 ? (
            <p>No results logged yet. Log results on the Tickets page to see ROI by side.</p>
          ) : (
            <>
              <div className="analytics-grid">
                <SideCard title="Favorites" color={GREEN} stats={sided.favorite} />
                <SideCard title="Underdogs" color={AMBER} stats={sided.underdog} />
              </div>
              <SideChart favorite={calibration.favorite} underdog={calibration.underdog} />
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}><th>Side</th><th>Bets</th><th>ROI</th><th>Hit rate</th><th>Avg taken edge</th><th>Avg closing edge</th></tr>
                </thead>
                <tbody>
                  {([['Favorite', sided.favorite], ['Underdog', sided.underdog]] as const).map(([name, row]) => (
                    <tr key={name}>
                      <td>{name}</td><td>{row.count}</td><td>{pct(row.roi)}</td><td>{pct(row.hitRate)}</td>
                      <td>{pct(row.avgTakenEdge, 2)}</td><td>{pct(row.edgeVsClosing, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p style={{ color: '#94a3b8', fontSize: '0.9em' }}>
            Profits come from finding price edges, not from picking winners. Small samples are noisy: judge each side over hundreds of bets, not a handful.
          </p>
        </div>

        <div className="analytics-grid">
          <div className="analytics-card">
            <div className="card-header">
              <h3>Fair probability distribution</h3>
            </div>
            <div className="bar-stack">
              {distribution.map((bar) => (
                <div key={bar.label} className="bar-row">
                  <span>{bar.label}</span>
                  <div className="bar-track">
                    <span style={{ width: `${bar.value}%` }} />
                  </div>
                  <strong>{bar.value}%</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="analytics-card">
            <div className="card-header">
              <h3>Backtest snapshot</h3>
            </div>
            <div className="data-grid">
              <div>
                <label>Hit rate</label>
                <strong>{backtest.hitRate}%</strong>
              </div>
              <div>
                <label>Avg edge</label>
                <strong>{backtest.avgEdge}%</strong>
              </div>
              <div>
                <label>ROI</label>
                <strong>{backtest.roi}%</strong>
              </div>
              <div>
                <label>Drawdown</label>
                <strong>{backtest.drawdown}%</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="analytics-card wide-card">
          <div className="card-header">
            <h3>Model notes</h3>
          </div>
          <ul className="check-list">
            <li>Use probability thresholds above 68% before any ticket is included.</li>
            <li>Prefer home favorites with positive rest/travel advantages.</li>
            <li>Correlated same-game legs only when the script is clean and the number is stable.</li>
            <li>Never force 25 legs when the pool is thin; keep the safest 12–15 and size small.</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
