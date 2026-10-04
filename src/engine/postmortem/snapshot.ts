import type { Leg, Ticket } from '../ticketBuilder'
import { classifyLeg, legEdge, type Side } from '../underdog'
import type { DataSource } from '../../lib/slate'

export const SNAPSHOT_STORAGE_KEY = 'hybrid.postmortem.snapshots.v1'

export interface ContextNote {
  source: string
  note: string
  observedAt?: number
}

export interface LegSnapshot {
  legId: string
  ticketId: string
  timestamp: number
  sport: string
  gameId: string
  teams: string[]
  market: string
  selection: string
  side: Side
  takenAmericanOdds: number
  bookKey?: string
  modelProbability: number
  noVigProbability?: number
  edge?: number
  tier: Ticket['tier']
  correlationGroup: string
  strategy: string
  mode: 'straight' | 'parlay' | 'lottery'
  dataSource: DataSource
  closingAmerican?: number
  closingOppositeAmerican?: number
  closingNoVigProbability?: number
  clv?: number
  contextNotes?: ContextNote[]
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function validSnapshot(value: unknown): value is LegSnapshot {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<LegSnapshot>
  return typeof row.legId === 'string' && typeof row.ticketId === 'string' &&
    typeof row.timestamp === 'number' && typeof row.sport === 'string' &&
    typeof row.gameId === 'string' && typeof row.market === 'string' &&
    typeof row.selection === 'string' && Number.isFinite(row.takenAmericanOdds) &&
    Number.isFinite(row.modelProbability)
}

export function loadLegSnapshots(): LegSnapshot[] {
  try {
    const raw = storage()?.getItem(SNAPSHOT_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(validSnapshot) : []
  } catch {
    return []
  }
}

export function saveLegSnapshots(
  ticket: Ticket,
  dataSource: DataSource,
  timestamp = Date.now(),
  snapshotTicketId = ticket.id,
): LegSnapshot[] {
  const existing = loadLegSnapshots()
  const snapshots = ticket.legs.map((leg) => ({
    ...makeLegSnapshot(ticket, leg, dataSource, timestamp),
    legId: `${snapshotTicketId}:${leg.id}`,
    ticketId: snapshotTicketId,
  }))
  const byId = new Map(existing.map((snapshot) => [snapshot.legId, snapshot]))
  for (const snapshot of snapshots) if (!byId.has(snapshot.legId)) byId.set(snapshot.legId, snapshot)
  const all = [...byId.values()]
  try {
    storage()?.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(all))
  } catch {
    return existing
  }
  return snapshots
}

export function makeLegSnapshot(
  ticket: Ticket,
  leg: Leg,
  dataSource: DataSource = 'demo',
  timestamp = Date.now(),
): LegSnapshot {
  const mode = ticket.betType === 'straight' ? 'straight' : ticket.tier === 'lottery' ? 'lottery' : 'parlay'
  return {
    legId: `${ticket.id}:${leg.id}`,
    ticketId: ticket.id,
    timestamp,
    sport: leg.sport,
    gameId: leg.gameId,
    teams: [...leg.teams],
    market: leg.market,
    selection: leg.selection,
    side: classifyLeg(leg),
    takenAmericanOdds: leg.americanOdds,
    bookKey: leg.bookKey,
    modelProbability: leg.modelProbability,
    noVigProbability: leg.noVigProbability,
    edge: legEdge(leg),
    tier: ticket.tier,
    correlationGroup: leg.gameId,
    strategy: ticket.strategy,
    mode,
    dataSource,
  }
}

export function getSnapshot(legId: string): LegSnapshot | undefined {
  return loadLegSnapshots().find((snapshot) => snapshot.legId === legId)
}

export function updateLegSnapshot(legId: string, update: Partial<LegSnapshot>): LegSnapshot | undefined {
  const all = loadLegSnapshots()
  const index = all.findIndex((snapshot) => snapshot.legId === legId)
  if (index < 0) return undefined
  all[index] = { ...all[index], ...update }
  try {
    storage()?.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(all))
  } catch {
    return undefined
  }
  return all[index]
}

export function clearLegSnapshots(): void {
  try {
    storage()?.removeItem(SNAPSHOT_STORAGE_KEY)
  } catch {
    return
  }
}
