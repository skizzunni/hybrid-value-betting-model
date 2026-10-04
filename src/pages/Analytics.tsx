import React, { useEffect, useState } from 'react'

export default function Analytics() {
  const [metrics, setMetrics] = useState<any>(null)

  useEffect(() => {
    fetch('/api/metrics').then((r) => r.json()).then(setMetrics)
  }, [])

  return (
    <div className="container page-space">
      <section className="section-panel board-panel">
        <div className="section-head">
          <h2>Analytics</h2>
        </div>

        <div className="analytics-grid">
          <div className="metric-card">
            <div className="metric-label">Bankroll</div>
            <div className="metric-value">$18,240</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">CLV</div>
            <div className="metric-value">+4.8%</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Pass rate</div>
            <div className="metric-value">86%</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Expected loss</div>
            <div className="metric-value">42%</div>
          </div>
        </div>

        <div className="analytics-output">
          <pre>{metrics ? JSON.stringify(metrics, null, 2) : 'Loading metrics...'}</pre>
        </div>
      </section>
    </div>
  )
}
