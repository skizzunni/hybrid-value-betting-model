import type { LegSnapshot } from './snapshot'
import type { LegResult } from './results'

export type SegmentDimension = 'sport' | 'market' | 'side' | 'tier' | 'edgeBucket' | 'probabilityBucket' | 'mode' | 'dataSource'

export interface ResolvedBet {
  snapshot: LegSnapshot
  result: LegResult
  ticketId?: string
  clv?: number
  stake?: number
  payout?: number
}

export interface SegmentStats {
  id: string
  dimension: SegmentDimension
  value: string
  n: number
  predictedMean: number
  observedHitRate: number
  brierScore: number
  roi?: number
  averageCLV?: number
  roiSampleSize: number
  confidenceInterval: { lower: number; upper: number }
  insight: string
}

const DIMENSIONS: SegmentDimension[] = ['sport', 'market', 'side', 'tier', 'edgeBucket', 'probabilityBucket', 'mode', 'dataSource']

function clampProbability(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function wilson(successes: number, n: number, alpha: number): { lower: number; upper: number } {
  const zByAlpha: Record<number, number> = { 0.1: 1.645, 0.05: 1.96, 0.01: 2.576 }
  const z = zByAlpha[alpha] ?? 1.96
  const p = successes / n
  const z2 = z * z
  const denominator = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denominator
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denominator
  return { lower: clampProbability(center - margin), upper: clampProbability(center + margin) }
}

function bucket(value: number | undefined, width: number): string {
  if (value === undefined || !Number.isFinite(value)) return 'unknown'
  const normalized = width === 0.1 ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : value
  const lower = Math.floor(normalized / width) * width
  return `${Math.round(lower * 100)}-${Math.round((lower + width) * 100)}%`
}

function segmentValue(bet: ResolvedBet, dimension: SegmentDimension): string {
  const snapshot = bet.snapshot
  switch (dimension) {
    case 'sport': return snapshot.sport || 'unknown'
    case 'market': return snapshot.market || 'unknown'
    case 'side': return snapshot.side
    case 'tier': return snapshot.tier
    case 'edgeBucket': return bucket(snapshot.edge, 0.01)
    case 'probabilityBucket': return bucket(snapshot.modelProbability, 0.1)
    case 'mode': return snapshot.mode
    case 'dataSource': return snapshot.dataSource
  }
}

function roi(bets: ResolvedBet[]): { value?: number; sampleSize: number } {
  let stake = 0
  let profit = 0
  let sampleSize = 0
  const seenTickets = new Set<string>()
  for (const bet of bets) {
    if (bet.snapshot.mode !== 'straight') {
      if (bet.stake === undefined || bet.payout === undefined) continue
      const key = bet.ticketId ?? bet.snapshot.legId
      if (seenTickets.has(key)) continue
      seenTickets.add(key)
      stake += bet.stake
      profit += bet.payout - bet.stake
      sampleSize += 1
      continue
    }
    const unitStake = bet.stake ?? 1
    stake += unitStake
    sampleSize += 1
    if (bet.payout !== undefined) profit += bet.payout - unitStake
    else if (bet.result === 'win') {
      const odds = bet.snapshot.takenAmericanOdds
      profit += unitStake * (odds > 0 ? odds / 100 : 100 / Math.abs(odds))
    } else if (bet.result === 'loss') profit -= unitStake
  }
  return { value: stake > 0 ? profit / stake : undefined, sampleSize }
}

export function aggregateResults(bets: ResolvedBet[], alpha = 0.05): SegmentStats[] {
  const groups = new Map<string, { dimension: SegmentDimension; value: string; bets: ResolvedBet[] }>()
  for (const bet of bets) {
    if (bet.result !== 'win' && bet.result !== 'loss') continue
    for (const dimension of DIMENSIONS) {
      const value = segmentValue(bet, dimension)
      const id = `${dimension}=${value}`
      const group = groups.get(id) ?? { dimension, value, bets: [] }
      group.bets.push(bet)
      groups.set(id, group)
    }
  }
  return [...groups.entries()].map(([id, group]) => {
    const n = group.bets.length
    const wins = group.bets.filter((bet) => bet.result === 'win').length
    const predictedMean = group.bets.reduce((sum, bet) => sum + clampProbability(bet.snapshot.modelProbability), 0) / n
    const observedHitRate = wins / n
    const brierScore = group.bets.reduce((sum, bet) => sum + (clampProbability(bet.snapshot.modelProbability) - (bet.result === 'win' ? 1 : 0)) ** 2, 0) / n
    const clvs = group.bets.map((bet) => bet.clv).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const confidenceInterval = wilson(wins, n, alpha)
    const roiStats = roi(group.bets)
    return {
      id,
      dimension: group.dimension,
      value: group.value,
      n,
      predictedMean,
      observedHitRate,
      brierScore,
      roi: roiStats.value,
      roiSampleSize: roiStats.sampleSize,
      averageCLV: clvs.length ? clvs.reduce((sum, value) => sum + value, 0) / clvs.length : undefined,
      confidenceInterval,
      insight: `Observed hit rate ${(observedHitRate * 100).toFixed(1)}% vs ${(predictedMean * 100).toFixed(1)}% predicted across ${n} resolved bets; ${confidenceInterval.lower.toFixed(2)}–${confidenceInterval.upper.toFixed(2)} Wilson interval.`,
    }
  }).sort((a, b) => a.dimension.localeCompare(b.dimension) || a.value.localeCompare(b.value))
}

export function findLeaks(
  segments: SegmentStats[],
  options: { minSample?: number; alpha?: number } = {},
): SegmentStats[] {
  const minimum = options.minSample ?? 50
  const alpha = options.alpha ?? 0.05
  return segments.filter((segment) =>
    segment.n >= minimum &&
    wilson(Math.round(segment.observedHitRate * segment.n), segment.n, alpha).upper < segment.predictedMean,
  )
}
