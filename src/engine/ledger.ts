import type { Ticket } from './ticketBuilder'

export interface LedgerEntry {
  ticketId: string
  ticketName: string
  legCount: number
  combinedProbability: number
  stake: number
  hit: boolean
  payout: number
  clv?: number
  timestamp: string
}

const KEY = 'hvbm.ledger.v1'

function storage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined
  } catch {
    return undefined
  }
}

export function loadLedger(): LedgerEntry[] {
  const raw = storage()?.getItem(KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LedgerEntry[]) : []
  } catch {
    return []
  }
}

/** `payout` is the total amount returned (0 for a loss). */
export function saveTicketResult(ticket: Ticket, stake: number, hit: boolean, payout: number, clv?: number): LedgerEntry {
  const entry: LedgerEntry = {
    ticketId: ticket.id,
    ticketName: ticket.name,
    legCount: ticket.legs.length,
    combinedProbability: ticket.combinedProbability,
    stake,
    hit,
    payout,
    clv,
    timestamp: new Date().toISOString(),
  }
  storage()?.setItem(KEY, JSON.stringify([...loadLedger(), entry]))
  return entry
}

export function getLedgerSummary(): { totalTickets: number; hits: number; losses: number; roi: number; avgCLV: number } {
  const entries = loadLedger()
  const hits = entries.filter((e) => e.hit).length
  const staked = entries.reduce((s, e) => s + e.stake, 0)
  const returned = entries.reduce((s, e) => s + e.payout, 0)
  const clvs = entries.map((e) => e.clv).filter((c): c is number => typeof c === 'number' && Number.isFinite(c))
  return {
    totalTickets: entries.length,
    hits,
    losses: entries.length - hits,
    roi: staked > 0 ? (returned - staked) / staked : 0,
    avgCLV: clvs.length ? clvs.reduce((s, c) => s + c, 0) / clvs.length : 0,
  }
}
