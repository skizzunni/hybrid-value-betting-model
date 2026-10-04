import React, { useEffect, useState } from 'react'

export default function Dashboard(){
  const [tickets, setTickets] = useState<any[]>([])

  useEffect(()=>{
    fetch('/api/tickets').then(r=>r.json()).then(setTickets).catch(()=>{})
  },[])

  return (
    <div style={{padding:24}}>
      <div className="container main-content">
        <section className="section-panel board-panel">
          <div className="section-head split-head">
            <div className="section-head inline-head">
              <h2>Live decision board</h2>
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
                  {tickets.map(t=> (
                    <tr key={t.name}>
                      <td>
                        <div className="market-cell">
                          <div className="market-tag">{t.type}</div>
                          <div>{t.name}</div>
                        </div>
                      </td>
                      <td>{t.fair}</td>
                      <td>{t.book}</td>
                      <td className="edge-green">{t.edge}</td>
                      <td>{t.size}</td>
                      <td><span className={t.status.includes('Live') ? 'live-pill' : t.status.includes('Monitor') ? 'warn-pill' : 'neutral-pill'}>{t.status}</span></td>
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
                <div style={{color:'#94a3b8'}}>Signals stream from the backend and model.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
