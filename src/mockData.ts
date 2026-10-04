// src/mockData.ts
export type Pick = {
  id?: string
  title: string
  sport?: string
  market?: string
  side?: string
  odds?: number
  fair: number
  confidence?: 'High' | 'Medium' | 'Low'
  units?: number
  notes?: string[]
}

export type Parlay = {
  id: string
  label: string
  legs: Pick[]
  probability: number
  payoutMultiplier: number
  expectedValue?: number
}

export type SimulationResult = {
  trials: number
  wins: number
  losses: number
  totalStake: number
  totalReturn: number
  roi: number
  avgProfitPerTrial: number
  summary: string
}

type DashboardPickGroup = {
  id: string
  label: string
  items: Pick[]
}

function probabilityToPayoutMultiplier(p: number, vig = 0.95) {
  if (p <= 0) return 0
  const decimalOdds = 1 / p
  return Math.max(1, decimalOdds * vig)
}

function product(nums: number[]) {
  return nums.reduce((acc, n) => acc * n, 1)
}

export function generateLocalParlays(events: Pick[] = [], opts: { maxLegs?: number; topN?: number } = {}): Parlay[] {
  const maxLegs = Math.max(1, Math.min(3, opts.maxLegs ?? 2))
  const topN = Math.max(5, opts.topN ?? 20)

  const picks = (events ?? [])
    .slice()
    .sort((a, b) => (b.fair ?? 0) - (a.fair ?? 0))
    .slice(0, topN)

  const parlays: Parlay[] = []

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
      expectedValue: payout * prob - 1,
    })
  }

  if (maxLegs >= 2) {
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const legs = [picks[i], picks[j]]
        const prob = Math.max(
          0.000001,
          product(legs.map((l) => Math.min(0.9999, Math.max(0.0001, l.fair ?? 0))))
        )
        const payout = probabilityToPayoutMultiplier(prob)
        parlays.push({
          id: `parlay-2-${i}-${j}`,
          label: `${legs[0].title} + ${legs[1].title}`,
          legs,
          probability: prob,
          payoutMultiplier: payout,
          expectedValue: payout * prob - 1,
        })
      }
    }
  }

  if (maxLegs >= 3) {
    const limit = Math.min(8, picks.length)
    for (let i = 0; i < limit; i++) {
      for (let j = i + 1; j < limit; j++) {
        for (let k = j + 1; k < limit; k++) {
          const legs = [picks[i], picks[j], picks[k]]
          const prob = Math.max(
            0.000001,
            product(legs.map((l) => Math.min(0.9999, Math.max(0.0001, l.fair ?? 0))))
          )
          const payout = probabilityToPayoutMultiplier(prob)
          parlays.push({
            id: `parlay-3-${i}-${j}-${k}`,
            label: `${legs[0].title} + ${legs[1].title} + ${legs[2].title}`,
            legs,
            probability: prob,
            payoutMultiplier: payout,
            expectedValue: payout * prob - 1,
          })
        }
      }
    }
  }

  return parlays.sort((a, b) => b.probability - a.probability)
}

export function runLocalSimulation(items: (Pick | Parlay)[], options: { trials?: number; stakePerBet?: number } = {}): SimulationResult {
  const trials = options.trials ?? 5000
  const stakePerBet = options.stakePerBet ?? 1

  let wins = 0
  let losses = 0
  let totalStake = 0
  let totalReturn = 0

  function itemProbAndMultiplier(it: Pick | Parlay) {
    if ('legs' in it) {
      const p = Math.min(0.999999, Math.max(0, it.probability ?? product(it.legs.map((l) => l.fair ?? 0))))
      const mult = it.payoutMultiplier ?? probabilityToPayoutMultiplier(p)
      return { p, mult }
    }

    const p = Math.min(0.999999, Math.max(0, it.fair ?? 0))
    const mult = probabilityToPayoutMultiplier(p)
    return { p, mult }
  }

  for (let t = 0; t < trials; t++) {
    for (const it of items) {
      const { p, mult } = itemProbAndMultiplier(it)
      totalStake += stakePerBet
      const roll = Math.random()
      if (roll < p) {
        totalReturn += stakePerBet * mult
        wins += 1
      } else {
        losses += 1
      }
    }
  }

  const roi = totalStake > 0 ? (totalReturn - totalStake) / totalStake : 0
  const avgProfitPerTrial = (totalReturn - totalStake) / trials

  return {
    trials,
    wins,
    losses,
    totalStake,
    totalReturn,
    roi,
    avgProfitPerTrial,
    summary: `Simulated ${trials} trials, ${items.length} items per trial. Wins: ${wins}, Losses: ${losses}, ROI: ${(roi * 100).toFixed(2)}%.`,
  }
}

// Common sample picks
export const samplePicks: Pick[] = [
  {
    id: 'p1',
    title: 'Knicks vs Bucks',
    sport: 'basketball_nba',
    market: 'Moneyline',
    side: 'Knicks',
    fair: 0.61,
    confidence: 'High',
    units: 1,
  },
  {
    id: 'p2',
    title: 'Celtics vs Heat',
    sport: 'basketball_nba',
    market: 'Spread',
    side: 'Heat +3.5',
    fair: 0.57,
    confidence: 'Medium',
    units: 1,
  },
  {
    id: 'p3',
    title: 'Mets vs Braves',
    sport: 'baseball_mlb',
    market: 'Moneyline',
    side: 'Mets',
    fair: 0.54,
    confidence: 'Low',
    units: 1,
  },
]

// Compatibility exports for the pages that import mocked dashboard data.
// If your project imports these names, they now exist.
export function buildDashboard() {
  const groups: DashboardPickGroup[] = [
    {
      id: 'best-plays',
      label: 'Best plays',
      items: samplePicks,
    },
  ]

  return {
    groups,
    title: 'Dashboard',
    generatedAt: new Date().toISOString(),
  }
}

export function getPickGroups(): DashboardPickGroup[] {
  return [
    {
      id: 'best-plays',
      label: 'Best plays',
      items: samplePicks,
    },
  ]
}

export const pickGroups = getPickGroups()

export function pickGrid() {
  return getPickGroups()
}

export function buildDashboardData() {
  return buildDashboard()
}

// Also export a default object for compatibility
export default {
  samplePicks,
  generateLocalParlays,
  runLocalSimulation,
  buildDashboard,
  getPickGroups,
  pickGroups,
  pickGrid,
  buildDashboardData,
}
