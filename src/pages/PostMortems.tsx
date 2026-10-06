import { useMemo, useState } from 'react'
import Card from '../components/Card'
import DataTable, { type Column } from '../components/DataTable'
import Disclaimer from '../components/Disclaimer'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import Stat from '../components/Stat'
import TrackingPanel from '../components/TrackingPanel'
import { loadLedger, type LedgerEntry, updateTicketSettlement } from '../engine/ledger'
import { aggregateResults, findLeaks, type ResolvedBet, type SegmentStats } from '../engine/postmortem/aggregate'
import { classifyLoss, type LossAnalysis, type LossCause } from '../engine/postmortem/classify'
import {
  loadLearnedAdjustments,
  loadLearningChangeLog,
  resetLearning,
  updateLearning,
  type LearnedAdjustment,
  type LearningChange,
} from '../engine/postmortem/learning'
import {
  fetchLatestScores,
  loadLegOutcomes,
  recordClosingOdds,
  recordLegOutcome,
  resolveScoreFeed,
  settleTicket,
  type LegOutcome,
  type LegResult,
} from '../engine/postmortem/results'
import { loadLegSnapshots } from '../engine/postmortem/snapshot'
import type { LegSnapshot } from '../engine/postmortem/snapshot'
import { useSlate } from '../lib/slate'

const CAUSES: Array<{ key: LossCause; label: string }> = [
  { key: 'bad_bet', label: 'Bad bet / process error' },
  { key: 'variance_good_bet', label: 'Expected variance' },
  { key: 'information_miss', label: 'Likely late information' },
  { key: 'calibration_miss', label: 'Calibration miss' },
  { key: 'correlation_loss', label: 'Correlation loss' },
  { key: 'parlay_structure', label: 'Parlay structure' },
  { key: 'unknown', label: 'Unknown' },
]

function downloadJSON(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function signedOdds(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}

function probabilityBucket(value: number): string {
  const low = Math.floor(Math.min(1 - Number.EPSILON, Math.max(0, value)) * 10) * 10
  return `${low}-${low + 10}%`
}

interface LossRow {
  snapshot: LegSnapshot
  analysis: LossAnalysis
  breakingLegs: string[]
}

const adjustmentColumns: Column<LearnedAdjustment>[] = [
  { key: 'segment', header: 'Segment', render: (entry) => entry.segmentId },
  { key: 'factor', header: 'Probability shift', align: 'right', render: (entry) => `${entry.factor >= 0 ? '+' : ''}${(entry.factor * 100).toFixed(2)} pp` },
  { key: 'n', header: 'Resolved bets', align: 'right', render: (entry) => entry.sampleSize },
  { key: 'evidence', header: 'Evidence', render: (entry) => entry.evidence },
]

const changeColumns: Column<LearningChange>[] = [
  { key: 'date', header: 'Updated', render: (entry) => new Date(entry.timestamp).toLocaleString() },
  { key: 'segment', header: 'Segment', render: (entry) => entry.segment },
  { key: 'shift', header: 'Change', align: 'right', render: (entry) => `${(entry.oldFactor * 100).toFixed(2)} → ${(entry.newFactor * 100).toFixed(2)} pp` },
  { key: 'n', header: 'Sample', align: 'right', render: (entry) => entry.sampleSize },
  { key: 'evidence', header: 'Evidence', render: (entry) => entry.evidence },
]

function leaksForSegments(segment: SegmentStats, leakIds: string[]): string {
  return leakIds.includes(segment.id) ? 'Significant underperformance' : `Not enough evidence yet (${segment.n} resolved bets)`
}

function segmentColumns(leakIds: string[]): Column<SegmentStats>[] {
  return [
    { key: 'segment', header: 'Segment', render: (segment) => segment.id },
    { key: 'n', header: 'n', align: 'right', render: (segment) => segment.n },
    { key: 'predicted', header: 'Predicted', align: 'right', render: (segment) => percent(segment.predictedMean) },
    { key: 'observed', header: 'Observed', align: 'right', render: (segment) => percent(segment.observedHitRate) },
    { key: 'interval', header: 'Wilson interval', align: 'right', render: (segment) => `${percent(segment.confidenceInterval.lower)}–${percent(segment.confidenceInterval.upper)}` },
    { key: 'brier', header: 'Brier', align: 'right', render: (segment) => segment.brierScore.toFixed(3) },
    { key: 'roi', header: 'ROI', align: 'right', render: (segment) => segment.roi === undefined ? `unknown (${segment.roiSampleSize} tickets)` : `${(segment.roi * 100).toFixed(1)}%` },
    { key: 'clv', header: 'Avg CLV', align: 'right', render: (segment) => segment.averageCLV === undefined ? 'unknown' : `${segment.averageCLV.toFixed(2)}%` },
    { key: 'signal', header: 'Evidence', render: (segment) => leaksForSegments(segment, leakIds) },
  ]
}

export default function PostMortems() {
  const slate = useSlate()
  const [snapshots, setSnapshots] = useState<LegSnapshot[]>(() => loadLegSnapshots())
  const [outcomes, setOutcomes] = useState<LegOutcome[]>(() => loadLegOutcomes())
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => loadLedger())
  const [adjustments, setAdjustments] = useState<LearnedAdjustment[]>(() => loadLearnedAdjustments().adjustments)
  const [changes, setChanges] = useState<LearningChange[]>(() => loadLearningChangeLog())
  const [closingLines, setClosingLines] = useState<Record<string, string>>({})
  const [closingOppositeLines, setClosingOppositeLines] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const outcomeByLeg = useMemo(() => new Map(outcomes.map((outcome) => [outcome.legId, outcome])), [outcomes])
  const resolved: ResolvedBet[] = useMemo(() => snapshots.flatMap((snapshot) => {
    const result = outcomeByLeg.get(snapshot.legId)?.result
    const ticket = ledger.find((entry) => entry.snapshotTicketId === snapshot.ticketId)
    return result === 'win' || result === 'loss'
      ? [{ snapshot, result, ticketId: snapshot.ticketId, stake: ticket?.stake, payout: ticket?.payout, clv: snapshot.clv }]
      : []
  }), [snapshots, outcomeByLeg, ledger])
  const segments = useMemo(() => aggregateResults(resolved), [resolved])
  const leaks = useMemo(() => findLeaks(segments, { minSample: 50, alpha: 0.05 }), [segments])
  const losses = useMemo<LossRow[]>(() => {
    const lostSnapshots = snapshots.filter((snapshot) => outcomeByLeg.get(snapshot.legId)?.result === 'loss')
    return lostSnapshots.map((snapshot) => {
      const sameTicket = snapshots.filter((candidate) => candidate.ticketId === snapshot.ticketId)
      const lostInTicket = sameTicket.filter((candidate) => outcomeByLeg.get(candidate.legId)?.result === 'loss')
      const probabilitySegment = segments.find((segment) =>
        segment.dimension === 'probabilityBucket' && segment.value === probabilityBucket(snapshot.modelProbability),
      )
      const analysis = classifyLoss({
        snapshot,
        result: 'loss',
        ticketLegCount: sameTicket.length,
        lostLegCount: lostInTicket.length,
        ticketProbability: sameTicket.length ? sameTicket.reduce((product, leg) => product * leg.modelProbability, 1) : undefined,
        otherLostLegs: lostInTicket.filter((leg) => leg.legId !== snapshot.legId),
        calibration: probabilitySegment ? {
          n: probabilitySegment.n,
          predictedProbability: probabilitySegment.predictedMean,
          observedHitRate: probabilitySegment.observedHitRate,
          confidenceUpper: probabilitySegment.confidenceInterval.upper,
        } : undefined,
      })
      return { snapshot, analysis, breakingLegs: lostInTicket.map((leg) => leg.selection) }
    })
  }, [snapshots, outcomeByLeg, segments])
  const pending = snapshots.filter((snapshot) => !outcomeByLeg.has(snapshot.legId))
  const needsClosing = snapshots.filter((snapshot) =>
    outcomeByLeg.get(snapshot.legId)?.result !== 'loss' && snapshot.clv === undefined,
  )
  const causeCounts = useMemo(() => {
    const counts = new Map<LossCause, number>(CAUSES.map(({ key }) => [key, 0]))
    for (const loss of losses) counts.set(loss.analysis.primaryCause, (counts.get(loss.analysis.primaryCause) ?? 0) + 1)
    return counts
  }, [losses])

  function refreshLocalState() {
    setSnapshots(loadLegSnapshots())
    setOutcomes(loadLegOutcomes())
    setLedger(loadLedger())
    setAdjustments(loadLearnedAdjustments().adjustments)
    setChanges(loadLearningChangeLog())
  }

  async function fetchScores() {
    setBusy(true)
    setStatus('Fetching completed scores for unresolved snapshots…')
    const result = await fetchLatestScores([...new Set(pending.map((snapshot) => snapshot.sport))])
    if (result.error) {
      setStatus(result.error)
      setBusy(false)
      return
    }
    const updated = resolveScoreFeed(result.scores, pending)
    refreshLocalState()
    setStatus(updated.length
      ? `Resolved ${updated.length} pending leg${updated.length === 1 ? '' : 's'} from final scores.`
      : 'No matching completed scores were found. These outcomes remain unknown until resolved manually.')
    setBusy(false)
  }

  function overrideOutcome(legId: string, result: LegResult) {
    if (result === 'unknown') return
    recordLegOutcome(legId, result, 'manual')
    const changed = snapshots.find((snapshot) => snapshot.legId === legId)
    if (changed) {
      const ticketSnapshots = snapshots.filter((snapshot) => snapshot.ticketId === changed.ticketId)
      const current = new Map(loadLegOutcomes().map((outcome) => [outcome.legId, outcome.result]))
      current.set(legId, result)
      const ticketResults = ticketSnapshots.map((snapshot) => current.get(snapshot.legId) ?? 'unknown')
      const entry = ledger.find((item) => item.snapshotTicketId === changed.ticketId)
      if (entry && ticketResults.every((item) => item !== 'unknown')) {
        const settlement = settleTicket(ticketSnapshots, ticketResults, entry.stake)
        if (settlement.result !== 'unknown') {
          updateTicketSettlement(changed.ticketId, settlement.result, settlement.payout, settlement.legsHit)
        }
      }
    }
    refreshLocalState()
    setStatus('Manual result saved for this leg.')
  }

  function saveClosingLine(legId: string) {
    const value = Number(closingLines[legId])
    const opposite = closingOppositeLines[legId] === undefined || closingOppositeLines[legId] === ''
      ? undefined
      : Number(closingOppositeLines[legId])
    if (!Number.isFinite(value) || value === 0) {
      setStatus('Enter valid non-zero American closing odds.')
      return
    }
    if (opposite !== undefined && (!Number.isFinite(opposite) || opposite === 0)) {
      setStatus('Enter valid non-zero opposite-side American closing odds, or leave it blank.')
      return
    }
    if (!recordClosingOdds(legId, value, opposite)) {
      setStatus('This leg has no saved pick-time snapshot.')
      return
    }
    refreshLocalState()
    setStatus('Closing odds and CLV saved.')
  }

  function updateModel() {
    const next = updateLearning(segments, { minSample: 50, priorWeight: 100, maxShift: 0.05, alpha: 0.05 })
    setAdjustments(next.adjustments)
    setChanges(loadLearningChangeLog())
    slate.setLearningEnabled(slate.learningEnabled)
    setStatus(next.adjustments.length
      ? `Updated ${next.adjustments.length} evidence-supported calibration adjustment${next.adjustments.length === 1 ? '' : 's'}.`
      : 'No segments met the sample-size and significance guards; the model was not changed.')
  }

  function resetModel() {
    resetLearning()
    setAdjustments([])
    setChanges([])
    slate.setLearningEnabled(false)
    setStatus('Learning adjustments and change log reset.')
  }

  return (
    <>
      <PageHeader
        title="Post-mortems"
        subtitle="Review measured outcomes and patterns. The system cannot infer player or injury causes without a data feed."
        actions={<button type="button" className="btn" onClick={() => void fetchScores()} disabled={busy || pending.length === 0}>{busy ? 'Fetching scores…' : 'Fetch latest scores'}</button>}
      />
      <p className="notice" role="note">Single losses rarely mean the model was wrong. We only adjust on aggregated evidence.</p>
      <p className="leg-sub">Scores and pick snapshots are stored locally in this browser. Missing scores or closing prices stay unknown; player-level and injury causes are not inferred.</p>
      {status && <p className="notice" role="status">{status}</p>}
      <TrackingPanel />

      <div className="grid-stats">
        <Stat label="Losses analyzed" value={losses.length} hint={`${snapshots.length} saved leg snapshots`} />
        {CAUSES.map(({ key, label }) => {
          const count = causeCounts.get(key) ?? 0
          return <Stat key={key} label={label} value={losses.length ? percent(count / losses.length) : '—'} delta={`${count} of ${losses.length} losses`} />
        })}
      </div>

      <section aria-labelledby="losses-title" className="stack-lg">
        <h2 className="section-title" id="losses-title">Loss list</h2>
        {losses.length === 0 ? (
          <EmptyState title="No resolved losses to analyze" description="Log results on the Tickets page or fetch final scores for saved snapshots. Unknown outcomes are not classified as losses." />
        ) : losses.map(({ snapshot, analysis, breakingLegs }) => (
          <Card key={snapshot.legId} title={`${snapshot.ticketId} · ${snapshot.selection}`}>
            <div className="metrics">
              <div><div className="metric-label">Market / sport</div><div className="metric-value">{snapshot.market} · {snapshot.sport}</div></div>
              <div><div className="metric-label">Taken odds</div><div className="metric-value">{signedOdds(snapshot.takenAmericanOdds)}</div></div>
              <div><div className="metric-label">Pick-time edge</div><div className="metric-value">{snapshot.edge === undefined ? 'unknown' : `${(snapshot.edge * 100).toFixed(2)}%`}</div></div>
              <div><div className="metric-label">CLV</div><div className="metric-value">{snapshot.clv === undefined ? 'unknown' : `${snapshot.clv.toFixed(2)}%`}</div></div>
              <div><div className="metric-label">Surprise</div><div className="metric-value">{snapshot.modelProbability === undefined ? 'unknown' : `Lost despite ${percent(snapshot.modelProbability)} model probability`}</div></div>
              <div><div className="metric-label">Side / tier / source</div><div className="metric-value">{snapshot.side} · {snapshot.tier} · {snapshot.dataSource}</div></div>
            </div>
            <p><strong>{analysis.primaryCause.replace(/_/g, ' ')}</strong>: {analysis.evidence}</p>
            {breakingLegs.length > 0 && <p className="leg-sub">Breaking leg{breakingLegs.length === 1 ? '' : 's'} ({breakingLegs.length}): {breakingLegs.join(', ')}</p>}
            {analysis.secondaryTags.length > 0 && (
              <ul>{analysis.secondaryTags.map((tag, index) => <li key={`${tag.cause}-${index}`}><strong>{tag.cause.replace(/_/g, ' ')}</strong>: {tag.evidence}</li>)}</ul>
            )}
            <div className="row">
              <label className="field" htmlFor={`override-${snapshot.legId}`}>
                Manual override
                <select
                  id={`override-${snapshot.legId}`}
                  className="input"
                  value={outcomeByLeg.get(snapshot.legId)?.result ?? 'loss'}
                  onChange={(event) => overrideOutcome(snapshot.legId, event.target.value as LegResult)}
                >
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="push">Push</option>
                </select>
              </label>
              <label className="field" htmlFor={`closing-${snapshot.legId}`}>
                Closing American odds (selected side)
                <input id={`closing-${snapshot.legId}`} className="input" type="number" value={closingLines[snapshot.legId] ?? ''} onChange={(event) => setClosingLines((current) => ({ ...current, [snapshot.legId]: event.target.value }))} placeholder="e.g. -105" />
              </label>
              <label className="field" htmlFor={`closing-opposite-${snapshot.legId}`}>
                Opposite-side closing odds (optional, for no-vig movement)
                <input id={`closing-opposite-${snapshot.legId}`} className="input" type="number" value={closingOppositeLines[snapshot.legId] ?? ''} onChange={(event) => setClosingOppositeLines((current) => ({ ...current, [snapshot.legId]: event.target.value }))} placeholder="e.g. -115" />
              </label>
              <button type="button" className="btn btn-sm" onClick={() => saveClosingLine(snapshot.legId)}>Record closing odds</button>
            </div>
          </Card>
        ))}
      </section>

      {pending.length > 0 && (
        <section aria-labelledby="pending-title" className="stack-lg">
          <h2 className="section-title" id="pending-title">Pending results</h2>
          {pending.map((snapshot) => (
            <Card key={snapshot.legId} title={`${snapshot.ticketId} · ${snapshot.selection}`}>
              <p className="leg-sub">{snapshot.teams.join(' vs ')} · {snapshot.market} · taken at {signedOdds(snapshot.takenAmericanOdds)}</p>
              <label className="field" htmlFor={`pending-${snapshot.legId}`}>
                Manual result
                <select id={`pending-${snapshot.legId}`} className="input" defaultValue="unknown" onChange={(event) => overrideOutcome(snapshot.legId, event.target.value as LegResult)}>
                  <option value="unknown">Choose win, loss or push</option>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="push">Push</option>
                </select>
              </label>
            </Card>
          ))}
        </section>
      )}

      {needsClosing.length > 0 && (
        <section aria-labelledby="closing-title" className="stack-lg">
          <h2 className="section-title" id="closing-title">Closing line capture</h2>
          <p className="leg-sub">Enter closing prices for resolved wins or pending legs too; missing prices remain unknown.</p>
          {needsClosing.map((snapshot) => (
            <Card key={snapshot.legId} title={`${snapshot.ticketId} · ${snapshot.selection}`}>
              <div className="row">
                <label className="field" htmlFor={`other-closing-${snapshot.legId}`}>
                  Closing American odds (selected side)
                  <input id={`other-closing-${snapshot.legId}`} className="input" type="number" value={closingLines[snapshot.legId] ?? ''} onChange={(event) => setClosingLines((current) => ({ ...current, [snapshot.legId]: event.target.value }))} placeholder="e.g. -105" />
                </label>
                <label className="field" htmlFor={`other-closing-opposite-${snapshot.legId}`}>
                  Opposite-side closing odds (optional)
                  <input id={`other-closing-opposite-${snapshot.legId}`} className="input" type="number" value={closingOppositeLines[snapshot.legId] ?? ''} onChange={(event) => setClosingOppositeLines((current) => ({ ...current, [snapshot.legId]: event.target.value }))} placeholder="e.g. -115" />
                </label>
                <button type="button" className="btn btn-sm" onClick={() => saveClosingLine(snapshot.legId)}>Record closing odds</button>
              </div>
            </Card>
          ))}
        </section>
      )}

      <section aria-labelledby="leaks-title" className="stack-lg">
        <h2 className="section-title" id="leaks-title">Aggregated segments and leaks</h2>
        {leaks.length === 0 ? (
          <EmptyState title="Not enough evidence yet" description={`No segment has at least 50 resolved bets and statistically significant underperformance. There are ${resolved.length} resolved win/loss leg outcomes; pushes are excluded.`} />
        ) : (
          <div className="grid-cards">{leaks.map((segment) => (
            <Card key={segment.id} title={segment.id}>
              <p>{segment.insight}</p>
              <p>ROI {segment.roi === undefined ? `unknown (${segment.roiSampleSize} tickets)` : `${(segment.roi * 100).toFixed(1)}% (${segment.roiSampleSize} tickets)`} · Brier {segment.brierScore.toFixed(3)} · Avg CLV {segment.averageCLV === undefined ? 'unknown' : `${segment.averageCLV.toFixed(2)}%`}</p>
            </Card>
          ))}</div>
        )}
        {segments.length > 0 && (
          <Card title="All resolved segments" padded={false}>
            <DataTable
              columns={segmentColumns(leaks.map((leak) => leak.id))}
              rows={segments}
              rowKey={(segment) => segment.id}
              caption="Resolved segment statistics and evidence thresholds"
            />
          </Card>
        )}
        <p className="leg-sub">Segments group results by sport, market, side, tier, edge/probability bucket, ticket mode and Live/Demo source. Sample counts and intervals—not single losses—drive leak detection.</p>
      </section>

      <section aria-labelledby="learning-title" className="stack-lg">
        <h2 className="section-title" id="learning-title">Learning</h2>
        <Card title="Opt-in adjusted probabilities">
          <label className="field" htmlFor="learning-enabled">
            <input id="learning-enabled" type="checkbox" checked={slate.learningEnabled} onChange={(event) => slate.setLearningEnabled(event.target.checked)} />
            Apply evidence-supported adjustments to generated ticket probabilities (default off)
          </label>
          <p className="leg-sub">Adjustments require at least 50 resolved bets, a significance guard, empirical-Bayes shrinkage and a maximum five percentage-point shift.</p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={updateModel}>Update from aggregated results</button>
            <button type="button" className="btn" onClick={() => downloadJSON('postmortem-learning.json', { adjustments, changes })}>Export learning JSON</button>
            <button type="button" className="btn" onClick={resetModel}>Reset learning</button>
          </div>
          {adjustments.length === 0 ? (
            <EmptyState title="No active adjustments" description="The model remains unchanged until aggregated results meet the evidence guards." />
          ) : (
            <DataTable columns={adjustmentColumns} rows={adjustments} rowKey={(entry) => entry.segmentId} caption="Current learning adjustments" />
          )}
        </Card>
        <Card title="Append-only change log" padded={false}>
          {changes.length === 0
            ? <EmptyState title="No learning changes recorded" description="When evidence qualifies, each adjustment and its sample count will be recorded here." />
            : <DataTable columns={changeColumns} rows={changes} rowKey={(entry, index) => `${entry.timestamp}-${entry.segment}-${index}`} caption="Learning change log" />}
        </Card>
      </section>
      <Disclaimer />
    </>
  )
}
