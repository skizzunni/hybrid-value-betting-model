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

## Daily picks, tracking and learning

Outputs are not guaranteed, and parlays are high variance. A 25-leg ticket almost never hits.

- `scripts/generate-picks.mjs` posts **25 legs/day across NFL, NBA, MLB, NHL, EPL and UFC**. Edge is
  `consensus no-vig probability (Pinnacle x3) - implied probability at the best available price`
  (line-shopping value, not proof of positive EV). It only runs in the **12:00-8:00 AM ET** window and once per ET date;
  `.github/workflows/daily-picks.yml` schedules several UTC crons to cover EDT/EST. If fewer than 25 legs qualify, it
  writes `data/status.json` with the reason and fails the job.
- `data/picks-log.jsonl` (append-only) stores every pick; `data/results.jsonl` stores grades (win/loss/push, scores,
  resolution time) and closing lines/CLV. `data/report.json` holds segment stats (sport, market, favorite/underdog, odds bucket,
  edge band), calibration buckets, loss causes, and win/lose conditions.
- `scripts/grade-picks.mjs` (also run every 3 hours by `grade-picks.yml`) grades from The Odds API scores endpoint
  (needs a plan that includes it; 3-day lookback) and captures closing lines before start.
- Learning: a segment needs 50+ graded results and a Wilson interval excluding the price-implied rate before it is flagged.
  Losing segments are cut from future slates, winning ones get a 1.25x score; otherwise selection stays neutral.

Run locally: `ODDS_API_KEY=... node scripts/generate-picks.mjs --force` and `node scripts/grade-picks.mjs`.

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

## Game-level tracking and automatic results

Every game on the slate for NFL, NBA, MLB, NHL, EPL soccer and UFC is stored, not only the games the model picked. This layer is additive: it reads `src/generated/picks.json` and does not change the pick generator.

### Data layout (committed, diff-friendly, stable key order)

| Path | Contents |
| --- | --- |
| `data/games/<Sport>.jsonl` | One record per event, keyed by The Odds API event id (`aliases` holds changed ids): sport, league, home/away (or fighters), `commence_time`, `status` (`scheduled`, `in_progress`, `final`, `postponed`, `cancelled`), `result` (scores, `winner` = `home`/`away`/`draw`/`no_contest`, source), `odds.opening/latest/closing` (moneyline, spread, total) plus per-book `books`, `decisions` (picked/passed with reason per pick date), `audit` corrections, and `first_seen` / `last_updated` / `resolved_at`. |
| `data/pick-legs.jsonl` | One record per published leg, joined to a game by `game_id`: odds taken, model probability, `result` (win/loss/push/void), profit, closing odds and CLV, audit trail. Published fields are never rewritten; only result fields change. |
| `data/analytics.json` | Coverage per sport, favorite vs underdog, home/away, price buckets, totals over/under, market calibration across all games, model vs market Brier, CLV, passed-game outcomes, win/lose conditions. |
| `data/tracking-status.json` | Last pick run, last results run, last evening refresh, counts of tracked/resolved/unresolved/stale games and errors. The Analytics and Post-mortems pages read this and label the data live, sample (nothing tracked yet) or stale (no results refresh for 36 hours). |

Moneyline, spread and total outcomes resolve to win / loss / push / void. Postponed and cancelled games void; soccer is three-way (a draw loses a team moneyline and wins a `Draw` pick); a tie in a two-way market, including a UFC draw, pushes; UFC no-contests void; overtime scores count. A ticket loses on any lost leg and drops pushed or voided legs. A game with no result seven days after start is voided with an audit entry. If an Odds API event id changes for the same fixture, the new id is stored as an alias.

Scores come from The Odds API scores endpoint (one request per sport covering all pending games, `daysFrom` capped at 3 and skipped when nothing is pending), with ESPN public scoreboards as the fallback for UFC, games older than three days, and any Odds API failure (one date-range request per sport, memoized per run). Re-running is idempotent: unchanged results are skipped, changed results are written as audited corrections. Closing-line value uses the last odds snapshot before commence; odds freeze at start time.

A segment is flagged a win or lose condition only with at least 50 resolved legs and a Wilson interval entirely above or below the break-even rate implied by the prices taken.

The game-tracking layer builds on the pick log above (`data/picks-log.jsonl`, `results.jsonl`, `report.json`, `data/status.json` for the pick run). It keeps its own `data/tracking-status.json` so it never collides with the generator's `data/status.json`; pick legs are joined to games through the event id in each pick id.

### Workflow schedule (Eastern Time)

GitHub cron is UTC and ignores DST, so each workflow fires at several UTC hours and `scripts/et-guard.mjs` checks the real `America/New_York` clock.

- `daily-picks.yml`: triggers hourly 04:17 to 13:17 UTC. It proceeds only when the ET hour is 0 to 7 and picks have not already succeeded for that ET date, so it runs once per ET day inside midnight to 8 AM ET and a failed attempt is retried by later triggers. Order: resolve outcomes and refresh analytics, track the slate, grade the pick log, generate picks, link picks to games and verify at least 25 qualified legs.
- `results-refresh.yml`: results only, triggers 23:20 to 04:20 UTC; the guard allows ET hours 18 to 23, once per ET day. It never runs the generator or alters published picks.
- Both share the `data-writes` concurrency group (no overlap), use `contents: write` and `issues: write` only, and commit with rebase-and-retry on push conflicts (`scripts/commit-data.sh`).
- A non-zero exit, an issue labelled `pipeline-failure`, and `data/tracking-status.json` flag: odds fetch failure, score failure for a sport with pending games, games still unresolved more than 8 hours after start, data validation failure, or fewer than 25 qualified legs.

Manual runs: `workflow_dispatch` with `force` skips the window guard. Locally: `node scripts/resolve-results.mjs`, `node scripts/track-games.mjs`, `node scripts/link-picks.mjs` (set `ODDS_API_KEY`).

### Required secret and limitations

- `ODDS_API_KEY` must be a plan that includes the scores endpoint. Each run spends roughly one odds request per sport plus one scores request per sport with pending games.
- ESPN scoreboards are an unofficial public API and team/fighter names are matched by normalized name and start time; unmatched games stay unresolved and show up as stale.
- Passed-game reasons come from a `passed` array in `picks.json` when the generator supplies one; otherwise they are inferred (`not_selected`, `no_moneyline_market`).
- Tracking measures performance and does not guarantee future profit. No outcome is guaranteed, parlays are high variance, and 25-leg tickets are entertainment.

## Deploying on Render (SPA routing)

`render.yaml` declares a rewrite (`/*` -> `/index.html`) so that refreshing client-side routes such as `/tickets` works. If the service was created manually in the Render dashboard (not from the blueprint), `render.yaml` is ignored: add the rewrite under **Redirects/Rewrites** (Source `/*`, Destination `/index.html`, Action `Rewrite`).
