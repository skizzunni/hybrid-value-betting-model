import { readJson, statusFile, writeJson } from './io.mjs'
import { defaultStatus, recordRun } from './status.mjs'
import { etDate } from './time.mjs'

export async function loadStatus() {
  return { ...defaultStatus(), ...(await readJson(statusFile(), {})) }
}

// Run a pipeline step; on failure persist the failure into data/tracking-status.json and exit non-zero.
export async function runStep(run, fn) {
  const now = new Date().toISOString()
  try {
    await fn(now)
  } catch (err) {
    console.error(`FAILED (${run}): ${err.message}`)
    const status = await loadStatus()
    await writeJson(statusFile(), recordRun(status, { run, ok: false, now, etDate: etDate(new Date(now)), errors: [{ message: err.message }] }))
    process.exit(1)
  }
}
