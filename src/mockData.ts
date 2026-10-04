export function generateLocalParlays(...args: any[]): Parlay[] {
  const first = args[0]
  const second = args[1]
  const third = args[2]
  const fourth = args[3]

  // Support old calling patterns:
  // generateLocalParlays(4, 10, 0.6, -0.01)
  // generateLocalParlays(items)
  // generateLocalParlays(items, 2)
  // generateLocalParlays(items, { maxLegs: 3, topN: 20 })

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
            product(legs.map((l) => Math.min(0.9999, Math.max(0.0001, l.fair))))
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

  const items = Array.isArray(first)
    ? first
    : first && Array.isArray(first.items)
      ? first.items
      : []

  const maxLegs = typeof second === 'number'
    ? second
    : typeof second === 'object' && second?.maxLegs
      ? second.maxLegs
      : 2

  const topN = typeof third === 'number'
    ? third
    : typeof second === 'object' && second?.topN
      ? second.topN
      : 20

  const picks = items
    .map(normalizePick)
    .sort((a, b) => b.fair - a.fair)
    .slice(0, topN)

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
          product(legs.map((l) => Math.min(0.9999, Math.max(0.0001, l.fair))))
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

export function runLocalSimulation(...args: any[]): SimulationResult {
  const first = args[0]
  const second = args[1]
  const third = args[2]

  if (typeof first === 'number') {
    const trials = Math.max(1, first)
    const stakePerBet = typeof second === 'number' ? second : 1

    let wins = 0
    let losses = 0
    let totalStake = 0
    let totalReturn = 0

    for (let t = 0; t < trials; t++) {
      for (const pick of samplePicks) {
        const p = Math.min(0.999999, Math.max(0, pick.fair))
        const mult = probabilityToPayoutMultiplier(p)
        totalStake += stakePerBet
        const roll = Math.random()
        if (roll < p) {
          totalReturn += stakePerBet * mult
          wins += 1
        } else {
          losses += 1
        }
      }
    }

    const roi = totalStake > 0 ? (totalReturn - totalStake) / totalStake : 0
    const avgProfitPerTrial = (totalReturn - totalStake) / trials

    return {
      trials,
      wins,
      losses,
      totalStake,
      totalReturn,
      roi,
      avgProfitPerTrial,
      summary: `Simulated ${trials} trials with ${samplePicks.length} picks each. Wins: ${wins}, Losses: ${losses}, ROI: ${(roi * 100).toFixed(2)}%.`,
    }
  }

  const items = Array.isArray(first) ? first : []
  const trials =
    typeof second === 'number'
      ? second
      : 5000

  const stakePerBet =
    typeof third === 'number'
      ? third
      : 1

  let wins = 0
  let losses = 0
  let totalStake = 0
  let totalReturn = 0

  for (let t = 0; t < trials; t++) {
    for (const it of items) {
      const normalized = normalizePick(it)
      const p = Math.min(0.999999, Math.max(0, normalized.fair))
      const mult = probabilityToPayoutMultiplier(p)
      totalStake += stakePerBet
      const roll = Math.random()
      if (roll < p) {
        totalReturn += stakePerBet * mult
        wins += 1
      } else {
        losses += 1
      }
    }
  }

  const roi = totalStake > 0 ? (totalReturn - totalStake) / totalStake : 0
  const avgProfitPerTrial = (totalReturn - totalStake) / trials

  return {
    trials,
    wins,
    losses,
    totalStake,
    totalReturn,
    roi,
    avgProfitPerTrial,
    summary: `Simulated ${trials} trials. Wins: ${wins}, Losses: ${losses}, ROI: ${(roi * 100).toFixed(2)}%.`,
  }
}
