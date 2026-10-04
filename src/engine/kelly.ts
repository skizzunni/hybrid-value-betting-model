import type { LegWithEdge } from './edgeFilter'
import type { Ticket } from './ticketBuilder'

export type StakeTier = 'Gold' | 'Diamond' | 'Silver' | 'Bronze' | 'lottery'

function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) return Number.NaN
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american)
}

export function kellyFraction(edgePercent: number, odds: number, fraction = 0.25): number {
  const decimal = americanToDecimal(odds)
  if (!(decimal > 1) || !Number.isFinite(edgePercent) || edgePercent <= 0) return 0
  const multiplier = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0.25
  return Math.max(0, edgePercent * decimal / (decimal - 1) * multiplier)
}

export function maxExposure(bankroll: number, dailyLimit = 0.05): number {
  if (!Number.isFinite(bankroll) || bankroll <= 0) return 0
  return bankroll * Math.max(0, Math.min(1, dailyLimit))
}

export function recommendStake(
  item: LegWithEdge | Ticket,
  bankroll: number,
  tier: StakeTier,
  exposure = maxExposure(bankroll),
): { units: number; reason: string; kelly: number; capped: boolean } {
  if (!(bankroll > 0)) return { units: 0, reason: 'No bankroll; no stake.', kelly: 0, capped: false }
  const unitSize = bankroll / 50
  const isTicket = 'legs' in item
  const isLottery = tier === 'lottery' || (isTicket && item.tier === 'lottery')
  const probability = isTicket ? item.combinedProbability : item.modelProbability
  const decimalOdds = isTicket
    ? item.payoutDecimal
    : americanToDecimal(item.bestPrice)
  const implied = decimalOdds > 1 ? 1 / decimalOdds : Number.NaN
  const edge = isTicket
    ? probability - implied
    : item.edge
  const americanOdds = isTicket
    ? (decimalOdds >= 2 ? (decimalOdds - 1) * 100 : -100 / (decimalOdds - 1))
    : item.bestPrice
  const kelly = kellyFraction(edge, americanOdds)
  const tierMultiplier: Record<Exclude<StakeTier, 'lottery'>, number> = {
    Gold: 1,
    Diamond: 0.8,
    Silver: 0.6,
    Bronze: 0.4,
  }
  const desiredDollars = bankroll * kelly * (isLottery ? 1 : tierMultiplier[tier])
  const cap = Math.max(0, Math.min(exposure, isLottery ? unitSize * 0.25 : exposure))
  const dollars = Math.min(desiredDollars, cap)
  const capped = dollars + Number.EPSILON < desiredDollars
  const units = dollars / unitSize
  return {
    units,
    reason: edge > 0
      ? `Fractional Kelly at ${(edge * 100).toFixed(2)}% edge.`
      : 'No positive edge at the available price; no stake.',
    kelly,
    capped,
  }
}
