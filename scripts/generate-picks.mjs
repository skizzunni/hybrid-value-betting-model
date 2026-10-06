#!/usr/bin/env node
// Daily slate: 25 legs across all sports, appended to a durable pick log.
// Runs only inside the 12:00-8:00 AM ET window (override with --force) and only once per ET date.
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DAILY_LEGS, MODEL_VERSION, SPORT_KEYS, buildCandidates, buildReport, appendJsonl, easternParts,
  inGenerationWindow, makePickRecord, mergeResults, readJsonl, segmentWeights, selectDaily,
} from './lib/tracker.mjs'
import { fetchOdds } from './lib/odds-api.mjs'

const root = process.cwd()
const dataDir = path.join(root, 'data')
const force = process.argv.includes('--force')
const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

async function fail(status, reason) {
  console.error(`::error::${reason}`)
  await writeJson(path.join(dataDir, 'status.json'), { ...status, status: 'failed', reason })
  process.exit(1)
}

async function main() {
  const now = new Date()
  const et = easternParts(now)
  const base = { checked_at: now.toISOString(), et_date: et.date, model_version: MODEL_VERSION, legs: 0 }

  if (!force && !inGenerationWindow(now)) {
    console.log(`Skipping: ET hour ${et.hour} is outside the 12:00 AM-8:00 AM ET window`)
    return
  }
  const picksFile = path.join(dataDir, 'picks-log.jsonl')
  const history = await readJsonl(picksFile)
  if (!force && history.some((p) => p.run_date === et.date)) {
    console.log(`Skipping: picks for ${et.date} already recorded`)
    return
  }
  if (!apiKey) await fail(base, 'ODDS_API_KEY is required')

  const candidates = []
  const failures = []
  for (const [label, key] of Object.entries(SPORT_KEYS)) {
    try {
      const events = await fetchOdds(key, apiKey)
      for (const event of events || []) candidates.push(...buildCandidates(event, now))
    } catch (err) {
      failures.push(`${label}: ${err.message}`)
      console.warn(`Fetch failed for ${label}: ${err.message}`)
    }
  }
  if (failures.length === Object.keys(SPORT_KEYS).length) await fail({ ...base, fetch_failures: failures }, 'All odds fetches failed')

  const results = mergeResults(await readJsonl(path.join(dataDir, 'results.jsonl')))
  const report = buildReport(history, results, { now })
  const weights = segmentWeights(report.segments)
  const { picks, shortfall, reason } = selectDaily(candidates, weights)

  const sportsCovered = [...new Set(picks.map((p) => p.sport))]
  const status = { ...base, legs: picks.length, sports: sportsCovered, fetch_failures: failures, cut_segments: [...weights.lose], emphasised_segments: [...weights.win] }
  if (shortfall > 0) {
    await fail(status, `${reason}${failures.length ? `; fetch failures: ${failures.join('; ')}` : ''}`)
  }

  const records = picks.map((p) => makePickRecord(p, { now, runDate: et.date }))
  await appendJsonl(picksFile, records)
  await writeJson(path.join(dataDir, 'status.json'), { ...status, status: 'ok', reason: null })

  const items = records.map((r) => ({
    id: r.id,
    title: r.event,
    sport: r.sport,
    market: 'Moneyline',
    side: r.side,
    odds: r.odds,
    fair: r.model_prob,
    edge: Number((r.edge * 100).toFixed(2)),
    confidence: r.confidence,
    units: r.units,
    notes: [
      `Best price ${r.odds} at ${r.book} (implied ${(r.implied_prob * 100).toFixed(1)}%)`,
      `Consensus no-vig ${(r.model_prob * 100).toFixed(1)}% across ${r.n_books} books`,
      `${r.tags.role}, ${r.tags.odds_bucket}, edge ${r.tags.edge_band}`,
    ],
  }))
  await writeJson(path.join(root, 'src', 'generated', 'picks.json'), {
    generated_at: now.toISOString(),
    et_date: et.date,
    mode: 'live',
    status: 'ok',
    groups: [{ id: 'daily-25', label: `Daily ${DAILY_LEGS} legs`, note: 'Line-shopping value vs. consensus no-vig price. Not guaranteed; parlays are high variance.', items }],
  })
  console.log(`Recorded ${records.length} legs for ${et.date} across ${sportsCovered.join(', ')}`)
}

main().catch(async (err) => {
  console.error(err)
  process.exit(1)
})
