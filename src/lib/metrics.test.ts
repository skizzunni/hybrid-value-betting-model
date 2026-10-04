import { describe, expect, it } from 'vitest'
import type { Leg } from '../engine/ticketBuilder'
import { correlationSummary, edgeVsNoVig, riskRating, ticketEV } from './metrics'

const leg = (id: string, gameId: string, odds: number, p: number, market = 'moneyline'): Leg => ({
  id, sport: 'nba', gameId, teams: ['A', 'B'], market, selection: id, americanOdds: odds, modelProbability: p,
})

describe('metrics', () => {
  it('computes EV', () => {
    expect(ticketEV({ combinedProbability: 0.5, payoutDecimal: 2.2 })).toBeCloseTo(0.1)
  })

  it('rates risk', () => {
    expect(riskRating(0.6)).toBe('Low')
    expect(riskRating(0.3)).toBe('Medium')
    expect(riskRating(0.1)).toBe('High')
    expect(riskRating(0.001)).toBe('Very High')
  })

  it('summarises correlation', () => {
    expect(correlationSummary([leg('a', 'g1', -110, 0.6), leg('b', 'g2', -110, 0.6)])).toBe('No same-game legs')
    expect(correlationSummary([leg('a', 'g1', -110, 0.6), leg('b', 'g1', -110, 0.6, 'total')])).toContain('1 game')
  })

  it('computes edge vs no-vig from sibling outcomes', () => {
    const a = leg('a', 'g1', -110, 0.55)
    const b = leg('b', 'g1', -110, 0.45)
    expect(edgeVsNoVig(a, [a, b])).toBeCloseTo(0.05)
    expect(edgeVsNoVig(a, [a])).toBeNull()
  })
})
