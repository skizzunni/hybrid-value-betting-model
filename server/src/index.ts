import express from 'express'
import cors from 'cors'
import { getTickets, getMetrics, updateTicketResult } from './store.js'
import { runSimulation } from './simulate.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

app.get('/api/tickets', async (_req, res) => {
  const tickets = await getTickets()
  res.json(tickets)
})

app.get('/api/metrics', async (_req, res) => {
  const metrics = await getMetrics()
  res.json(metrics)
})

app.post('/api/simulate', (req, res) => {
  const fair = Number(req.body?.fair ?? 0.55)
  const trials = Number(req.body?.trials ?? 10000)
  res.json(runSimulation(fair, trials))
})

app.post('/api/tickets/:name/resolve', async (req, res) => {
  const { name } = req.params
  const { outcome } = req.body
  const resolved = await updateTicketResult(name, Boolean(outcome))
  res.json({ resolved })
})

const port = Number(process.env.PORT || 4000)
app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`)
})
