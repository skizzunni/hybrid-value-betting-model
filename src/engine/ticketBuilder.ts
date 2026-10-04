/**
 * Daily multi-ticket parlay engine. Pure module: no side effects on import.
 *
 * Constraints enforced while assembling a ticket:
 *  - every leg must have modelProbability >= minProbability (default 0.55)
 *  - at most maxPerGame legs from one game (default 6)
 *  - at most maxPerTeam legs involving one team (default 4)
 *  - no duplicate legs, and no contradictory legs: within the same game, two
 *    different selections on the same head-to-head/spread market conflict, and
 *    Over/Under selections on the same totals market conflict.
 *
 * Honesty: only positive-edge legs are eligible, and probabilities are adjusted
 * for explicitly supplied same-game correlations. Short tickets carry notes.
 */
import { adjustedCombinedProb, type CorrelationMatrix } from './correlation'
import { filterByEdge, type LegWithEdge } from './edgeFilter'

export type Sport = string

export interface Leg {
  id: string
  sport: Sport
  gameId: string
  teams: string[]
  market: string
  selection: string
  americanOdds: number
  modelProbability: number
  /** Optional edge override; defaults to modelProbability - implied probability. */
  edge?: number
  bestPrice?: number
  impliedProb?: number
  isPositiveEdge?: boolean
  bookmarksUsed?: string[]
}

export type TicketStrategy = 'highestProbability' | 'highestPayout' | 'sameGameHeavy' | 'mixed'
export type TicketTier = 'lottery' | 'winnable'

export interface Ticket {
  id: string
  name: string
  strategy: TicketStrategy
  tier: TicketTier
  legs: LegWithEdge[]
  targetLegs: number
  combinedProbability: number
  payoutDecimal: number
  edgeQuality: 'strong' | 'medium' | 'weak' | 'breakeven' | 'negative'
  notes: string[]
}

export interface TicketSpec {
  id: string
  name: string
  strategy: TicketStrategy
  targetLegs?: number
  preferCorrelation?: boolean
}

export interface DailyMenuOptions {
  minProbability?: number
  maxPerGame?: number
  maxPerTeam?: number
  maxCandidatesToConsider?: number
  lotteryLegs?: number
  winnableMinK?: number
  winnableMaxK?: number
  winnableMinProbability?: number
  winnableMaxProbability?: number
  edgeThreshold?: number
  gameCorrelations?: CorrelationMatrix
  specs?: TicketSpec[]
}

export const DEFAULT_SPECS: TicketSpec[] = [
  { id: 'hp', name: 'Highest Probability', strategy: 'highestProbability' },
  { id: 'hpay', name: 'Highest Payout', strategy: 'highestPayout' },
  { id: 'sgh', name: 'Same-Game Heavy', strategy: 'sameGameHeavy', preferCorrelation: true },
  { id: 'mix', name: 'Mixed', strategy: 'mixed' },
]

const DEFAULTS = {
  minProbability: 0.55,
  maxPerGame: 6,
  maxPerTeam: 4,
  maxCandidatesToConsider: 200,
  lotteryLegs: 25,
  winnableMinK: 3,
  winnableMaxK: 12,
  winnableMinProbability: 0.05,
  winnableMaxProbability: 0.18,
}

export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) return NaN
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american)
}

/** Decimal odds, or `fallback` (default 1, i.e. no payout) for invalid input. */
export function safeDecimal(american: number, fallback = 1): number {
  const d = americanToDecimal(american)
  return Number.isFinite(d) && d >= 1 ? d : fallback
}

export function combinedProbabilityOfLegs(legs: Leg[]): number {
  return legs.reduce((acc, l) => acc * l.modelProbability, 1)
}

export function payoutDecimalOfLegs(legs: Leg[]): number {
  return legs.reduce((acc, l) => acc * safeDecimal(l.bestPrice ?? l.americanOdds), 1)
}

function legEdge(leg: Leg): number {
  if (typeof leg.edge === 'number') return leg.edge
  return leg.modelProbability - 1 / safeDecimal(leg.americanOdds)
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function isTotals(market: string): boolean {
  const m = norm(market)
  return m === 'total' || m === 'totals' || m === 'over/under'
}

function isSidedMarket(market: string): boolean {
  const m = norm(market)
  return ['h2h', 'moneyline', 'spread', 'spreads'].includes(m)
}

function conflicts(a: Leg, b: Leg): boolean {
  if (a.id === b.id) return true
  if (a.gameId !== b.gameId || norm(a.market) !== norm(b.market)) return false
  if (isTotals(a.market) || isSidedMarket(a.market)) return true
  return false
}

function canAdd(chosen: Leg[], leg: Leg, maxPerGame: number, maxPerTeam: number): boolean {
  if (chosen.some((c) => conflicts(c, leg))) return false
  if (chosen.filter((c) => c.gameId === leg.gameId).length >= maxPerGame) return false
  for (const t of leg.teams) {
    const n = chosen.filter((c) => c.teams.includes(t)).length
    if (n >= maxPerTeam) return false
  }
  return true
}

const byComposite = (a: Leg, b: Leg): number =>
  b.modelProbability - a.modelProbability ||
  legEdge(b) - legEdge(a) ||
  safeDecimal(b.americanOdds) - safeDecimal(a.americanOdds) ||
  a.id.localeCompare(b.id)

const byPayout = (a: Leg, b: Leg): number =>
  safeDecimal(b.americanOdds) - safeDecimal(a.americanOdds) || byComposite(a, b)

function rank(pool: LegWithEdge[], spec: TicketSpec): LegWithEdge[] {
  switch (spec.strategy) {
    case 'highestPayout':
      return [...pool].sort(byPayout)
    case 'sameGameHeavy': {
      if (!spec.preferCorrelation) return [...pool].sort(byComposite)
      const groups = new Map<string, LegWithEdge[]>()
      for (const l of pool) groups.set(l.gameId, [...(groups.get(l.gameId) ?? []), l])
      const ordered = [...groups.values()].map((g) => g.sort(byComposite))
      ordered.sort(
        (a, b) => b.length - a.length || byComposite(a[0], b[0])
      )
      return ordered.flat()
    }
    case 'mixed': {
      const p = [...pool].sort(byComposite)
      const q = [...pool].sort(byPayout)
      const seen = new Set<string>()
      const out: LegWithEdge[] = []
      for (let i = 0; i < p.length; i += 1) {
        for (const l of [p[i], q[i]]) {
          if (!seen.has(l.id)) {
            seen.add(l.id)
            out.push(l)
          }
        }
      }
      return out
    }
    default:
      return [...pool].sort(byComposite)
  }
}

function eligible(candidates: Leg[], o: typeof DEFAULTS, edgeThreshold = 0): LegWithEdge[] {
  const seen = new Set<string>()
  const ok = candidates.filter((l) => {
    if (seen.has(l.id)) return false
    seen.add(l.id)
    return (
      Number.isFinite(l.modelProbability) &&
      l.modelProbability >= o.minProbability &&
      l.modelProbability <= 1 &&
      Number.isFinite(americanToDecimal(l.americanOdds))
    )
  })
  // limit pool for performance, keeping the best by composite score
  return filterByEdge(ok.sort(byComposite).slice(0, o.maxCandidatesToConsider), edgeThreshold)
}

function assemble(ranked: LegWithEdge[], k: number, o: typeof DEFAULTS): LegWithEdge[] {
  const chosen: LegWithEdge[] = []
  for (const leg of ranked) {
    if (chosen.length >= k) break
    if (canAdd(chosen, leg, o.maxPerGame, o.maxPerTeam)) chosen.push(leg)
  }
  return chosen
}

function resolve(options?: DailyMenuOptions): typeof DEFAULTS {
  const o = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    const v = options?.[key]
    if (typeof v === 'number') o[key] = v
  }
  return o
}

function makeTicket(
  spec: TicketSpec,
  tier: TicketTier,
  legs: LegWithEdge[],
  target: number,
  notes: string[],
  gameCorrelations?: CorrelationMatrix,
): Ticket {
  const averageEdge = legs.length
    ? legs.reduce((sum, leg) => sum + leg.edge, 0) / legs.length
    : Number.NEGATIVE_INFINITY
  const edgeQuality = averageEdge >= 0.05
    ? 'strong'
    : averageEdge >= 0.02
      ? 'medium'
      : averageEdge > 0
        ? 'weak'
        : averageEdge === 0
          ? 'breakeven'
          : 'negative'
  return {
    id: `${spec.id}-${tier}`,
    name: `${spec.name} (${tier})`,
    strategy: spec.strategy,
    tier,
    legs,
    targetLegs: target,
    combinedProbability: adjustedCombinedProb(legs, gameCorrelations),
    payoutDecimal: payoutDecimalOfLegs(legs),
    edgeQuality,
    notes,
  }
}

/** Lottery ticket: aims for spec.targetLegs (default 25) legs. */
export function buildTicketFromSpec(candidates: Leg[], spec: TicketSpec, options?: DailyMenuOptions): Ticket {
  const o = resolve(options)
  const target = spec.targetLegs ?? o.lotteryLegs
  const legs = assemble(rank(eligible(candidates, o, options?.edgeThreshold), spec), target, o)
  const notes: string[] = []
  if (legs.length === 0) notes.push('No value found: no candidates clear the positive-edge filter.')
  if (legs.length < target) {
    notes.push(`Only ${legs.length} of ${target} target legs available under constraints.`)
  }
  notes.push('Indicative payout multiplies listed leg prices; correlated sportsbook parlay pricing may differ.')
  notes.push('Lottery ticket is entertainment; its combined probability is not a probability of profit.')
  return makeTicket(spec, 'lottery', legs, target, notes, options?.gameCorrelations)
}

/** Winnable ticket: smallest k in [3,12] whose combined probability falls in 5%..18%. */
export function buildWinnableTicket(candidates: Leg[], spec: TicketSpec, options?: DailyMenuOptions): Ticket {
  const o = resolve(options)
  const ranked = rank(eligible(candidates, o, options?.edgeThreshold), spec)
  const inBand = (p: number) => p >= o.winnableMinProbability && p <= o.winnableMaxProbability
  let best: { legs: LegWithEdge[]; dist: number; k: number } | undefined
  for (let k = o.winnableMinK; k <= o.winnableMaxK; k += 1) {
    const legs = assemble(ranked, k, o)
    if (legs.length === 0) break
    const p = adjustedCombinedProb(legs, options?.gameCorrelations)
    if (legs.length === k && inBand(p)) {
      return makeTicket(spec, 'winnable', legs, k, [
        `Smallest leg count (${k}) reaching ${(o.winnableMinProbability * 100).toFixed(0)}%-${(o.winnableMaxProbability * 100).toFixed(0)}% combined probability.`,
        'Indicative payout multiplies listed leg prices; correlated sportsbook parlay pricing may differ.',
      ], options?.gameCorrelations)
    }
    const dist = p < o.winnableMinProbability ? Math.log(o.winnableMinProbability / p) : p > o.winnableMaxProbability ? Math.log(p / o.winnableMaxProbability) : 0
    if (!best || dist < best.dist) best = { legs, dist, k }
    if (legs.length < k) break
  }
  const legs: LegWithEdge[] = best?.legs ?? []
  const notes = legs.length ? [
    `No ticket with ${o.winnableMinK}-${o.winnableMaxK} legs reached the ${(o.winnableMinProbability * 100).toFixed(0)}%-${(o.winnableMaxProbability * 100).toFixed(0)}% band; best available (${legs.length} legs) returned.`,
    'Indicative payout multiplies listed leg prices; correlated sportsbook parlay pricing may differ.',
  ] : ['No value found: no positive-edge candidates are available.']
  return makeTicket(spec, 'winnable', legs, best?.k ?? o.winnableMinK, notes, options?.gameCorrelations)
}

/** One lottery and one winnable ticket per spec. */
export function generateDailyMenu(candidates: Leg[], opts?: DailyMenuOptions): Ticket[] {
  const specs = opts?.specs ?? DEFAULT_SPECS
  return specs.flatMap((spec) => [buildTicketFromSpec(candidates, spec, opts), buildWinnableTicket(candidates, spec, opts)])
}

export function formatTicketReport(ticket: Ticket): string {
  const lines = [
    `${ticket.name} [${ticket.tier}] - ${ticket.legs.length}/${ticket.targetLegs} legs`,
    `Combined probability: ${(ticket.combinedProbability * 100).toFixed(2)}%`,
    `Payout (decimal): ${ticket.payoutDecimal.toFixed(2)}x`,
  ]
  ticket.legs.forEach((l, i) => {
    const price = l.bestPrice
    const odds = price > 0 ? `+${price}` : `${price}`
    lines.push(`${i + 1}. ${l.teams.join(' vs ')} | ${l.market} | ${l.selection} (${odds}) p=${(l.modelProbability * 100).toFixed(1)}%`)
  })
  ticket.notes.forEach((n) => lines.push(`Note: ${n}`))
  return lines.join('\n')
}
