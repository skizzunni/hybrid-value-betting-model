export function runSimulation(fair:number, trials:number){
  // simple Monte Carlo: stake 1 unit, payout equals 1/(fair) on win (rough approximation)
  // return distribution: number of wins, mean return, std, pct positive
  let wins = 0
  let sum = 0
  let sumsq = 0
  const returns:number[] = []
  const payout = 1 / fair // naive fair payout
  for(let i=0;i<trials;i++){
    const r = Math.random() < fair ? 1 : 0
    const ret = r ? payout - 1 : -1
    returns.push(ret)
    wins += r
    sum += ret
    sumsq += ret*ret
  }
  const mean = sum / trials
  const variance = sumsq / trials - mean*mean
  const std = Math.sqrt(variance)
  const pctPositive = returns.filter(v=>v>0).length / trials
  return {trials, fair, payout, wins, mean, std, pctPositive}
}
