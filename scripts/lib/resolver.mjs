import { fetchEspnScoreboard, fetchOddsScores, espnDateRange, matchScore, normalizeEspn, normalizeOddsScores, orientScore } from './api.mjs'
import { applyResult, resolveLegs } from './grading.mjs'
import { AUTO_VOID_AFTER_DAYS, EXPECT_RESOLVED_AFTER_HOURS, SPORTS, TERMINAL_STATUSES } from './sports.mjs'

const HOUR = 3600_000
const isPending = (g) => !TERMINAL_STATUSES.includes(g.status)

export function expectedUnresolved(games, now) {
  const t = new Date(now).getTime()
  return games.filter((g) => isPending(g) && t - new Date(g.commence_time).getTime() > EXPECT_RESOLVED_AFTER_HOURS * HOUR)
}

// Resolve every unresolved, started game. Quota-aware: at most one Odds API scores request per sport
// (covering all pending games via daysFrom), skipped entirely when nothing is pending; ESPN scoreboard
// requests are memoized per sport/date and used only for games the Odds API did not resolve.
export async function resolveGames({ games, legs, apiKey, fetchImpl = fetch, now, log = () => {} }) {
  const errors = []
  const stats = { oddsApiRequests: 0, espnRequests: 0, resolved: 0, legsGraded: 0, quotaRemaining: null }
  const t = new Date(now).getTime()
  const espnCache = new Map()

  for (const label of Object.keys(SPORTS)) {
    const started = games.filter((g) => g.sport === label && isPending(g) && new Date(g.commence_time).getTime() <= t)
    if (!started.length) continue

    const oldestDays = Math.max(...started.map((g) => (t - new Date(g.commence_time).getTime()) / (24 * HOUR)))
    const recent = started.filter((g) => t - new Date(g.commence_time).getTime() <= 3 * 24 * HOUR)
    if (recent.length && apiKey) {
      try {
        const { data, remaining } = await fetchOddsScores(SPORTS[label].key, apiKey, Math.ceil(oldestDays), fetchImpl)
        stats.oddsApiRequests++
        if (remaining !== null && remaining !== undefined) stats.quotaRemaining = Number(remaining)
        const scores = normalizeOddsScores(data)
        for (const g of recent) {
          const m = matchScore(g, scores)
          if (m && applyResult(g, orientScore(m), now)) stats.resolved += g.status === 'in_progress' ? 0 : 1
        }
      } catch (err) {
        errors.push({ sport: label, source: 'odds-api', message: err.message })
        log(`WARN ${label}: ${err.message}`)
      }
    } else if (recent.length && !apiKey) {
      errors.push({ sport: label, source: 'odds-api', message: 'ODDS_API_KEY missing; scores endpoint skipped' })
    }

    const needEspn = started.filter(isPending)
    if (needEspn.length) {
      let all = []
      const dates = espnDateRange(needEspn)
      const cacheKey = `${label}:${dates}`
      try {
        if (!espnCache.has(cacheKey)) {
          const { data } = await fetchEspnScoreboard(label, dates, fetchImpl)
          stats.espnRequests++
          espnCache.set(cacheKey, normalizeEspn(data))
        }
        all = espnCache.get(cacheKey)
      } catch (err) {
        errors.push({ sport: label, source: 'espn', message: err.message })
        log(`WARN ${label}: ${err.message}`)
      }
      for (const g of needEspn) {
        const m = matchScore(g, all)
        if (m && applyResult(g, orientScore(m), now)) stats.resolved += g.status === 'in_progress' ? 0 : 1
      }
    }

    // Anything with no result after AUTO_VOID_AFTER_DAYS is voided so tickets are not stuck forever.
    for (const g of started) {
      if (isPending(g) && t - new Date(g.commence_time).getTime() > AUTO_VOID_AFTER_DAYS * 24 * HOUR) {
        g.audit.push({ at: now, field: 'status', from: g.status, to: 'cancelled', source: 'auto', note: `no result after ${AUTO_VOID_AFTER_DAYS} days` })
        g.status = 'cancelled'
        g.resolved_at = now
        g.last_updated = now
        stats.resolved++
      }
    }
  }

  stats.legsGraded = resolveLegs(legs, games, now)
  const stuck = expectedUnresolved(games, now)
  const failedSports = new Set(errors.map((e) => e.sport))
  const unresolvedWithErrors = stuck.filter((g) => failedSports.has(g.sport))
  return { errors, stats, expectedUnresolved: stuck, unresolvedWithErrors }
}
