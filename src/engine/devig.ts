export interface OddsOutcome {
  odds: number
}

export type DevigMethod = 'power' | 'shin' | 'additive'

export interface MarketBook {
  key?: string
  title?: string
  name?: string
  market: { outcomes: OddsOutcome[] }
}

export function americanToImpliedProb(american: number): number {
  if (!Number.isFinite(american) || american === 0) return Number.NaN
  return american > 0
    ? 100 / (american + 100)
    : Math.abs(american) / (Math.abs(american) + 100)
}

function impliedProbabilities(outcomes: OddsOutcome[]): number[] {
  return outcomes.map(({ odds }) => americanToImpliedProb(odds))
}

function normalize(values: number[]): number[] {
  const positive = values.map((value) => Number.isFinite(value) ? Math.max(0, value) : 0)
  const total = positive.reduce((sum, value) => sum + value, 0)
  return total > 0 ? positive.map((value) => value / total) : []
}

export function deVigPower(outcomes: OddsOutcome[]): number[] {
  return normalize(impliedProbabilities(outcomes))
}

export function deVigAdditive(outcomes: OddsOutcome[]): number[] {
  const implied = impliedProbabilities(outcomes)
  if (!implied.length || implied.some((value) => !Number.isFinite(value))) return []
  const adjustment = (implied.reduce((sum, value) => sum + value, 0) - 1) / implied.length
  return normalize(implied.map((value) => value - adjustment))
}

export function deVigShin(outcomes: OddsOutcome[]): number[] {
  const implied = impliedProbabilities(outcomes)
  const total = implied.reduce((sum, value) => sum + value, 0)
  if (implied.length < 2 || !(total > 0) || implied.some((value) => !Number.isFinite(value))) {
    return normalize(implied)
  }

  const probabilitiesAt = (insiderFraction: number): number[] => {
    const denominator = 2 * (1 - insiderFraction)
    return implied.map((value) => (
      Math.sqrt(insiderFraction ** 2 + (4 * (1 - insiderFraction) * value ** 2) / total)
      - insiderFraction
    ) / denominator)
  }

  let low = 0
  let high = 0.5
  for (let i = 0; i < 60; i += 1) {
    const middle = (low + high) / 2
    const sum = probabilitiesAt(middle).reduce((acc, probability) => acc + probability, 0)
    if (sum > 1) low = middle
    else high = middle
  }
  return normalize(probabilitiesAt((low + high) / 2))
}

export function deVig(outcomes: OddsOutcome[], method: DevigMethod): number[] {
  if (method === 'shin') return deVigShin(outcomes)
  if (method === 'additive') return deVigAdditive(outcomes)
  return deVigPower(outcomes)
}

export function vigPercent(outcomes: OddsOutcome[]): number {
  const total = impliedProbabilities(outcomes).reduce((sum, value) => sum + value, 0)
  return Number.isFinite(total) ? (total - 1) * 100 : Number.NaN
}

export const bookVigPercent = vigPercent
export const marketVigPercent = vigPercent
export const extractVigPercent = vigPercent

export function consensusNoVig(
  books: MarketBook[],
  method: DevigMethod,
): number[] {
  if (!books.length) return []
  const normalized = books.map((book) => deVig(book.market.outcomes, method))
  const count = Math.max(0, ...normalized.map((probabilities) => probabilities.length))
  const weighted = Array.from({ length: count }, (_, index) => {
    let total = 0
    let weightTotal = 0
    for (let bookIndex = 0; bookIndex < books.length; bookIndex += 1) {
      const probability = normalized[bookIndex][index]
      if (!Number.isFinite(probability)) continue
      const label = `${books[bookIndex].key ?? ''} ${books[bookIndex].title ?? ''} ${books[bookIndex].name ?? ''}`
      const weight = /pinnacle/i.test(label) ? 3 : 1
      total += probability * weight
      weightTotal += weight
    }
    return weightTotal ? total / weightTotal : 0
  })
  return normalize(weighted)
}
