import { SPORT_LABELS, STALE_HOURS, TERMINAL_STATUSES, MIN_LEGS } from './sports.mjs'

const HOUR = 3600_000

export function computeCounts(games, legs, now) {
  const t = new Date(now).getTime()
  const empty = () => ({ tracked: 0, resolved: 0, unresolved: 0, stale: 0 })
  const by_sport = Object.fromEntries(SPORT_LABELS.map((l) => [l, empty()]))
  const overall = empty()
  for (const g of games) {
    const row = by_sport[g.sport] || (by_sport[g.sport] = empty())
    const resolved = TERMINAL_STATUSES.includes(g.status)
    const stale = !resolved && t - new Date(g.commence_time).getTime() > STALE_HOURS * HOUR
    for (const r of [row, overall]) {
      r.tracked++
      if (resolved) r.resolved++
      else r.unresolved++
      if (stale) r.stale++
    }
  }
  return {
    overall,
    by_sport,
    legs: { total: legs.length, pending: legs.filter((l) => !l.result || l.result === 'pending').length },
  }
}

export function defaultStatus() {
  return { schema: 1, data_mode: 'sample', generated_at: null, last_pick_run: null, last_results_run: null, last_evening_results_run: null, counts: null, errors: [] }
}

// Merge a run outcome into status.json. `run` is 'pick' | 'results' | 'evening'.
export function recordRun(status, { run, ok, now, etDate, details = {}, errors = [] }) {
  const next = { ...defaultStatus(), ...status }
  const entry = { at: now, et_date: etDate, ok, ...details }
  if (run === 'pick') next.last_pick_run = entry
  else if (run === 'evening') next.last_evening_results_run = entry
  else next.last_results_run = entry
  // Last *successful* timestamps are kept separately so the UI can show freshness even after a failure.
  if (ok && run === 'pick') next.last_successful_pick_run = now
  if (ok && run !== 'pick') next.last_successful_results_run = now
  next.errors = ok ? [] : errors
  next.generated_at = now
  return next
}

export function withCounts(status, games, legs, now) {
  const counts = computeCounts(games, legs, now)
  return { ...status, counts, data_mode: counts.overall.tracked > 0 ? 'live' : 'sample', generated_at: now }
}

export function validateData({ games, legs }) {
  const errors = []
  const ids = new Set()
  for (const g of games) {
    if (!g.id || !g.sport || !g.home || !g.away || !g.commence_time || Number.isNaN(Date.parse(g.commence_time))) errors.push(`invalid game record ${g.id ?? '(no id)'}`)
    if (!['scheduled', 'in_progress', 'final', 'postponed', 'cancelled'].includes(g.status)) errors.push(`game ${g.id}: bad status ${g.status}`)
    if (ids.has(g.id)) errors.push(`duplicate game id ${g.id}`)
    ids.add(g.id)
    if (g.status === 'final' && !g.result) errors.push(`game ${g.id}: final without result`)
  }
  const known = new Set(games.flatMap((g) => [g.id, ...(g.aliases || [])]))
  const legIds = new Set()
  for (const l of legs) {
    if (!l.leg_id || legIds.has(l.leg_id)) errors.push(`duplicate or missing leg_id ${l.leg_id}`)
    legIds.add(l.leg_id)
    if (!known.has(l.game_id)) errors.push(`leg ${l.leg_id}: unknown game ${l.game_id}`)
    if (typeof l.odds !== 'number') errors.push(`leg ${l.leg_id}: missing odds`)
  }
  return errors
}

// Distinct qualified legs on today's published slate.
export function qualifiedLegCount(picksJson) {
  const keys = new Set()
  for (const group of picksJson?.groups || []) {
    if (group.id === 'most-confident') continue
    for (const item of group.items || []) keys.add(`${item.sport}|${item.title}|${item.market}|${item.side}|${item.line ?? ''}`)
  }
  return keys.size
}

export function checkSlate(picksJson, min = MIN_LEGS) {
  const count = qualifiedLegCount(picksJson)
  return { count, ok: count >= min, min }
}
