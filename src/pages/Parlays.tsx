import React, { useEffect, useState } from 'react'
import { generateLocalParlays } from '../mockData'

export default function ParlaysPage() {
  const [parlays, setParlays] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const results = generateLocalParlays(4, 10, 0.6, -0.01)
    const normalized = results.map((parlay: any) => ({
      ...parlay,
      estProb: parlay.probability,
      estPayout: parlay.payoutMultiplier,
      totalEV: parlay.expectedValue ?? 0,
      legs: (parlay.legs ?? []).map((leg: any) => ({
        ...leg,
        name: leg.title ?? leg.side ?? 'Pick',
      })),
    }))
    setParlays(normalized)
    setLoading(false)
  }, [])

  return (
    <div className="container" style={{ padding: '32px 0 80px' }}>
      <div className="section-panel board-panel">
        <div className="section-head split-head">
          <div className="section-head inline-head">
            <h2>Parlay generator</h2>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          {loading ? (
            <div style={{ color: '#94a3b8' }}>Loading candidate parlays…</div>
          ) : parlays.length === 0 ? (
            <div style={{ color: '#94a3b8' }}>No valid 3–6 leg parlays met the threshold.</div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {parlays.map((parlay, index) => (
                <div
                  key={`${parlay.estProb}-${index}`}
                  style={{
                    border: '1px solid rgba(148,163,184,0.18)',
                    borderRadius: 18,
                    background: 'rgba(2,6,23,0.7)',
                    padding: 18,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <strong style={{ fontSize: 18 }}>Parlay #{index + 1}</strong>
                    <div style={{ color: '#8ae7bb', fontWeight: 700 }}>
                      Est. prob {parlay.estProb}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(parlay.legs ?? []).map((leg: any, legIndex: number) => (
                      <span
                        key={`${leg.name}-${legIndex}`}
                        style={{
                          display: 'inline-flex',
                          background: 'rgba(15,23,42,0.8)',
                          border: '1px solid rgba(148,163,184,0.18)',
                          borderRadius: 999,
                          padding: '6px 10px',
                          color: '#e2e8f0',
                        }}
                      >
                        {leg.name}
                      </span>
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      color: '#94a3b8',
                      display: 'flex',
                      gap: 20,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>Est. payout: {parlay.estPayout}</span>
                    <span>Legs: {parlay.legs.length}</span>
                    <span>EV: {parlay.totalEV}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
