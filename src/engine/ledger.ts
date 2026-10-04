import type { Ticket } from './ticketBuilder'
import type { Side } from './underdog'

export type LedgerLeg = {
  side: Side
  hit?: boolean
  americanOdds?: number
  modelProbability?: number
}

export type LedgerEntry = {
  id: string
  timestamp: number
  ticketName: string
  legCount: number
  stake: number
  hit: boolean
  payout: number
  clv?: number
  ticketId?: string
  combinedProbability?: number
  edgeQuality?: 'strong' | 'medium' | 'weak' | 'breakeven' | 'negative'
  /** Side of the bet (straights) or of the ticket's single selection. */
  side?: Side
  /** Optional per-leg tracking. */
  legs?: LedgerLeg[]
  /** Legs that hit within this ticket. */
  legsHit?: number
  takenEdge?: number
  closingEdge?: number
}

export type SideStats = { count: number; hits: number; roi: number }

export type AnalyticsSide = {
  count: number
  roi: number
  hitRate: number
  avgCLV: number
  edgeVsClosing: number
  avgOdds: number
  avgPredicted: number
  avgTakenEdge: number
}

export type LedgerSummary = {
  totalTickets: number
  hits: number
  losses: number
  roi: number
  hitRate: number
  averageCLV?: number
  avgCLV: number
  favoriteStats: SideStats
  underdogStats: SideStats
  /** Legs that hit within tickets. */
  partsWon: number
}

const STORAGE_KEY = 'hybrid_betting_ledger'
const LEGACY_STORAGE_KEY = 'hvbm.ledger.v1'

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function isEntry(e: unknown): e is LedgerEntry {
  if (typeof e !== 'object' || e === null) return false
  const r = e as Record<string, unknown>
  return Number.isFinite(r.stake) && Number.isFinite(r.payout) && typeof r.hit === 'boolean'
}

export function loadLedger(): LedgerEntry[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter(isEntry)
    const legacy: unknown = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) || '[]')
    if (!Array.isArray(legacy)) return []
    return legacy.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null).map((entry) => ({
      ...entry,
      id: typeof entry.id === 'string' ? entry.id : String(entry.ticketId ?? 'legacy-ticket'),
      timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.parse(String(entry.timestamp ?? '')) || 0,
    })).filter(isEntry)
  } catch {
    return []
  }
}

export function saveTicketResult(
  ticket: Ticket | {
    name: string
    legs: unknown[]
    id?: string
    combinedProbability?: number
    edgeQuality?: LedgerEntry['edgeQuality']
  },
  stake: number,
  hit: boolean,
  payout: number,
  clv?: number,
  extra?: Pick<LedgerEntry, 'side' | 'legs' | 'legsHit' | 'takenEdge' | 'closingEdge'>,
): LedgerEntry {
  const now = Date.now()
  const ticketId = ticket.id
  const entry: LedgerEntry = {
    id: `ticket-${now}-${Math.random().toString(36).slice(2)}`,
    timestamp: now,
    ticketName: ticket.name,
    legCount: ticket.legs.length,
    stake,
    hit,
    payout,
    clv,
    ticketId,
    combinedProbability: ticket.combinedProbability,
    edgeQuality: 'edgeQuality' in ticket ? ticket.edgeQuality : undefined,
    ...extra,
  }
  const storage = getStorage()
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...loadLedger(), entry]))
  } catch {
    return entry
  }
  return entry
}

function entrySide(entry: LedgerEntry): Side | undefined {
  if (entry.side) return entry.side
  return entry.legs?.length === 1 ? entry.legs[0].side : undefined
}

function entryLegsHit(entry: LedgerEntry): number {
  if (typeof entry.legsHit === 'number') return entry.legsHit
  if (entry.legs?.some((leg) => typeof leg.hit === 'boolean')) return entry.legs.filter((leg) => leg.hit).length
  return entry.hit ? entry.legCount : 0
}

const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
const finite = (values: Array<number | undefined>): number[] =>
  values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

function roiOf(entries: LedgerEntry[]): number {
  const staked = entries.reduce((sum, e) => sum + e.stake, 0)
  const returned = entries.reduce((sum, e) => sum + e.payout, 0)
  return staked > 0 ? (returned - staked) / staked : 0
}

function sideStats(entries: LedgerEntry[]): SideStats {
  return { count: entries.length, hits: entries.filter((e) => e.hit).length, roi: roiOf(entries) }
}

export function getLedgerSummary(ledger: LedgerEntry[] = loadLedger()): LedgerSummary {
  const entries = ledger
  const hits = entries.filter((entry) => entry.hit).length
  const clvs = finite(entries.map((entry) => entry.clv))
  const averageCLV = clvs.length ? mean(clvs) : undefined

  return {
    totalTickets: entries.length,
    hits,
    losses: entries.length - hits,
    roi: roiOf(entries),
    hitRate: entries.length > 0 ? hits / entries.length : 0,
    averageCLV,
    avgCLV: averageCLV ?? 0,
    favoriteStats: sideStats(entries.filter((e) => entrySide(e) === 'favorite')),
    underdogStats: sideStats(entries.filter((e) => entrySide(e) === 'underdog')),
    partsWon: entries.reduce((sum, e) => sum + entryLegsHit(e), 0),
  }
}

function entryProbability(entry: LedgerEntry): number | undefined {
  return entry.legs?.length === 1 ? entry.legs[0].modelProbability : entry.combinedProbability
}

function analyticsFor(entries: LedgerEntry[]): AnalyticsSide {
  return {
    count: entries.length,
    roi: roiOf(entries),
    hitRate: entries.length ? entries.filter((e) => e.hit).length / entries.length : 0,
    avgCLV: mean(finite(entries.map((e) => e.clv))),
    edgeVsClosing: mean(finite(entries.map((e) => e.closingEdge))),
    avgOdds: mean(finite(entries.map((e) => e.legs?.length === 1 ? e.legs[0].americanOdds : undefined))),
    avgPredicted: mean(finite(entries.map(entryProbability))),
    avgTakenEdge: mean(finite(entries.map((e) => e.takenEdge))),
  }
}

export function getSidedResults(ledger: LedgerEntry[] = loadLedger()): {
  favorite: AnalyticsSide
  underdog: AnalyticsSide
  combined: AnalyticsSide
} {
  return {
    favorite: analyticsFor(ledger.filter((e) => entrySide(e) === 'favorite')),
    underdog: analyticsFor(ledger.filter((e) => entrySide(e) === 'underdog')),
    combined: analyticsFor(ledger),
  }
}

export type CalibrationPoint = { predicted: number; actual: number; count: number }

/** Predicted probability vs actual win rate in 10%-wide buckets, per side. */
export function getSideCalibration(ledger: LedgerEntry[] = loadLedger()): { favorite: CalibrationPoint[]; underdog: CalibrationPoint[] } {
  const build = (side: Side): CalibrationPoint[] => {
    const buckets = new Map<number, LedgerEntry[]>()
    for (const entry of ledger) {
      const p = entryProbability(entry)
      if (entrySide(entry) !== side || typeof p !== 'number' || !Number.isFinite(p)) continue
      const key = Math.min(9, Math.max(0, Math.floor(p * 10)))
      buckets.set(key, [...(buckets.get(key) ?? []), entry])
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, group]) => ({
        predicted: mean(finite(group.map(entryProbability))),
        actual: group.filter((e) => e.hit).length / group.length,
        count: group.length,
      }))
  }
  return { favorite: build('favorite'), underdog: build('underdog') }
}

export function clearLedger(): void {
  try {
    const storage = getStorage()
    storage?.removeItem(STORAGE_KEY)
    storage?.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    return
  }
}
