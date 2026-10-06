export type DailyState = 'live' | 'sample' | 'stale'

export interface DailyPicksFile {
  generated_at?: string
  groups?: Array<{ items?: unknown[] }>
}

export interface TrackingReport {
  graded?: number
  pending?: number
}

export interface DailyStatus {
  state: DailyState
  legs: number
  generatedAt: string | null
  graded: number
  pending: number
}

export const STALE_AFTER_HOURS = 36

export function dailyStatus(picks: DailyPicksFile, report: TrackingReport, now: Date = new Date()): DailyStatus {
  const legs = (picks.groups ?? []).reduce((sum, group) => sum + (group.items?.length ?? 0), 0)
  const generated = picks.generated_at ? Date.parse(picks.generated_at) : NaN
  const ageHours = Number.isFinite(generated) ? (now.getTime() - generated) / 3_600_000 : Infinity
  const state: DailyState = legs === 0 ? 'sample' : ageHours > STALE_AFTER_HOURS ? 'stale' : 'live'
  return {
    state,
    legs,
    generatedAt: Number.isFinite(generated) ? picks.generated_at! : null,
    graded: report.graded ?? 0,
    pending: report.pending ?? 0,
  }
}
