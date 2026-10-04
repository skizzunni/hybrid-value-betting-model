import type { Leg } from './ticketBuilder'
import { safeDecimal } from './ticketBuilder'

export type StakingHistory = {
  lastN?: number
}

export type StakeRecommendation = {
  units: number
  dollarStake: number
  rationale: string
  warning?: string
}

export interface StakeHistoryEntry {
  hit: boolean
}

export interface StakingOptions {
  bankrollUnits?: number
  kellyFraction?: number
  throttleLosses?: number
  throttleFactor?: number
}

type StakeTicket = {
  tier?: string
  legs: Array<Partial<Leg> & Pick<Leg, 'modelProbability'>>
  combinedProbability: number
  payoutDecimal?: number
}

const BASE_UNITS: Record<string, number> = {
  Gold: 3,
  Diamond: 2,
  Silver: 1,
  Bronze: 0.5,
}

export function tierForLeg(leg: { modelProbability: number; edge?: number; americanOdds?: number }): string {
  const edge = leg.edge ?? (
    typeof leg.americanOdds === 'number'
      ? leg.modelProbability - 1 / safeDecimal(leg.americanOdds)
      : 0
  )
  const p = leg.modelProbability
  if (p >= 0.65 || (p >= 0.60 && edge > 0.02)) return 'Gold'
  if (p >= 0.60 || (p >= 0.57 && edge > 0.01)) return 'Diamond'
  if (p >= 0.55 || edge > 0) return 'Silver'
  return 'Bronze'
}

function consecutiveLossCount(history: StakingHistory | StakeHistoryEntry[]): number {
  if (!Array.isArray(history)) {
    const losses = history.lastN ?? 0
    return Number.isFinite(losses) ? Math.max(0, Math.floor(losses)) : 0
  }
  let losses = 0
  for (let i = history.length - 1; i >= 0 && !history[i].hit; i -= 1) losses += 1
  return losses
}

function ticketPayout(ticket: StakeTicket): number {
  if (typeof ticket.payoutDecimal === 'number') return ticket.payoutDecimal
  return ticket.legs.reduce((product, leg) => (
    product * safeDecimal(leg.americanOdds ?? 0)
  ), 1)
}

export function recommendStakeForTicket(
  ticket: StakeTicket,
  bankroll: number,
  history: StakingHistory | StakeHistoryEntry[] = {},
  options: StakingOptions = {},
): StakeRecommendation {
  if (!(bankroll > 0) || ticket.legs.length === 0) {
    return { units: 0, dollarStake: 0, rationale: 'No bankroll or no legs: no stake.' }
  }

  const bankrollUnits = options.bankrollUnits
  const unit = bankroll / (
    typeof bankrollUnits === 'number' && Number.isFinite(bankrollUnits) && bankrollUnits > 0
      ? bankrollUnits
      : 50
  )
  const losses = consecutiveLossCount(history)
  const legacyHistory = Array.isArray(history)
  if (ticket.tier?.toLowerCase() === 'lottery') {
    const units = legacyHistory && losses >= (options.throttleLosses ?? 5)
      ? 0.25 * (options.throttleFactor ?? 0.5)
      : 0.25
    return {
      units,
      dollarStake: Math.max(1, unit * units),
      rationale: 'Lottery ticket (extreme variance). Recommended max 0.25 units.',
      warning: 'LOTTERY: Very high variance. Small stake only. Expected value highly negative.',
    }
  }

  const leg = ticket.legs[0]
  const tier = tierForLeg(leg)
  const baseUnits = BASE_UNITS[tier]
  let units = baseUnits
  if (legacyHistory && losses >= (options.throttleLosses ?? 5)) {
    units *= options.throttleFactor ?? 0.5
  } else if (losses > 0) {
    units = Math.max(0.25, baseUnits * Math.pow(0.8, Math.min(losses, 5)))
  }
  const payoutProfit = ticketPayout(ticket) - 1
  const probability = ticket.combinedProbability
  if (!Number.isFinite(probability) || probability <= 0 || probability > 1) {
    return { units: 0, dollarStake: 0, rationale: `Tier ${tier}. Invalid model probability, no stake.` }
  }
  const kelly = payoutProfit > 0
    ? (payoutProfit * probability - (1 - probability)) / payoutProfit
    : 0
  if (kelly <= 0) {
    return { units: 0, dollarStake: 0, rationale: `Tier ${tier}. Kelly <= 0 at model probability, no stake.` }
  }

  const kellyFraction = Math.max(0, Math.min(1, options.kellyFraction ?? 0.25))
  const kellyCap = (kelly * kellyFraction * bankroll) / unit
  if (kellyCap < units) units = kellyCap
  const rationale = `Tier ${tier}. ${losses > 0 ? `Downswing throttle (${losses} losses): ` : ''}${units.toFixed(2)} units.`
  return {
    units,
    dollarStake: Math.round(units * unit * 100) / 100,
    rationale,
  }
}

export function topStraightPlays<T extends { modelProbability: number; edge?: number }>(
  candidates: T[],
  count = 5,
): T[] {
  return candidates
    .filter((candidate) => candidate.modelProbability >= 0.55)
    .sort((a, b) => (
      (b.modelProbability * 0.8 + (b.edge ?? 0) * 0.2) -
      (a.modelProbability * 0.8 + (a.edge ?? 0) * 0.2)
    ))
    .slice(0, count)
}
