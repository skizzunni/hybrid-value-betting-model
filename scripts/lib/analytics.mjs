import { favoriteKey, passedGameOutcomes } from './picks.mjs'
import { computeCounts } from './status.mjs'
import { decimalOdds, impliedProb } from './grading.mjs'
import { MIN_SAMPLE } from './sports.mjs'
import { round, wilson } from './stats.mjs'

function noVigOutcomes(game) {
  const h2h = game.odds?.closing?.h2h
  if (!h2h) return null
  const entries = Object.entries(h2h).filter(([, p]) => typeof p === 'number')
  if (entries.length < 2) return null
  const probs = entries.map(([name, price]) => ({ name, p: impliedProb(price), price }))
  const total = probs.reduce((a, b) => a + b.p, 0)
  return probs.map((x) => ({ ...x, p: x.p / total }))
}

function outcomeKey(game, name) {
  return name === game.home ? 'home' : name === game.away ? 'away' : /^draw$/i.test(name) ? 'draw' : null
}

function bucketPrice(price) {
  if (price <= -300) return 'heavy fav (<= -300)'
  if (price <= -150) return 'fav (-299 to -150)'
  if (price < 0) return 'slight fav (-149 to -101)'
  if (price < 150) return 'slight dog (+100 to +149)'
  if (price < 300) return 'dog (+150 to +299)'
  return 'long shot (>= +300)'
}

const pct = (a, b) => (b ? round(a / b) : null)

function gameLevel(games) {
  const final = games.filter((g) => g.status === 'final' && g.result?.winner && g.result.winner !== 'no_contest')
  const fav = { favorite_wins: 0, underdog_wins: 0, draws: 0, n: 0 }
  const homeAway = { home_wins: 0, away_wins: 0, draws: 0, n: 0 }
  const priceBuckets = {}
  const calibration = {}
  const totals = {}

  for (const g of final) {
    const w = g.result.winner
    homeAway.n++
    if (w === 'home') homeAway.home_wins++
    else if (w === 'away') homeAway.away_wins++
    else homeAway.draws++

    const probs = noVigOutcomes(g)
    if (probs) {
      const fk = favoriteKey(g, g.odds.closing.h2h)
      if (fk) {
        fav.n++
        if (w === 'draw') fav.draws++
        else if (w === fk) fav.favorite_wins++
        else fav.underdog_wins++
      }
      for (const o of probs) {
        const key = outcomeKey(g, o.name)
        if (!key) continue
        const hit = w === key
        const b = Math.min(9, Math.floor(o.p * 10))
        const label = `${b * 10}-${b * 10 + 10}%`
        const c = (calibration[label] ||= { n: 0, market_prob_sum: 0, wins: 0 })
        c.n++
        c.market_prob_sum += o.p
        if (hit) c.wins++
        const pb = (priceBuckets[bucketPrice(o.price)] ||= { n: 0, wins: 0, profit_units: 0 })
        pb.n++
        if (hit) pb.wins++
        pb.profit_units += hit ? decimalOdds(o.price) - 1 : -1
      }
    }
    const r = g.result
    const line = g.odds?.closing?.totals?.Over?.line
    if (typeof line === 'number' && typeof r.home_score === 'number' && typeof r.away_score === 'number') {
      const t = (totals[g.sport] ||= { n: 0, over: 0, under: 0, push: 0 })
      const sum = r.home_score + r.away_score
      t.n++
      if (sum > line) t.over++
      else if (sum < line) t.under++
      else t.push++
    }
  }

  return {
    games_resolved: final.length,
    favorite_vs_underdog: { ...fav, favorite_win_rate: pct(fav.favorite_wins, fav.n) },
    home_away: { ...homeAway, home_win_rate: pct(homeAway.home_wins, homeAway.n) },
    price_buckets: Object.fromEntries(Object.entries(priceBuckets).map(([k, v]) => [k, { n: v.n, hit_rate: pct(v.wins, v.n), roi: round(v.profit_units / v.n) }])),
    market_calibration: Object.fromEntries(Object.entries(calibration).sort().map(([k, v]) => [k, { n: v.n, market_prob: round(v.market_prob_sum / v.n), actual: pct(v.wins, v.n) }])),
    totals_over_under: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, { ...v, over_rate: pct(v.over, v.over + v.under) }])),
  }
}

function segmentKey(leg, dim) {
  if (dim === 'sport') return leg.sport
  if (dim === 'market') return leg.market
  if (dim === 'side') return leg.odds < 0 ? 'favorite' : 'underdog'
  if (dim === 'price_bucket') return bucketPrice(leg.odds)
  return 'unknown'
}

// A segment is flagged only with >= MIN_SAMPLE resolved legs and a Wilson interval fully above (win condition)
// or below (lose condition) the break-even rate implied by the prices taken.
export function pickSegments(legs, minSample = MIN_SAMPLE) {
  const graded = legs.filter((l) => l.result === 'win' || l.result === 'loss')
  const dims = ['sport', 'market', 'side', 'price_bucket']
  const segments = []
  for (const dim of dims) {
    const groups = {}
    for (const l of graded) (groups[segmentKey(l, dim)] ||= []).push(l)
    for (const [value, ls] of Object.entries(groups)) {
      const n = ls.length
      const wins = ls.filter((l) => l.result === 'win').length
      const breakEven = ls.reduce((s, l) => s + impliedProb(l.odds), 0) / n
      const ci = wilson(wins, n)
      let flag = 'insufficient_sample'
      if (n >= minSample) flag = ci.lower > breakEven ? 'win_condition' : ci.upper < breakEven ? 'lose_condition' : 'inconclusive'
      segments.push({
        dimension: dim, value, n, wins, hit_rate: round(wins / n), break_even: round(breakEven),
        wilson_lower: round(ci.lower), wilson_upper: round(ci.upper),
        roi: round(ls.reduce((s, l) => s + l.profit_units, 0) / n), flag,
      })
    }
  }
  return segments
}

function pickLevel(legs, games) {
  const graded = legs.filter((l) => l.result === 'win' || l.result === 'loss')
  const modeled = graded.filter((l) => typeof l.fair_prob === 'number')
  const brier = (f) => (modeled.length ? round(modeled.reduce((s, l) => s + (f(l) - (l.result === 'win' ? 1 : 0)) ** 2, 0) / modeled.length) : null)
  const withClv = legs.filter((l) => typeof l.clv_pct === 'number')
  const segments = pickSegments(legs)
  const byId = new Map(games.flatMap((g) => [[g.id, g], ...(g.aliases || []).map((a) => [a, g])]))
  return {
    legs_total: legs.length,
    legs_graded: graded.length,
    legs_push_or_void: legs.filter((l) => l.result === 'push' || l.result === 'void').length,
    hit_rate: pct(graded.filter((l) => l.result === 'win').length, graded.length),
    roi: graded.length ? round(graded.reduce((s, l) => s + l.profit_units, 0) / graded.length) : null,
    model_vs_market: {
      n: modeled.length,
      model_brier: brier((l) => l.fair_prob),
      market_brier: brier((l) => impliedProb(l.odds)),
    },
    clv: {
      n: withClv.length,
      avg_clv_pct: withClv.length ? round(withClv.reduce((s, l) => s + l.clv_pct, 0) / withClv.length, 2) : null,
      beat_close_rate: pct(withClv.filter((l) => l.clv_pct > 0).length, withClv.length),
      lost_to_close: withClv.filter((l) => l.clv_pct < 0).length,
    },
    segments,
    win_conditions: segments.filter((s) => s.flag === 'win_condition'),
    lose_conditions: segments.filter((s) => s.flag === 'lose_condition'),
    passed_games: passedGameOutcomes(games),
    linked_legs_missing_game: legs.filter((l) => !byId.has(l.game_id)).length,
  }
}

export function buildAnalytics({ games, legs, now }) {
  const counts = computeCounts(games, legs, now)
  const by_sport = Object.fromEntries(
    Object.entries(counts.by_sport).map(([k, v]) => [k, { ...v, pct_resolved: pct(v.resolved, v.tracked) }]),
  )
  return {
    schema: 1,
    generated_at: now,
    min_sample: MIN_SAMPLE,
    coverage: { overall: { ...counts.overall, pct_resolved: pct(counts.overall.resolved, counts.overall.tracked) }, by_sport },
    games: gameLevel(games),
    picks: pickLevel(legs, games),
    disclaimer: 'Tracking measures past performance; it does not guarantee future profit. Parlays are high variance and 25-leg tickets are entertainment.',
  }
}
