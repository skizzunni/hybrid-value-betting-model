export function generateLocalParlays(...args: any[]): Parlay[] {
  const first = args[0]
  const second = args[1]
  const third = args[2]
  const fourth = args[3]

  // Support generateLocalParlays(4, 10, 0.6, -0.01)
  if (typeof first === 'number') {
    const count = Math.max(1, first)
    const maxLegs = typeof second === 'number' ? second : 2
    const picks = samplePicks.slice(0, Math.min(samplePicks.length, count))
    const parlays: Parlay[] = []

    for (let i = 0; i < picks.length; i++) {
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
      for (let i = 0; i < picks.length; i++) {
        for (let j = i + 1; j < picks.length; j++) {
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

  // fallback for array mode...
  return []
}
