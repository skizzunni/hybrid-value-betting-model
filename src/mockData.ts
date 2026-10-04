export type PickItem = {
  id: string
  title: string
  sport: string
  market: string
  side: string
  odds: number
  fair: number
  confidence: 'High' | 'Medium' | 'Low'
  units: number
  edge: number
  note: string
  notes: string[]
  value: number
  risk: number
  status: string
  label: string
}

export type Parlay = {
  id: string
  label: string
  legs: PickItem[]
  probability: number
  payoutMultiplier: number
  expectedValue?: number
}

export const samplePicks: PickItem[] = [...]
export const pickGroups = getPickGroups()
export function generateLocalParlays(...args: any[]): Parlay[] { ... }
export function runLocalSimulation(...args: any[]): SimulationResult { ... }

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

function product(nums: number[]): number {
  return nums.reduce((acc: number, n: number) => acc * n, 1)
}

function probabilityToPayoutMultiplier(p: number, vig = 0.95): number {
  if (p <= 0) return 0
  const decimalOdds = 1 / p
  return Math.max(1, decimalOdds * vig)
}

function normalizePick(item: Partial<PickItem> | null | undefined): PickItem {
  const fair = typeof item?.fair === 'number' ? item.fair : 0.5
  const notes = Array.isArray(item?.notes) ? item.notes : [item?.note ?? 'Generated pick']

  return {
    id: String(item?.id ?? item?.title ?? Math.random().toString(36).slice(2)),
    title: item?.title ?? 'Untitled pick',
    sport: item?.sport ?? 'basketball_nba',
    market: item?.market ?? 'Moneyline',
    side: item?.side ?? 'Pick',
    odds: typeof item?.odds === 'number' ? item.odds : 100,
    fair,
    confidence: item?.confidence ?? 'Medium',
    units: typeof item?.units === 'number' ? item.units : 1,
    edge: typeof item?.edge === 'number' ? item.edge : (fair - 0.5) * 100,
    note: item?.note ?? notes[0] ?? 'Generated pick',
    notes,
    value: typeof item?.value === 'number' ? item.value : fair,
    risk: typeof item?.risk === 'number' ? item.risk : 1,
    status: item?.status ?? 'active',
    label: item?.label ?? item?.title ?? 'Pick',
  }
}

export function generateLocalParlays(
  sourceOrCount: number | PickItem[] | { items?: PickItem[]; maxLegs?: number; topN?: number } | undefined,
  maybeMaxLegs?: number,
  maybeTopN?: number
): Parlay[] {
  if (typeof sourceOrCount === 'number') {
    const count = Math.max(1, sourceOrCount)
    const maxLegs = typeof maybeMaxLegs === 'number' ? maybeMaxLegs : 2
    const picks = samplePicks.slice(0, Math.min(samplePicks.length, count))
    const parlays: Parlay[] = []

    for (let i = 0; i < picks.length; i += 1) {
      const pick = picks[i]
      const prob = Math.min(0.9999, Math.max(0.0001, pick.fair))
      const payout = probabilityToPayoutMultiplier(prob)
      parlays.push({
        id: `parlay-1-${i}`,
        label: `${pick.title} — ${pick.side}`.trim(),
        legs: [pick],
        probability: prob,
        payoutMultiplier: payout,
        expectedValue: payout * prob - 1,
      })
    }

    if (maxLegs >= 2) {
      for (let i = 0; i < picks.length; i += 1) {
        for (let j = i + 1; j < picks.length; j += 1) {
          const legs = [picks[i], picks[j]]
          const prob = Math.max(
            0.000001,
            product(legs.map((leg: PickItem) => Math.min(0.9999, Math.max(0.0001, leg.fair))))
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

    return parlays.sort((a: Parlay, b: Parlay) => b.probability - a.probability)
  }

  const items: PickItem[] = Array.isArray(sourceOrCount)
    ? sourceOrCount
    : sourceOrCount && Array.isArray(sourceOrCount.items)
      ? sourceOrCount.items
      : []

  const maxLegs = typeof maybeMaxLegs === 'number' ? maybeMaxLegs : 2
  const topN = typeof maybeTopN === 'number' ? maybeTopN : 20

  const picks = items
    .map((item: PickItem) => normalizePick(item))
    .sort((a: PickItem, b: PickItem) => b.fair - a.fair)
    .slice(0, topN)

  const parlays: Parlay[] = []

  for (let i = 0; i < picks.length; i += 1) {
    const pick = picks[i]
    const prob = Math.min(0.9999, Math.max(0.0001, pick.fair))
    const payout = probabilityToPayoutMultiplier(prob)
    parlays.push({
      id: `parlay-1-${i}`,
      label: `${pick.title} — ${pick.side}`.trim(),
      legs: [pick],
      probability: prob,
      payoutMultiplier: payout,
      expectedValue: payout * prob - 1,
    })
  }

  if (maxLegs >= 2) {
    for (let i = 0; i < picks.length; i += 1) {
      for (let j = i + 1; j < picks.length; j += 1) {
        const legs = [picks[i], picks[j]]
        const prob = Math.max(
          0.000001,
          product(legs.map((leg: PickItem) => Math.min(0.9999, Math.max(0.0001, leg.fair))))
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

  return parlays.sort((a: Parlay, b: Parlay) => b.probability - a.probability)
}

export function runLocalSimulation(
  source: number | PickItem[] | undefined,
  arg2?: number | { trials?: number; stakePerBet?: number },
  arg3?: number
): SimulationResult {
  if (typeof source === 'number') {
    const trials = Math.max(1, source)
    const stakePerBet = typeof arg2 === 'number' ? arg2 : 1

    let wins = 0
    let losses = 0
    let totalStake = 0
    let totalReturn = 0

    for (let t = 0; t < trials; t += 1) {
      for (const pick of samplePicks) {
        const p = Math.min(0.999999, Math.max(0, pick.fair))
        const mult = probabilityToPayoutMultiplier(p)
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
      summary: `Simulated ${trials} trials with ${samplePicks.length} picks each. Wins: ${wins}, Losses: ${losses}, ROI: ${(roi * 100).toFixed(2)}%.`,
    }
  }

  const items: PickItem[] = Array.isArray(source) ? source : []
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

  for (let t = 0; t < trials; t += 1) {
    for (const item of items) {
      const normalized = normalizePick(item)
      const p = Math.min(0.999999, Math.max(0, normalized.fair))
      const mult = probabilityToPayoutMultiplier(p)
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
    odds: 110,
    fair: 0.63,
    confidence: 'High',
    units: 1,
    edge: 13,
    note: 'Strong value on the favorite',
    notes: ['Strong value on the favorite'],
    value: 0.63,
    risk: 1,
    status: 'active',
    label: 'Knicks',
  },
  {
    id: 'p2',
    title: 'Celtics vs Heat',
    sport: 'basketball_nba',
    market: 'Spread',
    side: 'Heat +3.5',
    odds: 105,
    fair: 0.58,
    confidence: 'Medium',
    units: 1,
    edge: 8,
    note: 'Live matchup edge',
    notes: ['Live matchup edge'],
    value: 0.58,
    risk: 1,
    status: 'active',
    label: 'Celtics vs Heat',
  },
  {
    id: 'p3',
    title: 'Mets vs Braves',
    sport: 'baseball_mlb',
    market: 'Moneyline',
    side: 'Mets',
    odds: 120,
    fair: 0.55,
    confidence: 'Low',
    units: 1,
    edge: 5,
    note: 'Value is softer but still live',
    notes: ['Value is softer but still live'],
    value: 0.55,
    risk: 1,
    status: 'active',
    label: 'Mets',
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

export const pickGroups: DashboardPickGroup[] = getPickGroups()

export function buildDashboard(): { groups: DashboardPickGroup[]; title: string; generatedAt: string } {
  return {
    groups: getPickGroups(),
    title: 'Dashboard',
    generatedAt: new Date().toISOString(),
  }
}

export function buildDashboardData(): ReturnType<typeof buildDashboard> {
  return buildDashboard()
}

export function pickGrid(): DashboardPickGroup[] {
  return getPickGroups()
}

export function buildCsv(rows: Array<Record<string, unknown>> = []): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0] as Record<string, unknown>)
  const csvLines: string[] = [
    headers.join(','),
    ...rows.map((row: Record<string, unknown>) =>
      headers
        .map((header: string) => {
          const value = row[header]
          return typeof value === 'string'
            ? `"${value.replace(/"/g, '""')}"`
            : String(value ?? '')
        })
        .join(',')
    ),
  ]
  return csvLines.join('\n')
}

export function buildDashboardCsv(rows: Array<Record<string, unknown>> = []): string {
  return buildCsv(rows)
}

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
