import fs from 'node:fs/promises'
import path from 'node:path'
import { defaultDb } from './data.js'

const dbFilePath = path.join(process.cwd(), 'server', 'db.json')

export async function readDb() {
  try {
    const raw = await fs.readFile(dbFilePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    await fs.writeFile(dbFilePath, JSON.stringify(defaultDb, null, 2), 'utf8')
    return defaultDb
  }
}

export async function writeDb(data: any) {
  await fs.writeFile(dbFilePath, JSON.stringify(data, null, 2), 'utf8')
}

export async function getTickets() {
  const db = await readDb()
  return db.tickets || []
}

export async function getMetrics() {
  const db = await readDb()
  return db.metrics || {}
}

export async function updateTicketResult(name: string, outcome: boolean) {
  const db = await readDb()
  const ticket = db.tickets.find((item: any) => item.name === name)
  if (!ticket) return null
  ticket.outcome = outcome
  ticket.resolved = true
  await writeDb(db)
  return ticket
}
