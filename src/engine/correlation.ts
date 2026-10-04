import type { LegWithEdge } from './edgeFilter'

export type CorrelationMatrix = Record<string, Record<string, number>>

export function pairwiseCorrelation(
  leg1: LegWithEdge,
  leg2: LegWithEdge,
  gameCorrelations?: CorrelationMatrix,
): number {
  if (leg1.gameId !== leg2.gameId) return 0
  const first = gameCorrelations?.[leg1.gameId]?.[leg1.selection]
  const second = gameCorrelations?.[leg1.gameId]?.[leg2.selection]
  if (first === undefined && second === undefined) return 0.1
  const value = typeof first === 'number' && typeof second === 'number'
    ? Math.min(first, second)
    : (typeof first === 'number' ? first : second)
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0
}

export function adjustedCombinedProb(
  legs: LegWithEdge[],
  gameCorrelations?: CorrelationMatrix,
): number {
  let probability = legs.reduce((product, leg) => product * leg.modelProbability, 1)
  for (let i = 0; i < legs.length; i += 1) {
    for (let j = i + 1; j < legs.length; j += 1) {
      const correlation = pairwiseCorrelation(legs[i], legs[j], gameCorrelations)
      if (correlation > 0) {
        probability *= 1 - correlation + correlation * Math.min(legs[i].modelProbability, legs[j].modelProbability)
      }
    }
  }
  return Math.max(0, Math.min(1, probability))
}
