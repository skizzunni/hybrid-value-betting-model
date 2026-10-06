import { SPORTS } from './sports.mjs'
import { normalizeName } from './games.mjs'

const ODDS_BASE = 'https://api.the-odds-api.com/v4'

async function getJson(url, fetchImpl, label) {
  const res = await fetchImpl(url)
  if (!res.ok) {
    const quota = res.status === 401 || res.status === 429 ? ' (quota/plan/auth problem: check ODDS_API_KEY and that the plan includes this endpoint)' : ''
    throw new Error(`${label} failed: ${res.status} ${res.statusText}${quota}`)
  }
  const remaining = res.headers?.get?.('x-requests-remaining')
  return { data: await res.json(), remaining }
}

// The Odds API market keys are h2h / spreads / totals ("moneyline" is not a valid key).
export async function fetchOdds(sportKey, apiKey, fetchImpl = fetch) {
  const url = `${ODDS_BASE}/sports/${sportKey}/odds/?regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`
  return getJson(url, fetchImpl, `odds ${sportKey}`)
}

// daysFrom is capped at 3 by The Odds API. One request per sport covers every pending game in the window.
export async function fetchOddsScores(sportKey, apiKey, daysFrom, fetchImpl = fetch) {
  const url = `${ODDS_BASE}/sports/${sportKey}/scores/?daysFrom=${Math.min(3, Math.max(1, daysFrom))}&dateFormat=iso&apiKey=${apiKey}`
  return getJson(url, fetchImpl, `scores ${sportKey}`)
}

const scoreNum = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

// Odds API scores -> [{id, home, away, commence_time, status, home_score, away_score, source}]
export function normalizeOddsScores(events) {
  const out = []
  for (const e of events || []) {
    if (!e?.id) continue
    const home = scoreNum(e.scores?.find((s) => s.name === e.home_team)?.score)
    const away = scoreNum(e.scores?.find((s) => s.name === e.away_team)?.score)
    let status = 'scheduled'
    if (e.completed) status = 'final'
    else if (e.scores) status = 'in_progress'
    out.push({ id: e.id, home: e.home_team, away: e.away_team, commence_time: e.commence_time, status, home_score: home, away_score: away, source: 'odds-api' })
  }
  return out
}

const dateKey = (iso) => iso.slice(0, 10).replace(/-/g, '')

export async function fetchEspnScoreboard(label, dates, fetchImpl = fetch) {
  const path = SPORTS[label].espn
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${dates}`
  return getJson(url, fetchImpl, `ESPN ${label} ${dates}`)
}

// One date-range request (YYYYMMDD-YYYYMMDD, +/- 1 day for timezone drift) covers all pending games of a sport.
export function espnDateRange(games) {
  const times = games.map((g) => new Date(g.commence_time).getTime())
  return `${dateKey(new Date(Math.min(...times) - 86400_000).toISOString())}-${dateKey(new Date(Math.max(...times) + 86400_000).toISOString())}`
}

// ESPN scoreboard -> normalized scores. UFC has no numeric scores; the winner flag is used.
export function normalizeEspn(json) {
  const out = []
  for (const ev of json?.events || []) {
    const comp = ev.competitions?.[0]
    if (!comp) continue
    const home = comp.competitors?.find((c) => c.homeAway === 'home')
    const away = comp.competitors?.find((c) => c.homeAway === 'away')
    if (!home || !away) continue
    const name = (c) => c.team?.displayName || c.athlete?.displayName || c.team?.name
    const type = comp.status?.type || ev.status?.type || {}
    let status = 'scheduled'
    let winner = null
    const detail = `${type.name || ''} ${type.description || ''} ${type.detail || ''}`.toLowerCase()
    if (/postpone/.test(detail)) status = 'postponed'
    else if (/cancel|canceled/.test(detail)) status = 'cancelled'
    else if (type.completed || type.state === 'post') status = 'final'
    else if (type.state === 'in') status = 'in_progress'
    if (status === 'final' && /no contest|no_contest/.test(detail)) winner = 'no_contest'
    const hs = scoreNum(home.score)
    const as = scoreNum(away.score)
    if (status === 'final' && !winner && (hs === null || as === null)) {
      if (home.winner) winner = 'home'
      else if (away.winner) winner = 'away'
      else if (/draw/.test(detail)) winner = 'draw'
    }
    out.push({
      home: name(home), away: name(away), commence_time: ev.date || comp.date, status,
      home_score: hs, away_score: as, winner, overtime: /\b(ot|so)\b|overtime|shootout/i.test(String(type.shortDetail || type.detail || '')),
      source: 'espn',
    })
  }
  return out
}

// Match a normalized score to a tracked game by id (Odds API) or by names + start time (ESPN).
export function matchScore(game, scores) {
  const ids = new Set([game.id, ...(game.aliases || [])])
  const byId = scores.find((s) => s.id && ids.has(s.id))
  if (byId) return { score: byId, swapped: false }
  const h = normalizeName(game.home)
  const a = normalizeName(game.away)
  for (const s of scores) {
    const sh = normalizeName(s.home)
    const sa = normalizeName(s.away)
    const close = Math.abs(new Date(s.commence_time) - new Date(game.commence_time)) <= 36 * 3600_000
    if (!close) continue
    if (sh === h && sa === a) return { score: s, swapped: false }
    if (sh === a && sa === h) return { score: s, swapped: true }
  }
  return null
}

// Orient a matched score to the game's home/away.
export function orientScore(match) {
  const s = match.score
  if (!match.swapped) return s
  const winner = s.winner === 'home' ? 'away' : s.winner === 'away' ? 'home' : s.winner
  return { ...s, home_score: s.away_score, away_score: s.home_score, winner }
}
