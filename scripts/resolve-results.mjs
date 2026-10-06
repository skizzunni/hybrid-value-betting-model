#!/usr/bin/env node
// Resolve unresolved games and pick legs, then refresh analytics and status. Safe to re-run.
// Usage: node scripts/resolve-results.mjs [--evening]
import { buildAnalytics } from './lib/analytics.mjs'
import { loadStatus, runStep } from './lib/cli.mjs'
import { analyticsFile, legsFile, loadAllGames, readJsonl, saveAllGames, statusFile, writeJson, writeJsonl } from './lib/io.mjs'
import { resolveGames } from './lib/resolver.mjs'
import { SPORT_LABELS } from './lib/sports.mjs'
import { recordRun, validateData, withCounts } from './lib/status.mjs'
import { etDate } from './lib/time.mjs'

const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY
const run = process.argv.includes('--evening') ? 'evening' : 'results'

await runStep(run, async (now) => {
  const games = await loadAllGames(SPORT_LABELS)
  const legs = await readJsonl(legsFile())
  const out = await resolveGames({ games, legs, apiKey, now, log: console.warn })
  await saveAllGames(games, SPORT_LABELS)
  await writeJsonl(legsFile(), legs, 'leg_id')
  await writeJson(analyticsFile(), buildAnalytics({ games, legs, now }))

  const problems = []
  for (const e of out.errors) if (out.unresolvedWithErrors.some((g) => g.sport === e.sport)) problems.push(`scores failed for ${e.sport} (${e.source}): ${e.message}`)
  if (out.expectedUnresolved.length) problems.push(`${out.expectedUnresolved.length} game(s) still unresolved >8h after start`)
  const invalid = validateData({ games, legs })
  if (invalid.length) problems.push(`data validation failed: ${invalid.slice(0, 5).join('; ')}`)

  console.log(`Resolved ${out.stats.resolved} games, graded ${out.stats.legsGraded} legs (odds-api requests: ${out.stats.oddsApiRequests}, espn: ${out.stats.espnRequests})`)
  const status = withCounts(await loadStatus(), games, legs, now)
  const next = recordRun(status, { run, ok: !problems.length, now, etDate: etDate(new Date(now)), details: { resolved_games: out.stats.resolved, graded_legs: out.stats.legsGraded, quota_remaining: out.stats.quotaRemaining }, errors: problems.map((message) => ({ message })) })
  await writeJson(statusFile(), next)
  if (problems.length) throw new Error(problems.join(' | '))
})
