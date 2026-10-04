import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import Simulator from './pages/Simulator'
import Analytics from './pages/Analytics'
import Parlays from './pages/Parlays'
import Tickets from './pages/Tickets'

export default function App() {
  return (
    <BrowserRouter>
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
            <Link to="/">Home</Link>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/simulator">Simulator</Link>
            <Link to="/analytics">Analytics</Link>
            <Link to="/parlays">Parlays</Link>
            <Link to="/tickets">Tickets</Link>
          </nav>

          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/dashboard" className="primary-btn">Open dashboard</Link>
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/simulator" element={<Simulator />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/parlays" element={<Parlays />} />
          <Route path="/tickets" element={<Tickets />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
