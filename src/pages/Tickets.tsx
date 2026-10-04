import { useEffect, useState } from 'react'
import { generateDailyMenu, type Ticket } from '../engine/ticketBuilder'
import { recommendStakeForTicket, topStraightPlays, getDailyExposure, recordStakeExposure } from '../engine/staking'
import { fetchOddsAsLegs } from '../engine/oddsAdapter'
import type { LegWithEdge } from '../engine/edgeFilter'
import { getOddsSnapshots, recordClosing } from '../engine/oddsSnapshots'
import { computeRealCLV } from '../engine/oddsSnapshots'
import { getCalibration, resolvePrediction } from '../engine/calibration'
import { maxExposure, recommendStake, type StakeTier } from '../engine/kelly'
import { saveTicketResult } from '../engine/ledger'

type ResultModal = { leg: LegWithEdge; ticket: Ticket }

const stakeTier = (quality: Ticket['edgeQuality']): Exclude<StakeTier, 'lottery'> => {
  if (quality === 'strong') return 'Gold'
  if (quality === 'medium') return 'Diamond'
  if (quality === 'weak') return 'Silver'
  return 'Bronze'
}

function decimalOdds(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american)
}

function formatOdds(american: number): string {
  return `${american > 0 ? '+' : ''}${american}`
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [straightPlays, setStraightPlays] = useState<LegWithEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [bankroll, setBankroll] = useState(1000)
  const [modal, setModal] = useState<ResultModal>()
  const [closingOdds, setClosingOdds] = useState('')
  const [hit, setHit] = useState(true)
  const [calibration, setCalibration] = useState(getCalibration())

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const legs = await fetchOddsAsLegs()
        setTickets(generateDailyMenu(legs, { lotteryLegs: 25, minProbability: 0.55 }))
        setStraightPlays(topStraightPlays(legs, 5))
        setCalibration(getCalibration())
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
      odds: leg.bestPrice,
      probability: leg.modelProbability,
      edge: leg.edge,
      books: (leg.bookmarksUsed ?? []).join('; '),
    })))
    const headers = ['ticket', 'sport', 'selection', 'odds', 'probability', 'edge', 'books'] as const
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

  function openResult(ticket: Ticket, leg: LegWithEdge) {
    setModal({ ticket, leg })
    setClosingOdds(String(leg.bestPrice))
    setHit(true)
  }

  function logResult() {
    if (!modal) return
    const close = Number(closingOdds)
    if (!Number.isFinite(close) || close === 0) return
    const closing = recordClosing(modal.leg.id, close)
    resolvePrediction(modal.leg.id, hit)
    const snapshots = getOddsSnapshots(modal.leg.id)
    const open = snapshots.find((snapshot) => snapshot.book !== 'Closing')
    const clv = open ? computeRealCLV(open, closing) : undefined
    const tier = stakeTier(modal.ticket.edgeQuality)
    const stake = recommendStake(modal.leg, bankroll, tier, Math.max(0, maxExposure(bankroll) - getDailyExposure()))
    recordStakeExposure(stake.units * bankroll / 50)
    saveTicketResult(
      {
        id: modal.leg.id,
        name: `Straight: ${modal.leg.selection}`,
        legs: [modal.leg],
        combinedProbability: modal.leg.modelProbability,
        edgeQuality: modal.ticket.edgeQuality,
      },
      stake.units * bankroll / 50,
      hit,
      hit ? stake.units * bankroll / 50 * decimalOdds(modal.leg.bestPrice) : 0,
      clv,
    )
    setCalibration(getCalibration())
    setModal(undefined)
  }

  const allNoValue = tickets.every((ticket) => ticket.legs.length === 0) && straightPlays.length === 0
  const snapshotsFor = (leg: LegWithEdge) => {
    const snapshots = getOddsSnapshots(leg.id)
    const opening = snapshots.find((snapshot) => snapshot.book !== 'Closing')
    const closing = snapshots.find((snapshot) => snapshot.book === 'Closing')
    const clv = opening && closing ? computeRealCLV(opening, closing) : undefined
    return { opening, closing, clv }
  }

  return (
    <div className="container page-space">
      <section className="section-panel board-panel professional-panel">
        <div className="section-head split-head align-bottom">
          <div>
            <div className="eyebrow subtle">Market edge &amp; staking</div>
            <h2>Daily Ticket Menu</h2>
          </div>
          <label>
            Bankroll: $
            <input
              type="number"
              min="0"
              value={bankroll}
              onChange={(event) => setBankroll(Number(event.target.value))}
            />
          </label>
        </div>
        <div style={{ margin: '14px 0' }}>
          <button className="primary-btn compact" onClick={exportToCSV}>Export CSV</button>
          <button className="primary-btn compact" onClick={exportToJSON} style={{ marginLeft: 8 }}>Export JSON</button>
          <span style={{ marginLeft: 12, color: '#94a3b8' }}>
            Daily exposure remaining: ${Math.max(0, maxExposure(bankroll) - getDailyExposure()).toFixed(2)}
          </span>
        </div>

        {loading ? <div style={{ color: '#94a3b8' }}>Loading odds…</div> : (
          <>
            {allNoValue && (
              <div className="analytics-card" role="status">
                <h3>No value found</h3>
                <p>No available selection clears the positive-edge filter at the best listed price. No bets are being recommended.</p>
              </div>
            )}
            {straightPlays.length > 0 && (
              <div style={{ marginBottom: 30 }}>
                <h3>Positive-edge straight plays</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {straightPlays.map((play) => {
                    const tier = stakeTier(play.edge >= 0.05 ? 'strong' : play.edge >= 0.02 ? 'medium' : 'weak')
                    const stake = recommendStake(play, bankroll, tier, Math.max(0, maxExposure(bankroll) - getDailyExposure()))
                    const odds = snapshotsFor(play)
                    return (
                      <div key={play.id} className="analytics-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <strong>{play.selection}</strong>
                          <span>{(play.modelProbability * 100).toFixed(1)}% model probability</span>
                        </div>
                        <div style={{ color: '#94a3b8', marginTop: 6 }}>
                          {play.market} @ {formatOdds(play.bestPrice)} · Edge {(play.edge * 100).toFixed(2)}%
                        </div>
                        <div style={{ color: '#94a3b8', marginTop: 4 }}>Books used: {(play.bookmarksUsed ?? []).join(', ') || 'Unspecified'}</div>
                        <div style={{ marginTop: 8 }}>
                          Stake: {stake.units.toFixed(2)} units · ${((stake.units * bankroll) / 50).toFixed(2)} — {stake.reason}
                          {odds.clv !== undefined && <span> · CLV {odds.clv.toFixed(2)}%</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <h3>Lottery &amp; winnable tickets</h3>
            <div style={{ display: 'grid', gap: 20 }}>
              {tickets.map((ticket) => {
                const stake = recommendStakeForTicket(ticket, bankroll)
                return (
                  <div key={ticket.id} className="analytics-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <strong style={{ fontSize: '1.1em' }}>{ticket.name}</strong>
                        <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, fontSize: '0.8em' }}>{ticket.tier}</span>
                        <span aria-label={`Edge quality ${ticket.edgeQuality}`} style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #51cf66', borderRadius: 4, fontSize: '0.8em' }}>
                          {ticket.edgeQuality[0].toUpperCase() + ticket.edgeQuality.slice(1)}
                        </span>
                      </div>
                      <div>{ticket.legs.length}/{ticket.targetLegs} legs</div>
                    </div>
                    <div className="data-grid">
                      <div><label>Combined probability</label><strong>{(ticket.combinedProbability * 100).toExponential(2)}%</strong></div>
                      <div><label>Leg price product (estimate)</label><strong>{ticket.payoutDecimal.toFixed(2)}x</strong></div>
                      <div><label>Recommended stake</label><strong>${stake.dollarStake.toFixed(2)} ({stake.units.toFixed(2)} units)</strong></div>
                    </div>
                    {ticket.notes.map((note, index) => <p key={index} style={{ color: '#94a3b8' }}>{note}</p>)}
                    {ticket.legs.length > 0 && (
                      <details>
                        <summary style={{ cursor: 'pointer' }}>View {ticket.legs.length} legs</summary>
                        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                          {ticket.legs.map((leg) => {
                            const odds = snapshotsFor(leg)
                            return (
                              <div key={leg.id} style={{ padding: 10, background: 'rgba(15,23,42,0.6)', borderRadius: 6 }}>
                                <strong>{leg.selection}</strong> ({leg.sport})
                                <div style={{ color: '#94a3b8' }}>{leg.market} @ {formatOdds(leg.bestPrice)}</div>
                                <div>Model {(leg.modelProbability * 100).toFixed(2)}% · Edge {(leg.edge * 100).toFixed(2)}%</div>
                                <div style={{ color: '#94a3b8' }}>Books used: {(leg.bookmarksUsed ?? []).join(', ') || 'Unspecified'}</div>
                                {odds.clv !== undefined && <div>CLV (taken vs close): {odds.clv.toFixed(2)}%</div>}
                                <button type="button" className="primary-btn compact" onClick={() => openResult(ticket, leg)}>Log result</button>
                              </div>
                            )
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="analytics-card wide-card" style={{ marginTop: 24 }}>
              <h3>Calibration</h3>
              <p>Brier score: {calibration.brierScore.toFixed(4)} · Calibration error: {calibration.calibrationError.toFixed(4)} · Resolved picks: {calibration.buckets.reduce((sum, bucket) => sum + bucket.count, 0)}</p>
              <svg viewBox="0 0 100 100" role="img" aria-label="Reliability diagram: predicted probability versus actual win rate" style={{ width: 'min(100%, 340px)', background: 'rgba(2,6,23,0.45)' }}>
                <line x1="10" y1="90" x2="90" y2="10" stroke="#64748b" strokeDasharray="3 2" />
                {calibration.buckets.map((bucket) => (
                  <circle key={bucket.predicted} cx={10 + bucket.predicted * 80} cy={90 - bucket.actualRate * 80} r="2.5" fill="#34d399">
                    <title>{`Predicted ${(bucket.predicted * 100).toFixed(0)}%, actual ${(bucket.actualRate * 100).toFixed(0)}%, n=${bucket.count}`}</title>
                  </circle>
                ))}
              </svg>
            </div>
          </>
        )}
        <div style={{ marginTop: 24, padding: 16, border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, color: '#cbd5e1' }}>
          Sharps win on straights with real edges; 25-leg tickets are entertainment. Market consensus is not an independent prediction model, and a displayed edge is not a guarantee of profit.
        </div>
      </section>

      {modal && (
        <div role="presentation" onClick={() => setModal(undefined)} style={{ position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', background: 'rgba(2,6,23,0.85)', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="result-title" onClick={(event) => event.stopPropagation()} className="analytics-card" style={{ width: 'min(100%, 440px)' }}>
            <h3 id="result-title">Log result: {modal.leg.selection}</h3>
            <label>Closing American odds
              <input type="number" value={closingOdds} onChange={(event) => setClosingOdds(event.target.value)} />
            </label>
            <fieldset>
              <legend>Pick outcome</legend>
              <label><input type="radio" checked={hit} onChange={() => setHit(true)} /> Hit</label>
              <label style={{ marginLeft: 12 }}><input type="radio" checked={!hit} onChange={() => setHit(false)} /> Miss</label>
            </fieldset>
            <button type="button" className="primary-btn compact" onClick={logResult}>Save result</button>
            <button type="button" onClick={() => setModal(undefined)} style={{ marginLeft: 8 }}>Cancel</button>
          </section>
        </div>
      )}
    </div>
  )
}
