# Hybrid Value Betting System

## Full stack app

This repo includes:
- React + Vite front-end multi-page app
- Express backend with simulation endpoints
- live dashboard concept UI
- analytics and simulation modules

## Run frontend

```bash
npm install
npm run dev
```

## Run backend

```bash
cd server
npm install
npm run dev
```

## Endpoints

- GET /api/health
- GET /api/tickets
- GET /api/metrics
- POST /api/simulate
- POST /api/tickets/:name/resolve

## Daily Ticket Engine

The engine line-shops the configured bookmakers, de-vigs each equivalent market,
and combines those fair-price estimates (Pinnacle receives three times the weight
of other books). Power, Shin, and additive methods are available. An edge is
`model probability - implied probability at the best available price`; candidates
without a strictly positive edge are marked as no value and are not used to build
tickets. The default model is only a market-consensus baseline: it is not an
independent prediction model and does not prove that a bet has positive expected
value. With no independently supported edge, the UI says **No value found**.

American odds convert to raw implied probability as `100 / (odds + 100)` for
positive odds and `abs(odds) / (abs(odds) + 100)` for negative odds. Power
normalizes these probabilities proportionally; additive removes an equal share
of the overround and clamps/renormalizes longshot values; Shin solves for the
insider-trading parameter that normalizes probabilities. Vig is
`(sum of raw implied probabilities - 1) × 100`.

For custom probabilities, implement `ProbabilityModel` and pass it to
`fetchOddsAsLegs`. Keep its estimates independent of the price being evaluated
and validate them on out-of-sample results before treating an edge as actionable:

```ts
import { fetchOddsAsLegs, type ProbabilityModel } from './src/engine/oddsAdapter'

// Populate these from your own independently calibrated ratings model.
const modelProbabilities: Record<string, number> = {}
const model: ProbabilityModel = {
  estimate(leg) {
    const key = `${leg.gameId}:${leg.selection}`
    return modelProbabilities[key] ?? Number.NaN
  },
}

const legs = await fetchOddsAsLegs(undefined, undefined, model)
```

The menu retains two tiers for each strategy:

- **Lottery:** aims for 25 legs, but only includes legs that pass the edge filter.
  Its actual combined probability is shown; same-game probabilities are adjusted
  downward with a conservative 0.1 fallback correlation (or the supplied matrix).
  The heuristic multiplies the probability product by `1 - r + r × min(p1, p2)`
  per same-game pair. It is a conservative approximation, not a calibrated joint
  probability model. A 25-leg ticket is entertainment, not an investment vehicle.
  The displayed leg-price product is only an estimate; correlated sportsbook
  parlay pricing can differ and must be verified at the book.
- **Winnable:** searches from 3 through 12 eligible legs for a combined probability
  between 5% and 18%. If the pool cannot reach the range, it says so rather than
  padding with weak or negative-edge selections.

Fractional Kelly sizes a suggested stake from edge and offered odds, then applies a
5% daily bankroll exposure cap. Stakes are recommendations, not guarantees. Odds
snapshots record the taken and closing prices; CLV compares their decimal odds:
`(taken decimal / closing decimal - 1) × 100`. Brier score and reliability buckets
are computed from logged, resolved predictions only. Short histories are noisy,
and CLV or calibration does not guarantee future profit.

**Sharps win on straights with real edges; 25-leg tickets are entertainment.**
Parlays compound variance and same-game outcomes are not independent.

Build and inspect the menu with:

```ts
import { generateDailyMenu } from './src/engine/ticketBuilder'

const menu = generateDailyMenu(legs, { lotteryLegs: 25, minProbability: 0.55 })
```

Set `VITE_ODDS_API_KEY` to load odds from The Odds API. Without a key (or if the
request fails), the UI uses the repository's sample picks, clearly marked as
sample data and without claiming an edge from the default model. A `VITE_` API
key is bundled into public frontend code; use a backend proxy for a private key.
