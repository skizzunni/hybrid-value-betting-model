#!/usr/bin/env node
// Link today's published picks (src/generated/picks.json) to game records, record passed games, and
// enforce the 25-leg minimum. Never edits legs that were already published.
import fs from 'node:fs/promises'
import { loadStatus, runStep } from './lib/cli.mjs'
import { legsFile, loadAllGames, picksFile, readJsonl, saveAllGames, statusFile, writeJson, writeJsonl } from './lib/io.mjs'
import { linkPicks } from './lib/picks.mjs'
import { MIN_LEGS, SPORT_LABELS } from './lib/sports.mjs'
import { checkSlate, recordRun, validateData, withCounts } from './lib/status.mjs'
import { etDate } from './lib/time.mjs'

await runStep('pick', async (now) => {
  const picksJson = JSON.parse(await fs.readFile(picksFile(), 'utf8'))
  const games = await loadAllGames(SPORT_LABELS)
  const legs = await readJsonl(legsFile())
  const pickDate = etDate(new Date(now))
  const r = linkPicks({ picksJson, games, legs, pickDate, now })
  const slate = checkSlate(picksJson, Number(process.env.MIN_LEGS || MIN_LEGS))
  // Only publish (persist) a slate that meets the minimum, so a failed attempt can be retried cleanly.
  if (slate.ok) {
    legs.push(...r.added)
    await saveAllGames(games, SPORT_LABELS)
    await writeJsonl(legsFile(), legs, 'leg_id')
  }

  const problems = []
  if (!slate.ok) problems.push(`only ${slate.count} qualified legs on the slate (need ${slate.min})`)
  if (r.unmatched.length) problems.push(`${r.unmatched.length} pick(s) could not be linked to a tracked game`)
  const invalid = validateData({ games, legs })
  if (invalid.length) problems.push(`data validation failed: ${invalid.slice(0, 5).join('; ')}`)

  console.log(`Linked ${r.added.length} new legs, ${r.passes} passed games recorded, ${slate.count} qualified legs`)
  const status = withCounts(await loadStatus(), games, legs, now)
  await writeJson(statusFile(), recordRun(status, { run: 'pick', ok: !problems.length, now, etDate: pickDate, details: { legs: slate.count, new_legs: r.added.length, passed_games: r.passes }, errors: problems.map((message) => ({ message })) }))
  if (problems.length) throw new Error(problems.join(' | '))
})
