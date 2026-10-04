import { Link } from 'react-router-dom'

const cards = [
  'Probability-first edge engine',
  '15-minute refresh loop',
  'Correlation-adjusted multi-leg tickets',
  'Continuous loss-learning model'
]

export default function Home() {
  return (
    <div className="container page-space">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow">Uncertainty-priced execution</div>
          <h1>One integrated betting model for sides, totals, props, and multi-leg tickets.</h1>
          <p>
            Built to run as a single operating system: live odds, model probability, correlation-aware ticket pricing,
            and continuous loss feedback that updates the engine after every result.
          </p>
          <div className="cta-row">
            <Link to="/dashboard" className="primary-btn">Launch monitor</Link>
            <Link to="/simulator" className="secondary-btn">Run simulator</Link>
          </div>
        </div>

        <aside className="stats-panel">
          <div className="panel-top">
            <div>
              <div className="panel-kicker">System health</div>
              <div className="panel-title">Live & calibrated</div>
            </div>
            <div className="panel-icon">✓</div>
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
                <div className="status-bar"><span style={{ width: percent }} /></div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="section-block">
        <div className="section-head">
          <h2>Core capabilities</h2>
        </div>
        <div className="feature-grid">
          {cards.map((card, i) => (
            <article className="feature-card" key={card}>
              <div className="feature-icon">0{i + 1}</div>
              <h3>{card}</h3>
              <p>
                The platform continuously rebuilds tickets from fresh distributions, checks risk tolerance,
                and rejects marginal scenarios before they become costly decisions.
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
