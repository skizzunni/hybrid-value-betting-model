import fs from 'node:fs/promises'
import path from 'node:path'

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]))
  }
  return value
}

// Stable key order keeps committed files diff-friendly and re-runs byte-identical.
export function stableStringify(value, indent) {
  return JSON.stringify(sortKeys(value), null, indent)
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return fallback
    throw new Error(`Cannot parse ${file}: ${err.message}`)
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, stableStringify(value, 2) + '\n', 'utf8')
}

export async function readJsonl(file) {
  let text
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  return text.split('\n').filter((l) => l.trim()).map((line, i) => {
    try {
      return JSON.parse(line)
    } catch (err) {
      throw new Error(`Cannot parse ${file} line ${i + 1}: ${err.message}`)
    }
  })
}

export async function writeJsonl(file, rows, keyField) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const sorted = rows.slice().sort((a, b) => String(a[keyField]).localeCompare(String(b[keyField])))
  await fs.writeFile(file, sorted.map((r) => stableStringify(r)).join('\n') + (sorted.length ? '\n' : ''), 'utf8')
}

export const gamesFile = (label) => path.join(DATA_DIR, 'games', `${label}.jsonl`)
export const legsFile = () => path.join(DATA_DIR, 'pick-legs.jsonl')
export const statusFile = () => path.join(DATA_DIR, 'status.json')
export const analyticsFile = () => path.join(DATA_DIR, 'analytics.json')
export const picksFile = () => path.join(process.cwd(), 'src', 'generated', 'picks.json')

export async function loadAllGames(labels) {
  const out = []
  for (const label of labels) out.push(...(await readJsonl(gamesFile(label))))
  return out
}

export async function saveAllGames(games, labels) {
  for (const label of labels) {
    await writeJsonl(gamesFile(label), games.filter((g) => g.sport === label), 'id')
  }
}
