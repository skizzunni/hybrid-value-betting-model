#!/usr/bin/env node
// Fetch today's odds for every supported sport and upsert one durable record per event.
import { fetchOdds } from './lib/api.mjs'
import { upsertGames } from './lib/games.mjs'
import { loadAllGames, saveAllGames } from './lib/io.mjs'
import { SPORTS, SPORT_LABELS } from './lib/sports.mjs'
import { runStep } from './lib/cli.mjs'

const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY

await runStep('results', async (now) => {
  if (!apiKey) throw new Error('ODDS_API_KEY is required')
  const games = await loadAllGames(SPORT_LABELS)
  const failures = []
  for (const label of SPORT_LABELS) {
    try {
      const { data, remaining } = await fetchOdds(SPORTS[label].key, apiKey)
      const r = upsertGames(games, data, now)
      console.log(`${label}: ${data.length} events (+${r.created} new, ${r.updated} updated)${remaining ? `, quota remaining ${remaining}` : ''}`)
    } catch (err) {
      failures.push(`${label}: ${err.message}`)
      console.error(`ERROR ${label}: ${err.message}`)
    }
  }
  await saveAllGames(games, SPORT_LABELS)
  if (failures.length) throw new Error(`odds fetch failed: ${failures.join('; ')}`)
})
