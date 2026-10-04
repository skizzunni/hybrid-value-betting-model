export type Ticket = {
  type: string
  name: string
  fair: string
  book: string
  edge: string
  size: string
  status: string
}

export const seedTickets: Ticket[] = [
  { type: 'Player prop', name: 'Jalen Brunson O 27.5', fair: '58.4%', book: '51.2%', edge: '+8.6%', size: '0.6u', status: 'Live +EV' },
  { type: 'Side', name: 'Lakers +3.5', fair: '54.0%', book: '48.7%', edge: '+4.2%', size: '0.4u', status: 'Monitor' },
  { type: 'Parlay', name: '10-leg SGP build', fair: '14.8%', book: '9.7%', edge: '+11.1%', size: '0.2u', status: 'Correlation check' },
  { type: 'Total', name: 'Over 218.5', fair: '53.8%', book: '49.1%', edge: '+5.7%', size: '0.5u', status: 'Live +EV' },
  { type: 'Side', name: 'Celtics -4.5', fair: '57.1%', book: '52.3%', edge: '+7.4%', size: '0.7u', status: 'Live +EV' },
  { type: 'Total', name: 'Under 224.5', fair: '55.8%', book: '50.6%', edge: '+6.5%', size: '0.5u', status: 'Monitor' },
]

function parsePercentage(value: string): number {
  const stripped = value.trim().replace('%', '')
  return Number(stripped) / 100
}

export function runLocalSimulation(fair: number, trials: number) {
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
    payout: 1 / fair,
  }
}

export function generateLocalParlays(
  legs = 4,
  count = 10,
  minFair = 0.6,
  minEV = -0.01,
) {
  const parsed = seedTickets
    .map((ticket) => {
      const fairNum = parsePercentage(ticket.fair)
      const bookNum = parsePercentage(ticket.book)
      const ev = fairNum - bookNum
      return { ...ticket, fairNum, bookNum, ev }
    })
    .filter((ticket) => Number.isFinite(ticket.fairNum))
    .filter((ticket) => ticket.fairNum >= minFair || ticket.ev >= minEV)
    .sort((a, b) => (b.fairNum ?? 0) - (a.fairNum ?? 0) || (b.ev ?? 0) - (a.ev ?? 0))

  const safeLegs = Math.max(3, Math.min(legs, 6))
  const results: any[] = []

  for (let i = 0; i < Math.min(count, Math.max(1, parsed.length)); i += 1) {
    const slice = parsed.slice(i, i + safeLegs)
    if (slice.length < safeLegs) break

    const estProb = slice.reduce((acc, item) => acc * item.fairNum, 1)
    const totalEV = slice.reduce((acc, item) => acc + (item.ev ?? 0), 0)

    results.push({
      estProb: Number(estProb.toPrecision(4)),
      estPayout: Number((1 / Math.max(0.05, Math.min(0.98, estProb))).toFixed(3)),
      totalEV: Number(totalEV.toFixed(3)),
      legs: slice.map((item) => ({
        name: item.name,
        fair: item.fair,
        book: item.book,
        ev: item.ev,
      })),
    })
  }

  return results.length ? results : []
}
