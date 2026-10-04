import { useMemo } from 'react'
import { getCalibration } from '../engine/calibration'
import { loadLedger } from '../engine/ledger'

const edgeTiers = ['strong', 'medium', 'weak', 'breakeven', 'negative'] as const

export default function Analytics() {
  const calibration = useMemo(() => getCalibration(), [])
  const ledger = useMemo(() => loadLedger(), [])
  const roiByTier = useMemo(() => edgeTiers.map((tier) => {
    const entries = ledger.filter((entry) => entry.edgeQuality === tier)
    const staked = entries.reduce((sum, entry) => sum + entry.stake, 0)
    const returned = entries.reduce((sum, entry) => sum + entry.payout, 0)
    return { tier, count: entries.length, roi: staked > 0 ? (returned - staked) / staked : undefined }
  }), [ledger])

  return (
    <div className="container page-space">
      <section className="section-panel board-panel professional-panel">
        <div className="section-head split-head align-bottom">
          <div>
            <div className="eyebrow subtle">Measured performance</div>
            <h2>Analytics</h2>
          </div>
        </div>

        <div className="stats-grid">
          <div className="mini-stat-card">
            <div className="mini-label">Brier score</div>
            <div className="mini-value emerald">{calibration.brierScore.toFixed(4)}</div>
          </div>
          <div className="mini-stat-card">
            <div className="mini-label">Calibration error</div>
            <div className="mini-value sky">{calibration.calibrationError.toFixed(4)}</div>
          </div>
          <div className="mini-stat-card">
            <div className="mini-label">Resolved predictions</div>
            <div className="mini-value">{calibration.buckets.reduce((sum, bucket) => sum + bucket.count, 0)}</div>
          </div>
          <div className="mini-stat-card">
            <div className="mini-label">Logged results</div>
            <div className="mini-value">{ledger.length}</div>
          </div>
        </div>

        <div className="analytics-grid">
          <div className="analytics-card">
            <div className="card-header"><h3>Reliability diagram</h3></div>
            <p>Each point compares mean predicted probability (x) with observed win rate (y). The dashed diagonal is perfect calibration.</p>
            <svg viewBox="0 0 100 100" role="img" aria-label="Reliability diagram: predicted probability versus actual win rate" style={{ width: 'min(100%, 420px)', background: 'rgba(2,6,23,0.45)' }}>
              <line x1="10" y1="90" x2="90" y2="10" stroke="#64748b" strokeDasharray="3 2" />
              <line x1="10" y1="90" x2="90" y2="90" stroke="#475569" />
              <line x1="10" y1="90" x2="10" y2="10" stroke="#475569" />
              {calibration.buckets.map((bucket) => (
                <circle key={bucket.predicted} cx={10 + bucket.predicted * 80} cy={90 - bucket.actualRate * 80} r="2.5" fill="#34d399">
                  <title>{`Predicted ${(bucket.predicted * 100).toFixed(0)}%, actual ${(bucket.actualRate * 100).toFixed(0)}%, n=${bucket.count}`}</title>
                </circle>
              ))}
            </svg>
            {calibration.buckets.length === 0 && <p>No resolved predictions yet; the diagram will populate as results are logged.</p>}
          </div>

          <div className="analytics-card">
            <div className="card-header"><h3>ROI by edge quality</h3></div>
            <p>ROI is calculated only from results logged with a recorded stake; no simulated values are shown.</p>
            <div className="bar-stack">
              {roiByTier.map(({ tier, count, roi }) => (
                <div key={tier} className="bar-row">
                  <span>{tier}</span>
                  <div className="bar-track">
                    {roi !== undefined && <span style={{ width: `${Math.min(100, Math.abs(roi) * 100)}%` }} />}
                  </div>
                  <strong>{roi === undefined ? `— (${count})` : `${roi >= 0 ? '+' : ''}${(roi * 100).toFixed(1)}% (${count})`}</strong>
                </div>
              ))}
            </div>
            {ledger.length === 0 && <p>No wager results have been logged yet.</p>}
          </div>
        </div>

        <div className="analytics-card wide-card">
          <div className="card-header"><h3>How to read these metrics</h3></div>
          <ul className="check-list">
            <li>A Brier score is the mean squared probability error; lower is better, and 0 is perfect.</li>
            <li>CLV and calibration need resolved picks and real closing prices. Small samples are noisy.</li>
            <li>Consensus prices are a market baseline, not a source of independent model edge.</li>
            <li>Sharps win on straights with real edges; 25-leg tickets are entertainment.</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
