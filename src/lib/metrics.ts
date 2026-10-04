import { safeDecimal, type Leg, type Ticket } from '../engine/ticketBuilder'

export type RiskRating = 'Low' | 'Medium' | 'High' | 'Very High'

/** Expected value per $1 staked, using the model probability. */
export function ticketEV(ticket: Pick<Ticket, 'combinedProbability' | 'payoutDecimal'>): number {
  return ticket.combinedProbability * ticket.payoutDecimal - 1
}

export function riskRating(combinedProbability: number): RiskRating {
  if (combinedProbability >= 0.5) return 'Low'
  if (combinedProbability >= 0.2) return 'Medium'
  if (combinedProbability >= 0.05) return 'High'
  return 'Very High'
}

export function correlationSummary(legs: Leg[]): string {
  const perGame = new Map<string, number>()
  legs.forEach((leg) => perGame.set(leg.gameId, (perGame.get(leg.gameId) ?? 0) + 1))
  const shared = [...perGame.values()].filter((count) => count > 1)
  if (shared.length === 0) return 'No same-game legs'
  const maxInGame = Math.max(...shared)
  return `${shared.length} game${shared.length === 1 ? '' : 's'} with multiple legs (max ${maxInGame})`
}

/**
 * Edge of the model probability over the no-vig market probability, derived from
 * sibling outcomes of the same game and market. Returns null if the market's
 * other outcomes are not in the slate.
 */
export function edgeVsNoVig(leg: Leg, all: Leg[]): number | null {
  const siblings = all.filter((other) => other.gameId === leg.gameId && other.market === leg.market)
  if (siblings.length < 2) return null
  const implied = (l: Leg) => 1 / safeDecimal(l.americanOdds)
  const total = siblings.reduce((sum, l) => sum + implied(l), 0)
  if (!(total > 0)) return null
  return leg.modelProbability - implied(leg) / total
}
