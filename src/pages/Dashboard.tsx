import React, { useState } from 'react'
import { seedTickets } from '../mockData'

export default function Dashboard() {
  const [tickets] = useState<any[]>(seedTickets)

  return (
    <div className="container page-space">
      <section className="section-panel board-panel">
        <div className="section-head split-head">
          <div className="section-head inline-head">
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
                {tickets.map((ticket) => (
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
              <h3>Signal feed</h3>
            </div>
            <div className="signal-list">
              {[
                'Beat report updated: Celtics injury risk elevated 11%',
                'Weather alert: wind 18 mph reduces total model variance',
                'Usage increase signal: Lambert projected 34 min vs earlier 28',
                'Parlay books widened on same-game pricing',
              ].map((item) => (
                <div key={item} className="signal-item">
                  <span className="signal-dot" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
