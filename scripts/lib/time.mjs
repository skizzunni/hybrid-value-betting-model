const TZ = 'America/New_York'

export function etParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  })
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }
}

export const etDate = (date = new Date()) => etParts(date).date

// Cron runs in UTC, which cannot follow DST. Workflows fire at several UTC hours and this guard
// decides, from the real ET clock, whether a run is allowed and still needed today.
//   picks   : ET hour 0-7 (midnight to 8 AM), once per ET day after a successful run
//   results : ET hour 18-23 (evening results-only refresh), once per ET day after a successful run
export function shouldRun({ mode, now = new Date(), status = {}, force = false }) {
  const { date, hour } = etParts(now)
  if (force) return { run: true, reason: 'forced', et_date: date, et_hour: hour }
  if (mode === 'picks') {
    if (hour < 0 || hour >= 8) return { run: false, reason: `ET hour ${hour} outside 00:00-08:00 window`, et_date: date, et_hour: hour }
    const last = status.last_pick_run
    if (last?.ok && last.et_date === date) return { run: false, reason: `picks already published for ${date}`, et_date: date, et_hour: hour }
    return { run: true, reason: 'in window and not yet run', et_date: date, et_hour: hour }
  }
  if (mode === 'results') {
    if (hour < 18) return { run: false, reason: `ET hour ${hour} before evening results window`, et_date: date, et_hour: hour }
    const last = status.last_evening_results_run
    if (last?.ok && last.et_date === date) return { run: false, reason: `evening results already refreshed for ${date}`, et_date: date, et_hour: hour }
    return { run: true, reason: 'in window and not yet run', et_date: date, et_hour: hour }
  }
  throw new Error(`Unknown mode ${mode}`)
}
