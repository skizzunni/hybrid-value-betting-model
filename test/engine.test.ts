import { describe, expect, it } from 'vitest'
import {
  buildTicketFromSpec,
  buildWinnableTicket,
  combinedProbabilityOfLegs,
  generateDailyMenu,
  type Leg,
} from '../src/engine/ticketBuilder'
import { recommendStakeForTicket, tierForLeg } from '../src/engine/staking'
import { computeCLV, noVigProbability } from '../src/engine/clv'
import { americanToImpliedProb, consensusNoVig, deVigAdditive, deVigPower, deVigShin } from '../src/engine/devig'
import { bestOdds, computeEdge, filterByEdge } from '../src/engine/edgeFilter'
import { adjustedCombinedProb } from '../src/engine/correlation'
import { computeRealCLV, type OddsSnapshot } from '../src/engine/oddsSnapshots'
import { calibrationCurve, computeBrierScore } from '../src/engine/calibration'
import { kellyFraction, maxExposure, recommendStake } from '../src/engine/kelly'

const spec = { id: 'test', name: 'Test', strategy: 'highestProbability' as const }

function legs(count: number, probability = 0.7): Leg[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `leg-${index}`,
    sport: 'basketball_nba',
    gameId: `game-${index}`,
    teams: [`home-${index}`, `away-${index}`],
    market: 'moneyline',
    selection: `team-${index}`,
    americanOdds: 100,
    modelProbability: probability,
  }))
}

describe('daily ticket engine', () => {
  it('multiplies leg probabilities for the combined probability', () => {
    expect(combinedProbabilityOfLegs(legs(2, 0.6))).toBeCloseTo(0.36)
  })

  it('enforces probability, game, and team constraints', () => {
    const candidates: Leg[] = [
      { ...legs(1)[0], id: 'first', gameId: 'same-game', teams: ['shared', 'one'], modelProbability: 0.8 },
      { ...legs(1)[0], id: 'same-game-conflict', gameId: 'same-game', teams: ['two', 'three'], modelProbability: 0.7 },
      { ...legs(1)[0], id: 'shared-team', gameId: 'other-game', teams: ['shared', 'four'], modelProbability: 0.69 },
      { ...legs(1)[0], id: 'below-floor', gameId: 'low-game', teams: ['five', 'six'], modelProbability: 0.54 },
      { ...legs(1)[0], id: 'eligible', gameId: 'eligible-game', teams: ['seven', 'eight'], modelProbability: 0.65 },
    ]
    const ticket = buildTicketFromSpec(candidates, { ...spec, targetLegs: 5 }, {
      minProbability: 0.55,
      maxPerGame: 1,
      maxPerTeam: 1,
    })
    expect(ticket.legs.map((leg) => leg.id)).toEqual(['first', 'eligible'])
  })

  it('rejects opposing sides and totals in one game', () => {
    const candidates: Leg[] = [
      { ...legs(1)[0], id: 'home', gameId: 'same', market: 'moneyline', selection: 'Home', modelProbability: 0.8 },
      { ...legs(1)[0], id: 'away', gameId: 'same', market: 'moneyline', selection: 'Away', modelProbability: 0.69 },
      { ...legs(1)[0], id: 'over', gameId: 'total-game', market: 'total', selection: 'Over 200' },
      { ...legs(1)[0], id: 'under', gameId: 'total-game', market: 'total', selection: 'Under 200', modelProbability: 0.68 },
    ]
    const ticket = buildTicketFromSpec(candidates, { ...spec, targetLegs: 4 })
    expect(ticket.legs.map((leg) => leg.id)).toEqual(['home', 'over'])
  })

  it('finds a winnable leg count in the target probability band', () => {
    const ticket = buildWinnableTicket(legs(12), spec)
    expect(ticket.legs).toHaveLength(5)
    expect(ticket.combinedProbability).toBeGreaterThanOrEqual(0.05)
    expect(ticket.combinedProbability).toBeLessThanOrEqual(0.18)
  })

  it('returns lottery and winnable tiers per configured strategy', () => {
    const menu = generateDailyMenu(legs(30))
    expect(menu.filter((ticket) => ticket.tier === 'lottery')).toHaveLength(4)
    expect(menu.filter((ticket) => ticket.tier === 'winnable')).toHaveLength(4)
    expect(menu.find((ticket) => ticket.tier === 'lottery')?.legs).toHaveLength(25)
  })
})

describe('staking', () => {
  it('assigns confidence tiers and throttles stake after losses', () => {
    expect(tierForLeg({ modelProbability: 0.65 })).toBe('Gold')
    expect(tierForLeg({ modelProbability: 0.6 })).toBe('Diamond')
    expect(tierForLeg({ modelProbability: 0.55 })).toBe('Silver')
    const ticket = {
      tier: 'winnable',
      legs: [{ modelProbability: 0.65, americanOdds: 100 }],
      combinedProbability: 0.65,
      payoutDecimal: 2,
    }
    const base = recommendStakeForTicket(ticket, 1000)
    const throttled = recommendStakeForTicket(ticket, 1000, { lastN: 2 })
    expect(base.units).toBe(2.5)
    expect(throttled.units).toBeCloseTo(2.4)
  })

  it('caps lottery stakes at a quarter unit and warns about variance', () => {
    const stake = recommendStakeForTicket({
      tier: 'lottery',
      legs: [{ modelProbability: 0.6, americanOdds: 100 }],
      combinedProbability: 0.6,
      payoutDecimal: 2,
    }, 1000)
    expect(stake.units).toBe(0.25)
    expect(stake.dollarStake).toBe(5)
    expect(stake.warning).toMatch(/high variance/i)
    const noValue = recommendStakeForTicket({
      tier: 'lottery',
      legs: [{ modelProbability: 0.4, americanOdds: 100 }],
      combinedProbability: 0.4,
      payoutDecimal: 2,
    }, 1000)
    expect(noValue.units).toBe(0)
  })
})

describe('closing line value', () => {
  it('compares taken odds to closing implied probability', () => {
    expect(noVigProbability(-110)).toBeCloseTo(110 / 210)
    expect(computeCLV(110, -110)).toBeCloseTo((100 / 210 - 110 / 210) * 100)
    expect(computeCLV(110, [-110, -110])).toBeCloseTo(computeCLV(110, -110))
  })

  it('uses decimal prices for pick-versus-close CLV', () => {
    const taken: OddsSnapshot = { legId: 'a', timestamp: 1, americanOdds: 110, book: 'Pinnacle' }
    const betterClose: OddsSnapshot = { ...taken, timestamp: 2, americanOdds: -110, book: 'Closing' }
    const worseClose: OddsSnapshot = { ...betterClose, americanOdds: 150 }
    expect(computeRealCLV(taken, betterClose)).toBeGreaterThan(0)
    expect(computeRealCLV(betterClose, worseClose)).toBeLessThan(0)
  })
})

describe('de-vig and edge math', () => {
  it('normalizes Power, Shin, and Additive probabilities', () => {
    const outcomes = [{ odds: -110 }, { odds: -110 }]
    for (const probabilities of [deVigPower(outcomes), deVigShin(outcomes), deVigAdditive(outcomes)]) {
      expect(probabilities).toHaveLength(2)
      expect(probabilities.every((probability) => probability >= 0 && probability <= 1)).toBe(true)
      expect(probabilities.reduce((sum, probability) => sum + probability, 0)).toBeCloseTo(1)
    }
    expect(americanToImpliedProb(-110)).toBeCloseTo(110 / 210)
  })

  it('weights Pinnacle consensus and line-shops the best price', () => {
    const consensus = consensusNoVig([
      { key: 'pinnacle', market: { outcomes: [{ odds: 100 }, { odds: -200 }] } },
      { key: 'draftkings', market: { outcomes: [{ odds: -110 }, { odds: -110 }] } },
    ], 'power')
    expect(consensus[0]).toBeCloseTo((3 * (0.5 / (0.5 + 2 / 3)) + 0.5) / 4)
    expect(bestOdds({ ...legs(1)[0], selection: 'Home' }, [
      { outcomes: [{ name: 'Home', odds: -110 }] },
      { outcomes: [{ name: 'Home', odds: 100 }] },
    ])).toBe(100)
  })

  it('keeps only legs with a positive model edge at the available price', () => {
    const candidates: Leg[] = [
      { ...legs(1)[0], id: 'value', modelProbability: 0.6, americanOdds: 100 },
      { ...legs(1)[0], id: 'no-value', modelProbability: 0.45, americanOdds: 100 },
    ]
    expect(computeEdge(0.6, 0.5)).toBeCloseTo(0.1)
    expect(filterByEdge(candidates).map((leg) => leg.id)).toEqual(['value'])
  })
})

describe('correlation adjustments', () => {
  it('reduces combined probability for correlated same-game legs', () => {
    const candidates = filterByEdge([
      { ...legs(1)[0], id: 'a', gameId: 'same', selection: 'A', modelProbability: 0.7, americanOdds: 100 },
      { ...legs(1)[0], id: 'b', gameId: 'same', selection: 'B', modelProbability: 0.6, americanOdds: 100 },
    ])
    const product = 0.7 * 0.6
    const adjusted = adjustedCombinedProb(candidates, { same: { A: 0.5, B: 0.5 } })
    expect(adjusted).toBeLessThan(product)
  })
})

describe('Kelly and calibration', () => {
  it('sizes fractional Kelly stakes and respects the daily exposure cap', () => {
    expect(kellyFraction(0.05, 100)).toBeCloseTo(0.025)
    expect(kellyFraction(-0.01, 100)).toBe(0)
    expect(maxExposure(1000)).toBe(50)
    const leg = filterByEdge([
      { ...legs(1)[0], modelProbability: 0.6, americanOdds: 100 },
    ])[0]
    const stake = recommendStake(leg, 1000, 'Gold', 20)
    expect(stake.units).toBeLessThanOrEqual(1)
    expect(stake.capped).toBe(true)
  })

  it('computes Brier score and calibration buckets for resolved predictions', () => {
    const allHits = Array.from({ length: 4 }, () => ({ predicted: 0.5, actual: true }))
    expect(computeBrierScore(allHits)).toBe(0.25)
    const predictions = Array.from({ length: 10 }, (_, index) => ({
      predicted: 0.7,
      actual: index < 7,
    }))
    const [bucket] = calibrationCurve(predictions)
    expect(bucket.count).toBe(10)
    expect(bucket.predicted).toBeCloseTo(0.7)
    expect(bucket.actualRate).toBeCloseTo(0.7)
  })
})
