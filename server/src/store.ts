import { Low, JSONFile } from 'lowdb'
import { join } from 'path'

const defaultData = {
  tickets: [
    { type: 'Player prop', name: 'Jalen Brunson O 27.5 points', market: 'NBA', edge: '+8.6%', confidence: 'High', size: '0.6u', status: 'Live +EV', fair: '58.4%', book: '51.2%' },
    { type: 'Side', name: 'Lakers +3.5', market: 'NBA', edge: '+4.2%', confidence: 'Medium', size: '0.4u', status: 'Monitor', fair: '54.0%', book: '48.7%' },
    { type: 'Parlay', name: '10-leg SGP build', market: 'Multi-sport', edge: '+11.1%', confidence: 'Low', size: '0.2u', status: 'Correlation check', fair: '14.8%', book: '9.7%' }
  ],
  metrics: {
    bankroll: 18240,
    clv: 4.8,
    passRate: 0.86
  }
}

export function initDb(){
  const file = join(process.cwd(), 'server', 'db.json')
  const adapter = new JSONFile(file)
  const db = new Low(adapter)
  ;(async ()=>{
    await db.read()
    db.data ||= defaultData
    await db.write()
  })()
  return db
}

export function getTickets(db:any){
  return db.data?.tickets || []
}

export function updateTicketResult(db:any, name:string, outcome:boolean){
  const t = db.data.tickets.find((x:any)=>x.name === name)
  if(!t) return null
  t.resolved = true
  t.outcome = outcome
  db.write()
  return t
}

export function getMetrics(db:any){
  return db.data.metrics || {}
}
