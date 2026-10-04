import React, { useEffect, useState } from 'react'
import { generateDailyMenu, type Leg, type Ticket } from '../engine/ticketBuilder'
import { recommendStakeForTicket, topStraightPlays } from '../engine/staking'
import { fetchOddsAsLegs } from '../engine/oddsAdapter'

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [straightPlays, setStraightPlays] = useState<Leg[]>([])
  const [loading, setLoading] = useState(true)
  const [bankroll, setBankroll] = useState(1000)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const legs = await fetchOddsAsLegs()
        setTickets(generateDailyMenu(legs, { lotteryLegs: 25, minProbability: 0.55 }))
        setStraightPlays(topStraightPlays(legs, 5))
      } catch (error) {
        console.error('Failed to load tickets:', error)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportToCSV() {
    const rows = tickets.flatMap((ticket) => ticket.legs.map((leg) => ({
      ticket: ticket.name,
      sport: leg.sport,
      selection: leg.selection,
      odds: leg.americanOdds,
      probability: leg.modelProbability,
    })))
    const headers = ['ticket', 'sport', 'selection', 'odds', 'probability'] as const
    const csvCell = (value: string | number) => {
      const text = String(value)
      const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text
      return `"${safe.replace(/"/g, '""')}"`
    }
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
    ].join('\n')
    download('tickets.csv', csv, 'text/csv;charset=utf-8')
  }

  function exportToJSON() {
    download(
      'tickets.json',
      JSON.stringify({ tickets, straightPlays, exportedAt: new Date().toISOString() }, null, 2),
      'application/json',
    )
  }

  return (
    <div className="container" style={{ padding: '32px 0 80px' }}>
      <div className="section-panel board-panel">
        <div className="section-head">
          <h2>Daily Ticket Menu</h2>
        </div>

        <div style={{ marginTop: 20, marginBottom: 20 }}>
          <label>
            Bankroll: $
            <input
              type="number"
              min="0"
              value={bankroll}
              onChange={(event) => setBankroll(Number(event.target.value))}
            />
          </label>
          <button onClick={exportToCSV} style={{ marginLeft: 10 }}>Export CSV</button>
          <button onClick={exportToJSON} style={{ marginLeft: 10 }}>Export JSON</button>
        </div>

        {loading ? (
          <div style={{ color: '#94a3b8' }}>Loading tickets…</div>
        ) : (
          <>
            {straightPlays.length > 0 && (
              <div style={{ marginBottom: 30 }}>
                <h3>Top Straight Plays</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {straightPlays.map((play) => {
                    const stake = recommendStakeForTicket({
                      tier: 'straight',
                      legs: [play],
                      combinedProbability: play.modelProbability,
                    }, bankroll)
                    return (
                      <div key={play.id} style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 8, padding: 12, background: 'rgba(2,6,23,0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <strong>{play.selection}</strong>
                          <span style={{ color: '#8ae7bb' }}>{(play.modelProbability * 100).toFixed(1)}%</span>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '0.9em' }}>
                          {play.market} @ {play.americanOdds} | Suggested: ${stake.dollarStake.toFixed(2)} ({stake.units.toFixed(2)} units)
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <h3>Parlay Tickets</h3>
            <div style={{ display: 'grid', gap: 20 }}>
              {tickets.map((ticket) => {
                const stake = recommendStakeForTicket(ticket, bankroll)
                return (
                  <div key={ticket.id} style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 12, padding: 16, background: 'rgba(2,6,23,0.7)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <strong style={{ fontSize: '1.1em' }}>{ticket.name}</strong>
                        <span style={{ marginLeft: 8, padding: '2px 6px', background: ticket.tier === 'lottery' ? '#ff6b6b' : '#51cf66', borderRadius: 4, fontSize: '0.8em' }}>{ticket.tier}</span>
                      </div>
                      <div style={{ color: '#8ae7bb', fontWeight: 700 }}>{ticket.legs.length} legs</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12, fontSize: '0.9em', color: '#cbd5e1' }}>
                      <div>
                        <div style={{ color: '#94a3b8' }}>Combined Prob</div>
                        <div>{ticket.combinedProbability < 0.0001 ? `${(ticket.combinedProbability * 100).toExponential(2)}%` : `${(ticket.combinedProbability * 100).toFixed(4)}%`}</div>
                      </div>
                      <div>
                        <div style={{ color: '#94a3b8' }}>Decimal Odds</div>
                        <div>{ticket.payoutDecimal.toFixed(2)}x</div>
                      </div>
                      <div>
                        <div style={{ color: '#94a3b8' }}>$1 payout</div>
                        <div>${ticket.payoutDecimal.toFixed(2)}</div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 12, padding: 10, background: 'rgba(15,23,42,0.8)', borderRadius: 6, fontSize: '0.9em', color: '#cbd5e1' }}>
                      <strong>Recommended stake:</strong> ${stake.dollarStake.toFixed(2)} ({stake.units.toFixed(2)} units) — {stake.rationale}
                      {stake.warning && <div style={{ marginTop: 6, color: '#ff6b6b' }}>{stake.warning}</div>}
                    </div>

                    {ticket.notes.length > 0 && (
                      <div style={{ fontSize: '0.85em', color: '#94a3b8', marginBottom: 12 }}>
                        {ticket.notes.map((note, index) => <div key={index}>• {note}</div>)}
                      </div>
                    )}

                    <details style={{ marginTop: 12 }}>
                      <summary style={{ cursor: 'pointer', color: '#94a3b8', userSelect: 'none' }}>View {ticket.legs.length} legs</summary>
                      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                        {ticket.legs.map((leg) => (
                          <div key={leg.id} style={{ padding: 8, background: 'rgba(15,23,42,0.6)', borderRadius: 4, fontSize: '0.85em' }}>
                            <div><strong>{leg.selection}</strong> ({leg.sport})</div>
                            <div style={{ color: '#94a3b8' }}>{leg.market} @ {leg.americanOdds >= 0 ? '+' : ''}{leg.americanOdds}</div>
                            <div style={{ color: '#cbd5e1' }}>P={(leg.modelProbability * 100).toFixed(2)}%</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 30, padding: 16, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, fontSize: '0.9em' }}>
        <strong style={{ color: '#ff6b6b' }}>⚠️ DISCLAIMER:</strong> These are high-variance parlay tickets designed for small stakes only. Lottery tickets have astronomically low hit probabilities and are not investment vehicles. Parlay play is entertainment with a large house edge. Never wager more than you can afford to lose. Past performance does not guarantee future results.
      </div>
    </div>
  )
}
