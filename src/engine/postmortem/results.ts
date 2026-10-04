import { compareClosingValue } from '../clv'
import type { LegSnapshot } from './snapshot'
import { loadLegSnapshots, updateLegSnapshot } from './snapshot'

export type LegResult = 'win' | 'loss' | 'push' | 'unknown'

export interface FinalScore {
  gameId: string
  sport: string
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
}

export interface LegOutcome {
  legId: string
  result: Exclude<LegResult, 'unknown'>
  updatedAt: number
  source: 'scores' | 'manual'
}

export interface TicketSettlement {
  result: LegResult
  payout: number
  legsHit: number
  breakingLegs: number[]
}

export interface ScoreFetchResult {
  scores: FinalScore[]
  error?: string
}

const OUTCOME_STORAGE_KEY = 'hybrid.postmortem.outcomes.v1'

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function marketKind(market: string): 'moneyline' | 'spread' | 'total' | undefined {
  const key = normalize(market)
  if (['moneyline', 'h2h', 'money line'].includes(key)) return 'moneyline'
  if (['spread', 'spreads', 'handicap'].includes(key)) return 'spread'
  if (['total', 'totals', 'over/under', 'over under'].includes(key)) return 'total'
  return undefined
}

function selectedTeam(snapshot: LegSnapshot, score: FinalScore): 'home' | 'away' | undefined {
  const selection = normalize(snapshot.selection)
  const home = normalize(score.homeTeam)
  const away = normalize(score.awayTeam)
  if (selection === home || selection.startsWith(`${home} `) || selection.startsWith(`${home} (`)) return 'home'
  if (selection === away || selection.startsWith(`${away} `) || selection.startsWith(`${away} (`)) return 'away'
  return undefined
}

function selectionLine(selection: string): number | undefined {
  const match = selection.match(/([+-]?\d+(?:\.\d+)?)(?:\s*)$/)
  return match ? Number(match[1]) : undefined
}

export function resolveLeg(snapshot: LegSnapshot, finalScore?: FinalScore | null): LegResult {
  if (!finalScore || !Number.isFinite(finalScore.homeScore) || !Number.isFinite(finalScore.awayScore)) return 'unknown'
  const kind = marketKind(snapshot.market)
  if (!kind) return 'unknown'
  if (kind === 'moneyline') {
    const team = selectedTeam(snapshot, finalScore)
    if (!team) return 'unknown'
    if (finalScore.homeScore === finalScore.awayScore) return 'push'
    const teamWon = team === 'home'
      ? finalScore.homeScore > finalScore.awayScore
      : finalScore.awayScore > finalScore.homeScore
    return teamWon ? 'win' : 'loss'
  }
  if (kind === 'spread') {
    const team = selectedTeam(snapshot, finalScore)
    const line = selectionLine(snapshot.selection)
    if (!team || line === undefined || !Number.isFinite(line)) return 'unknown'
    const margin = team === 'home'
      ? finalScore.homeScore - finalScore.awayScore
      : finalScore.awayScore - finalScore.homeScore
    const adjusted = margin + line
    return adjusted === 0 ? 'push' : adjusted > 0 ? 'win' : 'loss'
  }
  const selection = normalize(snapshot.selection)
  const totalMatch = selection.match(/\b(over|under)\b/)
  const line = selectionLine(snapshot.selection)
  if (!totalMatch || line === undefined || !Number.isFinite(line)) return 'unknown'
  const total = finalScore.homeScore + finalScore.awayScore
  if (total === line) return 'push'
  const over = totalMatch[1] === 'over'
  return (over ? total > line : total < line) ? 'win' : 'loss'
}

export function settleTicket(snapshots: LegSnapshot[], results: LegResult[], stake: number): TicketSettlement {
  if (snapshots.length === 0 || snapshots.length !== results.length || !(stake > 0) || !Number.isFinite(stake)) {
    return { result: 'unknown', payout: 0, legsHit: 0, breakingLegs: [] }
  }
  const breakingLegs = results.flatMap((result, index) => result === 'loss' ? [index] : [])
  const legsHit = results.filter((result) => result === 'win').length
  if (breakingLegs.length > 0) return { result: 'loss', payout: 0, legsHit, breakingLegs }
  if (results.includes('unknown')) return { result: 'unknown', payout: 0, legsHit, breakingLegs }
  const allPush = results.every((result) => result === 'push')
  if (allPush) return { result: 'push', payout: stake, legsHit, breakingLegs }
  const odds = snapshots.reduce((product, snapshot, index) => {
    if (results[index] === 'push') return product
    const american = snapshot.takenAmericanOdds
    return product * (american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american))
  }, 1)
  return { result: 'win', payout: stake * odds, legsHit, breakingLegs }
}

export function loadLegOutcomes(): LegOutcome[] {
  try {
    const parsed: unknown = JSON.parse(getStorage()?.getItem(OUTCOME_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is LegOutcome =>
      !!item && typeof item === 'object' && typeof item.legId === 'string' &&
      ['win', 'loss', 'push'].includes(String(item.result)) &&
      Number.isFinite(item.updatedAt) && ['scores', 'manual'].includes(String(item.source)),
    )
  } catch {
    return []
  }
}

export function recordLegOutcome(legId: string, result: Exclude<LegResult, 'unknown'>, source: LegOutcome['source'] = 'manual'): LegOutcome {
  const outcome: LegOutcome = { legId, result, updatedAt: Date.now(), source }
  const outcomes = loadLegOutcomes().filter((item) => item.legId !== legId)
  try {
    getStorage()?.setItem(OUTCOME_STORAGE_KEY, JSON.stringify([...outcomes, outcome]))
  } catch {
    return outcome
  }
  return outcome
}

export function resolveScoreFeed(scores: FinalScore[], snapshots = loadLegSnapshots()): LegOutcome[] {
  const byGame = new Map(scores.map((score) => [`${score.sport}:${score.gameId}`, score]))
  const resolved: LegOutcome[] = []
  for (const snapshot of snapshots) {
    const score = byGame.get(`${snapshot.sport}:${snapshot.gameId}`)
    if (!score) continue
    const result = resolveLeg(snapshot, score)
    if (result !== 'unknown') resolved.push(recordLegOutcome(snapshot.legId, result, 'scores'))
  }
  return resolved
}

interface ApiScore {
  id?: string
  sport_key?: string
  home_team?: string
  away_team?: string
  completed?: boolean
  scores?: Array<{ name?: string; score?: string }>
}

export async function fetchLatestScores(sports?: string[]): Promise<ScoreFetchResult> {
  const apiKey = import.meta.env.VITE_ODDS_API_KEY
  if (!apiKey) return { scores: [], error: 'Scores unavailable: VITE_ODDS_API_KEY is not configured.' }
  const sportsToFetch = sports?.length ? [...new Set(sports)] : [...new Set(loadLegSnapshots().map((item) => item.sport))]
  if (!sportsToFetch.length) return { scores: [], error: 'No saved sports are available to check.' }
  const scores: FinalScore[] = []
  try {
    for (const sport of sportsToFetch) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const url = new URL(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/scores/`)
        url.searchParams.set('daysFrom', '3')
        url.searchParams.set('apiKey', apiKey)
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error(`Scores API returned ${response.status}`)
        const body: unknown = await response.json()
        if (!Array.isArray(body)) throw new Error('Scores API returned an unexpected response')
        for (const event of body as ApiScore[]) {
          if (!event.completed || !event.id || !event.sport_key || !event.home_team || !event.away_team) continue
          const home = event.scores?.find((entry) => entry.name === event.home_team)?.score
          const away = event.scores?.find((entry) => entry.name === event.away_team)?.score
          const homeScore = Number(home)
          const awayScore = Number(away)
          if (Number.isFinite(homeScore) && Number.isFinite(awayScore)) {
            scores.push({ gameId: event.id, sport: event.sport_key, homeTeam: event.home_team, awayTeam: event.away_team, homeScore, awayScore })
          }
        }
      } finally {
        clearTimeout(timer)
      }
    }
    return { scores }
  } catch (error) {
    return { scores: [], error: error instanceof Error ? error.message : 'Unable to fetch final scores.' }
  }
}

export function recordClosingOdds(
  legId: string,
  closingAmerican: number,
  closingOppositeAmerican?: number,
): LegSnapshot | undefined {
  if (!Number.isFinite(closingAmerican) || closingAmerican === 0) return undefined
  const snapshot = loadLegSnapshots().find((item) => item.legId === legId)
  if (!snapshot) return undefined
  const clv = compareClosingValue(snapshot.takenAmericanOdds, closingAmerican, closingOppositeAmerican)
  let closingNoVigProbability: number | undefined
  if (closingOppositeAmerican !== undefined && closingOppositeAmerican !== 0) {
    const own = 1 / (closingAmerican > 0 ? 1 + closingAmerican / 100 : 1 + 100 / Math.abs(closingAmerican))
    const opposite = 1 / (closingOppositeAmerican > 0 ? 1 + closingOppositeAmerican / 100 : 1 + 100 / Math.abs(closingOppositeAmerican))
    closingNoVigProbability = own / (own + opposite)
  }
  return updateLegSnapshot(legId, {
    closingAmerican,
    closingOppositeAmerican,
    closingNoVigProbability,
    ...(Number.isFinite(clv) ? { clv } : {}),
  })
}

export function clearLegOutcomes(): void {
  try {
    getStorage()?.removeItem(OUTCOME_STORAGE_KEY)
  } catch {
    return
  }
}
