// Lightweight mockData.ts
// Exports:
// - generateLocalParlays(events, opts)
// - runLocalSimulation(picksOrParlays, options)
// - example data: samplePicks
//
// This is intentionally conservative and self-contained so the site can build.
// Replace with your production implementations later.

export type Pick = {
  id?: string
  title: string
  sport?: string
  market?: string
  side?: string
  odds?: number // american odds or undefined
  fair: number // model-implied probability [0..1]
  confidence?: 'High' | 'Medium' | 'Low'
  units?: number
  notes?: string[]
}

export type Parlay = {
  id: string
  label: string
  legs: Pick[]
  probability: number // combined win prob [0..1]
  payoutMultiplier: number // how many units returned per 1 unit stake (including stake)
  expectedValue?: number
}

export type SimulationResult = {
  trials: number
  wins: number
  losses: number
  totalStake: number
  totalReturn: number
  roi: number // (totalReturn - totalStake) / totalStake
  avgProfitPerTrial: number
  summary: string
}

// Helper: safe numeric product
function product(nums: number[]) {
  return nums.reduce((s, n) => s * n, 1)
}

// Convert a win probability to a conservative payout multiplier.
// We use a small "vig" factor so payouts are a bit less generous than pure fair odds.
function probabilityToPayoutMultiplier(p: number, vig = 0.95) {
  if (p <= 0) return 0
  const decimalOdds = 1 / p
  // apply vig by shrinking decimal odds slightly
  return Math.max(1, decimalOdds * vig)
}

// Generate simple parlays from an array of picks.
// - events param is an array of Pick items (e.g., from src/generated/picks.json -> items).
// - opts:
//    maxLegs: max number of legs in a parlay (1..3 usually)
//    topN: only consider topN picks by fair probability (to limit combinations)
export function generateLocalParlays(events: Pick[] = [], opts: { maxLegs?: number; topN?: number } = {}): Parlay[] {
  const maxLegs = Math.max(1, Math.min(3, opts.maxLegs ?? 2))
  const topN = Math.max(5, opts.topN ?? 20)

  // sort picks by fair descending (most confident first)
  const picks = events.slice().sort((a, b) => (b.fair ?? 0) - (a.fair ?? 0)).slice(0, topN)

  const parlays: Parlay[] = []

  // single-leg parlays (pass-through, useful for UI)
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i]
    const prob = Math.min(0.9999, Math.max(0.0001, pick.fair ?? 0))
    const payout = probabilityToPayoutMultiplier(prob)
    parlays.push({
      id: `parlay-1-${i}`,
      label: `${pick.title} — ${pick.side ?? ''}`.trim(),
      legs: [pick],
      probability: prob,
      payoutMultiplier: payout,
      expectedValue: (payout * prob) - 1, // per 1 unit stake
    })
  }

  // multi-leg parlays (naive combinations of top picks)
  if (maxLegs >= 2) {
    // Create 2-leg combos
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const legs = [picks[i], picks[j]]
        const prob = Math.max(0.000001, product(legs.map((l) => Math.min(0.9999, Math.max(0.0001, l.fair ?? 0)))))
        const payout = probabilityToPayoutMultiplier(prob)
        parlays.push({
          id: `parlay-2-${i}-${j}`,
          label: `${legs[0].title} + ${legs[1].title}`,
          legs,
          probability: prob,
          payoutMultiplier: payout,
          expectedValue: (payout * prob) - 1,
        })
      }
    }
  }

  if (maxLegs >= 3) {
    // Create a small set of 3-leg combos from top picks (only first N to avoid explosion)
    const limit = Math.min(10, picks.length)
    for (let i = 0; i < limit; i++) {
      for (let j = i + 1; j < limit; j++) {
        for (let k = j + 1; k < limit; k++) {
          const legs = [picks[i], picks[j], picks[k]]
          const prob = Math.max(0.000001, product(legs.map((l) => Math.min(0.9999, Math.max(0.0001, l.fair ?? 0)))))
          const payout = probabilityToPayoutMultiplier(prob)
          parlays.push({
            id: `parlay-3-${i}-${j}-${k}`,
            label: `${legs[0].title} + ${legs[1].title} + ${legs[2].title}`,
            legs,
            probability: prob,
            payoutMultiplier: payout,
            expectedValue: (payout * prob) - 1,
          })
        }
      }
    }
  }

  // sort parlays by probability descending (most likely first)
  return parlays.sort((a, b) => b.probability - a.probability)
}

// Run a Monte Carlo simulation for picks or parlays.
// - If passed Picks (single-leg), it treats each item as an independent bet per trial.
// - If passed Parlays (with legs), it treats each parlay as a single bet whose win chance is parlay.probability.
// - options:
//    trials: number of iterations (default 5000)
//    stakePerBet: units staked per bet each trial (default 1)
//    return detailed object with ROI and summary
export function runLocalSimulation(items: (Pick | Parlay)[], options: { trials?: number; stakePerBet?: number } = {}): SimulationResult {
  const trials = options.trials ?? 5000
  const stakePerBet = options.stakePerBet ?? 1

  let wins = 0
  let losses = 0
  let totalStake = 0
  let totalReturn = 0

  // Helper to get win probability and payout multiplier for an item
  function itemProbAndMultiplier(it: Pick | Parlay): { p: number; mult: number } {
    if ('legs' in it) {
      // Parlay
      const p = Math.min(0.999999, Math.max(0, it.probability ?? product(it.legs.map((l) => l.fair ?? 0))))
      const mult = it.payoutMultiplier ?? probabilityToPayoutMultiplier(p)
      return { p, mult }
    } else {
      const p = Math.min(0.999999, Math.max(0, it.fair ?? 0))
      const mult = probabilityToPayoutMultiplier(p)
      return { p, mult }
    }
  }

  for (let t = 0; t < trials; t++) {
    // Simulate placing one bet on each item in items for this trial
    for (const it of items) {
      const { p, mult } = itemProbAndMultiplier(it)
      totalStake += stakePerBet
      const roll = Math.random()
      if (roll < p) {
        // win: receive payout * stake (we treat multiplier as including stake)
        const ret = stakePerBet * mult
        totalReturn += ret
        wins += 1
      } else {
        // lose: receive nothing, stake lost
        losses += 1
      }
    }
  }

  const roi = totalStake > 0 ? (totalReturn - totalStake) / totalStake : 0
  const avgProfitPerTrial = (totalReturn - totalStake) / trials

  const summary = `Simulated ${trials} trials, ${items.length} items per trial, total bets ${trials * items.length}. Wins: ${wins}, Losses: ${losses}, ROI: ${(roi * 100).toFixed(2)}%.`

  return {
    trials,
    wins,
    losses,
    totalStake,
    totalReturn,
    roi,
    avgProfitPerTrial,
    summary,
  }
}

// Example sample picks (used by UI if it expects some mock data)
export const samplePicks: Pick[] = [
  {
    id: 'p1',
    title: 'Team A vs Team B',
    sport: 'basketball_nba',
    market: 'Moneyline',
    side: 'Team A',
    fair: 0.65,
    confidence: 'High',
    units: 1,
  },
  {
    id: 'p2',
    title: 'Team C vs Team D',
    sport: 'basketball_nba',
    market: 'Total',
    side: 'Over 210.5',
    fair: 0.58,
    confidence: 'Medium',
    units: 1,
  },
  {
    id: 'p3',
    title: 'Team E vs Team F',
    sport: 'basketball_nba',
    market: 'Spread',
    side: 'Team F +4.5',
    fair: 0.53,
    confidence: 'Low',
    units: 1,
  },
]

// Default export optional (not required)
export default {
  generateLocalParlays,
  runLocalSimulation,
  samplePicks,
}
