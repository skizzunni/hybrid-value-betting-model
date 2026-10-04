import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Layers3,
  Shield,
  TrendingUp,
  Wallet,
  Zap
} from 'lucide-react'

const headlineStats = [
  { label: 'Bankroll', value: '$18,240', tone: 'emerald' },
  { label: 'Base unit', value: '1.0%', tone: 'sky' },
  { label: 'Current CLV', value: '+4.8%', tone: 'amber' },
  { label: 'Pass rate', value: '86%', tone: 'rose' }
]

const systemCards = [
  {
    icon: BrainCircuit,
    title: 'Probability-first model',
    text: 'Every player, team, and line is treated as a probability distribution. Losses are expected data, not failures.'
  },
  {
    icon: Clock3,
    title: '15-minute refresh loop',
    text: 'Odds, injuries, weather, minutes, and lineup changes are recalculated continuously so stale edges are removed.'
  },
  {
    icon: Layers3,
    title: 'Single + multi-leg engine',
    text: 'Sides, totals, props, and multi-leg tickets are built under one system with correlation-aware joint EV.'
  },
  {
    icon: Database,
    title: 'Persistent tracking DB',
    text: 'Every model decision, result, reason, variance category, and loss analysis is recorded in a single live ledger.'
  }
]

const refreshSteps = [
  'Pull latest odds across all books for sides, totals, props, and parlay/SGP prices.',
  'Refresh injuries, lineups, weather, minutes, and matchup adjustments.',
  'Re-score team power ratings, player projections, and uncertainty bands.',
  'Rebuild every candidate ticket and joint probability using current correlation assumptions.',
  'Reject anything with vanished edge, stale assumptions, or unacceptable variance.'
]

const liveTickets = [
  {
    type: 'Player prop',
    name: 'Jalen Brunson O 27.5 points',
    market: 'NBA',
    edge: '+8.6%',
    confidence: 'High',
    size: '0.6u',
    status: 'Live +EV',
    fair: '58.4%',
    book: '51.2%'
  },
  {
    type: 'Side',
    name: 'Lakers +3.5',
    market: 'NBA',
    edge: '+4.2%',
    confidence: 'Medium',
    size: '0.4u',
    status: 'Monitor',
    fair: '54.0%',
    book: '48.7%'
  },
  {
    type: 'Parlay',
    name: '10-leg SGP build',
    market: 'Multi-sport',
    edge: '+11.1%',
    confidence: 'Low',
    size: '0.2u',
    status: 'Correlation check',
    fair: '14.8%',
    book: '9.7%'
  },
  {
    type: 'Total',
    name: 'Over 218.5',
    market: 'NBA',
    edge: '+5.7%',
    confidence: 'High',
    size: '0.5u',
    status: 'Live +EV',
    fair: '53.8%',
    book: '49.1%'
  }
]

const lossMetrics = [
  { label: 'Variance', value: '41%', detail: 'Inside expected failure rate' },
  { label: 'Model error', value: '23%', detail: 'Systematic bias' },
  { label: 'Information miss', value: '26%', detail: 'Late news / injury' },
  { label: 'Correlation miss', value: '10%', detail: 'Joint leg underestimation' }
]

const decisionRules = [
  { label: '1–3 leg bets', value: '2–3% max risk' },
  { label: '7+ leg tickets', value: '1% max risk' },
  { label: 'Expected loss rate', value: 'Visible in every model' },
  { label: 'Pre-bet check', value: 'Full log + uncertainty acknowledgment' }
]

const heatmap = [
  [0.82, 0.54, 0.48, 0.36],
  [0.54, 0.91, 0.66, 0.42],
  [0.48, 0.66, 0.88, 0.58],
  [0.36, 0.42, 0.58, 0.73]
]

const signalFeed = [
  'Beat report updated: Celtics injury risk elevated 11%',
  'Weather alert: wind 18 mph reduces total model variance',
  'Usage increase signal: Lambert projected 34 min vs earlier 28',
  'Parlay books widened on Same-Game ticket pricing'
]

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container nav-row">
          <div className="brand-wrap">
            <div className="brand-mark">HV</div>
            <div>
              <div className="brand-name">Hybrid Value</div>
              <div className="brand-sub">Probability engine</div>
            </div>
          </div>

          <nav className="nav">
            <a href="#system">System</a>
            <a href="#board">Live board</a>
            <a href="#refresh">Refresh</a>
            <a href="#losses">Loss loop</a>
          </nav>

          <button className="primary-btn">View live board</button>
        </div>
      </header>

      <main className="container main-content">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <Shield size={14} />
              Uncertainty-priced execution
            </div>

            <h1>One integrated betting model for sides, totals, props, and multi-leg tickets.</h1>

            <p>
              Built to run as a single system: live market data, probability distributions, correlation-aware parlay pricing,
              and loss feedback that continuously updates the model from both wins and failures.
            </p>

            <div className="cta-row">
              <button className="primary-btn">Launch monitor</button>
              <button className="secondary-btn">See live pipeline</button>
            </div>

            <div className="stat-grid">
              {headlineStats.map((stat) => (
                <div className="mini-stat" key={stat.label}>
                  <div className="mini-label">{stat.label}</div>
                  <div className={`mini-value ${stat.tone}`}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          <aside className="stats-panel">
            <div className="panel-top">
              <div>
                <div className="panel-kicker">System health</div>
                <div className="panel-title">Live & calibrated</div>
              </div>
              <div className="panel-icon">
                <CheckCircle2 size={22} />
              </div>
            </div>

            <div className="status-stack">
              {[
                ['Odds feeds', 'Connected', '99.8%'],
                ['News + injuries', 'Synced', 'Live'],
                ['Refresh cycle', '15-minute', 'Active'],
                ['Parlay engine', 'Correlation-aware', 'Online']
              ].map(([label, value, percent]) => (
                <div key={label} className="status-row">
                  <div className="status-head">
                    <span>{label}</span>
                    <small>{value}</small>
                  </div>
                  <div className="status-bar">
                    <span style={{ width: percent === '99.8%' ? '99.8%' : percent === 'Live' ? '94%' : percent === 'Active' ? '100%' : '88%' }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="small-warning-box">
              <div className="warning-label">Expected failure rate</div>
              <div className="warning-value">42%</div>
              <div className="warning-caption">Average loss allowance for a projected winner tier.</div>
            </div>
          </aside>
        </section>

        <section id="system" className="section-block">
          <div className="section-head">
            <BarChart3 size={18} />
            <h2>What the system does</h2>
          </div>

          <div className="feature-grid">
            {systemCards.map(({ icon: Icon, title, text }) => (
              <article key={title} className="feature-card">
                <div className="feature-icon">
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="board" className="section-panel board-panel">
          <div className="section-head split-head">
            <div className="section-head inline-head">
              <Gauge size={18} />
              <h2>Live decision board</h2>
            </div>
            <div className="filter-row">
              <span>All</span>
              <span>Props</span>
              <span>Totals</span>
              <span>Parlays</span>
            </div>
          </div>

          <div className="board-grid">
            <div className="board-table-wrap">
              <table className="board-table">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Fair</th>
                    <th>Book</th>
                    <th>Edge</th>
                    <th>Size</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {liveTickets.map((ticket) => (
                    <tr key={ticket.name}>
                      <td>
                        <div className="market-cell">
                          <div className="market-tag">{ticket.type}</div>
                          <div>{ticket.name}</div>
                        </div>
                      </td>
                      <td>{ticket.fair}</td>
                      <td>{ticket.book}</td>
                      <td className="edge-green">{ticket.edge}</td>
                      <td>{ticket.size}</td>
                      <td>
                        <span className={ticket.status.includes('Live') ? 'live-pill' : ticket.status.includes('Monitor') ? 'warn-pill' : 'neutral-pill'}>
                          {ticket.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="signal-box">
              <div className="section-head small-gap">
                <BellRing size={18} />
                <h3>Signal feed</h3>
              </div>
              <div className="signal-list">
                {signalFeed.map((item) => (
                  <div key={item} className="signal-item">
                    <span className="signal-dot" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="refresh" className="section-row">
          <div className="half-card">
            <div className="section-head small-gap">
              <Activity size={18} />
              <h2>15-minute refresh loop</h2>
            </div>

            <div className="list-stack">
              {refreshSteps.map((step) => (
                <div key={step} className="check-row">
                  <div className="check-icon">
                    <CheckCircle2 size={16} />
                  </div>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="half-card">
            <div className="section-head small-gap">
              <TrendingUp size={18} />
              <h2>Model calibration</h2>
            </div>

            <div className="chart-box">
              {[24, 26, 33, 19, 28, 32, 27].map((height, index) => (
                <div key={index} className="bar-col" style={{ height: `${height}%` }} />
              ))}
            </div>

            <div className="confidence-grid">
              {[
                ['Win rate', '58%', '#34d399'],
                ['Edge', '6.8%', '#38bdf8'],
                ['Variance', '42%', '#fbbf24'],
                ['Risk', '1.2%', '#fb7185']
              ].map(([label, value, color]) => (
                <div key={label} className="confidence-cell">
                  <div className="confidence-head">
                    <span>{label}</span>
                    <b style={{ color }}>{value}</b>
                  </div>
                  <div className="confidence-bar">
                    <span style={{ width: value.replace('%', ''), background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section-row lower-grid">
          <div className="half-card">
            <div className="section-head small-gap">
              <AlertTriangle size={18} />
              <h2>Loss integration loop</h2>
            </div>

            <div className="loss-grid">
              {lossMetrics.map((item) => (
                <div key={item.label} className="loss-card">
                  <div className="loss-label">{item.label}</div>
                  <div className="loss-value">{item.value}</div>
                  <div className="loss-detail">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="half-card">
            <div className="section-head small-gap">
              <BrainCircuit size={18} />
              <h2>Decision stack</h2>
            </div>

            <div className="rules-grid">
              {decisionRules.map((rule) => (
                <div key={rule.label} className="rule-box">
                  <div className="rule-label">{rule.label}</div>
                  <div className="rule-value">{rule.value}</div>
                </div>
              ))}
            </div>

            <div className="decision-summary">
              <div className="summary-row">
                <span>Current decision rule</span>
                <strong>Pass unless +EV and acceptable uncertainty</strong>
              </div>
              <div className="summary-row subtle">
                <span>Execution discipline</span>
                <strong>3-step log → edge check → stake allocation</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="section-panel correlation-panel">
          <div className="section-head small-gap">
            <Layers3 size={18} />
            <h2>Correlation matrix</h2>
          </div>

          <div className="matrix-grid">
            <div className="matrix-box">
              {heatmap.map((row, rowIndex) => (
                <div key={rowIndex} className="matrix-row">
                  {row.map((cell, cellIndex) => (
                    <div
                      key={`${rowIndex}-${cellIndex}`}
                      className="matrix-cell"
                      style={{ opacity: 0.4 + cell * 0.8, background: `rgba(52, 211, 153, ${0.22 + cell * 0.7})` }}
                    >
                      {cell.toFixed(2)}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="matrix-note">
              <div className="note-kicker">Joint probability model</div>
              <p>
                Same-game and same-team legs are never treated as independent. Correlation penalties are applied before ticket EV is accepted.
              </p>
            </div>
          </div>
        </section>

        <section className="cta-panel">
          <div>
            <div className="cta-kicker">Operational model</div>
            <h3>Every refresh builds a live, probability-first decision stream.</h3>
          </div>
          <button className="primary-btn">
            Start the system
            <ArrowRight size={16} />
          </button>
        </section>
      </main>
    </div>
  )
}
