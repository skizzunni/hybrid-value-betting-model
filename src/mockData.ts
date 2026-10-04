// src/mockData.ts
export type PickItem = {
  id?: string
  title: string
  sport?: string
  market?: string
  side?: string
  odds?: number
  fair?: number
  confidence?: 'High' | 'Medium' | 'Low'
  units?: number
  edge?: number
  note?: string
  notes?: string[]
  value?: number
  risk?: number
  status?: string
  label?: string
}

export type DashboardPickGroup = {
  id: string
  label: string
  note?: string
  items: PickItem[]
}

export type Parlay = {
  id: string
  label: string
  legs: PickItem[]
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

function product(nums: number[]) {
  return nums.reduce((acc, n) => acc * n, 1)
}

function probabilityToPayoutMultiplier(p: number, vig = 0.95) {
  if (p <= 0) return 0
  const decimalOdds = 1 / p
  return Math.max(1, decimalOdds * vig)
}

function normalizePick(item: any): PickItem {
  const fair = typeof item?.fair === 'number' ? item.fair : 0.5
  return {
    id: item?.id ?? item?.title ?? Math.random().toString(36).slice(2),
    title: item?.title ?? 'Untitled pick',
    sport: item?.sport ?? 'basketball_nba',
    market: item?.market ?? 'Moneyline',
    side: item?.side ?? 'Pick',
    odds: item?.odds ?? 100,
    fair,
    confidence: item?.confidence ?? 'Medium',
    units: typeof item?.units === 'number' ? item.units : 1,
    edge: typeof item?.edge === 'number' ? item.edge : (fair - 0.5) * 100,
    note: item?.note ?? item?.notes?.[0] ?? 'Generated pick',
    notes: Array.isArray(item?.notes) ? item.notes : [item?.note ?? 'Generated pick'],
    value: typeof item?.value === 'number' ? item.value : fair,
    risk: typeof item?.risk === 'number' ? item.risk : 1,
    status: item?.status ?? 'active',
    label: item?.label ?? item?.title ?? 'Pick',
  }
}

export function generateLocalParlays(
  eventsOrInput?: any[],
  arg2?: any,
  arg3?: any,
  arg4?: any
): Parlay[] {
  const events = Array.isArray(eventsOrInput) ? eventsOrInput : []
  const maxLegs = typeof arg2 === 'number' ? arg2 : 2
  const topN = typeof arg3 === 'number' ? arg3 : 20

  const picks = events
    .map(normalizePick)
    .sort((a, b) => (b.fair ?? 0) - (a.fair ?? 0))
    .slice(0, topN)

  const parlays: Parlay[] = []

  // single-leg
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

  const mLegs = Math.max(1, Math.min(3, maxLegs))
  if (mLegs >= 2) {
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

  if (mLegs >= 3) {
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

  return parlays.sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
}

export function runLocalSimulation(
  itemsOrInput?: any[] | PickItem[] | Parlay[],
  arg2?: number | { trials?: number; stakePerBet?: number },
  arg3?: number
): SimulationResult {
  const items = Array.isArray(itemsOrInput) ? itemsOrInput : []
  const trials =
    typeof arg2 === 'number'
      ? arg2
      : typeof arg2 === 'object' && arg2
        ? arg2.trials ?? 5000
        : 5000

  const stakePerBet =
    typeof arg3 === 'number'
      ? arg3
      : typeof arg2 === 'object' && arg2
        ? arg2.stakePerBet ?? 1
        : 1

  let wins = 0
  let losses = 0
  let totalStake = 0
  let totalReturn = 0

  function itemProbAndMultiplier(it: any) {
    if (it && Array.isArray(it.legs)) {
      const p = Math.min(0.999999, Math.max(0, it.probability ?? product(it.legs.map((l: any) => l.fair ?? 0))))
      const mult = it.payoutMultiplier ?? probabilityToPayoutMultiplier(p)
      return { p, mult }
    }

    const p = Math.min(0.999999, Math.max(0, it?.fair ?? 0))
    const mult = probabilityToPayoutMultiplier(p)
    return { p, mult }
  }

  for (let t = 0; t < trials; t++) {
    for (const it of items) {
      const normalized = normalizePick(it)
      const { p, mult } = itemProbAndMultiplier(normalized)
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
    summary: `Simulated ${trials} trials. Wins: ${wins}, Losses: ${losses}, ROI: ${(roi * 100).toFixed(2)}%.`,
  }
}

export const samplePicks: PickItem[] = [
  {
    id: 'p1',
    title: 'Knicks vs Bucks',
    sport: 'basketball_nba',
    market: 'Moneyline',
    side: 'Knicks',
    fair: 0.63,
    confidence: 'High',
    units: 1,
    note: 'Strong value on the favorite',
    notes: ['Strong value on the favorite'],
    edge: 13,
  },
  {
    id: 'p2',
    title: 'Celtics vs Heat',
    sport: 'basketball_nba',
    market: 'Spread',
    side: 'Heat +3.5',
    fair: 0.58,
    confidence: 'Medium',
    units: 1,
    note: 'Live matchup edge',
    notes: ['Live matchup edge'],
    edge: 8,
  },
  {
    id: 'p3',
    title: 'Mets vs Braves',
    sport: 'baseball_mlb',
    market: 'Moneyline',
    side: 'Mets',
    fair: 0.55,
    confidence: 'Low',
    units: 1,
    note: 'Value is softer but still live',
    notes: ['Value is softer but still live'],
    edge: 5,
  },
]

export function getPickGroups(): DashboardPickGroup[] {
  return [
    {
      id: 'best-plays',
      label: 'Best plays',
      note: 'Generated from current board',
      items: samplePicks,
    },
  ]
}

export const pickGroups = getPickGroups()

export function buildDashboard() {
  return {
    groups: getPickGroups(),
    title: 'Dashboard',
    generatedAt: new Date().toISOString(),
  }
}

export function buildDashboardData() {
  return buildDashboard()
}

export function pickGrid() {
  return getPickGroups()
}

export function buildCsv(rows: any[] = []) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const val = row[header]
          return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : String(val ?? '')
        })
        .join(',')
    ),
  ]
  return csvLines.join('\n')
}

export function buildDashboardCsv(rows: any[] = []) {
  return buildCsv(rows)
}

// Important: for isolatedModules, this must be `export type`, not `export { ... }`
export type { PickItem as Pick }

export default {
  samplePicks,
  generateLocalParlays,
  runLocalSimulation,
  getPickGroups,
  pickGroups,
  buildDashboard,
  buildDashboardData,
  pickGrid,
  buildCsv,
  buildDashboardCsv,
}
