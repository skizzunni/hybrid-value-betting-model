import React, { useEffect, useState } from 'react'

export default function Analytics(){
  const [metrics, setMetrics] = useState<any>(null)

  useEffect(()=>{
    fetch('/api/metrics').then(r=>r.json()).then(setMetrics).catch(()=>{})
  },[])

  return (
    <div className="container" style={{padding:40}}>
      <h1>Analytics</h1>
      <p style={{color:'#94a3b8'}}>Backend-powered metrics and simple analytics.</p>

      <div style={{marginTop:20}}>
        <h3>Metrics</h3>
        {metrics ? <pre style={{background:'#061021',padding:12,borderRadius:8}}>{JSON.stringify(metrics,null,2)}</pre> : <div style={{color:'#94a3b8'}}>Loading...</div>}
      </div>
    </div>
  )
}
