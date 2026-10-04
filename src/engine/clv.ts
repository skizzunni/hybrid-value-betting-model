import type { Leg } from './ticketBuilder'
import { safeDecimal } from './ticketBuilder'

export interface LegWithClosing extends Leg {
  /** Closing American odds for this selection (single book or several books). */
  closingOdds?: number | number[]
  /** Closing American odds for the opposing side(s), same length semantics as closingOdds. */
  closingOppositeOdds?: number | number[]
}

export function americanToImpliedProbability(american: number): number {
  return 1 / safeDecimal(american)
}

const toArray = (v: number | number[]): number[] => (Array.isArray(v) ? v : [v])

/** No-vig probability of the selection by normalising against the opposing side. */
export function noVigProbability(selectionOdds: number): number
export function noVigProbability(selectionOdds: number, oppositeOdds: number): number
export function noVigProbability(selectionOdds: number, oppositeOdds?: number): number {
  const a = americanToImpliedProbability(selectionOdds)
  if (oppositeOdds === undefined) return a
  const b = americanToImpliedProbability(oppositeOdds)
  return a / (a + b)
}

/**
 * No-vig closing probability. With arrays, each book's pair is de-vigged
 * separately and the results averaged.
 */
export function noVigImpliedProbability(selectionOdds: number | number[], oppositeOdds: number | number[]): number {
  const s = toArray(selectionOdds)
  const o = toArray(oppositeOdds)
  const n = Math.min(s.length, o.length)
  if (n === 0) return NaN
  let sum = 0
  for (let i = 0; i < n; i += 1) sum += noVigProbability(s[i], o[i])
  return sum / n
}

/**
 * CLV percentage: how much better the taken price is than the closing price.
 * If an opposite side is given, the close is de-vigged; with an array of
 * closing odds and no opposite side, the average implied probability is used.
 */
export function compareClosingValue(
  takenOdds: number,
  closingOdds: number | number[],
  oppositeOdds?: number | number[]
): number {
  let closeProb: number
  if (oppositeOdds !== undefined) closeProb = noVigImpliedProbability(closingOdds, oppositeOdds)
  else {
    const arr = toArray(closingOdds)
    if (arr.length === 0) return NaN
    closeProb = arr.reduce((s, o) => s + americanToImpliedProbability(o), 0) / arr.length
  }
  if (!(closeProb > 0)) return NaN
  return (safeDecimal(takenOdds) * closeProb - 1) * 100
}

export function computeCLV(takenAmericanOdds: number, closingOdds: number | number[]): number
export function computeCLV(leg: LegWithClosing): number | undefined
export function computeCLV(
  takenOrLeg: number | LegWithClosing,
  closingOdds?: number | number[],
): number | undefined {
  if (typeof takenOrLeg === 'number') {
    if (closingOdds === undefined) return undefined
    const closing = toArray(closingOdds)
    if (!closing.length) return NaN
    const closingNoVig = closing.reduce((sum, odds) => sum + americanToImpliedProbability(odds), 0) / closing.length
    return (americanToImpliedProbability(takenOrLeg) - closingNoVig) * 100
  }
  const leg = takenOrLeg
  if (leg.closingOdds === undefined) return undefined
  const v = compareClosingValue(leg.americanOdds, leg.closingOdds, leg.closingOppositeOdds)
  return Number.isFinite(v) ? v : undefined
}
