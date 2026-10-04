import { samplePicks } from '../mockData'
import type { Leg, Sport } from './ticketBuilder'
import { americanToDecimal } from './ticketBuilder'

export interface ProbabilityContext {
  sport: Sport
  gameId: string
  market: string
  selection: string
  americanOdds: number
  /** Vig-free implied probability from the quoting book. */
  noVigProbability: number
}

export interface ProbabilityModel {
  probability(ctx: ProbabilityContext): number
}

/** Baseline: no-vig implied probability (zero edge). */
export class DefaultProbabilityModel implements ProbabilityModel {
  probability(ctx: ProbabilityContext): number {
    return ctx.noVigProbability
  }
}

interface ApiOutcome {
  name: string
  price: number
  point?: number
}
interface ApiMarket {
  key: string
  outcomes: ApiOutcome[]
}
interface ApiEvent {
  id: string
  sport_key: string
  home_team: string
  away_team: string
  bookmakers?: { key: string; markets: ApiMarket[] }[]
}

const DEFAULT_SPORTS: Sport[] = ['basketball_nba', 'americanfootball_nfl', 'baseball_mlb', 'icehockey_nhl']
const MARKET_NAMES: Record<string, string> = { h2h: 'moneyline', spreads: 'spread', totals: 'total' }

function implied(american: number): number {
  const d = americanToDecimal(american)
  return Number.isFinite(d) ? 1 / d : NaN
}

function mapEvent(ev: ApiEvent, model: ProbabilityModel): Leg[] {
  const book = ev.bookmakers?.[0]
  if (!book) return []
  const legs: Leg[] = []
  for (const m of book.markets) {
    const market = MARKET_NAMES[m.key]
    if (!market) continue
    const total = m.outcomes.reduce((s, o) => s + implied(o.price), 0)
    if (!(total > 0)) continue
    for (const o of m.outcomes) {
      const p = implied(o.price)
      if (!Number.isFinite(p)) continue
      const selection = o.point !== undefined ? `${o.name} ${o.point}` : o.name
      const base = { sport: ev.sport_key, gameId: ev.id, market, selection, americanOdds: o.price }
      legs.push({
        id: `${ev.id}:${market}:${selection}`,
        ...base,
        teams: [ev.home_team, ev.away_team],
        modelProbability: model.probability({ ...base, noVigProbability: p / total }),
      })
    }
  }
  return legs
}

function sampleLegs(model: ProbabilityModel): Leg[] {
  return samplePicks.map((p) => {
    const gameId = p.title
    const market = p.market.toLowerCase()
    const base = { sport: p.sport, gameId, market, selection: p.side, americanOdds: p.odds }
    return {
      id: p.id,
      ...base,
      teams: p.title.split(/\s+vs\.?\s+/i).map((t) => t.trim()),
      // sample data carries its own probability; the model is only a fallback
      modelProbability: p.fair > 0 ? p.fair : model.probability({ ...base, noVigProbability: implied(p.odds) }),
    }
  })
}

export async function fetchOddsAsLegs(
  date?: string,
  sports: Sport[] = DEFAULT_SPORTS,
  model: ProbabilityModel = new DefaultProbabilityModel()
): Promise<Leg[]> {
  const apiKey = import.meta.env.VITE_ODDS_API_KEY as string | undefined
  if (!apiKey) return sampleLegs(model)
  try {
    const legs: Leg[] = []
    for (const sport of sports) {
      const params = new URLSearchParams({ apiKey, regions: 'us', markets: 'h2h,spreads,totals', oddsFormat: 'american' })
      if (date) {
        params.set('commenceTimeFrom', `${date}T00:00:00Z`)
        params.set('commenceTimeTo', `${date}T23:59:59Z`)
      }
      const res = await fetch(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/?${params}`)
      if (!res.ok) throw new Error(`Odds API ${res.status}`)
      const events = (await res.json()) as ApiEvent[]
      for (const ev of events) legs.push(...mapEvent(ev, model))
    }
    return legs.length ? legs : sampleLegs(model)
  } catch {
    return sampleLegs(model)
  }
}
