/**
 * Underdog value discovery for straight bets. Pure module.
 *
 * Straights profit from price vs true probability, so any leg with edge > 0 can
 * qualify regardless of how often it wins. Parlay legs keep their own >= 55%
 * probability floor in ticketBuilder.
 */
import type { Leg } from './ticketBuilder'

export type Side = 'favorite' | 'underdog' | 'neutral'
export type LegWithEdge = Leg

export const DEFAULT_MIN_EDGE = 0.005
export const HIGH_VALUE_EDGE = 0.015

function impliedProbability(americanOdds: number): number {
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return 1
  const decimal = americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / Math.abs(americanOdds)
  return 1 / decimal
}

/** Edge = model probability minus implied probability at the offered price (or the explicit override). */
export function legEdge(leg: LegWithEdge): number {
  if (typeof leg.edge === 'number') return leg.edge
  return leg.modelProbability - impliedProbability(leg.americanOdds)
}

/** Underdog: +100 or longer. Favorite: -120 or shorter. Anything in between is neutral. */
export function classifyLeg(leg: LegWithEdge): Side {
  const odds = leg.americanOdds
  if (!Number.isFinite(odds) || odds === 0) return 'neutral'
  if (odds >= 100) return 'underdog'
  if (odds <= -120) return 'favorite'
  return 'neutral'
}

export const isUnderdog = (leg: LegWithEdge): boolean => classifyLeg(leg) === 'underdog'
export const isFavorite = (leg: LegWithEdge): boolean => classifyLeg(leg) === 'favorite'
export const underdog = (legs: LegWithEdge[]): LegWithEdge[] => legs.filter(isUnderdog)
export const favorite = (legs: LegWithEdge[]): LegWithEdge[] => legs.filter(isFavorite)
export const isHighValue = (leg: LegWithEdge): boolean => legEdge(leg) >= HIGH_VALUE_EDGE

/** Keeps any valid leg with edge >= minEdge; there is deliberately no probability floor. */
export function filterByEdgeOnly(legs: LegWithEdge[], minEdge = DEFAULT_MIN_EDGE): LegWithEdge[] {
  return legs.filter(
    (leg) =>
      Number.isFinite(leg.modelProbability) &&
      leg.modelProbability > 0 &&
      leg.modelProbability <= 1 &&
      Number.isFinite(leg.americanOdds) &&
      leg.americanOdds !== 0 &&
      legEdge(leg) >= minEdge,
  )
}

/** Best-edge underdogs (odds >= +100), highest edge first. */
export function topUnderdogValue(legs: LegWithEdge[], count = 10): LegWithEdge[] {
  return underdog(legs)
    .sort((a, b) => legEdge(b) - legEdge(a) || a.id.localeCompare(b.id))
    .slice(0, count)
}

export function sideMixOf(legs: LegWithEdge[]): { favorite: number; underdog: number; neutral: number } {
  const mix = { favorite: 0, underdog: 0, neutral: 0 }
  for (const leg of legs) mix[classifyLeg(leg)] += 1
  return mix
}
