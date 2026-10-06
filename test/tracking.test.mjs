import { describe, expect, it } from 'vitest'
import { fetchOdds, normalizeEspn, normalizeOddsScores } from '../scripts/lib/api.mjs'
import { buildAnalytics, pickSegments } from '../scripts/lib/analytics.mjs'
import { applyResult, computeClv, gradeLeg, resolveLegs, resolveTicket } from '../scripts/lib/grading.mjs'
import { newGameRecord, upsertGames } from '../scripts/lib/games.mjs'
import { linkPicks } from '../scripts/lib/picks.mjs'
import { resolveGames } from '../scripts/lib/resolver.mjs'
import { checkSlate, computeCounts, recordRun, validateData, withCounts } from '../scripts/lib/status.mjs'
import { shouldRun } from '../scripts/lib/time.mjs'

const T0 = '2026-03-01T00:00:00.000Z'
const START = '2026-03-02T00:00:00.000Z'
const AFTER = '2026-03-02T12:00:00.000Z'

function oddsEvent(over = {}) {
  return {
    id: 'evt1', sport_key: 'basketball_nba', commence_time: START, home_team: 'Lakers', away_team: 'Celtics',
    bookmakers: [
      { key: 'a', markets: [
        { key: 'h2h', outcomes: [{ name: 'Lakers', price: -150 }, { name: 'Celtics', price: 130 }] },
        { key: 'spreads', outcomes: [{ name: 'Lakers', price: -110, point: -3.5 }, { name: 'Celtics', price: -110, point: 3.5 }] },
        { key: 'totals', outcomes: [{ name: 'Over', price: -110, point: 220.5 }, { name: 'Under', price: -110, point: 220.5 }] },
      ] },
      { key: 'b', markets: [{ key: 'h2h', outcomes: [{ name: 'Lakers', price: -140 }, { name: 'Celtics', price: 120 }] }] },
    ],
    ...over,
  }
}

const game = (over = {}) => ({ ...newGameRecord(oddsEvent(), T0), ...over })
const final = (g, h, a, winner) => {
  g.status = 'final'
  g.result = { home_score: h, away_score: a, winner: winner ?? (h > a ? 'home' : h < a ? 'away' : 'draw') }
  return g
}

describe('game records', () => {
  it('creates a record per event and dedupes on re-upsert', () => {
    const games = []
    expect(upsertGames(games, [oddsEvent(), oddsEvent()], T0)).toEqual({ created: 1, updated: 0 })
    expect(upsertGames(games, [oddsEvent()], '2026-03-01T01:00:00.000Z')).toEqual({ created: 0, updated: 0 })
    const g = games[0]
    expect(g).toMatchObject({ id: 'evt1', sport: 'NBA', league: 'NBA', status: 'scheduled', first_seen: T0 })
    expect(g.odds.opening.h2h.Lakers).toBe(-145)
    expect(g.odds.opening.totals.Over.line).toBe(220.5)
    expect(Object.keys(g.books)).toEqual(['a', 'b'])
  })

  it('keeps opening, tracks latest/closing, and freezes odds after commence', () => {
    const games = []
    upsertGames(games, [oddsEvent()], T0)
    const moved = oddsEvent({ bookmakers: [{ key: 'a', markets: [{ key: 'h2h', outcomes: [{ name: 'Lakers', price: -200 }, { name: 'Celtics', price: 170 }] }] }] })
    expect(upsertGames(games, [moved], '2026-03-01T20:00:00.000Z').updated).toBe(1)
    upsertGames(games, [oddsEvent()], '2026-03-02T01:00:00.000Z')
    expect(games[0].odds.opening.h2h.Lakers).toBe(-145)
    expect(games[0].odds.closing.h2h.Lakers).toBe(-200)
  })

  it('handles an event id change as an alias and records an audit entry', () => {
    const games = []
    upsertGames(games, [oddsEvent()], T0)
    upsertGames(games, [oddsEvent({ id: 'evt1-new' })], '2026-03-01T01:00:00.000Z')
    expect(games).toHaveLength(1)
    expect(games[0].aliases).toEqual(['evt1-new'])
    expect(games[0].audit[0]).toMatchObject({ field: 'event_id' })
  })
})

describe('grading', () => {
  it('grades moneyline incl. soccer draws and 2-way ties', () => {
    const g = final(game(), 100, 90)
    expect(gradeLeg(g, { market: 'moneyline', side: 'Lakers' })).toBe('win')
    expect(gradeLeg(g, { market: 'moneyline', side: 'Celtics' })).toBe('loss')
    const soccer = final(game({ sport: 'Soccer' }), 1, 1)
    expect(gradeLeg(soccer, { market: 'moneyline', side: 'Draw' })).toBe('win')
    expect(gradeLeg(soccer, { market: 'moneyline', side: 'Lakers' })).toBe('loss')
    const nflTie = final(game({ sport: 'NFL' }), 20, 20)
    expect(gradeLeg(nflTie, { market: 'moneyline', side: 'Lakers' })).toBe('push')
  })

  it('grades spreads and totals including pushes', () => {
    const g = final(game(), 100, 97)
    expect(gradeLeg(g, { market: 'spread', side: 'Lakers', line: -3 })).toBe('push')
    expect(gradeLeg(g, { market: 'spread', side: 'Lakers', line: -3.5 })).toBe('loss')
    expect(gradeLeg(g, { market: 'spread', side: 'Celtics', line: 3.5 })).toBe('win')
    expect(gradeLeg(g, { market: 'total', side: 'Over', line: 197 })).toBe('push')
    expect(gradeLeg(g, { market: 'total', side: 'Over', line: 190.5 })).toBe('win')
    expect(gradeLeg(g, { market: 'total', side: 'Under', line: 190.5 })).toBe('loss')
  })

  it('voids postponed/cancelled games, UFC no-contests and score-less spreads; UFC draw is a push', () => {
    expect(gradeLeg(game({ status: 'postponed' }), { market: 'moneyline', side: 'Lakers' })).toBe('void')
    expect(gradeLeg(game({ status: 'cancelled' }), { market: 'total', side: 'Over', line: 1 })).toBe('void')
    const nc = final(game({ sport: 'UFC' }), null, null, 'no_contest')
    expect(gradeLeg(nc, { market: 'moneyline', side: 'Lakers' })).toBe('void')
    const win = final(game({ sport: 'UFC' }), null, null, 'home')
    expect(gradeLeg(win, { market: 'moneyline', side: 'Lakers' })).toBe('win')
    expect(gradeLeg(win, { market: 'total', side: 'Over', line: 2.5 })).toBe('void')
    expect(gradeLeg(final(game({ sport: 'UFC' }), null, null, 'draw'), { market: 'moneyline', side: 'Lakers' })).toBe('push')
    expect(gradeLeg(game(), { market: 'moneyline', side: 'Lakers' })).toBeNull()
  })

  it('resolves parlays under standard rules', () => {
    const l = (result, odds = 100) => ({ result, odds })
    expect(resolveTicket([l('win'), l('loss'), l('pending')]).outcome).toBe('loss')
    expect(resolveTicket([l('win'), l('pending')]).outcome).toBeNull()
    expect(resolveTicket([l('win'), l('push'), l('void')])).toMatchObject({ outcome: 'win', effectiveLegs: 1, decimal: 2 })
    expect(resolveTicket([l('push'), l('void')]).outcome).toBe('void')
    expect(resolveTicket([l('win'), l('win')]).decimal).toBe(4)
  })

  it('applyResult is idempotent and logs corrections', () => {
    const g = game()
    const score = { status: 'final', home_score: 100, away_score: 90, source: 'odds-api' }
    expect(applyResult(g, score, AFTER)).toBe(true)
    expect(applyResult(g, score, '2026-03-03T00:00:00.000Z')).toBe(false)
    expect(g.resolved_at).toBe(AFTER)
    expect(g.audit).toHaveLength(0)
    expect(applyResult(g, { ...score, home_score: 90, away_score: 100 }, '2026-03-04T00:00:00.000Z')).toBe(true)
    expect(g.audit).toHaveLength(1)
    expect(g.result.winner).toBe('away')
    expect(applyResult(g, { status: 'in_progress', source: 'x' }, '2026-03-05T00:00:00.000Z')).toBe(false)
  })

  it('computes CLV from the last snapshot before commence', () => {
    const g = game()
    const clv = computeClv(g, { market: 'moneyline', side: 'Lakers', odds: -110 })
    expect(clv.closing_odds).toBe(-145)
    expect(clv.clv_pct).toBeGreaterThan(0)
    expect(computeClv(g, { market: 'spread', side: 'Lakers', line: -4.5, odds: -110 })).toBeNull()
  })
})

describe('linking and leg resolution', () => {
  const picksJson = {
    groups: [
      { id: 'basketball_nba', items: [{ title: 'Lakers vs Celtics', sport: 'basketball_nba', side: 'Lakers', odds: -145, fair: 0.6, edge: 1 }] },
      { id: 'most-confident', items: [{ title: 'Lakers vs Celtics', sport: 'basketball_nba', side: 'Lakers', odds: -145 }] },
    ],
  }

  it('links picks to games, records passes, and never rewrites published legs', () => {
    const picked = game()
    const other = { ...game({ id: 'evt2', home: 'Heat', away: 'Bulls' }) }
    const games = [picked, other]
    const r = linkPicks({ picksJson, games, legs: [], pickDate: '2026-03-01', now: '2026-03-01T06:00:00.000Z' })
    expect(r.added).toHaveLength(1)
    expect(r.added[0]).toMatchObject({ game_id: 'evt1', market: 'moneyline', result: 'pending' })
    expect(picked.decisions[0].decision).toBe('picked')
    expect(other.decisions[0]).toMatchObject({ decision: 'passed', reason: 'not_selected' })
    const again = linkPicks({ picksJson: { groups: [{ id: 'x', items: [{ ...picksJson.groups[0].items[0], odds: -999 }] }] }, games, legs: r.added, pickDate: '2026-03-01', now: '2026-03-01T07:00:00.000Z' })
    expect(again.added).toHaveLength(0)
    expect(r.added[0].odds).toBe(-145)
    expect(other.decisions).toHaveLength(1)
  })

  it('reports unmatched picks', () => {
    const r = linkPicks({ picksJson, games: [], legs: [], pickDate: '2026-03-01', now: T0 })
    expect(r.unmatched).toEqual(['Lakers vs Celtics'])
  })

  it('grades legs once, regrades on correction, and keeps postponement voids', () => {
    const g = game()
    const leg = { leg_id: 'l1', game_id: 'evt1', market: 'moneyline', side: 'Lakers', odds: -145, result: 'pending', audit: [] }
    expect(resolveLegs([leg], [g], AFTER)).toBe(0)
    final(g, 100, 90)
    expect(resolveLegs([leg], [g], AFTER)).toBe(1)
    expect(leg).toMatchObject({ result: 'win', graded_at: AFTER })
    expect(leg.profit_units).toBeCloseTo(0.6897, 3)
    expect(resolveLegs([leg], [g], '2026-03-05T00:00:00.000Z')).toBe(0)
    final(g, 90, 100)
    expect(resolveLegs([leg], [g], '2026-03-06T00:00:00.000Z')).toBe(1)
    expect(leg.result).toBe('loss')
    expect(leg.audit).toHaveLength(1)

    const pp = game({ status: 'postponed' })
    const v = { leg_id: 'l2', game_id: 'evt1', market: 'moneyline', side: 'Lakers', odds: -145, result: 'pending', audit: [] }
    resolveLegs([v], [pp], AFTER)
    expect(v.result).toBe('void')
    final(pp, 100, 90)
    resolveLegs([v], [pp], AFTER)
    expect(v.result).toBe('void')
  })
})

function mockFetch(routes, calls = []) {
  return async (url) => {
    calls.push(url)
    const hit = Object.entries(routes).find(([k]) => url.includes(k))
    if (!hit) return { ok: false, status: 404, statusText: 'nf', json: async () => ({}), headers: new Map() }
    const v = hit[1]
    if (v instanceof Error) throw v
    if (typeof v === 'number') return { ok: false, status: v, statusText: 'err', json: async () => ({}), headers: new Map() }
    return { ok: true, status: 200, json: async () => v, headers: new Map([['x-requests-remaining', '400']]) }
  }
}

describe('resolver', () => {
  const nbaScores = [{ id: 'evt1', completed: true, home_team: 'Lakers', away_team: 'Celtics', commence_time: START, scores: [{ name: 'Lakers', score: '101' }, { name: 'Celtics', score: '99' }] }]

  it('resolves games and legs from the scores endpoint with one request per sport, idempotently', async () => {
    const games = [game()]
    const legs = [{ leg_id: 'l1', game_id: 'evt1', market: 'moneyline', side: 'Lakers', odds: -145, result: 'pending', audit: [] }]
    const calls = []
    const fetchImpl = mockFetch({ 'sports/basketball_nba/scores': nbaScores }, calls)
    const out = await resolveGames({ games, legs, apiKey: 'k', fetchImpl, now: AFTER })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('daysFrom=1')
    expect(out.stats).toMatchObject({ resolved: 1, legsGraded: 1, quotaRemaining: 400 })
    expect(games[0]).toMatchObject({ status: 'final', resolved_at: AFTER })
    expect(legs[0].result).toBe('win')
    const snapshot = JSON.stringify([games, legs])
    const again = await resolveGames({ games, legs, apiKey: 'k', fetchImpl, now: '2026-03-03T00:00:00.000Z' })
    expect(again.stats.resolved).toBe(0)
    expect(again.stats.oddsApiRequests).toBe(0)
    expect(JSON.stringify([games, legs])).toBe(snapshot)
  })

  it('falls back to ESPN for UFC and reports failures for sports with pending games', async () => {
    const ufc = game({ id: 'u1', sport: 'UFC', sport_key: 'mma_mixed_martial_arts', home: 'Fighter A', away: 'Fighter B' })
    const espn = { events: [{ date: START, competitions: [{ status: { type: { completed: true, state: 'post', name: 'STATUS_FINAL', description: 'Final', detail: 'Final' } }, competitors: [{ homeAway: 'home', winner: false, athlete: { displayName: 'Fighter B' } }, { homeAway: 'away', winner: true, athlete: { displayName: 'Fighter A' } }] }] }] }
    const ok = await resolveGames({ games: [ufc], legs: [], apiKey: 'k', fetchImpl: mockFetch({ 'sports/mma_mixed_martial_arts/scores': 500, 'espn.com': espn }), now: AFTER })
    expect(ufc).toMatchObject({ status: 'final', result: { winner: 'home', source: 'espn' } })
    expect(ok.expectedUnresolved).toHaveLength(0)

    const nba = game()
    const bad = await resolveGames({ games: [nba], legs: [], apiKey: 'k', fetchImpl: mockFetch({ 'sports/basketball_nba/scores': 429, 'espn.com': new Error('down') }), now: AFTER })
    expect(bad.errors.map((e) => e.source)).toEqual(['odds-api', 'espn'])
    expect(bad.unresolvedWithErrors).toHaveLength(1)
  })

  it('auto-voids games with no result after 7 days', async () => {
    const g = game()
    await resolveGames({ games: [g], legs: [], apiKey: 'k', fetchImpl: mockFetch({}), now: '2026-03-12T00:00:00.000Z' })
    expect(g.status).toBe('cancelled')
  })

  it('normalizes feeds', () => {
    expect(normalizeOddsScores(nbaScores)[0]).toMatchObject({ status: 'final', home_score: 101, away_score: 99 })
    expect(normalizeEspn({ events: [{ date: START, competitions: [{ status: { type: { name: 'STATUS_POSTPONED', description: 'Postponed' } }, competitors: [{ homeAway: 'home', team: { displayName: 'A' } }, { homeAway: 'away', team: { displayName: 'B' } }] }] }] })[0].status).toBe('postponed')
  })

  it('raises a clear error when the odds fetch fails', async () => {
    await expect(fetchOdds('basketball_nba', 'k', mockFetch({ odds: 401 }))).rejects.toThrow(/401.*plan/)
  })
})

describe('ET / DST scheduling guard', () => {
  const at = (iso, mode = 'picks', status = {}) => shouldRun({ mode, now: new Date(iso), status })
  it('runs picks in 00:00-08:00 ET under EDT and EST', () => {
    expect(at('2026-07-01T04:17:00Z').run).toBe(true) // 00:17 EDT
    expect(at('2026-07-01T11:59:00Z').run).toBe(true) // 07:59 EDT
    expect(at('2026-07-01T12:17:00Z').run).toBe(false) // 08:17 EDT
    expect(at('2026-01-15T04:17:00Z').run).toBe(false) // 23:17 EST previous day
    expect(at('2026-01-15T05:17:00Z').run).toBe(true) // 00:17 EST
    expect(at('2026-01-15T12:59:00Z').run).toBe(true) // 07:59 EST
    expect(at('2026-01-15T13:17:00Z').run).toBe(false) // 08:17 EST
  })
  it('handles the DST transitions', () => {
    expect(at('2026-03-08T06:30:00Z').et_hour).toBe(1) // before spring forward
    expect(at('2026-03-08T07:30:00Z').et_hour).toBe(3) // after (2 AM skipped)
    expect(at('2026-11-01T05:30:00Z').et_hour).toBe(1) // EDT
    expect(at('2026-11-01T06:30:00Z').et_hour).toBe(1) // EST (repeated hour)
  })
  it('runs once per ET day after success but retries after failure', () => {
    const done = { last_pick_run: { ok: true, et_date: '2026-07-01' } }
    expect(at('2026-07-01T06:17:00Z', 'picks', done).run).toBe(false)
    expect(at('2026-07-02T06:17:00Z', 'picks', done).run).toBe(true)
    expect(at('2026-07-01T06:17:00Z', 'picks', { last_pick_run: { ok: false, et_date: '2026-07-01' } }).run).toBe(true)
  })
  it('limits the results-only refresh to the ET evening, once per day', () => {
    expect(at('2026-07-01T20:00:00Z', 'results').run).toBe(false) // 16:00 EDT
    expect(at('2026-07-01T23:20:00Z', 'results').run).toBe(true) // 19:20 EDT
    expect(at('2026-07-01T23:20:00Z', 'results', { last_evening_results_run: { ok: true, et_date: '2026-07-01' } }).run).toBe(false)
    expect(shouldRun({ mode: 'picks', now: new Date('2026-07-01T18:00:00Z'), force: true }).run).toBe(true)
  })
})

describe('status, validation and analytics', () => {
  it('counts coverage and flags stale games', () => {
    const resolved = final(game({ id: 'a' }), 1, 0)
    const stale = game({ id: 'b' })
    const fresh = game({ id: 'c', commence_time: '2026-03-10T00:00:00.000Z' })
    const c = computeCounts([resolved, stale, fresh], [], '2026-03-05T00:00:00.000Z')
    expect(c.overall).toEqual({ tracked: 3, resolved: 1, unresolved: 2, stale: 1 })
    expect(c.by_sport.NBA.tracked).toBe(3)
    expect(c.by_sport.NFL.tracked).toBe(0)
  })

  it('records successful and failed runs in status', () => {
    let s = recordRun({}, { run: 'pick', ok: true, now: T0, etDate: '2026-03-01', details: { legs: 25 } })
    expect(s).toMatchObject({ last_pick_run: { ok: true, legs: 25 }, last_successful_pick_run: T0, errors: [] })
    s = recordRun(s, { run: 'results', ok: false, now: AFTER, etDate: '2026-03-02', errors: [{ message: 'scores failed' }] })
    expect(s.last_results_run.ok).toBe(false)
    expect(s.last_successful_pick_run).toBe(T0)
    expect(s.errors).toEqual([{ message: 'scores failed' }])
    expect(withCounts(s, [game()], [], AFTER)).toMatchObject({ data_mode: 'live', counts: { overall: { tracked: 1 } } })
    expect(withCounts(s, [], [], AFTER).data_mode).toBe('sample')
  })

  it('validates data and the 25-leg slate', () => {
    expect(validateData({ games: [game()], legs: [{ leg_id: 'x', game_id: 'nope', odds: 100 }] })).toEqual(['leg x: unknown game nope'])
    expect(validateData({ games: [game(), game()], legs: [] })[0]).toMatch(/duplicate game id/)
    const picks = (n) => ({ groups: [{ id: 'g', items: Array.from({ length: n }, (_, i) => ({ sport: 's', title: `t${i}`, market: 'Moneyline', side: 'x' })) }, { id: 'most-confident', items: [{ title: 'dup' }] }] })
    expect(checkSlate(picks(24))).toMatchObject({ ok: false, count: 24 })
    expect(checkSlate(picks(25)).ok).toBe(true)
  })

  it('computes game-level analytics and only flags segments with n >= 50 and clear intervals', () => {
    const games = [final(game({ id: 'a' }), 100, 90), final(game({ id: 'b' }), 80, 90)]
    const a = buildAnalytics({ games, legs: [], now: AFTER })
    expect(a.coverage.overall).toMatchObject({ tracked: 2, resolved: 2, pct_resolved: 1 })
    expect(a.games.favorite_vs_underdog).toMatchObject({ n: 2, favorite_wins: 1, underdog_wins: 1 })
    expect(a.games.home_away.home_wins).toBe(1)
    expect(a.games.totals_over_under.NBA.n).toBe(2)

    const mk = (n, winRate, odds = -110) => Array.from({ length: n }, (_, i) => ({ sport: 'NBA', market: 'moneyline', odds, result: i < n * winRate ? 'win' : 'loss', profit_units: i < n * winRate ? 0.909 : -1 }))
    const flag = (legs) => pickSegments(legs).find((s) => s.dimension === 'sport').flag
    expect(flag(mk(49, 0.9))).toBe('insufficient_sample')
    expect(flag(mk(100, 0.7))).toBe('win_condition')
    expect(flag(mk(100, 0.3))).toBe('lose_condition')
    expect(flag(mk(100, 0.52))).toBe('inconclusive')
  })
})
