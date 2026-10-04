import { afterEach, describe, expect, it, vi } from 'vitest'
import { aggregateResults, findLeaks, type SegmentStats } from './aggregate'
import { classifyLoss } from './classify'
import {
  AdjustedProbabilityModel,
  deriveLearnedAdjustments,
  loadLearningChangeLog,
  resetLearning,
  updateLearning,
} from './learning'
import { fetchLatestScores, loadLegOutcomes, recordClosingOdds, recordLegOutcome, resolveLeg, settleTicket, type FinalScore } from './results'
import { clearLegSnapshots, getSnapshot, loadLegSnapshots, saveLegSnapshots, SNAPSHOT_STORAGE_KEY } from './snapshot'
import type { LegSnapshot } from './snapshot'
import type { Ticket } from '../ticketBuilder'
import type { ResolvedBet } from './aggregate'
import { attachContextNotes, noOpContextProvider } from './context'

const score: FinalScore = {
  gameId: 'game-1',
  sport: 'basketball_nba',
  homeTeam: 'Home',
  awayTeam: 'Away',
  homeScore: 100,
  awayScore: 90,
}

function snapshot(overrides: Partial<LegSnapshot> = {}): LegSnapshot {
  return {
    legId: 'ticket:leg',
    ticketId: 'ticket',
    timestamp: 1,
    sport: 'basketball_nba',
    gameId: 'game-1',
    teams: ['Home', 'Away'],
    market: 'moneyline',
    selection: 'Home',
    side: 'favorite',
    takenAmericanOdds: -110,
    modelProbability: 0.62,
    noVigProbability: 0.6,
    edge: 0.02,
    tier: 'straight',
    correlationGroup: 'game-1',
    strategy: 'highestProbability',
    mode: 'straight',
    dataSource: 'live',
    ...overrides,
  }
}

const ticket: Ticket = {
  id: 'ticket',
  name: 'Straight',
  strategy: 'highestProbability',
  tier: 'straight',
  betType: 'straight',
  sideMix: { favorite: 1, underdog: 0, neutral: 0 },
  legs: [{
    id: 'leg',
    sport: 'basketball_nba',
    gameId: 'game-1',
    teams: ['Home', 'Away'],
    market: 'moneyline',
    selection: 'Home',
    americanOdds: -110,
    modelProbability: 0.62,
  }],
  targetLegs: 1,
  combinedProbability: 0.62,
  payoutDecimal: 1.91,
  notes: [],
}

function localStorageMock() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as unknown as Storage
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('postmortem result resolution', () => {
  it('resolves moneyline wins, losses, ties, and missing scores', () => {
    expect(resolveLeg(snapshot(), score)).toBe('win')
    expect(resolveLeg(snapshot({ selection: 'Away' }), score)).toBe('loss')
    expect(resolveLeg(snapshot(), { ...score, homeScore: 90, awayScore: 90 })).toBe('push')
    expect(resolveLeg(snapshot(), undefined)).toBe('unknown')
  })

  it('resolves spread outcomes, pushes, and half points', () => {
    expect(resolveLeg(snapshot({ market: 'spread', selection: 'Home -9.5' }), score)).toBe('win')
    expect(resolveLeg(snapshot({ market: 'spread', selection: 'Home -10' }), score)).toBe('push')
    expect(resolveLeg(snapshot({ market: 'spread', selection: 'Away +10.5' }), score)).toBe('win')
    expect(resolveLeg(snapshot({ market: 'spread', selection: 'Unknown -1.5' }), score)).toBe('unknown')
  })

  it('resolves totals, pushes, and half points', () => {
    expect(resolveLeg(snapshot({ market: 'total', selection: 'Over 189.5' }), score)).toBe('win')
    expect(resolveLeg(snapshot({ market: 'total', selection: 'Under 190' }), score)).toBe('push')
    expect(resolveLeg(snapshot({ market: 'total', selection: 'Under 190.5' }), score)).toBe('win')
    expect(resolveLeg(snapshot({ market: 'total', selection: 'Over 200.5' }), score)).toBe('loss')
  })

  it('does not fail when scores API key is missing', async () => {
    vi.stubEnv('VITE_ODDS_API_KEY', '')
    await expect(fetchLatestScores()).resolves.toMatchObject({ scores: [], error: expect.stringContaining('not configured') })
  })

  it('fetches completed final scores from the scores endpoint', async () => {
    vi.stubEnv('VITE_ODDS_API_KEY', 'test-key')
    const request = vi.fn(async (input: URL) => ({
      ok: true,
      json: async () => [{
        id: 'game-1',
        sport_key: 'basketball_nba',
        completed: true,
        home_team: 'Home',
        away_team: 'Away',
        scores: [{ name: 'Home', score: '100' }, { name: 'Away', score: '90' }],
      }],
    }))
    vi.stubGlobal('fetch', request as unknown as typeof fetch)
    await expect(fetchLatestScores(['basketball_nba'])).resolves.toMatchObject({ scores: [score] })
    expect(String(request.mock.calls[0][0])).toContain('/v4/sports/basketball_nba/scores/?daysFrom=3&apiKey=test-key')
  })

  it('records closing odds and computes CLV through the shared helper', () => {
    vi.stubGlobal('window', { localStorage: localStorageMock() })
    saveLegSnapshots(ticket, 'live', 10)
    const saved = recordClosingOdds('ticket:leg', -105, -115)
    expect(saved?.closingAmerican).toBe(-105)
    expect(saved?.closingNoVigProbability).toBeCloseTo(0.489)
    expect(saved?.clv).toBeDefined()
    expect(getSnapshot('ticket:leg')?.clv).toBe(saved?.clv)
  })

  it('stores complete snapshots independently for repeated ticket legs', () => {
    vi.stubGlobal('window', { localStorage: localStorageMock() })
    const enriched: Ticket = {
      ...ticket,
      legs: [{ ...ticket.legs[0], noVigProbability: 0.6, bookKey: 'sharp-book' }],
    }
    saveLegSnapshots(enriched, 'live', 10, 'ticket-a')
    saveLegSnapshots(enriched, 'demo', 20, 'ticket-b')
    expect(loadLegSnapshots()).toHaveLength(2)
    expect(getSnapshot('ticket-a:leg')).toMatchObject({
      ticketId: 'ticket-a',
      timestamp: 10,
      noVigProbability: 0.6,
      bookKey: 'sharp-book',
      dataSource: 'live',
    })
  })

  it('settles parlays on every leg and removes pushed legs from payout odds', () => {
    const snapshots = [
      snapshot({ legId: 't:a', takenAmericanOdds: 100 }),
      snapshot({ legId: 't:b', takenAmericanOdds: -100 }),
      snapshot({ legId: 't:c', takenAmericanOdds: 200 }),
    ]
    expect(settleTicket(snapshots, ['win', 'loss', 'win'], 2)).toMatchObject({ result: 'loss', payout: 0, breakingLegs: [1] })
    expect(settleTicket(snapshots, ['win', 'push', 'win'], 2)).toMatchObject({ result: 'win', payout: 12, legsHit: 2 })
    expect(settleTicket(snapshots, ['push', 'push', 'push'], 2)).toMatchObject({ result: 'push', payout: 2 })
  })

  it('persists a manual leg result', () => {
    vi.stubGlobal('window', { localStorage: localStorageMock() })
    recordLegOutcome('ticket:leg', 'push')
    expect(loadLegOutcomes()).toMatchObject([{ legId: 'ticket:leg', result: 'push', source: 'manual' }])
  })
})

describe('postmortem classification', () => {
  it('calls a positive-edge loss expected variance with its probability evidence', () => {
    const result = classifyLoss({ snapshot: snapshot(), result: 'loss', clv: 1.2 })
    expect(result.primaryCause).toBe('variance_good_bet')
    expect(result.evidence).toContain('38.0%')
    expect(result.expectedLossProbability).toBeCloseTo(0.38)
  })

  it('classifies negative edge and negative CLV as process errors', () => {
    expect(classifyLoss({ snapshot: snapshot({ edge: -0.01 }), result: 'loss' }).primaryCause).toBe('bad_bet')
    expect(classifyLoss({ snapshot: snapshot(), result: 'loss', clv: -1.5 }).primaryCause).toBe('bad_bet')
  })

  it('marks large adverse line movement as likely information, not certainty', () => {
    const result = classifyLoss({
      snapshot: snapshot({ closingNoVigProbability: 0.55 }),
      result: 'loss',
    })
    expect(result.primaryCause).toBe('information_miss')
    expect(result.evidence).toContain('suggests possible late information')
  })

  it('requires sufficient calibration history and evidence of underperformance', () => {
    const calibration = { n: 60, predictedProbability: 0.7, observedHitRate: 0.45, confidenceUpper: 0.58 }
    expect(classifyLoss({ snapshot: snapshot(), result: 'loss', calibration }).primaryCause).toBe('calibration_miss')
    expect(classifyLoss({ snapshot: snapshot(), result: 'loss', calibration: { ...calibration, n: 4 } }).primaryCause).toBe('variance_good_bet')
  })

  it('tags correlated legs and one-leg parlay breakers', () => {
    const related = snapshot({ legId: 'ticket:other' })
    expect(classifyLoss({ snapshot: snapshot(), result: 'loss', otherLostLegs: [related] }).primaryCause).toBe('correlation_loss')
    expect(classifyLoss({
      snapshot: snapshot({ mode: 'parlay', tier: 'lottery' }),
      result: 'loss',
      ticketLegCount: 25,
      lostLegCount: 1,
    }).primaryCause).toBe('parlay_structure')
  })

  it('does not invent a reason when pick-time evidence is absent', () => {
    const result = classifyLoss({ snapshot: snapshot({ edge: undefined, modelProbability: Number.NaN }), result: 'loss' })
    expect(result.primaryCause).toBe('unknown')
    expect(result.expectedLossProbability).toBeUndefined()
    expect(result.evidence).toContain('Insufficient measured data')
  })
})

describe('postmortem aggregation and learning', () => {
  const weakSegment: SegmentStats = {
    id: 'sport=basketball_nba',
    dimension: 'sport',
    value: 'basketball_nba',
    n: 100,
    predictedMean: 0.7,
    observedHitRate: 0.4,
    brierScore: 0.4,
    roi: -0.2,
    roiSampleSize: 100,
    confidenceInterval: { lower: 0.3, upper: 0.5 },
    insight: 'computed',
  }

  it('aggregates performance and only flags leaks beyond minimum sample and significance', () => {
    const bets: ResolvedBet[] = Array.from({ length: 60 }, (_, index) => ({
      snapshot: snapshot({ legId: `ticket:${index}`, sport: index === 0 ? 'other' : 'basketball_nba', modelProbability: 0.7 }),
      result: index < 24 ? 'win' : 'loss',
      clv: index === 0 ? 1 : undefined,
    }))
    const segments = aggregateResults(bets)
    expect(segments.find((segment) => segment.id === 'sport=basketball_nba')?.n).toBe(59)
    expect(segments.find((segment) => segment.id === 'sport=basketball_nba')?.brierScore).toBeGreaterThan(0)
    expect(findLeaks(segments, { minSample: 50 })).toContainEqual(expect.objectContaining({ id: 'sport=basketball_nba' }))
    expect(findLeaks(segments, { minSample: 100 })).toEqual([])
  })

  it('deduplicates parlay ROI by ticket instead of treating its legs as separate wagers', () => {
    const bets: ResolvedBet[] = ['win', 'loss'].map((result, index) => ({
      snapshot: snapshot({ legId: `ticket:${index}`, ticketId: 'ticket', mode: 'lottery' }),
      result: result as 'win' | 'loss',
      ticketId: 'ticket',
      stake: 2,
      payout: 12,
    }))
    const segment = aggregateResults(bets).find((item) => item.id === 'mode=lottery')
    expect(segment?.n).toBe(2)
    expect(segment?.roiSampleSize).toBe(1)
    expect(segment?.roi).toBe(5)
  })

  it('uses shrinkage, caps adjustments, and does not adjust a single loss', () => {
    expect(deriveLearnedAdjustments([weakSegment]).adjustments[0].factor).toBe(-0.05)
    expect(deriveLearnedAdjustments([{ ...weakSegment, n: 1 }]).adjustments).toEqual([])
    expect(deriveLearnedAdjustments([{ ...weakSegment, n: 100, observedHitRate: 0.68 }]).adjustments).toEqual([])
  })

  it('applies only supplied guarded adjustments to model probabilities', () => {
    const model = new AdjustedProbabilityModel({
      version: 1,
      adjustments: [{
        segmentId: 'sport=basketball_nba',
        factor: -0.05,
        sampleSize: 100,
        minSample: 50,
        predictedProbability: 0.7,
        observedHitRate: 0.4,
        confidenceUpper: 0.5,
        evidence: 'sufficient',
        reason: 'guarded',
        updatedAt: 1,
      }],
    })
    expect(model.estimate({ sport: 'basketball_nba', americanOdds: -110, modelProbability: 0.62 })).toBeCloseTo(0.57)
    expect(new AdjustedProbabilityModel({ version: 1, adjustments: [] }).estimate({ modelProbability: 0.62 })).toBeCloseTo(0.62)
    const underSampled = new AdjustedProbabilityModel({
      version: 1,
      adjustments: [{
        segmentId: 'sport=basketball_nba',
        factor: -0.05,
        sampleSize: 1,
        minSample: 50,
        predictedProbability: 0.7,
        observedHitRate: 0.4,
        confidenceUpper: 0.5,
        evidence: 'not enough sample',
        reason: 'test',
        updatedAt: 1,
      }],
    })
    expect(underSampled.estimate({ sport: 'basketball_nba', americanOdds: -110, modelProbability: 0.62 })).toBeCloseTo(0.62)
  })

  it('appends learning evidence and reset clears adjustments and log', () => {
    vi.stubGlobal('window', { localStorage: localStorageMock() })
    updateLearning([weakSegment])
    expect(loadLearningChangeLog()).toHaveLength(1)
    resetLearning()
    expect(loadLearningChangeLog()).toEqual([])
  })

  it('tolerates corrupt storage and environments without localStorage', () => {
    const localStorage = localStorageMock()
    vi.stubGlobal('window', { localStorage })
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, '{broken')
    expect(loadLegSnapshots()).toEqual([])
    vi.stubGlobal('window', undefined)
    expect(loadLegSnapshots()).toEqual([])
    expect(saveLegSnapshots(ticket, 'demo')).toHaveLength(1)
    expect(loadLegSnapshots()).toEqual([])
    clearLegSnapshots()
  })

  it('provides a no-op context extension without inventing notes', async () => {
    await expect(attachContextNotes(snapshot())).resolves.toMatchObject({ contextNotes: [] })
    expect(await noOpContextProvider.getContext(snapshot())).toEqual([])
  })
})
