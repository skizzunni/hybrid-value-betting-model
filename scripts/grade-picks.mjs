#!/usr/bin/env node
// Grades pending picks from final scores, captures closing lines (CLV) just before start,
// and rewrites the aggregated post-mortem report.
import fs from 'node:fs/promises'
import path from 'node:path'
import { SPORT_KEYS, appendJsonl, buildCandidates, buildReport, closingRecord, gradePick, mergeResults, readJsonl } from './lib/tracker.mjs'
import { fetchOdds, fetchScores } from './lib/odds-api.mjs'

const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY
const dataDir = path.join(process.cwd(), 'data')
const CLOSING_WINDOW_MS = 4 * 3600 * 1000
const SCORES_LOOKBACK_MS = 3 * 24 * 3600 * 1000

async function main() {
  if (!apiKey) throw new Error('ODDS_API_KEY is required')
  const now = new Date()
  const picks = await readJsonl(path.join(dataDir, 'picks-log.jsonl'))
  const resultsFile = path.join(dataDir, 'results.jsonl')
  const rows = await readJsonl(resultsFile)
  const merged = new Map(mergeResults(rows).map((r) => [r.id, r]))
  const pending = picks.filter((p) => !merged.get(p.id)?.result)
  const newRows = []
  const problems = []

  for (const [label, key] of Object.entries(SPORT_KEYS)) {
    const mine = pending.filter((p) => p.sport_key === key)
    if (!mine.length) continue

    const started = mine.filter((p) => Date.parse(p.commence_time) <= now.getTime())
    if (started.length) {
      try {
        const scores = new Map((await fetchScores(key, apiKey)).map((s) => [s.id, s]))
        for (const pick of started) {
          const graded = gradePick(pick, scores.get(pick.event_id))
          if (graded) newRows.push({ ...graded, resolved_at: now.toISOString() })
        }
      } catch (err) {
        problems.push(`Scores fetch failed for ${label}: ${err.message}`)
      }
    }

    const closeable = mine.filter((p) => {
      const start = Date.parse(p.commence_time)
      return start > now.getTime() && start - now.getTime() <= CLOSING_WINDOW_MS
    })
    if (closeable.length) {
      try {
        const events = new Map((await fetchOdds(key, apiKey)).map((e) => [e.id, e]))
        for (const pick of closeable) {
          const event = events.get(pick.event_id)
          const side = event && buildCandidates(event, now).find((c) => c.side === pick.side)
          const record = side && closingRecord(pick, side.model_prob, side.odds, now)
          if (record) newRows.push(record)
        }
      } catch (err) {
        problems.push(`Closing-line fetch failed for ${label}: ${err.message}`)
      }
    }
  }

  await appendJsonl(resultsFile, newRows)
  const results = mergeResults([...rows, ...newRows])
  const resolved = new Set(results.filter((r) => r.result).map((r) => r.id))
  const stale = picks.filter((p) => !resolved.has(p.id) && now.getTime() - Date.parse(p.commence_time) > SCORES_LOOKBACK_MS)
  if (stale.length) problems.push(`${stale.length} picks are unresolved more than 3 days after start (outside the scores window)`)

  const report = buildReport(picks, results, { now })
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(path.join(dataDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log(`Graded ${newRows.filter((r) => r.result).length} new picks; ${report.graded} graded, ${report.pending} pending`)

  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
