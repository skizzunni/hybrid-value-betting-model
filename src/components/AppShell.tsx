import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import Badge from './Badge'
import { useSlate } from '../lib/slate'

const LINKS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/tickets', label: 'Tickets', end: false },
  { to: '/parlays', label: 'Parlays', end: false },
  { to: '/simulator', label: 'Simulator', end: false },
  { to: '/analytics', label: 'Analytics', end: false },
  { to: '/dashboard', label: 'Dashboard', end: false },
]

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const slate = useSlate()
  const statusLabel = slate.status === 'loading' ? 'Loading…' : slate.source === 'live' ? 'Live odds' : 'Demo data'
  const statusClass = slate.status === 'loading' ? 'loading' : slate.source

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">HV</span>
            <span className="brand-text">
              <span className="brand-name">Hybrid Value</span>
              <span className="brand-sub">Probability model</span>
            </span>
          </div>
          <button
            type="button"
            className="menu-btn"
            aria-expanded={open}
            aria-controls="primary-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
        <nav id="primary-nav" className={`nav ${open ? 'open' : ''}`} aria-label="Primary">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className="nav-link" onClick={() => setOpen(false)}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className={`sidebar-foot ${open ? 'open' : ''}`}>
          <div className="status-pill" role="status">
            <span className={`dot ${statusClass}`} aria-hidden="true" />
            <span>{statusLabel}</span>
          </div>
          {slate.status !== 'loading' && slate.source === 'demo' && (
            <div className="foot-note"><Badge kind="demo" /> Set VITE_ODDS_API_KEY for live odds.</div>
          )}
        </div>
      </aside>
      <main id="main" className="main" tabIndex={-1}>
        <div className="container">{children}</div>
      </main>
    </div>
  )
}
