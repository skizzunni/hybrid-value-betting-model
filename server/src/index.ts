import express from 'express'
import cors from 'cors'
import { initDb, getTickets, updateTicketResult, getMetrics } from './store'
import { runSimulation } from './simulate'
import { generateHighProbParlays } from './parlay'

const app = express()
app.use(cors())
app.use(express.json())

const db = initDb()

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }))
app.get('/api/tickets', (req, res) => res.json(getTickets(db)))
app.get('/api/metrics', (req, res) => res.json(getMetrics(db)))

app.post('/api/simulate', (req, res) => {
  const { fair, trials } = req.body
  const t = Number(trials) || 10000
  const f = Number(fair) || 0.55
  res.json(runSimulation(f, t))
})

app.post('/api/tickets/:name/resolve', (req, res) => {
  const { name } = req.params
  const outcome = !!req.body.outcome
  res.json(updateTicketResult(db, name, outcome))
})

app.post('/api/parlays', (req, res) => {
  try {
    const body = req.body || {}
    let legs = Number.isFinite(Number(body.legs)) ? Number(body.legs) : 4
    legs = Math.max(3, Math.min(6, legs))
    const count = Math.max(1, Number(body.count) || 20)
    const minFair = body.minFair === undefined ? 0.6 : Number(body.minFair)
    const minEV = body.minEV === undefined ? -0.01 : Number(body.minEV)

    const tickets = getTickets(db)
    const parlays = generateHighProbParlays(tickets, legs, count, minFair, minEV)
    res.json({ parlays, meta: { legs, count, minFair, minEV } })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) })
  }
})

const port = process.env.PORT || 4000
app.listen(port, () => console.log('API server listening on http://localhost:' + port))
