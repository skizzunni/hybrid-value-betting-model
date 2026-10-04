import type { LegSnapshot } from './snapshot'
import type { LegResult } from './results'

export type LossCause =
  | 'bad_bet'
  | 'variance_good_bet'
  | 'information_miss'
  | 'calibration_miss'
  | 'correlation_loss'
  | 'parlay_structure'
  | 'unknown'

export interface LossDimension {
  sport: string
  market: string
  side: LegSnapshot['side']
  tier: LegSnapshot['tier']
  edgeBucket: string
  probabilityBucket: string
  mode: LegSnapshot['mode']
  dataSource: LegSnapshot['dataSource']
}

export interface LossTag {
  cause: LossCause
  evidence: string
}

export interface LossAnalysis {
  primaryCause: LossCause
  evidence: string
  secondaryTags: LossTag[]
  dimensions: LossDimension
  expectedLossProbability?: number
}

export interface CalibrationEvidence {
  n: number
  predictedProbability: number
  observedHitRate: number
  confidenceUpper: number
}

export interface ClassifyLossInput {
  snapshot: LegSnapshot
  result: LegResult
  clv?: number
  calibration?: CalibrationEvidence
  minSample?: number
  informationThreshold?: number
  otherLostLegs?: LegSnapshot[]
  ticketLegCount?: number
  lostLegCount?: number
  ticketProbability?: number
}

function bucket(value: number | undefined, width: number): string {
  if (value === undefined || !Number.isFinite(value)) return 'unknown'
  const normalized = width === 0.1 ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : value
  const lower = Math.floor(normalized / width) * width
  return `${Math.round(lower * 100)}-${Math.round((lower + width) * 100)}%`
}

function dimensionsOf(snapshot: LegSnapshot): LossDimension {
  return {
    sport: snapshot.sport || 'unknown',
    market: snapshot.market || 'unknown',
    side: snapshot.side,
    tier: snapshot.tier,
    edgeBucket: bucket(snapshot.edge, 0.01),
    probabilityBucket: bucket(snapshot.modelProbability, 0.1),
    mode: snapshot.mode,
    dataSource: snapshot.dataSource,
  }
}

function tag(cause: LossCause, evidence: string): LossTag {
  return { cause, evidence }
}

export function classifyLoss(input: ClassifyLossInput): LossAnalysis {
  const { snapshot } = input
  const p = Number.isFinite(snapshot.modelProbability) && snapshot.modelProbability >= 0 && snapshot.modelProbability <= 1
    ? snapshot.modelProbability
    : undefined
  const expectedLossProbability = p === undefined ? undefined : 1 - p
  const tags: LossTag[] = []
  const edge = snapshot.edge
  const clv = input.clv ?? snapshot.clv

  if (input.result !== 'loss') {
    return { primaryCause: 'unknown', evidence: 'This leg is not recorded as a loss.', secondaryTags: [], dimensions: dimensionsOf(snapshot), expectedLossProbability }
  }

  if (typeof edge === 'number' && Number.isFinite(edge) && edge <= 0) {
    tags.push(tag('bad_bet', `Pick-time edge was ${(edge * 100).toFixed(1)}%, not positive.`))
  }
  if (typeof clv === 'number' && Number.isFinite(clv) && clv < 0) {
    tags.push(tag('bad_bet', `Closing-line value was ${clv.toFixed(2)}%, indicating a worse price than close.`))
  }

  const threshold = input.informationThreshold ?? 0.03
  if (
    typeof snapshot.noVigProbability === 'number' &&
    typeof snapshot.closingNoVigProbability === 'number' &&
    snapshot.noVigProbability - snapshot.closingNoVigProbability > threshold
  ) {
    tags.push(tag(
      'information_miss',
      `No-vig probability moved ${(100 * (snapshot.noVigProbability - snapshot.closingNoVigProbability)).toFixed(1)} percentage points against the pick; this suggests possible late information, not a confirmed cause.`,
    ))
  }

  const minSample = input.minSample ?? 50
  if (
    input.calibration &&
    input.calibration.n >= minSample &&
    input.calibration.confidenceUpper < input.calibration.predictedProbability
  ) {
    tags.push(tag(
      'calibration_miss',
      `The ${input.calibration.n}-bet bucket hit ${(100 * input.calibration.observedHitRate).toFixed(1)}% versus ${(100 * input.calibration.predictedProbability).toFixed(1)}% predicted; its confidence upper bound is ${(100 * input.calibration.confidenceUpper).toFixed(1)}%.`,
    ))
  }

  const relatedLost = (input.otherLostLegs ?? []).filter(
    (leg) => leg.gameId === snapshot.gameId || leg.correlationGroup === snapshot.correlationGroup,
  )
  if (relatedLost.length > 0) {
    tags.push(tag('correlation_loss', `${relatedLost.length + 1} lost legs shared game/correlation group ${snapshot.correlationGroup}.`))
  }

  const legCount = input.ticketLegCount ?? 0
  if (snapshot.mode !== 'straight' && legCount > 0 && input.lostLegCount === 1) {
    tags.push(tag('parlay_structure', `This was the only identified breaking leg in a ${legCount}-leg ticket; its model probability was ${p === undefined ? 'unknown' : `${(p * 100).toFixed(1)}%`}.`))
  }
  if (
    snapshot.mode !== 'straight' &&
    legCount >= 10 &&
    typeof input.ticketProbability === 'number' &&
    input.ticketProbability > 0 &&
    input.ticketProbability < 1
  ) {
    tags.push(tag('parlay_structure', `The ${legCount}-leg ticket had ${(input.ticketProbability * 100).toPrecision(3)}% combined probability, about 1 in ${Math.round(1 / input.ticketProbability)}; losing was expected.`))
  }

  if (
    typeof edge === 'number' && edge > 0 &&
    (typeof clv !== 'number' || clv >= 0) &&
    (p === undefined || p >= 0.5 || edge > 0)
  ) {
    tags.push(tag(
      'variance_good_bet',
      `Pick-time edge was ${(edge * 100).toFixed(1)}%; the model gave it a ${(p === undefined ? 'unknown' : `${(100 * (1 - p)).toFixed(1)}%`)} chance to lose. Expected variance, not a mistake.`,
    ))
  }

  const priority: LossCause[] = ['bad_bet', 'information_miss', 'calibration_miss', 'correlation_loss', 'parlay_structure', 'variance_good_bet']
  const primary = priority.find((cause) => tags.some((item) => item.cause === cause)) ?? 'unknown'
  const selected = tags.find((item) => item.cause === primary)
  return {
    primaryCause: primary,
    evidence: selected?.evidence ?? 'Insufficient measured data to identify a cause; outcome context is unknown.',
    secondaryTags: tags.filter((item) => item !== selected),
    dimensions: dimensionsOf(snapshot),
    expectedLossProbability,
  }
}
