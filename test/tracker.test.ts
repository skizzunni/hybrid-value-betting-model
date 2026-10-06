import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain ESM script module
import * as t from '../scripts/lib/tracker.mjs'

const NOW = new Date('2026-10-06T05:30:00Z')
const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'Soccer', 'UFC'] as const

function event(i: number, sportKey: string, homeOdds = -110, awayOdds = -110, homeOdds2 = -125, awayOdds2 = 105) {
  return {
    id: `ev${sportKey}${i}`,
    sport_key: sportKey,
    commence_time: '2026-10-06T23:00:00Z',
    home_team: `H${i}`,
    away_team: `A${i}`,
    bookmakers: [
      { key: 'pinnacle', title: 'Pinnacle', markets: [{ key: 'h2h', outcomes: [{ name: `H${i}`, price: homeOdds }, { name: `A${i}`, price: awayOdds }] }] },
      { key: 'other', title: 'Other', markets: [{ key: 'h2h', outcomes: [{ name: `H${i}`, price: homeOdds2 }, { name: `A${i}`, price: awayOdds2 }] }] },
    ],
  }
}

function slateEvents(perSport: number) {
  return SPORTS.flatMap((s) => Array.from({ length: perSport }, (_, i) => event(i, t.SPORT_KEYS[s], -110, -110, -105, +112)))
}

const pickOf = (over: Record<string, unknown> = {}) => ({
  id: 'p1', run_date: '2026-10-06', sport: 'NBA', sport_key: 'basketball_nba', event_id: 'e1', market: 'h2h', side: 'H', odds: -110,
  implied_prob: 0.5238, model_prob: 0.54, edge: 0.0162, units: 1, ...over,
})

describe('edge and candidates', () => {
  it('derives edge from consensus no-vig vs best price, not a constant', () => {
    const cands = t.buildCandidates(event(1, 'basketball_nba', -110, -110, -105, 112), NOW)
    expect(cands).toHaveLength(2)
    const away = cands.find((c: any) => c.side === 'A1')
    expect(away.odds).toBe(112)
    expect(away.edge).toBeGreaterThan(0.02)
    expect(new Set(cands.map((c: any) => c.edge)).size).toBeGreaterThan(1)
  })
  it('ignores started events and single-book markets', () => {
    expect(t.buildCandidates({ ...event(1, 'basketball_nba'), commence_time: '2026-10-06T01:00:00Z' }, NOW)).toEqual([])
    const e = event(1, 'basketball_nba')
    expect(t.buildCandidates({ ...e, bookmakers: [e.bookmakers[0]] }, NOW)).toEqual([])
  })
})

describe('daily selection', () => {
  it('selects 25 legs across all sports, one per event, with per-sport cap', () => {
    const cands = slateEvents(6).flatMap((e) => t.buildCandidates(e, NOW))
    const { picks, shortfall } = t.selectDaily(cands)
    expect(picks).toHaveLength(25)
    expect(shortfall).toBe(0)
    expect(new Set(picks.map((p: any) => p.event_id)).size).toBe(25)
    expect(new Set(picks.map((p: any) => p.sport)).size).toBe(6)
    for (const s of SPORTS) expect(picks.filter((p: any) => p.sport === s).length).toBeLessThanOrEqual(t.MAX_PER_SPORT)
  })
  it('fails gracefully with a reason when too few legs qualify', () => {
    const cands = slateEvents(2).flatMap((e) => t.buildCandidates(e, NOW))
    const out = t.selectDaily(cands)
    expect(out.picks.length).toBeLessThan(25)
    expect(out.shortfall).toBe(25 - out.picks.length)
    expect(out.reason).toMatch(/Only \d+ of 25/)
  })
  it('is deterministic', () => {
    const cands = slateEvents(6).flatMap((e) => t.buildCandidates(e, NOW))
    expect(t.selectDaily(cands).picks).toEqual(t.selectDaily(cands).picks)
  })
})

describe('Eastern Time window', () => {
  it('detects the 12-8 AM ET window across DST', () => {
    expect(t.inGenerationWindow(new Date('2026-07-15T04:30:00Z'))).toBe(true) // 00:30 EDT
    expect(t.inGenerationWindow(new Date('2026-01-15T04:30:00Z'))).toBe(false) // 23:30 EST
    expect(t.inGenerationWindow(new Date('2026-01-15T05:30:00Z'))).toBe(true) // 00:30 EST
    expect(t.inGenerationWindow(new Date('2026-07-15T12:00:00Z'))).toBe(false) // 08:00 EDT
    expect(t.easternParts(new Date('2026-01-15T04:30:00Z')).date).toBe('2026-01-14')
  })
  it('workflow cron times land in the window in both EDT and EST at least once', () => {
    const yml = fs.readFileSync(path.join(__dirname, '../.github/workflows/daily-picks.yml'), 'utf8')
    const crons = [...yml.matchAll(/cron:\s*'(\d+) (\d+) \* \* \*'/g)].map((m) => ({ minute: +m[1], hour: +m[2] }))
    expect(crons.length).toBeGreaterThan(0)
    for (const day of ['2026-07-15', '2026-01-15']) {
      const hits = crons.filter((c) => t.inGenerationWindow(new Date(`${day}T${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}:00Z`)))
      expect(hits.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('tracking persistence', () => {
  it('appends JSONL without overwriting prior runs', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'picks-'))
    const file = path.join(dir, 'data', 'picks-log.jsonl')
    await t.appendJsonl(file, [{ id: 'a' }])
    await t.appendJsonl(file, [{ id: 'b' }, { id: 'c' }])
    expect((await t.readJsonl(file)).map((r: any) => r.id)).toEqual(['a', 'b', 'c'])
    expect(await t.readJsonl(path.join(dir, 'missing.jsonl'))).toEqual([])
  })
  it('records full pick metadata with a deterministic id', () => {
    const cand = t.buildCandidates(event(1, 'basketball_nba', -110, -110, -105, 112), NOW).find((c: any) => c.edge > 0)
    const { picks } = t.selectDaily([cand])
    const rec = t.makePickRecord(picks[0], { now: NOW, runDate: '2026-10-06' })
    for (const k of ['created_at', 'sport', 'event', 'market', 'side', 'odds', 'implied_prob', 'model_prob', 'edge', 'confidence', 'units', 'book', 'tags']) expect(rec).toHaveProperty(k)
    expect(rec.id).toBe(t.makePickRecord(picks[0], { now: NOW, runDate: '2026-10-06' }).id)
  })
})

describe('grading', () => {
  const final = (a: number, b: number) => ({ completed: true, scores: [{ name: 'H', score: String(a) }, { name: 'A', score: String(b) }] })
  it('grades win, loss and push with profit', () => {
    expect(t.gradePick(pickOf(), final(3, 1))).toMatchObject({ result: 'win', profit_units: 0.9091 })
    expect(t.gradePick(pickOf(), final(1, 3))).toMatchObject({ result: 'loss', profit_units: -1 })
    expect(t.gradePick(pickOf(), final(2, 2))).toMatchObject({ result: 'push', profit_units: 0 })
  })
  it('handles soccer draws and incomplete games', () => {
    expect(t.gradePick(pickOf({ sport: 'Soccer' }), final(1, 1))?.result).toBe('loss')
    expect(t.gradePick(pickOf({ sport: 'Soccer', side: 'Draw' }), final(1, 1))?.result).toBe('win')
    expect(t.gradePick(pickOf(), { ...final(1, 0), completed: false })).toBeNull()
    expect(t.gradePick(pickOf(), undefined)).toBeNull()
  })
  it('computes CLV from the closing no-vig price', () => {
    expect(t.closingRecord(pickOf(), 0.56, -120, NOW)).toMatchObject({ clv: 0.0362, closing_odds: -120 })
  })
  it('merges result and closing rows per pick', () => {
    const merged = t.mergeResults([{ id: 'p1', type: 'closing', clv: 0.02 }, { id: 'p1', result: 'win' }])
    expect(merged).toEqual([{ id: 'p1', clv: 0.02, result: 'win' }])
  })
})

describe('post-mortem classification', () => {
  it('classifies losses by price quality and correlation', () => {
    const p = pickOf()
    expect(t.postmortemPick(p, { result: 'loss', clv: -0.03 }).cause).toBe('bad_price')
    expect(t.postmortemPick(p, { result: 'loss', clv: 0.03 }).cause).toBe('good_price_variance')
    expect(t.postmortemPick(p, { result: 'loss' }, { sameSportLossesToday: 4 }).cause).toBe('correlated_sport_day')
    expect(t.postmortemPick(p, { result: 'win', clv: -0.03 }).cause).toBe('won_despite_bad_price')
    expect(t.postmortemPick(p, { result: 'win' }).tags).toEqual(expect.arrayContaining(['favorite', 'pickem', 'edge_1-2%']))
  })
  it('buckets odds, edge and role', () => {
    expect(t.oddsBucket(-300)).toBe('heavy_favorite')
    expect(t.oddsBucket(150)).toBe('underdog')
    expect(t.oddsBucket(300)).toBe('long_shot')
    expect(t.edgeBand(0.025)).toBe('2-4%')
    expect(t.roleOf(130)).toBe('underdog')
  })
})

describe('learning from history', () => {
  const history = (n: number, wins: number, over: Record<string, unknown> = {}) =>
    Array.from({ length: n }, (_, i) => ({
      pick: pickOf({ id: `x${i}${JSON.stringify(over)}`, ...over }),
      result: { result: i < wins ? 'win' : 'loss' },
    }))

  it('flags nothing below the minimum sample', () => {
    const segs = t.summarizeSegments(history(20, 0))
    expect(t.findConditions(segs).lose).toEqual([])
    const picks = history(20, 0).map((h) => h.pick)
    const report = t.buildReport(picks, picks.map((p: any) => ({ id: p.id, result: 'loss' })), { now: NOW })
    expect(report.lose_conditions).toEqual([])
    expect(report.note).toMatch(/no segment is flagged/)
  })
  it('cuts clearly losing segments and emphasises clearly winning ones', () => {
    const losing = history(80, 20, { sport: 'MLB' }) // 25% vs ~52% implied
    const winning = history(80, 60, { sport: 'NHL' }) // 75% vs ~52% implied
    const weights = t.segmentWeights(t.summarizeSegments([...losing, ...winning]))
    expect(weights.lose.has('sport:MLB')).toBe(true)
    expect(weights.win.has('sport:NHL')).toBe(true)
    expect(t.pickWeight(pickOf({ sport: 'MLB' }), weights)).toBe(0)
    expect(t.pickWeight(pickOf({ sport: 'NHL' }), weights)).toBe(1.25)
    expect(t.pickWeight(pickOf({ sport: 'NBA', odds: 130 }), { win: new Set(), lose: new Set() })).toBe(1)
  })
  it('drops cut segments from the daily slate', () => {
    const cands = slateEvents(6).flatMap((e) => t.buildCandidates(e, NOW))
    const { picks } = t.selectDaily(cands, { win: new Set(), lose: new Set(['sport:MLB']) })
    expect(picks.some((p: any) => p.sport === 'MLB')).toBe(false)
  })
})
