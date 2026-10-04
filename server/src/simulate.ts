export function runSimulation(fair: number, trials: number) {
  let wins = 0
  let sum = 0
  let sumSquares = 0
  const returns: number[] = []

  for (let i = 0; i < trials; i += 1) {
    const hit = Math.random() < fair
    const returnValue = hit ? (1 / fair) - 1 : -1
    returns.push(returnValue)
    wins += hit ? 1 : 0
    sum += returnValue
    sumSquares += returnValue * returnValue
  }

  const mean = sum / trials
  const variance = sumSquares / trials - mean * mean
  const stdDev = Math.sqrt(variance)
  const positiveRate = returns.filter((value) => value > 0).length / trials

  return {
    fair,
    trials,
    wins,
    winRate: wins / trials,
    meanReturn: mean,
    stdDev,
    positiveRate,
    payout: 1 / fair
  }
}
