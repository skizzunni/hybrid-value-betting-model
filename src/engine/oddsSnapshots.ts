import type { Leg } from './ticketBuilder'

export type OddsSnapshot = {
  legId: string
  timestamp: number
  americanOdds: number
  book: string
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function storageKey(legId: string): string {
  return `hvbm.oddsSnapshots.${encodeURIComponent(legId)}`
}

export function getOddsSnapshots(legId: string): OddsSnapshot[] {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(storageKey(legId)) ?? '[]')
    return Array.isArray(parsed) ? parsed as OddsSnapshot[] : []
  } catch {
    return []
  }
}

function store(snapshot: OddsSnapshot): OddsSnapshot {
  try {
    const snapshots = getOddsSnapshots(snapshot.legId)
    const next = snapshot.book === 'Closing'
      ? [...snapshots.filter((entry) => entry.book !== 'Closing'), snapshot]
      : [...snapshots.filter((entry) => entry.book !== snapshot.book), snapshot]
    storage()?.setItem(storageKey(snapshot.legId), JSON.stringify(next))
  } catch {
    return snapshot
  }
  return snapshot
}

export function saveSnapshot(leg: Leg, book: string): OddsSnapshot {
  return store({
    legId: leg.id,
    timestamp: Date.now(),
    americanOdds: leg.bestPrice ?? leg.americanOdds,
    book,
  })
}

export function recordClosing(legId: string, closingOdds: number): OddsSnapshot {
  return store({ legId, timestamp: Date.now(), americanOdds: closingOdds, book: 'Closing' })
}

function toDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) return Number.NaN
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american)
}

export function computeRealCLV(openSnapshot: OddsSnapshot, closeSnapshot: OddsSnapshot): number {
  const openDecimal = toDecimal(openSnapshot.americanOdds)
  const closeDecimal = toDecimal(closeSnapshot.americanOdds)
  return openDecimal > 0 && closeDecimal > 0
    ? ((openDecimal / closeDecimal) - 1) * 100
    : Number.NaN
}
