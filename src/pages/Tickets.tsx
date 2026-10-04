import React, { useEffect, useState } from 'react'
import { generateDailyMenu, type Leg, type Ticket } from '../engine/ticketBuilder'
import { recommendStakeForTicket, tierForLeg, topStraightPlays } from '../engine/staking'
import { fetchOddsAsLegs } from '../engine/oddsAdapter'
import { saveTicketResult } from '../engine/ledger'
import { classifyLeg, filterByEdgeOnly, isHighValue, legEdge, topUnderdogValue, type Side } from '../engine/underdog'

type ViewMode = 'all' | 'parlays' | 'straights' | 'underdogs'

const MODES: { value: ViewMode; label: string }[] = [
  { value: 'all', label: 'All bets' },
  { value: 'parlays', label: 'Parlays only' },
  { value: 'straights', label: 'Straights only' },
  { value: 'underdogs', label: 'Underdogs only' },
]

const AMBER = '#f59e0b'
const fmtOdds = (odds: number) => `${odds >= 0 ? '+' : ''}${odds}`
const sideMixText = (mix: { favorite: number; underdog: number; neutral: number }) =>
  `${mix.underdog} underdogs, ${mix.favorite} favorites, ${mix.neutral} neutral`

type LogTarget = { name: string; legs: Leg[]; side: Side; combinedProbability: number; id?: string }

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [straightPlays, setStraightPlays] = useState<Leg[]>([])
  const [loading, setLoading] = useState(true)
  const [bankroll, setBankroll] = useState(1000)
  const [mode, setMode] = useState<ViewMode>('all')
  const [allLegs, setAllLegs] = useState<Leg[]>([])
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null)
  const [logSide, setLogSide] = useState<Side>('neutral')
  const [logStake, setLogStake] = useState(10)
  const [logHit, setLogHit] = useState(false)
  const [logPayout, setLogPayout] = useState(0)
  const [logMessage, setLogMessage] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const legs = await fetchOddsAsLegs()
        setAllLegs(legs)
        setTickets(generateDailyMenu(legs, { lotteryLegs: 25, minProbability: 0.55, mode: 'parlays' }))
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

  const showParlays = mode === 'all' || mode === 'parlays'
  const showStraights = mode === 'all' || mode === 'straights' || mode === 'underdogs'
  const underdogRows = mode === 'straights'
    ? filterByEdgeOnly(allLegs).sort((a, b) => legEdge(b) - legEdge(a)).slice(0, 10)
    : topUnderdogValue(filterByEdgeOnly(allLegs), 10)

  function openLog(target: LogTarget) {
    setLogTarget(target)
    setLogSide(target.side)
    setLogHit(false)
    setLogPayout(0)
    setLogMessage('')
  }

  function submitLog() {
    if (!logTarget) return
    const single = logTarget.legs.length === 1 ? logTarget.legs[0] : undefined
    saveTicketResult(
      { name: logTarget.name, legs: logTarget.legs, id: logTarget.id, combinedProbability: logTarget.combinedProbability },
      logStake,
      logHit,
      logHit ? logPayout : 0,
      undefined,
      {
        side: logSide,
        legs: logTarget.legs.map((leg) => ({
          side: logTarget.legs.length === 1 ? logSide : classifyLeg(leg),
          americanOdds: leg.americanOdds,
          modelProbability: leg.modelProbability,
          ...(logTarget.legs.length === 1 ? { hit: logHit } : {}),
        })),
        legsHit: logHit ? logTarget.legs.length : undefined,
        takenEdge: single ? legEdge(single) : undefined,
      },
    )
    setLogMessage(`Logged result for ${logTarget.name}.`)
    setLogTarget(null)
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

        <div role="radiogroup" aria-label="Bet mode" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
          {MODES.map((m) => (
            <label key={m.value}>
              <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} /> {m.label}
            </label>
          ))}
        </div>
        {logMessage && <div style={{ marginTop: 8, color: '#8ae7bb' }}>{logMessage}</div>}

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
            {showStraights && (
              <div style={{ marginBottom: 30 }}>
                <h3 style={{ color: AMBER }}>Underdog value</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9em' }}>
                  Straights are chosen by edge (model probability minus implied probability), not by win rate. No probability floor applies.
                </p>
                {underdogRows.length === 0 ? (
                  <div style={{ color: '#94a3b8' }}>No value found: no leg has a positive edge at the offered price.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: '#94a3b8' }}>
                          <th>Selection</th><th>Odds</th><th>Model prob</th><th>Edge</th><th>Tier</th><th>Units</th><th>Type</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {underdogRows.map((row) => {
                          const edge = legEdge(row)
                          const side = classifyLeg(row)
                          const stake = recommendStakeForTicket({ tier: 'straight', legs: [row], combinedProbability: row.modelProbability }, bankroll)
                          return (
                            <tr key={row.id} style={{ borderTop: '1px solid rgba(148,163,184,0.18)' }}>
                              <td>{row.selection}</td>
                              <td style={{ fontFamily: 'ui-monospace, monospace' }}>{fmtOdds(row.americanOdds)}</td>
                              <td>{(row.modelProbability * 100).toFixed(1)}%</td>
                              <td><strong>{(edge * 100).toFixed(2)}%</strong>{isHighValue(row) && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: AMBER, color: '#0f172a', fontSize: '0.8em' }}>High value</span>}</td>
                              <td>{tierForLeg(row)}</td>
                              <td>{stake.units.toFixed(2)}</td>
                              <td style={{ color: side === 'underdog' ? AMBER : '#8ae7bb', fontWeight: 700 }}>{side === 'underdog' ? 'UNDERDOG' : 'FAVORITE'}</td>
                              <td><button onClick={() => openLog({ name: row.selection, legs: [row], side, combinedProbability: row.modelProbability })}>Log result</button></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {showStraights && mode !== 'underdogs' && straightPlays.length > 0 && (
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

            {showParlays && <h3>Parlay Tickets</h3>}
            <div style={{ display: showParlays ? 'grid' : 'none', gap: 20 }}>
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

                    <div style={{ fontSize: '0.85em', color: '#cbd5e1', marginBottom: 12 }}>Side mix: {sideMixText(ticket.sideMix)}</div>

                    {ticket.notes.length > 0 && (
                      <div style={{ fontSize: '0.85em', color: '#94a3b8', marginBottom: 12 }}>
                        {ticket.notes.map((note, index) => <div key={index}>• {note}</div>)}
                      </div>
                    )}

                    <button onClick={() => openLog({ name: ticket.name, legs: ticket.legs, side: 'neutral', combinedProbability: ticket.combinedProbability, id: ticket.id })}>Log result</button>

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

      {logTarget && (
        <div role="dialog" aria-modal="true" aria-label="Log result" style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.8)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, padding: 20, display: 'grid', gap: 10, minWidth: 280 }}>
            <strong>Log result: {logTarget.name}</strong>
            <label>Side{' '}
              <select value={logSide} onChange={(event) => setLogSide(event.target.value as Side)}>
                <option value="favorite">Favorite</option>
                <option value="underdog">Underdog</option>
                <option value="neutral">Neutral</option>
              </select>
            </label>
            <label>Stake $ <input type="number" min="0" value={logStake} onChange={(event) => setLogStake(Number(event.target.value))} /></label>
            <label><input type="checkbox" checked={logHit} onChange={(event) => setLogHit(event.target.checked)} /> Won</label>
            {logHit && <label>Total payout $ <input type="number" min="0" value={logPayout} onChange={(event) => setLogPayout(Number(event.target.value))} /></label>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitLog}>Save</button>
              <button onClick={() => setLogTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 30, padding: 16, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, fontSize: '0.9em' }}>
        <strong style={{ color: '#ff6b6b' }}>⚠️ DISCLAIMER:</strong> These are high-variance parlay tickets designed for small stakes only. Lottery tickets have astronomically low hit probabilities and are not investment vehicles. Parlay play is entertainment with a large house edge. Never wager more than you can afford to lose. Past performance does not guarantee future results.
      </div>
    </div>
  )
}
