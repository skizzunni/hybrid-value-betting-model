import { DefaultProbabilityModel, type ProbabilityContext, type ProbabilityModel } from '../oddsAdapter'
import type { Leg } from '../ticketBuilder'
import { classifyLeg, legEdge } from '../underdog'
import type { SegmentStats } from './aggregate'

export const LEARNING_STORAGE_KEY = 'hybrid.postmortem.learning.v1'
export const LEARNING_LOG_KEY = 'hybrid.postmortem.learning-log.v1'
export const LEARNING_ENABLED_KEY = 'hybrid.postmortem.enabled.v1'

export interface LearnedAdjustment {
  segmentId: string
  factor: number
  sampleSize: number
  minSample: number
  predictedProbability: number
  observedHitRate: number
  confidenceUpper: number
  evidence: string
  reason: string
  updatedAt: number
}

export interface LearnedAdjustments {
  version: 1
  adjustments: LearnedAdjustment[]
}

export interface LearningChange {
  timestamp: number
  segment: string
  oldFactor: number
  newFactor: number
  sampleSize: number
  evidence: string
  reason: string
}

export interface LearningOptions {
  minSample?: number
  priorWeight?: number
  maxShift?: number
  alpha?: number
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function loadLearnedAdjustments(): LearnedAdjustments {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(LEARNING_STORAGE_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return { version: 1, adjustments: [] }
    const adjustments = (parsed as Partial<LearnedAdjustments>).adjustments
    return {
      version: 1,
      adjustments: Array.isArray(adjustments) ? adjustments.filter((entry): entry is LearnedAdjustment =>
        !!entry && typeof entry.segmentId === 'string' && Number.isFinite(entry.factor) &&
        Number.isFinite(entry.sampleSize) && typeof entry.evidence === 'string' &&
        typeof entry.reason === 'string' && Number.isFinite(entry.updatedAt) &&
        Number.isFinite(entry.minSample) && Number.isFinite(entry.predictedProbability) &&
        Number.isFinite(entry.observedHitRate) && Number.isFinite(entry.confidenceUpper) &&
        entry.sampleSize >= entry.minSample && entry.confidenceUpper < entry.predictedProbability &&
        entry.observedHitRate < entry.predictedProbability && Math.abs(entry.factor) <= 0.05,
      ) : [],
    }
  } catch {
    return { version: 1, adjustments: [] }
  }
}

export function loadLearningChangeLog(): LearningChange[] {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(LEARNING_LOG_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((entry): entry is LearningChange =>
      !!entry && typeof entry.segment === 'string' && Number.isFinite(entry.timestamp) &&
      Number.isFinite(entry.oldFactor) && Number.isFinite(entry.newFactor) &&
      Number.isFinite(entry.sampleSize) && typeof entry.evidence === 'string' && typeof entry.reason === 'string',
    ) : []
  } catch {
    return []
  }
}

function zScore(alpha: number): number {
  return alpha <= 0.01 ? 2.576 : alpha <= 0.05 ? 1.96 : 1.645
}

function wilsonUpper(p: number, n: number, alpha: number): number {
  const z = zScore(alpha)
  const z2 = z * z
  return (p + z2 / (2 * n) + z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n)
}

function significant(segment: SegmentStats, alpha: number): boolean {
  const n = segment.n
  if (!n) return false
  return wilsonUpper(segment.observedHitRate, n, alpha) < segment.predictedMean
}

export function deriveLearnedAdjustments(
  segments: SegmentStats[],
  options: LearningOptions = {},
): LearnedAdjustments {
  const minSample = options.minSample ?? 50
  const priorWeight = Math.max(0, options.priorWeight ?? 100)
  const maxShift = Math.min(0.05, Math.max(0, options.maxShift ?? 0.05))
  const alpha = options.alpha ?? 0.05
  const adjustments = segments
    .filter((segment) =>
      ['sport', 'market', 'side', 'edgeBucket', 'probabilityBucket'].includes(segment.dimension) &&
      segment.n >= minSample && significant(segment, alpha) && segment.observedHitRate < segment.predictedMean,
    )
    .map((segment) => ({
      segmentId: segment.id,
      factor: Math.max(-maxShift, Math.min(0, (segment.observedHitRate - segment.predictedMean) * segment.n / (segment.n + priorWeight))),
      sampleSize: segment.n,
      minSample,
      predictedProbability: segment.predictedMean,
      observedHitRate: segment.observedHitRate,
      confidenceUpper: wilsonUpper(segment.observedHitRate, segment.n, alpha),
      evidence: `${(segment.observedHitRate * 100).toFixed(1)}% observed vs ${(segment.predictedMean * 100).toFixed(1)}% predicted`,
      reason: `Evidence-gated calibration adjustment for ${segment.id}.`,
      updatedAt: Date.now(),
    }))
  return { version: 1, adjustments }
}

export function saveLearnedAdjustments(adjustments: LearnedAdjustments): void {
  try {
    storage()?.setItem(LEARNING_STORAGE_KEY, JSON.stringify({ ...adjustments, version: 1 }))
  } catch {
    return
  }
}

export function updateLearning(segments: SegmentStats[], options: LearningOptions = {}): LearnedAdjustments {
  const old = loadLearnedAdjustments()
  const next = deriveLearnedAdjustments(segments, options)
  const prior = new Map(old.adjustments.map((entry) => [entry.segmentId, entry.factor]))
  const changes = next.adjustments
    .filter((entry) => prior.get(entry.segmentId) !== entry.factor)
    .map((entry): LearningChange => ({
      timestamp: Date.now(),
      segment: entry.segmentId,
      oldFactor: prior.get(entry.segmentId) ?? 0,
      newFactor: entry.factor,
      sampleSize: entry.sampleSize,
      evidence: entry.evidence,
      reason: entry.reason,
    }))
  try {
    storage()?.setItem(LEARNING_LOG_KEY, JSON.stringify([...loadLearningChangeLog(), ...changes]))
  } catch {
    return old
  }
  saveLearnedAdjustments(next)
  return next
}

export function resetLearning(): void {
  try {
    storage()?.removeItem(LEARNING_STORAGE_KEY)
    storage()?.removeItem(LEARNING_LOG_KEY)
  } catch {
    return
  }
}

export function loadLearningEnabled(): boolean {
  try {
    return storage()?.getItem(LEARNING_ENABLED_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveLearningEnabled(enabled: boolean): void {
  try {
    storage()?.setItem(LEARNING_ENABLED_KEY, String(enabled))
  } catch {
    return
  }
}

function bucket(value: number, width: number): string {
  const normalized = width === 0.1 ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : value
  const lower = Math.floor(normalized / width) * width
  return `${Math.round(lower * 100)}-${Math.round((lower + width) * 100)}%`
}

function matchesSegment(id: string, leg: Partial<Leg>, baseProbability: number): boolean {
  const [dimension, value] = id.split('=')
  if (!dimension || value === undefined) return false
  switch (dimension) {
    case 'sport': return (leg.sport ?? 'unknown') === value
    case 'market': return (leg.market ?? 'unknown') === value
    case 'side': return leg.americanOdds !== undefined && classifyLeg({ ...leg, americanOdds: leg.americanOdds } as Leg) === value
    case 'edgeBucket': return typeof leg.americanOdds === 'number' && bucket(legEdge(leg as Leg), 0.01) === value
    case 'probabilityBucket': return bucket(baseProbability, 0.1) === value
    default: return false
  }
}

export class AdjustedProbabilityModel implements ProbabilityModel {
  private readonly baseModel: ProbabilityModel
  private readonly adjustments: LearnedAdjustment[]

  constructor(adjustments: LearnedAdjustments = loadLearnedAdjustments(), baseModel: ProbabilityModel = new DefaultProbabilityModel()) {
    this.adjustments = adjustments.adjustments.filter((entry) =>
      entry.sampleSize >= entry.minSample && entry.confidenceUpper < entry.predictedProbability &&
      entry.observedHitRate < entry.predictedProbability && Math.abs(entry.factor) <= 0.05,
    )
    this.baseModel = baseModel
  }

  estimate(leg: Partial<Leg>): number {
    const base = this.baseModel.estimate(leg)
    if (!Number.isFinite(base)) return base
    const matches = this.adjustments.filter((entry) => matchesSegment(entry.segmentId, leg, base))
    if (!matches.length) return base
    const shift = matches.reduce((sum, entry) => sum + entry.factor, 0) / matches.length
    return Math.max(0, Math.min(1, base + shift))
  }

  probability(context: ProbabilityContext): number {
    const base = this.baseModel.probability?.(context) ?? context.noVigProbability
    if (!Number.isFinite(base)) return base
    const matches = this.adjustments.filter((entry) =>
      (entry.segmentId === `sport=${context.sport}` || entry.segmentId === `market=${context.market}`),
    )
    if (!matches.length) return base
    return Math.max(0, Math.min(1, base + matches.reduce((sum, entry) => sum + entry.factor, 0) / matches.length))
  }
}
