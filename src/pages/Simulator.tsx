import { useState, type FormEvent } from 'react'
import Badge from '../components/Badge'
import Card from '../components/Card'
import Disclaimer from '../components/Disclaimer'
import EmptyState from '../components/EmptyState'
import LineChart from '../components/LineChart'
import PageHeader from '../components/PageHeader'
import Stat from '../components/Stat'
import { runLocalSimulation, samplePicks, type SimulationResult } from '../mockData'
import { currency, percent, signedCurrency, signedPercent } from '../lib/format'

const MAX_TRIALS = 100000
const SEGMENTS = 50
const DEFAULTS = { trials: '5000', stake: '1' }

type Run = { result: SimulationResult; curve: number[] }

function simulate(trials: number, stake: number): Run {
  const segments = Math.min(SEGMENTS, trials)
  const base = Math.floor(trials / segments)
  const total: SimulationResult = {
    trials: 0, wins: 0, losses: 0, totalStake: 0, totalReturn: 0, roi: 0, avgProfitPerTrial: 0, summary: '',
  }
  const curve: number[] = [0]
  for (let i = 0; i < segments; i += 1) {
    const n = i === segments - 1 ? trials - base * (segments - 1) : base
    const r = runLocalSimulation(n, stake)
    total.trials += r.trials
    total.wins += r.wins
    total.losses += r.losses
    total.totalStake += r.totalStake
    total.totalReturn += r.totalReturn
    curve.push(total.totalReturn - total.totalStake)
  }
  total.roi = total.totalStake > 0 ? (total.totalReturn - total.totalStake) / total.totalStake : 0
  total.avgProfitPerTrial = (total.totalReturn - total.totalStake) / total.trials
  total.summary = `Simulated ${total.trials} trials with ${samplePicks.length} picks each.`
  return { result: total, curve }
}

export default function Simulator() {
  const [trials, setTrials] = useState(DEFAULTS.trials)
  const [stake, setStake] = useState(DEFAULTS.stake)
  const [run, setRun] = useState<Run | null>(null)

  const trialsNum = Math.floor(Number(trials))
  const stakeNum = Number(stake)
  const valid = trialsNum >= 1 && trialsNum <= MAX_TRIALS && stakeNum > 0

  function submit(event: FormEvent) {
    event.preventDefault()
    if (valid) setRun(simulate(trialsNum, stakeNum))
  }

  function reset() {
    setTrials(DEFAULTS.trials)
    setStake(DEFAULTS.stake)
    setRun(null)
  }

  const r = run?.result
  const profit = r ? r.totalReturn - r.totalStake : 0

  return (
    <>
      <PageHeader
        title="Simulator"
        subtitle="Monte Carlo of straight bets on the sample picks, using each pick's fair probability."
        actions={<Badge kind="demo">Sample data</Badge>}
      />
      <div className="grid-2">
        <Card title="Inputs">
          <form className="stack" onSubmit={submit}>
            <label className="field" htmlFor="sim-trials">
              Trials (1 – {MAX_TRIALS.toLocaleString('en-US')})
              <input id="sim-trials" className="input" type="number" min="1" max={MAX_TRIALS} value={trials} onChange={(e) => setTrials(e.target.value)} />
            </label>
            <label className="field" htmlFor="sim-stake">
              Stake per bet ($)
              <input id="sim-stake" className="input" type="number" min="0.01" step="0.01" value={stake} onChange={(e) => setStake(e.target.value)} />
            </label>
            <p className="muted" style={{ fontSize: 12 }}>
              Payouts assume the fair price less a 5% margin. Each trial bets every sample pick once.
            </p>
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={!valid}>Run simulation</button>
              <button type="button" className="btn" onClick={reset}>Reset</button>
            </div>
            {!valid && <p className="tone-warning" style={{ fontSize: 12 }} role="alert">Enter 1–{MAX_TRIALS.toLocaleString('en-US')} trials and a positive stake.</p>}
          </form>
        </Card>

        <Card title="Results">
          {!r || !run ? (
            <EmptyState title="No simulation yet" description="Set your inputs and run the simulation to see results." />
          ) : (
            <div className="stack">
              <div className="grid-stats">
                <Stat label="ROI" value={signedPercent(r.roi, 2)} tone={r.roi >= 0 ? 'positive' : 'negative'} />
                <Stat label="Net profit" value={signedCurrency(profit)} tone={profit >= 0 ? 'positive' : 'negative'} />
                <Stat label="Hit rate" value={percent(r.wins / (r.wins + r.losses), 1)} delta={`${r.wins.toLocaleString('en-US')} W / ${r.losses.toLocaleString('en-US')} L`} />
                <Stat label="Total staked" value={currency(r.totalStake)} delta={`${r.trials.toLocaleString('en-US')} trials`} />
              </div>
              <h3 className="section-title" style={{ margin: 'var(--sp-3) 0 0' }}>Cumulative profit</h3>
              <LineChart values={run.curve} label="Cumulative simulated profit" />
              <details className="details">
                <summary>Details</summary>
                <pre>{JSON.stringify(r, null, 2)}</pre>
              </details>
            </div>
          )}
        </Card>
      </div>
      <Disclaimer />
    </>
  )
}
