import { slateGames } from './games.mjs'

const MARKETS = { moneyline: 'moneyline', spread: 'spread', total: 'total', spreads: 'spread', totals: 'total', h2h: 'moneyline' }

function titleMatches(game, title) {
  return title === `${game.home} vs ${game.away}` || title === `${game.away} vs ${game.home}`
}

// Flatten published picks into leg records and link each to its tracked game. Existing legs are never
// modified, so already-published picks cannot be rewritten by a later run. `passed` entries
// ({event_id | title+sport, reason}) from the generator are recorded on the game; if absent, slate games
// without a pick get an inferred reason.
export function linkPicks({ picksJson, games, legs, pickDate, now }) {
  const existing = new Set(legs.map((l) => l.leg_id))
  const added = []
  const unmatched = []
  const groups = (picksJson?.groups || []).filter((g) => g.id !== 'most-confident')
  const seen = new Set()
  const pickedGames = new Set()

  for (const group of groups) {
    for (const item of group.items || []) {
      // Published pick ids are `runDate|sport_key|event_id|market|side`; join on the event id when present.
      const eventId = item.event_id || (typeof item.id === 'string' ? item.id.split('|')[2] : undefined)
      const game = games.find((g) => (eventId && (g.id === eventId || g.aliases?.includes(eventId))) || ((g.sport === item.sport || g.sport_key === item.sport) && titleMatches(g, item.title)))
      const market = MARKETS[String(item.market || 'Moneyline').toLowerCase()] || 'moneyline'
      if (!game) {
        unmatched.push(item.title)
        continue
      }
      const line = typeof item.line === 'number' ? item.line : null
      const legId = [pickDate, game.id, market, item.side, line ?? ''].join('|')
      pickedGames.add(game.id)
      if (seen.has(legId)) continue
      seen.add(legId)
      if (existing.has(legId)) continue
      added.push({
        leg_id: legId,
        pick_date: pickDate,
        published_at: now,
        game_id: game.id,
        sport: game.sport,
        market,
        side: item.side,
        line,
        odds: item.odds,
        fair_prob: typeof item.fair === 'number' ? item.fair : null,
        edge_pct: typeof item.edge === 'number' ? item.edge : null,
        confidence: item.confidence ?? null,
        units: item.units ?? null,
        result: 'pending',
        profit_units: null,
        graded_at: null,
        audit: [],
      })
    }
  }

  const passedInput = Array.isArray(picksJson?.passed) ? picksJson.passed : []
  let passes = 0
  for (const game of slateGames(games, now)) {
    if (pickedGames.has(game.id)) {
      addDecision(game, { pick_date: pickDate, decision: 'picked', reason: null })
      continue
    }
    const given = passedInput.find((p) => p.event_id === game.id || ((p.sport === game.sport_key || p.sport === game.sport) && p.title && titleMatches(game, p.title)))
    const reason = given?.reason || (game.odds.latest.h2h ? 'not_selected' : 'no_moneyline_market')
    if (addDecision(game, { pick_date: pickDate, decision: 'passed', reason })) passes++
  }
  return { added, unmatched, passes }
}

function addDecision(game, decision) {
  const i = game.decisions.findIndex((d) => d.pick_date === decision.pick_date)
  if (i >= 0) return false
  game.decisions.push(decision)
  return true
}

// Passed games that went on to resolve: how often would the favorite/underdog moneyline have won.
export function passedGameOutcomes(games) {
  const byReason = {}
  for (const g of games) {
    if (g.status !== 'final' || !g.result?.winner) continue
    for (const d of g.decisions.filter((x) => x.decision === 'passed')) {
      const r = (byReason[d.reason] ||= { games: 0, favorite_won: 0, underdog_won: 0, other: 0 })
      r.games++
      const h2h = g.odds.closing?.h2h
      const fav = h2h ? favoriteKey(g, h2h) : null
      if (!fav || g.result.winner === 'draw' || g.result.winner === 'no_contest') r.other++
      else if (g.result.winner === fav) r.favorite_won++
      else r.underdog_won++
    }
  }
  return byReason
}

export function favoriteKey(game, h2h) {
  const home = h2h[game.home]
  const away = h2h[game.away]
  if (typeof home !== 'number' || typeof away !== 'number') return null
  if (home === away) return null
  const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a)
  return dec(home) < dec(away) ? 'home' : 'away'
}
