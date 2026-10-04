import type { Ticket } from './ticketBuilder'

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
}

export type LedgerSummary = {
  totalTickets: number
  hits: number
  losses: number
  roi: number
  hitRate: number
  averageCLV?: number
  avgCLV: number
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
  ticket: Ticket | { name: string; legs: unknown[] },
  stake: number,
  hit: boolean,
  payout: number,
  clv?: number,
): LedgerEntry {
  const now = Date.now()
  const ticketId = 'id' in ticket ? ticket.id : undefined
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
    combinedProbability: 'combinedProbability' in ticket ? ticket.combinedProbability : undefined,
  }
  const storage = getStorage()
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...loadLedger(), entry]))
  } catch {
    return entry
  }
  return entry
}

export function getLedgerSummary(): LedgerSummary {
  const entries = loadLedger()
  const totalStaked = entries.reduce((sum, entry) => sum + entry.stake, 0)
  const totalReturn = entries.reduce((sum, entry) => sum + entry.payout, 0)
  const hits = entries.filter((entry) => entry.hit).length
  const clvs = entries
    .map((entry) => entry.clv)
    .filter((clv): clv is number => typeof clv === 'number' && Number.isFinite(clv))
  const averageCLV = clvs.length ? clvs.reduce((sum, clv) => sum + clv, 0) / clvs.length : undefined

  return {
    totalTickets: entries.length,
    hits,
    losses: entries.length - hits,
    roi: totalStaked > 0 ? (totalReturn - totalStaked) / totalStaked : 0,
    hitRate: entries.length > 0 ? hits / entries.length : 0,
    averageCLV,
    avgCLV: averageCLV ?? 0,
  }
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
