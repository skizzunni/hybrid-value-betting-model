export function generateLocalParlays(
  sourceOrCount?: number | PickItem[] | { items?: PickItem[]; maxLegs?: number; topN?: number },
  maybeMaxLegs?: number,
  maybeTopN?: number,
  extra?: any
): Parlay[] {
  if (typeof sourceOrCount === 'number') {
    const count = Math.max(1, sourceOrCount)
    const maxLegs = typeof maybeMaxLegs === 'number' ? maybeMaxLegs : 2
    const picks = samplePicks.slice(0, Math.min(samplePicks.length, count))
    const parlays: Parlay[] = []

    for (let i = 0; i < picks.length; i += 1) {
      const pick = picks[i]
      const prob = Math.min(0.9999, Math.max(0.0001, pick.fair))
      const payout = probabilityToPayoutMultiplier(prob)
      parlays.push({
        id: `parlay-1-${i}`,
        label: `${pick.title} — ${pick.side}`.trim(),
        legs: [pick],
        probability: prob,
        payoutMultiplier: payout,
        expectedValue: payout * prob - 1,
      })
    }

    if (maxLegs >= 2) {
      for (let i = 0; i < picks.length; i += 1) {
        for (let j = i + 1; j < picks.length; j += 1) {
          const legs = [picks[i], picks[j]]
          const prob = Math.max(
            0.000001,
            product(legs.map((leg) => Math.min(0.9999, Math.max(0.0001, leg.fair))))
          )
          const payout = probabilityToPayoutMultiplier(prob)
          parlays.push({
            id: `parlay-2-${i}-${j}`,
            label: `${legs[0].title} + ${legs[1].title}`,
            legs,
            probability: prob,
            payoutMultiplier: payout,
            expectedValue: payout * prob - 1,
          })
        }
      }
    }

    return parlays.sort((a, b) => b.probability - a.probability)
  }

  // fallback for array/object mode
  const items: PickItem[] = Array.isArray(sourceOrCount)
    ? sourceOrCount
    : sourceOrCount && Array.isArray(sourceOrCount.items)
      ? sourceOrCount.items
      : []

  const maxLegs = typeof maybeMaxLegs === 'number' ? maybeMaxLegs : 2
  const topN = typeof maybeTopN === 'number' ? maybeTopN : 20

  const picks = items
    .map((item) => normalizePick(item))
    .sort((a, b) => b.fair - a.fair)
    .slice(0, topN)

  const parlays: Parlay[] = []

  for (let i = 0; i < picks.length; i += 1) {
    const pick = picks[i]
    const prob = Math.min(0.9999, Math.max(0.0001, pick.fair))
    const payout = probabilityToPayoutMultiplier(prob)
    parlays.push({
      id: `parlay-1-${i}`,
      label: `${pick.title} — ${pick.side}`.trim(),
      legs: [pick],
      probability: prob,
      payoutMultiplier: payout,
      expectedValue: payout * prob - 1,
    })
  }

  if (maxLegs >= 2) {
    for (let i = 0; i < picks.length; i += 1) {
      for (let j = i + 1; j < picks.length; j += 1) {
        const legs = [picks[i], picks[j]]
        const prob = Math.max(
          0.000001,
          product(legs.map((leg) => Math.min(0.9999, Math.max(0.0001, leg.fair))))
        )
        const payout = probabilityToPayoutMultiplier(prob)
        parlays.push({
          id: `parlay-2-${i}-${j}`,
          label: `${legs[0].title} + ${legs[1].title}`,
          legs,
          probability: prob,
          payoutMultiplier: payout,
          expectedValue: payout * prob - 1,
        })
      }
    }
  }

  return parlays.sort((a, b) => b.probability - a.probability)
}
