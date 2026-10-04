const DASH = '—'

function finite(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Scientific notation, e.g. 1.23e-8. */
export function scientific(n: number, digits = 2): string {
  if (!finite(n)) return DASH
  return n.toExponential(digits)
}

/** Fixed-decimal percent from a 0..1 fraction. */
export function percent(p: number, digits = 1): string {
  if (!finite(p)) return DASH
  return `${(p * 100).toFixed(digits)}%`
}

/** Percent with an explicit sign, e.g. +2.0% / -1.5%. */
export function signedPercent(p: number, digits = 1): string {
  if (!finite(p)) return DASH
  const text = (p * 100).toFixed(digits)
  return Number(text) > 0 ? `+${text}%` : `${text}%`
}

/** Percent that stays readable for very small probabilities (switches to scientific). */
export function probability(p: number): string {
  if (!finite(p)) return DASH
  if (p <= 0) return '0%'
  if (p >= 0.01) return percent(p, 2)
  if (p >= 0.0001) return percent(p, 4)
  return `${scientific(p * 100)}%`
}

/** American odds with an explicit sign, e.g. +150 / -110. */
export function americanOdds(odds: number): string {
  if (!finite(odds)) return DASH
  const rounded = Math.round(odds)
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

/** Currency in USD with two decimals. */
export function currency(n: number): string {
  if (!finite(n)) return DASH
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}$${abs}`
}

/** Currency with an explicit sign, e.g. +$1.50 / -$2.00. */
export function signedCurrency(n: number): string {
  if (!finite(n)) return DASH
  const text = currency(n)
  return n > 0 && Number(Math.abs(n).toFixed(2)) > 0 ? `+${text}` : text
}

/** "about 1 in N" style text from a 0..1 probability. */
export function oneInN(p: number): string {
  if (!finite(p) || p <= 0) return DASH
  const n = 1 / p
  if (n < 1.5) return 'about 1 in 1'
  if (n >= 1e9) return `about 1 in ${scientific(n)}`
  return `about 1 in ${Math.round(n).toLocaleString('en-US')}`
}

/** Decimal multiplier, e.g. 3.45x (scientific for huge values). */
export function multiplier(n: number): string {
  if (!finite(n)) return DASH
  if (n >= 1e6) return `${scientific(n)}x`
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`
}

/** Human readable sport key, e.g. basketball_nba -> NBA. */
export function sportLabel(key: string): string {
  const tail = key.includes('_') ? key.split('_').slice(1).join(' ') : key
  return tail.toUpperCase()
}
