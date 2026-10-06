export function wilson(successes, n, z = 1.96) {
  if (!n) return { lower: 0, upper: 1 }
  const p = successes / n
  const z2 = z * z
  const d = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / d
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / d
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) }
}

export const round = (v, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null)
