import { defaultDb } from './data.js'

type Db = {
  tickets: any[]
  metrics: Record<string, any>
  signals?: string[]
}

export function initDb(): Db {
  return {
    tickets: JSON.parse(JSON.stringify(defaultDb.tickets)),
    metrics: { ...defaultDb.metrics },
    signals: [...(defaultDb.signals ?? [])],
  }
}

export function getTickets(db: Db) {
  return db.tickets || []
}

export function getMetrics(db: Db) {
  return db.metrics || {}
}

export function updateTicketResult(db: Db, name: string, outcome: boolean) {
  const ticket = db.tickets.find((item: any) => item.name === name)
  if (!ticket) return null

  ticket.outcome = outcome
  ticket.resolved = true
  return ticket
}
