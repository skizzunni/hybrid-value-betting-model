import { samplePicks } from '../mockData'
import type { Leg, Sport } from './ticketBuilder'
import { americanToDecimal } from './ticketBuilder'

export interface ProbabilityContext {
  sport: Sport
  gameId: string
  market: string
  selection: string
  americanOdds: number
  noVigProbability: number
}

export interface ProbabilityModel {
  estimate(leg: Partial<Leg>): number
  probability?(context: ProbabilityContext): number
}

export class DefaultProbabilityModel implements ProbabilityModel {
  estimate(leg: Partial<Leg>): number {
    if (typeof leg.modelProbability === 'number') return leg.modelProbability
    if (!leg.americanOdds) return 0.5
    const odds = leg.americanOdds
    return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100)
  }

  probability(context: ProbabilityContext): number {
    return context.noVigProbability
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

const DEFAULT_SPORTS: Sport[] = [
  'basketball_nba',
  'americanfootball_nfl',
  'baseball_mlb',
  'icehockey_nhl',
]
const MARKET_NAMES: Record<string, string> = { h2h: 'moneyline', spreads: 'spread', totals: 'total' }

function implied(americanOdds: number): number {
  const decimal = americanToDecimal(americanOdds)
  return Number.isFinite(decimal) ? 1 / decimal : NaN
}

function estimate(model: ProbabilityModel, leg: Partial<Leg>, context: ProbabilityContext): number {
  if (typeof model.estimate === 'function') return model.estimate(leg)
  return model.probability?.(context) ?? Number.NaN
}

function mapEvent(event: ApiEvent, model: ProbabilityModel): Leg[] {
  const bookmaker = event.bookmakers?.[0]
  if (!bookmaker) return []

  const legs: Leg[] = []
  for (const market of bookmaker.markets) {
    const mappedMarket = MARKET_NAMES[market.key]
    if (!mappedMarket) continue
    const totalImplied = market.outcomes.reduce((sum, outcome) => sum + implied(outcome.price), 0)
    if (!(totalImplied > 0)) continue

    for (const outcome of market.outcomes) {
      const noVig = implied(outcome.price) / totalImplied
      if (!Number.isFinite(noVig)) continue
      const selection = outcome.point === undefined ? outcome.name : `${outcome.name} ${outcome.point}`
      const base = {
        sport: event.sport_key,
        gameId: event.id,
        market: mappedMarket,
        selection,
        americanOdds: outcome.price,
      }
      const context: ProbabilityContext = { ...base, noVigProbability: noVig }
      legs.push({
        id: `${event.id}:${mappedMarket}:${selection}`,
        ...base,
        teams: [event.home_team, event.away_team],
        modelProbability: estimate(model, { ...base, modelProbability: noVig }, context),
      })
    }
  }
  return legs
}

function sampleLegs(model: ProbabilityModel): Leg[] {
  return samplePicks.map((pick) => {
    const gameId = pick.title
    const market = pick.market.toLowerCase()
    const base = {
      sport: pick.sport,
      gameId,
      market,
      selection: pick.side,
      americanOdds: pick.odds,
    }
    const noVig = pick.fair > 0 ? pick.fair : implied(pick.odds)
    const context: ProbabilityContext = { ...base, noVigProbability: noVig }
    return {
      id: pick.id,
      ...base,
      teams: pick.title.split(/\s+vs\.?\s+/i).map((team) => team.trim()),
      modelProbability: estimate(model, { ...base, modelProbability: noVig }, context),
    }
  })
}

export async function fetchOddsAsLegs(
  date?: string,
  sports: Sport[] = DEFAULT_SPORTS,
  model: ProbabilityModel = new DefaultProbabilityModel(),
): Promise<Leg[]> {
  const apiKey = import.meta.env.VITE_ODDS_API_KEY
  if (!apiKey) return sampleLegs(model)

  try {
    const legs: Leg[] = []
    for (const sport of sports) {
      const params = new URLSearchParams({
        apiKey,
        regions: 'us',
        markets: 'h2h,spreads,totals',
        oddsFormat: 'american',
      })
      if (date) {
        params.set('commenceTimeFrom', `${date}T00:00:00Z`)
        params.set('commenceTimeTo', `${date}T23:59:59Z`)
      }
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds/?${params}`,
        { signal: AbortSignal.timeout(10_000) },
      )
      if (!response.ok) throw new Error(`Odds API ${response.status}`)
      const events = await response.json() as ApiEvent[]
      for (const event of events) legs.push(...mapEvent(event, model))
    }
    return legs.length ? legs : sampleLegs(model)
  } catch {
    return sampleLegs(model)
  }
}
