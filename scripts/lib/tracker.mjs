// Pure, deterministic logic for the daily picks system: candidate building,
// selection, tracking records, grading, post-mortems and the learning loop.
// Kept free of network/file side effects (except the small JSONL helpers at the bottom).
import fs from 'node:fs/promises'
import path from 'node:path'

export const MODEL_VERSION = 'consensus-devig-v1'
export const DAILY_LEGS = 25
export const MIN_EDGE = 0.005
export const MIN_SEGMENT_SAMPLE = 50
export const MAX_PER_SPORT = 10
export const WINDOW_START_HOUR_ET = 0
export const WINDOW_END_HOUR_ET = 8 // exclusive: 12:00 AM through 7:59 AM ET
export const PINNACLE_WEIGHT = 3

export const SPORT_KEYS = {
  NFL: 'americanfootball_nfl',
  NBA: 'basketball_nba',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
  Soccer: 'soccer_epl',
  UFC: 'mma_mixed_martial_arts',
}

export function sportLabel(sportKey) {
  const found = Object.entries(SPORT_KEYS).find(([, key]) => key === sportKey)
  return found ? found[0] : sportKey
}

export function americanToProb(odds) {
  if (!Number.isFinite(odds) || odds === 0) return NaN
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
}

const round = (value, digits = 4) => Number(value.toFixed(digits))

// ---------- Eastern Time helpers ----------

export function easternParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type) => parts.find((p) => p.type === type).value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

export function inGenerationWindow(date) {
  const { hour } = easternParts(date)
  return hour >= WINDOW_START_HOUR_ET && hour < WINDOW_END_HOUR_ET
}

// ---------- Candidates (honest edge: consensus no-vig vs best available price) ----------

function h2hMarket(book) {
  return (book.markets || []).find((m) => m.key === 'h2h') || null
}

export function buildCandidates(event, now = new Date()) {
  const start = Date.parse(event.commence_time)
  if (!Number.isFinite(start) || start <= now.getTime()) return []

  const weighted = new Map() // outcome -> { sum, weight }
  const best = new Map() // outcome -> { odds, book }
  let books = 0

  for (const book of event.bookmakers || []) {
    const market = h2hMarket(book)
    const outcomes = (market?.outcomes || []).filter((o) => Number.isFinite(o.price) && o.price !== 0)
    if (outcomes.length < 2) continue
    const implied = outcomes.map((o) => americanToProb(o.price))
    const total = implied.reduce((a, b) => a + b, 0)
    if (!(total > 0)) continue
    const weight = book.key === 'pinnacle' ? PINNACLE_WEIGHT : 1
    books += 1
    outcomes.forEach((o, i) => {
      const w = weighted.get(o.name) || { sum: 0, weight: 0 }
      w.sum += (implied[i] / total) * weight
      w.weight += weight
      weighted.set(o.name, w)
      const decimal = o.price > 0 ? 1 + o.price / 100 : 1 + 100 / -o.price
      const current = best.get(o.name)
      if (!current || decimal > current.decimal) {
        best.set(o.name, { odds: o.price, book: book.title || book.key, decimal })
      }
    })
  }

  if (books < 2) return [] // a consensus needs at least two books

  const candidates = []
  for (const [side, w] of weighted) {
    const modelProb = w.sum / w.weight
    const price = best.get(side)
    const impliedProb = americanToProb(price.odds)
    const edge = modelProb - impliedProb
    candidates.push({
      sport_key: event.sport_key,
      sport: sportLabel(event.sport_key),
      event_id: event.id,
      event: `${event.away_team} @ ${event.home_team}`,
      commence_time: event.commence_time,
      market: 'h2h',
      side,
      odds: price.odds,
      book: price.book,
      implied_prob: round(impliedProb),
      model_prob: round(modelProb),
      edge: round(edge),
      n_books: books,
    })
  }
  return candidates
}

export function oddsBucket(odds) {
  if (odds <= -250) return 'heavy_favorite'
  if (odds < -119) return 'favorite'
  if (odds < 120) return 'pickem'
  if (odds < 250) return 'underdog'
  return 'long_shot'
}

export function edgeBand(edge) {
  if (edge < 0.01) return '0.5-1%'
  if (edge < 0.02) return '1-2%'
  if (edge < 0.04) return '2-4%'
  return '4%+'
}

export function roleOf(odds) {
  return odds < 0 ? 'favorite' : 'underdog'
}

export function tagPick(p) {
  return { role: roleOf(p.odds), odds_bucket: oddsBucket(p.odds), edge_band: edgeBand(p.edge) }
}

export function segmentKeys(p) {
  const t = p.tags || tagPick(p)
  return [
    `sport:${p.sport}`,
    `market:${p.market}`,
    `role:${t.role}`,
    `odds:${t.odds_bucket}`,
    `edge:${t.edge_band}`,
    `sport+role:${p.sport}/${t.role}`,
  ]
}

// ---------- Learning loop ----------

export function wilson(wins, n, z = 1.96) {
  if (!n) return { lower: 0, upper: 1 }
  const p = wins / n
  const denom = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half) }
}

export function profitUnits(units, odds, result) {
  if (result === 'push') return 0
  if (result === 'loss') return -units
  return round(odds > 0 ? (units * odds) / 100 : (units * 100) / -odds)
}

/** records: [{ pick, result }] where result.result in win|loss|push */
export function summarizeSegments(records) {
  const map = new Map()
  for (const { pick, result } of records) {
    if (!result || (result.result !== 'win' && result.result !== 'loss' && result.result !== 'push')) continue
    for (const key of segmentKeys(pick)) {
      const s = map.get(key) || { key, n: 0, wins: 0, losses: 0, pushes: 0, staked: 0, profit: 0, impliedSum: 0, modelSum: 0, brier: 0, clvSum: 0, clvN: 0 }
      s.n += 1
      s.impliedSum += pick.implied_prob
      s.modelSum += pick.model_prob
      if (result.result === 'push') {
        s.pushes += 1
      } else {
        const hit = result.result === 'win' ? 1 : 0
        s.wins += hit
        s.losses += 1 - hit
        s.staked += pick.units
        s.profit += profitUnits(pick.units, pick.odds, result.result)
        s.brier += (pick.model_prob - hit) ** 2
      }
      if (Number.isFinite(result.clv)) {
        s.clvSum += result.clv
        s.clvN += 1
      }
      map.set(key, s)
    }
  }
  return [...map.values()]
    .map((s) => {
      const decided = s.wins + s.losses
      const ci = wilson(s.wins, decided)
      return {
        key: s.key,
        n: s.n,
        wins: s.wins,
        losses: s.losses,
        pushes: s.pushes,
        hit_rate: decided ? round(s.wins / decided) : null,
        hit_rate_ci: [round(ci.lower), round(ci.upper)],
        avg_implied_prob: round(s.impliedSum / s.n),
        avg_model_prob: round(s.modelSum / s.n),
        roi: s.staked ? round(s.profit / s.staked) : null,
        profit_units: round(s.profit, 2),
        brier: decided ? round(s.brier / decided) : null,
        avg_clv: s.clvN ? round(s.clvSum / s.clvN) : null,
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key))
}

/** A segment is a win/lose condition only with enough sample and a CI that excludes the price-implied rate. */
export function findConditions(segments, minSample = MIN_SEGMENT_SAMPLE) {
  const win = []
  const lose = []
  for (const s of segments) {
    if (s.n < minSample || s.hit_rate === null) continue
    if (s.hit_rate_ci[0] > s.avg_implied_prob && (s.roi ?? 0) > 0) win.push(s)
    else if (s.hit_rate_ci[1] < s.avg_implied_prob && (s.roi ?? 0) < 0) lose.push(s)
  }
  return { win, lose }
}

export function segmentWeights(segments, minSample = MIN_SEGMENT_SAMPLE) {
  const { win, lose } = findConditions(segments, minSample)
  return { win: new Set(win.map((s) => s.key)), lose: new Set(lose.map((s) => s.key)) }
}

/** 0 = cut, 1 = neutral (weak evidence stays conservative), 1.25 = emphasised. */
export function pickWeight(pick, weights) {
  const keys = segmentKeys(pick)
  if (keys.some((k) => weights.lose.has(k))) return 0
  if (keys.some((k) => weights.win.has(k))) return 1.25
  return 1
}

// ---------- Selection ----------

export function confidenceOf(edge) {
  return edge >= 0.03 ? 'High' : edge >= 0.015 ? 'Medium' : 'Low'
}

export function selectDaily(candidates, weights = { win: new Set(), lose: new Set() }, { count = DAILY_LEGS, maxPerSport = MAX_PER_SPORT, minEdge = MIN_EDGE } = {}) {
  const scored = candidates
    .filter((c) => c.edge >= minEdge && c.model_prob >= 0.05)
    .map((c) => ({ c, weight: pickWeight(c, weights) }))
    .filter((x) => x.weight > 0)
    .map((x) => ({ ...x, score: x.c.edge * x.weight }))
    .sort((a, b) => b.score - a.score || a.c.event_id.localeCompare(b.c.event_id) || a.c.side.localeCompare(b.c.side))

  const chosen = []
  const events = new Set()
  const perSport = {}
  const take = (cap) => {
    for (const x of scored) {
      if (chosen.length >= count) return
      if (chosen.includes(x) || events.has(x.c.event_id)) continue
      if ((perSport[x.c.sport] || 0) >= cap) continue
      chosen.push(x)
      events.add(x.c.event_id)
      perSport[x.c.sport] = (perSport[x.c.sport] || 0) + 1
    }
  }
  take(2) // every sport with a qualified leg is represented first
  take(maxPerSport)
  take(Infinity) // relax the per-sport cap only if still short

  const picks = chosen.map((x) => ({
    ...x.c,
    confidence: confidenceOf(x.c.edge),
    units: x.c.edge >= 0.015 ? 1 : 0.5,
    tags: tagPick(x.c),
    weight: x.weight,
  }))
  const reason = picks.length < count
    ? `Only ${picks.length} of ${count} eligible legs (edge >= ${(minEdge * 100).toFixed(1)}%, not cut by learning); ${candidates.length} candidates, ${scored.length} qualified`
    : null
  return { picks, shortfall: count - picks.length, reason }
}

export function makePickRecord(pick, { now, runDate }) {
  return {
    id: [runDate, pick.sport_key, pick.event_id, pick.market, pick.side].join('|'),
    run_date: runDate,
    created_at: now.toISOString(),
    model_version: MODEL_VERSION,
    source: 'consensus-devig+line-shopping',
    ...pick,
  }
}

// ---------- Grading ----------

/** scoreEvent: Odds API scores item { completed, home_team, away_team, scores:[{name,score}] } */
export function gradePick(pick, scoreEvent) {
  if (!scoreEvent || !scoreEvent.completed || !Array.isArray(scoreEvent.scores) || scoreEvent.scores.length < 2) return null
  const scores = scoreEvent.scores.map((s) => ({ name: s.name, score: Number(s.score) }))
  if (scores.some((s) => !Number.isFinite(s.score))) return null
  const top = Math.max(...scores.map((s) => s.score))
  const leaders = scores.filter((s) => s.score === top)
  let result
  if (leaders.length > 1) {
    if (pick.side === 'Draw') result = 'win'
    else result = pick.sport === 'Soccer' ? 'loss' : 'push'
  } else {
    result = leaders[0].name === pick.side ? 'win' : 'loss'
  }
  return {
    id: pick.id,
    result,
    profit_units: profitUnits(pick.units, pick.odds, result),
    scores: Object.fromEntries(scores.map((s) => [s.name, s.score])),
    outcome_source: 'the-odds-api/scores',
  }
}

export function closingRecord(pick, closingProb, closingOdds, now) {
  if (!Number.isFinite(closingProb)) return null
  return {
    id: pick.id,
    type: 'closing',
    closing_odds: closingOdds,
    closing_prob: round(closingProb),
    clv: round(closingProb - pick.implied_prob),
    captured_at: now.toISOString(),
  }
}

// ---------- Post-mortems ----------

export function postmortemPick(pick, result, { sameSportLossesToday = 0 } = {}) {
  const t = pick.tags || tagPick(pick)
  const tags = [t.role, t.odds_bucket, `edge_${t.edge_band}`, pick.sport, pick.market]
  const clv = Number.isFinite(result.clv) ? result.clv : null
  let cause
  if (result.result === 'win') cause = clv !== null && clv < -0.01 ? 'won_despite_bad_price' : 'won'
  else if (result.result === 'push') cause = 'push'
  else if (clv !== null && clv < -0.01) cause = 'bad_price'
  else if (sameSportLossesToday >= 3) cause = 'correlated_sport_day'
  else if (clv !== null && clv >= 0.01) cause = 'good_price_variance'
  else cause = 'variance_or_unknown'
  if (cause === 'correlated_sport_day') tags.push('correlation')
  if (clv !== null) tags.push(clv >= 0 ? 'clv_positive' : 'clv_negative')
  return { cause, tags }
}

export function reliabilityBuckets(records, width = 0.1) {
  const buckets = new Map()
  for (const { pick, result } of records) {
    if (result.result !== 'win' && result.result !== 'loss') continue
    const index = Math.floor(Math.min(0.999, pick.model_prob) / width + 1e-9)
    const key = String(index).padStart(3, '0')
    const b = buckets.get(key) || { bucket: `${(index * width).toFixed(1)}-${((index + 1) * width).toFixed(1)}`, n: 0, predicted: 0, wins: 0 }
    b.n += 1
    b.predicted += pick.model_prob
    b.wins += result.result === 'win' ? 1 : 0
    buckets.set(key, b)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, b]) => b)
    .map((b) => ({ bucket: b.bucket, n: b.n, predicted: round(b.predicted / b.n), observed: round(b.wins / b.n) }))
}

export function buildReport(picks, results, { now = new Date(), minSample = MIN_SEGMENT_SAMPLE } = {}) {
  const byId = new Map(results.map((r) => [r.id, r]))
  const joined = picks.map((pick) => ({ pick, result: byId.get(pick.id) }))
  const graded = joined.filter((r) => r.result && r.result.result)
  const lossesBySportDay = {}
  for (const { pick, result } of graded) {
    if (result.result === 'loss') {
      const k = `${pick.run_date}|${pick.sport}`
      lossesBySportDay[k] = (lossesBySportDay[k] || 0) + 1
    }
  }
  const causes = {}
  for (const { pick, result } of graded) {
    const { cause } = postmortemPick(pick, result, { sameSportLossesToday: lossesBySportDay[`${pick.run_date}|${pick.sport}`] || 0 })
    causes[cause] = (causes[cause] || 0) + 1
  }
  const segments = summarizeSegments(graded)
  const overall = summarizeSegments(graded.map((r) => ({ ...r, pick: { ...r.pick, sport: 'ALL', tags: { role: 'all', odds_bucket: 'all', edge_band: 'all' } } })))
    .find((s) => s.key === 'sport:ALL') || null
  const { win, lose } = findConditions(segments, minSample)
  return {
    generated_at: now.toISOString(),
    min_segment_sample: minSample,
    total_picks: picks.length,
    graded: graded.length,
    pending: picks.length - graded.length,
    overall,
    win_conditions: win,
    lose_conditions: lose,
    loss_causes: causes,
    reliability: reliabilityBuckets(graded),
    segments,
    note: graded.length < minSample
      ? `Only ${graded.length} graded picks; no segment is flagged until it has ${minSample}+ results.`
      : 'Segments are flagged only with sufficient sample and a confidence interval excluding the price-implied rate.',
  }
}

// ---------- JSONL persistence ----------

export async function readJsonl(file) {
  let text
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  return text.split('\n').filter((l) => l.trim()).map((l, i) => {
    try {
      return JSON.parse(l)
    } catch {
      throw new Error(`${file}: invalid JSON on line ${i + 1}`)
    }
  })
}

export async function appendJsonl(file, rows) {
  if (!rows.length) return
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.appendFile(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
}

/** Merge append-only result rows (result + closing) into one object per pick id. */
export function mergeResults(rows) {
  const map = new Map()
  for (const { type, ...row } of rows) {
    map.set(row.id, { ...(map.get(row.id) || {}), ...row })
  }
  return [...map.values()]
}
