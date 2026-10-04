import express from 'express'
import cors from 'cors'
import { initDb, getTickets, updateTicketResult, getMetrics } from './store.js'
import { runSimulation } from './simulate.js'

const app = express()
app.use(cors())
app.use(express.json())

const db = initDb()

app.get('/api/health', (req,res)=> res.json({ok:true, time: new Date().toISOString()}))

app.get('/api/tickets', (req,res)=>{
  const tickets = getTickets(db)
  res.json(tickets)
})

app.get('/api/metrics', (req,res)=>{
  res.json(getMetrics(db))
})

app.post('/api/simulate', (req,res)=>{
  const { fair, trials } = req.body
  const t = Number(trials) || 10000
  const f = Number(fair) || 0.55
  const result = runSimulation(f, t)
  res.json(result)
})

app.post('/api/tickets/:name/resolve', (req,res)=>{
  const { name } = req.params
  const outcome = req.body.outcome // true/false
  const ticket = updateTicketResult(db, name, !!outcome)
  res.json(ticket)
})

const port = process.env.PORT || 4000
app.listen(port, ()=> console.log('Server listening on', port))
