import { afterEach, describe, expect, it } from 'vitest'
import {
  buildTicketFromSpec,
  buildWinnableTicket,
  combinedProbabilityOfLegs,
  generateDailyMenu,
  type Leg,
} from '../src/engine/ticketBuilder'
import { recommendStakeForTicket, tierForLeg } from '../src/engine/staking'
import { computeCLV, noVigProbability } from '../src/engine/clv'
import { classifyLeg, filterByEdgeOnly, topUnderdogValue } from '../src/engine/underdog'
import { clearLedger, getLedgerSummary, getSidedResults, loadLedger, saveTicketResult, type LedgerEntry } from '../src/engine/ledger'

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

describe('underdog value and bet modes', () => {
  const leg = (id: string, americanOdds: number, modelProbability: number): Leg => ({
    ...legs(1)[0], id, gameId: `g-${id}`, teams: [`h-${id}`, `a-${id}`], americanOdds, modelProbability,
  })
  const pool = [
    leg('dog-big', 200, 0.36),
    leg('dog-small', 150, 0.42),
    leg('dog-neg', 150, 0.38),
    leg('fav', -150, 0.65),
    leg('fav-bad', -200, 0.6),
  ]

  it('filterByEdgeOnly ignores probability but needs positive edge', () => {
    const ids = filterByEdgeOnly(pool).map((l) => l.id)
    expect(ids).toEqual(['dog-big', 'dog-small', 'fav'])
  })

  it('topUnderdogValue returns underdogs sorted by edge', () => {
    const top = topUnderdogValue(pool)
    expect(top.map((l) => l.id)).toEqual(['dog-big', 'dog-small', 'dog-neg'])
    expect(topUnderdogValue(pool, 1)).toHaveLength(1)
  })

  it('classifyLeg tags favorites, underdogs and neutral prices', () => {
    expect(classifyLeg(leg('a', 150, 0.5))).toBe('underdog')
    expect(classifyLeg(leg('b', -200, 0.5))).toBe('favorite')
    expect(classifyLeg(leg('c', -110, 0.5))).toBe('neutral')
  })

  it('straights use edge only while parlays keep the 55% floor', () => {
    const straight = buildTicketFromSpec(pool, spec, { mode: 'straights' })
    expect(straight.betType).toBe('straight')
    expect(straight.legs.map((l) => l.id)).toEqual(['fav', 'dog-big', 'dog-small'])
    expect(straight.sideMix).toEqual({ favorite: 1, underdog: 2, neutral: 0 })
    const parlay = buildTicketFromSpec(pool, spec, { mode: 'parlays' })
    expect(parlay.betType).toBe('parlay')
    expect(parlay.legs.map((l) => l.id)).toEqual(['fav', 'fav-bad'])
  })

  it('mixed menu contains parlays plus a straight ticket; parlays-only does not', () => {
    expect(generateDailyMenu(pool).some((t) => t.betType === 'straight')).toBe(true)
    expect(generateDailyMenu(pool, { mode: 'parlays' }).some((t) => t.betType === 'straight')).toBe(false)
    expect(generateDailyMenu(pool, { mode: 'straights' }).every((t) => t.betType === 'straight')).toBe(true)
  })
})

describe('ledger by side', () => {
  const entry = (side: 'favorite' | 'underdog', stake: number, payout: number): LedgerEntry => ({
    id: `${side}-${payout}`, timestamp: 0, ticketName: 't', legCount: 1, stake, hit: payout > 0, payout, side,
  })
  const store = new Map<string, string>()
  const win = globalThis as unknown as { window?: unknown }
  win.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  afterEach(() => clearLedger())

  it('computes ROI per side', () => {
    const ledger = [entry('favorite', 10, 0), entry('favorite', 10, 15), entry('underdog', 10, 30), entry('underdog', 10, 0)]
    const sided = getSidedResults(ledger)
    expect(sided.favorite.roi).toBeCloseTo(-0.25)
    expect(sided.underdog.roi).toBeCloseTo(0.5)
    expect(sided.combined.count).toBe(4)
    const summary = getLedgerSummary(ledger)
    expect(summary.underdogStats).toEqual({ count: 2, hits: 1, roi: 0.5 })
    expect(summary.favoriteStats.hits).toBe(1)
  })

  it('saves and retrieves a result with side data', () => {
    saveTicketResult({ name: 'Dog', legs: [{}] }, 10, true, 25, undefined, {
      side: 'underdog', legs: [{ side: 'underdog', hit: true }], legsHit: 1,
    })
    const [saved] = loadLedger()
    expect(saved.side).toBe('underdog')
    expect(getLedgerSummary().partsWon).toBe(1)
    expect(getSidedResults().underdog.count).toBe(1)
  })
})
