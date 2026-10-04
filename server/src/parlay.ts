export function parsePercentage(v: any): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    const m = s.match(/([0-9]*\.?[0-9]+)\s*%/)
    if (m) return Number(m[1]) / 100
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function computeEV(fair: number, bookProb: number) {
  if (!bookProb || bookProb <= 0) return fair / Math.max(0.01, bookProb) - 1
  return fair * (1 / bookProb) - 1
}

export function generateHighProbParlays(
  tickets: any[],
  legs: number = 4,
  count: number = 20,
  minFair: number = 0.6,
  minEV: number = -0.01,
) {
  const safeLegs = Math.max(1, Math.min(legs, 6))
  const parsed = tickets
    .map((t: any) => {
      const fair = parsePercentage(t.fair)
      const book = parsePercentage(t.book)
      const fairNum = fair !== null ? fair : undefined
      const bookProb = book !== null ? book : undefined
      const ev = fairNum !== undefined && bookProb !== undefined ? computeEV(fairNum, bookProb) : undefined
      return { ...t, fairNum, bookProb, ev }
    })
    .filter((t: any) => Number.isFinite(t.fairNum))

  if (parsed.length === 0) return []

  let candidates = parsed.filter((p: any) => p.fairNum >= minFair && (p.ev === undefined || p.ev >= minEV))
  if (candidates.length < safeLegs) {
    candidates = parsed.filter((p: any) => p.fairNum >= Math.max(0.1, minFair - 0.05))
  }
  if (candidates.length < safeLegs) {
    candidates = parsed.slice()
  }

  candidates.sort((a: any, b: any) => {
    const ae = a.ev ?? -999
    const be = b.ev ?? -999
    if (be !== ae) return be - ae
    return (b.fairNum ?? 0) - (a.fairNum ?? 0)
  })

  const attempts = Math.max(800, count * 400)
  const resultsMap = new Map<string, any>()

  for (let i = 0; i < attempts; i++) {
    const chosen: any[] = []
    const usedMarkets = new Set<string>()
    const usedGames = new Set<string>()

    while (chosen.length < safeLegs) {
      const sampleTop = Math.max(6, Math.floor(candidates.length * 0.25))
      const idx = Math.floor(Math.pow(Math.random(), 1.6) * sampleTop)
      const cand = candidates[idx] || candidates[Math.floor(Math.random() * candidates.length)]
      if (!cand) break

      const marketKey = String(cand.market || cand.type || '')
      const gameKey = String(cand.game || cand.match || cand.team || '')
      if ((marketKey && usedMarkets.has(marketKey)) || (gameKey && usedGames.has(gameKey))) {
        const allowDup = chosen.length + (candidates.length - chosen.length) < safeLegs
        if (!allowDup && Math.random() > 0.1) continue
      }

      if (!chosen.find((item: any) => item.name === cand.name)) {
        chosen.push(cand)
        if (marketKey) usedMarkets.add(marketKey)
        if (gameKey) usedGames.add(gameKey)
      }
    }

    if (chosen.length !== safeLegs) continue

    const key = chosen.map((item: any) => item.name).sort().join('||')
    if (resultsMap.has(key)) continue

    const estProb = chosen.reduce((acc, item) => acc * (item.fairNum ?? 0.5), 1)
    const estPayout = chosen.reduce((acc, item) => acc * (1 / Math.max(0.0001, item.bookProb ?? item.fairNum ?? 0.5)), 1)
    const totalEV = chosen.reduce((acc, item) => acc + (item.ev ?? 0), 0)

    resultsMap.set(key, {
      legs: chosen.map((item: any) => ({
        name: item.name,
        fair: item.fairNum,
        book: item.bookProb,
        ev: item.ev,
        market: item.market || item.type || null,
      })),
      estProb: Number(estProb.toPrecision(6)),
      estPayout: Number(estPayout.toPrecision(6)),
      totalEV: Number(totalEV.toFixed(6)),
    })
  }

  return Array.from(resultsMap.values())
    .sort((a, b) => (b.estProb || 0) - (a.estProb || 0) || (b.totalEV || 0) - (a.totalEV || 0))
    .slice(0, count)
}
