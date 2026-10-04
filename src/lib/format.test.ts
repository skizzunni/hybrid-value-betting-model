import { describe, expect, it } from 'vitest'
import {
  americanOdds,
  currency,
  multiplier,
  oneInN,
  percent,
  probability,
  scientific,
  signedCurrency,
  signedPercent,
  sportLabel,
} from './format'

describe('format', () => {
  it('formats percents', () => {
    expect(percent(0.1234)).toBe('12.3%')
    expect(percent(0.1234, 2)).toBe('12.34%')
    expect(percent(NaN)).toBe('—')
    expect(signedPercent(0.02)).toBe('+2.0%')
    expect(signedPercent(-0.015)).toBe('-1.5%')
    expect(signedPercent(0)).toBe('0.0%')
  })

  it('formats probabilities including tiny values', () => {
    expect(probability(0.5)).toBe('50.00%')
    expect(probability(0.0005)).toBe('0.0500%')
    expect(probability(1.5e-9)).toBe('1.50e-7%')
    expect(probability(0)).toBe('0%')
  })

  it('formats american odds with sign', () => {
    expect(americanOdds(150)).toBe('+150')
    expect(americanOdds(-110)).toBe('-110')
    expect(americanOdds(Infinity)).toBe('—')
  })

  it('formats currency', () => {
    expect(currency(1234.5)).toBe('$1,234.50')
    expect(currency(-2)).toBe('-$2.00')
    expect(signedCurrency(1.5)).toBe('+$1.50')
    expect(signedCurrency(-1.5)).toBe('-$1.50')
    expect(signedCurrency(0)).toBe('$0.00')
  })

  it('formats 1-in-N', () => {
    expect(oneInN(0.25)).toBe('about 1 in 4')
    expect(oneInN(1e-6)).toBe('about 1 in 1,000,000')
    expect(oneInN(1e-12)).toBe('about 1 in 1.00e+12')
    expect(oneInN(0)).toBe('—')
  })

  it('formats scientific, multipliers and sports', () => {
    expect(scientific(0.00001234)).toBe('1.23e-5')
    expect(multiplier(3.456)).toBe('3.46x')
    expect(multiplier(2e7)).toBe('2.00e+7x')
    expect(sportLabel('basketball_nba')).toBe('NBA')
    expect(sportLabel('nba')).toBe('NBA')
  })
})
