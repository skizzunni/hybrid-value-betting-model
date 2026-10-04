import React from 'react'
import { Link } from 'react-router-dom'

export default function Home(){
  return (
    <div className="container" style={{padding: 60}}>
      <h1 style={{fontSize:36}}>Hybrid Value — Multi-page demo</h1>
      <p style={{color:'#94a3b8'}}>Welcome. Use the links above to open the Dashboard, run simulations, or view analytics.</p>

      <div style={{marginTop:24, display:'flex', gap:12}}>
        <Link to="/dashboard" className="primary-btn">Open Dashboard</Link>
        <Link to="/simulator" className="secondary-btn">Open Simulator</Link>
      </div>

      <section style={{marginTop:40}}>
        <h2>About</h2>
        <p style={{color:'#94a3b8'}}>This multi-page app pairs a React frontend with a minimal Node/Express simulation backend to demonstrate a hybrid value betting system: probability-first modeling, live refresh, correlation-aware parlay adjustments, and loss feedback.</p>
      </section>
    </div>
  )
}
