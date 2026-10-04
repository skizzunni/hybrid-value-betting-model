#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY

if (!apiKey) {
  console.error('ODDS_API_KEY is required')
  process.exit(1)
}

const SPORT_KEYS = {
  NFL: 'americanfootball_nfl',
  NBA: 'basketball_nba',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
  Soccer: 'soccer_epl',
  UFC: 'mma_mixed_martial_arts',
}

function americanOddsToProb(odds) {
  if (odds > 0) return 100 / (odds + 100)
  return -odds / (-odds + 100)
}

function parseMarket(event) {
  const bookmakers = event.bookmakers || []
  const outcomes = {}

  for (const book of bookmakers) {
    const market =
      (book.markets || []).find(
        (m) => m.key === 'h2h' || m.key === 'moneyline' || m.key === 'spreads'
      ) || null

    if (!market) continue

    for (const outcome of market.outcomes || []) {
      const name = outcome.name
      const price = outcome.price
      if (!outcomes[name] || Math.abs(price) < Math.abs(outcomes[name])) {
        outcomes[name] = price
      }
    }
  }

  const entries = Object.entries(outcomes)
  if (!entries.length) return null

  let best = null
  for (const [name, price] of entries) {
    const prob = americanOddsToProb(price)
    if (!best || prob < best.prob) {
      best = { name, price, prob }
    }
  }

  if (!best) return null

  const fair = Math.min(0.95, best.prob + 0.02)

  return {
    title: `${event.home_team} vs ${event.away_team}`,
    sport: event.sport_key || 'multi',
    market: 'Moneyline',
    side: best.name,
    odds: best.price,
    fair,
    edge: Number(((fair - best.prob) * 100).toFixed(2)),
    confidence: fair >= 0.7 ? 'High' : fair >= 0.62 ? 'Medium' : 'Low',
    units: fair >= 0.75 ? 2 : fair >= 0.7 ? 1.5 : 1,
    notes: [
      `Market implied ${(best.prob * 100).toFixed(1)}%`,
      `Model fair ${(fair * 100).toFixed(1)}%`,
      'High-probability side with matchup edge',
    ],
  }
}

async function fetchSport(sportKey) {
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?regions=us,eu&markets=moneyline,spreads,totals&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed ${sportKey}: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

async function main() {
  const generated = []

  for (const [label, sportKey] of Object.entries(SPORT_KEYS)) {
    try {
      const events = await fetchSport(sportKey)
      const picks = []

      for (const event of events || []) {
        const pick = parseMarket(event)
        if (pick) picks.push(pick)
      }

      const limited = picks.slice(0, 25)
      if (limited.length) {
        generated.push({
          id: sportKey,
          label: `${label} Moneylines`,
          note: `Live ${label} moneyline picks`,
          items: limited,
        })
      }
    } catch (err) {
      console.warn(`Skipping ${label}: ${err.message}`)
    }
  }

  const all = generated.flatMap((group) => group.items)

  generated.unshift({
    id: 'most-confident',
    label: 'Most Confident',
    note: 'Highest-probability picks across all sports',
    items: all.slice().sort((a, b) => b.fair - a.fair).slice(0, 25),
  })

  const output = {
    generated_at: new Date().toISOString(),
    groups: generated,
  }

  const outDir = path.join(process.cwd(), 'src', 'generated')
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(
    path.join(outDir, 'picks.json'),
    JSON.stringify(output, null, 2),
    'utf8'
  )

  console.log(`Wrote ${generated.length} groups with ${all.length} picks`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
