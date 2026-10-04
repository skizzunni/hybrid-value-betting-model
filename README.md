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

The frontend ticket engine builds two kinds of tickets for each configured strategy:

- **Lottery:** aims for 25 legs. Their combined probability is the actual product of the leg probabilities, so a 25-leg ticket will generally have an astronomically low chance of winning.
- **Winnable:** searches from 3 through 12 legs for a combined probability between 5% and 18%. If the available legs and constraints cannot reach that range, the menu labels the best available result instead of presenting it as in range.

The default probability model uses the no-vig market probability; it does not claim an edge over the market. To provide another model, implement `ProbabilityModel` and pass it to `fetchOddsAsLegs`:

```ts
import { americanToDecimal } from './src/engine/ticketBuilder'
import { fetchOddsAsLegs, type ProbabilityModel } from './src/engine/oddsAdapter'

const model: ProbabilityModel = {
  estimate(leg) {
    return leg.americanOdds ? 1 / americanToDecimal(leg.americanOdds) : Number.NaN
  },
}

const legs = await fetchOddsAsLegs(undefined, undefined, model)
```

Build and inspect the menu with:

```ts
import { generateDailyMenu } from './src/engine/ticketBuilder'

const menu = generateDailyMenu(legs, { lotteryLegs: 25, minProbability: 0.55 })
```

## Straights vs Parlays

Straights and parlays follow different selection rules (`mode: 'parlays' | 'straights' | 'mixed'`, default `mixed`):

- **Parlays** keep the >= 55% probability floor, correlation caps and lottery/winnable logic. A long ticket needs legs that win often.
- **Straights** use edge only (`filterByEdgeOnly`, default minimum edge 0.5%). There is no probability floor, so underdogs qualify.

Profits come from finding price edges, not from picking winners. Underdogs can be profitable if they're underpriced. Example: a +150 dog implies 40%; if its true chance is 42%, it is a +EV straight bet (edge +2%). It has a 58% chance of losing, so it would drag down a 25-leg parlay, which needs every leg to win.

How to evaluate them: judge by edge and by closing-line value, not by hit rate. Underdog results are high variance (losing streaks are normal even with a real edge), so the Analytics page reports ROI, hit rate and edge by side (favorite, underdog) and needs hundreds of bets before it says anything. With the default market-based model there is no edge over the market; underdog value only appears when your own `ProbabilityModel` disagrees with the price.

Set `VITE_ODDS_API_KEY` to load odds from The Odds API. Without a key (or if the request fails), the UI uses the repository's sample picks.

## Deploying on Render (SPA routing)

`render.yaml` declares a rewrite (`/*` -> `/index.html`) so that refreshing client-side routes such as `/tickets` works. If the service was created manually in the Render dashboard (not from the blueprint), `render.yaml` is ignored: add the rewrite under **Redirects/Rewrites** (Source `/*`, Destination `/index.html`, Action `Rewrite`).
