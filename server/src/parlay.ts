export function parseFair(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const percent = trimmed.match(/([0-9]*\.?[0-9]+)\s*%/)
    if (percent) return Number(percent[1]) / 100
    const numeric = Number(trimmed)
    return Number.isFinite(numeric) ? numeric : null
  }
  return null
}

export function generateParlays(tickets: any[], legs = 25, count = 20, minFair = 0.55) {
  const candidates = tickets
    .map((t: any) => ({ ...t, fairNum: parseFair(t.fair) }))
    .filter((t: any) => Number.isFinite(t.fairNum) && t.fairNum >= minFair)
    .sort((a: any, b: any) => (b.fairNum ?? 0) - (a.fairNum ?? 0))

  if (!candidates.length) return []

  const targetLegs = Math.min(legs, candidates.length)
  const attempts = Math.max(500, count * 300)
  const unique = new Map<string, any>()

  for (let i = 0; i < attempts; i++) {
    const chosen: any[] = []
    const seenNames = new Set<string>()
    const seenMarkets = new Set<string>()

    while (chosen.length < targetLegs) {
      const idx = Math.floor(Math.random() * candidates.length)
      const candidate = candidates[idx]
      const marketKey = String(candidate.market || candidate.type || 'generic')

      if (seenNames.has(candidate.name)) continue
      const marketIsCorrelated = seenMarkets.has(marketKey) && marketKey !== 'generic'
      if (marketIsCorrelated && chosen.length > 0) continue

      seenNames.add(candidate.name)
      seenMarkets.add(marketKey)
      chosen.push(candidate)
    }

    const key = chosen.map((x: any) => x.name).sort().join('||')
    const probability = chosen.reduce((acc, item) => acc * (item.fairNum ?? 0.5), 1)
    const payout = chosen.reduce((acc, item) => acc * (1 / (item.fairNum || 0.5)), 1)

    unique.set(key, {
      legs: chosen.map((item: any) => ({
        name: item.name,
        fair: item.fair,
        market: item.market || item.type || 'General',
      })),
      estProb: Number(probability.toFixed(6)),
      estPayout: Number(payout.toFixed(6)),
    })
  }

  return Array.from(unique.values())
    .sort((a, b) => b.estProb - a.estProb)
    .slice(0, count)
}
