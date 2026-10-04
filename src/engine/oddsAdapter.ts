import { samplePicks } from '../mockData'
import { consensusNoVig } from './devig'
import { addEdgeInformation, type LegWithEdge } from './edgeFilter'
import type { Leg, Sport } from './ticketBuilder'
import { americanToDecimal } from './ticketBuilder'
import { saveSnapshot } from './oddsSnapshots'
import { trackPrediction } from './calibration'

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
    if (!leg.americanOdds) return Number.NaN
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

interface ApiBook {
  key: string
  title: string
  markets: ApiMarket[]
}

interface ApiEvent {
  id: string
  sport_key: string
  home_team: string
  away_team: string
  bookmakers?: ApiBook[]
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
  return Number.isFinite(decimal) ? 1 / decimal : Number.NaN
}

function estimate(model: ProbabilityModel, leg: Partial<Leg>, context: ProbabilityContext): number {
  const result = typeof model.estimate === 'function'
    ? model.estimate(leg)
    : model.probability?.(context) ?? Number.NaN
  return Number.isFinite(result) && result >= 0 && result <= 1 ? result : Number.NaN
}

function outcomeKey(outcome: ApiOutcome): string {
  return `${outcome.name}|${outcome.point ?? ''}`
}

function mapEvent(event: ApiEvent, model: ProbabilityModel): LegWithEdge[] {
  const groupedMarkets = new Map<string, { book: ApiBook; market: ApiMarket }[]>()
  for (const book of event.bookmakers ?? []) {
    for (const market of book.markets) {
      if (!MARKET_NAMES[market.key] || !market.outcomes.length) continue
      const outcomeSet = market.outcomes.map(outcomeKey).sort().join(',')
      const groupKey = `${market.key}|${outcomeSet}`
      groupedMarkets.set(groupKey, [...(groupedMarkets.get(groupKey) ?? []), { book, market }])
    }
  }

  const legs: Leg[] = []
  for (const marketBooks of groupedMarkets.values()) {
    const { market: referenceMarket } = marketBooks[0]
    const mappedMarket = MARKET_NAMES[referenceMarket.key]
    const orderedOutcomes = [...referenceMarket.outcomes].sort((a, b) => outcomeKey(a).localeCompare(outcomeKey(b)))
    const consensusBooks = marketBooks.map(({ book, market }) => ({
      key: book.key,
      title: book.title,
      market: {
        outcomes: orderedOutcomes.map((outcome) => ({
          odds: market.outcomes.find((candidate) => outcomeKey(candidate) === outcomeKey(outcome))?.price ?? Number.NaN,
        })),
      },
    }))
    const consensus = consensusNoVig(consensusBooks, 'power')
    const booksUsed = marketBooks.map(({ book }) => book.title)
    for (let index = 0; index < orderedOutcomes.length; index += 1) {
      const outcome = orderedOutcomes[index]
      const available = marketBooks.flatMap(({ book, market }) => {
        const price = market.outcomes.find((candidate) => outcomeKey(candidate) === outcomeKey(outcome))?.price
        return typeof price === 'number' ? [{ book, price }] : []
      })
      const best = available.reduce((selected, entry) => (
        americanToDecimal(entry.price) > americanToDecimal(selected.price) ? entry : selected
      ), available[0])
      const noVig = consensus[index]
      if (!best || !Number.isFinite(noVig)) continue
      const selection = outcome.point === undefined ? outcome.name : `${outcome.name} ${outcome.point}`
      const base = {
        sport: event.sport_key,
        gameId: event.id,
        market: mappedMarket,
        selection,
        americanOdds: best.price,
        bestPrice: best.price,
      }
      const context: ProbabilityContext = { ...base, noVigProbability: noVig }
      const leg: Leg = {
        id: `${event.id}:${mappedMarket}:${selection}`,
        ...base,
        teams: [event.home_team, event.away_team],
        modelProbability: estimate(model, { ...base, modelProbability: noVig }, context),
        bookmarksUsed: booksUsed,
      }
      if (Number.isFinite(leg.modelProbability)) {
        legs.push(leg)
        saveSnapshot({ ...leg, bestPrice: best.price }, best.book.title)
        trackPrediction(leg.id, leg.modelProbability)
      }
    }
  }
  return addEdgeInformation(legs)
}

function sampleLegs(model: ProbabilityModel): LegWithEdge[] {
  const legs = samplePicks.map((pick): Leg => {
    const gameId = pick.title
    const market = pick.market.toLowerCase()
    const base = {
      sport: pick.sport,
      gameId,
      market,
      selection: pick.side,
      americanOdds: pick.odds,
      bestPrice: pick.odds,
    }
    const noVig = implied(pick.odds)
    const context: ProbabilityContext = { ...base, noVigProbability: noVig }
    const leg: Leg = {
      id: pick.id,
      ...base,
      teams: pick.title.split(/\s+vs\.?\s+/i).map((team) => team.trim()),
      modelProbability: estimate(model, { ...base, modelProbability: noVig }, context),
      bookmarksUsed: ['Sample data (not live)'],
    }
    if (Number.isFinite(leg.modelProbability)) {
      saveSnapshot(leg, 'Sample data (not live)')
      trackPrediction(leg.id, leg.modelProbability)
    }
    return leg
  })
  return addEdgeInformation(legs)
}

export async function fetchOddsAsLegs(
  date?: string,
  sports: Sport[] = DEFAULT_SPORTS,
  model: ProbabilityModel = new DefaultProbabilityModel(),
): Promise<LegWithEdge[]> {
  const apiKey = import.meta.env.VITE_ODDS_API_KEY
  if (!apiKey) return sampleLegs(model)

  try {
    const legs: LegWithEdge[] = []
    for (const sport of sports) {
      const params = new URLSearchParams({
        apiKey,
        regions: 'us,us2,eu,uk,au',
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
