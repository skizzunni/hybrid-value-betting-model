import type { Leg } from './ticketBuilder'
import { safeDecimal } from './ticketBuilder'
import { kellyFraction, maxExposure } from './kelly'

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
  dailyLimit?: number
}

type StakeTicket = {
  tier?: string
  legs: Array<Partial<Leg> & Pick<Leg, 'modelProbability'>>
  combinedProbability: number
  payoutDecimal?: number
}

const EXPOSURE_KEY = 'hvbm.dailyExposure'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function exposureKey(): string {
  return `${EXPOSURE_KEY}.${new Date().toISOString().slice(0, 10)}`
}

export function getDailyExposure(): number {
  try {
    const value = Number(storage()?.getItem(exposureKey()) ?? 0)
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

export function recordStakeExposure(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return
  try {
    storage()?.setItem(exposureKey(), String(getDailyExposure() + amount))
  } catch {
    return
  }
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
  const dailyCap = maxExposure(bankroll, options.dailyLimit ?? 0.05)
  const exposure = Math.max(0, dailyCap - getDailyExposure())
  if (ticket.tier?.toLowerCase() === 'lottery') {
    const throttle = legacyHistory && losses >= (options.throttleLosses ?? 5)
      ? options.throttleFactor ?? 0.5
      : losses > 0 ? Math.pow(0.8, Math.min(losses, 5)) : 1
    const payout = ticketPayout(ticket)
    const edge = ticket.combinedProbability - 1 / payout
    const americanOdds = payout >= 2 ? (payout - 1) * 100 : -100 / (payout - 1)
    const kelly = kellyFraction(edge, americanOdds, options.kellyFraction ?? 0.25)
    const units = Math.min(0.25 * throttle, (kelly * bankroll * throttle) / unit, exposure / unit)
    return {
      units,
      dollarStake: unit * units,
      rationale: edge > 0
        ? 'Lottery ticket (extreme variance); fractional Kelly is capped at 0.25 units.'
        : 'Lottery ticket has no positive expected edge at the combined price; no stake.',
      warning: 'LOTTERY: Very high variance. Small stake only; no profitability claim is made.',
    }
  }

  const leg = ticket.legs[0]
  const tier = tierForLeg(leg)
  const payoutProfit = ticketPayout(ticket) - 1
  const probability = ticket.combinedProbability
  if (!Number.isFinite(probability) || probability <= 0 || probability > 1) {
    return { units: 0, dollarStake: 0, rationale: `Tier ${tier}. Invalid model probability, no stake.` }
  }
  const edge = probability - 1 / ticketPayout(ticket)
  const americanOdds = ticketPayout(ticket) >= 2
    ? (ticketPayout(ticket) - 1) * 100
    : -100 / (ticketPayout(ticket) - 1)
  const kelly = kellyFraction(edge, americanOdds, options.kellyFraction ?? 0.25)
  if (kelly <= 0 || payoutProfit <= 0) {
    return { units: 0, dollarStake: 0, rationale: `Tier ${tier}. Kelly <= 0 at model probability, no stake.` }
  }

  const throttle = legacyHistory && losses >= (options.throttleLosses ?? 5)
    ? options.throttleFactor ?? 0.5
    : losses > 0 ? Math.pow(0.8, Math.min(losses, 5)) : 1
  const tierMultiplier = tier === 'Gold' ? 1 : tier === 'Diamond' ? 0.8 : tier === 'Silver' ? 0.6 : 0.4
  const desiredDollars = Math.max(0, kelly * bankroll * throttle * tierMultiplier)
  const dollarStake = Math.min(desiredDollars, exposure)
  const units = dollarStake / unit
  const rationale = `Tier ${tier}. ${losses > 0 ? `Downswing throttle (${losses} losses): ` : ''}${units.toFixed(2)} units.`
  return {
    units,
    dollarStake: Math.round(dollarStake * 100) / 100,
    rationale,
  }
}

export function topStraightPlays<T extends { modelProbability: number; edge?: number; isPositiveEdge?: boolean }>(
  candidates: T[],
  count = 5,
): T[] {
  return candidates
    .filter((candidate) => candidate.modelProbability >= 0.55
      && (candidate.isPositiveEdge === true || (candidate.isPositiveEdge === undefined && (candidate.edge ?? 0) > 0)))
    .sort((a, b) => (
      (b.modelProbability * 0.8 + (b.edge ?? 0) * 0.2) -
      (a.modelProbability * 0.8 + (a.edge ?? 0) * 0.2)
    ))
    .slice(0, count)
}
