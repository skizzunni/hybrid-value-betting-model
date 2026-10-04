import React, { useMemo, useState } from 'react'

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
