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
    expect(base.units).toBe(3)
    expect(throttled.units).toBeCloseTo(3 * 0.8 ** 2)
  })

  it('caps lottery stakes at a quarter unit and warns about variance', () => {
    const stake = recommendStakeForTicket({
      tier: 'lottery',
      legs: [{ modelProbability: 0.01, americanOdds: 100 }],
      combinedProbability: 0.01,
      payoutDecimal: 2,
    }, 1000)
    expect(stake.units).toBe(0.25)
    expect(stake.dollarStake).toBe(5)
    expect(stake.warning).toMatch(/high variance/i)
  })
})

describe('closing line value', () => {
  it('compares taken odds to closing implied probability', () => {
    expect(noVigProbability(-110)).toBeCloseTo(110 / 210)
    expect(computeCLV(110, -110)).toBeCloseTo((100 / 210 - 110 / 210) * 100)
    expect(computeCLV(110, [-110, -110])).toBeCloseTo(computeCLV(110, -110))
  })
})
