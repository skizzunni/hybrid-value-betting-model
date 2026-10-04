import { americanToImpliedProb } from './devig'
import type { Leg } from './ticketBuilder'
import { americanToDecimal } from './ticketBuilder'

export type LegWithEdge = Leg & {
  bestPrice: number
  impliedProb: number
  edge: number
  isPositiveEdge: boolean
}

export function computeEdge(modelProb: number, bestImpliedProb: number): number {
  return modelProb - bestImpliedProb
}

export function bestOdds(
  leg: Leg,
  allBooks: { outcomes: { name: string; odds: number }[] }[],
): number {
  const matching = allBooks.flatMap((book) => book.outcomes)
    .filter((outcome) => outcome.name === leg.selection && Number.isFinite(americanToDecimal(outcome.odds)))
  return matching.reduce((best, outcome) => (
    americanToDecimal(outcome.odds) > americanToDecimal(best) ? outcome.odds : best
  ), leg.americanOdds)
}

export function addEdgeInformation(legs: Leg[], threshold = 0): LegWithEdge[] {
  return legs.map((leg) => {
    const bestPrice = typeof leg.bestPrice === 'number' ? leg.bestPrice : leg.americanOdds
    const impliedProb = americanToImpliedProb(bestPrice)
    const edge = computeEdge(leg.modelProbability, impliedProb)
    return {
      ...leg,
      bestPrice,
      impliedProb,
      edge,
      isPositiveEdge: Number.isFinite(edge) && edge > 0 && edge >= threshold,
    }
  })
}

export function filterByEdge(legs: Leg[], threshold = 0): LegWithEdge[] {
  return addEdgeInformation(legs, threshold).filter((leg) => leg.isPositiveEdge)
}
