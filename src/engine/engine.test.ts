import { describe, expect, it, vi } from 'vitest'
import { americanToDecimal, buildTicketFromSpec, combinedProbabilityOfLegs, generateDailyMenu, type Leg } from './ticketBuilder'
import { recommendStakeForTicket, tierForLeg } from './staking'
import { compareClosingValue, noVigProbability } from './clv'
import { fetchOddsAsLegs } from './oddsAdapter'

function mk(n: number): Leg[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `l${i}`,
    sport: 'nba',
    gameId: `g${Math.floor(i / 2)}`,
    teams: [`H${i}`, `A${i}`],
    market: i % 2 ? 'total' : 'moneyline',
    selection: i % 2 ? 'Over 200' : `H${i}`,
    americanOdds: -110,
    modelProbability: 0.8 - (i % 10) * 0.01,
  }))
}

describe('ticketBuilder', () => {
  it('converts odds', () => {
    expect(americanToDecimal(100)).toBe(2)
    expect(americanToDecimal(-200)).toBeCloseTo(1.5)
  })
  it('honours probability floor and rejects contradictions', () => {
    const legs: Leg[] = [
      { ...mk(1)[0], id: 'a', gameId: 'g', selection: 'X' },
      { ...mk(1)[0], id: 'b', gameId: 'g', selection: 'Y', modelProbability: 0.7 },
      { ...mk(1)[0], id: 'c', gameId: 'h', modelProbability: 0.4 },
    ]
    const t = buildTicketFromSpec(legs, { id: 's', name: 's', strategy: 'highestProbability' })
    expect(t.legs.map((l) => l.id)).toEqual(['a'])
    expect(t.notes.join(' ')).toMatch(/Only 1 of 25/)
  })
  it('builds honest lottery and winnable tickets', () => {
    const menu = generateDailyMenu(mk(60))
    expect(menu).toHaveLength(8)
    for (const t of menu) {
      expect(t.combinedProbability).toBeCloseTo(combinedProbabilityOfLegs(t.legs))
      if (t.tier === 'lottery') expect(t.legs.length).toBeLessThanOrEqual(25)
    }
    const w = menu.find((t) => t.tier === 'winnable')!
    expect(w.combinedProbability).toBeGreaterThanOrEqual(0.05)
    expect(w.combinedProbability).toBeLessThanOrEqual(0.18)
  })
  it('labels winnable fallback when band is unreachable', () => {
    const w = generateDailyMenu(mk(2)).find((t) => t.tier === 'winnable')!
    expect(w.notes.join(' ')).toMatch(/best available/)
  })
})

describe('staking', () => {
  it('tiers legs and throttles after losses', () => {
    expect(tierForLeg({ ...mk(1)[0], modelProbability: 0.9 })).toBe('Gold')
    const t = buildTicketFromSpec(mk(60), { id: 's', name: 's', strategy: 'highestProbability', targetLegs: 3 })
    const base = recommendStakeForTicket(t, 1000)
    const thr = recommendStakeForTicket(t, 1000, Array(5).fill({ hit: false }))
    expect(base.units).toBeGreaterThan(0)
    expect(thr.units).toBeCloseTo(base.units / 2, 1)
  })
})

describe('clv', () => {
  it('computes CLV', () => {
    expect(compareClosingValue(110, -110)).toBeGreaterThan(0)
    expect(noVigProbability(-110, -110)).toBeCloseTo(0.5)
    expect(compareClosingValue(100, [-110], [-110])).toBeCloseTo(0)
  })
})

describe('oddsAdapter', () => {
  it('falls back to sample picks without API key', async () => {
    const legs = await fetchOddsAsLegs()
    expect(legs.length).toBeGreaterThan(0)
    expect(legs[0].teams.length).toBeGreaterThan(0)
  })
})

describe('render.yaml', () => {
  it('contains the SPA rewrite and static publish path', async () => {
    const { readFileSync } = await import('node:fs')
    const yaml = readFileSync('render.yaml', 'utf8')
    expect(yaml).toMatch(/type:\s*rewrite/)
    expect(yaml).toMatch(/source:\s*\/\*/)
    expect(yaml).toMatch(/destination:\s*\/index\.html/)
    expect(yaml).toMatch(/staticPublishPath:\s*dist/)
  })
})

describe('oddsAdapter robustness', () => {
  it('survives a malformed API response and missing AbortSignal.timeout', async () => {
    const orig = AbortSignal.timeout
    const origFetch = globalThis.fetch
    // @ts-expect-error simulate old browser
    AbortSignal.timeout = undefined
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ not: 'an array' }) })) as unknown as typeof fetch
    vi.stubEnv('VITE_ODDS_API_KEY', 'x')
    try {
      const legs = await fetchOddsAsLegs()
      expect(legs.length).toBeGreaterThan(0)
    } finally {
      AbortSignal.timeout = orig
      globalThis.fetch = origFetch
      vi.unstubAllEnvs()
    }
  })
})
