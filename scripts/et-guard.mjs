#!/usr/bin/env node
// Decide whether a scheduled run should proceed. Prints run=true|false (and appends to $GITHUB_OUTPUT).
// Usage: node scripts/et-guard.mjs picks|results [--force]
import fs from 'node:fs'
import { loadStatus } from './lib/cli.mjs'
import { shouldRun } from './lib/time.mjs'

const mode = process.argv[2]
const force = process.argv.includes('--force')
const decision = shouldRun({ mode, force, status: await loadStatus() })
console.log(`guard(${mode}): ET ${decision.et_date} hour ${decision.et_hour} -> run=${decision.run} (${decision.reason})`)
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${decision.run}\n`)
