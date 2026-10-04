import type { Leg, Ticket } from './ticketBuilder'
import { safeDecimal } from './ticketBuilder'

export type StakeTier = 'Diamond' | 'Gold' | 'Silver' | 'Bronze'

export interface StakeHistoryEntry {
  hit: boolean
}

export interface StakingOptions {
  /** 1 unit = bankroll / bankrollUnits (default 50). */
  bankrollUnits?: number
  /** Fraction of full Kelly used as a cap (default 0.25). */
  kellyFraction?: number
  /** Number of most recent tickets considered for the downswing throttle (default 5). */
  throttleLosses?: number
  /** Multiplier applied when the last N tickets all lost (default 0.5). */
  throttleFactor?: number
}

const TIER_UNITS: Record<StakeTier, number> = { Diamond: 1, Gold: 0.75, Silver: 0.5, Bronze: 0.25 }
const TIER_ORDER: StakeTier[] = ['Bronze', 'Silver', 'Gold', 'Diamond']

export function tierForLeg(leg: Leg): StakeTier {
  const edge = typeof leg.edge === 'number' ? leg.edge : leg.modelProbability - 1 / safeDecimal(leg.americanOdds)
  const p = leg.modelProbability
  if (p >= 0.7 && edge >= 0.05) return 'Diamond'
  if (p >= 0.62 && edge >= 0.03) return 'Gold'
  if (p >= 0.55 && edge >= 0.01) return 'Silver'
  return 'Bronze'
}

export function recommendStakeForTicket(
  ticket: Ticket,
  bankroll: number,
  history: StakeHistoryEntry[] = [],
  options: StakingOptions = {}
): { units: number; dollarStake: number; rationale: string } {
  const { bankrollUnits = 50, kellyFraction = 0.25, throttleLosses = 5, throttleFactor = 0.5 } = options
  if (!(bankroll > 0) || ticket.legs.length === 0) {
    return { units: 0, dollarStake: 0, rationale: 'No bankroll or no legs: no stake.' }
  }
  const unit = bankroll / bankrollUnits
  // A ticket is only as strong as its weakest leg.
  const tier = ticket.legs.map(tierForLeg).reduce((a, b) => (TIER_ORDER.indexOf(b) < TIER_ORDER.indexOf(a) ? b : a))
  let units = TIER_UNITS[tier]
  const reasons = [`${tier} tier base ${units}u`]

  const b = ticket.payoutDecimal - 1
  const p = ticket.combinedProbability
  const kelly = b > 0 ? (b * p - (1 - p)) / b : 0
  if (kelly <= 0) {
    return { units: 0, dollarStake: 0, rationale: `${reasons[0]}; Kelly <= 0 at model probability, no stake.` }
  }
  const kellyUnits = (kelly * kellyFraction * bankroll) / unit
  if (kellyUnits < units) {
    units = kellyUnits
    reasons.push(`capped by ${kellyFraction} Kelly to ${kellyUnits.toFixed(2)}u`)
  }

  const recent = history.slice(-throttleLosses)
  if (recent.length === throttleLosses && throttleLosses > 0 && recent.every((h) => !h.hit)) {
    units *= throttleFactor
    reasons.push(`downswing throttle x${throttleFactor}`)
  }
  units = Math.round(units * 100) / 100
  return { units, dollarStake: Math.round(units * unit * 100) / 100, rationale: reasons.join('; ') }
}
