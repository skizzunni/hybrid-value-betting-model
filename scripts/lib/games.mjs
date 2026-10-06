import { SPORTS, sportByKey } from './sports.mjs'

const HOUR = 3600_000

function median(values) {
  if (!values.length) return null
  const s = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function mode(values) {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
}

// Per-book prices for one event: { [book]: { h2h:{name:price}, spreads:{name:{line,price}}, totals:{Over:{line,price},Under:{...}} } }
export function extractBooks(event) {
  const books = {}
  for (const book of event.bookmakers || []) {
    const entry = {}
    for (const market of book.markets || []) {
      if (market.key === 'h2h') {
        entry.h2h = Object.fromEntries((market.outcomes || []).map((o) => [o.name, o.price]))
      } else if (market.key === 'spreads') {
        entry.spreads = Object.fromEntries((market.outcomes || []).map((o) => [o.name, { line: o.point, price: o.price }]))
      } else if (market.key === 'totals') {
        entry.totals = Object.fromEntries((market.outcomes || []).map((o) => [o.name, { line: o.point, price: o.price }]))
      }
    }
    if (Object.keys(entry).length) books[book.key] = entry
  }
  return books
}

// Consensus snapshot across books: median moneyline, modal spread/total line with median price at that line.
export function summarizeBooks(books) {
  const list = Object.values(books)
  const snap = {}
  const h2h = {}
  for (const b of list) for (const [name, price] of Object.entries(b.h2h || {})) (h2h[name] ||= []).push(price)
  if (Object.keys(h2h).length) snap.h2h = Object.fromEntries(Object.entries(h2h).map(([n, p]) => [n, median(p)]))

  const spreadNames = {}
  for (const b of list) for (const [name, v] of Object.entries(b.spreads || {})) if (typeof v.line === 'number') (spreadNames[name] ||= []).push(v)
  if (Object.keys(spreadNames).length) {
    snap.spreads = {}
    for (const [name, vs] of Object.entries(spreadNames)) {
      const line = mode(vs.map((v) => v.line))
      snap.spreads[name] = { line, price: median(vs.filter((v) => v.line === line).map((v) => v.price)) }
    }
  }
  const totalSides = {}
  for (const b of list) for (const [name, v] of Object.entries(b.totals || {})) if (typeof v.line === 'number') (totalSides[name] ||= []).push(v)
  if (Object.keys(totalSides).length) {
    const line = mode(Object.values(totalSides).flat().map((v) => v.line))
    snap.totals = {}
    for (const [name, vs] of Object.entries(totalSides)) {
      const at = vs.filter((v) => v.line === line)
      if (at.length) snap.totals[name] = { line, price: median(at.map((v) => v.price)) }
    }
  }
  return snap
}

export function newGameRecord(event, now) {
  const label = sportByKey(event.sport_key)
  const cfg = SPORTS[label]
  const books = extractBooks(event)
  const snap = summarizeBooks(books)
  return {
    id: event.id,
    aliases: [],
    sport: label,
    sport_key: event.sport_key,
    league: cfg.league,
    kind: cfg.kind,
    home: event.home_team,
    away: event.away_team,
    commence_time: event.commence_time,
    status: 'scheduled',
    result: null,
    odds: { opening: snap, latest: snap, closing: snap },
    books,
    decisions: [],
    audit: [],
    first_seen: now,
    last_updated: now,
    resolved_at: null,
  }
}

function sameFixture(game, event) {
  if (game.sport_key !== event.sport_key) return false
  const same = game.home === event.home_team && game.away === event.away_team
  const swapped = game.home === event.away_team && game.away === event.home_team
  if (!same && !swapped) return false
  return Math.abs(new Date(game.commence_time) - new Date(event.commence_time)) <= 12 * HOUR
}

// Insert or update records from a batch of Odds API events. Deduped by stable event id; if the id changed
// (same fixture within 12h) the new id is stored as an alias on the existing record.
export function upsertGames(games, events, now) {
  const byId = new Map()
  for (const g of games) {
    byId.set(g.id, g)
    for (const a of g.aliases || []) byId.set(a, g)
  }
  let created = 0
  let updated = 0
  const touched = new Set()

  for (const event of events) {
    if (!event?.id || !sportByKey(event.sport_key) || !event.commence_time) continue
    let game = byId.get(event.id)
    if (!game) {
      game = games.find((g) => sameFixture(g, event))
      if (game) {
        game.aliases = [...(game.aliases || []), event.id].sort()
        game.audit.push({ at: now, field: 'event_id', from: game.id, to: event.id, source: 'odds-api', note: 'event id changed; kept original id as primary' })
        byId.set(event.id, game)
      }
    }
    if (!game) {
      game = newGameRecord(event, now)
      games.push(game)
      byId.set(game.id, game)
      created++
      touched.add(game.id)
      continue
    }
    if (touched.has(game.id)) continue
    touched.add(game.id)

    let changed = false
    if (game.commence_time !== event.commence_time) {
      game.audit.push({ at: now, field: 'commence_time', from: game.commence_time, to: event.commence_time, source: 'odds-api' })
      game.commence_time = event.commence_time
      if (game.status === 'postponed' && new Date(event.commence_time) > new Date(now)) {
        game.audit.push({ at: now, field: 'status', from: 'postponed', to: 'scheduled', source: 'odds-api', note: 'rescheduled' })
        game.status = 'scheduled'
        game.resolved_at = null
      }
      changed = true
    }
    // Odds freeze at commence time, so `closing` stays the last snapshot before the game started.
    if (new Date(now) < new Date(game.commence_time) && game.status === 'scheduled') {
      const books = extractBooks(event)
      const snap = summarizeBooks(books)
      if (JSON.stringify(snap) !== JSON.stringify(game.odds.latest) || JSON.stringify(books) !== JSON.stringify(game.books)) {
        game.books = books
        game.odds.latest = snap
        game.odds.closing = snap
        changed = true
      }
    }
    if (changed) {
      game.last_updated = now
      updated++
    }
  }
  return { created, updated }
}

export function findGame(games, id) {
  return games.find((g) => g.id === id || (g.aliases || []).includes(id))
}

export function normalizeName(name) {
  return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

// Games still to be played that fall on the slate (start within `hours` from now).
export function slateGames(games, now, hours = 24) {
  const t = new Date(now).getTime()
  return games.filter((g) => {
    const c = new Date(g.commence_time).getTime()
    return g.status === 'scheduled' && c >= t && c <= t + hours * HOUR
  })
}
