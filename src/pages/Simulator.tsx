import React, { useEffect, useState } from 'react'

export default function Simulator(){
  const [fair, setFair] = useState(0.55)
  const [trials, setTrials] = useState(10000)
  const [result, setResult] = useState<any>(null)
  const [running, setRunning] = useState(false)

  async function runSim(){
    setRunning(true)
    const resp = await fetch('/api/simulate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({fair, trials})
    })
    const j = await resp.json()
    setResult(j)
    setRunning(false)
  }

  return (
    <div className="container" style={{padding:40}}>
      <h1>Simulation engine</h1>
      <p style={{color:'#94a3b8'}}>Run a Monte Carlo simulation of a single bet given a fair probability.</p>

      <div style={{display:'grid',gridTemplateColumns:'160px 1fr',gap:12,alignItems:'center',maxWidth:640}}>
        <label>Fair probability</label>
        <input type="number" value={fair} step="0.01" min="0.01" max="0.99" onChange={e=>setFair(parseFloat(e.target.value))} />

        <label>Trials</label>
        <input type="number" value={trials} onChange={e=>setTrials(parseInt(e.target.value))} />

        <div />
        <div style={{display:'flex',gap:8}}>
          <button className="primary-btn" onClick={runSim} disabled={running}>{running? 'Running...' : 'Run'}</button>
          <button className="secondary-btn" onClick={()=>{setResult(null)}}>Clear</button>
        </div>
      </div>

      {result && (
        <div style={{marginTop:20}}>
          <h3>Result</h3>
          <pre style={{background:'#061021',padding:12,borderRadius:8,overflow:'auto'}}>{JSON.stringify(result,null,2)}</pre>
        </div>
      )}
    </div>
  )
}
