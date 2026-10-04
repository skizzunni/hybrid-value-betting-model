import React, { useState } from 'react'

export default function Simulator() {
  const [fair, setFair] = useState(0.55)
  const [trials, setTrials] = useState(10000)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function runSim() {
    setLoading(true)
    const resp = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fair, trials })
    })
    const data = await resp.json()
    setResult(data)
    setLoading(false)
  }

  return (
    <div className="container page-space">
      <section className="section-panel board-panel">
        <div className="section-head">
          <h2>Simulation engine</h2>
        </div>

        <div className="sim-grid">
          <div className="sim-controls">
            <label>
              Fair probability
              <input type="number" value={fair} min={0.01} max={0.99} step={0.01} onChange={(e) => setFair(Number(e.target.value))} />
            </label>

            <label>
              Trial count
              <input type="number" value={trials} min={100} step={100} onChange={(e) => setTrials(Number(e.target.value))} />
            </label>

            <div className="cta-row">
              <button className="primary-btn" onClick={runSim} disabled={loading}>{loading ? 'Running...' : 'Run sim'}</button>
              <button className="secondary-btn" onClick={() => setResult(null)}>Clear</button>
            </div>
          </div>

          <div className="sim-output">
            {result ? (
              <pre>{JSON.stringify(result, null, 2)}</pre>
            ) : (
              <div className="empty-state">No simulation run yet. Set fair probability and click Run sim.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
