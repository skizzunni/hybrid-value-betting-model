import { SPORTS } from './sports.mjs'

export function decimalOdds(american) {
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american
}

export function impliedProb(american) {
  return 1 / decimalOdds(american)
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

export function resultKey(game) {
  const r = game.result
  return `${game.status}|${r ? `${r.home_score ?? ''}-${r.away_score ?? ''}|${r.winner ?? ''}` : ''}`
}

// win | loss | push | void, or null while the game is unresolved.
// Postponed/cancelled -> void. No-contest -> void. Missing numeric scores on spread/total (e.g. UFC) -> void.
export function gradeLeg(game, leg) {
  if (game.status === 'postponed' || game.status === 'cancelled') return 'void'
  if (game.status !== 'final' || !game.result) return null
  const r = game.result
  if (r.winner === 'no_contest') return 'void'

  if (leg.market === 'moneyline') {
    const sideKey = leg.side === game.home ? 'home' : leg.side === game.away ? 'away' : /^draw$/i.test(leg.side) ? 'draw' : null
    if (!sideKey) return 'void'
    if (r.winner === 'draw') {
      if (sideKey === 'draw') return 'win'
      return SPORTS[game.sport]?.threeWay ? 'loss' : 'push'
    }
    return r.winner === sideKey ? 'win' : 'loss'
  }

  if (!isNum(r.home_score) || !isNum(r.away_score) || !isNum(leg.line)) return 'void'

  if (leg.market === 'spread') {
    const mine = leg.side === game.home ? r.home_score : leg.side === game.away ? r.away_score : null
    if (mine === null) return 'void'
    const other = leg.side === game.home ? r.away_score : r.home_score
    const margin = mine + leg.line - other
    return margin > 0 ? 'win' : margin < 0 ? 'loss' : 'push'
  }

  if (leg.market === 'total') {
    const total = r.home_score + r.away_score
    if (total === leg.line) return 'push'
    const over = total > leg.line
    if (/^over$/i.test(leg.side)) return over ? 'win' : 'loss'
    if (/^under$/i.test(leg.side)) return over ? 'loss' : 'win'
    return 'void'
  }
  return 'void'
}

// Standard parlay rules: any lost leg loses the ticket; pushed/voided legs drop out (price 1.0);
// pending legs keep the ticket open unless it is already lost.
export function resolveTicket(legs) {
  if (legs.some((l) => l.result === 'loss')) return { outcome: 'loss', effectiveLegs: legs.filter((l) => l.result !== 'push' && l.result !== 'void').length, decimal: 0 }
  if (legs.some((l) => !l.result || l.result === 'pending')) return { outcome: null, effectiveLegs: null, decimal: null }
  const live = legs.filter((l) => l.result === 'win')
  if (!live.length) return { outcome: legs.length ? 'void' : null, effectiveLegs: 0, decimal: 1 }
  return { outcome: 'win', effectiveLegs: live.length, decimal: live.reduce((p, l) => p * decimalOdds(l.odds), 1) }
}

// Apply a normalized score ({status, home_score, away_score, winner, source}) to a game record.
// Idempotent: identical input produces no change. Differences after resolution are logged as corrections.
export function applyResult(game, score, now) {
  const next = {
    status: score.status,
    result: ['final'].includes(score.status)
      ? {
          home_score: isNum(score.home_score) ? score.home_score : null,
          away_score: isNum(score.away_score) ? score.away_score : null,
          winner: score.winner ?? deriveWinner(score),
          overtime: Boolean(score.overtime),
          source: score.source,
        }
      : null,
  }
  if (next.result && next.result.winner == null) return false
  const before = resultKey(game)
  const after = `${next.status}|${next.result ? `${next.result.home_score ?? ''}-${next.result.away_score ?? ''}|${next.result.winner ?? ''}` : ''}`
  if (before === after) return false
  // Never regress a resolved game to in-progress/scheduled because of a late or partial feed.
  if (game.resolved_at && !['final', 'postponed', 'cancelled'].includes(next.status)) return false

  if (game.resolved_at) {
    game.audit.push({ at: now, field: 'result', from: before, to: after, source: score.source, note: 'correction' })
  }
  game.status = next.status
  game.result = next.result
  game.last_updated = now
  if (['final', 'postponed', 'cancelled'].includes(next.status) && !game.resolved_at) game.resolved_at = now
  return true
}

function deriveWinner(score) {
  if (!isNum(score.home_score) || !isNum(score.away_score)) return null
  return score.home_score > score.away_score ? 'home' : score.home_score < score.away_score ? 'away' : 'draw'
}

// Closing line value for one leg against the last snapshot before commence. Only same-line comparisons.
export function computeClv(game, leg) {
  const closing = game.odds?.closing
  if (!closing) return null
  if (leg.market === 'moneyline') {
    const h2h = closing.h2h
    if (!h2h || !isNum(h2h[leg.side])) return null
    const probs = Object.values(h2h).map(impliedProb)
    const total = probs.reduce((a, b) => a + b, 0)
    return {
      closing_odds: h2h[leg.side],
      closing_no_vig_prob: Number((impliedProb(h2h[leg.side]) / total).toFixed(4)),
      clv_pct: Number(((decimalOdds(leg.odds) / decimalOdds(h2h[leg.side]) - 1) * 100).toFixed(2)),
    }
  }
  const book = leg.market === 'spread' ? closing.spreads : closing.totals
  const side = book?.[leg.side]
  if (!side || side.line !== leg.line) return null
  return {
    closing_odds: side.price,
    closing_no_vig_prob: null,
    clv_pct: Number(((decimalOdds(leg.odds) / decimalOdds(side.price) - 1) * 100).toFixed(2)),
  }
}

export function profitUnits(result, odds) {
  if (result === 'win') return Number((decimalOdds(odds) - 1).toFixed(4))
  if (result === 'loss') return -1
  return 0
}

// Grade pending legs (or re-grade when the game's result key changed). Returns number of changed legs.
export function resolveLegs(legs, games, now) {
  const byId = new Map()
  for (const g of games) {
    byId.set(g.id, g)
    for (const a of g.aliases || []) byId.set(a, g)
  }
  let changed = 0
  for (const leg of legs) {
    const game = byId.get(leg.game_id)
    if (!game) continue
    const key = resultKey(game)
    if (leg.graded_against === key) continue
    const grade = gradeLeg(game, leg)
    if (grade === null) continue
    // A leg voided by a postponement/cancellation stays void even if the game is later replayed.
    if (leg.void_reason && grade !== 'void') continue
    if (leg.result && leg.result !== 'pending') {
      if (leg.result === grade) {
        leg.graded_against = key
        continue
      }
      leg.audit = [...(leg.audit || []), { at: now, field: 'result', from: leg.result, to: grade, note: 'game result corrected' }]
    }
    leg.result = grade
    if (grade === 'void' && (game.status === 'postponed' || game.status === 'cancelled')) leg.void_reason = game.status
    leg.profit_units = profitUnits(grade, leg.odds)
    leg.graded_at = now
    leg.graded_against = key
    const clv = computeClv(game, leg)
    if (clv) Object.assign(leg, clv)
    changed++
  }
  return changed
}
