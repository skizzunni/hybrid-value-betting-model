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

## Straights vs Parlays

Straights and parlays follow different selection rules (`mode: 'parlays' | 'straights' | 'mixed'`, default `mixed`):

- **Parlays** keep the >= 55% probability floor, correlation caps and lottery/winnable logic. A long ticket needs legs that win often.
- **Straights** use edge only (`filterByEdgeOnly`, default minimum edge 0.5%). There is no probability floor, so underdogs qualify.

Profits come from finding price edges, not from picking winners. Underdogs can be profitable if they're underpriced. Example: a +150 dog implies 40%; if its true chance is 42%, it is a +EV straight bet (edge +2%). It has a 58% chance of losing, so it would drag down a 25-leg parlay, which needs every leg to win.

How to evaluate them: judge by edge and by closing-line value, not by hit rate. Underdog results are high variance (losing streaks are normal even with a real edge), so the Analytics page reports ROI, hit rate and edge by side (favorite, underdog) and needs hundreds of bets before it says anything. With the default market-based model there is no edge over the market; underdog value only appears when your own `ProbabilityModel` disagrees with the price.

The UI uses repository sample picks without an API key (or if a request fails),
clearly marking sample data and never treating market consensus as an independent
model edge.

## Loss post-mortems and learning

When a result is logged, the browser stores one pick-time snapshot per ticket leg in versioned local storage. A snapshot captures the leg's odds, model/no-vig probabilities when available, edge, market, sport, side, ticket tier, strategy, data source and correlation group. Reusing the same pick on another ticket creates a separate record. Snapshots and outcomes stay in this browser; malformed or unavailable storage does not crash the engine.

The Post-mortems page can fetch completed scores from The Odds API scores endpoint using `VITE_ODDS_API_KEY`. Moneyline, spread and total outcomes are resolved from scores; users can also enter each leg's result manually when scores are unavailable. Pushes are retained as pushes and are removed from parlay odds when calculating the default return. Closing odds can be entered manually to calculate CLV. Missing scores, closing odds or pick-time evidence remain unknown; they are never filled with guessed causes.

Loss classification uses measured evidence only: pick-time edge, recorded CLV, measured line movement, resolved calibration history, shared-game losses and parlay probabilities. It cannot identify player, lineup or injury causes without a real data feed. Implement the `ContextProvider` interface in `src/engine/postmortem/context.ts` to attach sourced context notes to snapshots later; `noOpContextProvider` is the default and returns no notes.

Segments report sample count, predicted and observed hit rates, Brier score, ROI, CLV when known and Wilson confidence intervals. A leak requires at least 50 resolved bets by default and statistically significant underperformance. The optional probability adjustment is off by default; it uses empirical-Bayes shrinkage, is limited to a five percentage-point shift, and writes an evidence-backed change log that can be exported or reset. Single losses rarely mean the model was wrong. We only adjust on aggregated evidence. This system cannot guarantee winning.

## Deploying on Render (SPA routing)

`render.yaml` declares a rewrite (`/*` -> `/index.html`) so that refreshing client-side routes such as `/tickets` works. If the service was created manually in the Render dashboard (not from the blueprint), `render.yaml` is ignored: add the rewrite under **Redirects/Rewrites** (Source `/*`, Destination `/index.html`, Action `Rewrite`).
