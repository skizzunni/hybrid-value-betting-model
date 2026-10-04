import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Database,
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
    edge: '+8.6%',
    confidence: 'High',
    size: '0.6u',
    status: 'Live +EV'
  },
  {
    type: 'Side',
    name: 'Lakers +3.5',
    edge: '+4.2%',
    confidence: 'Medium',
    size: '0.4u',
    status: 'Monitor'
  },
  {
    type: 'Parlay',
    name: '10-leg SGP build',
    edge: '+11.1%',
    confidence: 'Low',
    size: '0.2u',
    status: 'Correlation check'
  }
]

const lossMetrics = [
  'Variance: outcome inside expected failure-rate band.',
  'Model error: systematic bias beyond acceptable tolerance.',
  'Information miss: injury, role, or news not captured in time.',
  'Correlation miss: same-game or same-team legs failed jointly beyond forecast.'
]

const decisionRules = [
  { label: '1–3 leg bets', value: '2–3% max risk' },
  { label: '7+ leg tickets', value: '1% max risk' },
  { label: 'Expected loss rate', value: 'Visible in every model' },
  { label: 'Before every bet', value: 'Full log + uncertainty acknowledgment' }
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
            <a href="#refresh">Refresh</a>
            <a href="#tickets">Tickets</a>
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

        <section id="tickets" className="section-block">
          <div className="section-head">
            <Zap size={18} />
            <h2>Live candidate board</h2>
          </div>

          <div className="ticket-list">
            {liveTickets.map((ticket) => (
              <div key={ticket.name} className="ticket-row">
                <div className="ticket-main">
                  <div className="ticket-type">{ticket.type}</div>
                  <div className="ticket-name">{ticket.name}</div>
                </div>
                <div className="ticket-stat">
                  <span>Edge</span>
                  <strong>{ticket.edge}</strong>
                </div>
                <div className="ticket-stat">
                  <span>Confidence</span>
                  <strong>{ticket.confidence}</strong>
                </div>
                <div className="ticket-stat">
                  <span>Size</span>
                  <strong>{ticket.size}</strong>
                </div>
                <div className="ticket-state">
                  <span className={ticket.status.includes('Live') ? 'live' : ticket.status.includes('Monitor') ? 'monitor' : 'warn'}>
                    {ticket.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="losses" className="section-row lower-grid">
          <div className="half-card">
            <div className="section-head small-gap">
              <AlertTriangle size={18} />
              <h2>Loss integration loop</h2>
            </div>

            <div className="bullet-list">
              {lossMetrics.map((item) => (
                <div key={item} className="bullet-row">
                  <div className="bullet-mark"><Wallet size={14} /></div>
                  <span>{item}</span>
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
