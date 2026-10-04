export type CalibrationBucket = {
  predicted: number
  outcomes: boolean[]
  count: number
  actualRate: number
}

export type Prediction = { predicted: number; actual: boolean }

type TrackedPrediction = { predicted: number; actual?: boolean }
const STORAGE_KEY = 'hvbm.calibration.predictions'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function loadPredictions(): Record<string, TrackedPrediction> {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, TrackedPrediction> : {}
  } catch {
    return {}
  }
}

function savePredictions(predictions: Record<string, TrackedPrediction>): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(predictions))
  } catch {
    return
  }
}

export function computeBrierScore(predictions: Prediction[]): number {
  if (!predictions.length) return 0
  return predictions.reduce((sum, { predicted, actual }) => (
    sum + (predicted - Number(actual)) ** 2
  ), 0) / predictions.length
}

export function calibrationCurve(predictions: Prediction[]): CalibrationBucket[] {
  const groups = new Map<number, Prediction[]>()
  for (const prediction of predictions) {
    if (!Number.isFinite(prediction.predicted)) continue
    const bucket = Math.max(0, Math.min(9, Math.floor(prediction.predicted * 10)))
    groups.set(bucket, [...(groups.get(bucket) ?? []), prediction])
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, entries]) => {
    const outcomes = entries.map((entry) => entry.actual)
    return {
      predicted: entries.reduce((sum, entry) => sum + entry.predicted, 0) / entries.length,
      outcomes,
      count: entries.length,
      actualRate: outcomes.filter(Boolean).length / outcomes.length,
    }
  })
}

export function trackPrediction(legId: string, modelProb: number): void {
  if (!Number.isFinite(modelProb) || modelProb < 0 || modelProb > 1) return
  const predictions = loadPredictions()
  if (!predictions[legId]) {
    predictions[legId] = { predicted: modelProb }
    savePredictions(predictions)
  }
}

export function resolvePrediction(legId: string, hit: boolean): void {
  const predictions = loadPredictions()
  const prediction = predictions[legId]
  if (!prediction) return
  predictions[legId] = { ...prediction, actual: hit }
  savePredictions(predictions)
}

export function getCalibration(): {
  brierScore: number
  buckets: CalibrationBucket[]
  calibrationError: number
} {
  const predictions = Object.values(loadPredictions())
    .filter((prediction): prediction is TrackedPrediction & { actual: boolean } => typeof prediction.actual === 'boolean')
    .map(({ predicted, actual }) => ({ predicted, actual }))
  const buckets = calibrationCurve(predictions)
  const calibrationError = buckets.length
    ? buckets.reduce((sum, bucket) => sum + (bucket.actualRate - bucket.predicted) ** 2, 0) / buckets.length
    : 0
  return { brierScore: computeBrierScore(predictions), buckets, calibrationError }
}
